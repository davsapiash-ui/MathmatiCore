import { create } from "zustand";

interface AuthState {
  user: any | null; // Replace with proper Firebase User type if needed
  role: "student" | "teacher" | "admin" | null;
  isAuthenticated: boolean;
  setUser: (user: any, role: "student" | "teacher" | "admin") => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  isAuthenticated: false,
  setUser: (user, role) => set({ user, role, isAuthenticated: true }),
  logout: () => set({ user: null, role: null, isAuthenticated: false }),
}));
