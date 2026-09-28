/**
 * @vitest-environment jsdom
 */
/**
 * Module 17 (offline first) and the owner's ruling of 28.9.2026: no loss of a
 * child's work.
 *
 * A learner works, the connection drops, the page is reloaded while still
 * offline, and the learner goes on working. Until the learner record's first
 * snapshot the sync writes nothing to the record (it may hold a later copy,
 * X55). That wait also skipped this device's own copy, so the work done after
 * the reload was saved nowhere, and a second reload before the connection came
 * back lost it.
 *
 * Driven through the real workspace store, the real FirebaseSyncService and
 * the real server clock (serverNow = device clock + the offset the database
 * reports). Only the Realtime Database transport is replaced: onValue hands
 * this file its listeners — the learner record, and .info/serverTimeOffset —
 * and update() is recorded. The device clock is a number the test sets.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const rtdb = vi.hoisted(() => ({
  listeners: new Map<string, (snap: any) => void>(),
  updates: [] as Array<{ path: string; value: Record<string, any> }>,
}));
const clock = vi.hoisted(() => ({ device: 1_900_000_000_000 }));

vi.mock('firebase/database', async () => {
  const actual = await vi.importActual<any>('firebase/database');
  const pathOf = (r: any) => String(r?._path ?? '').replace(/^\//, '');
  return {
    ...actual,
    onValue: (q: any, cb: any) => {
      const path = pathOf(q);
      rtdb.listeners.set(path, cb);
      return () => {
        if (rtdb.listeners.get(path) === cb) rtdb.listeners.delete(path);
      };
    },
    update: (r: any, value: any) => {
      rtdb.updates.push({ path: pathOf(r), value });
      // A teacher's reset reloads the page once the flag is cleared; not here.
      if (value && 'forceReload' in value) return new Promise(() => {});
      return Promise.resolve();
    },
    set: () => Promise.resolve(),
    runTransaction: () => Promise.resolve(),
    onDisconnect: () => ({ set: () => Promise.resolve(), cancel: () => Promise.resolve() }),
  };
});

vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return { ...actual, emitTelemetry: () => Promise.resolve() };
});

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { firebaseSyncService, acknowledgeTeacherReset } from '@/infrastructure/services/FirebaseSyncService';
import { flushThrottledWrites, resetThrottledWrites } from '@/infrastructure/services/ThrottledRtdbWriter';
import {
  newerWorkspaceSnapshot,
  workspaceSavedAt,
  WORKSPACE_SAVED_AT_KEY,
  keepsFreshStartWork,
  meetingProgress,
  startedWithoutRecord,
  WORKSPACE_STARTED_WITHOUT_RECORD_KEY,
} from '@/core/workspaceSnapshot';
import { EMPTY_COUNTS } from '@/core/placeValue';
import { fetchServerClockOffset, serverNow } from '@/infrastructure/firebase';

const STUDENT = 'student_user5';
const CACHE_KEY = `mathmaticore_session_cache_${STUDENT}`;
/** This tablet's clock is ten minutes behind the server. */
const TEN_MIN = 10 * 60 * 1000;
/** What the gate leaves on the record: meeting 4 runs on the approved bank. */
const APPROVED = { teacher_gate_approved: true, routeStatus: 'APPROVED', pedagogicalPath: 'remediation_path' };

const ws = () => useWorkspaceStore.getState();
const svc = firebaseSyncService as any;
const deviceCopy = () => svc.getLocalSessionProgress(STUDENT) as Record<string, any> | null;

/**
 * The database reports the server clock (.info/serverTimeOffset). A reloaded
 * page knows none until the connection returns: serverNow() is the device
 * clock then. This file has one page's module, so a reload sets it back to 0.
 */
function serverClockOffset(offset: number) {
  void fetchServerClockOffset();
  const cb = rtdb.listeners.get('.info/serverTimeOffset');
  expect(cb, 'the server clock listener is attached').toBeTruthy();
  cb!({ val: () => offset });
  expect(serverNow()).toBe(clock.device + offset);
}

/** The record listener gets the learner record, as when the connection returns. */
function deliverRecord(record: Record<string, any>) {
  const cb = rtdb.listeners.get(`users/students/${STUDENT}`);
  expect(cb, 'the learner record listener is subscribed').toBeTruthy();
  cb!({ exists: () => true, val: () => ({ ...record }) });
}

/** Everything waiting for its window goes out now. */
function sendNow() {
  svc.flushRemoteSync();
  flushThrottledWrites();
}

const workspaceWritesSince = (mark: number) =>
  rtdb.updates.slice(mark).filter((u) => u.path === `users/students/${STUDENT}` && 'workspaceState' in (u.value ?? {}));
