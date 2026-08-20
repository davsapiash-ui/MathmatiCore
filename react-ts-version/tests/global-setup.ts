import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDupqh8inn1tZ1p-KIzV3RIMst7IdpUYPw",
  authDomain: "mathimaticore.firebaseapp.com",
  databaseURL: "https://mathimaticore-default-rtdb.firebaseio.com",
  projectId: "mathimaticore",
  storageBucket: "mathimaticore.firebasestorage.app",
  messagingSenderId: "589828360805",
  appId: "1:589828360805:web:b5e882cf4d3253107bd48c",
};

async function globalSetup() {
  console.log("Global Setup: Seeding E2E test data...");
  const app = initializeApp(firebaseConfig, "test-env-global-setup");
  const auth = getAuth(app);
  const db = getDatabase(app);

  const testTaz = '1002220159';
  const testDob = '290984';
  const testEmail = `teacher_${testTaz}@mathmaticore.local`;
  const testPass = `${testDob}${testTaz}`;

  try {
    // 1. Create teacher in Firebase Auth
    try {
      await signInWithEmailAndPassword(auth, testEmail, testPass);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
        await createUserWithEmailAndPassword(auth, testEmail, testPass);
      } else {
        throw err;
      }
    }

    // 2. Also log in as admin to have write access to /users/teachers
    try {
      await signInWithEmailAndPassword(auth, 'admin@mathmaticore.local', 'carlibach');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
        await createUserWithEmailAndPassword(auth, 'admin@mathmaticore.local', 'carlibach');
      }
    }

    // 3. Seed teacher in Firebase Realtime Database
    const teacherRef = ref(db, `users/teachers/${testTaz}`);
    const teacherSnap = await get(teacherRef);
    
    if (!teacherSnap.exists()) {
      await set(teacherRef, {
        id: testTaz,
        name: "דוד (E2E Test Teacher)",
        taz: testTaz,
        dob: testDob,
        schoolId: "school_bikorot",
        classes: ["class_1"],
        licenseActive: true,
        createdAt: Date.now(),
        lastLogin: Date.now()
      });
      console.log("Global Setup: Teacher seeded in Realtime Database.");
    } else {
      // Ensure license is active
      await set(ref(db, `users/teachers/${testTaz}/licenseActive`), true);
    }

    // 4. Ensure school and class exist
    await set(ref(db, 'schools/school_bikorot'), {
      id: "school_bikorot",
      name: "בית ספר לביקורות E2E",
      city: "תל אביב",
      maxStudents: 500,
      classes: ["class_1"],
      createdAt: Date.now()
    });
    
    await set(ref(db, 'classes/class_1'), {
      id: "class_1",
      name: "כיתה א' (E2E)",
      schoolId: "school_bikorot",
      teacherId: testTaz,
      students: [],
      createdAt: Date.now()
    });

    console.log("Global Setup: Seeding complete.");
  } catch (error) {
    console.error("Global Setup: Error seeding data", error);
  }
}

export default globalSetup;
