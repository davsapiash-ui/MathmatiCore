import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { ref, get as rtdbGet, set as rtdbSet, update as rtdbUpdate } from 'firebase/database';

/**
 * חוקי האבטחה האמיתיים, במנוע האמיתי (23.9.2026).
 *
 * עד עכשיו כל בדיקות החוקים בפרויקט קראו את **הטקסט** של `firestore.rules`
 * וחיפשו מחרוזות. זה תופס שינוי לא מכוון, אבל אינו מוכיח דבר על מה שקורה
 * כשאסימון אמיתי של ילד פוגש את המנוע: ביטוי שנכתב נכון אך מתנהג אחרת, כלל
 * שנדרס בהמשך הקובץ, `get()` שנכשל בשקט.
 *
 * כאן רצים חוקי הייצור עצמם מול אמולטור, עם שלוש זהויות אמיתיות: תלמיד 12
 * (קצה הטווח), מורה, ומנהל. כל טענה במודול 27 ובמודול 24 §ב נבדקת בפועל.
 */
const root = resolve(__dirname, '../../../..');
let env: RulesTestEnvironment;

const TEACHER_EMAIL = 'pilot.teacher@edu-haifa.org.il';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mathmaticore',
    firestore: {
      rules: readFileSync(resolve(root, 'firestore.rules'), 'utf-8'),
      host: '127.0.0.1',
      port: 8080,
    },
    database: {
      rules: readFileSync(resolve(root, 'database.rules.json'), 'utf-8'),
      host: '127.0.0.1',
      port: 9000,
    },
  });
});

afterAll(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, 'authorizedTeachers', TEACHER_EMAIL), { email: TEACHER_EMAIL, role: 'teacher' });
    await setDoc(doc(fs, 'authorizedTeachers', 'other.teacher@edu-haifa.org.il'), { email: 'other.teacher@edu-haifa.org.il', role: 'teacher' });
    await setDoc(doc(fs, 'classes', 'class_1'), {
      class_id: 'class_1', school_id: 'school_bikorot', class_name: 'המבקרים',
      class_type: 'pilot', active_session_id: 1, projector_mode: false,
      projector_mode_updated_at: 0, updated_by_teacher_id: 'teacher',
    });
    await setDoc(doc(fs, 'students', 'student_user12'), { student_id: 12 });
    await setDoc(doc(fs, 'students', 'student_user7'), { student_id: 7 });
    await setDoc(doc(fs, 'sessions', 'session_02_student_12'), {
      session_id: 'session_02_student_12', class_id: 'class_1', session_number: 2,
      is_completed: true, session_score_percent: 43, teacher_gate_approved: false,
    });
    const db = ctx.database();
    await rtdbSet(ref(db, 'users/students/student_user12'), { routeStatus: 'PENDING_TEACHER_APPROVAL', teacher_gate_approved: false, pedagogicalPath: 'green_path' });
  });
});

const learner12 = () => env.authenticatedContext('student_user12', { student_id: 12 });
const learner7 = () => env.authenticatedContext('student_user7', { student_id: 7 });
const teacher = () => env.authenticatedContext('teacher_uid', { role: 'teacher', email: TEACHER_EMAIL });
const admin = () => env.authenticatedContext('admin_uid', { role: 'admin', email: 'owner@edu-haifa.org.il' });

/* ── מודול 27 §ב.4 — מה שילד יכול לקרוא ───────────────────────────────── */

