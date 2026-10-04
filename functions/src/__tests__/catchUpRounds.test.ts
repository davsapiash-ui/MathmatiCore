import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Catch-up time (owner decision 2.10.2026): the server opens a 'reopen' round
 * when the meeting opens again and closes it, with the learner's active
 * minutes, when the meeting stops being live.
 */

// ── An in-memory Firestore: documents, server write times, transactions ──────
const h = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, any>>, // "collection/id" → data
  createTimes: {} as Record<string, number>,         // "collection/id" → the server's write time
  updates: [] as string[],
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();

  const setPath = (obj: Record<string, any>, dotted: string, value: unknown) => {
    const parts = dotted.split('.');
    let cur = obj;
    for (const p of parts.slice(0, -1)) {
      cur[p] = cur[p] && typeof cur[p] === 'object' ? { ...cur[p] } : {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  };

  const docRef = (collection: string, id: string): any => {
    const path = `${collection}/${id}`;
    return {
      id,
      path,
      get: async () => ({ exists: path in h.docs, id, data: () => (h.docs[path] ? structuredClone(h.docs[path]) : undefined) }),
      update: async (data: Record<string, any>) => {
        h.updates.push(path);
        const next = structuredClone(h.docs[path] || {});
        for (const [k, v] of Object.entries(data)) setPath(next, k, v);
        h.docs[path] = next;
      },
    };
  };

  const firestoreDb = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(name, id),
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          expect(op).toBe('==');
          const docs = Object.entries(h.docs)
            .filter(([p, d]) => p.startsWith(`${name}/`) && d[field] === value)
            .map(([p, d]) => ({
              id: p.slice(name.length + 1),
              data: () => structuredClone(d),
              createTime: p in h.createTimes ? { toMillis: () => h.createTimes[p] } : undefined,
            }));
          return { docs, empty: docs.length === 0, size: docs.length };
        },
      }),
    }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const pending: Array<() => Promise<void>> = [];
      const out = await fn({
        get: (ref: any) => ref.get(),
        update: (ref: any, data: any) => { pending.push(() => ref.update(data)); },
      });
      for (const p of pending) await p();
      return out;
    },
  };
  const firestore = Object.assign(() => firestoreDb, actual.firestore);
  return { ...actual, default: { ...actual, firestore }, firestore };
});

import {
  classifyCatchUpTransition,
  closeCatchUpRounds,
  computeActiveMinutes,
  onCatchUpSessionWrite,
  openCatchUpRounds,
  pendingReopenBelongsToRun,
} from '../catchUpRounds';
import * as admin from 'firebase-admin';

const MIN = 60_000;
const CAP = 45 * MIN;
const GRACE = 15 * MIN;
const S = 1_800_000_000_000; // a start, on a whole minute

const open = (n: number, startedAt = S, extra: Record<string, unknown> = {}) =>
  ({ active: true, status: 'active', sessionNumber: n, startedAt, teacherId: 't', ...extra });
const closedRec = (extra: Record<string, unknown> = {}) =>
  ({ active: false, status: 'closed', sessionNumber: null, endedAt: S + 10 * MIN, teacherId: 't', ...extra });

