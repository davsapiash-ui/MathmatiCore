/**
 * Module 21: moves screen recordings made before they got their own node.
 *
 * Until this version the learner's client wrote its recordings under the
 * learner record, users/students/{id}/telemetry_sessions and …/recorded_bytes.
 * Every teacher screen listens to the whole users/students tree, so those
 * recordings keep reaching the teacher's computer on every dashboard open
 * until they are moved to recordings/{student_userN} (recordingsNode.ts).
 *
 * Nothing runs this on deploy. The teacher presses "העברת הקלטות ישנות" on the
 * radar (shown only while old recordings exist), and this callable:
 *   1. reads what is still at the old place;
 *   2. backs it up the way a reset does (Module 23א §ג: the shared Drive's
 *      reset-backup folder, else this project's own Cloud Storage) — no backup,
 *      nothing moved;
 *   3. copies it, entry by entry, into recordings/{student_userN} — merging,
 *      so nothing the learner wrote there since the update is overwritten;
 *   4. reads the copy back and compares every entry;
 *   5. only then removes from the old place exactly the entries it copied —
 *      a chunk an old open page delivered meanwhile stays, and the next run
 *      moves it.
 * Running it again is safe: what was already moved is no longer at the old
 * place, and copying the same entry twice writes the same value.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { requireTeacherForIndividualData } from "./callerIdentity";
import {
  DRIVE_FOLDERS,
  assertCallerClass,
  resolveDriveFolder,
  uploadBufferToDrive,
  validateClassId,
} from "./exportDriveReport";
import { RECORDINGS_ROOT, RECORDING_FIELDS, RECORDING_OR_FLAGS } from "./recordingsNode";

/**
 * How deep under telemetry_sessions / recorded_bytes an entry is copied whole:
 * {recording}/chunks/{key} and {meeting}/chunks/{key}. A recording's flags
 * sit higher and are copied as they are.
 */
const ENTRY_DEPTH = 3;
/** The Admin SDK accepts one write of 16MB; a recording meeting may hold 50MB. */
const MAX_WRITE_BYTES = 4 * 1024 * 1024;
const DRIVE_MAX_BYTES = 30 * 1024 * 1024;

const isPlainObject = (v: unknown): v is Record<string, any> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * A users/students key that names a learner. The SAME rule decides when the
 * radar offers the move (react-ts-version/src/core/legacyRecordings.ts,
 * LEARNER_RECORD_KEY): a key detected there but skipped here would keep the
 * button on screen for ever.
 */
export const LEARNER_RECORD_KEY = /^(?:student_user|student_|user)?(\d{1,2})$/;

/** "student_user8", "student_8", "user8", "8" → 8; anything else → null. */
export function learnerNumberOfKey(key: string): number | null {
  const m = LEARNER_RECORD_KEY.exec(key);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 12 ? n : null;
}

/** The node's entries as path → value, down to `depth` levels (an object at that depth is one entry). */
export function flattenEntries(node: unknown, prefix: string, depth: number, out: Record<string, unknown> = {}): Record<string, unknown> {
  if (depth === 0 || !isPlainObject(node)) {
    out[prefix] = node;
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (v === null || v === undefined) continue;
    flattenEntries(v, `${prefix}/${k}`, depth - 1, out);
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  return false;
}

/** The value at a slash path inside a plain object; undefined when absent. */
function valueAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split("/").filter(Boolean)) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

export interface LegacyRecordingsMove {
  /** The old place, e.g. users/students/student_user8/telemetry_sessions. */
  from: string;
  /** The new place, e.g. recordings/student_user8/telemetry_sessions. */
  to: string;
  student: number;
  value: Record<string, any>;
}

/**
 * What is still at the old place, from a users/students tree. A key that is
 * not a learner 1–12 is left alone. All aliases of a learner go to the one
 * canonical node the recorder writes, recordings/student_userN.
 */
export function planLegacyRecordingsMove(studentsNode: unknown): LegacyRecordingsMove[] {
  const moves: LegacyRecordingsMove[] = [];
  if (!isPlainObject(studentsNode)) return moves;
  for (const [key, record] of Object.entries(studentsNode)) {
    const n = learnerNumberOfKey(key);
    if (n === null || !isPlainObject(record)) continue;
    for (const field of RECORDING_FIELDS) {
      const value = record[field];
      if (!isPlainObject(value) || Object.keys(value).length === 0) continue;
      moves.push({ from: `users/students/${key}/${field}`, to: `${RECORDINGS_ROOT}/student_user${n}/${field}`, student: n, value });
    }
  }
  return moves;
}

