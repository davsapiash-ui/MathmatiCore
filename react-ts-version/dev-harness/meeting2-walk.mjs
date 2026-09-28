/**
 * DEV ONLY. Walks meeting 2 as student 12 on the emulator harness (start.sh)
 * and takes a screenshot of every screen. Nothing here touches the live site,
 * and no password or passcode is used: the identity is an emulator token.
 *
 *   node dev-harness/meeting2-walk.mjs --profile plain|enhanced --size 1366x768 \
 *        --out dev-harness/shots/after --answers wrong|right [--base http://localhost:5199]
 *
 * "wrong" answers every task wrongly (506, 65, 52 and other wrong numbers) so the
 * whole correction round is shown; "right" answers 605, 40, 27, 563, 25, 209, 273.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const profile = args.profile ?? 'plain';
const [W, H] = (args.size ?? '1366x768').split('x').map(Number);
const out = args.out ?? 'dev-harness/shots/after';
const answers = args.answers ?? 'wrong';
const base = args.base ?? 'http://localhost:5199';
const RTDB = 'http://127.0.0.1:9000';
const NS = 'demo-mathmaticore-default-rtdb';
const tag = `${profile}-${answers}-${W}x${H}`;
fs.mkdirSync(out, { recursive: true });

async function rtdb(method, p, body) {
  const r = await fetch(`${RTDB}/${p}.json?ns=${NS}`, {
    method,
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${await r.text()}`);
}

// The emulator keeps a custom token's claims only until the token is refreshed;
// storing them on the emulator user keeps them for the whole walk.
const STUDENT_CLAIMS = { role: 'student', student_id: 12, class_id: 'class_1', roles: ['STUDENT'] };
{
  const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-mathmaticore/accounts';
  const body = { localId: 'harness-student-12', customAttributes: JSON.stringify(STUDENT_CLAIMS) };
  const h = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  let r = await fetch(`${AUTH}:update`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  if (!r.ok) r = await fetch(AUTH, { method: 'POST', headers: h, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`auth emulator: ${r.status} ${await r.text()}`);
}

const enhanced = profile === 'enhanced';
await rtdb('PUT', 'users/students/student_user12', {
  support_profile_id: enhanced ? 'enhanced_cognitive_support' : null,
  enhanced_support_profile: enhanced,
  isOnline: false,
});
await rtdb('PUT', 'active_class_session', { active: true, status: 'active', sessionNumber: 2, startedAt: Date.now(), teacherId: 'harness-teacher' });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: W, height: H }, locale: 'he-IL', ignoreHTTPSErrors: true });
await context.addInitScript(() => {
  if (sessionStorage.getItem('harness_seeded')) return;
  sessionStorage.setItem('harness_seeded', '1');
  const now = String(Date.now());
  localStorage.setItem('harness_claims', JSON.stringify({ __uid: 'harness-student-12', role: 'student', student_id: 12, class_id: 'class_1', roles: ['STUDENT'] }));
  localStorage.setItem('mc_auth_user', JSON.stringify({ uid: 'student_user12', id: 'student_user12', student_id: 12, role: 'student', school_id: 'school_bikorot', class_name: 'המבקרים', class_type: 'כיתת ביקורת', displayName: 'תלמיד 12' }));
  localStorage.setItem('mc_auth_role', 'student');
  localStorage.setItem('mc_auth_time', now);
  localStorage.setItem('mc_student_last_active', now);
});
const page = await context.newPage();
const log = [];
page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));

let n = 0;
async function shot(name) {
  n += 1;
  const file = path.join(out, `${tag}-${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** What the screen says and where the result row is — the facts the PR reports. */
async function facts() {
  return page.evaluate(() => {
    const card = document.querySelector('#tour-task-card');
    const q = (sel) => [...document.querySelectorAll(sel)];
    const inputs = q('#tour-task-card input').map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { label: el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby'), x: Math.round(r.x), bottom: Math.round(r.bottom), border: cs.borderTopColor, value: el.value };
    });
    return {
      heading: card?.querySelector('h1')?.textContent,
      instruction: card?.querySelector('p')?.textContent,
      text: card?.innerText.replace(/\s+/g, ' ').slice(0, 400),
      headings: q('#tour-task-card [id^="pv-label-"]').map((e) => e.textContent),
      inputs,
      picture: q('[data-testid="unit-blocks-picture"]').map((e) => ({ label: e.getAttribute('aria-label'), blocks: e.querySelectorAll('[data-testid="unit-block-still"]').length, buttons: e.querySelectorAll('button').length, bottom: Math.round(e.getBoundingClientRect().bottom) })),
      viewportHeight: innerHeight,
    };
  });
}

