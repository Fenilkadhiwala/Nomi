"use client";

import { BORDER, GREEN } from "@/src/utils/constants";
import { ActionIcon, Box, Group, Textarea, Tooltip } from "@mantine/core";

import { ArrowUpIcon, PlusIcon } from "@phosphor-icons/react";

import { useState, type KeyboardEvent } from "react";

interface MessageComposerProps {
  onSend: (message: string) => Promise<void> | void;
  sending?: boolean;
  disabled?: boolean;
  groupName?: string;
  onAddAttachment?: () => void;
}

export function MessageComposer({
  onSend,
  sending = false,
  disabled = false,
  groupName,
  onAddAttachment,
}: MessageComposerProps) {
  const [message, setMessage] = useState("");

  const canSend = message.trim().length > 0 && !sending && !disabled;

  const handleSend = async () => {
    if (!canSend) return;

    const text = message.trim();

    setMessage("");

    await onSend(text);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();

      if (canSend) {
        void handleSend();
      }
    }
  };

  return (
    <Box
      w="100%"
      bg="#FFFFFF"
      px={{ base: 14, sm: 18 }}
      pt={13}
      pb={10}
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 22,
        boxShadow: "0 3px 14px rgba(36,75,60,0.045)",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
      }}
    >
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={groupName ? `Message ${groupName}...` : "Message Nomi..."}
        autosize
        minRows={1}
        maxRows={6}
        disabled={disabled}
        variant="unstyled"
        aria-label="Message"
        styles={{
          input: {
            padding: "4px 2px 10px",
            fontSize: 14,
            lineHeight: 1.6,
            color: "#202521",
            background: "transparent",
            resize: "none",
          },
        }}
      />

      <Group justify="space-between" align="center" mt={2}>
        <Tooltip
          label={onAddAttachment ? "Add attachment" : "Attachments coming soon"}
          withArrow
        >
          <ActionIcon
            variant="subtle"
            color="dark"
            size={34}
            radius="xl"
            disabled={disabled || !onAddAttachment}
            onClick={onAddAttachment}
            aria-label="Add attachment"
          >
            <PlusIcon size={19} color={GREEN} weight="bold" />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Send message" withArrow>
          <ActionIcon
            size={36}
            radius="xl"
            variant="filled"
            color="dark"
            disabled={!canSend}
            loading={sending}
            onClick={() => void handleSend()}
            aria-label="Send message"
            styles={{
              root: {
                backgroundColor: canSend ? GREEN : "#E9EEE9",
                color: canSend ? "#FFFFFF" : "#9DA9A0",
                border: "none",
              },
            }}
          >
            <ArrowUpIcon size={18} weight="bold" />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Box>
  );
}
