import { test, expect, type Browser } from '@playwright/test';
import * as fs from 'node:fs';
import {
  activeTaskCount,
  capture,
  closedSession,
  gotoPath,
  gotoWorkspace,
  liveSession,
  markFreshEntry,
  openContext,
  REPORT_JSON,
  REPORT_MD,
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
/** `UX_AUDIT_ONLY=<regex>` measures only the states whose id matches — to re-check one screen after a fix. */
const ONLY = process.env.UX_AUDIT_ONLY ? new RegExp(process.env.UX_AUDIT_ONLY) : null;
const PRIMARY_VIEWPORT = 'laptop-1366';
/**
 * The diagnostic's own screens (opening, the seven tasks, the correction
 * round) belong to a learner who has NOT finished meeting 2. The context's
 * default record says "meeting 2 finished and approved", and with it these
 * steps measured the waiting screen ("המורה תפתח את הפעילות בקרוב.") instead
 * of the task.
 */
const M2_IN_PROGRESS = /^m2-(opening|task-\d|correction-)/;
const WAITING_TEXT = /תפתח את הפעילות בקרוב|יפתח את הפעילות בקרוב/;
const HIGH = new Set(['page-scroll-y', 'page-scroll-x', 'needs-scroll', 'clipped', 'offscreen', 'console-error']);

interface Step {
  id: string;
  /** Workspace meeting, or null for a plain URL. */
  meeting: number | null;
  url?: string;
  note?: string;
  run: (c: AuditContext) => Promise<void>;
  /** Wait before measuring (default 650ms); shorter for a screen that goes away by itself. */
  settleMs?: number;
  /** The step leaves the page reloaded or stuck: the next step navigates afresh. */
  resets?: boolean;
  /** Console errors this state is expected to log (a crash the step itself causes). */
  expectedConsole?: RegExp;
}

const noop = async () => {};

// ── store snippets (bodies of (st, api, arg) functions, run in the page) ──
// Every station opens on its opening screen (PRD 14 §ב); a step measures it only
// when it asks for it (showOpening), every other step starts past it.
const INIT = 'st.initSession(arg.meeting, arg.isASD, arg.idx); if (!arg.showOpening) api.getState().markOpeningScreenSeen();';
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
    await ws(c.page, INIT, { meeting, isASD, idx });
  };
}

/** Meeting 1's target task (s1_target_347, place 9 of the meeting) at its order in SESSION1_TASKS. */
const M1_TARGET_IDX = 8;

/**
 * Meeting 1's 347 finished: 347 built, a ten broken into the units, 347
 * written — every checklist line ticked and the done box shown (audit A2-F04:
 * the box overflowed at tablet-1024 and desktop-1920). Measured in every profile.
 */
function m1TargetDone(isASD: boolean): Step {
  return {
    id: 'm1-target-done',
    meeting: 1,
    note: '347 built, a ten broken, 347 written: the checklist done box',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 1, isASD, idx: M1_TARGET_IDX });
      await ws(cc.page, SET, {
        counts: { units: 17, tens: 3, hundreds: 3, thousands: 0 },
        hasUngrouped: true,
        conversionsByColumn: { composed: {}, decomposed: { units: true }, times: { decomposed: { units: 1 } } },
        answerDigits: { hundreds: '3', tens: '4', units: '7' },
        hasInteracted: true,
      });
    },
  };
}

/** Station 7's 2,730 (s7_g_t6) at its place in the green bank: the board opens with 1 thousand, 16 hundreds, 13 tens. */
const M7_2730_IDX = 5;

/**
 * 2,730's own toasts and cards (owner, 4.10.2026, wording round 3): the
 * longest toast over the full board, and the two cards that lead back to the
 * given blocks — B1 (undo) and B2 (trash and toolbox) — each as it opens and
 * with its right answer's feedback under it.
 */
