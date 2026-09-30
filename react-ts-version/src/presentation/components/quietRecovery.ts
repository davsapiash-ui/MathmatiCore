/**
 * The quiet recovery of the app-wide error boundary (ErrorBoundary.tsx).
 *
 * PRD Module 1 §ב: "במקרה של תקלה חמורה, הממשק מחזיר את התלמיד למצב עבודה שקט
 * ולא מציג הודעת שגיאה" — "המצב מתאפס לערך התקין האחרון הידוע".
 *
 * A child sees a calm screen and the page reloads by itself; the workspace comes
 * back from its saved snapshot, the last known good state. A crash that returns
 * on every load must not become a reload loop: after QUIET_RELOAD_LIMIT reloads
 * within a minute, the child gets one calm "נסו שוב" button instead.
 *
 * The count must survive the reload, so it lives in localStorage: timestamps
 * only, nothing about the child, and each one stops counting after a minute.
 * (sessionStorage is kept out of the app outside the auth and workspace stores —
 * StudentDomainAudit.test.ts.)
 */
import { useAuthStore } from '@/application/useAuthStore';

export const QUIET_RELOAD_DELAY_MS = 1500;
export const QUIET_RELOAD_LIMIT = 2;
const QUIET_RELOAD_WINDOW_MS = 60 * 1000;
export const QUIET_RELOADS_KEY = 'mc_quiet_recovery_reloads';

/** The only child-facing words of this screen (Module 1 §ב: no error text). */
export const QUIET_RECOVERY_TEXT = 'רגע אחד…';
export const QUIET_RETRY_LABEL = 'נסו שוב';

/** The page reload, in one place so a test can observe it (jsdom's location cannot be stubbed). */
export const pageReload = {
  run: () => window.location.reload(),
};

/** The full-page move to the login screen, observable the same way. */
export const loginPage = {
  open: () => {
    window.location.href = '/login';
  },
};

/** Signed-in staff keep the technical view; everyone else — a child — gets the quiet one. */
export function isSignedInStaff(): boolean {
  try {
    const state = useAuthStore.getState();
    const role = String(state.role || state.user?.role || '').toLowerCase();
    return role === 'teacher' || role === 'admin';
  } catch {
    return false;
  }
}

function recentQuietReloads(now: number): number[] {
  try {
    const raw = localStorage.getItem(QUIET_RELOADS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((t): t is number => typeof t === 'number' && t <= now && now - t < QUIET_RELOAD_WINDOW_MS)
      : [];
  } catch {
    return [];
  }
}

/**
 * Claims one quiet reload: true when fewer than QUIET_RELOAD_LIMIT happened in
 * the last minute and this one was recorded. False when the reloads are used
 * up, or when it could not be recorded — then no automatic reload, so no loop.
 */
export function claimQuietReload(now: number = Date.now()): boolean {
  const recent = recentQuietReloads(now);
  if (recent.length >= QUIET_RELOAD_LIMIT) return false;
  try {
    const next = [...recent, now];
    localStorage.setItem(QUIET_RELOADS_KEY, JSON.stringify(next));
    return recentQuietReloads(now).length === next.length;
  } catch {
    return false;
  }
}

/** The child asked to try again: a fresh set of quiet reloads. */
export function resetQuietReloads(): void {
  try {
    localStorage.removeItem(QUIET_RELOADS_KEY);
  } catch {
    // Storage unavailable: the reload still happens.
  }
}
