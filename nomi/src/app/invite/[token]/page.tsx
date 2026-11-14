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

function getResponseError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  const response = data as {
    message?: unknown;
    error?: unknown;
  };

  if (typeof response.message === "string") {
    return response.message;
  }

  if (
    response.error &&
    typeof response.error === "object" &&
    "message" in response.error
  ) {
    const message = (response.error as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }
  }

  return fallback;
}

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

  const loginUrl = `/login?next=${encodeURIComponent(invitationPath)}`;

  const signupUrl = `/register?next=${encodeURIComponent(invitationPath)}`;

  // Load invitation details.
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

        const data: unknown = await response.json();

        if (!response.ok) {
          throw new Error(getResponseError(data, "Unable to load invitation."));
        }

        if (active) {
          setInvitation(data as InvitationDetails);
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

  // Check authentication.
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

  // Determine whether the invitation includes
  // the household's main group.
  //
  // Use isDefault rather than checking for
  // a hardcoded group name.
  const includesHousehold =
    invitation?.groups.some((group) => group.isDefault) ?? false;

  const householdGroup =
    invitation?.groups.find((group) => group.isDefault) ?? null;

  const householdName = householdGroup?.name ?? null;

  const sourceGroup =
    invitation?.groups.find((group) => group.id === invitation.groupId) ?? null;

  const sourceIsHousehold = sourceGroup?.isDefault ?? false;

  const emailMatches =
    !!invitation &&
    !!currentEmail &&
    invitation.invitedEmail.trim().toLowerCase() ===
      currentEmail.trim().toLowerCase();

  const handleAccept = async () => {
    if (!token || !invitation || accepting || accepted || !emailMatches) {
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

      const data: unknown = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          router.push(loginUrl);
          return;
        }

        throw new Error(getResponseError(data, "Unable to accept invitation."));
      }

      const result = data as AcceptanceResponse;

      setAccepted(true);

      // Open the original invited group.
      // DashboardShell will verify authorization
      // and load all accessible groups.
      router.replace(
        `/dashboard?groupId=${encodeURIComponent(String(result.groupId))}`,
      );

      router.refresh();
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
                {sourceIsHousehold ? (
                  <HouseIcon size={42} weight="duotone" />
                ) : (
                  <UsersThreeIcon size={42} weight="duotone" />
                )}
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

              {/* Membership explanation */}
              <Box
                w="100%"
                p={14}
                bg="#F4F7F3"
                style={{
                  borderRadius: 12,
                  border: "1px solid #E4EAE2",
                }}
              >
                {includesHousehold ? (
                  <Group gap={10} align="flex-start" wrap="nowrap">
                    <HouseIcon size={22} color={GREEN} weight="duotone" />

                    <Box style={{ flex: 1 }}>
                      <Text fw={650} fz={13} c={TEXT}>
                        Household invitation
                      </Text>

                      <Text fz={12} c={MUTED} mt={5} lh={1.6}>
                        Accepting this invitation will make you a member of{" "}
                        <Text span fw={600} c={TEXT}>
                          {householdName}
                        </Text>
                        . You'll be able to access its main household group and
                        any additional groups listed below.
                      </Text>
                    </Box>
                  </Group>
                ) : (
                  <Group gap={10} align="flex-start" wrap="nowrap">
                    <UsersThreeIcon size={22} color={GREEN} weight="duotone" />

                    <Box style={{ flex: 1 }}>
                      <Text fw={650} fz={13} c={TEXT}>
                        Private group invitation
                      </Text>

                      <Text fz={12} c={MUTED} mt={5} lh={1.6}>
                        You'll join only the private groups listed below. This
                        invitation doesn't include household membership. If you
                        don't belong to another household, you can create your
                        own later.
                      </Text>
                    </Box>
                  </Group>
                )}
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

                        <Box
                          style={{
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <Text fw={600} fz={13} c={TEXT}>
                            {group.name}
                          </Text>

                          <Text fz={11} c={MUTED}>
                            {group.isDefault
                              ? "Main household group"
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
                    Please sign out and sign in using {invitation.invitedEmail}{" "}
                    to accept this invitation.
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
