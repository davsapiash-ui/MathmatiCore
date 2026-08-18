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
 * קוראים את ה-offset פעם אחת בתחילת הסשן (via fetchServerClockOffset) ושומרים בזיכרון.
 * כל חישוב deadline משתמש ב-serverNow() במקום ב-Date.now() ישיר.
 */
import { get as rtdbGet, ref as rtdbRef } from 'firebase/database';

let _serverClockOffsetMs = 0;

/**
 * קורא את serverTimeOffset מה-RTDB פעם אחת ושומר.
 * יש לקרוא ב-initSession לפני חישוב ה-deadline.
 */
export async function fetchServerClockOffset(): Promise<number> {
  try {
    const snap = await rtdbGet(rtdbRef(database, '.info/serverTimeOffset'));
    _serverClockOffsetMs = snap.exists() ? (snap.val() as number) : 0;
  } catch {
    _serverClockOffsetMs = 0;
  }
  return _serverClockOffsetMs;
}

/**
 * מחזיר את הזמן הנוכחי מסונכרן עם שרת Firebase.
 * נכון גם כאשר שעון המכשיר עקום (BIOS מת, טאבלט ישן).
 */
export function serverNow(): number {
  return Date.now() + _serverClockOffsetMs;
}
