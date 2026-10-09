import { describe, it, expect } from 'vitest';
import {
  assembleLateRecordings,
  lateRecordingFileNameOf,
  lateRecordingStoragePath,
  type AssembleDeps,
  type LateRecordingFile,
} from '../lateRecordings';
import {
  LATE_DRIVE_FIELD,
  LATE_DRIVE_PENDING_FIELD,
  copyLateRecordingsToDrive,
  lateDriveKey,
  nextLateFiles,
  pendingLateRecordingCopies,
  type LateDriveRecord,
} from '../backupDriveCopy';
import { DRIVE_FOLDERS } from '../driveNames';

/**
 * Owner decision 9.10.2026 (PRD Module 23א §ג): the late recording file
 * "הקלטה שהגיעה אחרי האיפוס - ….json" is copied by the daily job to the Drive
 * folder "3 גיבויים", like the other Storage-only backups. The audit entry's
 * link becomes the Drive link; the Storage copy is kept; a Drive failure
 * leaves the file in Storage for the next run; a re-run never uploads the
 * same content twice.
 */

// 8.10.2026 14:30 in Israel (summer time, UTC+3).
const RESET_AT = Date.UTC(2026, 9, 8, 11, 30);
const RESET = { reset_id: 'reset_1', class_id: 'class_1', performed_at: RESET_AT };
const PATH = lateRecordingStoragePath(RESET, 4, 'session_100');
const GS = `gs://bucket/${PATH}`;

