import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, remove } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const BASE_URL = 'http://localhost:5173';

const firebaseConfig = {
  apiKey: "AIzaSyDupqh8inn1tZ1p-KIzV3RIMst7IdpUYPw",
  authDomain: "mathimaticore.firebaseapp.com",
  databaseURL: "https://mathimaticore-default-rtdb.firebaseio.com",
  projectId: "mathimaticore",
  storageBucket: "mathimaticore.firebasestorage.app",
  messagingSenderId: "589828360805",
  appId: "1:589828360805:web:b5e882cf4d3253107bd48c",
};

test.describe('Firebase Sync Service & Admin Store Verification', () => {
  let db: any;
  let auth: any;

  test.beforeAll(async () => {
    // Initialize Firebase in Node-side test context
    const app = initializeApp(firebaseConfig, "test-env-admin");
    auth = getAuth(app);
    db = getDatabase(app);
    await signInWithEmailAndPassword(auth, 'admin@mathmaticore.local', 'carlibach');
  });

  test('Auto-seeding and Admin Actions Cascade Deletions', async ({ context, page }) => {
    test.setTimeout(60000);
    // Disable tours
    await context.addInitScript(() => {
      window.localStorage.setItem('mathmaticore_has_seen_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
      window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    });

    // 1. Load the login page and authenticate as admin in the browser
    await page.goto(`${BASE_URL}/login`);
    await page.click('button:has-text("מנהל מערכת")');
    await page.fill('input[placeholder="שם משתמש"]', 'davsapiash');
    await page.fill('input[placeholder="סיסמה"]', 'carlibach');
    await page.click('button[type="submit"]');

    // Wait for the login and redirection to complete successfully
    await page.waitForURL(/.*\/admin/, { timeout: 15000 });

    // Expose useAdminStore on window inside the browser using dynamic import with the browser path
    await page.evaluate(async () => {
      const { useAdminStore } = await import('/src/application/useAdminStore.ts');
      (window as any).__adminStore = useAdminStore;
    });

    console.log("Starting Auto-seeding test...");
    
    // Clear database locations on the Node side by deleting individual children
    const schoolsSnapInit = await get(ref(db, 'schools'));
    if (schoolsSnapInit.exists()) {
      for (const id of Object.keys(schoolsSnapInit.val())) {
        await remove(ref(db, `schools/${id}`));
      }
    }

    const teachersSnapInit = await get(ref(db, 'users/teachers'));
    if (teachersSnapInit.exists()) {
      for (const id of Object.keys(teachersSnapInit.val())) {
        await remove(ref(db, `users/teachers/${id}`));
      }
    }

    const classesSnapInit = await get(ref(db, 'classes'));
    if (classesSnapInit.exists()) {
      for (const id of Object.keys(classesSnapInit.val())) {
        await remove(ref(db, `classes/${id}`));
      }
    }

    await remove(ref(db, 'system_control/globalStudentLimit'));

    // Reload the page to trigger startAdminSync and auto-seeding logic
    await page.reload();
    await page.waitForURL(/.*\/admin/, { timeout: 15000 });

    // Wait for the browser's public listener to detect empty database and auto-seed
    await page.waitForTimeout(4000);

    // Verify auto-seeded values exist in Firebase (Node side verification)
    const schoolSnap = await get(ref(db, 'schools/school_bikorot'));
    const teacherSnap = await get(ref(db, 'users/teachers/039604483'));
    const classSnap = await get(ref(db, 'classes/class_1'));
    const limitSnap = await get(ref(db, 'system_control/globalStudentLimit'));

    expect(schoolSnap.exists()).toBe(true);
    expect(teacherSnap.exists()).toBe(true);
    expect(classSnap.exists()).toBe(true);
    expect(limitSnap.val()).toBe(35);
    console.log("Auto-seeding logic works on the first run successfully!");

    // Expose useAdminStore on window again after page reload
    await page.evaluate(async () => {
      const { useAdminStore } = await import('/src/application/useAdminStore.ts');
      (window as any).__adminStore = useAdminStore;
    });

    // 2. Verify that adding a school, teacher, class, and updating the global limit triggers corresponding writes to Firebase
    console.log("Starting Write Trigger checks...");

    const testSchoolName = `test_school_${Date.now()}`;
    await page.evaluate((name) => {
      (window as any).__adminStore.getState().addSchool(name);
    }, testSchoolName);

    await page.waitForTimeout(2000);

    // Retrieve schools from Firebase to verify write
    const schoolsSnap = await get(ref(db, 'schools'));
    expect(schoolsSnap.exists()).toBe(true);
    const schools = Object.values(schoolsSnap.val()) as any[];
    const addedSchool = schools.find(s => s.name === testSchoolName);
    expect(addedSchool).toBeDefined();
    const testSchoolId = addedSchool.id;
    console.log("Adding school triggers write in Firebase successfully!");

    // Add Teacher
    const testTeacherName = `test_teacher_${Date.now()}`;
    const testTeacherTaz = `999999999`;
    const testTeacherDob = `111111`;
    await page.evaluate(({ schoolId, name, taz, dob }) => {
      (window as any).__adminStore.getState().addTeacher(schoolId, name, taz, dob);
    }, { schoolId: testSchoolId, name: testTeacherName, taz: testTeacherTaz, dob: testTeacherDob });

    await page.waitForTimeout(2000);

    const teacherDbSnap = await get(ref(db, `users/teachers/${testTeacherTaz}`));
    expect(teacherDbSnap.exists()).toBe(true);
    expect(teacherDbSnap.val().schoolId).toBe(testSchoolId);
    console.log("Adding teacher triggers write in Firebase successfully!");

    // Add Class
    const testClassName = `test_class_${Date.now()}`;
    await page.evaluate(({ schoolId, teacherId, name }) => {
      (window as any).__adminStore.getState().addClassRoom(schoolId, teacherId, name);
    }, { schoolId: testSchoolId, teacherId: testTeacherTaz, name: testClassName });

    await page.waitForTimeout(2000);

    const classesSnap = await get(ref(db, 'classes'));
    expect(classesSnap.exists()).toBe(true);
    const classes = Object.values(classesSnap.val()) as any[];
    const addedClass = classes.find(c => c.name === testClassName);
    expect(addedClass).toBeDefined();
    expect(addedClass.schoolId).toBe(testSchoolId);
    expect(addedClass.teacherId).toBe(testTeacherTaz);
    const testClassId = addedClass.id;
    console.log("Adding class triggers write in Firebase successfully!");

    // Update Global Limit
    const newLimit = 45;
    await page.evaluate((limit) => {
      (window as any).__adminStore.getState().setGlobalStudentLimit(limit);
    }, newLimit);

    await page.waitForTimeout(2000);

    const limitDbVal = (await get(ref(db, 'system_control/globalStudentLimit'))).val();
    expect(limitDbVal).toBe(newLimit);
    console.log("Updating global limit triggers write in Firebase successfully!");

    // 3. Verify teacher deletion cascades (removes associated classes from Firebase)
    console.log("Starting Teacher Deletion Cascade check...");
    await page.evaluate((teacherId) => {
      (window as any).__adminStore.getState().deleteTeacher(teacherId);
    }, testTeacherTaz);

    await page.waitForTimeout(2000);

    const checkTeacherSnap = await get(ref(db, `users/teachers/${testTeacherTaz}`));
    const checkClassSnap = await get(ref(db, `classes/${testClassId}`));
    expect(checkTeacherSnap.exists()).toBe(false);
    expect(checkClassSnap.exists()).toBe(false);
    console.log("Deleting a teacher cascades properly and removes associated classes from Firebase successfully!");

    // Re-create teacher and class for school deletion cascade testing
    console.log("Re-creating teacher and class for school deletion cascade testing...");
    await page.evaluate(({ schoolId, name, taz, dob }) => {
      (window as any).__adminStore.getState().addTeacher(schoolId, name, taz, dob);
    }, { schoolId: testSchoolId, name: testTeacherName, taz: testTeacherTaz, dob: testTeacherDob });

    await page.waitForTimeout(2000);

    await page.evaluate(({ schoolId, teacherId, name }) => {
      (window as any).__adminStore.getState().addClassRoom(schoolId, teacherId, name);
    }, { schoolId: testSchoolId, teacherId: testTeacherTaz, name: testClassName });

    await page.waitForTimeout(2000);

    const classesSnap2 = await get(ref(db, 'classes'));
    const addedClass2 = (Object.values(classesSnap2.val()) as any[]).find(c => c.name === testClassName);
    expect(addedClass2).toBeDefined();
    const newClassId = addedClass2.id;

    // 4. Verify school deletion cascades (removes associated teachers and classes from Firebase)
    console.log("Starting School Deletion Cascade check...");
    await page.evaluate((schoolId) => {
      (window as any).__adminStore.getState().deleteSchool(schoolId);
    }, testSchoolId);

    await page.waitForTimeout(2000);

    const checkSchoolSnap = await get(ref(db, `schools/${testSchoolId}`));
    const checkTeacherSnap2 = await get(ref(db, `users/teachers/${testTeacherTaz}`));
    const checkClassSnap2 = await get(ref(db, `classes/${newClassId}`));

    expect(checkSchoolSnap.exists()).toBe(false);
    expect(checkTeacherSnap2.exists()).toBe(false);
    expect(checkClassSnap2.exists()).toBe(false);
    console.log("Deleting a school cascades properly and removes associated teachers and classes from Firebase successfully!");

    console.log("All Firebase Sync & Cascade Deletion checks passed successfully!");
  });
});
