/**
 * @vitest-environment jsdom
 *
 * PRD Module 1 §א, Screen 2: a successful sign-in "מעביר ללובי התלמיד" — always
 * the lobby, never straight into a meeting. A live meeting is the lobby's to
 * open: it swaps in place to the station's opening screen (Module 6).
 *
 * Module 1 §א, "התוצאה הצפויה": "המכשיר שנכנס אחרון הוא הפעיל" — the sign-in,
 * and only the sign-in, claims the learner for this browser's one stable id.
 *
 * Module 1 (Strict): "'Student' routes strictly to Screen 2 ('/auth')".
 *
 * readLiveMeetingNumber (the lobby's test on the server clock) keeps its own
 * tests below.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => ({
  record: null as Record<string, unknown> | null,
  clockKnown: true,
  offset: 0,
  updates: [] as Array<{ path: string; payload: Record<string, unknown> }>,
}));

// A full stub, not importOriginal: the real module re-exports FirebaseSyncService,
// whose imports reach core/classSession while the mock is still being built, and
// classSession would then bind the real serverNow.
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  db: {},
  functions: {},
  authReady: Promise.resolve(true),
  auth: { currentUser: { isAnonymous: true, getIdToken: async () => 'token' } },
  fetchServerClockOffset: () => Promise.resolve(h.offset),
  isServerClockKnown: () => h.clockKnown,
  serverNow: () => Date.now() + h.offset,
}));
vi.mock('firebase/functions', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  httpsCallable: () => () => Promise.resolve({ data: { ok: true } }),
}));
vi.mock('firebase/database', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ref: vi.fn((_db: unknown, path = '') => ({ path })),
  get: vi.fn((r: { path: string }) =>
    Promise.resolve(
      r.path === 'active_class_session'
        ? { exists: () => h.record !== null, val: () => h.record }
        : { exists: () => false, val: () => null }
    )
  ),
  onValue: vi.fn(() => () => {}),
  set: vi.fn(() => Promise.resolve()),
  update: vi.fn((r: { path: string }, payload: Record<string, unknown>) => {
    h.updates.push({ path: r.path, payload });
    return Promise.resolve();
  }),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
  remove: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'k' })),
  onDisconnect: vi.fn(() => ({ set: () => Promise.resolve(), update: () => Promise.resolve(), cancel: () => Promise.resolve() })),
}));

import { Login } from '@/presentation/pages/Login';
import { readLiveMeetingNumber } from '../useActiveClassSession';
import { useAuthStore } from '../useAuthStore';
import { getDeviceId } from '@/infrastructure/services/telemetryStamp';

const MIN = 60 * 1000;

async function signInAsLearner() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth" element={<Login studentForm />} />
        <Route path="/hub" element={<div>LOBBY</div>} />
        <Route path="/workspace" element={<div>MEETING</div>} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('תלמיד'));
  fireEvent.change(await screen.findByPlaceholderText('••••'), { target: { value: '1234' } });
  fireEvent.click(screen.getByText('כניסה'));
}

describe('the sign-in goes to the lobby', () => {
  beforeEach(() => {
    h.record = null;
    h.clockKnown = true;
    h.offset = 0;
    h.updates = [];
    useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });
  });

  afterEach(() => cleanup());

  it("'תלמיד' on Screen 1 opens Screen 2 at '/auth'", async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth" element={<div>AUTH<Login studentForm /></div>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('תלמיד'));
    expect(await screen.findByText('כניסת תלמידים')).toBeTruthy();
    expect(screen.getByText(/AUTH/)).toBeTruthy();
  });

  it("'חזרה לתפריט' on Screen 2 goes back to Screen 1", async () => {
    render(
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/login" element={<div>ROLES</div>} />
          <Route path="/auth" element={<Login studentForm />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByText(/חזרה לתפריט/));
    expect(await screen.findByText('ROLES')).toBeTruthy();
  });

  it('no meeting live: the lobby', async () => {
    await signInAsLearner();
    await waitFor(() => expect(screen.getByText('LOBBY')).toBeTruthy());
  });

  it("today's meeting live: still the lobby, which opens it in place", async () => {
    h.record = { active: true, status: 'active', sessionNumber: 4, startedAt: Date.now() - 10 * MIN };
    await signInAsLearner();
    await waitFor(() => expect(screen.getByText('LOBBY')).toBeTruthy());
    expect(screen.queryByText('MEETING')).toBeNull();
  });

  it("claims the learner for this browser's stable device id", async () => {
    await signInAsLearner();
    await waitFor(() => expect(screen.getByText('LOBBY')).toBeTruthy());
    const claims = h.updates.filter((u) => u.path === 'users/students/student_user1' && 'active_device_id' in u.payload);
    expect(claims).toHaveLength(1);
    expect(claims[0].payload.active_device_id).toBe(getDeviceId());
  });
});

describe('readLiveMeetingNumber — the lobby’s test, on the server clock', () => {
  beforeEach(() => {
    h.record = null;
    h.clockKnown = true;
    h.offset = 0;
  });

  it('no record, or a closed one: the lobby', async () => {
    expect(await readLiveMeetingNumber()).toBeNull();
    h.record = { active: false, status: 'closed', sessionNumber: null };
    expect(await readLiveMeetingNumber()).toBeNull();
  });

  it('a live meeting, paused included: its number', async () => {
    h.record = { active: true, status: 'paused', sessionNumber: 6, startedAt: Date.now() - 5 * MIN };
    expect(await readLiveMeetingNumber()).toBe(6);
  });

  it('past the 45-minute cap: the lobby', async () => {
    h.record = { active: true, status: 'active', sessionNumber: 3, startedAt: Date.now() - 46 * MIN };
    expect(await readLiveMeetingNumber()).toBeNull();
  });

  it('the teacher gone longer than the 15-minute grace: the lobby', async () => {
    h.record = { active: true, sessionNumber: 3, startedAt: Date.now() - 20 * MIN, teacherDisconnectedAt: Date.now() - 16 * MIN };
    expect(await readLiveMeetingNumber()).toBeNull();
  });

  it('judged on the server clock, not the device clock', async () => {
    // The device runs 30 minutes slow: by the server the meeting is 50 minutes old.
    h.offset = 30 * MIN;
    h.record = { active: true, sessionNumber: 3, startedAt: Date.now() + h.offset - 50 * MIN };
    expect(await readLiveMeetingNumber()).toBeNull();
  });

  it('server clock not reported yet: no time limit decided, as in the lobby', async () => {
    h.clockKnown = false;
    h.record = { active: true, sessionNumber: 3, startedAt: Date.now() - 46 * MIN };
    expect(await readLiveMeetingNumber()).toBe(3);
  });

  it('a meeting number outside 1–8 is not entered', async () => {
    h.record = { active: true, sessionNumber: 9, startedAt: Date.now() - MIN };
    expect(await readLiveMeetingNumber()).toBeNull();
  });
});
