import { describe, it, expect } from 'vitest';
import { readCallerRoles, requireTeacherForIndividualData, requireAdmin } from '../callerIdentity';

/**
 * מי הקורא — ההגדרה המשותפת היחידה.
 *
 * כל פונקציית ענן כאן משתמשת ב-Admin SDK, שעוקף את חוקי Firestore ואת חוקי
 * מסד הנתונים לחלוטין. לכן הבדיקות שהחוקים מבטאים חייבות לחזור בקוד של
 * הפונקציה עצמה — ולהסכים זו עם זו. שלוש פונקציות דוחות הסכימו ביניהן רק
 * חלקית: אחת לא בדקה תפקיד בכלל, ושתיים התירו זהות של מנהל־בלבד לנתוני לומד
 * יחיד, בניגוד למודול 24 §ב.
 */
const token = (t: Record<string, unknown>) => t;

describe('קריאת התפקידים מתוך ה-Token', () => {
  it('מזהה מורה בכל צורות ההצהרה שהמערכת מייצרת', () => {
    for (const t of [
      { role: 'teacher' },
      { role: 'TEACHER' },
      { teacher: true },
      { roles: ['TEACHER'] },
      { roles: ['teacher', 'admin'] },
    ]) {
      expect(readCallerRoles(token(t)).isTeacher, JSON.stringify(t)).toBe(true);
    }
  });

  it('מזהה מנהל בכל צורות ההצהרה', () => {
    for (const t of [{ role: 'admin' }, { role: 'ADMIN' }, { admin: true }, { roles: ['ADMIN'] }]) {
      expect(readCallerRoles(token(t)).isAdmin, JSON.stringify(t)).toBe(true);
    }
  });

  it('לומד אינו מורה ואינו מנהל', () => {
    const caller = readCallerRoles(token({ role: 'student', student_id: 4 }));
    expect(caller.isTeacher).toBe(false);
    expect(caller.isAdmin).toBe(false);
    expect(caller.studentId).toBe(4);
  });

  it('מספר לומד מתקבל רק בטווח הפיילוט 1 עד 12', () => {
    for (const bad of [0, 13, -1, 4.5, 'abc', null, undefined, {}]) {
      expect(readCallerRoles(token({ student_id: bad })).studentId, String(bad)).toBeNull();
    }
    for (const good of [1, 12, '7']) {
      expect(readCallerRoles(token({ student_id: good })).studentId, String(good)).not.toBeNull();
    }
  });

  it('התחברות אנונימית — Token ריק — אינה מקנה דבר', () => {
    const caller = readCallerRoles(token({}));
    expect(caller).toEqual({ isTeacher: false, isAdmin: false, studentId: null, classId: null });
  });
});

describe('מודול 24 §ב — נתוני לומד יחיד שמורים למורה', () => {
  it('מורה עוברת', () => {
    expect(() => requireTeacherForIndividualData(token({ role: 'teacher' }))).not.toThrow();
  });

  it('בעל המוצר, שנושא גם מורה וגם מנהל, עובר', () => {
    // syncUserRoles מחתים roles: ["TEACHER","ADMIN"] על חשבון בעל המוצר.
    expect(() => requireTeacherForIndividualData(token({ roles: ['TEACHER', 'ADMIN'], role: 'admin', admin: true, teacher: true }))).not.toThrow();
  });

  it('זהות של מנהל־בלבד נחסמת', () => {
    expect(() => requireTeacherForIndividualData(token({ role: 'admin', admin: true }))).toThrow(/מורה/);
  });

  it('לומד נחסם', () => {
    expect(() => requireTeacherForIndividualData(token({ role: 'student', student_id: 3 }))).toThrow();
  });

  it('קורא מחובר בלי תפקיד נחסם', () => {
    expect(() => requireTeacherForIndividualData(token({}))).toThrow();
  });
});

describe('פעולות ניהול', () => {
  it('מנהל עובר, מורה ולומד נחסמים', () => {
    expect(() => requireAdmin(token({ role: 'admin' }))).not.toThrow();
    expect(() => requireAdmin(token({ role: 'teacher' }))).toThrow(/מנהל/);
    expect(() => requireAdmin(token({ role: 'student', student_id: 1 }))).toThrow();
    expect(() => requireAdmin(token({}))).toThrow();
  });
});
