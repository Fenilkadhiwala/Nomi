import "server-only";

import { getCurrentUser } from "./auth";

export async function getAuthenticatedUserId(): Promise<number | null> {
  const user = await getCurrentUser();

  return user?.id ?? null;
}
