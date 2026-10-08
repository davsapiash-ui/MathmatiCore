import { describe, it, expect } from 'vitest';
import {
  LATE_MARKERS_ROOT,
  acknowledgementOf,
  lateRecordingMarkerRevert,
  assembleLateRecordings,
  classifyRecordingLeaf,
  classifyRecordingWrite,
  lateRecordingMarkerUpdates,
  lateRecordingStoragePath,
  lateResetFor,
  learnerOfKey,
  mergeLateFile,
  pushKeyTime,
  quarantineIfLate,
  type LateRecordingFile,
} from '../lateRecordings';

/**
 * PRD Module 23א §ג and Module 21: recording chunks that reach the server after
 * a full learner reset or a system reset, from a device that was offline at
 * the time, never recreate the deleted recording; they are kept as a separate
 * file "הקלטה שהגיעה אחרי האיפוס", linked to that reset's audit entry.
 */

// 8.10.2026 14:30 in Israel (summer time, UTC+3).
const RESET_AT = Date.UTC(2026, 9, 8, 11, 30);
const PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
const pushKey = (t: number, tail = 'abcdefghijkl') => {
  let s = '';
  for (let i = 0; i < 8; i++) { s = PUSH.charAt(t % 64) + s; t = Math.floor(t / 64); }
  return `${s}${tail}`;
};
const RESET = { reset_id: 'reset_1', class_id: 'class_1', performed_at: RESET_AT };

/** A tiny RTDB: a nested tree, multi-path updates applied at once. */
function fakeTree(initial: Record<string, unknown> = {}) {
  const root: Record<string, any> = {};
  const parts = (p: string) => p.split('/').filter(Boolean);
  const get = (p: string): unknown => parts(p).reduce<any>((n, k) => (n && typeof n === 'object' ? n[k] : undefined), root) ?? null;
  const setOne = (p: string, v: unknown) => {
    const ks = parts(p);
    const stack: Array<[Record<string, any>, string]> = [];
    let n = root;
    for (const k of ks.slice(0, -1)) {
      if (v === null && (n[k] === undefined || typeof n[k] !== 'object')) return;
      if (n[k] === undefined || typeof n[k] !== 'object') n[k] = {};
      stack.push([n, k]);
      n = n[k];
    }
    const last = ks[ks.length - 1];
    if (v === null) delete n[last];
    else n[last] = JSON.parse(JSON.stringify(v));
    // An emptied node disappears, as in RTDB.
    for (let i = stack.length - 1; i >= 0; i--) {
      const [parent, k] = stack[i];
      if (Object.keys(parent[k]).length === 0) delete parent[k];
    }
  };
  const updates: Array<Record<string, unknown>> = [];
  const update = async (u: Record<string, unknown>) => {
    updates.push(u);
    for (const [p, v] of Object.entries(u)) setOne(p, v);
  };
  for (const [p, v] of Object.entries(initial)) setOne(p, v);
  return { root, get, update, updates };
}

describe('what a write under recordings/ is, and whose', () => {
  it('push-key time, learner, and the kinds of write', () => {
    expect(pushKeyTime(pushKey(RESET_AT - 5000))).toBe(RESET_AT - 5000);
    expect(pushKeyTime('not-a-key')).toBeNull();
    expect(learnerOfKey('student_user4')).toBe(4);
    expect(learnerOfKey('student_12')).toBe(12);
    expect(learnerOfKey('student_user13')).toBeNull();
    expect(classifyRecordingWrite('telemetry_sessions', 'session_1', 'chunks')).toBe('chunk');
    expect(classifyRecordingWrite('telemetry_sessions', 'session_1', 'metadata')).toBe('metadata');
    expect(classifyRecordingWrite('recorded_bytes', 'meeting_3', 'chunks')).toBe('bytes');
    expect(classifyRecordingWrite('recorded_bytes', 'meeting_3', 'truncated')).toBeNull();
    expect(classifyRecordingLeaf('telemetry_sessions', 'session_1', 'recording_truncated')).toBe('recording_truncated');
    expect(classifyRecordingLeaf('recorded_bytes', 'meeting_3', 'truncated')).toBe('budget_truncated');
    expect(classifyRecordingLeaf('telemetry_sessions', 'session_1', 'chunks')).toBeNull();
  });
});