/** A tiny RTDB: a nested tree, multi-path updates applied at once. */
function fakeTree(initial: Record<string, unknown>) {
  const root: Record<string, any> = {};
  const parts = (p: string) => p.split('/').filter(Boolean);
  const get = (p: string): unknown => parts(p).reduce<any>((n, k) => (n && typeof n === 'object' ? n[k] : undefined), root) ?? null;
  const set = (p: string, v: unknown) => {
    const ks = parts(p);
    const stack: Array<[Record<string, any>, string]> = [];
    let n = root;
    for (const k of ks.slice(0, -1)) {
      if (n[k] === undefined || typeof n[k] !== 'object') { if (v === null) return; n[k] = {}; }
      stack.push([n, k]);
      n = n[k];
    }
    if (v === null) delete n[ks[ks.length - 1]];
    else n[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
    // An emptied node disappears, as in RTDB.
    for (let i = stack.length - 1; i >= 0; i--) {
      const [parent, k] = stack[i];
      if (Object.keys(parent[k]).length === 0) delete parent[k];
    }
  };
  for (const [p, v] of Object.entries(initial)) set(p, v);
  return { get, update: async (u: Record<string, unknown>) => { for (const [p, v] of Object.entries(u)) set(p, v); } };
}

/** The daily run over one reset: Storage, Firestore audit entry and Drive, all in memory. */
function world() {
  const tree = fakeTree({
    'late_recordings_pending/reset_1': { class_id: 'class_1', performed_at: RESET_AT, moves: 1 },
    'late_recordings/reset_1/learner_4/session_100': { chunks: { a: '[1]', b: '[2]' } },
  });
  const storage: Record<string, string> = {};
  const entry: Record<string, unknown> = { backup_channel: 'drive', backup_file_url: 'https://drive.google.com/file/d/backup/view' };
  const uploads: Array<{ fileName: string; folder: string; bytes: number }> = [];
  let driveDown = false;
  let n = 0;

  const assembleDeps: AssembleDeps = {
    read: async (p) => tree.get(p),
    update: tree.update,
    readFile: async (p) => (storage[p] ? JSON.parse(storage[p]) as LateRecordingFile : null),
    writeFile: async (p, f) => { storage[p] = JSON.stringify(f); return `gs://bucket/${p}`; },
    // As firebaseAssembleDeps: arrayUnion + the pending flag.
    link: async (_id, url) => {
      const files = (entry.late_recording_files as string[] | undefined) ?? [];
      if (!files.includes(url)) entry.late_recording_files = [...files, url];
      entry[LATE_DRIVE_PENDING_FIELD] = true;
    },
    dropPending: async (id) => { await tree.update({ [`late_recordings_pending/${id}`]: null }); },
  };

  const copyDeps = {
    readStorage: async (p: string) => { if (storage[p] === undefined) throw new Error('404'); return Buffer.from(storage[p], 'utf-8'); },
    // As the scheduler: uploadBufferToDrive(…, DRIVE_FOLDERS.backups, { park: false }).
    writeDrive: async (buffer: Buffer, fileName: string) => {
      if (driveDown) return { success: false, error: 'Drive API 503' };
      uploads.push({ fileName, folder: DRIVE_FOLDERS.backups, bytes: buffer.length });
      return { success: true, webViewLink: `https://drive.google.com/file/d/late${++n}/view` };
    },
    // As the scheduler's transaction.
    markLateCopied: async (_id: string, storageUrl: string, key: string, record: LateDriveRecord, replaces: string | null) => {
      const next = nextLateFiles((entry.late_recording_files as unknown[]) ?? [], storageUrl, record.drive_link, replaces);
      entry.late_recording_files = next;
      entry[LATE_DRIVE_FIELD] = { ...((entry[LATE_DRIVE_FIELD] as object) ?? {}), [key]: record };
      entry[LATE_DRIVE_PENDING_FIELD] = next.some((u) => u.startsWith('gs://'));
    },
    now: () => 99,
  };

  const daily = async () => {
    const assembled = await assembleLateRecordings(assembleDeps);
    const pending = entry[LATE_DRIVE_PENDING_FIELD] === true ? pendingLateRecordingCopies([{ id: 'reset_1', data: entry }]) : [];
    const copied = await copyLateRecordingsToDrive(pending, copyDeps);
    return { assembled, copied };
  };
  const lateChunks = async (chunks: Record<string, string>) => {
    await tree.update({
      'late_recordings_pending/reset_1': { class_id: 'class_1', performed_at: RESET_AT, moves: 2 },
      'late_recordings/reset_1/learner_4/session_100/chunks': chunks,
    });
  };
  return { tree, storage, entry, uploads, daily, lateChunks, setDriveDown: (v: boolean) => { driveDown = v; } };
}

describe('the late recording file is copied to "3 גיבויים"', () => {
  it('Drive succeeds: the link becomes the Drive link, the Storage copy stays, the quarantine is cleared', async () => {
    const w = world();
    const { assembled, copied } = await w.daily();
    expect(assembled).toEqual({ written: [PATH], failed: [] });
    expect(copied).toEqual({ copied: [PATH], relinked: [], failed: [] });

    const fileName = lateRecordingFileNameOf(4, 'session_100', RESET_AT);
    expect(fileName).toBe('הקלטה שהגיעה אחרי האיפוס - תלמיד 04 - session_100 - 08.10.2026 14-30.json');
    expect(w.uploads).toEqual([{ fileName, folder: '3 גיבויים', bytes: Buffer.byteLength(w.storage[PATH], 'utf-8') }]);

    expect(w.entry.late_recording_files).toEqual(['https://drive.google.com/file/d/late1/view']);
    expect(w.entry[LATE_DRIVE_PENDING_FIELD]).toBe(false);
    const record = (w.entry[LATE_DRIVE_FIELD] as Record<string, LateDriveRecord>)[lateDriveKey(PATH)];
    expect(record).toMatchObject({ storage_url: GS, drive_link: 'https://drive.google.com/file/d/late1/view', copied_at: 99 });
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
    // The other backup fields are untouched.
    expect(w.entry.backup_file_url).toBe('https://drive.google.com/file/d/backup/view');

    expect(JSON.parse(w.storage[PATH]).chunks).toEqual({ a: '[1]', b: '[2]' });
    expect(w.tree.get('late_recordings/reset_1/learner_4/session_100/chunks')).toBeNull();
  });

  it('Drive fails: the file stays in Storage, linked by gs://, and the next run copies it', async () => {
    const w = world();
    w.setDriveDown(true);
    const first = await w.daily();
    // The Storage write succeeded, so the quarantine is cleared exactly as before.
    expect(first.assembled.written).toEqual([PATH]);
    expect(w.tree.get('late_recordings/reset_1/learner_4/session_100/chunks')).toBeNull();
    expect(first.copied).toEqual({ copied: [], relinked: [], failed: [PATH] });
    expect(w.uploads).toEqual([]);
    expect(w.entry.late_recording_files).toEqual([GS]);
    expect(w.entry[LATE_DRIVE_PENDING_FIELD]).toBe(true);
    expect(w.entry[LATE_DRIVE_FIELD]).toBeUndefined();
    expect(JSON.parse(w.storage[PATH]).chunks).toEqual({ a: '[1]', b: '[2]' });

    w.setDriveDown(false);
    const second = await w.daily();
    expect(second.assembled).toEqual({ written: [], failed: [] });
    expect(second.copied).toEqual({ copied: [PATH], relinked: [], failed: [] });
    expect(w.uploads).toHaveLength(1);
    expect(w.entry.late_recording_files).toEqual(['https://drive.google.com/file/d/late1/view']);
    expect(w.entry[LATE_DRIVE_PENDING_FIELD]).toBe(false);
    expect(w.storage[PATH]).toBeDefined();
  });

  it('a re-run makes no duplicate Drive file for the same content', async () => {
    const w = world();
    await w.daily();
    await w.daily();
    await w.daily();
    expect(w.uploads).toHaveLength(1);
    expect(w.entry.late_recording_files).toEqual(['https://drive.google.com/file/d/late1/view']);

    // The gs:// url linked again (as after a link retry) for unchanged content: relinked, not uploaded.
    w.entry.late_recording_files = [...(w.entry.late_recording_files as string[]), GS];
    w.entry[LATE_DRIVE_PENDING_FIELD] = true;
    const again = await w.daily();
    expect(again.copied).toEqual({ copied: [], relinked: [PATH], failed: [] });
    expect(w.uploads).toHaveLength(1);
    expect(w.entry.late_recording_files).toEqual(['https://drive.google.com/file/d/late1/view']);
    expect(w.entry[LATE_DRIVE_PENDING_FIELD]).toBe(false);
  });

  it('newer late chunks merged into the file: one new upload, whose link replaces the old one', async () => {
    const w = world();
    await w.daily();
    await w.lateChunks({ c: '[3]' });
    const next = await w.daily();
    expect(next.assembled.written).toEqual([PATH]);
    expect(next.copied).toEqual({ copied: [PATH], relinked: [], failed: [] });
    expect(w.uploads).toHaveLength(2);
    expect(JSON.parse(w.storage[PATH]).chunks).toEqual({ a: '[1]', b: '[2]', c: '[3]' });
    expect(w.entry.late_recording_files).toEqual(['https://drive.google.com/file/d/late2/view']);
    await w.daily();
    expect(w.uploads).toHaveLength(2);
  });

  it('only gs:// urls are pending; Drive links are left alone', () => {
    expect(pendingLateRecordingCopies([
      { id: 'r', data: { late_recording_files: ['https://drive.google.com/file/d/x/view', GS] } },
      { id: 's', data: { late_recording_files: null } },
    ])).toEqual([
      { entryId: 'r', storageUrl: GS, storagePath: PATH, fileName: lateRecordingFileNameOf(4, 'session_100', RESET_AT), key: lateDriveKey(PATH), copied: null },
    ]);
  });
});