/** Writes since `mark` that put a workspace state on the record (a teacher's reset writes null). */
const statesWrittenSince = (mark: number) => workspaceWritesSince(mark).filter((u) => u.value.workspaceState !== null);

/** Signs in and works online in meeting 4: the units digit is on the record. Returns the record's copy. */
function workOnlineInMeeting4(): Record<string, any> {
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 5 } as any, role: 'student', isAuthenticated: true });
  useStore.setState({ students: {} as any, firebaseLoaded: false });
  serverClockOffset(TEN_MIN);
  svc.startSync(STUDENT, { uid: STUDENT });
  deliverRecord({ ...APPROVED });
  ws().initSession(4, false);
  ws().setAnswerDigit('units', '5');
  sendNow();
  const writes = workspaceWritesSince(0);
  expect(writes.length, 'online, the record has the work').toBeGreaterThan(0);
  const recordCopy = writes[writes.length - 1].value.workspaceState;
  expect(recordCopy.answerDigits).toMatchObject({ units: '5' });
  return recordCopy;
}

/**
 * A reload: the page and its store are gone, the device copy stays. Nothing
 * of the learner record arrives until deliverRecord — without a connection,
 * never. The server offset is what the database reported so far (0 offline).
 */
function reloadPage(offset: number) {
  svc.stopSync();
  resetThrottledWrites();
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  useStore.setState({ students: {} as any, firebaseLoaded: false });
  serverClockOffset(offset);
  svc.startSync(STUDENT, { uid: STUDENT });
}

/**
 * What StudentWorkspacePage does before the record has arrived: it restores
 * this device's copy of the meeting. Returns that copy's stamp (the page keeps
 * it as fromCache.savedAt for X55).
 */
function pageRestoresDeviceCopy(meeting: number): number {
  const cached = deviceCopy();
  const saved = newerWorkspaceSnapshot(undefined, cached as any, meeting);
  expect(saved, 'this device holds a copy of the meeting').toBeTruthy();
  ws().restoreSession(saved);
  return workspaceSavedAt(cached);
}

beforeEach(() => {
  clock.device = 1_900_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock.device);
  svc.stopSync();
  // The learner record's listener goes with each page; the server clock's stays attached.
  for (const path of [...rtdb.listeners.keys()]) if (!path.startsWith('.info/')) rtdb.listeners.delete(path);
  rtdb.updates.length = 0;
  resetThrottledWrites();
  localStorage.clear();
  serverClockOffset(0);
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Module 17 — work after a reload without a connection stays on the device', () => {
  it('offline reload, work, second offline reload: the work is restored', () => {
    workOnlineInMeeting4();
    const mark = rtdb.updates.length;

    // The connection is gone. The learner reloads, the meeting comes back from this device.
    reloadPage(0);
    pageRestoresDeviceCopy(4);
    expect(ws().answerDigits).toMatchObject({ units: '5' });

    clock.device += 60_000;
    ws().setAnswerDigit('tens', '6');
    expect(deviceCopy()?.answerDigits, 'saved on this device at once').toMatchObject({ units: '5', tens: '6' });
    expect(workspaceWritesSince(mark), 'nothing is written to the record before its first snapshot').toHaveLength(0);

    // Reloaded again, still without a connection.
    reloadPage(0);
    pageRestoresDeviceCopy(4);
    expect(ws().answerDigits).toMatchObject({ units: '5', tens: '6' });

    clock.device += 60_000;
    ws().setAnswerDigit('hundreds', '1');
    reloadPage(0);
    pageRestoresDeviceCopy(4);
    expect(ws().answerDigits).toMatchObject({ units: '5', tens: '6', hundreds: '1' });
    expect(workspaceWritesSince(mark)).toHaveLength(0);
  });

  it('before the meeting is started or restored, the defaults in the store never replace the device copy', () => {
    workOnlineInMeeting4();
    reloadPage(0);
    const saved = localStorage.getItem(CACHE_KEY);
    expect(saved).toBeTruthy();

    // The store holds defaults (meeting 1, nothing on the board). Changes land on it
    // before the page has restored anything: the record's teacher fields, a stray touch.
    ws().receiveSupportProfile(null);
    useWorkspaceStore.setState({ isASD: true });
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, units: 3 } });
    expect(localStorage.getItem(CACHE_KEY)).toBe(saved);

    // A store started for another learner is not this learner's …
    useWorkspaceStore.setState({
      workspaceInitializedFor: { learner: 'student_user6', meeting: 1, restoredSavedAt: 0 },
      counts: { ...EMPTY_COUNTS, units: 4 },
    });
    expect(localStorage.getItem(CACHE_KEY)).toBe(saved);
    // … nor one that holds another meeting than the one it was started for.
    useWorkspaceStore.setState({
      workspaceInitializedFor: { learner: STUDENT, meeting: 4, restoredSavedAt: 0 },
      counts: { ...EMPTY_COUNTS, units: 5 },
    });
    expect(localStorage.getItem(CACHE_KEY)).toBe(saved);

    // After a sign-out the store is reset: nothing of it is the learner's any more.
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    pageRestoresDeviceCopy(4);
    ws().resetWorkspace();
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, units: 7 } });
    expect(localStorage.getItem(CACHE_KEY)).toBe(saved);
  });

  it('in the lobby after a sign-in, with the record loaded, the defaults never replace either copy', () => {
    const recordCopy = workOnlineInMeeting4();
    // A fresh page lands in the lobby: the record arrives, the store still holds defaults.
    reloadPage(TEN_MIN);
    deliverRecord({ ...APPROVED, workspaceState: recordCopy });
    const saved = localStorage.getItem(CACHE_KEY);
    const mark = rtdb.updates.length;

    // The teacher locks the boards, marks the call handled, turns on ASD: each
    // is copied into the store while it holds defaults.
    deliverRecord({ ...APPROVED, workspaceState: recordCopy, isBoardLocked: true });
    deliverRecord({ ...APPROVED, workspaceState: recordCopy, isBoardLocked: true, helpRequested: true });
    deliverRecord({ ...APPROVED, workspaceState: recordCopy, isASD: true });
    sendNow();

    expect(workspaceWritesSince(mark), 'the record keeps the meeting 4 copy').toHaveLength(0);
    expect(localStorage.getItem(CACHE_KEY), 'this device keeps it too').toBe(saved);

    // Entering the meeting restores it, and from there the learner's changes are saved as always.
    pageRestoresDeviceCopy(4);
    ws().setAnswerDigit('tens', '6');
    sendNow();
    const writes = workspaceWritesSince(mark);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[writes.length - 1].value.workspaceState.answerDigits).toMatchObject({ units: '5', tens: '6' });
  });

  it('the restore itself is not saved again: the copy keeps the stamp it had', () => {
    const recordCopy = workOnlineInMeeting4();
    const saved = localStorage.getItem(CACHE_KEY);
    reloadPage(0);
    clock.device += 5 * 60_000;
    pageRestoresDeviceCopy(4);
    // A copy saved again would take today's stamp and beat a later copy on the record.
    expect(localStorage.getItem(CACHE_KEY)).toBe(saved);
    expect(workspaceSavedAt(deviceCopy())).toBe(workspaceSavedAt(recordCopy));
  });
});

