import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { requireAdmin, requireTeacherForIndividualData } from "./callerIdentity";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { computeToolMastery, truncatedRecordingMeetings, isScoredMeeting, TOOLS, computeFirstAttemptScore, readAllDocs, resolveCompulsoryTotal, sessionNumberFromId, studentNumberFromSessionId, summarizeMeeting, computeFadingGap, computeFlexibilityIndex, computeMediationEffectiveness, computePersistenceIndex, computeSelfCorrectionIndex, FLEXIBILITY_SESSIONS, resolveMeetingPath, meetingRunsByLearner, isAwaitingRerun } from "./meetingMetrics";
import { recomputeAdminMetrics } from "./adminAggregator";
import { containsPhoneNumber } from "./phonePattern";
import { scrubPII } from "./geminiProxy";
import { researchDetailsColumns, researchStampColumns } from "./researchTelemetryRow";
import { RECORDINGS_ROOT, withRecordings } from "./recordingsNode";
import { CATCHUP_COLLECTION, catchUpExportCells, type CatchUpRecord } from "./catchUp";
import { finishedMeetingRefusalHe, resolveActiveSessionNumber, resolveClassSessionNumber, validMeetingNumber } from "./resetMeetingTarget";
import { LATE_MARKERS_ROOT, lateRecordingMarkerRevert, lateRecordingMarkerUpdates } from "./lateRecordings";
import {
  DRIVE_FOLDERS,
  RESEARCH_FILE_LABELS,
  adminReportFileName,
  backupFileName,
  backupStoragePath,
  researchExportFileName,
  type BackupKind,
  type DriveFolderName,
} from "./driveNames";
import {
  ALL_LEARNERS,
  RESET_LOCK_REFUSAL_HE,
  acquireClassResetLock,
  deletionStatusAfter,
  exportAuditEntry,
  isClientResetId,
  isCompletedReset,
  releaseClassResetLock,
  replayOutcomeOfEntry,
  writeResetBackup,
  type BackupChannel,
  type DeletionStatus,
  type LockStore,
} from "./resetAudit";
import { compareTelemetryOrder } from "./telemetryOrder";

export { DRIVE_FOLDERS, researchExportFileName };

const GOOGLE_DRIVE_FOLDER_ID = "0AMiALsm_TxT5Uk9PVA";

/**
 * Generate a valid, robust PDF binary buffer with exact stream length positioning
 * containing full system metrics, governance audit & Google Drive target metadata.
 */
function createPDFBuffer(data: {
  schoolsCount: number;
  teachersCount: number;
  studentsCount: number;
  alertsCount: number;
  timestamp: string;
}): Buffer {
  const lines = [
    "BT",
    "/F1 18 Tf",
    "50 740 Td",
    "(MathmatiCore - Executive System & Governance Report) Tj",
    "/F1 10 Tf",
    "0 -24 Td",
    `(Export Date: ${data.timestamp}) Tj`,
    // PRD Module 24 §ב: counts only — no e-mail address, neither the admin's
    // nor the service account's.
    "0 -28 Td",
    "/F1 14 Tf",
    "(1. SYSTEM METRICS & INFRASTRUCTURE SUMMARY) Tj",
    "/F1 11 Tf",
    "0 -22 Td",
    `(- Total Active Partner Schools: ${data.schoolsCount}) Tj`,
    "0 -18 Td",
    `(- Registered Lead & System Teachers: ${data.teachersCount}) Tj`,
    "0 -18 Td",
    `(- Total Active Enrolled Students: ${data.studentsCount}) Tj`,
    "0 -18 Td",
    `(- Active Realtime Pedagogical Radar Alerts: ${data.alertsCount}) Tj`,
    // A "SECURITY & PRIVACY COMPLIANCE AUDIT" section used to sit here: four
    // hardcoded lines reading ENFORCED / COMPLIANT / ACTIVE, measured from
    // nothing. Two were untrue — the 30-day replay retention job does not
    // exist, and the institutional domain restriction was deliberately waived
    // by the product owner; the spec sets no domain filter. A governance report that
    // certifies controls nobody checked is worse than no report. The counts
    // above are real values the caller measured; nothing else is asserted.
    "ET"
  ];

  const streamContent = lines.join("\n");
  const streamLength = Buffer.byteLength(streamContent, "utf-8");

  const pdfHead = `%PDF-1.4
1 0 obj
<<
  /Type /Catalog
  /Pages 2 0 R
>>
endobj
2 0 obj
<<
  /Type /Pages
  /Kids [3 0 R]
  /Count 1
>>
endobj
3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /Resources <<
    /Font <<
      /F1 4 0 R
    >>
  >>
  /MediaBox [0 0 612 792]
  /Contents 5 0 R
>>
endobj
4 0 obj
<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica-Bold
>>
endobj
5 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
`;

  const obj1Offset = pdfHead.indexOf("1 0 obj");
  const obj2Offset = pdfHead.indexOf("2 0 obj");
  const obj3Offset = pdfHead.indexOf("3 0 obj");
  const obj4Offset = pdfHead.indexOf("4 0 obj");
  const obj5Offset = pdfHead.indexOf("5 0 obj");
  const startXrefOffset = pdfHead.length;

  const padOffset = (num: number) => String(num).padStart(10, "0");

  const pdfFull = `${pdfHead}xref
0 6
0000000000 65535 f 
${padOffset(obj1Offset)} 00000 n 
${padOffset(obj2Offset)} 00000 n 
${padOffset(obj3Offset)} 00000 n 
${padOffset(obj4Offset)} 00000 n 
${padOffset(obj5Offset)} 00000 n 
trailer
<<
  /Size 6
  /Root 1 0 R
>>
startxref
${startXrefOffset}
%%EOF
`;

  return Buffer.from(pdfFull, "utf-8");
}

/**
 * Retrieve Google Drive API Access Token with explicit Drive Scopes.
 */
async function getDriveAccessToken(): Promise<string | null> {
  try {
    // Loaded here, not at the top: every function instance loads index.js,
    // and the coaching card's instance never talks to Drive (cold start, 2.10.2026).
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
      ],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token || null;
  } catch (err: any) {
    logger.warn("GoogleAuth client error, using fallback admin credential:", err?.message || err);
    try {
      const credential = admin.app().options.credential;
      if (credential && "getAccessToken" in credential) {
        const tokenObj = await (credential as any).getAccessToken();
        return tokenObj.access_token || null;
      }
    } catch (adminErr) {
      logger.warn("Admin credential token error:", adminErr);
    }
  }
  return null;
}

/**
 * Cloud Function: exportAdminReportToDrive
 * Generates an executive PDF report and uploads it directly to Google Drive
 * folder "4 מנהל" (PRD Module 24 §ב): counts only, no e-mail address.
 */
export const exportAdminReportToDrive = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated to export reports.");
  }

  // Being signed in was the only gate. The login screen opens an anonymous
  // session before a child identifies, so any visitor could write PDFs into
  // the shared institutional Drive folder, append documents to /reports that
  // teachers read, and read back the folder id and the institutional address
  // from the response. This is the governance report: it belongs to the admin.
  requireAdmin(request.auth.token as Record<string, unknown>);

  // PRD Module 24 §ב: counts only. Anything that is not a whole number is
  // dropped to 0, so no text (an address included) can reach the PDF.
  const count = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };
  const schoolsCount = count(request.data?.schoolsCount);
  const teachersCount = count(request.data?.teachersCount);
  const studentsCount = count(request.data?.studentsCount);
  // Active radar alerts are counted here, from radar_alerts (cleared by the
  // alerts reset): the admin console does not read that node.
  let alertsCount = count(request.data?.alertsCount);
  try {
    const alertsSnap = await admin.database().ref("radar_alerts").get();
    if (alertsSnap.exists()) alertsCount = alertsSnap.numChildren();
    else alertsCount = 0;
  } catch (err: any) {
    logger.warn(`Admin report: radar_alerts could not be counted: ${err?.message || err}`);
  }

  const now = Date.now();
  const timestampStr = new Date(now).toISOString();
  // PRD Module 24 §ב: "דוח מנהל DD.MM.YYYY.pdf" in the flat folder "4 מנהל".
  const fileName = adminReportFileName(now);

  logger.info(`Generating the admin report PDF into the Drive folder "${DRIVE_FOLDERS.admin}"`);

  const pdfBuffer = createPDFBuffer({
    schoolsCount,
    teachersCount,
    studentsCount,
    alertsCount,
    timestamp: timestampStr,
  });

  // The admin report is not parked in Storage: the admin is told it failed.
  const upload = await uploadBufferToDrive(pdfBuffer, fileName, "application/pdf", DRIVE_FOLDERS.admin, { park: false });
  const uploaded = upload.success;
  const driveFileId = upload.success ? upload.fileId : "";
  const webViewLink = upload.success ? upload.webViewLink : "";
  if (!uploaded) logger.warn(`Admin report Drive upload failed: ${upload.error}`);

  // Report metadata. Counts only: no e-mail address anywhere (PRD Module 24 §ב, 23א §ד).
  let auditLogged = false;
  try {
    const db = admin.firestore();
    await db.collection("reports").add({
      fileName,
      fileId: driveFileId,
      driveFolder: DRIVE_FOLDERS.admin,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      webViewLink,
      metrics: {
        schoolsCount,
        teachersCount,
        studentsCount,
        alertsCount,
      },
    });
    auditLogged = true;
  } catch (dbErr) {
    logger.warn("Report Firestore log note:", dbErr);
  }

  // Say what actually happened; never hand the caller a folder id or an address.
  if (!uploaded) {
    throw new HttpsError("unavailable", "הדוח נוצר אך העלאתו ל-Drive נכשלה. לא נשמר קובץ.");
  }

  return {
    status: "SUCCESS",
    fileName,
    fileId: driveFileId,
    webViewLink,
    auditLogged,
  };
});

/**
 * PRD Module 23, "תיקיות הדרייב": four flat folders in the researcher's root
 * folder (DRIVE_FOLDERS, driveNames.ts), created on first write, with no
 * sub-folders. Resolves one of them by name; null when Drive cannot be reached
 * or the folder can neither be found nor created — a file is then never
 * written to the root instead.
 */
export async function resolveDriveFolder(folderName: DriveFolderName): Promise<string | null> {
  try {
    const accessToken = await getDriveAccessToken();
    if (!accessToken) return null;
    return await getOrCreateDriveFolder(folderName, GOOGLE_DRIVE_FOLDER_ID, accessToken);
  } catch (err: any) {
    logger.warn(`Drive folder "${folderName}" could not be resolved:`, err?.message || err);
    return null;
  }
}

/**
 * נפילה חזרה לאחסון כשהדרייב לא זמין (החלטת בעל המוצר, 23.9.2026).
 *
 * הדוחות והגיבויים נוצרים **בשרת**, לא במחשב של בעל המוצר — ולכן "אין
 * רשת אצלי" אינו התרחיש (בלי רשת אי אפשר בכלל ללחוץ על הכפתור). התרחיש
 * האמיתי הוא שהשרת אינו מצליח לכתוב לדרייב: פג תוקף ההרשאה, מכסה, או
 * תקלה ב-API. עד כה הקובץ נוצר ונזרק.
 *
 * הקובץ נשמר עכשיו ב-Cloud Storage — אותו מרכז נתונים, בלי תלות ב-API
 * של דרייב — ומחכה שם. הורדה ישירה לדפדפן הייתה עובדת רק אם בעל המוצר
 * יושב מול המסך באותו רגע; כאן הקובץ נשאר גם אם ייכנס מחר.
 */
const DRIVE_FALLBACK_PREFIX = "drive_fallback";

export async function uploadBufferToFallbackStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  driveError: string
): Promise<{ storagePath: string; downloadUrl: string | null }> {
  const safeName = fileName.replace(/[^\w.\u0590-\u05FF-]+/g, "_");
  const storagePath = `${DRIVE_FALLBACK_PREFIX}/${new Date().toISOString().slice(0, 10)}/${Date.now()}_${safeName}`;
  const file = admin.storage().bucket().file(storagePath);

  await file.save(buffer, {
    contentType: mimeType,
    metadata: {
      metadata: {
        drive_error: driveError.slice(0, 500),
        original_name: fileName,
        saved_at: String(Date.now()),
      },
    },
  });

  // קישור חתום לשבוע — מספיק זמן להוריד בלי להשאיר קובץ פתוח לעד.
  let downloadUrl: string | null = null;
  try {
    const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    downloadUrl = url;
  } catch (err) {
    logger.warn("Drive fallback: the file was saved but no signed link could be issued", err);
  }

  logger.warn(`Drive upload failed for ${fileName}; the file is waiting at ${storagePath}. Drive said: ${driveError}`);
  return { storagePath, downloadUrl };
}

export interface DriveUploadOptions {
  /**
   * When Drive refuses the file, keep it in Cloud Storage under drive_fallback/
   * (default true, for reports and exports). A reset backup passes false: its
   * own fallback is backups/{class_id}/ (Module 23א §ג).
   */
  park?: boolean;
  /** Aborts the Drive requests (the reset backup's 90-second limit). */
  signal?: AbortSignal;
}

export type DriveUploadResult = { success: boolean; fileId: string; webViewLink: string; error?: string; fallbackStoragePath?: string; fallbackDownloadUrl?: string | null };

/**
 * Upload a buffer into one of the four flat Drive folders. Every call creates
 * a new file: a regenerated report or a re-export never overwrites the
 * previous file (PRD Module 23, "תיקיות הדרייב").
 */
export async function uploadBufferToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderName: DriveFolderName,
  options: DriveUploadOptions = {}
): Promise<DriveUploadResult> {
  const park = options.park !== false;
  /** הקובץ לעולם אינו נזרק: מה שהדרייב דחה נשמר באחסון וממתין. */
  const parkInStorage = async (reason: string): Promise<DriveUploadResult> => {
    if (!park) return { success: false, fileId: '', webViewLink: '', error: reason };
    try {
      const parked = await uploadBufferToFallbackStorage(buffer, fileName, mimeType, reason);
      return { success: false, fileId: '', webViewLink: '', error: reason, fallbackStoragePath: parked.storagePath, fallbackDownloadUrl: parked.downloadUrl };
    } catch (err: any) {
      logger.error(`Drive fallback also failed for ${fileName}:`, err);
      return { success: false, fileId: '', webViewLink: '', error: `${reason} | fallback failed: ${err?.message || String(err)}` };
    }
  };

  try {
    const accessToken = await getDriveAccessToken();
    if (!accessToken) {
      return await parkInStorage('Google Drive access token unavailable');
    }
    if (options.signal?.aborted) return await parkInStorage('Drive upload aborted');
    const parentFolderId = await getOrCreateDriveFolder(folderName, GOOGLE_DRIVE_FOLDER_ID, accessToken, options.signal);
    if (!parentFolderId) {
      return await parkInStorage(`Drive folder "${folderName}" could not be found or created`);
    }

    const metadata = { name: fileName, mimeType, parents: [parentFolderId] };
    // The folder, and nowhere else in Drive: no second upload without a parent
    // (it used to land in the service account's own Drive, where nobody sees it).
    const response = buffer.length > DRIVE_MULTIPART_MAX_BYTES
      ? await resumableDriveUpload(accessToken, metadata, buffer, mimeType, options.signal)
      : await multipartDriveUpload(accessToken, metadata, buffer, mimeType, options.signal);

    if (response.ok) {
      const resData = await response.json();
      if (!resData.id) return await parkInStorage("Drive API returned no file id");
      return { success: true, fileId: resData.id, webViewLink: `https://drive.google.com/file/d/${resData.id}/view` };
    }
    const errText = await response.text();
    return await parkInStorage(`Drive API ${response.status}: ${errText}`);
  } catch (err: any) {
    return await parkInStorage(err?.message || String(err));
  }
}

