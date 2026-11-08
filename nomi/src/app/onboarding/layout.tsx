import { Box } from "@mantine/core";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/src/lib/auth/auth";
import { Header } from "@/src/components/CommonComponents/Header";
import { BG } from "@/src/utils/constants";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <Box mih="100dvh" bg={BG}>
      <Header user={user} />

      <Box component="main">{children}</Box>
    </Box>
  );
}
