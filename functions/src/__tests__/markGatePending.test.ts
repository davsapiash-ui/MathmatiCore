import { describe, it, expect } from 'vitest';
import { markGatePending, type GateRtdbLike } from '../sessionTrigger';

/**
 * PRD Module 20 §ב: the pending state is staff-written (the server), and an
 * approval is never put back to pending — not even one that lands while the
 * server writes the pending state.
 */
function fakeRtdb(record: Record<string, unknown>, onFirstRead?: () => void): GateRtdbLike & { writes: string[] } {
  const writes: string[] = [];
  let first = true;
  return {
    writes,
    ref: (path: string) => {
      const field = path.split('/').pop() as string;
      return {
        get: async () => {
          const v = record[field];
          if (first) { first = false; onFirstRead?.(); }
          return { val: () => (v === undefined ? null : v) };
        },
        transaction: async (fn: (cur: unknown) => unknown) => {
          const next = fn(record[field] ?? null);
          if (next === undefined) return { committed: false };
          record[field] = next;
          writes.push(field);
          return { committed: true };
        },
      };
    },
  };
}

describe('markGatePending', () => {
  it('writes the pending state on a record that is not approved', async () => {
    const rec: Record<string, unknown> = { session_02_completed: true };
    const rtdb = fakeRtdb(rec);
    expect(await markGatePending(rtdb, 4, false)).toBe('pending');
    expect(rec).toMatchObject({ routeStatus: 'PENDING_TEACHER_APPROVAL', teacher_gate_approved: false });
  });

  it('writes nothing when the session document is approved', async () => {
    const rec: Record<string, unknown> = {};
    const rtdb = fakeRtdb(rec);
    expect(await markGatePending(rtdb, 4, true)).toBe('approved');
    expect(rtdb.writes).toEqual([]);
  });

  it('writes nothing over an approved record', async () => {
    const cases: Record<string, unknown>[] = [
      { teacher_gate_approved: true, routeStatus: 'APPROVED' },
      { teacher_gate_approved: true },
      { routeStatus: 'APPROVED' },
    ];
    for (const rec of cases) {
      const before = { ...rec };
      const rtdb = fakeRtdb(rec);
      expect(await markGatePending(rtdb, 4, false)).toBe('approved');
      expect(rec).toEqual(before);
    }
  });

  it('an approval that lands after the first read is not undone', async () => {
    const rec: Record<string, unknown> = {};
    // The teacher's approval (approveTeacherGate) lands between the read and the transaction.
    const rtdb = fakeRtdb(rec, () => Object.assign(rec, { routeStatus: 'APPROVED', teacher_gate_approved: true }));
    expect(await markGatePending(rtdb, 4, false)).toBe('approved');
    expect(rec).toEqual({ routeStatus: 'APPROVED', teacher_gate_approved: true });
  });
});
