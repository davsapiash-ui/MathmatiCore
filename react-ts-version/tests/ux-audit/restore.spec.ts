import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { FakeRtdb, gotoWorkspace, liveSession, openContext, STUDENT_UID, workspaceReady, ws, type AuditContext } from './harness';
import { VIEWPORTS } from './viewports';

/**
 * What a reload, or another tablet, gives back (Module 17: the work is never
 * lost). These checks were impossible while the harness wiped this device's
 * copy on every page load and pre-filled the store with a record that had no
 * saved workspace: a restore then passed or failed for the harness's reasons,
 * not the app's.
 *
 *   UX_AUDIT_PORT=5202 npx playwright test --config playwright.ux-audit.config.ts restore
 */

const VP = VIEWPORTS.find((v) => v.id === 'laptop-1366')!;
/** The learner's record keys the app writes the workspace under (FirebaseSyncService.learnerRecordKeys). */
const RECORD_KEYS = [STUDENT_UID, `user${STUDENT_UID.replace(/\D/g, '')}`];
/** Work in progress on station 3's first exercise (build 3,400): not the answer yet. */
const BUILT = { thousands: 2, hundreds: 3 } as const;

type Counts = Record<'units' | 'tens' | 'hundreds' | 'thousands', number>;

/** Drop blocks from the palette into their own columns — the board's own action. */
async function build(page: Page, blocks: Partial<Counts>): Promise<void> {
  for (const [place, n] of Object.entries(blocks)) {
    for (let i = 0; i < (n ?? 0); i++) {
      await ws(page, 'st.applyDrop({ source: "palette", sourcePlace: arg, target: { kind: "column", place: arg } });', place);
    }
  }
}

const storeCounts = (page: Page) => ws<Counts>(page, 'return st.counts;');

/** The blocks the child sees in each column. */
async function shownCounts(page: Page): Promise<Partial<Counts>> {
  return page.evaluate(() => {
    const out: Record<string, number> = {};
    for (const place of ['units', 'tens', 'hundreds', 'thousands']) {
      const col = document.querySelector(`[data-testid="column-${place}-blocks"]`);
      out[place] = col ? col.children.length : -1;
    }
    return out;
  });
}

/** This device's copy of meeting `meeting` (localStorage), or null. */
async function deviceCopy(page: Page, meeting: number): Promise<{ counts?: Counts; standardTaskIdx?: number; qflow?: { taskIdx?: number } } | null> {
  return page.evaluate((m) => {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('mathmaticore_session_cache_') || !k.endsWith(`_m${m}`)) continue;
      try {
        const copy = JSON.parse(localStorage.getItem(k) || 'null');
        if (copy && copy.sessionNumber === m) return copy;
      } catch {
        /* next */
      }
    }
    return null;
  }, meeting);
}

/** Every copy of the workspace the fake database holds for this learner. */
function databaseCopies(c: AuditContext, meeting: number): Array<{ counts?: Counts; qflow?: { taskIdx?: number } }> {
  const out: Array<{ counts?: Counts; qflow?: { taskIdx?: number } }> = [];
  for (const key of RECORD_KEYS) {
    for (const p of [`users/students/${key}/workspaceState`, `users/students/${key}/workspaceByMeeting/m${meeting}`]) {
      const v = c.rtdb.get(p) as { sessionNumber?: number; counts?: Counts } | null;
      if (v && v.sessionNumber === meeting) out.push(v);
    }
  }
  return out;
}

const hasBuilt = (counts: Partial<Counts> | undefined) =>
  !!counts && counts.thousands === BUILT.thousands && counts.hundreds === BUILT.hundreds;

async function enterMeeting3(c: AuditContext): Promise<void> {
  await gotoWorkspace(c, 3);
  await expect(c.page.getByText(/משימה 1 מתוך/)).toBeVisible({ timeout: 20_000 });
}

async function expectBoardRestored(page: Page): Promise<void> {
  await workspaceReady(page, 45_000);
  await expect(page.getByText(/משימה 1 מתוך/)).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => hasBuilt(await storeCounts(page)), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => shownCounts(page), { timeout: 10_000 }).toEqual({ units: 0, tens: 0, hundreds: BUILT.hundreds, thousands: BUILT.thousands });
}

