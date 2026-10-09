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

/**
 * §ז: the teacher's dashboard names each reset it asks for (reset_<time>_<random>)
 * and the server uses that name as the reset_audit_log document id, so the
 * dashboard can read the outcome when its connection returns.
 */
export function isClientResetId(raw: unknown): raw is string {
  return typeof raw === "string" && /^reset_[A-Za-z0-9_-]{8,100}$/.test(raw);
}

/** Messages the reset already used, given again for a reset that was already logged. */
export const RESET_BACKUP_FAILED_HE = "הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.";
export const RESET_DELETION_INCOMPLETE_HE = "הגיבוי נשמר, אך חלק מהנתונים לא נמחקו. ניתן להריץ את האיפוס שוב.";
export const RESET_ABORTED_AFTER_BACKUP_HE = "הגיבוי נשמר, אך הכנת האיפוס נכשלה, ולכן האיפוס בוטל ולא נמחקו נתונים.";
export const RESET_STILL_RUNNING_HE = "האיפוס הזה כבר התחיל בשרת ועדיין לא הסתיים. התוצאה תוצג כשהוא יסתיים.";

export type ReplayOutcome =
  | { kind: "result"; result: Record<string, unknown> }
  | {
      kind: "error";
      code: "unavailable" | "internal" | "failed-precondition" | "permission-denied" | "invalid-argument";
      message: string;
      details?: Record<string, unknown>;
    };

/**
 * §ז: a request whose reset id is already in reset_audit_log never runs a
 * second reset. It gets the logged reset's outcome, in the shape the first
 * request would have had: the success result, or the same refusal.
 */
export function replayOutcomeOfEntry(entry: Record<string, unknown>, classId: string): ReplayOutcome {
  const resetId = String(entry.reset_id ?? "");
  if (entry.class_id !== classId) {
    return { kind: "error", code: "permission-denied", message: "אפשר לאפס רק את הכיתה המשויכת לחשבון המחובר. לא נמחקו נתונים." };
  }
  if (entry.reset_level === "alerts") {
    return { kind: "result", result: { status: "SUCCESS", message: "התראות אופסו בהצלחה ותועדו בלוג.", resetId, replayed: true } };
  }
  if (entry.reset_level !== "single_student" && entry.reset_level !== "system") {
    return { kind: "error", code: "invalid-argument", message: "מזהה האיפוס אינו תקין. האיפוס בוטל ולא נמחקו נתונים." };
  }
  if (entry.backup_status === "failed") {
    return { kind: "error", code: "internal", message: RESET_BACKUP_FAILED_HE };
  }
  const status = entry.deletion_status;
  if (status === "in_progress") {
    // Still deleting, or stopped midway (§ד: the entry then stays 'in_progress').
    // 'unavailable': the dashboard keeps waiting for the entry's final status.
    return { kind: "error", code: "unavailable", message: RESET_STILL_RUNNING_HE };
  }
  if (status === "partial") {
    return { kind: "error", code: "internal", message: RESET_DELETION_INCOMPLETE_HE, details: { stage: "deletion_incomplete" } };
  }
  if (status === "not_required") {
    return { kind: "error", code: "failed-precondition", message: RESET_ABORTED_AFTER_BACKUP_HE };
  }
  // 'completed' — or an entry from before deletion_status, written after a successful backup.
  const sideEffectErrors = Array.isArray(entry.side_effect_errors) ? entry.side_effect_errors : [];
  return {
    kind: "result",
    result: {
      status: "SUCCESS",
      resetId,
      replayed: true,
      backupChannel: entry.backup_channel ?? null,
      webViewLink: entry.backup_file_url ?? null,
      deletedRecords: typeof entry.records_deleted_count === "number" ? entry.records_deleted_count : 0,
      ...(sideEffectErrors.length > 0 ? { sideEffectErrors } : {}),
      ...(entry.reset_level === "single_student"
        ? { resetScope: entry.reset_scope ?? null, sessionNumber: entry.session_number ?? null, resetTarget: entry.reset_target ?? null }
        : {}),
    },
  };
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
    // §ד / Appendix A: the server time the entry is written, epoch ms.
    created_at: input.now ?? Date.now(),
  };
}
