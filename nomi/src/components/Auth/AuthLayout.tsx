"use client";

import {
  Box,
  Container,
  Flex,
  Group,
  Stack,
  Text,
  Title,
  ThemeIcon,
} from "@mantine/core";
import { ChatCircleDotsIcon, SparkleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

const GREEN = "#244B3C";
const IVORY = "#F7F6F2";

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <Flex direction={{ base: "column", lg: "row" }} mih="100dvh" bg={IVORY}>
      {/* Desktop branding */}
      <Box visibleFrom="lg" w="50%" bg={GREEN} c="white">
        <Stack
          mih="100dvh"
          justify="space-between"
          p={{ base: 32, lg: 48, xl: 72 }}
          gap={60}
        >
          <Text fz={36} fw={800} lh={1} style={{ letterSpacing: "-2px" }}>
            nomi.
          </Text>

          <Stack gap={28} maw={520}>
            <ThemeIcon size={60} radius="xl" variant="light" color="gray">
              <SparkleIcon size={30} weight="fill" color="white" />
            </ThemeIcon>

            <Title
              order={1}
              fz={{ base: 40, lg: 48, xl: 60 }}
              lh={1.12}
              fw={700}
              style={{ letterSpacing: "-2px" }}
            >
              Meet Nomi.
              <br />
              Your household,
              <br />
              powered by AI.
            </Title>

            <Text size="lg" c="#D6E3DA" maw={440} lh={1.7}>
              Just tell Nomi what you need. From shared groceries to everyday
              household tasks, your AI assistant helps take care of the details.
            </Text>

            <Group gap="sm" mt={16} wrap="nowrap">
              <ChatCircleDotsIcon size={22} color="#D6E3DA" />

              <Text size="sm" c="#E8F0EA">
                Less organizing. More living.
              </Text>
            </Group>
          </Stack>

          <Text size="xs" c="#B5CCBE">
            © {new Date().getFullYear()} Nomi
          </Text>
        </Stack>
      </Box>

      {/* Login / Registration panel */}
      <Box
        w={{ base: "100%", lg: "50%" }}
        mih="100dvh"
        bg={IVORY}
        px={{ base: 24, sm: 48, lg: 64, xl: 96 }}
        py={{ base: 32, sm: 48, lg: 56 }}
      >
        <Flex
          direction="column"
          justify="center"
          mih={{
            base: "calc(100dvh - 64px)",
            sm: "calc(100dvh - 96px)",
            lg: "calc(100dvh - 112px)",
          }}
        >
          <Group
            justify="space-between"
            mb={{ base: 56, sm: 72 }}
            hiddenFrom="lg"
          >
            <Text
              fz={30}
              fw={800}
              c={GREEN}
              style={{ letterSpacing: "-1.5px" }}
            >
              nomi.
            </Text>

            <Text size="xs" c="dimmed">
              Your AI household assistant
            </Text>
          </Group>

          <Container size={480} w="100%" px={0}>
            {children}
          </Container>

          <Text hiddenFrom="lg" ta="center" c="dimmed" size="xs" mt={64}>
            © {new Date().getFullYear()} Nomi
          </Text>
        </Flex>
      </Box>
    </Flex>
  );
}