test.describe('restore', () => {
  test.setTimeout(5 * 60_000);

  // The real server sends a listen's data before its "ok". With the "ok"
  // first, the SDK raised a first value event built from the client's own
  // writes only — a learner record with no saved workspace and no support
  // profile — so every first-snapshot decision was tested on a record
  // production never shows.
  test('the fake database answers a listen with its data first, then "ok"', async () => {
    const learnerPath = `users/students/${STUDENT_UID}`;
    const rtdb = new FakeRtdb({ [learnerPath]: { student_anonymous_id: 12 } });
    const received: Array<{ t?: string; d?: { r?: number; a?: string; b?: { p?: string; s?: string } } }> = [];
    let deliver: (message: string) => void = () => undefined;
    const socket = {
      url: () => 'wss://ux-audit.firebaseio.com/.ws',
      send: (frame: string) => received.push(JSON.parse(frame)),
      onMessage: (handler: (message: string) => void) => {
        deliver = handler;
      },
      onClose: () => undefined,
    };
    await rtdb.attach({
      routeWebSocket: async (_url: RegExp, handler: (ws: typeof socket) => void) => handler(socket),
    } as unknown as BrowserContext);
    deliver(JSON.stringify({ t: 'd', d: { r: 7, a: 'q', b: { p: `/${learnerPath}`, h: '' } } }));
    const order = received
      .filter((f) => f.t === 'd')
      .map((f) => (f.d?.a === 'd' && f.d.b?.p === learnerPath ? 'data' : f.d?.r === 7 && f.d.b?.s === 'ok' ? 'ok' : 'other'));
    expect(order).toEqual(['data', 'ok']);
  });

  test('meeting 3: a reload mid-exercise restores the board from this device’s copy', async ({ browser }) => {
    const c = await openContext(browser, VP, { mode: 'default', path: 'green_path', approved: true, classSession: liveSession(3) });
    try {
      await enterMeeting3(c);
      // The connection drops: from here on the board's writes never reach the
      // database, so this device's copy is the only copy of the new work.
      c.rtdb.hold(RECORD_KEYS.flatMap((k) => [`users/students/${k}/workspaceState`, `users/students/${k}/workspaceByMeeting`]));
      await build(c.page, BUILT);
      await expect.poll(async () => hasBuilt(await storeCounts(c.page))).toBe(true);
      await expect.poll(async () => hasBuilt((await deviceCopy(c.page, 3))?.counts), { timeout: 10_000 }).toBe(true);
      expect(databaseCopies(c, 3).some((copy) => hasBuilt(copy.counts)), 'the database must not hold the new work').toBe(false);

      await c.page.reload({ waitUntil: 'domcontentloaded' });
      await expectBoardRestored(c.page);
      expect(databaseCopies(c, 3).some((copy) => hasBuilt(copy.counts))).toBe(false);
    } finally {
      c.rtdb.hold([]);
      await c.context.close();
    }
  });

  test('meeting 3: another tablet (database copy only) restores the board', async ({ browser }) => {
    const a = await openContext(browser, VP, { mode: 'default', path: 'green_path', approved: true, classSession: liveSession(3) });
    let savedAt = 0;
    try {
      await enterMeeting3(a);
      await build(a.page, BUILT);
      // Tablet A's work has reached the learner's record: the stamped copy
      // (savedAt) with the whole board, under the key every device reads.
      // The record is written at most once a second (Module 18), and the
      // board's own fields go out before the stamped copy does — closing A
      // on the first sight of the blocks left a record with no stamp, which
      // is a tablet switched off mid-write, not the case checked here.
      const stamped = () => {
        const copy = a.rtdb.get(`users/students/${STUDENT_UID}/workspaceState`) as { counts?: Counts; savedAt?: number } | null;
        return copy && hasBuilt(copy.counts) && typeof copy.savedAt === 'number' ? copy.savedAt : 0;
      };
      await expect.poll(stamped, { timeout: 15_000 }).toBeGreaterThan(0);
      savedAt = stamped();
    } finally {
      await a.context.close();
    }

    // A brand-new context = another tablet: no device copy at all, and the
    // store is not pre-filled — the page must find the work in the database.
    const b = await openContext(browser, VP, {
      mode: 'default',
      path: 'green_path',
      approved: true,
      classSession: liveSession(3),
      rtdb: a.rtdb,
      seedStore: false,
    });
    try {
      await b.page.goto('/workspace?meeting=3', { waitUntil: 'domcontentloaded' });
      await expectBoardRestored(b.page);
      const restoredFrom = await ws<number | null>(b.page, 'return st.workspaceInitializedFor ? st.workspaceInitializedFor.restoredSavedAt : null;');
      expect(restoredFrom, 'restored from the stamped copy on the record, not started afresh').toBeGreaterThanOrEqual(savedAt);
    } finally {
      await b.context.close();
    }
  });

  test('meeting 2: a reload after task 1 returns to task 2', async ({ browser }) => {
    const c = await openContext(browser, VP, {
      mode: 'default',
      path: 'green_path',
      approved: false,
      meeting2Done: false,
      classSession: liveSession(2),
    });
    try {
      await gotoWorkspace(c, 2);
      await c.page.getByRole('button', { name: 'מתחילים' }).click();
      await expect(c.page.getByText(/משימה 1 מתוך/)).toBeVisible({ timeout: 15_000 });
      await c.page.locator('[data-testid=pv-result-row] input').first().click();
      await c.page.keyboard.type('605');
      await c.page.getByTestId('proceed-button').click();
      await expect(c.page.getByText(/משימה 2 מתוך/)).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => (await deviceCopy(c.page, 2))?.qflow?.taskIdx, { timeout: 10_000 }).toBe(1);

      await c.page.reload({ waitUntil: 'domcontentloaded' });
      await workspaceReady(c.page, 45_000);
      await expect(c.page.getByText(/משימה 2 מתוך/)).toBeVisible({ timeout: 20_000 });
      const after = await ws<{ idx: number; results: string[]; opening: boolean }>(
        c.page,
        'return { idx: st.qflow.taskIdx, results: Object.keys(st.qflow.results || {}), opening: st.openingScreenSeen };'
      );
      expect(after.idx).toBe(1);
      expect(after.results.length, 'task 1’s answer is kept').toBe(1);
      expect(after.opening).toBe(true);
      await expect(c.page.getByRole('button', { name: 'מתחילים' })).toHaveCount(0);
    } finally {
      await c.context.close();
    }
  });
});
