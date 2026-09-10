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

const GATE_FIELDS = [
  'routeStatus',
  'teacher_gate_approved',
  'teacher_selected_path',
  'pedagogicalPath',
  'physicalOverride',
  'physicalOverrideActive',
];

const studentNodes: Array<[string, any]> = [
  ['users/students/$studentId', rules.rules.users.students.$studentId],
  ['students/$studentId', rules.rules.students.$studentId],
];

describe('מודול 20 — שער המעבר נאכף בשרת, לא רק בדפדפן', () => {
  for (const [label, node] of studentNodes) {
    describe(label, () => {
      for (const field of GATE_FIELDS) {
        it(`לומד אינו יכול לשנות את ${field}`, () => {
          const validate = node?.[field]?.['.validate'];
          expect(typeof validate).toBe('string');
          // או שהכותב הוא צוות, או שהערך נשאר בדיוק כפי שהיה.
          expect(validate).toContain("auth.token.role == 'teacher'");
          expect(validate).toContain("auth.token.role == 'admin'");
          expect(validate).toContain('newData.val() == data.val()');
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
    expect(sync).toContain("delete sanitizedPayload.teacher_gate_approved;");
    expect(sync).toContain("delete sanitizedPayload.routeStatus;");
    expect(sync).toContain("delete sanitizedPayload.physicalOverride;");
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
