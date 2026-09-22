import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { scrubPII } from "./geminiProxy";

/**
 * Anonymize student real names against known student roster map (Module 22).
 */
function substituteKnownStudentNames(text: string, knownNameMap: Record<string, number | string>): string {
  let processed = text;
  for (const [name, studentNum] of Object.entries(knownNameMap)) {
    if (name && name.length >= 2) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Matches standalone Hebrew name with common prefixes (ו, כ, ל, ב, מ, ש, ה)
      const regex = new RegExp(`(^|[\\s,.:;!?])([וכלבמשה]?)${escaped}(?=[\\s,.:;!?]|$)`, 'gu');
      processed = processed.replace(regex, (_match, before, prefix) => {
        return `${before}${prefix || ''}תלמיד ${studentNum}`;
      });
    }
  }
  return processed;
}

/**
 * sendTeacherAdminMessage (Module 22: Teacher-Admin Chat Layer 2 Security)
 * Enforces second layer PII scrubbing and server-side student roster cross-referencing
 * before writing to Firestore /messages collection.
 */
export const sendTeacherAdminMessage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  // Module 22 is a staff channel. firestore.rules blocks direct client writes
  // to /messages on the assumption this callable guards entry — without this
  // check any signed-in student token could post into the teacher-admin chat.
  const token = request.auth.token as Record<string, unknown>;
  const tokenRoles: string[] = Array.isArray(token.roles) ? (token.roles as string[]) : token.role ? [String(token.role)] : [];
  const lowered = tokenRoles.map((r) => r.toLowerCase());
  const isStaff = lowered.includes("teacher") || lowered.includes("admin") || token.teacher === true || token.admin === true;
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only teachers and admins may use this channel.");
  }

  const { receiver_id, message_body, school_id, class_name, class_id = "class_1", ephemeral_name_map, client_message_id } = request.data || {};
  if (!receiver_id || !message_body) {
    throw new HttpsError("invalid-argument", "Missing receiver_id or message_body.");
  }

  // Canonical chat addressing (Module 22): the management side is always the
  // literal id "admin", and a teacher is always the email-derived key the
  // admin console lists them under (useAdminStore.addTeacher). Stamping the
  // raw auth uid here instead matched neither UI's filters, so messages that
  // were written successfully still showed up on neither end.
  const callerRole = request.auth.token.role;
  const isAdminSender = callerRole === "admin" || callerRole === "ADMIN" || request.auth.token.admin === true;
  const callerEmail = request.auth.token.email;
  const teacherKey = callerEmail ? String(callerEmail).trim().replace(/[@.#$[\]]/g, "_") : request.auth.uid;
  // Which side is speaking follows the address, not the token alone. The
  // pilot owner holds both roles; sending to "admin" from the teacher
  // dashboard used to be stamped sender "admin" → receiver "admin", a
  // message addressed to nobody that appeared on neither screen. A message
  // to management is from a teacher; a message to a teacher is from
  // management, and only an admin token may send one.
  const addressingManagement = String(receiver_id) === "admin";
  if (!addressingManagement && !isAdminSender) {
    throw new HttpsError("permission-denied", "Only management may write to a teacher on this channel.");
  }
  const senderId = addressingManagement ? teacherKey : "admin";
  const db = admin.firestore();

  // Layer 2A: Ephemeral in-memory student name map (passed only during active teacher session, never stored in DB)
  // Bounded: the pilot has twelve learners, so twelve names is the ceiling.
  // The map came straight off the request and every entry became a regex
  // over the whole message — an unbounded client-chosen loop.
  const knownNameMap: Record<string, number | string> = {};
  if (ephemeral_name_map && typeof ephemeral_name_map === 'object') {
    for (const [name, num] of Object.entries(ephemeral_name_map as Record<string, unknown>).slice(0, 12)) {
      const n = Number(num);
      if (typeof name === 'string' && name.length >= 2 && name.length <= 40 && Number.isInteger(n) && n >= 1 && n <= 12) {
        knownNameMap[name] = n;
      }
    }
  }

  // Cognitive pattern check: "תלמיד {X} המכונה {שם}" -> "תלמיד {X}"
  let preProcessedBody = String(message_body).trim();
  preProcessedBody = preProcessedBody.replace(/(תלמיד\s+\d+)\s+המכונה\s+[א-ת]+/gu, '$1');

  // Layer 2B: Substitute matched names with anonymous IDs ("דניאל" -> "תלמיד 4")
  const substitutedBody = substituteKnownStudentNames(preProcessedBody, knownNameMap);

  // Layer 2C: Server-side PII regex scrubbing
  const cleanBody = scrubPII(substitutedBody);

  const messageDoc = {
    sender_id: senderId,
    receiver_id: String(receiver_id),
    message_body: cleanBody,
    timestamp: Date.now(),
    school_id: school_id || "school_pilot_01",
    class_id,
    class_name: class_name || "המבקרים",
    read: false,
  };

  // Module 22 §ה: a message queued offline (Module 17) is redelivered on reconnect.
  // The client's id becomes the document id, so a retry overwrites instead of
  // duplicating. Only a short, safe id is accepted; anything else falls back to
  // a server-generated id as before.
  const clientId = typeof client_message_id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(client_message_id) ? client_message_id : null;
  const docRef = clientId ? db.collection("messages").doc(clientId) : db.collection("messages").doc();
  await docRef.set(messageDoc);

  logger.info(`Teacher-Admin message sent securely: ${docRef.id}`);
  return { status: "SENT", messageId: docRef.id, message: messageDoc };
});

