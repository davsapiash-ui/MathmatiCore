/**
 * PRD Module 23א §ג–§ד: the parts of the reset audit trail that do not touch
 * Firebase directly, so they can be tested on their own — which entry counts
 * as a reset, the backup channel decision (Drive within 90 s, else Cloud
 * Storage), the per-class lock and the export entry.
 */
import { BACKUP_DRIVE_MAX_BYTES, BACKUP_DRIVE_TIMEOUT_MS } from "./driveNames";

export type DeletionStatus = "not_required" | "in_progress" | "completed" | "partial";
export type BackupChannel = "drive" | "storage";

/**
 * §ד: "רק איפוס שה-deletion_status שלו 'completed' נחשב איפוס בדוחות ובייצוא."
 * A level-2 or level-3 entry counts only when its deletion completed. Entries
 * written before deletion_status existed carry none; those were written only
 * after a successful backup, and their deletion either finished or threw, so
 * they keep counting as before (backup_status 'success').
 */
export function isCompletedReset(entry: unknown): boolean {
  const e = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
  if (e.reset_level !== "single_student" && e.reset_level !== "system") return false;
  if (e.deletion_status === undefined || e.deletion_status === null) return e.backup_status === "success";
  return e.deletion_status === "completed";
}

/** §ד: the entry's status once the deletion ran. */
export function deletionStatusAfter(failures: readonly string[]): "completed" | "partial" {
  return failures.length === 0 ? "completed" : "partial";
}

/** §ד: one reset per class at a time. */
export const RESET_LOCK_REFUSAL_HE = "איפוס אחר של הכיתה מתבצע כעת. נסו שוב בעוד רגע. לא נמחקו נתונים.";
export const RESET_LOCK_COLLECTION = "reset_locks";
/**
 * A lock older than this is a reset whose function died without releasing it
 * (the reset runs at most 540 s). It no longer blocks the class.
 */
export const RESET_LOCK_STALE_MS = 15 * 60 * 1000;

/** Whether an existing lock document still blocks a new reset. */
export function lockBlocks(lock: unknown, now: number): boolean {
  if (!lock || typeof lock !== "object") return false;
  const at = Number((lock as Record<string, unknown>).acquired_at);
  return Number.isFinite(at) && now - at < RESET_LOCK_STALE_MS;
}

/** The minimal Firestore surface the lock needs (admin.firestore.Firestore satisfies it). */
export interface LockStore {
  runTransaction<T>(fn: (tx: {
    get(ref: any): Promise<{ exists: boolean; data(): any }>;
    set(ref: any, data: any): unknown;
    delete(ref: any): unknown;
  }) => Promise<T>): Promise<T>;
  collection(name: string): { doc(id: string): any };
}

/** Takes the class's reset lock; false when another reset of the class holds it. */
export async function acquireClassResetLock(db: LockStore, classId: string, resetId: string, now: number = Date.now()): Promise<boolean> {
  const ref = db.collection(RESET_LOCK_COLLECTION).doc(classId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && lockBlocks(snap.data(), now)) return false;
    tx.set(ref, { class_id: classId, reset_id: resetId, acquired_at: now });
    return true;
  });
}

/** Releases the lock only when this reset still holds it. */
export async function releaseClassResetLock(db: LockStore, classId: string, resetId: string): Promise<void> {
  const ref = db.collection(RESET_LOCK_COLLECTION).doc(classId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.reset_id === resetId) tx.delete(ref);
    return null;
  });
}

export interface DriveWriteResult { success: boolean; webViewLink?: string; fileId?: string; error?: string }

export interface BackupWriteDeps {
  /** Writes the file to the Drive folder "3 גיבויים"; must not park it anywhere on failure. */
  writeDrive: (buffer: Buffer, fileName: string, signal: AbortSignal) => Promise<DriveWriteResult>;
  /** Writes the file to Cloud Storage and returns its gs:// url. */
  writeStorage: (buffer: Buffer, storagePath: string) => Promise<string>;
  timeoutMs?: number;
  maxDriveBytes?: number;
}

export interface BackupWriteOutcome {
  channel: BackupChannel;
  url: string;
  driveError?: string;
}

/**
 * §ג: Drive first, waiting at most 90 s; on failure, timeout, or a backup above
 * 30MB, Cloud Storage under backups/{class_id}/. Null when both failed — the
 * caller then aborts the reset and deletes nothing.
 */
export async function writeResetBackup(
  buffer: Buffer,
  fileName: string,
  storagePath: string,
  deps: BackupWriteDeps
): Promise<BackupWriteOutcome | null> {
  const timeoutMs = deps.timeoutMs ?? BACKUP_DRIVE_TIMEOUT_MS;
  const maxBytes = deps.maxDriveBytes ?? BACKUP_DRIVE_MAX_BYTES;
  let driveError: string;
  if (buffer.length > maxBytes) {
    driveError = `backup of ${buffer.length} bytes is above ${maxBytes} bytes; written to Cloud Storage directly`;
  } else {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<DriveWriteResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ success: false, error: `Drive did not finish within ${timeoutMs} ms` });
      }, timeoutMs);
    });
    const drive = deps.writeDrive(buffer, fileName, controller.signal)
      .catch((err: any): DriveWriteResult => ({ success: false, error: err?.message || String(err) }));
    const result = await Promise.race([drive, timeout]);
    if (timer) clearTimeout(timer);
    if (result.success && result.webViewLink) return { channel: "drive", url: result.webViewLink };
    driveError = result.error || "Drive upload failed";
  }
  try {
    const url = await deps.writeStorage(buffer, storagePath);
    return { channel: "storage", url, driveError };
  } catch {
    return null;
  }
}

export const ALL_LEARNERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * §ד and Module 24 §ב: a research export or a meeting download is logged in the
 * same ResetAuditEntry shape, with reset_level 'export' and no e-mail address.
 */
export function exportAuditEntry(input: {
  resetId: string;
  teacherUid: string;
  classId: string;
  affectedStudentIds: readonly number[];
  fileUrl: string | null;
  note: string;
  sessionNumber: number | null;
  now?: number;
}): Record<string, unknown> {
  return {
    reset_id: input.resetId,
    reset_level: "export",
    performed_by_teacher_id: input.teacherUid,
    performed_at: input.now ?? Date.now(),
    class_id: input.classId,
    affected_student_ids: [...input.affectedStudentIds],
    backup_file_url: input.fileUrl,
    backup_status: "not_required",
    reset_reason: "other",
    reason_note: input.note.slice(0, 500),
    records_deleted_count: 0,
    session_number: input.sessionNumber,
    deletion_status: "not_required",
  };
}
