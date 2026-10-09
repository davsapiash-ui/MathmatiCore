import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { randomInt, timingSafeEqual } from "crypto";
import { readCallerRoles } from "./callerIdentity";

/**
 * Personal learner access codes — PRD Module 1 §א (screen 2) and Module 25 §ב.3:
 *
 *   "לכל לומד קוד בן 4 ספרות, ששתי הראשונות בו הן מספרו בכיתה בשתי ספרות
 *    (01–12) ושתי האחרונות ספרות אקראיות, שאינן זוג ספרות זהות (כמו 11) ואינן
 *    זוג ספרות עוקבות (כמו 34). רשימת הקודים … גלויים למורה ולמנהל המערכת,
 *    וכל אחד מהם יכול לשנות את הקוד של לומד."
 *
 * The codes live in one Firestore document per class,
 * `learner_access_codes/{classId}` = { codes: {"1": "0147", …}, updated_at, updated_by },
 * which the Firestore rules close to every client. Only the Cloud Functions
 * below (Admin SDK) read or write it. A code is never logged.
 */

export const ACCESS_CODES_COLLECTION = "learner_access_codes";
export const PILOT_CLASS_ID = "class_1";
export const LEARNER_IDS: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 1);

export type AccessCodeMap = Record<string, string>;

/**
 * The two random digits may not be a pair of identical digits (11) or a pair of
 * consecutive digits (34). "עוקבות" is read in both directions (34 and 43): a
 * descending pair is also two consecutive digits, and excluding it can never
 * contradict the ascending reading.
 */
export function isAllowedSuffix(suffix: string): boolean {
  if (!/^[0-9]{2}$/.test(suffix)) return false;
  const a = Number(suffix[0]);
  const b = Number(suffix[1]);
  return a !== b && Math.abs(a - b) !== 1;
}

/** Every allowed two-digit ending, "02" … "97" (72 of the 100 pairs). */
export const ALLOWED_SUFFIXES: readonly string[] = Array.from({ length: 100 }, (_, n) =>
  String(n).padStart(2, "0")
).filter(isAllowedSuffix);

export function learnerPrefix(studentId: number): string {
  return String(studentId).padStart(2, "0");
}

/** A well-formed code for this learner: their two-digit number, then an allowed pair. */
export function isWellFormedCode(studentId: number, code: unknown): code is string {
  return (
    typeof code === "string" &&
    /^[0-9]{4}$/.test(code) &&
    code.slice(0, 2) === learnerPrefix(studentId) &&
    isAllowedSuffix(code.slice(2))
  );
}

/**
 * A fresh code for the learner. `avoid` (the learner's current code) is never
 * returned again, so "קוד חדש" always changes the code.
 */
export function generateAccessCode(
  studentId: number,
  avoid?: string,
  pick: (n: number) => number = (n) => randomInt(n)
): string {
  if (!Number.isInteger(studentId) || studentId < 1 || studentId > 12) {
    throw new Error("studentId must be an integer 1..12");
  }
  const prefix = learnerPrefix(studentId);
  const pool = ALLOWED_SUFFIXES.filter((s) => prefix + s !== avoid);
  return prefix + pool[pick(pool.length)];
}

/** Completes a stored map: keeps every valid code, generates the missing or malformed ones. */
export function completeCodeMap(existing: unknown): { codes: AccessCodeMap; changed: boolean } {
  const src = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
  const codes: AccessCodeMap = {};
  let changed = false;
  for (const id of LEARNER_IDS) {
    const current = src[String(id)];
    if (isWellFormedCode(id, current)) {
      codes[String(id)] = current;
    } else {
      codes[String(id)] = generateAccessCode(id);
      changed = true;
    }
  }
  return { codes, changed };
}

/**
 * Constant-time comparison of a typed code against the stored one. Anything
 * that is not exactly four digits (after trimming surrounding spaces) is
 * rejected before it is copied or compared, and an oversized input is
 * rejected before it is even trimmed.
 */
export function codesMatch(expected: string, given: unknown): boolean {
  if (typeof expected !== "string" || typeof given !== "string" || given.length > 8) return false;
  const typed = given.trim();
  if (!/^[0-9]{4}$/.test(typed)) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(typed, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const codesDoc = (classId: string) =>
  admin.firestore().collection(ACCESS_CODES_COLLECTION).doc(classId);

/**
 * Reads the class's code list. In steady state the list is complete and a
 * plain read is enough — no read-write transaction on every learner sign-in
 * (Module 1's latency budget, and no lock contention with "קוד חדש" when
 * twelve learners sign in together). Only a missing or incomplete list opens a
 * transaction, which re-reads and generates the initial codes (or any missing
 * learner's code). `actor` is a uid or "system" — never an e-mail address
 * (Module 25 §ב.3).
 */
export async function loadAccessCodes(classId: string, actor: string): Promise<AccessCodeMap> {
  const ref = codesDoc(classId);
  const plain = await ref.get();
  const stored = completeCodeMap(plain.exists ? plain.data()?.codes : undefined);
  if (!stored.changed) return stored.codes;
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const { codes, changed } = completeCodeMap(snap.exists ? snap.data()?.codes : undefined);
    if (changed) {
      tx.set(ref, {
        codes,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_by: actor,
      });
      logger.info(`Learner access codes initialised for ${classId}`);
    }
    return codes;
  });
}

/** Teacher or system administrator of the pilot class (Module 1 §א, Module 25 §ב.3). */
export function requireStaffOfPilotClass(token: Record<string, unknown> | undefined): void {
  const caller = readCallerRoles(token ?? {});
  if (!caller.isTeacher && !caller.isAdmin) {
    throw new HttpsError("permission-denied", "רשימת קודי הגישה גלויה למורה ולמנהל המערכת בלבד.");
  }
  // Fail closed: a teacher token with no class_id is not the pilot class's teacher.
  if (!caller.isAdmin && caller.classId !== PILOT_CLASS_ID) {
    throw new HttpsError("permission-denied", "הכיתה אינה כיתת הפיילוט.");
  }
}

/** The list of the twelve codes, for the teacher or the system administrator. */
export const getLearnerAccessCodes = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be signed in.");
  }
  requireStaffOfPilotClass(request.auth.token as Record<string, unknown>);
  const codes = await loadAccessCodes(PILOT_CLASS_ID, request.auth.uid);
  return { classId: PILOT_CLASS_ID, codes };
});

/** "קוד חדש" — replaces one learner's code; the teacher or the system administrator. */
export const regenerateLearnerAccessCode = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be signed in.");
  }
  requireStaffOfPilotClass(request.auth.token as Record<string, unknown>);
  const studentId = (request.data as { studentId?: unknown } | undefined)?.studentId;
  if (typeof studentId !== "number" || !Number.isInteger(studentId) || studentId < 1 || studentId > 12) {
    throw new HttpsError("invalid-argument", "Student ID must be an integer between 1 and 12");
  }
  const uid = request.auth.uid;
  const ref = codesDoc(PILOT_CLASS_ID);
  const code = await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const { codes } = completeCodeMap(snap.exists ? snap.data()?.codes : undefined);
    const next = generateAccessCode(studentId, codes[String(studentId)]);
    codes[String(studentId)] = next;
    tx.set(ref, {
      codes,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by: uid,
    });
    return next;
  });
  logger.info(`Learner ${studentId} access code replaced by ${uid}`);
  return { studentId, code };
});
