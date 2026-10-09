import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, set as rtdbSet, update as rtdbUpdate } from 'firebase/database';

/**
 * בעל המוצר, 29.9.2026 — הציון, ההמלצה והאישור אינם של הלומד.
 *
 * מודול 20: session_score_percent ו-matrix_recommended_path מחושבים "בטריגר
 * עצמאי על סיום המפגש" (sessionTrigger.ts, Admin SDK — החוקים אינם חלים עליו).
 * לומד אינו קובע אותם, אינו משנה אותם ואינו מרוקן אותם — לא במסמך המפגש ולא
 * במראה שב-RTDB — ואינו מבטל אישור שהמורה נתנה. מה שהלקוח שלו כותב באמת
 * (סיום מפגש 2, תגיות סבב התיקון, נוכחות) ממשיך לעבור, וכך גם איפוסי המורה.
 *
 * רץ מול האמולטור: npm run test:rules
 */
const root = resolve(__dirname, '../../../..');
let env: RulesTestEnvironment;

const S2 = 'session_02_student_12';
const REC = 'users/students/student_user12';

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

/** Completed and scored by the server; not yet approved. */
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'sessions', S2), {
      session_id: S2, class_id: 'class_1', session_number: 2, is_completed: true,
      session_score_percent: 43, matrix_recommended_path: 'remediation_path', evaluated_at: 1234,
      teacher_gate_approved: false, teacher_selected_path: null, gate_approved_at: null, gate_approved_by: null,
    });
    await rtdbSet(ref(ctx.database(), REC), {
      routeStatus: 'PENDING_TEACHER_APPROVAL', teacher_gate_approved: false, isOnline: true,
    });
  });
});

async function seedApproved() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'sessions', S2), {
      session_id: S2, class_id: 'class_1', session_number: 2, is_completed: true,
      session_score_percent: 43, matrix_recommended_path: 'remediation_path', evaluated_at: 1234,
      teacher_gate_approved: true, teacher_selected_path: 'remediation_path',
      gate_approved_at: 5678, gate_approved_by: 'teacher_uid',
    });
    await rtdbSet(ref(ctx.database(), REC), {
      session_02_completed: true, session_score_percent: 43, matrix_recommended_path: 'remediation_path',
      teacher_gate_approved: true, routeStatus: 'APPROVED', teacher_selected_path: 'remediation_path',
      pedagogicalPath: 'remediation_path', gate_approved_at: 5678, gate_approved_by: 'teacher_uid',
      isOnline: true, qMatrixResults: { task1_read_write_zero: 'success' },
    });
  });
}

const learner12 = () => env.authenticatedContext('student_user12', { student_id: 12 });
const teacher = () => env.authenticatedContext('teacher_uid', { role: 'teacher', email: 'teacher@example.com' });
const learnerDoc = () => doc(learner12().firestore(), 'sessions', S2);
const learnerRec = () => ref(learner12().database(), REC);

/** Exactly what FirebaseSyncService.syncSession2Completion queues for the session document. */
const completionDoc = {
  session_id: S2, class_id: 'class_1', session_number: 2,
  active_exercise_id: 'task8_missing_addend', is_completed: true, teacher_gate_approved: false,
  gate_approved_at: null, gate_approved_by: null, teacher_selected_path: null,
};

