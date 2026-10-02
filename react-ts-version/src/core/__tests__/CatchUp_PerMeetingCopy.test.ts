/**
 * @vitest-environment jsdom
 */
/**
 * Catch-up time, part A1 (owner, 2.10.2026): "תלמיד שלא סיים … לא מאבד כלום
 * וממשיך מאיפה שעצר — אני רוצה שזה יהיה בכל מפגש".
 *
 *  - Every workspace sync of meeting N also writes workspaceByMeeting/m{N} on
 *    the learner record, in the same update (split when the two would pass
 *    50KB), and this device keeps one copy per meeting.
 *  - The finishing points write completedMeetings/m{N} once per meeting.
 *  - A teacher's reset drops this device's copy of the reset meeting only; a
 *    full reset drops them all.
 *  - getLocalSessionProgress(uid) with one argument behaves as before.
 *
 * Driven through the real workspace store and the real FirebaseSyncService;
 * only the Realtime Database transport is replaced (as in
 * OfflineReload_KeepsWork.test.ts).
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

import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import {
  firebaseSyncService,
  acknowledgeTeacherReset,
  perMeetingCopyWrite,
  teacherResetFields,
  TEACHER_RESET_FIELDS,
  MAX_PAYLOAD_BYTES,
} from '@/infrastructure/services/FirebaseSyncService';
import { flushThrottledWrites, resetThrottledWrites } from '@/infrastructure/services/ThrottledRtdbWriter';
import { resumeSnapshotFor, resetMeetingOf, isMeetingFinished } from '@/core/meetingCompletion';
import { WORKSPACE_SAVED_AT_KEY } from '@/core/workspaceSnapshot';
import { fetchServerClockOffset } from '@/infrastructure/firebase';

const STUDENT = 'student_user5';
const RECORD_PATH = `users/students/${STUDENT}`;
const APPROVED = { teacher_gate_approved: true, routeStatus: 'APPROVED', pedagogicalPath: 'remediation_path' };

const ws = () => useWorkspaceStore.getState();
const svc = firebaseSyncService as any;

function serverClockOffset(offset: number) {
  void fetchServerClockOffset();
  rtdb.listeners.get('.info/serverTimeOffset')?.({ val: () => offset });
}

function deliverRecord(record: Record<string, any>) {
  const cb = rtdb.listeners.get(RECORD_PATH);
  expect(cb, 'the learner record listener is subscribed').toBeTruthy();
  cb!({ exists: () => true, val: () => ({ ...record }) });
}

function sendNow() {
  svc.flushRemoteSync();
  flushThrottledWrites();
}

function signInOnline(record: Record<string, any> = APPROVED) {
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 5 } as any, role: 'student', isAuthenticated: true });
  useStore.setState({ students: {} as any, firebaseLoaded: false });
  svc.startSync(STUDENT, { uid: STUDENT });
  deliverRecord(record);
}

/** The record as the writes so far left it (the fields this file looks at). */
function recordFromWrites(): Record<string, any> {
  const record: Record<string, any> = { ...APPROVED, workspaceByMeeting: {} };
  for (const u of rtdb.updates) {
    if (u.path === RECORD_PATH) {
      for (const [k, v] of Object.entries(u.value)) {
        if (k === 'workspaceState') record.workspaceState = v;
        const m = /^workspaceByMeeting\/(m\d)$/.exec(k);
        if (m) record.workspaceByMeeting[m[1]] = v;
      }
    } else if (u.path === `${RECORD_PATH}/workspaceByMeeting`) {
      Object.assign(record.workspaceByMeeting, u.value);
    }
  }
  return record;
}