/**
 * Google documents the multipart upload for files of 5 MB or less and the
 * resumable upload above that; a large reset backup sent as multipart never
 * reached Drive and was retried by the daily job every day.
 */
export const DRIVE_MULTIPART_MAX_BYTES = 5 * 1024 * 1024;

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?supportsAllDrives=true&supportsTeamDrives=true";

async function multipartDriveUpload(accessToken: string, metadata: Record<string, unknown>, buffer: Buffer, mimeType: string, signal?: AbortSignal): Promise<Response> {
  const boundary = "mathmaticore_upload_boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const multipartBody = Buffer.concat([
    Buffer.from(`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`),
    Buffer.from(`${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${buffer.toString("base64")}`),
    Buffer.from(closeDelimiter),
  ]);
  return fetch(`${DRIVE_UPLOAD_URL}&uploadType=multipart`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipartBody,
    signal,
  });
}

/** A resumable upload session: the metadata first, then the whole file in one PUT. */
async function resumableDriveUpload(accessToken: string, metadata: Record<string, unknown>, buffer: Buffer, mimeType: string, signal?: AbortSignal): Promise<Response> {
  const start = await fetch(`${DRIVE_UPLOAD_URL}&uploadType=resumable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(buffer.length),
    },
    body: JSON.stringify(metadata),
    signal,
  });
  const session = start.ok ? start.headers.get("location") : null;
  if (!session) return start.ok ? new Response("Drive returned no upload session", { status: 502 }) : start;
  return fetch(session, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(buffer.length) },
    body: buffer as unknown as BodyInit,
    signal,
  });
}

export const VALID_RESET_REASONS = [
  'technical_fault',
  'student_stuck',
  'restart_session',
  'test_run',
  'other',
] as const;

export type ResetReason = typeof VALID_RESET_REASONS[number];

/**
 * A class identifier, as sessionTrigger.ts accepts one. Both callables below
 * store class_id in reset_audit_log, and the reset uses it in the backup's
 * Storage path and Drive file name; it came straight off the request.
 */
export const CLASS_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** The teacher's free-text reset note is short prose, never a document. */
export const REASON_NOTE_MAX_LENGTH = 500;

/** class_id from a request: absent means the pilot class; anything else must match the pattern. */
export function validateClassId(raw: unknown, refusal: string): string {
  const value = raw === undefined || raw === null ? "class_1" : raw;
  if (typeof value !== "string" || !CLASS_ID_PATTERN.test(value)) {
    throw new HttpsError("invalid-argument", refusal);
  }
  return value;
}

/**
 * PRD Module 23א §ו and Module 24: a teacher acts on her own assigned class
 * only. The same check exportResearchDataset has always made: a token that
 * names a class may act on that class and on no other.
 */
export function assertCallerClass(token: Record<string, unknown>, classId: string, refusal: string): void {
  const callerClassId = token.class_id;
  if (callerClassId && callerClassId !== classId) {
    throw new HttpsError("permission-denied", refusal);
  }
}

/**
 * The reset note goes into the audit log, the backup file and the research
 * export. The client checks it for names (ResetConfirmationModal); the server
 * stored whatever arrived. Absent or blank is null; anything but a string is
 * refused; the text is capped and passes the chat's PII scrubber (Zero-PII,
 * Module 3).
 */
export function sanitizeReasonNote(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "הערת האיפוס חייבת להיות טקסט. לא נמחקו נתונים.");
  }
  // Capped before scrubbing, to bound the regex work, and again after: a
  // redaction marker can be longer than what it replaced.
  const trimmed = raw.trim().slice(0, REASON_NOTE_MAX_LENGTH * 2);
  if (!trimmed) return null;
  return scrubPII(trimmed).slice(0, REASON_NOTE_MAX_LENGTH);
}

export interface ResetAuditEntry {
  reset_id: string;
  reset_level: 'alerts' | 'single_student' | 'system' | 'export';
  performed_by_teacher_id: string;
  performed_at: number;
  class_id: string;
  affected_student_ids: number[];
  backup_file_url: string | null;
  backup_status: 'success' | 'failed' | 'not_required';
  reset_reason: ResetReason;
  reason_note: string | null;
  records_deleted_count: number;
  /** Level 2 only: what the teacher chose to reset (PRD §ב.2 default is the active meeting). */
  reset_scope?: SingleStudentResetScope;
  /** Level 2 with reset_scope 'active_session': the meeting that was restarted. */
  session_number?: number | null;
  /** Level 2 only: one learner, or the whole class at once (register, deviation 20). */
  reset_target?: ResetTarget;
  /** Where the backup was written (Module 23א §ג). */
  backup_channel?: BackupChannel | null;
  /** Set by the daily job when a Storage-only backup reaches Drive. */
  backup_drive_copied_at?: number | null;
  /** Only 'completed' counts as a reset in reports and exports (§ד). */
  deletion_status?: DeletionStatus;
  /**
   * Server time the entry was written, epoch ms (PRD 23א §ד, Appendix A).
   * Entries written before 9.10.2026 hold a Firestore Timestamp here; every
   * reader takes both (the research export writes either as ISO text).
   */
  created_at: number;
  /** Links to the "הקלטה שהגיעה אחרי האיפוס - …json" files of this reset (§ג). */
  late_recording_files?: string[];
  /** Follow-up steps that failed after the deletion (§ד). */
  side_effect_errors?: string[];
}

/**
 * PRD Module 23א §ב.2 restarts "the active meeting" of one learner; the
 * product owner (9.9.2026) asked that the teacher be able to choose between
 * that and a complete reset of the learner. 'active_session' is the default.
 */
export type SingleStudentResetScope = 'active_session' | 'full_student';
export const SINGLE_STUDENT_RESET_SCOPES: readonly SingleStudentResetScope[] = ['active_session', 'full_student'];

/**
 * Who a level-2 reset covers. The product owner (14.9.2026, confirmed
 * 18.9.2026; register deviation 20) added 'class': restart the active meeting
 * for all 12 learners in one action, for the lesson that fell apart (network
 * down) where twelve confirmation dialogs are not an option. 'class' exists
 * only with reset_scope 'active_session' — wiping every learner completely is
 * level 3, and §ב forbids merging the levels.
 */
export type ResetTarget = 'student' | 'class';
export const RESET_TARGETS: readonly ResetTarget[] = ['student', 'class'];

/**
 * Module 23א: backupAndResetSessionData
 * Enforces strict Backup-Before-Delete sequencing:
 * 1. Build the reset scope (buildResetScope) and collect ALL of it — every
 *    RTDB node and every Firestore document, no page limits — into one
 *    structured snapshot (collectResetBackup).
 * 2. Upload the JSON snapshot to the shared Drive folder, with Cloud Storage
 *    as the one fallback (register gap יב).
 * 3. Write the audit entry into reset_audit_log. If it cannot be written, the
 *    reset is aborted: §ד forbids a reset without its record.
 * 4. Only then delete that same scope (executeResetDeletion), and record the
 *    real number deleted on the entry.
 * 5. If backup fails, abort deletion immediately with exact Hebrew error message.
 */
// A system-level backup reads every learner record, every session and the
// whole chat log out of RTDB, serialises them, and (for Drive) base64-encodes
// the result — several copies of the snapshot in memory at once. The callable
// defaults (60 s, 256 MiB) were enough for an empty class and not for a class
// that has been used; the function then died mid-flight and the client saw a
// bare "internal" with no message. Give it room, and turn anything that still
// escapes the guarded steps into an error that says what happened.
const RESET_RUNTIME = { timeoutSeconds: 540, memory: "2GiB" as const };

export const backupAndResetSessionData = onCall(RESET_RUNTIME, async (request) => {
  try {
    return await runBackupAndReset(request);
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    logger.error("backupAndResetSessionData failed outside its guarded steps:", err);
    throw new HttpsError(
      "internal",
      `שגיאה פנימית באיפוס: ${err?.message || String(err)}. לא נמחקו נתונים.`
    );
  }
});

async function runBackupAndReset(request: CallableRequest<any>) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { reset_level, reason, student_id, reset_scope, session_number, reset_target } = request.data || {};
  const class_id = validateClassId(request.data?.class_id, "מזהה הכיתה אינו תקין. האיפוס בוטל ולא נמחקו נתונים.");
  const reason_note = sanitizeReasonNote(request.data?.reason_note);

  if (!reset_level || !['alerts', 'single_student', 'system'].includes(reset_level)) {
    throw new HttpsError("invalid-argument", "Invalid reset_level. Must be 'alerts', 'single_student', or 'system'.");
  }

  if (!reason || !VALID_RESET_REASONS.includes(reason)) {
    throw new HttpsError("invalid-argument", `Invalid reset reason. Must be one of: ${VALID_RESET_REASONS.join(', ')}`);
  }
  if (reset_scope !== undefined && !SINGLE_STUDENT_RESET_SCOPES.includes(reset_scope)) {
    throw new HttpsError("invalid-argument", "Invalid reset_scope. Must be 'active_session' or 'full_student'.");
  }
  if (reset_target !== undefined && !RESET_TARGETS.includes(reset_target)) {
    throw new HttpsError("invalid-argument", "Invalid reset_target. Must be 'student' or 'class'.");
  }
  if (reset_target === 'class' && reset_level !== 'single_student') {
    throw new HttpsError("invalid-argument", "reset_target 'class' belongs to reset_level 'single_student' (level 2) only.");
  }
  const isClassTarget = reset_level === 'single_student' && reset_target === 'class';
  if (isClassTarget && reset_scope === 'full_student') {
    throw new HttpsError(
      "invalid-argument",
      "איפוס לכל הכיתה מאפס את המפגש הפעיל בלבד. למחיקת כל נתוני הכיתה יש להשתמש באיפוס מערכת (רמה 3)."
    );
  }

  // PRD Module 23א §F: learning-data resets belong to the class teacher; a
  // system-admin identity is blocked (class-isolation principle).
  //
  // The check is on the TEACHER claim, not on the presence of an admin claim.
  // An admin sign-in carries no teacher claim (roleClaims.ts); the owner
  // signed in as the teacher carries the teacher's claims and may reset.
  const token = request.auth.token as Record<string, unknown>;
  const isTeacherIdentity =
    token.teacher === true ||
    token.role === 'teacher' ||
    (Array.isArray(token.roles) && token.roles.includes('TEACHER'));
  // Module 23א §ו gives all THREE levels to the class teacher. Level 1 used to
  // skip this check: any signed-in identity — a learner's anonymous session
  // included — could clear the radar's help signals mid-lesson and write its own
  // free text into the immutable audit log.
  if (!isTeacherIdentity) {
    logger.warn(`Non-teacher identity ${request.auth.uid} (role=${String(token.role)}) attempted a ${reset_level} reset, denied.`);
    throw new HttpsError(
      "permission-denied",
      "איפוס נתוני למידה מותר למורת הכיתה בלבד (מודול 23א)."
    );
  }
  // Module 23א §ו: "for the class assigned to her only". exportResearchDataset
  // checked this; the reset, the one callable here that deletes, did not.
  assertCallerClass(token, class_id, "אפשר לאפס רק את הכיתה המשויכת לחשבון המחובר. לא נמחקו נתונים.");

  const performedBy = request.auth.uid;
  const rtdb = admin.database();
  const db = admin.firestore();
  // PRD 23א §ז: the outcome reaches the teacher when her connection returns.
  // Her dashboard names the reset (reset_id) and reads reset_audit_log/{id}
  // when it can; the id is the entry's document id. A request that carries
  // the id of a reset already logged never runs a second reset: it gets that
  // reset's outcome.
  const requestedResetId = request.data?.reset_id;
  if (requestedResetId !== undefined && requestedResetId !== null && !isClientResetId(requestedResetId)) {
    throw new HttpsError("invalid-argument", "מזהה האיפוס אינו תקין. האיפוס בוטל ולא נמחקו נתונים.");
  }
  const clientNamedReset = isClientResetId(requestedResetId);
  const resetId = clientNamedReset
    ? requestedResetId
    : `reset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  if (clientNamedReset) {
    const replayed = await replayLoggedReset(db, resetId, class_id);
    if (replayed) return replayed;
  }

  return resetUnderLock(request, {
    reset_level, reason, student_id, reset_scope, session_number,
    class_id, reason_note, isClassTarget, performedBy, rtdb, db, resetId, clientNamedReset,
  });
}

/**
 * §ז: when reset_audit_log already holds an entry under this reset id, the
 * reset ran (or was refused after its backup) before: its outcome, as a
 * result or as the same refusal. Null when no entry exists — the reset may run.
 */
async function replayLoggedReset(db: admin.firestore.Firestore, resetId: string, classId: string): Promise<Record<string, unknown> | null> {
  let snap: admin.firestore.DocumentSnapshot;
  try {
    snap = await db.collection("reset_audit_log").doc(resetId).get();
  } catch (err: any) {
    logger.error(`Reset ${resetId}: reset_audit_log could not be read to check for an earlier run; nothing is done:`, err);
    throw new HttpsError("aborted", "לא ניתן היה להתחיל את האיפוס כעת. נסו שוב בעוד רגע. לא נמחקו נתונים.");
  }
  if (!snap.exists) return null;
  const outcome = replayOutcomeOfEntry(snap.data() || {}, classId);
  logger.info(`Reset ${resetId} was already logged; returning its outcome instead of running it again.`);
  if (outcome.kind === "result") return outcome.result;
  throw new HttpsError(outcome.code, outcome.message, outcome.details);
}

/**
 * Module 23א §ד: "בכל רגע מתבצע לכל היותר איפוס אחד לכל כיתה: בקשת איפוס
 * נוספת לאותה כיתה בזמן שאיפוס מתבצע נדחית לפני הגיבוי". Taken after the
 * request is validated and its target meeting resolved (those refusals delete
 * nothing), and before anything is collected; released when the reset ends.
 */
async function withClassResetLock<T>(db: admin.firestore.Firestore, classId: string, resetId: string, clientNamedReset: boolean, fn: () => Promise<T>): Promise<T> {
  let locked: boolean;
  try {
    locked = await acquireClassResetLock(db as unknown as LockStore, classId, resetId);
  } catch (lockErr: any) {
    logger.error(`Reset ${resetId}: the class reset lock could not be taken:`, lockErr);
    // 'aborted', not 'unavailable': the client reads 'unavailable' as "the
    // reset may still be running", and here nothing started.
    throw new HttpsError("aborted", "לא ניתן היה להתחיל את האיפוס כעת. נסו שוב בעוד רגע. לא נמחקו נתונים.");
  }
  if (!locked) {
    throw new HttpsError("failed-precondition", RESET_LOCK_REFUSAL_HE, { reason: "reset_in_progress" });
  }
  try {
    // The same reset id, sent again while the first request still held the
    // lock: by now that request may have logged it. Never a second run.
    if (clientNamedReset) {
      const replayed = await replayLoggedReset(db, resetId, classId);
      if (replayed) return replayed as T;
    }
    return await fn();
  } finally {
    await releaseClassResetLock(db as unknown as LockStore, classId, resetId)
      .catch((err) => logger.error(`Reset ${resetId}: the class reset lock could not be released (it expires by itself):`, err));
  }
}

interface ResetContext {
  reset_level: 'alerts' | 'single_student' | 'system';
  reason: ResetReason;
  student_id: unknown;
  reset_scope: SingleStudentResetScope | undefined;
  session_number: unknown;
  class_id: string;
  reason_note: string | null;
  isClassTarget: boolean;
  performedBy: string;
  rtdb: admin.database.Database;
  db: admin.firestore.Firestore;
  resetId: string;
  /** The dashboard named this reset (reset_id): a repeat of it never runs twice (§ז). */
  clientNamedReset: boolean;
}

async function resetUnderLock(_request: CallableRequest<any>, ctx: ResetContext) {
  const {
    reset_level, reason, student_id, reset_scope, session_number,
    class_id, reason_note, isClassTarget, performedBy, rtdb, db, resetId, clientNamedReset,
  } = ctx;

  // Level 1: Alerts only (no destructive workspace/session deletion, but mandatory audit log)
  if (reset_level === 'alerts') {
    // Module 23א §ד: no reset of any kind without its record. The entry is
    // written first; if it cannot be written, nothing is cleared.
    const auditEntry: ResetAuditEntry = {
      reset_id: resetId,
      reset_level: 'alerts',
      performed_by_teacher_id: performedBy,
      performed_at: Date.now(),
      class_id,
      // §ב.1: "איפוס התראות חל תמיד על כל הכיתה, ואין לו יעד של לומד בודד".
      // A student_id in the request used to be logged as the only learner
      // affected, while all twelve learners' alerts were cleared.
      affected_student_ids: [...ALL_STUDENT_IDS],
      backup_file_url: null,
      backup_status: 'not_required',
      reset_reason: reason,
      reason_note,
      records_deleted_count: 0,
      deletion_status: 'not_required',
      created_at: Date.now(),
    };
    try {
      await db.collection("reset_audit_log").doc(resetId).set(auditEntry);
    } catch (auditErr) {
      logger.error("Failed to write the alerts-reset audit entry; nothing was cleared:", auditErr);
      throw new HttpsError("failed-precondition", "רישום האיפוס ביומן הביקורת נכשל, ולכן האיפוס בוטל. ההתראות לא אופסו.");
    }
    try {
      await rtdb.ref("radar_alerts").remove().catch(() => {});
      // Clear the per-student alert flags too — the alerts feed alone isn't
      // the whole radar state; each student's own record carries its own
      // help/hand/struggling flags that must return to default as well.
      const alertClearPayload = {
        helpRequested: false,
        handRaised: false,
        isStruggling: false,
        isSocraticActive: false,
        last_alert: null,
      };
      // Only records that exist: an update on a missing key creates it, and
      // this used to leave an empty help-flags record under three aliases for
      // every learner who had never signed in (live reset audit, 2.10.2026).
      const learnersSnap = await rtdb.ref("users/students").get();
      const learners: Record<string, unknown> = (learnersSnap.exists() ? learnersSnap.val() : null) || {};
      const existingAliases = ALL_STUDENT_IDS
        .flatMap((n) => studentAliases(String(n)))
        .filter((alias) => learners[alias] !== undefined && learners[alias] !== null);
      await Promise.all(
        existingAliases.map((alias) =>
          rtdb.ref(`users/students/${alias}`).update(alertClearPayload).catch(() => {})
        )
      );
      return { status: "SUCCESS", message: "התראות אופסו בהצלחה ותועדו בלוג." };
    } catch (e: any) {
      logger.error("Error resetting alerts:", e);
      throw new HttpsError("internal", "איפוס התראות נכשל.");
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Levels 2 & 3 — backup-before-delete (PRD Module 23א §ג).
  //
  // One manifest (the reset "scope") says exactly what a reset covers. The
  // backup reads that manifest, the deletion deletes that same manifest, and
  // the audit entry counts what was actually deleted — so what is backed up
  // and what is deleted can never drift apart, and nothing is deleted that
  // was not first written to the backup file.
  // ───────────────────────────────────────────────────────────────────────
  const isOneLearner = reset_level === 'single_student' && !isClassTarget;
  const rawNum = isOneLearner ? String(student_id ?? '').replace(/\D/g, '') : '';
  if (isOneLearner && (!rawNum || parseInt(rawNum, 10) < 1 || parseInt(rawNum, 10) > 12)) {
    throw new HttpsError("invalid-argument", "student_id (1-12) is required for single_student reset.");
  }
  const affectedStudentIds = isOneLearner ? [parseInt(rawNum, 10)] : [...ALL_STUDENT_IDS];
  // Level 2 defaults to the PRD's "restart the active meeting"; the teacher may
  // ask for the whole learner instead.
  const singleScope: SingleStudentResetScope = reset_level === 'single_student' ? (reset_scope || 'active_session') : 'full_student';
  // The meeting is decided here, never taken from the request: the class's
  // meeting only while it is open now, else the meeting the learner is in
  // (resetMeetingTarget.ts). A class has no learner fallback — twelve learners
  // may each be somewhere else — so the whole-class restart needs a meeting
  // the teacher actually has open.
  const learnerTarget = isOneLearner && singleScope === 'active_session'
    ? await resolveActiveSessionNumber(rtdb, rawNum)
    : null;
  // No meeting open, and the learner already finished the last meeting they
  // entered: they are between meetings, not in one (resetMeetingTarget.ts, step 4).
  if (learnerTarget?.finished) {
    throw new HttpsError("failed-precondition", `${finishedMeetingRefusalHe(rawNum, learnerTarget.sessionNumber)} לא נמחקו נתונים.`);
  }
  const activeSessionNumber = isClassTarget
    ? await resolveClassSessionNumber(rtdb)
    : learnerTarget?.sessionNumber ?? null;
  if (isClassTarget && activeSessionNumber === null) {
    throw new HttpsError(
      "failed-precondition",
      "אין מפגש פתוח לכיתה. איפוס המפגש לכל הכיתה אפשרי רק כשמפגש פתוח. לא נמחקו נתונים."
    );
  }
  // Register deviation 10: with no open meeting, the meeting the learner is in.
  // When the learner's record names none either, there is no meeting to
  // restart — refuse before anything is collected, written or deleted, instead
  // of restarting meeting 1.
  if (isOneLearner && singleScope === 'active_session' && activeSessionNumber === null) {
    throw new HttpsError(
      "failed-precondition",
      "אין מפגש פתוח לכיתה, ולא ידוע באיזה מפגש התלמיד נמצא, ולכן אין מפגש לאפס. לא נמחקו נתונים."
    );
  }
  // PRD 23א §ה: the dialog spelled out which meeting is deleted, and sent it.
  // When the server's answer differs, the teacher confirmed something else —
  // refuse, and let her look again. It differs when a meeting was opened or
  // closed meanwhile, and also when the open meeting had already ended by time
  // and the dashboard did not know it yet (before it has the server's clock it
  // reads a never-closed record as open): the message covers both.
  const requestedSession = validMeetingNumber(session_number);
  if (activeSessionNumber !== null && requestedSession !== null && requestedSession !== activeSessionNumber) {
    throw new HttpsError(
      "failed-precondition",
      `חלון האישור הציג את מפגש ${requestedSession}, אבל המפגש שיאופס עכשיו הוא מפגש ${activeSessionNumber}: בינתיים מפגש נפתח או נסגר לכיתה, או שהמפגש נסגר מעצמו כשנגמר הזמן שלו. סגרו את החלון ופתחו אותו שוב. לא נמחקו נתונים.`
    );
  }
  const resetTarget: ResetTarget = isClassTarget ? 'class' : 'student';
  const level2Audit = reset_level === 'single_student'
    ? { reset_scope: singleScope, session_number: activeSessionNumber, reset_target: resetTarget }
    : {};
  return withClassResetLock(db, class_id, resetId, clientNamedReset, async () => {
    const scope = withCatchUpRecords(buildResetScope(reset_level, rawNum, singleScope, activeSessionNumber, resetTarget));
    const performedAt = Date.now();

    // Step 0 (Module 23א §ג, Module 21): a full learner reset or a system reset
    // marks the recordings it is about to delete BEFORE it collects the backup
    // (lateRecordings.ts). Chunks that arrive while the backup is collected and
    // written (up to 90 s for Drive), or from a device that has not yet learned
    // of the reset, are then quarantined into "הקלטה שהגיעה אחרי האיפוס"
    // instead of being deleted with no backup or recreating the recording.
    // Every abort before the deletion restores the markers it found; without
    // the marker nothing is deleted.
    const fullReset = reset_level === 'system' || singleScope === 'full_student';
    let markersBefore: Record<string, unknown> | null = null;
    const markerWrites: Record<string, unknown> = {};
    let classStartedAt: number | null = null;
    let openMeeting: number | null = null;
    const revertMarkers = async () => {
      if (Object.keys(markerWrites).length === 0) return;
      await rtdb.ref().update(lateRecordingMarkerRevert(markersBefore, markerWrites))
        .catch((err) => logger.error(`Reset ${resetId}: the late-recording markers could not be restored:`, err));
    };
    const writeMarkers = async (rtdbBackup: Record<string, unknown> | null) => {
      const updates = lateRecordingMarkerUpdates({
        resetId, classId: class_id, performedAt, learners: affectedStudentIds, rtdbBackup, classStartedAt, meeting: openMeeting,
      });
      await rtdb.ref().update(updates);
      Object.assign(markerWrites, updates);
    };
    if (fullReset) {
      try {
        markersBefore = (await rtdb.ref(LATE_MARKERS_ROOT).get()).val();
        const cls = (await rtdb.ref("active_class_session").get()).val() || {};
        classStartedAt = typeof cls.startedAt === 'number' ? cls.startedAt : null;
        openMeeting = cls.active === true && typeof cls.sessionNumber === 'number' ? cls.sessionNumber : null;
        await writeMarkers(null);
      } catch (err: any) {
        logger.error(`Reset ${resetId}: the late-recording markers could not be written; nothing is collected or deleted:`, err);
        await revertMarkers();
        throw new HttpsError("aborted", "לא ניתן היה להכין את האיפוס כעת. נסו שוב בעוד רגע. לא נמחקו נתונים.");
      }
    }

    // Step 1: collect everything in scope into one structured snapshot.
    let backup: ResetBackupFile;
    try {
      backup = await collectResetBackup(rtdb, db, scope, {
        reset_id: resetId,
        reset_level,
        class_id,
        affected_student_ids: affectedStudentIds,
        performed_by_teacher_id: performedBy,
      });
    } catch (err: any) {
      logger.error("Failed to collect data for backup:", err);
      // Module 23א §ד: a reset that was attempted is recorded, also when it failed.
      await db.collection("reset_audit_log").doc(resetId).set({
        reset_id: resetId,
        reset_level,
        performed_by_teacher_id: performedBy,
        performed_at: Date.now(),
        class_id,
        affected_student_ids: affectedStudentIds,
        backup_file_url: null,
        backup_status: 'failed',
        reset_reason: reason,
        reason_note,
        records_deleted_count: 0,
        backup_channel: null,
        deletion_status: 'not_required',
        ...level2Audit,
        created_at: Date.now(),
      }).catch((auditErr) => logger.error("Failed to write the failed-reset audit entry:", auditErr));
      await revertMarkers();
      throw new HttpsError("internal", "הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.");
    }

    // Step 2: write the backup (PRD Module 23א §ג). Drive folder "3 גיבויים"
    // first, waiting at most 90 seconds; when Drive fails, does not finish in
    // time, or the backup is above 30MB, Cloud Storage under backups/{class_id}/
    // (teacher-readable, storage.rules) and the reset continues. When both fail,
    // nothing is deleted.
    const backupKind: BackupKind = isClassTarget
      ? { type: "class_session", session: activeSessionNumber ?? 1 }
      : reset_level === 'system'
        ? { type: "system" }
        : singleScope === 'active_session'
          ? { type: "student_session", student: parseInt(rawNum, 10), session: activeSessionNumber ?? 1 }
          : { type: "student_full", student: parseInt(rawNum, 10) };
    const backupName = backupFileName(backupKind, backup.snapshot_time);
    const backupBuffer = Buffer.from(JSON.stringify(backup), "utf-8");
    logger.info(
      `Reset ${resetId}: ${reset_level} backup is ${backupBuffer.length} bytes, ` +
      `${backup.counts.total} records (rtdb=${JSON.stringify(backup.counts.realtime_database)}, firestore=${JSON.stringify(backup.counts.firestore)})`
    );

    const written = await writeResetBackup(backupBuffer, backupName, backupStoragePath(class_id, resetId, backupName), {
      writeDrive: (buffer, fileName, signal) =>
        uploadBufferToDrive(buffer, fileName, "application/json", DRIVE_FOLDERS.backups, { park: false, signal }),
      writeStorage: async (buffer, storagePath) => {
        const bucket = admin.storage().bucket();
        await bucket.file(storagePath).save(buffer, {
          contentType: "application/json",
          metadata: { metadata: { reset_id: resetId, class_id, original_name: backupName } },
        });
        return `gs://${bucket.name}/${storagePath}`;
      },
  });

  if (!written) {
    logger.error(`Reset ${resetId}: all backup channels failed (Drive, Cloud Storage); nothing is deleted.`);
    const failedEntry: ResetAuditEntry = {
      reset_id: resetId,
      reset_level,
      performed_by_teacher_id: performedBy,
      performed_at: Date.now(),
      class_id,
      affected_student_ids: affectedStudentIds,
      backup_file_url: null,
      backup_status: 'failed',
      reset_reason: reason,
      reason_note,
      records_deleted_count: 0,
      backup_channel: null,
      deletion_status: 'not_required',
      ...level2Audit,
      created_at: Date.now(),
    };
    await db.collection("reset_audit_log").doc(resetId).set(failedEntry).catch((auditErr) => logger.error("Failed to write the failed-reset audit entry:", auditErr));

    await revertMarkers();
    throw new HttpsError("internal", "הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.");
  }
  if (written.channel === 'storage') {
    logger.warn(`Reset ${resetId}: the backup is in Cloud Storage (${written.url}); the daily job copies it to Drive. Drive said: ${written.driveError}`);
  }

  // Step 2b: the markers again, now with every recording id in the backup.
  if (fullReset) {
    try {
      await writeMarkers(backup.realtime_database);
    } catch (err: any) {
      logger.error(`Reset ${resetId}: the late-recording markers could not be completed; nothing is deleted:`, err);
      await revertMarkers();
      await db.collection("reset_audit_log").doc(resetId).set({
        reset_id: resetId,
        reset_level,
        performed_by_teacher_id: performedBy,
        performed_at: performedAt,
        class_id,
        affected_student_ids: affectedStudentIds,
        backup_file_url: written.url,
        backup_status: 'success',
        reset_reason: reason,
        reason_note,
        records_deleted_count: 0,
        backup_channel: written.channel,
        backup_drive_copied_at: null,
        deletion_status: 'not_required',
        ...level2Audit,
        created_at: Date.now(),
      }).catch((auditErr) => logger.error("Failed to write the aborted-reset audit entry:", auditErr));
      throw new HttpsError("failed-precondition", "הגיבוי נשמר, אך הכנת האיפוס נכשלה, ולכן האיפוס בוטל ולא נמחקו נתונים.");
    }
  }

  // Step 3: the audit entry, BEFORE anything is deleted (Module 23א §ד), with
  // deletion_status 'in_progress'. A failed write aborts the reset while the
  // backup is safe and nothing is gone.
  const auditRef = db.collection("reset_audit_log").doc(resetId);
  const auditEntry: ResetAuditEntry = {
    reset_id: resetId,
    reset_level,
    performed_by_teacher_id: performedBy,
    performed_at: performedAt,
    class_id,
    affected_student_ids: affectedStudentIds,
    backup_file_url: written.url,
    backup_status: 'success',
    reset_reason: reason,
    reason_note,
    records_deleted_count: 0,
    backup_channel: written.channel,
    backup_drive_copied_at: null,
    deletion_status: 'in_progress',
    ...level2Audit,
    created_at: Date.now(),
  };
  try {
    await auditRef.set(auditEntry);
  } catch (auditErr) {
    logger.error(`Reset ${resetId}: the audit entry could not be written; the reset is aborted before any deletion:`, auditErr);
    await revertMarkers();
    throw new HttpsError(
      "failed-precondition",
      "הגיבוי נשמר, אך רישום האיפוס ביומן הביקורת נכשל, ולכן האיפוס בוטל ולא נמחקו נתונים."
    );
  }

  // Steps that delete nothing themselves fail into side_effect_errors: they do
  // not make the deletion 'partial' (§ד: only the records in scope decide).
  const sideEffectErrors: string[] = [];

  // Step 4: delete ONLY after the backup write and the audit entry were
  // confirmed — the very same scope that was just backed up, and every record
  // of it (no page limits).
  const deletion = await executeResetDeletion(rtdb, db, scope);
  sideEffectErrors.push(...deletion.side_effect_failures);

  if (reset_level === 'system') {
    // A class that starts over has no projector and — Module 14: session
    // activation is exclusively a teacher action — no active session.
    await rtdb.ref("system_control/projector_mode").set({ active: false, projector_mode: false, projector_mode_updated_at: Date.now() }).catch((e) => sideEffectErrors.push(`system_control/projector_mode: ${e?.message || e}`));
    await rtdb.ref("active_class_session").set({ active: false, status: "closed", sessionNumber: null, endedAt: Date.now() }).catch((e) => sideEffectErrors.push(`active_class_session: ${e?.message || e}`));
    // Module 24's store_cache/admin_metrics is derived from the data just
    // deleted; recompute it now so the admin console does not keep showing
    // the pre-reset summary until the next scheduled run.
    await recomputeAdminMetrics(db).catch((e) => sideEffectErrors.push(`store_cache/admin_metrics: ${e?.message || e}`));
  }

  // Step 5: the real number of records deleted, and how the deletion ended
  // ('completed', or 'partial' when a record in scope failed — never rolled
  // back). Learner records reset in place (a meeting restart) are not counted.
  const deletionStatus: DeletionStatus = deletionStatusAfter(deletion.failures);
  await auditRef.update({
    records_deleted_count: deletion.total,
    deletion_status: deletionStatus,
    ...(sideEffectErrors.length > 0 ? { side_effect_errors: sideEffectErrors.map((e) => e.slice(0, 500)) } : {}),
  }).catch((auditErr) => {
    // The entry exists and stays 'in_progress'; say so rather than report a clean reset.
    logger.error("Failed to record the deletion outcome on the reset audit entry:", auditErr);
    deletion.failures.push(`reset_audit_log: ${auditErr?.message || auditErr}`);
  });

  if (deletion.failures.length > 0) {
    // The backup is safe and most of the scope is gone; say exactly what is
    // not, instead of reporting a clean reset.
    logger.error(`Reset ${resetId}: deletion incomplete —`, deletion.failures, sideEffectErrors);
    throw new HttpsError(
      "internal",
      `הגיבוי נשמר, אך חלק מהנתונים לא נמחקו: ${[...deletion.failures, ...sideEffectErrors].join('; ')}. ניתן להריץ את האיפוס שוב.`,
      // The client used to report every non-permission error as "הגיבוי נכשל…
      // לא נמחקו נתונים" — the opposite of what happened here.
      { stage: 'deletion_incomplete' }
    );
  }
  if (sideEffectErrors.length > 0) {
    logger.error(`Reset ${resetId}: every record in scope was deleted, but some follow-up steps failed —`, sideEffectErrors);
  }

  logger.info(
    `Successfully backed up and reset ${reset_level} data (ResetID: ${resetId}): ` +
    `${deletion.total} records deleted, ${deletion.reset_in_place} reset in place (rtdb=${JSON.stringify(deletion.realtime_database)}, firestore=${JSON.stringify(deletion.firestore)})`
  );

  return {
    status: "SUCCESS",
    resetId,
    backupChannel: written.channel,
    webViewLink: written.url,
    backedUpRecords: backup.counts.total,
    deletedRecords: deletion.total,
    ...(sideEffectErrors.length > 0 ? { sideEffectErrors } : {}),
    ...(reset_level === 'single_student' ? { resetScope: singleScope, sessionNumber: activeSessionNumber, resetTarget } : {}),
  };
  });
}

// ─── Reset scope, backup and deletion helpers (Module 23א) ───────────────────

const ALL_STUDENT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Every key a learner record has been stored under over the project's history. */
function studentAliases(rawNum: string): string[] {
  return [`student_user${rawNum}`, `student_${rawNum}`, `user${rawNum}`, rawNum];
}

/**
 * Firestore collections that hold learning data (PRD Module 23א §ג: "כלל
 * נתוני הטלמטריה, מסמכי הסשן, מצבי מרחב העבודה ונתוני הרפלקציה"). Each one
 * carries the learner's anonymous number in `student_id`. reset_audit_log is
 * deliberately absent: §ד forbids any reset from touching it.
 */
const LEARNING_COLLECTIONS = ["sessions", "telemetry_logs", "telemetry_events", "reports", "class_reports", "srl_reflections"] as const;

interface FirestoreScopeEntry {
  collection: string;
  /** When set, only documents whose `student_id` is one of these values. */
  studentValues?: Array<string | number>;
  /**
   * When set, only documents whose ID names one of these learners
   * ("session_02_student_4" → 4). For `sessions`: a session document has no
   * student_id field (the rules do not allow one), so the field filter above
   * matched none of them — a single-learner reset never deleted, or even backed
   * up, the learner's session documents. After a reset of meeting 2 the gate tab
   * kept showing "completed and approved" with the old score, and the rules then
   * refused the learner's new completion (teacher_gate_approved true → false).
   */
  studentNumbers?: number[];
  /** Backed up but not deleted (see buildResetScope). */
  backupOnly?: boolean;
  /**
   * When set, only documents of this meeting are deleted (by id
   * "session_N_student_…" or by their session_number field); the rest of the
   * entry is still backed up.
   */
  sessionNumber?: number;
}

/** An RTDB node that is reset field-by-field instead of removed (level 2, active meeting only). */
interface RtdbFieldReset {
  path: string;
  values: Record<string, unknown>;
}

interface ResetScope {
  /**
   * RTDB paths, removed whole. A learner's screen recordings live in their own
   * node, recordings/<id> (recordingsNode.ts), and every level covers it exactly
   * as it covers the learner record: older recordings are still on the record
   * itself, users/students/<id>/telemetry_sessions, and are covered there.
   */
  rtdbPaths: string[];
  /** RTDB paths that are backed up whole but only partially reset (see fieldResets). */
  rtdbBackupOnlyPaths?: string[];
  fieldResets?: RtdbFieldReset[];
  /**
   * Per path in rtdbPaths: the fields that survive its removal. The node is
   * replaced by just those fields (when it has any) instead of removed.
   */
  rtdbKeepFields?: Record<string, readonly string[]>;
  firestore: FirestoreScopeEntry[];
}

/**
 * What the teacher set for a learner, kept by the full learner reset (owner,
 * 2.10.2026: "ברור שלשמור את הגדרות התלמיד אין צורך להקים לו את זה מחדש"):
 * the support profile — the four Appendix A fields the class-management toggle
 * writes (core/supportProfile.ts) and the legacy boolean its readers still
 * honour — and quiet mode (isASD, the learning-conditions drawer). Level 3
 * still deletes them with everything else.
 */
export const LEARNER_SETTINGS_FIELDS = [
  "support_profile_id",
  "support_profile_version",
  "support_profile_updated_at",
  "support_profile_updated_by",
  "enhanced_support_profile",
  "isASD",
] as const;

/**
 * The restart command of a full reset (Module 23א: the learner starts over).
 * A learner's open screen acts on forceReload: it drops what it holds and
 * returns to the lobby; these three fields are how it tells a full reset from
 * a meeting reset (core/meetingCompletion.ts, resetMeetingOf → 'all').
 *
 * Only the teacher's browser used to write it, after the reset call returned.
 * A call that timed out there, or a deletion that ended with one failed item,
 * skipped it — and a connected learner's screen wrote its old board back onto
 * the record that had just been deleted.
 */
export const FULL_RESET_RESTART_COMMAND = {
  forceReload: true,
  lastAction: "אופס ע״י המורה",
  highestCompletedMeeting: 0,
} as const;

/** The key a learner's own screen listens on: users/students/student_user<N>. */
const CANONICAL_LEARNER_KEY = /^student_user(?:[1-9]|1[0-2])$/;

/**
 * The canonical learner records a removed RTDB path held: the path itself, or
 * its children when it is the learners' root. Only records that existed — a
 * learner who never signed in has no screen to restart and gets no record.
 */
export function canonicalLearnerRecordsOf(path: string, value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (path === "users/students") {
    return typeof value === "object"
      ? Object.keys(value as Record<string, unknown>).filter((k) => CANONICAL_LEARNER_KEY.test(k)).map((k) => `users/students/${k}`)
      : [];
  }
  const m = /^users\/students\/([^/]+)$/.exec(path);
  return m && CANONICAL_LEARNER_KEY.test(m[1]) ? [path] : [];
}

/** The learner settings present on a record, or null when it carries none. */
export function pickKeptFields(record: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!record || typeof record !== "object") return null;
  const kept: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (record as Record<string, unknown>)[field];
    if (value !== undefined && value !== null) kept[field] = value;
  }
  return Object.keys(kept).length > 0 ? kept : null;
}

/**
 * PRD 23א §ב.2: after a session reset, "the highest completed session is
 * recomputed as the highest session whose completion mark is still set". A
 * meeting other than the reset one counts when its mark is on the record
 * (completedMeetings/m{M}, completedMeeting{M} or session_{M}_completed).
 * Records saved before the per-meeting marks existed carry only the monotonic
 * number: meetings below the reset one keep what it said.
 */
export function highestCompletedAfterReset(sessionNumber: number, current: Record<string, unknown> | null): number {
  const record = current ?? {};
  const marks = (record.completedMeetings && typeof record.completedMeetings === "object" ? record.completedMeetings : {}) as Record<string, unknown>;
  let highest = Math.min(Number(record.highestCompletedMeeting) || 0, sessionNumber - 1);
  for (let m = 1; m <= 8; m++) {
    if (m === sessionNumber) continue;
    const marked = Boolean(marks[`m${m}`]) ||
      record[`completedMeeting${m}`] === true ||
      record[`session_${m}_completed`] === true ||
      record[`session_0${m}_completed`] === true;
    if (marked && m > highest) highest = m;
  }
  return Math.max(0, highest);
}

/**
 * The learner-record fields that belong to one meeting (PRD 23א §ב.2: "מצב
 * מרחב העבודה ואת התקדמות המפגש הפעיל"). Everything else on the record —
 * earlier meetings, support profile, recordings, chat — stays.
 *
 * `clearReflection` is set by the single-learner reset of meeting 8 only
 * (register deviation 10: "במפגש 8 גם הרפלקציה"). The whole-class restart
 * keeps reflections (deviation 20) and does not set it.
 *
 * `keepHelpCalls` is set by the whole-class restart. Register deviation 20,
 * "מה לא משתנה": "ההתראות ברדאר אינן מאופסות (זו רמה 1)". The learner's help
 * call (helpRequested / handRaised / isStruggling) stays until the teacher
 * clears it ("איפוס התראות") or the learner takes it back. isSocraticActive is
 * not an alert but the card's live state, and the restart closes the card.
 */
export function buildActiveSessionResetValues(
  sessionNumber: number,
  current: Record<string, unknown> | null,
  options: { clearReflection?: boolean; keepHelpCalls?: boolean } = {}
): Record<string, unknown> {
  const highest = highestCompletedAfterReset(sessionNumber, current);
  const completedNum = Number(current?.session_completed) || 0;
  const values: Record<string, unknown> = {
    workspaceState: null,
    sessionState: null,
    [`completedMeeting${sessionNumber}`]: false,
    [`session_${sessionNumber}_completed`]: false,
    highestCompletedMeeting: highest,
    session_completed: completedNum >= sessionNumber ? highest : completedNum,
    // Both spellings of "the meeting the learner is in": the live workspace
    // writes activeSessionNumber, older records carry activeSessionId.
    activeSessionId: sessionNumber,
    activeSessionNumber: sessionNumber,
    isBoardLocked: false,
    helpRequested: false,
    handRaised: false,
    isStruggling: false,
    isSocraticActive: false,
    forceReload: true,
    lastAction: `המפגש ${sessionNumber} אופס ע״י המורה`,
    // Catch-up time (owner, 2.10.2026): the meeting's finished mark and its
    // per-meeting saved workspace (core/meetingCompletion.ts). Left behind, a
    // reset learner counted as finished and resumed the old board.
    [`completedMeetings/m${sessionNumber}`]: null,
    [`workspaceByMeeting/m${sessionNumber}`]: null,
    // The meeting's error-category counts (the radar's distribution panel reads
    // errorCategoryDistribution/session_N). Left behind, the restarted meeting
    // showed the old run's counts and added the new ones on top.
    [`errorCategoryDistribution/session_${sessionNumber}`]: null,
  };
  if (options.keepHelpCalls) {
    delete values.helpRequested;
    delete values.handRaised;
    delete values.isStruggling;
  }
  if (sessionNumber === 2) {
    // The diagnostic meeting's own outputs (Modules 19–20) are part of its progress.
    Object.assign(values, {
      qMatrixResults: null,
      traceData: null,
      routeStatus: null,
      routeRecommendation: null,
      teacher_gate_approved: false,
      session_score_percent: null,
      matrix_recommended_path: null,
      // The learner's client records the diagnostic's completion as
      // session_02_completed (two digits) and its own gate check reads that key;
      // only session_2_completed was cleared above. The approved path, who
      // approved it and when, and the mastery profile computed at the end of the
      // diagnostic are its outputs too: left behind, the learner kept the old
      // bank and the clustering widgets kept the old diagnostic.
      session_02_completed: false,
      pedagogicalPath: null,
      teacher_selected_path: null,
      gate_approved_at: null,
      gate_approved_by: null,
      conceptMastery: null,
    });
  }
  if (sessionNumber === 8) {
    // Meeting 8 is the reflection board (Module 16).
    Object.assign(values, { reflections: null });
    if (options.clearReflection) {
      // The live mirror srlReflection.ts writes next to the srl_reflections
      // document. That document is deleted with the reset (buildResetScope);
      // left behind, the dashboard kept showing the old reflection as done.
      Object.assign(values, {
        reflection_step: null,
        reflection_completed: null,
        persistence_index: null,
        reflection_updated_at: null,
      });
    }
  }
  return values;
}

/**
 * Level 2 (single learner), 'active_session' (PRD §ב.2, the default): the
 * learner's whole record is backed up, but only the fields of the active
 * meeting are reset (buildActiveSessionResetValues) and only that meeting's
 * Firestore session documents are deleted. Earlier meetings, recordings, chat,
 * telemetry and reports stay. Meeting 8 is the reflection board (register
 * deviation 10: "במפגש 8 גם הרפלקציה"): its srl_reflections document is
 * deleted too, after the backup, and the record's reflection mirror is
 * cleared — the rules make that document create-only, so a kept one refused
 * the learner's new reflection. Reflections of any other meeting stay.
 *
 * Level 2, 'full_student' (teacher's choice): the learner's RTDB record
 * (workspace state, meeting progress, Q-matrix, recordings), their chat, and
 * all their Firestore session documents are deleted. Their telemetry, reports
 * and reflections are backed up with the rest but kept — even a full reset
 * does not erase the research evidence of a single learner. The settings the
 * teacher set for the learner (LEARNER_SETTINGS_FIELDS) stay on the record.
 *
 * Level 2, target 'class' (register deviation 20): the 'active_session' reset
 * above, for all 12 learners in one action. Every learner record, the chat and
 * every learning collection are backed up; only the meeting's fields on each
 * record are reset and only that meeting's Firestore session documents are
 * deleted. Earlier meetings, recordings, chat, telemetry, reports and
 * reflections stay — this is a restart of one lesson, not level 3.
 *
 * Level 3 (system): every learning-data node and collection, for all learners.
 */
export function buildResetScope(
  level: 'single_student' | 'system',
  rawNum: string,
  singleScope: SingleStudentResetScope = 'full_student',
  activeSessionNumber: number | null = null,
  target: ResetTarget = 'student'
): ResetScope {
  if (level === 'single_student' && target === 'class') {
    const sessionNumber = activeSessionNumber ?? 1;
    const allAliases = ALL_STUDENT_IDS.flatMap((n) => studentAliases(String(n)));
    return {
      rtdbPaths: [],
      rtdbBackupOnlyPaths: ["users/students", "chat_messages", RECORDINGS_ROOT],
      // PRD 23א §ב.2: in meeting 8 the class reset also deletes the meeting's
      // reflections, as the single-learner reset does, so the class can redo it.
      fieldResets: allAliases.map((a) => ({
        path: `users/students/${a}`,
        values: { __activeSessionNumber: sessionNumber, __keepHelpCalls: true, ...(sessionNumber === 8 ? { __clearReflection: true } : {}) },
      })),
      // No student filter: twelve learners under four aliases each is past
      // Firestore's 30-value "in" ceiling, and the class is the whole collection.
      firestore: LEARNING_COLLECTIONS.map((collection) => {
        const deletedByMeeting = collection === "sessions" || (sessionNumber === 8 && collection === "srl_reflections");
        return {
          collection,
          backupOnly: !deletedByMeeting,
          ...(deletedByMeeting ? { sessionNumber } : {}),
        };
      }),
    };
  }
  if (level === 'single_student' && singleScope === 'active_session') {
    const aliases = studentAliases(rawNum);
    const studentValues = Array.from(new Set<string | number>([rawNum, parseInt(rawNum, 10), ...aliases]));
    const sessionNumber = activeSessionNumber ?? 1;
    const clearsReflection = sessionNumber === 8;
    return {
      rtdbPaths: [],
      rtdbBackupOnlyPaths: [
        ...aliases.map((a) => `users/students/${a}`),
        ...aliases.map((a) => `${RECORDINGS_ROOT}/${a}`),
        ...aliases.map((a) => `chat_messages/${a}`),
      ],
      // Values are computed against the live record at deletion time (see executeResetDeletion).
      fieldResets: aliases.map((a) => ({
        path: `users/students/${a}`,
        values: { __activeSessionNumber: sessionNumber, ...(clearsReflection ? { __clearReflection: true } : {}) },
      })),
      firestore: LEARNING_COLLECTIONS.map((collection) => {
        const reflectionOfMeeting = clearsReflection && collection === "srl_reflections";
        return {
          collection,
          ...(collection === "sessions" ? { studentNumbers: [parseInt(rawNum, 10)], sessionNumber } : { studentValues }),
          // Deleted by meeting: only the learner's session_08_… reflection goes.
          ...(reflectionOfMeeting ? { sessionNumber } : {}),
          backupOnly: collection !== "sessions" && !reflectionOfMeeting,
        };
      }),
    };
  }
  if (level === 'single_student') {
    const aliases = studentAliases(rawNum);
    const studentValues = Array.from(new Set<string | number>([rawNum, parseInt(rawNum, 10), ...aliases]));
    return {
      // The learner's settings stay on every alias the readers use (LEARNER_SETTINGS_FIELDS).
      rtdbKeepFields: Object.fromEntries(aliases.map((a) => [`users/students/${a}`, LEARNER_SETTINGS_FIELDS])),
      rtdbPaths: [
        ...aliases.map((a) => `users/students/${a}`),
        ...aliases.map((a) => `${RECORDINGS_ROOT}/${a}`),
        ...aliases.map((a) => `chat_messages/${a}`),
        // Leftover of the removed AI-plan subsystem; wiped so an old per-learner
        // task list can never resurface.
        ...aliases.map((a) => `approved_tasks/${a}`),
      ],
      firestore: LEARNING_COLLECTIONS.map((collection) => ({
        collection,
        ...(collection === "sessions" ? { studentNumbers: [parseInt(rawNum, 10)] } : { studentValues }),
        backupOnly: collection !== "sessions",
      })),
    };
  }
  return {
    rtdbPaths: [
      "users/students",
      RECORDINGS_ROOT,
      "students",
      "chat_messages",
      "radar_alerts",
      "replays",
      "sessions",
      "telemetry_sessions",
      // Learners' reflections are also pushed to this shared node (ReflectionScreen).
      "reflections",
      // Leftovers of the removed AI-plan subsystem (per-learner task lists and
      // teacher approval queues); wiped so nothing stale can resurface.
      "approved_tasks",
      "ai_pending_approvals",
    ],
    firestore: LEARNING_COLLECTIONS.map((collection) => ({ collection })),
  };
}

/**
 * Catch-up time (owner, 2.10.2026): the record of a learner × meeting,
 * catchup_records/{session_0N_student_K}, carries the session document's id
 * and is always backed up with the reset. PRD 23א §ב.2: a session reset (of
 * one learner or of the whole class) KEEPS the meeting's catch-up record — the
 * report shows it under "לפני האיפוס"; a full learner reset deletes all of the
 * learner's records, and a system reset all of them. reset_audit_log is not
 * touched.
 */
export function withCatchUpRecords(scope: ResetScope): ResetScope {
  const catchUp = scope.firestore
    .filter((entry) => entry.collection === "sessions")
    .map((entry) => ({
      ...entry,
      collection: CATCHUP_COLLECTION,
      ...(entry.studentNumbers ? { studentNumbers: [...entry.studentNumbers] } : {}),
      // A meeting-scoped entry is a session reset: backed up, not deleted.
      ...(entry.sessionNumber !== undefined ? { backupOnly: true } : {}),
    }));
  return { ...scope, firestore: [...scope.firestore, ...catchUp] };
}

/**
 * The research export's catch-up records, keyed `${learner}:${meeting}` like
 * the meetings file's rows. The learner and the meeting come from the fields,
 * else from the document id (the session document's spelling).
 */
const isPercent = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

export function catchUpRecordsByLearnerMeeting(docs: Array<{ id: string; data: unknown }>): Map<string, Partial<CatchUpRecord>> {
  const byKey = new Map<string, Partial<CatchUpRecord>>();
  for (const { id, data } of docs) {
    const record = (data && typeof data === "object" ? data : {}) as Partial<CatchUpRecord>;
    const fieldLearner = Number(record.student_id);
    const n = Number.isInteger(fieldLearner) && fieldLearner >= 1 && fieldLearner <= 12 ? fieldLearner : studentNumberFromSessionId(id);
    const fieldMeeting = Number(record.session_number);
    const m = Number.isInteger(fieldMeeting) && fieldMeeting >= 1 && fieldMeeting <= 8 ? fieldMeeting : sessionNumberFromId(id);
    if (!n || !m) continue;
    byKey.set(`${n}:${m}`, record);
  }
  return byKey;
}

/**
 * Each learner's path from the users/students node, for the research export:
 * the canonical record (student_user<N>) decides; an alias only when the
 * learner has no canonical record.
 */
export function learnerPathsFromRecords(studentsNode: Record<string, any> | null | undefined): Map<number, "green_path" | "remediation_path"> {
  const paths = new Map<number, "green_path" | "remediation_path">();
  for (const [key, raw] of Object.entries(studentsNode ?? {})) {
    const n = parseInt(key.replace(/\D/g, ""), 10);
    if (!(n >= 1 && n <= 12) || !raw || typeof raw !== "object") continue;
    const node = raw as Record<string, any>;
    const path = node.teacher_selected_path === "remediation_path" || node.pedagogicalPath === "remediation_path" ? "remediation_path" : "green_path";
    if (!paths.has(n) || key === `student_user${n}`) paths.set(n, path);
  }
  return paths;
}

export interface ResetBackupFile {
  backup_format: "mathmaticore-reset-backup/2";
  reset_id: string;
  reset_level: 'single_student' | 'system';
  class_id: string;
  affected_student_ids: number[];
  performed_by_teacher_id: string;
  snapshot_time: number;
  snapshot_time_iso: string;
  /** RTDB nodes exactly as stored, keyed by path. */
  realtime_database: Record<string, unknown>;
  /** Every document of every collection in scope, keyed by collection name. */
  firestore: Record<string, Array<{ id: string; data: unknown }>>;
  counts: {
    realtime_database: Record<string, number>;
    firestore: Record<string, number>;
    total: number;
  };
}

/** Firestore values that JSON.stringify would mangle, made plain and reversible. */
function toPlainJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (value instanceof admin.firestore.DocumentReference) return { __document_path: value.path };
  if (value instanceof admin.firestore.GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (Buffer.isBuffer(value)) return { __bytes_base64: value.toString("base64") };
  if (Array.isArray(value)) return value.map(toPlainJson);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toPlainJson(v);
    return out;
  }
  return value;
}

