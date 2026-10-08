import { describe, it, expect } from 'vitest';
import {
  DRIVE_FOLDERS,
  adminReportFileName,
  backupFileName,
  classReportFileName,
  learnerReportFileName,
  researchExportFileName,
} from '../driveNames';
import {
  RESET_LOCK_REFUSAL_HE,
  acquireClassResetLock,
  deletionStatusAfter,
  exportAuditEntry,
  isCompletedReset,
  releaseClassResetLock,
  writeResetBackup,
} from '../resetAudit';
import { copyPendingBackups, pendingStorageBackups } from '../backupDriveCopy';
import {
  classifyRecordingWrite,
  learnerOfKey,
  lateRecordingStoragePath,
  pushKeyTime,
  resetMissedByChunk,
  withLateEntry,
} from '../lateRecordings';

/** PRD Modules 23 ("תיקיות הדרייב"), 23א §ג–§ד and 24 §ב. */

// 8.10.2026 14:30 in Israel (summer time, UTC+3).
const AT = Date.UTC(2026, 9, 8, 11, 30);

describe('Drive: four flat folders and the PRD file names, Israel time', () => {
  it('the four folders, by name', () => {
    expect(Object.values(DRIVE_FOLDERS)).toEqual(['1 דוחות', '2 נתוני מחקר', '3 גיבויים', '4 מנהל']);
  });

  it('the names of every file the system writes', () => {
    expect(learnerReportFileName(3, 1, AT)).toBe('מפגש 3 - תלמיד 01 - 08.10.2026.pdf');
    expect(classReportFileName(3, 'pdf', AT)).toBe('מפגש 3 - כיתה - 08.10.2026.pdf');
    expect(researchExportFileName('פעולות', null, AT)).toBe('ייצוא 08.10.2026 14-30 - פעולות.csv');
    expect(researchExportFileName('פעולות', 3, AT)).toBe('ייצוא מפגש 3 - 08.10.2026 14-30 - פעולות.csv');
    expect(backupFileName({ type: 'student_session', student: 4, session: 3 }, AT)).toBe('גיבוי 08.10.2026 14-30 - תלמיד 04 מפגש 3.json');
    expect(backupFileName({ type: 'student_full', student: 4 }, AT)).toBe('גיבוי 08.10.2026 14-30 - תלמיד 04 מוחלט.json');
    expect(backupFileName({ type: 'class_session', session: 5 }, AT)).toBe('גיבוי 08.10.2026 14-30 - כל הכיתה מפגש 5.json');
    expect(backupFileName({ type: 'system' }, AT)).toBe('גיבוי 08.10.2026 14-30 - מערכת.json');
    expect(adminReportFileName(AT)).toBe('דוח מנהל 08.10.2026.pdf');
  });
});

describe('the backup: Drive within 90 s, else Cloud Storage backups/{class_id}/', () => {
  const storageOk = async (_b: Buffer, path: string) => `gs://bucket/${path}`;

  it('Drive answers: channel drive', async () => {
    const out = await writeResetBackup(Buffer.from('{}'), 'f.json', 'backups/class_1/r/f.json', {
      writeDrive: async () => ({ success: true, webViewLink: 'https://drive.google.com/file/d/x/view' }),
      writeStorage: storageOk,
    });
    expect(out).toEqual({ channel: 'drive', url: 'https://drive.google.com/file/d/x/view' });
  });

  it('Drive fails: channel storage, under backups/{class_id}/', async () => {
    const out = await writeResetBackup(Buffer.from('{}'), 'f.json', 'backups/class_1/r/f.json', {
      writeDrive: async () => ({ success: false, error: 'quota' }),
      writeStorage: storageOk,
    });
    expect(out).toMatchObject({ channel: 'storage', url: 'gs://bucket/backups/class_1/r/f.json' });
  });

  it('Drive does not finish in time: aborted, channel storage', async () => {
    let aborted = false;
    const out = await writeResetBackup(Buffer.from('{}'), 'f.json', 'backups/class_1/r/f.json', {
      writeDrive: (_b, _n, signal) => new Promise(() => { signal.addEventListener('abort', () => { aborted = true; }); }),
      writeStorage: storageOk,
      timeoutMs: 20,
    });
    expect(out?.channel).toBe('storage');
    expect(aborted).toBe(true);
  });

  it('above 30MB: straight to Cloud Storage, Drive never called', async () => {
    let driveCalled = false;
    const out = await writeResetBackup(Buffer.alloc(11), 'f.json', 'backups/class_1/r/f.json', {
      writeDrive: async () => { driveCalled = true; return { success: true, webViewLink: 'x' }; },
      writeStorage: storageOk,
      maxDriveBytes: 10,
    });
    expect(out?.channel).toBe('storage');
    expect(driveCalled).toBe(false);
  });

  it('both fail: null, and the caller deletes nothing', async () => {
    const out = await writeResetBackup(Buffer.from('{}'), 'f.json', 'p', {
      writeDrive: async () => { throw new Error('down'); },
      writeStorage: async () => { throw new Error('down too'); },
    });
    expect(out).toBeNull();
  });
});

