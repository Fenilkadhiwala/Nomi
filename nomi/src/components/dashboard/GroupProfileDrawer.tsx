"use client";

import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
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
  ArrowLeftIcon,
  CameraIcon,
  PencilSimpleIcon,
  SignOutIcon,
  TrashIcon,
  UserPlusIcon,
  UsersThreeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { useEffect, useState } from "react";

import { getGroupMembers, inviteGroupMember } from "@/src/apis/api";

import { AddMemberModal } from "./AddMemberModal";

import type { AddMemberInvitationOptions } from "./AddMemberModal";

import { notify } from "@/src/lib/notifications/notifications";
import { getApiError } from "@/src/lib/api/get-api-error";

import { GREEN, MUTED, TEXT } from "@/src/utils/constants";

import type { GroupMember } from "@/src/types/types";

interface GroupProfileDrawerProps {
  opened: boolean;
  onClose: () => void;
  group: {
    id: number;
    name: string;
    is_default: boolean;
    member_count?: number;
    image_url?: string | null;
  } | null;
  currentUserId: number;
}

function getInitials(name: string) {
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

function formatRole(role: GroupMember["role"]) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export function GroupProfileDrawer({
  opened,
  onClose,
  group,
  currentUserId,
}: GroupProfileDrawerProps) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addMemberOpened, setAddMemberOpened] = useState(false);

  const [inviting, setInviting] = useState(false);

  const groupId = group?.id;

  useEffect(() => {
    if (!opened || groupId == null) {
      setMembers([]);
      setError(null);
      setLoading(false);
      setAddMemberOpened(false);
      return;
    }

    let active = true;

    const loadMembers = async () => {
      setLoading(true);
      setError(null);
      setMembers([]);

      try {
        const result = await getGroupMembers(groupId);

        if (active) {
          setMembers(result);
        }
      } catch (err) {
        if (active) {
          setError(getApiError(err).message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadMembers();

    return () => {
      active = false;
    };
  }, [opened, groupId]);

  if (!group) return null;

  const currentMember = members.find(
    (member) => Number(member.user_id) === currentUserId,
  );

  const canManage =
    currentMember?.role === "owner" || currentMember?.role === "admin";

  const isOwner = currentMember?.role === "owner";

  const memberCount =
    !loading && !error ? members.length : (group.member_count ?? 0);

  const handleInvite = async (options: AddMemberInvitationOptions) => {
    if (!group || inviting) return;

    setInviting(true);

    try {
      await inviteGroupMember(group.id, options.email, {
        includeOtherGroups: group.is_default
          ? options.includeOtherGroups
          : false,
        includeHomeCircle: !group.is_default
          ? options.includeHomeCircle
          : false,
      });

      notify.success({
        title: "Invitation sent!",
        message: `An invitation has been sent to ${options.email}.`,
      });

      setAddMemberOpened(false);
    } catch (error) {
      const apiError = getApiError(error);

      switch (apiError.code) {
        case "INVITATION_EXISTS":
          notify.warning({
            title: "Invitation already pending",
            message:
              `An invitation has already been sent to ${options.email}. ` +
              "Ask them to check their inbox.",
          });
          break;

        case "ALREADY_MEMBER":
          notify.warning({
            title: "Already a member",
            message: "This person is already a member of the selected group.",
          });
          break;

        case "FORBIDDEN":
          notify.error({
            title: "Permission denied",
            message:
              "You don't have permission to invite members to these groups.",
          });
          break;

        case "RATE_LIMITED":
          notify.warning({
            title: "Too many invitations",
            message: "Please wait a while before sending another invitation.",
          });
          break;

        case "EMAIL_SEND_FAILED":
          notify.error({
            title: "Email delivery failed",
            message: "We couldn't send the invitation email. Please try again.",
          });
          break;

        default:
          notify.error({
            title: "Unable to send invitation",
            message: apiError.message,
          });
      }
    } finally {
      setInviting(false);
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="bottom"
        size="100dvh"
        padding={0}
        withCloseButton={false}
        withinPortal
        zIndex={300}
        overlayProps={{
          backgroundOpacity: 0.2,
        }}
        transitionProps={{
          transition: "slide-up",
          duration: 300,
          timingFunction: "ease",
        }}
        styles={{
          content: {
            height: "100dvh",
            maxHeight: "100dvh",
            backgroundColor: "#F7F6F2",
            borderRadius: 0,
          },
          body: {
            height: "100%",
            padding: 0,
            overflow: "hidden",
          },
        }}
      >
        <Box
          h="100%"
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Profile navigation bar */}
          <Box
            bg="#FFFFFF"
            px={{ base: 16, sm: 32 }}
            h={76}
            style={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              borderBottom: "1px solid #E5E8E2",
            }}
          >
            <Group gap={14}>
              <ActionIcon
                variant="subtle"
                color="dark"
                radius="xl"
                size={40}
                onClick={onClose}
                aria-label="Back to conversation"
              >
                <ArrowLeftIcon size={22} />
              </ActionIcon>

              <Box>
                <Text fw={700} fz={17} c={TEXT}>
                  Group info
                </Text>

                <Text fz={11} c={MUTED}>
                  {group.name}
                </Text>
              </Box>
            </Group>
          </Box>

          {/* Profile content */}
          <ScrollArea
            style={{
              flex: 1,
              minHeight: 0,
            }}
            scrollbarSize={6}
          >
            <Box
              maw={760}
              mx="auto"
              px={{ base: 16, sm: 24 }}
              py={{ base: 24, sm: 36 }}
            >
              {/* Group information */}
              <Box
                bg="#FFFFFF"
                px={24}
                py={36}
                mb={18}
                style={{
                  borderRadius: 20,
                  border: "1px solid #E7EAE5",
                }}
              >
                <Stack align="center" gap={10}>
                  <Box pos="relative">
                    <Avatar
                      src={group.image_url || undefined}
                      size={116}
                      radius="xl"
                      bg="#E4EEE7"
                      c={GREEN}
                      style={{
                        border: "3px solid #FFFFFF",
                        boxShadow:
                          "0 0 0 1px #DCE6DE, 0 5px 20px rgba(0,0,0,0.05)",
                      }}
                    >
                      <UsersThreeIcon size={50} weight="duotone" />
                    </Avatar>

                    <ActionIcon
                      disabled
                      radius="xl"
                      size={32}
                      style={{
                        position: "absolute",
                        right: 0,
                        bottom: 0,
                      }}
                      aria-label="Change group photo coming soon"
                    >
                      <CameraIcon size={17} />
                    </ActionIcon>
                  </Box>

                  <Title order={2} fz={25} fw={750} c={TEXT} ta="center" mt={8}>
                    {group.name}
                  </Title>

                  <Text fz={13} c={MUTED}>
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </Text>

                  <Group mt={18} gap={12}>
                    <Button
                      leftSection={<UserPlusIcon size={19} />}
                      color="green"
                      variant="light"
                      radius="xl"
                      disabled={!canManage || loading || !!error}
                      onClick={() => setAddMemberOpened(true)}
                    >
                      Add member
                    </Button>

                    <Button
                      leftSection={<PencilSimpleIcon size={19} />}
                      variant="default"
                      radius="xl"
                      disabled
                    >
                      Edit group
                    </Button>
                  </Group>

                  <Text fz={11} c={MUTED} ta="center">
                    Additional group management features are coming soon.
                  </Text>
                </Stack>
              </Box>

              {/* Members */}
              <Box
                bg="#FFFFFF"
                p={{ base: 20, sm: 26 }}
                mb={18}
                style={{
                  borderRadius: 20,
                  border: "1px solid #E7EAE5",
                }}
              >
                <Group justify="space-between" mb={20}>
                  <Text fw={700} fz={15} c={TEXT}>
                    Members
                  </Text>

                  <Text fz={12} c={MUTED}>
                    {memberCount}
                  </Text>
                </Group>

                {loading ? (
                  <Stack align="center" py={30} gap={12}>
                    <Loader size="sm" color={GREEN} />

                    <Text fz={12} c={MUTED}>
                      Loading members...
                    </Text>
                  </Stack>
                ) : error ? (
                  <Alert color="red" icon={<WarningCircleIcon size={18} />}>
                    {error}
                  </Alert>
                ) : members.length === 0 ? (
                  <Text fz={13} c={MUTED} py={14}>
                    No members found.
                  </Text>
                ) : (
                  <Stack gap={0}>
                    {members.map((member, index) => {
                      const isMe = Number(member.user_id) === currentUserId;

                      return (
                        <Box key={member.user_id}>
                          <Group py={14} gap={14} wrap="nowrap">
                            <Avatar
                              size={44}
                              radius="xl"
                              bg="#E9EEE9"
                              c={GREEN}
                            >
                              {getInitials(member.name)}
                            </Avatar>

                            <Box
                              style={{
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <Text fw={600} fz={14} c={TEXT} truncate>
                                {member.name}
                                {isMe ? " (You)" : ""}
                              </Text>

                              <Text fz={12} c={MUTED} truncate>
                                {member.email}
                              </Text>
                            </Box>

                            {member.role !== "member" && (
                              <Badge
                                size="sm"
                                radius="sm"
                                variant="light"
                                color="green"
                                tt="capitalize"
                              >
                                {formatRole(member.role)}
                              </Badge>
                            )}
                          </Group>

                          {index < members.length - 1 && (
                            <Divider color="#F0F1ED" />
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>

              {/* Group settings */}
              <Box
                bg="#FFFFFF"
                p={{ base: 20, sm: 26 }}
                style={{
                  borderRadius: 20,
                  border: "1px solid #E7EAE5",
                }}
              >
                <Text fw={700} fz={15} c={TEXT} mb={16}>
                  Group settings
                </Text>

                <Stack gap={6}>
                  <UnstyledButton
                    disabled
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "13px 8px",
                      opacity: 0.5,
                      borderRadius: 10,
                    }}
                  >
                    <SignOutIcon size={21} color="#B45353" />

                    <Text fz={14} c="#B45353">
                      Exit group
                    </Text>
                  </UnstyledButton>

                  {isOwner && (
                    <>
                      <Divider color="#F0F1ED" />

                      <UnstyledButton
                        disabled
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "13px 8px",
                          opacity: 0.5,
                          borderRadius: 10,
                        }}
                      >
                        <TrashIcon size={21} color="#B45353" />

                        <Text fz={14} c="#B45353">
                          Delete group
                        </Text>
                      </UnstyledButton>
                    </>
                  )}
                </Stack>
              </Box>
            </Box>
          </ScrollArea>
        </Box>
      </Drawer>

      {/* Invitation modal */}
      <AddMemberModal
        opened={opened && addMemberOpened}
        onClose={() => setAddMemberOpened(false)}
        groupName={group.name}
        isDefaultGroup={group.is_default}
        onInvite={handleInvite}
        loading={inviting}
      />
    </>
  );
}
