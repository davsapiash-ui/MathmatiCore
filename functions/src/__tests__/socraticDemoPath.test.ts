import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Owner decision 11.10.2026: the projector's "דוגמה לכרטיס החניכה" asks the
 * learner's engine (callGeminiSocraticProxy) about the demonstration board.
 * The demo path is a teacher's only, never a read-only account's, and records
 * nothing about any learner: no student, session or exercise id in the
 * monitoring entry, and only the aggregate counters in store_cache.
 */
const h = vi.hoisted(() => ({ modelCalls: 0, sets: [] as unknown[], records: [] as Record<string, unknown>[] }));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ __inc: n }) },
  getFirestore: () => ({
    collection: (c: string) => ({
      doc: (d: string) => ({
        set: async (v: unknown) => { h.sets.push({ path: `${c}/${d}`, v }); },
        get: async () => ({ exists: false }),
      }),
    }),
  }),
}));
vi.mock('../geminiConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../geminiConfig')>();
  return {
    ...actual,
    getGeminiKeyStatus: () => ({ configured: true, source: 'env' }),
    generateGeminiText: async () => { h.modelCalls++; throw new Error('no model in this test'); },
  };
});
vi.mock('../aiMonitoring', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../aiMonitoring')>();
  return { ...actual, recordAiCall: (rec: Record<string, unknown>) => { h.records.push(rec); actual.recordAiCall(rec as never); } };
});

import { callGeminiSocraticProxy } from '../geminiProxy';

const request = {
  student_id: 1,
  session_id: 'session_4_demo',
  exercise_id: 's4_demo_s4_a',
  active_column_index: 0,
  workspace_state: { ones_count: 0, tens_count: 2, hundreds_count: 1, thousands_count: 0 },
  exercise_context: {
    operation: 'addition',
    number_a: 238,
    number_b: 146,
    session_id: 'session_4_demo',
    session_topic: '',
    active_column: 'ones',
    active_column_index: 0,
    target_sub_problem: '8 + 6',
  },
  student_progress_state: { completed_columns: [], current_column_input: null, memory_circles_state: {}, trigger_reason: 'hesitation_45s', consecutive_errors_count: 0, recent_actions: [] },
};
const call = (token: Record<string, unknown>, data: Record<string, unknown>) =>
  (callGeminiSocraticProxy as any).run({ auth: { uid: 'u', token }, data });

describe('the demonstration card on the server (owner, 11.10.2026)', () => {
  beforeEach(() => {
    h.modelCalls = 0;
    h.sets = [];
    h.records = [];
  });

  it('a read-only teacher is refused before the model is asked', async () => {
    await expect(call({ role: 'teacher', teacher: true, readOnly: true }, { demo: true, socratic_request: request }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.modelCalls).toBe(0);
    expect(h.records).toHaveLength(0);
  });

  it('a learner, an admin or an anonymous sign-in is refused', async () => {
    for (const token of [{ student_id: 1 }, { role: 'admin', admin: true }, {}]) {
      await expect(call(token, { demo: true, socratic_request: request })).rejects.toMatchObject({ code: 'permission-denied' });
    }
    expect(h.modelCalls).toBe(0);
    expect(h.records).toHaveLength(0);
  });

  it('a teacher: the same prompt and validator path, and no learner, session or exercise is recorded', async () => {
    // The model fails here: the client shows the static card.
    await expect(call({ role: 'teacher', teacher: true }, { demo: true, socratic_request: request })).rejects.toBeTruthy();
    expect(h.modelCalls).toBeGreaterThan(0);
    expect(h.records.length).toBeGreaterThan(0);
    for (const rec of h.records) {
      expect(rec.demo).toBe(true);
      expect(rec).not.toHaveProperty('student_id');
      expect(rec).not.toHaveProperty('session_id');
      expect(rec).not.toHaveProperty('exercise_id');
    }
    // Only the aggregate counters are written, and nothing in them names a learner.
    await new Promise((r) => setImmediate(r));
    for (const s of h.sets as { path: string; v: unknown }[]) {
      expect(s.path).toBe('store_cache/ai_monitoring');
      expect(JSON.stringify(s.v)).not.toMatch(/student|session_4_demo|s4_demo/);
    }
  });

  it('without the demo flag the learner record is kept as before', async () => {
    await expect(call({ role: 'teacher', teacher: true }, { socratic_request: request })).rejects.toBeTruthy();
    expect(h.records.some((r) => r.student_id === 1 && r.session_id === 'session_4_demo')).toBe(true);
  });
});
