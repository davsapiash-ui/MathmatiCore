import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/infrastructure/firebase', () => ({ auth: { currentUser: null }, functions: {} }));
import { claimsMatchRole } from '@/infrastructure/services/staffRoleClaims';

/**
 * דוח "האפיון מול התוכנה" (28.9.2026), נ.2: בעמוד "תצוגת מורה" המנהל ראה את
 * כל לוח המורה — משבצות הרדאר, שער האישור, דוחות אישיים, איפוס וייצוא — והפעיל
 * מפגשים. PRD מודול 24 §ב: "מנהלי מערכת חסומים מגישה לנתוני טלמטריה פרטניים או
 * למסמכי תלמידים אישיים"; מודול 23א §ו: המנהל חסום מאיפוס; מודול 24 §ב: הייצוא
 * המחקרי הוא של המורה. מרשם הסטיות, פער יא: כמנהל — הקונסולה בלבד.
 *
 * כאן ננעל הצד של הדפדפן. הצד של השרת ננעל במנוע האמיתי:
 * src/__tests__/emulator/Module24_AdminBlocked.live.test.ts.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf-8');
const app = src('App.tsx');

function guardOf(path: string): string {
  const at = app.indexOf(`path="${path}"`);
  expect(at, path).toBeGreaterThan(-1);
  const guard = app.slice(at).match(/allowedRoles=\{([^}]+)\}/);
  expect(guard, path).not.toBeNull();
  return guard![1];
}

describe('נ.2 — מה שייך למורה אינו נפתח לכניסת מנהל', () => {
  it('אין עמוד "תצוגת מורה" בפורטל המנהל', () => {
    expect(app).not.toContain('teacher-view');
    expect(src('presentation/pages/AdminLayout.tsx')).not.toContain('teacher-view');
    expect(src('presentation/pages/AdminLayout.tsx')).not.toContain('תצוגת מורה');
  });

  it('הדשבורד, הדוחות האישיים, מסך הלומד, הלובי והמקרן — למורה (והלומד במקומו), לא למנהל', () => {
    expect(app).toContain('const TEACHER_ONLY = ["teacher"];');
    for (const path of ['/dashboard', '/teacher/dashboard', '/reports/student/:id', '/dashboard/student/:id/view', '/projector']) {
      expect(guardOf(path), path).toBe('TEACHER_ONLY');
    }
    for (const path of ['/hub', '/student/lobby', '/workspace']) {
      expect(guardOf(path), path).not.toContain('admin');
    }
    expect(src('presentation/pages/ProjectorSandboxPage.tsx')).not.toContain("user?.role !== 'admin'");
  });

  it('המסכים של המנהל נשארו: סקירה, מוסדות, תוכנית לימודים, תמיכה, אבטחה, הגדרות, צ\'אט וכרטיסי כניסה', () => {
    for (const path of ['schools', 'curriculum', 'support', 'security', 'settings', 'chat']) {
      expect(app, path).toContain(`<Route path="${path}"`);
    }
    expect(guardOf('/admin/login-cards')).toBe('["admin"]');
    expect(guardOf('/admin')).toBe('["admin"]');
  });
});

describe('נ.2 — הצ\'אט בין המורה ללומדים אינו נפתח לכניסת מנהל', () => {
  it('useChatStore אינו מאזין ל-chat_messages כשהתפקיד הוא מנהל (לקונסולה ערוץ משלה, מודול 22)', () => {
    const chat = src('application/useChatStore.ts');
    const at = chat.indexOf("if (role === 'admin') {");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(chat.indexOf("ref(database, 'chat_messages')"));
  });
});

describe('נ.2 — ה-claims של הכניסה הם של התפקיד שנבחר (פער יא)', () => {
  it('הכניסה מבקשת מהשרת את התפקיד שנבחר במסך ההזדהות', () => {
    expect(src('infrastructure/services/AuthService.ts')).toContain('await syncCallable({ role: targetRole });');
  });

  it('הדשבורד חותם את עצמו כמורה, והקונסולה כמנהל', () => {
    const dash = src('presentation/pages/TeacherDashboard.tsx');
    expect(dash).toContain('ensureStaffRoleClaims("teacher")');
    expect(dash).not.toContain('tokenRes.claims.role !== "admin"');
    expect(src('presentation/pages/AdminLayout.tsx')).toContain('ensureStaffRoleClaims("admin")');
  });

  it('claims כפולים (כפי שנחתמו לכל מנהל עד 28.9) אינם נחשבים לאף אחד מהתפקידים', () => {
    const dual = { admin: true, teacher: true, role: 'admin', roles: ['TEACHER', 'ADMIN'] };
    expect(claimsMatchRole(dual, 'admin')).toBe(false);
    expect(claimsMatchRole(dual, 'teacher')).toBe(false);
  });

  it('claims של תפקיד אחד מתאימים לתפקיד הזה בלבד', () => {
    const admin = { admin: true, teacher: false, role: 'admin', roles: ['ADMIN'] };
    const teacher = { teacher: true, admin: false, role: 'teacher', class_id: 'class_1', roles: ['TEACHER'] };
    expect(claimsMatchRole(admin, 'admin')).toBe(true);
    expect(claimsMatchRole(admin, 'teacher')).toBe(false);
    expect(claimsMatchRole(teacher, 'teacher')).toBe(true);
    expect(claimsMatchRole(teacher, 'admin')).toBe(false);
  });
});
