/**
 * @vitest-environment jsdom
 *
 * The staff view's "איפוס זיכרון מקומי" leaves for the login only after the
 * sign-out has finished. It used to call logout() and set location.href in
 * the same tick: the page unloaded in the middle of the sign-out, and a
 * teacher's Google session stayed on the device — PRD Module 2 §ג requires
 * "מחיקת אסמכתת ההזדהות" — so the next learner on it was refused at login.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';
import { loginPage } from '../quietRecovery';
import { useAuthStore } from '@/application/useAuthStore';

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary — sign out, then leave', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('waits for logout() to settle before opening the login page', async () => {
    let finishSignOut: () => void = () => {};
    const signOut = new Promise<void>((resolve) => { finishSignOut = resolve; });
    const logout = vi.fn(() => signOut);
    useAuthStore.setState({
      user: { uid: 'teacher_1', role: 'teacher' } as never,
      role: 'teacher',
      isAuthenticated: true,
      isStudentAuthenticated: false,
      logout,
    });
    const open = vi.spyOn(loginPage, 'open').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText(/איפוס זיכרון מקומי/));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();

    await act(async () => {
      finishSignOut();
      await signOut;
    });
    expect(open).toHaveBeenCalledTimes(1);
  });
});
