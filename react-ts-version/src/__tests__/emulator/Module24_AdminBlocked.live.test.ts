import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { ref, get as rtdbGet, set as rtdbSet, update as rtdbUpdate } from 'firebase/database';
import { ref as storageRef, getBytes, uploadString } from 'firebase/storage';
import { claimsForSignIn } from '../../../../functions/src/roleClaims';

/**
 * PRD מודול 24 §ב: "מנהלי מערכת חסומים מגישה לנתוני טלמטריה פרטניים או למסמכי
 * תלמידים אישיים". מודול 23א §ו: "מנהל מערכת חסום מביצוע איפוס נתוני למידה".
 * מרשם הסטיות, פער יא: התפקיד נבחר בכל כניסה, וה-claims של אותה כניסה קובעים
 * מה נפתח — כמורה הדשבורד במלואו, כמנהל הקונסולה.
 *
 * הזהויות כאן הן בדיוק ה-claims ש-syncUserRoles חותם (claimsForSignIn), לא
 * אסימון מומצא. דוח הבדיקה של 28.9.2026 (נ.2) מצא שהמנהל פותח, עוצר וסוגר
 * מפגשים, מאשר בשער וקורא את נתוני הלומדים ב-RTDB.
 */
const root = resolve(__dirname, '../../../..');
let env: RulesTestEnvironment;

const OWNER_EMAIL = 'owner@edu-haifa.org.il';
const TEACHER_EMAIL = 'pilot.teacher@edu-haifa.org.il';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mathmaticore',
    firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf-8'), host: '127.0.0.1', port: 8080 },
    database: { rules: readFileSync(resolve(root, 'database.rules.json'), 'utf-8'), host: '127.0.0.1', port: 9000 },
    storage: { rules: readFileSync(resolve(root, 'storage.rules'), 'utf-8'), host: '127.0.0.1', port: 9199 },
  });
});

afterAll(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearDatabase();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, 'classes', 'class_1'), {
      class_id: 'class_1', school_id: 'school_bikorot', class_name: 'המבקרים',
      class_type: 'pilot', active_session_id: 1, projector_mode: false,
      projector_mode_updated_at: 0, updated_by_teacher_id: 'teacher',
    });
    await setDoc(doc(fs, 'students', 'student_user12'), { student_id: 12 });
    await setDoc(doc(fs, 'sessions', 'session_02_student_12'), {
      session_id: 'session_02_student_12', class_id: 'class_1', session_number: 2,
      is_completed: true, session_score_percent: 43, teacher_gate_approved: false,
    });
    await setDoc(doc(fs, 'telemetry_logs', 'idem_12'), {
      idempotency_key: 'idem_12', client_timestamp: 1, session_id: 'session_3_student_user12',
      student_id: 12, exercise_id: 's3_g_t1', event_type: 'PROBLEM_LOAD', details: {},
    });
    await setDoc(doc(fs, 'workspace_states', 'ws_12'), { student_id: 12, session_id: 's', exercise_id: 'e' });
    await setDoc(doc(fs, 'radar_alerts', 'a_12'), { student_id: 12 });
    await setDoc(doc(fs, 'srl_reflections', 'r_12'), { student_id: 12 });
    await setDoc(doc(fs, 'store_cache', 'admin_metrics'), { totalStudents: 12 });
    await setDoc(doc(fs, 'messages', 'm1'), { sender_id: 'teacher_x', receiver_id: 'admin', read: false });

    const db = ctx.database();
    await rtdbSet(ref(db, 'users/students/student_user12'), {
      routeStatus: 'PENDING_TEACHER_APPROVAL', teacher_gate_approved: false, pedagogicalPath: 'green_path', isOnline: true,
    });
    await rtdbSet(ref(db, 'students/student_user12'), { isOnline: true });
    await rtdbSet(ref(db, 'radar_alerts/student_user12_1'), { studentId: 'student_user12' });
    await rtdbSet(ref(db, 'sessions/session_03_student_12'), { timestamp: 1 });
    await rtdbSet(ref(db, 'replays/student_user12'), { frames: 1 });
    await rtdbSet(ref(db, 'reflections/session_08_student_12'), { timestamp: 1 });
    await rtdbSet(ref(db, 'chat_messages/student_user12/m1'), { text: 'שלום' });
    await rtdbSet(ref(db, 'active_class_session'), { active: false, status: 'closed', sessionNumber: 2 });
    await rtdbSet(ref(db, 'audit_logs/l1'), { timestamp: 1, user_id: 'admin' });

    const st = ctx.storage();
    await uploadString(storageRef(st, 'reports/class_1/student_12.pdf'), 'pdf');
    await uploadString(storageRef(st, 'backups/class_1/reset_1.json'), '{}');
  });
});

