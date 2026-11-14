export type GroupSystemEventType =
  | "member_added"
  | "member_left"
  | "group_renamed"
  | "household_member_added"
  | "member_invited"
  | "household_member_invited"
  | "invitation_accepted"
  | "household_invitation_accepted"
  | "household_member_left";

export interface GroupSystemMessageMetadata {
  event_type: GroupSystemEventType;
  actor_id: number;
  member_id?: number;
  old_name?: string;
  new_name?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sender_id?: string;
  created_at?: string;
  metadata?: GroupSystemMessageMetadata | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface Household {
  id: number;
  name: string;
  description: string | null;
  address: string | null;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export interface CreateHouseholdPayload {
  address_line_1: string;
  address_line_2?: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

export interface HouseholdGroup {
  id: number;
  household_id: number;
  name: string;
  is_default: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
  role: "owner" | "admin" | "member";
  member_count: number;
}

export interface GroupMember {
  user_id: number;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
}

export interface CreateGroupPayload {
  household_id: number;
  name: string;
  member_ids?: number[];
  include_main_household: any;
}

export interface AvailableGroupMember {
  id: number;
  name: string;
  email: string;
  main_household_member: boolean;
}

export interface AvailableGroupMembersResponse {
  members: AvailableGroupMember[];
}

export interface AddExistingGroupMembersResponse {
  success: boolean;
  group_id: number;
  added_count: number;
  added_members: Array<{
    id: number;
    name: string;
    email: string;
  }>;
}

export interface AddExistingMembersOptions {
  include_main_household?: boolean;
  additional_group_ids?: number[];
}
