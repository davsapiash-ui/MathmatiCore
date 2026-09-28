/**
 * The meeting time limit on this device — kept per learner and per meeting.
 *
 * PRD 7.3 Module 14 §ב: the server is the only authority for the meeting's
 * time (session_deadline_time); the browser store "is for display only and is
 * not authorised to set or extend times". No screen calls
 * createSessionWithServerDeadline today, and the synced workspace snapshot does
 * not carry the deadline, so this device copy is what a reload reads. A
 * deadline the caller already holds (the server's) always wins over it.
 *
 * The copy used to be kept per device and per meeting only
 * (`mathmaticore_session_{n}_deadline`). Several learners share one tablet,
 * so the next learner on it inherited the previous learner's deadline. It is
 * now kept under the learner too: `mathmaticore_session_{n}_deadline_{uid}`,
 * uid the canonical `student_user{N}` (each child always signs in with the
 * same number, 1–12). Sign-out does not clear it: a learner who signs back in
 * keeps the time limit their meeting started with.
 *
 * The device-wide key (legacy) cannot say whose deadline it is. Under the old
 * code every learner who opened meeting n on this device while it was running
 * got that value. It is adopted for a learner only when all of these hold:
 *   - the learner has no deadline of their own for the meeting on this device;
 *   - the legacy value is still running, and no later than a fresh deadline
 *     would be (so it can never extend anyone's time);
 *   - this device holds the learner's own saved progress in that same meeting,
 *     saved after the legacy deadline was set — i.e. the learner was working
 *     that meeting here while it was the device's deadline, so it is the time
 *     limit they already had.
 * Adopting it keeps exactly what that learner had before the change: not a
 * fresh, longer limit (which Module 14 §ב forbids the client), and not a limit
 * newly imposed from someone else. Any other learner ignores it and starts
 * their own.
 *
 * The question is decided once per learner and meeting, on the first read
 * after the change, and the answer is kept: adopted becomes the learner's own
 * copy, declined leaves a declined mark. It is never asked again. The saved
 * progress it is judged by is stamped again on every change the learner makes
 * (Module 17 sync), so a learner declined on one reload would otherwise
 * "qualify" on the next, just by working, and pick up another learner's
 * deadline.
 *
 * The legacy value is left in place while it runs, because another learner
 * who was on it may still come back to this device. It is removed, with every
 * declined mark for it, once it has run out (or cannot be a real deadline).
 */
import { getSessionDurationMinutes } from '@/core/classSession';
import { isRestorableFor, workspaceSavedAt } from '@/core/workspaceSnapshot';

type SavedProgress = { sessionNumber?: unknown; flowStatus?: unknown; [key: string]: unknown } | null | undefined;

const MEETINGS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Every learner id there is: each child always signs in with the same number, 1–12. */
const LEARNER_UIDS = Array.from({ length: 12 }, (_, i) => `student_user${i + 1}`);

const durationMs = (meeting: number) => getSessionDurationMinutes(meeting) * 60 * 1000;

/** This learner's device copy of the meeting deadline. */
export function meetingDeadlineKey(meeting: number, learnerUid: string): string {
  return `mathmaticore_session_${meeting}_deadline_${learnerUid}`;
}

/** The device-wide key used before 28.9.2026, whoever the learner was. Read for migration only; never written. */
export function legacyMeetingDeadlineKey(meeting: number): string {
  return `mathmaticore_session_${meeting}_deadline`;
}

/** Marks that this learner was not given the legacy value of the meeting. Holds the value declined. */
export function legacyDeclinedKey(meeting: number, learnerUid: string): string {
  return `mathmaticore_session_${meeting}_deadline_legacy_declined_${learnerUid}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** A stored time, null when nothing is stored, 'invalid' when what is stored is not a time. */
function readTime(store: Storage, key: string): number | null | 'invalid' {
  const raw = store.getItem(key);
  if (raw === null) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 'invalid';
}

/**
 * Stores the deadline as this learner's copy for the meeting. Without an
 * identified learner nothing is stored: a device-wide value is exactly what
 * leaked from one learner to the next.
 */
export function storeMeetingDeadline(meeting: number, learnerUid: string, deadline: number): void {
  const store = storage();
  if (!store || !learnerUid) return;
  try {
    store.setItem(meetingDeadlineKey(meeting, learnerUid), deadline.toString());
  } catch (e) {
    console.error('Failed to store session deadline', e);
  }
}

export interface StoredMeetingDeadlineQuery {
  meeting: number;
  /** The canonical `student_user{N}`, or '' when no learner is identified. */
  learnerUid: string;
  /** The server clock (serverNow). */
  now: number;
  /** The learner's own saved progress on this device; read only when a legacy value might be theirs. */
  ownProgress: () => SavedProgress;
}

/**
 * The learner's still-running deadline for this meeting on this device, or
 * null when there is none (the caller then starts a fresh one, or — on a
 * restore — leaves it unset, as a restore on a device without one always did).
 */
export function readStoredMeetingDeadline(q: StoredMeetingDeadlineQuery): number | null {
  const store = storage();
  if (!store) return null;
  try {
    retireFinishedLegacyDeadlines(store, q.now);
    if (!q.learnerUid) return null;

    const ownKey = meetingDeadlineKey(q.meeting, q.learnerUid);
    const own = readTime(store, ownKey);
    if (typeof own === 'number') return own > q.now ? own : null;
    // Unreadable: as if never stored. The caller stores a proper one.
    if (own === 'invalid') store.removeItem(ownKey);

    return adoptLegacyDeadline(store, q);
  } catch (e) {
    console.error('Failed to read session deadline', e);
    return null;
  }
}

/** Removes legacy values that have run out or cannot be a real deadline, and the declined marks with them. */
function retireFinishedLegacyDeadlines(store: Storage, now: number): void {
  for (const m of MEETINGS) {
    const key = legacyMeetingDeadlineKey(m);
    const value = readTime(store, key);
    if (value === null) continue;
    // Further out than a fresh deadline of that meeting can be: written on a
    // clock that was off. Adopting it would extend someone's time.
    if (value === 'invalid' || value <= now || value > now + durationMs(m)) {
      store.removeItem(key);
      for (const uid of LEARNER_UIDS) store.removeItem(legacyDeclinedKey(m, uid));
    }
  }
}

function adoptLegacyDeadline(store: Storage, q: StoredMeetingDeadlineQuery): number | null {
  const legacy = readTime(store, legacyMeetingDeadlineKey(q.meeting));
  // Anything unusable was already removed above.
  if (typeof legacy !== 'number') return null;

  // Decided once: a learner declined before is never given it later.
  const declinedKey = legacyDeclinedKey(q.meeting, q.learnerUid);
  if (store.getItem(declinedKey) !== null) return null;

  if (wasRunningOnIt(legacy, q)) {
    storeMeetingDeadline(q.meeting, q.learnerUid, legacy);
    return legacy;
  }
  store.setItem(declinedKey, legacy.toString());
  return null;
}

/** The learner's own progress in this meeting on this device was saved after the legacy value was set. */
function wasRunningOnIt(legacy: number, q: StoredMeetingDeadlineQuery): boolean {
  const progress = q.ownProgress();
  if (!isRestorableFor(progress, q.meeting)) return false;
  const setAt = legacy - durationMs(q.meeting);
  return workspaceSavedAt(progress) >= setAt;
}
