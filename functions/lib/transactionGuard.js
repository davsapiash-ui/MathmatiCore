"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAndStoreTelemetry = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const MAX_PAYLOAD_SIZE_BYTES = 50 * 1024; // 50KB
const ALLOWED_ACTION_TYPES = [
    "block_split",
    "block_group_success",
    "undo_click",
    "hesitation_timeout",
    "socratic_dialogue",
    "blur_event"
];
/**
 * Validates the Vector Replay Event against the strict PRD schema constraints.
 * Throws HttpsError if validation fails.
 */
function validateVectorReplaySchema(payload) {
    if (!payload || typeof payload !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Payload must be a JSON object.");
    }
    // 1. Validate Event Type
    if (payload.event_type !== "vector_replay") {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid event_type. Must be 'vector_replay'.");
    }
    // 2. Validate Session ID and Timestamp
    if (!payload.session_id || typeof payload.session_id !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid session_id.");
    }
    if (!payload.timestamp || typeof payload.timestamp !== "number") {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid timestamp.");
    }
    // 3. Validate Interaction Data & Transaction Boundary
    const interactionData = payload.interaction_data;
    if (!interactionData || typeof interactionData !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Missing interaction_data object.");
    }
    const actionType = interactionData.action_type;
    if (!actionType || !ALLOWED_ACTION_TYPES.includes(actionType)) {
        throw new https_1.HttpsError("failed-precondition", `Invalid transaction boundary. action_type must be one of: ${ALLOWED_ACTION_TYPES.join(", ")}`);
    }
    // 4. Validate Somatic Indicators
    const somaticIndicators = payload.somatic_indicators;
    if (!somaticIndicators || typeof somaticIndicators !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Missing somatic_indicators object.");
    }
    if (typeof somaticIndicators.hesitation_detected !== "boolean") {
        throw new https_1.HttpsError("invalid-argument", "somatic_indicators.hesitation_detected must be a boolean.");
    }
    if (typeof somaticIndicators.undo_triggered !== "boolean") {
        throw new https_1.HttpsError("invalid-argument", "somatic_indicators.undo_triggered must be a boolean.");
    }
}
/**
 * Cloud Function to securely ingest and validate telemetry & vector replays.
 */
exports.validateAndStoreTelemetry = (0, https_1.onCall)(async (request) => {
    // Authentication Guard
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated to send telemetry.");
    }
    // 1. Payload Limit Validation (< 50KB)
    // Calculate approximate stringified size of the payload.
    const payloadSize = Buffer.byteLength(JSON.stringify(request.data || {}), "utf8");
    if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
        logger.warn(`User ${request.auth.uid} sent payload exceeding 50KB. Actual size: ${payloadSize} bytes.`);
        throw new https_1.HttpsError("resource-exhausted", "Payload exceeds the 50KB limit per transaction.");
    }
    // 2. Schema and Boundary validation
    validateVectorReplaySchema(request.data);
    try {
        // If we reach here, the schema is valid and the payload is within limits.
        // In a full implementation, we would store this payload in Firestore or RTDB here.
        // e.g., await admin.database().ref(`users/students/${request.auth.uid}/vector_replays`).push(request.data);
        // For now, return success to the client
        logger.info(`Successfully validated and ingested vector_replay event: ${request.data.interaction_data.action_type} for user: ${request.auth.uid}`);
        return { success: true, timestamp: request.data.timestamp };
    }
    catch (error) {
        logger.error("Error storing vector replay", error);
        throw new https_1.HttpsError("internal", "Failed to store the vector replay event.");
    }
});
//# sourceMappingURL=transactionGuard.js.map