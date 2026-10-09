/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * PRD 7.3 Module 14 §ב: each meeting has its time limit (20 / 25 / 15 minutes),
 * and the browser "is not authorised to set or extend times".
 *
 * The device kept the deadline per meeting only, so on a tablet shared by
 * several learners the next learner inherited the previous one's deadline.
 * It is now kept per learner and per meeting. A learner who signs out and back
 * in keeps theirs, and the device-wide key the previous version left behind is
 * adopted only by a learner it can be shown to belong to
 * (application/meetingDeadline.ts).
 */

// The database's report of the server clock (.info/serverTimeOffset), sent by the test.
const serverClock = vi.hoisted(() => ({ report: null as null | ((snap: { val: () => number }) => void) }));

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  const noop = async () => undefined;
  return {
    ...actual,
    ref: vi.fn((_db: unknown, path = '') => ({ _path: path })),
    set: vi.fn(noop),
    update: vi.fn(noop),
    remove: vi.fn(noop),
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    push: vi.fn(() => ({ key: 'k', _path: 'k' })),
    onValue: vi.fn((r: { _path?: string }, cb: (snap: { val: () => number }) => void) => {
      if (r?._path === '.info/serverTimeOffset') serverClock.report = cb;
      return () => undefined;
    }),
    onDisconnect: vi.fn(() => ({ set: noop, cancel: noop })),
    runTransaction: vi.fn(noop),
    serverTimestamp: vi.fn(() => 0),
  };
});

const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => (key in mockStorage ? mockStorage[key] : null)),
  setItem: vi.fn((key: string, val: string) => { mockStorage[key] = String(val); }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });
Object.defineProperty(window, 'sessionStorage', { value: mockLocalStorage, writable: true, configurable: true });
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockLocalStorage;

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore, unifiedLogout } from '@/application/useAuthStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { fetchServerClockOffset, serverNow } from '@/infrastructure/firebase';
import { meetingDeadlineKey, legacyMeetingDeadlineKey, legacyDeclinedKey } from '@/application/meetingDeadline';
import { WORKSPACE_SAVED_AT_KEY, workspaceSavedAt } from '@/core/workspaceSnapshot';
import { approvePath } from '@/test/approvedPath';

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 8, 28, 8, 0, 0);

const at = (t: number) => vi.setSystemTime(t);
const ws = () => useWorkspaceStore.getState();
const stored = (key: string) => mockLocalStorage.getItem(key);

function signIn(n: number) {
  useAuthStore.getState().setUser({ student_id: n, role: 'student' } as any, 'student');
  expect(useAuthStore.getState().user?.uid).toBe(`student_user${n}`);
  approvePath(); // Module 26: meetings 3–8 run on the learner's approved path
}

/** A reload in the middle of the meeting: the saved place comes back, the time limit is not in it. */
function reload(meeting: number) {
  ws().restoreSession({ sessionNumber: meeting, isASD: false, flowStatus: 'task', standardTaskIdx: 2 });
}

/** The learner's own saved progress on this device (the Module 17 cache), stamped on the server clock. */
function progressOnThisDevice(n: number, meeting: number, savedAt: number) {
  firebaseSyncService.saveSessionProgressLocally(`student_user${n}`, {
    sessionNumber: meeting,
    flowStatus: 'task',
    standardTaskIdx: 2,
    [WORKSPACE_SAVED_AT_KEY]: savedAt,
  });
}

/** The server clock is `offsetMs` ahead of this tablet's (negative: behind), as the database reports it. */
function serverClockAhead(offsetMs: number) {
  void fetchServerClockOffset(); // attaches the listener the first time
  expect(serverClock.report).toBeTypeOf('function');
  serverClock.report!({ val: () => offsetMs });
  expect(serverNow() - Date.now()).toBe(offsetMs);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(T0);
  mockLocalStorage.clear();
  useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false } as any);
  ws().resetWorkspace();
});

afterEach(() => {
  serverClock.report?.({ val: () => 0 });
  vi.useRealTimers();
});

