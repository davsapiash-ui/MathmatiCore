import { create } from "zustand";

import { AuditLogger } from "@/infrastructure/services/AuditLogger";

export interface AuthUser {
  uid?: string;
  id?: string;
  name?: string;
  email?: string;
  role?: string | string[];
  [key: string]: unknown;
}

interface AuthState {
  user: AuthUser | null;
  role: string | string[] | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser, role: string | string[]) => void;
  logout: () => void;
}

import { auth } from "@/infrastructure/firebase";

export const useAuthStore = create<AuthState>()(
  (set) => ({
    user: null,
    role: null,
    isAuthenticated: false,
    setUser: (user, role) => set(() => {
      const username = user?.name || user?.email || "Unknown";
      AuditLogger.log("התחברות", user?.uid || "unknown_uid", `משתמש התחבר: ${username}`);
      return { user, role, isAuthenticated: true };
    }),
    logout: () => {
      if (auth && typeof auth.signOut === 'function') {
        auth.signOut().catch((e) => console.warn("Firebase signOut error:", e));
      }
      return set((state) => {
        const username = state.user?.name || state.user?.email || "Unknown";
        AuditLogger.log("התנתקות", state.user?.uid || "unknown_uid", `משתמש התנתק: ${username}`);
        return { user: null, role: null, isAuthenticated: false };
      });
    },
  })
);