describe('the marker a full learner reset or a system reset writes before it deletes', () => {
  const backup = {
    'users/students/student_user4': { name: 'x' },
    'recordings/student_user4': { telemetry_sessions: { session_100: {}, session_200: {} } },
    'recordings/student_4': { telemetry_sessions: { session_50: {} } },
  };

  it('the recordings in the backup, the meeting open now, and an unacknowledged restart', () => {
    const u = lateRecordingMarkerUpdates({ resetId: 'reset_1', classId: 'class_1', performedAt: RESET_AT, learners: [4], rtdbBackup: backup, classStartedAt: 300, meeting: 3 });
    const base = `${LATE_MARKERS_ROOT}/learner_4`;
    expect(Object.keys(u).sort()).toEqual([
      `${base}/acknowledged_at`,
      `${base}/latest`,
      `${base}/meetings`,
      `${base}/recordings/session_100`,
      `${base}/recordings/session_200`,
      `${base}/recordings/session_300`,
      `${base}/recordings/session_50`,
    ]);
    expect(u[`${base}/recordings/session_100`]).toEqual(RESET);
    expect(u[`${base}/acknowledged_at`]).toBeNull();
    expect(u[`${base}/meetings`]).toEqual({ meeting_3: true });
  });

  it('before the backup is collected: the open meeting\'s recording only, everyone unacknowledged', () => {
    const u = lateRecordingMarkerUpdates({ resetId: 'reset_1', classId: 'class_1', performedAt: RESET_AT, learners: [4], rtdbBackup: null, classStartedAt: 300 });
    const base = `${LATE_MARKERS_ROOT}/learner_4`;
    expect(Object.keys(u).filter((k) => k.includes('/recordings/'))).toEqual([`${base}/recordings/session_300`]);
    expect(u[`${base}/acknowledged_at`]).toBeNull();
  });

  it('an aborted reset restores the markers it found', () => {
    const before = { learner_4: { latest: { reset_id: 'r0', class_id: 'class_1', performed_at: 1 }, acknowledged_at: 5, recordings: { session_1: { reset_id: 'r0' } } } };
    const u = lateRecordingMarkerUpdates({ resetId: 'reset_1', classId: 'class_1', performedAt: RESET_AT, learners: [4, 5], rtdbBackup: null, classStartedAt: 300 });
    const r = lateRecordingMarkerRevert(before, u);
    expect(r[`${LATE_MARKERS_ROOT}/learner_4/latest`]).toEqual(before.learner_4.latest);
    expect(r[`${LATE_MARKERS_ROOT}/learner_4/acknowledged_at`]).toBe(5);
    expect(r[`${LATE_MARKERS_ROOT}/learner_4/recordings/session_300`]).toBeNull();
    expect(r[`${LATE_MARKERS_ROOT}/learner_5/latest`]).toBeNull();
    expect(Object.keys(r).sort()).toEqual(Object.keys(u).sort());
  });

  it('a system reset: every learner from the whole recordings root; one with no record is acknowledged at once', () => {
    const u = lateRecordingMarkerUpdates({
      resetId: 'reset_1', classId: 'class_1', performedAt: RESET_AT, learners: [1, 2],
      rtdbBackup: { 'users/students': { student_user1: {} }, recordings: { student_user1: { telemetry_sessions: { session_9: {} } }, student_user2: { telemetry_sessions: { session_8: {} } } } },
      classStartedAt: null,
    });
    expect(u[`${LATE_MARKERS_ROOT}/learner_1/recordings/session_9`]).toEqual(RESET);
    expect(u[`${LATE_MARKERS_ROOT}/learner_2/recordings/session_8`]).toEqual(RESET);
    expect(u[`${LATE_MARKERS_ROOT}/learner_1/acknowledged_at`]).toBeNull();
    expect(u[`${LATE_MARKERS_ROOT}/learner_2/acknowledged_at`]).toBe(RESET_AT);
  });
});

