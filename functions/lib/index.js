"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateStudentSession = exports.onStudentEvent = exports.verifyTeacherSSO = exports.sendTeacherAdminMessage = exports.hourlyAdminAggregator = exports.generateClassMeetingReport = exports.getPedagogicalReportDownloadUrl = exports.generatePedagogicalReportPDF = exports.createSessionWithServerDeadline = exports.onSessionCompleteTrigger = exports.exportResearchDataset = exports.backupAndResetSessionData = exports.exportAdminReportToDrive = exports.getAiServiceStatus = exports.callGeminiSocraticProxy = exports.syncUserRoles = exports.generateSocraticHint = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const dotenv = require("dotenv");
admin.initializeApp();
// Load local .env file explicitly to guarantee key loading in emulator
dotenv.config();
/**
 * Static Q-Matrix template dataset for student Socratic hints (Zero-Generation Policy).
 * PRD Section 7 Rule 4 & Section 2 Rule 4 require all student-facing questions and choices
 * to be strictly selected from deterministic pre-approved templates.
 */
const STATIC_QMATRIX_HINTS = {
    // Canonical 7 Tasks (PRD v7.0)
    task1_read_write_zero: {
        questionHe: "כאשר אין קוביות בעמודה מסוימת, איזה מספר נרשום בבית המספרים?",
        choices: [
            { id: "choice_1", textHe: "נרשום 0 כדי לשמור על ערך המקום" },
            { id: "choice_2", textHe: "נשאיר ריק ללא כל ספרה" },
            { id: "choice_3", textHe: "נרשום 1 בעמודה" }
        ]
    },
    task2_digit_value: {
        questionHe: "כיצד נקבע את ערכה של ספרה מסוימת בתוך המספר?",
        choices: [
            { id: "choice_1", textHe: "לפי העמודה שבה היא ממוקמת (יחידות, עשרות, מאות)" },
            { id: "choice_2", textHe: "לפי גודל הספרה עצמה בלבד" },
            { id: "choice_3", textHe: "לפי מספר הקוביות הכולל בלוח" }
        ]
    },
    task3_subtraction_regrouping: {
        questionHe: "כשאין מספיק יחידות להחסיר, מאיפה ניתן לפרוט?",
        choices: [
            { id: "choice_1", textHe: "נפרוט עשרת אחת מטור העשרות ל-10 יחידות" },
            { id: "choice_2", textHe: "נחסיר הפוך מהמספר הקטן" },
            { id: "choice_3", textHe: "נרשום 0 בתשובה" }
        ]
    },
    task4_decompose_number: {
        questionHe: "איך עוד אפשר לייצג את המספר באמצעות עשרות ויחידות?",
        choices: [
            { id: "choice_1", textHe: "לפרוט עשרת אחת ל-10 יחידות" },
            { id: "choice_2", textHe: "לקבץ 10 יחידות לעשרת אחת" },
            { id: "choice_3", textHe: "להוסיף קובייה חדשה ללוח" }
        ]
    },
    task5_units_to_tens: {
        questionHe: "כמה עשרות נקבל מ-20 יחידות בודדות?",
        choices: [
            { id: "choice_1", textHe: "2 עשרות שלמות" },
            { id: "choice_2", textHe: "20 עשרות" },
            { id: "choice_3", textHe: "עשרת אחת בלבד" }
        ]
    },
    task6_vertical_addition: {
        questionHe: "כאשר יש יותר מ-9 יחידות בעמודה, מה עלינו לבצע?",
        choices: [
            { id: "choice_1", textHe: "לקבץ 10 יחידות לעשרת אחת ולהעביר לעמודת העשרות" },
            { id: "choice_2", textHe: "לרשום מספר דו-ספרתי באותה משבצת" },
            { id: "choice_3", textHe: "למחוק את היחידות העודפות" }
        ]
    },
    task7_subtraction_zero_tens: {
        questionHe: "כאשר טור העשרות הוא 0 וצריך לפרוט, מאיזה טור נפרוט תחילה?",
        choices: [
            { id: "choice_1", textHe: "נפרוט 1 מאה ל-10 עשרות, ואז נפרוט עשרת אחת ליחידות" },
            { id: "choice_2", textHe: "נחסיר ישר מטור המאות" },
            { id: "choice_3", textHe: "נרשום 0 בטור העשרות" }
        ]
    },
    // Legacy Task Keys (Backward Compatibility)
    task1_zero_placeholder: {
        questionHe: "כאשר אין קוביות בעמודה מסוימת, איזה מספר נרשום בבית המספרים?",
        choices: [
            { id: "choice_1", textHe: "נרשום 0 כדי לשמור על ערך המקום" },
            { id: "choice_2", textHe: "נשאיר ריק ללא כל ספרה" },
            { id: "choice_3", textHe: "נרשום 1 בעמודה" }
        ]
    },
    task3_flexible_regrouping: {
        questionHe: "איך עוד אפשר לייצג את המספר באמצעות עשרות ויחידות?",
        choices: [
            { id: "choice_1", textHe: "לפרוט עשרת אחת ל-10 יחידות" },
            { id: "choice_2", textHe: "לקבץ 10 יחידות לעשרת אחת" },
            { id: "choice_3", textHe: "להוסיף קובייה חדשה ללוח" }
        ]
    },
    task4_basic_addition_fluency: {
        questionHe: "כאשר יש יותר מ-9 יחידות בעמודה, מה עלינו לבצע?",
        choices: [
            { id: "choice_1", textHe: "לקבץ 10 יחידות לעשרת אחת ולהעביר לעמודת העשרות" },
            { id: "choice_2", textHe: "לרשום מספר דו-ספרתי באותה משבצת" },
            { id: "choice_3", textHe: "למחוק את היחידות העודפות" }
        ]
    },
    task5_small_change: {
        questionHe: "האם הערך הכולל של הלוח השתנה בעקבות השינוי?",
        choices: [
            { id: "choice_1", textHe: "הערך נשאר זהה כי לא נוספו או נגרעו קוביות" },
            { id: "choice_2", textHe: "הערך גדל כי יש יותר יחידות" },
            { id: "choice_3", textHe: "הערך קטן" }
        ]
    },
    task6_subtraction_regrouping: {
        questionHe: "כשאין מספיק יחידות להחסיר, מאיפה ניתן לפרוט?",
        choices: [
            { id: "choice_1", textHe: "נפרוט עשרת אחת מטור העשרות ל-10 יחידות" },
            { id: "choice_2", textHe: "נחסיר הפוך מהמספר הקטן" },
            { id: "choice_3", textHe: "נרשום 0 בתשובה" }
        ]
    },
    task7_missing_subtrahend: {
        questionHe: "איזה מספר צריך להוסיף או להחסיר כדי להגיע לתוצאה המבוקשת?",
        choices: [
            { id: "choice_1", textHe: "נחשב את ההפרש בין המספר הנתון לתוצאה" },
            { id: "choice_2", textHe: "ננחש מספר קרוב" },
            { id: "choice_3", textHe: "נכפול את המספרים" }
        ]
    },
    task8_missing_addend: {
        questionHe: "מה המרחק בין המספר ההתחלתי למספר היעד?",
        choices: [
            { id: "choice_1", textHe: "נפחית את המספר הקיים ממספר היעד" },
            { id: "choice_2", textHe: "נספור יחידות אחת אחת" },
            { id: "choice_3", textHe: "נחבר את שני המספרים" }
        ]
    }
};
const DEFAULT_FALLBACK_HINT = {
    questionHe: "שמנו לב שנסית כמה פעמים. מה הצעד הבא שתרצה לבצע?",
    choices: [
        { id: "choice_1", textHe: "לפרוט עשרת אחת ל-10 יחידות" },
        { id: "choice_2", textHe: "לקבץ 10 יחידות לעשרת אחת" },
        { id: "choice_3", textHe: "לבדוק שוב את החישוב בבית המספרים" }
    ]
};
/**
 * Cloud Function to retrieve Socratic Hint for students.
 * Strictly adheres to PRD Section 7 Rule 4 (Zero-Generation Policy).
 * Selects hints deterministically from the static Q-Matrix dataset.
 */