const FIRESTORE_PAGE = 500;
// 2,000 pages × 500 = one million documents; far beyond a pilot class, and a
// hard stop against looping forever should a query misbehave.
const FIRESTORE_MAX_PAGES = 2000;

function scopedQuery(db: admin.firestore.Firestore, entry: FirestoreScopeEntry): admin.firestore.Query {
  const base: admin.firestore.Query = db.collection(entry.collection);
  // studentNumbers is matched on the document id, after the read (entryCoversDoc).
  if (entry.studentNumbers) return base;
  return entry.studentValues && entry.studentValues.length > 0
    ? base.where("student_id", "in", entry.studentValues)
    : base;
}

/** Whether a document the scoped query returned belongs to the entry (see studentNumbers). */
function entryCoversDoc(entry: FirestoreScopeEntry, docId: string): boolean {
  if (!entry.studentNumbers) return true;
  const n = studentNumberFromSessionId(docId);
  return n !== null && entry.studentNumbers.includes(n);
}

/** Reads every document the entry covers — no page limit — as plain JSON. */
async function readCollectionFully(db: admin.firestore.Firestore, entry: FirestoreScopeEntry): Promise<Array<{ id: string; data: unknown }>> {
  const docs: Array<{ id: string; data: unknown }> = [];
  const query = scopedQuery(db, entry).orderBy(admin.firestore.FieldPath.documentId()).limit(FIRESTORE_PAGE);
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  for (let page = 0; page < FIRESTORE_MAX_PAGES; page++) {
    const pageQuery: admin.firestore.Query = last ? query.startAfter(last) : query;
    const snap: admin.firestore.QuerySnapshot = await pageQuery.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      if (entryCoversDoc(entry, d.id)) docs.push({ id: d.id, data: toPlainJson(d.data()) });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < FIRESTORE_PAGE) break;
  }
  return docs;
}

