import { create } from "zustand";

import { AuditLogger } from "@/infrastructure/services/AuditLogger";

export interface AuthUser {
  uid?: string;
  id?: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

interface AuthState {
  user: AuthUser | null;
  role: "student" | "teacher" | "admin" | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser, role: "student" | "teacher" | "admin") => void;
  logout: () => void;
}

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
    logout: () => set((state) => {
      const username = state.user?.name || state.user?.email || "Unknown";
      AuditLogger.log("התנתקות", state.user?.uid || "unknown_uid", `משתמש התנתק: ${username}`);
      return { user: null, role: null, isAuthenticated: false };
    }),
  })
);