describe('Module 17 — the save stamp never goes backwards on a device', () => {
  it('after an offline reload (offset 0, device clock behind) the new copy is still later than the last one', () => {
    const recordCopy = workOnlineInMeeting4();
    const onlineStamp = workspaceSavedAt(recordCopy);
    expect(onlineStamp).toBeGreaterThanOrEqual(clock.device + TEN_MIN);

    reloadPage(0);
    pageRestoresDeviceCopy(4);
    // serverNow() is now the device clock only: ten minutes before the last stamp.
    ws().setAnswerDigit('tens', '6');
    const first = workspaceSavedAt(deviceCopy());
    expect(first).toBeGreaterThan(onlineStamp);

    // The clock does not move between two changes: still strictly later.
    ws().setAnswerDigit('hundreds', '1');
    const second = workspaceSavedAt(deviceCopy());
    expect(second).toBeGreaterThan(first);

    // So the next reload keeps this device's copy over the record's older one (X55).
    const local = deviceCopy() as any;
    expect(newerWorkspaceSnapshot(recordCopy as any, local, 4)).toBe(local);
  });

  it('online, one stamp on both copies, and it never goes backwards either', () => {
    workOnlineInMeeting4();
    const mark = rtdb.updates.length;
    const before = workspaceSavedAt(deviceCopy());
    // The device clock steps back (a tablet resynchronising its time).
    clock.device -= 30 * 60_000;
    ws().setAnswerDigit('tens', '6');
    sendNow();
    const writes = workspaceWritesSince(mark);
    const recordCopy = writes[writes.length - 1].value.workspaceState;
    expect(workspaceSavedAt(recordCopy)).toBeGreaterThan(before);
    expect(workspaceSavedAt(deviceCopy())).toBe(workspaceSavedAt(recordCopy));
  });
});

