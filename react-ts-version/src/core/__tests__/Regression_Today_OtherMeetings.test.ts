/**
 * Regression audit, 25.9.2026 — did the meeting 1 work of PRs #113, #114 and
 * 914ff7b break or slow down meetings 2–8?
 *
 * Everything here drives the real stores. The Realtime Database client is the
 * real SDK, kept offline on a demo namespace (127.0.0.1, never production):
 * local writes, the local events they raise and snapshot.val() are the SDK's
 * own, so the cost of one store change is measured, not modelled.
 *
 * Set RTDB_EMULATOR_HOST=127.0.0.1:9000 (a running Database emulator) to run
 * the one scenario that needs a server: the write → ack → write cycle.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const rtdb = vi.hoisted(() => ({
  /** Every update() the app makes, with the path it wrote to. */
  updates: [] as Array<{ path: string; value: Record<string, any> }>,
  /** onValue callbacks invoked (each one runs snapshot.val() in the app). */
  valueEvents: 0,
}));

// The server's pure metric functions are imported below; CI runs this suite
// without the functions' packages, so firebase-admin is stubbed (unused by them).
vi.mock('firebase-admin', () => ({ default: {}, firestore: { FieldValue: {} } }));

vi.mock('firebase/database', async () => {
  const actual = await vi.importActual<typeof import('firebase/database')>('firebase/database');
  return {
    ...actual,
    update: (r: any, value: any) => {
      rtdb.updates.push({ path: String(r?._path ?? ''), value });
      return actual.update(r, value);
    },
    onValue: (q: any, cb: any, ...rest: any[]) =>
      (actual.onValue as any)(q, (snap: any) => {
        rtdb.valueEvents++;
        return cb(snap);
      }, ...rest),
  };
});

vi.mock('@/infrastructure/firebase', async () => {
  const { initializeApp } = await vi.importActual<typeof import('firebase/app')>('firebase/app');
  const db = await vi.importActual<typeof import('firebase/database')>('firebase/database');
  const app = initializeApp(
    { apiKey: 'demo', projectId: 'demo-regression-audit', appId: '1:1:web:1', databaseURL: 'http://127.0.0.1:9/?ns=demo-regression-audit' },
    'regression-audit'
  );
  const database = db.getDatabase(app);
  const emulator = process.env.RTDB_EMULATOR_HOST;
  if (emulator) {
    const [host, port] = emulator.split(':');
    db.connectDatabaseEmulator(database, host, Number(port));
  } else {
    db.goOffline(database);
  }
  return {
    database,
    firestore: {},
    db: {},
    functions: {},
    auth: {},
    authReady: Promise.resolve(false),
    serverNow: () => Date.now(),
    fetchServerClockOffset: async () => 0,
  };
});

import { ref, set, onValue, onDisconnect } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import {
  useWorkspaceStore,
  getActiveTasks,
  getCurrentQTask,
  selectCanProceed,
} from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { getSessionTasks, getHardcodedCatalogBanks, SESSION1_TASKS, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { EMPTY_COUNTS, MAX_VISIBLE_BLOCKS, type Place, type PlaceCounts } from '@/core/placeValue';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { RepresentationTask } from '@/features/workspace/tasks/RepresentationTask';
import * as serverMetrics from '../../../../functions/src/meetingMetrics';

/* ── helpers ─────────────────────────────────────────────────────────────── */

const STUDENT = 'student_user12';
const PLACES: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
const UNIT: Record<Place, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };
const ws = () => useWorkspaceStore.getState();
const digitOf = (n: number, p: Place) => Math.floor(Math.abs(n) / UNIT[p]) % 10;
const placesOf = (n: number): Place[] => PLACES.slice(0, String(Math.abs(n)).length);
const current = (): SessionTask => getActiveTasks(ws())[ws().standardTaskIdx];
const svc = firebaseSyncService as any;

function signIn(path: 'green_path' | 'remediation_path' = 'green_path') {
  useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true } as any);
  useStore.setState((s) => ({
    students: { ...s.students, [STUDENT]: { ...(s.students[STUDENT] ?? {}), pedagogicalPath: path } as any },
  }));
}

function startMeeting(meeting: 2 | 3 | 4 | 5 | 6 | 7 | 8, path: 'green_path' | 'remediation_path' = 'green_path') {
  signIn(path);
  ws().resetWorkspace();
  ws().initSession(meeting, false);
}

/** A block from the palette into its own column, n times. */
function drop(place: Place, n = 1) {
  for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: place, target: { kind: 'column', place } });
}
function build(n: number) {
  for (const p of PLACES) drop(p, digitOf(n, p));
}
function typeResult(n: number, skip: Place[] = []) {
  for (const p of placesOf(n)) if (!skip.includes(p)) ws().setAnswerDigit(p, String(digitOf(n, p)));
}
/** Decompose one block of the next column up into `place` (chained through empty columns). */
function borrowInto(place: Place) {
  const higher = PLACES[PLACES.indexOf(place) + 1];
  if (ws().counts[higher] === 0) borrowInto(higher);
  ws().splitBlockClick(higher);
}

/** Exercises whose board asks for more than 30 blocks in one column (the cap is now MAX_VISIBLE_BLOCKS ≥ 45). */
const unbuildable: string[] = [];

