import { create } from "zustand";

const STORAGE_KEY_AUTOHINTS = 'mc_auto_show_hints';
const STORAGE_KEY_ASD = 'mc_asd_mode';

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
  isASDMode: boolean;
  autoShowHints: boolean;
  toggleASDMode: () => void;
  setASDMode: (mode: boolean) => void;
  toggleAutoShowHints: () => void;
  setAutoShowHints: (show: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  (set) => ({
    isASDMode: getStorageItem(STORAGE_KEY_ASD, false),
    autoShowHints: getStorageItem(STORAGE_KEY_AUTOHINTS, false),
    toggleASDMode: () => set((state) => {
      const next = !state.isASDMode;
      setStorageItem(STORAGE_KEY_ASD, next);
      return { isASDMode: next };
    }),
    setASDMode: (mode) => {
      setStorageItem(STORAGE_KEY_ASD, mode);
      set({ isASDMode: mode });
    },
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