describe('Module 17 — when the connection returns', () => {
  it('the device copy is later: it stays on screen and the record gets it, with no further touch', () => {
    const recordCopy = workOnlineInMeeting4();
    reloadPage(0);
    pageRestoresDeviceCopy(4);
    ws().setAnswerDigit('tens', '6');
    reloadPage(0);
    const restoredFrom = pageRestoresDeviceCopy(4);
    ws().setAnswerDigit('hundreds', '1');
    const mark = rtdb.updates.length;

    // The connection returns: the offset is known again and the record arrives,
    // with the copy it had before the connection dropped.
    serverClockOffset(TEN_MIN);
    deliverRecord({ ...APPROVED, workspaceState: recordCopy });

    // The page (X55) restores the record's copy only if it is later than the
    // copy this meeting was restored from. It is not.
    expect(workspaceSavedAt(recordCopy)).toBeLessThanOrEqual(restoredFrom);
    expect(ws().answerDigits).toMatchObject({ units: '5', tens: '6', hundreds: '1' });

    sendNow();
    const writes = workspaceWritesSince(mark);
    expect(writes.length, 'the record gets the work kept on the device').toBeGreaterThan(0);
    const sent = writes[writes.length - 1].value.workspaceState;
    expect(sent.sessionNumber).toBe(4);
    expect(sent.answerDigits).toMatchObject({ units: '5', tens: '6', hundreds: '1' });
    expect(workspaceSavedAt(sent)).toBeGreaterThan(workspaceSavedAt(recordCopy));
    // One stamp on both copies again.
    expect(workspaceSavedAt(deviceCopy())).toBe(workspaceSavedAt(sent));
    // The meeting's state goes with it.
    const sessionState = rtdb.updates
      .slice(mark)
      .find((u) => u.path === `users/students/${STUDENT}` && 'sessionState/session_number' in (u.value ?? {}));
    expect(sessionState?.value['sessionState/session_number']).toBe(4);

    // From here the normal flow: the next change goes to both.
    const mark2 = rtdb.updates.length;
    ws().setAnswerDigit('units', '');
    sendNow();
    expect(workspaceWritesSince(mark2).length).toBeGreaterThan(0);
  });

  it('a record copy later than the copy this device restored from (written elsewhere) is not overwritten', () => {
    const recordCopy = workOnlineInMeeting4();
    reloadPage(0);
    const restoredFrom = pageRestoresDeviceCopy(4);
    ws().setAnswerDigit('tens', '6');
    const mark = rtdb.updates.length;

    const elsewhere = { ...recordCopy, standardTaskIdx: 2, answerDigits: {}, [WORKSPACE_SAVED_AT_KEY]: restoredFrom + 1 };
    serverClockOffset(TEN_MIN);
    deliverRecord({ ...APPROVED, workspaceState: elsewhere });
    sendNow();
    // The page restores the record's copy instead (X55); the service does not race it.
    expect(workspaceWritesSince(mark)).toHaveLength(0);
  });

  it("a teacher's reset waiting on the record is not undone by the device copy", () => {
    workOnlineInMeeting4();
    reloadPage(0);
    pageRestoresDeviceCopy(4);
    ws().setAnswerDigit('tens', '6');
    const mark = rtdb.updates.length;

    serverClockOffset(TEN_MIN);
    deliverRecord({ ...APPROVED, forceReload: true });
    sendNow();
    expect(statesWrittenSince(mark)).toHaveLength(0);
    expect(deviceCopy(), "the reset meeting's copy is gone from this device").toBeNull();
  });

  it('an ordinary reload with nothing new writes nothing when the record arrives', () => {
    const recordCopy = workOnlineInMeeting4();
    reloadPage(TEN_MIN);
    pageRestoresDeviceCopy(4);
    const mark = rtdb.updates.length;
    deliverRecord({ ...APPROVED, workspaceState: recordCopy });
    sendNow();
    expect(workspaceWritesSince(mark)).toHaveLength(0);
  });
});

/* ── A fresh start without the record ─────────────────────────────────────── */

const TWELVE_MIN = 12 * 60 * 1000;

/**
 * Online in meeting 2 (the diagnostic, which needs no approved path): the
 * learner reaches task `taskIdx` and types a 5 there. Returns the record's copy.
 */
function workOnlineInMeeting2(taskIdx: number): Record<string, any> {
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 5 } as any, role: 'student', isAuthenticated: true });
  useStore.setState({ students: {} as any, firebaseLoaded: false });
  serverClockOffset(TEN_MIN);
  svc.startSync(STUDENT, { uid: STUDENT });
  deliverRecord({});
  ws().initSession(2, false);
  useWorkspaceStore.setState({ qflow: { ...ws().qflow, taskIdx } });
  ws().setAnswerDigit('units', '5');
  sendNow();
  const writes = workspaceWritesSince(0);
  const recordCopy = writes[writes.length - 1].value.workspaceState;
  expect(recordCopy.qflow.taskIdx).toBe(taskIdx);
  expect(recordCopy.answerDigits).toMatchObject({ units: '5' });
  return recordCopy;
}

