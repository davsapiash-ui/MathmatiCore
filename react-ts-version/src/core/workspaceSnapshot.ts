/**
 * Which saved copy of a meeting a reload restores (X55).
 *
 * A learner's workspace is saved twice: in this device's local cache, at once,
 * and on the learner record (users/students/{id}/workspaceState), a moment
 * later. Both copies carry the same stamp, WORKSPACE_SAVED_AT_KEY, taken on
 * the server's clock (serverNow) when the state was synced — never the
 * device's own clock, which can be minutes off.
 *
 * The record is the authority. The local copy is restored instead only when
 * it is a state of this meeting that is strictly later than the record's:
 * work done on this device that had not reached the server yet (Module 17,
 * offline first). A copy with no stamp — saved before stamps existed, or
 * written by another path — is never "newer".
 */
export const WORKSPACE_SAVED_AT_KEY = 'savedAt';

type Snapshot = { sessionNumber?: unknown; flowStatus?: unknown; [key: string]: unknown } | null | undefined;

/** The server-clock stamp of a saved copy, or 0 when it carries none. */
export function workspaceSavedAt(snapshot: Snapshot): number {
  const v = snapshot?.[WORKSPACE_SAVED_AT_KEY];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** A saved copy this meeting can be restored from. */
export function isRestorableFor(snapshot: Snapshot, meeting: number): boolean {
  return Boolean(snapshot) && snapshot!.sessionNumber === meeting && Boolean(snapshot!.flowStatus);
}

/**
 * The copy to restore this meeting from, or null when neither is one.
 * The server copy wins on a tie and whenever the local copy is not strictly
 * later by the stamp.
 */
export function newerWorkspaceSnapshot<T extends Snapshot>(server: T, local: T, meeting: number): T | null {
  const serverOk = isRestorableFor(server, meeting);
  const localOk = isRestorableFor(local, meeting);
  if (serverOk && localOk) {
    return workspaceSavedAt(local) > workspaceSavedAt(server) ? local : server;
  }
  if (serverOk) return server;
  if (localOk) return local;
  return null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * How far into its meeting a saved copy is, as one comparable number: a
 * finished meeting (meeting 8's closing board, then its end) is past every
 * exercise; meeting 2 counts its primary round, then its correction round;
 * every other meeting counts its exercise, and the branch choice after the
 * compulsory exercises is past the last of them.
 */
export function meetingProgress(snapshot: Snapshot): number {
  if (!snapshot) return 0;
  if (snapshot.flowStatus === 'sessionDone') return 3_000_000;
  if (snapshot.flowStatus === 'reflection') return 2_000_000;
  if (snapshot.sessionNumber === 2) {
    const q = (snapshot.qflow ?? {}) as { phase?: unknown; subphase?: unknown; taskIdx?: unknown; correctionIdx?: unknown };
    if (q.phase === 'correction') return 1_000 + 2 * num(q.correctionIdx) + (q.subphase === 'retry' ? 1 : 0);
    return num(q.taskIdx);
  }
  return num(snapshot.standardTaskIdx) + (snapshot.flowStatus === 'choice_branch' ? 0.5 : 0);
}

/**
 * Module 17: a meeting started afresh on this device before the learner
 * record arrived (no connection, and no copy of the meeting on the device)
 * began at its first exercise without knowing the record's copy. When the
 * record arrives with a copy of the same meeting, the meeting goes on from the
 * record's copy — unless what the learner did in the fresh start is all of:
 *   1. newer: this device's copy of it is strictly later by the stamp
 *      (newerWorkspaceSnapshot picks it);
 *   2. non-empty: the learner did something in it — acted on the exercise
 *      (hasInteracted) or got past the first one;
 *   3. not behind: it has got at least as far into the meeting as the
 *      record's copy (meetingProgress), so no progress on the record is lost.
 * The start itself is never saved (FirebaseSyncService), so a device copy of
 * the meeting is there only once something changed after it.
 */
export function keepsFreshStartWork(record: Snapshot, device: Snapshot, meeting: number): boolean {
  if (!isRestorableFor(device, meeting)) return false;
  if (!isRestorableFor(record, meeting)) return true;
  const newer = newerWorkspaceSnapshot(record, device, meeting) === device;
  const nonEmpty = device!.hasInteracted === true || meetingProgress(device) > 0;
  return newer && nonEmpty && meetingProgress(device) >= meetingProgress(record);
}
