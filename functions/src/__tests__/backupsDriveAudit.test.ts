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

  it('an entry written before backup_channel existed, whose backup is a gs:// url, is copied too', () => {
    expect(pendingStorageBackups([
      { id: 'old', data: { backup_status: 'success', backup_file_url: 'gs://b/drive_fallback/2026-09-01/1756700000000_גיבוי_מערכת.json' } },
      { id: 'oldDrive', data: { backup_status: 'success', backup_file_url: 'https://drive.google.com/file/d/x/view' } },
      { id: 'failed', data: { backup_status: 'failed', backup_channel: null, backup_file_url: null } },
    ])).toEqual([
      { id: 'old', storagePath: 'drive_fallback/2026-09-01/1756700000000_גיבוי_מערכת.json', fileName: 'גיבוי_מערכת.json' },
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