// The owner's admin address, signed in as the admin — what syncUserRoles stamps.
const adminSignIn = () => env.authenticatedContext('owner_uid', {
  ...claimsForSignIn({ isAuthorizedAdmin: true, isAuthorizedTeacher: false }, 'admin'), email: OWNER_EMAIL,
});
// The same address, signed in as the teacher (register, gap יא).
const ownerAsTeacher = () => env.authenticatedContext('owner_uid', {
  ...claimsForSignIn({ isAuthorizedAdmin: true, isAuthorizedTeacher: false }, 'teacher'), email: OWNER_EMAIL,
});
const teacher = () => env.authenticatedContext('teacher_uid', {
  ...claimsForSignIn({ isAuthorizedAdmin: false, isAuthorizedTeacher: true }, 'teacher'), email: TEACHER_EMAIL,
});

/* ── נ.2 — המנהל אינו רואה ואינו מפעיל את מה שהוא של המורה ──────────────── */

describe('מודול 24 §ב — כניסת מנהל אינה קוראת נתוני לומד (RTDB)', () => {
  for (const path of [
    'users/students', 'users/students/student_user12', 'students', 'students/student_user12',
    'radar_alerts', 'sessions', 'sessions/session_03_student_12', 'replays', 'replays/student_user12',
    'reflections', 'chat_messages', 'chat_messages/student_user12',
  ]) {
    it(`אינה קוראת ${path}`, async () => {
      await assertFails(rtdbGet(ref(adminSignIn().database(), path)));
    });
  }

  it('אינה כותבת לרשומת לומד', async () => {
    await assertFails(rtdbUpdate(ref(adminSignIn().database(), 'users/students/student_user12'), { isOnline: false }));
  });
});

describe('מודול 20 ומודול 14 — כניסת מנהל אינה מאשרת בשער ואינה מפעילה מפגש', () => {
  it('אינה מאשרת את השער ב-RTDB', async () => {
    await assertFails(rtdbUpdate(ref(adminSignIn().database(), 'users/students/student_user12'), {
      teacher_gate_approved: true, routeStatus: 'APPROVED', teacher_selected_path: 'green_path',
    }));
  });

  it('אינה מאשרת את השער במסמך המפגש', async () => {
    await assertFails(updateDoc(doc(adminSignIn().firestore(), 'sessions', 'session_02_student_12'), {
      teacher_gate_approved: true, teacher_selected_path: 'green_path', gate_approved_at: 1, gate_approved_by: 'owner_uid',
    }));
  });

  it('אינה פותחת, עוצרת או סוגרת מפגש', async () => {
    const acs = ref(adminSignIn().database(), 'active_class_session');
    await assertFails(rtdbSet(acs, { active: true, status: 'active', sessionNumber: 3, startedAt: 1, teacherId: 'owner_uid' }));
    await assertFails(rtdbUpdate(acs, { status: 'paused' }));
    await assertFails(rtdbSet(acs, { active: false, status: 'closed', sessionNumber: 3 }));
  });
});

describe('מודול 24 §ב ו-23א §ו — כניסת מנהל אינה קוראת ואינה מוחקת מסמכי לומד (Firestore, Storage)', () => {
  it('אינה קוראת את מסמך הלומד, מסמך המפגש, הטלמטריה, מצב הלוח, התראות הרדאר והרפלקציה', async () => {
    const fs = adminSignIn().firestore();
    await assertFails(getDoc(doc(fs, 'students', 'student_user12')));
    await assertFails(getDoc(doc(fs, 'sessions', 'session_02_student_12')));
    await assertFails(getDocs(collection(fs, 'sessions')));
    await assertFails(getDoc(doc(fs, 'telemetry_logs', 'idem_12')));
    await assertFails(getDoc(doc(fs, 'workspace_states', 'ws_12')));
    await assertFails(getDoc(doc(fs, 'radar_alerts', 'a_12')));
    await assertFails(getDoc(doc(fs, 'srl_reflections', 'r_12')));
  });

  it('אינה מוחקת נתוני למידה (איפוס)', async () => {
    const fs = adminSignIn().firestore();
    await assertFails(deleteDoc(doc(fs, 'students', 'student_user12')));
    await assertFails(deleteDoc(doc(fs, 'sessions', 'session_02_student_12')));
    await assertFails(deleteDoc(doc(fs, 'telemetry_logs', 'idem_12')));
    await assertFails(deleteDoc(doc(fs, 'workspace_states', 'ws_12')));
    await assertFails(deleteDoc(doc(fs, 'srl_reflections', 'r_12')));
  });

  it('אינה כותבת התראות רדאר ואינה רושמת ביומן האיפוסים', async () => {
    const fs = adminSignIn().firestore();
    await assertFails(setDoc(doc(fs, 'radar_alerts', 'a_new'), { student_id: 12 }));
    await assertFails(setDoc(doc(fs, 'reset_audit_log', 'r_new'), { reset_level: 'alerts' }));
    await assertSucceeds(setDoc(doc(teacher().firestore(), 'reset_audit_log', 'r_t'), { reset_level: 'alerts' }));
  });

  it('אינה קוראת דוח אישי או גיבוי איפוס בקבצים', async () => {
    const st = adminSignIn().storage();
    await assertFails(getBytes(storageRef(st, 'reports/class_1/student_12.pdf')));
    await assertFails(getBytes(storageRef(st, 'backups/class_1/reset_1.json')));
  });
});

