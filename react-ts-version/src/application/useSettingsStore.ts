import { create } from "zustand";


interface SettingsState {
  isASDMode: boolean;
  toggleASDMode: () => void;
  setASDMode: (mode: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  (set) => ({
    isASDMode: false,
    toggleASDMode: () => set((state) => ({ isASDMode: !state.isASDMode })),
    setASDMode: (mode) => set({ isASDMode: mode }),
  })
);
