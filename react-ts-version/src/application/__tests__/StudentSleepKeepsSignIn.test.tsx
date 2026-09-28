/**
 * @vitest-environment jsdom
 *
 * A sleeping or locked device does not sign the learner out.
 *
 * Register: "הטיימר הוסר עבור לומדים; חותם הנוכחות נשאר, כך שהמורה עדיין רואה
 * אותם לא פעילים, וחלון שנסגר באמת עדיין מטופל. לצוות נשאר ניתוק אחרי 30 דקות."
 * PRD Module 14 §ב1: "חל איסור מוחלט על ... ניתוק הלומד".
 *
 * Until 28.9.2026 `useIdleTimeout` stamped "window closed" on every
 * `visibilitychange: hidden`, and `isTokenExpired` also compared the presence
 * stamp. A tablet's screen lock, a laptop lid or the OS sleeping for five
 * minutes — the projector explanation, say — made the child type the code again.
 *
 * The fake clock stands in for the sleep: while a device sleeps no timer of the
 * page runs, so the clock jumps with no tick in between.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useIdleTimeout } from '../useIdleTimeout';
import {
  useAuthStore,
  STORAGE_KEY_STUDENT_WINDOW_CLOSED,
  STORAGE_KEY_STUDENT_LAST_ACTIVE,
  STORAGE_KEY_USER,
} from '../useAuthStore';

const MIN = 60 * 1000;
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

let visibility: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

function signInLearner() {
  useAuthStore.getState().setUser({ uid: 'student_user5', student_id: 5, name: 'תלמיד 5', role: 'student' } as never, 'student');
}

function signInTeacher() {
  useAuthStore.getState().setUser({ uid: 'teacher_1', name: 'מורה', email: 't@school.edu', role: 'teacher' } as never, 'teacher');
}

/** A page load: the auth store module runs its restore from storage again. */
async function reloadAuthStore() {
  vi.resetModules();
  const fresh = await import('../useAuthStore');
  return fresh.useAuthStore.getState();
}

