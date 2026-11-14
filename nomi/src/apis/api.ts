import {
  AddExistingGroupMembersResponse,
  AddExistingMembersOptions,
  AuthResponse,
  AuthUser,
  AvailableGroupMember,
  ChatMessage,
  CreateGroupPayload,
  CreateHouseholdPayload,
  GroupMember,
  Household,
  HouseholdGroup,
  LoginPayload,
  RegisterPayload,
} from "../types/types";

import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 15000,
});

export async function inviteGroupMember(
  groupId: number,
  email: string,
  options: {
    includeOtherGroups: boolean;
    includeHomeCircle: boolean;
  },
): Promise<{ message: string }> {
  const { data } = await api.post<{
    message: string;
  }>(`/groups/${groupId}/invitations`, {
    email,
    includeOtherGroups: options.includeOtherGroups,
    includeHomeCircle: options.includeHomeCircle,
  });

  return data;
}

export const getAIResponseStream = async (
  message: string,
  threadId: string,
) => {
  const response = await fetch("/api/get-ai-response", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      message,
      threadId,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to get AI response.");
  }

  return data;
};

export const getMessages = async (threadId: string): Promise<ChatMessage[]> => {
  const { data } = await api.get<{
    messages: ChatMessage[];
  }>("/messages", {
    params: { threadId },
  });

  return data.messages.map((message) => ({
    id: String(message.id),
    role: message.role,
    content: message.content,
    sender_id: message.sender_id,
    created_at: message.created_at,
  }));
};

export async function registerUser(
  payload: RegisterPayload,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/register", payload);

  return data;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/login", payload);

  return data;
}

export async function getLoggedInUser(): Promise<AuthUser | null> {
  try {
    const { data } = await api.get<AuthResponse>("/me");

    return data.user;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  await api.post("/logout");
}

export async function createHousehold(
  payload: CreateHouseholdPayload,
): Promise<{
  household: Pick<Household, "id" | "name" | "address">;
  role: "owner";
  message: string;
}> {
  const { data } = await api.post("/households", payload);

  return data;
}

export async function getMyHouseholds(): Promise<Household[]> {
  const { data } = await api.get<{
    households: Household[];
  }>("/households/mine");

  return data.households;
}

export async function getMyGroups(): Promise<HouseholdGroup[]> {
  const { data } = await api.get<{
    groups: HouseholdGroup[];
  }>("/groups");

  return data.groups;
}

// Fetch unique existing users from every group
// the authenticated user belongs to.
//
// Users are deduplicated across households
// and the authenticated user is excluded.
export async function getAvailableGroupMembers(): Promise<
  AvailableGroupMember[]
> {
  const { data } = await api.get<{
    members: AvailableGroupMember[];
  }>("/groups/available-members");

  return data.members;
}

// Create a private group.
//
// Optionally includes member_ids to directly
// add eligible existing Nomi users.
//
// The backend validates membership eligibility
// and assigns the creator as group owner.
export async function createGroup(
  payload: CreateGroupPayload,
): Promise<HouseholdGroup> {
  const { data } = await api.post<{
    group: HouseholdGroup;
    message: string;
  }>("/groups", payload);

  return data.group;
}

export async function getGroupMembers(groupId: number): Promise<GroupMember[]> {
  const { data } = await api.get<{
    group_id: number;
    members: GroupMember[];
  }>(`/groups/${groupId}/members`);

  return data.members;
}

export async function addExistingGroupMembers(
  groupId: number,
  memberIds: number[],
  options: AddExistingMembersOptions = {},
): Promise<AddExistingGroupMembersResponse> {
  const { data } = await api.post<AddExistingGroupMembersResponse>(
    `/groups/${groupId}/members`,
    {
      member_ids: memberIds,
      include_main_household: options.include_main_household ?? false,
      additional_group_ids: options.additional_group_ids ?? [],
    },
  );

  return data;
}

export default api;