/** The learner answers the exercise on screen correctly (as FullJourney_Simulation.test.ts). */
function solveCurrentExercise() {
  const s = ws();
  const task = getActiveTasks(s)[s.standardTaskIdx];
  if (!task) return;
  if (task.choices && task.choices.length > 0) {
    const correct = task.choices.find((c) => c.correct === true);
    if (!correct) throw new Error(`exercise ${task.id} marks no choice as correct`);
    ws().selectChoice(correct.id);
    return;
  }
  const target =
    typeof task.correctAnswer === 'number'
      ? task.correctAnswer
      : typeof task.numberA === 'number' && typeof task.numberB === 'number'
        ? (task.isSubtraction ? task.numberA - task.numberB : task.numberA + task.numberB)
        : null;
  if (target === null) return;
  const [th, h, t, u] = String(Math.abs(target)).padStart(4, '0').split('').map(Number).slice(-4);
  useWorkspaceStore.setState({ counts: { units: u, tens: t, hundreds: h, thousands: th } } as any);
  ws().setAnswerDigit('units', String(u));
  ws().setAnswerDigit('tens', String(t));
  ws().setAnswerDigit('hundreds', String(h));
  ws().setAnswerDigit('thousands', String(th));
}

const marksWritten = (path: string, meeting: number) =>
  rtdb.updates.filter((u) => u.path === path && `completedMeetings/m${meeting}` in (u.value ?? {}));

beforeEach(() => {
  clock.device = 1_900_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock.device);
  svc.stopSync();
  for (const path of [...rtdb.listeners.keys()]) if (!path.startsWith('.info/')) rtdb.listeners.delete(path);
  rtdb.updates.length = 0;
  resetThrottledWrites();
  svc.completedMarksSent.clear();
  localStorage.clear();
  serverClockOffset(0);
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('catch-up A1 — a saved copy per meeting', () => {
  it('every sync of meeting N writes workspaceByMeeting/m{N} with workspaceState, in the same update', () => {
    signInOnline();
    ws().initSession(3, false);
    ws().setAnswerDigit('units', '5');
    sendNow();
    const writes = rtdb.updates.filter((u) => u.path === RECORD_PATH && 'workspaceState' in u.value);
    expect(writes.length).toBeGreaterThan(0);
    const last = writes[writes.length - 1].value;
    expect(last['workspaceByMeeting/m3']).toBe(last.workspaceState);
    expect(last.workspaceState.sessionNumber).toBe(3);
    expect(last.workspaceState[WORKSPACE_SAVED_AT_KEY]).toBeGreaterThan(0);
  });

  it('switching meeting 3 → 4 → 3 restores meeting 3 from its own copy (record and device)', () => {
    signInOnline();
    ws().initSession(3, false);
    ws().setAnswerDigit('units', '5');
    sendNow();
    clock.device += 60_000;

    // The class moves on to meeting 4.
    ws().initSession(4, false);
    ws().setAnswerDigit('tens', '7');
    sendNow();
    clock.device += 60_000;

    const record = recordFromWrites();
    expect(record.workspaceState.sessionNumber, 'workspaceState now holds meeting 4').toBe(4);
    expect(record.workspaceByMeeting.m3.answerDigits).toMatchObject({ units: '5' });
    expect(record.workspaceByMeeting.m4.answerDigits).toMatchObject({ tens: '7' });

    // This device: one copy per meeting; the one-argument read is the latest copy.
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 3)?.answerDigits).toMatchObject({ units: '5' });
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 4)?.answerDigits).toMatchObject({ tens: '7' });
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT)?.sessionNumber).toBe(4);

    // The teacher reopens meeting 3 for catch-up.
    const saved = resumeSnapshotFor(record, firebaseSyncService.getLocalSessionProgress(STUDENT, 3), 3);
    expect(saved?.sessionNumber).toBe(3);
    ws().restoreSession(saved);
    expect(ws().sessionNumber).toBe(3);
    expect(ws().answerDigits).toMatchObject({ units: '5' });
    expect(ws().answerDigits.tens ?? '').toBe('');

    // Only the device copy (no connection): the same.
    const fromDevice = resumeSnapshotFor(null, firebaseSyncService.getLocalSessionProgress(STUDENT, 3), 3);
    expect(fromDevice?.answerDigits).toMatchObject({ units: '5' });
  });

  it('a meeting started without a connection never replaces another meeting’s device copy', () => {
    signInOnline();
    ws().initSession(4, false);
    ws().setAnswerDigit('tens', '7');
    sendNow();
    clock.device += 60_000;

    // Reload without a connection; the class is in meeting 3 now.
    svc.stopSync();
    resetThrottledWrites();
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    svc.startSync(STUDENT, { uid: STUDENT });
    ws().initSession(3, false);
    ws().setAnswerDigit('units', '2');
    clock.device += 60_000;
    ws().setAnswerDigit('tens', '1');

    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 3)?.answerDigits).toMatchObject({ units: '2', tens: '1' });
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 4)?.answerDigits, 'meeting 4 is still on the device').toMatchObject({ tens: '7' });
  });

  it('settling a meeting started without the record uses the record’s copy of THAT meeting, not workspaceState', () => {
    // On the record: meeting 3 at exercise 3 (workspaceByMeeting), workspaceState is meeting 4.
    const m3 = { sessionNumber: 3, flowStatus: 'task', standardTaskIdx: 2, hasInteracted: true, [WORKSPACE_SAVED_AT_KEY]: clock.device - 120_000 };
    const m4 = { sessionNumber: 4, flowStatus: 'task', standardTaskIdx: 1, [WORKSPACE_SAVED_AT_KEY]: clock.device - 60_000 };
    useAuthStore.setState({ user: { uid: STUDENT, student_id: 5 } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any, firebaseLoaded: false });
    svc.startSync(STUDENT, { uid: STUDENT });
    // Started afresh before the record arrived.
    ws().initSession(3, false);
    deliverRecord({ ...APPROVED, workspaceState: m4, workspaceByMeeting: { m3, m4 } });
    expect(ws().standardTaskIdx, 'the record’s copy of meeting 3 is restored').toBe(2);
  });

  it('keeps each update within 50KB: a copy that would pass it goes as a second update', () => {
    const big = { sessionNumber: 3, flowStatus: 'task', blob: 'x'.repeat(30 * 1024) };
    const fields = { workspaceState: big, lastActive: 1 };
    const split = perMeetingCopyWrite(STUDENT, 3, big, fields);
    expect(split.inRecordUpdate).toBe(false);
    expect(split.separate).toEqual({ path: `${RECORD_PATH}/workspaceByMeeting`, fields: { m3: big } });
    expect(JSON.stringify(split.separate!.fields).length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);

    const small = { sessionNumber: 3, flowStatus: 'task' };
    expect(perMeetingCopyWrite(STUDENT, 3, small, { workspaceState: small })).toEqual({ inRecordUpdate: true, separate: null });
    expect(perMeetingCopyWrite(STUDENT, 0, small, { workspaceState: small })).toEqual({ inRecordUpdate: false, separate: null });
  });
});