describe('the daily copy of Storage-only backups to "3 גיבויים"', () => {
  const entries = [
    { id: 'a', data: { backup_channel: 'storage', backup_drive_copied_at: null, backup_file_url: 'gs://b/backups/class_1/a/גיבוי 08.10.2026 14-30 - מערכת.json' } },
    { id: 'b', data: { backup_channel: 'storage', backup_drive_copied_at: 5, backup_file_url: 'https://drive.google.com/file/d/b/view' } },
    { id: 'c', data: { backup_channel: 'drive', backup_file_url: 'https://drive.google.com/file/d/c/view' } },
  ];

  it('only the entries still in Storage alone, under their original names', () => {
    expect(pendingStorageBackups(entries)).toEqual([
      { id: 'a', storagePath: 'backups/class_1/a/גיבוי 08.10.2026 14-30 - מערכת.json', fileName: 'גיבוי 08.10.2026 14-30 - מערכת.json' },
    ]);
  });

  it('sets the Drive link and backup_drive_copied_at; a failure leaves the entry waiting', async () => {
    const marked: unknown[] = [];
    const pending = [...pendingStorageBackups(entries), { id: 'z', storagePath: 'backups/class_1/z/x.json', fileName: 'x.json' }];
    const res = await copyPendingBackups(pending, {
      readStorage: async (p) => { if (p.includes('/z/')) throw new Error('gone'); return Buffer.from('{}'); },
      writeDrive: async () => ({ success: true, webViewLink: 'https://drive.google.com/file/d/new/view' }),
      markCopied: async (id, link, at) => { marked.push([id, link, at]); },
      now: () => 7,
    });
    expect(res).toEqual({ copied: ['a'], failed: ['z'] });
    expect(marked).toEqual([['a', 'https://drive.google.com/file/d/new/view', 7]]);
  });
});

describe('the audit trail', () => {
  it('only a completed reset counts', () => {
    expect(isCompletedReset({ reset_level: 'single_student', deletion_status: 'completed', backup_status: 'success' })).toBe(true);
    expect(isCompletedReset({ reset_level: 'system', deletion_status: 'partial', backup_status: 'success' })).toBe(false);
    expect(isCompletedReset({ reset_level: 'system', deletion_status: 'in_progress', backup_status: 'success' })).toBe(false);
    expect(isCompletedReset({ reset_level: 'export', deletion_status: 'not_required' })).toBe(false);
    expect(isCompletedReset({ reset_level: 'alerts', deletion_status: 'not_required' })).toBe(false);
    // Entries written before deletion_status existed: by their backup.
    expect(isCompletedReset({ reset_level: 'system', backup_status: 'success' })).toBe(true);
    expect(isCompletedReset({ reset_level: 'system', backup_status: 'failed' })).toBe(false);
    expect(deletionStatusAfter([])).toBe('completed');
    expect(deletionStatusAfter(['x'])).toBe('partial');
  });

  it('an export entry: reset_level export, ResetAuditEntry shape, no e-mail', () => {
    const entry = exportAuditEntry({ resetId: 'e1', teacherUid: 'uid', classId: 'class_1', affectedStudentIds: [1, 2], fileUrl: null, note: 'הורדת המפגש', sessionNumber: 3, now: 9 });
    expect(entry).toMatchObject({
      reset_id: 'e1', reset_level: 'export', backup_file_url: null, backup_status: 'not_required',
      reset_reason: 'other', reason_note: 'הורדת המפגש', records_deleted_count: 0, affected_student_ids: [1, 2],
    });
    expect(JSON.stringify(entry)).not.toMatch(/mail|@/i);
  });

  it('one reset per class at a time', async () => {
    const docs = new Map<string, any>();
    const db: any = {
      collection: () => ({ doc: (id: string) => id }),
      runTransaction: async (fn: any) => fn({
        get: async (id: string) => ({ exists: docs.has(id), data: () => docs.get(id) }),
        set: (id: string, v: any) => docs.set(id, v),
        delete: (id: string) => docs.delete(id),
      }),
    };
    expect(await acquireClassResetLock(db, 'class_1', 'r1', 1000)).toBe(true);
    expect(await acquireClassResetLock(db, 'class_1', 'r2', 2000)).toBe(false);
    // Another reset cannot release it; the holder can.
    await releaseClassResetLock(db, 'class_1', 'r2');
    expect(await acquireClassResetLock(db, 'class_1', 'r2', 3000)).toBe(false);
    await releaseClassResetLock(db, 'class_1', 'r1');
    expect(await acquireClassResetLock(db, 'class_1', 'r2', 4000)).toBe(true);
    // A lock left by a reset that died expires.
    expect(await acquireClassResetLock(db, 'class_1', 'r3', 4000 + 16 * 60_000)).toBe(true);
    expect(RESET_LOCK_REFUSAL_HE).toBe('איפוס אחר של הכיתה מתבצע כעת. נסו שוב בעוד רגע. לא נמחקו נתונים.');
  });
});

