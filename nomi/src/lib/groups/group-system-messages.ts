import "server-only";

import type { PoolClient } from "pg";

import { pusherServer } from "@/src/lib/pusher/server";

export type GroupSystemEvent =
  | "member_added"
  | "member_invited"
  | "invitation_accepted";

export interface GroupSystemMessage {
  id: string | number;
  thread_id: string;
  sender_id: string;
  role: "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date | string;
}

export interface GroupSystemMessageInput {
  groupId: number;
  actorId: number;
  actorName: string;
  memberId?: number;
  memberName?: string;
  memberEmail?: string;
  invitationId?: string | number;
  eventType: GroupSystemEvent;
}

export interface SavedGroupSystemMessage {
  groupId: number;
  message: GroupSystemMessage;
}

function getMessageContent(input: GroupSystemMessageInput): string {
  const actor = input.actorName.trim();
  const member =
    input.memberName?.trim() || input.memberEmail?.trim() || "a member";

  switch (input.eventType) {
    case "member_added":
      return `${actor} added ${member} to the group`;

    case "member_invited":
      return `${actor} invited ${member} to the group`;

    case "invitation_accepted":
      return `${actor} accepted the invitation and joined the group`;
  }
}

/**
 * Saves a system message inside the caller's
 * PostgreSQL transaction.
 *
 * IMPORTANT:
 * Do not publish to Pusher here.
 * Publish only after the caller commits.
 */
export async function saveGroupSystemMessage(
  client: PoolClient,
  input: GroupSystemMessageInput,
): Promise<SavedGroupSystemMessage> {
  const threadId = `group_${input.groupId}`;

  const metadata: Record<string, unknown> = {
    event_type: input.eventType,
    actor_id: input.actorId,
    group_id: input.groupId,
  };

  if (input.memberId !== undefined) {
    metadata.member_id = input.memberId;
  }

  if (input.memberName !== undefined) {
    metadata.member_name = input.memberName;
  }

  if (input.memberEmail !== undefined) {
    metadata.member_email = input.memberEmail;
  }

  if (input.invitationId !== undefined) {
    metadata.invitation_id = input.invitationId;
  }

  const result = await client.query<GroupSystemMessage>(
    `
      INSERT INTO public.messages (
        thread_id,
        sender_id,
        role,
        content,
        metadata
      )
      VALUES (
        $1,
        $2,
        'system',
        $3,
        $4::jsonb
      )
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
      threadId,
      String(input.actorId),
      getMessageContent(input),
      JSON.stringify(metadata),
    ],
  );

  const message = result.rows[0];

  if (!message) {
    throw new Error("Unable to save group system message.");
  }

  return {
    groupId: input.groupId,
    message,
  };
}

/**
 * Publish saved messages after COMMIT.
 *
 * This follows the same channel/event convention
 * used by your existing group leave route:
 *
 * household-group_${groupId}
 * new-message
 */
export async function publishGroupSystemMessages(
  messages: SavedGroupSystemMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  const results = await Promise.allSettled(
    messages.map(({ groupId, message }) =>
      pusherServer.trigger(
        `household-group_${groupId}`,
        "new-message",
        message,
      ),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Unable to publish group system message:", result.reason);
    }
  }
}

/**
 * Notify group members to refresh their
 * sidebar membership information.
 *
 * Use after COMMIT.
 */
export async function notifyGroupMembershipChanges(
  groupIds: number[],
): Promise<void> {
  const uniqueIds = [...new Set(groupIds)];

  if (uniqueIds.length === 0) return;

  // Fetch all affected users once.
  const { pool } = await import("@/src/lib/db/pool");

  const result = await pool.query<{
    group_id: number;
    user_id: number;
  }>(
    `
      SELECT DISTINCT group_id, user_id
      FROM public.household_group_members
      WHERE group_id = ANY($1::int[])
    `,
    [uniqueIds],
  );

  const notifications = result.rows.map((row) =>
    pusherServer.trigger(`private-user-${row.user_id}`, "group.updated", {
      groupId: Number(row.group_id),
    }),
  );

  const settled = await Promise.allSettled(notifications);

  for (const item of settled) {
    if (item.status === "rejected") {
      console.error("Unable to publish membership update:", item.reason);
    }
  }
}