describe('late = the device had not yet learned of the reset', () => {
  const marker = { recordings: { session_100: RESET }, latest: RESET };

  it('a write into a reset recording is late until the device acknowledges the reset, whenever it was recorded', () => {
    expect(lateResetFor(marker, 'chunk', 'session_100', RESET_AT - 5000)).toEqual(RESET);
    // Recorded AFTER the reset on a device that was still offline: late too.
    expect(lateResetFor(marker, 'chunk', 'session_100', RESET_AT + 600_000)).toEqual(RESET);
    expect(lateResetFor(marker, 'recording_truncated', 'session_100', null)).toEqual(RESET);
    expect(lateResetFor(marker, 'bytes', 'meeting_3', RESET_AT + 1)).toEqual(RESET);
  });

  it('after the acknowledgement: only what was minted before it', () => {
    const acked = { ...marker, acknowledged_at: RESET_AT + 60_000 };
    expect(lateResetFor(acked, 'chunk', 'session_100', RESET_AT + 59_000)).toEqual(RESET);
    expect(lateResetFor(acked, 'chunk', 'session_100', RESET_AT + 61_000)).toBeNull();
    expect(lateResetFor(acked, 'recording_truncated', 'session_100', null)).toBeNull();
  });

  it('another recording: late only when it was recorded before the reset (the server never had it)', () => {
    expect(lateResetFor(marker, 'chunk', 'session_999', RESET_AT - 5000)).toEqual(RESET);
    expect(lateResetFor(marker, 'chunk', 'session_999', RESET_AT + 5000)).toBeNull();
    expect(lateResetFor(null, 'chunk', 'session_100', RESET_AT - 5000)).toBeNull();
  });

  it('byte counts and budget flags: only the meeting open at reset time', () => {
    const m = { ...marker, meetings: { meeting_3: true } };
    expect(lateResetFor(m, 'bytes', 'meeting_3', RESET_AT + 1)).toEqual(RESET);
    expect(lateResetFor(m, 'bytes', 'meeting_4', RESET_AT + 1)).toBeNull();
    expect(lateResetFor(m, 'budget_truncated', 'meeting_4', null)).toBeNull();
  });

  it('the acknowledgement: the marker\'s stamp, else the time the screen wrote on the record, never one older than the reset', () => {
    expect(acknowledgementOf({ ...marker, acknowledged_at: 7 }, RESET_AT + 9)).toBe(7);
    expect(acknowledgementOf(marker, RESET_AT + 1000)).toBe(RESET_AT + 1000);
    expect(acknowledgementOf(marker, RESET_AT - 1)).toBeNull();
    expect(acknowledgementOf(marker, null)).toBeNull();
  });
});

