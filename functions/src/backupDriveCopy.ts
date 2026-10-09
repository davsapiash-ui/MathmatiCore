/**
 * PRD Module 23א §ג: "פעם ביום משימת שרת מעתיקה לתיקייה `3 גיבויים` בדרייב כל
 * גיבוי שנשמר רק ב-Cloud Storage, מעדכנת את הקישור ברישום האיפוס ומשאירה את
 * העותק ב-Cloud Storage".
 *
 * Every reset_audit_log entry with backup_channel 'storage' and no
 * backup_drive_copied_at is copied to Drive under its original file name; on
 * success the entry's backup_file_url becomes the Drive link and
 * backup_drive_copied_at is set. backup_channel stays 'storage' (where the
 * backup was written at reset time) and the Storage copy is kept.
 *
 * Entries written before backup_channel existed carry none; when their
 * backup_file_url is a gs:// url (the old code parked reset backups under
 * drive_fallback/), the backup is only in Storage too, and is copied the same
 * way.
 *
 * The same run first assembles the late recording chunks quarantined since the
 * last run into their files (lateRecordings.ts).
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { DRIVE_FOLDERS, baseName, parseGsUrl } from "./driveNames";
import { assembleLateRecordings, firebaseAssembleDeps } from "./lateRecordings";

export interface PendingBackup {
  id: string;
  storagePath: string;
  fileName: string;
}

/** The entries whose backup is still only in Cloud Storage. */
export function pendingStorageBackups(entries: Array<{ id: string; data: Record<string, unknown> }>): PendingBackup[] {
  const out: PendingBackup[] = [];
  for (const { id, data } of entries) {
    const legacy = (data.backup_channel === undefined || data.backup_channel === null) && data.backup_status === "success";
    if (data.backup_channel !== "storage" && !legacy) continue;
    if (data.backup_drive_copied_at !== undefined && data.backup_drive_copied_at !== null) continue;
    const gs = parseGsUrl(data.backup_file_url);
    if (!gs) continue;
    // drive_fallback/<date>/<ms>_<name>: the name without the time prefix.
    const name = gs.path.startsWith("drive_fallback/") ? baseName(gs.path).replace(/^\d{10,}_/, "") : baseName(gs.path);
    out.push({ id, storagePath: gs.path, fileName: name });
  }
  return out;
}

export interface CopyDeps {
  readStorage: (path: string) => Promise<Buffer>;
  writeDrive: (buffer: Buffer, fileName: string) => Promise<{ success: boolean; webViewLink?: string; error?: string }>;
  markCopied: (entryId: string, driveLink: string, at: number) => Promise<void>;
  now?: () => number;
}

/** Copies each pending backup; one failure does not stop the others. */
export async function copyPendingBackups(pending: PendingBackup[], deps: CopyDeps): Promise<{ copied: string[]; failed: string[] }> {
  const copied: string[] = [];
  const failed: string[] = [];
  for (const p of pending) {
    try {
      const buffer = await deps.readStorage(p.storagePath);
      const res = await deps.writeDrive(buffer, p.fileName);
      if (!res.success || !res.webViewLink) throw new Error(res.error || "Drive upload failed");
      await deps.markCopied(p.id, res.webViewLink, (deps.now ?? Date.now)());
      copied.push(p.id);
    } catch (err: any) {
      logger.warn(`Backup of ${p.id} is still only in Cloud Storage: ${err?.message || err}`);
      failed.push(p.id);
    }
  }
  return { copied, failed };
}

export const copyStorageBackupsToDrive = onSchedule({
  schedule: "every day 03:10",
  timeZone: "Asia/Jerusalem",
  region: "us-central1",
  timeoutSeconds: 540,
  memory: "1GiB",
}, async () => {
  // Loaded here: exportDriveReport pulls in the whole reset module.
  const { uploadBufferToDrive } = await import("./exportDriveReport");
  const db = admin.firestore();
  try {
    const late = await assembleLateRecordings(firebaseAssembleDeps());
    logger.info(`copyStorageBackupsToDrive: ${late.written.length} late recording files written, ${late.failed.length} still waiting.`);
  } catch (err: any) {
    logger.error("copyStorageBackupsToDrive: the late recordings could not be assembled (they stay in the quarantine):", err);
  }
  const [storageSnap, legacySnap] = await Promise.all([
    db.collection("reset_audit_log").where("backup_channel", "==", "storage").get(),
    db.collection("reset_audit_log").where("backup_status", "==", "success").get(),
  ]);
  const seen = new Set<string>();
  const entries = [...storageSnap.docs, ...legacySnap.docs]
    .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
    .map((d) => ({ id: d.id, data: d.data() }));
  const pending = pendingStorageBackups(entries);
  if (pending.length === 0) return;
  const bucket = admin.storage().bucket();
  const result = await copyPendingBackups(pending, {
    readStorage: async (path) => (await bucket.file(path).download())[0],
    writeDrive: (buffer, fileName) => uploadBufferToDrive(buffer, fileName, "application/json", DRIVE_FOLDERS.backups, { park: false }),
    markCopied: async (entryId, driveLink, at) => {
      await db.collection("reset_audit_log").doc(entryId).update({
        backup_file_url: driveLink,
        backup_drive_copied_at: at,
      });
    },
  });
  logger.info(`copyStorageBackupsToDrive: ${result.copied.length} copied, ${result.failed.length} still waiting.`);
});
