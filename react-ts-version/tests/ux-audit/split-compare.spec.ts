import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gotoWorkspace, measure, openContext, settle, ws } from './harness';
import type { Viewport } from './viewports';

/**
 * TRIAL ONLY (branch claude/split-compare): screenshots and metrics of five
 * dense states, for the owner's comparison of the 60/40 split with 55/45.
 * Writes nothing unless SPLIT_OUT names the folder. The split itself comes
 * from the dev server: VITE_WORKSPACE_SPLIT=55-45 (workspaceZones.ts).
 *
 *   SPLIT_OUT=/tmp/x SPLIT_TAG=60-40 npx playwright test --config playwright.ux-audit.config.ts split-compare
 *   VITE_WORKSPACE_SPLIT=55-45 SPLIT_OUT=/tmp/x SPLIT_TAG=55-45 npx playwright test ...
 */
const OUT = process.env.SPLIT_OUT ?? '';
const TAG = process.env.SPLIT_TAG ?? 'split';
const INIT = 'st.initSession(arg.meeting, false, arg.idx); api.getState().markOpeningScreenSeen();';
const VPS: Viewport[] = [
  { id: '1366x633', width: 1366, height: 633, tier: 'A', note: '' },
  { id: '1280x585', width: 1280, height: 585, tier: 'A', note: '' },
  { id: '1024x694', width: 1024, height: 694, tier: 'A', note: '' },
];

async function metrics(page: Page) {
  return page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
    const board = r('[data-testid="representations-zone"]');
    const task = r('[data-testid="task-zone"]');
    const card = document.querySelector('#tour-task-card') as HTMLElement | null;
    let cell = 0;
    if (card) {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--ws-cell);height:1px';
      card.appendChild(probe);
      cell = probe.getBoundingClientRect().width;
      probe.remove();
    }
    // Visual text lines in the task column (distinct line tops per text node).
    const col = document.querySelector('[data-testid="task-column"]');
    let lines = 0;
    const paras: number[] = [];
    if (col) {
      const walker = document.createTreeWalker(col, NodeFilter.SHOW_TEXT);
      const byParent = new Map<Element, Set<number>>();
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if (!n.textContent || !n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const tops = new Set<number>();
        for (const rect of Array.from(range.getClientRects())) if (rect.width > 1) tops.add(Math.round(rect.top));
        const p = (n.parentElement?.closest('p,li,h1,h2,h3,div') ?? n.parentElement) as Element;
        const set = byParent.get(p) ?? new Set<number>();
        tops.forEach((t) => set.add(t));
        byParent.set(p, set);
      }
      byParent.forEach((s) => {
        lines += s.size;
        paras.push(s.size);
      });
    }
    const columns = ['thousands', 'hundreds', 'tens', 'units'].map((p) => {
      const blocks = document.querySelector(`[data-testid="column-${p}-blocks"]`) as HTMLElement | null;
      const colEl = document.getElementById(`column-${p}-dropzone`);
      const first = blocks?.firstElementChild?.getBoundingClientRect();
      return {
        place: p,
        colW: colEl ? Math.round(colEl.getBoundingClientRect().width) : null,
        colH: colEl ? Math.round(colEl.getBoundingClientRect().height) : null,
        n: blocks ? blocks.children.length : 0,
        scale: blocks?.dataset.scale ?? null,
        blockW: first ? Math.round(first.width) : null,
        blockH: first ? Math.round(first.height) : null,
      };
    });
    return {
      boardW: board ? Math.round(board.width) : null,
      taskW: task ? Math.round(task.width) : null,
      share: board && task ? +(board.width / (board.width + task.width)).toFixed(3) : null,
      cell: +cell.toFixed(1),
      cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
      lines,
      paras,
      columns,
    };
  });
}

