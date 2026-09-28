import { test, expect, type Browser } from '@playwright/test';
import {
  activeTaskCount,
  capture,
  closedSession,
  gotoPath,
  gotoWorkspace,
  liveSession,
  openContext,
  resetReport,
  saveResults,
  settle,
  STUDENT_UID,
  ws,
  type AuditContext,
  type ContextOptions,
  type StateResult,
} from './harness';
import { selectedViewports, type Viewport } from './viewports';

/**
 * The student's whole journey, screen by screen, meeting by meeting, on every
 * viewport in tests/ux-audit/viewports.ts.
 *
 * Owner's rule (28.9.2026): zero page scrolling throughout the student's work,
 * in every meeting, and no bugs. So each state below is measured for page
 * scroll, content that needs an inner scroll, content clipped by an
 * overflow:hidden box, elements outside the viewport, covered buttons, small
 * touch targets and console errors — see tests/ux-audit/measure.ts.
 *
 * Scope: UX_AUDIT_SCOPE=full (default) | core | smoke
 *   full  — every meeting, every exercise, both learning paths, ASD numbers,
 *           the enhanced-support grid, every overlay and end screen.
 *   core  — the green path with every overlay, plus the enhanced grid; no
 *           remediation bank, no ASD pass.
 *   smoke — one exercise per kind of screen, for a quick check of a branch.
 *
 * Reports: test-results/ux-audit/report.md (+ report.json, shots/).
 */

type Scope = 'full' | 'core' | 'smoke';
const SCOPE = ((process.env.UX_AUDIT_SCOPE as Scope) || 'full') as Scope;
const PRIMARY_VIEWPORT = 'laptop-1366';
const HIGH = new Set(['page-scroll-y', 'page-scroll-x', 'needs-scroll', 'clipped', 'offscreen']);

interface Step {
  id: string;
  /** Workspace meeting, or null for a plain URL. */
  meeting: number | null;
  url?: string;
  note?: string;
  run: (c: AuditContext) => Promise<void>;
}

const noop = async () => {};

// ── store snippets (bodies of (st, api, arg) functions, run in the page) ──
const INIT = 'st.initSession(arg.meeting, arg.isASD, arg.idx); if (arg.skipOpening) api.getState().markOpeningScreenSeen();';
const SET = 'api.setState(arg);';
const Q_FLOW = 'api.getState().markOpeningScreenSeen(); api.setState({ qflow: arg, flowStatus: "task", awaitingNext: false, probeAnswer: "" });';

// Diagnostic tasks (core/QMatrix.ts): index, id, whether the correction round has a probe.
const DIAGNOSTIC = [
  { idx: 0, id: 'task1_read_write_zero', probe: false },
  { idx: 1, id: 'task2_digit_value', probe: false },
  { idx: 2, id: 'task3_subtraction_regrouping', probe: true },
  { idx: 3, id: 'task4_decompose_number', probe: false },
  { idx: 4, id: 'task5_units_to_tens', probe: false },
  { idx: 5, id: 'task6_vertical_addition', probe: true },
  { idx: 6, id: 'task7_subtraction_zero_tens', probe: true },
];

function qflow(idx: number, phase: 'primary' | 'correction', subphase: 'subtask' | 'retry') {
  return {
    taskIdx: idx,
    phase,
    subphase,
    failedTasks: phase === 'correction' ? [DIAGNOSTIC[idx].id] : [],
    correctionIdx: 0,
    results: {},
  };
}

// ── the catalogue ─────────────────────────────────────────────────────────

function initTask(meeting: number, isASD: boolean, idx: number): Step['run'] {
  return async (c) => {
    await ws(c.page, INIT, { meeting, isASD, idx, skipOpening: meeting === 2 || meeting === 8 });
  };
}

