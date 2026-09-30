import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { blockRemote, gotoWorkspace, openContext, OUT_DIR, STUDENT_UID, ws, closedSession, type AuditContext } from './harness';
import { VIEWPORTS } from './viewports';

/**
 * The live scenario: a teacher and a learner in two browsers sharing one
 * (fake) Realtime Database — what the screen audit cannot see. Each step does
 * something through the real UI and checks the other side reacts.
 *
 *   npx playwright test --config playwright.ux-audit.config.ts live-journey
 *
 * Results: test-results/ux-audit/live/steps.md and a screenshot per step.
 */

const LIVE_DIR = path.join(OUT_DIR, 'live');
const TEACHER = {
  uid: 'teacher_dev',
  id: 'teacher_dev',
  email: 'teacher.demo@edu-haifa.org.il',
  role: 'teacher',
  name: 'המורה',
  displayName: 'המורה',
  whitelistVerified: true,
};

interface StepResult {
  id: string;
  what: string;
  ok: boolean;
  detail: string;
  shot?: string;
}

async function teacherContext(browser: import('@playwright/test').Browser, c: AuditContext): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const vp = VIEWPORTS.find((v) => v.id === 'laptop-1366')!;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'he-IL' });
  await blockRemote(ctx);
  await c.rtdb.attach(ctx);
  await ctx.addInitScript((user) => {
    const now = String(Date.now());
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('mc_auth_user', JSON.stringify(user));
      s.setItem('mc_auth_role', 'teacher');
      s.setItem('mc_auth_time', now);
    }
    localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
    localStorage.setItem('mathmaticore_has_seen_tour', 'true');
    (window as unknown as Record<string, unknown>).__E2E_BYPASS_TOUR__ = true;
  }, TEACHER);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`UNCAUGHT ${e.message}`));
  return { ctx, page, errors };
}

