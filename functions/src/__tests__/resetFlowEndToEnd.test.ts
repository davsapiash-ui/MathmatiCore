import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * PRD Module 23א §ג–§ד, end to end through backupAndResetSessionData on a fake
 * Firebase (RTDB, Firestore, Cloud Storage) and a fake Drive:
 *  - a second reset of the class is refused before anything is collected;
 *  - when Drive and Cloud Storage both fail, nothing is deleted and the attempt
 *    is recorded with backup_status 'failed';
 *  - the audit entry is written 'in_progress' before the first delete and
 *    becomes 'completed' after; the late-recording marker is written before
 *    the first delete too;
 *  - Drive failing sends the backup to Cloud Storage (backup_channel 'storage');
 *  - a follow-up step that deletes nothing (here the admin metrics) failing
 *    leaves the reset 'completed', with side_effect_errors.
 * And the Drive upload above 5 MB is resumable.
 */

const h = vi.hoisted(() => ({
  log: [] as string[],
  rtdb: {} as Record<string, any>,
  fs: {} as Record<string, Record<string, Record<string, unknown>>>,
  storage: {} as Record<string, Buffer>,
  storageFails: false,
  driveFails: false,
  adminMetricsFails: false,
  fetchCalls: [] as Array<{ url: string; init: RequestInit }>,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: 'test-access-token' }) };
    }
  },
}));

vi.mock('../adminAggregator', () => ({
  recomputeAdminMetrics: async () => {
    if (h.adminMetricsFails) throw new Error('metrics down');
  },
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const parts = (p: string) => String(p || '').split('/').filter(Boolean);
  const getAt = (p: string): any => parts(p).reduce<any>((n, k) => (n && typeof n === 'object' ? n[k] : undefined), h.rtdb);
  const setAt = (p: string, v: unknown) => {
    const ks = parts(p);
    let n = h.rtdb;
    for (const k of ks.slice(0, -1)) {
      if (!n[k] || typeof n[k] !== 'object') { if (v === null) return; n[k] = {}; }
      n = n[k];
    }
    const last = ks[ks.length - 1];
    if (v === null || v === undefined) delete n[last];
    else n[last] = JSON.parse(JSON.stringify(v));
  };
  const snap = (v: any) => ({
    val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))),
    exists: () => v !== undefined && v !== null,
    hasChildren: () => !!v && typeof v === 'object' && Object.keys(v).length > 0,
    numChildren: () => (v && typeof v === 'object' ? Object.keys(v).length : 0),
  });
  const database = () => ({
    ref: (path?: string) => ({
      get: async () => snap(getAt(path || '')),
      set: async (v: unknown) => { h.log.push(`rtdb.set ${path}`); setAt(path!, v); },
      update: async (u: Record<string, unknown>) => {
        h.log.push(`rtdb.update ${path || '/'} ${Object.keys(u).map((k) => k.split('/')[0]).filter((v, i, a) => a.indexOf(v) === i).join(',')}`);
        for (const [k, v] of Object.entries(u)) setAt(path ? `${path}/${k}` : k, v);
      },
      remove: async () => { h.log.push(`rtdb.remove ${path}`); setAt(path!, null); },
    }),
  });
  const coll = (name: string) => (h.fs[name] ||= {});
  const docRef = (name: string, id: string) => ({
    id,
    path: `${name}/${id}`,
    get: async () => ({ exists: coll(name)[id] !== undefined, data: () => coll(name)[id] }),
    set: async (data: Record<string, unknown>) => { h.log.push(`fs.set ${name} ${String(data.deletion_status ?? '')} ${String(data.backup_status ?? '')}`.trim()); coll(name)[id] = { ...data }; },
    update: async (data: Record<string, unknown>) => { h.log.push(`fs.update ${name} ${String(data.deletion_status ?? '')}`.trim()); coll(name)[id] = { ...coll(name)[id], ...data }; },
    delete: async () => { delete coll(name)[id]; },
  });
  const query = (name: string, filter?: (d: Record<string, unknown>) => boolean): any => ({
    where: (f: string, op: string, v: any) => query(name, (d) => (op === 'in' ? v.includes(d[f]) : op === '==' ? d[f] === v : op === 'array-contains' ? Array.isArray(d[f]) && (d[f] as unknown[]).includes(v) : true) && (!filter || filter(d))),
    orderBy: () => query(name, filter),
    limit: () => query(name, filter),
    startAfter: () => ({ get: async () => ({ docs: [], size: 0, empty: true }) }),
    get: async () => {
      const docs = Object.entries(coll(name))
        .filter(([, d]) => !filter || filter(d))
        .map(([id, d]) => ({ id, data: () => d, ref: docRef(name, id) }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  const firestoreFn = () => ({
    collection: (name: string) => ({ ...query(name), doc: (id: string) => docRef(name, id) }),
    batch: () => {
      const refs: any[] = [];
      return { delete: (r: any) => refs.push(r), commit: async () => { for (const r of refs) { h.log.push(`fs.delete ${r.path}`); await r.delete(); } } };
    },
    runTransaction: async (fn: any) => fn({
      get: (r: any) => r.get(),
      set: (r: any, d: any) => { coll(r.path.split('/')[0])[r.id] = d; },
      delete: (r: any) => { delete coll(r.path.split('/')[0])[r.id]; },
    }),
  });
  const firestore = Object.assign(firestoreFn, actual.firestore);
  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (p: string) => ({
        save: async (b: Buffer) => {
          if (h.storageFails) throw new Error('storage down');
          h.log.push(`storage.save ${p.split('/')[0]}`);
          h.storage[p] = b;
        },
      }),
    }),
  });
  const mocked = { ...actual, database, firestore, storage, app: () => ({ options: {} }) };
  return { ...mocked, default: mocked };
});

