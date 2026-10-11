/**
 * @vitest-environment jsdom
 *
 * A teacher's dashboard tab open across a deploy: the old index asked for
 * TeacherDashboard-<old hash>.js, the deploy had removed it, and the teacher got
 * "אירעה שגיאה בטעינת הדף" with "Failed to fetch dynamically imported module".
 * A reload is the whole fix, so the boundary now does it quietly for staff too —
 * bounded like every quiet reload, and if the reloads do not help, staff get the
 * technical view as before.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';
import { isStaleBuildError, pageReload, QUIET_RELOAD_DELAY_MS, QUIET_RELOADS_KEY } from '../quietRecovery';
import { useAuthStore } from '@/application/useAuthStore';

const CHROME = 'Failed to fetch dynamically imported module: https://mathimaticore.web.app/assets/TeacherDashboard-t1i97iMc.js';

function Throws({ message }: { message: string }): never {
  throw new TypeError(message);
}

function signInTeacher() {
  useAuthStore.setState({
    user: { uid: 'teacher_1', role: 'teacher' } as never,
    role: 'teacher',
    isAuthenticated: true,
    isStudentAuthenticated: false,
  });
}

describe('a page left open across a deploy reloads itself', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reload = vi.fn();
    vi.spyOn(pageReload, 'run').mockImplementation(() => reload());
    signInTeacher();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('recognises the wording of Chrome, Firefox and Safari, and nothing else', () => {
    expect(isStaleBuildError(new TypeError(CHROME))).toBe(true);
    expect(isStaleBuildError(new TypeError('error loading dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'digits')"))).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });

  it('a teacher gets no error screen: the page reloads by itself', () => {
    const { container } = render(<ErrorBoundary><Throws message={CHROME} /></ErrorBoundary>);
    expect(screen.getByTestId('quiet-recovery')).toBeTruthy();
    expect(container.textContent).not.toContain('אירעה שגיאה');
    act(() => { vi.advanceTimersByTime(QUIET_RELOAD_DELAY_MS); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('when the reloads are used up, the teacher gets the technical view, not a loop', () => {
    const now = Date.now();
    localStorage.setItem(QUIET_RELOADS_KEY, JSON.stringify([now - 20_000, now - 5_000]));
    const { container } = render(<ErrorBoundary><Throws message={CHROME} /></ErrorBoundary>);
    act(() => { vi.advanceTimersByTime(10 * QUIET_RELOAD_DELAY_MS); });
    expect(reload).not.toHaveBeenCalled();
    expect(container.textContent).toContain('אירעה שגיאה בטעינת הדף');
  });

  it('any other crash still shows the teacher the technical view', () => {
    const { container } = render(<ErrorBoundary><Throws message="Cannot read properties of undefined" /></ErrorBoundary>);
    expect(container.textContent).toContain('אירעה שגיאה בטעינת הדף');
    act(() => { vi.advanceTimersByTime(10 * QUIET_RELOAD_DELAY_MS); });
    expect(reload).not.toHaveBeenCalled();
  });
});
