/**
 * @vitest-environment jsdom
 *
 * מסמך העיצוב §1.3 — "מצב שקט חזותי" follows the learner who is signed in.
 *
 * App renders useQuietMode() once per page load. The hook used to read the
 * learner id once (currentStudentUid()), so on a page opened before the
 * learner signed in — the way every child starts — the id stayed '' and the
 * lobby and the waiting screens were never quiet until a reload, even with
 * isASD: true on the learner's record (reset live audit, 2.10.2026). These
 * tests mount first and sign in afterwards, as on the real login screen.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MotionConfig, useReducedMotionConfig } from 'framer-motion';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useAuthStore, studentUidOf, currentStudentUid } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { useQuietMode } from '@/hooks/useQuietMode';

/** What the overlays of the waiting screens read (SessionPausedOverlay & co.). */
function MotionProbe() {
  const reduce = useReducedMotionConfig();
  return <span data-testid="motion">{reduce ? 'reduced' : 'full'}</span>;
}

/** The App wiring (App.tsx): the hook's value drives the app-wide MotionConfig. */
function Shell() {
  const isQuiet = useQuietMode();
  return (
    <MotionConfig reducedMotion={isQuiet ? 'always' : 'user'}>
      <MotionProbe />
    </MotionConfig>
  );
}

const html = () => document.documentElement.getAttribute('data-quiet');

function signInLearner(n: number) {
  act(() => {
    useAuthStore.setState({
      user: { uid: `student_user${n}`, student_id: String(n), role: 'student' } as never,
      role: 'student',
      isAuthenticated: true,
      isStudentAuthenticated: true,
    });
  });
}

function signOut() {
  act(() => {
    useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });
    useStore.getState().logout();
  });
}

/** The learner's own record listener (FirebaseSyncService.startSync) merging isASD into useStore. */
function recordArrives(n: number, isASD: boolean) {
  act(() => {
    const students = useStore.getState().students;
    const id = `student_user${n}`;
    useStore.setState({ students: { ...students, [id]: { ...(students[id] || {}), isASD } as never } });
  });
}

beforeEach(() => signOut());
afterEach(() => {
  cleanup();
  signOut();
  document.documentElement.removeAttribute('data-quiet');
});

describe('quiet mode follows the learner signed in on this page', () => {
  it('mounted signed out, the learner signs in, the record says isASD: quiet everywhere', () => {
    const { getByTestId } = render(<Shell />);
    expect(html()).toBeNull();
    expect(getByTestId('motion').textContent).toBe('full');

    signInLearner(5);
    recordArrives(5, true);

    expect(html()).toBe('true');
    expect(getByTestId('motion').textContent).toBe('reduced');
  });

  it('the record arriving before the sign-in finishes counts too', () => {
    const { getByTestId } = render(<Shell />);
    recordArrives(2, true);
    expect(html()).toBeNull();

    signInLearner(2);
    expect(html()).toBe('true');
    expect(getByTestId('motion').textContent).toBe('reduced');
  });

  it('the teacher turns it on and off while the learner waits in the lobby', () => {
    render(<Shell />);
    signInLearner(3);
    recordArrives(3, false);
    expect(html()).toBeNull();

    recordArrives(3, true);
    expect(html()).toBe('true');

    recordArrives(3, false);
    expect(html()).toBeNull();
  });

  it('signing out removes it', () => {
    const { getByTestId } = render(<Shell />);
    signInLearner(5);
    recordArrives(5, true);
    expect(html()).toBe('true');

    signOut();
    expect(html()).toBeNull();
    expect(getByTestId('motion').textContent).toBe('full');
  });

  it('learner A signs out and learner B signs in on the same tab: B’s own flag', () => {
    const { getByTestId } = render(<Shell />);
    signInLearner(1);
    recordArrives(1, true);
    expect(html()).toBe('true');

    signOut();
    signInLearner(4);
    recordArrives(4, false);
    expect(html()).toBeNull();
    expect(getByTestId('motion').textContent).toBe('full');

    // and the other way round: a quiet B after a non-quiet A
    signOut();
    signInLearner(6);
    recordArrives(6, true);
    expect(html()).toBe('true');
    expect(getByTestId('motion').textContent).toBe('reduced');
  });

  it('a staff user is never a learner', () => {
    render(<Shell />);
    act(() => {
      useAuthStore.setState({ user: { uid: 'Xk9aTeacherUid42', role: 'teacher' } as never, role: 'teacher', isAuthenticated: true });
    });
    recordArrives(1, true);
    expect(html()).toBeNull();
  });
});

describe('studentUidOf', () => {
  it('is the pure form of currentStudentUid', () => {
    expect(studentUidOf(null)).toBe('');
    expect(studentUidOf({ uid: 'student_user7' } as never)).toBe('student_user7');
    expect(studentUidOf({ uid: 'anon-xyz', student_id: '9' } as never)).toBe('student_user9');
    expect(studentUidOf({ uid: 'student_user13' } as never)).toBe('');
    signInLearner(8);
    expect(currentStudentUid()).toBe(studentUidOf(useAuthStore.getState().user));
  });
});

describe('the wiring that makes it app-wide', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');
  it('App drives the app-wide MotionConfig from useQuietMode', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/const isQuiet = useQuietMode\(\);/);
    expect(app).toMatch(/<MotionConfig reducedMotion=\{isQuiet \? 'always' : 'user'\}>/);
  });
});