describe('מסמך המפגש — הציון וההמלצה של השרת', () => {
  it('אינו משנה ציון שהשרת חישב, ואינו מרוקן אותו', async () => {
    await assertFails(updateDoc(learnerDoc(), { session_score_percent: 100 }));
    await assertFails(updateDoc(learnerDoc(), { session_score_percent: null }));
  });

  it('אינו מחליף המלצה או חותמת חישוב, ואינו מוחק אותן', async () => {
    await assertFails(updateDoc(learnerDoc(), { matrix_recommended_path: 'green_path' }));
    await assertFails(updateDoc(learnerDoc(), { matrix_recommended_path: null }));
    await assertFails(updateDoc(learnerDoc(), { evaluated_at: 1 }));
  });

  it('אינו יוצר מסמך מפגש עם ציון, המלצה או חותמת משלו', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'sessions', S2));
    });
    const base = {
      session_id: S2, class_id: 'class_1', session_number: 2,
      is_completed: false, teacher_gate_approved: false,
    };
    const own = learnerDoc;
    await assertFails(setDoc(own(), { ...base, session_score_percent: 100 }));
    await assertFails(setDoc(own(), { ...base, matrix_recommended_path: 'green_path' }));
    await assertFails(setDoc(own(), { ...base, evaluated_at: 1 }));
    await assertSucceeds(setDoc(own(), { ...base, session_score_percent: null, matrix_recommended_path: null }));
  });

  // Module 4: "הלקוח כותב מסמך כזה רק למפגש 2" — a learner creates no
  // session document for any other meeting.
  it('אינו יוצר מסמך מפגש לשום מפגש מלבד מפגש 2', async () => {
    for (const n of [1, 3, 4, 5, 6, 7, 8]) {
      const id = `session_0${n}_student_12`;
      await assertFails(setDoc(doc(learner12().firestore(), 'sessions', id), {
        session_id: id, class_id: 'class_1', session_number: n, is_completed: false, teacher_gate_approved: false,
      }));
    }
  });

  it('…והמורה עדיין יוצרת מסמך מפגש לכל מפגש', async () => {
    await assertSucceeds(setDoc(doc(teacher().firestore(), 'sessions', 'session_03_student_12'), {
      session_id: 'session_03_student_12', class_id: 'class_1', session_number: 3, is_completed: false, teacher_gate_approved: false,
    }));
  });

  it('סיום מפגש 2 כפי שהלקוח כותב אותו עובר — על המסמך שיצרה פונקציית המועד', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', S2), {
        session_id: S2, class_id: 'class_1', session_number: 2, is_completed: false,
        session_score_percent: null, matrix_recommended_path: null, teacher_gate_approved: false,
        gate_approved_at: null, gate_approved_by: null, teacher_selected_path: null,
      });
    });
    await assertSucceeds(setDoc(learnerDoc(), completionDoc, { merge: true }));
  });

  it('…כשהמסמך עוד לא קיים', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'sessions', S2));
    });
    await assertSucceeds(setDoc(learnerDoc(), completionDoc, { merge: true }));
  });

  it('…וכשבמסמך ישן אין את שדות השער כלל (חסר ו-null הם אותו דבר)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions', S2), {
        session_id: S2, class_id: 'class_1', session_number: 2, is_completed: false, teacher_gate_approved: false,
      });
    });
    await assertSucceeds(setDoc(learnerDoc(), completionDoc, { merge: true }));
  });
});

describe('מסמך המפגש — אישור המורה אינו מתבטל בידי הלומד', () => {
  beforeEach(seedApproved);

  it('אינו מרוקן את המסלול שהמורה בחרה או את חותמות האישור (הפרצה בכלל הקודם)', async () => {
    await assertFails(updateDoc(learnerDoc(), { teacher_selected_path: null, gate_approved_at: null, gate_approved_by: null }));
    await assertFails(updateDoc(learnerDoc(), { teacher_selected_path: null }));
    await assertFails(updateDoc(learnerDoc(), { gate_approved_by: null }));
  });

  it('אינו מחליף את המסלול ואינו מבטל את הדגל', async () => {
    await assertFails(updateDoc(learnerDoc(), { teacher_selected_path: 'green_path' }));
    await assertFails(updateDoc(learnerDoc(), { teacher_gate_approved: false }));
  });

  it('כתיבה שמשאירה את כל אלה כפי שהם — עוברת', async () => {
    await assertSucceeds(updateDoc(learnerDoc(), { active_exercise_id: 'task8_missing_addend' }));
  });

  it('המורה ממשיכה לאשר ולשנות את החלטתה', async () => {
    await assertSucceeds(updateDoc(doc(teacher().firestore(), 'sessions', S2), {
      teacher_gate_approved: true, teacher_selected_path: 'green_path', gate_approved_at: Date.now(), gate_approved_by: 'teacher_uid',
    }));
  });

  it('גם המורה אינה כותבת את הציון, ההמלצה, חותמת החישוב או הציון הקודם (S7)', async () => {
    const teacherDoc = () => doc(teacher().firestore(), 'sessions', S2);
    await assertFails(updateDoc(teacherDoc(), { session_score_percent: 100 }));
    await assertFails(updateDoc(teacherDoc(), { matrix_recommended_path: 'green_path' }));
    await assertFails(updateDoc(teacherDoc(), { evaluated_at: Date.now() }));
    await assertFails(updateDoc(teacherDoc(), { previous_score_percent: 43 }));
  });
});

