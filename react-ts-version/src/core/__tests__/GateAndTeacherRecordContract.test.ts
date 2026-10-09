import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * שני חוזים שנשענים זה על זה:
 *
 * 1. מודול 20 מגדיר את שער אישור המורה כ"קשיח". בקוד הלקוח הוא אכן קשיח —
 *    רק core/teacherGate.ts כותב אותו — אבל חוקי מסד הנתונים אפשרו ללומד
 *    לכתוב כל שדה לצומת שלו, ובכללם routeStatus. כלומר ילד יכול היה לכתוב
 *    'APPROVED' לעצמו ולהיכנס למפגש 3 בלי שאיש אישר לו. הכלל נאכף עכשיו
 *    בשרת, במקום היחיד שאי אפשר לעקוף מהדפדפן.
 *
 * 2. זהות המורה היא כתובת הדוא"ל שברשימה הלבנה בלבד. שם המורה אינו נדרש
 *    לשום החלטה במערכת ואינו נשמר — צומת users/teachers נקרא בידי כל
 *    משתמש מחובר.
 */
const repo = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf-8');
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

const rules = JSON.parse(repo('database.rules.json')) as {
  rules: Record<string, any>;
};

// שדות שהלומד אינו רשאי לגעת בהם כלל — החלטת המורה מתחילתה ועד סופה.
const TEACHER_ONLY_FIELDS = [
  'teacher_selected_path',
  'pedagogicalPath',
  'physicalOverride',
  'physicalOverrideActive',
];

const studentNodes: Array<[string, any]> = [
  ['users/students/$studentId', rules.rules.users.students.$studentId],
  ['students/$studentId', rules.rules.students.$studentId],
];

const STAFF_MARKERS = ["auth.token.role == 'teacher'", "auth.token.teacher == true"];
// דוח 28.9.2026, נ.2 — PRD מודול 24 §ב: ההחלטה בשער היא של המורה. כניסת מנהל
// אינה "צוות" כאן (הבדיקה במנוע האמיתי: Module24_AdminBlocked.live.test.ts).
const ADMIN_MARKERS = ["auth.token.role == 'admin'", "auth.token.admin == true"];

describe('מודול 20 — שער המעבר נאכף בשרת, לא רק בדפדפן', () => {
  for (const [label, node] of studentNodes) {
    describe(label, () => {
      for (const field of TEACHER_ONLY_FIELDS) {
        it(`לומד אינו יכול לשנות את ${field}`, () => {
          const validate = node?.[field]?.['.validate'];
          expect(typeof validate).toBe('string');
          for (const marker of STAFF_MARKERS) expect(validate).toContain(marker);
          for (const marker of ADMIN_MARKERS) expect(validate).not.toContain(marker);
          // או שהכותב הוא צוות, או שהערך נשאר בדיוק כפי שהיה. אין אפשרות שלישית.
          // אין אפשרות שלישית: הסעיף היחיד שאינו "צוות" הוא "הערך לא השתנה".
          expect(validate.trim().endsWith('|| newData.val() == data.val()')).toBe(true);
          expect(validate.split('newData.')).toHaveLength(2);
        });
      }

      // PRD מודול 20 §ב: "ההשתקפות ניתנת לכתיבה על ידי צוות בלבד; הלומד אינו
      // יכול לכתוב אותה". גם PENDING_TEACHER_APPROVAL נכתב בשרת
      // (sessionTrigger.ts markGatePending), לא בלקוח הלומד.
      for (const field of ['routeStatus', 'teacher_gate_approved']) {
        it(`ההשתקפות ${field} נכתבת בידי צוות בלבד — הלומד אינו יכול לשנות אותה כלל`, () => {
          const validate = node?.[field]?.['.validate'];
          expect(typeof validate).toBe('string');
          for (const marker of STAFF_MARKERS) expect(validate).toContain(marker);
          for (const marker of ADMIN_MARKERS) expect(validate).not.toContain(marker);
          expect(validate.trim().endsWith('|| newData.val() == data.val()')).toBe(true);
          expect(validate.split('newData.')).toHaveLength(2);
          expect(validate).not.toContain('PENDING_TEACHER_APPROVAL');
        });
      }

      it('התקדמות המפגשים נשארת מונוטונית ובטווח 0 עד 8', () => {
        const validate = node?.highestCompletedMeeting?.['.validate'];
        expect(typeof validate).toBe('string');
        expect(validate).toContain('newData.isNumber()');
        expect(validate).toContain('newData.val() <= 8');
        expect(validate).toContain('newData.val() >= data.val()');
      });
    });
  }

  it('הלקוח ממשיך לנקות את שדות השער מכל סנכרון של הלומד', () => {
    const sync = src('infrastructure/services/FirebaseSyncService.ts');
    expect(sync).toContain('delete sanitizedPayload.teacher_gate_approved;');
    expect(sync).toContain('delete sanitizedPayload.routeStatus;');
    expect(sync).toContain('delete sanitizedPayload.physicalOverride;');
  });

  it('סיום מפגש 2 בצד הלומד אינו כותב את שדות השער ברשומת הלומד', () => {
    // הבדיקה הזו היא הצד השני של החוקים: שדה שער בכתיבה של הלומד היה נדחה
    // בשרת, והפריט כולו היה נתקע בתור.
    const sync = src('infrastructure/services/FirebaseSyncService.ts');
    const fn = sync.slice(sync.indexOf('public async syncSession2Completion'));
    const body = fn.slice(0, fn.indexOf('public async fetchTeacherClassrooms'));
    const rtdbPayload = body.slice(body.indexOf('const rtdbPayload = {'), body.indexOf('};', body.indexOf('const rtdbPayload = {')));
    expect(rtdbPayload).toContain('session_02_completed: true');
    expect(rtdbPayload).not.toContain('routeStatus');
    expect(rtdbPayload).not.toContain('teacher_gate_approved');
    expect(body).not.toContain("'PENDING_TEACHER_APPROVAL'");
    expect(body).not.toContain("'APPROVED'");
  });

  it('השרת כותב את מצב ההמתנה בכל סיום של מסמך מפגש 2, ולעולם לא מעל אישור', () => {
    const trigger = repo('functions/src/sessionTrigger.ts');
    const close = repo('functions/src/meeting2Close.ts');
    const fn = trigger.slice(trigger.indexOf('export async function markGatePending'));
    expect(fn).toContain('cur === "APPROVED" ? undefined : "PENDING_TEACHER_APPROVAL"');
    expect(fn).toContain('cur === true ? undefined : false');
    // In the completion trigger itself, before the score can stop on missing telemetry.
    const handler = trigger.slice(trigger.indexOf('export const onSessionCompleteTrigger'));
    expect(handler.indexOf('markGatePending(')).toBeGreaterThan(-1);
    expect(handler.indexOf('markGatePending(')).toBeLessThan(handler.indexOf('computeMeetingScore('));
    // And in the teacher's close.
    expect(close).toContain('await markGatePending(');
    expect(close).not.toContain('updates.routeStatus');
  });
});

