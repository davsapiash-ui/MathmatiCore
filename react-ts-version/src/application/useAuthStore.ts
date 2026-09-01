import { create } from "zustand";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import { auth, database } from "@/infrastructure/firebase";
import { ref, update } from "firebase/database";
import { useStore } from "@/application/useStore";
import { useWorkspaceStore } from "@/application/useWorkspaceStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useChatStore, normalizeStudentId } from "@/application/useChatStore";
import { validateZeroPIIPayload, containsPII } from "@/core/security/PiiFilter";
import { indexedDBQueue } from "@/infrastructure/services/IndexedDBQueue";

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

// 5 minutes student window-close / inactivity disconnect limit
export const STUDENT_WINDOW_CLOSE_TIMEOUT_MS = 5 * 60 * 1000;

export const STORAGE_KEY_USER = 'mc_auth_user';
export const STORAGE_KEY_ROLE = 'mc_auth_role';
export const STORAGE_KEY_TIMESTAMP = 'mc_auth_time';
export const STORAGE_KEY_STUDENT_LAST_ACTIVE = 'mc_student_last_active';
export const STORAGE_KEY_STUDENT_WINDOW_CLOSED = 'mc_student_window_closed';

export function touchStudentActivity() {
  try {
    const now = Date.now().toString();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_STUDENT_LAST_ACTIVE, now);
      localStorage.removeItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED);
    }
  } catch {}
}

export function stampStudentWindowClosed() {
  try {
    const now = Date.now().toString();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED, now);
    }
  } catch {}
}

const getGlobalStorage = (): Storage | null => {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
  } catch {
    return null;
  }
};

const getStoredAuth = () => {
  try {
    let rawUser: string | null = null;
    let rawRole: string | null = null;
    let rawTime: string | null = null;
    let rawLastActive: string | null = null;
    let rawWindowClosed: string | null = null;

    if (typeof sessionStorage !== 'undefined') {
      rawUser = sessionStorage.getItem(STORAGE_KEY_USER);
      rawRole = sessionStorage.getItem(STORAGE_KEY_ROLE);
      rawTime = sessionStorage.getItem(STORAGE_KEY_TIMESTAMP);
    }
    if ((!rawUser || !rawRole) && typeof localStorage !== 'undefined') {
      rawUser = localStorage.getItem(STORAGE_KEY_USER);
      rawRole = localStorage.getItem(STORAGE_KEY_ROLE);
      rawTime = localStorage.getItem(STORAGE_KEY_TIMESTAMP);
    }
    if (typeof localStorage !== 'undefined') {
      rawLastActive = localStorage.getItem(STORAGE_KEY_STUDENT_LAST_ACTIVE);
      rawWindowClosed = localStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED);
    }

    if (rawUser && rawRole) {
      const parsed = JSON.parse(rawUser);
      const authTime = rawTime ? parseInt(rawTime, 10) : Date.now();
      const now = Date.now();

      // Student 5-minute disconnect check (after window closure or inactivity)
      if (rawRole === 'student') {
        const lastClosed = rawWindowClosed ? parseInt(rawWindowClosed, 10) : null;
        const lastActive = rawLastActive ? parseInt(rawLastActive, 10) : null;

        if (lastClosed && now - lastClosed > STUDENT_WINDOW_CLOSE_TIMEOUT_MS) {
          clearStoredAuth();
          return { user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false, isRoleLocked: false, showRoleSelector: false, authTimestamp: null };
        }
        if (lastActive && now - lastActive > STUDENT_WINDOW_CLOSE_TIMEOUT_MS) {
          clearStoredAuth();
          return { user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false, isRoleLocked: false, showRoleSelector: false, authTimestamp: null };
        }
      }

      // Check 8-hour token expiration
      if (now - authTime > JWT_EXPIRY_MS) {
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
    const timeStr = (timestamp || Date.now()).toString();
    const userStr = JSON.stringify(user);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_USER, userStr);
      sessionStorage.setItem(STORAGE_KEY_ROLE, role);
      sessionStorage.setItem(STORAGE_KEY_TIMESTAMP, timeStr);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_USER, userStr);
      localStorage.setItem(STORAGE_KEY_ROLE, role);
      localStorage.setItem(STORAGE_KEY_TIMESTAMP, timeStr);
    }
  } catch (e) {
    console.error('Failed to store auth', e);
  }
};

