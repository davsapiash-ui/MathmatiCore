"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTeacherAdminMessage = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const geminiProxy_1 = require("./geminiProxy");
/**
 * sendTeacherAdminMessage (Module 22: Teacher-Admin Chat Layer 2 Security)
 * Enforces second layer PII scrubbing before writing to Firestore /messages collection.
 */
exports.sendTeacherAdminMessage = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { receiver_id, message_body, school_id, class_name } = request.data || {};
    if (!receiver_id || !message_body) {
        throw new https_1.HttpsError("invalid-argument", "Missing receiver_id or message_body.");
    }
    const senderId = request.auth.uid;
    // Layer 2: Server-side PII scrubbing
    const cleanBody = (0, geminiProxy_1.scrubPII)(String(message_body).trim());
    const messageDoc = {
        sender_id: senderId,
        receiver_id: String(receiver_id),
        message_body: cleanBody,
        timestamp: Date.now(),
        school_id: school_id || "school_pilot_01",
        class_name: class_name || "המבקרים",
        read: false,
    };
    const db = admin.firestore();
    const res = await db.collection("messages").add(messageDoc);
    logger.info(`Teacher-Admin message sent securely: ${res.id}`);
    return { status: "SENT", messageId: res.id, message: messageDoc };
});
//# sourceMappingURL=teacherAdminChat.js.map