/** Everything a learner on the green path can see (default profile). */
async function defaultSteps(c: AuditContext, scope: Scope): Promise<Step[]> {
  const steps: Step[] = [];
  const isASD = false;

  // Meeting 1 — the guided sandbox: intro steps and the refresh exercises.
  const m1Count = scope === 'smoke' ? 1 : await countTasks(c, 1, isASD);
  for (let k = 0; k < m1Count; k++) steps.push({ id: `m1-task-${k + 1}`, meeting: 1, run: initTask(1, isASD, k) });
  if (scope !== 'smoke') {
    steps.push({
      id: 'm1-board-full',
      meeting: 1,
      note: '9 units, 9 tens, 9 hundreds on the board',
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: 1, isASD, idx: 2 });
        await ws(cc.page, SET, { counts: { units: 9, tens: 9, hundreds: 9, thousands: 0 } });
      },
    });
    steps.push({
      id: 'm1-board-hidden',
      meeting: 1,
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: 1, isASD, idx: 0 });
        await ws(cc.page, 'st.toggleBoard();');
      },
    });
    steps.push({
      id: 'm1-coaching-open',
      meeting: 1,
      note: 'the coaching side panel on the addition exercise',
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: 1, isASD, idx: 6 });
        await ws(cc.page, 'st.openSocraticCard("hesitation_45s");');
      },
    });
    steps.push({ id: 'm1-session-done', meeting: 1, run: async (cc) => ws(cc.page, SET, { flowStatus: 'sessionDone', awaitingNext: false }) });
  }

  // Meeting 2 — the diagnostic: opening screen, seven tasks, the correction round.
  steps.push({ id: 'm2-opening', meeting: 2, run: async (cc) => ws(cc.page, INIT, { meeting: 2, isASD, idx: 0 }) });
  const diag = scope === 'smoke' ? DIAGNOSTIC.slice(0, 1) : DIAGNOSTIC;
  for (const t of diag) steps.push({ id: `m2-task-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'primary', 'subtask')) });
  for (const t of scope === 'smoke' ? DIAGNOSTIC.slice(2, 3) : DIAGNOSTIC) {
    if (t.probe) steps.push({ id: `m2-correction-probe-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'correction', 'subtask')) });
    steps.push({ id: `m2-correction-retry-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'correction', 'retry')) });
  }
  steps.push({ id: 'm2-session-done-approved', meeting: 2, run: async (cc) => ws(cc.page, SET, { flowStatus: 'sessionDone', awaitingNext: false }) });
  steps.push({
    id: 'm2-waiting-for-teacher',
    meeting: 2,
    note: 'bee-flight screen: diagnostic finished, gate not yet approved',
    run: async (cc) => {
      cc.rtdb.set(`users/students/${STUDENT_UID}/teacher_gate_approved`, false);
      cc.rtdb.set(`users/students/${STUDENT_UID}/routeStatus`, 'PENDING');
      await cc.page.evaluate((uid) => {
        const s = (window as unknown as { useStore: { setState: (fn: (p: { students: Record<string, Record<string, unknown>> }) => unknown) => void } }).useStore;
        s.setState((prev) => ({ students: { ...prev.students, [uid]: { ...prev.students[uid], teacher_gate_approved: false, routeStatus: 'PENDING' } } }));
      }, STUDENT_UID);
      await ws(cc.page, SET, { flowStatus: 'sessionDone', awaitingNext: false });
    },
  });

  // Meetings 3–7 — adaptive lessons: every exercise, the side panel, the choice, both branches, the end.
  const lessonMeetings = scope === 'smoke' ? [3] : [3, 4, 5, 6, 7];
  for (const n of lessonMeetings) {
    const count = scope === 'smoke' ? 1 : await countTasks(c, n, isASD);
    for (let k = 0; k < count; k++) steps.push({ id: `m${n}-task-${k + 1}`, meeting: n, run: initTask(n, isASD, k) });
    steps.push({
      id: `m${n}-coaching-open`,
      meeting: n,
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: n, isASD, idx: 0 });
        await ws(cc.page, 'st.openSocraticCard("hesitation_45s");');
      },
    });
    if (n === 3 || scope === 'full') {
      steps.push({
        id: `m${n}-board-full`,
        meeting: n,
        note: '9 blocks in every column',
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: n, isASD, idx: 0 });
          await ws(cc.page, SET, { counts: { units: 9, tens: 9, hundreds: 9, thousands: 9 } });
        },
      });
      steps.push({
        id: `m${n}-board-hidden`,
        meeting: n,
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: n, isASD, idx: 0 });
          await ws(cc.page, 'st.toggleBoard();');
        },
      });
    }
    if (n === 3) {
      steps.push({
        id: 'm3-friction',
        meeting: 3,
        note: 'the 3-second "let us think" overlay after a mistake',
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: 3, isASD, idx: 0 });
          await ws(cc.page, SET, { helpState: 'friction', frictionTriggerSource: 'mistake' });
        },
      });
      steps.push({
        id: 'm3-feedback-toast',
        meeting: 3,
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: 3, isASD, idx: 0 });
          await ws(cc.page, 'st.showFeedback({ correct: true, title: "כל הכבוד!", sub: "הצלחתם. ממשיכים לתרגיל הבא." }, 30000);');
        },
      });
      steps.push({
        id: 'm3-help-called',
        meeting: 3,
        note: 'the silent call to the teacher and its acknowledgement',
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: 3, isASD, idx: 0 });
          await ws(cc.page, 'st.requestSilentHelp();');
        },
      });
      steps.push({
        id: 'm3-chat-open',
        meeting: 3,
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: 3, isASD, idx: 0 });
          await cc.page.evaluate(() => document.dispatchEvent(new CustomEvent('toggle-chat')));
        },
      });
      steps.push({
        id: 'm3-coaching-and-chat',
        meeting: 3,
        note: 'side panel and chat at once',
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: 3, isASD, idx: 0 });
          await ws(cc.page, 'st.openSocraticCard("hesitation_45s");');
          await cc.page.evaluate(() => document.dispatchEvent(new CustomEvent('toggle-chat')));
        },
      });
      steps.push({
        id: 'm3-other-device',
        meeting: 3,
        note: 'the "continued on another device" lock',
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: 3, isASD, idx: 0 });
          await ws(cc.page, SET, { isSupersededByOtherDevice: true });
        },
      });
      steps.push({ id: 'm3-other-device-release', meeting: 3, run: async (cc) => ws(cc.page, SET, { isSupersededByOtherDevice: false }) });
      // The teacher's three controls and the projector reach the learner live (Module 14 / 15).
      steps.push({
        id: 'm3-teacher-paused',
        meeting: 3,
        note: 'the teacher paused the meeting',
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: 3, isASD, idx: 0 });
          cc.rtdb.set('active_class_session', liveSession(3, 'paused') as never);
        },
      });
      steps.push({
        id: 'm3-teacher-closed',
        meeting: 3,
        note: 'the teacher closed the meeting',
        run: async (cc) => {
          cc.rtdb.set('active_class_session', closedSession() as never);
        },
      });
      steps.push({
        id: 'm3-projector',
        meeting: 3,
        note: 'projector mode: the class looks at the board',
        run: async (cc) => {
          cc.rtdb.set('active_class_session', liveSession(3) as never);
          cc.rtdb.set('system_control/projector_mode', { active: true, projector_mode: true, projector_mode_updated_at: Date.now() });
        },
      });
      steps.push({
        id: 'm3-projector-off',
        meeting: 3,
        note: 'back to work after the projector',
        run: async (cc) => {
          cc.rtdb.set('system_control/projector_mode', { active: false, projector_mode: false, projector_mode_updated_at: Date.now() });
        },
      });
    }
    steps.push({ id: `m${n}-choice`, meeting: n, run: async (cc) => ws(cc.page, SET, { flowStatus: 'choice_branch', awaitingNext: false }) });
    for (const branch of ['reinforcement', 'challenge'] as const) {
      steps.push({
        id: `m${n}-${branch}-1`,
        meeting: n,
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: n, isASD, idx: 0 });
          await ws(cc.page, 'st.selectBranch(arg);', branch);
        },
      });
      if (scope !== 'smoke') {
        // The rest of the branch bank, if it has more than one exercise.
        steps.push({
          id: `m${n}-${branch}-2`,
          meeting: n,
          run: async (cc) => {
            await ws(cc.page, INIT, { meeting: n, isASD, idx: 0 });
            await ws(cc.page, 'st.selectBranch(arg);', branch);
            const total = await activeTaskCount(cc.page);
            const st = await ws<{ standardTaskIdx: number }>(cc.page, 'return { standardTaskIdx: st.standardTaskIdx };');
            if (st.standardTaskIdx + 1 >= total) throw new Error('skip: the bank has one exercise');
            await ws(cc.page, SET, { standardTaskIdx: st.standardTaskIdx + 1 });
          },
        });
      }
    }
    steps.push({
      id: `m${n}-session-done`,
      meeting: n,
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: n, isASD, idx: 0 });
        await ws(cc.page, SET, { flowStatus: 'sessionDone', awaitingNext: false });
      },
    });
  }

  // Meeting 8 — the master researcher: no board, and the reflection board at the end.
  steps.push({ id: 'm8-opening', meeting: 8, run: async (cc) => ws(cc.page, INIT, { meeting: 8, isASD, idx: 0 }) });
  const m8Count = scope === 'smoke' ? 1 : await countTasks(c, 8, isASD);
  for (let k = 0; k < m8Count; k++) steps.push({ id: `m8-task-${k + 1}`, meeting: 8, run: initTask(8, isASD, k) });
  steps.push({
    id: 'm8-coaching-open',
    meeting: 8,
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 8, isASD, idx: 0, skipOpening: true });
      await ws(cc.page, 'st.openSocraticCard("repeated_errors");');
    },
  });
  steps.push({ id: 'm8-reflection-1', meeting: 8, run: async (cc) => ws(cc.page, SET, { flowStatus: 'reflection', awaitingNext: false }) });
  steps.push({
    id: 'm8-reflection-2',
    meeting: 8,
    run: async (cc) => {
      const card = cc.page.locator('[role="group"]').first();
      await card.locator('button').first().click();
      await cc.page.locator('.fixed.inset-0 button:not([disabled])').last().click();
    },
  });
  steps.push({
    id: 'm8-reflection-3',
    meeting: 8,
    run: async (cc) => {
      await cc.page.locator('.fixed.inset-0 [role="checkbox"]').first().click();
      await cc.page.locator('.fixed.inset-0 button:not([disabled])').last().click();
    },
  });

  return steps;
}

/** The remediation bank of meetings 3–8 (different exercises, same screens). */
async function remediationSteps(c: AuditContext): Promise<Step[]> {
  const steps: Step[] = [];
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const count = await countTasks(c, n, false);
    for (let k = 0; k < count; k++) steps.push({ id: `m${n}-task-${k + 1}`, meeting: n, run: initTask(n, false, k) });
    if (n <= 7) {
      for (const branch of ['reinforcement', 'challenge'] as const) {
        steps.push({
          id: `m${n}-${branch}-1`,
          meeting: n,
          run: async (cc) => {
            await ws(cc.page, INIT, { meeting: n, isASD: false, idx: 0 });
            await ws(cc.page, 'st.selectBranch(arg);', branch);
          },
        });
      }
    }
  }
  return steps;
}

/** The ASD variants: simplified numbers, the visual organiser, quiet mode on every screen. */
async function asdSteps(c: AuditContext): Promise<Step[]> {
  const steps: Step[] = [];
  steps.push({ id: 'm2-opening', meeting: 2, run: async (cc) => ws(cc.page, INIT, { meeting: 2, isASD: true, idx: 0 }) });
  for (const t of DIAGNOSTIC) steps.push({ id: `m2-task-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'primary', 'subtask')) });
  for (const t of DIAGNOSTIC) {
    if (t.probe) steps.push({ id: `m2-correction-probe-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'correction', 'subtask')) });
    steps.push({ id: `m2-correction-retry-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'correction', 'retry')) });
  }
  for (const n of [1, 3, 4, 5, 6, 7, 8]) {
    const count = await countTasks(c, n, true);
    for (let k = 0; k < count; k++) steps.push({ id: `m${n}-task-${k + 1}`, meeting: n, run: initTask(n, true, k) });
  }
  steps.push({
    id: 'm3-coaching-open',
    meeting: 3,
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 3, isASD: true, idx: 0 });
      await ws(cc.page, 'st.openSocraticCard("hesitation_45s");');
    },
  });
  return steps;
}