/** Deletes every document the entry covers, page by page, and returns how many. */
async function deleteCollectionFully(db: admin.firestore.Firestore, entry: FirestoreScopeEntry): Promise<number> {
  if (entry.studentNumbers) {
    // Matched by document id: the page loop below re-reads the first page until it
    // is empty, which never happens while other learners' documents remain.
    const all = await scopedQuery(db, entry).get();
    const targets = all.docs.filter((d) => entryCoversDoc(entry, d.id));
    for (let i = 0; i < targets.length; i += FIRESTORE_PAGE) {
      const batch = db.batch();
      targets.slice(i, i + FIRESTORE_PAGE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return targets.length;
  }
  let deleted = 0;
  const query = scopedQuery(db, entry).limit(FIRESTORE_PAGE);
  for (let page = 0; page < FIRESTORE_MAX_PAGES; page++) {
    const snap = await query.get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < FIRESTORE_PAGE) break;
  }
  return deleted;
}

/**
 * Step 1 of a reset: read the whole scope into one snapshot. Any read failure
 * throws, so a partial snapshot is never written as if it were complete.
 */
export async function collectResetBackup(
  rtdb: admin.database.Database,
  db: admin.firestore.Firestore,
  scope: ResetScope,
  meta: Pick<ResetBackupFile, 'reset_id' | 'reset_level' | 'class_id' | 'affected_student_ids' | 'performed_by_teacher_id'>
): Promise<ResetBackupFile> {
  const now = Date.now();
  const backup: ResetBackupFile = {
    backup_format: "mathmaticore-reset-backup/2",
    ...meta,
    snapshot_time: now,
    snapshot_time_iso: new Date(now).toISOString(),
    realtime_database: {},
    firestore: {},
    counts: { realtime_database: {}, firestore: {}, total: 0 },
  };

  for (const path of [...scope.rtdbPaths, ...(scope.rtdbBackupOnlyPaths || [])]) {
    const snap = await rtdb.ref(path).get();
    const value = snap.val();
    backup.realtime_database[path] = value ?? null;
    // The same unit as records_deleted_count (rtdbRecordCount).
    const count = rtdbRecordCount(path, snap);
    backup.counts.realtime_database[path] = count;
    backup.counts.total += count;
  }

  for (const entry of scope.firestore) {
    const docs = await readCollectionFully(db, entry);
    backup.firestore[entry.collection] = docs;
    backup.counts.firestore[entry.collection] = docs.length;
    backup.counts.total += docs.length;
  }

  return backup;
}

/**
 * PRD 23א §ד: "records_deleted_count סופר רק רשומות שנמחקו, כלומר מסמכי Cloud
 * Firestore וצמתי Realtime Database". A scope path that names one node — a
 * learner's record, recordings or chat under one alias (users/students/<a>,
 * recordings/<a>, chat_messages/<a>, approved_tasks/<a>) — is one record. A
 * path that holds many such nodes (the roots a system reset removes:
 * users/students, chat_messages, radar_alerts, …) counts each node under it as
 * one. So a learner's record counts once whichever reset deletes it.
 *
 * The node's own fields used to be counted instead: a full learner reset of
 * one record with ten fields reported ten deleted records, while the system
 * reset counted that same record as one.
 */
export function rtdbRecordCount(
  path: string,
  snap: { exists(): boolean; hasChildren(): boolean; numChildren(): number }
): number {
  if (!snap.exists()) return 0;
  const holdsManyNodes = !path.includes("/") || path === "users/students";
  return holdsManyNodes && snap.hasChildren() ? snap.numChildren() : 1;
}

export interface DeletionCounts {
  realtime_database: Record<string, number>;
  firestore: Record<string, number>;
  /** Records actually deleted. */
  total: number;
  /** Learner records reset field by field (a meeting restart), not deleted. */
  reset_in_place: number;
  /** Scope items that could not be deleted, as "path: reason". */
  failures: string[];
  /**
   * Steps after a record was deleted that delete nothing themselves (the
   * learner's restart command). They do not make the deletion 'partial'
   * (§ד: the records in scope are gone); they are reported separately.
   */
  side_effect_failures: string[];
}

/**
 * Step 3 of a reset: delete the whole scope. One failing item does not stop
 * the others, but it is recorded and reported — never swallowed.
 */
export async function executeResetDeletion(
  rtdb: admin.database.Database,
  db: admin.firestore.Firestore,
  scope: ResetScope
): Promise<DeletionCounts> {
  const counts: DeletionCounts = { realtime_database: {}, firestore: {}, total: 0, reset_in_place: 0, failures: [], side_effect_failures: [] };

  for (const path of scope.rtdbPaths) {
    try {
      const snap = await rtdb.ref(path).get();
      const count = rtdbRecordCount(path, snap);
      const keepFields = scope.rtdbKeepFields?.[path];
      const kept = keepFields && count > 0 ? pickKeptFields(snap.val(), keepFields) : null;
      // One write either way: the node becomes just its kept fields, or goes.
      // Either way the record is deleted (PRD 23א §ב.2: "מחיקת רשומת הלומד
      // כולה"; the settings it keeps are not the record) and counts as one
      // (rtdbRecordCount).
      // A record that held nothing but its settings lost nothing: not counted.
      if (kept) await rtdb.ref(path).set(kept);
      else if (count > 0) await rtdb.ref(path).remove();
      const value = snap.val();
      const lostNothing = kept !== null && value !== null && typeof value === "object" &&
        Object.keys(value as Record<string, unknown>).length === Object.keys(kept).length;
      const deleted = lostNothing ? 0 : count;
      counts.realtime_database[path] = deleted;
      counts.total += deleted;
      // The record is gone; the learner's open screen is told to start over
      // here, whatever happens to the rest of the scope or to the caller.
      for (const record of canonicalLearnerRecordsOf(path, snap.val())) {
        await rtdb.ref(record).update({ ...FULL_RESET_RESTART_COMMAND }).catch((err: any) => {
          counts.side_effect_failures.push(`${record} (restart command): ${err?.message || String(err)}`);
        });
      }
    } catch (err: any) {
      counts.failures.push(`${path}: ${err?.message || String(err)}`);
    }
  }

  for (const reset of scope.fieldResets || []) {
    try {
      const snap = await rtdb.ref(reset.path).get();
      if (!snap.exists()) continue;
      const sessionNumber = Number(reset.values.__activeSessionNumber);
      const values = Number.isInteger(sessionNumber)
        ? buildActiveSessionResetValues(sessionNumber, snap.val(), {
            clearReflection: reset.values.__clearReflection === true,
            keepHelpCalls: reset.values.__keepHelpCalls === true,
          })
        : reset.values;
      await rtdb.ref(reset.path).update(values);
      // One record: the learner's meeting state, reset in place — not deleted,
      // so not part of `total` (the audit entry's records_deleted_count).
      counts.reset_in_place += 1;
    } catch (err: any) {
      counts.failures.push(`${reset.path}: ${err?.message || String(err)}`);
    }
  }

  for (const entry of scope.firestore) {
    if (entry.backupOnly) continue;
    try {
      const n = entry.sessionNumber
        ? await deleteSessionDocsOfMeeting(db, entry, entry.sessionNumber)
        : await deleteCollectionFully(db, entry);
      counts.firestore[entry.collection] = n;
      counts.total += n;
    } catch (err: any) {
      counts.failures.push(`${entry.collection}: ${err?.message || String(err)}`);
    }
  }

  return counts;
}

/** Deletes only the entry's documents that belong to one meeting, and returns how many. */
async function deleteSessionDocsOfMeeting(db: admin.firestore.Firestore, entry: FirestoreScopeEntry, sessionNumber: number): Promise<number> {
  const docs = await scopedQuery(db, entry).get();
  const targets = docs.docs.filter((d) => {
    if (!entryCoversDoc(entry, d.id)) return false;
    const data = d.data() || {};
    const fromField = Number(data.session_number);
    return sessionNumberFromId(d.id) === sessionNumber || fromField === sessionNumber;
  });
  for (let i = 0; i < targets.length; i += FIRESTORE_PAGE) {
    const batch = db.batch();
    targets.slice(i, i + FIRESTORE_PAGE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return targets.length;
}

/**
 * Finds, or creates, a folder by name directly under a parent folder. Null
 * when neither worked: the caller must not fall back to the parent.
 */
async function getOrCreateDriveFolder(
  folderName: string,
  parentId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    const createRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
      signal,
    });
    if (createRes.ok) {
      const data = await createRes.json();
      return data.id || null;
    }
  } catch (err) {
    logger.warn(`Could not create/find Drive folder ${folderName}:`, err);
  }
  return null;
}

