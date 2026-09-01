"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTeacherAdminMessage = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const geminiProxy_1 = require("./geminiProxy");
/**
 * Anonymize student real names against known student roster map (Module 22).
 */
function substituteKnownStudentNames(text, knownNameMap) {
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
exports.sendTeacherAdminMessage = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { receiver_id, message_body, school_id, class_name, class_id = "class_1", ephemeral_name_map } = request.data || {};
    if (!receiver_id || !message_body) {
        throw new https_1.HttpsError("invalid-argument", "Missing receiver_id or message_body.");
    }
    // Canonical chat addressing (Module 22): the management side is always the
    // literal id "admin", and a teacher is always the email-derived key the
    // admin console lists them under (useAdminStore.addTeacher). Stamping the
    // raw auth uid here instead matched neither UI's filters, so messages that
    // were written successfully still showed up on neither end.
    const callerRole = request.auth.token.role;
    const isAdminSender = callerRole === "admin" || callerRole === "ADMIN" || request.auth.token.admin === true;
    const callerEmail = request.auth.token.email;
    const senderId = isAdminSender
        ? "admin"
        : (callerEmail ? String(callerEmail).trim().replace(/[@.#$[\]]/g, "_") : request.auth.uid);
    const db = admin.firestore();
    // Layer 2A: Ephemeral in-memory student name map (passed only during active teacher session, never stored in DB)
    const knownNameMap = {};
    if (ephemeral_name_map && typeof ephemeral_name_map === 'object') {
        Object.assign(knownNameMap, ephemeral_name_map);
    }
    // Cognitive pattern check: "תלמיד {X} המכונה {שם}" -> "תלמיד {X}"
    let preProcessedBody = String(message_body).trim();
    preProcessedBody = preProcessedBody.replace(/(תלמיד\s+\d+)\s+המכונה\s+[א-ת]+/gu, '$1');
    // Layer 2B: Substitute matched names with anonymous IDs ("דניאל" -> "תלמיד 4")
    const substitutedBody = substituteKnownStudentNames(preProcessedBody, knownNameMap);
    // Layer 2C: Server-side PII regex scrubbing
    const cleanBody = (0, geminiProxy_1.scrubPII)(substitutedBody);
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
    const res = await db.collection("messages").add(messageDoc);
    logger.info(`Teacher-Admin message sent securely: ${res.id}`);
    return { status: "SENT", messageId: res.id, message: messageDoc };
});
//# sourceMappingURL=teacherAdminChat.js.map