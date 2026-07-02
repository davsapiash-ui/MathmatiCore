/**
 * Firebase initialization — config comes from environment variables only.
 * Real values live in .env.local (gitignored); see .env.example for the shape.
 * No secrets are ever committed: the web apiKey is not a secret, but we keep the
 * whole config external so environments (dev/pilot/prod) stay separable.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'dev-placeholder-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'mathimaticore.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'mathimaticore',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:000000000000:web:dev',
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
