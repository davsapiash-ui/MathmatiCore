import { create } from "zustand";
import { AuditLogger } from "@/infrastructure/services/AuditLogger";
import { auth, authReady, functions } from "@/infrastructure/firebase";
import { httpsCallable } from "firebase/functions";
import { rtdbUpdateNow } from "@/infrastructure/services/ThrottledRtdbWriter";
import { useStore } from "@/application/useStore";
import { useWorkspaceStore } from "@/application/useWorkspaceStore";
import { useAdminStore } from "@/application/useAdminStore";
import { useChatStore, normalizeStudentId, stopChatSync } from "@/application/useChatStore";
import { containsPII } from "@/core/security/PiiFilter";
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
  authTimestamp: number | null;
  activeClass: ClassSchema;
  setUser: (user: AuthUser, role?: string) => void;
  setClass: (classInfo: Partial<ClassSchema>) => void;
  /** Resolves once the Firebase identity has been released too (see unifiedLogout). */
  logout: () => Promise<void>;
  isTokenExpired: () => boolean;
}

const DEFAULT_CLASS: ClassSchema = {
  school_id: "school_bikorot",
  class_name: "המבקרים",
  class_type: "כיתת ביקורת",
};

// 8 hours from sign-in or role selection, every role, by the device clock:
// the owner's decision of 28.9.2026 (register, "החלטות בעל המוצר במקום שהאפיון
// שותק", יג). PRD 7.3 Module 2 §ג sets no duration. Do not shorten it.
export const JWT_EXPIRY_MS = 8 * 60 * 60 * 1000;

// 5 minutes student window-close / inactivity disconnect limit
export const STUDENT_WINDOW_CLOSE_TIMEOUT_MS = 5 * 60 * 1000;

export const STORAGE_KEY_USER = 'mc_auth_user';
export const STORAGE_KEY_ROLE = 'mc_auth_role';
export const STORAGE_KEY_TIMESTAMP = 'mc_auth_time';
export const STORAGE_KEY_STUDENT_LAST_ACTIVE = 'mc_student_last_active';
export const STORAGE_KEY_STUDENT_WINDOW_CLOSED = 'mc_student_window_closed';
/** Last staff activity in ANY tab of this browser (useIdleTimeout's shared 30-minute limit). */
export const STORAGE_KEY_STAFF_LAST_ACTIVE = 'mc_staff_last_active';

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

/**
 * The role of a stored sign-in that expired while no page was open, noticed as
 * this page loads (the 8-hour limit, a learner's closed window). Clearing the
 * storage is not the whole sign-out: the Firebase identity is still on the
 * device — for staff the Google session itself, which also made the login page
 * refuse the next learner ("בדפדפן הזה מחובר איש צוות"). PRD Module 2 §ג: on
 * expiry, "מחיקת אסמכתת ההזדהות". releaseIdentityDroppedAtLoad() finishes it.
 */
let droppedAtLoad: string | null = null;