describe('מודול 27 — אסימון של ילד מול המנוע האמיתי', () => {
  it('קורא את מסמך התלמיד של עצמו', async () => {
    await assertSucceeds(getDoc(doc(learner12().firestore(), 'students', 'student_user12')));
  });

  it('אינו קורא את המסמך של ילד אחר', async () => {
    await assertFails(getDoc(doc(learner12().firestore(), 'students', 'student_user7')));
  });

  it('אינו קורא את מסמך הכיתה (התיקון מ-22.9)', async () => {
    await assertFails(getDoc(doc(learner12().firestore(), 'classes', 'class_1')));
  });

  it('אינו מונה את רשימת המורות — וגם לא קורא מסמך בודד ממנה', async () => {
    await assertFails(getDocs(collection(learner12().firestore(), 'authorizedTeachers')));
    await assertFails(getDoc(doc(learner12().firestore(), 'authorizedTeachers', TEACHER_EMAIL)));
  });

  it('אינו כותב טלמטריה בשם ילד אחר', async () => {
    const key = 'idem_foreign_1';
    await assertFails(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_3_student_user7',
      student_id: 7, exercise_id: 's3_g_t1', event_type: 'PROBLEM_LOAD', details: {},
    }));
  });

  it('כותב טלמטריה תקינה בשם עצמו', async () => {
    const key = 'idem_own_1';
    await assertSucceeds(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_3_student_user12',
      student_id: 12, exercise_id: 's3_g_t1', event_type: 'PROBLEM_LOAD', details: {},
    }));
  });

  it('כלל ה-column_index של מודול 5 נאכף בשרת: אירוע לפי טור בלי טור נדחה', async () => {
    const key = 'idem_nocol';
    await assertFails(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_3_student_user12',
      student_id: 12, exercise_id: 's3_g_t1', event_type: 'DIGIT_ENTERED',
      details: { digit_value: 4, is_correct: true },
    }));
  });

  it('אירוע שנכתב אינו ניתן לשינוי בדיעבד', async () => {
    const key = 'idem_immutable';
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'telemetry_logs', key), {
        idempotency_key: key, client_timestamp: 1, session_id: 'session_3_student_user12',
        student_id: 12, exercise_id: 's3_g_t1', event_type: 'PROBLEM_LOAD', details: {},
      });
    });
    await assertFails(updateDoc(doc(learner12().firestore(), 'telemetry_logs', key), { details: { tampered: true } }));
  });

  it('אינו מאשר לעצמו את שער המורה', async () => {
    await assertFails(updateDoc(doc(learner12().firestore(), 'sessions', 'session_02_student_12'), {
      teacher_gate_approved: true, teacher_selected_path: 'green_path',
    }));
  });

  it('אינו משחרר לעצמו את השער גם במראה שב-RTDB (סטייה 15)', async () => {
    await assertFails(rtdbUpdate(ref(learner12().database(), 'users/students/student_user12'), {
      teacher_gate_approved: true, routeStatus: 'APPROVED',
    }));
  });

  it('אינו מחליף לעצמו מסלול למידה (סטייה 16)', async () => {
    await assertFails(rtdbUpdate(ref(learner12().database(), 'users/students/student_user12'), {
      pedagogicalPath: 'remediation_path',
    }));
  });
});

/* ── המורה עושה את עבודתה ─────────────────────────────────────────────── */

describe('מודול 20/27 — המורה', () => {
  it('קוראת את מסמך הכיתה ואת מסמכי הלומדים', async () => {
    await assertSucceeds(getDoc(doc(teacher().firestore(), 'classes', 'class_1')));
    await assertSucceeds(getDoc(doc(teacher().firestore(), 'students', 'student_user12')));
  });

  it('מאשרת את השער — ב-Firestore וגם במראה שב-RTDB', async () => {
    await assertSucceeds(updateDoc(doc(teacher().firestore(), 'sessions', 'session_02_student_12'), {
      teacher_gate_approved: true, teacher_selected_path: 'remediation_path',
      gate_approved_at: Date.now(), gate_approved_by: 'teacher_uid',
    }));
    await assertSucceeds(rtdbUpdate(ref(teacher().database(), 'users/students/student_user12'), {
      teacher_gate_approved: true, routeStatus: 'APPROVED', pedagogicalPath: 'remediation_path',
    }));
  });

  it('קוראת את הטלמטריה של הכיתה', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'telemetry_logs', 'idem_read'), {
        idempotency_key: 'idem_read', client_timestamp: 1, session_id: 'session_3_student_user12',
        student_id: 12, exercise_id: 's3_g_t1', event_type: 'PROBLEM_LOAD', details: {},
      });
    });
    await assertSucceeds(getDoc(doc(teacher().firestore(), 'telemetry_logs', 'idem_read')));
  });

  it('קוראת את הרשימה הלבנה — הכניסה שלה תלויה בזה', async () => {
    await assertSucceeds(getDoc(doc(teacher().firestore(), 'authorizedTeachers', TEACHER_EMAIL)));
  });
});

