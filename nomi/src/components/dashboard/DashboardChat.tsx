"use client";

import {
  Avatar,
  Box,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
  SimpleGrid,
  UnstyledButton,
} from "@mantine/core";

import {
  RobotIcon,
  ShoppingCartIcon,
  WalletIcon,
  HouseIcon,
} from "@phosphor-icons/react";

import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MessageComposer } from "./MessageComposer";

import { getAIResponseStream, getMessages } from "@/src/apis/api";

import type { AuthUser, ChatMessage } from "@/src/types/types";

import { getApiError } from "@/src/lib/api/get-api-error";
import { notify } from "@/src/lib/notifications/notifications";
import { useGroupStore } from "@/src/store/useGroupStore";
import { BACKGROUND, BORDER, GREEN, MUTED, TEXT } from "@/src/utils/constants";

// Development-only conversation.
// Group-specific threads will be implemented separately.

interface DashboardChatProps {
  user: AuthUser;
}

function getInitials(name?: string) {
  if (!name) return "?";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function getTimestamp(message: ChatMessage) {
  if (!message.created_at) return "";

  const date = new Date(message.created_at);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

const suggestions = [
  {
    title: "Plan groceries",
    prompt: "Help me plan groceries for this week",
    icon: ShoppingCartIcon,
  },
  {
    title: "Split expenses",
    prompt: "Help us split our household expenses",
    icon: WalletIcon,
  },
  {
    title: "Household tasks",
    prompt: "Help us organize household tasks",
    icon: HouseIcon,
  },
];

export function DashboardChat({ user }: DashboardChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [loading, setLoading] = useState(false);

  const [loadingMessages, setLoadingMessages] = useState(true);

  const viewportRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const senderId = String(user.id);

  const groups = useGroupStore((state) => state.groups);

  const activeGroupId = useGroupStore((state) => state.activeGroupId);

  const activeGroup =
    groups.find((group) => group.id === activeGroupId) ?? null;
  const threadId = activeGroup ? `group_${activeGroup.id}` : null;
  console.log("active group", activeGroupId);

  useEffect(() => {
    let active = true;

    if (!threadId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    async function loadMessages() {
      setLoadingMessages(true);

      setMessages([]);

      try {
        const fetched = await getMessages(threadId!);

        if (active) {
          setMessages(fetched);
        }
      } catch (error) {
        if (active) {
          notify.error({
            title: "Unable to load messages",
            message: getApiError(error).message,
          });
        }
      } finally {
        if (active) {
          setLoadingMessages(false);
        }
      }
    }

    void loadMessages();

    return () => {
      active = false;
    };
  }, [threadId]);

  // Auto-scroll to latest message
  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, loadingMessages]);

  // Subscribe to real-time messages

  useEffect(() => {
    if (!threadId) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });

    const channelName = `household-${threadId}`;
    const channel = pusher.subscribe(channelName);

    const onNewMessage = (
      data: Partial<ChatMessage> & {
        senderId?: string | number;
        user_id?: string | number;
        userId?: string | number;
        createdAt?: string;
      },
    ) => {
      if (data.id == null) return;

      const newMessage: ChatMessage = {
        id: String(data.id),
        role: data.role ?? "user",
        content: data.content ?? "",
        sender_id: String(
          data.sender_id ?? data.senderId ?? data.user_id ?? data.userId ?? "",
        ),
        created_at: data.created_at ?? data.createdAt,
      };

      setMessages((previous) => {
        if (
          previous.some(
            (message) => String(message.id) === String(newMessage.id),
          )
        ) {
          return previous;
        }

        return [...previous, newMessage];
      });
    };

    channel.bind("new-message", onNewMessage);

    return () => {
      channel.unbind("new-message", onNewMessage);
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [threadId]);

  // Send message to Nomi
  const handleSend = async (value: string) => {
    const text = value.trim();

    if (!text || !threadId || sendingRef.current || loadingMessages) {
      return;
    }

    sendingRef.current = true;
    setLoading(true);

    try {
      await getAIResponseStream(text, threadId);
    } catch (error) {
      notify.error({
        title: "Message not sent",
        message: getApiError(error).message,
      });
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  };

  const visibleMessages = messages.filter(
    (message) =>
      message.role !== "assistant" || Boolean(message.content?.trim()),
  );

  return (
    <Box
      bg={BACKGROUND}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Chat messages */}
      <ScrollArea
        style={{
          flex: 1,
          minHeight: 0,
        }}
        viewportRef={viewportRef}
        type="auto"
        px={{ base: 14, sm: 28 }}
        py={22}
      >
        <Stack maw={900} mx="auto" gap={20} pb={16}>
          {loadingMessages && (
            <Text ta="center" c={MUTED} fz={13}>
              Loading conversation...
            </Text>
          )}

          {!loadingMessages && visibleMessages.length === 0 && (
            <Stack
              align="center"
              gap={0}
              py={{
                base: 30,
                sm: 65,
              }}
            >
              <Title
                order={2}
                ta="center"
                c={TEXT}
                fz={{
                  base: 25,
                  sm: 32,
                }}
                fw={700}
                style={{
                  letterSpacing: "-0.9px",
                }}
              >
                Hi {user.name.split(" ")[0]}, I'm Nomi.
              </Title>

              <Text mt={12} maw={440} ta="center" c={MUTED} fz={14} lh={1.7}>
                Your AI assistant for groceries, shared expenses, and everyday
                household planning. What would you like to do today?
              </Text>

              <SimpleGrid
                cols={{
                  base: 1,
                  sm: 3,
                }}
                spacing={12}
                mt={34}
                w="100%"
                maw={650}
              >
                {suggestions.map((suggestion) => {
                  const Icon = suggestion.icon;

                  return (
                    <UnstyledButton
                      key={suggestion.title}
                      disabled={loading}
                      onClick={() => void handleSend(suggestion.prompt)}
                    >
                      <Paper
                        p="md"
                        radius="lg"
                        bg="white"
                        h="100%"
                        style={{
                          border: `1px solid ${BORDER}`,
                          transition: "border-color 150ms ease",
                        }}
                      >
                        <Icon size={23} color={GREEN} weight="duotone" />

                        <Text mt={12} fw={650} fz={13} c={TEXT}>
                          {suggestion.title}
                        </Text>

                        <Text mt={5} fz={11} c={MUTED}>
                          Ask Nomi to help
                        </Text>
                      </Paper>
                    </UnstyledButton>
                  );
                })}
              </SimpleGrid>
            </Stack>
          )}

          {visibleMessages.map((message) => {
            const isAssistant = message.role === "assistant";

            const isMine =
              !isAssistant && String(message.sender_id) === senderId;

            const senderName = isAssistant
              ? "Nomi"
              : isMine
                ? "You"
                : String(message.sender_id || "Household member");

            const timestamp = getTimestamp(message);

            return (
              <Group
                key={message.id}
                align="flex-end"
                justify={isMine ? "flex-end" : "flex-start"}
                wrap="nowrap"
                gap={10}
              >
                {!isMine && (
                  <Avatar
                    size={34}
                    radius="xl"
                    bg={isAssistant ? "#E1EDE5" : "#E8E9E5"}
                    c={GREEN}
                  >
                    {isAssistant ? (
                      <RobotIcon size={19} weight="fill" />
                    ) : (
                      getInitials(senderName)
                    )}
                  </Avatar>
                )}

                <Stack
                  gap={5}
                  style={{
                    maxWidth: "min(75%, 680px)",
                    minWidth: 0,
                    alignItems: isMine ? "flex-end" : "flex-start",
                  }}
                >
                  <Text px={5} fz={11} fw={650} c={isAssistant ? GREEN : MUTED}>
                    {senderName}
                  </Text>

                  <Paper
                    px={16}
                    py={12}
                    radius="lg"
                    bg={isMine ? GREEN : isAssistant ? "#FFFFFF" : "#E9EBE6"}
                    style={{
                      border: isAssistant ? `1px solid ${BORDER}` : "none",
                      borderBottomRightRadius: isMine ? 5 : undefined,
                      borderBottomLeftRadius: !isMine ? 5 : undefined,
                      overflowWrap: "anywhere",
                      maxWidth: "100%",
                    }}
                  >
                    {isAssistant ? (
                      <Box className="markdown-body" c={TEXT} fz={14} lh={1.7}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </Box>
                    ) : (
                      <Text
                        fz={14}
                        lh={1.65}
                        c={isMine ? "white" : TEXT}
                        style={{
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {message.content}
                      </Text>
                    )}
                  </Paper>

                  {timestamp && (
                    <Text fz={10} c={MUTED} px={5}>
                      {timestamp}
                    </Text>
                  )}
                </Stack>

                {isMine && (
                  <Avatar size={34} radius="xl" bg="#DDE9E0" c={GREEN}>
                    {getInitials(user.name)}
                  </Avatar>
                )}
              </Group>
            );
          })}

          {loading && (
            <Group align="flex-end" gap={10} wrap="nowrap">
              <Avatar size={34} radius="xl" bg="#E1EDE5" c={GREEN}>
                <RobotIcon size={19} weight="fill" />
              </Avatar>

              <Stack gap={5}>
                <Text px={5} fz={11} fw={650} c={GREEN}>
                  Nomi
                </Text>

                <Paper
                  px={16}
                  py={12}
                  radius="lg"
                  bg="white"
                  style={{
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <Text fz={13} c={MUTED}>
                    Thinking...
                  </Text>
                </Paper>
              </Stack>
            </Group>
          )}
        </Stack>
      </ScrollArea>

      {/* Redesigned message composer */}
      <Box
        px={{
          base: 14,
          sm: 28,
        }}
        pt={12}
        pb={{
          base: 12,
          sm: 16,
        }}
        bg={BACKGROUND}
        style={{
          flexShrink: 0,
        }}
      >
        <Box maw={900} mx="auto">
          <MessageComposer
            onSend={handleSend}
            sending={loading}
            disabled={!threadId || loadingMessages}
            groupName={activeGroup?.name}
          />

          <Text ta="center" mt={10} c={MUTED} fz={10}>
            Nomi can make mistakes. Review important details before placing
            orders.
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
