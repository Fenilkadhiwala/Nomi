import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PoolClient } from "pg";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";

import { sendGroupAddedEmail } from "@/src/lib/email/mailer";
import { pusherServer } from "@/src/lib/pusher/server";

import {
  saveGroupSystemMessage,
  publishGroupSystemMessages,
  notifyGroupMembershipChanges,
  type SavedGroupSystemMessage,
} from "@/src/lib/groups/group-system-messages";

export const runtime = "nodejs";

const createGroupSchema = z
  .object({
    household_id: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .default(null),

    name: z
      .string()
      .trim()
      .min(2, "Group name must contain at least 2 characters.")
      .max(100, "Group name cannot exceed 100 characters."),

    member_ids: z.array(z.number().int().positive()).max(100).default([]),

    include_main_household: z.boolean().optional().default(false),
  })
  .strict();

type GroupRole = "owner" | "admin" | "member";

interface GroupRow {
  id: number;
  household_id: number | null;
  name: string;
  is_default: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
  role: GroupRole;
  member_count: number;
}

type CreatedGroupRow = Pick<
  GroupRow,
  | "id"
  | "household_id"
  | "name"
  | "is_default"
  | "created_by"
  | "created_at"
  | "updated_at"
>;

interface SelectedMemberRow {
  id: number;
  name: string;
  email: string;
}

function getApplicationUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!configuredUrl) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not configured. Set it to your application's public URL.",
    );
  }

  const url = new URL(configuredUrl);

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid HTTP(S) base URL.");
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
  }

  return url.origin;
}

// =====================================================
// EMAIL NOTIFICATIONS
// =====================================================

async function notifyAddedMembers(params: {
  members: SelectedMemberRow[];
  groupId: number;
  groupName: string;
  addedByName: string;
}): Promise<void> {
  const { members, groupId, groupName, addedByName } = params;

  if (members.length === 0) return;

  let groupUrl: string;

  try {
    const appUrl = getApplicationUrl();

    groupUrl = `${appUrl}/dashboard?groupId=${encodeURIComponent(
      String(groupId),
    )}`;
  } catch (error) {
    console.error("Group notification URL configuration error:", error);
    return;
  }

  const results = await Promise.allSettled(
    members.map((member) =>
      sendGroupAddedEmail({
        to: member.email,
        memberName: member.name,
        groupName,
        addedByName,
        groupUrl,
      }),
    ),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Failed to send group-added email to user ${members[index].id}:`,
        result.reason,
      );
    }
  });
}

// =====================================================
// USER PUSHER NOTIFICATIONS
// =====================================================

async function publishGroupAddedEvents(params: {
  members: SelectedMemberRow[];
  groupId: number;
  groupName: string;
  addedByName: string;
}): Promise<void> {
  const { members, groupId, groupName, addedByName } = params;

  if (members.length === 0) return;

  const results = await Promise.allSettled(
    members.map((member) =>
      pusherServer.trigger(`private-user-${member.id}`, "group.added", {
        groupId,
        groupName,
        addedByName,
      }),
    ),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Failed to publish group.added for user ${members[index].id}:`,
        result.reason,
      );
    }
  });
}

