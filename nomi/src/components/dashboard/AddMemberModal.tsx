"use client";

import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";

import {
  EnvelopeSimpleIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";

import { useEffect, useMemo, useRef, useState } from "react";

import { getAvailableGroupMembers } from "@/src/apis/api";
import type { AvailableGroupMember } from "@/src/types/types";
import { getApiError } from "@/src/lib/api/get-api-error";
import { useGroupStore } from "@/src/store/useGroupStore";
import { GREEN, MUTED, TEXT } from "@/src/utils/constants";

export interface AddMemberInvitationOptions {
  email: string;
  includeOtherGroups: boolean;
  includeHomeCircle: boolean;
}

export interface AddExistingMemberOptions {
  include_main_household?: boolean;
  additional_group_ids?: number[];
}

interface AddMemberModalProps {
  opened: boolean;
  onClose: () => void;
  groupName: string;
  groupId: number;
  isDefaultGroup: boolean;
  onInvite: (options: AddMemberInvitationOptions) => Promise<void>;
  onAddExisting: (
    memberIds: number[],
    options?: AddExistingMemberOptions,
  ) => Promise<void>;
  existingMemberIds?: number[];
  loading?: boolean;
}

type AddMode = "existing" | "email";

export function AddMemberModal({
  opened,
  onClose,
  groupName,
  groupId,
  isDefaultGroup,
  onInvite,
  onAddExisting,
  existingMemberIds = [],
  loading = false,
}: AddMemberModalProps) {
  const groups = useGroupStore((state) => state.groups);

  const [mode, setMode] = useState<AddMode>("existing");
  const [availableMembers, setAvailableMembers] = useState<
    AvailableGroupMember[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [includeMain, setIncludeMain] = useState(false);
  const [includeOtherGroups, setIncludeOtherGroups] = useState(false);
  const [additionalGroupIds, setAdditionalGroupIds] = useState<number[]>([]);

  const requestRef = useRef(0);

  const mainGroup = groups.find((group) => group.is_default);

  const canManageMain =
    !!mainGroup && (mainGroup.role === "owner" || mainGroup.role === "admin");

  const managedPrivateGroups = groups.filter(
    (group) =>
      !group.is_default &&
      Number(group.id) !== Number(groupId) &&
      (group.role === "owner" || group.role === "admin"),
  );

  const excludedIds = useMemo(
    () => new Set(existingMemberIds.map(Number)),
    [existingMemberIds],
  );

  const selectableMembers = useMemo(
    () =>
      availableMembers.filter((member) => !excludedIds.has(Number(member.id))),
    [availableMembers, excludedIds],
  );

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return selectableMembers;

    return selectableMembers.filter(
      (member) =>
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query),
    );
  }, [selectableMembers, search]);

  const selectedMembers = selectableMembers.filter((member) =>
    selectedIds.includes(Number(member.id)),
  );

  const membersNeedingMain = selectedMembers.filter(
    (member) => !member.main_household_member,
  );

  const showMainOption =
    !isDefaultGroup &&
    canManageMain &&
    (mode === "email" || membersNeedingMain.length > 0);

  const showOtherGroups = isDefaultGroup && managedPrivateGroups.length > 0;

  const allVisibleSelected =
    filteredMembers.length > 0 &&
    filteredMembers.every((member) => selectedIds.includes(Number(member.id)));

  const loadMembers = async () => {
    const requestId = ++requestRef.current;

    setLoadingMembers(true);
    setMembersError(null);

    try {
      const result = await getAvailableGroupMembers();

      if (requestId !== requestRef.current) return;

      setAvailableMembers(result);
    } catch (error) {
      if (requestId !== requestRef.current) return;

      setMembersError(getApiError(error).message);
    } finally {
      if (requestId === requestRef.current) {
        setLoadingMembers(false);
      }
    }
  };

  useEffect(() => {
    if (!opened) {
      requestRef.current += 1;
      return;
    }

    setMode("existing");
    setAvailableMembers([]);
    setSelectedIds([]);
    setSearch("");
    setEmail("");
    setEmailError(null);
    setIncludeMain(false);
    setIncludeOtherGroups(false);
    setAdditionalGroupIds([]);

    void loadMembers();

    return () => {
      requestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, groupId]);

  const toggleMember = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredMembers.map((member) => Number(member.id));

    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  };

  const changeMode = (next: AddMode) => {
    setMode(next);
    setIncludeMain(false);
    setIncludeOtherGroups(false);
    setAdditionalGroupIds([]);
  };

  const handleAddExisting = async () => {
    if (loading || selectedIds.length === 0) return;

    await onAddExisting(selectedIds, {
      include_main_household: showMainOption && includeMain,
      additional_group_ids: isDefaultGroup ? additionalGroupIds : [],
    });
  };

  const handleInvite = async () => {
    if (loading) return;

    const normalized = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailError("Enter a valid email address.");
      return;
    }

    setEmailError(null);

    await onInvite({
      email: normalized,
      includeOtherGroups: showOtherGroups && includeOtherGroups,
      includeHomeCircle: showMainOption && includeMain,
    });
  };

  const closeModal = () => {
    if (!loading) onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      centered
      size={480}
      radius="xl"
      zIndex={500}
      title={
        <Text fw={700} fz={18} c={TEXT}>
          Add members
        </Text>
      }
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
    >
      <Stack gap={18}>
        <Group gap={12} p={14} bg="#F4F7F3" style={{ borderRadius: 14 }}>
          <Avatar size={44} radius="xl" bg="#E1EDE5" c={GREEN}>
            {isDefaultGroup ? (
              <HouseIcon size={23} weight="duotone" />
            ) : (
              <UsersThreeIcon size={23} weight="duotone" />
            )}
          </Avatar>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text fw={650} fz={14} c={TEXT} truncate>
              {groupName}
            </Text>
            <Text fz={12} c={MUTED}>
              {isDefaultGroup ? "Main Household" : "Private group"}
            </Text>
          </Box>
        </Group>

        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(value) => changeMode(value as AddMode)}
          disabled={loading}
          data={[
            { label: "Existing users", value: "existing" },
            { label: "Invite by email", value: "email" },
          ]}
        />

        {mode === "existing" ? (
          <Stack gap={14}>
            <TextInput
              placeholder="Search by name or email"
              leftSection={<MagnifyingGlassIcon size={17} />}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              disabled={loadingMembers || loading}
              size="md"
              radius="md"
            />

            {loadingMembers ? (
              <Stack align="center" py={24}>
                <Loader size="sm" color={GREEN} />
              </Stack>
            ) : membersError ? (
              <Stack align="center" gap={12} py={16}>
                <Text c="red" fz={13}>
                  {membersError}
                </Text>
                <Button variant="light" onClick={() => void loadMembers()}>
                  Try again
                </Button>
              </Stack>
            ) : selectableMembers.length === 0 ? (
              <Text c={MUTED} fz={13} ta="center" py={24}>
                No other known users are available. You can invite someone by
                email.
              </Text>
            ) : (
              <>
                <Group justify="space-between">
                  <Text fw={650} fz={12} c={TEXT}>
                    {selectedIds.length} selected
                  </Text>
                  <Button
                    variant="subtle"
                    color="gray"
                    size="compact-sm"
                    disabled={filteredMembers.length === 0}
                    onClick={toggleAllVisible}
                  >
                    {allVisibleSelected ? "Deselect visible" : "Select visible"}
                  </Button>
                </Group>

                <ScrollArea.Autosize mah={280}>
                  <Stack gap={7}>
                    {filteredMembers.map((member) => {
                      const id = Number(member.id);
                      const checked = selectedIds.includes(id);

                      return (
                        <UnstyledButton
                          key={id}
                          disabled={loading}
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

                            <Box style={{ flex: 1, minWidth: 0 }}>
                              <Text fw={650} fz={13} c={TEXT} truncate>
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

            {showMainOption && (
              <Box p={14} bg="#F4F7F3" style={{ borderRadius: 12 }}>
                <Checkbox
                  checked={includeMain}
                  onChange={(event) =>
                    setIncludeMain(event.currentTarget.checked)
                  }
                  label={`Also add ${membersNeedingMain.length} user(s) to ${mainGroup?.name}`}
                  description="Users already in Main Household will be skipped."
                  color="green"
                />
              </Box>
            )}

            {showOtherGroups && selectedIds.length > 0 && (
              <Stack gap={8}>
                <Text fw={650} fz={13} c={TEXT}>
                  Also add to private groups
                </Text>

                {managedPrivateGroups.map((group) => (
                  <Checkbox
                    key={group.id}
                    label={group.name}
                    color="green"
                    checked={additionalGroupIds.includes(Number(group.id))}
                    onChange={(event) => {
                      const id = Number(group.id);
                      setAdditionalGroupIds((current) =>
                        event.currentTarget.checked
                          ? [...current, id]
                          : current.filter((value) => value !== id),
                      );
                    }}
                  />
                ))}
              </Stack>
            )}

            <Group justify="flex-end">
              <Button variant="default" disabled={loading} onClick={closeModal}>
                Cancel
              </Button>

              <Button
                color="green"
                loading={loading}
                disabled={
                  selectedIds.length === 0 || loadingMembers || !!membersError
                }
                leftSection={<UserPlusIcon size={17} />}
                onClick={() => void handleAddExisting()}
              >
                Add {selectedIds.length} member
                {selectedIds.length === 1 ? "" : "s"}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap={16}>
            <TextInput
              label="Email address"
              placeholder="name@example.com"
              leftSection={<EnvelopeSimpleIcon size={18} />}
              value={email}
              onChange={(event) => {
                setEmail(event.currentTarget.value);
                setEmailError(null);
              }}
              error={emailError}
              disabled={loading}
              size="md"
              radius="md"
            />

            {showMainOption && (
              <Checkbox
                checked={includeMain}
                onChange={(event) =>
                  setIncludeMain(event.currentTarget.checked)
                }
                label={`Also invite to ${mainGroup?.name}`}
                color="green"
              />
            )}

            {showOtherGroups && (
              <Checkbox
                checked={includeOtherGroups}
                onChange={(event) =>
                  setIncludeOtherGroups(event.currentTarget.checked)
                }
                label="Also invite to other private groups"
                description="Includes private groups you manage."
                color="green"
              />
            )}

            <Text fz={12} c={MUTED}>
              The invitation must be accepted before membership is added.
            </Text>

            <Group justify="flex-end">
              <Button variant="default" disabled={loading} onClick={closeModal}>
                Cancel
              </Button>

              <Button
                color="green"
                loading={loading}
                leftSection={<UserPlusIcon size={17} />}
                onClick={() => void handleInvite()}
              >
                Send invitation
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
