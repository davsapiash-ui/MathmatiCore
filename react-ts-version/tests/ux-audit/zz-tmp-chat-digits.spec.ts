// TEMPORARY audit spec (not to be committed): chat panel + result-row digit order.
import { test } from '@playwright/test';
import * as fs from 'node:fs';
import { capture, gotoWorkspace, openContext, ws, type AuditContext, type Mode } from './harness';
import { selectedViewports } from './viewports';

const OUT = 'test-results/ux-audit/chat-digits.json';
const INIT = 'st.initSession(arg.meeting, arg.isASD, arg.idx); if (arg.skipOpening) api.getState().markOpeningScreenSeen();';

async function chatGeometry(c: AuditContext) {
  return c.page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) };
    };
    const panel = document.querySelector('[role="dialog"][aria-label="הודעות עם המורה"]');
    if (!panel) return { open: false } as const;
    const buttons = Array.from(panel.querySelectorAll('button'));
    const ready = buttons.filter((b) => /אפשר עזרה בתרגיל|לא הבנתי את ההוראה/.test(b.textContent || ''));
    const row = ready[0]?.parentElement as HTMLElement;
    const scrollArea = panel.querySelector('.overflow-y-auto') as HTMLElement;
    const pb = panel.getBoundingClientRect();
    return {
      open: true,
      viewport: { vw, vh },
      pageScroll: { sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      panel: r(panel),
      panelInViewport: pb.left >= 0 && pb.top >= 0 && pb.right <= vw && pb.bottom <= vh,
      readyRow: { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth },
      readyButtons: ready.map((b) => {
        const br = b.getBoundingClientRect();
        const rr = row.getBoundingClientRect();
        return { fullyInsideRow: br.left >= rr.left - 0.5 && br.right <= rr.right + 0.5, textOverflow: b.scrollWidth > b.clientWidth };
      }),
      scrollArea: { sh: scrollArea.scrollHeight, ch: scrollArea.clientHeight },
      empties: Array.from(panel.querySelectorAll('p')).map((p) => ({ sw: (p as HTMLElement).scrollWidth, cw: (p as HTMLElement).clientWidth })),
      chatToggle: r(document.querySelector('#chat-toggle-button')),
      bubbles: Array.from(panel.querySelectorAll('.leading-relaxed')).map((s) => s.textContent),
    };
  });
}

async function openChat(c: AuditContext) {
  const btn = c.page.locator('#chat-toggle-button');
  let via = 'event';
  if ((await btn.count()) > 0 && (await btn.isEnabled()) && (await btn.isVisible())) {
    await btn.click();
    via = 'topbar-click';
  } else {
    await c.page.evaluate(() => document.dispatchEvent(new CustomEvent('toggle-chat')));
  }
  await c.page.waitForSelector('[role="dialog"][aria-label="הודעות עם המורה"]', { timeout: 5000 });
  return via;
}

async function taskIndex(c: AuditContext, list: string, id: string): Promise<number> {
  return c.page.evaluate(
    async ({ list, id }) => {
      const mod = (await import('/src/data/sessionTasks.ts')) as Record<string, Array<{ id: string }>>;
      return mod[list].findIndex((t) => t.id === id);
    },
    { list, id }
  );
}

