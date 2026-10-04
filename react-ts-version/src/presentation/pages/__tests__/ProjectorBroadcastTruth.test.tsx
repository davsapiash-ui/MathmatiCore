// @vitest-environment jsdom
/**
 * Teacher-dashboard truth audit, 4.10.2026 — the projector page.
 *
 *  - The broadcast badge showed a local flag the button flipped. It stayed
 *    "שידור פעיל" after a write the server refused, and after the connection
 *    dropped and the server released the class. It now shows the flag as read
 *    back from the database, and says so when the connection is lost.
 *  - Turning the broadcast on wrote a release and then the broadcast, back to
 *    back; learners drop an update whose stamp is not newer than the last one,
 *    so two writes in one millisecond left them released. Now: one write.
 *  - A block dropped between the columns, or off the board, was deleted. The
 *    learners' board sends it to its own column, or leaves it where it was.
 *  - Sign-out was an icon with no name; it is the shared "יציאה" button, and
 *    the class is still released first.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

type Snap = { val: () => unknown; exists: () => boolean };
const listeners = vi.hoisted(() => new Map<string, (snap: Snap) => void>());
const emit = (path: string, value: unknown) =>
  act(() => listeners.get(path)?.({ val: () => value, exists: () => value !== null }));

const armed = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('firebase/database', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  set: vi.fn(() => Promise.resolve()),
  onDisconnect: vi.fn(() => ({ set: armed, cancel: () => Promise.resolve() })),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
  onValue: vi.fn((r: { path?: string }, cb: (snap: Snap) => void) => {
    if (r?.path) listeners.set(r.path, cb);
    return () => {};
  }),
  get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'k' })),
}));

const dnd = vi.hoisted(() => ({ onDragEnd: null as null | ((e: unknown) => void) }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: Parameters<typeof actual.DndContext>[0]) => {
      dnd.onDragEnd = props.onDragEnd as never;
      return <actual.DndContext {...props} />;
    },
  };
});

const unifiedLogout = vi.hoisted(() => vi.fn());
vi.mock('@/application/useAuthStore', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  unifiedLogout,
}));

import { set as rtdbSet } from 'firebase/database';
import { ProjectorSandboxPage } from '../ProjectorSandboxPage';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

const MODE = 'system_control/projector_mode';
const ON = 'שידור פעיל (תלמידים בהמתנה)';
const OFF = 'שידור מושהה (תלמידים פעילים)';
const LOST = 'אין חיבור לשרת — השידור הופסק';

function renderProjector() {
  return render(
    <MemoryRouter initialEntries={['/projector']}>
      <Routes>
        <Route path="/projector" element={<ProjectorSandboxPage />} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const modeWrites = () =>
  vi.mocked(rtdbSet).mock.calls.filter(([r]) => (r as unknown as { path: string }).path === MODE).map(([, v]) => v as { projector_mode: boolean });

beforeEach(() => {
  listeners.clear();
  vi.mocked(rtdbSet).mockClear();
  vi.mocked(rtdbSet).mockImplementation(() => Promise.resolve());
  armed.mockClear();
  unifiedLogout.mockClear();
  useAuthStore.setState({
    user: { uid: 'teacher_1', role: 'teacher' } as never,
    role: 'teacher',
    isAuthenticated: true,
    isStudentAuthenticated: false,
  });
});
afterEach(() => cleanup());

describe('projector badge: what the database holds, not what was pressed', () => {
  it('a refused broadcast leaves the badge on "מושהה", next to the alert', async () => {
    renderProjector();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(rtdbSet).mockImplementation(() => Promise.reject(new Error('PERMISSION_DENIED')));

    await act(async () => {
      fireEvent.click(screen.getByText(OFF));
    });

    expect(screen.getByRole('alert').textContent).toContain('השידור לא נשמר בשרת');
    expect(screen.getByText(OFF)).toBeTruthy();
    expect(screen.queryByText(ON)).toBeNull();
  });

  it('follows the value read back, in both directions', () => {
    renderProjector();
    emit(MODE, { projector_mode: true, projector_mode_updated_at: 5 });
    expect(screen.getByText(ON)).toBeTruthy();
    // Another window, or the server on a disconnect, released the class.
    emit(MODE, { projector_mode: false, projector_mode_updated_at: 6 });
    expect(screen.getByText(OFF)).toBeTruthy();
  });

  it('a lost connection is shown, cannot be pressed, and the release is armed again on return', () => {
    renderProjector();
    emit('.info/connected', true);
    expect(armed).toHaveBeenCalledTimes(1);
    emit(MODE, { projector_mode: true, projector_mode_updated_at: 5 });

    emit('.info/connected', false);
    expect(screen.getByText(LOST)).toBeTruthy();
    expect(screen.queryByText(ON)).toBeNull();
    expect(screen.queryByText(OFF)).toBeNull();

    emit('.info/connected', true);
    expect(armed).toHaveBeenCalledTimes(2);
    emit(MODE, { projector_mode: false, projector_mode_updated_at: 9 });
    expect(screen.getByText(OFF)).toBeTruthy();
  });

  it('before the first connection the page does not announce a lost one', () => {
    renderProjector();
    emit('.info/connected', false);
    expect(screen.queryByText(LOST)).toBeNull();
    expect(screen.getByText(OFF)).toBeTruthy();
  });
});

describe('projector broadcast: one write per press', () => {
  it('turning the broadcast on sends the broadcast alone, with no release before it', () => {
    renderProjector();
    vi.mocked(rtdbSet).mockClear();

    fireEvent.click(screen.getByText(OFF));
    expect(modeWrites().map((w) => w.projector_mode)).toEqual([true]);

    emit(MODE, { projector_mode: true, projector_mode_updated_at: 5 });
    vi.mocked(rtdbSet).mockClear();
    fireEvent.click(screen.getByText(ON));
    expect(modeWrites().map((w) => w.projector_mode)).toEqual([false]);
  });
});

describe('projector board: a drop that misses a column', () => {
  const dragEnd = (over: unknown) =>
    act(() =>
      dnd.onDragEnd?.({
        active: { data: { current: { place: 'tens', source: 'column' } } },
        over: over ? { data: { current: over } } : null,
      })
    );

  beforeEach(() => {
    renderProjector();
    const drop = { source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } } as never;
    act(() => {
      useWorkspaceStore.getState().applyDrop(drop);
      useWorkspaceStore.getState().applyDrop(drop);
    });
    expect(useWorkspaceStore.getState().counts.tens).toBe(2);
  });

  it('off the board: the block stays', () => {
    dragEnd(null);
    expect(useWorkspaceStore.getState().counts.tens).toBe(2);
  });

  it('between the columns: the block returns to its column', () => {
    dragEnd({ kind: 'board' });
    expect(useWorkspaceStore.getState().counts.tens).toBe(2);
  });

  it('on the trash: the block is removed', () => {
    dragEnd({ kind: 'trash' });
    expect(useWorkspaceStore.getState().counts.tens).toBe(1);
  });
});

describe('projector sign-out: the shared "יציאה" button', () => {
  it('carries its name, releases the class first, then signs out', () => {
    renderProjector();
    vi.mocked(rtdbSet).mockClear();
    unifiedLogout.mockImplementation(() => {
      // The release was already written when the sign-out starts.
      expect(modeWrites().map((w) => w.projector_mode)).toEqual([false]);
    });

    const button = screen.getByRole('button', { name: 'יציאה מהמערכת' });
    expect(button.textContent).toBe('יציאה');
    fireEvent.click(button);

    expect(unifiedLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByTitle('התנתקו מהמערכת')).toBeNull();
  });
});
