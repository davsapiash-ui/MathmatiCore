import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

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

/**
 * סבב התיקונים של 1.10.2026 (ממצאים 68, 60, 8, 70). לפני שכל כלל הודק נבדק
 * שאף כתיבה לגיטימית אינה נחסמת: הכותבים היחידים הם המורה (מסמכי התלמידים
 * בהפעלת מפגש), פונקציות הענן (Admin SDK, שאינו כפוף לחוקים) ומסכי המנהל.
 */
describe('מודול 27 — מי כותב מה (סבב 1.10.2026)', () => {
  const srcRoot = resolve(__dirname, '../..');
  const sources: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== '__tests__' && name !== 'test') walk(full);
      } else if (/\.(ts|tsx)$/.test(name)) {
        sources.push({ file: full.slice(srcRoot.length + 1).replace(/\\/g, '/'), text: readFileSync(full, 'utf-8') });
      }
    }
  };
  walk(srcRoot);

  it('לומד אינו יוצר ואינו משנה מסמך תלמיד — רק המורה, בשני הנתיבים (§ב.4)', () => {
    for (const name of ['students', 'users/students']) {
      const b = block(name);
      expect(b, name).toContain('allow create: if isTeacher() && isValidStudentDoc() &&');
      expect(b, name).toContain('allow update: if isTeacher() && isValidStudentDoc() &&');
      expect(b, name).not.toMatch(/allow (create|update): if \(isTeacher\(\) \|\| isOwningStudent/);
      // קריאת המסמך של עצמו נשארת.
      expect(b, name).toContain('allow read: if (isTeacher() || isOwningStudent(studentId)) && !isAdmin();');
    }
    // הכותב היחיד בקוד הלקוח הוא הפעלת המפגש של המורה.
    const writers = sources.filter((s) => /doc\((firestore|db), ['"]students['"]/.test(s.text)).map((s) => s.file);
    expect(writers).toEqual(['presentation/pages/TeacherDashboard.tsx']);
  });

  it('מטמון המדדים (store_cache) לקריאה בלבד — רק השרת מחשב אותו (מודול 24)', () => {
    expect(block('store_cache')).toContain('allow write: if false;');
    expect(block('store_cache')).toContain('allow read: if isAdmin() || isTeacher();');
    const writes = sources.filter((s) => /(setDoc|updateDoc|deleteDoc|addDoc)\([^;]*store_cache/.test(s.text));
    expect(writes).toEqual([]);
  });

  it('יומן האיפוסים נכתב רק בפונקציית הענן של האיפוס (מודול 23א)', () => {
    const b = block('reset_audit_log');
    expect(b).toContain('allow create: if false;');
    expect(b).not.toContain('allow create: if isTeacher();');
    // No client writes there. The learner's journey reads it (the rules allow the teacher
    // to), to mark where a meeting was reset (owner, 2.10.2026) — and nothing else does.
    const touching = sources.filter((s) => s.text.includes('reset_audit_log'));
    expect(touching.map((s) => s.file)).toEqual(['infrastructure/services/LearnerJourneyService.ts']);
    for (const s of touching) expect(s.text).not.toMatch(/(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
  });

  it('צומת הכיתות ב-RTDB נכתב בידי המנהל בלבד (§ב.5)', () => {
    const rtdb = JSON.parse(readFileSync(resolve(__dirname, '../../../../database.rules.json'), 'utf-8'));
    expect(rtdb.rules.classes['.write']).toBe(rtdb.rules.public_classes['.write']);
    expect(rtdb.rules.classes['.write']).not.toContain('teacher');
    // מי כותב שם: מסכי המנהל (מאגר המנהל ופעולות המנהל בשירות הסנכרון).
    const writers = sources
      .filter((s) => /(firebaseSet|update|set)\(ref\(database, ['"`]classes|updates\[`classes\//.test(s.text))
      .map((s) => s.file)
      .sort();
    expect(writers).toEqual(['application/useAdminStore.ts', 'infrastructure/services/FirebaseSyncService.ts']);
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