/** The enhanced cognitive-support profile: the adaptive addition grid (Module 10) and its return tab. */
function enhancedSteps(): Step[] {
  const steps: Step[] = [];
  for (const n of [3, 5]) {
    steps.push({
      id: `m${n}-grid-open`,
      meeting: n,
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: n, isASD: false, idx: 0 });
        await ws(cc.page, 'st.openAdditionHelper("learner");');
      },
    });
    steps.push({
      id: `m${n}-grid-tab`,
      meeting: n,
      note: 'the grid faded; the "לוח חיבור" tab that brings it back',
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: n, isASD: false, idx: 0 });
        await ws(cc.page, SET, { isAdditionHelperOpen: false, additionHelperOffered: true });
      },
    });
  }
  steps.push({
    id: 'm3-grid-and-coaching',
    meeting: 3,
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 3, isASD: false, idx: 0 });
      await ws(cc.page, 'st.openAdditionHelper("learner"); st.openSocraticCard("hesitation_45s");');
    },
  });
  steps.push({
    id: 'm3-grid-tab-and-chat',
    meeting: 3,
    note: 'both live in the bottom-left corner',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 3, isASD: false, idx: 0 });
      await ws(cc.page, SET, { isAdditionHelperOpen: false, additionHelperOffered: true });
      await cc.page.evaluate(() => document.dispatchEvent(new CustomEvent('toggle-chat')));
    },
  });
  return steps;
}

