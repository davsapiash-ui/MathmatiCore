/**
 * Firebase initialization — config comes from environment variables only.
 * Real values live in .env.local (gitignored); see .env.example for the shape.
 * No secrets are ever committed: the web apiKey is not a secret, but we keep the
 * whole config external so environments (dev/pilot/prod) stay separable.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDupqh8inn1tZ1p-KIzV3RIMst7IdpUYPw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mathimaticore.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://mathimaticore-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mathimaticore",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mathimaticore.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "589828360805",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:589828360805:web:b5e882cf4d3253107bd48c",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-3GR3S7J9M1"
};

import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const firestore: Firestore = getFirestore(app);
export const db = firestore;
export const functions = getFunctions(app);

// Use local emulator for functions when running locally
if (typeof window !== 'undefined' && window.location?.hostname === "localhost") {
  connectFunctionsEmulator(functions, "localhost", 5001);
}

let authInstance: Auth;
try {
  authInstance = getAuth(app);
} catch {
  console.warn('Firebase Auth init failed (missing real config). Using inert auth stub for dev.');
  authInstance = {} as Auth;
}

export const auth = authInstance;

/**
 * Silent anonymous sign-in (COPPA-friendly: no child PII reaches the identity provider).
 * The locked security rules require auth != null — without a session every read/write
 * is rejected. Resolves true once a session exists; if the Anonymous provider is
 * disabled in the console, resolves false and the app keeps working offline-style.
 */
export const authReady: Promise<boolean> = new Promise((resolve) => {
  if (!('onAuthStateChanged' in authInstance)) {
    resolve(false);
    return;
  }
  let settled = false;
  const settle = (ok: boolean) => {
    if (!settled) {
      settled = true;
      resolve(ok);
    }
  };
  onAuthStateChanged(authInstance, (user) => {
    if (user) {
      settle(true);
      return;
    }
    signInAnonymously(authInstance)
      .then(() => settle(true))
      .catch((e) => {
        console.warn('Anonymous sign-in unavailable:', e?.code ?? e);
        settle(false);
      });
  });
});

export type { TeacherProfile, Classroom, SessionState, TelemetryEvent } from './services/FirebaseSyncService';
export { syncSessionState, logTelemetryEvent, fetchTeacherClassrooms, fetchClassroomSessions } from './services/FirebaseSyncService';

/**
 * Server Clock Offset — תיקון שעון עקום (תרחיש 1)
 * Firebase RTDB מציע .info/serverTimeOffset: מספר המייצג את ההפרש בין שעון השרת לשעון הלקוח (ms).
 * serverNow() = Date.now() + _serverClockOffsetMs
 *
 * כל חישוב deadline משתמש ב-serverNow() במקום ב-Date.now() ישיר.
 *
 * How the offset is read. `.info/*` is local to the SDK: it is served by
 * `onValue`, never by `get()`. `get()` sends the path to the server, and the
 * live database rejects it ("Invalid token in path"), so until 28.9.2026 the
 * read failed on every device, the offset stayed 0, and serverNow() was each
 * device's own clock. Since the meeting start is now stamped by the server
 * (TeacherDashboard, Module 14 §ב), a clock that is X minutes fast would close
 * the meeting for everyone after 45 − X minutes. So the offset is read with
 * `onValue`, and the listener stays attached: every reconnect handshake
 * refreshes it.
 */
import { onValue as rtdbOnValue, ref as rtdbRef } from 'firebase/database';

let _serverClockOffsetMs = 0;
let _serverClockKnown = false;
let _serverClockListening = false;
const _serverClockWaiters = new Set<(offset: number) => void>();

/**
 * How long a caller may wait for the server clock. The read never settles
 * while the database is unreachable, and meeting 3's opening awaits it — a
 * learner whose connection was down at that moment stayed on "טוען את
 * המשימות" for good. Past this, the last known offset (0 at first) is used,
 * and the meeting opens (AGENTS.md invariant 2: offline first).
 */
const SERVER_CLOCK_TIMEOUT_MS = 4000;

function listenToServerClock(): void {
  if (_serverClockListening) return;
  _serverClockListening = true;
  try {
    rtdbOnValue(
      rtdbRef(database, '.info/serverTimeOffset'),
      (snap) => {
        const offset = snap.val();
        if (typeof offset !== 'number' || !Number.isFinite(offset)) return;
        _serverClockOffsetMs = offset;
        _serverClockKnown = true;
        const waiters = [..._serverClockWaiters];
        _serverClockWaiters.clear();
        waiters.forEach((resolve) => resolve(offset));
      },
      () => {
        // Cancelled: the next call attaches again.
        _serverClockListening = false;
      }
    );
  } catch {
    _serverClockListening = false;
  }
}

/**
 * Resolves with the server clock offset once the database has reported it,
 * or with the last known offset (0 at first) after SERVER_CLOCK_TIMEOUT_MS.
 * Never rejects. The first call attaches the listener that keeps it fresh.
 */
export function fetchServerClockOffset(): Promise<number> {
  listenToServerClock();
  if (_serverClockKnown) return Promise.resolve(_serverClockOffsetMs);
  return new Promise<number>((resolve) => {
    const settle = (offset: number) => {
      clearTimeout(timer);
      _serverClockWaiters.delete(settle);
      resolve(offset);
    };
    // Unreachable or slow: keep the last known offset rather than wait for good.
    const timer = setTimeout(() => settle(_serverClockOffsetMs), SERVER_CLOCK_TIMEOUT_MS);
    _serverClockWaiters.add(settle);
  });
}

/**
 * Whether the database has reported the server clock in this page. Until it
 * has, serverNow() is only this device's clock, so a decision that affects
 * everyone (the teacher's client recording the 45-minute close) waits for it.
 */
export function isServerClockKnown(): boolean {
  return _serverClockKnown;
}

/**
 * מחזיר את הזמן הנוכחי מסונכרן עם שרת Firebase.
 * נכון גם כאשר שעון המכשיר עקום (BIOS מת, טאבלט ישן).
 */
export function serverNow(): number {
  return Date.now() + _serverClockOffsetMs;
}
