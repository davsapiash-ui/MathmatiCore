import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  STUDENT_UID,
  closedSession,
  studentRecord,
  gotoPath,
  gotoWorkspace,
  liveSession,
  measure,
  openContext,
  settle,
  ws,
  type AuditContext,
} from './harness';
import { selectedViewports } from './viewports';

/**
 * The page-level layout of the learner's screens, asserted — not only measured:
 *
 *   - the lobby is one quiet waiting screen with the sentence of its state
 *     (PRD Module 14 §ב0), and swaps in place, without a reload, to the
 *     station's opening screen when the teacher activates the session (Module 6);
 *   - the opening screens of stations 1 and 4 (Module 14 §ב);
 *   - the workspace of station 4 splits 60 / 40: the representations zone on
 *     the visual left, the task-and-response zone on the right (Module 7 §א),
 *     and the coaching card's drawer opens inside the task zone, over the
 *     instruction (in place of the steps), leaving the board's 60%, the
 *     zone's 40% and the work area as they were (Module 7 §א rule 6, v7.15;
 *     Module 12 §ב);
 *   - the lobby's finished sentences, station 8's included (PRD v7.15, 14 §ב0);
 *   - the quiet end screens of stations 1, 4 and 8 (14 §ג) and the waiting
 *     screens over the workspace: pause, close (unfinished), projector, the
 *     other device — and the close for a learner who finished, which keeps
 *     the end screen (14 §ב0).
 *
 * Every state is also measured for the owner's 0-scroll rule (measure.ts).
 * Tier-A viewports only — the hard-fail ones.
 *
 *   npx playwright test --config playwright.ux-audit.config.ts screens-layout
 *
 * UX_LAYOUT_SHOTS=<dir> also writes a named screenshot of each state there
 * (<prefix>-<state>-<w>x<h>.png; UX_LAYOUT_SHOTS_PREFIX, default "after").
 */

const HIGH = new Set(['page-scroll-y', 'page-scroll-x', 'needs-scroll', 'clipped', 'offscreen']);
const SHOTS_DIR = process.env.UX_LAYOUT_SHOTS ? path.resolve(process.env.UX_LAYOUT_SHOTS) : null;
const SHOTS_PREFIX = process.env.UX_LAYOUT_SHOTS_PREFIX || 'after';

const OPENING_1 = 'ברוכים הבאים לתחנה 1: ארגז החול';
const OPENING_4 = 'ברוכים הבאים לתחנה 4: חיבור במאונך עם הקבצה';

async function check(page: Page, state: string, width: number, height: number): Promise<void> {
  await settle(page, 700);
  const m = await measure(page);
  const high = m.findings.filter((f) => HIGH.has(f.type));
  if (SHOTS_DIR) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS_DIR, `${SHOTS_PREFIX}-${state}-${width}x${height}.png`) });
  }
  expect(high.map((f) => `${f.type} ${f.px ?? ''}px ${f.selector}`), `${state}: no scroll, nothing clipped or off-screen`).toEqual([]);
}