describe('זהות מורה — כתובת דוא"ל בלבד, בלי שם ובלי תאריך לידה', () => {
  const store = src('application/useAdminStore.ts');
  const auth = src('infrastructure/services/AuthService.ts');
  const sync = src('infrastructure/services/FirebaseSyncService.ts');
  const wizard = src('presentation/pages/admin/AdminWizardModal.tsx');

  it('הטיפוס Teacher אינו נושא שם או תאריך לידה', () => {
    const iface = store.slice(store.indexOf('export interface Teacher {'));
    const body = iface.slice(0, iface.indexOf('}'));
    expect(body).toContain('ssoEmail');
    expect(body).not.toMatch(/\bname\s*:/);
    expect(body).not.toMatch(/\bdob\s*:/);
  });

  it('הרשומה שנכתבת ל-users/teachers בהתחברות אינה כוללת שם', () => {
    const fn = auth.slice(auth.indexOf('async function ensureTeacherRecord'));
    const body = fn.slice(0, fn.indexOf('export interface AuthenticatedUserPayload'));
    expect(body).not.toMatch(/name:/);
  });

  it('מסמך הרשימה הלבנה ב-Firestore אינו שומר שם', () => {
    const fn = auth.slice(auth.indexOf('export async function addAuthorizedTeacherFirestore'));
    const body = fn.slice(0, fn.indexOf('export async function removeAuthorizedTeacherFirestore'));
    expect(body).not.toMatch(/name:/);
  });

  it('אין שדה שם או תאריך לידה באשף ההקמה', () => {
    expect(wizard).not.toContain('teacherName');
    expect(wizard).not.toContain('teacherDob');
  });

  it('אין ערכי ברירת מחדל של תאריך לידה שנשמרים לכל מורה', () => {
    for (const f of [store, sync, auth, wizard]) {
      expect(f).not.toContain('010190');
    }
  });
});

describe('Module 19: the learner cannot change their own support profile', () => {
  it('locks support_profile_id and enhanced_support_profile in the learner branch of both learner nodes', () => {
    for (const node of [rules.rules.users.students.$studentId, rules.rules.students.$studentId]) {
      const write: string = node['.write'];
      expect(write).toContain("newData.child('support_profile_id').val() == data.child('support_profile_id').val()");
      expect(write).toContain("newData.child('enhanced_support_profile').val() == data.child('enhanced_support_profile').val()");
    }
  });

  // Audit support-9: a hand-made learner request could still rewrite the
  // profile's version and who updated it, and when.
  it('locks the profile version, its time and its writer in the learner branch of both learner nodes', () => {
    for (const node of [rules.rules.users.students.$studentId, rules.rules.students.$studentId]) {
      const write: string = node['.write'];
      for (const field of ['support_profile_version', 'support_profile_updated_at', 'support_profile_updated_by']) {
        expect(write).toContain(`newData.child('${field}').val() == data.child('${field}').val()`);
      }
    }
  });
});
