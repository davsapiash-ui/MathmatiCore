import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 23א (reset) and Module 24 (research export), review round 28.9.2026:
 *
 * X26 — §ד: "חל איסור מוחלט על ביצוע איפוס כלשהו ללא רישום". The audit entry
 *       is written before anything is cleared or deleted; if it cannot be
 *       written, the reset is aborted.
 * X25 — register gap יג: `was_reset` counts only level-2/3 resets whose
 *       backup was written.
 * X27 — §ו: a teacher resets her own assigned class only.
 * X28 — §ג names Drive; register gap יב adds Cloud Storage. No third channel:
 *       when both fail, the reset is aborted.
 * X35 — a single-meeting export file says which meeting it holds.
 * X44 — class_id and reason_note are validated before anything is stored.
 */

// ── A fake firebase-admin that records the order of every write ─────────────
const h = vi.hoisted(() => ({
  log: [] as string[],
  sets: [] as Array<{ name: string; values: Record<string, unknown> }>,
  rtdbData: {} as Record<string, unknown>,
  failAuditSet: false,
  failStorage: false,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() { throw new Error('no Drive credentials in tests'); }
  },
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();

  const database = () => ({
    ref: (path: string) => ({
      get: async () => {
        const v = h.rtdbData[path];
        const isObj = v !== null && typeof v === 'object';
        return {
          val: () => (v === undefined ? null : v),
          exists: () => v !== undefined && v !== null,
          hasChildren: () => isObj && Object.keys(v as object).length > 0,
          numChildren: () => (isObj ? Object.keys(v as object).length : 0),
        };
      },
      set: async () => { h.log.push(`rtdb set ${path}`); },
      update: async () => { h.log.push(`rtdb update ${path}`); },
      remove: async () => { h.log.push(`rtdb remove ${path}`); },
    }),
  });

  const emptyQuery: any = {
    where: () => emptyQuery,
    orderBy: () => emptyQuery,
    limit: () => emptyQuery,
    startAfter: () => emptyQuery,
    get: async () => ({ docs: [], empty: true, size: 0 }),
  };
  const firestore = Object.assign(
    () => ({
      collection: (name: string) => ({
        ...emptyQuery,
        doc: (id: string) => ({
          set: async (values: Record<string, unknown>) => {
            if (name === 'reset_audit_log' && h.failAuditSet) throw new Error('audit write refused');
            h.log.push(`firestore set ${name}/${id}`);
            h.sets.push({ name, values });
          },
          update: async (values: Record<string, unknown>) => {
            h.log.push(`firestore update ${name}/${id} ${JSON.stringify(values)}`);
          },
        }),
      }),
      batch: () => ({ delete: () => {}, commit: async () => {} }),
      // The per-class reset lock (Module 23א §ד): always free here.
      runTransaction: async (fn: (tx: any) => Promise<unknown>) =>
        fn({ get: async () => ({ exists: false, data: () => undefined }), set: () => {}, delete: () => {} }),
    }),
    actual.firestore
  );

  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (path: string) => ({
        save: async () => {
          if (h.failStorage) throw new Error('storage refused');
          h.log.push(`storage save ${path}`);
        },
        getSignedUrl: async () => ['https://signed.example/file'],
      }),
    }),
  });

  const app = () => { throw new Error('no default app in tests'); };

  return { ...actual, default: { ...actual, database, firestore, storage, app }, database, firestore, storage, app };
});

import {
  backupAndResetSessionData,
  exportResearchDataset,
  isValidExportScope,
  isCountableReset,
  researchExportFileName,
  sanitizeReasonNote,
  validateClassId,
  assertCallerClass,
  REASON_NOTE_MAX_LENGTH,
} from '../exportDriveReport';

function teacherRequest(data: Record<string, unknown>, claims: Record<string, unknown> = {}) {
  return {
    auth: { uid: 'teacher-uid', token: { role: 'teacher', roles: ['TEACHER'], teacher: true, class_id: 'class_1', ...claims } },
    data: { reason: 'technical_fault', class_id: 'class_1', ...data },
  };
}

const run = (req: unknown) => (backupAndResetSessionData as any).run(req);

beforeEach(() => {
  h.log.length = 0;
  h.sets.length = 0;
  h.rtdbData = {};
  h.failAuditSet = false;
  h.failStorage = false;
});