/** Screens outside the workspace, and the meeting-3 gate. */
const LOBBY_AND_LOGIN: Array<{ opts: ContextOptions; steps: Step[] }> = [
  {
    opts: { mode: 'default', path: 'green_path', approved: true, classSession: closedSession() },
    steps: [
      { id: 'lobby-not-started', meeting: null, url: '/hub', note: 'the lobby before the teacher opens a meeting', run: noop },
      {
        id: 'lobby-paused',
        meeting: null,
        url: '/hub',
        note: 'the lobby while the teacher holds the meeting',
        run: async (cc) => {
          cc.rtdb.set('active_class_session', liveSession(4, 'paused') as never);
        },
      },
      {
        id: 'lobby-projector',
        meeting: null,
        url: '/hub',
        run: async (cc) => {
          cc.rtdb.set('active_class_session', closedSession() as never);
          cc.rtdb.set('system_control/projector_mode', { active: true, projector_mode: true, projector_mode_updated_at: Date.now() });
        },
      },
    ],
  },
  {
    opts: { mode: 'default', path: 'green_path', approved: false },
    steps: [
      { id: 'm3-gate-waiting', meeting: 3, note: 'meeting 3 before the teacher approves the gate', run: noop },
    ],
  },
  {
    opts: { mode: 'default', path: 'green_path', approved: true, auth: false },
    steps: [
      { id: 'login-roles', meeting: null, url: '/login', run: noop },
      {
        id: 'login-student-form',
        meeting: null,
        url: '/login',
        run: async (cc) => {
          await cc.page.getByRole('button', { name: 'תלמיד' }).first().click();
        },
      },
      // The public landing page ("/") is a long presentation page for visitors,
      // not a screen of the child's work; it is meant to scroll and is not measured.
    ],
  },
];