/* ── המסכים הלגיטימיים של המנהל ממשיכים לעבוד ──────────────────────────── */

describe('הקונסולה של המנהל עובדת', () => {
  it('מוסדות, מורות, כיתה ומגבלת תלמידים (RTDB)', async () => {
    const db = adminSignIn().database();
    await assertSucceeds(rtdbSet(ref(db, 'schools/school_bikorot'), { id: 'school_bikorot', name: 'בית ספר ביקורת' }));
    await assertSucceeds(rtdbSet(ref(db, 'users/teachers/pilot_teacher'), { id: 'pilot_teacher', licenseActive: true }));
    await assertSucceeds(rtdbSet(ref(db, 'classes/class_1'), { id: 'class_1', name: 'המבקרים' }));
    await assertSucceeds(rtdbSet(ref(db, 'public_classes/class_1'), { id: 'class_1', name: 'המבקרים' }));
    await assertSucceeds(rtdbSet(ref(db, 'system_control/globalStudentLimit'), 12));
    await assertSucceeds(rtdbGet(ref(db, 'audit_logs')));
    await assertSucceeds(rtdbGet(ref(db, 'active_class_session')));
  });

  it('רשימת המורות, קטלוג, כיול, סקירה מצרפית, פניות וצ\'אט (Firestore)', async () => {
    const fs = adminSignIn().firestore();
    await assertSucceeds(setDoc(doc(fs, 'authorizedTeachers', 'new.teacher@edu-haifa.org.il'), { email: 'new.teacher@edu-haifa.org.il', role: 'teacher' }));
    await assertSucceeds(setDoc(doc(fs, 'curriculum_catalog', 'bank_s3_green'), { id: 'bank_s3_green' }));
    await assertSucceeds(setDoc(doc(fs, 'system_control', 'trace_calibration'), { hesitation_threshold_seconds: 45 }, { merge: true }));
    await assertSucceeds(getDoc(doc(fs, 'store_cache', 'admin_metrics')));
    await assertSucceeds(getDoc(doc(fs, 'classes', 'class_1')));
    await assertSucceeds(getDoc(doc(fs, 'messages', 'm1')));
    await assertSucceeds(updateDoc(doc(fs, 'messages', 'm1'), { read: true }));
  });
});

/* ── המורה — וגם בעל המוצר כשהוא נכנס כמורה — עושה את עבודתו ────────────── */

describe('המורה עובדת כרגיל, גם כשבעל המוצר נכנס כמורה', () => {
  for (const [name, who] of [['מורה', teacher], ['בעל המוצר כמורה', ownerAsTeacher]] as const) {
    it(`${name}: קוראת את הלומדים, פותחת מפגש ומאשרת בשער`, async () => {
      const db = who().database();
      await assertSucceeds(rtdbGet(ref(db, 'users/students')));
      await assertSucceeds(rtdbGet(ref(db, 'radar_alerts')));
      await assertSucceeds(rtdbGet(ref(db, 'chat_messages/student_user12')));
      await assertSucceeds(rtdbSet(ref(db, 'active_class_session'), { active: true, status: 'active', sessionNumber: 3, startedAt: 1, teacherId: 'teacher' }));
      await assertSucceeds(rtdbUpdate(ref(db, 'users/students/student_user12'), {
        teacher_gate_approved: true, routeStatus: 'APPROVED', pedagogicalPath: 'green_path',
      }));
      const fs = who().firestore();
      await assertSucceeds(getDoc(doc(fs, 'students', 'student_user12')));
      await assertSucceeds(getDoc(doc(fs, 'telemetry_logs', 'idem_12')));
      await assertSucceeds(updateDoc(doc(fs, 'sessions', 'session_02_student_12'), {
        teacher_gate_approved: true, teacher_selected_path: 'green_path', gate_approved_at: 1, gate_approved_by: 'teacher_uid',
      }));
      await assertSucceeds(getBytes(storageRef(who().storage(), 'reports/class_1/student_12.pdf')));
      await assertSucceeds(getBytes(storageRef(who().storage(), 'backups/class_1/reset_1.json')));
    });

    it(`${name}: אינה מקבלת את כלי המנהל`, async () => {
      await assertFails(setDoc(doc(who().firestore(), 'authorizedTeachers', 'x@edu-haifa.org.il'), { email: 'x@edu-haifa.org.il', role: 'teacher' }));
      await assertFails(rtdbSet(ref(who().database(), 'schools/school_bikorot'), { id: 'school_bikorot' }));
    });
  }
});
