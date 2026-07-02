// We will rely on Firebase Auto-Init in production or configure manual config for dev
// We are mimicking the auto-init behavior for the new React app.
// Alternatively, one can use standard Firebase JS SDK initializeApp here.

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// Temporary fallback config for Vite dev mode
const firebaseConfig = {
  projectId: "mathimaticore",
  // In production, Firebase Hosting auto-populates __/firebase/init.json
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app);