/**
 * Module 24: exportResearchDataset
 *
 * Owner decision (5.9.2026): the research is the whole environment and the
 * whole process — every meeting, every learner, every action — not only the
 * routing decision of meetings 2 and 8. So this export is complete by
 * construction: no page caps, every meeting, every source the learner writes
 * to. Five CSV files (UTF-8 with BOM so Hebrew opens cleanly in Excel):
 *
 *   פעולות      — one row per telemetry event (the raw material)
 *   מפגשים      — one row per learner × meeting: first-attempt score (PRD
 *                 rule), counters (wrong digits, undos, deletions, hesitations,
 *                 coaching cards, regroupings), active minutes, recording
 *                 minutes, session-document score and path where one exists
 *   הקלטות      — one row per screen recording (start, end, minutes, chunks, truncated)
 *   רפלקציות    — every reflection, from Firestore and from the learners' RTDB nodes
 *   יומן_איפוסים — every reset audit entry
 *
 * Still enforced: teacher/admin only, scoped to the caller's class; PII scan
 * over every file; Drive hierarchy under "02 נתוני מחקר"; an audit entry.
 * `session_number` narrows the export to one meeting; omit it (or pass "all")
 * for the whole process.
 */
const EXPORT_RUNTIME = { timeoutSeconds: 540, memory: "1GiB" as const };