exports.generateSocraticHint = (0, https_1.onCall)(async (request) => {
    // 1. Verify authentication
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    // 2. Parse payload
    const { targetNode } = request.data || {};
    try {
        const selectedHint = STATIC_QMATRIX_HINTS[targetNode] || DEFAULT_FALLBACK_HINT;
        logger.info(`Served static Q-Matrix Socratic hint for node: ${targetNode || 'fallback'} to user ${request.auth.uid}`);
        return selectedHint;
    }
    catch (error) {
        logger.error("Error retrieving Socratic hint", error);
        throw new https_1.HttpsError("internal", "Failed to retrieve Socratic hint.");
    }
});
// Export the Role Synchronization module
var syncUserRoles_1 = require("./syncUserRoles");
Object.defineProperty(exports, "syncUserRoles", { enumerable: true, get: function () { return syncUserRoles_1.syncUserRoles; } });
// Export the Gemini Proxy from the new module
var geminiProxy_1 = require("./geminiProxy");
Object.defineProperty(exports, "callGeminiSocraticProxy", { enumerable: true, get: function () { return geminiProxy_1.callGeminiSocraticProxy; } });
// Module 13 / 27: AI engine health & call counters for the admin console (staff only).
var aiMonitoring_1 = require("./aiMonitoring");
Object.defineProperty(exports, "getAiServiceStatus", { enumerable: true, get: function () { return aiMonitoring_1.getAiServiceStatus; } });
// Export the Transaction Guard module
// validateAndStoreTelemetry was removed. It validated the payload, stored
// nothing — the storage line was a commented-out sketch — logged "ingested"
// and returned { success: true }. An offline client that trusted that answer
// dequeued and dropped the event. No client called it; the live telemetry
// path is onStudentEvent, which stores and checks ownership.
// Export the Google Drive Admin PDF Report module
var exportDriveReport_1 = require("./exportDriveReport");
Object.defineProperty(exports, "exportAdminReportToDrive", { enumerable: true, get: function () { return exportDriveReport_1.exportAdminReportToDrive; } });
Object.defineProperty(exports, "backupAndResetSessionData", { enumerable: true, get: function () { return exportDriveReport_1.backupAndResetSessionData; } });
Object.defineProperty(exports, "exportResearchDataset", { enumerable: true, get: function () { return exportDriveReport_1.exportResearchDataset; } });
// Export WP6 Cloud Functions (Module 14, 20, 22, 24, 27)
var sessionTrigger_1 = require("./sessionTrigger");
Object.defineProperty(exports, "onSessionCompleteTrigger", { enumerable: true, get: function () { return sessionTrigger_1.onSessionCompleteTrigger; } });
Object.defineProperty(exports, "createSessionWithServerDeadline", { enumerable: true, get: function () { return sessionTrigger_1.createSessionWithServerDeadline; } });
var pedagogicalReport_1 = require("./pedagogicalReport");
Object.defineProperty(exports, "generatePedagogicalReportPDF", { enumerable: true, get: function () { return pedagogicalReport_1.generatePedagogicalReportPDF; } });
Object.defineProperty(exports, "getPedagogicalReportDownloadUrl", { enumerable: true, get: function () { return pedagogicalReport_1.getPedagogicalReportDownloadUrl; } });
// Module 23, owner decision 6.9.2026 (register item 12): a class report for every meeting.
var classReport_1 = require("./classReport");
Object.defineProperty(exports, "generateClassMeetingReport", { enumerable: true, get: function () { return classReport_1.generateClassMeetingReport; } });
var adminAggregator_1 = require("./adminAggregator");
Object.defineProperty(exports, "hourlyAdminAggregator", { enumerable: true, get: function () { return adminAggregator_1.hourlyAdminAggregator; } });
var teacherAdminChat_1 = require("./teacherAdminChat");
Object.defineProperty(exports, "sendTeacherAdminMessage", { enumerable: true, get: function () { return teacherAdminChat_1.sendTeacherAdminMessage; } });
/**
 * verifyTeacherSSO Cloud Function (PRD Section 4.1)
 * Enforces domain constraints (@edu-haifa.org.il), secret environment specs,
 * and Firestore dynamic whitelist validation with Zero Self-Registration.
 */