describe('the trigger: one atomic move into the server-only quarantine', () => {
  const marker = { recordings: { session_100: RESET }, latest: RESET };

  function setup(withMarker = true, deviceAck: number | null = null) {
    const tree = fakeTree({
      ...(withMarker ? { [`${LATE_MARKERS_ROOT}/learner_4`]: marker } : {}),
      ...(deviceAck !== null ? { 'users/students/student_user4/reset_acknowledged_at': deviceAck } : {}),
    });
    let markerReads = 0;
    let ackReads = 0;
    const deps = {
      readMarker: async (n: number) => { markerReads += 1; return tree.get(`${LATE_MARKERS_ROOT}/learner_${n}`) as any; },
      readDeviceAck: async (n: number) => { ackReads += 1; return tree.get(`users/students/student_user${n}/reset_acknowledged_at`); },
      update: tree.update,
      moveCount: 1,
    };
    return { tree, deps, reads: () => markerReads, ackReads: () => ackReads };
  }

  it('a burst of 300 chunks and metadata at once: every one moved, none left in recordings/, one update each', async () => {
    const { tree, deps } = setup();
    const writes: Array<Promise<unknown>> = [];
    for (let i = 0; i < 150; i++) {
      const key = pushKey(RESET_AT - 100_000 + i * 2000, `k${String(i).padStart(11, '0')}`);
      for (const kind of ['chunks', 'metadata']) {
        const path = `recordings/student_user4/telemetry_sessions/session_100/${kind}/${key}`;
        await tree.update({ [path]: kind === 'chunks' ? `[${i}]` : { exercise_id: `e${i}` } });
        writes.push(quarantineIfLate({ learnerKey: 'student_user4', field: 'telemetry_sessions', group: 'session_100', kind, key }, tree.get(path), deps));
      }
    }
    const results = await Promise.all(writes);
    expect(results.every((r) => r === 'moved')).toBe(true);
    expect(tree.get('recordings/student_user4')).toBeNull();
    const q = tree.get('late_recordings/reset_1/learner_4/session_100') as any;
    expect(Object.keys(q.chunks)).toHaveLength(150);
    expect(Object.keys(q.metadata)).toHaveLength(150);
    expect(tree.get('late_recordings_pending/reset_1')).toEqual({ class_id: 'class_1', performed_at: RESET_AT, moves: 1 });
    // Each move is ONE update that writes the copy and removes the original together.
    const moves = tree.updates.filter((u) => Object.keys(u).some((p) => p.startsWith('late_recordings/')));
    expect(moves).toHaveLength(300);
    for (const u of moves) {
      const original = Object.keys(u).find((p) => p.startsWith('recordings/'))!;
      expect(u[original]).toBeNull();
    }
  });

  it('a recording_truncated flag is moved; a byte count or budget flag is only removed', async () => {
    const { tree, deps } = setup();
    await tree.update({
      'recordings/student_user4/telemetry_sessions/session_100/recording_truncated': true,
      'recordings/student_user4/recorded_bytes/meeting_3/truncated': true,
      [`recordings/student_user4/recorded_bytes/meeting_3/chunks/${pushKey(RESET_AT - 1)}`]: 900,
    });
    expect(await quarantineIfLate({ learnerKey: 'student_user4', field: 'telemetry_sessions', group: 'session_100', kind: 'recording_truncated', key: null }, true, deps)).toBe('moved');
    expect(await quarantineIfLate({ learnerKey: 'student_user4', field: 'recorded_bytes', group: 'meeting_3', kind: 'truncated', key: null }, true, deps)).toBe('removed');
    expect(await quarantineIfLate({ learnerKey: 'student_user4', field: 'recorded_bytes', group: 'meeting_3', kind: 'chunks', key: pushKey(RESET_AT - 1) }, 900, deps)).toBe('removed');
    expect(tree.get('recordings/student_user4')).toBeNull();
    expect(tree.get('late_recordings/reset_1/learner_4/session_100/recording_truncated')).toBe(true);
  });

  it('not late: left in place, and nothing but the one small marker is read', async () => {
    const { tree, deps, reads } = setup(false);
    const path = `recordings/student_user4/telemetry_sessions/session_100/chunks/${pushKey(RESET_AT)}`;
    await tree.update({ [path]: '[1]' });
    expect(await quarantineIfLate({ learnerKey: 'student_user4', field: 'telemetry_sessions', group: 'session_100', kind: 'chunks', key: pushKey(RESET_AT) }, '[1]', deps)).toBeNull();
    expect(tree.get(path)).toBe('[1]');
    expect(reads()).toBe(1);
    // Not a recording write at all: not even the marker is read.
    expect(await quarantineIfLate({ learnerKey: 'student_user4', field: 'other', group: 'x', kind: 'y', key: 'z' }, 1, deps)).toBeNull();
    expect(reads()).toBe(1);
  });

  it('the learner\'s new run: a chunk minted after the screen took up the reset, before the server stamped anything, stays', async () => {
    // The screen cleared forceReload and wrote reset_acknowledged_at at ACK in
    // the same update; the marker carries no acknowledged_at yet.
    const ACK = RESET_AT + 30_000;
    const { tree, deps, ackReads } = setup(true, ACK);
    const fresh = pushKey(ACK + 2000);
    const path = `recordings/student_user4/telemetry_sessions/session_100/chunks/${fresh}`;
    await tree.update({ [path]: '[full snapshot]' });
    expect(await quarantineIfLate({ learnerKey: 'student_user4', field: 'telemetry_sessions', group: 'session_100', kind: 'chunks', key: fresh }, '[full snapshot]', deps)).toBeNull();
    expect(tree.get(path)).toBe('[full snapshot]');
    // The acknowledgement is kept on the marker: the next write reads it there.
    expect(tree.get(`${LATE_MARKERS_ROOT}/learner_4/acknowledged_at`)).toBe(ACK);
    // A chunk the offline device minted before it learned of the reset is still late.
    const stale = pushKey(ACK - 1000);
    await tree.update({ [`recordings/student_user4/telemetry_sessions/session_100/chunks/${stale}`]: '[old]' });
    expect(await quarantineIfLate({ learnerKey: 'student_user4', field: 'telemetry_sessions', group: 'session_100', kind: 'chunks', key: stale }, '[old]', deps)).toBe('moved');
    expect(ackReads()).toBe(1);
  });

  it('an acknowledgement older than the reset (a previous reset\'s) does not count', async () => {
    const { tree, deps } = setup(true, RESET_AT - 60_000);
    const key = pushKey(RESET_AT + 2000);
    await tree.update({ [`recordings/student_user4/telemetry_sessions/session_100/chunks/${key}`]: '[x]' });
    expect(await quarantineIfLate({ learnerKey: 'student_user4', field: 'telemetry_sessions', group: 'session_100', kind: 'chunks', key }, '[x]', deps)).toBe('moved');
  });
});

