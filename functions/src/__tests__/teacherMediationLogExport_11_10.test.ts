import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Measure 5 (owner, 11.10.2026): the research export reads teacher_mediation_log
 * of the exporting class and fills the "תיווך המורה" file's three new columns,
 * with a row of its own for a physical approach without an event.
 */
const h = vi.hoisted(() => ({
  collections: {} as Record<string, Array<{ id: string; data: Record<string, unknown> }>>,
  saved: [] as Array<{ path: string; body: string }>,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() { throw new Error('no Drive credentials in tests'); }
  },
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const database = () => ({ ref: () => ({ get: async () => ({ val: () => null, exists: () => false }) }) });
  const query = (name: string): any => {
    const q: any = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      startAfter: () => ({ get: async () => ({ docs: [], empty: true, size: 0 }) }),
      get: async () => {
        const docs = (h.collections[name] ?? []).map(({ id, data }) => ({ id, data: () => data }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
    return q;
  };
  const firestore = Object.assign(
    () => ({ collection: (name: string) => ({ ...query(name), doc: () => ({ set: async () => {} }) }) }),
    actual.firestore,
  );
  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (path: string) => ({
        save: async (body: unknown) => { h.saved.push({ path, body: Buffer.isBuffer(body) ? body.toString('utf8') : String(body) }); },
        getSignedUrl: async () => ['https://signed.example/file'],
      }),
    }),
  });
  const app = () => { throw new Error('no default app in tests'); };
  return { ...actual, default: { ...actual, database, firestore, storage, app }, database, firestore, storage, app };
});

import { exportResearchDataset } from '../exportDriveReport';

const run = (req: unknown) => (exportResearchDataset as any).run(req);
const teacher = () => ({
  auth: { uid: 'teacher-uid', token: { role: 'teacher', roles: ['TEACHER'], teacher: true, class_id: 'class_1' } },
  data: { class_id: 'class_1', session_number: 'all' },
});
const T = Date.UTC(2026, 9, 11, 8, 0, 0);

beforeEach(() => {
  h.collections = {};
  h.saved.length = 0;
});

describe('the "תיווך המורה" file carries the teacher\u2019s live records', () => {
  it('joins by ref_id, appends a self-initiated row, and ignores another class', async () => {
    h.collections.telemetry_logs = [{
      id: 'log_help_1',
      data: { event_type: 'HELP_REQUESTED', student_id: 3, session_id: 'session_4_student_student_user3', client_timestamp: T, details: { help_count: 1 } },
    }];
    const base = { class_id: 'class_1', session_number: 4, note: null, recorded_by: 'teacher-uid', recorded_at: T + 60_000 };
    h.collections.teacher_mediation_log = [
      { id: 'ev_log_help_1', data: { ...base, student_id: 3, event_ref: 'log_help_1', event_time_iso: new Date(T).toISOString(), action: 'wrote_and_approached', data_led: true } },
      { id: 'selfRow', data: { ...base, student_id: 8, event_ref: null, event_time_iso: new Date(T + 120_000).toISOString(), action: 'approached', data_led: false } },
      { id: 'otherClass', data: { ...base, class_id: 'class_9', student_id: 5, event_ref: null, event_time_iso: new Date(T).toISOString(), action: 'approached', data_led: true } },
    ];
    const result = await run(teacher());
    expect(result.status).toBe('SUCCESS');
    const file = h.saved.find((f) => f.path.includes('תיווך_המורה'));
    expect(file).toBeDefined();
    const lines = file!.body.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    expect(lines[0]).toContain('"detail_number","teacher_action","data_led","teacher_note"');
    expect(lines.find((l) => l.includes('log_help_1'))).toMatch(/כתבה וניגשה.*כן/);
    expect(lines.find((l) => l.includes('teacher_approach_self'))).toMatch(/teacher_log.*selfRow.*ניגשה.*לא/);
    expect(file!.body).not.toContain('otherClass');
    expect(file!.body).not.toContain('teacher-uid');
  });
});
