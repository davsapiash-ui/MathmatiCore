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

describe('השרת — אין ברירת מחדל שניתן לנחש', () => {
  it('כתובות ברירת המחדל הוסרו', () => {
    const code = server.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(code).not.toContain('teacher_sso@domain.edu');
    expect(code).not.toContain('admin@mathmaticore.local');
    expect(code).not.toContain('teacher_1002220159@mathmaticore.local');
  });

  it('משתנה סביבה מתקבל רק אם הוא כתובת דוא"ל אמיתית', () => {
    expect(server).toContain('raw.includes("@") ? raw : null');
  });

  it('שתי כתובות הפיילוט נשארות כרשת ביטחון מתועדת', () => {
    expect(server).toContain('const PILOT_ADMIN_EMAIL = "davidsep@edu-haifa.org.il"');
    expect(server).toContain('const PILOT_TEACHER_EMAIL = "1002220159@edu-haifa.org.il"');
  });
});

describe('הלקוח — אין תו כללי לדומיין בייצור', () => {
  it('שתי כתובות הפיילוט מורשות', () => {
    expect(isWhitelistedTeacherEmail('davidsep@edu-haifa.org.il')).toBe(true);
    expect(isWhitelistedTeacherEmail('1002220159@edu-haifa.org.il')).toBe(true);
    expect(isWhitelistedTeacherEmail('DavidSep@Edu-Haifa.org.il  ')).toBe(true);
  });

  it('כתובת זרה נדחית', () => {
    for (const bad of ['someone@gmail.com', 'teacher@edu-haifa.org.il', '', null, undefined]) {
      expect(isWhitelistedTeacherEmail(bad), String(bad)).toBe(false);
    }
  });

  it('התו הכללי של @mathmaticore.local אינו מופיע מחוץ לגוש הפיתוח', () => {
    const client = repo('react-ts-version/src/infrastructure/services/AuthService.ts');
    const fn = client.slice(client.indexOf('export function isWhitelistedTeacherEmail'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    const devBlockAt = body.indexOf('import.meta.env.DEV');
    const wildcardAt = body.indexOf('endsWith("@mathmaticore.local")');
    expect(wildcardAt).toBeGreaterThan(devBlockAt);
  });
});

describe('מסך האבטחה אומר את האמת', () => {
  it('ההצהרה מזכירה את החריג המתועד', () => {
    const view = repo('react-ts-version/src/presentation/pages/admin/AdminSecurityView.tsx');
    expect(view).toContain('חריג מתועד');
    expect(view).not.toContain('ניתנת אך ורק בהתאמה מדויקת');
  });
});
