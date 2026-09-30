/**
 * @vitest-environment jsdom
 *
 * A learner who signs in enters a meeting only if the lobby would call it live.
 *
 * The sign-in (Login.tsx) and the /login redirect (App.tsx RoleRouter) routed
 * on the raw record, `active && status !== 'closed'`. A meeting the teacher
 * never closed stays `active` in the database past its 45 minutes, and after
 * the teacher's 15-minute disconnect grace. A child who signed in before the
 * teacher opened today's meeting landed in yesterday's — the closed-meeting
 * screen, a fresh SESSION_START, presence "פעיל/ה במפגש N" — instead of the
 * lobby's "היום עוד לא התחלנו" (PRD Module 14 §ב0). Both now use
 * isClassSessionLive on the server clock, as the lobby hook does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => ({
  record: null as Record<string, unknown> | null,
  clockKnown: true,
  offset: 0,
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
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'k' })),
  onDisconnect: vi.fn(() => ({ set: () => Promise.resolve(), update: () => Promise.resolve(), cancel: () => Promise.resolve() })),
}));

import { Login } from '@/presentation/pages/Login';
import { readLiveMeetingNumber } from '../useActiveClassSession';
import { useAuthStore } from '../useAuthStore';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

async function signInAsLearner() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/hub" element={<div>LOBBY</div>} />
        <Route path="/workspace" element={<div>MEETING</div>} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('תלמיד'));
  fireEvent.change(await screen.findByPlaceholderText('••••••••'), { target: { value: '1234' } });
  fireEvent.click(screen.getByText('כניסה'));
}

describe('the sign-in enters a live meeting only', () => {
  beforeEach(() => {
    h.record = null;
    h.clockKnown = true;
    h.offset = 0;
    useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });
  });

  afterEach(() => cleanup());

  it("yesterday's meeting, never closed, still 'active' in the database: the lobby", async () => {
    h.record = { active: true, status: 'active', sessionNumber: 4, startedAt: Date.now() - 20 * HOUR };
    await signInAsLearner();
    await waitFor(() => expect(screen.getByText('LOBBY')).toBeTruthy());
    expect(screen.queryByText('MEETING')).toBeNull();
  });

  it("today's meeting, opened ten minutes ago: straight into it", async () => {
    h.record = { active: true, status: 'active', sessionNumber: 4, startedAt: Date.now() - 10 * MIN };
    await signInAsLearner();
    await waitFor(() => expect(screen.getByText('MEETING')).toBeTruthy());
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
