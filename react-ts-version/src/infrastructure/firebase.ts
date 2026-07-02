// We will rely on Firebase Auto-Init in production or configure manual config for dev
// We are mimicking the auto-init behavior for the new React app.
// Alternatively, one can use standard Firebase JS SDK initializeApp here.

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// Temporary fallback config for Vite dev mode
const firebaseConfig = {
  projectId: "mathimaticore",
  apiKey: "dummy-key-to-prevent-crash", // Required by getAuth even if not used yet
  appId: "1:1234567890:web:abcdef"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);

// getAuth throws if apiKey is completely missing or empty
let authInstance;
try {
  authInstance = getAuth(app);
} catch {
  console.warn("Firebase Auth init failed (likely missing real API key). Using mock auth.");
  authInstance = {} as any;
}

export const auth = authInstance;