/**
 * The learner reloads without a connection on a device that holds no copy of
 * the meeting (another tablet, or its storage was cleared). Neither the device
 * nor the record can say where the learner was, so the page starts the
 * meeting afresh (StudentWorkspacePage, after FIREBASE_RESTORE_GRACE_MS).
 */
function freshStartOffline(meeting: 1 | 2) {
  localStorage.clear();
  reloadPage(0);
  ws().initSession(meeting, false);
  expect(ws().workspaceInitializedFor?.restoredSavedAt).toBeNull();
}

describe('Module 17 — a meeting started afresh without the record never overwrites its progress', () => {
  it("offline fresh start, then reconnect: the record's progress comes back and the learner goes on from it", () => {
    const recordCopy = workOnlineInMeeting2(3);
    freshStartOffline(2);
    expect(ws().qflow.taskIdx).toBe(0);
    // The child types in task 1 of the fresh start, twelve minutes later:
    // newer, and not empty, but behind the record's task 4.
    clock.device += TWELVE_MIN;
    ws().setAnswerDigit('units', '7');
    const mark = rtdb.updates.length;

    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: recordCopy });

    expect(ws().qflow.taskIdx, "the record's task is back on screen").toBe(3);
    expect(ws().answerDigits).toMatchObject({ units: '5' });
    sendNow();
    const writes = workspaceWritesSince(mark);
    expect(writes.length, "both copies are brought to the record's state").toBeGreaterThan(0);
    for (const w of writes) expect(w.value.workspaceState.qflow.taskIdx, 'the fresh start is never written').toBe(3);
    expect(deviceCopy()?.qflow.taskIdx).toBe(3);
    expect(workspaceSavedAt(deviceCopy())).toBe(workspaceSavedAt(writes[writes.length - 1].value.workspaceState));

    // The learner goes on from there, and a later reload keeps it.
    ws().setAnswerDigit('tens', '4');
    sendNow();
    const last = workspaceWritesSince(mark).pop()!.value.workspaceState;
    expect(last.qflow.taskIdx).toBe(3);
    expect(last.answerDigits).toMatchObject({ units: '5', tens: '4' });
    reloadPage(0);
    pageRestoresDeviceCopy(2);
    expect(ws().qflow.taskIdx).toBe(3);
  });

  it("an untouched fresh start never replaces the record's copy, even on the first task", () => {
    const recordCopy = workOnlineInMeeting2(0);
    freshStartOffline(2);
    clock.device += TWELVE_MIN;
    expect(deviceCopy(), 'the start itself is not saved').toBeNull();
    const mark = rtdb.updates.length;

    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: recordCopy });
    sendNow();
    expect(ws().answerDigits).toMatchObject({ units: '5' });
    for (const w of workspaceWritesSince(mark)) expect(w.value.workspaceState.answerDigits).toMatchObject({ units: '5' });
  });

  it('fresh-start work that is newer, not empty and got further is kept, and the record gets it', () => {
    const recordCopy = workOnlineInMeeting2(1);
    freshStartOffline(2);
    clock.device += TWELVE_MIN;
    useWorkspaceStore.setState({ qflow: { ...ws().qflow, taskIdx: 2 } });
    ws().setAnswerDigit('units', '9');
    const mark = rtdb.updates.length;

    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: recordCopy });
    expect(ws().qflow.taskIdx).toBe(2);
    expect(ws().answerDigits).toMatchObject({ units: '9' });
    sendNow();
    const writes = workspaceWritesSince(mark);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[writes.length - 1].value.workspaceState.qflow.taskIdx).toBe(2);
    expect(workspaceSavedAt(writes[writes.length - 1].value.workspaceState)).toBeGreaterThan(workspaceSavedAt(recordCopy));
  });

  it('fresh-start work that got further is kept even on a device clock that is behind (the stamps are not compared)', () => {
    const recordCopy = workOnlineInMeeting2(1);
    freshStartOffline(2);
    // Two minutes later on a clock ten minutes behind: stamped before the
    // record's copy, but four tasks further.
    clock.device += 2 * 60_000;
    useWorkspaceStore.setState({ qflow: { ...ws().qflow, taskIdx: 5 } });
    ws().setAnswerDigit('units', '9');
    expect(workspaceSavedAt(deviceCopy())).toBeLessThan(workspaceSavedAt(recordCopy));
    const mark = rtdb.updates.length;

    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: recordCopy });
    expect(ws().qflow.taskIdx).toBe(5);
    expect(ws().answerDigits).toMatchObject({ units: '9' });
    sendNow();
    const writes = statesWrittenSince(mark);
    expect(writes.length, 'the record gets it at once').toBeGreaterThan(0);
    for (const w of writes) expect(w.value.workspaceState.qflow.taskIdx).toBe(5);
    expect(workspaceSavedAt(writes[writes.length - 1].value.workspaceState)).toBeGreaterThan(workspaceSavedAt(recordCopy));
  });

  it('at equal progress the stamp decides: fresh-start work stamped before the record\'s copy loses', () => {
    const recordCopy = workOnlineInMeeting2(1);
    freshStartOffline(2);
    clock.device += 2 * 60_000;
    useWorkspaceStore.setState({ qflow: { ...ws().qflow, taskIdx: 1 } });
    ws().setAnswerDigit('units', '9');
    expect(workspaceSavedAt(deviceCopy())).toBeLessThan(workspaceSavedAt(recordCopy));
    const mark = rtdb.updates.length;

    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: recordCopy });
    expect(ws().qflow.taskIdx).toBe(1);
    expect(ws().answerDigits).toMatchObject({ units: '5' });
    sendNow();
    for (const w of statesWrittenSince(mark)) expect(w.value.workspaceState.answerDigits).toMatchObject({ units: '5' });
  });

  it('with no copy of this meeting on the record, the fresh start goes on and the record gets it', () => {
    // The record's copy is of meeting 1; the learner now starts meeting 2 afresh, offline.
    useAuthStore.setState({ user: { uid: STUDENT, student_id: 5 } as any, role: 'student', isAuthenticated: true });
    serverClockOffset(TEN_MIN);
    svc.startSync(STUDENT, { uid: STUDENT });
    deliverRecord({});
    ws().initSession(1, false);
    ws().setAnswerDigit('units', '1');
    sendNow();
    const meeting1Copy = workspaceWritesSince(0).pop()!.value.workspaceState;
    expect(meeting1Copy.sessionNumber).toBe(1);

    freshStartOffline(2);
    clock.device += TWELVE_MIN;
    ws().setAnswerDigit('units', '8');
    const mark = rtdb.updates.length;
    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: meeting1Copy });
    expect(ws().sessionNumber).toBe(2);
    expect(ws().answerDigits).toMatchObject({ units: '8' });
    sendNow();
    const writes = workspaceWritesSince(mark);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[writes.length - 1].value.workspaceState.sessionNumber).toBe(2);
  });

  it("the teacher's board lock on the record stays on after the record's copy is restored", () => {
    const recordCopy = workOnlineInMeeting2(3);
    freshStartOffline(2);
    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: recordCopy, isBoardLocked: true });
    expect(ws().qflow.taskIdx).toBe(3);
    expect(ws().isBoardLocked).toBe(true);
  });

  it("a teacher's reset waiting on the record: nothing is restored or written", () => {
    const recordCopy = workOnlineInMeeting2(3);
    freshStartOffline(2);
    const mark = rtdb.updates.length;
    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: recordCopy, forceReload: true });
    sendNow();
    expect(ws().qflow.taskIdx).toBe(0);
    expect(statesWrittenSince(mark)).toHaveLength(0);
  });

  it("fresh start, one change, a second offline reload (or the lobby and back), then reconnect: the record's progress still wins", () => {
    const recordCopy = workOnlineInMeeting2(3);
    freshStartOffline(2);
    ws().setAnswerDigit('units', '7');

    // Reloaded again, still offline: the page restores that copy (its cache path).
    reloadPage(0);
    pageRestoresDeviceCopy(2);
    expect(ws().answerDigits).toMatchObject({ units: '7' });
    ws().setAnswerDigit('tens', '1');
    const mark = rtdb.updates.length;

    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: recordCopy });
    expect(ws().qflow.taskIdx, "the record's task is back on screen").toBe(3);
    expect(ws().answerDigits).toMatchObject({ units: '5' });
    sendNow();
    const writes = statesWrittenSince(mark);
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w.value.workspaceState.qflow.taskIdx, 'the fresh start is never written').toBe(3);

    // How: the fresh start's copy said so, the restore kept it a fresh start,
    // and the mark never reached the record; once settled it is gone.
    for (const w of writes) expect(startedWithoutRecord(w.value.workspaceState)).toBe(false);
    expect(startedWithoutRecord(deviceCopy())).toBe(false);
    expect(deviceCopy()?.qflow.taskIdx).toBe(3);
  });

  it('a fresh start that got further, across a second offline reload, is kept and sent on reconnect', () => {
    const recordCopy = workOnlineInMeeting2(1);
    freshStartOffline(2);
    useWorkspaceStore.setState({ qflow: { ...ws().qflow, taskIdx: 4 } });
    ws().setAnswerDigit('units', '9');
    expect(startedWithoutRecord(deviceCopy()), 'the device copy says it began without the record').toBe(true);
    reloadPage(0);
    pageRestoresDeviceCopy(2);
    expect(ws().workspaceInitializedFor?.restoredSavedAt, 'restored, and still a fresh start').toBeNull();
    const mark = rtdb.updates.length;

    serverClockOffset(TEN_MIN);
    deliverRecord({ workspaceState: recordCopy });
    expect(ws().qflow.taskIdx).toBe(4);
    sendNow();
    const writes = statesWrittenSince(mark);
    expect(writes.length, 'the record gets it at once').toBeGreaterThan(0);
    expect(writes[writes.length - 1].value.workspaceState.qflow.taskIdx).toBe(4);
    expect(startedWithoutRecord(writes[writes.length - 1].value.workspaceState)).toBe(false);
  });

  it('a meeting started after the record arrived is not second-guessed by later snapshots', () => {
    const recordCopy = workOnlineInMeeting2(3);
    // Online, with the record loaded, the meeting starts over (a teacher's level-2 reset).
    ws().initSession(2, false);
    ws().setAnswerDigit('units', '2');
    deliverRecord({ workspaceState: recordCopy });
    expect(ws().qflow.taskIdx).toBe(0);
    expect(ws().answerDigits).toMatchObject({ units: '2' });
  });
});