const getStoredAuth = () => {
  try {
    let rawUser: string | null = null;
    let rawRole: string | null = null;
    let rawTime: string | null = null;
    let rawWindowClosed: string | null = null;
    let rawLastActive: string | null = null;
    // sessionStorage belongs to this tab: it survives a reload and a device
    // that slept, and a new window or tab starts without it.
    let restoredFromThisTab = false;

    if (typeof sessionStorage !== 'undefined') {
      rawUser = sessionStorage.getItem(STORAGE_KEY_USER);
      rawRole = sessionStorage.getItem(STORAGE_KEY_ROLE);
      rawTime = sessionStorage.getItem(STORAGE_KEY_TIMESTAMP);
      restoredFromThisTab = Boolean(rawUser && rawRole);
    }
    if ((!rawUser || !rawRole) && typeof localStorage !== 'undefined') {
      rawUser = localStorage.getItem(STORAGE_KEY_USER);
      rawRole = localStorage.getItem(STORAGE_KEY_ROLE);
      rawTime = localStorage.getItem(STORAGE_KEY_TIMESTAMP);
    }
    if (typeof localStorage !== 'undefined') {
      rawWindowClosed = localStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED);
      rawLastActive = localStorage.getItem(STORAGE_KEY_STUDENT_LAST_ACTIVE);
    }

    if (rawUser && rawRole) {
      const parsed = JSON.parse(rawUser);
      const authTime = rawTime ? parseInt(rawTime, 10) : Date.now();
      const now = Date.now();

      // Student 5-minute disconnect check: after a genuine window close only
      if (rawRole === 'student') {
        const lastClosed = rawWindowClosed ? parseInt(rawWindowClosed, 10) : null;

        if (lastClosed && now - lastClosed > STUDENT_WINDOW_CLOSE_TIMEOUT_MS) {
          clearStoredAuth();
          droppedAtLoad = rawRole;
          return { user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false, isRoleLocked: false, authTimestamp: null };
        }
        // A window can close without pagehide: swiped away in a tablet's app
        // switcher, a browser crash, a dead battery. On a shared tablet the
        // next child would then continue as the previous learner for up to
        // 8 hours. Such a close leaves a new window behind — no auth record
        // in this tab's sessionStorage — and a presence stamp that stopped.
        // Register: "וחלון שנסגר באמת עדיין מטופל".
        //
        // The same stamp stops while a device sleeps or its screen is locked,
        // but that tab keeps its sessionStorage (also through a reload on
        // wake), so sleep never signs a learner out (register: "הטיימר הוסר
        // עבור לומדים"; Module 14 §ב1).
        const lastActive = rawLastActive ? parseInt(rawLastActive, 10) : null;
        if (!restoredFromThisTab && lastActive && now - lastActive > STUDENT_WINDOW_CLOSE_TIMEOUT_MS) {
          clearStoredAuth();
          droppedAtLoad = rawRole;
          return { user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false, isRoleLocked: false, authTimestamp: null };
        }
      }

      // Check 8-hour token expiration
      if (now - authTime > JWT_EXPIRY_MS) {
        clearStoredAuth();
        droppedAtLoad = rawRole;
        return { user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false, isRoleLocked: false, authTimestamp: null };
      }

      // A learner restored from localStorage in a new tab: mark this tab as
      // theirs, with the same keys setStoredAuth writes. Otherwise the tab
      // stays unmarked for its whole life, and a later sleep with a reload on
      // wake would look like a new window and sign the learner out — the very
      // sleep sign-out the check above must never cause.
      if (rawRole === 'student' && !restoredFromThisTab && typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem(STORAGE_KEY_USER, rawUser);
          sessionStorage.setItem(STORAGE_KEY_ROLE, rawRole);
          sessionStorage.setItem(STORAGE_KEY_TIMESTAMP, rawTime ?? authTime.toString());
        } catch {
          // Storage unavailable: nothing to mark; the sign-in itself stands.
        }
      }

      return {
        user: parsed,
        role: rawRole,
        isAuthenticated: true,
        isStudentAuthenticated: rawRole === 'student',
        isRoleLocked: true,
        authTimestamp: authTime
      };
    }
  } catch (e) {
    console.error('Failed to restore auth from storage', e);
  }
  return { user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false, isRoleLocked: false, authTimestamp: null };
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
      STORAGE_KEY_STAFF_LAST_ACTIVE,
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
      // X13: the coaching card's 30-second lock is stored per device, not per
      // learner — left behind, it locked the next learner's card buttons.
      'mc_socratic_penalty_until',
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
/**
 * מספר התלמיד המחובר (1-12), או null אם אי אפשר לקבוע אותו.
 *
 * שדה student_id עבר אימות 1-12 בכניסה, ולכן הוא המקור. מזהה ה-Auth הגולמי
 * משמש רק כשהוא בצורה מוכרת (student_user{N} / student_{N} / {N}); מזהה
 * אקראי שבמקרה יש בו ספרה לא ייחשב כמספר תלמיד. זו בדיוק הנקודה שבה לומד
 * אחד היה יכול להיכתב על נתוני לומד אחר.
 */
export function currentStudentNumber(): number | null {
  return studentNumberOf(useAuthStore.getState().user);
}

function studentNumberOf(u: AuthUser | null | undefined): number | null {
  const fromField = Number(u?.student_id);
  if (Number.isInteger(fromField) && fromField >= 1 && fromField <= 12) return fromField;

  const raw = String(u?.uid ?? u?.id ?? '').trim().toLowerCase();
  const m = /^(?:student_user|student_|user)?(\d{1,2})$/.exec(raw);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 12 ? n : null;
}

