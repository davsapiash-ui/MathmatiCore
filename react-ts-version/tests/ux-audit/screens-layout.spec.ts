import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  closedSession,
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
 *     and the coaching card's drawer opens inside the task zone, leaving the
 *     board's 60% as it was (Module 12 §ב).
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
      const board = await box(page, 'section[aria-label="בית המספרים"]');
      const share = board.width / (board.width + task.width);
      expect(share, 'the representations zone is 60% of the row').toBeGreaterThan(0.58);
      expect(share).toBeLessThan(0.62);
      expect(board.x + board.width, 'the board is on the visual left').toBeLessThanOrEqual(task.x + 1);
      await check(page, 'workspace-station4', viewport.width, viewport.height);

      await ws(page, 'st.openSocraticCard("hesitation_45s");');
      const card = page.getByTestId('socratic-card');
      await card.locator('button:not([disabled])').first().waitFor({ state: 'visible', timeout: 12_000 });
      await settle(page, 500);
      const boardOpen = await box(page, 'section[aria-label="בית המספרים"]');
      const taskOpen = await box(page, '[data-testid="task-zone"]');
      const drawer = await box(page, '[data-testid="socratic-side-panel"]');
      const sheet = await box(page, '[data-testid="task-zone"] > div');
      expect(Math.abs(boardOpen.width - board.width), 'the board keeps its 60% with the drawer open').toBeLessThanOrEqual(2);
      expect(drawer.x, 'the drawer is inside the task zone').toBeGreaterThanOrEqual(taskOpen.x - 1);
      expect(drawer.x + drawer.width).toBeLessThanOrEqual(taskOpen.x + taskOpen.width + 1);
      expect(overlaps(drawer, boardOpen), 'the drawer covers nothing of the board').toBe(false);
      expect(overlaps(drawer, sheet), 'the drawer covers nothing of the task').toBe(false);
      await check(page, 'workspace-station4-socratic', viewport.width, viewport.height);
    });
  });
}
