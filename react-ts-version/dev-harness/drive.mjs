/**
 * DEV ONLY. Drives the real frontend (dev-harness/vite.emulator.config.ts)
 * against the Firebase Emulator Suite as student 12, and takes screenshots.
 * No real project, no password, no class passcode: the identity is set in the
 * emulators directly (custom claims through the Auth emulator's admin API,
 * which accepts "Bearer owner" for demo projects only).
 *
 *   node dev-harness/drive.mjs <baseUrl> <outDir> <scenario> [WxH ...]
 *
 * A scenario opens one exercise of one meeting and path, the way the page does
 * at the start of a meeting (initSession with a starting index), then acts.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [, , baseUrl = 'http://127.0.0.1:5180', outDir = 'dev-harness/screens-tmp', scenarioName = 'all', ...sizesArg] = process.argv;
const SIZES = (sizesArg.length ? sizesArg : ['1366x768', '1024x768']).map((s) => s.split('x').map(Number));
const RTDB = 'http://127.0.0.1:9000';
const NS = 'demo-mathmaticore-default-rtdb';
const AUTH = 'http://127.0.0.1:9099';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

async function rtdbPut(p, value) {
  const r = await fetch(`${RTDB}/${p}.json?ns=${NS}`, { method: 'PUT', headers: OWNER, body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`RTDB ${p}: ${r.status} ${await r.text()}`);
}

async function setClaims(uid) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-mathmaticore/accounts:update`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify({ role: 'student', student_id: 12, class_id: 'class_1', roles: ['STUDENT'] }) }),
  });
  if (!r.ok) throw new Error(`claims: ${r.status} ${await r.text()}`);
}

async function seed(meeting, pathName, idx = 0) {
  await rtdbPut('active_class_session', { active: true, status: 'active', sessionNumber: meeting, startedAt: Date.now(), teacherId: 'teacher_demo' });
  await rtdbPut('users/students/student_user12', {
    classId: 'class_1',
    completedMeeting2: true,
    teacher_gate_approved: true,
    highestCompletedMeeting: Math.max(0, meeting - 1),
    pedagogicalPath: pathName,
    // A saved place in the meeting, as a reload finds it (restoreSession).
    workspaceState: { sessionNumber: meeting, flowStatus: 'task', standardTaskIdx: idx, openingScreenSeen: true },
  });
}

/** Opens the workspace of `meeting` on the exercise at `idx` of `pathName`, as student 12. */
async function openExercise(browser, [w, h], meeting, pathName, idx) {
  await seed(meeting, pathName, idx);
  const context = await browser.newContext({ viewport: { width: w, height: h }, locale: 'he-IL' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  pageerror:', e.message.slice(0, 160)));
  if (process.env.DEBUG_IDX) page.on('console', (m) => { if (m.text().startsWith('IDX')) console.log(m.text().slice(0, 600)); });
  await page.goto(baseUrl + '/');
  await page.evaluate(() => {
    const user = { uid: 'student_user12', id: 'student_user12', student_id: 12, role: 'student', class_name: 'המבקרים', displayName: 'תלמיד 12' };
    for (const s of [sessionStorage, localStorage]) {
      s.setItem('mc_auth_user', JSON.stringify(user));
      s.setItem('mc_auth_role', 'student');
      s.setItem('mc_auth_time', String(Date.now()));
    }
  });
  await page.reload();
  await page.waitForFunction(() => window.__FIREBASE_AUTH__?.currentUser?.uid || window.firebaseAuth?.currentUser?.uid, null, { timeout: 30000 });
  const uid = await page.evaluate(() => (window.__FIREBASE_AUTH__ ?? window.firebaseAuth).currentUser.uid);
  await setClaims(uid);
  await page.evaluate(() => (window.__FIREBASE_AUTH__ ?? window.firebaseAuth).currentUser.getIdToken(true));
  await page.goto(`${baseUrl}/workspace?meeting=${meeting}`);
  await page.waitForFunction(() => window.__ws && window.__wsm && window.__store, null, { timeout: 30000 });
  // The learner record from the emulator decides the path; set it on the
  // client too in case the listener has not delivered it yet.
  await page.evaluate(([p, m, i]) => {
    const st = window.__store.getState();
    window.__store.setState({ students: { ...st.students, student_user12: {
      ...(st.students?.student_user12 ?? {}), studentId: 'student_user12', pedagogicalPath: p, completedMeeting2: true, teacher_gate_approved: true,
      // The page restores a saved place when it (re)runs its start of the meeting.
      workspaceState: { sessionNumber: m, flowStatus: 'task', standardTaskIdx: i, openingScreenSeen: true },
    } } });
  }, [pathName, meeting, idx]);
  const start = page.getByRole('button', { name: 'מתחילים' });
  if (await start.isVisible({ timeout: 8000 }).catch(() => false)) await start.click();
  // Let the page finish its own start of the meeting, then move to the exercise.
  const firstTask = page.getByText(/משימה 1 מתוך|משימת היכרות/).first();
  if (!(await firstTask.isVisible({ timeout: 20000 }).catch(() => false))) {
    if (await start.isVisible().catch(() => false)) await start.click();
    await firstTask.waitFor({ timeout: 20000 });
  }
  // Without the learner record the page starts the meeting after a 6-second
  // grace (FIREBASE_RESTORE_GRACE_MS); wait it out so it does not start over
  // after we moved.
  await page.waitForTimeout(7000);
  const currentId = () => page.evaluate(async () => {
    const m = window.__wsm;
    const s = m.useWorkspaceStore.getState();
    return m.getActiveTasks(s)[s.standardTaskIdx]?.id ?? null;
  });
  // The page may restore its saved progress once more while the first sync
  // lands (meeting 1 does); repeat until the exercise holds for 3 seconds.
  const onIt = () => page.evaluate(async ([m, i]) => {
    const mod = window.__wsm;
    const s = mod.useWorkspaceStore.getState();
    return s.sessionNumber === m && s.standardTaskIdx === i;
  }, [meeting, idx]);
  if (process.env.DEBUG_IDX) await page.evaluate(async () => window.__ws.subscribe((st, prev) => { if (prev.standardTaskIdx !== st.standardTaskIdx) console.log('IDX', prev.standardTaskIdx, '->', st.standardTaskIdx, new Error().stack.split('\n').slice(4, 8).join(' | ')); }));
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.evaluate(async ([m, i]) => window.__ws.getState().initSession(m, false, i), [meeting, idx]);
    await page.waitForTimeout(1500);
    if (await start.isVisible().catch(() => false)) { await start.click(); await page.waitForTimeout(800); }
    await page.waitForTimeout(3000);
    if (await onIt()) break;
  }
  const id = await currentId();
  return { context, page, id };
}

async function openCard(page, reason = 'hesitation_45s') {
  await page.evaluate(async (r) => window.__ws.getState().openSocraticCard(r), reason);
  await page.getByTestId('socratic-card').waitFor({ timeout: 10000 });
  // The AI call has nowhere to go here (no functions emulator): wait out its
  // 8-second ceiling, so what is on the screen is the card that stays.
  await page.waitForTimeout(9000);
}

async function cardText(page) {
  return page.getByTestId('socratic-card').innerText();
}

const SCENARIOS = {
  // 3.14 — meeting 3, green path, "ייצגו את המספר 4,500 באמצעות מאות בלבד"
  m3_4500: { meeting: 3, path: 'green_path', expectId: 's3_g_t3', act: async (page) => openCard(page) },
  // 8.5 — meeting 8, 1,245 + 328, opened by three undos (the meeting-8 trigger)
  m8_1245: {
    meeting: 8, path: 'green_path', expectId: 's8_g_t1',
    act: async (page) => {
      const box = page.getByLabel('ספרת היחידות בתשובה');
      for (const d of ['1', '2', '3']) { await box.fill(d); await page.waitForTimeout(150); }
      const undo = page.getByRole('button', { name: /ביטול/ }).first();
      for (let i = 0; i < 3; i++) { await undo.click(); await page.waitForTimeout(250); }
      await page.getByTestId('socratic-card').waitFor({ timeout: 10000 });
      await page.waitForTimeout(9000);
    },
  },
  // 8.5 — the same exercise in meeting 4
  m4_1245: { meeting: 4, path: 'green_path', expectId: 's4_g_t1', act: async (page) => openCard(page) },
  // same class of mistake, other shapes
  m8_53_18: { meeting: 8, path: 'remediation_path', expectId: 's8_r_t5', act: async (page) => openCard(page) },
  m6_602: { meeting: 6, path: 'remediation_path', expectId: 's6_r_t5', act: async (page) => openCard(page) },
  m7_skeleton: { meeting: 7, path: 'remediation_path', expectId: 's7_r_t2', act: async (page) => openCard(page) },
  m7_3800: { meeting: 7, path: 'green_path', expectId: 's7_g_t5', act: async (page) => openCard(page) },
  m3_85: { meeting: 3, path: 'remediation_path', expectId: 's3_r_t4', act: async (page) => openCard(page) },
  // Meeting 1, target task 347: the card, and its wrong option's hint
  m1_347_card: {
    meeting: 1, path: 'green_path', expectId: 's1_target_347',
    act: async (page) => {
      await openCard(page);
      await page.getByTestId('socratic-card').locator('button.text-right').nth(1).click();
      await page.waitForTimeout(1500);
    },
  },
  // Meeting 1, target task 347: a wrong number typed in the result row
  // (337), and then four wrong attempts in a row in the tens box (PRD
  // Module 12 §ב: "4 ניסיונות הקלדה או מחיקה שגויים ברציפות").
  m1_347_wrong: {
    meeting: 1, path: 'green_path', expectId: 's1_target_347',
    act: async (page) => {
      const box = (p) => page.getByLabel(`ספרת ה${p} בשורת התוצאה`);
      await box('מאות').fill('3'); await box('עשרות').fill('3'); await box('יחידות').fill('7');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(outDir, `m1_347_wrong-typed-${page.viewportSize().width}x${page.viewportSize().height}.png`) });
      const advanceDisabled = await page.locator('button', { hasText: 'התקדם' }).first().isDisabled({ timeout: 3000 }).catch(() => 'unknown');
      console.log('  337 typed; התקדם disabled:', advanceDisabled, '| card open:', await page.getByTestId('socratic-card').isVisible().catch(() => false));
      for (const d of ['2', '1', '0', '9']) { await box('עשרות').fill(d); await page.waitForTimeout(300); }
      await page.getByTestId('socratic-card').waitFor({ timeout: 10000 });
      await page.waitForTimeout(9000);
    },
  },
  // 1.14 — a wrong choice locks the answer buttons
  lock: {
    meeting: 3, path: 'green_path', expectId: 's3_g_t3',
    act: async (page) => {
      await openCard(page);
      await page.getByTestId('socratic-card').locator('button.text-right').nth(1).click();
      await page.waitForTimeout(2500);
    },
  },
};

