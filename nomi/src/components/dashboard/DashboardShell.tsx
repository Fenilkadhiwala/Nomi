"use client";

import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Burger,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  Menu,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";

import {
  ArrowRightIcon,
  CaretDownIcon,
  ChatCircleDotsIcon,
  GearSixIcon,
  HouseIcon,
  ListChecksIcon,
  SignOutIcon,
  SparkleIcon,
  WalletIcon,
} from "@phosphor-icons/react";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getLoggedInUser, logoutUser } from "@/src/apis/api";

import { getApiError } from "@/src/lib/api/get-api-error";
import { AuthUser } from "@/src/types/types";
import { notify } from "@/src/lib/notifications/notifications";
import { DashboardChat } from "./DashboardChat";

const GREEN = "#244B3C";
const BACKGROUND = "#F7F6F2";
const TEXT = "#202521";
const MUTED = "#777D75";
const BORDER = "#DDDED7";

type NavItem = {
  label: string;
  icon: typeof HouseIcon;
  description?: string;
  disabled?: boolean;
};

const navigation: NavItem[] = [
  {
    label: "AI Assistant",
    icon: ChatCircleDotsIcon,
  },
  {
    label: "Household",
    icon: HouseIcon,
    description: "Coming soon",
    disabled: true,
  },
  {
    label: "Groceries",
    icon: ListChecksIcon,
    description: "Coming soon",
    disabled: true,
  },
  {
    label: "Expenses",
    icon: WalletIcon,
    description: "Coming soon",
    disabled: true,
  },
];

function getInitials(name?: string) {
  if (!name) return "U";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

interface SidebarContentProps {
  user: AuthUser;
  onLogout: () => Promise<void>;
  loggingOut: boolean;
  onNavigate?: () => void;
}

function SidebarContent({
  user,
  onLogout,
  loggingOut,
  onNavigate,
}: SidebarContentProps) {
  return (
    <Stack h="100%" gap={0}>
      <Box px={24} pt={30} pb={32}>
        <Group gap={10}>
          <Box
            w={37}
            h={37}
            bg="rgba(255,255,255,0.12)"
            style={{
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
            }}
          >
            <SparkleIcon size={21} weight="fill" color="#FFFFFF" />
          </Box>

          <Title
            order={2}
            c="white"
            fz={27}
            fw={750}
            style={{ letterSpacing: "-1px" }}
          >
            nomi.
          </Title>
        </Group>

        <Text mt={10} fz={12} c="#B8CFC0">
          Your everyday AI companion
        </Text>
      </Box>

      <Box px={14}>
        <Text
          px={12}
          mb={12}
          fz={10}
          fw={700}
          c="#AFC6B7"
          style={{ letterSpacing: "1.5px" }}
        >
          YOUR HOME
        </Text>

        <Stack gap={5}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.label === "AI Assistant";

            return (
              <UnstyledButton
                key={item.label}
                disabled={item.disabled}
                onClick={onNavigate}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 11,
                  background: active ? "rgba(255,255,255,0.14)" : "transparent",
                  opacity: item.disabled ? 0.52 : 1,
                  cursor: item.disabled ? "not-allowed" : "pointer",
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap={13} wrap="nowrap">
                    <Icon
                      size={21}
                      weight={active ? "fill" : "regular"}
                      color="#FFFFFF"
                    />

                    <Text c="white" fz={14} fw={active ? 650 : 450}>
                      {item.label}
                    </Text>
                  </Group>

                  {item.disabled && (
                    <Text c="#B8CFC0" fz={10}>
                      Soon
                    </Text>
                  )}
                </Group>
              </UnstyledButton>
            );
          })}
        </Stack>
      </Box>

      <Box px={24} mt={34}>
        <Paper
          p="md"
          radius="lg"
          bg="rgba(255,255,255,0.09)"
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <SparkleIcon size={22} weight="fill" color="#CBE0D0" />

          <Text mt={10} c="white" fw={650} fz={13}>
            A little help, every day.
          </Text>

          <Text mt={5} c="#C1D4C7" fz={12} lh={1.6}>
            Groceries, shared expenses, and household plans—all in one place.
          </Text>
        </Paper>
      </Box>

      <Box style={{ flex: 1 }} />

      <Divider color="rgba(255,255,255,0.13)" />

      <Box p={16}>
        <Group gap={11} mb={16} wrap="nowrap">
          <Avatar size={39} radius="xl" bg="#DDECE1" c={GREEN}>
            {getInitials(user.name)}
          </Avatar>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text c="white" fw={650} fz={13} truncate>
              {user.name}
            </Text>

            <Text c="#B8CFC0" fz={11} truncate>
              {user.email}
            </Text>
          </Box>
        </Group>

        <Button
          fullWidth
          variant="subtle"
          color="gray"
          c="#E7F0E9"
          justify="flex-start"
          leftSection={<SignOutIcon size={18} />}
          loading={loggingOut}
          onClick={onLogout}
          styles={{
            root: {
              background: "rgba(255,255,255,0.08)",
            },
          }}
        >
          Sign out
        </Button>
      </Box>
    </Stack>
  );
}

