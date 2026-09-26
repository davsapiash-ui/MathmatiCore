import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * מודול 25 §ד ומסמך 04: "מחולל כרטיסי כניסה להדפסה". הכרעת בעל המוצר (26.9.2026):
 * כרטיס לכל אחד מ-12 הלומדים — המספר בכיתה, קוד הגישה, ושורה ריקה שבה המורה כותבת
 * את שם התלמיד בכתב יד. השם אינו נכנס למערכת.
 */
const root = resolve(__dirname, '../../../..');
const page = readFileSync(resolve(root, 'react-ts-version/src/presentation/pages/admin/StudentLoginCardsPage.tsx'), 'utf-8');
const app = readFileSync(resolve(root, 'react-ts-version/src/App.tsx'), 'utf-8');
const fn = readFileSync(resolve(root, 'functions/src/studentLoginCards.ts'), 'utf-8');
const index = readFileSync(resolve(root, 'functions/src/index.ts'), 'utf-8');
const login = readFileSync(resolve(root, 'react-ts-version/src/presentation/pages/Login.tsx'), 'utf-8');

describe('כרטיסי כניסה לתלמידים', () => {
  it('הכרטיס משתמש באותן תוויות שעל מסך הכניסה', () => {
    for (const label of ['המספר שלי בכיתה', 'קוד גישה']) {
      expect(login).toContain(label);
      expect(page).toContain(label);
    }
  });

  it('שורה ריקה לשם, ושום שדה להקלדת שם (Zero-PII)', () => {
    expect(page).toContain('שם התלמיד:');
    expect(page).not.toMatch(/<input|<textarea|contentEditable/);
  });

  it('קוד הגישה אינו כתוב בקוד הדפדפן — הוא מגיע מהשרת, למנהל המערכת בלבד', () => {
    expect(page).not.toContain('10203040');
    expect(fn).toContain('requireAdmin(request.auth.token');
    expect(fn).toContain('FIXED_CLASS_PASSCODE');
    expect(index).toContain('export { getStudentLoginCards } from "./studentLoginCards";');
  });

  it('הדף פתוח למנהל המערכת בלבד', () => {
    const at = app.indexOf('path="/admin/login-cards"');
    expect(at).toBeGreaterThan(0);
    expect(app.slice(at, at + 200)).toContain('<AuthGuard allowedRoles={["admin"]}>');
  });

  it('12 כרטיסים — מזהים 1 עד 12', () => {
    expect(fn).toContain('Array.from({ length: 12 }, (_, i) => i + 1)');
  });
});