describe('Module 14 §ב: the meeting time limit belongs to the learner, not to the tablet', () => {
  it('two learners on one device in the same meeting each keep their own deadline', () => {
    signIn(3);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 15 * MIN);
    unifiedLogout();

    // Six minutes later the next child on the same tablet opens the same meeting.
    at(T0 + 6 * MIN);
    signIn(7);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 21 * MIN); // their own 15 minutes, not learner 3's
    unifiedLogout();

    // Each returns to their own, by a reload or by opening the meeting again.
    at(T0 + 8 * MIN);
    signIn(3);
    reload(4);
    expect(ws().sessionDeadlineTime).toBe(T0 + 15 * MIN);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 15 * MIN);
    unifiedLogout();

    at(T0 + 9 * MIN);
    signIn(7);
    reload(4);
    expect(ws().sessionDeadlineTime).toBe(T0 + 21 * MIN);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 21 * MIN);

    expect(stored(meetingDeadlineKey(4, 'student_user3'))).toBe(String(T0 + 15 * MIN));
    expect(stored(meetingDeadlineKey(4, 'student_user7'))).toBe(String(T0 + 21 * MIN));
    // Nothing is written device-wide any more.
    expect(stored(legacyMeetingDeadlineKey(4))).toBeNull();
  });

  it('a learner who signs out and back in keeps their deadline; sign-out does not clear it', () => {
    signIn(5);
    ws().initSession(2, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 25 * MIN);

    unifiedLogout();
    expect(stored(meetingDeadlineKey(2, 'student_user5'))).toBe(String(T0 + 25 * MIN));
    // The workspace the next learner finds holds no deadline of learner 5's.
    expect(ws().sessionDeadlineTime).toBeNull();

    at(T0 + 10 * MIN);
    signIn(5);
    reload(2);
    expect(ws().sessionDeadlineTime).toBe(T0 + 25 * MIN);
    ws().initSession(2, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 25 * MIN);
  });

  it('once the learner\'s own time has run out, opening the meeting again starts a new time limit for that learner only', () => {
    signIn(3);
    ws().initSession(4, false);
    unifiedLogout();
    at(T0 + 2 * MIN);
    signIn(7);
    ws().initSession(4, false);
    unifiedLogout();

    // The teacher opens meeting 4 again next week.
    at(T0 + 7 * 24 * 60 * MIN);
    signIn(3);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 7 * 24 * 60 * MIN + 15 * MIN);
    expect(stored(meetingDeadlineKey(4, 'student_user7'))).toBe(String(T0 + 17 * MIN));
  });

  it('a deadline handed in (the server\'s) wins over the device copy, and a reload keeps it', () => {
    signIn(3);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 15 * MIN);

    const serverDeadline = T0 + 12 * MIN;
    ws().initSession(4, false, 0, serverDeadline);
    expect(ws().sessionDeadlineTime).toBe(serverDeadline);

    at(T0 + 3 * MIN);
    reload(4);
    expect(ws().sessionDeadlineTime).toBe(serverDeadline);
  });

  it('with no identified learner nothing is kept on the device and no stored deadline is used', () => {
    mockStorage[legacyMeetingDeadlineKey(1)] = String(T0 + 10 * MIN);
    ws().initSession(1, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 20 * MIN);
    expect(Object.keys(mockStorage).filter((k) => k.startsWith('mathmaticore_session_1_deadline_'))).toEqual([]);
  });

  it('a reload judges the learner\'s deadline on the server clock, not the tablet\'s', () => {
    signIn(3);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 15 * MIN);

    // The tablet is 2 minutes slow: it reads 14 minutes in, the server 16. The time is up.
    serverClockAhead(2 * MIN);
    at(T0 + 14 * MIN);
    reload(4);
    expect(ws().sessionDeadlineTime).toBeNull();

    // The tablet is 2 minutes fast: it reads 16 minutes in, the server 14. The time is still running.
    serverClockAhead(-2 * MIN);
    at(T0 + 16 * MIN);
    reload(4);
    expect(ws().sessionDeadlineTime).toBe(T0 + 15 * MIN);
  });

  it('meeting 8 is 25 minutes, kept per learner like every other meeting', () => {
    signIn(3);
    ws().initSession(8, false);
    expect(ws().sessionDurationMinutes).toBe(25);
    expect(ws().sessionDeadlineTime).toBe(T0 + 25 * MIN);
    unifiedLogout();

    at(T0 + 4 * MIN);
    signIn(7);
    ws().initSession(8, false);
    expect(ws().sessionDeadlineTime).toBe(T0 + 29 * MIN);
    unifiedLogout();

    at(T0 + 20 * MIN);
    signIn(3);
    reload(8);
    expect(ws().sessionDeadlineTime).toBe(T0 + 25 * MIN);
    expect(stored(meetingDeadlineKey(8, 'student_user3'))).toBe(String(T0 + 25 * MIN));
    expect(stored(meetingDeadlineKey(8, 'student_user7'))).toBe(String(T0 + 29 * MIN));
  });
});