/**
 * `was_reset` marks a meeting that was reset. PRD Module 23א §ד: only a reset
 * whose deletion_status is 'completed' counts in reports and exports
 * (isCompletedReset, resetAudit.ts).
 */
export function isCountableReset(entry: unknown): boolean {
  return isCompletedReset(entry);
}

/**
 * The research export's `session_number`: absent, null or "all" for the whole
 * process, otherwise an integer meeting 1–8 (a number, or a string of digits).
 */
export function isValidExportScope(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === "all") return true;
  if (typeof raw !== "number" && !(typeof raw === "string" && /^\d+$/.test(raw))) return false;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 8;
}

/**
 * A meeting-8 reflection under Appendix A §4's field names (SRLReflectionState).
 * Documents written before 9.10.2026 carry effort_level and submitted_at; they
 * are read as effort_score and reflection_updated_at. A field the document has
 * under its own name wins.
 */
export function normalizeReflectionFields(raw: Record<string, any>): Record<string, any> {
  const r: Record<string, any> = { ...raw };
  if (r.effort_score === undefined && r.effort_level !== undefined) r.effort_score = r.effort_level;
  if (r.reflection_updated_at === undefined && r.submitted_at !== undefined) r.reflection_updated_at = r.submitted_at;
  delete r.effort_level;
  delete r.submitted_at;
  return r;
}

/**
 * A Firestore Timestamp (or anything shaped like one, as it comes back from a
 * document or a JSON copy of it), or a Date, as an ISO string; null otherwise.
 */
function timestampIso(val: unknown): string | null {
  if (val instanceof Date) return Number.isFinite(val.getTime()) ? val.toISOString() : "";
  if (!val || typeof val !== "object") return null;
  const v = val as Record<string, unknown>;
  if (typeof v.toDate === "function") {
    const d = (v.toDate as () => Date)();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : "";
  }
  const seconds = typeof v.seconds === "number" ? v.seconds : typeof v._seconds === "number" ? v._seconds : null;
  const nanos = typeof v.nanoseconds === "number" ? v.nanoseconds : typeof v._nanoseconds === "number" ? v._nanoseconds : null;
  if (seconds === null || nanos === null || Object.keys(v).length > 2) return null;
  return new Date(seconds * 1000 + Math.round(nanos / 1e6)).toISOString();
}

/** A value made ready for a CSV cell: every timestamp, also inside an object or an array, as ISO text. */
function csvValue(val: unknown): unknown {
  const ts = timestampIso(val);
  if (ts !== null) return ts;
  if (Array.isArray(val)) return val.map(csvValue);
  if (val && typeof val === "object") {
    return Object.fromEntries(Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, csvValue(v)]));
  }
  return val;
}

/** A field that holds a time: `…_at` (performed_at, created_at, submitted_at, …) or `timestamp`. */
const TIME_FIELD = /(?:_at|^timestamp)$/;

/**
 * PRD 24 §ב: "בכל הקבצים חותמות זמן נכתבות כטקסט ISO". csvValue turns a
 * Firestore Timestamp into ISO text, but most times are stored as epoch
 * milliseconds — the reset log's performed_at, created_at and
 * backup_drive_copied_at, a reflection's submitted_at and timestamp — and
 * reached the file as a thirteen-digit number. A time field that holds a
 * number is written as ISO text, also inside a nested map (the reset log's
 * late_recording_drive.<file>.copied_at); anything else is left as it is.
 * Applied to the rows copied from stored documents (reset log, reflections);
 * the actions file keeps its raw client_timestamp next to client_time_iso.
 */
export function isoTimeFields(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) out[k] = isoTimeValue(k, v);
  return out;
}

function isoTimeValue(key: string, v: unknown): unknown {
  if (TIME_FIELD.test(key) && typeof v === "number" && Number.isFinite(v) && v > 0) return new Date(v).toISOString();
  if (Array.isArray(v)) return v.map((x) => isoTimeValue("", x));
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return isoTimeFields(v as Record<string, any>);
  }
  return v;
}

/**
 * One research-export CSV file (BOM, every cell quoted).
 *
 * Every reset and every export used to write `created_at` as a server
 * timestamp (entries since 9.10.2026 hold epoch ms; older ones keep the
 * Timestamp, and both reach the file as ISO text). The reset-log file copied it as is, and the cell turned the object into
 * {"_seconds":…,"_nanoseconds":282943000}; the PII gate below read the nine
 * nanosecond digits as an ID number and refused the whole export. The first
 * export worked, and from then on — after any reset or any earlier export —
 * every one failed (audit M-export). A timestamp is a time: ISO text, in every
 * file. The gate itself is unchanged, and still refuses a real nine-digit number.
 */
