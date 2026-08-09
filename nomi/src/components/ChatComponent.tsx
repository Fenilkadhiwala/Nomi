"use client";
import { useEffect, useState } from "react";
import { Stack, ScrollArea, Paper, Text } from "@mantine/core";
import { ChatInputBar } from "./ChatInputBar";
import { getAIResponseStream } from "../apis/api";
import { ChatMessage } from "../types/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STORAGE_KEY = "chat-messages";
export const ChatComponent = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setMessages(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);
  const SENDER_ID: any = "Nabhi";
  const THREAD_ID: any = "74_hopkins_ave_at_18";

  const handleSend = async (text: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const result = await getAIResponseStream(text, SENDER_ID, THREAD_ID);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.response,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack h="100vh" justify="space-between">
      <ScrollArea flex={1} p="md">
        <Stack>
          {messages.map((message) => (
            <Paper
              key={message.id}
              p="md"
              radius="lg"
              bg={message.role === "user" ? "blue.6" : "gray.2"}
              c={message.role === "user" ? "white" : "black"}
              maw="75%"
              ml={message.role === "user" ? "auto" : 0}
            >
              {message.role === "assistant" ? (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <Text>{message.content}</Text>
              )}
            </Paper>
          ))}

          {loading && (
            <Paper p="md" radius="lg" bg="gray.2" maw="75%">
              <Text c="dimmed">Thinking...</Text>
            </Paper>
          )}
        </Stack>
      </ScrollArea>

      <ChatInputBar onSend={handleSend} />
    </Stack>
  );
};
