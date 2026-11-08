"use client";

import {
  Avatar,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import {
  ArrowRightIcon,
  CheckCircleIcon,
  HouseIcon,
  SignInIcon,
  UsersThreeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getLoggedInUser } from "@/src/apis/api";
import { GREEN, MUTED, TEXT } from "@/src/utils/constants";

interface InvitedGroup {
  id: number;
  name: string;
  isDefault: boolean;
}

interface InvitationDetails {
  groupId: number;
  groupName: string;
  inviterName: string;
  invitedEmail: string;
  includesHomeCircle: boolean;
  includesOtherGroups: boolean;
  groups: InvitedGroup[];
  expiresAt: string;
}

interface AcceptanceResponse {
  message: string;
  householdId: number;
  groupId: number;
  includesHomeCircle: boolean;
  joinedGroups: {
    groupId: number;
    groupName: string;
    isDefault: boolean;
  }[];
}

type AuthState = "checking" | "authenticated" | "unauthenticated";

export default function InvitationPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();

  const token = params.token;

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [authState, setAuthState] = useState<AuthState>("checking");

  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const [accepted, setAccepted] = useState(false);

  const invitationPath = `/invite/${encodeURIComponent(token)}`;

  // Preserve the invitation URL through login/signup.
  const loginUrl = `/login?next=${encodeURIComponent(invitationPath)}`;

  const signupUrl = `/register?next=${encodeURIComponent(invitationPath)}`;

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link.");
      setLoading(false);
      return;
    }

    let active = true;

    const loadInvitation = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/invitations/${encodeURIComponent(token)}`,
          {
            cache: "no-store",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load invitation.");
        }

        if (active) {
          setInvitation(data);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Something went wrong.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadInvitation();

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;

    const checkAuthentication = async () => {
      setAuthState("checking");

      try {
        const user = await getLoggedInUser();

        if (!active) return;

        if (user) {
          setCurrentEmail(user.email);
          setAuthState("authenticated");
        } else {
          setCurrentEmail(null);
          setAuthState("unauthenticated");
        }
      } catch {
        if (active) {
          setCurrentEmail(null);
          setAuthState("unauthenticated");
        }
      }
    };

    void checkAuthentication();

    return () => {
      active = false;
    };
  }, []);

  const emailMatches =
    !!invitation &&
    !!currentEmail &&
    invitation.invitedEmail.trim().toLowerCase() ===
      currentEmail.trim().toLowerCase();

  const handleAccept = async () => {
    if (!token || !invitation || accepting || !emailMatches) {
      return;
    }

    setAccepting(true);
    setAcceptError(null);

    try {
      const response = await fetch(
        `/api/invitations/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          router.push(loginUrl);
          return;
        }

        throw new Error(data.message || "Unable to accept invitation.");
      }

      const result = data as AcceptanceResponse;

      setAccepted(true);

      // Give the user brief success feedback before
      // navigating to the invited group.
      router.replace(
        `/dashboard?groupId=${encodeURIComponent(String(result.groupId))}`,
      );
    } catch (err) {
      setAcceptError(
        err instanceof Error ? err.message : "Unable to accept invitation.",
      );
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Box
      mih="100dvh"
      bg="#F7F6F2"
      px={16}
      py={40}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Stack w="100%" maw={480} gap={24}>
        <Title order={2} ta="center" c={GREEN} fw={800} fz={32}>
          nomi.
        </Title>

        <Paper
          radius={22}
          p={{ base: 24, sm: 38 }}
          bg="#FFFFFF"
          style={{
            border: "1px solid #E5E8E2",
          }}
        >
          {loading ? (
            <Stack align="center" py={40} gap={16}>
              <Loader color={GREEN} />

              <Text c={MUTED} fz={13}>
                Checking invitation...
              </Text>
            </Stack>
          ) : error ? (
            <Stack align="center" gap={18} py={16}>
              <WarningCircleIcon size={48} color="#B45353" />

              <Title order={3} c={TEXT} ta="center">
                Invitation unavailable
              </Title>

              <Text c={MUTED} ta="center" fz={14}>
                {error}
              </Text>

              <Button variant="default" onClick={() => router.push("/login")}>
                Go to sign in
              </Button>
            </Stack>
          ) : invitation ? (
            <Stack align="center" gap={14}>
              <Avatar size={92} radius="xl" bg="#E4EEE7" c={GREEN}>
                <UsersThreeIcon size={42} weight="duotone" />
              </Avatar>

              <Text c={MUTED} fz={13} ta="center">
                You've been invited to join
              </Text>

              <Title order={2} fz={25} c={TEXT} ta="center">
                {invitation.groupName}
              </Title>

              <Text c={MUTED} fz={14} ta="center">
                {invitation.inviterName} invited you to collaborate on Nomi.
              </Text>

              {/* Invitation recipient */}
              <Box
                w="100%"
                bg="#F4F7F3"
                p={16}
                mt={10}
                style={{
                  borderRadius: 12,
                }}
              >
                <Text fz={12} c={MUTED} ta="center">
                  Invitation sent to
                </Text>

                <Text fw={600} fz={14} c={TEXT} ta="center" mt={4}>
                  {invitation.invitedEmail}
                </Text>
              </Box>

              {/* Selected groups */}
              <Box w="100%" mt={10}>
                <Text fw={700} fz={14} c={TEXT} mb={12}>
                  Groups you'll join
                </Text>

                <Stack gap={10}>
                  {invitation.groups.map((group) => (
                    <Paper
                      key={group.id}
                      radius="lg"
                      p={13}
                      bg="#F7F9F6"
                      style={{
                        border: "1px solid #E7EAE5",
                      }}
                    >
                      <Group gap={12} wrap="nowrap">
                        <Avatar size={40} radius="xl" bg="#E4EEE7" c={GREEN}>
                          {group.isDefault ? (
                            <HouseIcon size={21} />
                          ) : (
                            <UsersThreeIcon size={21} />
                          )}
                        </Avatar>

                        <Box style={{ flex: 1 }}>
                          <Text fw={600} fz={13} c={TEXT}>
                            {group.name}
                          </Text>

                          <Text fz={11} c={MUTED}>
                            {group.isDefault
                              ? "Household membership"
                              : "Private group"}
                          </Text>
                        </Box>

                        <CheckCircleIcon size={20} color={GREEN} />
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </Box>

              <Divider w="100%" my={8} color="#E7EAE5" />

              {/* Authentication state */}
              {authState === "checking" ? (
                <Stack align="center" gap={10} py={12}>
                  <Loader size="sm" color={GREEN} />

                  <Text fz={12} c={MUTED}>
                    Checking your account...
                  </Text>
                </Stack>
              ) : authState === "unauthenticated" ? (
                <Stack w="100%" gap={12}>
                  <Text fz={12} c={MUTED} ta="center">
                    Sign in or create an account using the invited email
                    address.
                  </Text>

                  <Button
                    fullWidth
                    size="md"
                    radius="lg"
                    color="green"
                    rightSection={<SignInIcon size={18} />}
                    onClick={() => router.push(loginUrl)}
                  >
                    Sign in to accept
                  </Button>

                  <Button
                    fullWidth
                    variant="default"
                    radius="lg"
                    onClick={() => router.push(signupUrl)}
                  >
                    Create an account
                  </Button>
                </Stack>
              ) : !emailMatches ? (
                <Stack w="100%" gap={12}>
                  <Text fz={13} fw={600} c="#B45353" ta="center">
                    You're signed in with a different email.
                  </Text>

                  <Text fz={12} c={MUTED} ta="center">
                    Current account: {currentEmail}
                  </Text>

                  <Text fz={12} c={MUTED} ta="center">
                    Please sign out and sign in using
                    {` ${invitation.invitedEmail}`} to accept this invitation.
                  </Text>

                  <Button
                    fullWidth
                    variant="default"
                    onClick={() => router.push(loginUrl)}
                  >
                    Switch account
                  </Button>
                </Stack>
              ) : accepted ? (
                <Stack align="center" gap={12}>
                  <CheckCircleIcon size={44} color={GREEN} />

                  <Title order={3} c={TEXT} ta="center">
                    Invitation accepted!
                  </Title>

                  <Text c={MUTED} fz={13} ta="center">
                    Opening your group...
                  </Text>
                </Stack>
              ) : (
                <Stack w="100%" gap={12}>
                  <Text fz={12} c={MUTED} ta="center">
                    Signed in as {currentEmail}
                  </Text>

                  {acceptError && (
                    <Text fz={12} c="#B45353" ta="center">
                      {acceptError}
                    </Text>
                  )}

                  <Button
                    fullWidth
                    size="md"
                    radius="lg"
                    color="green"
                    loading={accepting}
                    disabled={accepting}
                    rightSection={<ArrowRightIcon size={18} />}
                    onClick={handleAccept}
                  >
                    Accept invitation
                  </Button>
                </Stack>
              )}
            </Stack>
          ) : null}
        </Paper>
      </Stack>
    </Box>
  );
}
