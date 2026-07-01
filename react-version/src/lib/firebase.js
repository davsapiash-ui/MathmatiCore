import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp, setDoc, doc } from "firebase/firestore";

// Your web app's Firebase configuration (Placeholder - needs real config from Firebase console)
// This uses environment variables that should be set in .env.local
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "mock-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mathmaticore.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mathmaticore-dev",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mathmaticore.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234:web:abcd"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Sync trace data and Q-Matrix results to Firestore
 */
export async function syncTraceData(studentId, qMatrixResults, traceData) {
  try {
    if (!studentId) throw new Error("Missing student ID");
    
    // Using a nested structure: students/{studentId}/sessions/{sessionId}
    const sessionRef = collection(db, "students", studentId, "sessions");
    
    await addDoc(sessionRef, {
      qMatrixResults,
      traceData,
      timestamp: serverTimestamp()
    });
    
    console.log(`Successfully synced trace data for student: ${studentId}`);
    return true;
  } catch (error) {
    console.error("Error syncing trace data to Firebase:", error);
    return false;
  }
}

export { db, app };