describe('classifyCatchUpTransition', () => {
  it('a fresh open from nothing / from a closed record opens the meeting at its startedAt', () => {
    expect(classifyCatchUpTransition(null, open(3), S + 5)).toEqual({ opened: { meeting: 3, openedAt: S }, closed: null });
    expect(classifyCatchUpTransition(closedRec(), open(3), S + 5)).toEqual({ opened: { meeting: 3, openedAt: S }, closed: null });
  });

  it('an open record without a server start yet opens nothing', () => {
    expect(classifyCatchUpTransition(null, { ...open(3), startedAt: null }, S).opened).toBeNull();
    expect(classifyCatchUpTransition(null, { ...open(3), startedAt: { '.sv': 'timestamp' } }, S).opened).toBeNull();
  });

  it('pause and resume are neither', () => {
    const paused = open(4, S, { status: 'paused', pausedAt: S + MIN });
    expect(classifyCatchUpTransition(open(4), paused, S + MIN)).toEqual({ opened: null, closed: null });
    expect(classifyCatchUpTransition(paused, open(4, S, { resumedAt: S + 2 * MIN }), S + 2 * MIN)).toEqual({ opened: null, closed: null });
  });

  it('a teacher-disconnect stamp within the window is neither', () => {
    expect(classifyCatchUpTransition(open(4), open(4, S, { teacherDisconnectedAt: S + MIN }), S + MIN))
      .toEqual({ opened: null, closed: null });
  });

  it("the teacher's close closes the meeting at the write", () => {
    expect(classifyCatchUpTransition(open(5), closedRec({ closedBy: 'teacher' }), S + 20 * MIN))
      .toEqual({ opened: null, closed: { meeting: 5, closedAt: S + 20 * MIN, closedBy: 'teacher' } });
  });

  it('closing a paused meeting is a close', () => {
    const paused = open(5, S, { status: 'paused' });
    expect(classifyCatchUpTransition(paused, closedRec({ closedBy: 'teacher' }), S + 20 * MIN).closed)
      .toEqual({ meeting: 5, closedAt: S + 20 * MIN, closedBy: 'teacher' });
  });

  it('opening another meeting closes the old one as a switch and opens the new one', () => {
    const t = classifyCatchUpTransition(open(3), open(4, S + 30 * MIN), S + 30 * MIN);
    expect(t.closed).toEqual({ meeting: 3, closedAt: S + 30 * MIN, closedBy: 'switch' });
    expect(t.opened).toEqual({ meeting: 4, openedAt: S + 30 * MIN });
  });

  it('starting the same meeting again closes the old run (teacher) and opens the new one', () => {
    const t = classifyCatchUpTransition(open(6), open(6, S + 30 * MIN), S + 30 * MIN);
    expect(t.closed).toEqual({ meeting: 6, closedAt: S + 30 * MIN, closedBy: 'teacher' });
    expect(t.opened).toEqual({ meeting: 6, openedAt: S + 30 * MIN });
  });

  it("the dashboard's 45-minute close: closedAt is the cap, not the late write", () => {
    expect(classifyCatchUpTransition(open(3), closedRec({ endedBy: 'auto_45min' }), S + CAP + 7 * MIN).closed)
      .toEqual({ meeting: 3, closedAt: S + CAP, closedBy: 'auto_45min' });
  });

  it('any write after the cap closes the run by time, even a teacher close or a switch', () => {
    expect(classifyCatchUpTransition(open(3), closedRec({ closedBy: 'teacher' }), S + CAP + MIN).closed)
      .toEqual({ meeting: 3, closedAt: S + CAP, closedBy: 'auto_45min' });
    const t = classifyCatchUpTransition(open(3), open(4, S + 2 * CAP), S + 2 * CAP);
    expect(t.closed).toEqual({ meeting: 3, closedAt: S + CAP, closedBy: 'auto_45min' });
    expect(t.opened).toEqual({ meeting: 4, openedAt: S + 2 * CAP });
  });

  it('the teacher-disconnect window: closedAt is the end of the window', () => {
    const away = S + 10 * MIN;
    const before = open(3, S, { teacherDisconnectedAt: away });
    expect(classifyCatchUpTransition(before, closedRec({ endedBy: 'teacher_disconnect_grace' }), away + GRACE + 3 * MIN).closed)
      .toEqual({ meeting: 3, closedAt: away + GRACE, closedBy: 'teacher_disconnect_grace' });
  });

  it('both limits reached: the earlier one ended the run', () => {
    const away = S + 40 * MIN; // window ends at S+55, the cap at S+45
    const before = open(3, S, { teacherDisconnectedAt: away });
    expect(classifyCatchUpTransition(before, closedRec(), S + 60 * MIN).closed)
      .toEqual({ meeting: 3, closedAt: S + CAP, closedBy: 'auto_45min' });
  });

  it('a time marker written a moment before the server reached the limit keeps the marker, capped', () => {
    expect(classifyCatchUpTransition(open(3), closedRec({ endedBy: 'auto_45min' }), S + CAP - 500).closed)
      .toEqual({ meeting: 3, closedAt: S + CAP - 500, closedBy: 'auto_45min' });
  });

  it('a reset (closed record without a marker) or a deleted record closes as other', () => {
    expect(classifyCatchUpTransition(open(7), closedRec(), S + 10 * MIN).closed)
      .toEqual({ meeting: 7, closedAt: S + 10 * MIN, closedBy: 'other' });
    expect(classifyCatchUpTransition(open(7), null, S + 10 * MIN).closed)
      .toEqual({ meeting: 7, closedAt: S + 10 * MIN, closedBy: 'other' });
  });

  it('a closed record rewritten, or nothing to something closed, is neither', () => {
    expect(classifyCatchUpTransition(closedRec(), closedRec({ endedAt: 1 }), S)).toEqual({ opened: null, closed: null });
    expect(classifyCatchUpTransition(null, closedRec(), S)).toEqual({ opened: null, closed: null });
    expect(classifyCatchUpTransition(null, null, S)).toEqual({ opened: null, closed: null });
  });

  it('a record without a valid meeting number is ignored', () => {
    expect(classifyCatchUpTransition(null, open(0), S).opened).toBeNull();
    expect(classifyCatchUpTransition(open(9), closedRec(), S).closed).toBeNull();
  });
});

