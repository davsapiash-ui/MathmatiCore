import { create } from "zustand";

const STORAGE_KEY_AUTOHINTS = 'mc_auto_show_hints';

const getStorageItem = (key: string, defaultVal: boolean): boolean => {
  try {
    const g = globalThis as unknown as Record<string, Storage>;
    const s = g['sessionStorage'] || g['localStorage'];
    if (s) {
      const val = s.getItem(key);
      if (val !== null) return val === 'true';
    }
  } catch {}
  return defaultVal;
};

const setStorageItem = (key: string, val: boolean) => {
  try {
    const g = globalThis as unknown as Record<string, Storage>;
    const s = g['sessionStorage'] || g['localStorage'];
    if (s) {
      s.setItem(key, String(val));
    }
  } catch {}
};

interface SettingsState {
  autoShowHints: boolean;
  toggleAutoShowHints: () => void;
  setAutoShowHints: (show: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  (set) => ({
    autoShowHints: getStorageItem(STORAGE_KEY_AUTOHINTS, false),
    toggleAutoShowHints: () => set((state) => {
      const next = !state.autoShowHints;
      setStorageItem(STORAGE_KEY_AUTOHINTS, next);
      return { autoShowHints: next };
    }),
    setAutoShowHints: (show) => {
      setStorageItem(STORAGE_KEY_AUTOHINTS, show);
      set({ autoShowHints: show });
    },
  })
);