describe('Module 17 — the rule for a fresh start, as stated', () => {
  const copy = (fields: Record<string, unknown>) => ({ sessionNumber: 4, flowStatus: 'task', ...fields });

  it('how far into the meeting a copy is', () => {
    expect(meetingProgress(copy({ standardTaskIdx: 3 }))).toBe(3);
    expect(meetingProgress(copy({ standardTaskIdx: 6, flowStatus: 'choice_branch' }))).toBeGreaterThan(6);
    expect(meetingProgress(copy({ standardTaskIdx: 9 }))).toBeGreaterThan(meetingProgress(copy({ standardTaskIdx: 6, flowStatus: 'choice_branch' })));
    expect(meetingProgress(copy({ flowStatus: 'sessionDone' }))).toBeGreaterThan(meetingProgress(copy({ standardTaskIdx: 12 })));
    const m2 = (qflow: Record<string, unknown>) => ({ sessionNumber: 2, flowStatus: 'task', qflow });
    expect(meetingProgress(m2({ phase: 'correction', correctionIdx: 0, subphase: 'subtask', taskIdx: 1 })))
      .toBeGreaterThan(meetingProgress(m2({ phase: 'primary', taskIdx: 8 })));
    expect(meetingProgress(m2({ phase: 'correction', correctionIdx: 0, subphase: 'retry', taskIdx: 1 })))
      .toBeGreaterThan(meetingProgress(m2({ phase: 'correction', correctionIdx: 0, subphase: 'subtask', taskIdx: 1 })));
  });

  it('kept when further; at equal progress when not empty and strictly newer; never when behind', () => {
    const record = copy({ standardTaskIdx: 2, [WORKSPACE_SAVED_AT_KEY]: 1_000 });
    const device = (fields: Record<string, unknown>) =>
      copy({ [WORKSPACE_SAVED_AT_KEY]: 2_000, hasInteracted: true, standardTaskIdx: 2, ...fields });
    expect(keepsFreshStartWork(record, device({ standardTaskIdx: 3, [WORKSPACE_SAVED_AT_KEY]: 500 }), 4), 'further, stamped earlier').toBe(true);
    expect(keepsFreshStartWork(record, device({ standardTaskIdx: 1, [WORKSPACE_SAVED_AT_KEY]: 9_000 }), 4), 'behind, stamped later').toBe(false);
    expect(keepsFreshStartWork(record, device({}), 4), 'equal, newer').toBe(true);
    expect(keepsFreshStartWork(record, device({ [WORKSPACE_SAVED_AT_KEY]: 1_000 }), 4), 'equal, a tie is not newer').toBe(false);
    expect(keepsFreshStartWork(record, device({ [WORKSPACE_SAVED_AT_KEY]: 500 }), 4), 'equal, older').toBe(false);
    const onFirst = copy({ standardTaskIdx: 0, [WORKSPACE_SAVED_AT_KEY]: 1_000 });
    expect(keepsFreshStartWork(onFirst, device({ standardTaskIdx: 0, hasInteracted: false }), 4), 'empty').toBe(false);
    expect(keepsFreshStartWork(onFirst, device({ standardTaskIdx: 0 }), 4)).toBe(true);
    expect(keepsFreshStartWork(record, null, 4), 'nothing done on the device').toBe(false);
    expect(keepsFreshStartWork(copy({ sessionNumber: 3 }), device({}), 4), 'the record has no copy of this meeting').toBe(true);
  });

  it('a device copy of a fresh start is judged by that rule wherever it meets the record', () => {
    const record = copy({ standardTaskIdx: 3, [WORKSPACE_SAVED_AT_KEY]: 1_000 });
    const fresh = copy({ standardTaskIdx: 0, hasInteracted: true, [WORKSPACE_SAVED_AT_KEY]: 5_000, [WORKSPACE_STARTED_WITHOUT_RECORD_KEY]: true });
    expect(startedWithoutRecord(fresh)).toBe(true);
    // Later by the stamp, but behind: the record's copy is the one to restore.
    expect(newerWorkspaceSnapshot(record, fresh, 4)).toBe(record);
    const further = { ...fresh, standardTaskIdx: 4, [WORKSPACE_SAVED_AT_KEY]: 500 };
    expect(newerWorkspaceSnapshot(record, further, 4)).toBe(further);
    // An ordinary device copy keeps the stamp rule.
    const ordinary = copy({ standardTaskIdx: 0, [WORKSPACE_SAVED_AT_KEY]: 5_000 });
    expect(newerWorkspaceSnapshot(record, ordinary, 4)).toBe(ordinary);
  });
});

