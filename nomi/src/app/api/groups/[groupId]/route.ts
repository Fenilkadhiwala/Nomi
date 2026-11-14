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
import { sendGroupDeletedEmail } from "@/src/lib/email/mailer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

const renameSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
  })
  .strict();

type GroupRow = {
  id: number;
  household_id: number | null;
  name: string;
  is_default: boolean;
  created_by: number;
};

type Recipient = {
  id: number;
  name: string;
  email: string;
};

type SystemMessage = {
  id: number;
  thread_id: string;
  sender_id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

function parseGroupId(rawId: string): number {
  if (!/^[1-9]\d*$/.test(rawId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
  }

  const groupId = Number(rawId);

  if (!Number.isSafeInteger(groupId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
  }

  return groupId;
}

async function notifyUsers(
  userIds: number[],
  event: string,
  payload: Record<string, unknown>,
) {
  const results = await Promise.allSettled(
    [...new Set(userIds)].map((userId) =>
      pusherServer.trigger(`private-user-${userId}`, event, payload),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`Pusher ${event} notification failed:`, result.reason);
    }
  }
}

async function emailDeletedGroup(
  recipients: Recipient[],
  groupName: string,
  deletedByName: string,
) {
  const results = await Promise.allSettled(
    recipients.map((member) =>
      sendGroupDeletedEmail({
        to: member.email,
        memberName: member.name,
        groupName,
        deletedByName,
      }),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Group deletion email failed:", result.reason);
    }
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

    const { groupId: rawGroupId } = await context.params;
    const groupId = parseGroupId(rawGroupId);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid request body.");
    }

    const parsed = renameSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid group name.",
      );
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const groupResult = await client.query<GroupRow>(
      `
        SELECT
          id,
          household_id,
          name,
          is_default,
          created_by
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

    const membershipResult = await client.query<{
      role: string;
    }>(
      `
        SELECT role
        FROM public.household_group_members
        WHERE group_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [groupId, user.id],
    );

    if (!membershipResult.rows[0]) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a member of this group.",
      );
    }

    if (group.is_default) {
      if (group.household_id === null) {
        throw new ApiError(
          409,
          "INVALID_HOUSEHOLD",
          "Main Household has no parent household.",
        );
      }

      const ownerResult = await client.query(
        `
          SELECT 1
          FROM public.household_members
          WHERE household_id = $1
            AND user_id = $2
            AND role = 'owner'
          LIMIT 1
        `,
        [group.household_id, user.id],
      );

      if (!ownerResult.rowCount) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only the household owner can rename the Main Household.",
        );
      }
    } else {
      const groupOwner = membershipResult.rows[0].role === "owner";

      if (!groupOwner) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only the private-group owner can rename this group.",
        );
      }
    }

    const newName = parsed.data.name;

    if (newName === group.name) {
      await client.query("COMMIT");
      transactionStarted = false;

      return NextResponse.json({
        group: {
          id: group.id,
          name: group.name,
          is_default: group.is_default,
        },
        changed: false,
      });
    }

    await client.query(
      `
        UPDATE public.household_groups
        SET name = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [groupId, newName],
    );

    // Keep the household's display name synchronized
    // with its Main Household group.
    if (group.is_default) {
      await client.query(
        `
          UPDATE public.households
          SET name = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [group.household_id, newName],
      );
    }

    const messageResult = await client.query<SystemMessage>(
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
      [
        `group_${groupId}`,
        String(user.id),
        `${user.name} changed the group name to ${newName}`,
        JSON.stringify({
          event_type: "group_renamed",
          actor_id: user.id,
          old_name: group.name,
          new_name: newName,
        }),
      ],
    );

    const message = messageResult.rows[0];

    if (!message) {
      throw new Error("Unable to create rename system message.");
    }

    const memberResult = await client.query<{
      user_id: number;
    }>(
      `
        SELECT user_id
        FROM public.household_group_members
        WHERE group_id = $1
      `,
      [groupId],
    );

    const memberIds = memberResult.rows.map((member) => member.user_id);

    await client.query("COMMIT");
    transactionStarted = false;

    client.release();
    client = undefined;

    try {
      await pusherServer.trigger(
        `private-household-group_${groupId}`,
        "new-message",
        message,
      );
    } catch (error) {
      console.error("Group rename message notification failed:", error);
    }

    await notifyUsers(memberIds, "group.updated", {
      groupId,
      householdId: group.household_id,
      name: newName,
      is_default: group.is_default,
    });

    return NextResponse.json(
      {
        group: {
          id: groupId,
          name: newName,
          is_default: group.is_default,
        },
        message,
        changed: true,
      },
      {
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
        console.error("Rename rollback failed:", rollbackError);
      }
    }

    return handleApiError(error);
  } finally {
    client?.release();
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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

    const { groupId: rawGroupId } = await context.params;
    const groupId = parseGroupId(rawGroupId);

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const initialResult = await client.query<GroupRow>(
      `
        SELECT
          id,
          household_id,
          name,
          is_default,
          created_by
        FROM public.household_groups
        WHERE id = $1
      `,
      [groupId],
    );

    const initialGroup = initialResult.rows[0];

    if (!initialGroup) {
      throw new ApiError(404, "NOT_FOUND", "Group not found.");
    }

    // Lock the parent household before locking the group.
    // Detached private groups have no parent household.
    if (initialGroup.household_id !== null) {
      const householdResult = await client.query(
        `
          SELECT id
          FROM public.households
          WHERE id = $1
          FOR UPDATE
        `,
        [initialGroup.household_id],
      );

      if (!householdResult.rowCount) {
        throw new ApiError(404, "NOT_FOUND", "Household not found.");
      }
    }

    const groupResult = await client.query<GroupRow>(
      `
        SELECT
          id,
          household_id,
          name,
          is_default,
          created_by
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

    // If the group was detached while this request waited
    // for a lock, retry instead of acting on stale data.
    if (group.household_id !== initialGroup.household_id) {
      throw new ApiError(
        409,
        "GROUP_CHANGED",
        "Group details changed. Please try again.",
      );
    }

    // ============================================
    // MAIN HOUSEHOLD DELETION
    // ============================================
    if (group.is_default) {
      if (group.household_id === null) {
        throw new ApiError(
          409,
          "INVALID_HOUSEHOLD",
          "Main Household has no parent household.",
        );
      }

      const householdId = group.household_id;

      // Only the household owner can delete it.
      // created_by is not the authority for this action.
      const ownerResult = await client.query(
        `
          SELECT 1
          FROM public.household_members
          WHERE household_id = $1
            AND user_id = $2
            AND role = 'owner'
          LIMIT 1
        `,
        [householdId, user.id],
      );

      if (!ownerResult.rowCount) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only the household owner can delete the Main Household.",
        );
      }

      // All affected household members need a refresh.
      const householdMembers = await client.query<Recipient>(
        `
            SELECT DISTINCT
              u.id,
              u.name,
              u.email
            FROM public.household_members hm
            JOIN public.users u
              ON u.id = hm.user_id
            WHERE hm.household_id = $1
          `,
        [householdId],
      );

      const recipients = householdMembers.rows;
      const affectedUserIds = recipients.map((member) => member.id);

      // Main Household messages have no FK to the group,
      // so explicitly remove its conversation.
      await client.query(
        `
          DELETE FROM public.messages
          WHERE thread_id = $1
        `,
        [`group_${groupId}`],
      );

      // Delete Main Household first because the migration
      // prevents is_default=true with household_id=NULL.
      await client.query(
        `
          DELETE FROM public.household_groups
          WHERE id = $1
            AND is_default = TRUE
        `,
        [groupId],
      );

      // This must be protected by the migration:
      // - private groups become detached (household_id=NULL)
      // - private-group memberships remain intact
      // - private-group conversations remain intact
      // - household memberships/invitations/carts cascade
      // - active_household_id is set to NULL
      await client.query(
        `
          DELETE FROM public.households
          WHERE id = $1
        `,
        [householdId],
      );

      await client.query("COMMIT");
      transactionStarted = false;

      client.release();
      client = undefined;

      await notifyUsers(affectedUserIds, "group.removed", {
        groupId,
        groupIds: [groupId],
        householdId,
        groupName: group.name,
        reason: "household_deleted",
        deletedByName: user.name,
      });

      // Notify all affected users that their household
      // membership and Create Household eligibility changed.
      await notifyUsers(affectedUserIds, "household.deleted", {
        householdId,
        groupId,
      });

      await emailDeletedGroup(recipients, group.name, user.name);

      return NextResponse.json(
        {
          success: true,
          household_deleted: true,
          group_deleted: true,
          household_id: householdId,
          group_id: groupId,
          deleted_group_ids: [groupId],
          message:
            "Household deleted successfully. Private groups remain available.",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // ============================================
    // PRIVATE GROUP DELETION
    // ============================================

    const groupOwner = await client.query(
      `
        SELECT 1
        FROM public.household_group_members
        WHERE group_id = $1
          AND user_id = $2
          AND role = 'owner'
        LIMIT 1
      `,
      [groupId, user.id],
    );

    if (!groupOwner.rowCount) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only the private-group owner can delete this group.",
      );
    }

    const groupMembers = await client.query<Recipient>(
      `
        SELECT
          u.id,
          u.name,
          u.email
        FROM public.household_group_members gm
        JOIN public.users u
          ON u.id = gm.user_id
        WHERE gm.group_id = $1
      `,
      [groupId],
    );

    const recipients = groupMembers.rows;

    await client.query(
      `
        DELETE FROM public.messages
        WHERE thread_id = $1
      `,
      [`group_${groupId}`],
    );

    // Memberships and group invitations cascade.
    await client.query(
      `
        DELETE FROM public.household_groups
        WHERE id = $1
          AND is_default = FALSE
      `,
      [groupId],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    client.release();
    client = undefined;

    await notifyUsers(
      recipients.map((member) => member.id),
      "group.removed",
      {
        groupId,
        groupIds: [groupId],
        groupName: group.name,
        reason: "deleted",
        deletedByName: user.name,
      },
    );

    await emailDeletedGroup(recipients, group.name, user.name);

    return NextResponse.json(
      {
        success: true,
        household_deleted: false,
        group_deleted: true,
        group_id: groupId,
        deleted_group_ids: [groupId],
        message: "Private group deleted successfully.",
      },
      {
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
        console.error("Group deletion rollback failed:", rollbackError);
      }
    }

    return handleApiError(error);
  } finally {
    client?.release();
  }
}
