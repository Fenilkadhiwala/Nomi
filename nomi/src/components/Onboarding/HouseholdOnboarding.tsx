"use client";

import {
  Box,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import {
  ArrowRightIcon,
  EnvelopeSimpleIcon,
  HouseLineIcon,
} from "@phosphor-icons/react";

import { useRouter } from "next/navigation";

import type { AuthUser } from "@/src/types/types";

import { BG, BORDER, GREEN, MUTED, TEXT } from "@/src/utils/constants";

interface HouseholdOnboardingProps {
  user: AuthUser;
}

export function HouseholdOnboarding({ user }: HouseholdOnboardingProps) {
  const router = useRouter();

  const firstName = user.name?.trim().split(/\s+/)[0] || "there";

  return (
    <Box bg={BG} mih="100dvh">
      <Container size={800} py={{ base: 55, sm: 100 }}>
        <Stack align="center" gap={0}>
          {/* Household icon */}
          <Box
            w={72}
            h={72}
            bg="#E2EEE6"
            mb={24}
            style={{
              borderRadius: 23,
              display: "grid",
              placeItems: "center",
            }}
          >
            <HouseLineIcon size={36} color={GREEN} weight="duotone" />
          </Box>

          {/* Welcome heading */}
          <Title
            order={1}
            fz={{ base: 30, sm: 40 }}
            fw={750}
            c={TEXT}
            ta="center"
            style={{
              letterSpacing: "-1.2px",
            }}
          >
            Welcome home, {firstName}.
          </Title>

          <Text mt={14} maw={480} ta="center" c={MUTED} fz={15} lh={1.7}>
            Create your household to start organizing groceries, expenses, and
            everyday life together with Nomi.
          </Text>
        </Stack>

        {/* Create household */}
        <Stack gap={16} mt={48}>
          <Paper
            p={{ base: 22, sm: 28 }}
            radius="xl"
            bg="white"
            style={{
              border: `1px solid ${BORDER}`,
              cursor: "pointer",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease",
            }}
            onClick={() => router.push("/onboarding/create-household")}
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap={20} wrap="nowrap">
                <Box
                  w={58}
                  h={58}
                  bg="#E2EEE6"
                  style={{
                    borderRadius: 16,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <HouseLineIcon size={28} color={GREEN} weight="duotone" />
                </Box>

                <Box>
                  <Text fw={700} fz={17} c={TEXT}>
                    Create a household
                  </Text>

                  <Text mt={5} fz={13} c={MUTED} lh={1.6}>
                    Set up your home, invite roommates, and start planning
                    together.
                  </Text>
                </Box>
              </Group>

              <ArrowRightIcon
                size={23}
                color={GREEN}
                style={{ flexShrink: 0 }}
              />
            </Group>
          </Paper>
        </Stack>

        {/* Invitation information */}
        <Paper
          mt={28}
          p={{ base: 20, sm: 24 }}
          radius="xl"
          bg="#F0F5F0"
          style={{
            border: "1px solid #E0E9E0",
          }}
        >
          <Group gap={14} wrap="nowrap" align="flex-start">
            <Box
              w={42}
              h={42}
              bg="#E2EEE6"
              style={{
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <EnvelopeSimpleIcon size={22} color={GREEN} weight="duotone" />
            </Box>

            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text fw={700} fz={14} c={TEXT}>
                Already invited to a group?
              </Text>

              <Text mt={6} fz={13} c={MUTED} lh={1.7}>
                Check your email for an invitation from your roommate. Open the
                invitation link and accept it to join the groups they've invited
                you to.
              </Text>

              <Text mt={10} fz={12} fw={600} c={GREEN}>
                Make sure you're signed in with the invited email address.
              </Text>
            </Box>
          </Group>
        </Paper>

        {/* Privacy information */}
        <Text mt={36} ta="center" c={MUTED} fz={12} lh={1.6}>
          Your household details and conversations are only accessible to
          authorized members.
        </Text>
      </Container>
    </Box>
  );
}