import { backupAndResetSessionData, uploadBufferToDrive, DRIVE_MULTIPART_MAX_BYTES } from '../exportDriveReport';
import { RESET_LOCK_REFUSAL_HE } from '../resetAudit';

const request = (data: Record<string, unknown>) => ({
  auth: { uid: 'teacher_1', token: { teacher: true, role: 'teacher', class_id: 'class_1' } },
  data: { class_id: 'class_1', reason: 'test_run', ...data },
}) as any;

const fullLearner4 = () => request({ reset_level: 'single_student', reset_scope: 'full_student', student_id: '4' });

function seed() {
  h.log = [];
  h.storage = {};
  h.storageFails = false;
  h.driveFails = false;
  h.adminMetricsFails = false;
  h.fetchCalls = [];
  h.rtdb = {
    active_class_session: { active: true, sessionNumber: 3, startedAt: 777 },
    users: { students: { student_user4: { highestCompletedMeeting: 2, workspaceState: { a: 1 } }, student_user5: { highestCompletedMeeting: 1 } } },
    recordings: { student_user4: { telemetry_sessions: { session_777: { chunks: { k: '[1]' } } } } },
  };
  h.fs = {
    sessions: { session_03_student_4: { student_id: 4, session_number: 3 }, session_03_student_5: { student_id: 5, session_number: 3 } },
  };
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  seed();
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    h.fetchCalls.push({ url: String(url), init });
    const json = (o: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });
    if (String(url).includes('/drive/v3/files?q=')) return json({ files: [{ id: 'folder-1' }] });
    if (h.driveFails) return json({ error: 'drive down' }, 500);
    if (String(url).includes('uploadType=resumable')) return json({}, 200, { location: 'https://upload.example/session-1' });
    return json({ id: 'file-1' });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const firstIndex = (pred: (s: string) => boolean) => h.log.findIndex(pred);
const isDelete = (s: string) => s.startsWith('rtdb.remove') || s.startsWith('fs.delete');

