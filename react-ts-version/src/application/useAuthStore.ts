import { create } from "zustand";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import { auth } from "@/infrastructure/firebase";

export interface AuthUser {
  uid?: string;
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

interface AuthState {
  user: AuthUser | null;
  role: string | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser, role: string) => void;
  logout: () => void;
}

const getStoredAuth = () => {
  try {
    const globalObj = globalThis as any;
    const s = globalObj['sessionStorage'] || globalObj['localStorage'];
    if (!s) return { user: null, role: null, isAuthenticated: false };
    const rawUser = s.getItem('mc_auth_user');
    const rawRole = s.getItem('mc_auth_role');
    if (rawUser && rawRole) {
      const parsed = JSON.parse(rawUser);
      return { user: parsed, role: rawRole, isAuthenticated: true };
    }
  } catch (e) {
    console.error('Failed to restore auth from session storage', e);
  }
  return { user: null, role: null, isAuthenticated: false };
};

const setStoredAuth = (user: AuthUser, role: string) => {
  try {
    const globalObj = globalThis as any;
    const s = globalObj['sessionStorage'] || globalObj['localStorage'];
    if (s) {
      s.setItem('mc_auth_user', JSON.stringify(user));
      s.setItem('mc_auth_role', role);
    }
  } catch (e) {
    console.error('Failed to store auth', e);
  }
};

const clearStoredAuth = () => {
  try {
    const globalObj = globalThis as any;
    const sess = globalObj['sessionStorage'];
    const loc = globalObj['localStorage'];
    if (sess) {
      sess.removeItem('mc_auth_user');
      sess.removeItem('mc_auth_role');
    }
    if (loc) {
      loc.removeItem('mc_auth_user');
      loc.removeItem('mc_auth_role');
    }
  } catch (e) {
    console.error('Failed to clear stored auth', e);
  }
};

const initial = getStoredAuth();

export const useAuthStore = create<AuthState>()(
  (set) => ({
    user: initial.user,
    role: initial.role,
    isAuthenticated: initial.isAuthenticated,
    setUser: (user, role) => set(() => {
      const activeRole = Array.isArray(role) ? role[0] : (typeof role === 'string' ? role : 'teacher');
      const cleanUser: AuthUser = {
        ...user,
        role: activeRole,
      };
      setStoredAuth(cleanUser, activeRole);
      const username = user?.name || user?.email || "Unknown";
      AuditLogger.log("התחברות", user?.uid || "unknown_uid", `משתמש התחבר במצב ${activeRole}: ${username}`);
      return { user: user.role ? cleanUser : user, role: activeRole, isAuthenticated: true };
    }),
    logout: () => {
      clearStoredAuth();
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
