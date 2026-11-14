import { NextRequest, NextResponse } from "next/server";

import { pool } from "@/src/lib/db/pool";
import { getCurrentUser } from "@/src/lib/auth/auth";

import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";

import { pusherServer } from "@/src/lib/pusher/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { message: "Invalid authorization request." },
        { status: 400 },
      );
    }

    const socketId = formData.get("socket_id");
    const channelName = formData.get("channel_name");

    if (typeof socketId !== "string" || typeof channelName !== "string") {
      return NextResponse.json(
        { message: "Invalid authorization request." },
        { status: 400 },
      );
    }

    if (!/^\d+\.\d+$/.test(socketId)) {
      return NextResponse.json(
        { message: "Invalid socket identifier." },
        { status: 400 },
      );
    }

    // 1. User-specific notification channel.
    const userChannel = `private-user-${user.id}`;

    if (channelName === userChannel) {
      const authorization = pusherServer.authorizeChannel(
        socketId,
        channelName,
      );

      return NextResponse.json(authorization, {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    // 2. Private group conversation channel.
    const match = /^private-household-group_([1-9]\d*)$/.exec(channelName);

    if (!match) {
      return NextResponse.json(
        {
          message: "You cannot subscribe to this channel.",
        },
        { status: 403 },
      );
    }

    const groupId = Number(match[1]);

    if (!Number.isSafeInteger(groupId)) {
      return NextResponse.json(
        { message: "Invalid group ID." },
        { status: 400 },
      );
    }

    // Check direct group membership.
    //
    // No household_members join is used.
    // Detached private groups are supported.
    const membership = await pool.query(
      `
        SELECT 1
        FROM public.household_groups g
        INNER JOIN public.household_group_members gm
          ON gm.group_id = g.id
        WHERE g.id = $1
          AND gm.user_id = $2
        LIMIT 1
      `,
      [groupId, user.id],
    );

    if (membership.rowCount === 0) {
      return NextResponse.json(
        {
          message: "You cannot subscribe to this group.",
        },
        { status: 403 },
      );
    }

    const authorization = pusherServer.authorizeChannel(socketId, channelName);

    return NextResponse.json(authorization, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Pusher channel authorization failed:", error);

    return NextResponse.json(
      {
        message: "Unable to authorize real-time connection.",
      },
      { status: 500 },
    );
  }
}