/** What a child who knows the answer does on the screen, for every task shape in meetings 3–8. */
function solve(t: SessionTask) {
  const noBlocks = ws().sessionNumber === 8;
  if (t.choices?.length) {
    const right = t.choices.find((c) => c.correct === true);
    if (!right) throw new Error(`${t.id}: no choice marked correct`);
    ws().selectChoice(right.id);
    return;
  }
  switch (t.type) {
    case 'representation': {
      const req: PlaceCounts = { ...EMPTY_COUNTS, ...(t.requiredCounts ?? {}) };
      for (const p of PLACES) drop(p, req[p]);
      if (!PLACES.every((p) => ws().counts[p] === req[p])) {
        // The drops stopped at the column cap. Record it, and place the board
        // directly so the rest of the meeting can still be checked.
        unbuildable.push(t.id);
        useWorkspaceStore.setState({ counts: req, hasInteracted: true });
      }
      typeResult(t.numberA!);
      return;
    }
    case 'flexible_decomp': {
      build(t.numberA!);
      if (t.requireEvenTens && ws().counts.tens % 2 === 1) ws().splitBlockClick('tens');
      ws().addRepresentation();
      const top = (['thousands', 'hundreds'] as Place[]).find((p) => ws().counts[p] > 0)!;
      ws().splitBlockClick(top);
      ws().addRepresentation();
      return;
    }
    case 'missing_element': {
      build(t.numberB ?? 0);
      ws().setProbeAnswer(String(t.correctAnswer));
      return;
    }
    case 'vertical_addition':
    case 'addition_simple': {
      const a = t.numberA!;
      const b = t.numberB!;
      const target = t.isSubtraction ? a - b : a + b;
      if (!noBlocks) {
        if (t.isSubtraction) {
          build(a);
          for (const p of PLACES) {
            const need = digitOf(b, p);
            while (ws().counts[p] < need) borrowInto(p);
            for (let i = 0; i < need; i++) ws().removeBlockClick(p);
          }
        } else {
          build(a);
          build(b);
          for (const p of ['units', 'tens', 'hundreds'] as Place[]) while (ws().counts[p] >= 10) ws().groupColumnClick(p);
          let carry = 0;
          for (let i = 0; i < 3; i++) {
            carry = digitOf(a, PLACES[i]) + digitOf(b, PLACES[i]) + carry >= 10 ? 1 : 0;
            if (carry) ws().setCarryDigit(PLACES[i + 1], '1');
          }
        }
      }
      for (const which of ['a', 'b'] as const) {
        for (const p of t.hiddenDigits?.[which] ?? []) ws().setOperandDigit(which, p, String(digitOf(which === 'a' ? a : b, p)));
      }
      typeResult(target, t.revealedResultDigits ?? []);
      return;
    }
  }
  throw new Error(`no solver for ${t.id} (${t.type})`);
}

/**
 * The value as the app reads it back after a reload: written to the real
 * database client and read with onValue, so the SDK's own normalisation
 * applies (empty objects and nulls dropped, dense arrays kept).
 */
function throughDatabase(value: unknown): any {
  const r = ref(database, `audit_roundtrip/${Math.random().toString(36).slice(2)}`);
  void set(r, value).catch(() => {});
  let out: any;
  const off = onValue(r, (snap) => {
    out = snap.val();
  });
  off();
  return out;
}

/* ── 1. every meeting 3–8 still runs to its end ─────────────────────────── */

describe('meetings 3–8: the seven compulsory exercises still complete, in order, through the real store', () => {
  for (const meeting of [3, 4, 5, 6, 7, 8] as const) {
    for (const path of ['green_path', 'remediation_path'] as const) {
      it(`meeting ${meeting}, ${path}`, () => {
        if (meeting === 8) vi.useFakeTimers();
        try {
          startMeeting(meeting, path);
          const bank = getSessionTasks(meeting, path);
          expect(bank).toHaveLength(7);
          unbuildable.length = 0;
          const refusals: string[] = [];
          const unsub = useWorkspaceStore.subscribe((s, prev) => {
            if (s.feedback && s.feedback !== prev.feedback && s.feedback.correct === false) {
              refusals.push(`${current()?.id}: ${s.feedback.title} / ${s.feedback.sub}`);
            }
          });
          for (let i = 0; i < 7; i++) {
            const t = current();
            expect(t.id).toBe(bank[i].id);
            // A new exercise opens on an empty board with no history (continuesBoard / initialCounts are meeting 1's only).
            expect(ws().counts, `${t.id} opens on an empty board`).toEqual(EMPTY_COUNTS);
            expect(ws().undoStack, `${t.id} opens with no undo history`).toEqual([]);
            solve(t);
            expect(selectCanProceed(ws()), `${t.id}: "התקדם" is enabled`).toBe(true);
            ws().proceed();
            if (i < 6) expect(ws().standardTaskIdx, `${t.id} advanced`).toBe(i + 1);
          }
          unsub();
          expect(refusals).toEqual([]);
          // Every exercise of the bank can be built (the column cap follows מסמך 03 §3.3).
          expect(unbuildable).toEqual([]);
          if (meeting <= 7) {
            expect(ws().flowStatus).toBe('choice_branch');
          } else {
            vi.advanceTimersByTime(3000);
            expect(ws().flowStatus).toBe('reflection');
          }
        } finally {
          vi.useRealTimers();
        }
      });
    }
  }

  it('meeting 3 exercise 3 can be built: 45 in one column fits under the cap (מסמך 03 §3.3)', () => {
    for (const path of ['green_path', 'remediation_path'] as const) {
      startMeeting(3, path);
      solve(current());
      ws().proceed();
      solve(current());
      ws().proceed();
      const t = current(); // s3_r_t3: 450 as 45 tens / s3_g_t3: 4,500 as 45 hundreds
      const place = PLACES.find((p) => (t.requiredCounts?.[p] ?? 0) > 0)!;
      expect(t.requiredCounts?.[place]).toBe(45);
      drop(place, 45); // from the palette…
      expect(MAX_VISIBLE_BLOCKS).toBeGreaterThanOrEqual(45);
      expect(ws().counts[place]).toBe(45);
      typeResult(t.numberA!);
      ws().proceed();
      expect(ws().standardTaskIdx, `${t.id} completes`).toBe(3);
    }
  });

  it('no exercise of meetings 3–8 (compulsory or branch) carries a meeting 1 flag', () => {
    const banks = getHardcodedCatalogBanks().filter((b) => b.session_number >= 3);
    const branch = ([3, 4, 5, 6, 7] as const).flatMap((n) =>
      (['reinforcement', 'challenge'] as const).flatMap((k) =>
        (['green_path', 'remediation_path'] as const).flatMap((p) => getSessionBranchTasks(n, k, p))
      )
    );
    const all = [...banks.flatMap((b) => b.tasks), ...branch];
    expect(all.length).toBeGreaterThan(80);
    for (const t of all) {
      expect(t.hideRequiredCounts, t.id).toBeUndefined();
      expect(t.initialCounts, t.id).toBeUndefined();
      expect(t.continuesBoard, t.id).toBeUndefined();
      // the new "do the conversion yourself" gate is inside the representation branch only
      if (t.type === 'representation') {
        expect(t.requiresGrouping, t.id).toBeUndefined();
        expect(t.requiresUngrouping, t.id).toBeUndefined();
      }
    }
  });
});