for (const viewport of selectedViewports()) {
  test(`chat+digits ${viewport.id}`, async ({ browser }) => {
    const out: Record<string, unknown>[] = [];
    {
      const c = await openContext(browser, viewport, { mode: 'default', path: 'green_path', approved: true });
      for (const meeting of [1, 3, 8]) {
        try {
          await gotoWorkspace(c, meeting);
          await ws(c.page, INIT, { meeting, isASD: false, idx: 0, skipOpening: meeting === 8 });
          await c.page.waitForTimeout(500);
          c.drainConsole();
          const via = await openChat(c);
          const res = await capture({ viewport, ctx: c, meeting, state: `chat-m${meeting}-empty`, screenshotAll: true });
          out.push({ vp: viewport.id, tier: viewport.tier, state: `chat-m${meeting}-empty`, via, findings: res.findings, shot: res.screenshot, geo: await chatGeometry(c) });
          await c.page.getByRole('button', { name: 'אפשר עזרה בתרגיל?' }).click();
          const res2 = await capture({ viewport, ctx: c, meeting, state: `chat-m${meeting}-sent`, screenshotAll: true });
          out.push({ vp: viewport.id, tier: viewport.tier, state: `chat-m${meeting}-sent`, findings: res2.findings, shot: res2.screenshot, geo: await chatGeometry(c) });
          c.rtdb.set('chat_messages', null as never);
        } catch (e) {
          out.push({ vp: viewport.id, state: `chat-m${meeting}`, error: String(e).slice(0, 300) });
        }
      }
      await c.context.close();
    }
    const cases: Array<{ meeting: number; path: 'green_path' | 'remediation_path'; mode: Mode; list: string; id: string; type: string }> = [
      { meeting: 1, path: 'green_path', mode: 'default', list: 'SESSION1_TASKS', id: 's1_r_words703', type: '703' },
      { meeting: 1, path: 'green_path', mode: 'default', list: 'SESSION1_TASKS', id: 's1_r_words482', type: '703' },
      { meeting: 1, path: 'green_path', mode: 'default', list: 'SESSION1_TASKS', id: 's1_target_347', type: '703' },
      { meeting: 7, path: 'remediation_path', mode: 'default', list: 'SESSION7_REMEDIATION_TASKS', id: 's7_r_t6', type: '703' },
      { meeting: 1, path: 'green_path', mode: 'enhanced', list: 'SESSION1_TASKS', id: 's1_target_347', type: '347' },
    ];
    for (const combo of [['green_path', 'default'], ['remediation_path', 'default'], ['green_path', 'enhanced']] as const) {
      const c = await openContext(browser, viewport, { mode: combo[1], path: combo[0], approved: true });
      let current: number | null = null;
      for (const k of cases.filter((x) => x.path === combo[0] && x.mode === combo[1])) {
        try {
          if (current !== k.meeting) {
            await gotoWorkspace(c, k.meeting);
            current = k.meeting;
          }
          const idx = await taskIndex(c, k.list, k.id);
          await ws(c.page, INIT, { meeting: k.meeting, isASD: false, idx, skipOpening: true });
          await c.page.waitForTimeout(600);
          const boxes = c.page.locator('[data-testid="result-row"] input');
          await boxes.first().click();
          const focusTrail: (string | null)[] = [await c.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)];
          for (const d of k.type.split('')) {
            await c.page.keyboard.type(d);
            await c.page.waitForTimeout(120);
            focusTrail.push(await c.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null));
          }
          const values = await boxes.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
          const locked = await boxes.evaluateAll((els) => els.map((e) => e.getAttribute('aria-disabled')));
          const storeDigits = await ws(c.page, 'return st.answerDigits;');
          c.drainConsole();
          const res = await capture({ viewport, ctx: c, meeting: k.meeting, state: `digits-${k.mode}-${k.id}`, screenshotAll: true });
          out.push({ vp: viewport.id, tier: viewport.tier, state: `digits-${k.mode}-${k.id}`, idx, focusTrail, values, locked, storeDigits, findings: res.findings, shot: res.screenshot });
        } catch (e) {
          out.push({ vp: viewport.id, state: `digits-${k.mode}-${k.id}`, error: String(e).slice(0, 300) });
        }
      }
      await c.context.close();
    }
    const prev = fs.existsSync(OUT) ? (JSON.parse(fs.readFileSync(OUT, 'utf8')) as unknown[]) : [];
    fs.writeFileSync(OUT, JSON.stringify([...prev, ...out], null, 1));
  });
}
