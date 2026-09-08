"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAiServiceStatus = exports.AI_MONITORING_DOC = void 0;
exports.recordAiCall = recordAiCall;
exports.resetAiMonitoringState = resetAiMonitoringState;
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const https_1 = require("firebase-functions/v2/https");
const geminiConfig_1 = require("./geminiConfig");
exports.AI_MONITORING_DOC = "ai_monitoring";
function dayKey(now = new Date()) {
    // Israel local day, so the admin console's "today" matches the teacher's.
    const il = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const y = il.getFullYear();
    const m = String(il.getMonth() + 1).padStart(2, "0");
    const d = String(il.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
let firestoreDisabled = false;
/**
 * Records one Gemini call. Never throws, never awaits Firestore on the caller's
 * critical path.
 */
function recordAiCall(rec) {
    var _a;
    const level = rec.outcome === "ok" ? "info" : rec.outcome === "timeout" || rec.outcome === "schema_reject" ? "warn" : "error";
    logger[level]("[ai-monitor] gemini call", rec);
    if (firestoreDisabled)
        return;
    try {
        const db = admin.firestore();
        const inc = admin.firestore.FieldValue.increment;
        const day = dayKey();
        const f = rec.feature;
        const update = {
            updated_at: Date.now(),
            model_id: rec.model_id,
            [`totals.${f}.calls`]: inc(1),
            [`totals.${f}.${rec.outcome}`]: inc(1),
            [`totals.${f}.latency_sum_ms`]: inc(rec.latency_ms),
            [`daily.${day}.${f}.calls`]: inc(1),
            [`daily.${day}.${f}.${rec.outcome}`]: inc(1),
            [`daily.${day}.${f}.latency_sum_ms`]: inc(rec.latency_ms),
            [`last_call.${f}`]: { at: Date.now(), outcome: rec.outcome, latency_ms: rec.latency_ms },
        };
        if (rec.outcome !== "ok") {
            update[`last_failure.${f}`] = { at: Date.now(), outcome: rec.outcome, detail: (_a = rec.detail) !== null && _a !== void 0 ? _a : null };
        }
        db.collection("store_cache").doc(exports.AI_MONITORING_DOC).set(update, { merge: true }).catch((err) => {
            // A rules or connectivity problem must not spam every call; log once and go quiet.
            firestoreDisabled = true;
            logger.warn("[ai-monitor] counter write failed; disabling counters for this instance", { error: String(err) });
        });
    }
    catch (err) {
        logger.warn("[ai-monitor] counter write skipped", { error: String(err) });
    }
}
/** Test seam. */
function resetAiMonitoringState() {
    firestoreDisabled = false;
}
function callerIsStaff(token) {
    if (!token)
        return false;
    const roles = Array.isArray(token.roles) ? token.roles : token.role ? [String(token.role)] : [];
    const lowered = roles.map((r) => r.toLowerCase());
    return lowered.includes("admin") || lowered.includes("teacher") || token.admin === true || token.teacher === true;
}
/**
 * getAiServiceStatus — the admin console's view of the AI engine: whether the
 * key is bound (and where), whether it looks well-formed, which model is in
 * use, and the aggregate counters. Staff only; the key itself is never
 * returned, only its last four characters.
 */
exports.getAiServiceStatus = (0, https_1.onCall)(geminiConfig_1.GEMINI_SECRETS, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    if (!callerIsStaff(request.auth.token)) {
        throw new https_1.HttpsError("permission-denied", "Staff role required.");
    }
    const key = (0, geminiConfig_1.getGeminiKeyStatus)();
    let counters = null;
    try {
        const snap = await admin.firestore().collection("store_cache").doc(exports.AI_MONITORING_DOC).get();
        counters = snap.exists ? snap.data() : null;
    }
    catch (err) {
        logger.warn("[ai-monitor] status read failed", { error: String(err) });
    }
    return {
        checked_at: Date.now(),
        key,
        counters,
        today: dayKey(),
    };
});
//# sourceMappingURL=aiMonitoring.js.map