describe('catch-up A1 — the finished mark, once per meeting', () => {
  it('markMeetingCompleted writes completedMeetings/m{N} under both ids, once', () => {
    firebaseSyncService.markMeetingCompleted('user5', 3);
    firebaseSyncService.markMeetingCompleted('user5', 3);
    flushThrottledWrites();
    firebaseSyncService.markMeetingCompleted('user5', 3);
    flushThrottledWrites();
    expect(marksWritten('users/students/user5', 3)).toHaveLength(1);
    expect(marksWritten('users/students/student_user5', 3)).toHaveLength(1);
    const value = marksWritten('users/students/user5', 3)[0].value['completedMeetings/m3'];
    expect(value, 'the server clock').toHaveProperty('.sv', 'timestamp');
  });

  it('is not written again when the record already carries it', () => {
    useStore.setState({ students: { [STUDENT]: { completedMeetings: { m4: 123 } } } as any });
    firebaseSyncService.markMeetingCompleted(STUDENT, 4);
    flushThrottledWrites();
    expect(marksWritten(RECORD_PATH, 4)).toHaveLength(0);
  });

  it('finishMeetingEarly marks meetings 1–7 once; a device another device took over writes none', () => {
    signInOnline();
    ws().initSession(5, false);
    ws().finishMeetingEarly();
    ws().finishMeetingEarly();
    flushThrottledWrites();
    expect(marksWritten(RECORD_PATH, 5)).toHaveLength(1);

    useWorkspaceStore.setState({ isSupersededByOtherDevice: true });
    ws().initSession(6, false);
    useWorkspaceStore.setState({ isSupersededByOtherDevice: true });
    ws().finishMeetingEarly();
    flushThrottledWrites();
    expect(marksWritten(RECORD_PATH, 6)).toHaveLength(0);
  });

  it('meeting 8 is finished by the reflection, not by the seven exercises', () => {
    signInOnline();
    ws().initSession(8, false);
    ws().finishMeetingEarly();
    flushThrottledWrites();
    expect(ws().flowStatus).toBe('reflection');
    expect(marksWritten(RECORD_PATH, 8)).toHaveLength(0);
    ws().finishReflection();
    ws().finishReflection();
    flushThrottledWrites();
    expect(marksWritten(RECORD_PATH, 8)).toHaveLength(1);
  });

  it('reaching the branch choice in meetings 3–7 marks the meeting, once', () => {
    signInOnline();
    ws().initSession(4, false);
    for (let i = 0; i < 7; i++) {
      expect(marksWritten(RECORD_PATH, 4), `not finished before exercise ${i + 1}`).toHaveLength(0);
      solveCurrentExercise();
      ws().proceed();
      flushThrottledWrites();
    }
    expect(ws().flowStatus).toBe('choice_branch');
    expect(marksWritten(RECORD_PATH, 4)).toHaveLength(1);
    // "סיום המפגש כעת" from the choice screen: already marked, not again.
    ws().finishMeetingEarly();
    flushThrottledWrites();
    expect(marksWritten(RECORD_PATH, 4)).toHaveLength(1);
  });
});