/* ── 2. meeting 2 ───────────────────────────────────────────────────────── */

describe('meeting 2: the diagnostic', () => {
  it('runs its seven tasks in order to the waiting screen', () => {
    vi.useFakeTimers();
    try {
      startMeeting(2);
      const seen: string[] = [];
      for (let guard = 0; guard < 30 && ws().flowStatus !== 'sessionDone'; guard++) {
        const q = getCurrentQTask(ws().qflow);
        if (!q) break;
        if (seen[seen.length - 1] !== q.id) seen.push(q.id);
        typeResult(q.correctAnswer!);
        ws().proceed();
        vi.advanceTimersByTime(3000);
      }
      vi.advanceTimersByTime(5000); // the closing "סיימתם!" hands over to the waiting screen
      expect(seen).toEqual(DIAGNOSTIC_TASKS.map((t) => t.id));
      expect(ws().flowStatus).toBe('sessionDone');
      // startTask's new initial-board / kept-board code is fenced off for meeting 2
      expect(ws().counts).toEqual(EMPTY_COUNTS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a press on the empty trash in meetings 2–8 changes nothing and records nothing (only meeting 1 records it)', () => {
    for (const meeting of [2, 4, 8] as const) {
      startMeeting(meeting);
      const before = rtdb.updates.length;
      const stack = ws().undoStack;
      ws().clearBoard();
      const written = rtdb.updates.slice(before).filter((u) => u.value?.lastAction === 'ניקוי הלוח בפח האשפה');
      expect(written, `meeting ${meeting}: no BOARD_CLEARED`).toEqual([]);
      expect(ws().undoStack).toBe(stack);
      expect(ws().counts).toEqual(EMPTY_COUNTS);
    }
  });
});

/* ── 3. undo after a reload through the database ────────────────────────── */

describe('undo after a reload through the database (Module 11), meetings 3–8', () => {
  it('meeting 4: one action per press, in reverse — block, carry, the FIRST digit (its empty input was dropped by the database), block', () => {
    startMeeting(4);
    drop('tens'); // frame 1: no input
    ws().setAnswerDigit('units', '3'); // frame 2: input before it was empty — the database drops it
    ws().setCarryDigit('tens', '1'); // frame 3
    drop('units'); // frame 4: no input
    const saved = throughDatabase(svc.getSyncableWorkspaceState());
    expect(saved.undoStack).toHaveLength(4);
    expect(saved.undoStack[1].answerDigits).toBeUndefined();
    expect(saved.undoStack[1].hasInput).toBe(true);

    ws().resetWorkspace();
    ws().restoreSession(saved);
    expect(ws().counts).toEqual({ ...EMPTY_COUNTS, tens: 1, units: 1 });

    ws().undo();
    expect(ws().counts).toEqual({ ...EMPTY_COUNTS, tens: 1 });
    expect(ws().answerDigits.units).toBe('3');
    expect(ws().carryDigits.tens).toBe('1');
    ws().undo();
    expect(ws().carryDigits.tens ?? '').toBe('');
    expect(ws().answerDigits.units).toBe('3');
    ws().undo();
    expect(ws().answerDigits.units ?? '').toBe('');
    expect(ws().counts.tens).toBe(1);
    ws().undo();
    expect(ws().counts).toEqual(EMPTY_COUNTS);
    expect(ws().undoCount).toBe(4);
  });

  it('meeting 5 with a borrow: the decomposition and the removals undo one by one after a reload', () => {
    startMeeting(5); // s5_g_t1: 5,432 − 2,118
    build(5432);
    ws().splitBlockClick('tens');
    ws().removeBlockClick('units');
    const beforeUndo = { ...ws().counts };
    const saved = throughDatabase(svc.getSyncableWorkspaceState());
    ws().resetWorkspace();
    ws().restoreSession(saved);
    expect(ws().counts).toEqual(beforeUndo);
    ws().undo();
    expect(ws().counts).toEqual({ ...EMPTY_COUNTS, thousands: 5, hundreds: 4, tens: 2, units: 12 });
    ws().undo();
    expect(ws().counts).toEqual({ ...EMPTY_COUNTS, thousands: 5, hundreds: 4, tens: 3, units: 2 });
  });

  it('meeting 8: typed digits undo after a reload, and three undos still open the card (Module 12 §א)', async () => {
    startMeeting(8);
    ws().setAnswerDigit('units', '1');
    ws().setAnswerDigit('tens', '2');
    ws().setAnswerDigit('hundreds', '3');
    const saved = throughDatabase(svc.getSyncableWorkspaceState());
    ws().resetWorkspace();
    ws().restoreSession(saved);
    ws().undo();
    expect(ws().answerDigits.hundreds ?? '').toBe('');
    expect(ws().answerDigits.tens).toBe('2');
    ws().undo();
    ws().undo();
    expect(ws().answerDigits.units ?? '').toBe('');
    await new Promise((r) => setTimeout(r, 0));
    expect(ws().socraticTriggerReason).toBe('consecutive_undos_3');
  });

  it('a hidden operand digit survives a reload, and undo takes back the answer digit only', () => {
    // Skeleton exercises (meetings 4–8): operandDigits is in the sync payload
    // now, alongside the undo frames, so a reload keeps the typed hidden digit.
    startMeeting(7, 'remediation_path');
    solve(current()); // s7_r_t1 is flexible; move on to the skeleton s7_r_t2
    ws().proceed();
    expect(current().id).toBe('s7_r_t2'); // 31▢ + 254 = 568, hidden: a.units
    ws().setOperandDigit('a', 'units', '4');
    ws().setAnswerDigit('units', '8');
    const saved = throughDatabase(svc.getSyncableWorkspaceState());
    expect(saved.operandDigits?.a?.units).toBe('4');
    ws().resetWorkspace();
    ws().restoreSession(saved);
    expect(ws().operandDigits.a.units).toBe('4'); // kept across the reload
    ws().undo(); // undoes the answer digit…
    expect(ws().answerDigits.units ?? '').toBe('');
    expect(ws().operandDigits.a.units).toBe('4'); // …and the hidden digit stays
  });
});

/* ── 4. coaching in subtraction with a borrow (meetings 5–6) ────────────── */

const isGroupCard = (h: { questionHe?: string; tts_text?: string } | null) =>
  Boolean(h && /לקבץ|נקבץ/.test(`${h.questionHe ?? ''} ${h.tts_text ?? ''}`));

describe('live coaching card (SocraticEngine.analyzeLiveBoardState), meetings 3–7', () => {
  const task = (meeting: 3 | 4 | 5 | 6 | 7, path: 'green_path' | 'remediation_path', id: string) =>
    getSessionTasks(meeting, path).find((t) => t.id === id)!;
  const card = (t: SessionTask, counts: Partial<PlaceCounts>) =>
    SocraticEngine.getSynchronousTaskHint(t, { ...EMPTY_COUNTS, ...counts });

  it('meeting 5, 5,432 − 2,118: the deficit card before the borrow, never "group them back" after it', () => {
    const t = task(5, 'green_path', 's5_g_t1');
    const before = card(t, { thousands: 5, hundreds: 4, tens: 3, units: 2 });
    expect(before.questionHe).toContain('יש לנו 2 יחידות בלוח ואנו צריכים להחסיר 8');
    const afterBorrow = card(t, { thousands: 5, hundreds: 4, tens: 2, units: 12 });
    expect(isGroupCard(afterBorrow)).toBe(false);
    const afterRemoving = card(t, { thousands: 5, hundreds: 4, tens: 2, units: 4 });
    expect(isGroupCard(afterRemoving)).toBe(false);
  });

  it('meeting 6, 300 − 142 (double borrow through a zero): no "group back" at either step', () => {
    const t = task(6, 'remediation_path', 's6_r_t4');
    const afterHundred = card(t, { hundreds: 2, tens: 10 });
    expect(isGroupCard(afterHundred)).toBe(false);
    expect(afterHundred.questionHe).toContain('יש לנו 0 יחידות'); // the next step: a ten into units
    const afterTen = card(t, { hundreds: 2, tens: 9, units: 10 });
    expect(isGroupCard(afterTen)).toBe(false);
  });

  it('additions (meeting 4) still get the grouping card when a column overflows', () => {
    const t = task(4, 'green_path', 's4_g_t1');
    expect(isGroupCard(card(t, { thousands: 1, hundreds: 5, tens: 6, units: 13 }))).toBe(true);
  });

  it('meeting 3 representations: no grouping card for the column the task fills past 9; still one for another column', () => {
    const t2 = task(3, 'remediation_path', 's3_r_t2'); // 2 hundreds, 14 tens
    expect(isGroupCard(card(t2, { hundreds: 2, tens: 14 }))).toBe(false);
    const t1 = task(3, 'remediation_path', 's3_r_t1'); // 3 hundreds, 4 tens
    expect(isGroupCard(card(t1, { hundreds: 3, tens: 14 }))).toBe(true);
  });
});

/* ── 5. meeting 3 and 7 representation tasks still show and check their box ─ */

describe('representation tasks outside meeting 1 (RepresentationTask.tsx, proceed)', () => {
  // Server rendering reads zustand's getInitialState() (useSyncExternalStore's
  // server snapshot), so the board is placed on the initial state object for
  // the duration of one render.
  const html = (t: SessionTask, counts: Partial<PlaceCounts> = {}) => {
    const init = useWorkspaceStore.getInitialState() as any;
    const saved = init.counts;
    init.counts = { ...EMPTY_COUNTS, ...counts };
    try {
      return renderToStaticMarkup(React.createElement(RepresentationTask, { task: t }));
    } finally {
      init.counts = saved;
    }
  };

  it('meeting 3 and 7 tasks render "בנו בלוח בדיוק" and "בלוח כרגע"; the board matching turns it into "✓ הלוח תואם"', () => {
    const reps = [
      ...getSessionTasks(3, 'green_path'),
      ...getSessionTasks(3, 'remediation_path'),
      ...getSessionTasks(7, 'green_path'),
      ...getSessionTasks(7, 'remediation_path'),
    ].filter((t) => t.type === 'representation');
    expect(reps.length).toBeGreaterThanOrEqual(15);
    signIn();
    for (const t of reps) {
      const empty = html(t);
      expect(empty, t.id).toContain('בנו בלוח בדיוק:');
      expect(empty, t.id).toContain('בלוח כרגע:');
      expect(empty, t.id).not.toContain('משימות החקר שלך'); // no meeting 1 checklist
      expect(html(t, t.requiredCounts), t.id).toContain('✓ הלוח תואם');
    }
    // …and meeting 1's target task is the one without it
    expect(html(SESSION1_TASKS.find((t) => t.id === 's1_target_347')!)).not.toContain('בנו בלוח בדיוק:');
  });

  it('meeting 3: a wrong board is refused with the exact board spelled out; the right one advances', () => {
    startMeeting(3, 'remediation_path'); // s3_r_t1: 340 as 3 hundreds and 4 tens
    drop('hundreds', 3);
    drop('tens', 3);
    typeResult(340);
    expect(selectCanProceed(ws())).toBe(true);
    ws().proceed();
    expect(ws().feedback?.sub).toContain('הלוח צריך להציג בדיוק: 3 מאות ו-4 עשרות');
    expect(ws().standardTaskIdx).toBe(0);
    drop('tens');
    ws().proceed();
    expect(ws().standardTaskIdx).toBe(1);
  });
});

/* ── 6. the server's report numbers for meetings 2–8 (isExerciseEvent) ───── */

describe('report numbers for meetings 2–8 are unchanged by MEETING1_TOOL_STEPS', () => {
  // The rule before 914ff7b, verbatim.
  const oldIsExerciseEvent = (ev: any) => {
    const type = ev?.event_type;
    return type !== 'SESSION_START' && type !== 'REFLECTION_SUBMITTED';
  };

  function meetingEvents(meeting: number, ids: string[]) {
    const out: Record<string, any>[] = [];
    let t = 1_000;
    const ev = (exercise_id: string, event_type: string, details: Record<string, any> = {}) =>
      out.push({ exercise_id, event_type, details, client_timestamp: (t += 1_000), session_id: `session_${meeting}_student_12` });
    ev(`ex_${meeting}_01`, 'SESSION_START', { session_number: meeting });
    ids.forEach((id, i) => {
      ev(id, 'PROBLEM_LOAD');
      ev(id, 'BLOCK_DRAG_COMPLETE');
      ev(id, 'DIGIT_ENTERED', { digit_value: 3, is_correct: i % 3 !== 0 });
      if (i % 2) ev(id, 'UNDO_EXECUTED', { undo_stack_depth_before: 1 });
      if (i % 4 === 1) ev(id, 'HESITATION_DETECTED', { hesitation_seconds: 45 });
      if (i % 5 !== 4) ev(id, 'PROBLEM_COMPLETE', { total_duration_ms: 1, undo_count: 0, error_count: 0 });
    });
    if (meeting === 8) ev(`ex_${meeting}_01`, 'REFLECTION_SUBMITTED');
    return out;
  }

  it('the same events count as exercises, and attempted/completed are what they were', () => {
    const streams: Array<[number, string[]]> = [[2, DIAGNOSTIC_TASKS.map((t) => t.id)]];
    for (const n of [3, 4, 5, 6, 7, 8] as const) {
      for (const p of ['green_path', 'remediation_path'] as const) {
        const extra = n <= 7 ? getSessionBranchTasks(n, 'challenge', p).map((t) => t.id) : [];
        streams.push([n, [...getSessionTasks(n, p).map((t) => t.id), ...extra]]);
      }
    }
    for (const [meeting, ids] of streams) {
      const events = meetingEvents(meeting, ids);
      for (const e of events) expect(serverMetrics.isExerciseEvent(e), `${meeting}/${e.exercise_id}/${e.event_type}`).toBe(oldIsExerciseEvent(e));
      const summary = serverMetrics.summarizeMeeting(events);
      const oldAttempted = new Set(events.filter((e) => e.exercise_id && oldIsExerciseEvent(e)).map((e) => e.exercise_id));
      const oldCompleted = new Set(events.filter((e) => e.event_type === 'PROBLEM_COMPLETE' && e.exercise_id).map((e) => e.exercise_id));
      expect(summary.exercises_attempted, `meeting ${meeting}`).toBe(oldAttempted.size);
      expect(summary.exercises_completed, `meeting ${meeting}`).toBe(oldCompleted.size);
      expect(Object.keys(serverMetrics.computeExerciseOutcomes(events)).sort()).toEqual([...oldAttempted].sort());
    }
  });
});

/* ── 7. performance of the in-lesson sync (FirebaseSyncService subscriber) ── */

/** The in-lesson payload exactly as the subscriber built it before 914ff7b (no JSON pass, no undo frames). */
function payloadBeforeToday() {
  const state = ws();
  const currentTask = getActiveTasks(state)[state.standardTaskIdx] || null;
  return {
    sessionNumber: state.sessionNumber,
    isASD: state.isASD,
    standardTaskIdx: state.standardTaskIdx,
    selectedBranch: state.selectedBranch ?? null,
    qflow: state.qflow,
    flowStatus: state.flowStatus,
    counts: state.counts,
    answerDigits: state.answerDigits,
    carryDigits: state.carryDigits,
    probeAnswer: state.probeAnswer,
    selectedChoiceId: state.selectedChoiceId,
    keyboardState: state.keyboardState,
    undoCount: state.undoCount,
    hesitationCount: state.hesitationCount,
    hasInteracted: state.hasInteracted,
    helpRequested: Boolean(state.helpRequested),
    activeTask: currentTask
      ? {
          id: currentTask.id,
          titleHe: currentTask.titleHe,
          instructionHe: currentTask.instructionHe,
          numberA: currentTask.numberA ?? null,
          numberB: currentTask.numberB ?? null,
          isSubtraction: currentTask.isSubtraction ?? false,
        }
      : null,
  };
}

const MY_DEVICE = 'dev_regression_audit';
const nest = { depth: 0, max: 0, runaway: false, limit: 150 };
const pageListeners: Array<() => void> = [];

/**
 * The three listeners StudentWorkspacePage mounts on users/students/{id}
 * (soft device lock ~l.196, live adaptations ~l.558, teacher reset ~l.611),
 * with their store writes. The device-lock one calls
 * setSupersededByOtherDevice(false) on every event, which notifies every
 * store subscriber even though nothing changed. A depth guard stops a
 * runaway before the stack does.
 */
function mountWorkspacePageListeners() {
  const node = ref(database, `users/students/${STUDENT}`);
  const guarded = (fn: () => void) => {
    if (nest.depth >= nest.limit) {
      nest.runaway = true;
      return;
    }
    nest.depth++;
    nest.max = Math.max(nest.max, nest.depth);
    try {
      fn();
    } finally {
      nest.depth--;
    }
  };
  pageListeners.push(
    onValue(node, (snap) => {
      if (!snap.exists()) return;
      const val = snap.val();
      if (val?.active_device_id === MY_DEVICE) {
        guarded(() => {
          ws().setSupersededByOtherDevice(false);
          onDisconnect(ref(database, `users/students/${STUDENT}/isOnline`)).set(false).catch(() => {});
          onDisconnect(ref(database, `users/students/${STUDENT}/lastPing`)).set(0).catch(() => {});
        });
      }
    })
  );
  pageListeners.push(
    onValue(node, (snap) => {
      if (!snap.exists()) return;
      const val = snap.val() || {};
      const isLocked = val.isBoardLocked !== undefined ? Boolean(val.isBoardLocked) : false;
      if (isLocked !== ws().isBoardLocked) useWorkspaceStore.setState({ isBoardLocked: isLocked });
      if (val.pendingAdaptation !== undefined) guarded(() => useWorkspaceStore.setState({ pendingAdaptation: val.pendingAdaptation || null }));
      useStore.setState((s) => ({
        students: { ...s.students, [STUDENT]: { ...(s.students[STUDENT] || {}), additionBoardEnabled: Boolean(val.additionBoardEnabled) } as any },
      }));
    })
  );
  pageListeners.push(
    onValue(node, (snap) => {
      if (snap.exists()) void snap.val()?.forceReload;
    })
  );
}

/** A learner record as it looks after some recorded meetings (Module 21 stores the rrweb chunks under it). */
function seedRecord(chunks: number, pendingAdaptation = false) {
  const chunkMap: Record<string, string> = {};
  const meta: Record<string, any> = {};
  for (let i = 0; i < chunks; i++) {
    const k = `-Nchunk${String(i).padStart(7, '0')}`;
    chunkMap[k] = `[{"type":3,"data":{"source":1,"positions":[{"x":${i},"y":1,"id":9,"timeOffset":0}]}}]`.padEnd(1_500, ' ');
    meta[k] = { startTime: i * 2_000, endTime: i * 2_000 + 1_999, sessionNumber: 4, exercise_id: 's4_g_t1' };
  }
  const record: Record<string, any> = {
    profile: { uid: STUDENT },
    active_device_id: MY_DEVICE,
    isOnline: true,
    onlineStatus: 'active',
    pedagogicalPath: 'green_path',
    completedMeeting2: true,
    highestCompletedMeeting: 3,
    traceData: {
      hesitation_events: 0,
      undo_clicks: 0,
      semantic_trace: Array.from({ length: 40 }, (_, i) => ({
        event_type: 'vector_replay',
        session_id: 'session_4',
        timestamp: i,
        interaction_data: { action_type: 'drag', details: { element: 'tens_block', target: 'tens_column', context: 'x', state_snapshot: 'Units: 0', coordinates: { x: 1, y: 2 }, duration_ms: 350 } },
        somatic_indicators: { hesitation_detected: false, undo_triggered: false },
      })),
    },
  };
  if (chunks) record.telemetry_sessions = { session_1: { chunks: chunkMap, metadata: meta, recorded_bytes: chunks * 1_500 } };
  if (pendingAdaptation) record.pendingAdaptation = { scaffoldLevel: 1, queuedAt: 1 };
  void set(ref(database, `users/students/${STUDENT}`), record).catch(() => {});
}

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v) ?? '').length;
const workspaceWrites = (from: number) =>
  rtdb.updates.slice(from).filter((u) => u.path === `/users/students/${STUDENT}` && 'workspaceState' in (u.value ?? {}));

