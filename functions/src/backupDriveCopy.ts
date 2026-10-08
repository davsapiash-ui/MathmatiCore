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
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { DRIVE_FOLDERS, baseName, parseGsUrl } from "./driveNames";

export interface PendingBackup {
  id: string;
  storagePath: string;
  fileName: string;
}

/** The entries whose backup is still only in Cloud Storage. */
export function pendingStorageBackups(entries: Array<{ id: string; data: Record<string, unknown> }>): PendingBackup[] {
  const out: PendingBackup[] = [];
  for (const { id, data } of entries) {
    if (data.backup_channel !== "storage") continue;
    if (data.backup_drive_copied_at !== undefined && data.backup_drive_copied_at !== null) continue;
    const gs = parseGsUrl(data.backup_file_url);
    if (!gs) continue;
    out.push({ id, storagePath: gs.path, fileName: baseName(gs.path) });
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
  const snap = await db.collection("reset_audit_log").where("backup_channel", "==", "storage").get();
  const pending = pendingStorageBackups(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
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