describe('computeActiveMinutes', () => {
  it('counts distinct whole minutes, not events', () => {
    expect(computeActiveMinutes([S + 1_000, S + 2_000, S + 59_999, S + MIN, S + 5 * MIN + 1], S, S + 10 * MIN)).toBe(3);
  });
  it('the window is inclusive at both ends', () => {
    expect(computeActiveMinutes([S, S + 10 * MIN], S, S + 10 * MIN)).toBe(2);
  });
  it('ignores events outside the window', () => {
    expect(computeActiveMinutes([S - 1, S + 10 * MIN + 1], S, S + 10 * MIN)).toBe(0);
  });
  it('zero for no events, a reversed window, or bad numbers', () => {
    expect(computeActiveMinutes([], S, S + MIN)).toBe(0);
    expect(computeActiveMinutes([S + 1], S + MIN, S)).toBe(0);
    expect(computeActiveMinutes([NaN, Infinity, S + 1], S, NaN)).toBe(0);
    expect(computeActiveMinutes([NaN, S + 1], S, S + MIN)).toBe(1);
  });
  it('a window that starts mid-minute still counts that minute once', () => {
    expect(computeActiveMinutes([S + 30_000, S + 40_000], S + 20_000, S + 50_000)).toBe(1);
  });
});

// ── The trigger on a fake Firestore ──────────────────────────────────────────
const round = (over: Record<string, unknown> = {}) => ({
  action: 'reopen', reason: 'slow_pace', note: null, stopped_at: 'תרגיל 4 מתוך 7', recorded_by: 'uidT',
  recorded_at: S - MIN, opened_at: null, closed_at: null, closed_by: null, active_minutes: null, ...over,
});
const putRecord = (meeting: number, n: number, rounds: Record<string, unknown>) => {
  h.docs[`catchup_records/session_0${meeting}_student_${n}`] = { student_id: n, session_number: meeting, class_id: 'class_1', rounds };
};
const rec = (meeting: number, n: number) => h.docs[`catchup_records/session_0${meeting}_student_${n}`];
let seq = 0;
const telemetry = (n: number, meeting: number, writeTime: number) => {
  seq++;
  h.docs[`telemetry_logs/ev_${seq}`] = { student_id: n, session_id: `session_${meeting}_student_student_user${n}`, event_type: 'DIGIT_ENTERED' };
  h.createTimes[`telemetry_logs/ev_${seq}`] = writeTime;
};

async function fire(before: unknown, after: unknown, atMs: number) {
  const event = {
    time: new Date(atMs).toISOString(),
    data: { before: { val: () => before }, after: { val: () => after } },
  };
  await (onCatchUpSessionWrite as any).run(event);
}

