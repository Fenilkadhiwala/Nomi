"use client";

import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";

import {
  DotsThreeIcon,
  PlusIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";

import { useRef, useState } from "react";

import { createGroup } from "@/src/apis/api";
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

export function GroupSidebar({
  onAddMember,
  onGroupSelect,
}: GroupSidebarProps) {
  const groups = useGroupStore((state) => state.groups);

  const activeGroupId = useGroupStore((state) => state.activeGroupId);

  const setActiveGroupId = useGroupStore((state) => state.setActiveGroupId);

  const addGroup = useGroupStore((state) => state.addGroup);

  const [creating, setCreating] = useState(false);
  const [createOpened, setCreateOpened] = useState(false);

  const submittingRef = useRef(false);

  const activeGroup =
    groups.find((group) => group.id === activeGroupId) ?? null;

  const form = useForm({
    mode: "uncontrolled",

    initialValues: {
      name: "",
    },

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

  // Group data is now loaded by DashboardShell.
  // Do not fetch groups independently here.
  //
  // Both desktop and mobile sidebars use the same
  // Zustand store and stay synchronized.

  const handleCreateGroup = async (values: { name: string }) => {
    if (submittingRef.current) return;

    const householdId = activeGroup?.household_id;

    if (!householdId) {
      notify.error({
        title: "No household selected",
        message: "Please select a household first.",
      });

      return;
    }

    submittingRef.current = true;
    setCreating(true);

    try {
      const group = await createGroup({
        household_id: householdId,
        name: values.name.trim(),
      });

      addGroup(group);

      notify.success({
        title: "Group created",
        message: `${group.name} is ready.`,
      });

      form.reset();
      setCreateOpened(false);
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
        {/* Section heading */}
        <Group justify="space-between" mb={12}>
          <Text
            fz={10}
            fw={800}
            c={SIDEBAR_MUTED}
            style={{
              letterSpacing: "1.6px",
            }}
          >
            YOUR GROUPS
          </Text>

          <Tooltip label="Create group" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => setCreateOpened(true)}
              aria-label="Create group"
            >
              <PlusIcon size={17} color={SIDEBAR_TEXT} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {/* Group list */}
        {groups.length === 0 ? (
          <Stack align="center" gap={8} py={20}>
            <UsersThreeIcon size={26} color={SIDEBAR_MUTED} />

            <Text fz={12} c={SIDEBAR_MUTED} ta="center">
              No groups available yet.
            </Text>
          </Stack>
        ) : (
          <Stack gap={5}>
            {groups.map((group) => {
              const selected = group.id === activeGroupId;

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
                      setActiveGroupId(group.id);
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
                      {/* Group icon */}
                      <Avatar
                        size={36}
                        radius={10}
                        color="gray"
                        variant="light"
                        style={{
                          flexShrink: 0,
                        }}
                      >
                        <UsersThreeIcon size={18} weight="duotone" />
                      </Avatar>

                      {/* Group information */}
                      <Box
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
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

                          {group.is_default && (
                            <>
                              <Box
                                w={3}
                                h={3}
                                bg={SIDEBAR_MUTED}
                                style={{
                                  borderRadius: "50%",
                                }}
                              />

                              <Text fz={10} fw={600} c="#C8DFD0">
                                Default
                              </Text>
                            </>
                          )}
                        </Group>
                      </Box>
                    </Group>
                  </UnstyledButton>

                  {/* Group actions */}
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
                        style={{
                          flexShrink: 0,
                        }}
                        aria-label={`Manage ${group.name}`}
                      >
                        <DotsThreeIcon size={20} color={SIDEBAR_TEXT} />
                      </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                      <Menu.Label>Group actions</Menu.Label>

                      <Menu.Item
                        leftSection={<UserPlusIcon size={16} />}
                        onClick={() => onAddMember?.(group.id)}
                      >
                        Add member
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* Create group dialog */}
      <Modal
        opened={createOpened}
        onClose={() => {
          if (!creating) {
            setCreateOpened(false);
            form.reset();
          }
        }}
        centered
        radius="lg"
        size="sm"
        title={
          <Group gap={10}>
            <Box
              p={9}
              bg="#E2EEE6"
              style={{
                borderRadius: 10,
              }}
            >
              <UsersThreeIcon size={20} color={GREEN} weight="duotone" />
            </Box>

            <Box>
              <Text fw={750} fz={16} c={TEXT}>
                Create a group
              </Text>

              <Text fz={12} c={MUTED}>
                Bring people together in one space.
              </Text>
            </Box>
          </Group>
        }
        styles={{
          header: {
            paddingBottom: 8,
          },
          body: {
            paddingTop: 10,
          },
        }}
      >
        <form onSubmit={form.onSubmit(handleCreateGroup)}>
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
              You can invite members after creating your group.
            </Text>

            <Group justify="flex-end" gap={10}>
              <Button
                variant="default"
                radius="md"
                onClick={() => {
                  setCreateOpened(false);
                  form.reset();
                }}
                disabled={creating}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                radius="md"
                bg={GREEN}
                loading={creating}
                leftSection={<PlusIcon size={16} />}
              >
                Create group
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
