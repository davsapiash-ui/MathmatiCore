import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PRD Appendix A §4 (SRLReflectionState) names the meeting-8 reflection's
 * fields, and Appendix A forbids other names for them in code ("חל איסור על
 * שימוש בשמות שדות שונים בקוד"). The learner's client wrote effort_level and
 * submitted_at; it now writes effort_score and reflection_updated_at, with
 * reflection_step, reflection_completed and idempotency_key. The research
 * export's reflections file reads both shapes into Appendix A's columns, so a
 * document already stored under the old names is not lost from it.
 */

const h = vi.hoisted(() => ({
  collections: {} as Record<string, Array<{ id: string; data: Record<string, unknown> }>>,
  files: new Map<string, string>(),
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
        doc: () => ({ set: async () => undefined }),
      }),
    }),
    actual.firestore
  );
  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (path: string) => ({
        save: async (content: unknown) => { h.files.set(path, String(content)); },
        getSignedUrl: async () => ['https://signed.example/file'],
      }),
    }),
  });
  const app = () => { throw new Error('no default app in tests'); };
  return { ...actual, default: { ...actual, database, firestore, storage, app }, database, firestore, storage, app };
});

import { exportResearchDataset, normalizeReflectionFields } from '../exportDriveReport';

const run = (req: unknown) => (exportResearchDataset as any).run(req);
const teacher = {
  auth: { uid: 'teacher-uid', token: { role: 'teacher', roles: ['TEACHER'], teacher: true, class_id: 'class_1' } },
  data: { class_id: 'class_1', session_number: 'all' },
};

/** A document as the client writes it now (Appendix A §4). */
const CURRENT = {
  session_id: 'session_08_student_3',
  student_id: 3,
  reflection_step: 3,
  effort_score: 'HIGH',
  selected_strategies: ['UNDO_BUTTON', 'MEMORY_CIRCLES'],
  persistence_index: 75,
  reflection_completed: true,
  reflection_updated_at: 1_760_000_000_000,
  idempotency_key: 'srl_reflection_session_08_student_3',
  session_number: 8,
  undo_count: 3,
  error_count: 1,
  guess_count: 0,
};

/** A document stored before 9.10.2026. */
const LEGACY = {
  student_id: 4,
  session_id: 'session_08_student_4',
  session_number: 8,
  effort_level: 'LOW',
  selected_strategies: ['SOCRATIC_CARD'],
  persistence_index: 50,
  undo_count: 1,
  error_count: 1,
  guess_count: 0,
  submitted_at: 1_759_000_000_000,
};

/** Parses the export's CSV (a BOM, quoted cells, "" for a quote inside one). */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? ''])));
}

beforeEach(() => {
  h.collections = {};
  h.files.clear();
});

describe('Appendix A §4 — the reflection fields under their names', () => {
  it('a current document passes through as it is', () => {
    expect(normalizeReflectionFields({ ...CURRENT })).toEqual(CURRENT);
  });

  it('a document written before 9.10.2026 is read into Appendix A’s names', () => {
    const r = normalizeReflectionFields({ ...LEGACY });
    expect(r.effort_score).toBe('LOW');
    expect(r.reflection_updated_at).toBe(1_759_000_000_000);
    expect('effort_level' in r).toBe(false);
    expect('submitted_at' in r).toBe(false);
  });

  it('a field under its own name wins over the old one', () => {
    expect(normalizeReflectionFields({ effort_score: 'HIGH', effort_level: 'LOW' }).effort_score).toBe('HIGH');
  });

  it('the research export lists both documents with effort_score and reflection_updated_at, and no old column', async () => {
    h.collections.srl_reflections = [
      { id: 'session_08_student_3', data: CURRENT },
      { id: 'session_08_student_4', data: LEGACY },
    ];
    const result = await run(teacher);
    expect(result.status).toBe('SUCCESS');
    const csvs = [...h.files.values()].filter((c) => c.includes('reflection_id'));
    expect(csvs).toHaveLength(1);
    const rows = parseCsv(csvs[0]);
    const header = Object.keys(rows[0]);
    for (const col of ['session_id', 'student_id', 'reflection_step', 'effort_score', 'selected_strategies', 'persistence_index', 'reflection_completed', 'reflection_updated_at', 'idempotency_key']) {
      expect(header).toContain(col);
    }
    expect(header).not.toContain('effort_level');
    expect(header).not.toContain('submitted_at');
    const byId = new Map(rows.map((r) => [r.reflection_id, r]));
    expect(byId.get('session_08_student_3')).toMatchObject({ effort_score: 'HIGH', reflection_step: '3', reflection_completed: 'true', reflection_updated_at: '1760000000000', idempotency_key: 'srl_reflection_session_08_student_3' });
    expect(byId.get('session_08_student_4')).toMatchObject({ effort_score: 'LOW', reflection_updated_at: '1759000000000' });
  });
});
