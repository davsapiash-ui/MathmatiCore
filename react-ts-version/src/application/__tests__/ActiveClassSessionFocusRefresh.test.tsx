/**
 * @vitest-environment jsdom
 *
 * Module 14: the learner's screen follows the class's meeting. Besides the
 * realtime listener, the hook re-reads the record every 15 seconds and when
 * the tab becomes visible again. A window that regains focus without its tab
 * ever being hidden raises no visibilitychange, so it re-reads on focus too —
 * and stops listening once the screen is gone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ reads: 0 }));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  auth: {},
  authReady: Promise.resolve(true),
  fetchServerClockOffset: () => Promise.resolve(0),
  isServerClockKnown: () => true,
  serverNow: () => Date.now(),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: unknown, path = '') => ({ path })),
  onValue: vi.fn(() => () => {}),
  get: vi.fn(() => {
    h.reads++;
    return Promise.resolve({ exists: () => false, val: () => null });
  }),
}));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn(() => () => {}) }));

const { useActiveClassSession } = await import('@/application/useActiveClassSession');

afterEach(() => {
  cleanup();
  h.reads = 0;
});

describe('useActiveClassSession — the window regaining focus', () => {
  it('re-reads the class meeting from the server', async () => {
    renderHook(() => useActiveClassSession());
    const before = h.reads;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(h.reads).toBe(before + 1));
  });

  it('no longer reads once the screen is gone', () => {
    const { unmount } = renderHook(() => useActiveClassSession());
    unmount();
    const before = h.reads;
    window.dispatchEvent(new Event('focus'));
    expect(h.reads).toBe(before);
  });
});
