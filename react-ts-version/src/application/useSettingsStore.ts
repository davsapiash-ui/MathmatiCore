import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  isASDMode: boolean;
  toggleASDMode: () => void;
  setASDMode: (mode: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isASDMode: false,
      toggleASDMode: () => set((state) => ({ isASDMode: !state.isASDMode })),
      setASDMode: (mode) => set({ isASDMode: mode }),
    }),
    {
      name: "settings-storage",
    }
  )
);
