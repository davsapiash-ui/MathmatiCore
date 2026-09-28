/**
 * @vitest-environment jsdom
 *
 * Module 15: the projector opens in a window of its own (the dashboard's
 * window.open), shown on the classroom board. Its "חזרה לדשבורד המורה" used to
 * navigate that window to /dashboard: a second dashboard in front of the class,
 * and two dashboards each arming the teacher's presence and onDisconnect, so
 * either one's reload raised a false "החיבור שלכם התנתק לרגע" in the other.
 * Now the button brings the dashboard that opened the window forward and
 * closes the projector window; only a window with no opener navigates.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('firebase/database', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  set: vi.fn(() => Promise.resolve()),
  onDisconnect: vi.fn(() => ({ set: () => Promise.resolve(), cancel: () => Promise.resolve() })),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
  // The stores this page imports attach listeners of their own.
  onValue: vi.fn(() => () => {}),
  get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'k' })),
}));

import { set as rtdbSet } from 'firebase/database';
import { ProjectorSandboxPage } from '../ProjectorSandboxPage';
import { useAuthStore } from '@/application/useAuthStore';

function renderProjector() {
  return render(
    <MemoryRouter initialEntries={['/projector']}>
      <Routes>
        <Route path="/projector" element={<ProjectorSandboxPage />} />
        <Route path="/dashboard" element={<div>SECOND_DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('projector → "חזרה לדשבורד המורה"', () => {
  const close = vi.fn();

  beforeEach(() => {
    useAuthStore.setState({
      user: { uid: 'teacher_1', role: 'teacher' } as never,
      role: 'teacher',
      isAuthenticated: true,
      isStudentAuthenticated: false,
    });
    close.mockClear();
    vi.spyOn(window, 'close').mockImplementation(close);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'opener', { configurable: true, writable: true, value: null });
  });

  it('opened by the dashboard: focuses it and closes this window, no second dashboard', () => {
    const opener = { closed: false, focus: vi.fn() };
    Object.defineProperty(window, 'opener', { configurable: true, writable: true, value: opener });

    renderProjector();
    fireEvent.click(screen.getByText('חזרה לדשבורד המורה'));

    expect(opener.focus).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('SECOND_DASHBOARD')).toBeNull();
    // The learners' screens are released first.
    expect(vi.mocked(rtdbSet)).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'system_control/projector_mode' }),
      expect.objectContaining({ projector_mode: false })
    );
  });

  it('opened on its own (no opener, or the dashboard was closed): goes to the dashboard', () => {
    Object.defineProperty(window, 'opener', { configurable: true, writable: true, value: { closed: true, focus: vi.fn() } });

    renderProjector();
    fireEvent.click(screen.getByText('חזרה לדשבורד המורה'));

    expect(close).not.toHaveBeenCalled();
    expect(screen.getByText('SECOND_DASHBOARD')).toBeTruthy();
  });
});
