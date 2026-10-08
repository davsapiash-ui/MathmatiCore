/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, act, waitFor } from '@testing-library/react';
import type { FakeRealtimeDatabase } from '@/features/workspace/__tests__/fakeRealtimeDatabase';

/**
 * PRD Module 17 §ב: "המורה רואה את מספרם בכרטיס הלומד תחת 'אירועים שנדחו'".
 * Each of the learner's devices writes its own count under
 * users/students/student_user{N}/refusedEvents/{device_id} (Module 1 §א: a
 * previous device keeps sending its queue); the teacher's tile shows the sum.
 */

const h = vi.hoisted(() => ({ db: null as unknown as FakeRealtimeDatabase }));

vi.mock('firebase/database', async () => {
  const mod = await import('@/features/workspace/__tests__/fakeRealtimeDatabase');
  return mod.firebaseDatabaseModule(() => (h.db ??= new mod.FakeRealtimeDatabase()));
});
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
  authReady: Promise.resolve(),
  serverNow: () => Date.now(),
  isServerClockKnown: () => true,
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => vi.fn()),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})) }));

import { HeatmapGrid, refusedEventsOf } from '../HeatmapGrid';

afterEach(() => {
  cleanup();
  h.db?.reset();
});

const learner = (over: Record<string, unknown> = {}) => ({
  isOnline: true, onlineStatus: 'active', lastPing: Date.now(), workspaceState: {}, ...over,
});

describe('"אירועים שנדחו" reaches the teacher\'s tile', () => {
  it('sums every device of the learner; nothing is shown at 0', async () => {
    render(<HeatmapGrid />);
    act(() => {
      h.db.set('active_class_session', { active: true, status: 'active', sessionNumber: 4, startedAt: Date.now() });
      h.db.set('users/students/student_user3', learner({ refusedEvents: { abcdefghijklmnopqrstuvwx: 2, zyxwvutsrqponmlkjihgfedc: 1 } }));
      h.db.set('users/students/student_user4', learner());
    });
    await waitFor(() => expect(screen.getByTestId('refused-events-3').textContent).toBe('אירועים שנדחו: 3'));
    expect(screen.queryByTestId('refused-events-4')).toBeNull();

    // The devices deliver what was refused and remove their counts.
    act(() => {
      h.db.update('users/students/student_user3', {
        'refusedEvents/abcdefghijklmnopqrstuvwx': null,
        'refusedEvents/zyxwvutsrqponmlkjihgfedc': null,
        lastPing: Date.now(),
      });
    });
    await waitFor(() => expect(screen.queryByTestId('refused-events-3')).toBeNull());
  });

  it('refusedEventsOf: a per-device map is summed; anything else counts 0', () => {
    expect(refusedEventsOf({ refusedEvents: { a: 2, b: 5 } })).toBe(7);
    expect(refusedEventsOf({ refusedEvents: { a: -1, b: 'x', c: 1.5, d: 4 } })).toBe(4);
    expect(refusedEventsOf({})).toBe(0);
    expect(refusedEventsOf(null)).toBe(0);
  });
});
