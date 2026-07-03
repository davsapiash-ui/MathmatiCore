import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";

interface AuthState {
  user: any | null; // Replace with proper Firebase User type if needed
  role: "student" | "teacher" | "admin" | null;
  isAuthenticated: boolean;
  setUser: (user: any, role: "student" | "teacher" | "admin") => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      role: null,
      isAuthenticated: false,
      setUser: (user, role) => set(() => {
        const username = user?.name || user?.email || "Unknown";
        AuditLogger.log("התחברות", role, `משתמש התחבר: ${username}`);
        return { user, role, isAuthenticated: true };
      }),
      logout: () => set((state) => {
        const username = state.user?.name || state.user?.email || "Unknown";
        AuditLogger.log("התנתקות", state.role || "unknown", `משתמש התנתק: ${username}`);
        return { user: null, role: null, isAuthenticated: false };
      }),
    }),
    {
      name: "auth-storage", // name of item in the storage (must be unique)
    }
  )
);
