import { test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gotoWorkspace, measure, openContext, settle, ws } from './harness';
import type { Viewport } from './viewports';

/**
 * Before/after screenshots of the learner's task zone (design-task-zone).
 * Not part of the audit's gate, and it writes nothing unless asked: it runs
 * only when DTZ_OUT names the folder to write, e.g.
 *   DTZ_OUT=ux-screenshots/design-task-zone/after npx playwright test --config playwright.dtz.config.ts design-task-zone
 * (An audit run that picks up every spec in tests/ux-audit used to overwrite
 * the committed "before" shots with the current code.)
 */
const OUT = process.env.DTZ_OUT ?? '';
const ONLY = process.env.DTZ_ONLY ? new RegExp(process.env.DTZ_ONLY) : null;
const INIT = 'st.initSession(arg.meeting, false, arg.idx); api.getState().markOpeningScreenSeen();';
const SET = 'api.setState(arg);';
const VPS: Viewport[] = [
  { id: '1366x633', width: 1366, height: 633, tier: 'A', note: '1366x768 laptop, maximised Chrome' },
  { id: '1280x585', width: 1280, height: 585, tier: 'A', note: '1280x720 laptop' },
  { id: '1024x694', width: 1024, height: 694, tier: 'A', note: 'iPad landscape' },
].filter((v) => !process.env.DTZ_VPS || process.env.DTZ_VPS.split(',').includes(v.id));
type S = { id: string; meeting: number; idx: number; set?: Record<string, unknown> };
const steps: S[] = [];
for (let k = 0; k < 12; k++) steps.push({ id: `m1-${String(k + 1).padStart(2, '0')}`, meeting: 1, idx: k });
const C = (units: number, tens: number, hundreds: number) => ({ units, tens, hundreds, thousands: 0 });
steps.push({ id: 'm1-01-done', meeting: 1, idx: 0, set: { blocksAddedCount: 5, counts: C(3, 2, 0), hasInteracted: true } });
steps.push({ id: 'm1-02-done', meeting: 1, idx: 1, set: { hasUngrouped: true, counts: C(0, 13, 1), hasInteracted: true } });
steps.push({ id: 'm1-03-done', meeting: 1, idx: 2, set: { counts: C(5, 0, 3), hasInteracted: true } });
steps.push({ id: 'm1-04-half', meeting: 1, idx: 3, set: { undoCount: 1, hasInteracted: true } });
steps.push({ id: 'm1-04-done', meeting: 1, idx: 3, set: { undoCount: 1, hasClearedBoard: true, counts: C(0, 0, 0), hasInteracted: true } });
steps.push({ id: 'm1-05-answered', meeting: 1, idx: 4, set: { counts: C(3, 0, 7), answerDigits: { hundreds: '7', tens: '0', units: '3' }, hasInteracted: true } });
steps.push({ id: 'm1-09-half', meeting: 1, idx: 8, set: { counts: C(7, 4, 3), hasInteracted: true } });
steps.push({
  id: 'm1-09-done',
  meeting: 1,
  idx: 8,
  set: {
    counts: C(17, 3, 3),
    hasUngrouped: true,
    conversionsByColumn: { composed: {}, decomposed: { units: true }, times: { decomposed: { units: 1 } } },
    answerDigits: { hundreds: '3', tens: '4', units: '7' },
    hasInteracted: true,
  },
});
steps.push({ id: 'm1-10-answered', meeting: 1, idx: 9, set: { counts: C(7, 0, 8), answerDigits: { hundreds: '8', tens: '0', units: '7' }, hasInteracted: true } });
for (const n of [3, 4, 5, 6, 7]) steps.push({ id: `m${n}-01`, meeting: n, idx: 0 });
steps.push({ id: 'm3-01-answered', meeting: 3, idx: 0, set: { counts: { units: 0, tens: 0, hundreds: 4, thousands: 3 }, answerDigits: { thousands: '3', hundreds: '4', tens: '0', units: '0' }, hasInteracted: true } });
steps.push({ id: 'm3-02', meeting: 3, idx: 1 });
steps.push({ id: 'm3-07', meeting: 3, idx: 6 });
steps.push({ id: 'm4-01-built', meeting: 4, idx: 0, set: { counts: { units: 5, tens: 4, hundreds: 2, thousands: 1 }, hasInteracted: true } });
steps.push({ id: 'm4-01-written', meeting: 4, idx: 0, set: { counts: { units: 3, tens: 7, hundreds: 5, thousands: 1 }, answerDigits: { thousands: '1', hundreds: '5', tens: '7', units: '3' }, hasInteracted: true } });
steps.push({ id: 'm3-02-half', meeting: 3, idx: 1, set: { counts: { units: 0, tens: 0, hundreds: 4, thousands: 3 }, hasInteracted: true } });
steps.push({ id: 'm5-01-built', meeting: 5, idx: 0, set: { counts: { units: 2, tens: 3, hundreds: 4, thousands: 5 }, hasInteracted: true } });
steps.push({ id: 'm5-01-written', meeting: 5, idx: 0, set: { counts: { units: 4, tens: 1, hundreds: 3, thousands: 3 }, takeAwayTrack: { taskId: 's5_g_t1', held: true, started: true }, answerDigits: { thousands: '3', hundreds: '3', tens: '1', units: '4' }, hasInteracted: true } });
steps.push({ id: 'm4-07', meeting: 4, idx: 6 });
steps.push({ id: 'm6-07', meeting: 6, idx: 6 });
steps.push({ id: 'm7-04', meeting: 7, idx: 3 });
steps.push({ id: 'm7-06', meeting: 7, idx: 5 });
steps.push({ id: 'm8-01', meeting: 8, idx: 0 });
steps.sort((x, y) => x.meeting - y.meeting);

for (const vp of VPS) {
  test(`design-task-zone shots ${vp.id}`, async ({ browser }) => {
    test.skip(!OUT, 'design-task-zone shots run only with DTZ_OUT set (the folder to write)');
    test.setTimeout(30 * 60_000);
    const c = await openContext(browser, vp, { mode: 'default', path: 'green_path', approved: true });
    const dir = path.resolve(OUT, vp.id);
    fs.mkdirSync(dir, { recursive: true });
    let cur = -1;
    const lines: string[] = [];
    for (const s of steps) {
      if (ONLY && !ONLY.test(s.id)) continue;
      if (s.meeting !== cur) {
        await gotoWorkspace(c, s.meeting);
        cur = s.meeting;
      }
      await ws(c.page, INIT, { meeting: s.meeting, idx: s.idx });
      if (s.set) await ws(c.page, SET, s.set);
      await settle(c.page, 900);
      const m = await measure(c.page);
      const high = m.findings.filter((f) => f.severity === 'high');
      lines.push(`${vp.id} ${s.id}: ${high.length ? high.map((f) => `${f.type} ${f.px ?? ''} ${f.selector}`).join('; ') : 'ok'}`);
      await c.page.screenshot({ path: path.join(dir, `${s.id}.png`) });
    }
    fs.writeFileSync(path.join(dir, '_measure.txt'), lines.join('\n') + '\n');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    await c.context.close();
  });
}
