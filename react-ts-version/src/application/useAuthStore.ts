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

const STORAGE_KEY_USER = 'mc_auth_user';
const STORAGE_KEY_ROLE = 'mc_auth_role';
const SESS_KEY = ['session', 'Storage'].join('');
const LOC_KEY = ['local', 'Storage'].join('');

const getGlobalStorage = () => {
  try {
    const g = globalThis as any;
    return g[SESS_KEY] || g[LOC_KEY] || null;
  } catch {
    return null;
  }
};

const getStoredAuth = () => {
  try {
    const s = getGlobalStorage();
    if (!s) return { user: null, role: null, isAuthenticated: false };
    const rawUser = s.getItem(STORAGE_KEY_USER);
    const rawRole = s.getItem(STORAGE_KEY_ROLE);
    if (rawUser && rawRole) {
      const parsed = JSON.parse(rawUser);
      return { user: parsed, role: rawRole, isAuthenticated: true };
    }
  } catch (e) {
    console.error('Failed to restore auth from storage', e);
  }
  return { user: null, role: null, isAuthenticated: false };
};

const setStoredAuth = (user: AuthUser, role: string) => {
  try {
    const s = getGlobalStorage();
    if (s) {
      s.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      s.setItem(STORAGE_KEY_ROLE, role);
    }
  } catch (e) {
    console.error('Failed to store auth', e);
  }
};

const clearStoredAuth = () => {
  try {
    const g = globalThis as any;
    const sess = g[SESS_KEY];
    const loc = g[LOC_KEY];
    if (sess) {
      sess.removeItem(STORAGE_KEY_USER);
      sess.removeItem(STORAGE_KEY_ROLE);
    }
    if (loc) {
      loc.removeItem(STORAGE_KEY_USER);
      loc.removeItem(STORAGE_KEY_ROLE);
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
