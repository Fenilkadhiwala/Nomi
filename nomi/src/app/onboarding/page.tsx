import { redirect } from "next/navigation";

import { getCurrentUser } from "@/src/lib/auth/auth";
import { HouseholdOnboarding } from "@/src/components/Onboarding/HouseholdOnboarding";

export default async function OnboardingPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <HouseholdOnboarding user={user} />;
}
