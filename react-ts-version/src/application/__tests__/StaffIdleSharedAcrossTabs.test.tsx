/**
 * @vitest-environment jsdom
 *
 * The 30-minute staff idle limit counts activity in every tab of the browser.
 *
 * Register: "לצוות נשאר ניתוק אחרי 30 דקות". A staff sign-out signs every tab
 * out of Firebase (one Firebase user per browser profile), but the timer ran
 * per tab: the projector window, untouched on the classroom board for half an
 * hour, signed the teacher out of the dashboard she was working in. Each tab
 * now stamps its activity in localStorage, and a tab whose timer runs out
 * first checks the stamp.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useIdleTimeout } from '../useIdleTimeout';
import { useAuthStore, STORAGE_KEY_STAFF_LAST_ACTIVE } from '../useAuthStore';

const MIN = 60 * 1000;
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

function signInTeacher() {
  useAuthStore.getState().setUser(
    { uid: 'teacher_1', name: 'מורה', email: 't@school.edu', role: 'teacher', whitelistVerified: true } as never,
    'teacher'
  );
}

/** Another tab of the same browser was used just now. */
function activityInAnotherTab() {
  localStorage.setItem(STORAGE_KEY_STAFF_LAST_ACTIVE, String(Date.now()));
}

describe('staff idle limit: the browser’s, not the tab’s', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.getState().logout();
    signInTeacher();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('an untouched tab does not sign out while another tab is in use', () => {
    renderHook(() => useIdleTimeout(), { wrapper }); // the projector window

    act(() => { vi.advanceTimersByTime(20 * MIN); });
    activityInAnotherTab(); // the teacher works in the dashboard

    act(() => { vi.advanceTimersByTime(11 * MIN); }); // 31 minutes untouched here
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // 30 minutes after the last activity anywhere: signed out.
    act(() => { vi.advanceTimersByTime(20 * MIN); });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('30 minutes with no activity in any tab still signs staff out', () => {
    renderHook(() => useIdleTimeout(), { wrapper });
    act(() => { vi.advanceTimersByTime(29 * MIN); });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    act(() => { vi.advanceTimersByTime(2 * MIN); });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('activity in this tab is stamped for the others', () => {
    renderHook(() => useIdleTimeout(), { wrapper });
    act(() => { vi.advanceTimersByTime(10 * MIN); });
    act(() => { window.dispatchEvent(new Event('keydown')); });
    expect(Number(localStorage.getItem(STORAGE_KEY_STAFF_LAST_ACTIVE))).toBe(Date.now());
  });
});
