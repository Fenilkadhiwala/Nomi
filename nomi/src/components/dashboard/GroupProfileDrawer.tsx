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
  Modal,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
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

import {
  addExistingGroupMembers,
  getGroupMembers,
  getMyGroups,
  getMyHouseholds,
  inviteGroupMember,
} from "@/src/apis/api";

import { useGroupStore } from "@/src/store/useGroupStore";
import { AddMemberModal } from "./AddMemberModal";

import type {
  AddExistingMemberOptions,
  AddMemberInvitationOptions,
} from "./AddMemberModal";

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

  const [renameOpened, setRenameOpened] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deleteOpened, setDeleteOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const [exitOpened, setExitOpened] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState<string | null>(null);

  const groupId = group?.id;

  useEffect(() => {
    if (!opened || groupId == null) {
      setMembers([]);
      setError(null);
      setLoading(false);
      setAddMemberOpened(false);
      setRenameOpened(false);
      setExitOpened(false);
      setDeleteOpened(false);
      setDeleteConfirmation("");
      setNewOwnerId(null);
      return;
    }

    let active = true;

    const loadMembers = async () => {
      setLoading(true);
      setError(null);
      setMembers([]);

      try {
        const result = await getGroupMembers(groupId);

        if (active) setMembers(result);
      } catch (err) {
        if (active) {
          setError(getApiError(err).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadMembers();

    return () => {
      active = false;
    };
  }, [opened, groupId]);

  useEffect(() => {
    if (group) {
      setRenameValue(group.name);
    }
  }, [group?.id, group?.name]);

  if (!group) return null;

  const currentMember = members.find(
    (member) => Number(member.user_id) === Number(currentUserId),
  );

  const canManage =
    currentMember?.role === "owner" || currentMember?.role === "admin";

  const isOwner = currentMember?.role === "owner";

  const memberCount =
    !loading && !error ? members.length : (group.member_count ?? 0);

  const otherMembers = members.filter(
    (member) => Number(member.user_id) !== Number(currentUserId),
  );

  const isLastMember = members.length === 1;

  const needsOwnershipTransfer = isOwner && otherMembers.length > 0;

  const ownerOptions = otherMembers.map((member) => ({
    value: String(member.user_id),
    label: `${member.name} (${member.email})`,
  }));

  const refreshGroups = async () => {
    const refreshed = await getMyGroups();
    useGroupStore.getState().setGroups(refreshed);
    return refreshed;
  };

  const refreshMembers = async () => {
    const result = await getGroupMembers(group.id);
    setMembers(result);
    setError(null);
    return result;
  };

  const handleAddExistingMembers = async (
    memberIds: number[],
    options: AddExistingMemberOptions = {},
  ) => {
    if (!canManage || inviting || memberIds.length === 0) {
      return;
    }

    setInviting(true);

    try {
      await addExistingGroupMembers(group.id, memberIds, options);

      // Refresh both the member list and the
      // sidebar group counts.
      await Promise.all([refreshMembers(), refreshGroups()]);

      setAddMemberOpened(false);

      window.dispatchEvent(new Event("nomi:memberships-changed"));

      notify.success({
        title: "Members added",
        message: `${memberIds.length} member${
          memberIds.length === 1 ? "" : "s"
        } added successfully.`,
      });
    } catch (err) {
      notify.error({
        title: "Unable to add members",
        message: getApiError(err).message,
      });
    } finally {
      setInviting(false);
    }
  };

  const handleInvite = async (options: AddMemberInvitationOptions) => {
    if (!canManage || inviting) return;

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
        title: "Invitation sent",
        message: `An invitation was sent to ${options.email}.`,
      });

      setAddMemberOpened(false);
    } catch (err) {
      const apiError = getApiError(err);

      if (apiError.code === "INVITATION_EXISTS") {
        notify.warning({
          title: "Invitation already pending",
          message: "An invitation is already pending for this email.",
        });
      } else if (apiError.code === "ALREADY_MEMBER") {
        notify.warning({
          title: "Already a member",
          message: "This person already belongs to this group.",
        });
      } else {
        notify.error({
          title: "Unable to send invitation",
          message: apiError.message,
        });
      }
    } finally {
      setInviting(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!isOwner || deleting) return;

    if (group.is_default && deleteConfirmation.trim() !== "DELETE") {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(`/api/groups/${group.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? body?.message ?? "Unable to delete group.",
        );
      }

      const [refreshedGroups, households] = await Promise.all([
        getMyGroups(),
        getMyHouseholds(),
      ]);

      const store = useGroupStore.getState();
      const previousActiveId = store.activeGroupId;

      store.setGroups(refreshedGroups);

      if (
        previousActiveId !== null &&
        refreshedGroups.some(
          (item) => Number(item.id) === Number(previousActiveId),
        )
      ) {
        store.setActiveGroupId(Number(previousActiveId));
      } else if (refreshedGroups.length > 0) {
        store.setActiveGroupId(Number(refreshedGroups[0].id));
      } else {
        store.clearGroups();
      }

      setDeleteOpened(false);
      setDeleteConfirmation("");
      onClose();

      window.dispatchEvent(new Event("nomi:memberships-changed"));

      notify.success({
        title: group.is_default ? "Household deleted" : "Group deleted",
        message: group.is_default
          ? households.length === 0
            ? "Your household was deleted. You can create a new one."
            : "Your household was deleted."
          : `${group.name} has been permanently deleted.`,
      });
    } catch (err) {
      notify.error({
        title: "Unable to delete group",
        message: getApiError(err).message,
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleRename = async () => {
    if (!isOwner || renaming) return;

    const name = renameValue.trim();

    if (name.length < 2 || name.length > 100) {
      notify.warning({
        title: "Invalid group name",
        message: "Group name must contain 2 to 100 characters.",
      });
      return;
    }

    if (name === group.name) {
      setRenameOpened(false);
      return;
    }

    setRenaming(true);

    try {
      const response = await fetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? body?.message ?? "Unable to rename group.",
        );
      }

      await refreshGroups();
      setRenameOpened(false);

      notify.success({
        title: "Group updated",
        message: `Group renamed to ${name}.`,
      });
    } catch (err) {
      notify.error({
        title: "Unable to rename group",
        message: getApiError(err).message,
      });
    } finally {
      setRenaming(false);
    }
  };

  const openExitModal = () => {
    if (loading || error || !currentMember) return;

    setNewOwnerId(null);
    setExitOpened(true);
  };

  const handleExitGroup = async () => {
    if (exiting || loading || !currentMember) {
      return;
    }

    if (needsOwnershipTransfer && !newOwnerId) {
      notify.warning({
        title: "Select a new owner",
        message: "Choose a member to become the group owner.",
      });
      return;
    }

    setExiting(true);

    try {
      const response = await fetch(`/api/groups/${group.id}/leave`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          needsOwnershipTransfer ? { new_owner_id: Number(newOwnerId) } : {},
        ),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? body?.message ?? "Unable to exit group.",
        );
      }

      const result: {
        group_deleted?: boolean;
      } = await response.json();

      const refreshed = await getMyGroups();
      const store = useGroupStore.getState();

      store.setGroups(refreshed);

      if (refreshed.length > 0) {
        store.setActiveGroupId(Number(refreshed[0].id));
      } else {
        store.clearGroups();
      }

      setExitOpened(false);
      onClose();

      window.dispatchEvent(new Event("nomi:memberships-changed"));

      notify.success({
        title: result.group_deleted ? "Group deleted" : "You left the group",
        message: result.group_deleted
          ? "You were the last member, so the group was deleted."
          : "You have successfully left the group.",
      });
    } catch (err) {
      notify.error({
        title: "Unable to exit group",
        message: getApiError(err).message,
      });
    } finally {
      setExiting(false);
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
        overlayProps={{ backgroundOpacity: 0.2 }}
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

          <ScrollArea style={{ flex: 1, minHeight: 0 }} scrollbarSize={6}>
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
                      disabled={!isOwner || loading || !!error}
                      onClick={() => {
                        setRenameValue(group.name);
                        setRenameOpened(true);
                      }}
                    >
                      Edit group
                    </Button>
                  </Group>
                </Stack>
              </Box>

              {/* Member list */}
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
                      const isMe =
                        Number(member.user_id) === Number(currentUserId);

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
                    disabled={loading || !!error || !currentMember}
                    onClick={openExitModal}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "13px 8px",
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
                        onClick={() => {
                          setDeleteConfirmation("");
                          setDeleteOpened(true);
                        }}
                        disabled={loading || !!error || deleting}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "13px 8px",
                          borderRadius: 10,
                        }}
                      >
                        <TrashIcon size={21} color="#B45353" />
                        <Text fz={14} c="#B45353">
                          {group.is_default
                            ? "Delete household"
                            : "Delete group"}
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

      {/* Both Existing Users and Invite by Email */}
      <AddMemberModal
        opened={addMemberOpened}
        onClose={() => setAddMemberOpened(false)}
        groupId={group.id}
        groupName={group.name}
        isDefaultGroup={group.is_default}
        existingMemberIds={members.map((member) => Number(member.user_id))}
        onInvite={handleInvite}
        onAddExisting={handleAddExistingMembers}
        loading={inviting}
      />

      {/* Delete confirmation */}
      <Modal
        opened={deleteOpened}
        onClose={() => {
          if (!deleting) setDeleteOpened(false);
        }}
        title={group.is_default ? "Delete your household?" : "Delete group?"}
        centered
        radius="lg"
        zIndex={400}
        closeOnClickOutside={!deleting}
        closeOnEscape={!deleting}
      >
        <Stack gap="md">
          <Alert color="red" icon={<WarningCircleIcon size={20} />} radius="md">
            This action cannot be undone.
          </Alert>

          {group.is_default ? (
            <>
              <Text fz={13} c={MUTED} lh={1.7}>
                You are about to permanently delete your Main Household
                <strong> {group.name}</strong>. All household members will lose
                access to this household.
              </Text>

              <Text fz={13} c={MUTED} lh={1.7}>
                The household and its associated data will be deleted.
                Independent private-group memberships should remain unaffected.
              </Text>

              <TextInput
                label="Type DELETE to confirm"
                placeholder="DELETE"
                value={deleteConfirmation}
                onChange={(event) =>
                  setDeleteConfirmation(event.currentTarget.value)
                }
                disabled={deleting}
                autoComplete="off"
              />
            </>
          ) : (
            <Text fz={13} c={MUTED} lh={1.7}>
              Are you sure you want to permanently delete{" "}
              <strong>{group.name}</strong>? Members will lose access to its
              conversation history.
            </Text>
          )}

          <Group justify="flex-end" mt="sm">
            <Button
              variant="default"
              disabled={deleting}
              onClick={() => setDeleteOpened(false)}
            >
              Cancel
            </Button>

            <Button
              color="red"
              loading={deleting}
              disabled={
                group.is_default && deleteConfirmation.trim() !== "DELETE"
              }
              onClick={() => void handleDeleteGroup()}
            >
              {group.is_default ? "Delete household" : "Delete group"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Rename group */}
      <Modal
        opened={renameOpened}
        onClose={() => {
          if (!renaming) setRenameOpened(false);
        }}
        title="Edit group name"
        centered
        radius="lg"
        zIndex={400}
        closeOnClickOutside={!renaming}
        closeOnEscape={!renaming}
      >
        <Stack gap="md">
          <TextInput
            label="Group name"
            placeholder="Enter group name"
            value={renameValue}
            onChange={(event) => setRenameValue(event.currentTarget.value)}
            maxLength={100}
            disabled={renaming}
          />

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setRenameOpened(false)}
              disabled={renaming}
            >
              Cancel
            </Button>

            <Button
              color="green"
              loading={renaming}
              disabled={
                renameValue.trim().length < 2 || renameValue.trim().length > 100
              }
              onClick={() => void handleRename()}
            >
              Save changes
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Exit and ownership transfer */}
      <Modal
        opened={exitOpened}
        onClose={() => {
          if (!exiting) {
            setExitOpened(false);
            setNewOwnerId(null);
          }
        }}
        title={
          needsOwnershipTransfer ? "Transfer ownership and exit" : "Exit group?"
        }
        centered
        radius="lg"
        zIndex={400}
        closeOnClickOutside={!exiting}
        closeOnEscape={!exiting}
      >
        <Stack gap="md">
          {needsOwnershipTransfer ? (
            <>
              <Text fz={13} c={MUTED} lh={1.6}>
                Select an existing member to become the new owner before you
                leave {group.name}.
              </Text>

              <Select
                label="New group owner"
                placeholder="Select a member"
                data={ownerOptions}
                value={newOwnerId}
                onChange={setNewOwnerId}
                searchable
                clearable
                disabled={exiting}
                comboboxProps={{
                  withinPortal: true,
                  zIndex: 600,
                }}
              />
            </>
          ) : isLastMember ? (
            <Text fz={13} c={MUTED} lh={1.6}>
              You're the last member of this group. Leaving will automatically
              delete the group and its chat history.
            </Text>
          ) : (
            <Text fz={13} c={MUTED} lh={1.6}>
              Are you sure you want to leave {group.name}? You will no longer
              have access to this group's conversation.
            </Text>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={exiting}
              onClick={() => {
                setExitOpened(false);
                setNewOwnerId(null);
              }}
            >
              Cancel
            </Button>

            <Button
              color="red"
              loading={exiting}
              disabled={needsOwnershipTransfer && !newOwnerId}
              onClick={() => void handleExitGroup()}
            >
              {needsOwnershipTransfer ? "Transfer and exit" : "Exit group"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
