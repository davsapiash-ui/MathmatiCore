import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const firebaseMock = vi.hoisted(() => ({ auth: { currentUser: null as null | { getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>; getIdToken: (f: boolean) => Promise<string> } }, functions: {} }));
const syncMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('@/infrastructure/firebase', () => firebaseMock);
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => syncMock) }));
import { claimsMatchRole, ensureStaffRoleClaims } from '@/infrastructure/services/staffRoleClaims';

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

  it('הדשבורד, הדוחות האישיים והמקרן — למורה; מסך הלומד והלובי — ללומד בלבד (PRD מודול 2 §א); לא למנהל', () => {
    expect(app).toContain('const TEACHER_ONLY: readonly AppRole[] = ["teacher"];');
    for (const path of ['/dashboard', '/teacher/dashboard', '/reports/student/:id', '/projector']) {
      expect(guardOf(path), path).toBe('TEACHER_ONLY');
    }
    for (const path of ['/hub', '/student/lobby', '/workspace']) {
      expect(guardOf(path), path).not.toContain('admin');
    }
    expect(src('presentation/pages/ProjectorSandboxPage.tsx')).not.toContain("user?.role !== 'admin'");
  });

  it('הכתובת /dashboard/student/:id/view, ששום קישור לא הוביל אליה, אינה קיימת', () => {
    expect(app).not.toContain('/dashboard/student/:id/view');
  });

  it('בחירת התפקיד היא בכרטיסי הכניסה בלבד: אין חלון בחירה נוסף ואין כניסה לפי כתובת בלי Google', () => {
    expect(app).not.toContain('RoleSelectionModal');
    expect(src('application/useAuthStore.ts')).not.toContain('showRoleSelector');
    expect(src('infrastructure/services/AuthService.ts')).not.toContain('authenticateWhitelistedEmail');
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

  it('הדשבורד והקונסולה נפתחים רק אחרי שהאסימון נושא תפקיד אחד (StaffClaimsGate)', () => {
    expect(app.split('<StaffClaimsGate role="teacher"><TeacherDashboard /></StaffClaimsGate>').length - 1).toBe(3);
    expect(app).toContain('<StaffClaimsGate role="admin"><AdminLayout /></StaffClaimsGate>');
    expect(app).toContain('<StaffClaimsGate role="admin"><StudentLoginCardsPage /></StaffClaimsGate>');
    expect(src('presentation/pages/TeacherDashboard.tsx')).not.toContain('tokenRes.claims.role !== "admin"');
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

describe('נ.2 — פתיחת עמוד אינה מחליפה תפקיד (ביקורת עצמאית, ממצא 1)', () => {
  const withClaims = (claims: Record<string, unknown>) => {
    firebaseMock.auth.currentUser = {
      getIdTokenResult: async () => ({ claims }),
      getIdToken: async () => 'token',
    };
  };

  it('אסימון מורה בלשונית שבה נפתחת הקונסולה — אינו נחתם מחדש כמנהל (השיעור הפתוח אינו נקטע)', async () => {
    syncMock.mockClear();
    withClaims({ teacher: true, admin: false, role: 'teacher', class_id: 'class_1', roles: ['TEACHER'] });
    await ensureStaffRoleClaims('admin');
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('אסימון מנהל בעמוד המורה — גם הוא נשאר; החלפת תפקיד היא כניסה חדשה', async () => {
    syncMock.mockClear();
    withClaims({ admin: true, teacher: false, role: 'admin', roles: ['ADMIN'] });
    await ensureStaffRoleClaims('teacher');
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('claims כפולים מלפני התיקון, או בלי תפקיד — נחתמים מחדש לתפקיד העמוד', async () => {
    for (const claims of [{ admin: true, teacher: true, role: 'admin', roles: ['TEACHER', 'ADMIN'] }, {}]) {
      syncMock.mockClear();
      withClaims(claims);
      await ensureStaffRoleClaims('teacher');
      expect(syncMock).toHaveBeenCalledWith({ role: 'teacher' });
    }
  });
});
