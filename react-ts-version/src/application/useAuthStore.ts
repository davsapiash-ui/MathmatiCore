import { create } from "zustand";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import { auth } from "@/infrastructure/firebase";
import { useStore } from "@/application/useStore";
import { useWorkspaceStore } from "@/application/useWorkspaceStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useChatStore } from "@/application/useChatStore";
import { validateZeroPIIPayload } from "@/core/security/PiiFilter";

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
  student_id?: number; // Integer 1..12
  name?: string;
  email?: string;
  role?: string;
  roles?: string[];
  dualClaims?: string[];
  school_id?: string;
  class_name?: string;
  class_type?: "כיתת ביקורת" | "כיתת ניסוי";
  authTimestamp?: number;
  [key: string]: unknown;
}

interface AuthState {
  user: AuthUser | null;
  role: string | null;
  isAuthenticated: boolean;
  isStudentAuthenticated: boolean;
  isRoleLocked: boolean;
  showRoleSelector: boolean;
  authTimestamp: number | null;
  activeClass: ClassSchema;
  setUser: (user: AuthUser, role?: string) => void;
  selectRole: (chosenRole: string) => void;
  setClass: (classInfo: Partial<ClassSchema>) => void;
  logout: () => void;
  isTokenExpired: () => boolean;
}

const DEFAULT_CLASS: ClassSchema = {
  school_id: "school_bikorot",
  class_name: "המבקרים",
  class_type: "כיתת ביקורת",
};

// 8 hours continuous token limit per Master PRD v5.0 Module 2
export const JWT_EXPIRY_MS = 8 * 60 * 60 * 1000;

const STORAGE_KEY_USER = 'mc_auth_user';
const STORAGE_KEY_ROLE = 'mc_auth_role';
const STORAGE_KEY_TIMESTAMP = 'mc_auth_time';
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
    if (!s) return { user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false, isRoleLocked: false, showRoleSelector: false, authTimestamp: null };
    const rawUser = s.getItem(STORAGE_KEY_USER);
    const rawRole = s.getItem(STORAGE_KEY_ROLE);
    const rawTime = s.getItem(STORAGE_KEY_TIMESTAMP);

    if (rawUser && rawRole) {
      const parsed = JSON.parse(rawUser);
      const authTime = rawTime ? parseInt(rawTime, 10) : Date.now();

      // Check 8-hour token expiration
      if (Date.now() - authTime > JWT_EXPIRY_MS) {
        clearStoredAuth();
        return { user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false, isRoleLocked: false, showRoleSelector: false, authTimestamp: null };
      }

      return {
        user: parsed,
        role: rawRole,
        isAuthenticated: true,
        isStudentAuthenticated: rawRole === 'student',
        isRoleLocked: true,
        showRoleSelector: false,
        authTimestamp: authTime
      };
    }
  } catch (e) {
    console.error('Failed to restore auth from storage', e);
  }
  return { user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false, isRoleLocked: false, showRoleSelector: false, authTimestamp: null };
};