exports.verifyTeacherSSO = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    }
    const email = request.auth.token.email || "";
    const domain = email.split("@")[1];
    // 1. Domain Constraint Verification
    if (domain !== "edu-haifa.org.il") {
        throw new https_1.HttpsError("permission-denied", "Access restricted to @edu-haifa.org.il domain.");
    }
    // 2. Secret Configuration Environment Specs
    const adminPrimary = process.env.ADMIN_SSO_PRIMARY_EMAIL || "davidsep@edu-haifa.org.il";
    const adminAlias = process.env.ADMIN_SSO_ALIAS_EMAIL || "1002220159@edu-haifa.org.il";
    const roles = ["TEACHER"];
    if (email === adminPrimary || email === adminAlias) {
        roles.push("ADMIN");
    }
    // 3. Dynamic Firestore Whitelist Validation
    const db = admin.firestore();
    const whitelistRef = db.collection("whitelists").doc(email);
    const whitelistDoc = await whitelistRef.get();
    if (!whitelistDoc.exists && !roles.includes("ADMIN")) {
        throw new https_1.HttpsError("permission-denied", "Zero Self-Registration: Email not whitelisted.");
    }
    // 4. Update / Sync User Roles
    await db.collection("users").doc(request.auth.uid).set({
        uid: request.auth.uid,
        roles: roles,
        email_domain: domain,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    logger.info(`Verified SSO for ${email} with roles [${roles.join(", ")}]`);
    return { status: "SUCCESS", roles };
});
/**
 * onStudentEvent Cloud Function (PRD Section 4.1)
 * Ingests student telemetry and vector replay events with strict PII scrubbing.
 */
