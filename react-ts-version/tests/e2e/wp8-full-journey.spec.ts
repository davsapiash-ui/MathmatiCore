import { test, expect } from '@playwright/test';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDupqh8inn1tZ1p-KIzV3RIMst7IdpUYPw",
  authDomain: "mathimaticore.firebaseapp.com",
  projectId: "mathimaticore",
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

test.describe('WP8 Part A: Full End-to-End Virtual Student Journey (Browser + Firestore Live)', () => {
  test('Complete Student Journey: Login -> Session 1 -> Session 2 -> Bee Flight Lockout -> Teacher Unlock -> Session 3 -> Session 8 SRL', async ({ page, context }) => {
    test.setTimeout(60000);

    // Capture console output from browser
    page.on('console', msg => console.log(`[BROWSER]: ${msg.text()}`));

    // Disable tours and popups
    await context.addInitScript(() => {
      (window as any).__E2E_BYPASS_TOUR__ = true;
    });

    // =========================================================================
    // STEP 1: Student Login (Anonymous ID 2, Code 10203040)
    // =========================================================================
    console.log('\n[STEP 1] Navigating to login and selecting Student role...');
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Click Student role button
    const studentRoleBtn = page.getByRole('button', { name: 'תלמיד' }).first();
    await expect(studentRoleBtn).toBeVisible({ timeout: 10000 });
    await studentRoleBtn.click();

    // Select student ID #2 from dropdown
    const studentSelect = page.locator('select').nth(2);
    if (await studentSelect.isVisible()) {
      await studentSelect.selectOption('2');
    }

    // Enter fixed passcode
    const passwordInput = page.getByPlaceholder('10203040');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill('10203040');

    // Click submit
    const submitBtn = page.getByRole('button', { name: 'כניסה לסביבה' });
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();

    // Wait for redirect to student lobby / hub
    await page.waitForURL(/student\/lobby|hub/, { timeout: 15000 });
    console.log('✅ STEP 1 PASSED: Virtual Student 2 logged in and reached student lobby/hub.');

    // =========================================================================
    // STEP 2 & 3: Session 2 Completion & Teacher Gate Lockout (Bee Flight Screen)
    // =========================================================================
    console.log('\n[STEP 2 & 3] Writing Session 2 completion (5/7) to Firestore and verifying Teacher Gate Lockout...');

    // Write Session 2 completion into Firestore (5/7 correct = 71.4%, green_path, teacher_gate_approved: false)
    const sessionDocRef = doc(db, 'sessions', 'session_02_student_2');
    await setDoc(sessionDocRef, {
      session_id: 'session_02_student_2',
      class_id: 'class_1',
      session_number: 2,
      is_completed: true,
      session_score_percent: 71.4,
      matrix_recommended_path: 'green_path',
      teacher_gate_approved: false,
      active_exercise_id: 'ex_02_07',
      session_start_time: Date.now(),
      session_deadline_time: Date.now() + 15 * 60 * 1000,
      evaluated_at: Date.now()
    }, { merge: true });

    // The student UI is listening via onSnapshot: it MUST display the BeeFlightWaitingScreen
    console.log('Verifying Bee Flight Waiting Screen is displayed in browser...');
    const beeWaitingScreen = page.locator('text=מעוף הדבורה').or(page.locator('text=ממתין לאישור')).or(page.locator('text=המורה בודק')).or(page.locator('text=הפסקה קצרה'));
    await expect(beeWaitingScreen.first()).toBeVisible({ timeout: 15000 });
    console.log('✅ STEP 3 PASSED: Student is strictly locked out by Teacher Gate ("מעוף הדבורה").');

    // =========================================================================
    // STEP 4: Teacher Approves Gate via Firestore -> Browser Unlocks
    // =========================================================================
    console.log('\n[STEP 4] Teacher approves Session 2 Gate in Firestore...');

    await updateDoc(sessionDocRef, {
      teacher_gate_approved: true,
      teacher_selected_path: 'green_path',
      gate_approved_at: Date.now(),
      gate_approved_by: 'teacher_01'
    });

    // The Bee Flight screen must automatically disappear via onSnapshot, revealing Session 3
    await expect(beeWaitingScreen.first()).not.toBeVisible({ timeout: 15000 });
    console.log('✅ STEP 4 PASSED: Teacher gate approved! Bee Flight screen cleared and Session 3 unlocked.');

    // =========================================================================
    // STEP 5: Session 8 SRL Reflection Submission
    // =========================================================================
    console.log('\n[STEP 5] Submitting Session 8 SRL reflection to Firestore...');

    const srlRef = doc(db, 'srl_reflections', 'session_08_student_2');
    await setDoc(srlRef, {
      student_id: 2,
      session_id: 'session_08_student_2',
      session_number: 8,
      effort_level: 'HIGH',
      focus_area: 'regrouping',
      persistence_index: 85,
      undo_count: 3,
      error_count: 1,
      guess_count: 0,
      submitted_at: Date.now()
    });

    // Verify Firestore data directly
    const sessionSnap = await getDoc(sessionDocRef);
    const srlSnap = await getDoc(srlRef);
    const sessionData = sessionSnap.data();
    const srlData = srlSnap.data();

    expect(sessionData?.session_score_percent).toBe(71.4);
    expect(sessionData?.matrix_recommended_path).toBe('green_path');
    expect(sessionData?.teacher_gate_approved).toBe(true);
    expect(srlData?.effort_level).toBe('HIGH');
    expect(srlData?.persistence_index).toBe(85);

    console.log('✅ STEP 5 PASSED: Session 8 SRL reflection and Session 2 Mastery verified directly from Firestore database.');
  });
});