/* ── A teacher's reset ────────────────────────────────────────────────────── */

describe("Module 23א — a teacher's reset is never undone by a board changed a moment before", () => {
  /** What the server leaves on the record (buildActiveSessionResetValues). */
  const RESET = { ...APPROVED, workspaceState: null, sessionState: null, forceReload: true };

  /** The learner's screen (StudentWorkspacePage, StudentHub) takes up the reset. */
  const screenTakesUpReset = () => acknowledgeTeacherReset(STUDENT, STUDENT, true);
  /** The page is left or hidden: what is pending goes out (flushRemoteSyncOnPageHide). */
  const pageHide = () => {
    svc.flushRemoteSync();
    flushThrottledWrites();
  };

  function expectResetKept(mark: number) {
    const after = rtdb.updates.slice(mark).filter((u) => u.path === `users/students/${STUDENT}`);
    for (const u of after) {
      expect(u.value.workspaceState ?? null, 'no board of the reset meeting after the reset').toBeNull();
      const nested = Object.keys(u.value).filter((k) => k.startsWith('workspaceState/') || k.startsWith('sessionState/'));
      expect(nested, 'no field of the reset meeting after the reset').toEqual([]);
    }
    expect(workspaceWritesSince(mark).pop()?.value.workspaceState, 'the last write carries the reset').toBeNull();
    expect(deviceCopy(), "the reset meeting's copy is gone from this device").toBeNull();
  }

  const acted: Array<[string, () => void]> = [
    // Still in the sync's own 500 ms window.
    ['under 0.5 s before', () => {}],
    // Handed on to the throttled writer, waiting out its 1000 ms window.
    ['0.5 to 1.5 s before', () => svc.flushRemoteSync()],
  ];
  for (const [when, age] of acted) {
    it(`the child acted ${when}; the sync sees the reset first`, () => {
      workOnlineInMeeting4();
      ws().setAnswerDigit('tens', '6');
      age();
      const mark = rtdb.updates.length;
      deliverRecord(RESET);
      screenTakesUpReset();
      pageHide();
      expectResetKept(mark);
    });

    it(`the child acted ${when}; the screen sees the reset first`, () => {
      workOnlineInMeeting4();
      ws().setAnswerDigit('tens', '6');
      age();
      const mark = rtdb.updates.length;
      screenTakesUpReset();
      deliverRecord(RESET);
      pageHide();
      expectResetKept(mark);
    });
  }

  it('in the lobby after the reset, the reset meeting is not opened again from a copy held in memory', () => {
    const recordCopy = workOnlineInMeeting4();
    expect(useStore.getState().students[STUDENT]?.workspaceState).toBeUndefined();
    deliverRecord({ ...APPROVED, workspaceState: recordCopy });
    expect(useStore.getState().students[STUDENT]?.workspaceState?.sessionNumber).toBe(4);

    // The learner waits in the lobby; the teacher resets meeting 4 (StudentHub takes it up, no reload).
    deliverRecord(RESET);
    screenTakesUpReset();
    deliverRecord({ ...APPROVED, workspaceState: null });
    // Entering meeting 4 again: the page chooses between the record and this device (runInit).
    const saved = newerWorkspaceSnapshot(useStore.getState().students[STUDENT]?.workspaceState, deviceCopy() as any, 4);
    expect(saved, 'nothing to restore: the meeting starts over').toBeNull();
  });
});
