import { getLoggedInUser, getMyHouseholds } from "@/src/apis/api";

import { notify } from "../notifications/notifications";
import { getApiError } from "../api/get-api-error";

export const checkUser = async (
  active: any,
  user: any,
  setUser: any,
  setLoading: any,
  router: any,
) => {
  try {
    const currentUser = await getLoggedInUser();

    if (!active) return;

    if (!currentUser) {
      router.replace("/login");
      return;
    }

    const households = await getMyHouseholds();

    if (!active) return;

    if (households.length > 0) {
      router.replace("/dashboard");
      return;
    }

    setUser(currentUser);
    setLoading(false);
  } catch (error) {
    if (!active) return;

    notify.error({
      title: "Unable to load account",
      message: getApiError(error).message,
    });

    setLoading(false);
  }
};
