import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDatabase, ref, get, set } from 'firebase/database';

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
const auth = getAuth(app);
const db = getDatabase(app);

async function runTest() {
  const studentId = 'student_user1';
  const studentEmail = `${studentId}@mathmaticore.local`;
  const studentPassword = '10203040';

  const teacherEmail = 'teacher_039604483@mathmaticore.local';
  const teacherPassword = '290984039604483';

  const adminEmail = 'admin@mathmaticore.local';
  const adminPassword = 'carlibach';

  const testPath = `users/students/${studentId}/telemetry_chunks`;

  console.log(`--- STARTING SECURITY RULES VERIFICATION ---`);

  // --- 1. STUDENT ROLE ---
  console.log(`\nTesting Student Role: ${studentEmail}`);
  try {
    await signInWithEmailAndPassword(auth, studentEmail, studentPassword);
    console.log(`Logged in as Student successfully!`);

    // Write test
    try {
      await set(ref(db, `${testPath}/chunk_stud`), { timestamp: Date.now(), data: "student_write" });
      console.log(`[STUDENT WRITE] SUCCESS`);
    } catch (writeErr) {
      console.log(`[STUDENT WRITE] FAILED:`, writeErr.message);
    }

    // Read test
    try {
      const snap = await get(ref(db, `${testPath}/chunk_stud`));
      console.log(`[STUDENT READ] SUCCESS. Data:`, snap.val());
    } catch (readErr) {
      console.log(`[STUDENT READ] FAILED:`, readErr.message);
    }

    await signOut(auth);
    console.log(`Logged out Student.`);
  } catch (err) {
    console.error(`Student Auth Failed:`, err.message || err);
  }

  // --- 2. TEACHER ROLE ---
  console.log(`\nTesting Teacher Role: ${teacherEmail}`);
  try {
    await signInWithEmailAndPassword(auth, teacherEmail, teacherPassword);
    console.log(`Logged in as Teacher successfully!`);

    // Write test
    try {
      await set(ref(db, `${testPath}/chunk_teach`), { timestamp: Date.now(), data: "teacher_write" });
      console.log(`[TEACHER WRITE] SUCCESS`);
    } catch (writeErr) {
      console.log(`[TEACHER WRITE] FAILED:`, writeErr.message);
    }

    // Read test
    try {
      const snap = await get(ref(db, `${testPath}/chunk_stud`));
      console.log(`[TEACHER READ] SUCCESS. Data:`, snap.val());
    } catch (readErr) {
      console.log(`[TEACHER READ] FAILED:`, readErr.message);
    }

    await signOut(auth);
    console.log(`Logged out Teacher.`);
  } catch (err) {
    console.error(`Teacher Auth Failed:`, err.message || err);
  }

  // --- 3. ADMIN ROLE ---
  console.log(`\nTesting Admin Role: ${adminEmail}`);
  try {
    await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    console.log(`Logged in as Admin successfully!`);

    // Write test
    try {
      await set(ref(db, `${testPath}/chunk_admin`), { timestamp: Date.now(), data: "admin_write" });
      console.log(`[ADMIN WRITE] SUCCESS`);
    } catch (writeErr) {
      console.log(`[ADMIN WRITE] FAILED:`, writeErr.message);
    }

    // Read test
    try {
      const snap = await get(ref(db, `${testPath}/chunk_stud`));
      console.log(`[ADMIN READ] SUCCESS. Data:`, snap.val());
    } catch (readErr) {
      console.log(`[ADMIN READ] FAILED:`, readErr.message);
    }

    await signOut(auth);
    console.log(`Logged out Admin.`);
  } catch (err) {
    console.error(`Admin Auth Failed:`, err.message || err);
  }

  console.log(`\n--- RULES VERIFICATION COMPLETE ---`);
  process.exit(0);
}

runTest().catch(console.error);
