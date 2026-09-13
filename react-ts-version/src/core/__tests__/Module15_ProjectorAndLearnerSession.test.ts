import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * מצב מקרן (מודול 15) והישארות הלומד במפגש (מודול 14 §ב1).
 *
 * ארבע תקלות שכולן נגמרות באותו מקום — ילד מול מסך שאינו מה שהמורה חושבת:
 *
 * 1. חוקי מסד הנתונים התירו כתיבה ל-system_control למנהל בלבד, והמורה היא
 *    שכותבת. כל כתיבה נדחתה, התג הראה "שידור פעיל", והילדים המשיכו לשחק.
 * 2. הכתיבה שנדחתה הגיעה ל-console בלבד.
 * 3. סגירת הלשונית אינה מריצה ניקוי של React, ולכן הדגל נשאר דלוק לנצח
 *    ו-12 ילדים נתקעו במסך המתנה שאין בו כפתור.
 * 4. פתיחת הדף הדליקה שידור מיד, לפני שהמורה ביקשה.
 *
 * ובמקביל: לומד הוצא מהמערכת אחרי 5 דקות בלי תזוזת עכבר — בדיוק במצבים
 * שבהם המוצר מבקש ממנו לא לגעת במסך.
 */
const repo = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf-8');
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

const rules = JSON.parse(repo('database.rules.json')) as { rules: Record<string, any> };
const projector = src('presentation/pages/ProjectorSandboxPage.tsx');
const idle = src('application/useIdleTimeout.ts');

describe('מודול 15 — המורה היא שמפעילה את המקרן', () => {
  it('החוקים מתירים למורה לכתוב את מצב המקרן', () => {
    const write = rules.rules.system_control?.projector_mode?.['.write'];
    expect(typeof write).toBe('string');
    expect(write).toContain("auth.token.role == 'teacher'");
  });

  it('שאר system_control נשאר למנהל בלבד', () => {
    const parentWrite = rules.rules.system_control['.write'];
    expect(parentWrite).toContain("auth.token.role == 'admin'");
    expect(parentWrite).not.toContain("auth.token.role == 'teacher'");
  });

  it('השרת משחרר את הכיתה גם כשהלשונית נסגרת', () => {
    expect(projector).toContain('onDisconnect(projectorRef).set(release)');
    expect(projector).toContain('onDisconnect(projectorRef).cancel()');
  });

  it('כתיבה שנדחתה מוצגת למורה, לא רק ל-console', () => {
    expect(projector).toContain('setBroadcastError(true)');
    expect(projector).toContain('role="alert"');
    expect(projector).toContain('השידור לא נשמר בשרת');
  });

  it('פתיחת הדף אינה מדליקה שידור מעצמה', () => {
    expect(projector).toContain('useState(false)');
    expect(projector).not.toContain('useState<boolean>(true)');
  });

  it('החזרה לדשבורד מובילה למסלול שקיים', () => {
    const app = src('App.tsx');
    const target = /navigate\('([^']+)'\);/.exec(projector.slice(projector.indexOf('handleReturnToDashboard')))?.[1];
    expect(target).toBeTruthy();
    expect(app).toContain(`path="${target}"`);
  });
});

describe('מודול 14 §ב1 — לומד אינו מנותק', () => {
  it('אין טיימר חוסר פעילות שמנתק לומד', () => {
    const fn = idle.slice(idle.indexOf('const resetTimeout'), idle.indexOf('useEffect('));
    expect(fn).toContain('if (isStudent) {');
    expect(fn).toContain('return;');
    expect(fn).not.toContain('5 דקות של חוסר פעילות');
  });

  it('נוכחות הלומד ממשיכה להתעדכן, כדי שהמורה תראה אותו לא פעיל', () => {
    expect(idle).toContain('touchStudentActivity()');
    expect(idle).toContain('stampStudentWindowClosed()');
  });

  it('לצוות כן נשאר ניתוק אוטומטי', () => {
    expect(idle).toContain('const IDLE_TIMEOUT_MS = 30 * 60 * 1000');
    expect(idle).toContain("handleLogout('התנתקת עקב חוסר פעילות.')");
  });
});