describe('הרשומה ב-RTDB — לפני החישוב והאישור', () => {
  it('אינו כותב לעצמו ציון או המלצה', async () => {
    await assertFails(rtdbUpdate(learnerRec(), { session_score_percent: 100 }));
    await assertFails(rtdbUpdate(learnerRec(), { matrix_recommended_path: 'green_path' }));
    await assertFails(rtdbSet(ref(learner12().database(), `${REC}/session_score_percent`), 100));
  });

  it('סיום מפגש 2 כפי שהלקוח כותב אותו עובר', async () => {
    await assertSucceeds(rtdbUpdate(learnerRec(), {
      session_02_completed: true, teacher_gate_approved: false, routeStatus: 'PENDING_TEACHER_APPROVAL', updatedAt: Date.now(),
    }));
  });

  it('תגיות סבב התיקון נכתבות כרגיל', async () => {
    await assertSucceeds(rtdbUpdate(ref(learner12().database(), `${REC}/qMatrixResults`), {
      task1_read_write_zero: 'zero_placeholder_hundreds_error',
    }));
  });

  it('רשומה חדשה (האתחול של הלקוח) נוצרת כרגיל', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await rtdbSet(ref(ctx.database(), REC), null); });
    await assertSucceeds(rtdbSet(learnerRec(), {
      completedMeeting2: false, highestCompletedMeeting: 0, routeStatus: null, additionBoardEnabled: false,
    }));
  });
});

describe('הרשומה ב-RTDB — אחרי החישוב והאישור', () => {
  beforeEach(seedApproved);

  it('אינו משנה או מוחק את הציון וההמלצה שהשרת שיקף', async () => {
    await assertFails(rtdbUpdate(learnerRec(), { session_score_percent: 100 }));
    await assertFails(rtdbUpdate(learnerRec(), { matrix_recommended_path: 'green_path' }));
    await assertFails(rtdbUpdate(learnerRec(), { session_score_percent: null, matrix_recommended_path: null }));
  });

  it('אינו מוריד את האישור: לא false, לא PENDING_TEACHER_APPROVAL, לא מחיקה', async () => {
    await assertFails(rtdbUpdate(learnerRec(), { teacher_gate_approved: false }));
    await assertFails(rtdbUpdate(learnerRec(), { routeStatus: 'PENDING_TEACHER_APPROVAL' }));
    await assertFails(rtdbUpdate(learnerRec(), { teacher_gate_approved: null }));
    await assertFails(rtdbUpdate(learnerRec(), { routeStatus: null }));
    await assertFails(rtdbUpdate(learnerRec(), { teacher_selected_path: null }));
    await assertFails(rtdbUpdate(learnerRec(), { gate_approved_at: null, gate_approved_by: null }));
  });

  it('אינו דורס את הרשומה כולה ואינו מוחק אותה', async () => {
    await assertFails(rtdbSet(learnerRec(), { isOnline: true }));
    await assertFails(rtdbSet(learnerRec(), null));
  });

  it('גם בנתיב הישן students/…', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await rtdbSet(ref(ctx.database(), 'students/student_user12'), { teacher_gate_approved: true, routeStatus: 'APPROVED', session_score_percent: 43 });
    });
    const legacy = () => ref(learner12().database(), 'students/student_user12');
    await assertFails(rtdbUpdate(legacy(), { teacher_gate_approved: false }));
    await assertFails(rtdbUpdate(legacy(), { session_score_percent: 100 }));
    await assertSucceeds(rtdbUpdate(legacy(), { isOnline: true }));
  });

  it('כתיבות השיעור הרגילות עוברות: נוכחות, תגיות, השלמה בלי שדות השער, ערך זהה לקיים', async () => {
    await assertSucceeds(rtdbUpdate(learnerRec(), { isOnline: true, lastPing: Date.now() }));
    await assertSucceeds(rtdbUpdate(ref(learner12().database(), `${REC}/qMatrixResults`), { task2_digit_value: 'success' }));
    await assertSucceeds(rtdbUpdate(learnerRec(), { session_02_completed: true, updatedAt: Date.now() }));
    await assertSucceeds(rtdbUpdate(learnerRec(), { teacher_gate_approved: true, routeStatus: 'APPROVED', session_score_percent: 43 }));
  });

  it('המורה ממשיכה לאפס: ביטול האישור, ניקוי המסלול והציון', async () => {
    await assertSucceeds(rtdbUpdate(ref(teacher().database(), REC), {
      routeStatus: null, teacher_gate_approved: false, qMatrixResults: null, pedagogicalPath: null,
      teacher_selected_path: null, session_score_percent: null, matrix_recommended_path: null,
    }));
  });
});