describe('catch-up A1 — a teacher’s reset', () => {
  it('reads which meeting was reset from the record', () => {
    expect(resetMeetingOf({ lastAction: 'המפגש 3 אופס ע״י המורה', activeSessionNumber: 3, activeSessionId: 3, forceReload: true })).toBe(3);
    expect(resetMeetingOf({ activeSessionNumber: 5, activeSessionId: 5, highestCompletedMeeting: 4, forceReload: true })).toBe(5);
    expect(resetMeetingOf({ lastAction: 'אופס ע״י המורה', highestCompletedMeeting: 0, activeSessionId: 1, completedMeeting8: false })).toBe('all');
    expect(resetMeetingOf({ activeSessionNumber: 1, activeSessionId: 1, highestCompletedMeeting: 0, completedMeeting8: false })).toBe('all');
    expect(resetMeetingOf({ forceReload: true })).toBeNull();
    expect(resetMeetingOf(null)).toBeNull();
  });

  it('the acknowledgement write clears the reset meeting’s copy and mark again; a full reset both maps', () => {
    expect(teacherResetFields(3)).toEqual({ ...TEACHER_RESET_FIELDS, 'workspaceByMeeting/m3': null, 'completedMeetings/m3': null });
    expect(teacherResetFields('all')).toEqual({ ...TEACHER_RESET_FIELDS, workspaceByMeeting: null, completedMeetings: null });
    expect(teacherResetFields(null)).toEqual({ ...TEACHER_RESET_FIELDS });
  });

  it('a meeting reset drops this device’s copy of that meeting only; a full reset drops them all', () => {
    signInOnline();
    ws().initSession(3, false);
    ws().setAnswerDigit('units', '5');
    sendNow();
    clock.device += 60_000;
    ws().initSession(4, false);
    ws().setAnswerDigit('tens', '7');
    sendNow();

    acknowledgeTeacherReset(STUDENT, STUDENT, true, { lastAction: 'המפגש 4 אופס ע״י המורה', activeSessionNumber: 4, activeSessionId: 4, forceReload: true });
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 4)).toBeNull();
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 3)?.answerDigits, 'meeting 3 is kept').toMatchObject({ units: '5' });
    const ack = rtdb.updates.filter((u) => u.path === RECORD_PATH && 'forceReload' in u.value).pop()!;
    expect(ack.value).toMatchObject({ 'workspaceByMeeting/m4': null, 'completedMeetings/m4': null, workspaceState: null });
    expect('workspaceByMeeting/m3' in ack.value).toBe(false);

    acknowledgeTeacherReset(STUDENT, STUDENT, true, { lastAction: 'אופס ע״י המורה', highestCompletedMeeting: 0, forceReload: true });
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 3)).toBeNull();
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT)).toBeNull();
  });

  it('the service’s own listener takes up a meeting reset the same way', () => {
    signInOnline();
    ws().initSession(3, false);
    ws().setAnswerDigit('units', '5');
    sendNow();
    clock.device += 60_000;
    ws().initSession(4, false);
    ws().setAnswerDigit('tens', '7');
    sendNow();
    // A screen that takes up the reset without passing the record reads the one the service saw.
    deliverRecord({ ...APPROVED, workspaceState: null, lastAction: 'המפגש 4 אופס ע״י המורה', activeSessionNumber: 4, activeSessionId: 4, forceReload: true });
    const ack = rtdb.updates.filter((u) => u.path === RECORD_PATH && 'forceReload' in u.value).pop()!;
    expect(ack.value).toMatchObject({ 'workspaceByMeeting/m4': null, 'completedMeetings/m4': null });
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 3)?.answerDigits).toMatchObject({ units: '5' });
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 4)).toBeNull();
    acknowledgeTeacherReset(STUDENT, STUDENT, true);
    expect(firebaseSyncService.getLocalSessionProgress(STUDENT, 3), 'still only meeting 4').toBeTruthy();
  });

  it('a reset meeting’s finished mark can be written again after the reset', () => {
    firebaseSyncService.markMeetingCompleted(STUDENT, 3);
    flushThrottledWrites();
    firebaseSyncService.discardUnsentWorkspace(3);
    firebaseSyncService.markMeetingCompleted(STUDENT, 3);
    flushThrottledWrites();
    expect(marksWritten(RECORD_PATH, 3)).toHaveLength(2);
  });
});

