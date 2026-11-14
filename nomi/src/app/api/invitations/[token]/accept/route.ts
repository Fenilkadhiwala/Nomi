import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";

import {
  saveGroupSystemMessage,
  publishGroupSystemMessages,
  notifyGroupMembershipChanges,
  type SavedGroupSystemMessage,
} from "@/src/lib/groups/group-system-messages";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

type InvitationRow = {
  id: string;
  group_id: number;
  invited_email: string;
  invited_by: number;
  status: string;
  expires_at: Date | string;
};

type TargetGroupRow = {
  id: number;
  name: string;
  household_id: number | null;
  is_default: boolean;
};

async function insertGroupMembership(
  client: PoolClient,
  groupId: number,
  userId: number,
): Promise<boolean> {
  const result = await client.query<{ user_id: number }>(
    `
      INSERT INTO public.household_group_members (
        group_id,
        user_id,
        role
      )
      VALUES ($1, $2, 'member')
      ON CONFLICT (group_id, user_id)
      DO NOTHING
      RETURNING user_id
    `,
    [groupId, userId],
  );

  return result.rows.length > 0;
}

async function insertHouseholdMembership(
  client: PoolClient,
  householdId: number,
  userId: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO public.household_members (
        household_id,
        user_id,
        role
      )
      VALUES ($1, $2, 'member')
      ON CONFLICT (household_id, user_id)
      DO NOTHING
    `,
    [householdId, userId],
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;

  const systemMessages: SavedGroupSystemMessage[] = [];
  const newlyJoinedGroupIds: number[] = [];

  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Please sign in to accept this invitation.",
      );
    }

    // Authentication must enforce verified email
    // ownership before invitation acceptance.
    const { token } = await context.params;

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      throw new ApiError(400, "INVALID_INVITATION", "Invalid invitation link.");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    const invitationResult = await client.query<InvitationRow>(
      `
          SELECT
            i.id,
            i.group_id,
            i.invited_email,
            i.invited_by,
            i.status,
            i.expires_at
          FROM public.household_group_invitations i
          JOIN public.household_groups g
            ON g.id = i.group_id
          WHERE i.token_hash = $1
          FOR UPDATE OF i
        `,
      [tokenHash],
    );

    const invitation = invitationResult.rows[0];

    if (!invitation) {
      throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
    }

    if (invitation.status !== "pending") {
      throw new ApiError(
        410,
        "INVITATION_UNAVAILABLE",
        "This invitation has already been used or is no longer valid.",
      );
    }

    const expiresAt = new Date(invitation.expires_at).getTime();

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new ApiError(
        410,
        "INVITATION_EXPIRED",
        "This invitation has expired.",
      );
    }

    if (
      invitation.invited_email.trim().toLowerCase() !==
      user.email.trim().toLowerCase()
    ) {
      throw new ApiError(
        403,
        "EMAIL_MISMATCH",
        "Please sign in with the email address that received this invitation.",
      );
    }

    // Serialize membership changes for this user.
    const lockedUser = await client.query(
      `
        SELECT id
        FROM public.users
        WHERE id = $1
        FOR UPDATE
      `,
      [user.id],
    );

    if (!lockedUser.rowCount) {
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Your account could not be found.",
      );
    }

    const targetsResult = await client.query<TargetGroupRow>(
      `
          SELECT
            g.id,
            g.name,
            g.household_id,
            g.is_default
          FROM public.household_group_invitation_targets t
          JOIN public.household_groups g
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

    if (
      !targetGroups.some(
        (group) => Number(group.id) === Number(invitation.group_id),
      )
    ) {
      throw new ApiError(
        409,
        "INVALID_INVITATION_TARGET",
        "The original invitation group is missing.",
      );
    }

    // Private groups can be independent.
    // At most one Main Household is allowed.
    const mainGroups = targetGroups.filter((group) => group.is_default);

    if (mainGroups.length > 1) {
      throw new ApiError(
        409,
        "INVALID_MAIN_GROUP",
        "An invitation cannot include multiple Main Households.",
      );
    }

    const mainGroup = mainGroups[0] ?? null;

    const includesHousehold = mainGroup !== null;

    if (mainGroup && mainGroup.household_id === null) {
      throw new ApiError(
        409,
        "INVALID_MAIN_GROUP",
        "Main Household is not configured correctly.",
      );
    }

    // The inviter must still manage every target.
    const targetIds = targetGroups.map((group) => Number(group.id));

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
      [invitation.invited_by, targetIds],
    );

    if (permitted.rows.length !== new Set(targetIds).size) {
      throw new ApiError(
        409,
        "INVITATION_PERMISSIONS_CHANGED",
        "The inviter no longer manages every selected group. Please request a new invitation.",
      );
    }

    let householdName: string | null = null;

    if (mainGroup?.household_id != null) {
      const existingHousehold = await client.query<{
        household_id: number;
      }>(
        `
            SELECT household_id
            FROM public.household_members
            WHERE user_id = $1
            LIMIT 1
          `,
        [user.id],
      );

      if (
        existingHousehold.rows[0] &&
        Number(existingHousehold.rows[0].household_id) !==
          Number(mainGroup.household_id)
      ) {
        throw new ApiError(
          409,
          "HOUSEHOLD_ALREADY_EXISTS",
          "You already belong to another household. Ask for a private-group-only invitation.",
        );
      }

      const householdResult = await client.query<{ name: string }>(
        `
            SELECT name
            FROM public.households
            WHERE id = $1
          `,
        [mainGroup.household_id],
      );

      if (!householdResult.rows[0]) {
        throw new ApiError(
          409,
          "INVALID_MAIN_GROUP",
          "The Main Household no longer exists.",
        );
      }

      householdName = householdResult.rows[0].name;

      await insertHouseholdMembership(client, mainGroup.household_id, user.id);
    }

    // Add each membership and record a system
    // message only when a new row was inserted.
    for (const group of targetGroups) {
      const inserted = await insertGroupMembership(
        client,
        Number(group.id),
        Number(user.id),
      );

      if (!inserted) {
        continue;
      }

      newlyJoinedGroupIds.push(Number(group.id));

      const systemMessage = await saveGroupSystemMessage(client, {
        groupId: Number(group.id),
        actorId: Number(user.id),
        actorName: user.name,
        memberId: Number(user.id),
        memberName: user.name,
        memberEmail: user.email,
        invitationId: invitation.id,
        eventType: "invitation_accepted",
      });

      systemMessages.push(systemMessage);
    }

    const accepted = await client.query(
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

    if (accepted.rowCount !== 1) {
      throw new ApiError(
        409,
        "INVITATION_UNAVAILABLE",
        "This invitation could not be accepted.",
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    // Release the transaction connection before
    // publishing any real-time events.
    client.release();
    client = undefined;

    await Promise.all([
      publishGroupSystemMessages(systemMessages),
      notifyGroupMembershipChanges(newlyJoinedGroupIds),
    ]);

    return NextResponse.json(
      {
        message: "Invitation accepted successfully.",
        householdId: mainGroup?.household_id ?? null,
        householdName,
        groupId: Number(invitation.group_id),
        includesHousehold,
        includesHomeCircle: includesHousehold,
        joinedGroups: targetGroups.map((group) => ({
          groupId: Number(group.id),
          groupName: group.name,
          isDefault: group.is_default,
        })),
        newlyJoinedGroupIds,
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