const indexOf = { m1_347_card: 4, m1_347_wrong: 4, m3_4500: 2, m8_1245: 0, m4_1245: 0, m8_53_18: 4, m6_602: 4, m7_skeleton: 1, m7_3800: 4, m3_85: 3, lock: 2 };

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
fs.mkdirSync(outDir, { recursive: true });
const names = scenarioName === 'all' ? Object.keys(SCENARIOS) : scenarioName.split(',');
const report = {};
for (const name of names) {
  const sc = SCENARIOS[name];
  for (const size of SIZES) {
    const tag = `${name}-${size[0]}x${size[1]}`;
    let opened;
    try {
      opened = await openExercise(browser, size, sc.meeting, sc.path, indexOf[name]);
    } catch (e) {
      console.log(`✗ ${tag}: could not open the exercise: ${String(e).slice(0, 200)}`);
      continue;
    }
    const { context, page, id } = opened;
    try {
      if (id !== sc.expectId) throw new Error(`on ${id}, expected ${sc.expectId}`);
      await sc.act(page);
      await page.screenshot({ path: path.join(outDir, `${tag}.png`) });
      report[tag] = { id, card: await cardText(page).catch(() => null) };
      console.log(`✓ ${tag} (${id})`);
    } catch (e) {
      await page.screenshot({ path: path.join(outDir, `${tag}-FAILED.png`) }).catch(() => {});
      report[tag] = { id, error: String(e) };
      console.log(`✗ ${tag}: ${e}`);
    }
    await context.close();
  }
}
fs.writeFileSync(path.join(outDir, 'cards.json'), JSON.stringify(report, null, 2));
await browser.close();