async function typeInto(values) {
  // Types digit by digit through focus and auto-advance, like a child: the first
  // box has focus when the task opens.
  const boxes = page.locator('#tour-task-card input[maxlength="1"]:not([aria-label^="חלונית"])');
  const count = await boxes.count();
  if (typeof values === 'string' && count > 0) {
    // vertical exercise: the answer row, units first (the carrying direction)
    const vertical = await page.locator('[aria-label^="תרגיל במאונך"]').count();
    if (vertical) {
      const digits = values.split('');
      for (let i = digits.length - 1, k = count - 1; i >= 0; i -= 1, k -= 1) await boxes.nth(k).fill(digits[i]);
      return;
    }
    await boxes.first().focus();
    for (const d of values) await page.keyboard.type(d);
    return;
  }
  const single = page.locator('#tour-task-card input:not([maxlength="1"])');
  await single.first().fill(String(values));
}

const PRIMARY = answers === 'right'
  ? ['605', '40', '27', '563', '25', '209', '273']
  : ['506', '65', '52', '365', '52', '219', '233'];

const report = { tag, steps: [] };
// First load signs in (the user is then persisted, as on a real laptop); the
// second load starts the meeting with the identity already in place.
await page.goto(`${base}/login`);
await page.waitForFunction(() => new Promise((res) => {
  const r = indexedDB.open('firebaseLocalStorageDb');
  r.onsuccess = () => {
    try {
      const tx = r.result.transaction('firebaseLocalStorage', 'readonly');
      const all = tx.objectStore('firebaseLocalStorage').getAll();
      all.onsuccess = () => res(all.result.length > 0);
      all.onerror = () => res(false);
    } catch { res(false); }
  };
  r.onerror = () => res(false);
}), null, { timeout: 30000, polling: 500 });
await page.goto(`${base}/workspace?meeting=2`);
await page.getByRole('button', { name: 'מתחילים' }).click({ timeout: 30000 }).catch(async (e) => { await shot('no-opening-screen'); throw e; });
await page.waitForSelector('#tour-task-card h1');

async function proceed() {
  await page.getByRole('button', { name: 'מעבר למשימה הבאה' }).click();
  await page.waitForTimeout(2600);
}

for (let i = 0; i < 7; i += 1) {
  await page.waitForTimeout(700);
  report.steps.push({ step: `primary ${i + 1}`, before: await facts(), shot: await shot(`task${i + 1}`) });
  await typeInto(i === 1 ? PRIMARY[i] : PRIMARY[i]);
  await page.waitForTimeout(200);
  report.steps.push({ step: `primary ${i + 1} filled`, after: await facts(), shot: await shot(`task${i + 1}-filled`) });
  await proceed();
}
// Correction round: take every screen until the bee screen.
for (let k = 0; k < 12; k += 1) {
  // Wait for the next screen: the bee screen, or a task with an empty answer box.
  let next = 'none';
  for (let t = 0; t < 40 && next === 'none'; t += 1) {
    if (await page.getByText('סיימתם את התחנה השנייה').count()) next = 'bee';
    else if (await page.locator('#tour-task-card input').evaluateAll((els) => els.some((e) => e.value === '' && !(e.getAttribute('aria-label') ?? '').startsWith('חלונית')))) next = 'task';
    else await page.waitForTimeout(500);
  }
  if (next !== 'task') {
    report.steps.push({ step: 'after last answer', shot: await shot('after-last') });
    break;
  }
  await page.waitForTimeout(700);
  report.steps.push({ step: `correction ${k + 1}`, before: await facts(), shot: await shot(`retry${k + 1}`) });
  const probe = (await page.locator('[data-testid="probe-exercise"], .katex').count()) > 0;
  if (probe) await page.locator('#tour-task-card input').first().fill('1');
  else {
    const h = await facts();
    const id = h.text ?? '';
    const val = id.includes('742') ? '40' : id.includes('25 לבני') ? '25' : id.includes('שש מאות') ? '605' : id.includes('חמש מאות') ? '563' : id.includes('42') ? '27' : id.includes('124') ? '209' : '273';
    await typeInto(val);
  }
  report.steps.push({ step: `correction ${k + 1} filled`, shot: await shot(`retry${k + 1}-filled`) });
  await proceed();
}
await page.getByText('סיימתם את התחנה השנייה').waitFor({ timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1000);
report.steps.push({ step: 'end', shot: await shot('end') });
report.errors = log;
fs.writeFileSync(path.join(out, `${tag}.json`), JSON.stringify(report, null, 2));
await browser.close();
console.log(`done ${tag}: ${report.steps.length} steps, errors: ${log.length}`);
