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
  UserPlusIcon,
  SignOutIcon,
  PencilSimpleIcon,
  InfoIcon,
  EnvelopeSimpleIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";

import { useEffect, useRef, useState } from "react";

import { getPusherClient } from "@/src/lib/pusher/client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MessageComposer } from "./MessageComposer";

import { getAIResponseStream, getMessages } from "@/src/apis/api";

import type { AuthUser, ChatMessage } from "@/src/types/types";

import { getApiError } from "@/src/lib/api/get-api-error";
import { notify } from "@/src/lib/notifications/notifications";
import { useGroupStore } from "@/src/store/useGroupStore";

import { BACKGROUND, BORDER, GREEN, MUTED, TEXT } from "@/src/utils/constants";

interface DashboardChatProps {
  user: AuthUser;
}

type IncomingChatMessage = Partial<ChatMessage> & {
  senderId?: string | number;
  user_id?: string | number;
  userId?: string | number;
  createdAt?: string;
};

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

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function compareMessages(a: ChatMessage, b: ChatMessage) {
  const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;

  const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;

  if (timeA !== timeB) {
    return timeA - timeB;
  }

  return Number(a.id) - Number(b.id);
}

// =====================================================
// SYSTEM MESSAGE ICONS
// =====================================================

function getSystemEventIcon(message: ChatMessage) {
  switch (message.metadata?.event_type) {
    case "member_added":
    case "household_member_added":
      return UserPlusIcon;

    case "member_invited":
    case "household_member_invited":
      return EnvelopeSimpleIcon;

    case "invitation_accepted":
    case "household_invitation_accepted":
      return CheckCircleIcon;

    case "member_left":
    case "household_member_left":
      return SignOutIcon;

    case "group_renamed":
      return PencilSimpleIcon;

    default:
      return InfoIcon;
  }
}

function normalizeMessage(data: IncomingChatMessage): ChatMessage | null {
  if (data.id == null) {
    return null;
  }

  return {
    id: String(data.id),
    role: data.role ?? "user",
    content: data.content ?? "",
    sender_id: String(
      data.sender_id ?? data.senderId ?? data.user_id ?? data.userId ?? "",
    ),
    created_at: data.created_at ?? data.createdAt,
    metadata: data.metadata ?? null,
  };
}

function mergeMessages(
  previous: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();

  for (const message of previous) {
    byId.set(String(message.id), message);
  }

  for (const message of incoming) {
    byId.set(String(message.id), message);
  }

  return [...byId.values()].sort(compareMessages);
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

// =====================================================
// DASHBOARD CHAT
// =====================================================

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

  // ===================================================
  // LOAD GROUP MESSAGES
  // ===================================================

  useEffect(() => {
    let active = true;

    if (!threadId) {
      setMessages([]);
      setLoadingMessages(false);

      return;
    }

    const currentThreadId = threadId;

    async function loadMessages() {
      setLoadingMessages(true);
      setMessages([]);

      try {
        const fetched = await getMessages(currentThreadId);

        if (!active) {
          return;
        }

        // Preserve real-time messages received
        // while the history request was loading.
        setMessages((previous) => mergeMessages(fetched, previous));
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

  // ===================================================
  // AUTO SCROLL
  // ===================================================

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, loadingMessages]);

  // ===================================================
  // PUSHER REAL-TIME MESSAGES
  // ===================================================

  useEffect(() => {
    if (!threadId) return;

    let pusher: ReturnType<typeof getPusherClient>;

    try {
      pusher = getPusherClient();
    } catch (error) {
      console.error("Unable to initialize chat updates:", error);

      return;
    }

    // Matches the server-side system-message helper.
    const channelName = `household-${threadId}`;

    const channel = pusher.subscribe(channelName);

    const onNewMessage = (data: IncomingChatMessage) => {
      const newMessage = normalizeMessage(data);

      if (!newMessage) {
        return;
      }

      // Prevent duplicate messages when the same
      // record arrives from history and Pusher.
      setMessages((previous) => mergeMessages(previous, [newMessage]));
    };

    channel.bind("new-message", onNewMessage);

    return () => {
      channel.unbind("new-message", onNewMessage);

      pusher.unsubscribe(channelName);

      // Do not disconnect the shared Pusher client.
      // Other dashboard components may use it.
    };
  }, [threadId]);

  // ===================================================
  // SEND MESSAGE
  // ===================================================

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

  // ===================================================
  // RENDER
  // ===================================================

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
            // =======================================
            // SYSTEM MESSAGES
            // =======================================

            if (message.role === "system") {
              const EventIcon = getSystemEventIcon(message);

              const timestamp = getTimestamp(message);

              return (
                <Group key={message.id} justify="center" wrap="nowrap">
                  <Paper
                    radius="xl"
                    px={14}
                    py={8}
                    bg="#E8EEE9"
                    style={{
                      maxWidth: "100%",
                      border: `1px solid ${BORDER}`,
                    }}
                  >
                    <Group gap={7} justify="center" wrap="nowrap">
                      <Box
                        style={{
                          flexShrink: 0,
                        }}
                      >
                        <EventIcon size={15} color={MUTED} weight="regular" />
                      </Box>

                      <Text
                        fz={12}
                        c={MUTED}
                        ta="center"
                        style={{
                          overflowWrap: "anywhere",
                        }}
                      >
                        {message.content}
                      </Text>

                      {timestamp && (
                        <Text
                          fz={10}
                          c={MUTED}
                          style={{
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {timestamp}
                        </Text>
                      )}
                    </Group>
                  </Paper>
                </Group>
              );
            }

            // =======================================
            // NORMAL CHAT MESSAGES
            // =======================================

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

      {/* Message composer */}
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
