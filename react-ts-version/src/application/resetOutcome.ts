/**
 * PRD Module 23א §ז, scenario 1: the teacher confirms a reset and her
 * connection drops right after. "האיפוס מתבצע כולו בשרת ואינו תלוי בחיבור
 * המורה … ותוצאת האיפוס מוצגת למורה כשהחיבור שלה חוזר."
 *
 * The dashboard names every reset it asks for (reset_id); the server stores the
 * reset's entry in the reset audit log under that id and never runs the same id
 * twice. When the call ends with no answer, the dashboard keeps the id (also
 * across a reload) and reads the entry until it holds a final status, then
 * shows that status with the messages the reset already uses. It used to tell
 * the teacher to refresh the page and check for herself.
 */
import type { ResetAuditEntry, SingleStudentResetScope } from '@/types';

/** The server runs a reset for at most 540 s; with no entry after this long, it never started. */
export const RESET_OUTCOME_WAIT_MS = 600_000;
export const RESET_OUTCOME_POLL_MS = 15_000;
const PENDING_RESET_KEY = 'mathmaticore_pending_reset';

/** The messages the reset flow already shows (useStore.ts, functions/src/exportDriveReport.ts). */
export const RESET_OUTCOME_MESSAGES_HE = {
  backupFailed: 'הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.',
  deletionIncomplete: 'הגיבוי נשמר, אך חלק מהנתונים לא נמחקו. ניתן להריץ את האיפוס שוב.',
  abortedAfterBackup: 'הגיבוי נשמר, אך הכנת האיפוס נכשלה, ולכן האיפוס בוטל ולא נמחקו נתונים.',
  notStarted: 'לא ניתן היה להתחיל את האיפוס כעת. נסו שוב בעוד רגע. לא נמחקו נתונים.',
  /** While waiting: the call ended with no answer. */
  noAnswer: 'לא התקבלה תשובה מהשרת, וייתכן שהאיפוס עדיין מתבצע. התוצאה תוצג כאן כשהחיבור יחזור. אין צורך להריץ אותו שוב.',
} as const;

export type PendingReset =
  | { resetId: string; kind: 'student'; studentId: string; scope: SingleStudentResetScope; sessionNumber: number | null; startedAt: number }
  | { resetId: string; kind: 'class'; sessionNumber: number; startedAt: number }
  | { resetId: string; kind: 'system'; startedAt: number };

/** What the success path of the reset reads from the server's answer. */
export interface LoggedResetSuccessData {
  webViewLink: string | null;
  sideEffectErrors?: string[];
  sessionNumber: number | null;
}

export type LoggedResetOutcome =
  | { status: 'waiting' }
  | { status: 'completed'; data: LoggedResetSuccessData }
  | { status: 'failed'; message: string };

/** reset_<ms>_<random>: the shape functions/src/resetAudit.ts isClientResetId accepts. */
export function newResetId(now: number = Date.now()): string {
  const random = Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  return `reset_${now}_${random}`;
}

/** The outcome an entry of the reset audit log records, read `now`; 'waiting' until it is final. */
export function loggedResetOutcome(
  entry: Partial<ResetAuditEntry> | Record<string, unknown> | null,
  startedAt: number,
  now: number
): LoggedResetOutcome {
  const waitedLongEnough = now - startedAt >= RESET_OUTCOME_WAIT_MS;
  if (!entry) {
    // Nothing is deleted before the entry is written (23א §ד), so no entry
    // after the longest a reset can run means nothing was deleted.
    return waitedLongEnough ? { status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.notStarted } : { status: 'waiting' };
  }
  const e = entry as Record<string, unknown>;
  if (e.backup_status === 'failed') return { status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.backupFailed };
  if (e.deletion_status === 'in_progress') {
    // §ד: a deletion that stopped midway stays 'in_progress'.
    return waitedLongEnough ? { status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.deletionIncomplete } : { status: 'waiting' };
  }
  if (e.deletion_status === 'partial') return { status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.deletionIncomplete };
  if (e.deletion_status === 'not_required' && e.reset_level !== 'alerts') {
    return { status: 'failed', message: RESET_OUTCOME_MESSAGES_HE.abortedAfterBackup };
  }
  const sideEffects = Array.isArray(e.side_effect_errors) ? (e.side_effect_errors as string[]) : [];
  const session = Number(e.session_number);
  return {
    status: 'completed',
    data: {
      webViewLink: typeof e.backup_file_url === 'string' ? e.backup_file_url : null,
      ...(sideEffects.length > 0 ? { sideEffectErrors: sideEffects } : {}),
      sessionNumber: Number.isInteger(session) && session >= 1 && session <= 8 ? session : null,
    },
  };
}

// Kept in the browser so a reload does not lose the reset (a per-viewer
// convenience; the outcome itself lives in the reset audit log).
export function savePendingReset(pending: PendingReset): void {
  try { localStorage.setItem(PENDING_RESET_KEY, JSON.stringify(pending)); } catch { /* storage unavailable */ }
}

export function loadPendingReset(): PendingReset | null {
  try {
    const raw = localStorage.getItem(PENDING_RESET_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingReset;
    return p && typeof p.resetId === 'string' && typeof p.startedAt === 'number' ? p : null;
  } catch {
    return null;
  }
}

export function clearPendingReset(resetId: string): void {
  try {
    const current = loadPendingReset();
    if (!current || current.resetId === resetId) localStorage.removeItem(PENDING_RESET_KEY);
  } catch { /* storage unavailable */ }
}

export interface ResetOutcomeWatchDeps {
  fetchEntry: (resetId: string) => Promise<Record<string, unknown> | null>;
  onCompleted: (pending: PendingReset, data: LoggedResetSuccessData) => void;
  onFailed: (pending: PendingReset, message: string) => void;
  now?: () => number;
  pollMs?: number;
}

const activeWatches = new Map<string, () => void>();

/**
 * Reads the reset's entry now, again every RESET_OUTCOME_POLL_MS and at once
 * when the browser comes back online, until its outcome is final; then reports
 * it once and forgets the reset. A read that fails (still offline) is retried.
 * Returns a function that stops watching.
 */
export function watchResetOutcome(pending: PendingReset, deps: ResetOutcomeWatchDeps): () => void {
  activeWatches.get(pending.resetId)?.();
  const now = deps.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let checking = false;

  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    if (activeWatches.get(pending.resetId) === stop) activeWatches.delete(pending.resetId);
  };
  const schedule = () => {
    if (stopped) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(check, deps.pollMs ?? RESET_OUTCOME_POLL_MS);
  };
  async function check() {
    if (stopped || checking) return;
    checking = true;
    try {
      const entry = await deps.fetchEntry(pending.resetId);
      if (stopped) return;
      const outcome = loggedResetOutcome(entry, pending.startedAt, now());
      if (outcome.status === 'waiting') {
        schedule();
        return;
      }
      stop();
      clearPendingReset(pending.resetId);
      if (outcome.status === 'completed') deps.onCompleted(pending, outcome.data);
      else deps.onFailed(pending, outcome.message);
    } catch {
      schedule();
    } finally {
      checking = false;
    }
  }
  function onOnline() { void check(); }

  activeWatches.set(pending.resetId, stop);
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
  void check();
  return stop;
}
