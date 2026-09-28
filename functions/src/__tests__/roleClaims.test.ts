import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { claimsForSignIn, parseRequestedRole } from '../roleClaims';
import { readCallerRoles } from '../callerIdentity';

/**
 * PRD מודול 24 §ב: מנהל המערכת חסום מנתוני לומד יחיד. מרשם הסטיות, פער יא
 * (בעל המוצר, 23.9.2026): החשבון הכפול נשאר; התפקיד נבחר בכל כניסה, וה-claims
 * של אותה כניסה קובעים מה נפתח.
 *
 * עד 28.9.2026 כל כניסת מנהל קיבלה גם את ה-claim של המורה, ולכן חוקי השרת
 * פתחו למנהל את נתוני הלומדים, את פתיחת המפגשים ואת שער האישור.
 */
const adminAddress = { isAuthorizedAdmin: true, isAuthorizedTeacher: false };
const teacherAddress = { isAuthorizedAdmin: false, isAuthorizedTeacher: true };
const stranger = { isAuthorizedAdmin: false, isAuthorizedTeacher: false };

describe('ה-claims של כניסה אחת', () => {
  it('כתובת מנהל שנכנסת כמנהל — מנהל בלבד, בלי ה-claim של המורה', () => {
    const c = claimsForSignIn(adminAddress, 'admin');
    expect(c).toMatchObject({ admin: true, teacher: false, role: 'admin', roles: ['ADMIN'] });
    const roles = readCallerRoles(c);
    expect(roles.isAdmin).toBe(true);
    expect(roles.isTeacher).toBe(false);
  });

  it('כתובת מנהל שנכנסת כמורה — מורה בלבד, עם הכיתה', () => {
    const c = claimsForSignIn(adminAddress, 'teacher');
    expect(c).toMatchObject({ teacher: true, admin: false, role: 'teacher', class_id: 'class_1', roles: ['TEACHER'] });
    const roles = readCallerRoles(c);
    expect(roles.isTeacher).toBe(true);
    expect(roles.isAdmin).toBe(false);
  });

  it('כתובת מנהל בלי בקשת תפקיד — צד המנהל, שאינו רואה לומדים (Fail-Closed)', () => {
    expect(readCallerRoles(claimsForSignIn(adminAddress, null)).isTeacher).toBe(false);
  });

  it('כתובת מורה אינה מקבלת את ה-claim של המנהל, גם כשהיא מבקשת', () => {
    for (const asked of ['admin', 'teacher', null] as const) {
      const roles = readCallerRoles(claimsForSignIn(teacherAddress, asked));
      expect(roles.isAdmin, String(asked)).toBe(false);
      expect(roles.isTeacher, String(asked)).toBe(true);
    }
  });

  it('כתובת שאינה ברשימה — אורח, בלי אף תפקיד', () => {
    const roles = readCallerRoles(claimsForSignIn(stranger, 'admin'));
    expect(roles.isAdmin).toBe(false);
    expect(roles.isTeacher).toBe(false);
  });

  it('אף כניסה אינה מקבלת את שני התפקידים יחד', () => {
    for (const who of [adminAddress, teacherAddress, stranger]) {
      for (const asked of ['admin', 'teacher', null] as const) {
        const roles = readCallerRoles(claimsForSignIn(who, asked));
        expect(roles.isAdmin && roles.isTeacher, `${JSON.stringify(who)} ${asked}`).toBe(false);
      }
    }
  });

  it('בקשת תפקיד נקראת רק כ-teacher או admin', () => {
    expect(parseRequestedRole({ role: 'teacher' })).toBe('teacher');
    expect(parseRequestedRole({ role: 'admin' })).toBe('admin');
    expect(parseRequestedRole({ role: 'student' })).toBeNull();
    expect(parseRequestedRole(undefined)).toBeNull();
    expect(parseRequestedRole('admin')).toBeNull();
  });
});

describe('פונקציות שנוגעות בלומד יחיד — המורה, לא המנהל', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');

  it('syncUserRoles חותם את ה-claims מ-claimsForSignIn ולפי התפקיד שנבחר', () => {
    const s = src('syncUserRoles.ts');
    expect(s).toContain('claimsForSignIn({ isAuthorizedAdmin, isAuthorizedTeacher }, requestedRole)');
    expect(s).toContain('parseRequestedRole(request.data)');
    expect(s).not.toMatch(/admin:\s*true,\s*\n\s*teacher:\s*true/);
  });

  it('יצירת מסמך מפגש, טלמטריה בשם לומד ורמז לעבודת לומד — רק למורה או ללומד עצמו', () => {
    for (const f of ['sessionTrigger.ts', 'index.ts', 'geminiProxy.ts']) {
      const s = src(f);
      expect(s, f).toContain('readCallerRoles(');
      expect(s, f).not.toMatch(/callerRole === "teacher" \|\| callerRole === "admin"/);
      expect(s, f).not.toMatch(/lowered\.includes\("teacher"\) \|\| lowered\.includes\("admin"\)/);
    }
  });
});