describe('onCatchUpSessionWrite', () => {
  beforeEach(() => {
    for (const k of Object.keys(h.docs)) delete h.docs[k];
    for (const k of Object.keys(h.createTimes)) delete h.createTimes[k];
    h.updates.length = 0;
    seq = 0;
  });

  it('opening meeting N opens its pending reopen rounds at startedAt; continue rounds and other meetings stay', async () => {
    putRecord(3, 4, { r_1: round(), r_0: round({ action: 'continue' }) });
    putRecord(4, 4, { r_1: round() });
    await fire(closedRec({ closedBy: 'teacher' }), open(3, S), S);
    expect(rec(3, 4).rounds.r_1.opened_at).toBe(S);
    expect(rec(3, 4).rounds.r_0.opened_at).toBeNull();
    expect(rec(4, 4).rounds.r_1.opened_at).toBeNull();
  });

  it('closing meeting N closes its open rounds with the minutes of that learner in that meeting only', async () => {
    putRecord(3, 4, { r_1: round({ opened_at: S }) });
    putRecord(3, 5, { r_1: round({ opened_at: S }) });
    telemetry(4, 3, S + 10_000);
    telemetry(4, 3, S + 20_000);       // same minute
    telemetry(4, 3, S + 3 * MIN);
    telemetry(4, 3, S - MIN);           // before the round
    telemetry(4, 3, S + 30 * MIN);      // after the close
    telemetry(4, 4, S + 5 * MIN);       // another meeting
    telemetry(6, 3, S + 6 * MIN);       // another learner
    await fire(open(3, S), closedRec({ closedBy: 'teacher' }), S + 12 * MIN);
    expect(rec(3, 4).rounds.r_1).toMatchObject({ closed_at: S + 12 * MIN, closed_by: 'teacher', active_minutes: 2 });
    expect(rec(3, 5).rounds.r_1).toMatchObject({ closed_at: S + 12 * MIN, closed_by: 'teacher', active_minutes: 0 });
  });

  it('a round closed by time gets the cap as its end and only the minutes inside it', async () => {
    putRecord(5, 2, { r_1: round({ opened_at: S }) });
    telemetry(2, 5, S + 44 * MIN);
    telemetry(2, 5, S + 50 * MIN);
    await fire(open(5, S), closedRec({ endedBy: 'auto_45min' }), S + 60 * MIN);
    expect(rec(5, 2).rounds.r_1).toMatchObject({ closed_at: S + CAP, closed_by: 'auto_45min', active_minutes: 1 });
  });

  it('is idempotent: a second delivery changes nothing', async () => {
    putRecord(3, 4, { r_1: round() });
    await fire(closedRec(), open(3, S), S);
    await fire(closedRec(), open(3, S + 99), S + 99);
    expect(rec(3, 4).rounds.r_1.opened_at).toBe(S);
    telemetry(4, 3, S + MIN);
    await fire(open(3, S), closedRec({ closedBy: 'teacher' }), S + 5 * MIN);
    const closedOnce = structuredClone(rec(3, 4));
    await fire(open(3, S), closedRec(), S + 9 * MIN);
    expect(rec(3, 4)).toEqual(closedOnce);
    expect(closedOnce.rounds.r_1).toMatchObject({ closed_at: S + 5 * MIN, closed_by: 'teacher', active_minutes: 1 });
  });

  it('the reopen flow: a second round is opened by the new run, and the first run closes only the first', async () => {
    // Run 1 (catch-up) is open with round r_1; the teacher records r_2 and reopens.
    const S2 = S + 20 * MIN;
    putRecord(3, 4, { r_1: round({ opened_at: S }), r_2: round({ recorded_at: S2 - MIN }) });
    telemetry(4, 3, S + MIN);
    telemetry(4, 3, S2 + MIN);
    await fire(open(3, S), closedRec({ closedBy: 'teacher' }), S2 - 1_000);
    await fire(closedRec({ closedBy: 'teacher' }), open(3, S2), S2);
    expect(rec(3, 4).rounds.r_1).toMatchObject({ closed_at: S2 - 1_000, closed_by: 'teacher', active_minutes: 1 });
    expect(rec(3, 4).rounds.r_2).toMatchObject({ opened_at: S2, closed_at: null });
  });

  it("the close running after the next open (triggers out of order) leaves the new run's round open", async () => {
    const S2 = S + 20 * MIN;
    putRecord(3, 4, { r_2: round({ opened_at: S2 }) });
    expect(await closeCatchUpRounds(admin.firestore(), 3, S2 - 1_000, 'teacher')).toEqual([]);
    expect(rec(3, 4).rounds.r_2.closed_at).toBeNull();
  });

  it('a restart of the same meeting in one write closes the old round and opens the pending one', async () => {
    const S2 = S + 30 * MIN;
    putRecord(6, 1, { r_1: round({ opened_at: S }), r_2: round({ recorded_at: S2 - MIN }) });
    await fire(open(6, S), open(6, S2), S2);
    expect(rec(6, 1).rounds.r_1).toMatchObject({ closed_at: S2, closed_by: 'teacher' });
    expect(rec(6, 1).rounds.r_2).toMatchObject({ opened_at: S2, closed_at: null });
  });

  it('pause and resume write nothing', async () => {
    putRecord(3, 4, { r_1: round({ opened_at: S }), r_2: round() });
    await fire(open(3, S), open(3, S, { status: 'paused' }), S + MIN);
    await fire(open(3, S, { status: 'paused' }), open(3, S), S + 2 * MIN);
    expect(h.updates).toEqual([]);
  });

  it('a reopen round left over from a reopen that never happened is not opened by an unrelated later start', async () => {
    // Recorded 20 minutes before this start: the reopen it was for failed or was cancelled.
    putRecord(3, 4, { r_old: round({ recorded_at: S - 20 * MIN }), r_new: round({ recorded_at: S - 2_000 }) });
    await fire(closedRec({ closedBy: 'teacher' }), open(3, S), S);
    expect(rec(3, 4).rounds.r_old.opened_at).toBeNull();
    expect(rec(3, 4).rounds.r_new.opened_at).toBe(S);
    // ...and the run's close does not pick it up either.
    await fire(open(3, S), closedRec({ closedBy: 'teacher' }), S + 10 * MIN);
    expect(rec(3, 4).rounds.r_old).toMatchObject({ opened_at: null, closed_at: null, active_minutes: null });
    expect(rec(3, 4).rounds.r_new).toMatchObject({ closed_at: S + 10 * MIN, closed_by: 'teacher' });
  });

  it('reasons that reached the server after the run started are opened at its start and closed with its minutes', async () => {
    // The open trigger ran before the round existed (slow network: the dashboard does not wait for the reasons).
    await fire(closedRec({ closedBy: 'teacher' }), open(3, S), S);
    putRecord(3, 4, { r_late: round({ recorded_at: S - 3_000 }) });
    telemetry(4, 3, S + MIN);
    telemetry(4, 3, S + 4 * MIN);
    await fire(open(3, S), closedRec({ closedBy: 'teacher' }), S + 8 * MIN);
    expect(rec(3, 4).rounds.r_late).toMatchObject({ opened_at: S, closed_at: S + 8 * MIN, closed_by: 'teacher', active_minutes: 2 });
  });

  it('pendingReopenBelongsToRun: only a reopen round recorded just before the start', () => {
    expect(pendingReopenBelongsToRun(round({ recorded_at: S - 4 * MIN }), S)).toBe(true);
    expect(pendingReopenBelongsToRun(round({ recorded_at: S + 10_000 }), S)).toBe(true);
    expect(pendingReopenBelongsToRun(round({ recorded_at: S - 6 * MIN }), S)).toBe(false);
    expect(pendingReopenBelongsToRun(round({ recorded_at: S + MIN }), S)).toBe(false);
    expect(pendingReopenBelongsToRun(round({ action: 'continue', recorded_at: S - MIN }), S)).toBe(false);
    expect(pendingReopenBelongsToRun(round({ opened_at: S - MIN, recorded_at: S - MIN }), S)).toBe(false);
  });

  it('open/close helpers report the learners they touched', async () => {
    putRecord(7, 9, { r_1: round() });
    putRecord(7, 10, { r_1: round({ action: 'continue' }) });
    expect(await openCatchUpRounds(admin.firestore(), 7, S)).toEqual([9]);
    expect(await closeCatchUpRounds(admin.firestore(), 7, S + MIN, 'switch')).toEqual([9]);
    expect(rec(7, 10).rounds.r_1.closed_at).toBeNull();
  });
});
