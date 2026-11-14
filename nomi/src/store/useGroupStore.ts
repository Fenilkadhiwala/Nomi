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
    set((state) => {
      const existingActiveGroup = groups.find(
        (group) => Number(group.id) === Number(state.activeGroupId),
      );

      const defaultGroup = groups.find((group) => group.is_default);

      const nextActiveGroupId =
        existingActiveGroup?.id ?? defaultGroup?.id ?? groups[0]?.id ?? null;

      return {
        groups,
        activeGroupId:
          nextActiveGroupId !== null ? Number(nextActiveGroupId) : null,
      };
    }),

  setActiveGroupId: (id) =>
    set((state) => ({
      activeGroupId: state.groups.some(
        (group) => Number(group.id) === Number(id),
      )
        ? Number(id)
        : state.activeGroupId,
    })),

  addGroup: (group) =>
    set((state) => ({
      groups: state.groups.some(
        (existing) => Number(existing.id) === Number(group.id),
      )
        ? state.groups
        : [...state.groups, group],
      activeGroupId: Number(group.id),
    })),

  clearGroups: () =>
    set({
      groups: [],
      activeGroupId: null,
    }),
}));
