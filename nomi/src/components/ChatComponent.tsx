"use client";

import { useEffect, useState, useRef } from "react";
import {
  Stack,
  ScrollArea,
  Paper,
  Text,
  Box,
  Group,
  Avatar,
} from "@mantine/core";
import { ChatInputBar } from "./ChatInputBar";
import { getAIResponseStream, getMessages } from "../apis/api";
import { ChatMessage } from "../types/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Pusher from "pusher-js";
import { useSearchParams } from "next/navigation";
import { RobotIcon } from "@phosphor-icons/react";

export const ChatComponent = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();

  const SENDER_ID = searchParams.get("user") ?? "alice";

  // TODO: Replace this with your actual dynamic thread ID
  const THREAD_ID = "74_hopkins_ave_at_6";

  const getInitials = (name?: string) => {
    if (!name) return "?";

    return name
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const getSenderName = (message: ChatMessage) => {
    if (message.role === "assistant") {
      return "Nomi";
    }

    return message.sender_id || "Unknown";
  };

  const getTimestamp = (message: ChatMessage) => {
    if (!message.created_at) return "";

    const date = new Date(message.created_at);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const fetchMessages = async () => {
    try {
      const fetchedMessages = await getMessages(THREAD_ID);

      setMessages(fetchedMessages);
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  };
  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "auto",
    });
  }, [messages]);

  useEffect(() => {
    fetchMessages();
  }, []);

  useEffect(() => {
    if (!THREAD_ID) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channelName = `household-${THREAD_ID}`;

    const channel = pusher.subscribe(channelName);

    channel.bind("new-message", (data: any) => {
      console.log("Pusher new message:", data);

      const newMessage: ChatMessage = {
        id: String(data.id),
        role: data.role,
        content: data.content,

        sender_id:
          data.sender_id ?? data.senderId ?? data.user_id ?? data.userId,

        created_at: data.created_at ?? data.createdAt,
      };

      setMessages((prev) => {
        const alreadyExists = prev.some(
          (message) => String(message.id) === String(newMessage.id),
        );

        if (alreadyExists) {
          return prev;
        }

        return [...prev, newMessage];
      });
    });

    return () => {
      channel.unbind("new-message");
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [THREAD_ID]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    setLoading(true);

    try {
      await getAIResponseStream(text, SENDER_ID, THREAD_ID);
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack h="100vh" gap={0} bg="white">
      <ScrollArea flex={1} p="md" type="auto" viewportRef={viewportRef}>
        <Stack gap="md" maw={1000} mx="auto">
          {messages.map((message) => {
            const isAssistant = message.role === "assistant";

            const isMine = !isAssistant && message.sender_id === SENDER_ID;

            const senderName = getSenderName(message);

            const timestamp = getTimestamp(message);

            return (
              <Group
                key={message.id}
                align="flex-end"
                justify={isMine ? "flex-end" : "flex-start"}
                wrap="nowrap"
                gap="xs"
              >
                {!isMine && (
                  <Avatar
                    size={36}
                    radius="xl"
                    color={isAssistant ? "violet" : "blue"}
                  >
                    {isAssistant ? (
                      <RobotIcon size={20} weight="fill" />
                    ) : (
                      getInitials(senderName)
                    )}
                  </Avatar>
                )}

                <Stack
                  gap={3}
                  maw="70%"
                  align={isMine ? "flex-end" : "flex-start"}
                >
                  <Text
                    size="xs"
                    fw={600}
                    c={isAssistant ? "violet.7" : "dimmed"}
                    px={6}
                    className="capitalize"
                  >
                    {isMine ? "You" : senderName}
                  </Text>

                  <Paper
                    px="md"
                    py="sm"
                    radius="lg"
                    bg={isMine ? "blue.6" : isAssistant ? "violet.0" : "gray.1"}
                    c={isMine ? "white" : "dark"}
                    withBorder={isAssistant}
                    style={{
                      borderColor: isAssistant
                        ? "var(--mantine-color-violet-2)"
                        : undefined,

                      overflowWrap: "anywhere",
                    }}
                  >
                    {isAssistant ? (
                      <Box className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </Box>
                    ) : (
                      <Text
                        size="sm"
                        style={{
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {message.content}
                      </Text>
                    )}
                  </Paper>

                  {timestamp && (
                    <Text size="10px" c="dimmed" px={6}>
                      {timestamp}
                    </Text>
                  )}
                </Stack>

                {isMine && (
                  <Avatar size={36} radius="xl" color="blue">
                    {getInitials(SENDER_ID)}
                  </Avatar>
                )}
              </Group>
            );
          })}

          {loading && (
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <Avatar size={36} radius="xl" color="violet">
                <RobotIcon size={20} weight="fill" />
              </Avatar>

              <Stack gap={3}>
                <Text size="xs" fw={600} c="violet.7" px={6}>
                  Nomi
                </Text>

                <Paper
                  px="md"
                  py="sm"
                  radius="lg"
                  bg="violet.0"
                  withBorder
                  style={{
                    borderColor: "var(--mantine-color-violet-2)",
                  }}
                >
                  <Text size="sm" c="dimmed">
                    Thinking...
                  </Text>
                </Paper>
              </Stack>
            </Group>
          )}
        </Stack>
      </ScrollArea>

      <Box
        px="md"
        py="sm"
        style={{
          borderTop: "1px solid var(--mantine-color-gray-2)",
          background: "white",
        }}
      >
        <Box maw={1000} mx="auto">
          <ChatInputBar onSend={handleSend} />
        </Box>
      </Box>
    </Stack>
  );
};