export function researchCsv(rows: Record<string, any>[], columns?: string[]): string {
  if (!rows || rows.length === 0) return "﻿empty\n";
  const headerSet = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  const headers = columns ?? Array.from(headerSet);
  const cell = (raw: any) => {
    const val = csvValue(raw);
    const text = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const headerLine = headers.map(cell).join(",");
  const bodyLines = rows.map((row) => headers.map((h) => cell(row[h])).join(","));
  return "﻿" + [headerLine, ...bodyLines].join("\n");
}

/** The PII gate over the research files: an e-mail address, a standalone nine-digit number (an ID), or a phone number. */
export function researchFilesContainPii(content: string): boolean {
  const piiRegex = /(?:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\b\d{9}\b)/;
  return piiRegex.test(content) || containsPhoneNumber(content);
}

/**
 * What the teacher reads when the gate refuses an export. The client shows it
 * as is (details.reason === "pii"); a retry would meet the same data, so it
 * does not ask for one.
 */
export const RESEARCH_EXPORT_PII_REFUSAL_HE =
  "ייצוא נתוני המחקר נעצר: בקבצים נמצא מידע שנראה מזהה (כתובת מייל, מספר טלפון או מספר בן 9 ספרות). שום קובץ לא נשלח. ניסיון חוזר לא יעזור, כי הנתונים לא השתנו. פנו למנהל המערכת.";

export const exportResearchDataset = onCall(EXPORT_RUNTIME, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const class_id = validateClassId(request.data?.class_id, "מזהה הכיתה אינו תקין. הייצוא בוטל.");
  const rawSession = request.data?.session_number;
  // One meeting 1–8, or the whole process. `Number(x) || null` used to turn
  // 0, "abc" or [] into a whole-process export and let 99 or 3.5 through
  // into the Drive folder and the file names.
  if (!isValidExportScope(rawSession)) {
    throw new HttpsError("invalid-argument", "מספר המפגש אינו תקין. הייצוא בוטל.");
  }
  const scopedSession: number | null =
    rawSession === undefined || rawSession === null || rawSession === "all" ? null : Number(rawSession) || null;
  const token: Record<string, any> = request.auth.token;

  // PRD: "callable exclusively by authorized teachers scoped to their own
  // class_id", and Module 24 blocks a system administrator from individual
  // telemetry — which is most of what this export is. An admin-only identity
  // used to pass and to skip the class scope as well. The owner signed in as
  // the teacher passes; signed in as the admin, not (roleClaims.ts).
  requireTeacherForIndividualData(token);

  const callerClassId = token.class_id;
  if (callerClassId && callerClassId !== class_id) {
    throw new HttpsError("permission-denied", `Teacher is strictly restricted to exporting their own assigned class_id (${callerClassId}).`);
  }

  const db = admin.firestore();
  const rtdb = admin.database();

  const toCsv = researchCsv;
  const iso = (t: unknown) => (typeof t === "number" && t > 0 ? new Date(t).toISOString() : "");
  const studentNumber = (v: unknown): number | null => {
    const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
  };

  try {
    // ── 1. Every telemetry event (optionally one meeting) ──────────────────
    const allTelemetry = await readAllDocs(db.collection("telemetry_logs"));
    const telemetry = allTelemetry
      .map(({ id, data }) => ({ id, data, session_number: sessionNumberFromId(String(data.session_id || "")) }))
      .filter((e) => scopedSession === null || e.session_number === scopedSession)
      .sort((a, b) => compareTelemetryOrder(a.data, b.data));

    const telemetryRows = telemetry.map(({ id, data, session_number }) => {
      const d = data.details && typeof data.details === "object" ? data.details : {};
      return {
        log_id: id,
        student_id: studentNumber(data.student_id) ?? data.student_id ?? "",
        session_number: session_number ?? "",
        session_id: data.session_id ?? "",
        exercise_id: data.exercise_id ?? "",
        event_type: data.event_type ?? "",
        column_index: typeof data.column_index === "number" ? data.column_index : "",
        client_timestamp: data.client_timestamp ?? "",
        client_time_iso: iso(data.client_timestamp),
        is_correct: d.is_correct === undefined ? "" : d.is_correct,
        digit_value: d.digit_value ?? "",
        deleted_digit_value: d.deleted_digit_value ?? "",
        block_value: d.block_value ?? "",
        regrouping_type: d.regrouping_type ?? "",
        hesitation_seconds: d.hesitation_seconds ?? "",
        trigger_reason: d.trigger_reason ?? "",
        error_category: d.error_category ?? "",
        undo_stack_depth_before: d.undo_stack_depth_before ?? "",
        reverted_event_type: d.reverted_event_type ?? "",
        // PLACE_CUES_SHOWN (register deviation 28): regular or enhanced — an enum value.
        profile: data.event_type === "PLACE_CUES_SHOWN" && (d.profile === "regular" || d.profile === "enhanced") ? d.profile : "",
        // CHAT_HELP_REQUESTED (owner, 1.10.2026): call | ready_message — an enum value.
        // The exercise in which the learner asked is exercise_id above.
        chat_help_kind: data.event_type === "CHAT_HELP_REQUESTED" && (d.kind === "call" || d.kind === "ready_message") ? d.kind : "",
        // details_json used to carry the whole untyped details object; a
        // free-text field a client parked in details went straight into the
        // dataset. The other Appendix A §3 fields are typed columns too
        // (researchTelemetryRow.ts) — numbers and closed lists only.
        ...researchDetailsColumns(data.event_type, d),
        // PRD Module 24 column contract / Module 5 §ב: appended at the end of the row.
        ...researchStampColumns(data, (v) => timestampIso(v) ?? ""),
      };
    });

    // ── 2. One row per learner × meeting ───────────────────────────────────
    // See classReport.ts: the class_id filter matched no document (the client
    // wrote the school id there), so four research columns were empty for all
    // twelve learners. One class in the pilot; documents are identified by id,
    // and the document that carries the score wins over a stub.
    const sessionDocs = await readAllDocs(db.collection("sessions"));
    const sessionDocByKey = new Map<string, Record<string, any>>();
    for (const { id, data } of sessionDocs) {
      const n = studentNumber(data.student_id) ?? studentNumberFromSessionId(String(data.session_id || "")) ?? studentNumberFromSessionId(id);
      const m = Number(data.session_number) || sessionNumberFromId(String(data.session_id || "")) || sessionNumberFromId(id) || null;
      if (n === null || m === null) continue;
      const key = `${n}:${m}`;
      if (typeof data.session_score_percent === "number" || !sessionDocByKey.has(key)) sessionDocByKey.set(key, data);
    }

    const studentsSnap = await rtdb.ref("users/students").get();
    // Recordings live in their own node (recordingsNode.ts); older ones still on the record.
    const studentsNode: Record<string, any> = withRecordings(studentsSnap.val(), (await rtdb.ref(RECORDINGS_ROOT).get()).val());
    // The canonical record (student_user<N>) is the one the learner's screen
    // and the gate write. A leftover alias used to win whenever it came first
    // in the node, and gave a remediation learner the green path.
    const learnerPath = learnerPathsFromRecords(studentsNode);
    const recordingRows: Record<string, any>[] = [];
    const recordingMinutesByKey = new Map<string, { minutes: number; truncated: boolean }>();
    const rtdbReflectionRows: Record<string, any>[] = [];
    for (const [key, raw] of Object.entries(studentsNode)) {
      const n = studentNumber(key);
      if (n === null || !raw || typeof raw !== "object") continue;
      const node = raw as Record<string, any>;

      const recordings = node.telemetry_sessions && typeof node.telemetry_sessions === "object" ? node.telemetry_sessions : {};
      for (const [recId, rec] of Object.entries(recordings as Record<string, any>)) {
        if (!rec || typeof rec !== "object") continue;
        const metas = Object.values((rec.metadata && typeof rec.metadata === "object" ? rec.metadata : {}) as Record<string, any>)
          .filter((m) => m && typeof m.startTime === "number");
        const start = metas.length ? Math.min(...metas.map((m) => m.startTime)) : null;
        const end = metas.length ? Math.max(...metas.map((m) => (typeof m.endTime === "number" ? m.endTime : m.startTime))) : null;
        const meeting = metas.find((m) => typeof m.sessionNumber === "number")?.sessionNumber ?? null;
        if (scopedSession !== null && meeting !== scopedSession) continue;
        const minutes = start !== null && end !== null ? Math.round(((end - start) / 60000) * 10) / 10 : 0;
        const chunks = rec.chunks && typeof rec.chunks === "object" ? Object.keys(rec.chunks).length : 0;
        const truncated = rec.recording_truncated === true;
        recordingRows.push({
          student_id: n, session_number: meeting ?? "", recording_id: recId, start_iso: iso(start), end_iso: iso(end),
          minutes, chunks, exercises: Array.from(new Set(metas.map((m) => m.exercise_id).filter(Boolean))).join("|"), truncated,
        });
        if (meeting !== null) {
          const k = `${n}:${meeting}`;
          const prev = recordingMinutesByKey.get(k) ?? { minutes: 0, truncated: false };
          recordingMinutesByKey.set(k, { minutes: Math.round((prev.minutes + minutes) * 10) / 10, truncated: prev.truncated || truncated });
        }
      }
      // Module 21: the 50MB budget is per learner per meeting, and its flag
      // lives with the budget — filed under that meeting, also when the
      // recording that reached the cap holds no chunk (and so no meeting) of its own.
      for (const meeting of truncatedRecordingMeetings(node)) {
        if (scopedSession !== null && meeting !== scopedSession) continue;
        const k = `${n}:${meeting}`;
        const prev = recordingMinutesByKey.get(k) ?? { minutes: 0, truncated: false };
        recordingMinutesByKey.set(k, { ...prev, truncated: true });
      }

      if (node.reflections && typeof node.reflections === "object") {
        for (const [refKey, ref] of Object.entries(node.reflections as Record<string, any>)) {
          rtdbReflectionRows.push({ source: "rtdb_student", student_id: n, reflection_id: refKey, ...(ref && typeof ref === "object" ? ref : { value: ref }) });
        }
      }
    }

    const byLearnerMeeting = new Map<string, Record<string, any>[]>();
    for (const e of telemetry) {
      const n = studentNumber(e.data.student_id);
      if (n === null || e.session_number === null) continue;
      const k = `${n}:${e.session_number}`;
      byLearnerMeeting.set(k, [...(byLearnerMeeting.get(k) ?? []), e.data]);
    }
    const compulsoryCache = new Map<string, number | null>();
    const compulsoryIdsByBank = new Map<string, ReadonlySet<string>>();
    const resetLogs = await readAllDocs(db.collection("reset_audit_log").where("class_id", "==", class_id))
      .catch(async () => readAllDocs(db.collection("reset_audit_log")));

    // החלטת בעל המוצר, 23.9.2026 (פער יג): מפגש שאופס באמצע מוחזר ללומד
    // מתרגיל 1, והוא פותר תרגילים שכבר ראה. מדד 1 של המחקר הוא "ניסיון
    // ראשון", ולכן שורה כזו דורשת תשומת לב — אבל המספרים עצמם אינם
    // משתנים ושום נתון אינו נמחק. היומן המלא (מי, מתי, למה) נשאר בקובץ
    // "יומן_איפוסים"; כאן נוסף דגל על השורה עצמה, כדי שלא יידרש לחפש בו
    // על כל אחת מ-96 שורות המפגש.
    const resetsByLearnerMeeting = new Map<string, number[]>();
    for (const { data } of resetLogs) {
      // Only a reset that happened: level 2 or 3, with its backup written.
      // The same log holds alerts resets (no learning data touched), resets
      // aborted because the backup failed (nothing deleted) and export
      // records — none of them restarted a meeting, and all were flagged.
      if (!isCountableReset(data)) continue;
      const at = Number((data as any).performed_at);
      if (!Number.isFinite(at)) continue;
      const meeting = Number((data as any).session_number);
      const affected: number[] = Array.isArray((data as any).affected_student_ids)
        ? (data as any).affected_student_ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isInteger(v))
        : [];
      for (const learner of affected) {
        // איפוס בלי מספר מפגש (רמה 3, איפוס מערכת) נוגע בכל המפגשים.
        const meetings = Number.isInteger(meeting) && meeting >= 1 && meeting <= 8 ? [meeting] : [1, 2, 3, 4, 5, 6, 7, 8];
        for (const mm of meetings) {
          const key = `${learner}:${mm}`;
          const list = resetsByLearnerMeeting.get(key) ?? [];
          list.push(at);
          resetsByLearnerMeeting.set(key, list);
        }
      }
    }
    // Who performed a reset is a person: performed_by_teacher_id (and the
    // e-mail older entries carried) stays in Firestore and does not go to
    // Drive. PRD 23א §ד: no e-mail in any record; anonymous ids 1-12 only.
    const resetRows = resetLogs.map(({ id, data }) => {
      const row: Record<string, any> = { log_id: id };
      for (const [k, v] of Object.entries(data)) {
        if (/email|performed_by/i.test(k)) continue;
        row[k] = v;
      }
      return isoTimeFields(row);
    });

    // Owner, 2.10.2026: "אני כן רוצה אבל שיהיה תיעוד איפה היו טעויות בלי הורדת
    // ציונים". The reports and the gate score each meeting on the run since its
    // last reset; these appended columns give the research file the same numbers,
    // next to the unchanged all-events columns (register gap יג), so the two can
    // be compared. With no reset they equal the all-events values; reset and not
    // redone (nothing answered since) they are empty and reset_awaiting_rerun says so.
    const runsAfterReset = meetingRunsByLearner(allTelemetry, resetLogs.map(({ data }) => data));
    const afterRun = (n: number, m: number) => runsAfterReset.get(`${n}:${m}`) ?? null;
    const afterResetColumns = async (n: number, m: number, fallbackPath: "green_path" | "remediation_path") => {
      const run = afterRun(n, m);
      const awaiting = isAwaitingRerun(run);
      const events = awaiting ? [] : run?.current ?? [];
      // Over the same meetings as flexibility/mediation_cumulative above (the export's scope),
      // so a single-meeting export agrees with them when nothing was reset.
      const inScope = scopedSession === null ? [1, 2, 3, 4, 5, 6, 7, 8] : [scopedSession];
      const allAfter = inScope.flatMap((e) => (isAwaitingRerun(afterRun(n, e)) ? [] : afterRun(n, e)?.current ?? []));
      const path = await resolveMeetingPath(db, m, events, fallbackPath, compulsoryCache, compulsoryIdsByBank);
      const compulsory = await resolveCompulsoryTotal(db, m, path, compulsoryCache, compulsoryIdsByBank);
      const score = awaiting || !isScoredMeeting(m) ? null : computeFirstAttemptScore(events, compulsory, compulsoryIdsByBank.get(`${m}:${path}`) ?? null);
      const flexibility = !awaiting && FLEXIBILITY_SESSIONS.includes(m) ? computeFlexibilityIndex(events) : null;
      const mediation = !awaiting && m !== 2 ? computeMediationEffectiveness(events) : null;
      const blank = (v: unknown) => (awaiting || v === null || v === undefined ? "" : v);
      return {
        reset_awaiting_rerun: awaiting ? "כן" : "",
        events_after_reset: awaiting ? "" : events.length,
        score_after_reset_percent: blank(score?.scorePercent),
        correct_first_attempt_after_reset: blank(score?.correctFirstAttempt),
        persistence_without_help_percent_after_reset: blank(computePersistenceIndex(events).percent),
        self_correction_percent_after_reset: blank(computeSelfCorrectionIndex(events).percent),
        flexibility_percent_after_reset: blank(flexibility?.percent),
        mediation_cards_after_reset: blank(mediation?.cards),
        mediation_percent_after_reset: blank(mediation?.percent),
        flexibility_cumulative_percent_after_reset: blank(computeFlexibilityIndex(allAfter).percent),
        mediation_cumulative_percent_after_reset: blank(computeMediationEffectiveness(allAfter).percent),
      };
    };

    const meetingRows: Record<string, any>[] = [];
    // Catch-up time (owner, 2.10.2026): read once, one record per learner × meeting.
    const catchUpByKey = catchUpRecordsByLearnerMeeting(await readAllDocs(db.collection(CATCHUP_COLLECTION)));
    for (const [k, events] of Array.from(byLearnerMeeting.entries()).sort()) {
      const [nStr, mStr] = k.split(":");
      const n = Number(nStr);
      const m = Number(mStr);
      // The path the learner worked on in THIS meeting, not the current one: the
      // two paths have different exercise ids, so a learner moved to the other
      // track afterwards scored 0% on every earlier meeting (audit reports-14).
      const path = await resolveMeetingPath(db, m, events, learnerPath.get(n) ?? "green_path", compulsoryCache, compulsoryIdsByBank);
      const compulsory = await resolveCompulsoryTotal(db, m, path, compulsoryCache, compulsoryIdsByBank);
      // With the ids: optional early-finisher tasks do not count towards the score (PRD 23 §ב).
      const score = computeFirstAttemptScore(events, compulsory, compulsoryIdsByBank.get(`${m}:${path}`) ?? null);
      // Measure 2 in two parts (owner, 30.9.2026): 2ב self-correction, 2א persistence.
      const selfCorrection = computeSelfCorrectionIndex(events);
      const persistence = computePersistenceIndex(events);
      const summary = summarizeMeeting(events);
      const tools = computeToolMastery(events);
      // מסמך 03 §3.8: session 8 against the same learner's sessions 4–6.
      const fading = m === 8
        ? computeFadingGap(events, [4, 5, 6].flatMap((e) => byLearnerMeeting.get(`${n}:${e}`) ?? []))
        : null;
      // Research measures 3–4 (PRD 7.3, Module 23 §ב): this meeting, and the learner's cumulative value.
      const allOfLearner = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((e) => byLearnerMeeting.get(`${n}:${e}`) ?? []);
      const flexibility = FLEXIBILITY_SESSIONS.includes(m) ? computeFlexibilityIndex(events) : null;
      const flexibilityAll = computeFlexibilityIndex(allOfLearner);
      const mediation = m !== 2 ? computeMediationEffectiveness(events) : null;
      const mediationAll = computeMediationEffectiveness(allOfLearner);
      const sessionDoc = sessionDocByKey.get(k);
      const rec = recordingMinutesByKey.get(k);
      const resetStamps = (resetsByLearnerMeeting.get(`${n}:${m}`) ?? []).sort((a, b) => a - b);
      // The same row as the reports read it (owner, 2.10.2026): the run since
      // this meeting's last reset. Every column above keeps all events (gap יג).
      const afterValues = await afterResetColumns(n, m, path);
      meetingRows.push({
        student_id: n,
        session_number: m,
        // פער יג: האם המפגש הזה אופס, וכמה פעמים. ריק = לא אופס.
        was_reset: resetStamps.length > 0 ? "כן" : "",
        reset_count: resetStamps.length,
        reset_times_iso: resetStamps.map((t) => iso(t)).join(" | "),
        first_event_iso: iso(summary.first_event_at),
        last_event_iso: iso(summary.last_event_at),
        active_minutes: summary.active_minutes,
        events: summary.events,
        exercises_attempted: summary.exercises_attempted,
        exercises_completed: summary.exercises_completed,
        compulsory_total: score.denominator,
        correct_first_attempt: score.correctFirstAttempt,
        first_attempt_score_percent: score.scorePercent,
        digits_entered: summary.digits_entered,
        wrong_digits: summary.wrong_digits,
        deletions: summary.deletions,
        undos: summary.undos,
        hesitations: summary.hesitations,
        hesitation_seconds_total: summary.hesitation_seconds_total,
        regroupings: summary.regroupings,
        socratic_cards: summary.socratic_cards,
        grid_openings: summary.grid_openings,
        grid_reopenings: summary.grid_reopenings,
        keyboard_lock_blocks: summary.keyboard_lock_blocks,
        help_requests: summary.help_requests,
        fading_pairs: fading?.pairs_measured ?? "",
        fading_accuracy_with_blocks: fading?.accuracy_with_blocks_percent ?? "",
        fading_accuracy_without_blocks: fading?.accuracy_without_blocks_percent ?? "",
        fading_seconds_with_blocks: fading?.mean_seconds_with_blocks ?? "",
        fading_seconds_without_blocks: fading?.mean_seconds_without_blocks ?? "",
        fading_guessed: fading?.guessed_exercises.join("|") ?? "",
        fading_unpaired: fading?.unpaired_exercises.join("|") ?? "",
        // Measure 2ב, renamed in place: no column moves, and no old name now means something else.
        self_correction_undos: selfCorrection.undos,
        self_correction_wrong_digits: selfCorrection.wrong_digits,
        self_correction_wrong_options: selfCorrection.wrong_options,
        self_correction_percent: selfCorrection.percent,
        flexibility_completed: flexibility?.completed ?? "",
        flexibility_first_try: flexibility?.first_try ?? "",
        flexibility_percent: flexibility?.percent ?? "",
        flexibility_cumulative_completed: flexibilityAll.completed,
        flexibility_cumulative_first_try: flexibilityAll.first_try,
        flexibility_cumulative_percent: flexibilityAll.percent ?? "",
        mediation_cards: mediation?.cards ?? "",
        mediation_effective: mediation?.effective ?? "",
        mediation_percent: mediation?.percent ?? "",
        mediation_not_needed: mediation ? mediation.cards === 0 : "",
        mediation_cumulative_cards: mediationAll.cards,
        mediation_cumulative_effective: mediationAll.effective,
        mediation_cumulative_percent: mediationAll.percent ?? "",
        reflection_submitted: summary.reflection_submitted,
        recording_minutes: rec?.minutes ?? 0,
        recording_truncated: rec?.truncated ?? false,
        // PRD 23 §ב / 24 §ב: the bank most of the learner's exercises in this
        // meeting were opened from, else the learner's record; meetings 1–2 have none.
        learning_path: m >= 3 ? path : "",
        // Module 14 §ב: meeting 1 is not scored, whatever a stored document says.
        session_doc_score_percent: isScoredMeeting(m) ? (sessionDoc?.session_score_percent ?? "") : "",
        session_doc_recommended_path: sessionDoc?.matrix_recommended_path ?? "",
        session_doc_teacher_path: sessionDoc?.teacher_selected_path ?? "",
        teacher_gate_approved: sessionDoc?.teacher_gate_approved ?? "",
        // Which interface tools the learner operated — the measurement meeting 1 exists for.
        ...Object.fromEntries(TOOLS.map((tool) => [`tool_${tool}`, tools.used[tool]])),
        // Register deviation 28, appended last so every earlier column keeps its place.
        place_cue_scaffolds: summary.place_cue_scaffolds ?? 0,
        // Measure 2א and the withdrawn help calls (owner, 30.9.2026), appended last.
        persistence_exercises_with_errors: persistence.exercises_with_errors,
        persistence_solved_without_help: persistence.solved_without_help,
        persistence_without_help_percent: persistence.percent ?? "",
        help_withdrawals: summary.help_withdrawals ?? 0,
        // Requests for help from the chat (owner, 1.10.2026), appended last.
        chat_help_requests: summary.chat_help_requests ?? 0,
        // The run since the last reset, as the reports and the gate score it (owner, 2.10.2026), appended last.
        ...afterValues,
        // Catch-up time (owner, 2.10.2026): rounds, minutes, reasons, notes — appended last.
        ...catchUpExportCells(catchUpByKey.get(k)),
        // PRD 14 §ב0 / 24 §ב: the meeting's score before the learner's latest
        // completion, next to the new one (session_doc_score_percent); empty
        // when there was none. Appended last.
        previous_score_percent: isScoredMeeting(m) && isPercent(sessionDoc?.previous_score_percent) ? sessionDoc!.previous_score_percent : "",
      });
    }

    // ── 3. Reflections: Firestore + the learners' RTDB nodes + the shared node ──
    const fsReflections = await readAllDocs(db.collection("srl_reflections"));
    const sharedReflectionsSnap = await rtdb.ref("reflections").get();
    const sharedReflections: Record<string, any> = sharedReflectionsSnap.val() || {};
    // Only the Module 16 fields leave the building. Every reflection source
    // used to be spread wholesale into the CSV, and a reflection is where a
    // child types; the PII check below only knows phone numbers, e-mails and
    // nine-digit ids, so a Hebrew first name passed straight through.
    // Appendix A §4 (SRLReflectionState) names the columns; a document written
    // before 9.10.2026 carries effort_level / submitted_at, read into them.
    const REFLECTION_FIELDS = [
      "student_id", "session_id", "session_number", "reflection_step", "effort_score", "selected_strategies",
      "persistence_index", "reflection_completed", "reflection_updated_at", "idempotency_key",
      "undo_count", "error_count", "guess_count",
      "effort", "strategies", "persistenceIndex", "undoCount", "timestamp",
    ] as const;
    const pickReflection = (source: string, id: string, raw: unknown): Record<string, any> => {
      const r = normalizeReflectionFields(raw && typeof raw === "object" ? (raw as Record<string, any>) : {});
      const out: Record<string, any> = { source, reflection_id: id };
      for (const f of REFLECTION_FIELDS) {
        const v = r[f];
        if (v === undefined) continue;
        out[f] = Array.isArray(v) ? v.map(String).join("|") : typeof v === "object" && v !== null ? "" : v;
      }
      if (out.student_id === undefined) out.student_id = studentNumber(r.student?.id ?? r.student_id) ?? "";
      return isoTimeFields(out);
    };
    const reflectionRows: Record<string, any>[] = [
      ...fsReflections.map(({ id, data }) => pickReflection("firestore", id, data)),
      ...Object.entries(sharedReflections).map(([id, r]) => pickReflection("rtdb_shared", id, r)),
      ...rtdbReflectionRows.map((r) => pickReflection(String(r.source ?? "rtdb_student"), String(r.reflection_id ?? ""), r)),
    ].filter((r) => scopedSession === null || Number(r.session_number) === scopedSession || sessionNumberFromId(String(r.session_id || "")) === scopedSession);

    // ── 4. Every reset audit entry ──────────────────────────────────────────

    const [labelActions, labelMeetings, labelRecordings, labelReflections, labelResetLog] = RESEARCH_FILE_LABELS;
    const files: Array<{ name: string; csv: string; rows: number }> = [
      { name: labelActions, csv: toCsv(telemetryRows), rows: telemetryRows.length },
      { name: labelMeetings, csv: toCsv(meetingRows), rows: meetingRows.length },
      { name: labelRecordings, csv: toCsv(recordingRows), rows: recordingRows.length },
      { name: labelReflections, csv: toCsv(reflectionRows), rows: reflectionRows.length },
      { name: labelResetLog, csv: toCsv(resetRows), rows: resetRows.length },
    ];

    // Requirement 3: PII Detection check across all CSV outputs
    const allContent = files.map((f) => f.csv).join("\n");
    // The caller's own address used to be excused from this check — and then
    // exported. Nothing in these files may be an address, the caller's included.
    // Phones use the shared pattern (phonePattern.ts): the old 05X-XXXXXXX rule
    // let "050 123 4567", "+972501234567" and every other common layout through.
    if (researchFilesContainPii(allContent)) {
      // Which file, never what matched: the log must not carry the identifier either.
      const where = files.filter((f) => researchFilesContainPii(f.csv)).map((f) => f.name).join(", ");
      logger.warn(`Research dataset export rejected: PII pattern detected in: ${where}.`);
      // details.reason lets the teacher's screen say why, instead of "try again later".
      throw new HttpsError("failed-precondition", RESEARCH_EXPORT_PII_REFUSAL_HE, { reason: "pii" });
    }

    // PRD Module 24 §ב: the flat Drive folder "2 נתוני מחקר", no sub-folders,
    // "ייצוא DD.MM.YYYY HH-mm - <קובץ>.csv" (all sessions) or
    // "ייצוא מפגש N - DD.MM.YYYY HH-mm - <קובץ>.csv" (one session), Israel
    // time. A re-export, even on the same day, writes new files.
    const exportedAt = Date.now();
    const scopeLabel = scopedSession === null ? "כל המפגשים" : `מפגש ${scopedSession}`;

    const uploads: Record<string, string> = {};
    const uploadedLinks: string[] = [];
    // קבצים שהדרייב דחה והמתינו באחסון (החלטת בעל המוצר, 23.9.2026).
    const parked: Array<{ name: string; url: string | null; path: string }> = [];
    for (const f of files) {
      const res = await uploadBufferToDrive(Buffer.from(f.csv, "utf-8"), researchExportFileName(f.name, scopedSession, exportedAt), "text/csv", DRIVE_FOLDERS.researchData);
      uploads[f.name] = res.success ? res.webViewLink : `failed: ${res.error}`;
      if (res.success) uploadedLinks.push(res.webViewLink);
      else if (res.fallbackStoragePath) {
        parked.push({ name: f.name, url: res.fallbackDownloadUrl ?? null, path: res.fallbackStoragePath });
        uploads[f.name] = res.fallbackDownloadUrl ?? `נשמר באחסון: ${res.fallbackStoragePath}`;
      }
    }
    // הייצוא נכשל רק אם גם הדרייב וגם האחסון לא קיבלו דבר. אם הקבצים
    // ממתינים באחסון — הם קיימים, ואין שום סיבה להגיד למורה שהכול אבד.
    if (uploadedLinks.length === 0 && parked.length === 0) {
      throw new HttpsError("internal", `הייצוא נבנה (${files.map((f) => `${f.name}: ${f.rows}`).join(", ")}) אך הכתיבה נכשלה: ${uploads[files[0].name]}`);
    }

    // Module 23א §ד / 24 §ב: the export is logged with reset_level 'export', in
    // the ResetAuditEntry shape, without deleting anything and without an
    // e-mail address. backup_file_url points to the files created (the first
    // Drive file; the reason note names every file and its row count).
    const exportLogId = `export_${exportedAt}_${Math.random().toString(36).substring(2, 7)}`;
    const fileList = files.map((f) => `${researchExportFileName(f.name, scopedSession, exportedAt)} (${f.rows})`).join("; ");
    const where = uploadedLinks.length > 0
      ? `בדרייב בתיקייה "${DRIVE_FOLDERS.researchData}"`
      : "ב-Cloud Storage בלבד (הדרייב לא היה זמין)";
    await db.collection("reset_audit_log").doc(exportLogId).set({
      ...exportAuditEntry({
        resetId: exportLogId,
        teacherUid: request.auth.uid,
        classId: class_id,
        affectedStudentIds: ALL_LEARNERS,
        fileUrl: uploadedLinks[0] ?? (parked[0] ? `gs://${admin.storage().bucket().name}/${parked[0].path}` : null),
        note: `ייצוא נתוני מחקר, ${scopeLabel}, ${where}: ${fileList}`,
        sessionNumber: scopedSession,
        now: exportedAt,
      }),
    });

    logger.info(`Research dataset exported for class ${class_id} (${scopeLabel}): ${files.map((f) => `${f.name}=${f.rows}`).join(", ")}`);

    return {
      status: "SUCCESS",
      exportDate: new Date(exportedAt).toISOString().slice(0, 10),
      scope: scopedSession ?? "all",
      driveFolder: DRIVE_FOLDERS.researchData,
      rowCounts: Object.fromEntries(files.map((f) => [f.name, f.rows])),
      files: uploads,
    };
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    logger.error("Failed to export research dataset:", err);
    throw new HttpsError("internal", err?.message || "ייצוא נתוני המחקר נכשל.");
  }
});

