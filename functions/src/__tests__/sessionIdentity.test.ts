import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { studentNumberFromSessionId, sessionNumberFromId } from '../meetingMetrics';

/**
 * מסמך מפגש אינו נושא שדה student_id — הלומד נמצא במזהה המסמך. דוח הכיתה
 * וייצוא המחקר קראו `data.student_id`, קיבלו undefined, ולכן לא קישרו אף
 * מסמך מפגש לאף לומד: ארבע עמודות מחקר היו ריקות ל-12 הלומדים בכל מפגש.
 */
describe('מספר הלומד מתוך מזהה המפגש', () => {
  it('שתי צורות המזהה שהמערכת מייצרת', () => {
    expect(studentNumberFromSessionId('session_02_student_4')).toBe(4);
    expect(studentNumberFromSessionId('session_3_student_user11')).toBe(11);
    expect(studentNumberFromSessionId('session_08_student_12')).toBe(12);
  });

  it('מחוץ לטווח או ללא מבנה מוכר — null, לא ניחוש', () => {
    for (const bad of ['session_02_student_0', 'session_02_student_13', 'session_02', '', 'student_4', 'session_2_student_student_user4x']) {
      expect(studentNumberFromSessionId(bad), bad).toBeNull();
    }
  });

  it('מספר המפגש ומספר הלומד נקראים מאותו מזהה בלי להתערבב', () => {
    const id = 'session_05_student_7';
    expect(sessionNumberFromId(id)).toBe(5);
    expect(studentNumberFromSessionId(id)).toBe(7);
  });
});

describe('ייצוא המחקר — מה יוצא ומה נשאר', () => {
  const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
  const fn = src.slice(src.indexOf('export const exportResearchDataset'));

  it('מסמכי המפגש נקשרים ללומד גם בלי שדה student_id', () => {
    expect(fn).toContain('studentNumber(data.student_id) ?? studentNumberFromSessionId(');
  });

  it('אובייקט ה-details המלא אינו מיוצא', () => {
    expect(fn).not.toContain('details_json: d,');
  });

  it('רפלקציות עוברות רשימת שדות, לא פיזור גורף', () => {
    expect(fn).toContain('const REFLECTION_FIELDS = [');
    expect(fn).not.toContain('reflection_id: id, ...data');
  });

  it('כתובת הדוא"ל של מבצע האיפוס אינה מיוצאת', () => {
    expect(fn).toContain('if (/email|performed_by/i.test(k)) continue;');
    expect(fn).not.toContain('({ log_id: id, ...data })');
  });

  it('בדיקת ה-PII אינה מחריגה את הקורא', () => {
    expect(fn).toContain('if (piiRegex.test(allContent))');
    expect(fn).not.toContain('allContent.split(userEmail)');
  });

  it('הייצוא שמור למורה; זהות של מנהל־בלבד נחסמת', () => {
    expect(fn).toContain('requireTeacherForIndividualData(token)');
    expect(fn).not.toContain('if (!isTeacher && !isAdmin)');
  });
});

describe('הדוח האישי שייך ללומד שבכותרת', () => {
  const src = readFileSync(resolve(__dirname, '../pedagogicalReport.ts'), 'utf-8');
  it('אירועים של לומד אחר מפילים את ההפקה במקום להיכנס לדוח', () => {
    expect(src).toContain('n !== clampedStudentNum');
    expect(src).toContain('הדוח לא הופק');
  });
});