// =====================================================
// GET /api/groups
// =====================================================

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    const result = await pool.query<GroupRow>(
      `
        SELECT
          g.id,
          g.household_id,
          g.name,
          g.is_default,
          g.created_by,
          g.created_at,
          g.updated_at,
          gm.role,
          (
            SELECT COUNT(*)::int
            FROM public.household_group_members members
            WHERE members.group_id = g.id
          ) AS member_count
        FROM public.household_groups g
        INNER JOIN public.household_group_members gm
          ON gm.group_id = g.id
        WHERE gm.user_id = $1
        ORDER BY
          g.is_default DESC,
          g.created_at ASC,
          g.id ASC
      `,
      [user.id],
    );

    return NextResponse.json(
      {
        groups: result.rows,
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
// POST /api/groups
// =====================================================

export async function POST(request: NextRequest) {
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;

  const systemMessages: SavedGroupSystemMessage[] = [];
  const changedGroupIds = new Set<number>();

  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid request body.");
    }

    const parsed = createGroupSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid group details.",
      );
    }

    const { household_id, name, member_ids, include_main_household } =
      parsed.data;

    const uniqueMemberIds = [...new Set(member_ids)];

    if (uniqueMemberIds.includes(Number(user.id))) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "You cannot add yourself as a selected member.",
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // =================================================
    // 1. Verify linked household access.
    // =================================================

    if (household_id !== null) {
      const householdResult = await client.query(
        `
            SELECT id
            FROM public.households
            WHERE id = $1
            FOR KEY SHARE
          `,
        [household_id],
      );

      if (householdResult.rowCount === 0) {
        throw new ApiError(404, "HOUSEHOLD_NOT_FOUND", "Household not found.");
      }

      const accessResult = await client.query(
        `
            SELECT 1
            FROM public.household_members hm
            WHERE hm.household_id = $1
              AND hm.user_id = $2

            UNION ALL

            SELECT 1
            FROM public.household_group_members gm
            INNER JOIN public.household_groups g
              ON g.id = gm.group_id
            WHERE g.household_id = $1
              AND gm.user_id = $2

            LIMIT 1
          `,
        [household_id, user.id],
      );

      if (accessResult.rowCount === 0) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "You must belong to this household or one of its groups to create a linked group.",
        );
      }
    }

    // =================================================
    // 2. Validate selected existing users.
    // =================================================

    let selectedMembers: SelectedMemberRow[] = [];

    if (uniqueMemberIds.length > 0) {
      // Lock users to serialize concurrent
      // membership changes.
      const lockedUsers = await client.query<{ id: number }>(
        `
            SELECT id
            FROM public.users
            WHERE id = ANY($1::int[])
            ORDER BY id
            FOR UPDATE
          `,
        [uniqueMemberIds],
      );

      if (lockedUsers.rows.length !== uniqueMemberIds.length) {
        throw new ApiError(
          404,
          "USER_NOT_FOUND",
          "One or more selected users no longer exist.",
        );
      }

      const selectedResult = await client.query<SelectedMemberRow>(
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
                INNER JOIN public.household_group_members creator_gm
                  ON creator_gm.group_id =
                     target_gm.group_id
                WHERE target_gm.user_id = u.id
                  AND creator_gm.user_id = $2
              )
            ORDER BY
              u.name ASC,
              u.id ASC
          `,
        [uniqueMemberIds, user.id],
      );

      selectedMembers = selectedResult.rows;

      if (selectedMembers.length !== uniqueMemberIds.length) {
        throw new ApiError(
          403,
          "INVALID_GROUP_MEMBERS",
          "One or more selected users are not available to add. Please refresh the member list.",
        );
      }
    }

    const selectedMemberById = new Map(
      selectedMembers.map((member) => [Number(member.id), member]),
    );

    // =================================================
    // 3. Find managed Main Household if requested.
    // =================================================

    let mainHousehold: {
      id: number;
      household_id: number;
    } | null = null;

    if (include_main_household && uniqueMemberIds.length > 0) {
      const mainResult = await client.query<{
        id: number;
        household_id: number;
      }>(
        `
          SELECT
            g.id,
            g.household_id
          FROM public.household_groups g
          INNER JOIN public.household_group_members gm
            ON gm.group_id = g.id
          WHERE g.is_default = TRUE
            AND gm.user_id = $1
            AND gm.role IN ('owner', 'admin')
          ORDER BY g.id ASC
          LIMIT 1
          FOR UPDATE OF g
        `,
        [user.id],
      );

      mainHousehold = mainResult.rows[0] ?? null;

      if (!mainHousehold) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "You must manage a Main Household to add selected users to it.",
        );
      }

      // One Main Household per user.
      const conflicts = await client.query(
        `
          SELECT 1
          FROM public.household_members
          WHERE user_id = ANY($1::int[])
            AND household_id <> $2
          LIMIT 1
        `,
        [uniqueMemberIds, mainHousehold.household_id],
      );

      if (conflicts.rowCount) {
        throw new ApiError(
          409,
          "HOUSEHOLD_ALREADY_EXISTS",
          "One or more selected users already belong to another Main Household.",
        );
      }
    }

    // =================================================
    // 4. Create the private group.
    // =================================================

    const groupResult = await client.query<CreatedGroupRow>(
      `
          INSERT INTO public.household_groups (
            household_id,
            name,
            is_default,
            created_by
          )
          VALUES ($1, $2, FALSE, $3)
          RETURNING
            id,
            household_id,
            name,
            is_default,
            created_by,
            created_at,
            updated_at
        `,
      [household_id, name, user.id],
    );

    const group = groupResult.rows[0];

    if (!group) {
      throw new Error("Failed to create group.");
    }

    // =================================================
    // 5. Creator becomes owner.
    // =================================================

    await client.query(
      `
        INSERT INTO public.household_group_members (
          group_id,
          user_id,
          role
        )
        VALUES ($1, $2, 'owner')
      `,
      [group.id, user.id],
    );

    // =================================================
    // 6. Add selected users to new private group.
    // =================================================

    let addedPrivateMemberIds: number[] = [];

    if (uniqueMemberIds.length > 0) {
      const inserted = await client.query<{ user_id: number }>(
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
        [group.id, uniqueMemberIds],
      );

      addedPrivateMemberIds = inserted.rows.map((row) => Number(row.user_id));

      if (addedPrivateMemberIds.length !== uniqueMemberIds.length) {
        throw new Error(
          "Unable to add every selected member to the new group.",
        );
      }

      for (const memberId of addedPrivateMemberIds) {
        const member = selectedMemberById.get(memberId);

        if (!member) {
          throw new Error("Unable to resolve selected member.");
        }

        const saved = await saveGroupSystemMessage(client, {
          groupId: Number(group.id),
          actorId: Number(user.id),
          actorName: user.name,
          memberId: member.id,
          memberName: member.name,
          memberEmail: member.email,
          eventType: "member_added",
        });

        systemMessages.push(saved);
      }

      changedGroupIds.add(Number(group.id));
    }

    // =================================================
    // 7. Optional Main Household membership.
    // =================================================

    let newlyAddedMainMemberIds: number[] = [];

    if (mainHousehold && uniqueMemberIds.length > 0) {
      // Both household membership and default-group
      // membership are maintained together.
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
        [mainHousehold.household_id, uniqueMemberIds],
      );

      const insertedMain = await client.query<{ user_id: number }>(
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
        [mainHousehold.id, uniqueMemberIds],
      );

      newlyAddedMainMemberIds = insertedMain.rows.map((row) =>
        Number(row.user_id),
      );

      for (const memberId of newlyAddedMainMemberIds) {
        const member = selectedMemberById.get(memberId);

        if (!member) {
          throw new Error("Unable to resolve Main Household member.");
        }

        const saved = await saveGroupSystemMessage(client, {
          groupId: Number(mainHousehold.id),
          actorId: Number(user.id),
          actorName: user.name,
          memberId: member.id,
          memberName: member.name,
          memberEmail: member.email,
          eventType: "member_added",
        });

        systemMessages.push(saved);
      }

      if (newlyAddedMainMemberIds.length > 0) {
        changedGroupIds.add(Number(mainHousehold.id));
      }
    }

    // =================================================
    // 8. Commit all changes.
    // =================================================

    await client.query("COMMIT");
    transactionStarted = false;

    client.release();
    client = undefined;

    // =================================================
    // 9. Send emails and Pusher notifications.
    // =================================================

    // Best effort. A notification failure must
    // not undo a successfully created group.
    await Promise.allSettled([
      notifyAddedMembers({
        members: selectedMembers,
        groupId: Number(group.id),
        groupName: group.name,
        addedByName: user.name,
      }),

      publishGroupAddedEvents({
        members: selectedMembers,
        groupId: Number(group.id),
        groupName: group.name,
        addedByName: user.name,
      }),

      publishGroupSystemMessages(systemMessages),

      notifyGroupMembershipChanges([...changedGroupIds]),
    ]);

    return NextResponse.json(
      {
        group: {
          ...group,
          role: "owner",
          member_count: 1 + addedPrivateMemberIds.length,
        },
        added_members: selectedMembers,
        message: "Group created successfully.",
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
        console.error("Group transaction rollback failed:", rollbackError);
      }
    }

    return handleApiError(error);
  } finally {
    client?.release();
  }
}