export interface MoveResult {
  moved_entries: number;
  students: number[];
  /** Old-place entries whose copy did not read back as written: not removed (a failed write; the next press retries). */
  mismatched: string[];
  /**
   * New-place entries that two sources gave different values (two aliases of
   * one learner, or the old place and what the new version already wrote).
   * Settled by resolveEntry; every losing value is in the backup file.
   */
  conflicts: number;
}

/** The minimal database surface the move needs (the Admin SDK's, or a fake in tests). */
export interface RtdbLike {
  ref(path: string): {
    get(): Promise<{ val(): any }>;
    update(values: Record<string, unknown>): Promise<void>;
  };
}

async function writeInBatches(rtdb: RtdbLike, entries: Array<[string, unknown]>): Promise<void> {
  let batch: Record<string, unknown> = {};
  let bytes = 0;
  for (const [path, value] of entries) {
    const size = Buffer.byteLength(JSON.stringify(value ?? null), "utf-8") + path.length;
    if (bytes > 0 && bytes + size > MAX_WRITE_BYTES) {
      await rtdb.ref("/").update(batch);
      batch = {};
      bytes = 0;
    }
    batch[path] = value;
    bytes += size;
  }
  if (bytes > 0) await rtdb.ref("/").update(batch);
}

/**
 * The one value a new-place entry gets when its sources disagree, the same
 * rule every reader merges by (recordingsNode.mergeRecordingField):
 *  - a truncated flag is true when any source, or the new place, says so;
 *  - otherwise what the new version already wrote there stays;
 *  - otherwise the canonical record (student_userN) wins over an alias, and
 *    among aliases the first by path. Deterministic, so a second press
 *    reaches the same answer and never leaves an entry behind for ever.
 */
