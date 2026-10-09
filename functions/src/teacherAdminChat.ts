import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { scrubPII } from "./geminiProxy";

/**
 * PRD Module 22 §ב, layer 2: "מסירה שם שבא אחרי 'תלמיד N המכונה' ומשאירה
 * 'תלמיד N'" (§ז: "תלמיד 3 המכונה דניאל מתקשה בפריטה" → "תלמיד 3 מתקשה
 * בפריטה"). A name is one or two Hebrew words, as in scrubPII's introducer
 * pattern (geminiProxy.ts hebrewNameRegex). Two words are taken when the
 * second one ends the clause (end of text or punctuation): "תלמיד 3 המכונה
 * דני כהן" and "…דני כהן, מתקשה" lose both. Otherwise one word only, so the
 * sentence that follows the name ("מתקשה בפריטה") is kept, as §ז requires.
 *
 * There is no list of the class's names (Zero PII): the server never matches
 * against names, and a first name written alone is not replaced.
 */
const NICKNAME_AFTER_LEARNER_ID =
  /(תלמיד\s+\d+)\s+המכונה\s+(?:[א-ת]+\s+[א-ת]+(?=\s*(?:$|[,.:;!?()\-–—"'׳״]))|[א-ת]+)/gu;

export function stripNicknameAfterLearnerId(text: string): string {
  return text.replace(NICKNAME_AFTER_LEARNER_ID, "$1");
}

/**
 * sendTeacherAdminMessage (Module 22: Teacher-Admin Chat Layer 2 Security)
 * Enforces the second layer of PII scrubbing (Module 22 §ב) before writing to
 * the Firestore /messages collection. No roster, no name list (Zero PII).
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

  const { receiver_id, message_body, school_id, class_name, class_id = "class_1", client_message_id } = request.data || {};
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

  // Layer 2A: "תלמיד {X} המכונה {שם}" -> "תלמיד {X}". No name map of any
  // kind is accepted (PRD Module 22 §ב: "אין במערכת רשימת שמות של הכיתה").
  const preProcessedBody = stripNicknameAfterLearnerId(String(message_body).trim());

  // Layer 2B: e-mail, phone, ID number, a name after an introducer, passwords.
  const cleanBody = scrubPII(preProcessedBody);

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

