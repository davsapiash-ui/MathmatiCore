/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

/**
 * A learner whose device asks for reduced motion (מסמך העיצוב §1.3) gets the
 * grouping instantly, as before register row 17: no ghost, and no block hidden
 * even for a moment. Its own file because framer-motion reads the media query
 * once per module instance.
 */

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  const noop = async () => undefined;
  return {
    ...actual,
    ref: vi.fn((_db: unknown, path = '') => ({ _path: path })),
    set: vi.fn(noop),
    update: vi.fn(noop),
    remove: vi.fn(noop),
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    push: vi.fn(() => ({ key: 'k', _path: 'k' })),
    onValue: vi.fn(() => () => undefined),
    onDisconnect: vi.fn(() => ({ set: noop, cancel: noop })),
    runTransaction: vi.fn(noop),
    serverTimestamp: vi.fn(() => 0),
  };
});

const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });
Object.defineProperty(window, 'sessionStorage', { value: mockLocalStorage, writable: true, configurable: true });

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useRegroupAnimationStore } from '@/application/useRegroupAnimationStore';
import { PlaceValueBoard } from '@/features/workspace/board/PlaceValueBoard';

describe('Grouping animation under prefers-reduced-motion', () => {
  it('draws no ghost and hides no block', () => {
    useWorkspaceStore.getState().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
    useWorkspaceStore.getState().initSession(3, false, 0);
    useWorkspaceStore.setState({ counts: { units: 12, tens: 0, hundreds: 0, thousands: 0 }, isBoardLocked: false });

    const { container, unmount } = render(
      React.createElement(DndContext, null, React.createElement(PlaceValueBoard, null))
    );
    act(() => { useWorkspaceStore.getState().groupColumnClick('units'); });

    // The move itself happened and was announced …
    expect(useWorkspaceStore.getState().counts).toMatchObject({ units: 2, tens: 1 });
    expect(useRegroupAnimationStore.getState().current).not.toBeNull();
    // … but nothing is drawn and nothing is hidden.
    expect(screen.queryByTestId('regroup-animation-layer')).toBeNull();
    expect(container.querySelectorAll('[data-arriving="true"]')).toHaveLength(0);
    unmount();
  });
});