interface Sample {
  msPerAction: number;
  syncWritesPerAction: number;
  valueEventsPerAction: number;
  storeNotificationsPerAction: number;
  payloadBytes: number;
  maxNesting: number;
  runaway: boolean;
}

function startLiveSync(chunks: number, mode: 'today' | 'before', pendingAdaptation = false) {
  svc.stopSync?.();
  for (const off of pageListeners.splice(0)) off();
  if (mode === 'before') svc.getSyncableWorkspaceState = payloadBeforeToday;
  else delete svc.getSyncableWorkspaceState;
  startMeeting(4);
  seedRecord(chunks, pendingAdaptation);
  svc.startSync(STUDENT, { uid: STUDENT });
  expect(svc.isInitialLoad, 'the service saw the record and is live').toBe(false);
  mountWorkspacePageListeners();
  // A realistic stack: ten actions, a typed digit among them.
  drop('tens', 4);
  ws().setAnswerDigit('units', '3');
  drop('units', 5);
}

function sample(reps: number): Sample {
  let notifications = 0;
  const unsub = useWorkspaceStore.subscribe(() => {
    notifications++;
  });
  nest.max = 0;
  nest.runaway = false;
  const w0 = rtdb.updates.length;
  const v0 = rtdb.valueEvents;
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) {
    if (i % 2 === 0) drop('units');
    else ws().undo();
  }
  const ms = performance.now() - t0;
  unsub();
  const writes = workspaceWrites(w0);
  return {
    msPerAction: +(ms / reps).toFixed(3),
    syncWritesPerAction: +(writes.length / reps).toFixed(2),
    valueEventsPerAction: +((rtdb.valueEvents - v0) / reps).toFixed(2),
    storeNotificationsPerAction: +(notifications / reps).toFixed(2),
    payloadBytes: writes.length ? bytes(writes[writes.length - 1].value.workspaceState) : 0,
    maxNesting: nest.max,
    runaway: nest.runaway,
  };
}