/**
 * מזהה הלומד המחובר בצורה הקנונית student_user{N}, או מחרוזת ריקה.
 * מחרוזת ריקה חייבת להיבדק על ידי הקורא — אסור להמשיך עם מזהה מומצא.
 */
export function currentStudentUid(): string {
  return studentUidOf(useAuthStore.getState().user);
}

/**
 * The same canonical id for a given user, as a pure function. A component
 * that must follow sign-in and sign-out selects it from the store —
 * useAuthStore((s) => studentUidOf(s.user)) — because currentStudentUid()
 * reads the store once and does not re-render anything when the learner changes.
 */
export function studentUidOf(u: AuthUser | null | undefined): string {
  const n = studentNumberOf(u);
  return n === null ? '' : `student_user${n}`;
}

/** How long sign-out waits for the offline queue to reach the server before releasing the identity. */
const LOGOUT_FLUSH_BUDGET_MS = 4000;

/** FNV-1a — the queue records whose item it is without storing a staff uid on the device. */
function shortHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Module 17: the identity a queued item belongs to (IndexedDBQueue
 * QueuedAction.owner). Unsent items outlive sign-out, so the queue must know
 * which of them the identity signed in now can deliver: a learner by number,
 * staff by role and a hash of the Firebase uid (never the uid or address itself).
 */
export function queueOwnerOf(
  state: Pick<AuthState, 'user' | 'role' | 'isAuthenticated' | 'isStudentAuthenticated'>
): string | null {
  if (!state.isAuthenticated || !state.user) return null;
  if (state.isStudentAuthenticated || state.role === 'student') {
    const n = studentNumberOf(state.user);
    return n === null ? null : `student:${n}`;
  }
  const uid = String(state.user.uid ?? state.user.id ?? '');
  return uid ? `${state.role ?? 'staff'}:${shortHash(uid)}` : null;
}

type FirebaseIdentity = {
  isAnonymous?: boolean;
  email?: string | null;
  getIdToken?: (force: boolean) => Promise<string>;
};

function currentFirebaseUser(): FirebaseIdentity | null {
  return auth && 'currentUser' in auth ? (auth as { currentUser: FirebaseIdentity | null }).currentUser : null;
}

/**
 * Releases the Firebase identity of a session that has ended.
 *
 * Module 1: a learner's Firebase user is anonymous. It stays on the device and
 * is reused by the next sign-in — only the student claims are released on the
 * server. Signing it out (as this used to) made every next sign-in create a new
 * anonymous account, and twelve laptops behind one classroom IP then hit
 * Firebase's TOO_MANY_ATTEMPTS_TRY_LATER: no learner could sign in at all.
 * Teachers and admins sign in with Google and are signed out for real.
 */
async function releaseFirebaseIdentity(firebaseUser: FirebaseIdentity | null): Promise<void> {
  if (!firebaseUser) return;
  if (firebaseUser.isAnonymous) {
    await httpsCallable(functions, 'releaseStudentSession')({})
      .then(async () => {
        // Refresh so the now-claimless token is what the next reader sees.
        if (typeof firebaseUser.getIdToken === 'function') await firebaseUser.getIdToken(true);
      })
      .catch((e: { code?: string }) => console.warn('releaseStudentSession:', e?.code ?? e));
  } else if (auth && typeof auth.signOut === 'function') {
    await auth.signOut().catch((e) => console.warn("Firebase signOut error:", e));
  }
}

export interface LogoutOptions {
  /**
   * Firebase already ended this session elsewhere (reconcileWithFirebaseUser):
   * only this tab's part of the sign-out runs. Nothing is sent and the Firebase
   * user — anonymous now, or someone else — is not touched.
   */
  thisTabOnly?: boolean;
}

/**
 * Signs out: this tab's state at once, the Firebase identity once the offline
 * queue has had its chance. The promise settles when the identity has been
 * released, so a caller that leaves the page right after (ErrorBoundary)
 * waits for it instead of unloading the page in the middle of the sign-out.
 */