/* ── מודול 24 §ב — מנהל מערכת אינו רואה לומד יחיד ─────────────────────── */

describe('מודול 24 §ב — המנהל חסום מנתוני לומד יחיד', () => {
  it('אינו קורא מסמך של לומד', async () => {
    await assertFails(getDoc(doc(admin().firestore(), 'students', 'student_user12')));
  });

  it('אינו קורא אירוע טלמטריה של לומד', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'telemetry_logs', 'idem_admin'), {
        idempotency_key: 'idem_admin', client_timestamp: 1, session_id: 'session_3_student_user12',
        student_id: 12, exercise_id: 's3_g_t1', event_type: 'PROBLEM_LOAD', details: {},
      });
    });
    await assertFails(getDoc(doc(admin().firestore(), 'telemetry_logs', 'idem_admin')));
  });

  it('כן מנהל את המערכת: רשימת המורות וכיול הרדאר', async () => {
    await assertSucceeds(setDoc(doc(admin().firestore(), 'authorizedTeachers', 'new.teacher@edu-haifa.org.il'), {
      email: 'new.teacher@edu-haifa.org.il', role: 'teacher',
    }));
    await assertSucceeds(setDoc(doc(admin().firestore(), 'system_control', 'trace_calibration'), {
      hesitation_threshold_seconds: 60, updated_at: Date.now(),
    }, { merge: true }));
  });
});

/* ── כניסת המורה: קריאת המסמך שהוא הכתובת של עצמה ─────────────────────── */

describe('הרשימה הלבנה — בדיקת הכניסה ממשיכה לעבוד (התיקון מ-22.9)', () => {
  it('זהות Google לפני חתימת ה-claim קוראת את המסמך שהוא הכתובת שלה עצמה', async () => {
    const preClaim = env.authenticatedContext('fresh_google_uid', { email: TEACHER_EMAIL });
    await assertSucceeds(getDoc(doc(preClaim.firestore(), 'authorizedTeachers', TEACHER_EMAIL)));
  });

  it('ואינה קוראת את המסמך של מורה אחרת', async () => {
    const preClaim = env.authenticatedContext('fresh_google_uid', { email: TEACHER_EMAIL });
    await assertFails(getDoc(doc(preClaim.firestore(), 'authorizedTeachers', 'other.teacher@edu-haifa.org.il')));
  });

  it('אסימון בלי דוא"ל כלל (הדרכון האנונימי של הילד) אינו קורא דבר מהרשימה', async () => {
    await assertFails(getDoc(doc(learner7().firestore(), 'authorizedTeachers', TEACHER_EMAIL)));
  });
});

/* ── מודול 8 §א — ניקוי הלוח בפח (פער יז, 23.9.2026) ──────────────────── */

describe('ניקוי הלוח נרשם כאירוע תקני', () => {
  it('הילד כותב BOARD_CLEARED בלי טור, והשרת מקבל', async () => {
    const key = 'idem_board_cleared';
    await assertSucceeds(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_4_student_user12',
      student_id: 12, exercise_id: 's4_g_t1', event_type: 'BOARD_CLEARED',
      details: { units: 3, tens: 2, hundreds: 0, thousands: 0, blocks_removed: 5 },
    }));
  });

  it('עם טור — נדחה, כי הניקוי אינו שייך לטור אחד', async () => {
    const key = 'idem_board_cleared_col';
    await assertFails(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_4_student_user12',
      student_id: 12, exercise_id: 's4_g_t1', event_type: 'BOARD_CLEARED', column_index: 0,
      details: { units: 3, tens: 2, hundreds: 0, thousands: 0, blocks_removed: 5 },
    }));
  });
});
