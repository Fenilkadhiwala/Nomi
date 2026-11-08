import { ActionIcon, Box, Paper, Textarea } from "@mantine/core";
import { IconPlus, IconSend } from "@tabler/icons-react";
import { useState } from "react";

interface Props {
  onSend: (message: string) => Promise<void>;
}

export const ChatInputBar = ({ onSend }: Props) => {
  const [message, setMessage] = useState("");

  const handleSend = async () => {
    if (!message.trim()) return;

    const text = message;
    setMessage("");

    await onSend(text);
  };

  return (
    <Box p="md">
      <Paper withBorder radius="xl" shadow="sm" p="xs" maw={900} mx="auto">
        <Textarea
          variant="unstyled"
          placeholder="Message..."
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          autosize
          minRows={1}
          maxRows={6}
          leftSection={
            <ActionIcon variant="subtle" radius="xl">
              <IconPlus size={18} />
            </ActionIcon>
          }
          rightSection={
            <ActionIcon
              radius="xl"
              color="dark"
              variant="filled"
              disabled={!message.trim()}
              onClick={handleSend}
            >
              <IconSend size={18} />
            </ActionIcon>
          }
          rightSectionWidth={50}
          leftSectionWidth={50}
          size="lg"
        />
      </Paper>
    </Box>
  );
};
