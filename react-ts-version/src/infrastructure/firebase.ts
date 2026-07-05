/**
 * Firebase initialization — config comes from environment variables only.
 * Real values live in .env.local (gitignored); see .env.example for the shape.
 * No secrets are ever committed: the web apiKey is not a secret, but we keep the
 * whole config external so environments (dev/pilot/prod) stay separable.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDupqh8inn1tZ1p-KIzV3RIMst7IdpUYPw",
  authDomain: "mathimaticore.firebaseapp.com",
  databaseURL: "https://mathimaticore-default-rtdb.firebaseio.com",
  projectId: "mathimaticore",
  storageBucket: "mathimaticore.firebasestorage.app",
  messagingSenderId: "589828360805",
  appId: "1:589828360805:web:b5e882cf4d3253107bd48c",
  measurementId: "G-3GR3S7J9M1"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);

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
