import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  // Use your real config here or rely on firebase hosting reserved URLs if deployed.
  // For local Vite dev, we need the actual config.
  // We will assume window._firebaseConfig exists if injected, or we mock it for now.
};

// If firebase is injected globally via Hosting
export const app = typeof window !== 'undefined' && window.firebase ? window.firebase.app() : initializeApp(firebaseConfig);
export const database = getDatabase(app);
