"use client";

import {
  Avatar,
  Box,
  Burger,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";

import { GroupProfileDrawer } from "./GroupProfileDrawer";

import {
  SignOutIcon,
  ShoppingCartIcon,
  WalletIcon,
} from "@phosphor-icons/react";

import { useRouter, useSearchParams } from "next/navigation";

import { useEffect, useState } from "react";

import {
  getLoggedInUser,
  getMyGroups,
  getMyHouseholds,
  logoutUser,
} from "@/src/apis/api";

import { getApiError } from "@/src/lib/api/get-api-error";
import { notify } from "@/src/lib/notifications/notifications";

import type { AuthUser } from "@/src/types/types";

import { DashboardChat } from "./DashboardChat";
import { GroupSidebar } from "./GroupSidebar";
import { GroupHeader } from "./GroupHeader";

import { useGroupStore } from "@/src/store/useGroupStore";

import {
  BACKGROUND,
  GREEN,
  MUTED,
  SIDEBAR_MUTED,
  TEXT,
} from "@/src/utils/constants";

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
      {/* Nomi branding */}
      <Box px={24} pt={28} pb={24}>
        <Title
          order={2}
          c="white"
          fz={27}
          fw={750}
          style={{
            letterSpacing: "-1px",
          }}
        >
          nomi.
        </Title>

        <Text mt={10} fz={12} c={SIDEBAR_MUTED}>
          Your everyday AI companion
        </Text>
      </Box>

      <Divider color="rgba(255,255,255,0.12)" />

      {/* Sidebar navigation */}
      <ScrollArea
        style={{
          flex: 1,
          minHeight: 0,
        }}
        type="auto"
        scrollbarSize={5}
      >
        <Box pb={24}>
          <GroupSidebar onGroupSelect={onNavigate} />

          {/* Other navigation */}
          <Box px={14} mt={25}>
            <Divider color="rgba(255,255,255,0.12)" mb={20} />

            <Stack gap={5}>
              <UnstyledButton
                disabled
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 11,
                  opacity: 0.55,
                  cursor: "not-allowed",
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap={13} wrap="nowrap">
                    <ShoppingCartIcon size={21} color="#FFFFFF" />

                    <Text c="white" fz={14} fw={500}>
                      Your Cart
                    </Text>
                  </Group>

                  <Text c={SIDEBAR_MUTED} fz={10}>
                    Soon
                  </Text>
                </Group>
              </UnstyledButton>

              <UnstyledButton
                disabled
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 11,
                  opacity: 0.55,
                  cursor: "not-allowed",
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap={13} wrap="nowrap">
                    <WalletIcon size={21} color="#FFFFFF" />

                    <Text c="white" fz={14} fw={500}>
                      Expenses
                    </Text>
                  </Group>

                  <Text c={SIDEBAR_MUTED} fz={10}>
                    Soon
                  </Text>
                </Group>
              </UnstyledButton>
            </Stack>
          </Box>
        </Box>
      </ScrollArea>

      {/* Account section */}
      <Divider color="rgba(255,255,255,0.13)" />

      <Box p={16}>
        <Group gap={11} mb={16} wrap="nowrap">
          <Avatar size={39} radius="xl" bg="#DDECE1" c={GREEN}>
            {getInitials(user.name)}
          </Avatar>

          <Box
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <Text c="white" fw={650} fz={13} truncate>
              {user.name}
            </Text>

            <Text c={SIDEBAR_MUTED} fz={11} truncate>
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
  const searchParams = useSearchParams();

  const requestedGroupIdParam = searchParams.get("groupId");

  const requestedGroupId =
    requestedGroupIdParam &&
    /^\d+$/.test(requestedGroupIdParam) &&
    Number.isSafeInteger(Number(requestedGroupIdParam)) &&
    Number(requestedGroupIdParam) > 0
      ? Number(requestedGroupIdParam)
      : null;

  const [groupProfileOpened, setGroupProfileOpened] = useState(false);

  const [user, setUser] = useState<AuthUser | null>(null);

  const [checkingAuth, setCheckingAuth] = useState(true);

  const [loggingOut, setLoggingOut] = useState(false);

  const [drawerOpened, setDrawerOpened] = useState(false);

  const groups = useGroupStore((state) => state.groups);

  const activeGroupId = useGroupStore((state) => state.activeGroupId);

  const setGroups = useGroupStore((state) => state.setGroups);

  const setActiveGroupId = useGroupStore((state) => state.setActiveGroupId);

  const clearGroups = useGroupStore((state) => state.clearGroups);

  const activeGroup =
    groups.find((group) => group.id === activeGroupId) ?? null;

  // Authenticate and load authorized groups.
  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      setCheckingAuth(true);

      try {
        const currentUser = await getLoggedInUser();

        if (!active) return;

        if (!currentUser) {
          clearGroups();
          router.replace("/login");
          return;
        }

        // Load groups directly from the backend.
        // The /groups endpoint must return only
        // groups this user is authorized to access.
        const myGroups = await getMyGroups();

        if (!active) return;

        if (myGroups.length > 0) {
          setGroups(myGroups);

          // Prefer the group specified by the
          // invitation redirect when authorized.
          if (
            requestedGroupId !== null &&
            myGroups.some((group) => group.id === requestedGroupId)
          ) {
            setActiveGroupId(requestedGroupId);
          }

          setUser(currentUser);
          return;
        }

        // No groups: check household membership
        // before deciding whether onboarding
        // is appropriate.
        const households = await getMyHouseholds();

        if (!active) return;

        clearGroups();

        if (households.length === 0) {
          router.replace("/onboarding");
          return;
        }

        // A household member with no groups
        // should not be forced into onboarding.
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
  }, [router, requestedGroupId, setGroups, setActiveGroupId, clearGroups]);

  // Close the profile drawer when the group changes.
  useEffect(() => {
    setGroupProfileOpened(false);
  }, [activeGroupId]);

  // Logout
  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await logoutUser();

      clearGroups();
      setUser(null);

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

  // Loading screen
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

  // Authentication error
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
        {/* Full-width white header */}
        <Box
          component="header"
          w="100%"
          h={84}
          bg="#FFFFFF"
          px={{
            base: 14,
            sm: 24,
          }}
          style={{
            backgroundColor: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            borderBottom: "1px solid #E5E8E2",
            boxSizing: "border-box",
          }}
        >
          {/* Mobile menu button */}
          <Burger
            opened={drawerOpened}
            onClick={() => setDrawerOpened((previous) => !previous)}
            hiddenFrom="md"
            size="sm"
            mr={12}
            color={GREEN}
            aria-label="Toggle navigation"
          />

          {/* Active group information */}
          {activeGroup && (
            <GroupHeader
              name={activeGroup.name}
              memberCount={activeGroup.member_count}
              onClick={() => setGroupProfileOpened(true)}
            />
          )}
        </Box>

        {/* Selected group chat */}
        {activeGroup ? (
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <DashboardChat user={user} />
          </Box>
        ) : (
          <Box
            style={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              padding: 24,
            }}
          >
            <Stack align="center" gap={12}>
              <Title order={3} c={TEXT}>
                Welcome to Nomi
              </Title>

              <Text c={MUTED} fz={13} ta="center">
                Select a group from the sidebar to start a conversation.
              </Text>
            </Stack>
          </Box>
        )}
      </Box>

      <GroupProfileDrawer
        opened={groupProfileOpened && !!activeGroup}
        onClose={() => setGroupProfileOpened(false)}
        group={activeGroup}
        currentUserId={Number(user.id)}
      />
    </Box>
  );
}
