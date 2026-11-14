import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

import {
  verifyRequestOrigin,
  forbiddenOriginResponse,
} from "@/src/lib/auth/auth-request";

import {
  saveGroupSystemMessage,
  publishGroupSystemMessages,
  notifyGroupMembershipChanges,
  type SavedGroupSystemMessage,
} from "@/src/lib/groups/group-system-messages";

export const runtime = "nodejs";

interface GroupMember {
  user_id: number;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  joined_at: Date;
}

interface GroupRecord {
  id: number;
  household_id: number | null;
  is_default: boolean;
}

interface MemberRecord {
  id: number;
  name: string;
  email: string;
}

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

type AddMembersBody = {
  member_ids?: unknown;
  include_main_household?: unknown;
  additional_group_ids?: unknown;
};

function validId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 2147483647
  );
}

async function requireUserAndGroup(context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
  }

  const { groupId } = await context.params;

  if (!/^[1-9]\d*$/.test(groupId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
  }

  const parsedId = Number(groupId);

  if (!validId(parsedId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
  }

  return { user, parsedId };
}

// =====================================================
// GET /api/groups/[groupId]/members
// =====================================================

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { user, parsedId } = await requireUserAndGroup(context);

    const access = await pool.query(
      `
        SELECT 1
        FROM public.household_group_members
        WHERE group_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [parsedId, user.id],
    );

    if (!access.rowCount) {
      throw new ApiError(404, "NOT_FOUND", "Group not found.");
    }

    const result = await pool.query<GroupMember>(
      `
        SELECT
          gm.user_id,
          u.name,
          u.email,
          gm.role,
          gm.joined_at
        FROM public.household_group_members gm
        JOIN public.users u
          ON u.id = gm.user_id
        WHERE gm.group_id = $1
        ORDER BY
          CASE gm.role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            ELSE 2
          END,
          gm.joined_at,
          gm.user_id
      `,
      [parsedId],
    );

    return NextResponse.json(
      {
        group_id: parsedId,
        members: result.rows,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// =====================================================
// POST /api/groups/[groupId]/members
// =====================================================

export async function POST(request: NextRequest, context: RouteContext) {
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  let client: PoolClient | null = null;
  let inTransaction = false;

  const systemMessages: SavedGroupSystemMessage[] = [];
  const changedGroupIds = new Set<number>();

  try {
    const { user, parsedId } = await requireUserAndGroup(context);

    const body: AddMembersBody | null = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid request body.");
    }

    if (
      !Array.isArray(body.member_ids) ||
      body.member_ids.length < 1 ||
      body.member_ids.length > 50 ||
      !body.member_ids.every(validId)
    ) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Select between 1 and 50 valid users.",
      );
    }

    if (
      body.include_main_household !== undefined &&
      typeof body.include_main_household !== "boolean"
    ) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "include_main_household must be a boolean.",
      );
    }

    if (
      body.additional_group_ids !== undefined &&
      (!Array.isArray(body.additional_group_ids) ||
        body.additional_group_ids.length > 50 ||
        !body.additional_group_ids.every(validId))
    ) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Invalid additional group IDs.",
      );
    }

    const memberIds: number[] = [...new Set(body.member_ids as number[])];

    const includeMain = body.include_main_household === true;

    const additionalIds: number[] = [
      ...new Set((body.additional_group_ids as number[] | undefined) ?? []),
    ];

    if (memberIds.includes(Number(user.id))) {
      throw new ApiError(400, "VALIDATION_ERROR", "You cannot add yourself.");
    }

    if (additionalIds.includes(parsedId)) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "The destination group cannot be an additional group.",
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");
    inTransaction = true;

    // Lock selected users in a stable order.
    const lockedUsers = await client.query<{
      id: number;
    }>(
      `
        SELECT id
        FROM public.users
        WHERE id = ANY($1::int[])
        ORDER BY id
        FOR UPDATE
      `,
      [memberIds],
    );

    if (lockedUsers.rows.length !== memberIds.length) {
      throw new ApiError(
        404,
        "USER_NOT_FOUND",
        "One or more selected users no longer exist.",
      );
    }

    // Lock destination group.
    const groupResult = await client.query<GroupRecord>(
      `
          SELECT
            id,
            household_id,
            is_default
          FROM public.household_groups
          WHERE id = $1
          FOR UPDATE
        `,
      [parsedId],
    );

    const group = groupResult.rows[0];

    if (!group) {
      throw new ApiError(404, "NOT_FOUND", "Group not found.");
    }

    // Only owner/admin may add members.
    const manager = await client.query<{
      role: string;
    }>(
      `
        SELECT role
        FROM public.household_group_members
        WHERE group_id = $1
          AND user_id = $2
      `,
      [parsedId, user.id],
    );

    if (
      manager.rows[0]?.role !== "owner" &&
      manager.rows[0]?.role !== "admin"
    ) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only owners and admins can add members.",
      );
    }

    if (group.is_default && group.household_id === null) {
      throw new ApiError(
        409,
        "INVALID_HOUSEHOLD",
        "Main Household is not configured correctly.",
      );
    }

    if (group.is_default && includeMain) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Main Household is already the destination.",
      );
    }

    if (!group.is_default && additionalIds.length > 0) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Additional groups can only be selected from Main Household.",
      );
    }

    // Selected users must already share
    // at least one group with the requester.
    const eligible = await client.query<MemberRecord>(
      `
          SELECT
            u.id,
            u.name,
            u.email
          FROM public.users u
          WHERE u.id = ANY($1::int[])
            AND EXISTS (
              SELECT 1
              FROM public.household_group_members target_gm
              JOIN public.household_group_members requester_gm
                ON requester_gm.group_id =
                   target_gm.group_id
              WHERE target_gm.user_id = u.id
                AND requester_gm.user_id = $2
            )
          ORDER BY u.name, u.id
        `,
      [memberIds, user.id],
    );

    if (eligible.rows.length !== memberIds.length) {
      throw new ApiError(
        403,
        "INVALID_GROUP_MEMBERS",
        "One or more selected users are not available to add.",
      );
    }

    const memberById = new Map(
      eligible.rows.map((member) => [Number(member.id), member]),
    );

    // Find the requester's managed Main Household
    // independently of private-group household_id.
    let optionalMainId: number | null = null;

    if (includeMain) {
      const mainResult = await client.query<{
        id: number;
        household_id: number;
      }>(
        `
          SELECT
            g.id,
            g.household_id
          FROM public.household_groups g
          JOIN public.household_group_members gm
            ON gm.group_id = g.id
          WHERE g.is_default = TRUE
            AND g.household_id IS NOT NULL
            AND gm.user_id = $1
            AND gm.role IN ('owner', 'admin')
          ORDER BY g.id
          LIMIT 1
        `,
        [user.id],
      );

      const main = mainResult.rows[0];

      if (!main) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "You cannot manage a Main Household.",
        );
      }

      optionalMainId = Number(main.id);
    }

    const targetIds = [
      ...new Set([
        parsedId,
        ...additionalIds,
        ...(optionalMainId !== null ? [optionalMainId] : []),
      ]),
    ].sort((a, b) => a - b);

    // Lock all destination groups.
    const targets = await client.query<GroupRecord>(
      `
          SELECT
            g.id,
            g.household_id,
            g.is_default
          FROM public.household_groups g
          WHERE g.id = ANY($1::int[])
          ORDER BY g.id
          FOR UPDATE
        `,
      [targetIds],
    );

    if (targets.rows.length !== targetIds.length) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "One or more destination groups no longer exist.",
      );
    }

    // Verify owner/admin permission on all groups.
    const permissions = await client.query<{
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

    if (permissions.rows.length !== targetIds.length) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You cannot manage every selected group.",
      );
    }

    const targetById = new Map(
      targets.rows.map((target) => [Number(target.id), target]),
    );

    for (const id of additionalIds) {
      if (targetById.get(id)?.is_default !== false) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Additional destinations must be private groups.",
        );
      }
    }

    const mainTargets = targets.rows.filter((target) => target.is_default);

    if (mainTargets.length > 1) {
      throw new ApiError(
        409,
        "INVALID_MAIN_GROUP",
        "Cannot add users to multiple Main Households.",
      );
    }

    const mainTarget = mainTargets[0] ?? null;

    if (mainTarget && mainTarget.household_id === null) {
      throw new ApiError(409, "INVALID_HOUSEHOLD", "Invalid Main Household.");
    }

    // Enforce one Main Household per user.
    if (mainTarget?.household_id != null) {
      const conflicts = await client.query(
        `
          SELECT 1
          FROM public.household_members
          WHERE user_id = ANY($1::int[])
            AND household_id <> $2
          LIMIT 1
        `,
        [memberIds, mainTarget.household_id],
      );

      if (conflicts.rowCount) {
        throw new ApiError(
          409,
          "HOUSEHOLD_ALREADY_EXISTS",
          "One or more selected users already belong to another Main Household.",
        );
      }
    }

    // Primary group must not already contain
    // any of the selected members.
    const existing = await client.query(
      `
        SELECT 1
        FROM public.household_group_members
        WHERE group_id = $1
          AND user_id = ANY($2::int[])
        LIMIT 1
      `,
      [parsedId, memberIds],
    );

    if (existing.rowCount) {
      throw new ApiError(
        409,
        "ALREADY_MEMBER",
        "One or more selected users are already members.",
      );
    }

    // Add household membership first.
    if (mainTarget?.household_id != null) {
      await client.query(
        `
          INSERT INTO public.household_members (
            household_id,
            user_id,
            role
          )
          SELECT
            $1,
            selected_user_id,
            'member'
          FROM UNNEST($2::int[])
            AS selected_user_id
          ON CONFLICT (household_id, user_id)
          DO NOTHING
        `,
        [mainTarget.household_id, memberIds],
      );
    }

    const insertedByGroup: Record<string, number> = {};

    // Add members to each selected group.
    for (const targetId of targetIds) {
      const inserted = await client.query<{
        user_id: number;
      }>(
        `
          INSERT INTO public.household_group_members (
            group_id,
            user_id,
            role
          )
          SELECT
            $1,
            selected_user_id,
            'member'
          FROM UNNEST($2::int[])
            AS selected_user_id
          ON CONFLICT (group_id, user_id)
          DO NOTHING
          RETURNING user_id
        `,
        [targetId, memberIds],
      );

      insertedByGroup[String(targetId)] = inserted.rows.length;

      if (targetId === parsedId && inserted.rows.length !== memberIds.length) {
        throw new ApiError(
          409,
          "ALREADY_MEMBER",
          "Membership changed. Please refresh and retry.",
        );
      }

      // Create one system message for each
      // newly inserted member in this group.
      for (const row of inserted.rows) {
        const member = memberById.get(Number(row.user_id));

        if (!member) {
          throw new Error("Unable to resolve newly added member.");
        }

        const saved = await saveGroupSystemMessage(client, {
          groupId: targetId,
          actorId: Number(user.id),
          actorName: user.name,
          memberId: Number(member.id),
          memberName: member.name,
          memberEmail: member.email,
          eventType: "member_added",
        });

        systemMessages.push(saved);
        changedGroupIds.add(targetId);
      }
    }

    await client.query("COMMIT");
    inTransaction = false;

    client.release();
    client = null;

    // Broadcast only committed messages.
    await Promise.all([
      publishGroupSystemMessages(systemMessages),
      notifyGroupMembershipChanges([...changedGroupIds]),
    ]);

    return NextResponse.json(
      {
        success: true,
        group_id: parsedId,
        group_type: group.is_default ? "main_household" : "private_group",
        added_count: memberIds.length,
        added_members: eligible.rows,
        included_group_ids: targetIds,
        inserted_by_group: insertedByGroup,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (client && inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Membership transaction rollback failed:", rollbackError);
      }
    }

    return handleApiError(error);
  } finally {
    client?.release();
  }
}