function given2730Steps(isASD: boolean): Step[] {
  const open = async (cc: AuditContext) => {
    await ws(cc.page, INIT, { meeting: 7, isASD, idx: M7_2730_IDX });
    const id = await ws<string>(cc.page, 'return (st.dynamicTasks || [])[st.standardTaskIdx]?.id || "";');
    if (id && id !== 's7_g_t6') throw new Error(`exercise ${M7_2730_IDX + 1} of station 7 is ${id}, not s7_g_t6`);
  };
  /** A ten deleted: the given blocks changed. `undoLeadsBack` keeps the undo step (B1); without it, B2. */
  const changed = async (cc: AuditContext, undoLeadsBack: boolean) => {
    await open(cc);
    await ws(cc.page, 'st.removeBlockClick("tens");');
    if (!undoLeadsBack) await ws(cc.page, SET, { undoStack: [] });
    await ws(cc.page, 'st.openSocraticCard("hesitation_45s");');
    // The card has settled (not the hourglass, whose ✕ is an enabled button too).
    await cc.page.waitForFunction(() => {
      const st = (window as unknown as { __wsStore: { getState: () => { socraticPending?: boolean; aiSocraticHint?: unknown } } }).__wsStore.getState();
      return !st.socraticPending && Boolean(st.aiSocraticHint);
    }, undefined, { timeout: 12_000 });
    await cc.page.getByTestId('socratic-card').locator('button:not([disabled])').first().waitFor({ state: 'visible', timeout: 12_000 });
  };
  const expectCard = async (cc: AuditContext, kind: string) => {
    const got = await ws<string>(cc.page, 'return (st.aiSocraticHint && st.aiSocraticHint.cardKind) || "";');
    if (got !== kind) throw new Error(`the card on screen is "${got}", not ${kind}`);
  };
  const answerRight = async (cc: AuditContext) => {
    const right = await ws<string>(cc.page, 'const h = st.aiSocraticHint; return h && h.choices.find(c => c.isCorrect)?.textHe;');
    await cc.page.getByTestId('socratic-card').getByRole('button', { name: right }).click();
  };
  return [
    {
      id: 'm7-2730-toast-group-now',
      meeting: 7,
      note: '2730 typed on the opening board: "התשובה שכתבתם נכונה. עכשיו בכל טור…" (the longest toast of the exercise)',
      settleMs: 900,
      run: async (cc) => {
        await open(cc);
        await ws(cc.page, 'for (const [p, d] of [["units", "0"], ["tens", "3"], ["hundreds", "7"], ["thousands", "2"]]) st.setAnswerDigit(p, d); st.proceed();');
      },
    },
    {
      id: 'm7-2730-toast-by-hand',
      meeting: 7,
      note: '2/7/3 arranged by hand, 2730 typed: "שימו לב"',
      settleMs: 900,
      run: async (cc) => {
        await open(cc);
        await ws(cc.page, SET, { counts: { units: 0, tens: 3, hundreds: 7, thousands: 2 } });
        await ws(cc.page, 'for (const [p, d] of [["units", "0"], ["tens", "3"], ["hundreds", "7"], ["thousands", "2"]]) st.setAnswerDigit(p, d); st.proceed();');
      },
    },
    {
      id: 'm7-2730-card-b1',
      meeting: 7,
      note: 'a ten deleted, undo leads back: card B1 (the undo button)',
      run: async (cc) => {
        await changed(cc, true);
        await expectCard(cc, 'restore_given');
      },
    },
    {
      id: 'm7-2730-card-b1-answered',
      meeting: 7,
      note: 'card B1 with its right answer\'s feedback',
      settleMs: 900,
      run: async (cc) => {
        await changed(cc, true);
        await expectCard(cc, 'restore_given');
        await answerRight(cc);
      },
    },
    {
      id: 'm7-2730-card-b2',
      meeting: 7,
      note: 'a ten deleted, nothing to undo: card B2 (the trash and the toolbox)',
      run: async (cc) => {
        await changed(cc, false);
        await expectCard(cc, 'restore_given_how');
      },
    },
    {
      id: 'm7-2730-card-b2-answered',
      meeting: 7,
      note: 'card B2 with its right answer\'s feedback',
      settleMs: 900,
      run: async (cc) => {
        await changed(cc, false);
        await expectCard(cc, 'restore_given_how');
        await answerRight(cc);
      },
    },
  ];
}

