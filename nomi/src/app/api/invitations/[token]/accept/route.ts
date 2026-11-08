import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

type InvitationRow = {
  id: string;
  group_id: number;
  household_id: number;
  invited_email: string;
  status: string;
  expires_at: Date | string;
};

type TargetGroupRow = {
  id: number;
  name: string;
  household_id: number;
  is_default: boolean;
};

type MembershipResult = {
  groupId: number;
  groupName: string;
  isDefault: boolean;
};

async function insertGroupMembership(
  client: PoolClient,
  groupId: number,
  userId: number,
) {
  await client.query(
    `
      INSERT INTO public.household_group_members (
        group_id,
        user_id,
        role
      )
      SELECT $1, $2, 'member'
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.household_group_members
        WHERE group_id = $1
          AND user_id = $2
      )
    `,
    [groupId, userId],
  );
}

async function insertHouseholdMembership(
  client: PoolClient,
  householdId: number,
  userId: number,
) {
  await client.query(
    `
      INSERT INTO public.household_members (
        household_id,
        user_id,
        role
      )
      SELECT $1, $2, 'member'
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.household_members
        WHERE household_id = $1
          AND user_id = $2
      )
    `,
    [householdId, userId],
  );
}

export async function POST(_request: NextRequest, context: RouteContext) {
  let client: PoolClient | undefined;
  let transactionStarted = false;

  try {
    // 1. Authenticate the user.
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Please sign in to accept this invitation.",
      );
    }

    // Important:
    // getCurrentUser() must represent an authenticated
    // account whose email ownership has been verified.
    // If your auth system allows unverified emails,
    // enforce email verification before this endpoint
    // can grant group access.

    // 2. Validate the invitation token.
    const { token } = await context.params;

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      throw new ApiError(400, "INVALID_INVITATION", "Invalid invitation link.");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    // 3. Start a database transaction.
    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // 4. Find and lock the invitation.
    //
    // FOR UPDATE prevents two requests from
    // accepting the same invitation simultaneously.
    const invitationResult = await client.query<InvitationRow>(
      `
          SELECT
            i.id,
            i.group_id,
            g.household_id,
            i.invited_email,
            i.status,
            i.expires_at
          FROM public.household_group_invitations i
          INNER JOIN public.household_groups g
            ON g.id = i.group_id
          WHERE i.token_hash = $1
          FOR UPDATE OF i
        `,
      [tokenHash],
    );

    if (invitationResult.rowCount === 0) {
      throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
    }

    const invitation = invitationResult.rows[0];

    // 5. Validate invitation status.
    if (invitation.status !== "pending") {
      throw new ApiError(
        410,
        "INVITATION_UNAVAILABLE",
        "This invitation has already been used or is no longer valid.",
      );
    }

    // 6. Validate expiration.
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      throw new ApiError(
        410,
        "INVITATION_EXPIRED",
        "This invitation has expired.",
      );
    }

    // 7. Verify the invited email matches the
    // authenticated account.
    const invitedEmail = invitation.invited_email.trim().toLowerCase();

    const currentEmail = user.email.trim().toLowerCase();

    if (invitedEmail !== currentEmail) {
      throw new ApiError(
        403,
        "EMAIL_MISMATCH",
        `This invitation was sent to ${invitedEmail}. Please sign in using that email address.`,
      );
    }

    // 8. Lock the user row to serialize membership
    // changes for this user through this workflow.
    const userResult = await client.query(
      `
        SELECT id
        FROM public.users
        WHERE id = $1
        FOR UPDATE
      `,
      [user.id],
    );

    if (userResult.rowCount === 0) {
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Your account could not be found.",
      );
    }

    // 9. Retrieve the exact target groups selected
    // when the invitation was created.
    const targetsResult = await client.query<TargetGroupRow>(
      `
          SELECT
            g.id,
            g.name,
            g.household_id,
            g.is_default
          FROM public.household_group_invitation_targets t
          INNER JOIN public.household_groups g
            ON g.id = t.group_id
          WHERE t.invitation_id = $1
          ORDER BY g.is_default DESC, g.id ASC
        `,
      [invitation.id],
    );

    const targetGroups = targetsResult.rows;

    if (targetGroups.length === 0) {
      throw new ApiError(
        409,
        "INVITATION_TARGETS_MISSING",
        "This invitation needs to be reissued.",
      );
    }

    // 10. Validate all target groups belong to the
    // originating household.
    const invalidTarget = targetGroups.find(
      (group) => Number(group.household_id) !== Number(invitation.household_id),
    );

    if (invalidTarget) {
      throw new ApiError(
        409,
        "INVALID_INVITATION_TARGET",
        "This invitation contains an invalid group.",
      );
    }

    // The originating group must always be included.
    const includesOriginGroup = targetGroups.some(
      (group) => Number(group.id) === Number(invitation.group_id),
    );

    if (!includesOriginGroup) {
      throw new ApiError(
        409,
        "INVALID_INVITATION_TARGET",
        "The original invitation group is missing.",
      );
    }

    // 11. Determine whether this invitation includes
    // Home Circle.
    const homeCircleGroups = targetGroups.filter((group) => group.is_default);

    if (homeCircleGroups.length > 1) {
      throw new ApiError(
        409,
        "INVALID_HOME_CIRCLE",
        "This invitation contains multiple default groups.",
      );
    }

    const includesHomeCircle = homeCircleGroups.length === 1;

    // 12. Add the household membership ONLY when
    // Home Circle is included.
    //
    // This is the core Nomi membership rule:
    //
    // Household membership = Home Circle membership.
    if (includesHomeCircle) {
      await insertHouseholdMembership(client, invitation.household_id, user.id);
    }

    // 13. Add the user to each invited group.
    //
    // Existing memberships are preserved.
    // Existing owner/admin roles are not changed.
    for (const group of targetGroups) {
      await insertGroupMembership(client, group.id, user.id);
    }

    // 14. Mark the invitation as accepted.
    const acceptedResult = await client.query(
      `
        UPDATE public.household_group_invitations
        SET
          status = 'accepted',
          accepted_at = NOW()
        WHERE id = $1
          AND status = 'pending'
        RETURNING id
      `,
      [invitation.id],
    );

    if (acceptedResult.rowCount !== 1) {
      throw new ApiError(
        409,
        "INVITATION_UNAVAILABLE",
        "This invitation could not be accepted.",
      );
    }

    // 15. Commit all membership changes together.
    await client.query("COMMIT");
    transactionStarted = false;

    const joinedGroups: MembershipResult[] = targetGroups.map((group) => ({
      groupId: Number(group.id),
      groupName: group.name,
      isDefault: group.is_default,
    }));

    // 16. Return the originating group so the
    // frontend can open it after acceptance.
    return NextResponse.json(
      {
        message: "Invitation accepted successfully.",
        householdId: Number(invitation.household_id),
        groupId: Number(invitation.group_id),
        includesHomeCircle,
        joinedGroups,
      },
      {
        status: 200,
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
        console.error("Invitation acceptance rollback failed:", rollbackError);
      }
    }

    return handleApiError(error);
  } finally {
    client?.release();
  }
}