describe('X26 — the audit entry is written first, and a failed write aborts the reset', () => {
  it('alerts: the entry precedes the first cleared node', async () => {
    await run(teacherRequest({ reset_level: 'alerts' }));
    const audit = h.log.findIndex((l) => l.startsWith('firestore set reset_audit_log/'));
    const firstClear = h.log.findIndex((l) => l.startsWith('rtdb '));
    expect(audit).toBeGreaterThanOrEqual(0);
    expect(firstClear).toBeGreaterThan(audit);
  });

  it('alerts: when the entry cannot be written, nothing is cleared', async () => {
    h.failAuditSet = true;
    await expect(run(teacherRequest({ reset_level: 'alerts' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(h.log.filter((l) => l.startsWith('rtdb '))).toEqual([]);
  });

  it('level 2: the entry is written after the backup and before the deletion, then gets the real count', async () => {
    h.rtdbData['users/students/student_user3'] = { a: 1, b: 2 };
    const result = await run(teacherRequest({ reset_level: 'single_student', reset_scope: 'full_student', student_id: 3 }));
    expect(result.status).toBe('SUCCESS');
    const backup = h.log.findIndex((l) => l.startsWith('storage save'));
    const audit = h.log.findIndex((l) => l.startsWith('firestore set reset_audit_log/'));
    const removal = h.log.indexOf('rtdb remove users/students/student_user3');
    expect(backup).toBeGreaterThanOrEqual(0);
    expect(audit).toBeGreaterThan(backup);
    expect(removal).toBeGreaterThan(audit);
    expect(h.log.find((l) => l.startsWith('firestore update reset_audit_log/'))).toContain('"records_deleted_count":2');
  });

  it('level 2: when the entry cannot be written, the backup stays and nothing is deleted', async () => {
    h.rtdbData['users/students/student_user3'] = { a: 1 };
    h.failAuditSet = true;
    await expect(run(teacherRequest({ reset_level: 'single_student', reset_scope: 'full_student', student_id: 3 })))
      .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('לא נמחקו נתונים') });
    expect(h.log.some((l) => l.startsWith('storage save'))).toBe(true);
    expect(h.log.filter((l) => l.startsWith('rtdb remove') || l.startsWith('rtdb update'))).toEqual([]);
  });
});

describe('X28 — two backup channels, Drive then Storage, and no third', () => {
  it('when Drive and Storage both fail, the reset is aborted with the PRD message and nothing is deleted', async () => {
    h.rtdbData['users/students/student_user3'] = { a: 1 };
    h.failStorage = true;
    await expect(run(teacherRequest({ reset_level: 'single_student', reset_scope: 'full_student', student_id: 3 })))
      .rejects.toMatchObject({ message: 'הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.' });
    expect(h.log.some((l) => l.includes('system_backups'))).toBe(false);
    expect(h.log.filter((l) => l.startsWith('rtdb remove'))).toEqual([]);
  });

  it('the Firestore system_backups channel is gone from the code', () => {
    const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
    expect(src).not.toContain('db.collection("system_backups")');
    expect(src).not.toContain('firestore://system_backups');
  });
});

describe('X27 — the reset is scoped to the caller\'s own class', () => {
  it('a teacher of another class is refused before anything is written', async () => {
    await expect(run(teacherRequest({ reset_level: 'alerts', class_id: 'class_2' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.log).toEqual([]);
  });

  it('the helper lets a token without a class claim through, as the export always has', () => {
    expect(() => assertCallerClass({}, 'class_1', 'x')).not.toThrow();
    expect(() => assertCallerClass({ class_id: 'class_1' }, 'class_1', 'x')).not.toThrow();
    expect(() => assertCallerClass({ class_id: 'class_1' }, 'class_2', 'x')).toThrow();
  });
});

describe('X44 — class_id and reason_note are validated', () => {
  it('class_id: absent is the pilot class; a malformed one is refused', () => {
    expect(validateClassId(undefined, 'x')).toBe('class_1');
    expect(validateClassId('class_1', 'x')).toBe('class_1');
    for (const bad of ['', 'class/1', '../x', 'a'.repeat(41), 7, { id: 1 }]) {
      expect(() => validateClassId(bad, 'x')).toThrow();
    }
  });

  it('the reset refuses a malformed class_id before anything is written', async () => {
    await expect(run(teacherRequest({ reset_level: 'alerts', class_id: 'class_1/../x' })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(h.log).toEqual([]);
  });

  it('reason_note: blank is null, non-text is refused, long text is capped, PII is scrubbed', () => {
    expect(sanitizeReasonNote(undefined)).toBeNull();
    expect(sanitizeReasonNote('   ')).toBeNull();
    expect(() => sanitizeReasonNote({ note: 'x' })).toThrow();
    expect(() => sanitizeReasonNote(42)).toThrow();
    expect(sanitizeReasonNote('x'.repeat(5000))!.length).toBe(REASON_NOTE_MAX_LENGTH);
    const scrubbed = sanitizeReasonNote('תקלה, אפשר לכתוב אל teacher@example.com');
    expect(scrubbed).not.toContain('teacher@example.com');
    expect(scrubbed).toContain('[REDACTED_EMAIL]');
  });

  it('the reset stores the scrubbed note, not the raw one', async () => {
    await run(teacherRequest({ reset_level: 'alerts', reason_note: 'קוראים לי דנה' }));
    const entry = h.sets.find((s) => s.name === 'reset_audit_log');
    expect(entry?.values.reason_note).toBe('קוראים לי [REDACTED_NAME]');
    await expect(run(teacherRequest({ reset_level: 'alerts', reason_note: ['x'] })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('X25 — only real resets mark a meeting as reset', () => {
  it('level 2 and 3 with a written backup count; alerts, failed backups and exports do not', () => {
    expect(isCountableReset({ reset_level: 'single_student', backup_status: 'success' })).toBe(true);
    expect(isCountableReset({ reset_level: 'system', backup_status: 'success' })).toBe(true);
    expect(isCountableReset({ reset_level: 'alerts', backup_status: 'not_required' })).toBe(false);
    expect(isCountableReset({ reset_level: 'single_student', backup_status: 'failed' })).toBe(false);
    expect(isCountableReset({ reset_level: 'system', backup_status: 'failed' })).toBe(false);
    expect(isCountableReset({ reset_level: 'export', status: 'SUCCESS' })).toBe(false);
    expect(isCountableReset(null)).toBe(false);
  });

  it('the export applies the filter before flagging a meeting', () => {
    const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
    const loop = src.slice(src.indexOf('for (const { data } of resetLogs) {'));
    expect(loop.slice(0, 600)).toContain('if (!isCountableReset(data)) continue;');
  });
});

describe('the export scope is one meeting 1–8, or the whole process', () => {
  it('accepts the whole process and meetings 1–8, as numbers or digit strings', () => {
    for (const ok of [undefined, null, 'all', 1, 8, '3']) {
      expect(isValidExportScope(ok), String(ok)).toBe(true);
    }
  });

  it('refuses everything else', () => {
    for (const bad of [0, 9, 99, -1, 3.5, '3.5', '', 'abc', '0', 'ALL', true, [3], { n: 3 }, NaN, Infinity]) {
      expect(isValidExportScope(bad), String(bad)).toBe(false);
    }
  });

  it('the callable refuses a bad meeting number with the Hebrew message, before reading anything', async () => {
    for (const bad of [0, 9, 3.5, 'abc', [3]]) {
      await expect((exportResearchDataset as any).run(teacherRequest({ session_number: bad })))
        .rejects.toMatchObject({ code: 'invalid-argument', message: 'מספר המפגש אינו תקין. הייצוא בוטל.' });
    }
    expect(h.log).toEqual([]);
  });
});

describe('X35 — export file names carry the scope', () => {
  it('one meeting, and the whole process', () => {
    // PRD Module 24 §ב: "ייצוא DD.MM.YYYY HH-mm - <קובץ>.csv" for all sessions,
    // "ייצוא מפגש N - DD.MM.YYYY HH-mm - <קובץ>.csv" for one, Israel time.
    const at = Date.UTC(2026, 8, 28, 7, 30); // 10:30 in Israel (summer time)
    expect(researchExportFileName('פעולות', 3, at)).toBe('ייצוא מפגש 3 - 28.09.2026 10-30 - פעולות.csv');
    expect(researchExportFileName('יומן איפוסים', null, at)).toBe('ייצוא 28.09.2026 10-30 - יומן איפוסים.csv');
  });
});