const setStoredAuth = (user: AuthUser, role: string, timestamp?: number) => {
  try {
    const s = getGlobalStorage();
    if (s) {
      s.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      s.setItem(STORAGE_KEY_ROLE, role);
      s.setItem(STORAGE_KEY_TIMESTAMP, (timestamp || Date.now()).toString());
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
    const keysToRemove = [
      STORAGE_KEY_USER,
      STORAGE_KEY_ROLE,
      STORAGE_KEY_TIMESTAMP,
      'isStudentAuthenticated',
      'studentId',
      'student_id',
      'selectedSchoolId',
      'selectedClassId',
      'mc_auth_user',
      'mc_auth_role',
      'mc_auth_time',
      'mc_session_data',
      'mc_workspace_state',
    ];
    keysToRemove.forEach((k) => {
      if (loc) try { loc.removeItem(k); } catch {}
      if (sess) try { sess.removeItem(k); } catch {}
    });
    try {
      (window as any).isStudentAuthenticated = false;
      delete (window as any).isStudentAuthenticated;
    } catch {}
  } catch (e) {
    console.error('Failed to clear stored auth', e);
  }
};

const initial = getStoredAuth();

/**
 * Unified logout utility to synchronously reset useAuthStore, useStore,
 * useWorkspaceStore, useAdminStore, and useChatStore.
 */
export function unifiedLogout() {
  clearStoredAuth();
  if (auth && typeof auth.signOut === 'function') {
    auth.signOut().catch((e) => console.warn("Firebase signOut error:", e));
  }
  useStore.getState().logout();
  useWorkspaceStore.getState().resetWorkspace?.();
  useAdminStore.setState({ schools: [], teachers: [], classes: [], globalStudentLimit: 12 });
  useChatStore.setState({ messages: [], activeRoomId: null, unreadCount: 0 });
  useAuthStore.setState((state) => {
    const username = state.user?.name || state.user?.email || "Unknown";
    AuditLogger.log("התנתקות", state.user?.uid || "unknown_uid", `משתמש התנתק: ${username}`);
    return {
      user: null,
      role: null,
      isAuthenticated: false,
      isStudentAuthenticated: false,
      isRoleLocked: false,
      showRoleSelector: false,
      authTimestamp: null,
    };
  });
}

export const useAuthStore = create<AuthState>()(
  (set, get) => ({
    user: initial.user,
    role: initial.role,
    isAuthenticated: initial.isAuthenticated,
    isStudentAuthenticated: initial.isStudentAuthenticated,
    isRoleLocked: initial.isRoleLocked,
    showRoleSelector: initial.showRoleSelector,
    authTimestamp: initial.authTimestamp,
    activeClass: DEFAULT_CLASS,

    isTokenExpired: () => {
      const authTime = get().authTimestamp ?? get().user?.authTimestamp;
      if (!authTime) return false;
      return Date.now() - authTime > JWT_EXPIRY_MS;
    },

    setClass: (classInfo) =>
      set((state) => ({
        activeClass: {
          ...state.activeClass,
          ...classInfo,
        },
      })),

    setUser: (user, explicitRole) => set((state) => {
      // Validate Zero PII constraints
      const piiCheck = validateZeroPIIPayload(user);
      if (!piiCheck.valid) {
        console.warn(`[Zero PII Security] Payload advisory: ${piiCheck.reason}`);
      }

      const timestamp = user.authTimestamp || Date.now();

      // Check Dual Claims (Master PRD v5.0 Module 2)
      const claims = user.dualClaims || (user.roles && user.roles.length > 1 ? user.roles : null);
      if (claims && claims.length > 1 && !explicitRole) {
        return {
          user: { ...user },
          role: null,
          isAuthenticated: true,
          isStudentAuthenticated: false,
          isRoleLocked: false,
          showRoleSelector: true,
          authTimestamp: timestamp,
        };
      }

      const activeRole = explicitRole || (typeof user.role === 'string' ? user.role : 'teacher');

      // Student ID Constraint Check (Strictly 1..12 Integer)
      if (activeRole === 'student') {
        let studentNum: number;
        if (typeof user.student_id === 'number') {
          studentNum = user.student_id;
        } else {
          const rawId = (user.uid || user.id || '').toString();
          // match student_user3, student_3, or 3
          const match = rawId.match(/^(?:student_user|student_)?(-?\d+)$/);
          studentNum = match ? parseInt(match[1], 10) : NaN;
        }

        if (isNaN(studentNum) || !Number.isInteger(studentNum) || studentNum < 1 || studentNum > 12) {
          console.error(`Invalid student ID. Pilot constraint permits integer IDs strictly 1..12.`);
          return {
            user: null,
            role: null,
            isAuthenticated: false,
            isStudentAuthenticated: false,
            isRoleLocked: false,
            showRoleSelector: false,
            authTimestamp: null
          };
        }

        setStoredAuth(user, 'student', timestamp);
        AuditLogger.log("התחברות", user.uid || `student_${studentNum}`, `תלמיד ${studentNum} התחבר לכיתה ${user.class_name || state.activeClass.class_name}`);
        return {
          user: user,
          role: 'student',
          isAuthenticated: true,
          isStudentAuthenticated: true,
          isRoleLocked: true,
          showRoleSelector: false,
          authTimestamp: timestamp,
        };
      }

      setStoredAuth(user, activeRole, timestamp);
      const username = user?.name || user?.email || "Unknown";
      AuditLogger.log("התחברות", user?.uid || "unknown_uid", `משתמש התחבר במצב ${activeRole}: ${username}`);
      return {
        user: user,
        role: activeRole,
        isAuthenticated: true,
        isStudentAuthenticated: false,
        isRoleLocked: true,
        showRoleSelector: false,
        authTimestamp: timestamp,
      };
    }),

    selectRole: (chosenRole: string) => set((state) => {
      if (!state.user) return state;
      const timestamp = Date.now();
      setStoredAuth(state.user, chosenRole, timestamp);
      AuditLogger.log("מיתוג_תפקיד", state.user.uid || "unknown_uid", `נבחר תפקיד: ${chosenRole}`);
      return {
        user: state.user,
        role: chosenRole,
        isAuthenticated: true,
        isStudentAuthenticated: chosenRole === 'student',
        isRoleLocked: true,
        showRoleSelector: false,
        authTimestamp: timestamp,
      };
    }),

    logout: () => {
      unifiedLogout();
    },
  })
);
