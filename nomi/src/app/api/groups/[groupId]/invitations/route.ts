import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";
import { sendGroupInvitationEmail } from "@/src/lib/email/mailer";

export const runtime = "nodejs";

type GroupRow = {
  id: number;
  name: string;
  household_id: number;
  is_default: boolean;
};

type GroupTargetRow = {
  id: number;
  name: string;
  is_default: boolean;
};

type InvitationBody = {
  email?: unknown;
  includeOtherGroups?: unknown;
  includeHomeCircle?: unknown;
};

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ groupId: string }>;
  },
) {
  try {
    // 1. Authenticate the inviter.
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    // 2. Validate the originating group.
    const { groupId } = await context.params;
    const parsedId = Number(groupId);

    if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
    }

    // 3. Validate the request body.
    const body: InvitationBody | null = await request.json().catch(() => null);

    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Enter a valid email address.",
      );
    }

    if (
      body?.includeOtherGroups !== undefined &&
      typeof body.includeOtherGroups !== "boolean"
    ) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "includeOtherGroups must be a boolean.",
      );
    }

    if (
      body?.includeHomeCircle !== undefined &&
      typeof body.includeHomeCircle !== "boolean"
    ) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "includeHomeCircle must be a boolean.",
      );
    }

    const includeOtherGroups = body?.includeOtherGroups === true;

    const includeHomeCircle = body?.includeHomeCircle === true;

    // 4. Verify permission to invite into the source group.
    //
    // Group membership grants access to that group.
    // Home Circle membership represents household membership.
    //
    // Do not require household_members here because an
    // authorized admin of a private group may not belong
    // to Home Circle.
    const access = await pool.query<GroupRow>(
      `
        SELECT
          g.id,
          g.name,
          g.household_id,
          g.is_default
        FROM public.household_groups g
        INNER JOIN public.household_group_members gm
          ON gm.group_id = g.id
        WHERE g.id = $1
          AND gm.user_id = $2
          AND gm.role IN ('owner', 'admin')
        LIMIT 1
      `,
      [parsedId, user.id],
    );

    if (access.rowCount === 0) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You don't have permission to invite members.",
      );
    }

    const group = access.rows[0];

    // 5. Enforce the correct checkbox for the source group.
    if (group.is_default && includeHomeCircle) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Home Circle invitations cannot use includeHomeCircle.",
      );
    }

    if (!group.is_default && includeOtherGroups) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Only Home Circle invitations can include all other groups.",
      );
    }

    // 6. Check if the invited email already belongs
    // to the originating group.
    const existingMember = await pool.query(
      `
        SELECT 1
        FROM public.household_group_members gm
        INNER JOIN public.users u
          ON u.id = gm.user_id
        WHERE gm.group_id = $1
          AND LOWER(u.email) = $2
        LIMIT 1
      `,
      [parsedId, email],
    );

    if (existingMember.rowCount !== 0) {
      throw new ApiError(
        409,
        "ALREADY_MEMBER",
        "This person is already a member of this group.",
      );
    }

    // 7. Generate a secure invitation token.
    const token = randomBytes(32).toString("hex");

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
    }

    const invitationUrl = new URL(`/invite/${token}`, appUrl).toString();

    const client = await pool.connect();

    let targetGroups: GroupTargetRow[] = [];

    try {
      await client.query("BEGIN");

      // 8. Lock the household's group set while
      // determining invitation targets.
      //
      // This is a transaction-scoped coordination lock.
      // Group-creation/deletion code must follow the same
      // locking convention for a fully frozen group set.
      await client.query(
        `
          SELECT id
          FROM public.household_groups
          WHERE id = $1
          FOR UPDATE
        `,
        [parsedId],
      );

      // 9. Find the Home Circle group for this household.
      const homeCircleResult = await client.query<GroupTargetRow>(
        `
            SELECT
              id,
              name,
              is_default
            FROM public.household_groups
            WHERE household_id = $1
              AND is_default = TRUE
            LIMIT 1
          `,
        [group.household_id],
      );

      if (homeCircleResult.rowCount === 0) {
        throw new ApiError(
          409,
          "HOME_CIRCLE_NOT_FOUND",
          "This household does not have a Home Circle group.",
        );
      }

      const homeCircle = homeCircleResult.rows[0];

      // 10. Resolve the exact target groups.
      if (group.is_default) {
        if (includeOtherGroups) {
          const allGroupsResult = await client.query<GroupTargetRow>(
            `
                SELECT
                  id,
                  name,
                  is_default
                FROM public.household_groups
                WHERE household_id = $1
                ORDER BY is_default DESC, id ASC
              `,
            [group.household_id],
          );

          targetGroups = allGroupsResult.rows;
        } else {
          targetGroups = [homeCircle];
        }
      } else {
        targetGroups = [
          {
            id: group.id,
            name: group.name,
            is_default: false,
          },
        ];

        if (includeHomeCircle) {
          targetGroups.push(homeCircle);
        }
      }

      // 11. Verify inviter permissions for every
      // target group.
      //
      // An admin of Home Circle does not automatically
      // have permission to invite users to private groups.
      const targetIds = targetGroups.map((target) => target.id);

      const permittedGroups = await client.query<{
        group_id: number;
      }>(
        `
          SELECT gm.group_id
          FROM public.household_group_members gm
          WHERE gm.user_id = $1
            AND gm.group_id = ANY($2::bigint[])
            AND gm.role IN ('owner', 'admin')
        `,
        [user.id, targetIds],
      );

      const permittedIds = new Set(
        permittedGroups.rows.map((row) => Number(row.group_id)),
      );

      const unauthorizedGroup = targetGroups.find(
        (target) => !permittedIds.has(Number(target.id)),
      );

      if (unauthorizedGroup) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          `You don't have permission to invite members to ${unauthorizedGroup.name}.`,
        );
      }

      // 12. Expire any old pending invitation for
      // this source group and email.
      await client.query(
        `
          UPDATE public.household_group_invitations
          SET status = 'expired'
          WHERE group_id = $1
            AND LOWER(invited_email) = $2
            AND status = 'pending'
            AND expires_at <= NOW()
        `,
        [parsedId, email],
      );

      // 13. Reject duplicate pending invitations.
      const existingInvitation = await client.query(
        `
          SELECT id
          FROM public.household_group_invitations
          WHERE group_id = $1
            AND LOWER(invited_email) = $2
            AND status = 'pending'
          LIMIT 1
        `,
        [parsedId, email],
      );

      if (existingInvitation.rowCount !== 0) {
        throw new ApiError(
          409,
          "INVITATION_EXISTS",
          "An invitation is already pending for this email.",
        );
      }

      // 14. Insert invitation with checkbox selections.
      const invitationResult = await client.query<{
        id: number;
      }>(
        `
          INSERT INTO public.household_group_invitations (
            group_id,
            invited_email,
            invited_by,
            token_hash,
            include_other_groups,
            include_home_circle,
            expires_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            NOW() + INTERVAL '7 days'
          )
          RETURNING id
        `,
        [
          parsedId,
          email,
          user.id,
          tokenHash,
          group.is_default ? includeOtherGroups : false,
          !group.is_default ? includeHomeCircle : false,
        ],
      );

      const invitationId = invitationResult.rows[0].id;

      // 15. Save the frozen group membership targets.
      for (const target of targetGroups) {
        await client.query(
          `
            INSERT INTO
              public.household_group_invitation_targets (
                invitation_id,
                group_id
              )
            VALUES ($1, $2)
          `,
          [invitationId, target.id],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // 16. Send the invitation email.
    try {
      await sendGroupInvitationEmail({
        to: email,
        groupName: group.name,
        inviterName: user.name,
        invitationUrl,
      });
    } catch (error) {
      // Revoke the invitation if email delivery fails.
      await pool.query(
        `
          UPDATE public.household_group_invitations
          SET status = 'revoked'
          WHERE token_hash = $1
            AND status = 'pending'
        `,
        [tokenHash],
      );

      console.error("Invitation email delivery failed:", error);

      throw new ApiError(
        502,
        "EMAIL_DELIVERY_FAILED",
        "Unable to send the invitation email. Please try again.",
      );
    }

    return NextResponse.json(
      {
        message: "Invitation sent successfully.",
        groupId: parsedId,
        groupName: group.name,
        includedGroups: targetGroups.map((target) => ({
          id: target.id,
          name: target.name,
        })),
        expiresInDays: 7,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return handleApiError(
        new ApiError(
          409,
          "INVITATION_EXISTS",
          "An invitation is already pending for this email.",
        ),
      );
    }

    return handleApiError(error);
  }
}