const clearStoredAuth = () => {
  try {
    const keysToRemove = [
      STORAGE_KEY_USER,
      STORAGE_KEY_ROLE,
      STORAGE_KEY_TIMESTAMP,
      STORAGE_KEY_STUDENT_LAST_ACTIVE,
      STORAGE_KEY_STUDENT_WINDOW_CLOSED,
      'mathmaticore_auth_user',
      'mathmaticore_auth_role',
      'mathmaticore_auth_time',
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
      try { localStorage.removeItem(k); } catch {}
      try { sessionStorage.removeItem(k); } catch {}
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
  const currentUser = useAuthStore.getState().user;
  if (currentUser?.uid) {
    const normId = normalizeStudentId(currentUser.uid);
    const isSuperseded = useWorkspaceStore.getState().isSupersededByOtherDevice;
    if (!isSuperseded) {
      try {
        update(ref(database, `users/students/${normId}`), { isOnline: false, lastPing: 0 }).catch(() => {});
        if (normId !== currentUser.uid) {
          update(ref(database, `users/students/${currentUser.uid}`), { isOnline: false, lastPing: 0 }).catch(() => {});
        }
      } catch (e) {
        console.warn("Presence logout reset error:", e);
      }
    }
  }

  clearStoredAuth();
  indexedDBQueue.clearAll().catch((e) => console.warn("IndexedDB clear error:", e));
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
      const role = get().role || get().user?.role;
      const now = Date.now();

      if (role === 'student') {
        try {
          const lastClosedStr = localStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED);
          if (lastClosedStr) {
            const lastClosed = parseInt(lastClosedStr, 10);
            if (now - lastClosed > STUDENT_WINDOW_CLOSE_TIMEOUT_MS) return true;
          }
          const lastActiveStr = localStorage.getItem(STORAGE_KEY_STUDENT_LAST_ACTIVE);
          if (lastActiveStr) {
            const lastActive = parseInt(lastActiveStr, 10);
            if (now - lastActive > STUDENT_WINDOW_CLOSE_TIMEOUT_MS) return true;
          }
        } catch {}
      }

      const authTime = get().authTimestamp ?? get().user?.authTimestamp;
      if (!authTime) return false;
      return now - authTime > JWT_EXPIRY_MS;
    },

    setClass: (classInfo) =>
      set((state) => ({
        activeClass: {
          ...state.activeClass,
          ...classInfo,
        },
      })),

    setUser: (user, explicitRole) => set((state) => {
      const activeRole = explicitRole || (typeof user.role === 'string' ? user.role : 'teacher');

      // Validate Zero PII constraints strictly for anonymous students (Module 3 - Fail Closed)
      if (activeRole === 'student') {
        try {
          if (typeof user.name === 'string' && containsPII(user.name)) {
            console.error(`[Zero PII Security Fail-Closed] Student authentication rejected: PII detected in name (${user.name})`);
            return {
              user: null,
              role: null,
              isAuthenticated: false,
              isStudentAuthenticated: false,
              isRoleLocked: true,
              showRoleSelector: false,
              authTimestamp: null,
            };
          }
        } catch (piiErr) {
          console.error('[Zero PII Security Fail-Closed] Scanning error:', piiErr);
        }
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

      // Student ID Constraint Check (Strictly 1..12 Integer)
      if (activeRole === 'student') {
        let studentNum: number;
        if (typeof user.student_id === 'number') {
          studentNum = user.student_id;
        } else {
          const rawId = (user.uid || user.id || '').toString();
          // Extract numeric ID reliably
          const match = rawId.match(/(\d+)/);
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

        const normalizedStudentUser: AuthUser = {
          ...user,
          uid: user.uid || (user.id as string) || `student_user${studentNum}`,
          ...(user.student_id !== undefined ? { student_id: studentNum } : {}),
        };

        setStoredAuth(normalizedStudentUser, 'student', timestamp);
        touchStudentActivity();
        AuditLogger.log("התחברות", normalizedStudentUser.uid || `student_${studentNum}`, `תלמיד ${studentNum} התחבר לכיתה ${user.class_name || state.activeClass.class_name}`);
        return {
          user: normalizedStudentUser,
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