describe('the daily file: assembled once, cleared only after it is written and linked', () => {
  function setup(opts: { failWrite?: boolean; failLink?: boolean } = {}) {
    const tree = fakeTree({
      'late_recordings_pending/reset_1': { class_id: 'class_1', performed_at: RESET_AT, moves: 1 },
      'late_recordings/reset_1/learner_4/session_100': { chunks: { a: '[1]', b: '[2]' }, metadata: { a: { e: 1 } }, recording_truncated: true },
    });
    const files: Record<string, LateRecordingFile> = {
      [lateRecordingStoragePath(RESET, 4, 'session_100')]: mergeLateFile(null, { reset_id: 'reset_1', class_id: 'class_1', student_id: 4, recording_id: 'session_100' }, { chunks: { old: '[0]' } }),
    };
    const links: string[] = [];
    const dropped: string[] = [];
    const deps = {
      read: async (p: string) => tree.get(p),
      update: tree.update,
      readFile: async (p: string) => files[p] ?? null,
      writeFile: async (p: string, f: LateRecordingFile) => {
        if (opts.failWrite) throw new Error('storage down');
        files[p] = f;
        return `gs://bucket/${p}`;
      },
      link: async (_id: string, url: string) => { if (opts.failLink) throw new Error('firestore down'); links.push(url); },
      dropPending: async (id: string) => { dropped.push(id); },
    };
    return { tree, files, links, dropped, deps };
  }

  it('merged with the earlier file, linked, and only then cleared', async () => {
    const { tree, files, links, dropped, deps } = setup();
    const path = lateRecordingStoragePath(RESET, 4, 'session_100');
    expect(path).toBe('backups/class_1/reset_1/הקלטה שהגיעה אחרי האיפוס - תלמיד 04 - session_100 - 08.10.2026 14-30.json');
    expect(await assembleLateRecordings(deps)).toEqual({ written: [path], failed: [] });
    expect(files[path].chunks).toEqual({ old: '[0]', a: '[1]', b: '[2]' });
    expect(files[path].metadata).toEqual({ a: { e: 1 } });
    expect(files[path].recording_truncated).toBe(true);
    expect(files[path].label).toBe('הקלטה שהגיעה אחרי האיפוס');
    expect(links).toEqual([`gs://bucket/${path}`]);
    expect(tree.get('late_recordings/reset_1')).toBeNull();
    expect(dropped).toEqual(['reset_1']);
  });

  it('the file write fails: the quarantine stays, nothing is linked', async () => {
    const { tree, links, dropped, deps } = setup({ failWrite: true });
    const res = await assembleLateRecordings(deps);
    expect(res.written).toEqual([]);
    expect(res.failed).toHaveLength(1);
    expect(links).toEqual([]);
    expect((tree.get('late_recordings/reset_1/learner_4/session_100/chunks') as any)).toEqual({ a: '[1]', b: '[2]' });
    expect(dropped).toEqual([]);
  });

  it('the link fails: the quarantine stays for the next run', async () => {
    const { tree, deps } = setup({ failLink: true });
    await assembleLateRecordings(deps);
    expect(tree.get('late_recordings/reset_1/learner_4/session_100/chunks')).toEqual({ a: '[1]', b: '[2]' });
  });
});