describe('performance: what one store change costs in the lesson, today vs before (real RTDB SDK, offline)', () => {
  const memory = new Map<string, string>();
  const localStorageWrites = { count: 0, bytes: 0 };
  const results: Record<string, Sample | Record<string, number>> = {};

  beforeAll(() => {
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        localStorageWrites.count++;
        localStorageWrites.bytes += String(v).length;
        memory.set(k, String(v));
      },
      removeItem: (k: string) => memory.delete(k),
      clear: () => memory.clear(),
      key: () => null,
      length: 0,
    };
    (globalThis as any).localStorage = storage;
    (globalThis as any).window = { localStorage: storage, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, location: { hostname: 'test' } };
  });

  afterAll(() => {
    svc.stopSync?.();
    for (const off of pageListeners.splice(0)) off();
    delete svc.getSyncableWorkspaceState;
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
    // eslint-disable-next-line no-console
    console.info('[regression audit] sync cost per action\n' + JSON.stringify(results, null, 1));
  });

  it('store notifications per ordinary action, and which of them change the synced payload at all', async () => {
    startMeeting(4);
    const count = async (fn: () => void) => {
      let n = 0;
      let payloadChanges = 0;
      let last = JSON.stringify(svc.getSyncableWorkspaceState());
      const unsub = useWorkspaceStore.subscribe(() => {
        n++;
        const next = JSON.stringify(svc.getSyncableWorkspaceState());
        if (next !== last) payloadChanges++;
        last = next;
      });
      fn();
      await new Promise((r) => setTimeout(r, 5)); // a toast hides itself on a timer
      unsub();
      return { notifications: n, payloadChanges };
    };
    const r = {
      drop: await count(() => drop('tens')),
      typeDigit: await count(() => ws().setAnswerDigit('units', '5')),
      carryDigit: await count(() => ws().setCarryDigit('tens', '1')),
      undo: await count(() => ws().undo()),
      focusAndBlur: await count(() => {
        ws().setFocusedPlace('units');
        ws().setFocusedPlace(null);
      }),
      feedbackToast: await count(() => ws().showFeedback({ correct: false, title: 't', sub: 's' }, 0)),
      hesitation45s: await count(() => useWorkspaceStore.setState((s: any) => ({ hesitationCount: s.hesitationCount + 1, hesitationTimerSeconds: 45 }))),
      deviceLockEcho: await count(() => ws().setSupersededByOtherDevice(false)),
    };
    results.notifications = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.notifications])) as any;
    results.payloadChanges = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.payloadChanges])) as any;
    // Focus and toasts notify the store without changing the synced payload
    // (the sync now skips them); the device-lock echo no longer notifies at all.
    for (const k of ['focusAndBlur', 'feedbackToast'] as const) {
      expect(r[k].notifications, k).toBeGreaterThan(0);
      expect(r[k].payloadChanges, k).toBe(0);
    }
    expect(r.deviceLockEcho.notifications).toBe(0);
  });

  it('payload size of one sync with a full undo history, today vs before', () => {
    startMeeting(4);
    drop('tens', 4);
    ws().setAnswerDigit('units', '3');
    ws().setCarryDigit('tens', '1');
    drop('units', 4);
    expect(ws().undoStack).toHaveLength(10);
    const today = svc.getSyncableWorkspaceState();
    const before = payloadBeforeToday();
    results.payload = {
      bytesToday: bytes(today),
      bytesBefore: bytes(before),
      undoFrames: today.undoStack.length,
      undoStackBytes: bytes(today.undoStack),
    };
    expect(bytes(today)).toBeLessThan(50 * 1024); // Module 5
    expect(today.undoStack.length).toBeLessThanOrEqual(10);
    expect(bytes(today)).toBeGreaterThan(bytes(before));
  });

  /** JSON passes of the live sync for one change that does not touch the payload (a focus change). */
  function jsonPassesOfOneIrrelevantChange() {
    const s = vi.spyOn(JSON, 'stringify');
    const p = vi.spyOn(JSON, 'parse');
    const w0 = rtdb.updates.length;
    ws().setFocusedPlace(ws().focusedPlace === 'units' ? 'tens' : 'units');
    const out = {
      syncWrites: workspaceWrites(w0).length,
      stringifyCalls: s.mock.calls.length,
      stringifyChars: s.mock.results.reduce((n, r) => n + (typeof r.value === 'string' ? r.value.length : 0), 0),
      parseCalls: p.mock.calls.length,
    };
    s.mockRestore();
    p.mockRestore();
    return out;
  }

  for (const chunks of [0, 300, 1_500]) {
    it(`drop / undo in a lesson, learner record holding ${chunks} recording chunks: no write inside the action, one per window, none for a focus change`, () => {
      const reps = chunks >= 1_500 ? 12 : 40;
      startLiveSync(chunks, 'today');
      sample(6); // warm-up
      svc.flushRemoteSync();
      const w0 = rtdb.updates.length;
      const today = sample(reps);
      results[`chunks_${chunks}`] = today as any;
      expect(today.runaway).toBe(false);
      // The database writes are coalesced: none inside the actions themselves
      // (a window may close mid-sample), one carrying the latest state after it.
      expect(today.syncWritesPerAction).toBeLessThanOrEqual(0.2);
      svc.flushRemoteSync();
      const afterActions = workspaceWrites(w0).length;
      expect(afterActions).toBeGreaterThanOrEqual(1);
      expect(afterActions).toBeLessThanOrEqual(2);
      // A focus change leaves the payload as it was: nothing is written for it.
      const j = jsonPassesOfOneIrrelevantChange();
      svc.flushRemoteSync();
      expect(j.syncWrites).toBe(0);
      expect(workspaceWrites(w0).length).toBe(afterActions);
    }, 120_000);
  }

  it('with a teacher-queued adaptation pending, the listeners no longer feed the sync back', () => {
    startLiveSync(300, 'today', true);
    sample(4);
    svc.flushRemoteSync();
    const w0 = rtdb.updates.length;
    const s = sample(12);
    results.pendingAdaptation_chunks_300 = s;
    expect(s.runaway).toBe(false);
    expect(s.syncWritesPerAction).toBeLessThanOrEqual(0.2);
    svc.flushRemoteSync();
    expect(workspaceWrites(w0).length).toBeLessThanOrEqual(2);
  }, 120_000);

  // Opt-in (REGRESSION_AUDIT_SCAN=1): the record size at which one action stops ending.
  it.runIf(Boolean(process.env.REGRESSION_AUDIT_SCAN))('scan: record size at which the write-back loop runs away, before vs today', () => {
    nest.limit = 60;
    const scan: Record<string, any> = {};
    try {
      for (const chunks of [200, 400, 600, 800, 1_000, 1_200]) {
        const row: Record<string, any> = {};
        for (const mode of ['before', 'today'] as const) {
          startLiveSync(chunks, mode);
          sample(4);
          const s = sample(10);
          row[mode] = `${s.msPerAction} ms, ${s.syncWritesPerAction} writes/action${s.runaway ? ', RUNAWAY' : ''}`;
        }
        scan[`chunks_${chunks}`] = row;
      }
    } finally {
      nest.limit = 150;
    }
    results.scan = scan;
  }, 600_000);
});

