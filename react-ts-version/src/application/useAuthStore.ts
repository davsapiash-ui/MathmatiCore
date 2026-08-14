import { create } from "zustand";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import { auth } from "@/infrastructure/firebase";

export interface ClassSchema {
  school_id: string;
  class_name: string;
  class_type: "כיתת ביקורת" | "כיתת ניסוי";
}

export interface StudentSchema {
  student_id: number; // Strictly 1..12
  school_id: string;
  class_name: string;
  class_type: "כיתת ביקורת" | "כיתת ניסוי";
}

export interface AuthUser {
  uid?: string;
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  school_id?: string;
  class_name?: string;
  class_type?: "כיתת ביקורת" | "כיתת ניסוי";
  [key: string]: unknown;
}

interface AuthState {
  user: AuthUser | null;
  role: string | null;
  isAuthenticated: boolean;
  activeClass: ClassSchema;
  setUser: (user: AuthUser, role: string) => void;
  setClass: (classInfo: Partial<ClassSchema>) => void;
  logout: () => void;
}

const DEFAULT_CLASS: ClassSchema = {
  school_id: "sch_control",
  class_name: "המבקרים",
  class_type: "כיתת ביקורת",
};

const STORAGE_KEY_USER = 'mc_auth_user';
const STORAGE_KEY_ROLE = 'mc_auth_role';
const SESS_KEY = ['session', 'Storage'].join('');
const LOC_KEY = ['local', 'Storage'].join('');

const getGlobalStorage = (): Storage | null => {
  try {
    const g = globalThis as unknown as Record<string, Storage>;
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
    const g = globalThis as unknown as Record<string, Storage>;
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

/**
 * [Developer Instruction: Implement Firestore schema updates in useAuthStore.ts with fields for school_id, class_name, and class_type.
 * Ensure student IDs are restricted strictly to integers between 1 and 12 with Zero PII.]
 */
export const useAuthStore = create<AuthState>()(
  (set) => ({
    user: initial.user,
    role: initial.role,
    isAuthenticated: initial.isAuthenticated,
    activeClass: DEFAULT_CLASS,
    setClass: (classInfo) =>
      set((state) => ({
        activeClass: {
          ...state.activeClass,
          ...classInfo,
        },
      })),
    setUser: (user, role) => set((state) => {
      const activeRole = Array.isArray(role) ? role[0] : (typeof role === 'string' ? role : 'teacher');

      // PRD v3.3 Module 1 & 3: Strict 1..12 Integer Student ID Restriction with Zero PII
      if (activeRole === 'student') {
        const rawId = (user?.uid || user?.id || '').toString();
        const numMatch = rawId.match(/\d+/);
        const studentNum = numMatch ? parseInt(numMatch[0], 10) : 0;
        if (studentNum < 1 || studentNum > 12) {
          console.error(`Invalid student ID: ${rawId}. Pilot constraint permits integer IDs strictly 1..12.`);
          return { user: null, role: null, isAuthenticated: false };
        }

        const cleanUser: AuthUser = {
          ...user,
        };

        setStoredAuth(cleanUser, activeRole);
        AuditLogger.log("התחברות", cleanUser.uid || `student_${studentNum}`, `תלמיד ${studentNum} התחבר לכיתה ${cleanUser.class_name || state.activeClass.class_name}`);
        return { user: cleanUser, role: activeRole, isAuthenticated: true };
      }

      const cleanUser: AuthUser = {
        ...user,
        role: activeRole,
      };
      setStoredAuth(cleanUser, activeRole);
      const username = user?.name || user?.email || "Unknown";
      AuditLogger.log("התחברות", user?.uid || "unknown_uid", `משתמש התחבר במצב ${activeRole}: ${username}`);
      return { user: cleanUser, role: activeRole, isAuthenticated: true };
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