describe('catch-up A1 — old one-argument callers', () => {
  it('getLocalSessionProgress(uid) is the latest copy, as before', () => {
    firebaseSyncService.saveSessionProgressLocally('u1', { sessionNumber: 4, flowStatus: 'task', standardTaskIdx: 2 });
    expect(firebaseSyncService.getLocalSessionProgress('u1')).toMatchObject({ sessionNumber: 4, standardTaskIdx: 2 });
    firebaseSyncService.saveSessionProgressLocally('u1', { sessionNumber: 3, flowStatus: 'task', standardTaskIdx: 1 });
    expect(firebaseSyncService.getLocalSessionProgress('u1')).toMatchObject({ sessionNumber: 3 });
    expect(firebaseSyncService.getLocalSessionProgress('u1', 4)).toMatchObject({ sessionNumber: 4, standardTaskIdx: 2 });
    // A copy with no meeting is still saved and read the old way.
    firebaseSyncService.saveSessionProgressLocally('u2', { progress: 50 });
    expect(firebaseSyncService.getLocalSessionProgress('u2')).toMatchObject({ progress: 50 });
    expect(firebaseSyncService.getLocalSessionProgress('u2', 3)).toBeNull();
    firebaseSyncService.clearLocalSessionProgress('u1');
    expect(firebaseSyncService.getLocalSessionProgress('u1')).toBeNull();
    expect(firebaseSyncService.getLocalSessionProgress('u1', 4)).toBeNull();
  });

  it('a copy saved before per-meeting copies existed is read as that meeting’s copy', () => {
    localStorage.setItem('mathmaticore_session_cache_u3', JSON.stringify({ sessionNumber: 5, flowStatus: 'task', standardTaskIdx: 3, savedAt: 10 }));
    expect(firebaseSyncService.getLocalSessionProgress('u3', 5)).toMatchObject({ standardTaskIdx: 3 });
    expect(firebaseSyncService.getLocalSessionProgress('u3', 4)).toBeNull();
    firebaseSyncService.clearLocalSessionProgress('u3', 4);
    expect(firebaseSyncService.getLocalSessionProgress('u3'), 'a copy of another meeting is kept').toBeTruthy();
    firebaseSyncService.clearLocalSessionProgress('u3', 5);
    expect(firebaseSyncService.getLocalSessionProgress('u3')).toBeNull();
  });

  it('isMeetingFinished reads the mark this part writes', () => {
    expect(isMeetingFinished({ completedMeetings: { m6: 1 } }, 6)).toBe(true);
    expect(isMeetingFinished({ completedMeetings: { m6: 1 } }, 7)).toBe(false);
  });
});
