import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, get, update, remove } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDupqh8inn1tZ1p-KIzV3RIMst7IdpUYPw",
  authDomain: "mathimaticore.firebaseapp.com",
  databaseURL: "https://mathimaticore-default-rtdb.firebaseio.com",
  projectId: "mathimaticore",
  storageBucket: "mathimaticore.firebasestorage.app",
  messagingSenderId: "589828360805",
  appId: "1:589828360805:web:b5e882cf4d3253107bd48c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

async function resetAll() {
  console.log("Logging in as admin...");
  try {
    await signInWithEmailAndPassword(auth, "admin@mathmaticore.local", "carlibach");
    console.log("Logged in!");
  } catch (e) {
    console.error("Login failed:", e);
    process.exit(1);
  }

  try {
    console.log("Fetching students...");
    const snap = await get(ref(database, 'users/students'));
    if (!snap.exists()) {
      console.log("No students found.");
      process.exit(0);
    }

    const students = snap.val();
    const studentIds = Object.keys(students);
    console.log(`Found ${studentIds.length} students. Resetting...`);

    for (const studentId of studentIds) {
      const existing = students[studentId];
      const cleanName = existing.name || existing.profile?.name || studentId;

      await update(ref(database, `users/students/${studentId}`), {
        studentId,
        name: cleanName,
        classId: existing.classId || 'class_1',
        completedMeeting2: false,
        routeStatus: null,
        routeRecommendation: null,
        qMatrixResults: null,
        traceData: { hesitation_events: 0, undo_clicks: 0 },
        workspaceState: {
          sessionNumber: 1,
          isASD: false,
          standardTaskIdx: 0,
          qflow: { step: 0, results: {} },
          flowStatus: 'IDLE',
          counts: { single: 0, ten: 0 },
          undoCount: 0,
          hesitationCount: 0,
          hasInteracted: false,
          aiTasks: []
        }
      });

      console.log(`Reset workspace for ${studentId}`);

      await Promise.all([
        remove(ref(database, `users/students/${studentId}/telemetry_chunks`)),
        remove(ref(database, `users/students/${studentId}/telemetry_sessions`)),
        remove(ref(database, `approved_tasks/${studentId}`)),
        remove(ref(database, `replays/${studentId}`)),
        remove(ref(database, `ai_pending_approvals/039604483/${studentId}`)).catch(() => {}),
        remove(ref(database, `ai_pending_approvals/teacher-1/${studentId}`)).catch(() => {}),
      ]);
    }

    console.log("Cleaning up global collections...");
    await remove(ref(database, 'radar_alerts'));
    await remove(ref(database, 'chat_messages'));
    
    console.log("DONE! All student data has been reset.");
    process.exit(0);

  } catch (e) {
    console.error("Error during reset:", e);
    process.exit(1);
  }
}

resetAll();