export function resolveEntry(
  toPath: string,
  existing: unknown,
  sources: Array<{ from: string; value: unknown }>
): unknown {
  const key = toPath.slice(toPath.lastIndexOf("/") + 1);
  if (RECORDING_OR_FLAGS.has(key)) return existing === true || sources.some((s) => s.value === true);
  if (existing !== null && existing !== undefined) return existing;
  const rank = (from: string) => (/^users\/students\/student_user\d+\//.test(from) ? 0 : 1);
  const ordered = [...sources].sort((a, b) => rank(a.from) - rank(b.from) || a.from.localeCompare(b.from));
  return ordered[0].value;
}

/**
 * Steps 3–5 of the file comment, for a plan already backed up: settle each
 * new-place entry (resolveEntry), write it, read it back, then remove from the
 * old place every source entry whose new-place entry reads back as settled.
 */
export async function copyVerifyAndRemove(rtdb: RtdbLike, moves: LegacyRecordingsMove[]): Promise<MoveResult> {
  const sourcesByTo = new Map<string, Array<{ from: string; value: unknown }>>();
  for (const move of moves) {
    const fromEntries = flattenEntries(move.value, move.from, ENTRY_DEPTH);
    for (const [fromPath, value] of Object.entries(fromEntries)) {
      const toPath = move.to + fromPath.slice(move.from.length);
      sourcesByTo.set(toPath, [...(sourcesByTo.get(toPath) ?? []), { from: fromPath, value }]);
    }
  }

  const targets = Array.from(new Set(moves.map((m) => m.to)));
  const targetOf = (to: string) => targets.find((t) => to === t || to.startsWith(`${t}/`))!;
  const readTargets = async () => {
    const out = new Map<string, unknown>();
    for (const t of targets) out.set(t, (await rtdb.ref(t).get()).val());
    return out;
  };

  // What the new version already wrote decides some entries (resolveEntry).
  const before = await readTargets();
  const resolved = new Map<string, unknown>();
  let conflicts = 0;
  for (const [to, sources] of sourcesByTo) {
    const t = targetOf(to);
    const existing = valueAt(before.get(t), to.slice(t.length));
    const value = resolveEntry(to, existing, sources);
    resolved.set(to, value);
    const seen = [...sources.map((s) => s.value), ...(existing === null || existing === undefined ? [] : [existing])];
    if (seen.some((v) => !deepEqual(v, seen[0]))) conflicts++;
  }
  await writeInBatches(rtdb, Array.from(resolved.entries()));

  // Read every target node back once and compare entry by entry.
  const after = await readTargets();
  const verified: string[] = [];
  const mismatched: string[] = [];
  for (const [to, sources] of sourcesByTo) {
    const t = targetOf(to);
    const ok = deepEqual(valueAt(after.get(t), to.slice(t.length)), resolved.get(to));
    for (const s of sources) (ok ? verified : mismatched).push(s.from);
  }

  await writeInBatches(rtdb, verified.map((path) => [path, null]));
  return {
    moved_entries: verified.length,
    students: Array.from(new Set(moves.map((m) => m.student))).sort((a, b) => a - b),
    mismatched,
    conflicts,
  };
}

const MOVE_RUNTIME = { timeoutSeconds: 540, memory: "1GiB" as const };

export const moveLegacyRecordings = onCall(MOVE_RUNTIME, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be authenticated.");
  const token = request.auth.token as Record<string, unknown>;
  // The recordings are individual learner data (Module 24 §ב): the class teacher only.
  requireTeacherForIndividualData(token);
  const class_id = validateClassId(request.data?.class_id, "מזהה הכיתה אינו תקין. לא הועברו הקלטות.");
  assertCallerClass(token, class_id, "אפשר להעביר רק את ההקלטות של הכיתה המשויכת לחשבון המחובר. לא הועברו הקלטות.");

  const rtdb = admin.database();
  const moves = planLegacyRecordingsMove((await rtdb.ref("users/students").get()).val());
  if (moves.length === 0) {
    return { status: "NOTHING_TO_MOVE", moved_entries: 0, students: [] as number[] };
  }

  // Step 2: the backup, before anything is written or removed.
  const snapshotTime = Date.now();
  const backup = {
    backup_format: "mathmaticore-recordings-move/1",
    performed_by_teacher_id: request.auth.uid,
    class_id,
    snapshot_time: snapshotTime,
    snapshot_time_iso: new Date(snapshotTime).toISOString(),
    realtime_database: Object.fromEntries(moves.map((m) => [m.from, m.value])),
  };
  const buffer = Buffer.from(JSON.stringify(backup), "utf-8");
  const fileName = `Backup_recordings_move_${class_id}_${snapshotTime}.json`;
  let backupLink: string | null = null;
  if (buffer.length <= DRIVE_MAX_BYTES) {
    const drive = await uploadBufferToDrive(buffer, fileName, "application/json", await resolveDriveFolder([DRIVE_FOLDERS.resetBackups]));
    if (drive.success) backupLink = drive.webViewLink || drive.fileId;
  }
  if (!backupLink) {
    try {
      const storagePath = `backups/${class_id}/recordings_move_${snapshotTime}.json`;
      const bucket = admin.storage().bucket();
      await bucket.file(storagePath).save(buffer, { contentType: "application/json" });
      backupLink = `gs://${bucket.name}/${storagePath}`;
    } catch (err: any) {
      logger.error("moveLegacyRecordings: no backup channel worked; nothing moved:", err?.message || err);
      throw new HttpsError("internal", "הגיבוי נכשל, ולכן ההקלטות לא הועברו. לא נמחק דבר.");
    }
  }

  let result: MoveResult;
  try {
    result = await copyVerifyAndRemove(rtdb as unknown as RtdbLike, moves);
  } catch (err: any) {
    logger.error("moveLegacyRecordings: the move stopped part-way; the backup is at", backupLink, err);
    throw new HttpsError(
      "internal",
      "הגיבוי נשמר, אבל ההעברה נעצרה באמצע. מה שלא הועבר נשאר במקומו. אפשר ללחוץ שוב.",
      { backup: backupLink }
    );
  }
  logger.info(
    `moveLegacyRecordings: ${result.moved_entries} entries of learners ${result.students.join(",")} moved; ` +
    `${result.mismatched.length} left in place; ${result.conflicts} conflicting entries settled; backup ${backupLink}`
  );
  if (result.mismatched.length > 0) {
    throw new HttpsError(
      "internal",
      "הגיבוי נשמר וחלק מההקלטות הועברו. חלק מהן לא עברו את הבדיקה ונשארו במקומן הקודם. אפשר ללחוץ שוב.",
      { backup: backupLink, mismatched: result.mismatched.length }
    );
  }
  return { status: "SUCCESS", moved_entries: result.moved_entries, students: result.students, conflicts: result.conflicts, backup: backupLink };
});
