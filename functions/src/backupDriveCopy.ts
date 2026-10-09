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
 * last run into their files (lateRecordings.ts), and then copies those files
 * to "3 גיבויים" too (owner decision 9.10.2026): each gs:// url in an entry's
 * late_recording_files is copied under its own file name, and on success the
 * url is replaced by the Drive link; the Storage copy is kept. What was copied
 * is recorded per file in late_recording_drive (its Storage url, Drive link and
 * the content's sha256), so a re-run never uploads the same content twice. A
 * file merged with newer chunks since its copy is uploaded again, and its new
 * Drive link replaces the old one in late_recording_files (the old Drive file
 * holds a subset and is left in place). A failed copy leaves the gs:// url,
 * and the entry's late_recording_drive_pending flag, for the next run.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { createHash } from "crypto";
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

/** Per file, what was copied to Drive: reset_audit_log/{id}.late_recording_drive.<key>. */
export const LATE_DRIVE_FIELD = "late_recording_drive";
/** Set while an entry's late_recording_files still holds a gs:// url; the daily query. */
export const LATE_DRIVE_PENDING_FIELD = "late_recording_drive_pending";

export interface LateDriveRecord {
  storage_url: string;
  drive_link: string;
  sha256: string;
  copied_at: number;
}

/** A Firestore-safe map key for a Storage path (the names hold spaces, dots and Hebrew). */
export function lateDriveKey(storagePath: string): string {
  return createHash("sha256").update(storagePath, "utf8").digest("hex").slice(0, 32);
}

export interface PendingLateCopy {
  entryId: string;
  storageUrl: string;
  storagePath: string;
  fileName: string;
  key: string;
  /** What an earlier run copied for this file, if anything. */
  copied: LateDriveRecord | null;
}

/** The late recording files still linked by their gs:// url. */
export function pendingLateRecordingCopies(entries: Array<{ id: string; data: Record<string, unknown> }>): PendingLateCopy[] {
  const out: PendingLateCopy[] = [];
  for (const { id, data } of entries) {
    const files = Array.isArray(data.late_recording_files) ? data.late_recording_files : [];
    const raw = data[LATE_DRIVE_FIELD];
    const tracked = (raw && typeof raw === "object" ? raw : {}) as Record<string, LateDriveRecord>;
    for (const url of files) {
      const gs = parseGsUrl(url);
      if (!gs) continue;
      const key = lateDriveKey(gs.path);
      out.push({ entryId: id, storageUrl: url as string, storagePath: gs.path, fileName: baseName(gs.path), key, copied: tracked[key] ?? null });
    }
  }
  return out;
}

/** late_recording_files after a copy: the gs:// url (and a superseded Drive link) out, the Drive link in, once. */
export function nextLateFiles(files: unknown[], storageUrl: string, driveLink: string, replaces: string | null): string[] {
  const next = files.filter((u): u is string => typeof u === "string" && u !== storageUrl && (replaces === null || u !== replaces));
  if (!next.includes(driveLink)) next.push(driveLink);
  return next;
}

export interface LateCopyDeps {
  readStorage: (path: string) => Promise<Buffer>;
  writeDrive: (buffer: Buffer, fileName: string) => Promise<{ success: boolean; webViewLink?: string; error?: string }>;
  /**
   * In one write: late_recording_files = nextLateFiles(…), late_recording_drive.<key> = record,
   * and late_recording_drive_pending = whether a gs:// url is left.
   */
  markLateCopied: (entryId: string, storageUrl: string, key: string, record: LateDriveRecord, replaces: string | null) => Promise<void>;
  now?: () => number;
}

/**
 * Copies each pending late recording file to Drive; one failure does not stop
 * the others. Content already copied (same sha256) is not uploaded again: only
 * its Drive link is put back in place of the gs:// url.
 */
export async function copyLateRecordingsToDrive(pending: PendingLateCopy[], deps: LateCopyDeps): Promise<{ copied: string[]; relinked: string[]; failed: string[] }> {
  const copied: string[] = [];
  const relinked: string[] = [];
  const failed: string[] = [];
  for (const p of pending) {
    try {
      const buffer = await deps.readStorage(p.storagePath);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      if (p.copied && p.copied.sha256 === sha256 && p.copied.drive_link) {
        await deps.markLateCopied(p.entryId, p.storageUrl, p.key, p.copied, null);
        relinked.push(p.storagePath);
        continue;
      }
      const res = await deps.writeDrive(buffer, p.fileName);
      if (!res.success || !res.webViewLink) throw new Error(res.error || "Drive upload failed");
      const record: LateDriveRecord = { storage_url: p.storageUrl, drive_link: res.webViewLink, sha256, copied_at: (deps.now ?? Date.now)() };
      await deps.markLateCopied(p.entryId, p.storageUrl, p.key, record, p.copied?.drive_link ?? null);
      copied.push(p.storagePath);
    } catch (err: any) {
      logger.warn(`Late recording ${p.storagePath} is still only in Cloud Storage: ${err?.message || err}`);
      failed.push(p.storagePath);
    }
  }
  return { copied, relinked, failed };
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
  const bucket = admin.storage().bucket();
  const readStorage = async (path: string) => (await bucket.file(path).download())[0];
  const writeDrive = (buffer: Buffer, fileName: string) =>
    uploadBufferToDrive(buffer, fileName, "application/json", DRIVE_FOLDERS.backups, { park: false });
  try {
    const lateSnap = await db.collection("reset_audit_log").where(LATE_DRIVE_PENDING_FIELD, "==", true).get();
    const latePending = pendingLateRecordingCopies(lateSnap.docs.map((d) => ({ id: d.id, data: d.data() })));
    if (latePending.length > 0) {
      const late = await copyLateRecordingsToDrive(latePending, {
        readStorage,
        writeDrive,
        markLateCopied: async (entryId, storageUrl, key, record, replaces) => {
          const ref = db.collection("reset_audit_log").doc(entryId);
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const current = snap.get("late_recording_files");
            const next = nextLateFiles(Array.isArray(current) ? current : [], storageUrl, record.drive_link, replaces);
            tx.update(ref, {
              late_recording_files: next,
              [`${LATE_DRIVE_FIELD}.${key}`]: record,
              [LATE_DRIVE_PENDING_FIELD]: next.some((u) => parseGsUrl(u) !== null),
            });
          });
        },
      });
      logger.info(`copyStorageBackupsToDrive: ${late.copied.length} late recording files copied to Drive, ${late.relinked.length} relinked, ${late.failed.length} still only in Storage.`);
    }
  } catch (err: any) {
    logger.error("copyStorageBackupsToDrive: the late recording files could not be copied to Drive (they stay in Cloud Storage):", err);
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
  const result = await copyPendingBackups(pending, {
    readStorage,
    writeDrive,
    markCopied: async (entryId, driveLink, at) => {
      await db.collection("reset_audit_log").doc(entryId).update({
        backup_file_url: driveLink,
        backup_drive_copied_at: at,
      });
    },
  });
  logger.info(`copyStorageBackupsToDrive: ${result.copied.length} copied, ${result.failed.length} still waiting.`);
});
