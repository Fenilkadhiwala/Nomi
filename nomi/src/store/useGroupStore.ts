import { create } from "zustand";
import type { HouseholdGroup } from "../types/types";

interface GroupStore {
  groups: HouseholdGroup[];
  activeGroupId: number | null;
  setGroups: (groups: HouseholdGroup[]) => void;
  setActiveGroupId: (id: number) => void;
  addGroup: (group: HouseholdGroup) => void;
  clearGroups: () => void;
}

export const useGroupStore = create<GroupStore>((set) => ({
  groups: [],
  activeGroupId: null,

  setGroups: (groups) =>
    set((state) => ({
      groups,
      activeGroupId:
        groups.find((g) => g.id === state.activeGroupId)?.id ??
        groups.find((g) => g.is_default)?.id ??
        groups[0]?.id ??
        null,
    })),

  setActiveGroupId: (id) =>
    set((state) => ({
      activeGroupId: state.groups.some((g) => g.id === id)
        ? id
        : state.activeGroupId,
    })),

  addGroup: (group) =>
    set((state) => ({
      groups: state.groups.some((g) => g.id === group.id)
        ? state.groups
        : [...state.groups, group],
      activeGroupId: group.id,
    })),

  clearGroups: () =>
    set({
      groups: [],
      activeGroupId: null,
    }),
}));
