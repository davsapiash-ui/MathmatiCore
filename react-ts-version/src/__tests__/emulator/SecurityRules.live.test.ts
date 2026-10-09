import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ref, get as rtdbGet, set as rtdbSet, update as rtdbUpdate } from 'firebase/database';
import { telemetryDocIdOf } from '@/infrastructure/services/telemetryStamp';

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

const TEACHER_EMAIL = 'teacher@example.com';

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
    await setDoc(doc(fs, 'authorizedTeachers', 'other.teacher@example.com'), { email: 'other.teacher@example.com', role: 'teacher' });
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

/**
 * PRD Module 5 §ב / Appendix A §3: every event the client writes carries the
 * browser's random device_id and the server's time of receipt
 * (server_received_at = serverTimestamp(), equal to request.time). Without
 * them a write is refused, so every positive and negative case below carries
 * them: a negative case then fails for the reason it names, not for a missing stamp.
 */
const STAMPS = () => ({ device_id: 'abcdefghijkl', server_received_at: serverTimestamp(), synced_at: Date.now() });
/**
 * Module 4: the document id is the event's idempotency_key, a UUID v4. The
 * tests name their events; KEY turns a name into a UUID v4 (the same one
 * every time), as the client's queue does.
 */
const KEY = (name: string) => telemetryDocIdOf(name);
const learner7 = () => env.authenticatedContext('student_user7', { student_id: 7 });
const teacher = () => env.authenticatedContext('teacher_uid', { role: 'teacher', email: TEACHER_EMAIL });
const admin = () => env.authenticatedContext('admin_uid', { role: 'admin', email: 'admin@example.com' });

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

  it('אינו יוצר ואינו משנה מסמך תלמיד — גם לא את שלו (§ב.4, 1.10.2026)', async () => {
    const fs = learner12().firestore();
    const own = { student_id: 12, class_id: 'class_1', school_id: 'school_bikorot', created_at: 1 };
    // Every id spelling isOwningStudent accepts.
    for (const id of ['12', 'student_12', 'user12', 'student_user12']) {
      await assertFails(setDoc(doc(fs, 'students', id), own));
    }
    await assertFails(setDoc(doc(fs, 'students', 'student_user12'), { ...own, student_id: 3, class_id: 'other' }, { merge: true }));
  });

  it('אינו מונה את רשימת המורות — וגם לא קורא מסמך בודד ממנה', async () => {
    await assertFails(getDocs(collection(learner12().firestore(), 'authorizedTeachers')));
    await assertFails(getDoc(doc(learner12().firestore(), 'authorizedTeachers', TEACHER_EMAIL)));
  });

  it('אינו כותב טלמטריה בשם ילד אחר', async () => {
    const key = KEY('idem_foreign_1');
    await assertFails(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      ...STAMPS(), idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_3_student_user7',
      student_id: 7, exercise_id: 's3_g_t1', event_type: 'PROBLEM_LOAD', details: {},
    }));
  });

  it('כותב טלמטריה תקינה בשם עצמו', async () => {
    const key = KEY('idem_own_1');
    await assertSucceeds(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      ...STAMPS(), idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_3_student_user12',
      student_id: 12, exercise_id: 's3_g_t1', event_type: 'PROBLEM_LOAD', details: {},
    }));
  });

  it('כלל ה-column_index של מודול 5 נאכף בשרת: אירוע לפי טור בלי טור נדחה', async () => {
    const key = KEY('idem_nocol');
    await assertFails(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      ...STAMPS(), idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_3_student_user12',
      student_id: 12, exercise_id: 's3_g_t1', event_type: 'DIGIT_ENTERED',
      details: { digit_value: 4, is_correct: true },
    }));
  });

  it('אירוע שנכתב אינו ניתן לשינוי בדיעבד', async () => {
    const key = KEY('idem_immutable');
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

  it('יוצרת ומעדכנת את מסמכי הלומדים בהפעלת מפגש (TeacherDashboard)', async () => {
    const fs = teacher().firestore();
    for (const n of [1, 12]) {
      await assertSucceeds(setDoc(doc(fs, 'students', `student_user${n}`), {
        student_id: n, class_id: 'class_1', school_id: 'school_bikorot', created_at: Date.now(), active_session_id: 'session_03',
      }, { merge: true }));
    }
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
    await assertSucceeds(setDoc(doc(admin().firestore(), 'authorizedTeachers', 'new.teacher@example.com'), {
      email: 'new.teacher@example.com', role: 'teacher',
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
    await assertFails(getDoc(doc(preClaim.firestore(), 'authorizedTeachers', 'other.teacher@example.com')));
  });

  it('אסימון בלי דוא"ל כלל (הדרכון האנונימי של הילד) אינו קורא דבר מהרשימה', async () => {
    await assertFails(getDoc(doc(learner7().firestore(), 'authorizedTeachers', TEACHER_EMAIL)));
  });
});

/* ── מודול 8 §א — ניקוי הלוח בפח (פער יז, 23.9.2026) ──────────────────── */

describe('ניקוי הלוח נרשם כאירוע תקני', () => {
  it('הילד כותב BOARD_CLEARED בלי טור, והשרת מקבל', async () => {
    const key = KEY('idem_board_cleared');
    await assertSucceeds(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      ...STAMPS(), idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_4_student_user12',
      student_id: 12, exercise_id: 's4_g_t1', event_type: 'BOARD_CLEARED',
      details: { units: 3, tens: 2, hundreds: 0, thousands: 0, blocks_removed: 5 },
    }));
  });

  it('עם טור — נדחה, כי הניקוי אינו שייך לטור אחד', async () => {
    const key = KEY('idem_board_cleared_col');
    await assertFails(setDoc(doc(learner12().firestore(), 'telemetry_logs', key), {
      ...STAMPS(), idempotency_key: key, client_timestamp: Date.now(), session_id: 'session_4_student_user12',
      student_id: 12, exercise_id: 's4_g_t1', event_type: 'BOARD_CLEARED', column_index: 0,
      details: { units: 3, tens: 2, hundreds: 0, thousands: 0, blocks_removed: 5 },
    }));
  });
});

/* ── מודול 5 §ב / נספח א' §3 — החותמות, ו-BRANCH_SELECTED (מודול 14 §ג) ── */

describe('telemetry stamps: server_received_at, device_id, sequence_number', () => {
  const event = (name: string, over: Record<string, unknown> = {}) => ({
    ...STAMPS(), idempotency_key: KEY(name), client_timestamp: Date.now(), session_id: 'session_4_student_user12',
    student_id: 12, exercise_id: 's4_g_t1', event_type: 'PROBLEM_LOAD', details: {}, ...over,
  });
  const write = (name: string, data: Record<string, unknown>) =>
    setDoc(doc(learner12().firestore(), 'telemetry_logs', KEY(name)), data);
  /** Written under exactly this id, with idempotency_key equal to it. */
  const writeRaw = (id: string, over: Record<string, unknown> = {}) =>
    setDoc(doc(learner12().firestore(), 'telemetry_logs', id), { ...event('unused'), idempotency_key: id, ...over });

  it('with a sequence_number it is accepted', async () => {
    await assertSucceeds(write('idem_seq', event('idem_seq', { sequence_number: 7 })));
  });

  it('without a sequence_number (queued before the counter existed) it is still accepted', async () => {
    const data = event('idem_legacy');
    expect('sequence_number' in data).toBe(false);
    await assertSucceeds(write('idem_legacy', data));
  });

  it('a negative or fractional sequence_number is refused', async () => {
    await assertFails(write('idem_seq_neg', event('idem_seq_neg', { sequence_number: -1 })));
    await assertFails(write('idem_seq_frac', event('idem_seq_frac', { sequence_number: 1.5 })));
  });

  it('a server_received_at set by the client is refused', async () => {
    await assertFails(write('idem_client_time', event('idem_client_time', { server_received_at: Timestamp.now() })));
  });

  it('without server_received_at it is refused', async () => {
    const data: Record<string, unknown> = event('idem_no_srv');
    delete data.server_received_at;
    await assertFails(write('idem_no_srv', data));
  });

  it('without device_id it is refused', async () => {
    const data: Record<string, unknown> = event('idem_no_dev');
    delete data.device_id;
    await assertFails(write('idem_no_dev', data));
  });

  it('a device_id that is not a random id (a name, with a space) is refused', async () => {
    await assertFails(write('idem_name_dev', event('idem_name_dev', { device_id: 'Dana Cohen' })));
    await assertFails(write('idem_short_dev', event('idem_short_dev', { device_id: 'abc' })));
  });

  // Module 4 / Module 17 §ב / Appendix A §3: synced_at is required, a number.
  it('without synced_at it is refused', async () => {
    const data: Record<string, unknown> = event('idem_no_synced');
    delete data.synced_at;
    await assertFails(write('idem_no_synced', data));
  });

  it('a synced_at that is not a number is refused', async () => {
    await assertFails(write('idem_synced_str', event('idem_synced_str', { synced_at: '2026-10-09' })));
    await assertFails(write('idem_synced_null', event('idem_synced_null', { synced_at: null })));
  });

  // Module 4: "שמזהה המסמך שלו הוא idempotency_key של האירוע, UUID v4".
  it('a document id that is not a UUID v4 is refused, even when it equals idempotency_key', async () => {
    await assertFails(writeRaw('telemetry_1700000000000_abc1234')); // the old client fallback
    await assertFails(writeRaw('idem_plain'));
    await assertFails(writeRaw('0f8fad5b-d9cb-169f-a165-70867728950e')); // version 1
    await assertFails(writeRaw('0F8FAD5B-D9CB-469F-A165-70867728950E')); // upper case
    await assertSucceeds(writeRaw('0f8fad5b-d9cb-469f-a165-70867728950e'));
  });

  it('a document id that is not the idempotency_key is refused', async () => {
    await assertFails(setDoc(doc(learner12().firestore(), 'telemetry_logs', KEY('idem_a')), event('idem_b')));
  });

  it('an unknown key is refused', async () => {
    await assertFails(write('idem_extra', event('idem_extra', { child_name: 'x' })));
  });

  it('BRANCH_SELECTED without a column is accepted, with column_index refused', async () => {
    await assertSucceeds(write('idem_branch', event('idem_branch', { event_type: 'BRANCH_SELECTED', details: { branch: 'challenge' }, sequence_number: 3 })));
    await assertFails(write('idem_branch_col', event('idem_branch_col', { event_type: 'BRANCH_SELECTED', column_index: 0, details: { branch: 'reinforcement' } })));
  });
});

/* ── מודול 17 §ב — "אירועים שנדחו", מונה לכל מכשיר ── */

describe('users/students/{id}/refusedEvents/{device_id}', () => {
  const path = (dev: string) => `users/students/student_user12/refusedEvents/${dev}`;

  it('the learner writes a whole count ≥ 0 for a device, and removes it', async () => {
    const db = learner12().database();
    await assertSucceeds(rtdbUpdate(ref(db, 'users/students/student_user12'), { 'refusedEvents/abcdefghijkl': 2 }));
    await assertSucceeds(rtdbSet(ref(db, path('abcdefghijkl')), 0));
    await assertSucceeds(rtdbUpdate(ref(db, 'users/students/student_user12'), { 'refusedEvents/abcdefghijkl': null }));
  });

  it('a negative, fractional or non-number count is refused', async () => {
    const db = learner12().database();
    await assertFails(rtdbSet(ref(db, path('abcdefghijkl')), -1));
    await assertFails(rtdbSet(ref(db, path('abcdefghijkl')), 1.5));
    await assertFails(rtdbSet(ref(db, path('abcdefghijkl')), 'two'));
  });

  it('a key that is not a device id, or a bare number in place of the per-device map, is refused', async () => {
    const db = learner12().database();
    await assertFails(rtdbSet(ref(db, path('Dana Cohen')), 1));
    await assertFails(rtdbSet(ref(db, 'users/students/student_user12/refusedEvents'), 3));
  });

  it('another learner cannot write it; the teacher reads it', async () => {
    await assertFails(rtdbSet(ref(learner7().database(), path('abcdefghijkl')), 1));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await rtdbSet(ref(ctx.database(), path('abcdefghijkl')), 4);
    });
    await assertSucceeds(rtdbGet(ref(teacher().database(), 'users/students/student_user12/refusedEvents')));
  });
});