exports.onStudentEvent = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { session_id, student_id, interaction_data, somatic_indicators } = request.data || {};
    if (!session_id || student_id === undefined) {
        throw new https_1.HttpsError("invalid-argument", "Missing required payload parameters: session_id and student_id.");
    }
    // The comment here used to read "Strictly 1 - 12" while nothing enforced it:
    // Number("999") and Number("abc") were both written as-is.
    const numericStudentId = Number(student_id);
    if (!Number.isInteger(numericStudentId) || numericStudentId < 1 || numericStudentId > 12) {
        throw new https_1.HttpsError("invalid-argument", "student_id must be a pilot learner number between 1 and 12.");
    }
    // The security model in the PRD requires that a learner may only write
    // telemetry whose student_id equals their own authenticated id. That rule
    // lives in the Firestore rules — which this function bypasses entirely,
    // because the Admin SDK is not subject to them. Without the check here, any
    // authenticated caller could file events against any of the twelve learners.
    // Staff may write on a learner's behalf; a learner may only write their own.
    const callerRole = String(request.auth.token.role || "");
    const isStaff = callerRole === "teacher" || callerRole === "admin";
    const callerStudentId = Number(request.auth.token.student_id);
    if (!isStaff && callerStudentId !== numericStudentId) {
        throw new https_1.HttpsError("permission-denied", "A learner may only submit events for their own id.");
    }
    // Zero-PII: this function's own contract is "strict PII scrubbing", but
    // interaction_data.details was copied through wholesale, so any caller could
    // park a child's name inside it. Only the primitive, non-text fields the
    // replay actually needs are carried over.
    const rawDetails = ((_a = interaction_data === null || interaction_data === void 0 ? void 0 : interaction_data.details) !== null && _a !== void 0 ? _a : {});
    const NUMERIC_DETAIL_KEYS = ["column_index", "block_value", "digit_value", "duration_ms", "undo_stack_depth"];
    const details = {};
    for (const key of NUMERIC_DETAIL_KEYS) {
        const value = Number(rawDetails[key]);
        if (Number.isFinite(value))
            details[key] = value;
    }
    const cleanPayload = {
        event_type: "vector_replay",
        session_id: String(session_id),
        student_id: numericStudentId,
        timestamp: Date.now(),
        interaction_data: {
            action_type: String((interaction_data === null || interaction_data === void 0 ? void 0 : interaction_data.action_type) || "vector_replay").slice(0, 64),
            details
        },
        somatic_indicators: {
            hesitation_detected: !!(somatic_indicators === null || somatic_indicators === void 0 ? void 0 : somatic_indicators.hesitation_detected),
            undo_triggered: !!(somatic_indicators === null || somatic_indicators === void 0 ? void 0 : somatic_indicators.undo_triggered)
        }
    };
    // Write to Telemetry Collection
    const db = admin.firestore();
    await db.collection("telemetry_events").add(cleanPayload);
    logger.info(`Ingested clean student event for session ${session_id}`);
    return { status: "PROCESSED" };
});
var authenticateStudentSession_1 = require("./authenticateStudentSession");
Object.defineProperty(exports, "authenticateStudentSession", { enumerable: true, get: function () { return authenticateStudentSession_1.authenticateStudentSession; } });
//# sourceMappingURL=index.js.map