describe('the reset end to end (Module 23א §ג–§ד)', () => {
  it('another reset of the class holds the lock: refused before anything is collected, written or deleted', async () => {
    h.fs.reset_locks = { class_1: { class_id: 'class_1', reset_id: 'other', acquired_at: Date.now() } };
    await expect((backupAndResetSessionData as any).run(fullLearner4()))
      .rejects.toMatchObject({ code: 'failed-precondition', message: RESET_LOCK_REFUSAL_HE });
    expect(h.log).toEqual([]);
    expect(h.fetchCalls).toEqual([]);
    expect(h.fs.reset_audit_log).toBeUndefined();
    expect(h.rtdb.users.students.student_user4).toBeDefined();
  });

  it('Drive and Cloud Storage both fail: zero deletes, the attempt recorded as failed, the lock released', async () => {
    h.driveFails = true;
    h.storageFails = true;
    await expect((backupAndResetSessionData as any).run(fullLearner4()))
      .rejects.toMatchObject({ code: 'internal', message: expect.stringContaining('לא נמחקו נתונים') });
    expect(h.log.filter(isDelete)).toEqual([]);
    // The late-recording markers written before the backup are restored (there were none).
    expect(h.log.filter((s) => s.startsWith('rtdb.update')).every((s) => s.includes('late_recording_markers'))).toBe(true);
    expect(JSON.stringify(h.rtdb.late_recording_markers ?? {})).not.toMatch(/reset_|session_/);
    expect(h.rtdb.users.students.student_user4.workspaceState).toEqual({ a: 1 });
    expect(Object.keys(h.fs.sessions)).toHaveLength(2);
    const entries = Object.values(h.fs.reset_audit_log);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ backup_status: 'failed', records_deleted_count: 0, backup_channel: null });
    expect(h.fs.reset_locks?.class_1).toBeUndefined();
  });

  it('the order: marker (before the backup is collected), marker with the backup\'s recordings, entry "in_progress", deletes, entry "completed"', async () => {
    const res = await (backupAndResetSessionData as any).run(fullLearner4());
    expect(res).toMatchObject({ status: 'SUCCESS', backupChannel: 'drive' });
    const entrySet = firstIndex((s) => s === 'fs.set reset_audit_log in_progress success');
    const marker = firstIndex((s) => s.startsWith('rtdb.update / late_recording_markers'));
    const firstDelete = firstIndex(isDelete);
    const completed = firstIndex((s) => s === 'fs.update reset_audit_log completed');
    expect(entrySet).toBeGreaterThanOrEqual(0);
    const markerWrites = h.log.map((s, i) => (s.startsWith('rtdb.update / late_recording_markers') ? i : -1)).filter((i) => i >= 0);
    expect(marker).toBe(0);
    expect(markerWrites).toHaveLength(2);
    expect(entrySet).toBeGreaterThan(markerWrites[1]);
    expect(firstDelete).toBeGreaterThan(entrySet);
    expect(completed).toBeGreaterThan(h.log.map(isDelete).lastIndexOf(true));
    // What was deleted, and what stayed.
    expect(h.rtdb.recordings?.student_user4).toBeUndefined();
    expect(Object.keys(h.fs.sessions)).toEqual(['session_03_student_5']);
    expect(h.rtdb.users.students.student_user5).toBeDefined();
    // The marker: the deleted recording, and the meeting open now, unacknowledged.
    expect(h.rtdb.late_recording_markers.learner_4.recordings.session_777).toMatchObject({ class_id: 'class_1' });
    expect(h.rtdb.late_recording_markers.learner_4.acknowledged_at).toBeUndefined();
    const [entry] = Object.values(h.fs.reset_audit_log);
    expect(entry).toMatchObject({ deletion_status: 'completed', backup_status: 'success', backup_channel: 'drive' });
    expect(entry.side_effect_errors).toBeUndefined();
    expect(h.fs.reset_locks?.class_1).toBeUndefined();
  });

  it('Drive fails: the backup goes to Cloud Storage under backups/{class_id}/ and the reset continues', async () => {
    h.driveFails = true;
    const res = await (backupAndResetSessionData as any).run(fullLearner4());
    expect(res).toMatchObject({ status: 'SUCCESS', backupChannel: 'storage' });
    expect(Object.keys(h.storage)).toHaveLength(1);
    expect(Object.keys(h.storage)[0]).toMatch(/^backups\/class_1\/reset_/);
    const [entry] = Object.values(h.fs.reset_audit_log);
    expect(entry).toMatchObject({ backup_channel: 'storage', deletion_status: 'completed', backup_drive_copied_at: null });
    expect(String(entry.backup_file_url)).toMatch(/^gs:\/\/test-bucket\/backups\/class_1\//);
  });

  it('a system reset whose admin-metrics recompute fails is still "completed", with side_effect_errors', async () => {
    h.adminMetricsFails = true;
    const res = await (backupAndResetSessionData as any).run(request({ reset_level: 'system' }));
    expect(res).toMatchObject({ status: 'SUCCESS' });
    expect(res.sideEffectErrors).toEqual([expect.stringContaining('store_cache/admin_metrics')]);
    const [entry] = Object.values(h.fs.reset_audit_log);
    expect(entry.deletion_status).toBe('completed');
    expect(entry.side_effect_errors).toEqual([expect.stringContaining('metrics down')]);
    expect(h.rtdb.late_recording_markers.learner_4.recordings.session_777).toBeDefined();
  });
});

describe('Drive uploads above 5 MB are resumable', () => {
  it('a small file: one multipart request; a large one: a resumable session, then one PUT of the bytes', async () => {
    await uploadBufferToDrive(Buffer.from('{}'), 'x.json', 'application/json', '3 גיבויים', { park: false });
    expect(h.fetchCalls.some((c) => c.url.includes('uploadType=multipart'))).toBe(true);
    h.fetchCalls = [];
    const big = Buffer.alloc(DRIVE_MULTIPART_MAX_BYTES + 1, 0x20);
    const res = await uploadBufferToDrive(big, 'big.json', 'application/json', '3 גיבויים', { park: false });
    expect(res).toMatchObject({ success: true, fileId: 'file-1' });
    const start = h.fetchCalls.find((c) => c.url.includes('uploadType=resumable'))!;
    expect(start.init.method).toBe('POST');
    expect((start.init.headers as Record<string, string>)['X-Upload-Content-Length']).toBe(String(big.length));
    const put = h.fetchCalls.find((c) => c.url === 'https://upload.example/session-1')!;
    expect(put.init.method).toBe('PUT');
    expect((put.init.body as Buffer).length).toBe(big.length);
    expect(h.fetchCalls.some((c) => c.url.includes('uploadType=multipart'))).toBe(false);
  });
});
