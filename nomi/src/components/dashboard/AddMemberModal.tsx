"use client";

import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";

import { useForm } from "@mantine/form";
import { useEffect } from "react";

import {
  EnvelopeSimpleIcon,
  HouseIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";

import { GREEN, MUTED, TEXT } from "@/src/utils/constants";

export interface AddMemberInvitationOptions {
  email: string;
  includeOtherGroups: boolean;
  includeHomeCircle: boolean;
}

interface AddMemberModalProps {
  opened: boolean;
  onClose: () => void;
  groupName: string;
  isDefaultGroup: boolean;
  onInvite: (options: AddMemberInvitationOptions) => Promise<void>;
  loading?: boolean;
}

export function AddMemberModal({
  opened,
  onClose,
  groupName,
  isDefaultGroup,
  onInvite,
  loading = false,
}: AddMemberModalProps) {
  const form = useForm({
    initialValues: {
      email: "",
      includeOtherGroups: false,
      includeHomeCircle: false,
    },

    validate: {
      email: (value) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
          ? null
          : "Enter a valid email address",
    },
  });

  useEffect(() => {
    if (opened) {
      form.reset();
    }
    // Reset whenever a new invitation dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, groupName, isDefaultGroup]);

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      console.log("values", values);
      await onInvite({
        email: values.email.trim().toLowerCase(),
        includeOtherGroups: isDefaultGroup ? values.includeOtherGroups : false,
        includeHomeCircle: isDefaultGroup ? false : values.includeHomeCircle,
      });
    } catch {
      // Parent component handles the error notification.
    }
  });

  const handleClose = () => {
    if (loading) return;

    form.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      centered
      size={460}
      radius="xl"
      zIndex={500}
      title={
        <Text fw={700} fz={18} c={TEXT}>
          Add member
        </Text>
      }
      overlayProps={{
        backgroundOpacity: 0.45,
        blur: 3,
      }}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      styles={{
        header: {
          padding: "22px 24px 12px",
        },
        body: {
          padding: "8px 24px 24px",
        },
      }}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap={22}>
          {/* Current group */}
          <Group
            gap={13}
            p={14}
            bg="#F4F7F3"
            style={{
              borderRadius: 14,
            }}
          >
            <Avatar size={44} radius="xl" bg="#E1EDE5" c={GREEN}>
              {isDefaultGroup ? (
                <HouseIcon size={23} weight="duotone" />
              ) : (
                <UsersThreeIcon size={24} weight="duotone" />
              )}
            </Avatar>

            <Box
              style={{
                minWidth: 0,
                flex: 1,
              }}
            >
              <Text fw={650} fz={14} c={TEXT} truncate>
                {groupName}
              </Text>

              <Text fz={12} c={MUTED}>
                {isDefaultGroup ? "Main household group" : "Private group"}
              </Text>
            </Box>
          </Group>

          {/* Email input */}
          <Box>
            <TextInput
              label="Email address"
              placeholder="name@example.com"
              leftSection={<EnvelopeSimpleIcon size={18} />}
              size="md"
              radius="md"
              autoComplete="email"
              disabled={loading}
              {...form.getInputProps("email")}
              styles={{
                label: {
                  fontWeight: 600,
                  fontSize: 13,
                  marginBottom: 8,
                },
                input: {
                  borderColor: "#DDE4DC",
                },
              }}
            />

            <Text fz={12} c={MUTED} mt={10}>
              An invitation will be sent to this email address.
            </Text>
          </Box>

          {/* Membership options */}
          <Box
            p={16}
            bg="#F4F7F3"
            style={{
              borderRadius: 14,
              border: "1px solid #E4EAE2",
            }}
          >
            {isDefaultGroup ? (
              <Stack gap={9}>
                <Checkbox
                  label={
                    <Text fw={600} fz={13} c={TEXT}>
                      Add this member to all other household groups
                    </Text>
                  }
                  color="green"
                  disabled={loading}
                  {...form.getInputProps("includeOtherGroups", {
                    type: "checkbox",
                  })}
                />

                <Text fz={12} c={MUTED} pl={30} lh={1.5}>
                  This member will automatically join Home Circle and become a
                  household member. Select this option to also add them to all
                  other existing household groups.
                </Text>
              </Stack>
            ) : (
              <Stack gap={9}>
                <Checkbox
                  label={
                    <Text fw={600} fz={13} c={TEXT}>
                      Also add this member to household (Home Circle)
                    </Text>
                  }
                  color="green"
                  disabled={loading}
                  {...form.getInputProps("includeHomeCircle", {
                    type: "checkbox",
                  })}
                />

                <Text fz={12} c={MUTED} pl={30} lh={1.5}>
                  This member will join {groupName}. Select this option to also
                  add them to the household (Home Circle).
                </Text>
              </Stack>
            )}
          </Box>

          {/* Actions */}
          <Group justify="flex-end" gap={10}>
            <Button
              variant="default"
              radius="md"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              radius="md"
              color="green"
              loading={loading}
              leftSection={<UserPlusIcon size={18} />}
            >
              Send invitation
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
