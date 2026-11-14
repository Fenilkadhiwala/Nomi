import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";

import { sendGroupInvitationEmail } from "@/src/lib/email/mailer";

import {
  saveGroupSystemMessage,
  publishGroupSystemMessages,
  type SavedGroupSystemMessage,
} from "@/src/lib/groups/group-system-messages";

export const runtime = "nodejs";

type GroupRow = {
  id: number;
  name: string;
  household_id: number | null;
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

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

async function getAuthorizedGroup(
  client: PoolClient,
  groupId: number,
  userId: number,
): Promise<GroupRow> {
  const result = await client.query<GroupRow>(
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
    [groupId, userId],
  );

  if (!result.rows[0]) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You don't have permission to invite members.",
    );
  }

  return result.rows[0];
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;

  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    const { groupId } = await context.params;

    if (!/^[1-9]\d*$/.test(groupId)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
    }

    const parsedId = Number(groupId);

    if (!Number.isSafeInteger(parsedId) || parsedId > 2147483647) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
    }

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

    const token = randomBytes(32).toString("hex");

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
    }

    const invitationUrl = new URL(`/invite/${token}`, appUrl).toString();

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Lock source group.
    const groupResult = await client.query<GroupRow>(
      `
        SELECT
          id,
          name,
          household_id,
          is_default
        FROM public.household_groups
        WHERE id = $1
        FOR UPDATE
      `,
      [parsedId],
    );

    const existingGroup = groupResult.rows[0];

    if (!existingGroup) {
      throw new ApiError(404, "NOT_FOUND", "Group not found.");
    }

    const group = await getAuthorizedGroup(client, parsedId, user.id);

    if (group.is_default && includeHomeCircle) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Main group invitations cannot use includeHomeCircle.",
      );
    }

    if (!group.is_default && includeOtherGroups) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Only Main group invitations can include all other groups.",
      );
    }

    // Prevent inviting existing source-group members.
    const existingMember = await client.query(
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

    if (existingMember.rowCount) {
      throw new ApiError(
        409,
        "ALREADY_MEMBER",
        "This person is already a member of this group.",
      );
    }

    let householdName = "";

    let targetGroups: GroupTargetRow[] = [];

    // Locate inviter's Main Household independently
    // of the source private group's household_id.
    const inviterMain = await client.query<
      GroupTargetRow & {
        household_id: number;
        household_name: string;
      }
    >(
      `
        SELECT
          g.id,
          g.name,
          g.is_default,
          g.household_id,
          h.name AS household_name
        FROM public.household_groups g
        INNER JOIN public.household_group_members gm
          ON gm.group_id = g.id
        INNER JOIN public.households h
          ON h.id = g.household_id
        WHERE g.is_default = TRUE
          AND gm.user_id = $1
        ORDER BY g.id ASC
        LIMIT 1
      `,
      [user.id],
    );

    const ownMain = inviterMain.rows[0] ?? null;

    if (group.is_default) {
      if (group.household_id === null) {
        throw new ApiError(
          409,
          "MAIN_GROUP_NOT_FOUND",
          "Invalid Main Household.",
        );
      }

      const householdResult = await client.query<{ name: string }>(
        `
            SELECT name
            FROM public.households
            WHERE id = $1
          `,
        [group.household_id],
      );

      householdName = householdResult.rows[0]?.name ?? "";

      targetGroups = [
        {
          id: group.id,
          name: group.name,
          is_default: true,
        },
      ];

      if (includeOtherGroups) {
        const managedGroups = await client.query<GroupTargetRow>(
          `
              SELECT
                g.id,
                g.name,
                g.is_default
              FROM public.household_groups g
              INNER JOIN public.household_group_members gm
                ON gm.group_id = g.id
              WHERE gm.user_id = $1
                AND gm.role IN ('owner', 'admin')
                AND g.is_default = FALSE
              ORDER BY g.id ASC
            `,
          [user.id],
        );

        targetGroups.push(...managedGroups.rows);
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
        if (!ownMain) {
          throw new ApiError(
            400,
            "MAIN_GROUP_NOT_FOUND",
            "You do not belong to a Main Household.",
          );
        }

        householdName = ownMain.household_name;

        targetGroups.push({
          id: ownMain.id,
          name: ownMain.name,
          is_default: true,
        });
      }
    }

    // Deduplicate selected groups.
    targetGroups = targetGroups.filter(
      (target, index, all) =>
        all.findIndex((other) => other.id === target.id) === index,
    );

    const targetIds = targetGroups.map((target) => target.id);

    // Check permission on every target.
    const permitted = await client.query<{
      group_id: number;
    }>(
      `
        SELECT group_id
        FROM public.household_group_members
        WHERE user_id = $1
          AND group_id = ANY($2::int[])
          AND role IN ('owner', 'admin')
      `,
      [user.id, targetIds],
    );

    const permittedIds = new Set(
      permitted.rows.map((row) => Number(row.group_id)),
    );

    if (targetGroups.some((target) => !permittedIds.has(target.id))) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You don't have permission to invite members to every selected group.",
      );
    }

    // Expire old pending invitations.
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

    if (existingInvitation.rowCount) {
      throw new ApiError(
        409,
        "INVITATION_EXISTS",
        "An invitation is already pending for this email.",
      );
    }

    // Create invitation.
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

    // Save frozen targets for acceptance.
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
    transactionStarted = false;

    client.release();
    client = undefined;

    const includesHousehold = targetGroups.some((target) => target.is_default);

    // Send email first.
    // No invitation system message is created
    // when email delivery fails.
    try {
      await sendGroupInvitationEmail({
        to: email,
        groupName: group.name,
        inviterName: user.name,
        invitationUrl,
        householdName,
        includesHousehold,
        invitedGroups: targetGroups.map((target) => ({
          name: target.name,
          isDefault: target.is_default,
        })),
      });
    } catch (error) {
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

    // Email was sent successfully.
    // Save an invitation message in EVERY target group.
    //
    // A separate transaction ensures all target
    // messages are inserted together.
    const systemMessages: SavedGroupSystemMessage[] = [];

    let messageClient: PoolClient | undefined;
    let messageTransactionStarted = false;
    let messagesCommitted = false;

    try {
      messageClient = await pool.connect();

      await messageClient.query("BEGIN");
      messageTransactionStarted = true;

      for (const target of targetGroups) {
        const saved = await saveGroupSystemMessage(messageClient, {
          groupId: Number(target.id),
          actorId: Number(user.id),
          actorName: user.name,
          memberEmail: email,
          invitationId,
          eventType: "member_invited",
        });

        systemMessages.push(saved);
      }

      await messageClient.query("COMMIT");
      messageTransactionStarted = false;
      messagesCommitted = true;
    } catch (error) {
      if (messageClient && messageTransactionStarted) {
        try {
          await messageClient.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Invitation message rollback failed:", rollbackError);
        }
      }

      // The email has already been sent and
      // invitation remains valid. Do not report
      // email failure or revoke it here.
      console.error(
        "Invitation sent, but activity messages could not be saved:",
        error,
      );
    } finally {
      messageClient?.release();
    }

    // Only broadcast messages actually committed.
    // If the transaction failed, clear the list.
    if (messagesCommitted) {
      await publishGroupSystemMessages(systemMessages);
    }
    return NextResponse.json(
      {
        message: "Invitation sent successfully.",
        groupId: parsedId,
        groupName: group.name,
        householdName,
        includesHousehold,
        includedGroups: targetGroups.map((target) => ({
          id: target.id,
          name: target.name,
          isDefault: target.is_default,
        })),
        expiresInDays: 7,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Invitation rollback failed:", rollbackError);
      }
    }

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
  } finally {
    client?.release();
  }
}
