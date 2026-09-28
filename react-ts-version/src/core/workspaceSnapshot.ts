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