export function DashboardShell() {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerOpened, setDrawerOpened] = useState(false);

  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      try {
        const currentUser = await getLoggedInUser();

        if (!active) return;

        if (!currentUser) {
          router.replace("/login");
          return;
        }

        setUser(currentUser);
      } catch (error) {
        if (!active) return;

        notify.error({
          title: "Unable to load account",
          message: getApiError(error).message,
        });
      } finally {
        if (active) {
          setCheckingAuth(false);
        }
      }
    };

    void checkAuth();

    return () => {
      active = false;
    };
  }, [router]);

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await logoutUser();

      notify.success({
        title: "Signed out",
        message: "You've been signed out successfully.",
      });

      router.replace("/login");
      router.refresh();
    } catch (error) {
      notify.error({
        title: "Unable to sign out",
        message: getApiError(error).message,
      });
    } finally {
      setLoggingOut(false);
    }
  };

  if (checkingAuth) {
    return (
      <Box
        mih="100dvh"
        bg={BACKGROUND}
        style={{
          display: "grid",
          placeItems: "center",
        }}
      >
        <Stack align="center" gap="md">
          <Loader color={GREEN} size="md" />
          <Text c={MUTED} fz={13}>
            Preparing your workspace...
          </Text>
        </Stack>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box
        mih="100dvh"
        bg={BACKGROUND}
        style={{
          display: "grid",
          placeItems: "center",
        }}
      >
        <Stack align="center" gap="md">
          <Text c={MUTED}>We couldn't load your account.</Text>

          <Button color="dark" onClick={() => window.location.reload()}>
            Try again
          </Button>

          <Button
            variant="subtle"
            color="dark"
            onClick={() => router.replace("/login")}
          >
            Go to sign in
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      h="100dvh"
      bg={BACKGROUND}
      style={{
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Desktop sidebar */}
      <Box
        w={272}
        bg={GREEN}
        visibleFrom="md"
        style={{
          flexShrink: 0,
        }}
      >
        <SidebarContent
          user={user}
          onLogout={handleLogout}
          loggingOut={loggingOut}
        />
      </Box>

      {/* Mobile sidebar */}
      <Drawer
        opened={drawerOpened}
        onClose={() => setDrawerOpened(false)}
        size={272}
        padding={0}
        withCloseButton={false}
        hiddenFrom="md"
        styles={{
          body: {
            height: "100%",
            padding: 0,
            background: GREEN,
          },
          content: {
            background: GREEN,
          },
        }}
      >
        <SidebarContent
          user={user}
          onLogout={handleLogout}
          loggingOut={loggingOut}
          onNavigate={() => setDrawerOpened(false)}
        />
      </Drawer>

      {/* Main workspace */}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Group
          h={76}
          px={{ base: 16, sm: 28 }}
          justify="space-between"
          bg="#FFFFFF"
          style={{
            flexShrink: 0,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <Group gap={14}>
            <Box hiddenFrom="md">
              <Burger
                opened={drawerOpened}
                onClick={() => setDrawerOpened((v) => !v)}
                color={GREEN}
                size="sm"
              />
            </Box>
            <Text fz={11} fw={600} c={MUTED}>
              Your household, made easier
            </Text>

            <Title order={2} fz={{ base: 18, sm: 21 }} fw={700} c={TEXT}>
              Nomi Assistant
            </Title>
          </Group>

          <Group gap={12}>
            <Badge variant="light" color="green" radius="xl">
              Your household
            </Badge>

            <Menu shadow="md" width={210} position="bottom-end">
              <Menu.Target>
                <UnstyledButton>
                  <Group gap={8}>
                    <Avatar size={37} radius="xl" bg="#E1EDE5" c={GREEN}>
                      {getInitials(user.name)}
                    </Avatar>

                    <CaretDownIcon size={13} color={MUTED} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>{user.email}</Menu.Label>

                <Menu.Item leftSection={<GearSixIcon size={16} />} disabled>
                  Account settings (soon)
                </Menu.Item>

                <Menu.Divider />

                <Menu.Item
                  color="red"
                  leftSection={<SignOutIcon size={16} />}
                  disabled={loggingOut}
                  onClick={handleLogout}
                >
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        <DashboardChat user={user} />
      </Box>
    </Box>
  );
}
