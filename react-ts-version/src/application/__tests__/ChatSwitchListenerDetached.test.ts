/**
 * @vitest-environment jsdom
 *
 * The chat on/off switch listener (system_control/globalChatEnabled) is
 * detached like the chat listener itself.
 *
 * initSync attached it again for every new identity and never removed it, so a
 * shared tablet collected one live listener per learner who signed in on it,
 * each kept after sign-out — database traffic and callbacks for sessions that
 * had ended (Module 22: the chat belongs to the signed-in session).
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => {
  const live = new Map<number, string>();
  let next = 0;
  return {
    live,
    onValue: vi.fn((ref: { path: string }) => {
      const id = next++;
      live.set(id, ref.path);
      return () => { live.delete(id); };
    }),
    attached: (path: string) => [...live.values()].filter((p) => p === path).length,
  };
});

vi.mock('firebase/database', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ref: vi.fn((_db: unknown, path = '') => ({ path })),
  onValue: h.onValue,
  set: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'k' })),
  get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
}));

import { useChatStore } from '../useChatStore';
import { useAuthStore } from '../useAuthStore';

const SWITCH = 'system_control/globalChatEnabled';

function signedIn(uid: string, role: 'teacher' | 'student') {
  useAuthStore.setState({
    user: { uid, role } as never,
    role,
    isAuthenticated: true,
    isStudentAuthenticated: role === 'student',
  });
}

describe('chat switch listener', () => {
  it('one per session: replaced on a new identity, removed on sign-out', async () => {
    // Let the store's deferred auth subscription attach, as it does in the app.
    await new Promise((r) => setTimeout(r, 150));

    signedIn('student_user2', 'student');
    useChatStore.getState().initSync();
    expect(h.attached(SWITCH)).toBe(1);

    signedIn('student_user7', 'student');
    useChatStore.getState().initSync();
    expect(h.attached(SWITCH)).toBe(1);

    useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });
    expect(h.attached(SWITCH)).toBe(0);
    expect([...h.live.values()].filter((p) => p.startsWith('chat_messages'))).toEqual([]);
  });
});
