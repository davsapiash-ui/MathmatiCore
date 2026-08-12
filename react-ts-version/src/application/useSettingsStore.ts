import { create } from "zustand";

const STORAGE_KEY_AUTOHINTS = 'mc_auto_show_hints';

const getInitialAutoShowHints = (): boolean => {
  try {
    const g = globalThis as any;
    const s = g['sessionStorage'] || g['localStorage'];
    if (s) {
      const val = s.getItem(STORAGE_KEY_AUTOHINTS);
      if (val !== null) return val === 'true';
    }
  } catch {}
  return false;
};

const saveAutoShowHints = (show: boolean) => {
  try {
    const g = globalThis as any;
    const s = g['sessionStorage'] || g['localStorage'];
    if (s) {
      s.setItem(STORAGE_KEY_AUTOHINTS, String(show));
    }
  } catch {}
};

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
    autoShowHints: getInitialAutoShowHints(),
    toggleASDMode: () => set((state) => ({ isASDMode: !state.isASDMode })),
    setASDMode: (mode) => set({ isASDMode: mode }),
    toggleAutoShowHints: () => set((state) => {
      const next = !state.autoShowHints;
      saveAutoShowHints(next);
      return { autoShowHints: next };
    }),
    setAutoShowHints: (show) => {
      saveAutoShowHints(show);
      set({ autoShowHints: show });
    },
  })
);
