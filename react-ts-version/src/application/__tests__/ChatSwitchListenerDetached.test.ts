/**
 * @vitest-environment jsdom
 *
 * The chat has no on/off switch: the PRD does not ask for one, no screen
 * writes system_control/globalChatEnabled and the database rules let nobody
 * write it. The store used to listen on that path all the same — one more
 * live listener per signed-in learner, for a value that could never change.
 *
 * The chat listener itself stays one per session: replaced on a new identity,
 * removed on sign-out (Module 22: the chat belongs to the signed-in session).
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => {
  const live = new Map<number, string>();
  const everAttached: string[] = [];
  let next = 0;
  return {
    live,
    everAttached,
    onValue: vi.fn((ref: { path: string }) => {
      const id = next++;
      live.set(id, ref.path);
      everAttached.push(ref.path);
      return () => { live.delete(id); };
    }),
    chatListeners: () => [...live.values()].filter((p) => p.startsWith('chat_messages')),
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

describe('chat listeners', () => {
  it('one chat listener per session, and none on the switch that does not exist', async () => {
    // Let the store's deferred auth subscription attach, as it does in the app.
    await new Promise((r) => setTimeout(r, 150));

    signedIn('student_user2', 'student');
    useChatStore.getState().initSync();
    expect(h.chatListeners()).toEqual(['chat_messages/student_user2']);

    signedIn('student_user7', 'student');
    useChatStore.getState().initSync();
    expect(h.chatListeners()).toEqual(['chat_messages/student_user7']);

    useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });
    expect(h.chatListeners()).toEqual([]);

    expect(h.everAttached).not.toContain(SWITCH);
    expect(useChatStore.getState().globalChatEnabled).toBe(true);
  });
});
