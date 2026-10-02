import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Catch-up time (owner decision 2.10.2026): the teacher's reasons are written
 * as one new round per learner, server-only fields null, and only after every
 * entry passed the checks.
 */
const fs = vi.hoisted(() => ({
  setDoc: vi.fn(async (..._args: unknown[]) => {}),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
}));

vi.mock('@/infrastructure/firebase', () => ({ firestore: { fake: true } }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, name: string) => ({ collection: name }),
  query: (c: unknown, ...constraints: unknown[]) => ({ c, constraints }),
  where: fs.where,
  setDoc: fs.setDoc,
  getDocs: fs.getDocs,
  onSnapshot: fs.onSnapshot,
}));

import { fetchCatchUpRecords, recordCatchUpReasons, subscribeCatchUpRecords } from '../CatchUpService';

const AT = 1_800_000_000_123.4;

describe('recordCatchUpReasons', () => {
  beforeEach(() => {
    fs.setDoc.mockReset();
    fs.setDoc.mockImplementation(async () => {});
  });

  it('merges one new round per learner into catchup_records/session_0N_student_K', async () => {
    await recordCatchUpReasons({
      meeting: 3,
      action: 'reopen',
      teacherUid: 'uidT',
      recordedAt: AT,
      entries: [
        { studentNumber: 4, reason: 'slow_pace', note: '  עבד לאט היום  ', stoppedAtHe: 'תרגיל 4 מתוך 7' },
        { studentNumber: 11, reason: 'technical_fault', note: '   ', stoppedAtHe: null },
      ],
    });
    expect(fs.setDoc).toHaveBeenCalledTimes(2);
    const [ref, data, opts] = fs.setDoc.mock.calls[0];
    expect(ref).toEqual({ path: 'catchup_records/session_03_student_4' });
    expect(opts).toEqual({ merge: true });
    expect(data).toEqual({
      student_id: 4,
      session_number: 3,
      class_id: 'class_1',
      rounds: {
        r_1800000000123: {
          action: 'reopen', reason: 'slow_pace', note: 'עבד לאט היום', stopped_at: 'תרגיל 4 מתוך 7',
          recorded_by: 'uidT', recorded_at: 1800000000123,
          opened_at: null, closed_at: null, closed_by: null, active_minutes: null,
        },
      },
    });
    const second = fs.setDoc.mock.calls[1];
    expect(second[0]).toEqual({ path: 'catchup_records/session_03_student_11' });
    expect((second[1] as any).rounds.r_1800000000123).toMatchObject({ action: 'reopen', reason: 'technical_fault', note: null, stopped_at: null });
  });

  it('a note with personal details refuses the whole confirmation before any write', async () => {
    await expect(recordCatchUpReasons({
      meeting: 5, action: 'continue', teacherUid: 'uidT', recordedAt: AT,
      entries: [
        { studentNumber: 1, reason: 'other', note: null, stoppedAtHe: null },
        { studentNumber: 2, reason: 'other', note: 'הטלפון של אמא 050-1234567', stoppedAtHe: null },
      ],
    })).rejects.toThrow();
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('refuses a bad learner number, a duplicate learner, a bad reason or a bad meeting, writing nothing', async () => {
    const base = { action: 'continue' as const, teacherUid: 'uidT', recordedAt: AT };
    const e = (n: number, reason: any = 'slow_pace') => ({ studentNumber: n, reason, note: null, stoppedAtHe: null });
    await expect(recordCatchUpReasons({ ...base, meeting: 3, entries: [e(13)] })).rejects.toThrow();
    await expect(recordCatchUpReasons({ ...base, meeting: 3, entries: [e(2), e(2)] })).rejects.toThrow();
    await expect(recordCatchUpReasons({ ...base, meeting: 3, entries: [e(2, 'lazy')] })).rejects.toThrow();
    await expect(recordCatchUpReasons({ ...base, meeting: 9, entries: [e(2)] })).rejects.toThrow();
    await expect(recordCatchUpReasons({ ...base, meeting: 3, teacherUid: '', entries: [e(2)] })).rejects.toThrow();
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('rejects when a write is refused, and resolves only after every write', async () => {
    let release!: () => void;
    fs.setDoc.mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    let done = false;
    const p = recordCatchUpReasons({
      meeting: 4, action: 'reopen', teacherUid: 'uidT', recordedAt: AT,
      entries: [{ studentNumber: 1, reason: 'slow_pace', note: null, stoppedAtHe: null }],
    }).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    release();
    await p;
    expect(done).toBe(true);

    fs.setDoc.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(recordCatchUpReasons({
      meeting: 4, action: 'reopen', teacherUid: 'uidT', recordedAt: AT,
      entries: [{ studentNumber: 1, reason: 'slow_pace', note: null, stoppedAtHe: null }],
    })).rejects.toThrow('permission-denied');
  });
});

const snapOf = (docs: Array<{ id: string; data: Record<string, unknown> }>) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});

describe('fetchCatchUpRecords / subscribeCatchUpRecords', () => {
  const docs = [
    { id: 'session_03_student_4', data: { student_id: 4, session_number: 3, class_id: 'class_1', rounds: { r_1: { action: 'continue' } } } },
    { id: 'session_03_student_7', data: { session_number: 3, rounds: null } },
    { id: 'junk', data: { session_number: 3 } },
  ];

  it('reads one meeting, keyed by learner number', async () => {
    fs.getDocs.mockResolvedValueOnce(snapOf(docs));
    const out = await fetchCatchUpRecords(3);
    expect(fs.where).toHaveBeenLastCalledWith('session_number', '==', 3);
    expect(Object.keys(out).map(Number)).toEqual([4, 7]);
    expect(out[4].rounds).toEqual({ r_1: { action: 'continue' } });
    expect(out[7]).toEqual({ student_id: 7, session_number: 3, class_id: 'class_1', rounds: {} });
  });

  it('listens live and hands back the unsubscribe; a refused read yields no records', () => {
    const unsub = vi.fn();
    let onNext!: (s: unknown) => void;
    let onError!: (e: unknown) => void;
    fs.onSnapshot.mockImplementationOnce((_q: unknown, next: any, err: any) => { onNext = next; onError = err; return unsub; });
    const seen: unknown[] = [];
    const stop = subscribeCatchUpRecords(5, (r) => seen.push(r));
    expect(fs.where).toHaveBeenLastCalledWith('session_number', '==', 5);
    onNext(snapOf([docs[0]]));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    onError(new Error('permission-denied'));
    expect(Object.keys(seen[0] as object)).toEqual(['4']);
    expect(seen[1]).toEqual({});
    stop();
    expect(unsub).toHaveBeenCalled();
  });
});
