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
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { flushThrottledWrites, resetThrottledWrites } from '@/infrastructure/services/ThrottledRtdbWriter';
import { newerWorkspaceSnapshot, workspaceSavedAt, WORKSPACE_SAVED_AT_KEY } from '@/core/workspaceSnapshot';
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
    expect(workspaceWritesSince(mark)).toHaveLength(0);
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
