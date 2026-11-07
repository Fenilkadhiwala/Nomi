import {
  AuthResponse,
  AuthUser,
  ChatMessage,
  LoginPayload,
  RegisterPayload,
} from "../types/types";

import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 15000,
});

export const getAIResponseStream = async (
  message: string,
  senderId: any,
  threadId: any,
) => {
  const response = await fetch("/api/get-ai-response", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      message,
      senderId,
      threadId,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to get AI response.");
  }

  return response.json();
};

export const getMessages = async (threadId: string): Promise<ChatMessage[]> => {
  console.log("thread id", threadId);
  const { data } = await api.get<{
    messages: ChatMessage[];
  }>("/messages", {
    params: { threadId },
  });

  return data.messages.map((message) => ({
    id: String(message.id),
    role: message.role,
    content: message.content,
    sender_id: message.sender_id,
    created_at: message.created_at,
  }));
};

export async function registerUser(
  payload: RegisterPayload,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/register", payload);

  return data;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/login", payload);

  return data;
}

export async function getLoggedInUser(): Promise<AuthUser | null> {
  try {
    const { data } = await api.get<AuthResponse>("/me");

    return data.user;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  await api.post("/logout");
}

export default api;
