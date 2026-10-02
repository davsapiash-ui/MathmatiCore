import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as realAdmin from 'firebase-admin';

/**
 * Audit M-export (2.10.2026): the research export was refused after the first
 * export or the first reset. Every reset and every export writes `created_at`
 * as a server timestamp; the reset-log file copied it as is, the CSV cell
 * turned it into {"_seconds":…,"_nanoseconds":282943000}, and the PII gate read
 * the nine nanosecond digits as an ID number. The teacher read "נסו שוב מאוחר
 * יותר", and no retry could help.
 *
 * Now every timestamp is ISO text in every file, the gate is as strict as
 * before for real data, and the refusal says why (details.reason "pii").
 */

const h = vi.hoisted(() => ({
  collections: {} as Record<string, Array<{ id: string; data: Record<string, unknown> }>>,
  saved: [] as string[],
  sets: [] as Array<{ name: string; id: string; values: Record<string, unknown> }>,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() { throw new Error('no Drive credentials in tests'); }
  },
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const database = () => ({
    ref: () => ({ get: async () => ({ val: () => null, exists: () => false }) }),
  });
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
    () => ({
      collection: (name: string) => ({
        ...query(name),
        doc: (id: string) => ({
          set: async (values: Record<string, unknown>) => { h.sets.push({ name, id, values }); },
        }),
      }),
    }),
    actual.firestore
  );
  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (path: string) => ({
        save: async () => { h.saved.push(path); },
        getSignedUrl: async () => ['https://signed.example/file'],
      }),
    }),
  });
  const app = () => { throw new Error('no default app in tests'); };
  return { ...actual, default: { ...actual, database, firestore, storage, app }, database, firestore, storage, app };
});

import {
  exportResearchDataset,
  researchCsv,
  researchFilesContainPii,
  RESEARCH_EXPORT_PII_REFUSAL_HE,
} from '../exportDriveReport';

const Timestamp = realAdmin.firestore.Timestamp;
/** A server timestamp whose nanoseconds are nine digits — what tripped the gate. */
const stamp = new Timestamp(1_759_400_000, 282_943_000);

const resetEntry = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  data: {
    reset_id: id,
    reset_level: 'single_student',
    reset_scope: 'active_session',
    session_number: 3,
    performed_by_teacher_id: 'teacher-uid',
    performed_at: 1_759_400_000_000,
    class_id: 'class_1',
    affected_student_ids: [4],
    backup_file_url: 'gs://bucket/backups/class_1/reset.json',
    backup_status: 'success',
    reset_reason: 'technical_fault',
    reason_note: null,
    records_deleted_count: 3,
    created_at: stamp,
    ...over,
  },
});

/** The export's own entry, as the previous export wrote it. */
const exportEntry = {
  id: 'export_1759400000000',
  data: {
    reset_id: 'export_1759400000000',
    timestamp: 1_759_400_000_000,
    performed_by: 'teacher-uid',
    user_email: 'teacher@example.com',
    reset_level: 'export',
    reason: 'RESEARCH_DATASET_EXPORT',
    affected_student_id: 'ALL',
    class_id: 'class_1',
    session_number: 'all',
    row_counts: { פעולות: 0 },
    status: 'SUCCESS',
    created_at: stamp,
  },
};

const teacher = (data: Record<string, unknown> = {}) => ({
  auth: { uid: 'teacher-uid', token: { role: 'teacher', roles: ['TEACHER'], teacher: true, class_id: 'class_1' } },
  data: { class_id: 'class_1', session_number: 'all', ...data },
});
const run = (req: unknown) => (exportResearchDataset as any).run(req);

beforeEach(() => {
  h.collections = {};
  h.saved.length = 0;
  h.sets.length = 0;
});

describe('every timestamp in a research CSV is ISO text', () => {
  it('a Firestore Timestamp, its JSON copy and a Date', () => {
    const csv = researchCsv([
      { a: stamp, b: { _seconds: 1_759_400_000, _nanoseconds: 282_943_000 }, c: new Date(1_759_400_000_283), d: { at: stamp, n: 1 } },
    ]);
    expect(csv).toContain('"2025-10-02T10:13:20.283Z"');
    expect(csv).not.toMatch(/_seconds|_nanoseconds|282943000/);
    // Inside an object too.
    expect(csv).toContain('{""at"":""2025-10-02T10:13:20.283Z"",""n"":1}');
  });

  it('a file of reset entries no longer looks like it holds an ID number', () => {
    const csv = researchCsv([resetEntry('reset_1').data, exportEntry.data].map((d) => ({ ...d, user_email: undefined, performed_by: undefined })));
    expect(researchFilesContainPii(csv)).toBe(false);
  });

  it('the gate is as strict as before for real data', () => {
    expect(researchFilesContainPii(researchCsv([{ note: 'ת.ז. 123456789' }]))).toBe(true);
    expect(researchFilesContainPii(researchCsv([{ note: 'teacher@example.com' }]))).toBe(true);
    expect(researchFilesContainPii(researchCsv([{ note: '050-1234567' }]))).toBe(true);
    // A thirteen-digit time in milliseconds is not a nine-digit number.
    expect(researchFilesContainPii(researchCsv([{ performed_at: 1_759_400_000_000 }]))).toBe(false);
  });
});

describe('the export after a reset and after an earlier export', () => {
  it('succeeds: the files are written and the new export is logged', async () => {
    h.collections.reset_audit_log = [resetEntry('reset_1'), exportEntry];
    const result = await run(teacher());
    expect(result.status).toBe('SUCCESS');
    // Drive is unavailable in tests: the five files wait in Storage (register gap יב).
    expect(h.saved.filter((p) => p.endsWith('.csv'))).toHaveLength(5);
    expect(h.sets.some((s) => s.name === 'reset_audit_log' && s.values.reset_level === 'export')).toBe(true);
  });

  it('a real nine-digit number in the data is still refused, with a reason the teacher can read', async () => {
    h.collections.reset_audit_log = [resetEntry('reset_1', { reason_note: 'ת.ז. 123456789' })];
    const err = await run(teacher()).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'failed-precondition', message: RESEARCH_EXPORT_PII_REFUSAL_HE, details: { reason: 'pii' } });
    expect(h.saved).toEqual([]);
    expect(RESEARCH_EXPORT_PII_REFUSAL_HE).toContain('ניסיון חוזר לא יעזור');
  });
});
