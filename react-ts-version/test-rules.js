import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

async function runFirestoreRulesTest() {
  console.log(`\n===============================================================`);
  console.log(`--- FIRESTORE SECURITY RULES UNIT TEST (@firebase/rules-unit-testing) ---`);
  console.log(`===============================================================\n`);

  const parentRules = path.resolve('../firestore.rules');
  const localRules = path.resolve('firestore.rules');
  const rulesPath = fs.existsSync(parentRules) ? parentRules : localRules;
  console.log(`[CONFIG] Loading canonical Firestore rules from: ${rulesPath}`);
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

  // 0. Context for Bare Anonymous User (NO custom claims)
  const bareAnonContext = testEnv.authenticatedContext('anon_random_uid_123', {});
  const dbBareAnon = bareAnonContext.firestore();

  // 1. Context for Student 2 (WITH verified claim student_id: 2)
  const student2Context = testEnv.authenticatedContext('student_2', {
    role: 'student',
    student_id: 2,
    class_id: 'class_pilot_01',
    roles: ['STUDENT']
  });
  const dbStudent2 = student2Context.firestore();

  // 2. Context for Student 5 (WITH verified claim student_id: 5)
  const student5Context = testEnv.authenticatedContext('student_5', {
    role: 'student',
    student_id: 5,
    class_id: 'class_pilot_01',
    roles: ['STUDENT']
  });
  const dbStudent5 = student5Context.firestore();

  let testCount = 0;
  let passedCount = 0;

  // --- TEST 0: Bare Anonymous user WITHOUT student_id claim attempts to write (/students/2) MUST FAIL ---
  testCount++;
  console.log(`\n[TEST 0: NO CLAIM ATTACK] Bare anonymous user (no student_id claim) attempts to write to /students/2...`);
  try {
    await assertFails(setDoc(doc(dbBareAnon, 'students', '2'), {
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
    console.log(`✅ PASSED (PERMISSION_DENIED): User without verified student_id claim is strictly blocked!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: User without claim was NOT blocked:`, err);
  }

  // --- TEST A: Student 2 (with verified claim) writes to own student document (/students/2) ---
  testCount++;
  console.log(`\n[TEST 1] Student 2 (with verified claim) writes to own document (/students/2)...`);
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

  // --- SESSION GATE APPROVAL TESTS (Module 20 / PRD §2.5) ---

  const VALID_SESSION_DOC = {
    session_id: 'session_02_student_2',
    class_id: 'class_pilot_01',
    session_number: 2,
    session_start_time: Date.now(),
    session_deadline_time: Date.now() + 15 * 60 * 1000,
    active_exercise_id: 'ex_02_01',
    is_completed: false,
    session_score_percent: 0,
    teacher_gate_approved: false,
    gate_approved_at: null,
    gate_approved_by: null,
    teacher_selected_path: null,
    matrix_recommended_path: null,
  };

  // Pre-seed the session document
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'sessions', 'session_02_student_2'), VALID_SESSION_DOC);
  });

  // --- TEST 10: SELF-APPROVAL ATTACK — Student 2 attempts to set teacher_gate_approved: true on own session (should FAIL 403) ---
  testCount++;
  console.log(`\n[TEST 10: SELF-APPROVAL ATTACK] Student 2 attempts to set teacher_gate_approved: true on own session...`);
  try {
    await assertFails(setDoc(doc(dbStudent2, 'sessions', 'session_02_student_2'), {
      ...VALID_SESSION_DOC,
      teacher_gate_approved: true, // Forged approval!
      is_completed: true,
      session_score_percent: 85,
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Self-approval attack strictly blocked by Firestore Rules!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Self-approval attack was NOT blocked:`, err);
  }

  // --- TEST 11: Teacher approves gate on Session 2 (should SUCCEED) ---
  testCount++;
  console.log(`\n[TEST 11] Teacher approves gate on Session 2 (teacher_gate_approved: true)...`);
  try {
    await assertSucceeds(setDoc(doc(dbTeacher, 'sessions', 'session_02_student_2'), {
      ...VALID_SESSION_DOC,
      teacher_gate_approved: true,
      teacher_selected_path: 'green_path',
      gate_approved_at: Date.now(),
      gate_approved_by: 'teacher_01',
    }));
    console.log(`✅ PASSED: Teacher successfully approved session gate.`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Teacher gate approval failed:`, err);
  }

  // --- SUPPORT TICKETS & SYSTEM CONTROL TESTS (Modules 26 & 28) ---

  const adminContext = testEnv.authenticatedContext('admin_01', {
    role: 'admin',
    admin: true,
    roles: ['ADMIN']
  });
  const dbAdmin = adminContext.firestore();

  const VALID_TICKET_DOC = {
    school_id: 'school_pilot_01',
    school_name: 'בית ספר ביקורת',
    class_id: 'class_pilot_01',
    class_name: 'המבקרים',
    student_id: 'student_3',
    teacher_id: 'teacher_01',
    subject: 'בקשת התאמת רמת קושי לתלמיד 3',
    category: 'ACCOMMODATION_ASD',
    priority: 'MEDIUM',
    status: 'OPEN',
    description: 'התלמיד זקוק לחיזוק מוחשי של עמודת העשרות',
    created_at: Date.now(),
    updated_at: Date.now(),
    responses: []
  };

  // --- TEST 12: Teacher writes valid support ticket (/support_tickets/tkt_01) ---
  testCount++;
  console.log(`\n[TEST 12] Teacher writes valid anonymous support ticket (/support_tickets/tkt_01)...`);
  try {
    await assertSucceeds(setDoc(doc(dbTeacher, 'support_tickets', 'tkt_01'), VALID_TICKET_DOC));
    console.log(`✅ PASSED: Teacher successfully wrote valid anonymous support ticket.`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Teacher could not write support ticket:`, err);
  }

  // --- TEST 13: Support ticket with forbidden PII field (raw_student_name) rejected with 403 ---
  testCount++;
  console.log(`\n[TEST 13: PII LEAK PREVENTION] Write support ticket with forbidden field 'raw_student_name'...`);
  try {
    await assertFails(setDoc(doc(dbTeacher, 'support_tickets', 'tkt_pii_bad'), {
      ...VALID_TICKET_DOC,
      raw_student_name: 'ישראל ישראלי', // Forbidden PII field!
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): PII field in support ticket was strictly rejected!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: PII field in support ticket was NOT rejected:`, err);
  }

  // --- TEST 14: Non-admin (Student) attempts to write to /system_control/active_curriculum (should FAIL 403) ---
  testCount++;
  console.log(`\n[TEST 14: PRIVILEGE ESCALATION ATTACK] Student attempts to write to /system_control/active_curriculum...`);
  try {
    await assertFails(setDoc(doc(dbStudent2, 'system_control', 'active_curriculum'), {
      active_batch_session: 8,
      batch_assigned_at: Date.now()
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Non-admin write to system_control strictly blocked!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Non-admin write to system_control was NOT blocked:`, err);
  }

  // --- TEST 15: Admin writes to /system_control/active_curriculum (should SUCCEED) ---
  testCount++;
  console.log(`\n[TEST 15] Admin writes to /system_control/active_curriculum...`);
  try {
    await assertSucceeds(setDoc(doc(dbAdmin, 'system_control', 'active_curriculum'), {
      active_batch_session: 2,
      batch_assigned_at: Date.now()
    }));
    console.log(`✅ PASSED: Admin successfully wrote to system_control.`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Admin write to system_control failed:`, err);
  }

  // --- TEACHER-ADMIN MESSAGES SECURITY TESTS (Module 22) ---

  const VALID_MSG_DOC = {
    sender_id: 'admin',
    receiver_id: 'teacher_01',
    message_body: 'נא לבדוק את התאמת הרמה למפגש 3',
    timestamp: Date.now(),
    school_id: 'school_pilot_01',
    class_name: 'המבקרים',
    read: false
  };

  // Pre-seed a message via Admin SDK / security rules disabled (simulating Cloud Function write)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'messages', 'msg_server_created_01'), VALID_MSG_DOC);
  });

  // --- TEST 16: DIRECT CLIENT CREATE ATTACK — Teacher attempts direct client write to /messages (should FAIL 403) ---
  testCount++;
  console.log(`\n[TEST 16: CLIENT BYPASS ATTACK] Direct client create to /messages/msg_direct_client...`);
  try {
    await assertFails(setDoc(doc(dbTeacher, 'messages', 'msg_direct_client'), VALID_MSG_DOC));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Direct client message create strictly blocked by Firestore Rules!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Direct client message create was NOT blocked:`, err);
  }

  // --- TEST 17: Read restriction on /messages — Teacher 01 reads own message (should SUCCEED) ---
  testCount++;
  console.log(`\n[TEST 17] Teacher 01 reads own conversation message (/messages/msg_server_created_01)...`);
  try {
    await assertSucceeds(getDoc(doc(dbTeacher, 'messages', 'msg_server_created_01')));
    console.log(`✅ PASSED: Teacher 01 successfully read own message.`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Teacher 01 could not read own message:`, err);
  }

  // --- TEST 18: WP8 Part A — Full Live Student Journey (Session 2 -> Gate -> Teacher Approval -> Session 8 SRL) ---
  testCount++;
  console.log(`\n[TEST 18: WP8 E2E JOURNEY] Student 2 Session 2 Completion (5/7) -> Gate Lockout -> Teacher Approval -> Session 8 SRL...`);
  try {
    const nowTimestamp = Date.now();
    // 1. Student completes Session 2
    const session2Ref = doc(dbStudent2, 'sessions', 'session_02_student_2_journey');
    const session2Doc = {
      session_id: 'session_02_student_2_journey',
      class_id: 'class_pilot_01',
      session_number: 2,
      session_start_time: nowTimestamp,
      session_deadline_time: nowTimestamp + 15 * 60 * 1000,
      active_exercise_id: 'ex_02_07',
      is_completed: true,
      session_score_percent: 71.4,
      matrix_recommended_path: 'green_path',
      teacher_gate_approved: false,
      gate_approved_at: null,
      gate_approved_by: null,
      teacher_selected_path: null,
      evaluated_at: nowTimestamp
    };
    await assertSucceeds(setDoc(session2Ref, session2Doc));

    // 2. Teacher approves gate
    await assertSucceeds(setDoc(doc(dbTeacher, 'sessions', 'session_02_student_2_journey'), {
      ...session2Doc,
      teacher_gate_approved: true,
      teacher_selected_path: 'green_path',
      gate_approved_at: nowTimestamp,
      gate_approved_by: 'teacher_1'
    }));

    // 3. Student 2 submits Session 8 SRL reflection
    await assertSucceeds(setDoc(doc(dbStudent2, 'srl_reflections', 'session_08_student_2_journey'), {
      student_id: 2,
      session_id: 'session_08_student_2_journey',
      session_number: 8,
      effort_level: 'HIGH',
      focus_area: 'regrouping',
      persistence_index: 85,
      undo_count: 3,
      error_count: 1,
      guess_count: 0,
      submitted_at: nowTimestamp
    }));

    console.log(`✅ PASSED: Full E2E database journey completed: Session 2 (71.4% score -> green_path) -> Teacher Gate Approval -> Session 8 SRL reflection!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: WP8 E2E database journey failed:`, err);
  }

  // --- TEST 19: Teacher Gate Approval on Real Session 2 Document (should SUCCEED and update Firestore) ---
  testCount++;
  console.log(`\n[TEST 19: GATE APPROVAL REAL DOC] Teacher approves gate on existing session_02_student_2 (71.4% score)...`);
  try {
    const s2DocRef = doc(dbTeacher, 'sessions', 'session_02_student_2_emulator_test');
    const nowMs = Date.now();
    // Seed real completed session document
    await setDoc(s2DocRef, {
      session_id: 'session_02_student_2_emulator_test',
      class_id: 'class_pilot_01',
      session_number: 2,
      session_start_time: nowMs - 1800000,
      session_deadline_time: nowMs + 1800000,
      active_exercise_id: 'ex_02_07',
      is_completed: true,
      session_score_percent: 71.4,
      matrix_recommended_path: 'green_path',
      teacher_gate_approved: false,
      gate_approved_at: null,
      gate_approved_by: null,
      teacher_selected_path: null,
    });

    // Teacher approves the gate
    await assertSucceeds(updateDoc(s2DocRef, {
      teacher_gate_approved: true,
      teacher_selected_path: 'green_path',
      gate_approved_at: nowMs,
      gate_approved_by: 'teacher_01',
    }));

    // Verify the document was actually updated in Firestore with correct fields
    const updatedSnap = await getDoc(s2DocRef);
    const updatedData = updatedSnap.data();
    if (updatedData.teacher_gate_approved === true && updatedData.teacher_selected_path === 'green_path') {
      console.log(`✅ PASSED: Teacher successfully approved Session 2 gate in Firestore with verified fields.`);
      passedCount++;
    } else {
      throw new Error('Document fields were not properly updated in Firestore');
    }
  } catch (err) {
    console.error(`❌ FAILED: Teacher gate approval on existing document failed:`, err);
  }

  // --- TEST 20: Non-Existent Document Approval Attack — Teacher attempts to approve Student 5 with NO session doc (MUST BLOCK) ---
  testCount++;
  console.log(`\n[TEST 20: ZERO SYNTHETIC DATA] Teacher attempts to approve Student 5 without existing session document...`);
  try {
    const s5DocRef = doc(dbTeacher, 'sessions', 'session_02_student_5_non_existent');
    const s5Snap = await getDoc(s5DocRef);

    // Verify document does NOT exist
    if (!s5Snap.exists()) {
      // System blocks gate approval and REFUSES to create a fake score document
      console.log(`[VERIFY] Confirmed: sessions/session_02_student_5_non_existent does NOT exist in Firestore.`);
      // Verifying updateDoc fails on non-existent document
      await assertFails(updateDoc(s5DocRef, {
        teacher_gate_approved: true,
        teacher_selected_path: 'green_path',
        gate_approved_at: Date.now(),
        gate_approved_by: 'teacher_01',
      }));
      console.log(`✅ PASSED: Approval strictly blocked when session document does not exist (Zero Synthetic Data).`);
      passedCount++;
    } else {
      throw new Error('Test setup error: document should not exist');
    }
  } catch (err) {
    console.error(`❌ FAILED: Non-existent document approval block failed:`, err);
  }

  // --- TEST 21: Student attempts to write to /radar_alerts (MUST FAIL 403) ---
  testCount++;
  console.log(`\n[TEST 21: RADAR_ALERTS LOCK-DOWN] Student attempts to write to /radar_alerts/student_2...`);
  try {
    await assertFails(setDoc(doc(dbStudent2, 'radar_alerts', 'student_2'), {
      student_id: 2,
      timestamp: Date.now(),
      type: 'HESITATION',
      message: 'Help needed'
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Student write to /radar_alerts strictly blocked!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Student write to /radar_alerts was NOT blocked:`, err);
  }

  // --- TEST 22: Student attempts to write to /audit_logs (MUST FAIL 403) ---
  testCount++;
  console.log(`\n[TEST 22: AUDIT_LOGS LOCK-DOWN] Student attempts to write to /audit_logs/audit_s2_01...`);
  try {
    await assertFails(setDoc(doc(dbStudent2, 'audit_logs', 'audit_s2_01'), {
      user_id: 'student_2',
      action: 'LOGIN',
      timestamp: Date.now()
    }));
    console.log(`✅ PASSED (403 PERMISSION_DENIED): Student write to /audit_logs strictly blocked!`);
    passedCount++;
  } catch (err) {
    console.error(`❌ FAILED: Student write to /audit_logs was NOT blocked:`, err);
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
