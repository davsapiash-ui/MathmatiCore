/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The grouping / decomposition animation, redrawn with the owner (7.10.2026):
 * the trade of one block for ten, shown through the block's own unit lines;
 * a caption that says it in words; the full tempo the first times, a brief
 * one after; a drag right that breaks the block where it was let go; and a
 * pile whose blocks never jump when another arrives.
 */

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
import {
  useRegroupAnimationStore,
  announceRegroup,
  setRegroupOrigin,
  REGROUP_ANIMATION_MS,
  REGROUP_BRIEF_MS,
  BRIEF_AFTER_TRADES,
} from '@/application/useRegroupAnimationStore';
import { regroupCaptionHe } from '@/core/regroupCaption';
import { PlaceValueBoard } from '@/features/workspace/board/PlaceValueBoard';

const code = (rel: string) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');
const ws = () => useWorkspaceStore.getState();

function start(counts: { units: number; tens: number; hundreds: number; thousands: number }, isASD = false) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
  ws().initSession(4, isASD, 0);
  useWorkspaceStore.setState({ counts, isBoardLocked: false, isASD });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the caption says the trade, in the order it happens', () => {
  it('every pair, both directions', () => {
    expect(regroupCaptionHe('split', 'tens', 'units')).toBe('עשרת אחת = 10 יחידות');
    expect(regroupCaptionHe('split', 'hundreds', 'tens')).toBe('מאה אחת = 10 עשרות');
    expect(regroupCaptionHe('split', 'thousands', 'hundreds')).toBe('אלף אחד = 10 מאות');
    expect(regroupCaptionHe('group', 'units', 'tens')).toBe('10 יחידות = עשרת אחת');
    expect(regroupCaptionHe('group', 'tens', 'hundreds')).toBe('10 עשרות = מאה אחת');
    expect(regroupCaptionHe('group', 'hundreds', 'thousands')).toBe('10 מאות = אלף אחד');
  });

  it('it is shown with the move and a moment after it; not in quiet mode', () => {
    start({ units: 12, tens: 0, hundreds: 0, thousands: 0 });
    render(React.createElement(DndContext, null, React.createElement(PlaceValueBoard, null)));
    act(() => { ws().groupColumnClick('units'); });
    expect(screen.getByTestId('regroup-caption').textContent).toBe('10 יחידות = עשרת אחת');
    act(() => { vi.advanceTimersByTime(REGROUP_ANIMATION_MS + 100); });
    // The blocks have landed; the words are still there to be read.
    expect(screen.queryByTestId('regroup-animation-layer')).toBeNull();
    expect(screen.getByTestId('regroup-caption')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByTestId('regroup-caption')).toBeNull();
    cleanup();

    start({ units: 12, tens: 0, hundreds: 0, thousands: 0 }, true);
    render(React.createElement(DndContext, null, React.createElement(PlaceValueBoard, null)));
    act(() => { ws().groupColumnClick('units'); });
    expect(useRegroupAnimationStore.getState().current).not.toBeNull();
    expect(screen.queryByTestId('regroup-caption')).toBeNull();
  });
});

describe('the tempo', () => {
  it('full the first times, brief once the same trade was made BRIEF_AFTER_TRADES times; a new meeting starts over', () => {
    start({ units: 0, tens: 9, hundreds: 0, thousands: 0 });
    const durations: number[] = [];
    for (let i = 0; i < BRIEF_AFTER_TRADES + 2; i++) {
      act(() => { ws().splitBlockClick('tens'); });
      durations.push(useRegroupAnimationStore.getState().current!.durationMs);
    }
    expect(durations.slice(0, BRIEF_AFTER_TRADES)).toEqual(Array(BRIEF_AFTER_TRADES).fill(REGROUP_ANIMATION_MS));
    expect(durations.slice(BRIEF_AFTER_TRADES)).toEqual([REGROUP_BRIEF_MS, REGROUP_BRIEF_MS]);
    // Another trade keeps its own count.
    act(() => { ws().splitBlockClick('hundreds'); });
    useWorkspaceStore.setState({ counts: { units: 0, tens: 0, hundreds: 1, thousands: 0 } });
    act(() => { ws().splitBlockClick('hundreds'); });
    expect(useRegroupAnimationStore.getState().current!.durationMs).toBe(REGROUP_ANIMATION_MS);
    ws().initSession(5, false, 0);
    useWorkspaceStore.setState({ counts: { units: 0, tens: 3, hundreds: 0, thousands: 0 }, isBoardLocked: false });
    act(() => { ws().splitBlockClick('tens'); });
    expect(useRegroupAnimationStore.getState().current!.durationMs).toBe(REGROUP_ANIMATION_MS);
  });
});

describe('a drag right breaks the block where it was let go', () => {
  it('the drop point reaches a split, never a grouping, and is used once', () => {
    setRegroupOrigin({ x: 300, y: 400 });
    announceRegroup({ kind: 'split', from: 'hundreds', to: 'tens', toCount: 10 });
    expect(useRegroupAnimationStore.getState().current!.origin).toEqual({ x: 300, y: 400 });
    announceRegroup({ kind: 'split', from: 'hundreds', to: 'tens', toCount: 20 });
    expect(useRegroupAnimationStore.getState().current!.origin).toBeUndefined();
    setRegroupOrigin({ x: 300, y: 400 });
    announceRegroup({ kind: 'group', from: 'units', to: 'tens', toCount: 1 });
    expect(useRegroupAnimationStore.getState().current!.origin).toBeUndefined();
  });

  it('the board passes the drop point and clears it after every drop', () => {
    const page = code('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain('setRegroupOrigin(dropped ?');
    expect(page).toMatch(/finally \{\s*setRegroupOrigin\(null\);/);
  });
});

describe('the blocks show what they are made of', () => {
  const blocks = code('features/workspace/board/DienesBlock.tsx');

  it('lines and edges keep their width on screen (a real SVG value), in the block\'s own shade', () => {
    expect(blocks).not.toMatch(/vectorEffect="nonScalingStroke"/);
    expect(blocks).toContain("vectorEffect: 'non-scaling-stroke'");
    expect(blocks).not.toContain('#0f172a');
  });

  it('the thousand\'s right-face lines stay on the cube', () => {
    expect(blocks).toContain('x1={1000 + i * 100} y1={1000 - i * 50} x2={1000 + i * 100} y2={2000 - i * 50}');
  });

  it('the seams are one group, so the move can strengthen them for a moment (not in quiet mode)', () => {
    expect(blocks.match(/<g className="dienes-seams">/g)).toHaveLength(3);
    const css = code('index.css');
    expect(css).toContain('.regroup-seam-glow .dienes-seams line');
    expect(css).toMatch(/\[data-quiet='true'\] \.regroup-seam-glow \.dienes-seams line \{\s*animation: none !important;/);
  });
});

describe('a pile never jumps', () => {
  it('rows stack upward: the first block stays at the bottom, a new one lands on top', () => {
    const column = code('features/workspace/board/PlaceColumn.tsx');
    expect(column).toContain('flex flex-row flex-wrap-reverse content-start justify-center');
  });
});
