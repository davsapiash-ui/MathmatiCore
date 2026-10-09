/**
 * @vitest-environment jsdom
 *
 * PRD Module 1 §א, "התוצאה הצפויה": "המכשיר שנכנס אחרון הוא הפעיל, והמכשיר
 * הקודם עובר למצב קריאה בלבד עם ההודעה "המשכתם במכשיר אחר"". The lobby
 * checks the claim the sign-in made, never makes one on a page load, and once
 * another device signed in it shows the notice, does not swap into the
 * station and writes nothing more to the learner's record.
 *
 * PRD Module 6 (Strict): "Keep local Zustand state updated with the latest
 * session ID fetched from the authoritative server state".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

type Snap = { exists: () => boolean; val: () => unknown };
const h = vi.hoisted(() => ({
  session: { active: false, status: 'closed', sessionNumber: null as number | null, lastMeeting: null as number | null, isLoaded: true },
  recordListeners: [] as Array<(s: Snap) => void>,
  writes: [] as Array<{ path: string; payload: Record<string, unknown> }>,
}));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  auth: { currentUser: null },
  authReady: Promise.resolve(false),
  serverNow: () => Date.now(),
  fetchServerClockOffset: () => Promise.resolve(0),
  isServerClockKnown: () => true,
}));
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path = '') => ({ path }),
  onValue: (r: { path: string }, cb: (s: Snap) => void) => {
    if (r.path.startsWith('users/students/')) h.recordListeners.push(cb);
    return () => {
      h.recordListeners = h.recordListeners.filter((l) => l !== cb);
    };
  },
  onDisconnect: () => ({ set: () => Promise.resolve(), cancel: () => Promise.resolve() }),
  serverTimestamp: () => 0,
  get: () => Promise.resolve({ exists: () => false, val: () => null }),
  update: () => Promise.resolve(),
}));
vi.mock('@/infrastructure/services/ThrottledRtdbWriter', () => ({
  throttledRtdbUpdate: (path: string, payload: Record<string, unknown>, options?: { guard?: () => boolean }) => {
    if (!options?.guard || options.guard()) h.writes.push({ path, payload });
    return Promise.resolve();
  },
  rtdbUpdateNow: (path: string, payload: Record<string, unknown>) => {
    h.writes.push({ path, payload });
    return Promise.resolve();
  },
}));
vi.mock('@/infrastructure/services/FirebaseSyncService', () => ({
  acknowledgeTeacherReset: () => {},
  firebaseSyncService: { getLocalSessionProgress: () => null },
}));
vi.mock('@/application/useActiveClassSession', () => ({ useActiveClassSession: () => h.session }));
vi.mock('@/application/useProjectorMode', () => ({ useProjectorMode: () => false }));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({ UdlSpeechButton: () => null }));

import { StudentHub } from '@/presentation/pages/StudentHub';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { getDeviceId } from '@/infrastructure/services/telemetryStamp';
import { decideDeviceOwnership, isPerLoadDeviceId } from '@/application/deviceOwnership';

const open = () =>
  render(
    <MemoryRouter initialEntries={['/hub']}>
      <Routes>
        <Route path="/hub" element={<StudentHub />} />
        <Route path="/workspace" element={<div data-testid="workspace" />} />
      </Routes>
    </MemoryRouter>
  );
const record = (val: unknown) =>
  act(() => {
    for (const l of [...h.recordListeners]) l({ exists: () => val !== null, val: () => val });
  });
const claims = () => h.writes.filter((w) => 'active_device_id' in w.payload);
const onlineWrites = () => h.writes.filter((w) => w.payload.isOnline === true);

beforeEach(() => {
  h.recordListeners = [];
  h.writes = [];
  h.session = { active: false, status: 'closed', sessionNumber: null, lastMeeting: null, isLoaded: true };
  useWorkspaceStore.getState().setSupersededByOtherDevice(false);
  useWorkspaceStore.getState().setLobbySessionId(null);
  useAuthStore.setState({
    user: { uid: 'student_user3', student_id: 3, role: 'student' } as never,
    role: 'student',
    isAuthenticated: true,
    isStudentAuthenticated: true,
  });
});
afterEach(() => cleanup());

describe('Module 1 §א — the lobby follows the sign-in that came last', () => {
  it('the record names this browser: the lobby works, and the page load writes no claim', () => {
    h.session = { active: true, status: 'active', sessionNumber: 4, lastMeeting: null, isLoaded: true };
    open();
    record({ active_device_id: getDeviceId() });
    expect(screen.queryByTestId('device-superseded')).toBeNull();
    expect(screen.getByTestId('workspace')).toBeTruthy();
    expect(claims()).toEqual([]);
  });

  it('another device signed in after this one: "המשכתם במכשיר אחר", no swap into the station, no claim, no presence', () => {
    h.session = { active: true, status: 'active', sessionNumber: 4, lastMeeting: null, isLoaded: true };
    open();
    h.writes = [];
    record({ active_device_id: 'othertabletsignedinlater' });
    expect(screen.getByTestId('device-superseded').textContent).toContain('המשכתם במכשיר אחר');
    expect(screen.getByTestId('device-superseded').textContent).toContain('העבודה שלכם נשמרה. אם לא עברתם למכשיר אחר, קראו למורה.');
    expect(screen.queryByTestId('workspace')).toBeNull();
    expect(useWorkspaceStore.getState().isSupersededByOtherDevice).toBe(true);
    expect(claims()).toEqual([]);
    expect(onlineWrites()).toEqual([]);
  });

  it('a lobby that is taken over while open stops writing presence', async () => {
    vi.useFakeTimers();
    try {
      open();
      record({ active_device_id: getDeviceId() });
      expect(onlineWrites().length).toBeGreaterThan(0);
      h.writes = [];
      record({ active_device_id: 'othertabletsignedinlater' });
      await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
      expect(onlineWrites()).toEqual([]);
      expect(h.writes.filter((w) => w.payload.isOnline === false)).toEqual([]);
      expect(screen.getByTestId('device-superseded')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a record claimed by an older build (a per-load id) is claimed for this browser, not locked', () => {
    open();
    record({ active_device_id: 'dev_k3j9x2a_1759000000000' });
    expect(screen.queryByTestId('device-superseded')).toBeNull();
    expect(claims().map((c) => c.payload.active_device_id)).toEqual([getDeviceId()]);
  });
});

describe('decideDeviceOwnership', () => {
  it('no device named: neither locked nor claimed', () => {
    expect(decideDeviceOwnership(null, 'abcdefghijkl')).toEqual({ superseded: false, claim: false });
    expect(decideDeviceOwnership('', 'abcdefghijkl')).toEqual({ superseded: false, claim: false });
  });
  it('this device: not locked; another: locked; a per-load id: claimed', () => {
    expect(decideDeviceOwnership('abcdefghijkl', 'abcdefghijkl')).toEqual({ superseded: false, claim: false });
    expect(decideDeviceOwnership('zyxwvutsrqpo', 'abcdefghijkl')).toEqual({ superseded: true, claim: false });
    expect(decideDeviceOwnership('dev_k3j9x2a_1759000000000', 'abcdefghijkl')).toEqual({ superseded: false, claim: true });
  });
  it("this browser's stable id is never mistaken for a per-load one", () => {
    expect(isPerLoadDeviceId(getDeviceId())).toBe(false);
  });
});

describe('Module 6 — the live session number is in the store', () => {
  it('follows the broadcast, and clears when no session is live', () => {
    h.session = { active: true, status: 'active', sessionNumber: 5, lastMeeting: null, isLoaded: true };
    const view = open();
    expect(useWorkspaceStore.getState().lobbySessionId).toBe(5);
    h.session = { active: false, status: 'closed', sessionNumber: null, lastMeeting: 5, isLoaded: true };
    view.rerender(
      <MemoryRouter initialEntries={['/hub']}>
        <Routes>
          <Route path="/hub" element={<StudentHub />} />
        </Routes>
      </MemoryRouter>
    );
    expect(useWorkspaceStore.getState().lobbySessionId).toBeNull();
  });
});