/* ── 8. (optional) the write → ack → write cycle, against a Database emulator ─ */

describe.skipIf(!process.env.RTDB_EMULATOR_HOST)('EMULATOR: after one action, does the lesson keep writing on its own?', () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function oneDropThenIdle(withPageListeners: boolean, mode: 'today' | 'before') {
    svc.stopSync?.();
    for (const off of pageListeners.splice(0)) off();
    if (mode === 'before') svc.getSyncableWorkspaceState = payloadBeforeToday;
    else delete svc.getSyncableWorkspaceState;
    startMeeting(4);
    seedRecord(0);
    await wait(500);
    svc.startSync(STUDENT, { uid: STUDENT });
    await wait(1_000);
    // a realistic undo history (ten actions) before the measured one
    drop('tens', 4);
    ws().setAnswerDigit('units', '3');
    drop('units', 5);
    if (withPageListeners) mountWorkspacePageListeners();
    await wait(1_500);
    const w0 = workspaceWrites(0).length;
    const e0 = rtdb.valueEvents;
    drop('units');
    const w1 = workspaceWrites(0).length;
    const elu0 = (performance as any).eventLoopUtilization?.();
    await wait(3_000);
    const elu = elu0 ? (performance as any).eventLoopUtilization(elu0).utilization : null;
    const idle = workspaceWrites(0).slice(w1);
    svc.stopSync?.();
    for (const off of pageListeners.splice(0)) off();
    delete svc.getSyncableWorkspaceState;
    return {
      syncWritesInTheAction: w1 - w0,
      syncWritesPerIdleSecond: Math.round(idle.length / 3),
      kbWrittenPerIdleSecond: Math.round(idle.reduce((n, u) => n + bytes(u.value.workspaceState), 0) / 3 / 1024),
      valueEvents: rtdb.valueEvents - e0,
      mainThreadBusyDuringIdle: elu === null ? null : `${Math.round(elu * 100)}%`,
    };
  }

  it('one drop, then 3 idle seconds: the service alone, then with the workspace page listeners (before / today)', async () => {
    const serviceOnly = await oneDropThenIdle(false, 'today');
    const withPageBefore = await oneDropThenIdle(true, 'before');
    const withPageToday = await oneDropThenIdle(true, 'today');
    // eslint-disable-next-line no-console
    console.info('[regression audit, emulator]', JSON.stringify({ serviceOnly, withPageBefore, withPageToday }, null, 1));
    expect(serviceOnly.syncWritesInTheAction).toBeGreaterThan(0);
  }, 60_000);
});