/**
 * PRD Module 23א §ד: the learner journey's "הורדת המפגש" (Module 21) is logged
 * in reset_audit_log with reset_level 'export', backup_file_url null (the file
 * is downloaded to the teacher's computer), and no e-mail address. The rules
 * keep the log server-written, so the dashboard calls this after a download.
 */
export const logMeetingDownload = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be authenticated.");
  requireTeacherForIndividualData(request.auth.token as Record<string, any>);
  const class_id = validateClassId(request.data?.class_id, "מזהה הכיתה אינו תקין.");
  assertCallerClass(request.auth.token as Record<string, unknown>, class_id, "אפשר לתעד רק את הכיתה המשויכת לחשבון המחובר.");
  const learner = Number(request.data?.student_id);
  const meeting = validMeetingNumber(request.data?.session_number);
  if (!Number.isInteger(learner) || learner < 1 || learner > 12 || meeting === null) {
    throw new HttpsError("invalid-argument", "מספר התלמיד או המפגש אינו תקין.");
  }
  const now = Date.now();
  const id = `export_${now}_${Math.random().toString(36).substring(2, 7)}`;
  await admin.firestore().collection("reset_audit_log").doc(id).set({
    ...exportAuditEntry({
      resetId: id,
      teacherUid: request.auth.uid,
      classId: class_id,
      affectedStudentIds: [learner],
      fileUrl: null,
      note: `הורדת המפגש: תלמיד ${learner}, מפגש ${meeting}, הורדה למחשב`,
      sessionNumber: meeting,
      now,
    }),
  });
  return { status: "SUCCESS", logId: id };
});