export function unifiedLogout(options: LogoutOptions = {}): Promise<void> {
  const { user: currentUser, role, isStudentAuthenticated } = useAuthStore.getState();
  const wasLearner = isStudentAuthenticated || role === 'student';
  // The presence reset is a learner's: users/students holds the twelve learners
  // only. A teacher's sign-out used to write users/students/teacher_… here
  // (normalizeStudentId keeps a staff id as it is), a fake thirteenth learner
  // that then travelled into the research backups (Module 3: zero-PII, learners
  // 1–12 only).
  if (wasLearner && !options.thisTabOnly && currentUser?.uid) {
    const normId = normalizeStudentId(currentUser.uid);
    const isSuperseded = useWorkspaceStore.getState().isSupersededByOtherDevice;
    if (!isSuperseded) {
      try {
        // Sent now, merged with anything still pending on the record (PRD 18 throttle).
        rtdbUpdateNow(`users/students/${normId}`, { isOnline: false, lastPing: 0 }).catch(() => {});
        if (normId !== currentUser.uid) {
          rtdbUpdateNow(`users/students/${currentUser.uid}`, { isOnline: false, lastPing: 0 }).catch(() => {});
        }
      } catch (e) {
        console.warn("Presence logout reset error:", e);
      }
    }
  }

  clearStoredAuth();
  const firebaseUser = currentFirebaseUser();
  // Module 17 §ג step 4: a queued item is deleted only after the server took it.
  // The queue is sent first, as the identity that is signing out and while the
  // claims that authorise the write still exist; only then is the identity
  // released. What did not reach the server in that time — every item, when
  // the device is offline — STAYS in IndexedDB and is sent on this identity's
  // next sign-in on this device (QueuedAction.owner). Sign-out used to clear
  // the queue here whether or not anything had been acknowledged, and so
  // erased an offline meeting's telemetry, its recording chunks and a
  // teacher's queued messages. Manual sign-out, the 8-hour limit, the learner
  // inactivity expiry and role switches all come through here; none of them
  // deletes unsent data. A tab whose session Firebase already ended sends
  // nothing: that identity is gone, and its items wait for its next sign-in.
  const released: Promise<void> = options.thisTabOnly
    ? Promise.resolve()
    : indexedDBQueue
        .flushWithin(LOGOUT_FLUSH_BUDGET_MS, queueOwnerOf(useAuthStore.getState()))
        .catch(() => undefined)
        .then(() => {
          // Someone signed in again while the queue was being sent: the Firebase
          // user now belongs to that session. Leave it alone.
          if (useAuthStore.getState().isAuthenticated) return;
          return releaseFirebaseIdentity(firebaseUser);
        });
  // The auth store is cleared FIRST. FirebaseSyncService listens to it and
  // tears down its workspace → RTDB subscription synchronously on sign-out;
  // only then is the workspace reset. Resetting before that, as this used to,
  // pushed the blank session-1 state (exercise 1, empty board) through the
  // live subscription over the learner's saved progress — in RTDB and in the
  // local cache — so the next sign-in restarted meeting 1 from the beginning.
  useAuthStore.setState((state) => {
    // The tab that signed out already logged it; this one's identity is gone.
    if (!options.thisTabOnly) {
      const username = state.user?.name || state.user?.email || "Unknown";
      AuditLogger.log("התנתקות", state.user?.uid || "unknown_uid", `משתמש התנתק: ${username}`);
    }
    return {
      user: null,
      role: null,
      isAuthenticated: false,
      isStudentAuthenticated: false,
      isRoleLocked: false,
      authTimestamp: null,
    };
  });
  useStore.getState().logout();
  useWorkspaceStore.getState().resetWorkspace?.();
  useAdminStore.setState({ schools: [], teachers: [], classes: [], globalStudentLimit: 12 });
  stopChatSync();
  useChatStore.setState({ messages: [], activeRoomId: null, unreadCount: 0 });
  return released;
}

/**
 * PRD Module 2 §ג: the route guards read "a Single Source of Truth via Zustand
 * backed by Firebase Auth state", and an inconsistent user state forces a
 * redirect. There is one Firebase user per browser profile, shared by every
 * tab, while this store is per tab. A staff sign-out in one tab — the button,
 * or the 30-minute idle limit in the projector window — signs every tab out of
 * Firebase, and firebase.ts then signs each of them in anonymously. The other
 * tabs used to go on saying "teacher": every listener refused, every write
 * failed, and "נסו שוב" reloaded the same stale teacher from sessionStorage.
 *
 * So a staff tab whose Firebase user stops being its user ends its own session
 * here: store, this tab's storage and every listener that follows the store.
 * The route guard (App.tsx AuthGuard) then sends the tab to /login. The same
 * check runs once as a page loads, so a stored staff session whose Firebase
 * user is anonymous is not restored as staff. Learners are left alone: their
 * anonymous user is shared on purpose (Module 1), and only claims move.
 */
