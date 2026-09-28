// DEV-ONLY. Walks every exercise of the given meetings at the given screen
// sizes, screenshots each, and measures on the page itself whether every
// toolbar button and every answer box is fully inside the screen.
// Usage: node dev-harness/shoot.mjs <outDir> <WxH,WxH> <meeting[:path],...> [maxTasks]
import { mkdirSync, writeFileSync } from 'node:fs';
import { seed } from './seed.mjs';
import { openAs, APP } from './browser.mjs';

const [outDir = 'dev-harness/shots/run', sizesArg = '1366x768,1024x768', meetingsArg = '1,3,4,5,6,7', maxArg = '99'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sizes = sizesArg.split(',').map((s) => s.split('x').map(Number));
const meetings = meetingsArg.split(',').map((x) => { const [m, p] = x.split(':'); return { m: Number(m), p: p || 'green_path' }; });
const results = [];

export async function measure(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    const nav = document.querySelector('nav');
    const inView = (r) => r.width > 0 && r.left >= -0.5 && r.right <= W + 0.5 && r.top >= -0.5 && r.bottom <= H + 0.5;
    // A button counts as visible only if no ancestor clips it either.
    const clipped = (el) => {
      const r = el.getBoundingClientRect();
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowX + cs.overflowY)) {
          const ar = a.getBoundingClientRect();
          if (r.left < ar.left - 0.5 || r.right > ar.right + 0.5 || r.top < ar.top - 0.5 || r.bottom > ar.bottom + 0.5) return true;
        }
      }
      return false;
    };
    const buttons = nav ? [...nav.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => {
      const r = b.getBoundingClientRect();
      return { label: (b.getAttribute('aria-label') || b.textContent || '').trim(), ok: inView(r) && !clipped(b), left: Math.round(r.left), right: Math.round(r.right) };
    }) : [];
    const main = document.querySelector('main') || document.body;
    const inputs = [...main.querySelectorAll('input')].filter((i) => i.offsetParent !== null && !nav?.contains(i)).map((i) => {
      const r = i.getBoundingClientRect();
      return { label: i.getAttribute('aria-label') || '', ok: inView(r) && !clipped(i), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
    const title = document.querySelector('h1,h2')?.textContent?.trim() || '';
    return { W, H, buttons, inputs, title, navScrollW: nav ? nav.scrollWidth : 0 };
  });
}

async function openMeeting(page) {
  await page.goto(APP + '/hub');
  await page.waitForURL(/workspace/, { timeout: 30000 });
  // The workspace waits for the learner's record from the emulator. Meetings
  // 2 and 8 open on their opening screen first (no toolbar there).
  await page.waitForFunction(() => document.querySelector('nav button') || window.__ws?.getState().openingScreenSeen === false && document.body.innerText.includes('מתחילים'), null, { timeout: 45000 });
  await page.evaluate(() => window.__ws.setState({ openingScreenSeen: true }));
  await page.waitForSelector('nav button', { timeout: 20000 });
  await page.waitForTimeout(800);
}

for (const [w, h] of sizes) {
  for (const { m, p } of meetings) {
    // A cold or busy dev server can be slow: up to three tries, then report and go on.
    let browser, page, opened = false;
    for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
      await seed(m, p);
      ({ browser, page } = await openAs(undefined, { width: w, height: h }));
      try {
        await openMeeting(page);
        opened = true;
      } catch {
        await browser.close();
      }
    }
    if (!opened) {
      console.log(`m${m}${p === 'remediation_path' ? 'r' : ''} ${w}x${h}: COULD NOT OPEN (3 tries)`);
      results.push({ meeting: m, path: p, size: `${w}x${h}`, error: 'could not open' });
      continue;
    }
    const count = await page.evaluate((m) => {
      const s = window.__ws.getState();
      return m === 2 ? 7 : (s.dynamicTasks ?? null) ? s.dynamicTasks.length : 7;
    }, m);
    const n = Math.min(m === 1 ? 10 : count, Number(maxArg), m === 1 ? 10 : 7);
    for (let i = 0; i < n; i++) {
      await page.evaluate(([m, i]) => {
        const ws = window.__ws;
        if (m === 2) { ws.getState().initSession(2, false, 0); ws.setState((s) => ({ openingScreenSeen: true, qflow: { ...s.qflow, taskIdx: i } })); }
        else { ws.getState().initSession(m, false, i); ws.setState({ openingScreenSeen: true }); }
      }, [m, i]);
      await page.waitForSelector('nav button', { timeout: 20000 });
      await page.waitForTimeout(1200);
      const r = await measure(page);
      const name = `m${m}${p === 'remediation_path' ? 'r' : ''}-t${i + 1}-${w}x${h}.png`;
      await page.screenshot({ path: `${outDir}/${name}` });
      const badBtn = r.buttons.filter((b) => !b.ok).map((b) => b.label);
      const badIn = r.inputs.filter((x) => !x.ok).map((x) => `${x.label}@${x.top}-${x.bottom}`);
      results.push({ name, meeting: m, path: p, task: i + 1, size: `${w}x${h}`, badButtons: badBtn, badInputs: badIn, inputs: r.inputs.length });
      console.log(name, badBtn.length ? 'CUT BUTTONS: ' + badBtn.join(' | ') : 'buttons ok', '|', r.inputs.length, 'inputs', badIn.length ? 'CUT: ' + badIn.join(', ') : 'ok');
    }
    await browser.close();
  }
}
writeFileSync(`${outDir}/measure.json`, JSON.stringify(results, null, 2));
