"use client";

import { Avatar, Box, Group, Text, UnstyledButton } from "@mantine/core";

import { UsersThreeIcon } from "@phosphor-icons/react";

import { GREEN, MUTED, TEXT } from "@/src/utils/constants";

interface GroupHeaderProps {
  name: string;
  memberCount?: number;
  imageUrl?: string | null;
  onClick: () => void;
}

export function GroupHeader({
  name,
  memberCount,
  imageUrl,
  onClick,
}: GroupHeaderProps) {
  return (
    <UnstyledButton
      onClick={onClick}
      aria-label={`View ${name} group information`}
      style={{
        display: "block",
        width: "fit-content",
        maxWidth: "100%",
        borderRadius: 12,
        padding: "8px 12px",
        transition: "background-color 180ms ease",
      }}
      styles={{
        root: {
          "&:hover": {
            backgroundColor: "#F3F6F3",
          },
        },
      }}
    >
      <Group gap={14} wrap="nowrap" align="center">
        <Avatar
          src={imageUrl || undefined}
          size={46}
          radius="xl"
          bg="#E4EEE7"
          c={GREEN}
          style={{
            flexShrink: 0,
            border: "1px solid #D9E6DC",
          }}
        >
          <UsersThreeIcon size={24} weight="duotone" />
        </Avatar>

        <Box
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <Text fw={700} fz={16} lh={1.2} c={TEXT} truncate>
            {name}
          </Text>

          <Text fz={12} lh={1.3} c={MUTED}>
            {memberCount !== undefined
              ? `${memberCount} ${memberCount === 1 ? "member" : "members"}`
              : "Group conversation"}
          </Text>
        </Box>
      </Group>
    </UnstyledButton>
  );
}
