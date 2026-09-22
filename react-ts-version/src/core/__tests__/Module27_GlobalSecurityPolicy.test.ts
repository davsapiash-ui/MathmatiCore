import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * ביקורת מודולים 27–29, 22.9.2026.
 *
 * מודול 27 §ב.4: תלמיד "מורשה לקרוא אך ורק את מסמך התלמיד האישי שלו… חסום
 * מקריאת אוספי כיתות או תלמידים אחרים", ובהוראות הנוקשות: "Block student role
 * auth tokens from writing or reading classes and students collections".
 *
 * שני אוספים היו פתוחים לכל מי שמחובר: `classes`, ו-`authorizedTeachers` —
 * שמזהה המסמך בו הוא **כתובת דוא"ל מוסדית**. אסימון של ילד יכול היה למנות את
 * כל המורות בפיילוט בשמן. זו גם הפרה של עיקרון הארכיטקטורה הראשון (Zero-PII).
 */
const rules = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf-8');

const block = (name: string) => {
  const start = rules.indexOf(`match /${name}/{`);
  if (start < 0) throw new Error(`no rules block for ${name}`);
  return rules.slice(start, rules.indexOf('    }', start));
};

describe('מודול 27 — מה שילד יכול לקרוא', () => {
  it('אוסף הכיתות סגור בפני לומד', () => {
    expect(block('classes')).toContain('allow read: if isTeacher() || isAdmin();');
  });

  it('רשימת המורים המורשות — צוות, או המסמך שהוא כתובת הדוא"ל של הקורא עצמו', () => {
    const b = block('authorizedTeachers');
    expect(b).toContain('allow read: if isTeacher() || isAdmin() ||');
    expect(b).toContain('email == request.auth.token.email.lower()');
    expect(b).not.toContain('allow read: if isAuthenticated();');
  });

  it('בדיקת הרשימה הלבנה בכניסה קוראת את המסמך לפי כתובת הקורא — ולכן ממשיכה לעבוד', () => {
    const auth = readFileSync(resolve(__dirname, '../../infrastructure/services/AuthService.ts'), 'utf-8');
    expect(auth).toContain('const normalized = email.toLowerCase().trim();');
    expect(auth).toContain('doc(firestore, "authorizedTeachers", normalized)');
  });

  it('מסמך הלומד נשאר קריא ללומד עצמו ולמורה, וחסום למנהל (מודול 24 §ב)', () => {
    expect(block('students')).toContain('allow read: if (isTeacher() || isOwningStudent(studentId)) && !isAdmin();');
  });

  it('כתיבת טלמטריה חסומה אלא אם מזהה הלומד תואם לאסימון והמטען עומד בסכימה', () => {
    const b = block('telemetry_logs');
    expect(b).toContain('isOwningStudent(string(request.resource.data.student_id))');
    expect(b).toContain('isValidTelemetryDoc()');
    expect(b).toContain('allow update: if false;');
  });

  it('כלל column_index של מודול 5 נאכף בשרת, לא רק בלקוח', () => {
    expect(rules).toContain('let validColumnRule =');
    expect(rules).toContain('data.column_index in [0, 1, 2, 3]');
  });
});

describe('מודול 29 — מכונת המצבים', () => {
  const types = readFileSync(resolve(__dirname, '../../types/index.ts'), 'utf-8');
  const store = readFileSync(resolve(__dirname, '../../application/useWorkspaceStore.ts'), 'utf-8');

  it('חמשת הערכים הקנוניים, ולא יותר', () => {
    const decl = types.slice(types.indexOf('export type VRAWorkspaceState ='), types.indexOf(';', types.indexOf('export type VRAWorkspaceState =')));
    for (const v of ['IDLE', 'PROBLEM_ACTIVE', 'REGROUPING_ACTIVE', 'SOCRATIC_ACTIVE', 'COMPLETE']) {
      expect(decl).toContain(`'${v}'`);
    }
    expect((decl.match(/\|/g) || []).length).toBe(5);
  });

  it('כל אחד מחמשת המצבים אכן נכנס לתוקף בזמן ריצה', () => {
    // שתי הצורות: השמה ישירה, או דרך transitionTo. פער ג במסמך הסטיות רושם
    // שלא כל המעברים עוברים דרך transitionTo, והוחלט להשאיר — מה שנבדק כאן
    // הוא שאף מצב אינו ערך מת בטיפוס.
    for (const v of ['IDLE', 'PROBLEM_ACTIVE', 'REGROUPING_ACTIVE', 'SOCRATIC_ACTIVE', 'COMPLETE']) {
      const reached = store.includes(`currentState: '${v}'`) || store.includes(`transitionTo('${v}')`);
      expect(reached, v).toBe(true);
    }
  });
});
