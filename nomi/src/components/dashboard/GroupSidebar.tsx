"use client";

import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Menu,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";

import { useForm } from "@mantine/form";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DotsThreeIcon,
  HouseLineIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";

import { useMemo, useRef, useState } from "react";

import {
  createGroup,
  getAvailableGroupMembers,
  inviteGroupMember,
} from "@/src/apis/api";

import type { AvailableGroupMember } from "@/src/types/types";

import { getApiError } from "@/src/lib/api/get-api-error";
import { notify } from "@/src/lib/notifications/notifications";
import { GREEN, MUTED, TEXT } from "@/src/utils/constants";
import { useGroupStore } from "@/src/store/useGroupStore";

const SIDEBAR_TEXT = "#EAF3ED";
const SIDEBAR_MUTED = "#B5CEC1";
const SIDEBAR_ACTIVE = "rgba(255,255,255,0.14)";

interface GroupSidebarProps {
  onAddMember?: (groupId: number) => void;
  onGroupSelect?: () => void;
}

type CreateStep = "details" | "members";
type MemberMode = "existing" | "email";

export function GroupSidebar({
  onAddMember,
  onGroupSelect,
}: GroupSidebarProps) {
  const groups = useGroupStore((state) => state.groups);
  const activeGroupId = useGroupStore((state) => state.activeGroupId);
  const setActiveGroupId = useGroupStore((state) => state.setActiveGroupId);
  const addGroup = useGroupStore((state) => state.addGroup);

  const [createOpened, setCreateOpened] = useState(false);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<CreateStep>("details");
  const [mode, setMode] = useState<MemberMode>("existing");

  const [groupName, setGroupName] = useState("");
  const [targetHouseholdId, setTargetHouseholdId] = useState<any>(null);

  const [availableMembers, setAvailableMembers] = useState<
    AvailableGroupMember[]
  >([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

  const [search, setSearch] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [includeMainHousehold, setIncludeMainHousehold] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const requestIdRef = useRef(0);

  const activeGroup =
    groups.find((group) => Number(group.id) === Number(activeGroupId)) ?? null;

  const mainHousehold = groups.find((group) => group.is_default === true);

  // Only managers can add other people to Main.
  const canManageMain =
    !!mainHousehold &&
    (mainHousehold.role === "owner" || mainHousehold.role === "admin");

  const canCreateGroup = activeGroup !== null;

  const sortedGroups = useMemo(
    () =>
      [...groups].sort((a, b) => {
        if (a.is_default !== b.is_default) {
          return a.is_default ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
    [groups],
  );

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return availableMembers;

    return availableMembers.filter(
      (member) =>
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query),
    );
  }, [availableMembers, search]);

  const selectedMembers = useMemo(
    () =>
      availableMembers.filter((member) =>
        selectedMemberIds.includes(Number(member.id)),
      ),
    [availableMembers, selectedMemberIds],
  );

  // Only selected users missing from Main.
  const membersNeedingHousehold = selectedMembers.filter(
    (member) => !member.main_household_member,
  );

  const showMainCheckbox =
    canManageMain && (mode === "email" || membersNeedingHousehold.length > 0);

  const allVisibleSelected =
    filteredMembers.length > 0 &&
    filteredMembers.every((member) =>
      selectedMemberIds.includes(Number(member.id)),
    );

  const form = useForm({
    mode: "uncontrolled",
    initialValues: { name: "" },
    validate: {
      name: (value) => {
        const trimmed = value.trim();
        if (trimmed.length < 2) {
          return "Group name must have at least 2 characters";
        }
        if (trimmed.length > 100) {
          return "Group name cannot exceed 100 characters";
        }
        return null;
      },
    },
  });

  const resetCreateDialog = () => {
    requestIdRef.current += 1;

    setCreateOpened(false);
    setStep("details");
    setMode("existing");
    setGroupName("");
    setTargetHouseholdId(null);
    setAvailableMembers([]);
    setSelectedMemberIds([]);
    setSearch("");
    setLoadingMembers(false);
    setMembersError(null);
    setIncludeMainHousehold(false);
    setInviteEmail("");
    setEmailError(null);

    form.reset();
  };

  const openCreateDialog = () => {
    if (!activeGroup) return;

    resetCreateDialog();

    setTargetHouseholdId(
      mainHousehold?.household_id != null
        ? Number(mainHousehold.household_id)
        : activeGroup.household_id != null
          ? Number(activeGroup.household_id)
          : null,
    );

    setCreateOpened(true);
  };

  const loadAvailableMembers = async () => {
    const requestId = ++requestIdRef.current;

    setLoadingMembers(true);
    setMembersError(null);

    try {
      const members = await getAvailableGroupMembers();

      if (requestId !== requestIdRef.current) return;
      setAvailableMembers(members);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setMembersError(getApiError(error).message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingMembers(false);
      }
    }
  };

  const handleContinue = async (values: { name: string }) => {
    setGroupName(values.name.trim());
    setStep("members");
    setMode("existing");
    setSelectedMemberIds([]);
    setIncludeMainHousehold(false);
    setSearch("");

    await loadAvailableMembers();
  };

  const toggleMember = (id: number) => {
    setSelectedMemberIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredMembers.map((member) => Number(member.id));

    setSelectedMemberIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  };

  const changeMode = (value: MemberMode) => {
    setMode(value);
    setIncludeMainHousehold(false);
    setEmailError(null);
  };

  const handleCreateGroup = async () => {
    if (submittingRef.current) return;

    const normalizedEmail = inviteEmail.trim().toLowerCase();

    if (mode === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        setEmailError("Enter a valid email address.");
        return;
      }
    }

    if (mode === "existing" && (loadingMembers || membersError)) {
      return;
    }

    submittingRef.current = true;
    setCreating(true);

    try {
      // In email mode, create an empty group first.
      // Then send an invitation to the new group.
      const memberIds = mode === "existing" ? selectedMemberIds : [];

      const group = await createGroup({
        household_id: targetHouseholdId,
        name: groupName.trim(),
        member_ids: memberIds,
        include_main_household:
          mode === "existing" &&
          includeMainHousehold &&
          membersNeedingHousehold.length > 0,
      });

      addGroup(group);
      setActiveGroupId(Number(group.id));

      if (mode === "email") {
        try {
          await inviteGroupMember(Number(group.id), normalizedEmail, {
            includeOtherGroups: false,
            includeHomeCircle: canManageMain && includeMainHousehold,
          });

          notify.success({
            title: "Group created",
            message: `${group.name} was created and the invitation was sent.`,
          });
        } catch (error) {
          notify.error({
            title: "Group created, invitation failed",
            message:
              `${group.name} was created, but the invitation could not be sent. ` +
              getApiError(error).message,
          });
        }
      } else {
        notify.success({
          title: "Group created",
          message:
            memberIds.length > 0
              ? `${group.name} was created with ${memberIds.length} selected member${memberIds.length === 1 ? "" : "s"}.`
              : `${group.name} is ready.`,
        });
      }

      resetCreateDialog();
      onGroupSelect?.();
    } catch (error) {
      notify.error({
        title: "Unable to create group",
        message: getApiError(error).message,
      });
    } finally {
      submittingRef.current = false;
      setCreating(false);
    }
  };

  return (
    <>
      <Box px={14} mt={24}>
        <Group justify="space-between" mb={12}>
          <Text
            fz={10}
            fw={800}
            c={SIDEBAR_MUTED}
            style={{ letterSpacing: "1.6px" }}
          >
            YOUR GROUPS
          </Text>

          {canCreateGroup && (
            <Tooltip label="Create group" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={openCreateDialog}
                aria-label="Create group"
              >
                <PlusIcon size={17} color={SIDEBAR_TEXT} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {sortedGroups.length === 0 ? (
          <Stack align="center" gap={8} py={20}>
            <UsersThreeIcon size={26} color={SIDEBAR_MUTED} />
            <Text fz={12} c={SIDEBAR_MUTED} ta="center">
              No groups available yet.
            </Text>
          </Stack>
        ) : (
          <Stack gap={5}>
            {sortedGroups.map((group) => {
              const selected = Number(group.id) === Number(activeGroupId);

              const canInviteMembers =
                group.role === "owner" || group.role === "admin";

              return (
                <Group
                  key={group.id}
                  gap={4}
                  wrap="nowrap"
                  align="center"
                  px={8}
                  py={6}
                  style={{
                    borderRadius: 12,
                    backgroundColor: selected ? SIDEBAR_ACTIVE : "transparent",
                    transition: "background-color 0.2s ease",
                  }}
                >
                  <UnstyledButton
                    onClick={() => {
                      setActiveGroupId(Number(group.id));
                      onGroupSelect?.();
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "5px 0",
                      borderRadius: 8,
                    }}
                  >
                    <Group gap={11} wrap="nowrap" align="center">
                      <Avatar
                        size={36}
                        radius={10}
                        color="gray"
                        variant="light"
                        style={{ flexShrink: 0 }}
                      >
                        {group.is_default ? (
                          <HouseLineIcon size={19} weight="duotone" />
                        ) : (
                          <UsersThreeIcon size={18} weight="duotone" />
                        )}
                      </Avatar>

                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          fz={13}
                          fw={selected ? 700 : 500}
                          c="#FFFFFF"
                          lh={1.4}
                          lineClamp={2}
                          style={{
                            overflowWrap: "anywhere",
                          }}
                        >
                          {group.name}
                        </Text>

                        <Group gap={7} mt={4} wrap="wrap">
                          <Text fz={11} c={SIDEBAR_MUTED}>
                            {group.member_count}{" "}
                            {group.member_count === 1 ? "member" : "members"}
                          </Text>

                          <Box
                            w={3}
                            h={3}
                            bg={SIDEBAR_MUTED}
                            style={{ borderRadius: "50%" }}
                          />

                          <Text fz={10} fw={600} c="#C8DFD0">
                            {group.is_default ? "Household" : "Private group"}
                          </Text>
                        </Group>
                      </Box>
                    </Group>
                  </UnstyledButton>

                  {canInviteMembers && onAddMember && (
                    <Menu
                      shadow="md"
                      width={190}
                      position="bottom-end"
                      withinPortal
                    >
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size={30}
                          aria-label={`Manage ${group.name}`}
                        >
                          <DotsThreeIcon size={20} color={SIDEBAR_TEXT} />
                        </ActionIcon>
                      </Menu.Target>

                      <Menu.Dropdown>
                        <Menu.Label>Group actions</Menu.Label>
                        <Menu.Item
                          leftSection={<UserPlusIcon size={16} />}
                          onClick={() => onAddMember(Number(group.id))}
                        >
                          Add member
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
              );
            })}
          </Stack>
        )}
      </Box>

      <Modal
        opened={createOpened}
        onClose={() => {
          if (!creating) resetCreateDialog();
        }}
        centered
        radius="lg"
        size="md"
        title={
          <Group gap={10} wrap="nowrap">
            <Box p={9} bg="#E2EEE6" style={{ borderRadius: 10 }}>
              <UsersThreeIcon size={20} color={GREEN} weight="duotone" />
            </Box>

            <Box>
              <Text fw={750} fz={16} c={TEXT}>
                {step === "details" ? "Create a group" : "Add group members"}
              </Text>
              <Text fz={12} c={MUTED}>
                Step {step === "details" ? 1 : 2} of 2
              </Text>
            </Box>
          </Group>
        }
      >
        {step === "details" ? (
          <form onSubmit={form.onSubmit(handleContinue)}>
            <Stack gap={18}>
              <TextInput
                label="Group name"
                placeholder="Enter a group name"
                required
                maxLength={100}
                size="md"
                radius="md"
                key={form.key("name")}
                {...form.getInputProps("name")}
              />

              <Text fz={12} c={MUTED}>
                Next, add existing Nomi users or invite someone by email.
              </Text>

              <Group justify="flex-end">
                <Button variant="default" onClick={resetCreateDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  bg={GREEN}
                  rightSection={<ArrowRightIcon size={16} />}
                >
                  Continue
                </Button>
              </Group>
            </Stack>
          </form>
        ) : (
          <Stack gap={16}>
            <Box>
              <Text fw={650} fz={14} c={TEXT}>
                {groupName}
              </Text>
              <Text fz={12} c={MUTED}>
                Choose how to add people to this private group.
              </Text>
            </Box>

            <SegmentedControl
              fullWidth
              value={mode}
              onChange={(value) => changeMode(value as MemberMode)}
              disabled={creating}
              data={[
                {
                  label: "Existing users",
                  value: "existing",
                },
                {
                  label: "Invite by email",
                  value: "email",
                },
              ]}
            />

            {mode === "existing" ? (
              <Stack gap={14}>
                <TextInput
                  placeholder="Search by name or email"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  leftSection={<MagnifyingGlassIcon size={17} />}
                  size="md"
                  radius="md"
                  disabled={loadingMembers || creating}
                />

                {loadingMembers ? (
                  <Stack align="center" py={25}>
                    <Loader size="sm" color={GREEN} />
                    <Text fz={12} c={MUTED}>
                      Loading existing members...
                    </Text>
                  </Stack>
                ) : membersError ? (
                  <Stack align="center" gap={10} py={20}>
                    <Text fz={13} c="red">
                      {membersError}
                    </Text>
                    <Button
                      variant="light"
                      onClick={() => void loadAvailableMembers()}
                    >
                      Try again
                    </Button>
                  </Stack>
                ) : availableMembers.length === 0 ? (
                  <Text fz={13} c={MUTED} ta="center" py={20}>
                    No existing users available. Use Invite by email instead.
                  </Text>
                ) : (
                  <>
                    <Group justify="space-between">
                      <Text fz={12} fw={650} c={TEXT}>
                        {selectedMemberIds.length} selected
                      </Text>

                      {filteredMembers.length > 0 && (
                        <Button
                          variant="subtle"
                          color="gray"
                          size="compact-sm"
                          onClick={toggleAllVisible}
                        >
                          {allVisibleSelected
                            ? "Deselect visible"
                            : "Select visible"}
                        </Button>
                      )}
                    </Group>

                    <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars>
                      <Stack gap={7}>
                        {filteredMembers.map((member) => {
                          const id = Number(member.id);
                          const checked = selectedMemberIds.includes(id);

                          return (
                            <UnstyledButton
                              key={id}
                              disabled={creating}
                              onClick={() => toggleMember(id)}
                              style={{
                                width: "100%",
                                padding: 10,
                                borderRadius: 12,
                                border: checked
                                  ? `1px solid ${GREEN}`
                                  : "1px solid #E5E7EB",
                                background: checked ? "#F1F8F3" : "#FFFFFF",
                              }}
                            >
                              <Group gap={11} wrap="nowrap">
                                <Checkbox
                                  checked={checked}
                                  onChange={() => toggleMember(id)}
                                  onClick={(event) => event.stopPropagation()}
                                  color="green"
                                />

                                <Avatar
                                  size={38}
                                  radius="xl"
                                  color="green"
                                  variant="light"
                                >
                                  {member.name.trim().charAt(0).toUpperCase()}
                                </Avatar>

                                <Box
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  <Text fz={13} fw={650} c={TEXT} truncate>
                                    {member.name}
                                  </Text>
                                  <Text fz={11} c={MUTED} truncate>
                                    {member.email}
                                  </Text>
                                </Box>
                              </Group>
                            </UnstyledButton>
                          );
                        })}
                      </Stack>
                    </ScrollArea.Autosize>

                    {filteredMembers.length === 0 && (
                      <Text fz={12} c={MUTED} ta="center">
                        No users match your search.
                      </Text>
                    )}
                  </>
                )}

                {showMainCheckbox && (
                  <Box p={14} bg="#F4F7F3" style={{ borderRadius: 12 }}>
                    <Checkbox
                      checked={includeMainHousehold}
                      onChange={(event) =>
                        setIncludeMainHousehold(event.currentTarget.checked)
                      }
                      color="green"
                      label={`Also add ${membersNeedingHousehold.length} selected user(s) to ${mainHousehold?.name}`}
                      description="Only users who are not already household members will be added."
                    />
                  </Box>
                )}
              </Stack>
            ) : (
              <Stack gap={14}>
                <TextInput
                  label="Email address"
                  placeholder="name@example.com"
                  value={inviteEmail}
                  onChange={(event) => {
                    setInviteEmail(event.currentTarget.value);
                    setEmailError(null);
                  }}
                  error={emailError}
                  disabled={creating}
                  size="md"
                  radius="md"
                />

                <Text fz={12} c={MUTED}>
                  The group will be created and an invitation will be sent to
                  this email address.
                </Text>

                {showMainCheckbox && (
                  <Box p={14} bg="#F4F7F3" style={{ borderRadius: 12 }}>
                    <Checkbox
                      checked={includeMainHousehold}
                      onChange={(event) =>
                        setIncludeMainHousehold(event.currentTarget.checked)
                      }
                      color="green"
                      label={`Also invite this user to ${mainHousehold?.name}`}
                      description="Household membership will be added after the invitation is accepted."
                    />
                  </Box>
                )}
              </Stack>
            )}

            <Text fz={12} c={MUTED}>
              Existing users are added directly. Email invitations require
              acceptance.
            </Text>

            <Group justify="space-between">
              <Button
                variant="default"
                disabled={creating}
                leftSection={<ArrowLeftIcon size={16} />}
                onClick={() => setStep("details")}
              >
                Back
              </Button>

              <Button
                bg={GREEN}
                loading={creating}
                disabled={
                  mode === "existing" && (loadingMembers || !!membersError)
                }
                leftSection={<PlusIcon size={16} />}
                onClick={() => void handleCreateGroup()}
              >
                Create group
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
