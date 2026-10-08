/**
 * @vitest-environment jsdom
 *
 * PRD Module 1 §א: "במקרה של פקיעת זמן, המערכת מאפסת את השדות למניעת מצב
 * ביניים תקוע (State Limbo)"; strict instructions: "If the server request
 * times out or fails during authentication, trigger an immediate rollback to
 * the idle state."
 *
 * The learner's handshake had no bound of its own: a server that did not
 * answer left "רגע, בודקים..." on screen for the Firebase SDK's 70 seconds.
 * Now the whole handshake has STUDENT_HANDSHAKE_TIMEOUT_MS, and past it the
 * form rolls back — the field cleared, the button free — and nobody is signed in.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => ({ callable: (() => new Promise(() => {})) as (data: unknown) => Promise<unknown> }));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  db: {},
  functions: {},
  authReady: Promise.resolve(true),
  auth: { currentUser: { isAnonymous: true, getIdToken: async () => 'token' } },
  fetchServerClockOffset: () => Promise.resolve(0),
  isServerClockKnown: () => true,
  serverNow: () => Date.now(),
}));
vi.mock('firebase/functions', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  httpsCallable: () => (data: unknown) => h.callable(data),
}));
vi.mock('firebase/database', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ref: vi.fn((_db: unknown, path = '') => ({ path })),
  get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  onValue: vi.fn(() => () => {}),
  set: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'k' })),
  onDisconnect: vi.fn(() => ({ set: () => Promise.resolve(), update: () => Promise.resolve(), cancel: () => Promise.resolve() })),
}));

import { Login, STUDENT_HANDSHAKE_TIMEOUT_MS } from '@/presentation/pages/Login';
import { useAuthStore } from '../useAuthStore';

async function fillStudentForm() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/hub" element={<div>LOBBY</div>} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('תלמיד'));
  const field = (await screen.findByPlaceholderText('••••')) as HTMLInputElement;
  fireEvent.change(field, { target: { value: '1234' } });
  return field;
}

describe('Module 1 §א — a handshake that does not answer rolls back', () => {
  beforeEach(() => {
    h.callable = () => new Promise(() => {});
    useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('is bounded well below the SDK’s 70 seconds', () => {
    // Room for a cold start of the function, still well below 70 s.
    expect(STUDENT_HANDSHAKE_TIMEOUT_MS).toBeLessThanOrEqual(25_000);
    expect(STUDENT_HANDSHAKE_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
  });

  it('a server that never answers: back to the idle form once the time is up, nobody signed in', async () => {
    const field = await fillStudentForm();
    // Timers only: the page's animation frames stay real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(screen.getByText('כניסה'));
    expect(screen.getByText('רגע, בודקים...')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(STUDENT_HANDSHAKE_TIMEOUT_MS - 100);
    });
    expect(screen.queryByText('רגע, בודקים...'), 'still waiting inside the time').not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      vi.advanceTimersByTime(400); // the 300 ms shake
    });
    expect(screen.queryByText('רגע, בודקים...')).toBeNull();
    expect(screen.getByText('כניסה')).toBeTruthy();
    expect(field.value, 'the field is cleared').toBe('');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.queryByText('LOBBY')).toBeNull();
  });

  it('a reply that lands after the rollback is taken back (no half sign-in)', async () => {
    let answer: (v: unknown) => void = () => {};
    const calls: unknown[] = [];
    h.callable = (data: unknown) => {
      calls.push(data);
      return calls.length === 1 ? new Promise((r) => { answer = r; }) : Promise.resolve({ data: {} });
    };
    await fillStudentForm();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(screen.getByText('כניסה'));
    await act(async () => {
      vi.advanceTimersByTime(STUDENT_HANDSHAKE_TIMEOUT_MS + 500);
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    await act(async () => {
      answer({ data: { success: true } });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // The second call is releaseStudentSession, with no arguments.
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({});
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('an answer inside the time signs the learner in as before', async () => {
    h.callable = () => Promise.resolve({ data: { success: true } });
    await fillStudentForm();
    fireEvent.click(screen.getByText('כניסה'));
    expect(await screen.findByText('LOBBY')).toBeTruthy();
    expect(useAuthStore.getState().isStudentAuthenticated).toBe(true);
  });
});