describe('recording chunks that arrive after a full learner or system reset', () => {
  const PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  const pushKey = (t: number) => {
    let s = '';
    for (let i = 0; i < 8; i++) { s = PUSH.charAt(t % 64) + s; t = Math.floor(t / 64); }
    return `${s}abcdefghijkl`;
  };
  const RESET_AT = AT;
  const full = { reset_id: 'reset_1', class_id: 'class_1', reset_level: 'single_student', reset_scope: 'full_student', affected_student_ids: [4], performed_at: RESET_AT, backup_status: 'success', deletion_status: 'completed' };

  it('reads the device time out of the chunk\'s push key, and the learner out of the node', () => {
    expect(pushKeyTime(pushKey(RESET_AT - 5000))).toBe(RESET_AT - 5000);
    expect(pushKeyTime('not-a-key')).toBeNull();
    expect(learnerOfKey('student_user4')).toBe(4);
    expect(learnerOfKey('student_12')).toBe(12);
    expect(learnerOfKey('student_user13')).toBeNull();
    expect(classifyRecordingWrite('telemetry_sessions', 'session_1', 'chunks')).toBe('chunk');
    expect(classifyRecordingWrite('telemetry_sessions', 'session_1', 'metadata')).toBe('metadata');
    expect(classifyRecordingWrite('recorded_bytes', 'meeting_3', 'chunks')).toBe('bytes');
    expect(classifyRecordingWrite('recorded_bytes', 'meeting_3', 'truncated')).toBeNull();
  });

  it('recorded before a completed full reset and arrived after it: late, linked to that reset', () => {
    expect(resetMissedByChunk([full], 4, RESET_AT - 5000, RESET_AT + 60_000)).toEqual({ reset_id: 'reset_1', class_id: 'class_1', performed_at: RESET_AT });
    expect(resetMissedByChunk([{ ...full, reset_level: 'system', reset_scope: undefined, affected_student_ids: [1, 2, 3, 4] }], 4, RESET_AT - 5000, RESET_AT + 1)?.reset_id).toBe('reset_1');
  });

  it('not late: recorded after the reset, another learner, a session reset, or a reset that did not complete', () => {
    expect(resetMissedByChunk([full], 4, RESET_AT + 1, RESET_AT + 60_000)).toBeNull();
    expect(resetMissedByChunk([full], 5, RESET_AT - 5000, RESET_AT + 60_000)).toBeNull();
    expect(resetMissedByChunk([{ ...full, reset_scope: 'active_session', session_number: 3 }], 4, RESET_AT - 5000, RESET_AT + 60_000)).toBeNull();
    expect(resetMissedByChunk([{ ...full, deletion_status: 'partial' }], 4, RESET_AT - 5000, RESET_AT + 60_000)).toBeNull();
  });

  it('one file per reset × learner × recording, named "הקלטה שהגיעה אחרי האיפוס", next to the reset\'s backup', () => {
    const reset = { reset_id: 'reset_1', class_id: 'class_1', performed_at: RESET_AT };
    expect(lateRecordingStoragePath(reset, 4, 'session_17')).toBe('backups/class_1/reset_1/הקלטה שהגיעה אחרי האיפוס - תלמיד 04 - session_17 - 08.10.2026 14-30.json');
    const base = { reset_id: 'reset_1', class_id: 'class_1', student_id: 4, recording_id: 'session_17' };
    const one = withLateEntry(null, base, 'chunks', 'k1', '[1]');
    const two = withLateEntry(one, base, 'metadata', 'k1', { startTime: 1 });
    const three = withLateEntry(two, base, 'chunks', 'k2', '[2]');
    expect(three.chunks).toEqual({ k1: '[1]', k2: '[2]' });
    expect(three.metadata).toEqual({ k1: { startTime: 1 } });
    expect(three.label).toBe('הקלטה שהגיעה אחרי האיפוס');
  });
});
