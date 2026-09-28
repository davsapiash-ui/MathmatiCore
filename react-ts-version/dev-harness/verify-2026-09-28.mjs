// DEV-ONLY. The on-screen checks for the 28.9.2026 report rows fixed on
// claude/meeting1-station1-layout. Each scenario acts through the page (typing,
// clicking) or through the store action a click calls (dropping a block),
// screenshots, and measures what the row is about. Prints PASS/FAIL lines.
// Usage: CHROMIUM=… node dev-harness/verify-2026-09-28.mjs <outDir> [WxH,…]
import { mkdirSync } from 'node:fs';
import { seed, put } from './seed.mjs';
import { openAs, APP } from './browser.mjs';

const [out = 'dev-harness/shots/verify', sizesArg = '1366x768,1024x768'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const sizes = sizesArg.split(',').map((s) => s.split('x').map(Number));
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

async function open(meeting, w, h, opts = {}) {
  // a cold or busy dev server can be slow: up to three tries
  for (let attempt = 1; ; attempt++) {
    try {
      return await openOnce(meeting, w, h, opts);
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
}
async function openOnce(meeting, w, h, { path = 'green_path', record = {} } = {}) {
  await seed(meeting, path);
  if (Object.keys(record).length) {
    for (const [k, v] of Object.entries(record)) await put(`users/students/student_user12/${k}`, v);
  }
  const s = await openAs(undefined, { width: w, height: h });
  s.page.setDefaultTimeout(20000);
  await s.page.goto(APP + '/hub');
  await s.page.waitForURL(/workspace/, { timeout: 30000 });
  await s.page.waitForFunction(() => document.querySelector('nav button') || document.body.innerText.includes('מתחילים'), null, { timeout: 45000 }).catch(async (e) => {
    await s.browser.close();
    throw e;
  });
  await s.page.evaluate(() => window.__ws.setState({ openingScreenSeen: true }));
  return s;
}
const goTo = (page, meeting, id) =>
  page.evaluate(([m, id]) => {
    const ws = window.__ws;
    ws.getState().initSession(m, false, 0);
    const i = window.__tasks().findIndex((t) => t.id === id);
    ws.getState().initSession(m, false, i);
    ws.setState({ openingScreenSeen: true });
    return i;
  }, [meeting, id]);
const drop = (page, place, n) =>
  page.evaluate(([place, n]) => { for (let i = 0; i < n; i++) window.__ws.getState().applyDrop({ source: 'palette', sourcePlace: place, target: { kind: 'column', place } }); }, [place, n]);
const rect = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }, sel);
const overlap = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const typeRow = async (page, digits, vertical = false) => {
  // result row: hundreds, tens, units boxes by their names
  const names = { hundreds: 'המאות', tens: 'העשרות', units: 'היחידות' };
  for (const [place, d] of Object.entries(digits)) {
    await page.fill(vertical ? `input[aria-label="ספרת ה${names[place].slice(1)} בתשובה"]` : `input[aria-label="ספרת ${names[place]} בשורת התוצאה"]`, d);
  }
};
const text = (page) => page.evaluate(() => document.body.innerText);

for (const [w, h] of sizes) {
  const tag = `${w}x${h}`;

  /* A1 — station 1 board button, and its note. */
  {
    const { browser, page } = await open(1, w, h);
    const b = page.locator('[data-testid="board-toggle"]');
    check(`${tag} A1 station-1 button says "בית המספרים פתוח"`, (await b.getAttribute('aria-label')) === 'בית המספרים פתוח' && (await b.innerText()).trim() === 'בית המספרים פתוח');
    check(`${tag} A1 open eye`, (await b.locator('svg.lucide-eye').count()) === 1);
    await b.hover();
    check(`${tag} A1 hover sentence unchanged`, (await b.getAttribute('title')) === 'בתחנה הזו בית המספרים נשאר פתוח, כי בעזרתו לומדים להכיר את הלבנים.');
    await b.click({ force: true }); // aria-disabled: the browser still delivers the click
    await page.waitForTimeout(400);
    const note = await page.locator('[data-testid="board-stays-open-note"]').innerText().catch(() => '');
    check(`${tag} A1 press shows the note, board still open`, note.includes('בתחנה הזו בית המספרים נשאר פתוח') && (await page.evaluate(() => window.__ws.getState().boardOpen)));
    await page.screenshot({ path: `${out}/A1-station1-board-button-${tag}.png` });
    await browser.close();
  }

  /* A2 + A5 — the target task 347. */
  {
    const { browser, page } = await open(1, w, h);
    const idx = await goTo(page, 1, 's1_target_347');
    await page.waitForTimeout(600);
    await drop(page, 'hundreds', 3); await drop(page, 'tens', 4); await drop(page, 'units', 7);
    await typeRow(page, { hundreds: '3', tens: '4', units: '7' });
    await page.waitForTimeout(500);
    // the tick marks themselves, whatever classes size them
    const marks1 = await page.evaluate(() => [...document.querySelectorAll('[data-testid="session1-checklist"] span')].map((e) => e.textContent.trim()).filter((t) => t === '✅' || t === '⏳'));
    check(`${tag} A2 347 typed before decomposing: third line not ticked`, JSON.stringify(marks1) === JSON.stringify(['✅', '⏳', '⏳']), JSON.stringify(marks1) + ` (task idx ${idx})`);
    await page.screenshot({ path: `${out}/A2-347-typed-before-decomposition-${tag}.png` });
    await page.evaluate(() => window.__ws.getState().splitBlockClick('tens'));
    await page.waitForTimeout(700);
    const marks2 = await page.evaluate(() => [...document.querySelectorAll('[data-testid="session1-checklist"] span')].map((e) => e.textContent.trim()).filter((t) => t === '✅' || t === '⏳'));
    check(`${tag} A2 after decomposing: all three ticked`, JSON.stringify(marks2) === JSON.stringify(['✅', '✅', '✅']), JSON.stringify(marks2));
    const sentence = (await page.locator('[data-testid="proceed-sentence"]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    check(`${tag} A5 proceed sentence names the button`, sentence === 'לחצו על הכפתור ממשיכים ← בסרגל העליון כדי לעבור לשלב הבא!', sentence);
    const proceedEnabled = await page.locator('[data-testid="proceed-button"]').isEnabled();
    check(`${tag} A2 "ממשיכים" lights up`, proceedEnabled);
    await page.locator('[data-testid="session1-done"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/A2-A5-347-done-${tag}.png` });
    const row = await rect(page, '[data-testid="result-row"]');
    check(`${tag} 1.11 result row in view`, row && row.b <= h && row.t >= 0, JSON.stringify(row));
    await browser.close();
  }

  /* 1.15 — feedback with the coaching card open, 713 + 94. */
  {
    const { browser, page } = await open(1, w, h);
    await goTo(page, 1, 's1_t8');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__ws.getState().openSocraticCard('consecutive_errors_4'));
    await page.waitForTimeout(1200);
    await drop(page, 'hundreds', 7); await drop(page, 'tens', 1); await drop(page, 'units', 3);
    await drop(page, 'tens', 9); await drop(page, 'units', 4);
    await typeRow(page, { hundreds: '8', tens: '0', units: '7' }, true);
    await page.locator('[data-testid="proceed-button"]').click();
    await page.waitForTimeout(700);
    const fb = await rect(page, '[data-testid="feedback-toast"]');
    const card = await rect(page, '[data-testid="socratic-side-panel"]');
    const board = await rect(page, 'section[aria-label], [data-testid="place-value-board"]');
    const cols = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="טור "]')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.top + 50 }; }));
    const fbText = await page.locator('[data-testid="feedback-toast"]').innerText().catch(() => '');
    check(`${tag} 1.15 feedback shown`, Boolean(fb) && fbText.length > 0, fbText.replace(/\s+/g, ' '));
    check(`${tag} 1.15 feedback inside the screen`, fb && fb.b <= h && fb.t >= 0, JSON.stringify(fb));
    check(`${tag} 1.15 feedback covers no column header`, cols.every((c) => !overlap(fb, c)));
    const instrTop = () => page.evaluate(() => { const p = [...document.querySelectorAll('[data-testid="task-column"] p')].find((e) => e.textContent.startsWith('בנו בבית המספרים 713')); const r = document.createRange(); r.selectNodeContents(p); return r.getClientRects()[0].top; });
    check(`${tag} 1.15 feedback does not cover the instruction's text`, fb && fb.b <= (await instrTop()) + 1, JSON.stringify({ fbBottom: fb?.b, textTop: await instrTop() }));
    await page.screenshot({ path: `${out}/1.15-feedback-with-card-713+94-${tag}.png` });
    // the longest sentence the check can say, on the narrowest column (card open)
    await page.evaluate(() => window.__ws.getState().showFeedback({ correct: false, title: 'בּוֹאוּ נְקַבֵּץ 🧱', sub: 'הלבנים מסודרות נכון, אבל המשימה היא לקבץ בעצמכם: 10 לבני יחידה בכל פעם, בעזרת כפתור הקבץ 10 שבראש הטור.' }, 4000));
    await page.waitForTimeout(600);
    const fbLong = await rect(page, '[data-testid="feedback-toast"]');
    check(`${tag} 1.15 longest feedback does not cover the instruction's text`, fbLong && fbLong.b <= (await instrTop()) + 1, JSON.stringify({ fbBottom: fbLong?.b, textTop: await instrTop() }));
    check(`${tag} 1.15 feedback does not cover the coaching card`, !overlap(fb, card), JSON.stringify({ fb, card }));
    void board;
    await page.screenshot({ path: `${out}/1.15-longest-feedback-with-card-${tag}.png` });
    await browser.close();
  }

  /* 1.28 — the addition grid beside the coaching card (enhanced support profile). */
  {
    const { browser, page } = await open(4, w, h, { record: { support_profile_id: 'enhanced_cognitive_support' } });
    await page.evaluate(() => window.__ws.getState().initSession(4, false, 0));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__ws.getState().openSocraticCard('consecutive_errors_4'));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__ws.getState().openAdditionHelper('learner'));
    await page.waitForTimeout(3200);
    const grid = await rect(page, '[data-testid="adaptive-addition-grid"]');
    const card = await rect(page, '[data-testid="socratic-side-panel"]');
    check(`${tag} 1.28 grid on screen`, Boolean(grid), JSON.stringify(grid));
    check(`${tag} 1.28 grid does not cover the card`, grid && card && !overlap(grid, card), JSON.stringify({ grid, card }));
    const sheet = await rect(page, '#tour-task-card');
    check(`${tag} 1.28 grid does not cover the task column`, grid && sheet && !overlap(grid, sheet), JSON.stringify({ grid, sheet }));
    const row = await page.evaluate(() => [...document.querySelectorAll('input[aria-label$="בתשובה"]')].map((i) => i.getBoundingClientRect().bottom));
    check(`${tag} 1.28 result row in view with the card open`, row.length > 0 && row.every((b) => b <= h), JSON.stringify(row));
    const title = await page.locator('[data-testid="adaptive-addition-grid"] h3').innerText().catch(() => '');
    check(`${tag} ע1.6 grid title "לוח החיבור"`, title.trim() === 'לוח החיבור', title);
    await page.screenshot({ path: `${out}/1.28-grid-beside-card-m4-${tag}.png` });
    await browser.close();
  }

  /* 3.20 — no box and no sum, meetings 3–7 (owner, 28.9.2026: the sum is removed in 5 and 6 as well). */
  for (const [m, idxFind] of [[3, 0], [4, 0], [5, 0], [6, 0], [7, 5]]) {
    const { browser, page } = await open(m, w, h);
    await page.evaluate(([m, i]) => window.__ws.getState().initSession(m, false, i), [m, idxFind]);
    await page.waitForTimeout(700);
    await drop(page, 'hundreds', 3); await drop(page, 'tens', 4);
    await page.waitForTimeout(500);
    const t = await text(page);
    check(`${tag} 3.20 meeting ${m}: no box, no sum`, !/בנו בלוח בדיוק|בלוח כרגע|הלוח תואם|בניתי את/.test(t));
    await page.screenshot({ path: `${out}/3.20-m${m}-built-${tag}.png` });
    await browser.close();
  }

  /* The proceed button: its name is what it shows. */
  {
    const { browser, page } = await open(3, w, h);
    const b = page.locator('[data-testid="proceed-button"]');
    const name = await b.evaluate((e) => e.getAttribute('aria-label') ?? e.textContent.trim());
    check(`${tag} proceed button announced as "ממשיכים"`, name === 'ממשיכים', name);
    const exitText = (await page.locator('nav button[aria-label="יציאה מהמערכת"]').innerText()).trim();
    const badge = (await page.locator('[data-testid="student-badge"]').innerText()).replace(/\s+/g, ' ').trim();
    check(`${tag} "יציאה" and "מספר 12" written on the bar`, exitText === 'יציאה' && badge.includes('מספר 12'), `${exitText} | ${badge}`);
    await browser.close();
  }

  /* ע3.2, ע1.1 — the choice, end and closed screens. */
  {
    const { browser, page } = await open(3, w, h);
    await page.evaluate(() => window.__ws.setState({ flowStatus: 'choice_branch' }));
    await page.waitForTimeout(700);
    const t1 = await text(page);
    check(`${tag} ע3.2 choice screen says "התחנה"`, t1.includes('סיימתם את שבעת התרגילים של התחנה!') && t1.includes('סיום התחנה עכשיו') && !t1.includes('המפגש'));
    await page.screenshot({ path: `${out}/3.2-choice-screen-${tag}.png` });
    await page.evaluate(() => window.__ws.setState({ flowStatus: 'sessionDone' }));
    await page.waitForTimeout(700);
    const t2 = await text(page);
    check(`${tag} ע1.1 end screen "כשהמורה תפתח את התחנה הבאה"`, t2.includes('כשהמורה תפתח את התחנה הבאה, נמשיך יחד.'));
    await page.screenshot({ path: `${out}/1.1-end-screen-${tag}.png` });
    await put('active_class_session/active', false);
    await page.waitForTimeout(2500);
    const t3 = await text(page);
    check(`${tag} ע1.1 closed screen "המורה סגרה את התחנה"`, t3.includes('המורה סגרה את התחנה') && t3.includes('כשהמורה תפתח תחנה חדשה'));
    await page.screenshot({ path: `${out}/1.1-closed-screen-${tag}.png` });
    await browser.close();
  }

  /* The lobby: badge and exit in neutral words. */
  {
    await seed(1);
    await put('active_class_session/active', false);
    const { browser, page } = await openAs(undefined, { width: w, height: h });
    await page.goto(APP + '/hub');
    await page.waitForTimeout(4000);
    const t = await text(page);
    check(`${tag} lobby badge "מספר 12" and "יציאה", no "תלמיד 12"/"התנתק"`, t.includes('מספר 12') && t.includes('יציאה') && !t.includes('תלמיד 12') && !t.includes('התנתק'));
    await page.screenshot({ path: `${out}/lobby-${tag}.png` });
    await browser.close();
  }
}
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exitCode = failures ? 1 : 0;