let sawStaffFirebaseUser = false;

export function reconcileWithFirebaseUser(firebaseUser: FirebaseIdentity | null): void {
  const hadStaffUser = sawStaffFirebaseUser;
  sawStaffFirebaseUser = Boolean(firebaseUser && !firebaseUser.isAnonymous);

  const { isAuthenticated, isStudentAuthenticated, role, user } = useAuthStore.getState();
  if (!isAuthenticated || isStudentAuthenticated || role === 'student') return;

  let ended: boolean;
  if (!firebaseUser) {
    // Signed out, in this tab or another. A null that follows no staff user is
    // Firebase still starting (the anonymous sign-in comes next and is judged
    // then) or a device that cannot reach it — nothing to decide on.
    ended = hadStaffUser;
  } else if (firebaseUser.isAnonymous) {
    ended = true;
  } else {
    // Another staff account signed in on this browser.
    const stored = String(user?.email ?? '').toLowerCase().trim();
    const actual = String(firebaseUser.email ?? '').toLowerCase().trim();
    ended = Boolean(stored && actual && stored !== actual);
  }
  if (ended) void unifiedLogout({ thisTabOnly: true });
}

type LearnerFirebaseIdentity = FirebaseIdentity & {
  getIdTokenResult?: (force: boolean) => Promise<{ claims: Record<string, unknown> }>;
};

let learnerClaimsCheck: Promise<void> | null = null;
/** When the claims were last found right — a write refused again soon after does not ask the server again. */
let learnerClaimsOkAt = 0;
/** How long a confirmed check stands. */
export const LEARNER_CLAIMS_RECHECK_MS = 30_000;

/**
 * PRD Module 2 §א/§ג for a learner tab. The anonymous Firebase user is shared
 * by every tab on the device and only its claims move: a sign-out in another
 * tab releases them, a sign-in there stamps another learner's. A tab still
 * holding learner N then has every write refused — and the refusal's event,
 * 'firebase:auth_expired', had no listener, so the tab stayed on the exercise
 * and nothing the child did was saved.
 *
 * On that event the server's claims are read fresh. When they no longer name
 * this tab's learner, this tab's session ends here, the way a staff tab's does
 * (reconcileWithFirebaseUser): this tab only — nothing sent, the Firebase user
 * and its new claims left alone — and the route guard takes the tab to the
 * sign-in. A refusal with the claims still right (a write the rules refuse for
 * another reason), or no answer from the server, ends nothing.
 */
export function reconcileLearnerClaims(): Promise<void> {
  const { isStudentAuthenticated, role } = useAuthStore.getState();
  if (!isStudentAuthenticated && role !== 'student') return Promise.resolve();
  if (learnerClaimsCheck) return learnerClaimsCheck;
  if (Date.now() - learnerClaimsOkAt < LEARNER_CLAIMS_RECHECK_MS) return Promise.resolve();
  const expected = currentStudentNumber();
  const firebaseUser = currentFirebaseUser() as LearnerFirebaseIdentity | null;
  if (!firebaseUser || expected === null) return Promise.resolve();

  learnerClaimsCheck = (async () => {
    let ended: boolean;
    if (!firebaseUser.isAnonymous) {
      // A staff account signed in on this browser: learner claims never go on it.
      ended = true;
    } else if (typeof firebaseUser.getIdTokenResult !== 'function') {
      return;
    } else {
      const { claims } = await firebaseUser.getIdTokenResult(true);
      ended = claims.role !== 'student' || Number(claims.student_id) !== expected;
    }
    if (!ended) {
      learnerClaimsOkAt = Date.now();
      return;
    }
    // Only the session this check was about: a new sign-in in this tab meanwhile is not touched.
    if (currentStudentNumber() === expected) void unifiedLogout({ thisTabOnly: true });
  })()
    .catch(() => {})
    .finally(() => {
      learnerClaimsCheck = null;
    });
  return learnerClaimsCheck;
}