type State = { id: string; run: (page: Page, c: Parameters<typeof gotoWorkspace>[0]) => Promise<void> };
const states: State[] = [
  {
    // Station 1, task 11 (s1_r_sub61: 61 − 24), its six-sentence guide, 61 built.
    id: 's1-t11-sub61',
    run: async (page, c) => {
      await gotoWorkspace(c, 1);
      await ws(page, INIT, { meeting: 1, idx: 10 });
      await ws(page, 'api.setState(arg);', { counts: { units: 1, tens: 6, hundreds: 0, thousands: 0 }, hasInteracted: true });
    },
  },
  {
    id: 's4-t1-built',
    run: async (page, c) => {
      await gotoWorkspace(c, 4);
      await ws(page, INIT, { meeting: 4, idx: 0 });
      await ws(page, 'api.setState(arg);', { counts: { units: 5, tens: 4, hundreds: 2, thousands: 1 }, hasInteracted: true });
    },
  },
  {
    // As screens-layout.spec.ts: the coaching drawer after a wrong choice.
    id: 's4-drawer-wrong',
    run: async (page, c) => {
      await gotoWorkspace(c, 4);
      await page.getByRole('button', { name: 'מתחילים' }).click();
      await page.locator('[data-testid="task-zone"]').waitFor({ state: 'visible' });
      await settle(page, 400);
      await ws(page, 'st.openSocraticCard("hesitation_45s");');
      const card = page.getByTestId('socratic-card');
      await card.locator('button:not([disabled])').first().waitFor({ state: 'visible', timeout: 12_000 });
      const wrong = await ws<string>(page, 'const h = st.aiSocraticHint; return (h && h.choices.find((c) => !c.isCorrect)?.textHe) || "";');
      await card.getByRole('button', { name: wrong }).click();
      await page.getByTestId('socratic-lock-indicator').waitFor({ state: 'visible' });
    },
  },
  {
    // Station 7, s7_g_t5 (build 3,400, add a thousand, take 6 hundreds away),
    // with blocks in all four columns: 4 thousands, 8 hundreds, 6 tens, 9 units.
    id: 's7-t5-thousands',
    run: async (page, c) => {
      await gotoWorkspace(c, 7);
      await ws(page, INIT, { meeting: 7, idx: 4 });
      await ws(page, 'api.setState(arg);', { counts: { units: 9, tens: 6, hundreds: 8, thousands: 4 }, hasInteracted: true });
    },
  },
  {
    // Station 3, s3_g_t4: build 5,230, break a thousand and a hundred.
    id: 's3-t4-break',
    run: async (page, c) => {
      await gotoWorkspace(c, 3);
      await ws(page, INIT, { meeting: 3, idx: 3 });
      await ws(page, 'api.setState(arg);', { counts: { units: 0, tens: 3, hundreds: 2, thousands: 5 }, hasInteracted: true });
    },
  },
];

for (const vp of VPS) {
  test(`split-compare ${TAG} ${vp.id}`, async ({ browser }) => {
    test.skip(!OUT, 'runs only with SPLIT_OUT set');
    test.setTimeout(15 * 60_000);
    const c = await openContext(browser, vp, { mode: 'default', path: 'green_path', approved: true });
    fs.mkdirSync(OUT, { recursive: true });
    const rows: unknown[] = [];
    for (const s of states) {
      await s.run(c.page, c);
      await settle(c.page, 900);
      const m = await measure(c.page);
      const high = m.findings.filter((f) => f.severity === 'high').map((f) => `${f.type} ${f.px ?? ''} ${f.selector}`);
      const x = await metrics(c.page);
      rows.push({ state: s.id, size: vp.id, tag: TAG, high, ...x });
      await c.page.screenshot({ path: path.join(OUT, `${s.id}_${vp.id}_${TAG}.png`) });
    }
    fs.writeFileSync(path.join(OUT, `_metrics_${vp.id}_${TAG}.json`), JSON.stringify(rows, null, 2));
    await c.context.close();
  });
}
