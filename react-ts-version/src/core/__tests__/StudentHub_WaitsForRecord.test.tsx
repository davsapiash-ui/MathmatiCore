/**
 * @vitest-environment jsdom
 *
 * Review S2 / RS2 / RN1 (9.10.2026): the lobby's sentence and its swap to the
 * station depend on the learner's own finished mark, so nothing is shown and
 * nothing swaps until the record has answered — and a failed read releases the
 * lobby as before (never a blank lobby for ever). The lobby reads "at the
 * optional exercises" from the newer of the record's and the device's copy,
 * as the workspace does on entry.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

type Snap = { exists: () => boolean; val: () => unknown };
const h = vi.hoisted(() => ({
  session: { active: false, status: 'closed', sessionNumber: null as number | null, lastMeeting: 4 as number | null, isLoaded: true },
  onRecord: null as null | ((s: Snap) => void),
  onError: null as null | ((e: unknown) => void),
  deviceCopy: null as Record<string, unknown> | null,
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
  onValue: (r: { path: string }, cb: (s: Snap) => void, err?: (e: unknown) => void) => {
    if (r.path.startsWith('users/students/')) {
      h.onRecord = cb;
      h.onError = err ?? null;
    }
    return () => {};
  },
  onDisconnect: () => ({ set: () => Promise.resolve(), cancel: () => Promise.resolve() }),
  serverTimestamp: () => 0,
  get: () => Promise.resolve({ exists: () => false, val: () => null }),
  update: () => Promise.resolve(),
}));
vi.mock('@/infrastructure/services/ThrottledRtdbWriter', () => ({
  throttledRtdbUpdate: () => Promise.resolve(),
  rtdbUpdateNow: () => Promise.resolve(),
}));
vi.mock('@/infrastructure/services/FirebaseSyncService', () => ({
  acknowledgeTeacherReset: () => {},
  firebaseSyncService: { getLocalSessionProgress: () => h.deviceCopy },
}));
vi.mock('@/application/useActiveClassSession', () => ({ useActiveClassSession: () => h.session }));
vi.mock('@/application/useProjectorMode', () => ({ useProjectorMode: () => false }));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({ UdlSpeechButton: () => null }));

import { StudentHub } from '@/presentation/pages/StudentHub';
import { useAuthStore } from '@/application/useAuthStore';

const open = () =>
  render(
    <MemoryRouter initialEntries={['/hub']}>
      <Routes>
        <Route path="/hub" element={<StudentHub />} />
        <Route path="/workspace" element={<div data-testid="workspace" />} />
      </Routes>
    </MemoryRouter>
  );
const record = (val: unknown) => act(() => h.onRecord?.({ exists: () => val !== null, val: () => val }));

beforeEach(() => {
  h.onRecord = null;
  h.onError = null;
  h.deviceCopy = null;
  h.session = { active: false, status: 'closed', sessionNumber: null, lastMeeting: 4, isLoaded: true };
  useAuthStore.setState({
    user: { uid: 'student_user3', student_id: 3, role: 'student' } as never,
    role: 'student',
    isAuthenticated: true,
    isStudentAuthenticated: true,
  });
});
afterEach(() => cleanup());

describe('S2 — no sentence until the record answers', () => {
  it('closed station, finished: blank, then the finished sentence — never "היום עוד לא התחלנו" first', () => {
    open();
    expect(screen.queryByTestId('lobby-waiting')).toBeNull();
    record({ completedMeetings: { m4: 1 } });
    expect(screen.getByTestId('lobby-waiting').textContent).toContain('סיימתם את התחנה.');
  });

  it('an active station: no swap until the record answers; finished → the sentence, not the workspace', () => {
    h.session = { active: true, status: 'active', sessionNumber: 4, lastMeeting: null, isLoaded: true };
    open();
    expect(screen.queryByTestId('workspace')).toBeNull();
    record({ completedMeetings: { m4: 1 } });
    expect(screen.queryByTestId('workspace')).toBeNull();
    expect(screen.getByTestId('lobby-waiting').textContent).toContain('סיימתם את התחנה.');
  });

  it('RS2: a failed read releases the lobby (the record unknown reads as not finished)', () => {
    h.session = { active: true, status: 'active', sessionNumber: 4, lastMeeting: null, isLoaded: true };
    open();
    expect(screen.queryByTestId('workspace')).toBeNull();
    act(() => h.onError?.(new Error('permission_denied')));
    expect(screen.getByTestId('workspace')).toBeTruthy();
  });
});

describe('RN1 — the newer of the record and the device copy decides "at the optional exercises"', () => {
  it('the record still says task, the device copy is on the choice screen: back to the station', () => {
    h.session = { active: true, status: 'active', sessionNumber: 4, lastMeeting: null, isLoaded: true };
    h.deviceCopy = { sessionNumber: 4, flowStatus: 'choice_branch', savedAt: 200 };
    open();
    record({ completedMeetings: { m4: 1 }, workspaceByMeeting: { m4: { sessionNumber: 4, flowStatus: 'task', savedAt: 100 } } });
    expect(screen.getByTestId('workspace')).toBeTruthy();
  });
});