export const useAuthStore = create<AuthState>()(
  (set, get) => ({
    user: initial.user,
    role: initial.role,
    isAuthenticated: initial.isAuthenticated,
    isStudentAuthenticated: initial.isStudentAuthenticated,
    isRoleLocked: initial.isRoleLocked,
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
          // No comparison with the presence stamp: a device that slept or
          // locked its screen for five minutes did not close the window
          // (register: "הטיימר הוסר עבור לומדים"; Module 14 §ב1).
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
              authTimestamp: null,
            };
          }
        } catch (piiErr) {
          console.error('[Zero PII Security Fail-Closed] Scanning error:', piiErr);
        }
      }

      const timestamp = user.authTimestamp || Date.now();

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
        authTimestamp: timestamp,
      };
    }),

    logout: () => unifiedLogout(),
  })
);

/** How often, and how many times, the wait for firebase.ts is repeated (5 seconds in all). */
const FIREBASE_LOAD_RETRY_MS = 20;
const FIREBASE_LOAD_RETRIES = 250;

/**
 * Runs `run` once firebase.ts has finished loading. The two modules import
 * each other: firebase.ts re-exports FirebaseSyncService, which imports this
 * store. When the app enters through firebase.ts (App.tsx does), this file's
 * body runs BEFORE firebase.ts has initialised `auth` and `authReady`, and
 * reading either throws. The listener below used to be attached right here,
 * inside a try/catch: the read threw on every page load, the catch logged a
 * warning, and reconcileWithFirebaseUser never ran — a dashboard whose
 * sign-in had ended in another window stayed open and dead.
 */
function whenFirebaseLoaded(run: () => void, retriesLeft = FIREBASE_LOAD_RETRIES): void {
  let loaded = false;
  try {
    loaded = Boolean(auth);
  } catch {
    // firebase.ts is still loading.
  }
  if (loaded) {
    run();
  } else if (retriesLeft > 0) {
    setTimeout(() => whenFirebaseLoaded(run, retriesLeft - 1), FIREBASE_LOAD_RETRY_MS);
  } else {
    console.warn('[useAuthStore] Firebase auth listener unavailable.');
  }
}

// Firebase Auth is the other half of the single source of truth (Module 2 §ג):
// follow it, including the sign-outs of other tabs. The method form keeps a
// stubbed auth (no real config, tests) harmless.
whenFirebaseLoaded(() => {
  try {
    const firebaseAuth = auth as { onAuthStateChanged?: (cb: (u: FirebaseIdentity | null) => void) => unknown };
    if (typeof firebaseAuth.onAuthStateChanged === 'function') {
      firebaseAuth.onAuthStateChanged((u) => reconcileWithFirebaseUser(u));
    }
  } catch (e) {
    console.warn('[useAuthStore] Firebase auth listener unavailable:', e);
  }
});
// A write refused for lack of permission (FirebaseSyncService.handlePermissionOrAuthError).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('firebase:auth_expired', () => {
    void reconcileLearnerClaims();
  });
}

/**
 * The second half of an expiry noticed at page load (droppedAtLoad): release
 * the Firebase identity of the kind that expired, once Firebase has restored
 * it. A stored learner record releases an anonymous user's claims; a stored
 * staff record signs the Google session out. Neither touches the other kind,
 * and nothing is touched if someone has signed in since.
 */
function releaseIdentityDroppedAtLoad(): void {
  const role = droppedAtLoad;
  droppedAtLoad = null;
  if (!role) return;
  // authReady is firebase.ts's too (see whenFirebaseLoaded).
  whenFirebaseLoaded(() => {
    Promise.resolve(authReady)
      .then(() => {
        if (useAuthStore.getState().isAuthenticated) return;
        const firebaseUser = currentFirebaseUser();
        if (!firebaseUser) return;
        if ((role === 'student') !== Boolean(firebaseUser.isAnonymous)) return;
        return releaseFirebaseIdentity(firebaseUser);
      })
      .catch(() => {});
  });
}
releaseIdentityDroppedAtLoad();

// Module 17: the offline queue sends only the items of whoever is signed in,
// and recounts and sends that identity's backlog on every sign-in.
indexedDBQueue.registerOwnerResolver(() => queueOwnerOf(useAuthStore.getState()));
useAuthStore.subscribe(() => indexedDBQueue.notifyOwnerChanged());