test('live scenario: teacher and learner together', async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  const results: StepResult[] = [];
  const vp = VIEWPORTS.find((v) => v.id === 'laptop-1366')!;

  // The learner starts with no meeting open: the lobby.
  const c = await openContext(browser, vp, { mode: 'default', path: 'green_path', approved: true, classSession: closedSession() });
  const t = await teacherContext(browser, c);

  const step = async (id: string, what: string, fn: () => Promise<string>, shotOf: Page = c.page) => {
    let ok = true;
    let detail = '';
    try {
      detail = await fn();
    } catch (err) {
      ok = false;
      detail = (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 220);
    }
    const shot = path.join(LIVE_DIR, `${String(results.length + 1).padStart(2, '0')}-${id}.png`);
    await shotOf.screenshot({ path: shot }).catch(() => undefined);
    results.push({ id, what, ok, detail, shot: path.relative(OUT_DIR, shot) });
    // eslint-disable-next-line no-console
    console.log(`${ok ? '✓' : '✗'} ${id} — ${detail}`);
  };

  await step('lobby', 'הלומד בלובי לפני שהמורה פותחת מפגש', async () => {
    await c.page.goto('/hub', { waitUntil: 'domcontentloaded' });
    await expect(c.page.getByText('היום עוד לא התחלנו')).toBeVisible({ timeout: 30_000 });
    return 'מסך "היום עוד לא התחלנו" מוצג';
  });

  await step('teacher-dashboard', 'לוח המורה נטען', async () => {
    await t.page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(t.page.getByRole('button', { name: /הפעילו מפגש/ })).toBeVisible({ timeout: 45_000 });
    const sx = await t.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (sx > 1) throw new Error(`גלילה לרוחב של ${sx}px בלוח המורה`);
    return 'הלוח נטען, כפתור "הפעילו מפגש" זמין, אין גלילה לרוחב';
  }, t.page);

  await step('teacher-opens-3', 'המורה פותחת את מפגש 3 מהלוח', async () => {
    const picker = t.page.locator('select').filter({ has: t.page.locator('option[value="3"]') }).first();
    await picker.selectOption('3');
    await t.page.getByRole('button', { name: /הפעילו מפגש/ }).click();
    await t.page.getByRole('button', { name: /הפעלה|אישור|הפעילו/ }).last().click();
    await expect.poll(() => (c.rtdb.get('active_class_session') as { sessionNumber?: number; active?: boolean } | null)?.sessionNumber, { timeout: 20_000 }).toBe(3);
    // Firestore is unreachable in this harness: the window must still close and
    // the pause / close controls must be reachable without a reload.
    await expect(t.page.getByRole('button', { name: 'ביטול' })).toBeHidden({ timeout: 10_000 });
    await expect(t.page.getByRole('button', { name: /עצרו את המפגש/ })).toBeVisible({ timeout: 10_000 });
    return 'מפגש 3 פעיל; חלון האישור נסגר מיד וכפתורי העצירה והסגירה זמינים — גם כש-Firestore לא עונה';
  }, t.page);

  await step('learner-moved-in', 'הלומד עובר לבד מהלובי למפגש 3', async () => {
    await c.page.waitForURL(/workspace\?meeting=3/, { timeout: 30_000 });
    await c.page.waitForFunction(() => !(document.body.innerText || '').includes('טוען את המשימות'), undefined, { timeout: 30_000 });
    await expect(c.page.getByText(/משימה 1 מתוך/)).toBeVisible({ timeout: 20_000 });
    return 'הלומד במפגש 3, "משימה 1 מתוך 7" מוצג';
  });

  // Exercise 1 of meeting 3 is a representation: build it, type it, continue.
  await step('solve-exercise-1', 'פתרון תרגיל 1 ולחיצה על "ממשיכים"', async () => {
    const info = { idx: await ws<number>(c.page, 'return st.standardTaskIdx;') };
    // The green path's exercise 1 (s3_g_t1, owner 30.9.2026): the number is
    // said in words, and nothing on the screen shows it in digits — build its
    // standard blocks and write it in the one answer box.
    await expect(c.page.getByText('בנו בבית המספרים את המספר שלושת אלפים וארבע מאות.')).toBeVisible({ timeout: 15_000 });
    const target = 3400;
    await ws(c.page, 'api.setState({ counts: arg, hasInteracted: true });', { thousands: 3, hundreds: 4, tens: 0, units: 0 });
    await c.page.getByTestId('representation-answer').fill(String(target));
    await c.page.getByTestId('proceed-button').click();
    await expect.poll(async () => (await ws<number>(c.page, 'return st.standardTaskIdx;')), { timeout: 15_000 }).toBe(info.idx + 1);
    return `המספר ${target} נבנה ונכתב; עברנו לתרגיל ${info.idx + 2}`;
  });

  await step('help-to-teacher', 'קריאה שקטה למורה מגיעה ללוח', async () => {
    await c.page.getByRole('button', { name: 'קריאה שקטה למורה' }).click();
    await expect.poll(() => (c.rtdb.get(`users/students/${STUDENT_UID}`) as { helpRequested?: boolean } | null)?.helpRequested, { timeout: 20_000 }).toBe(true);
    return 'helpRequested=true נכתב לרשומת הלומד (הרדאר של המורה קורא ממנה)';
  });

  await step('read-aloud', 'כפתור ההקראה לוחץ בלי שגיאה', async () => {
    const before = c.drainConsole().length;
    await c.page.getByRole('button', { name: 'הקראה בקול' }).first().click();
    await c.page.waitForTimeout(500);
    const errs = c.drainConsole().filter((e) => /UNCAUGHT/.test(e));
    if (errs.length) throw new Error(errs[0]);
    return `נלחץ; ${before} הודעות קונסול קודמות, אין חריגה`;
  });

  await step('teacher-pauses', 'המורה עוצרת — הלומד רואה המתנה', async () => {
    await t.page.getByRole('button', { name: /עצרו את המפגש/ }).click({ timeout: 30_000 });
    await expect(c.page.getByText(/המורה עצרה/)).toBeVisible({ timeout: 20_000 });
    return 'מסך "המורה עצרה" אצל הלומד';
  });

  await step('teacher-resumes', 'המורה ממשיכה — הלומד חוזר לתרגיל', async () => {
    await t.page.getByRole('button', { name: /המשיכו את המפגש/ }).click();
    await expect(c.page.getByText(/המורה עצרה/)).toBeHidden({ timeout: 20_000 });
    return 'ההמתנה נעלמה, התרגיל שוב פעיל';
  });

  await step('teacher-closes', 'המורה סוגרת — הלומד רואה "המפגש נסגר"', async () => {
    await t.page.getByRole('button', { name: /סגרו את המפגש/ }).click();
    const confirm = t.page.getByRole('button', { name: /סגירה|אישור|סגרו/ }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => undefined);
    await expect.poll(() => (c.rtdb.get('active_class_session') as { active?: boolean } | null)?.active, { timeout: 20_000 }).toBe(false);
    await expect(c.page.getByText(/המורה סגרה את/)).toBeVisible({ timeout: 20_000 });
    return 'active=false; מסך הסגירה מוצג ללומד';
  });

  // Meeting 8 reflection, end to end: the learner finishes and it is saved.
  await step('m8-reflection-saved', 'רפלקציה במפגש 8 נשמרת ומסתיימת במסך הסיום', async () => {
    await gotoWorkspace(c, 8);
    await ws(c.page, 'api.setState({ openingScreenSeen: true, flowStatus: "reflection", awaitingNext: false });');
    await c.page.locator('.fixed.inset-0 [role="group"] button').first().click();
    await c.page.locator('.fixed.inset-0 button:not([disabled])').last().click();
    await c.page.locator('.fixed.inset-0 [role="checkbox"]').first().click();
    await c.page.locator('.fixed.inset-0 button:not([disabled])').last().click();
    await c.page.locator('.fixed.inset-0 button:not([disabled])').last().click();
    await expect(c.page.getByText(/סיימתם את תחנה 8/)).toBeVisible({ timeout: 20_000 });
    return 'שלושת השלבים, לחיצת הסיום, ומסך "סיימתם את תחנה 8"';
  });

  const errors = [...t.errors, ...c.drainConsole().filter((e) => /UNCAUGHT/.test(e))];
  const lines = [
    '# תסריט חי: מורה ולומד',
    '',
    `1366×633 · ${new Date().toISOString()}`,
    '',
    '| # | שלב | תוצאה | פירוט | צילום |',
    '|---|---|---|---|---|',
    ...results.map((r, i) => `| ${i + 1} | ${r.what} | ${r.ok ? '✓' : '✗'} | ${r.detail.replace(/\|/g, '/')} | ${r.shot ?? ''} |`),
    '',
    errors.length ? `חריגות לא מטופלות: ${errors.slice(0, 5).join(' ; ')}` : 'אין חריגות לא מטופלות בשני הדפדפנים.',
  ];
  fs.writeFileSync(path.join(LIVE_DIR, 'steps.md'), lines.join('\n'), 'utf8');
  await t.ctx.close();
  await c.context.close();
  expect(results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.detail}`)).toEqual([]);
});