/** Everything a learner on the green path can see (default profile). */
async function defaultSteps(c: AuditContext, scope: Scope): Promise<Step[]> {
  const steps: Step[] = [];
  const isASD = false;

  // Meeting 1 — the guided sandbox: intro steps and the refresh exercises.
  const m1Count = scope === 'smoke' ? 1 : await countTasks(c, 1, isASD);
  // Every station's opening screen (PRD 14 §ב): greeting, name and goal, read-aloud, "מתחילים".
  steps.push({ id: 'm1-opening', meeting: 1, run: async (cc) => ws(cc.page, INIT, { meeting: 1, isASD, idx: 0, showOpening: true }) });
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
    steps.push(m1TargetDone(isASD));
    steps.push({ id: 'm1-session-done', meeting: 1, run: async (cc) => ws(cc.page, SET, { flowStatus: 'sessionDone', awaitingNext: false }) });
  }

  // Meeting 2 — the diagnostic: opening screen, seven tasks, the correction round.
  steps.push({ id: 'm2-opening', meeting: 2, run: async (cc) => ws(cc.page, INIT, { meeting: 2, isASD, idx: 0, showOpening: true }) });
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
    steps.push({ id: `m${n}-opening`, meeting: n, run: async (cc) => ws(cc.page, INIT, { meeting: n, isASD, idx: 0, showOpening: true }) });
    for (let k = 0; k < count; k++) steps.push({ id: `m${n}-task-${k + 1}`, meeting: n, run: initTask(n, isASD, k) });
    steps.push({
      id: `m${n}-coaching-open`,
      meeting: n,
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: n, isASD, idx: 0 });
        await ws(cc.page, 'st.openSocraticCard("hesitation_45s");');
      },
    });
    if (n === 3) {
      // PR #142: the card waits up to 8 seconds for the AI's hint (an hourglass,
      // no text — that is what `m3-coaching-open` measures, since the fake
      // backend never answers), then shows one static card that never changes.
      steps.push({
        id: 'm3-coaching-settled',
        meeting: 3,
        note: 'the coaching card once the wait for the AI is over',
        settleMs: 9500,
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: 3, isASD, idx: 0 });
          await ws(cc.page, 'st.openSocraticCard("hesitation_45s");');
        },
      });
    }
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
        note: 'after a mistake: the "let us think" beat, then the coaching card',
        // The beat is 300ms (useWorkspaceStore: "a 300ms 'let's think' beat, then
        // the Socratic card") and the panel slides in over the next 250ms; any
        // shorter settle measured the slide. What the child is left with is the
        // card, measured once it is fully in.
        settleMs: 1500,
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
      // The soft device lock is driven from the database, as another device
      // would drive it: the page's listener compares active_device_id with its
      // own id. Setting the store flag directly was undone by the next echo.
      steps.push({
        id: 'm3-other-device',
        meeting: 3,
        note: 'the "continued on another device" lock',
        run: async (cc) => {
          await ws(cc.page, INIT, { meeting: 3, isASD, idx: 0 });
          cc.rtdb.set(`users/students/${STUDENT_UID}/active_device_id`, 'ux-audit-other-device');
        },
      });
      steps.push({
        id: 'm3-other-device-release',
        meeting: 3,
        run: async (cc) => {
          const mine = await ws<string | null>(cc.page, 'return st.activeDeviceId;');
          cc.rtdb.set(`users/students/${STUDENT_UID}/active_device_id`, mine || 'ux-audit-this-device');
        },
      });
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
    if (n === 7) steps.push(...given2730Steps(isASD));
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
  steps.push({ id: 'm8-opening', meeting: 8, run: async (cc) => ws(cc.page, INIT, { meeting: 8, isASD, idx: 0, showOpening: true }) });
  const m8Count = scope === 'smoke' ? 1 : await countTasks(c, 8, isASD);
  for (let k = 0; k < m8Count; k++) steps.push({ id: `m8-task-${k + 1}`, meeting: 8, run: initTask(8, isASD, k) });
  steps.push({
    id: 'm8-coaching-open',
    meeting: 8,
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 8, isASD, idx: 0 });
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
  // After the reflection is stored the learner stays on the quiet end screen of
  // station 8 (PR #126; PRD Module 16 §ג). Older code has no finishReflection
  // and shows the generic end card for the same flow status.
  steps.push({
    id: 'm8-finished',
    meeting: 8,
    note: 'the end screen of station 8, after the reflection was stored',
    run: async (cc) => {
      await ws(cc.page, 'if (typeof st.finishReflection === "function") st.finishReflection(); else api.setState({ flowStatus: "sessionDone", awaitingNext: false });');
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
  steps.push({ id: 'm2-opening', meeting: 2, run: async (cc) => ws(cc.page, INIT, { meeting: 2, isASD: true, idx: 0, showOpening: true }) });
  for (const t of DIAGNOSTIC) steps.push({ id: `m2-task-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'primary', 'subtask')) });
  for (const t of DIAGNOSTIC) {
    if (t.probe) steps.push({ id: `m2-correction-probe-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'correction', 'subtask')) });
    steps.push({ id: `m2-correction-retry-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'correction', 'retry')) });
  }
  for (const n of [1, 3, 4, 5, 6, 7, 8]) {
    const count = await countTasks(c, n, true);
    for (let k = 0; k < count; k++) steps.push({ id: `m${n}-task-${k + 1}`, meeting: n, run: initTask(n, true, k) });
  }
  steps.push(m1TargetDone(true));
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

/**
 * The enhanced cognitive-support profile: the adaptive addition grid (Module 10)
 * and its return tab. The grid belongs to addition exercises only (owner,
 * 1.10.2026, D7): station 4's first exercise, and station 7's addition
 * skeleton (2,▢3▢ + 1,554, the sheet with hidden-digit boxes).
 */
function enhancedSteps(): Step[] {
  const steps: Step[] = [m1TargetDone(false)];
  // Meeting 2 with the enhanced profile: tasks 4 and 5 show headings and
  // colours; task 1 is one plain box, as for every learner (owner, 4.10.2026).
  for (const t of DIAGNOSTIC) steps.push({ id: `m2-task-${t.idx + 1}`, meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(t.idx, 'primary', 'subtask')) });
  steps.push({ id: 'm2-correction-retry-1', meeting: 2, run: async (cc) => ws(cc.page, Q_FLOW, qflow(0, 'correction', 'retry')) });
  for (const [n, idx] of [[4, 0], [7, 1]] as const) {
    steps.push({
      id: `m${n}-grid-open`,
      meeting: n,
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: n, isASD: false, idx });
        await ws(cc.page, 'st.openAdditionHelper("learner");');
      },
    });
    steps.push({
      id: `m${n}-grid-tab`,
      meeting: n,
      note: 'the grid faded; the "לוח חיבור" tab that brings it back',
      run: async (cc) => {
        await ws(cc.page, INIT, { meeting: n, isASD: false, idx });
        await ws(cc.page, SET, { isAdditionHelperOpen: false, additionHelperOffered: true });
      },
    });
  }
  // The grid and the coaching card are never shown together (owner's
  // decision, 4.10.2026): the one not shown is a tab in its own place.
  steps.push({
    id: 'm4-grid-and-coaching',
    meeting: 4,
    note: 'the grid was open when the card arrived: the card, and the amber "לוח החיבור" tab beside it',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 4, isASD: false, idx: 0 });
      await ws(cc.page, 'st.openAdditionHelper("learner"); st.openSocraticCard("hesitation_45s");');
    },
  });
  steps.push({
    id: 'm4-grid-closed-and-coaching',
    meeting: 4,
    note: 'the grid was closed earlier: the card, and the amber tab still beside it',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 4, isASD: false, idx: 0 });
      await ws(cc.page, SET, { isAdditionHelperOpen: false, additionHelperOffered: true });
      await ws(cc.page, 'st.openSocraticCard("hesitation_45s");');
    },
  });
  steps.push({
    id: 'm4-coaching-longest-and-grid-tab',
    meeting: 4,
    note: 'the longest card (question, three options, a wrong answer\'s hint and the lock sentence) beside the amber tab',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 4, isASD: false, idx: 0 });
      await ws(cc.page, 'st.openAdditionHelper("learner"); st.openSocraticCard("hesitation_45s");');
      await clickWrongCardOption(cc);
    },
  });
  steps.push({
    id: 'm4-grid-and-group-buttons',
    meeting: 4,
    note: 'the narrowest columns: four of them, the grid open beside the board, and "קבצו 10 ל…" in three',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 4, isASD: false, idx: 0 });
      await ws(cc.page, 'st.openAdditionHelper("learner");');
      await ws(cc.page, SET, { counts: { units: 13, tens: 10, hundreds: 10, thousands: 1 } });
    },
  });
  steps.push({
    id: 'm4-grid-over-folded-coaching',
    meeting: 4,
    note: 'the amber tab was pressed while the card was open: the grid is shown, the card is its "כרטיס החניכה" tab',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 4, isASD: false, idx: 0 });
      await ws(cc.page, 'st.openAdditionHelper("learner"); st.openSocraticCard("hesitation_45s");');
      await cc.page.getByTestId('addition-grid-tab').click();
    },
  });
  // Last: the chat stays open once it is toggled.
  steps.push({
    id: 'm4-grid-tab-and-chat',
    meeting: 4,
    note: 'the grid\'s tab beside the board, and the chat open over the bottom-left corner',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 4, isASD: false, idx: 0 });
      await ws(cc.page, SET, { isAdditionHelperOpen: false, additionHelperOffered: true });
      await openChat(cc);
    },
  });
  steps.push({
    id: 'm4-coaching-grid-tab-and-chat',
    meeting: 4,
    note: 'the card and the amber tab, the chat over them: the card folds into the chat header\'s tab',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 4, isASD: false, idx: 0 });
      await ws(cc.page, 'st.openAdditionHelper("learner"); st.openSocraticCard("hesitation_45s");');
      await openChat(cc);
    },
  });
  steps.push({
    id: 'm4-grid-over-folded-coaching-and-chat',
    meeting: 4,
    note: 'the grid over the folded card, the chat over them: one "כרטיס החניכה" tab, in the chat header',
    run: async (cc) => {
      await ws(cc.page, INIT, { meeting: 4, isASD: false, idx: 0 });
      await ws(cc.page, 'st.openAdditionHelper("learner"); st.openSocraticCard("hesitation_45s");');
      // The chat an earlier step left open covers the amber tab: the tab first, then the chat.
      await closeChat(cc);
      await cc.page.getByTestId('addition-grid-tab').click();
      await openChat(cc);
    },
  });
  return steps;
}

async function closeChat(cc: AuditContext): Promise<void> {
  const chat = cc.page.getByRole('dialog', { name: 'הודעות עם המורה' });
  if (!(await chat.count())) return;
  await cc.page.evaluate(() => document.dispatchEvent(new CustomEvent('toggle-chat')));
  await chat.waitFor({ state: 'detached', timeout: 3000 });
}

/** The chat, open — whether or not an earlier step left it open (the toggle would close it). */
async function openChat(cc: AuditContext): Promise<void> {
  const chat = cc.page.getByRole('dialog', { name: 'הודעות עם המורה' });
  if (await chat.count()) return;
  await cc.page.evaluate(() => document.dispatchEvent(new CustomEvent('toggle-chat')));
  await chat.waitFor({ state: 'visible', timeout: 3000 });
}

/** A wrong option on the settled coaching card: its hint and the 15-second lock appear. */
async function clickWrongCardOption(cc: AuditContext): Promise<void> {
  const card = cc.page.getByTestId('socratic-card');
  await card.locator('button:not([disabled])').first().waitFor({ state: 'visible', timeout: 10_000 });
  const wrong = await ws<string>(cc.page, 'const h = st.aiSocraticHint; return h && h.choices.find(c => !c.isCorrect)?.textHe;');
  if (!wrong) throw new Error('the coaching card has no wrong option to press');
  await card.getByRole('button', { name: wrong }).click();
}

/**
 * A render crash in the child's workspace (PRD Module 1 §ב: a severe fault
 * returns the child to a quiet working state, no error text). The app-wide
 * ErrorBoundary (main.tsx) replaces the whole page, so the crash screens are
 * measured like any other. The crash itself is a store value no component can
 * render (counts = null), thrown inside React's render — the boundary's own path.
 */
const CRASH = 'try { api.setState({ counts: null }); } catch (e) { /* the render throws; the boundary catches */ }';
const QUIET_RELOADS_KEY = 'mc_quiet_recovery_reloads';
/** The crash's own log lines: React's report and the boundary's console.error. */
const CRASH_CONSOLE = /ErrorBoundary caught|The above error occurred|Cannot read propert|counts|null is not an object|undefined is not an object|Minified React error|Error: Uncaught/i;

function crashSteps(): Step[] {
  return [
    {
      id: 'crash-first',
      meeting: 3,
      note: 'the first crash: the quiet screen, before its automatic reload',
      settleMs: 350,
      resets: true,
      expectedConsole: CRASH_CONSOLE,
      run: async (cc) => {
        await gotoWorkspace(cc, 3);
        await ws(cc.page, INIT, { meeting: 3, isASD: false, idx: 0 });
        await cc.page.evaluate((key) => localStorage.removeItem(key), QUIET_RELOADS_KEY);
        // The boundary's automatic reload must come up clean, as it did when
        // the harness wiped the device copy on every load: the crash itself
        // (counts = null) is saved to this device's copy like any store change,
        // and a reload that restored it would only crash again.
        await markFreshEntry(cc.page);
        await ws(cc.page, CRASH);
      },
    },
    {
      id: 'crash-repeated',
      meeting: 3,
      note: 'the third crash within a minute: the one "נסו שוב" button, no automatic reload',
      resets: true,
      expectedConsole: CRASH_CONSOLE,
      run: async (cc) => {
        await gotoWorkspace(cc, 3);
        await ws(cc.page, INIT, { meeting: 3, isASD: false, idx: 0 });
        await cc.page.evaluate((key) => localStorage.setItem(key, JSON.stringify([Date.now() - 4000, Date.now() - 2000])), QUIET_RELOADS_KEY);
        await markFreshEntry(cc.page);
        await ws(cc.page, CRASH);
      },
    },
  ];
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
      {
        // PRD Module 6: the teacher activates the session and the lobby swaps,
        // in place and without a reload, to the station's opening screen.
        // Last of the lobby's steps: the page is in the workspace after it.
        id: 'lobby-to-opening',
        meeting: null,
        url: '/hub',
        note: 'the teacher activates station 4: the lobby becomes its opening screen',
        resets: true,
        run: async (cc) => {
          cc.rtdb.set('active_class_session', closedSession() as never);
          cc.rtdb.set('system_control/projector_mode', { active: false, projector_mode: false, projector_mode_updated_at: Date.now() });
          await cc.page.getByText('היום עוד לא התחלנו', { exact: false }).waitFor({ state: 'visible', timeout: 15_000 });
          cc.rtdb.set('active_class_session', liveSession(4) as never);
          await cc.page.getByRole('button', { name: 'מתחילים' }).waitFor({ state: 'visible', timeout: 30_000 });
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
    // The diagnostic was never finished: no path exists to approve. PR #139 gives
    // this learner a quiet "המורה תפתח את הפעילות בקרוב" screen in meetings 3–8.
    opts: { mode: 'default', path: 'green_path', approved: false, meeting2Done: false },
    steps: [
      { id: 'm3-no-path-waiting', meeting: 3, note: 'meeting 3 opened for a learner who never finished the diagnostic', run: noop },
      { id: 'm8-no-path-waiting', meeting: 8, note: 'the same learner in meeting 8', run: noop },
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
      // The public landing page ("/") is the logo and two buttons (PRD Module 1
      // §א, Screen 0), not a screen of the child's work; it is not measured.
    ],
  },
];

// ── helpers ───────────────────────────────────────────────────────────────

async function countTasks(c: AuditContext, meeting: number, isASD: boolean): Promise<number> {
  await gotoWorkspace(c, meeting);
  await ws(c.page, INIT, { meeting, isASD, idx: 0 });
  // The top bar renders a beat after the store initialises; poll rather than guess.
  let n = 0;
  for (let i = 0; i < 20 && n === 0; i++) {
    await settle(c.page, 250);
    n = await activeTaskCount(c.page);
  }
  if (n === 0) {
    const text = await c.page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160));
    throw new Error(`meeting ${meeting}: no progress dots — the bank is empty or the topbar changed; the screen says: "${text}"`);
  }
  return n;
}

async function runSteps(
  browser: Browser,
  viewport: Viewport,
  opts: ContextOptions,
  build: (c: AuditContext) => Promise<Step[]> | Step[],
  results: StateResult[]
): Promise<void> {
  let c = await openContext(browser, viewport, opts);
  const screenshotAll = viewport.id === PRIMARY_VIEWPORT || process.env.UX_AUDIT_SHOTS === 'all';
  // A page that wedges (a dev-server stall, a navigation that never settles)
  // used to stop the whole run; past this the context is thrown away and the
  // next state starts in a fresh one.
  const STEP_TIMEOUT_MS = 3 * 60_000;
  const withTimeout = <T,>(work: () => Promise<T>, ms: number, what: string): Promise<T> =>
    Promise.race([
      work(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`watchdog: ${what} took more than ${ms / 1000}s`)), ms)),
    ]);
  try {
    let steps: Step[];
    try {
      steps = await build(c);
    } catch (err) {
      // Building the catalogue navigates (to count the exercises); a failure
      // there is recorded like any other, and the remaining groups still run.
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        viewport: viewport.id,
        tier: viewport.tier,
        mode: opts.mode,
        path: opts.path,
        meeting: null,
        state: '_setup',
        url: c.page.url(),
        fonts: { heebo: false, rubik: false, assistant: false },
        findings: [],
        consoleErrors: c.drainConsole(),
        error: message.split('\n')[0].slice(0, 300),
      });
      // eslint-disable-next-line no-console
      console.log(`  ✗ ${viewport.id} ${opts.mode}/${opts.path} setup: ${message.split('\n')[0].slice(0, 300)}`);
      return;
    }
    let currentMeeting: number | null | undefined;
    let currentRecord: string | undefined;
    let currentUrl: string | undefined;
    for (const step of steps) {
      if (ONLY && !ONLY.test(step.id)) continue;
      const label = `${opts.mode}/${opts.path}/${step.id}`;
      try {
        await withTimeout(
          async () => {
            const inProgress = step.meeting === 2 && M2_IN_PROGRESS.test(step.id);
            const recordKey = inProgress ? 'm2-in-progress' : 'default';
            if (step.meeting !== null && (step.meeting !== currentMeeting || recordKey !== currentRecord)) {
              await gotoWorkspace(c, step.meeting, inProgress ? { meeting2Done: false } : {});
              currentMeeting = step.meeting;
              currentRecord = recordKey;
              currentUrl = undefined;
            } else if (step.meeting === null && (step.url !== currentUrl || step.id.startsWith('login'))) {
              await gotoPath(c, step.url || '/');
              currentUrl = step.url;
              currentMeeting = undefined;
            }
            c.drainConsole();
            await step.run(c);
            if (inProgress && step.id !== 'm2-opening') {
              // A task step that shows the waiting screen measured the wrong screen: fail it.
              await c.page.waitForTimeout(400);
              const body = await c.page.evaluate(() => document.body.innerText || '');
              if (WAITING_TEXT.test(body)) throw new Error(`${step.id} shows the waiting screen, not the task`);
            }
            results.push(
              await capture({
                viewport,
                ctx: c,
                meeting: step.meeting,
                state: step.id,
                note: step.note,
                screenshotAll,
                settleMs: step.settleMs,
                expectedConsole: step.expectedConsole,
              })
            );
          },
          STEP_TIMEOUT_MS,
          label
        );
        if (step.resets) {
          currentMeeting = undefined;
          currentUrl = undefined;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('skip:')) continue;
        let url = '';
        try {
          url = c.page.url();
        } catch {
          /* the page may be gone */
        }
        results.push({
          viewport: viewport.id,
          tier: viewport.tier,
          mode: opts.mode,
          path: opts.path,
          meeting: step.meeting,
          state: step.id,
          note: step.note,
          url,
          fonts: { heebo: false, rubik: false, assistant: false },
          findings: [],
          consoleErrors: c.drainConsole(),
          error: message.split('\n')[0].slice(0, 200),
        });
        // eslint-disable-next-line no-console
        console.log(`  ✗ ${viewport.id} ${label}: ${message.split('\n')[0]}`);
        // A navigation error leaves the page in an unknown state: force a reload next step.
        currentMeeting = undefined;
        currentRecord = undefined;
        currentUrl = undefined;
        if (message.startsWith('watchdog:')) {
          // The context is wedged: drop it (bounded — closing can hang too) and go on in a new one.
          await withTimeout(() => c.context.close(), 20_000, 'closing the wedged context').catch(() => undefined);
          c = await openContext(browser, viewport, opts);
        }
      }
    }
  } finally {
    await withTimeout(() => c.context.close(), 20_000, 'closing the context').catch(() => undefined);
  }
}

// ── the run ───────────────────────────────────────────────────────────────

// One worker (config) keeps the viewports sequential; NOT `serial` mode, which
// would skip every remaining viewport the moment one of them fails the gate.
// The report is reset once per run, in global-setup.ts — a restarted worker
// must not wipe the viewports already measured.

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
    await runSteps(browser, viewport, { mode: 'default', path: 'green_path', approved: true }, () => crashSteps(), results);

    const report = checkpoint();
    const failing = results.filter((r) => r.findings.some((f) => HIGH.has(f.type)));
    const unreachable = results.filter((r) => r.error);
    // The measuring tests never fail: Playwright restarts its worker after a
    // failed test, and the next viewport paid for that with a cold browser.
    // The verdict is the last test below, on the whole report.
    // eslint-disable-next-line no-console
    console.log(
      `${viewport.id}: ${results.length} states, ${failing.length} with scroll/clipping/offscreen, ${unreachable.length} unreachable → ${report.results.length} in report`
    );
  });
}

test('the 0-scroll gate holds on every tier-A viewport', () => {
  const file = REPORT_JSON;
  const report = JSON.parse(fs.readFileSync(file, 'utf8')) as { results: StateResult[] };
  const unreachable = report.results.filter((r) => r.error).map((r) => `${r.viewport} ${r.mode}/${r.state}: ${r.error}`);
  const failing = report.results
    .filter((r) => r.tier === 'A' && r.findings.some((f) => HIGH.has(f.type)))
    .map((r) => {
      const w = r.findings.filter((f) => HIGH.has(f.type)).sort((a, b) => (b.px || 0) - (a.px || 0))[0];
      return `${r.viewport} ${r.mode}/${r.path === 'remediation_path' ? 'rem' : 'green'}/${r.state}: ${w.type}${w.px ? ` ${w.px}px` : ''} (${w.selector})`;
    });
  // eslint-disable-next-line no-console
  console.log(`gate: ${report.results.length} measurements, ${failing.length} tier-A failures, ${unreachable.length} unreachable — ${REPORT_MD}`);
  expect.soft(unreachable, 'states the audit could not reach').toEqual([]);
  expect(failing, "owner's rule: no page scroll, no inner scroll, nothing clipped or off-screen, on every tier-A viewport").toEqual([]);
});
