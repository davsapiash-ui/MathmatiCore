/**
 * @vitest-environment jsdom
 *
 * users/students holds the twelve learners only (PRD: student_id 1–12; Module 3,
 * zero-PII). A teacher may open /hub (App.tsx lets her into the lobby), and the
 * lobby derived its record from normalizeStudentId(uid), which keeps a
 * 'teacher_…' id as it is: its presence heartbeat then wrote — every four
 * seconds, with onDisconnect hooks — a thirteenth "learner" under
 * users/students/teacher_<id>, which travelled into the research backups. The
 * same write was already stopped on sign-out (unifiedLogout).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  writes: [] as string[],
  listened: [] as string[],
  disconnects: [] as string[],
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
  onValue: (r: { path: string }) => {
    h.listened.push(r.path);
    return () => {};
  },
  onDisconnect: (r: { path: string }) => {
    h.disconnects.push(r.path);
    return { set: () => Promise.resolve(), cancel: () => Promise.resolve() };
  },
  serverTimestamp: () => 0,
  get: () => Promise.resolve({ exists: () => false, val: () => null }),
  update: () => Promise.resolve(),
}));
vi.mock('@/infrastructure/services/ThrottledRtdbWriter', () => ({
  throttledRtdbUpdate: (path: string) => {
    h.writes.push(path);
    return Promise.resolve();
  },
  rtdbUpdateNow: (path: string) => {
    h.writes.push(path);
    return Promise.resolve();
  },
}));
vi.mock('@/infrastructure/services/FirebaseSyncService', () => ({ acknowledgeTeacherReset: () => {} }));
vi.mock('@/application/useActiveClassSession', () => ({
  useActiveClassSession: () => ({ active: false, status: 'closed', sessionNumber: null, isLoaded: true }),
}));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({ UdlSpeechButton: () => null }));

import { StudentHub } from '@/presentation/pages/StudentHub';
import { useAuthStore } from '@/application/useAuthStore';

const open = () =>
  render(
    <MemoryRouter initialEntries={['/hub']}>
      <StudentHub />
    </MemoryRouter>
  );

beforeEach(() => {
  h.writes = [];
  h.listened = [];
  h.disconnects = [];
});
afterEach(() => cleanup());

describe('the lobby writes the learner record of a learner only', () => {
  it('a teacher on /hub: nothing under users/students', () => {
    useAuthStore.setState({
      user: { uid: 'teacher_1002220159', role: 'teacher', email: 't@school.edu' } as never,
      role: 'teacher',
      isAuthenticated: true,
      isStudentAuthenticated: false,
    });
    open();
    const touched = [...h.writes, ...h.listened, ...h.disconnects].filter((p) => p.startsWith('users/students'));
    expect(touched).toEqual([]);
  });

  it('a learner: presence on their own record, as before', () => {
    useAuthStore.setState({
      user: { uid: 'student_user3', student_id: 3, role: 'student' } as never,
      role: 'student',
      isAuthenticated: true,
      isStudentAuthenticated: true,
    });
    open();
    expect(h.writes).toContain('users/students/student_user3');
    expect(h.listened).toContain('users/students/student_user3');
    expect(h.disconnects).toContain('users/students/student_user3/isOnline');
  });
});
