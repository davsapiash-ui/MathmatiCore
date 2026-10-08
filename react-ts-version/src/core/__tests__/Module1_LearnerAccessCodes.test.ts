import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD מודול 1 §א ומודול 25 §ב.3 — קוד גישה אישי בן 4 ספרות לכל לומד. "רשימת
 * הקודים … גלויים למורה ולמנהל המערכת, וכל אחד מהם יכול לשנות את הקוד של לומד."
 * הקודים נשמרים בשרת בלבד: אוסף learner_access_codes סגור בפני כל לקוח, גם
 * בפני הצוות, שקורא ומשנה אותו רק דרך פונקציות הענן.
 */
const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');
const rules = read('firestore.rules');
const view = read('react-ts-version/src/presentation/pages/TeacherDashboard/components/LearnerAccessCodes.tsx');
const cm = read('react-ts-version/src/presentation/pages/TeacherDashboard/ClassManagement.tsx');
const login = read('react-ts-version/src/presentation/pages/Login.tsx');
const index = read('functions/src/index.ts');

describe('אוסף קודי הגישה — סגור בפני כל לקוח', () => {
  it('חוק Firestore: אין קריאה ואין כתיבה מהדפדפן', () => {
    const start = rules.indexOf('match /learner_access_codes/{classId}');
    expect(start).toBeGreaterThan(0);
    const block = rules.slice(start, rules.indexOf('\n    }', start));
    expect(block).toContain('allow read, write: if false;');
    expect(block.match(/allow /g)).toHaveLength(1);
  });

  it('אין חוק כללי (document=**) שפותח את האוסף', () => {
    expect(rules).not.toMatch(/match \/\{document=\*\*\}/);
  });

  it('צד הלקוח אינו ניגש לאוסף ישירות, רק דרך פונקציות הענן', () => {
    expect(view).not.toContain('learner_access_codes');
    expect(view).not.toMatch(/from ['"]firebase\/firestore['"]/);
    expect(view).toContain("'getLearnerAccessCodes'");
    expect(view).toContain("'regenerateLearnerAccessCode'");
    expect(index).toContain('export { getLearnerAccessCodes, regenerateLearnerAccessCode } from "./learnerAccessCodes";');
  });
});

describe('תצוגת המורה — "קודי גישה" בניהול הכיתה', () => {
  it('הרשימה מוצגת בניהול הכיתה, עם "קוד חדש" לכל לומד', () => {
    expect(cm).toContain('<LearnerAccessCodes />');
    expect(view).toContain('קודי גישה');
    expect(view).toContain('קוד חדש');
    expect(view).toContain('Array.from({ length: 12 }');
  });

  it('הקודים אינם נשמרים בדפדפן', () => {
    expect(view).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});

describe('מסך הכניסה — קוד בן 4 ספרות', () => {
  it('שדה קוד הגישה מצפה ל-4 ספרות', () => {
    expect(login).toContain('maxLength={4}');
    expect(login).toContain('inputMode="numeric"');
    expect(login).not.toContain('placeholder="••••••••"');
  });
});
