import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isWhitelistedTeacherEmail } from '@/infrastructure/services/AuthService';

/**
 * מי מקבל הרשאת מורה בלי לעבור ברשימה הלבנה.
 *
 * מסך האבטחה הצהיר בפני המנהל: "הרשאת מורה ניתנת אך ורק בהתאמה מדויקת מול
 * authorizedTeachers". בפועל היו חמש עקיפות, ושלוש מהן מסוכנות:
 *
 * - `teacher_sso@domain.edu` — ברירת המחדל בשרת כש-TEACHER_SSO_PRIMARY_EMAIL
 *   אינו מוגדר. כתובת שניתן לרשום, בדומיין שהפרויקט אינו מחזיק.
 * - `admin@mathmaticore.local` — אותו דבר, להרשאת מנהל.
 * - `@mathmaticore.local` בלקוח — תו כללי לדומיין שלם, בייצור, ישירות מתחת
 *   להערה שאומרת שתווים כלליים אסורים.
 *
 * שתי כתובות הפיילוט נשארות במכוון, ומתועדות במסמך הסטיות: הן מבטיחות שבעל
 * המערכת לא יינעל מחוץ למערכת שלו אם Firestore אינו זמין.
 */
const repo = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf-8');
const server = repo('functions/src/syncUserRoles.ts');

describe('השרת — אין כתובת מוטמעת בקוד', () => {
  const code = server.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('כל חמש העקיפות הוסרו', () => {
    for (const bypass of [
      'teacher_sso@domain.edu',
      'admin@mathmaticore.local',
      'teacher_1002220159@mathmaticore.local',
      'davidsep@edu-haifa.org.il',
      '1002220159@edu-haifa.org.il',
    ]) {
      expect(code, bypass).not.toContain(bypass);
    }
  });

  it('משתנה סביבה מתקבל רק אם הוא כתובת דוא"ל אמיתית', () => {
    expect(server).toContain('raw.includes("@") ? raw : null');
  });

  it('הרשימה הלבנה היא מקור האמת', () => {
    expect(server).toContain('authorizedTeachers');
  });
});

describe('הלקוח — אין כתובת ייצור מוטמעת', () => {
  const client = repo('react-ts-version/src/infrastructure/services/AuthService.ts');

  it('שתי כתובות הפיילוט אינן מוחזרות כמורשות בלי הרשימה', () => {
    expect(isWhitelistedTeacherEmail('davidsep@edu-haifa.org.il')).toBe(false);
    expect(isWhitelistedTeacherEmail('1002220159@edu-haifa.org.il')).toBe(false);
  });

  it('כתובת זרה נדחית', () => {
    for (const bad of ['someone@gmail.com', 'teacher@edu-haifa.org.il', '', null, undefined]) {
      expect(isWhitelistedTeacherEmail(bad), String(bad)).toBe(false);
    }
  });

  it('התו הכללי של @mathmaticore.local אינו מופיע מחוץ לגוש הפיתוח', () => {
    const fn = client.slice(client.indexOf('export function isWhitelistedTeacherEmail'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    const devBlockAt = body.indexOf('import.meta.env.DEV');
    const wildcardAt = body.indexOf('endsWith("@mathmaticore.local")');
    expect(devBlockAt).toBeGreaterThan(-1);
    expect(wildcardAt).toBeGreaterThan(devBlockAt);
  });
});

describe('מסך האבטחה אומר את האמת', () => {
  it('ההצהרה תואמת את הקוד: רשימה בלבד, ומחיקה שוללת כניסה', () => {
    const view = repo('react-ts-version/src/presentation/pages/admin/AdminSecurityView.tsx');
    expect(view).toContain('אין כתובת מוטמעת בקוד');
    expect(view).toContain('מחיקת מורה מהרשימה שוללת את הכניסה שלה מיד');
  });
});
