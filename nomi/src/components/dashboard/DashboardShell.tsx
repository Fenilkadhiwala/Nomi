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

import {
  HouseLineIcon,
  SignOutIcon,
  ShoppingCartIcon,
  WalletIcon,
} from "@phosphor-icons/react";

import { useRouter, useSearchParams } from "next/navigation";

import { useCallback, useEffect, useRef, useState } from "react";

import { getLoggedInUser, getMyGroups, logoutUser } from "@/src/apis/api";

import { getApiError } from "@/src/lib/api/get-api-error";
import { notify } from "@/src/lib/notifications/notifications";

import type { AuthUser } from "@/src/types/types";

import { DashboardChat } from "./DashboardChat";
import { GroupSidebar } from "./GroupSidebar";
import { GroupHeader } from "./GroupHeader";
import { GroupProfileDrawer } from "./GroupProfileDrawer";

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

  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U"
  );
}

interface SidebarContentProps {
  user: AuthUser;
  onLogout: () => Promise<void>;
  loggingOut: boolean;
  canCreateHousehold: boolean;
  onCreateHousehold: () => void;
  onNavigate?: () => void;
}

function SidebarContent({
  user,
  onLogout,
  loggingOut,
  canCreateHousehold,
  onCreateHousehold,
  onNavigate,
}: SidebarContentProps) {
  return (
    <Stack h="100%" gap={0}>
      {/* Branding */}
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

      {/* Groups and navigation */}
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

          {/* Users without a Main Household can create one.
              Their private groups remain available. */}
          {canCreateHousehold && (
            <Box px={14} mt={16}>
              <UnstyledButton
                onClick={onCreateHousehold}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: 11,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                <Group gap={12} wrap="nowrap">
                  <HouseLineIcon size={21} color="#FFFFFF" />

                  <Box style={{ minWidth: 0 }}>
                    <Text c="white" fz={14} fw={600}>
                      Create Household
                    </Text>

                    <Text c={SIDEBAR_MUTED} fz={11}>
                      Set up your own home
                    </Text>
                  </Box>
                </Group>
              </UnstyledButton>
            </Box>
          )}

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

      {/* Account */}
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

  const [canCreateHousehold, setCanCreateHousehold] = useState(false);

  const groups = useGroupStore((state) => state.groups);

  const activeGroupId = useGroupStore((state) => state.activeGroupId);

  const setGroups = useGroupStore((state) => state.setGroups);

  const setActiveGroupId = useGroupStore((state) => state.setActiveGroupId);

  const clearGroups = useGroupStore((state) => state.clearGroups);

  const activeGroup =
    groups.find((group) => group.id === activeGroupId) ?? null;

  // Prevent outdated asynchronous refreshes from
  // overwriting a more recent membership refresh.
  const refreshVersionRef = useRef(0);

  const refreshMemberships = useCallback(
    async (preferredGroupId?: number | null) => {
      const version = ++refreshVersionRef.current;

      const myGroups = await getMyGroups();

      if (version !== refreshVersionRef.current) {
        return;
      }

      // Main Household is the household.
      // Private groups do not prevent household creation.
      const hasMainHousehold = myGroups.some(
        (group) => group.is_default === true,
      );

      setCanCreateHousehold(!hasMainHousehold);

      const store = useGroupStore.getState();
      const currentActiveGroupId = store.activeGroupId;

      store.setGroups(myGroups);

      const preferred =
        preferredGroupId ?? requestedGroupId ?? currentActiveGroupId;

      if (
        preferred !== null &&
        myGroups.some((group) => Number(group.id) === Number(preferred))
      ) {
        store.setActiveGroupId(Number(preferred));
      } else if (myGroups.length > 0) {
        store.setActiveGroupId(Number(myGroups[0].id));
      } else {
        store.clearGroups();
      }

      return {
        myGroups,
        hasMainHousehold,
      };
    },
    [requestedGroupId],
  );

  // Initial authentication.
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

        const result = await refreshMemberships(requestedGroupId);

        if (!active) return;

        setUser(currentUser);

        // A user without a household can still
        // access Nomi through private groups.
        if (
          result &&
          result.myGroups.length === 0 &&
          !result.hasMainHousehold
        ) {
          // No groups at all: show onboarding.
          router.replace("/onboarding");
          return;
        }
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
  }, [router, requestedGroupId, clearGroups, refreshMemberships]);

  // React to local group deletion, group exit,
  // household creation, and membership changes.
  useEffect(() => {
    const handleMembershipChange = () => {
      void refreshMemberships().catch((error) => {
        console.error("Unable to refresh memberships:", error);

        notify.error({
          title: "Unable to refresh groups",
          message: getApiError(error).message,
        });
      });
    };

    window.addEventListener("nomi:memberships-changed", handleMembershipChange);

    return () => {
      window.removeEventListener(
        "nomi:memberships-changed",
        handleMembershipChange,
      );
    };
  }, [refreshMemberships]);

  // Refresh when the dashboard becomes visible again.
  // This helps after changes in another browser tab.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshMemberships().catch((error) => {
          console.error("Visibility membership refresh failed:", error);
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshMemberships]);

  // Close profile when selected group changes.
  useEffect(() => {
    setGroupProfileOpened(false);
  }, [activeGroupId]);

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await logoutUser();

      // Invalidate any pending membership refresh.
      refreshVersionRef.current += 1;

      clearGroups();
      setCanCreateHousehold(false);
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

  const handleCreateHousehold = () => {
    setDrawerOpened(false);

    router.push("/onboarding/create-household");
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
          canCreateHousehold={canCreateHousehold}
          onCreateHousehold={handleCreateHousehold}
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
          canCreateHousehold={canCreateHousehold}
          onCreateHousehold={handleCreateHousehold}
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
          <Burger
            opened={drawerOpened}
            onClick={() => setDrawerOpened((previous) => !previous)}
            hiddenFrom="md"
            size="sm"
            mr={12}
            color={GREEN}
            aria-label="Toggle navigation"
          />

          {activeGroup && (
            <GroupHeader
              name={activeGroup.name}
              memberCount={activeGroup.member_count}
              onClick={() => setGroupProfileOpened(true)}
            />
          )}
        </Box>

        {activeGroup ? (
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <DashboardChat key={activeGroup.id} user={user} />
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
                {canCreateHousehold
                  ? "Create a household or join a private group to start using Nomi."
                  : "Select a group from the sidebar to start a conversation."}
              </Text>

              {canCreateHousehold && (
                <Button
                  color="green"
                  leftSection={<HouseLineIcon size={18} />}
                  onClick={handleCreateHousehold}
                >
                  Create Household
                </Button>
              )}
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
