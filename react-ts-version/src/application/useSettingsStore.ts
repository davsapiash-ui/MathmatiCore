import { create } from "zustand";


interface SettingsState {
  isASDMode: boolean;
  autoShowHints: boolean;
  toggleASDMode: () => void;
  setASDMode: (mode: boolean) => void;
  toggleAutoShowHints: () => void;
  setAutoShowHints: (show: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  (set) => ({
    isASDMode: false,
    autoShowHints: false,
    toggleASDMode: () => set((state) => ({ isASDMode: !state.isASDMode })),
    setASDMode: (mode) => set({ isASDMode: mode }),
    toggleAutoShowHints: () => set((state) => ({ autoShowHints: !state.autoShowHints })),
    setAutoShowHints: (show) => set({ autoShowHints: show }),
  })
);
