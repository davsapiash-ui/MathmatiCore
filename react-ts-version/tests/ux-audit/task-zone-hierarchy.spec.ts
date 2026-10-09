import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gotoWorkspace, measure, openContext, settle, ws } from './harness';
import type { Viewport } from './viewports';

/**
 * The task zone (the calm card, owner's choice 9.10.2026) and the 55 : 45 split,
 * shot in six states at the three PRD sizes, with the 0-scroll metrics (PRD
 * Module 7 §א rule 7). Writes nothing unless HIER_OUT names the folder:
 *
 *   HIER_OUT=/tmp/x npx playwright test --config playwright.ux-audit.config.ts task-zone-hierarchy
 *   HIER_SIZES=1280x585 HIER_STATES=s1-t11-sub61,... narrow the run; HIER_TAG names the shots.
 */
const OUT = process.env.HIER_OUT ?? '';
const TAG = process.env.HIER_TAG ?? 'B';
const ONLY_SIZES = (process.env.HIER_SIZES ?? '').split(',').filter(Boolean);
const ONLY_STATES = (process.env.HIER_STATES ?? '').split(',').filter(Boolean);
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
    // The place names under the vertical sheet: the narrowest gap between two neighbours' text (negative = overlap).
    let labelGap: number | null = null;
    document.querySelectorAll('[data-testid="sheet-place-labels"]').forEach((row) => {
      const boxes = Array.from(row.querySelectorAll('[data-place-label]')).map((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect();
      }).sort((a, b) => a.left - b.left);
      for (let i = 1; i < boxes.length; i++) {
        const g = +(boxes[i].left - boxes[i - 1].right).toFixed(1);
        labelGap = labelGap === null ? g : Math.min(labelGap, g);
      }
    });
    return {
      labelGap,
      boardW: board ? Math.round(board.width) : null,
      taskW: task ? Math.round(task.width) : null,
      share: board && task ? +(board.width / (board.width + task.width)).toFixed(3) : null,
      cell: +cell.toFixed(1),
      cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
      emptyBandPct: (() => {
        const colEl = document.querySelector('[data-testid="task-column"]');
        if (!card || !colEl) return null;
        let bottom = 0;
        colEl.querySelectorAll('*').forEach((e) => { const rr = (e as HTMLElement).getBoundingClientRect(); if (rr.height > 0 && rr.width > 0 && getComputedStyle(e).visibility !== 'hidden') bottom = Math.max(bottom, rr.bottom); });
        const cr = card.getBoundingClientRect();
        return +(((cr.bottom - bottom) / cr.height) * 100).toFixed(1);
      })(),
      lines,
      paras,
      columns,
    };
  });
}

type State = { id: string; run: (page: Page, c: Parameters<typeof gotoWorkspace>[0]) => Promise<void> };
const states: State[] = [
  {
    // Station 1, intro step 2 (פורטים לבנה): the board opens on 230, no work area.
    id: 's1-intro2',
    run: async (page, c) => {
      await gotoWorkspace(c, 1);
      await ws(page, INIT, { meeting: 1, idx: 1 });
    },
  },
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

for (const vp of VPS.filter((v) => !ONLY_SIZES.length || ONLY_SIZES.includes(v.id))) {
  test(`task-zone-hierarchy ${TAG} ${vp.id}`, async ({ browser }) => {
    test.skip(!OUT, 'runs only with HIER_OUT set');
    test.setTimeout(15 * 60_000);
    const c = await openContext(browser, vp, { mode: 'default', path: 'green_path', approved: true });
    fs.mkdirSync(OUT, { recursive: true });
    const rows: unknown[] = [];
    for (const s of states.filter((x) => !ONLY_STATES.length || ONLY_STATES.includes(x.id))) {
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
