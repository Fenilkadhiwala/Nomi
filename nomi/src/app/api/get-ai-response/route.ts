import { getChatResponse } from "@/src/services/chat.service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message, senderId, threadId } = await req.json();

    if (!message || !senderId || !threadId) {
      return NextResponse.json(
        { error: "Missing message, senderId, or threadId" },
        { status: 400 },
      );
    }

    const result = await getChatResponse(message, senderId, threadId);

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}
