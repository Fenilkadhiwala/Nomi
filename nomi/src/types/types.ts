export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sender_id?: string;
  created_at?: string;
}