describe('the device-wide deadline the previous version left behind', () => {
  // Written at T0 by whichever learner opened meeting 4 first on this tablet;
  // the new version is deployed five minutes into that meeting.
  const LEGACY = T0 + 15 * MIN;
  const NOW = T0 + 5 * MIN;

  beforeEach(() => {
    mockStorage[legacyMeetingDeadlineKey(4)] = String(LEGACY);
    at(NOW);
  });

  it('is kept by a learner who was working this meeting on this device under it — never a fresh, longer one', () => {
    progressOnThisDevice(3, 4, T0 + 4 * MIN);
    signIn(3);
    reload(4);
    expect(ws().sessionDeadlineTime).toBe(LEGACY);
    // It becomes that learner's own copy.
    expect(stored(meetingDeadlineKey(4, 'student_user3'))).toBe(String(LEGACY));
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(LEGACY);
  });

  it('stays on the device while it runs, for a second learner who was also on it', () => {
    progressOnThisDevice(3, 4, T0 + 4 * MIN);
    progressOnThisDevice(7, 4, T0 + 3 * MIN);
    signIn(3);
    reload(4);
    unifiedLogout();
    signIn(9); // a learner who was not here
    ws().initSession(4, false);
    unifiedLogout();
    signIn(7);
    reload(4);
    expect(ws().sessionDeadlineTime).toBe(LEGACY);
  });

  it('is not given to a learner who was not working this meeting on this device: they start their own', () => {
    signIn(7);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(NOW + 15 * MIN);
    expect(stored(legacyMeetingDeadlineKey(4))).toBe(String(LEGACY)); // left for whoever it belongs to
  });

  it('is not given on a reload either: a restore does not pick up someone else\'s time limit', () => {
    signIn(7);
    reload(4);
    expect(ws().sessionDeadlineTime).toBeNull(); // as a restore on a device without a stored deadline always was
  });

  it('is not given for progress from an earlier run of the meeting, or from another meeting', () => {
    progressOnThisDevice(7, 4, T0 - 24 * 60 * MIN); // last week's meeting 4
    progressOnThisDevice(8, 3, T0 + 4 * MIN);       // today, but meeting 3
    signIn(7);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(NOW + 15 * MIN);
    unifiedLogout();
    signIn(8);
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(NOW + 15 * MIN);
  });

  it('is never consulted by a learner who already has a deadline of their own for the meeting', () => {
    progressOnThisDevice(3, 4, T0 + 4 * MIN);
    mockStorage[meetingDeadlineKey(4, 'student_user3')] = String(T0 + 14 * MIN);
    signIn(3);
    reload(4);
    expect(ws().sessionDeadlineTime).toBe(T0 + 14 * MIN);

    // Their own has run out: the legacy value does not revive it.
    mockStorage[meetingDeadlineKey(4, 'student_user3')] = String(T0 + 1 * MIN);
    reload(4);
    expect(ws().sessionDeadlineTime).toBeNull();
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(NOW + 15 * MIN);
  });

  it('is removed once it has run out, for every meeting, and so is a value that is not a time', () => {
    mockStorage[legacyMeetingDeadlineKey(2)] = String(T0 - MIN);
    mockStorage[legacyMeetingDeadlineKey(6)] = 'NaN';
    signIn(3);
    ws().initSession(1, false);
    expect(stored(legacyMeetingDeadlineKey(2))).toBeNull();
    expect(stored(legacyMeetingDeadlineKey(6))).toBeNull();
    expect(stored(legacyMeetingDeadlineKey(4))).toBe(String(LEGACY)); // still running

    at(LEGACY);
    ws().initSession(1, false);
    expect(stored(legacyMeetingDeadlineKey(4))).toBeNull();
  });

  it('is dropped, not adopted, when it lies further out than a fresh deadline could (a clock that was off)', () => {
    mockStorage[legacyMeetingDeadlineKey(4)] = String(NOW + 16 * MIN);
    progressOnThisDevice(3, 4, T0 + 4 * MIN);
    signIn(3);
    reload(4);
    expect(ws().sessionDeadlineTime).toBeNull();
    expect(stored(legacyMeetingDeadlineKey(4))).toBeNull();
  });

  it('is not adopted with no identified learner', () => {
    progressOnThisDevice(3, 4, T0 + 4 * MIN);
    reload(4);
    expect(ws().sessionDeadlineTime).toBeNull();
    expect(stored(meetingDeadlineKey(4, 'student_user3'))).toBeNull();
  });

  it('once declined for a learner and meeting, it is never adopted later — not even after their progress is saved again', () => {
    // Learner 7's meeting 4 progress on this tablet dates from before learner 3 set the value.
    progressOnThisDevice(7, 4, T0 - 2 * MIN);
    signIn(7);
    reload(4);
    expect(ws().sessionDeadlineTime).toBeNull();
    expect(stored(meetingDeadlineKey(4, 'student_user7'))).toBeNull(); // a restore starts no deadline

    // Learner 7 works: their progress is saved again, stamped now — after the value was set.
    // (Saved as the Module 17 cache saves it; the live subscription's timing is not this test's subject.)
    at(NOW + 1 * MIN);
    progressOnThisDevice(7, 4, NOW + 1 * MIN);
    const resaved = firebaseSyncService.getLocalSessionProgress('student_user7');
    expect(resaved?.sessionNumber).toBe(4);
    expect(workspaceSavedAt(resaved)).toBeGreaterThanOrEqual(LEGACY - 15 * MIN);

    // The next reload still does not give them learner 3's deadline, nor does opening the meeting.
    at(NOW + 2 * MIN);
    reload(4);
    expect(ws().sessionDeadlineTime).toBeNull();
    ws().initSession(4, false);
    expect(ws().sessionDeadlineTime).toBe(NOW + 17 * MIN);
    unifiedLogout();

    // Learner 3, who was on it, still keeps it.
    progressOnThisDevice(3, 4, T0 + 4 * MIN);
    signIn(3);
    reload(4);
    expect(ws().sessionDeadlineTime).toBe(LEGACY);
  });

  it('its declined marks go when it runs out', () => {
    signIn(7);
    reload(4);
    unifiedLogout();
    signIn(9);
    ws().initSession(4, false);
    expect(stored(legacyDeclinedKey(4, 'student_user7'))).toBe(String(LEGACY));
    expect(stored(legacyDeclinedKey(4, 'student_user9'))).toBe(String(LEGACY));

    at(LEGACY);
    ws().initSession(1, false);
    expect(stored(legacyMeetingDeadlineKey(4))).toBeNull();
    expect(Object.keys(mockStorage).filter((k) => k.includes('legacy_declined'))).toEqual([]);
  });
});

describe('the device-wide deadline of meeting 8 is judged on 25 minutes, not 15', () => {
  const LEGACY_8 = T0 + 25 * MIN; // set at T0 by the first learner to open meeting 8 here
  const NOW = T0 + 5 * MIN;       // 20 minutes left: more than any 15-minute meeting can have

  beforeEach(() => {
    mockStorage[legacyMeetingDeadlineKey(8)] = String(LEGACY_8);
    at(NOW);
  });

  it('is kept by a learner who was on it since the start', () => {
    progressOnThisDevice(3, 8, T0 + 2 * MIN);
    signIn(3);
    reload(8);
    expect(ws().sessionDeadlineTime).toBe(LEGACY_8);
  });

  it('is not given to a learner who was not on it: they start their own 25 minutes', () => {
    signIn(7);
    ws().initSession(8, false);
    expect(ws().sessionDeadlineTime).toBe(NOW + 25 * MIN);
    expect(stored(legacyMeetingDeadlineKey(8))).toBe(String(LEGACY_8));
  });
});
