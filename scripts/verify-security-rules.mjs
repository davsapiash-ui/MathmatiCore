/**
 * מריצה את חוקי האבטחה מול מנוע החוקים האמיתי של Firebase, ובודקת התנהגות
 * ולא מחרוזות: מה לומד רשאי לכתוב על עצמו, ומה שמור למורה.
 *
 * הבדיקות ב-src/core/__tests__ מצמידות את נוסח החוקים, אבל אינן יכולות
 * להריץ אותם. הסקריפט הזה כן, ולכן כדאי להריץ אותו אחרי כל שינוי ב-
 * firestore.rules או ב-database.rules.json.
 *
 * דרוש Java (לאמולטור) והתקנה חד־פעמית של ספריית הבדיקה:
 *
 *   npm install --no-save @firebase/rules-unit-testing firebase
 *   npx firebase-tools emulators:exec --only firestore,database \
 *     --project demo-mathmaticore "node scripts/verify-security-rules.mjs"
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let rulesTesting, firestoreSdk, databaseSdk;
try {
  rulesTesting = await import('@firebase/rules-unit-testing');
  firestoreSdk = await import('firebase/firestore');
  databaseSdk = await import('firebase/database');
} catch {
  console.error(
    'חסרות ספריות הבדיקה. הרץ תחילה:\n' +
      '  npm install --no-save @firebase/rules-unit-testing firebase'
  );
  process.exit(2);
}

const { initializeTestEnvironment, assertFails, assertSucceeds } = rulesTesting;
const { doc, setDoc } = firestoreSdk;
const { ref, update, set } = databaseSdk;

const env = await initializeTestEnvironment({
  projectId: 'demo-mathmaticore',
  firestore: {
    rules: readFileSync(`${REPO}/firestore.rules`, 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
  database: {
    rules: readFileSync(`${REPO}/database.rules.json`, 'utf8'),
    host: '127.0.0.1',
    port: 9000,
  },
});

const learner = env.authenticatedContext('student_user3', { student_id: 3 });
const teacher = env.authenticatedContext('teacher_1', { role: 'teacher' });

let passed = 0;
let failed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log('  ok  ', name);
    passed++;
  } catch (err) {
    console.log('  FAIL', name, '-', String(err).slice(0, 200));
    failed++;
  }
};

const ldb = learner.database();
const tdb = teacher.database();
const node = 'users/students/student_user3';

console.log('\nRTDB — שער המעבר של מודול 20');
await check('הלומד רשאי לבקש אישור מעבר', () =>
  assertSucceeds(
    update(ref(ldb, node), {
      routeStatus: 'PENDING_TEACHER_APPROVAL',
      teacher_gate_approved: false,
    })
  )
);
await check('הלומד אינו יכול לאשר לעצמו מעבר', () =>
  assertFails(update(ref(ldb, node), { routeStatus: 'APPROVED' }))
);
await check('הלומד אינו יכול להדליק את דגל האישור', () =>
  assertFails(update(ref(ldb, node), { teacher_gate_approved: true }))
);
await check('הלומד אינו יכול לעקוף את השער דרך physicalOverride', () =>
  assertFails(update(ref(ldb, node), { physicalOverride: true }))
);
await check('הלומד אינו יכול לבחור לעצמו מסלול', () =>
  assertFails(update(ref(ldb, node), { pedagogicalPath: 'green_path' }))
);
await check('המורה כן מאשרת ובוחרת מסלול', () =>
  assertSucceeds(
    update(ref(tdb, node), {
      routeStatus: 'APPROVED',
      teacher_gate_approved: true,
      pedagogicalPath: 'green_path',
    })
  )
);
await check('מונה המפגשים רק עולה, ולא מעבר ל-8', async () => {
  await assertSucceeds(update(ref(ldb, node), { highestCompletedMeeting: 2 }));
  await assertFails(update(ref(ldb, node), { highestCompletedMeeting: 1 }));
  await assertFails(update(ref(ldb, node), { highestCompletedMeeting: 99 }));
});
await check('הלומד ממשיך לכתוב את מצב העבודה הרגיל שלו', () =>
  assertSucceeds(update(ref(ldb, node), { onlineStatus: 'active', currentTaskIdx: 2 }))
);

console.log('\nRTDB — רפלקציה');
await check('מזהה רפלקציה דטרמיניסטי מתקבל', () =>
  assertSucceeds(
    set(ref(ldb, 'reflections/reflection_02_student_3'), { effort: 'MEDIUM', timestamp: 1 })
  )
);
await check('מפתח אקראי נדחה — זו הייתה ההתנהגות הקודמת', () =>
  assertFails(set(ref(ldb, 'reflections/-NrandomPushKey'), { effort: 'MEDIUM', timestamp: 1 }))
);

const lfs = learner.firestore();
const tfs = teacher.firestore();
const studentDoc = {
  student_id: 3,
  class_id: 'class_1',
  school_id: 'school_bikorot',
  created_at: 1,
  active_session_id: 'session_02',
};

console.log('\nFirestore — מסמך התלמיד');
await check('המורה יוצרת את המסמך בלי גרסת פרופיל התמיכה', () =>
  assertSucceeds(setDoc(doc(tfs, 'students', 'student_user3'), studentDoc, { merge: true }))
);
await check('הלומד אינו יכול לכתוב לעצמו פרופיל תמיכה', () =>
  assertFails(
    setDoc(
      doc(lfs, 'students', 'student_user3'),
      { ...studentDoc, support_profile_id: 'enhanced_cognitive_support' },
      { merge: true }
    )
  )
);
await check('המורה כן כותבת פרופיל תמיכה', () =>
  assertSucceeds(
    setDoc(
      doc(tfs, 'students', 'student_user3'),
      { support_profile_id: 'enhanced_cognitive_support', support_profile_version: 1 },
      { merge: true }
    )
  )
);

const sessionDoc = {
  session_id: 'session_02_student_3',
  class_id: 'class_1',
  session_number: 2,
  session_start_time: 1,
  session_deadline_time: 2,
  active_exercise_id: 'task8_missing_addend',
  is_completed: true,
  session_score_percent: 70,
  teacher_gate_approved: false,
  gate_approved_at: null,
  gate_approved_by: null,
  teacher_selected_path: null,
  matrix_recommended_path: 'green_path',
};

console.log('\nFirestore — מסמך המפגש');
await check('הלומד מסיים את מפגש 2 בדיוק כפי שהלקוח כותב', () =>
  assertSucceeds(setDoc(doc(lfs, 'sessions', 'session_02_student_3'), sessionDoc, { merge: true }))
);
await check('הלומד אינו קובע את המסלול שהמורה בחרה', () =>
  assertFails(
    setDoc(
      doc(lfs, 'sessions', 'session_02_student_3'),
      { ...sessionDoc, teacher_selected_path: 'green_path' },
      { merge: true }
    )
  )
);
await check('הלומד אינו מאשר לעצמו את השער במסמך המפגש', () =>
  assertFails(
    setDoc(
      doc(lfs, 'sessions', 'session_02_student_3'),
      { ...sessionDoc, teacher_gate_approved: true },
      { merge: true }
    )
  )
);
await check('המורה מאשרת ובוחרת מסלול', () =>
  assertSucceeds(
    setDoc(
      doc(tfs, 'sessions', 'session_02_student_3'),
      {
        ...sessionDoc,
        teacher_gate_approved: true,
        teacher_selected_path: 'green_path',
        gate_approved_at: 5,
        gate_approved_by: 'teacher_1',
      },
      { merge: true }
    )
  )
);

const reflection = {
  student_id: 3,
  session_id: 'session_08_student_3',
  session_number: 8,
  effort_level: 'HIGH',
  selected_strategies: ['UNDO_BUTTON', 'SOCRATIC_CARD'],
  persistence_index: 75,
  undo_count: 3,
  error_count: 1,
  guess_count: 0,
  submitted_at: 9,
};

console.log('\nFirestore — רפלקציית מודול 16');
await check('הלומד מגיש את הרפלקציה שלו', () =>
  assertSucceeds(setDoc(doc(lfs, 'srl_reflections', 'session_08_student_3'), reflection))
);
await check('הגשה שנייה נדחית — אידמפוטנטיות לפי מזהה המסמך', () =>
  assertFails(
    setDoc(doc(lfs, 'srl_reflections', 'session_08_student_3'), {
      ...reflection,
      persistence_index: 10,
    })
  )
);
await check('הלומד אינו מגיש בשם ילד אחר', () =>
  assertFails(
    setDoc(doc(lfs, 'srl_reflections', 'session_08_student_7'), {
      ...reflection,
      student_id: 7,
      session_id: 'session_08_student_7',
    })
  )
);
await check('מדד התמדה מחוץ לטווח נדחה', () =>
  assertFails(
    setDoc(doc(lfs, 'srl_reflections', 'session_08_student_5'), {
      ...reflection,
      student_id: 5,
      session_id: 'session_08_student_5',
      persistence_index: 900,
    })
  )
);

console.log('\nFirestore — בעלות על טלמטריה');
await check('הלומד כותב אירוע על עצמו', () =>
  assertSucceeds(
    setDoc(doc(lfs, 'telemetry_logs', 'idem_own'), {
      idempotency_key: 'idem_own',
      client_timestamp: 1,
      session_id: 'session_02_student_3',
      student_id: 3,
      exercise_id: 'task8_missing_addend',
      event_type: 'PROBLEM_COMPLETE',
      details: {},
      synced_at: 2,
    })
  )
);
await check('הלומד אינו כותב אירוע על ילד אחר', () =>
  assertFails(
    setDoc(doc(lfs, 'telemetry_logs', 'idem_other'), {
      idempotency_key: 'idem_other',
      client_timestamp: 1,
      session_id: 'session_02_student_7',
      student_id: 7,
      exercise_id: 'task8_missing_addend',
      event_type: 'PROBLEM_COMPLETE',
      details: {},
      synced_at: 2,
    })
  )
);

await env.cleanup();
console.log(`\n${passed} עברו, ${failed} נכשלו`);
process.exit(failed === 0 ? 0 : 1);
