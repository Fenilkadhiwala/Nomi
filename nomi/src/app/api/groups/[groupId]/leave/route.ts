import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PoolClient } from "pg";

import { pool } from "@/src/lib/db/pool";
import { getCurrentUser } from "@/src/lib/auth/auth";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";
import { pusherServer } from "@/src/lib/pusher/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

const leaveSchema = z
  .object({
    newOwnerId: z.number().int().positive().optional(),
    new_owner_id: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.newOwnerId === undefined ||
      value.new_owner_id === undefined ||
      value.newOwnerId === value.new_owner_id,
    {
      message: "Conflicting ownership selections.",
    },
  );

type GroupRow = {
  id: number;
  household_id: number | null;
  created_by: number;
  is_default: boolean;
};

type MemberRow = {
  user_id: number;
  role: "owner" | "admin" | "member";
  name: string;
};

type MessageRow = {
  id: number;
  thread_id: string;
  sender_id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

function parseGroupId(rawId: string): number {
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
  }

  return Number(rawId);
}

async function deliverNotifications(deliveries: Promise<unknown>[]) {
  const results = await Promise.allSettled(deliveries);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Group exit notification failed:", result.reason);
    }
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  let client: PoolClient | undefined;
  let inTransaction = false;

  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in.");
    }

    const { groupId: rawId } = await context.params;
    const groupId = parseGroupId(rawId);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid request body.");
    }

    const parsed = leaveSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Invalid ownership selection.",
      );
    }

    const requestedNewOwnerId =
      parsed.data.newOwnerId ?? parsed.data.new_owner_id;

    client = await pool.connect();
    await client.query("BEGIN");
    inTransaction = true;

    // Read the parent first so household and group operations
    // can follow a consistent lock order.
    const initialGroupResult = await client.query<GroupRow>(
      `
          SELECT
            id,
            household_id,
            created_by,
            is_default
          FROM public.household_groups
          WHERE id = $1
        `,
      [groupId],
    );

    const initialGroup = initialGroupResult.rows[0];

    if (!initialGroup) {
      throw new ApiError(404, "NOT_FOUND", "Group not found.");
    }

    if (initialGroup.household_id !== null) {
      const householdLock = await client.query(
        `
          SELECT id
          FROM public.households
          WHERE id = $1
          FOR UPDATE
        `,
        [initialGroup.household_id],
      );

      if (!householdLock.rowCount) {
        throw new ApiError(
          409,
          "GROUP_CHANGED",
          "The household changed. Please try again.",
        );
      }
    }

    const groupResult = await client.query<GroupRow>(
      `
        SELECT
          id,
          household_id,
          created_by,
          is_default
        FROM public.household_groups
        WHERE id = $1
        FOR UPDATE
      `,
      [groupId],
    );

    const group = groupResult.rows[0];

    if (!group) {
      throw new ApiError(404, "NOT_FOUND", "Group not found.");
    }

    if (group.household_id !== initialGroup.household_id) {
      throw new ApiError(
        409,
        "GROUP_CHANGED",
        "Group details changed. Please try again.",
      );
    }

    const threadId = `group_${groupId}`;

    const messages: MessageRow[] = [];

    const saveSystemMessage = async (
      content: string,
      metadata: Record<string, unknown>,
    ) => {
      const inserted = await client!.query<MessageRow>(
        `
            INSERT INTO public.messages
              (
                thread_id,
                sender_id,
                role,
                content,
                metadata
              )
            VALUES
              ($1, $2, 'system', $3, $4::jsonb)
            RETURNING
              id,
              thread_id,
              sender_id,
              role,
              content,
              metadata,
              created_at
          `,
        [threadId, String(user.id), content, JSON.stringify(metadata)],
      );

      const message = inserted.rows[0];

      if (!message) {
        throw new Error("Unable to save group activity.");
      }

      messages.push(message);
    };

    // =====================================================
    // MAIN HOUSEHOLD EXIT
    // =====================================================
    if (group.is_default) {
      if (group.household_id === null) {
        throw new ApiError(
          409,
          "INVALID_HOUSEHOLD",
          "Main Household has no parent household.",
        );
      }

      const householdId = group.household_id;

      // Household membership is authoritative for
      // ownership and permission checks.
      const householdMembersResult = await client.query<MemberRow>(
        `
            SELECT
              hm.user_id,
              hm.role,
              u.name
            FROM public.household_members hm
            JOIN public.users u
              ON u.id = hm.user_id
            WHERE hm.household_id = $1
            ORDER BY hm.user_id
            FOR UPDATE OF hm
          `,
        [householdId],
      );

      const householdMembers = householdMembersResult.rows;

      const current = householdMembers.find(
        (member) => Number(member.user_id) === Number(user.id),
      );

      if (!current) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "You are not a member of this household.",
        );
      }

      const isOwner = current.role === "owner";

      const otherMembers = householdMembers.filter(
        (member) => Number(member.user_id) !== Number(user.id),
      );

      const replacement =
        requestedNewOwnerId === undefined
          ? undefined
          : otherMembers.find(
              (member) => Number(member.user_id) === requestedNewOwnerId,
            );

      if (isOwner) {
        if (otherMembers.length === 0) {
          throw new ApiError(
            409,
            "LAST_HOUSEHOLD_OWNER",
            "You are the only household member. Delete the household instead, or invite another member before exiting.",
          );
        }

        if (!replacement) {
          throw new ApiError(
            400,
            "NEW_OWNER_REQUIRED",
            "Choose an existing household member to become the new owner.",
          );
        }
      } else if (requestedNewOwnerId !== undefined) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only the household owner can transfer ownership.",
        );
      }

      // Lock Main Household group memberships as well.
      const groupMembersResult = await client.query<MemberRow>(
        `
            SELECT
              gm.user_id,
              gm.role,
              u.name
            FROM public.household_group_members gm
            JOIN public.users u
              ON u.id = gm.user_id
            WHERE gm.group_id = $1
            ORDER BY gm.user_id
            FOR UPDATE OF gm
          `,
        [groupId],
      );

      const groupMembers = groupMembersResult.rows;

      if (
        !groupMembers.some(
          (member) => Number(member.user_id) === Number(user.id),
        )
      ) {
        throw new ApiError(
          409,
          "MEMBERSHIP_MISMATCH",
          "Your household and Main Household memberships are not synchronized.",
        );
      }

      if (isOwner && replacement) {
        // A partial unique index may allow only one
        // owner per household. Demote the departing
        // owner before promoting the replacement.
        await client.query(
          `
            UPDATE public.household_members
            SET role = 'member'
            WHERE household_id = $1
              AND user_id = $2
          `,
          [householdId, user.id],
        );

        await client.query(
          `
            UPDATE public.household_members
            SET role = 'owner'
            WHERE household_id = $1
              AND user_id = $2
          `,
          [householdId, replacement.user_id],
        );

        // Keep the Main Household group owner aligned.
        await client.query(
          `
            UPDATE public.household_group_members
            SET role = 'member'
            WHERE group_id = $1
              AND user_id = $2
          `,
          [groupId, user.id],
        );

        const promotedGroupMember = await client.query(
          `
              UPDATE public.household_group_members
              SET role = 'owner'
              WHERE group_id = $1
                AND user_id = $2
            `,
          [groupId, replacement.user_id],
        );

        if (!promotedGroupMember.rowCount) {
          throw new ApiError(
            409,
            "MEMBERSHIP_MISMATCH",
            "The selected owner is not a member of the Main Household group.",
          );
        }

        // Keep creator metadata aligned with the
        // current household owner.
        await client.query(
          `
            UPDATE public.household_groups
            SET created_by = $2,
                updated_at = NOW()
            WHERE id = $1
          `,
          [groupId, replacement.user_id],
        );

        await saveSystemMessage(
          `${user.name} transferred household ownership to ${replacement.name}`,
          {
            event_type: "household_owner_transferred",
            actor_id: user.id,
            previous_owner_id: user.id,
            new_owner_id: replacement.user_id,
            household_id: householdId,
          },
        );
      }

      // Remove only the user's Main Household group
      // membership and household membership.
      //
      // DO NOT remove the user from private groups.
      await client.query(
        `
          DELETE FROM public.household_group_members
          WHERE group_id = $1
            AND user_id = $2
        `,
        [groupId, user.id],
      );

      await client.query(
        `
          DELETE FROM public.household_members
          WHERE household_id = $1
            AND user_id = $2
        `,
        [householdId, user.id],
      );

      // Clear the departing user's active household.
      await client.query(
        `
          UPDATE public.user_preferences
          SET active_household_id = NULL
          WHERE user_id = $1
            AND active_household_id = $2
        `,
        [user.id, householdId],
      );

      await saveSystemMessage(`${user.name} left the household`, {
        event_type: "household_member_left",
        actor_id: user.id,
        member_id: user.id,
        household_id: householdId,
      });

      const remainingUserIds = otherMembers.map((member) => member.user_id);

      await client.query("COMMIT");
      inTransaction = false;

      client.release();
      client = undefined;

      const deliveries: Promise<unknown>[] = [
        ...messages.map((message) =>
          pusherServer.trigger(
            `private-household-group_${groupId}`,
            "new-message",
            message,
          ),
        ),

        ...remainingUserIds.map((id) =>
          pusherServer.trigger(`private-user-${id}`, "group.updated", {
            groupId,
            householdId,
            reason: "household_member_left",
            newOwnerId: replacement?.user_id ?? null,
          }),
        ),

        pusherServer.trigger(`private-user-${user.id}`, "group.removed", {
          groupId,
          groupIds: [groupId],
          householdId,
          reason: "household_left",
        }),
      ];

      await deliverNotifications(deliveries);

      return NextResponse.json(
        {
          left: true,
          groupId,
          householdId,
          household_left: true,
          group_deleted: false,
          newOwnerId: replacement?.user_id ?? null,
          message:
            "You have left the household. Your private-group memberships remain unchanged.",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // =====================================================
    // PRIVATE GROUP EXIT
    // =====================================================

    const membersResult = await client.query<MemberRow>(
      `
          SELECT
            gm.user_id,
            gm.role,
            u.name
          FROM public.household_group_members gm
          JOIN public.users u
            ON u.id = gm.user_id
          WHERE gm.group_id = $1
          ORDER BY gm.user_id
          FOR UPDATE OF gm
        `,
      [groupId],
    );

    const members = membersResult.rows;

    const current = members.find(
      (member) => Number(member.user_id) === Number(user.id),
    );

    if (!current) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a member of this group.",
      );
    }

    const isOwner = current.role === "owner";

    const otherMembers = members.filter(
      (member) => Number(member.user_id) !== Number(user.id),
    );

    const replacement =
      requestedNewOwnerId === undefined
        ? undefined
        : otherMembers.find(
            (member) => Number(member.user_id) === requestedNewOwnerId,
          );

    if (isOwner) {
      if (otherMembers.length > 0 && !replacement) {
        throw new ApiError(
          400,
          "NEW_OWNER_REQUIRED",
          "Choose an existing group member to become the new owner.",
        );
      }
    } else if (requestedNewOwnerId !== undefined) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only the current group owner can transfer ownership.",
      );
    }

    // Last member leaving a private group:
    // delete that private group, never the household.
    if (members.length === 1) {
      await client.query(
        `
          DELETE FROM public.messages
          WHERE thread_id = $1
        `,
        [threadId],
      );

      await client.query(
        `
          DELETE FROM public.household_group_members
          WHERE group_id = $1
            AND user_id = $2
        `,
        [groupId, user.id],
      );

      await client.query(
        `
          DELETE FROM public.household_groups
          WHERE id = $1
            AND is_default = FALSE
        `,
        [groupId],
      );

      await client.query("COMMIT");
      inTransaction = false;

      client.release();
      client = undefined;

      await deliverNotifications([
        pusherServer.trigger(`private-user-${user.id}`, "group.removed", {
          groupId,
          groupIds: [groupId],
          groupDeleted: true,
          reason: "last_member_left",
        }),
      ]);

      return NextResponse.json(
        {
          left: true,
          groupId,
          household_left: false,
          group_deleted: true,
          newOwnerId: null,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    if (isOwner && replacement) {
      // Demote first to support a unique owner index.
      await client.query(
        `
          UPDATE public.household_group_members
          SET role = 'member'
          WHERE group_id = $1
            AND user_id = $2
        `,
        [groupId, user.id],
      );

      await client.query(
        `
          UPDATE public.household_group_members
          SET role = 'owner'
          WHERE group_id = $1
            AND user_id = $2
        `,
        [groupId, replacement.user_id],
      );

      await client.query(
        `
          UPDATE public.household_groups
          SET created_by = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [groupId, replacement.user_id],
      );

      await saveSystemMessage(
        `${user.name} made ${replacement.name} the group owner`,
        {
          event_type: "owner_transferred",
          actor_id: user.id,
          previous_owner_id: user.id,
          new_owner_id: replacement.user_id,
        },
      );
    }

    await client.query(
      `
        DELETE FROM public.household_group_members
        WHERE group_id = $1
          AND user_id = $2
      `,
      [groupId, user.id],
    );

    await saveSystemMessage(`${user.name} left the group`, {
      event_type: "member_left",
      actor_id: user.id,
      member_id: user.id,
    });

    const remainingUserIds = otherMembers.map((member) => member.user_id);

    await client.query("COMMIT");
    inTransaction = false;

    client.release();
    client = undefined;

    const deliveries: Promise<unknown>[] = [
      ...messages.map((message) =>
        pusherServer.trigger(
          `private-household-group_${groupId}`,
          "new-message",
          message,
        ),
      ),

      ...remainingUserIds.map((id) =>
        pusherServer.trigger(`private-user-${id}`, "group.updated", {
          groupId,
          reason: "member_left",
          newOwnerId: replacement?.user_id ?? null,
        }),
      ),

      pusherServer.trigger(`private-user-${user.id}`, "group.removed", {
        groupId,
        groupIds: [groupId],
        reason: "group_left",
      }),
    ];

    await deliverNotifications(deliveries);

    return NextResponse.json(
      {
        left: true,
        groupId,
        household_left: false,
        group_deleted: false,
        newOwnerId: replacement?.user_id ?? null,
      },
      {
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
        console.error("Group exit rollback failed:", rollbackError);
      }
    }

    return handleApiError(error);
  } finally {
    client?.release();
  }
}