type Box = { x: number; y: number; width: number; height: number };
async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`${selector} is not on the screen`);
  return b;
}
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const viewport of selectedViewports().filter((v) => v.tier === 'A')) {
  test.describe(`screens layout at ${viewport.id} (${viewport.width}×${viewport.height})`, () => {
    let c: AuditContext;
    test.beforeEach(async ({ browser }) => {
      c = await openContext(browser, viewport, { mode: 'default', path: 'green_path', approved: true, classSession: closedSession() });
    });
    test.afterEach(async () => {
      await c.context.close().catch(() => undefined);
    });

    test('lobby: one waiting sentence, then the opening screen in place when the teacher activates', async () => {
      await gotoPath(c, '/hub');
      const page = c.page;
      await expect(page.getByText('היום עוד לא התחלנו.', { exact: false })).toBeVisible();
      // None of what the lobby used to carry around it.
      await expect(page.getByText('מרחב הלמידה האישי שלכם')).toHaveCount(0);
      await check(page, 'lobby', viewport.width, viewport.height);

      // The teacher pauses station 4 (not finished by this learner): the paused
      // sentence, not "not started yet".
      c.rtdb.set('active_class_session', liveSession(4, 'paused') as never);
      await expect(page.getByText('המורה עצרה את הפעילות לרגע.')).toBeVisible();
      await expect(page.getByText('היום עוד לא התחלנו', { exact: false })).toHaveCount(0);
      await check(page, 'lobby-paused', viewport.width, viewport.height);

      // The teacher activates: the same document, no reload, now the opening screen.
      await page.evaluate(() => ((window as unknown as { __noReload?: number }).__noReload = 1));
      c.rtdb.set('active_class_session', liveSession(4) as never);
      await expect(page.getByText(OPENING_4, { exact: false })).toBeVisible({ timeout: 30_000 });
      expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)).toBe(1);
      await expect(page.getByRole('button', { name: 'מתחילים' })).toBeVisible();
      await check(page, 'lobby-to-opening', viewport.width, viewport.height);
    });

    for (const meeting of [1, 4] as const) {
      test(`opening screen of station ${meeting}`, async () => {
        await gotoWorkspace(c, meeting);
        // The harness's learner has station 1 on record as finished (its end
        // screen); a fresh meeting, as the teacher's first activation starts it.
        if (meeting === 1) await ws(c.page, 'st.initSession(1, false, 0);');
        await expect(c.page.getByText(meeting === 1 ? OPENING_1 : OPENING_4, { exact: false })).toBeVisible();
        await expect(c.page.getByRole('button', { name: 'מתחילים' })).toBeVisible();
        await check(c.page, `opening-station${meeting}`, viewport.width, viewport.height);
      });
    }

    test('station 4 workspace: 60 / 40, the drawer inside the task zone', async () => {
      await gotoWorkspace(c, 4);
      await c.page.getByRole('button', { name: 'מתחילים' }).click();
      const page = c.page;
      await page.locator('[data-testid="task-zone"]').waitFor({ state: 'visible' });
      await settle(page, 500);

      const task = await box(page, '[data-testid="task-zone"]');
      const board = await box(page, '[data-testid="representations-zone"]');
      const share = board.width / (board.width + task.width);
      expect(share, 'the representations zone is 60% of the row').toBeGreaterThan(0.58);
      expect(share).toBeLessThan(0.62);
      expect(board.x + board.width, 'the board is on the visual left').toBeLessThanOrEqual(task.x + 1);
      await check(page, 'workspace-station4', viewport.width, viewport.height);

      await ws(page, 'st.openSocraticCard("hesitation_45s");');
      const card = page.getByTestId('socratic-card');
      await card.locator('button:not([disabled])').first().waitFor({ state: 'visible', timeout: 12_000 });
      await settle(page, 500);
      const boardOpen = await box(page, '[data-testid="representations-zone"]');
      const taskOpen = await box(page, '[data-testid="task-zone"]');
      const drawer = await box(page, '[data-testid="socratic-side-panel"]');
      expect(Math.abs(boardOpen.width - board.width), 'the board keeps its 60% with the drawer open').toBeLessThanOrEqual(2);
      expect(Math.abs(taskOpen.width - task.width), 'and the task zone its 40%').toBeLessThanOrEqual(2);
      expect(drawer.x, 'the drawer is inside the task zone').toBeGreaterThanOrEqual(taskOpen.x - 1);
      expect(drawer.x + drawer.width).toBeLessThanOrEqual(taskOpen.x + taskOpen.width + 1);
      expect(drawer.y + drawer.height).toBeLessThanOrEqual(taskOpen.y + taskOpen.height + 1);
      expect(overlaps(drawer, boardOpen), 'the drawer covers nothing of the board').toBe(false);
      // PRD 7 §א rule 6 (v7.15): over the instruction, in place of the steps —
      // never over the work area: no box of the vertical sheet is under it.
      const boxes = page.locator('[aria-label^="תרגיל במאונך"] input');
      const count = await boxes.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const b = await boxes.nth(i).boundingBox();
        expect(b && overlaps(drawer, b), `the drawer covers no box of the sheet (${i})`).toBe(false);
      }
      await check(page, 'workspace-station4-socratic', viewport.width, viewport.height);

      // Review RB1: after a wrong choice (the hint and the lock line) the drawer
      // is at its tallest. The card itself never scrolls (PRD 7 §א rule 7) and
      // the result row stays inside it (rule 6).
      const wrong = await ws<string>(page, 'const h = st.aiSocraticHint; return (h && h.choices.find((c) => !c.isCorrect)?.textHe) || "";');
      expect(wrong, 'the card has a wrong option').not.toBe('');
      await page.getByTestId('socratic-card').getByRole('button', { name: wrong }).click();
      await page.getByTestId('socratic-lock-indicator').waitFor({ state: 'visible' });
      await settle(page, 700);
      const overflow = await page.evaluate(() => {
        const card = document.querySelector('#tour-task-card') as HTMLElement | null;
        return card ? card.scrollHeight - card.clientHeight : -1;
      });
      expect(overflow, 'the task card does not scroll after a wrong choice').toBeLessThanOrEqual(0);
      const cardBox = await box(page, '#tour-task-card');
      const lastBox = await boxes.nth(count - 1).boundingBox();
      expect(lastBox, 'the result row is on the screen').not.toBeNull();
      expect(lastBox!.y + lastBox!.height, 'the result row is inside the card').toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
      for (let i = 0; i < count; i += 1) {
        const b = await boxes.nth(i).boundingBox();
        expect(b && overlaps(await box(page, '[data-testid="socratic-side-panel"]'), b), `after the wrong choice the drawer covers no box (${i})`).toBe(false);
      }
      await check(page, 'workspace-station4-socratic-wrong', viewport.width, viewport.height);
    });

    test('lobby: finished, finished station 8, closed unfinished', async () => {
      const finished = (m: number) => ({ ...studentRecord(c.opts), completedMeetings: { [`m${m}`]: Date.now() } });
      c.rtdb.set(`users/students/${STUDENT_UID}`, finished(4) as never);
      c.rtdb.set('active_class_session', { ...closedSession(), lastSessionNumber: 4 } as never);
      await gotoPath(c, '/hub');
      const page = c.page;
      await expect(page.getByText('סיימתם את התחנה. כשהמורה תפתח את התחנה הבאה, נמשיך יחד.')).toBeVisible();
      await check(page, 'lobby-finished', viewport.width, viewport.height);

      c.rtdb.set(`users/students/${STUDENT_UID}`, finished(8) as never);
      c.rtdb.set('active_class_session', { ...closedSession(), lastSessionNumber: 8 } as never);
      await expect(page.getByText('סיימתם את תחנה 8, התחנה האחרונה. העבודה שלכם נשמרה בבטחה.')).toBeVisible();
      await expect(page.getByText('התחנה הבאה', { exact: false })).toHaveCount(0);
      await check(page, 'lobby-finished-station8', viewport.width, viewport.height);

      c.rtdb.set(`users/students/${STUDENT_UID}`, {
        ...studentRecord(c.opts),
        workspaceByMeeting: { m4: { sessionNumber: 4, flowStatus: 'task', hasInteracted: true, savedAt: 1 } },
      } as never);
      c.rtdb.set('active_class_session', { ...closedSession(), lastSessionNumber: 4 } as never);
      await expect(page.getByText('העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.')).toBeVisible();
      await check(page, 'lobby-closed-unfinished', viewport.width, viewport.height);
    });

    test('end screens of stations 1, 4 and 8', async () => {
      const page = c.page;
      // The harness's learner finished station 1: its end screen.
      await gotoWorkspace(c, 1);
      await expect(page.getByText('סיימתם את תחנה 1!')).toBeVisible();
      await expect(page.getByText('העבודה שלכם נשמרה בבטחה.')).toBeVisible();
      await expect(page.getByText('כל הכבוד', { exact: false })).toHaveCount(0);
      await check(page, 'end-station1', viewport.width, viewport.height);

      for (const meeting of [4, 8] as const) {
        await gotoWorkspace(c, meeting);
        // Straight to the end: the end screen comes before the opening screen.
        await ws(page, 'api.setState({ flowStatus: "sessionDone", awaitingNext: false });');
        await expect(page.getByTestId('station-end-screen')).toBeVisible();
        if (meeting === 8) {
          await expect(page.getByText('סיימתם את תחנה 8, התחנה האחרונה!')).toBeVisible();
          await expect(page.getByText('התחנה הבאה', { exact: false })).toHaveCount(0);
        }
        await check(page, `end-station${meeting}`, viewport.width, viewport.height);
      }
    });

    test('waiting screens over the station 4 workspace', async () => {
      await gotoWorkspace(c, 4);
      const page = c.page;
      await page.getByRole('button', { name: 'מתחילים' }).click();
      await page.locator('[data-testid="task-zone"]').waitFor({ state: 'visible' });

      c.rtdb.set('active_class_session', liveSession(4, 'paused') as never);
      await expect(page.getByText('חכו רגע. העבודה שלכם שמורה בדיוק כמו שהשארתם אותה.')).toBeVisible();
      await check(page, 'waiting-paused', viewport.width, viewport.height);

      c.rtdb.set('active_class_session', { ...closedSession(), lastSessionNumber: 4 } as never);
      await expect(page.getByText('העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.')).toBeVisible();
      await check(page, 'waiting-closed-unfinished', viewport.width, viewport.height);

      c.rtdb.set('active_class_session', liveSession(4) as never);
      c.rtdb.set('system_control/projector_mode', { active: true, projector_mode: true, projector_mode_updated_at: Date.now() });
      await expect(page.getByText('הקשיבו להסבר של המורה על גבי המקרן')).toBeVisible();
      await expect(page.getByText('הדגמה על גבי המקרן', { exact: false })).toHaveCount(0);
      await check(page, 'waiting-projector', viewport.width, viewport.height);
      c.rtdb.set('system_control/projector_mode', { active: false, projector_mode: false, projector_mode_updated_at: Date.now() });
      await expect(page.getByText('הקשיבו להסבר של המורה על גבי המקרן')).toHaveCount(0);

      // Finished, then the teacher closes: the end screen stays, no close screen.
      await ws(page, 'api.setState({ flowStatus: "sessionDone", awaitingNext: false });');
      c.rtdb.set('active_class_session', { ...closedSession(), lastSessionNumber: 4 } as never);
      await expect(page.getByTestId('station-end-screen')).toBeVisible();
      await settle(page, 500);
      await expect(page.getByText('המורה סגרה את התחנה')).toHaveCount(0);
      await check(page, 'waiting-closed-finished', viewport.width, viewport.height);

      // Back to work in an open station (review RN2: the closed session's end
      // screen stayed under the lock in the shots), then the other device takes over.
      c.rtdb.set('active_class_session', liveSession(4) as never);
      await ws(page, 'api.setState({ flowStatus: "task", awaitingNext: false });');
      await page.locator('[data-testid="task-zone"]').waitFor({ state: 'visible' });
      // As the page's own listener drives it: another device claims the record.
      c.rtdb.set(`users/students/${STUDENT_UID}/active_device_id`, 'ux-audit-other-device');
      await expect(page.getByText('העבודה שלכם נשמרה. אם לא עברתם למכשיר אחר, קראו למורה.')).toBeVisible();
      await check(page, 'waiting-other-device', viewport.width, viewport.height);
    });
  });
}