// ── helpers ───────────────────────────────────────────────────────────────

async function countTasks(c: AuditContext, meeting: number, isASD: boolean): Promise<number> {
  await gotoWorkspace(c, meeting);
  await ws(c.page, INIT, { meeting, isASD, idx: 0, skipOpening: true });
  await settle(c.page, 300);
  const n = await activeTaskCount(c.page);
  if (n === 0) throw new Error(`meeting ${meeting}: no progress dots — the bank is empty or the topbar changed`);
  return n;
}

async function runSteps(
  browser: Browser,
  viewport: Viewport,
  opts: ContextOptions,
  build: (c: AuditContext) => Promise<Step[]> | Step[],
  results: StateResult[]
): Promise<void> {
  const c = await openContext(browser, viewport, opts);
  const screenshotAll = viewport.id === PRIMARY_VIEWPORT || process.env.UX_AUDIT_SHOTS === 'all';
  try {
    const steps = await build(c);
    let currentMeeting: number | null | undefined;
    let currentUrl: string | undefined;
    for (const step of steps) {
      const label = `${opts.mode}/${opts.path}/${step.id}`;
      try {
        if (step.meeting !== null && step.meeting !== currentMeeting) {
          await gotoWorkspace(c, step.meeting);
          currentMeeting = step.meeting;
          currentUrl = undefined;
        } else if (step.meeting === null && (step.url !== currentUrl || step.id.startsWith('login'))) {
          await gotoPath(c, step.url || '/');
          currentUrl = step.url;
          currentMeeting = undefined;
        }
        c.drainConsole();
        await step.run(c);
        results.push(await capture({ viewport, ctx: c, meeting: step.meeting, state: step.id, note: step.note, screenshotAll }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('skip:')) continue;
        results.push({
          viewport: viewport.id,
          tier: viewport.tier,
          mode: opts.mode,
          path: opts.path,
          meeting: step.meeting,
          state: step.id,
          note: step.note,
          url: c.page.url(),
          fonts: { heebo: false, rubik: false, assistant: false },
          findings: [],
          consoleErrors: c.drainConsole(),
          error: message.split('\n')[0].slice(0, 200),
        });
        // eslint-disable-next-line no-console
        console.log(`  ✗ ${viewport.id} ${label}: ${message.split('\n')[0]}`);
        // A navigation error leaves the page in an unknown state: force a reload next step.
        currentMeeting = undefined;
        currentUrl = undefined;
      }
    }
  } finally {
    await c.context.close();
  }
}

// ── the run ───────────────────────────────────────────────────────────────

// One worker (config) keeps the viewports sequential; NOT `serial` mode, which
// would skip every remaining viewport the moment one of them fails the gate.
test.beforeAll(() => {
  if (process.env.UX_AUDIT_KEEP !== '1') resetReport();
});

for (const viewport of selectedViewports()) {
  test(`student journey fits ${viewport.id} (${viewport.width}×${viewport.height}, tier ${viewport.tier})`, async ({ browser, baseURL }) => {
    const results: StateResult[] = [];
    // Saved after every group, so an interrupted run keeps what it measured.
    const checkpoint = () => saveResults(viewport.id, results, baseURL || '');

    await runSteps(browser, viewport, { mode: 'default', path: 'green_path', approved: true }, (c) => defaultSteps(c, SCOPE), results);
    checkpoint();
    if (SCOPE !== 'smoke') {
      await runSteps(browser, viewport, { mode: 'enhanced', path: 'green_path', approved: true }, () => enhancedSteps(), results);
      checkpoint();
    }
    if (SCOPE === 'full') {
      await runSteps(browser, viewport, { mode: 'default', path: 'remediation_path', approved: true }, (c) => remediationSteps(c), results);
      checkpoint();
      await runSteps(browser, viewport, { mode: 'asd', path: 'green_path', approved: true }, (c) => asdSteps(c), results);
      checkpoint();
    }
    for (const group of LOBBY_AND_LOGIN) {
      await runSteps(browser, viewport, group.opts, () => group.steps, results);
    }

    const report = checkpoint();
    const failing = results.filter((r) => r.findings.some((f) => HIGH.has(f.type)));
    const unreachable = results.filter((r) => r.error);
    // eslint-disable-next-line no-console
    console.log(
      `${viewport.id}: ${results.length} states, ${failing.length} with scroll/clipping/offscreen, ${unreachable.length} unreachable → ${report.results.length} in report`
    );

    expect.soft(unreachable, `states the audit could not reach on ${viewport.id}`).toEqual([]);
    if (viewport.tier === 'A') {
      const summary = failing.map((r) => {
        const w = r.findings.find((f) => HIGH.has(f.type));
        return `${r.mode}/${r.path === 'remediation_path' ? 'rem' : 'green'}/${r.state}: ${w?.type}${w?.px ? ` ${w.px}px` : ''} (${w?.selector})`;
      });
      expect.soft(summary, `0-scroll rule on ${viewport.id}`).toEqual([]);
    }
  });
}
