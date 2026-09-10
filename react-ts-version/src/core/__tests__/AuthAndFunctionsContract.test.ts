import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

/**
 * חוזה ההזדהות ופונקציות הענן.
 *
 * שלושת הכללים שנבדקים כאן כתובים באפיון במפורש, והקוד סתר את שלושתם:
 * ההזדהות נסגרה בדפדפן במקום מול השרת, נקודות קצה ציבוריות כתבו נתונים
 * מומצאים על תלמידים אמיתיים, ופונקציית קליטת הטלמטריה לא בדקה שהכותב
 * הוא הילד שעליו הוא כותב.
 */
const repo = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf-8');

const login = repo('react-ts-version/src/presentation/pages/Login.tsx');
const fnIndex = repo('functions/src/index.ts');

describe('מודול 1 §א — הזדהות תלמיד נסגרת מול השרת בלבד', () => {
  it('אין עקיפה בדפדפן: קוד הגישה אינו מופיע בקוד הלקוח', () => {
    // הקוד היה מוטמע בחבילה שנשלחת לדפדפן, וכל אחד יכול היה לקרוא אותו.
    const clientDir = resolve(__dirname, '../../');
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name === '__tests__') continue;
          out.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
      }
      return out;
    };
    const offenders = walk(clientDir).filter((f) => readFileSync(f, 'utf-8').includes('10203040'));
    expect(offenders).toEqual([]);
  });

  it('הדגל הגלובלי נדלק רק אחרי שהקריאה לשרת הצליחה', () => {
    // הקריאה אינה עטופה עוד ב-catch שממשיך הלאה; כשל כלשהו נופל לגוש
    // ה-catch החיצוני שמבצע את ה-Rollback של §ב.
    expect(login).toMatch(/await authStudentCallable\(\{[\s\S]{0,220}\}\);[\s\S]{0,600}isStudentAuthenticated = true/);
    expect(login).not.toMatch(/catch \(fnErr[\s\S]{0,400}trimmedPasscode !== /);
  });

  it('שגיאת תקשורת מפעילה את התגובה שהאפיון מגדיר: רטט וניקוי, בלי הודעה', () => {
    expect(login).toMatch(/triggerErrorWithShake\(\)/);
    expect(login).toMatch(/const triggerErrorWithShake = \(\) => \{[\s\S]{0,200}setStudentPassword\(""\)/);
  });
});

describe('פונקציות ענן — אין נקודת קצה ציבורית שכותבת נתוני תלמידים', () => {
  it('שתי נקודות הקצה הציבוריות שכתבו דוחות מומצאים הוסרו', () => {
    // שתיהן היו invoker: "public" בלי שום אימות, כתבו לתיקיית ה-Drive
    // המשותפת, ואחת מהן אף כתבה מסמך דוח על כל תלמיד שהקורא נקב בו.
    expect(fnIndex).not.toContain('triggerTestDriveReport');
    expect(fnIndex).not.toContain('triggerExecutiveDriveReport');
  });

  it('לא נותרה אף נקודת קצה עם invoker ציבורי', () => {
    expect(fnIndex).not.toMatch(/invoker:\s*"public"/);
  });
});

describe('קליטת אירועי תלמיד — הכותב חייב להיות הילד שעליו כותבים', () => {
  it('מספר התלמיד נאכף לטווח 1 עד 12, ולא רק מתועד כך בהערה', () => {
    expect(fnIndex).toMatch(/numericStudentId < 1 \|\| numericStudentId > 12/);
    expect(fnIndex).toContain('invalid-argument');
  });

  it('לומד אינו יכול להגיש אירוע על שם לומד אחר', () => {
    expect(fnIndex).toContain('callerStudentId !== numericStudentId');
    expect(fnIndex).toContain('permission-denied');
  });

  it('צוות כן רשאי להגיש בשם לומד', () => {
    expect(fnIndex).toMatch(/callerRole === "teacher" \|\| callerRole === "admin"/);
  });

  it('אפס מידע מזהה: רק שדות מספריים מוכרים נשמרים', () => {
    // details הועתק קודם כמו שהוא, כך שאפשר היה להשתיל בו שם של ילד —
    // בפונקציה שהחוזה שלה הוא "strict PII scrubbing".
    expect(fnIndex).toContain('NUMERIC_DETAIL_KEYS');
    expect(fnIndex).not.toMatch(/details: interaction_data\?\.details \|\| \{\}/);
  });
});
