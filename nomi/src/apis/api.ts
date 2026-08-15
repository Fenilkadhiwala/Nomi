import { ChatMessage } from "../types/types";

export const getAIResponseStream = async (
  message: string,
  senderId: any,
  threadId: any,
) => {
  const response = await fetch("http://localhost:3000/api/get-ai-response", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, senderId, threadId }),
  });
  return response.json();
};

export const getMessages = async (thread_id: any) => {
  const messages = await fetch(`/api/messages?threadId=${thread_id}`).then(
    (res) => res.json(),
  );

  const hydrated: ChatMessage[] = messages.messages.map((m: any) => ({
    id: String(m.id),
    role: m.role,
    content: m.content,
    sender_id: m.sender_id,
  }));

  return hydrated;
};
