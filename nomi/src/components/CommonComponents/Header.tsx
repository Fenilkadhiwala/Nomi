"use client";
import { Avatar, Button, Group, Title } from "@mantine/core";
import { SignOutIcon } from "@phosphor-icons/react";
import { GREEN, MUTED } from "@/src/utils/constants";
import { logoutUser } from "@/src/apis/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/src/lib/notifications/notifications";
import { getApiError } from "@/src/lib/api/get-api-error";

export const Header = ({ user }: any) => {
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await logoutUser();
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
  return (
    <Group justify="space-between" px={{ base: 20, sm: 48 }} py={24}>
      <Group gap={10}>
        <Title
          order={2}
          c={GREEN}
          fw={750}
          fz={28}
          style={{ letterSpacing: "-1px" }}
        >
          nomi.
        </Title>
      </Group>

      <Group gap={12}>
        <Avatar size={34} radius="xl" bg="#E1EDE5" c={GREEN}>
          {user.name
            .split(" ")
            .map((part: any) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </Avatar>

        <Button
          variant="subtle"
          color="gray"
          c={MUTED}
          leftSection={<SignOutIcon size={17} />}
          loading={loggingOut}
          onClick={handleLogout}
        >
          Sign out
        </Button>
      </Group>
    </Group>
  );
};