describe('a learner whose device sleeps stays signed in', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
    localStorage.clear();
    sessionStorage.clear();
    visibility = 'visible';
    useAuthStore.getState().logout();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('hidden → 6 minutes asleep → visible: still signed in, no close stamp', () => {
    signInLearner();
    renderHook(() => useIdleTimeout(), { wrapper });

    act(() => setVisibility('hidden'));
    expect(localStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED)).toBeNull();

    // The device sleeps: the clock moves, no timer runs.
    vi.setSystemTime(Date.now() + 6 * MIN);

    act(() => setVisibility('visible'));
    // And the periodic check that runs on wake.
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().isTokenExpired()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED)).toBeNull();
  });

  it('the OS reloads the tab after a 6-minute sleep: still signed in', async () => {
    signInLearner();
    renderHook(() => useIdleTimeout(), { wrapper });
    act(() => setVisibility('hidden'));
    vi.setSystemTime(Date.now() + 6 * MIN);

    // The presence stamp is 6 minutes old, and that is all: the same tab,
    // so its sessionStorage auth record is still there.
    expect(Date.now() - Number(localStorage.getItem(STORAGE_KEY_STUDENT_LAST_ACTIVE))).toBeGreaterThanOrEqual(6 * MIN);
    expect(sessionStorage.getItem(STORAGE_KEY_USER)).not.toBeNull();
    const restored = await reloadAuthStore();
    expect(restored.isAuthenticated).toBe(true);
    expect(restored.role).toBe('student');
  });

  it('the page is shown again while still signed in, with no timer that signs out a learner sitting still', () => {
    signInLearner();
    renderHook(() => useIdleTimeout(), { wrapper });
    // An hour on screen with no touch at all (the projector, a paused meeting).
    act(() => { vi.advanceTimersByTime(60 * MIN); });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

describe('a window that really closed is still handled as today', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
    localStorage.clear();
    sessionStorage.clear();
    visibility = 'visible';
    useAuthStore.getState().logout();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('pagehide, then a reload more than 5 minutes later: signed out', async () => {
    signInLearner();
    renderHook(() => useIdleTimeout(), { wrapper });

    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(localStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED)).not.toBeNull();

    vi.setSystemTime(Date.now() + 6 * MIN);
    const restored = await reloadAuthStore();
    expect(restored.isAuthenticated).toBe(false);
  });

  it('pagehide, then a reload within 5 minutes: still signed in', async () => {
    signInLearner();
    renderHook(() => useIdleTimeout(), { wrapper });

    act(() => { window.dispatchEvent(new Event('pagehide')); });
    vi.setSystemTime(Date.now() + 2 * MIN);
    const restored = await reloadAuthStore();
    expect(restored.isAuthenticated).toBe(true);
  });

  // A close that fires no pagehide: the browser swiped away in a tablet's app
  // switcher, a crash, a dead battery. What is left is a new window (no auth
  // record in its sessionStorage) and a presence stamp that stopped.
  it('closed without pagehide, a new window more than 5 minutes later: signed out', async () => {
    signInLearner();
    const { unmount } = renderHook(() => useIdleTimeout(), { wrapper });
    unmount(); // the page is gone; no pagehide, no close stamp
    expect(localStorage.getItem(STORAGE_KEY_STUDENT_WINDOW_CLOSED)).toBeNull();

    vi.setSystemTime(Date.now() + 6 * MIN);
    sessionStorage.clear(); // a new window starts with an empty sessionStorage
    const restored = await reloadAuthStore();
    expect(restored.isAuthenticated).toBe(false);
    // And the shared device keeps nothing of the previous learner's sign-in.
    expect(localStorage.getItem(STORAGE_KEY_USER)).toBeNull();
  });

  it('a new window within 5 minutes of the last presence stamp: still signed in', async () => {
    signInLearner();
    const { unmount } = renderHook(() => useIdleTimeout(), { wrapper });
    unmount();
    vi.setSystemTime(Date.now() + 2 * MIN);
    sessionStorage.clear();
    const restored = await reloadAuthStore();
    expect(restored.isAuthenticated).toBe(true);
  });

  it('a new tab within 5 minutes, then asleep 6 minutes, then a reload: still signed in', async () => {
    signInLearner();
    const first = renderHook(() => useIdleTimeout(), { wrapper });
    first.unmount(); // the tab closes or crashes, no pagehide
    vi.setSystemTime(Date.now() + 2 * MIN);
    sessionStorage.clear(); // reopened in a new tab

    const reopened = await reloadAuthStore();
    expect(reopened.isAuthenticated).toBe(true);
    // The restored tab is now marked as this learner's.
    expect(sessionStorage.getItem(STORAGE_KEY_USER)).not.toBeNull();

    // The tablet sleeps for 6 minutes; the OS reloads the tab on wake.
    vi.setSystemTime(Date.now() + 6 * MIN);
    const afterSleep = await reloadAuthStore();
    expect(afterSleep.isAuthenticated).toBe(true);
    expect(afterSleep.role).toBe('student');
  });

  it('pagehide into the back-forward cache, back after 6 minutes: signed out', () => {
    signInLearner();
    renderHook(() => useIdleTimeout(), { wrapper });

    act(() => { window.dispatchEvent(new Event('pagehide')); });
    act(() => setVisibility('hidden'));
    vi.setSystemTime(Date.now() + 6 * MIN);
    act(() => setVisibility('visible'));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('staff keep the 30-minute idle sign-out', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
    localStorage.clear();
    sessionStorage.clear();
    visibility = 'visible';
    useAuthStore.getState().logout();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('a teacher idle for 30 minutes is signed out', () => {
    signInTeacher();
    renderHook(() => useIdleTimeout(), { wrapper });
    act(() => { vi.advanceTimersByTime(29 * MIN); });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    act(() => { vi.advanceTimersByTime(1 * MIN + 1000); });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
