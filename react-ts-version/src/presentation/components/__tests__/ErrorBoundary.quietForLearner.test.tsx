/**
 * @vitest-environment jsdom
 *
 * PRD Module 1 §ב: "במקרה של תקלה חמורה, הממשק מחזיר את התלמיד למצב עבודה שקט
 * ולא מציג הודעת שגיאה"; "המצב מתאפס לערך התקין האחרון הידוע".
 *
 * The app-wide boundary (main.tsx) showed every user "אירעה שגיאה בטעינת הדף",
 * "פרטי שגיאה טכניים", the stack trace and three buttons, one of them a sign-out.
 * A child now sees a calm screen, the page reloads by itself (the workspace comes
 * back from its snapshot), and a crash that repeats cannot loop: after two quiet
 * reloads within a minute there is one "נסו שוב" button. Staff keep the
 * technical view.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';
import {
  pageReload,
  QUIET_RELOAD_DELAY_MS,
  QUIET_RELOADS_KEY,
  QUIET_RECOVERY_TEXT,
  QUIET_RETRY_LABEL,
} from '../quietRecovery';
import { useAuthStore } from '@/application/useAuthStore';

function Boom(): never {
  throw new Error('TypeError: Cannot read properties of undefined (reading "digits") at BoardCell');
}

const STAFF_ONLY_WORDS = [
  'אירעה שגיאה',
  'שגיאה',
  'תקלה',
  'פרטי שגיאה טכניים',
  'העתק שגיאה',
  'איפוס זיכרון מקומי',
  'למסך הכניסה',
  'רענן דף',
  'TypeError',
  'BoardCell',
];

function signIn(role: 'student' | 'teacher' | 'admin' | null) {
  if (role === null) {
    useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });
    return;
  }
  useAuthStore.setState({
    user: { uid: role === 'student' ? 'student_user4' : `${role}_1`, role } as never,
    role,
    isAuthenticated: true,
    isStudentAuthenticated: role === 'student',
  });
}

function renderCrash() {
  return render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  );
}

describe('Module 1 §ב — a severe fault shows the child no error text', () => {
  let reload: ReturnType<typeof vi.fn>;
  const logout = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reload = vi.fn();
    vi.spyOn(pageReload, 'run').mockImplementation(() => reload());
    useAuthStore.setState({ logout } as never);
    logout.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a learner sees a calm screen, no error words, no stack, no buttons — and the page reloads by itself', () => {
    signIn('student');
    const { container } = renderCrash();

    expect(screen.getByTestId('quiet-recovery')).toBeTruthy();
    expect(container.textContent).toBe(QUIET_RECOVERY_TEXT);
    for (const word of STAFF_ONLY_WORDS) expect(container.textContent).not.toContain(word);
    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);

    expect(reload).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(QUIET_RELOAD_DELAY_MS); });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(QUIET_RELOADS_KEY) || '[]')).toHaveLength(1);
    expect(logout).not.toHaveBeenCalled();
  });

  it('nobody signed in (the sign-in screen a child uses) is quiet too', () => {
    signIn(null);
    const { container } = renderCrash();
    expect(container.textContent).toBe(QUIET_RECOVERY_TEXT);
    act(() => { vi.advanceTimersByTime(QUIET_RELOAD_DELAY_MS); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('no reload loop: after two quiet reloads within a minute, one calm "נסו שוב" button', () => {
    signIn('student');
    const now = Date.now();
    localStorage.setItem(QUIET_RELOADS_KEY, JSON.stringify([now - 20_000, now - 5_000]));

    const { container } = renderCrash();
    act(() => { vi.advanceTimersByTime(10 * QUIET_RELOAD_DELAY_MS); });
    expect(reload).not.toHaveBeenCalled();

    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(container.textContent).toBe(QUIET_RETRY_LABEL);
    for (const word of STAFF_ONLY_WORDS) expect(container.textContent).not.toContain(word);

    // The child asks: counter reset, one reload, no sign-out.
    fireEvent.click(screen.getByRole('button', { name: QUIET_RETRY_LABEL }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(QUIET_RELOADS_KEY)).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it('reloads older than a minute do not count', () => {
    signIn('student');
    const now = Date.now();
    localStorage.setItem(QUIET_RELOADS_KEY, JSON.stringify([now - 5 * 60_000, now - 2 * 60_000]));
    renderCrash();
    act(() => { vi.advanceTimersByTime(QUIET_RELOAD_DELAY_MS); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('when the counter cannot be stored, no automatic reload (it could not be bounded): the button', () => {
    signIn('student');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { container } = renderCrash();
    act(() => { vi.advanceTimersByTime(10 * QUIET_RELOAD_DELAY_MS); });
    expect(reload).not.toHaveBeenCalled();
    expect(container.textContent).toBe(QUIET_RETRY_LABEL);
  });

  it('the child-facing words are short, plural-neutral Hebrew (register decision ט)', () => {
    expect(QUIET_RECOVERY_TEXT).toBe('רגע אחד…');
    expect(QUIET_RETRY_LABEL).toBe('נסו שוב');
  });

  for (const role of ['teacher', 'admin'] as const) {
    it(`${role}: today's technical view, no automatic reload`, () => {
      signIn(role);
      const { container } = renderCrash();
      expect(container.textContent).toContain('אירעה שגיאה בטעינת הדף');
      expect(container.textContent).toContain('פרטי שגיאה טכניים');
      expect(container.querySelector('pre')?.textContent).toContain('BoardCell');
      expect(screen.queryByTestId('quiet-recovery')).toBeNull();
      act(() => { vi.advanceTimersByTime(10 * QUIET_RELOAD_DELAY_MS); });
      expect(reload).not.toHaveBeenCalled();
    });
  }
});
