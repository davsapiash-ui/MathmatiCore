import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('firebase-functions/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, log: () => {} }));

import {
  copyExportFallbacksToDrive,
  copyPendingBackups,
  exportUrlParts,
  nextExportFileUrl,
  pendingExportFallbackCopies,
  pendingStorageBackups,
} from '../backupDriveCopy';
import { exportAuditEntry } from '../resetAudit';
import { DRIVE_FOLDERS } from '../driveNames';

/**
 * Owner decision 11.10.2026: a research-export file Drive refused waits in
 * Cloud Storage under drive_fallback/; the daily copy task (copyStorageBackupsToDrive)
 * also copies it into the Drive folder "2 נתוני מחקר", puts the Drive link in
 * the export's reset_audit_log entry in place of the gs:// url, and keeps the
 * Storage copy.
 */

const FOLDER = 'https://drive.google.com/drive/folders/F';
const PARKED_A = 'gs://b/drive_fallback/2026-10-11/1760180000000_ייצוא_11.10.2026_14-30_-_פעולות.csv';
const PARKED_B = 'gs://b/drive_fallback/2026-10-11/1760180000001_ייצוא_11.10.2026_14-30_-_מפגשים.csv';

const exportEntry = (fileUrl: string | null) =>
  exportAuditEntry({ resetId: 'export_1', teacherUid: 't', classId: 'class_1', affectedStudentIds: [1], fileUrl, note: 'n', sessionNumber: null, now: 1 });

describe('which export files are waiting', () => {
  it('every drive_fallback/ gs:// url of an export entry, by its parked name without the time prefix', () => {
    const pending = pendingExportFallbackCopies([
      { id: 'export_1', data: exportEntry(`${FOLDER} | ${PARKED_A} | ${PARKED_B}`) },
    ]);
    expect(pending).toEqual([
      { entryId: 'export_1', storageUrl: PARKED_A, storagePath: PARKED_A.slice('gs://b/'.length), fileName: 'ייצוא_11.10.2026_14-30_-_פעולות.csv' },
      { entryId: 'export_1', storageUrl: PARKED_B, storagePath: PARKED_B.slice('gs://b/'.length), fileName: 'ייצוא_11.10.2026_14-30_-_מפגשים.csv' },
    ]);
  });

  it('not an export written to Drive, not a reset entry, not a gs:// url outside drive_fallback/', () => {
    expect(pendingExportFallbackCopies([
      { id: 'export_ok', data: exportEntry(FOLDER) },
      { id: 'export_none', data: exportEntry(null) },
      { id: 'reset', data: { reset_level: 'system', backup_channel: 'storage', backup_file_url: PARKED_A } },
      { id: 'export_other', data: exportEntry('gs://b/backups/class_1/r/f.json') },
    ])).toEqual([]);
  });

  it('the reset-backup copy does not take an export entry (backup_status not_required)', () => {
    expect(pendingStorageBackups([{ id: 'export_1', data: exportEntry(PARKED_A) }])).toEqual([]);
  });
});

describe('the entry after a copy', () => {
  it('the gs:// url is replaced by the Drive link; the other parts stay', () => {
    expect(nextExportFileUrl(`${FOLDER} | ${PARKED_A} | ${PARKED_B}`, PARKED_A, 'https://drive/a'))
      .toBe(`${FOLDER} | https://drive/a | ${PARKED_B}`);
    expect(nextExportFileUrl(PARKED_A, PARKED_A, 'https://drive/a')).toBe('https://drive/a');
  });

  it('a second copy of the same file does not add its link twice', () => {
    expect(nextExportFileUrl('https://drive/a', PARKED_A, 'https://drive/a')).toBe('https://drive/a');
    expect(exportUrlParts(' a |  b ')).toEqual(['a', 'b']);
  });
});

describe('copyExportFallbacksToDrive', () => {
  it('reads the Storage copy, writes it under its original name, and marks the entry', async () => {
    const writes: string[] = [];
    const marks: unknown[][] = [];
    const pending = pendingExportFallbackCopies([{ id: 'export_1', data: exportEntry(`${PARKED_A} | ${PARKED_B}`) }]);
    const out = await copyExportFallbacksToDrive(pending, {
      readStorage: async (path) => Buffer.from(path),
      readOriginalName: async (path) => (path.includes('פעולות') ? 'ייצוא 11.10.2026 14-30 - פעולות.csv' : null),
      writeDrive: async (_b, name) => { writes.push(name); return { success: true, webViewLink: `https://drive/${writes.length}` }; },
      markExportCopied: async (...args) => { marks.push(args); },
      now: () => 99,
    });
    expect(out.copied).toHaveLength(2);
    expect(out.failed).toEqual([]);
    // The original name when Storage kept it; else the parked name.
    expect(writes).toEqual(['ייצוא 11.10.2026 14-30 - פעולות.csv', 'ייצוא_11.10.2026_14-30_-_מפגשים.csv']);
    expect(marks).toEqual([
      ['export_1', PARKED_A, 'https://drive/1', 99],
      ['export_1', PARKED_B, 'https://drive/2', 99],
    ]);
  });

  it('a Drive refusal leaves the file waiting and does not stop the others', async () => {
    const marks: unknown[][] = [];
    const pending = pendingExportFallbackCopies([{ id: 'export_1', data: exportEntry(`${PARKED_A} | ${PARKED_B}`) }]);
    let n = 0;
    const out = await copyExportFallbacksToDrive(pending, {
      readStorage: async () => Buffer.from('x'),
      writeDrive: async () => (++n === 1 ? { success: false, error: 'quota' } : { success: true, webViewLink: 'https://drive/b' }),
      markExportCopied: async (...args) => { marks.push(args); },
    });
    expect(out.failed).toEqual([PARKED_A.slice('gs://b/'.length)]);
    expect(out.copied).toEqual([PARKED_B.slice('gs://b/'.length)]);
    expect(marks.map((m) => m[1])).toEqual([PARKED_B]);
  });

  it('the reset-backup copy is unchanged by it', async () => {
    const out = await copyPendingBackups([], { readStorage: async () => Buffer.from(''), writeDrive: async () => ({ success: true }), markCopied: async () => {} });
    expect(out).toEqual({ copied: [], failed: [] });
  });
});

describe('the daily task writes them to "2 נתוני מחקר" as CSV, without parking them again', () => {
  const src = readFileSync(resolve(__dirname, '../backupDriveCopy.ts'), 'utf-8');
  it('the folder and the query', () => {
    expect(DRIVE_FOLDERS.researchData).toBe('2 נתוני מחקר');
    expect(src).toContain('uploadBufferToDrive(buffer, fileName, "text/csv", DRIVE_FOLDERS.researchData, { park: false })');
    expect(src).toContain('.where("reset_level", "==", "export")');
  });
});
