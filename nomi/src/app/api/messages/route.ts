import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/src/lib/db/pool";

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId");
  if (!threadId) {
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT id, sender_id, role, content, created_at
     FROM messages
     WHERE thread_id = $1
     ORDER BY created_at ASC`,
    [threadId],
  );

  return NextResponse.json({ messages: rows });
}
