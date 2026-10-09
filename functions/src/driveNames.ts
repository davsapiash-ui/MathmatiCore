/**
 * PRD Module 23, "תיקיות הדרייב": the four flat Drive folders and the exact
 * file names the system writes into them. Pure functions, no Firebase.
 *
 * - Four folders inside the researcher's root folder, created on first write,
 *   with no sub-folders: "1 דוחות", "2 נתוני מחקר", "3 גיבויים", "4 מנהל".
 * - Learner number in two digits, date DD.MM.YYYY, time HH-mm, Israel time.
 * - Regenerating never overwrites: every upload creates a new file (Drive
 *   keeps files of the same name side by side). Files already in Drive are
 *   not moved.
 */

export const DRIVE_FOLDERS = {
  reports: "1 דוחות",
  researchData: "2 נתוני מחקר",
  backups: "3 גיבויים",
  admin: "4 מנהל",
} as const;

export type DriveFolderName = typeof DRIVE_FOLDERS[keyof typeof DRIVE_FOLDERS];

function israelParts(ms: number): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

/** "08.10.2026" on the Israeli calendar. */
export function israelDate(ms: number = Date.now()): string {
  const p = israelParts(ms);
  return `${p.day}.${p.month}.${p.year}`;
}

/** "14-30" on the Israeli clock. */
export function israelTime(ms: number = Date.now()): string {
  const p = israelParts(ms);
  return `${p.hour}-${p.minute}`;
}

/** "08.10.2026 14-30" */
export function israelDateTime(ms: number = Date.now()): string {
  return `${israelDate(ms)} ${israelTime(ms)}`;
}

/** The learner's anonymous number in two digits: 4 → "04". */
export function learnerNumber2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "מפגש 3 - תלמיד 01 - 08.10.2026.pdf" (folder "1 דוחות"). */
export function learnerReportFileName(sessionNumber: number, studentNumber: number, ms: number = Date.now()): string {
  return `מפגש ${sessionNumber} - תלמיד ${learnerNumber2(studentNumber)} - ${israelDate(ms)}.pdf`;
}

/** "מפגש 3 - כיתה - 08.10.2026.pdf" / ".csv" (folder "1 דוחות"). */
export function classReportFileName(sessionNumber: number, ext: "pdf" | "csv", ms: number = Date.now()): string {
  return `מפגש ${sessionNumber} - כיתה - ${israelDate(ms)}.${ext}`;
}

/** The five research files (Module 24 §ב), by the names the PRD gives them. */
export const RESEARCH_FILE_LABELS = ["פעולות", "מפגשים", "הקלטות", "רפלקציות", "יומן איפוסים"] as const;

/**
 * "ייצוא 08.10.2026 14-30 - פעולות.csv" for all sessions,
 * "ייצוא מפגש 3 - 08.10.2026 14-30 - פעולות.csv" for one session (folder "2 נתוני מחקר").
 */
export function researchExportFileName(fileLabel: string, scopedSession: number | null, ms: number = Date.now()): string {
  const scope = scopedSession === null ? "ייצוא" : `ייצוא מפגש ${scopedSession} -`;
  return `${scope} ${israelDateTime(ms)} - ${fileLabel}.csv`;
}

/** What a reset backup covers, for its file name (Module 23א §ג). */
export type BackupKind =
  | { type: "student_session"; student: number; session: number }
  | { type: "student_full"; student: number }
  | { type: "class_session"; session: number }
  | { type: "system" }
  | { type: "other"; label: string };

export function backupKindLabel(kind: BackupKind): string {
  switch (kind.type) {
    case "student_session": return `תלמיד ${learnerNumber2(kind.student)} מפגש ${kind.session}`;
    case "student_full": return `תלמיד ${learnerNumber2(kind.student)} מוחלט`;
    case "class_session": return `כל הכיתה מפגש ${kind.session}`;
    case "system": return "מערכת";
    case "other": return kind.label;
  }
}

/** "גיבוי 08.10.2026 14-30 - תלמיד 04 מפגש 3.json" (folder "3 גיבויים"). */
export function backupFileName(kind: BackupKind, ms: number = Date.now()): string {
  return `גיבוי ${israelDateTime(ms)} - ${backupKindLabel(kind)}.json`;
}

/** "דוח מנהל 08.10.2026.pdf" (folder "4 מנהל"). */
export function adminReportFileName(ms: number = Date.now()): string {
  return `דוח מנהל ${israelDate(ms)}.pdf`;
}

/** Module 23א §ג: recording chunks that arrive after a full learner or a system reset. */
export const LATE_RECORDING_LABEL = "הקלטה שהגיעה אחרי האיפוס";


/** Module 23א §ג: wait at most 90 s for the backup's Drive write. */
export const BACKUP_DRIVE_TIMEOUT_MS = 90_000;
/** Module 23א §ג: a backup above 30MB goes straight to Cloud Storage. */
export const BACKUP_DRIVE_MAX_BYTES = 30 * 1024 * 1024;

/** The Cloud Storage copy of a backup: backups/{class_id}/… (teacher-readable, storage.rules). */
export function backupStoragePath(classId: string, resetId: string, fileName: string): string {
  return `backups/${classId}/${resetId}/${fileName}`;
}

/** gs://bucket/path → { bucket, path }; null for anything else (a Drive link). */
export function parseGsUrl(url: unknown): { bucket: string; path: string } | null {
  if (typeof url !== "string") return null;
  const m = /^gs:\/\/([^/]+)\/(.+)$/.exec(url);
  return m ? { bucket: m[1], path: m[2] } : null;
}

/** The file name at the end of a storage path. */
export function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}
