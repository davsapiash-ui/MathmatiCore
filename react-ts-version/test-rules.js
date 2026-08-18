import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

async function runFirestoreRulesTest() {
  console.log(`\n===============================================================`);
  console.log(`--- FIRESTORE SECURITY RULES UNIT TEST (@firebase/rules-unit-testing) ---`);
  console.log(`===============================================================\n`);

  const localRules = path.resolve('firestore.rules');
  const parentRules = path.resolve('../firestore.rules');
  const rulesPath = fs.existsSync(localRules) ? localRules : parentRules;
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Initialize test environment with local emulator
  const testEnv = await initializeTestEnvironment({
    projectId: 'mathmaticore-rules-test',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    }
  });

  // Clear previous data
  await testEnv.clearFirestore();

  console.log(`[SETUP] Initialized Firestore test environment with strict firestore.rules.`);

  // 1. Context for Student 2
  const student2Context = testEnv.authenticatedContext('student_2', {
    role: 'student',
    student_id: 2,
    class_id: 'class_pilot_01',
    roles: ['STUDENT']
  });
  const dbStudent2 = student2Context.firestore();

  // 2. Context for Student 5
  const student5Context = testEnv.authenticatedContext('student_5', {
    role: 'student',
    student_id: 5,
    class_id: 'class_pilot_01',
    roles: ['STUDENT']
  });
  const dbStudent5 = student5Context.firestore();

  let testCount = 0;
  let passedCount = 0;

  // --- TEST A: Student 2 writes to own student document (/students/2) ---
  testCount++;
  console.log(`\n[TEST 1] Student 2 writes to own document (/students/2)...`);
  try {
    await assertSucceeds(setDoc(doc(dbStudent2, 'students', '2'), {
      student_id: 2,
      class_id: 'class_pilot_01',
      school_id: 'school_bikorot',
      created_at: Date.now(),
      support_profile_id: null,
      support_profile_version: 1,
      support_profile_updated_at: null,
      support_profile_updated_by: null,
      active_session_id: 'session_01'
    }));
    console.log(`✅ PASSED: Student 2 successfully created own student document.`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Student 2 could not write to own document:`, err);
  }

  // --- TEST B: Student 2 writes to own telemetry log (/telemetry_logs/idemp_s2_01) ---
  testCount++;
  console.log(`\n[TEST 2] Student 2 writes to own telemetry log (/telemetry_logs/idemp_s2_01)...`);
  try {
    await assertSucceeds(setDoc(doc(dbStudent2, 'telemetry_logs', 'idemp_s2_01'), {
      idempotency_key: 'idemp_s2_01',
      client_timestamp: Date.now(),
      session_id: 'session_01',
      student_id: 2,
      exercise_id: 'ex_01',
      event_type: 'DIGIT_ENTERED',
      column_index: 0,
      details: { digit_value: 4, is_correct: true },
      synced_at: Date.now()
    }));
    console.log(`✅ PASSED: Student 2 successfully created own telemetry log.`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Student 2 could not write own telemetry:`, err);
  }

  // --- TEST C: Cross-Student Attack — Student 2 attempts to write to Student 5 (/students/5) ---
  testCount++;
  console.log(`\n[TEST 3: CROSS-STUDENT ATTACK] Student 2 attempts to overwrite Student 5's document (/students/5)...`);
  try {
    await assertFails(setDoc(doc(dbStudent2, 'students', '5'), {
      student_id: 5,
      class_id: 'class_pilot_01',
      school_id: 'school_bikorot',
      created_at: Date.now(),
      support_profile_id: null,
      support_profile_version: 1,
      support_profile_updated_at: null,
      support_profile_updated_by: null,
      active_session_id: 'session_01'
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Cross-student document write was strictly rejected!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Cross-student document write was NOT rejected!`, err);
  }

  // --- TEST D: Cross-Student Attack — Student 2 attempts to inject telemetry as Student 5 ---
  testCount++;
  console.log(`\n[TEST 4: CROSS-STUDENT ATTACK] Student 2 attempts to inject telemetry as Student 5 (/telemetry_logs/idemp_cross_99)...`);
  try {
    await assertFails(setDoc(doc(dbStudent2, 'telemetry_logs', 'idemp_cross_99'), {
      idempotency_key: 'idemp_cross_99',
      client_timestamp: Date.now(),
      session_id: 'session_01',
      student_id: 5, // Falsified student_id
      exercise_id: 'ex_01',
      event_type: 'DIGIT_ENTERED',
      column_index: 0,
      details: { digit_value: 9, is_correct: false },
      synced_at: Date.now()
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Cross-student telemetry injection was strictly rejected!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Cross-student telemetry injection was NOT rejected!`, err);
  }

  // --- TEST E: Teacher writes canonical support profile (/students/2) ---
  const teacherContext = testEnv.authenticatedContext('teacher_01', {
    role: 'teacher',
    class_id: 'class_pilot_01',
    teacher: true,
  });
  const dbTeacher = teacherContext.firestore();

  testCount++;
  console.log(`\n[TEST 5] Teacher writes canonical support profile to /students/2...`);
  try {
    await assertSucceeds(setDoc(doc(dbTeacher, 'students', '2'), {
      student_id: 2,
      class_id: 'class_pilot_01',
      school_id: 'school_bikorot',
      created_at: Date.now(),
      support_profile_id: 'profile_scaffold_1',
      support_profile_version: 2,
      support_profile_updated_at: Date.now(),
      support_profile_updated_by: 'teacher_01',
      active_session_id: 'session_01'
    }));
    console.log(`✅ PASSED: Teacher successfully wrote canonical support profile to /students/2.`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Teacher could not write canonical support profile:`, err);
  }

  // --- TEST F: Extra non-canonical field (pending_support_profile_id) rejected with 403 ---
  testCount++;
  console.log(`\n[TEST 6] Write with non-canonical field 'pending_support_profile_id' to /students/2...`);
  try {
    await assertFails(setDoc(doc(dbTeacher, 'students', '2'), {
      student_id: 2,
      class_id: 'class_pilot_01',
      school_id: 'school_bikorot',
      created_at: Date.now(),
      support_profile_id: 'profile_scaffold_1',
      pending_support_profile_id: 'profile_scaffold_1', // Non-canonical schema field!
      support_profile_version: 2,
      support_profile_updated_at: Date.now(),
      support_profile_updated_by: 'teacher_01',
      active_session_id: 'session_01'
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Extra non-canonical field 'pending_support_profile_id' was strictly rejected!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Extra non-canonical field was NOT rejected:`, err);
  }

  // --- SRL REFLECTIONS TESTS (Module 16 — מודול 16: רפלקציית מפגש 8) ---

  const VALID_SRL_DOC = {
    student_id: 2,
    session_id: 'session_08_student_2',
    session_number: 8,
    effort_level: 'HIGH',
    focus_area: 'multiplication',
    persistence_index: 100,
    undo_count: 5,
    error_count: 0,
    guess_count: 0,
    submitted_at: Date.now(),
  };

  // --- TEST G: Student 2 writes own SRL reflection (should SUCCEED) ---
  testCount++;
  console.log(`\n[TEST 7] Student 2 writes own SRL reflection (/srl_reflections/session_08_student_2)...`);
  try {
    await assertSucceeds(setDoc(doc(dbStudent2, 'srl_reflections', 'session_08_student_2'), VALID_SRL_DOC));
    console.log(`✅ PASSED: Student 2 successfully wrote own SRL reflection.`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Student 2 could not write own SRL reflection:`, err);
  }

  // --- TEST H: Student 2 writes SRL reflection with student_id 5 (cross-student attack — should FAIL 403) ---
  testCount++;
  console.log(`\n[TEST 8: CROSS-STUDENT ATTACK] Student 2 attempts to write SRL reflection as Student 5...`);
  try {
    await assertFails(setDoc(doc(dbStudent2, 'srl_reflections', 'session_08_student_5'), {
      ...VALID_SRL_DOC,
      student_id: 5,
      session_id: 'session_08_student_5',
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Cross-student SRL reflection write was rejected!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Cross-student SRL reflection was NOT rejected!`, err);
  }

  // --- TEST I: Student 2 writes SRL reflection with extra non-canonical field (should FAIL 403) ---
  testCount++;
  console.log(`\n[TEST 9: SCHEMA VIOLATION] Student 2 writes SRL reflection with extra field 'raw_audio_url'...`);
  try {
    await assertFails(setDoc(doc(dbStudent2, 'srl_reflections', 'session_08_student_2_bad'), {
      ...VALID_SRL_DOC,
      raw_audio_url: 'https://evil.example/recording.mp3', // Non-canonical field — PII risk!
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Extra non-canonical field in SRL reflection was strictly rejected!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Extra non-canonical field in SRL reflection was NOT rejected!`, err);
  }

  // Cleanup test environment
  await testEnv.cleanup();

  console.log(`\n===============================================================`);
  console.log(`--- FIRESTORE RULES TEST SUMMARY: ${passedCount}/${testCount} TESTS PASSED ---`);
  console.log(`===============================================================\n`);

  if (passedCount !== testCount) {
    process.exit(1);
  }
  process.exit(0);
}

runFirestoreRulesTest().catch((e) => {
  console.error('Fatal Test Error:', e);
  process.exit(1);
});
