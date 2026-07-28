"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onStudentEvent = exports.verifyTeacherSSO = exports.exportAdminReportToDrive = exports.validateAndStoreTelemetry = exports.callGeminiSocraticProxy = exports.syncUserRoles = exports.generateSocraticMapping = exports.generateSocraticHint = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const generative_ai_1 = require("@google/generative-ai");
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
    task1_zero_placeholder: {
        questionHe: "כאשר אין קוביות בעמודה מסוימת, איזה מספר נרשום בבית המספרים?",
        choices: [
            { id: "choice_1", textHe: "נרשום 0 כדי לשמור על ערך המקום" },
            { id: "choice_2", textHe: "נשאיר ריק ללא כל ספרה" },
            { id: "choice_3", textHe: "נרשום 1 בעמודה" }
        ]
    },
    task2_estimation_error_margin: {
        questionHe: "הסתכלו על ישר המספרים, בין אילו עשרות או מאות נמצא המספר?",
        choices: [
            { id: "choice_1", textHe: "נבדוק את נקודת האמצע ונכוון לפיה" },
            { id: "choice_2", textHe: "נזיז את החץ לקצה הימני ביותר" },
            { id: "choice_3", textHe: "נבחר נקודה אקראית" }
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
/**
 * Cloud Function for Teacher Diagnostic Mapping.
 * Evaluates student diagnostic data using Gemini LLM to create teacher action plans.
 * Uses valid supported model identifier 'gemini-2.5-flash'.
 */
exports.generateSocraticMapping = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { studentId, teacherId, qMatrix, conceptMastery, traceData } = request.data;
    if (!studentId || !teacherId || !qMatrix || !conceptMastery) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    // PRD 5.4: PII Scrubbing Middleware before hitting Gemini
    const scrubbedName = "[REDACTED_NAME]";
    const scrubbedTrace = JSON.stringify(traceData)
        .replace(/\b\d{9}\b/g, "[REDACTED_ID]")
        .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g, "[REDACTED_EMAIL]");
    try {
        const ai = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
        const model = ai.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                temperature: 0.4,
                responseMimeType: "application/json"
            },
            systemInstruction: `You are a strict, pedagogical Socratic Math Tutor evaluating a 3rd-grade student's diagnostic test.
Your task is to analyze the student's Q-Matrix errors and Concept Mastery scores to generate a personalized learning pathway.
CRITICAL RULES:
1. Always output VALID JSON matching the specified schema exactly.
2. All textual responses must be in high-quality Hebrew.
3. The generated 'tasks' array should provide 1 to 3 targeted math tasks based on their specific weaknesses.
JSON SCHEMA:
{
  "macroBlueprintHe": "string (A bird's-eye view analysis of their performance and what sessions 3-7 will look like)",
  "microBlueprintHe": "string (Specific actionable focus for the next immediate session)",
  "isYellowPath": "boolean (true if mastery < 0.8 in core areas, false otherwise)",
  "tasks": [
    {
      "id": "string (unique id like gen_t1)",
      "type": "string ('vertical_addition', 'number_line', 'small_change', or 'missing_element')",
      "titleHe": "string",
      "instructionHe": "string",
      "numberA": "number",
      "numberB": "number (optional depending on task type)",
      "correctAnswer": "number or string",
      "scaffoldLevel": "number (1 for normal, 2 for high anxiety)"
    }
  ]
}`
        });
        const userPrompt = `
Student Name: ${scrubbedName}
Concept Mastery Scores: ${JSON.stringify(conceptMastery)}
Trace Data (Hesitations/Undos): ${scrubbedTrace}

Generate the pedagogical mapping JSON.`;
        const response = await model.generateContent(userPrompt);
        const textResponse = response.response.text();
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(textResponse);
        }
        catch (e) {
            throw new Error("LLM did not return valid JSON");
        }
        logger.info(`Generated Socratic Mapping for student ${studentId}`);
        return parsedResponse;
    }
    catch (error) {
        logger.error("Error generating Socratic mapping", error);
        throw new https_1.HttpsError("internal", "Failed to generate mapping.");
    }
});
// Export the Role Synchronization module
var syncUserRoles_1 = require("./syncUserRoles");
Object.defineProperty(exports, "syncUserRoles", { enumerable: true, get: function () { return syncUserRoles_1.syncUserRoles; } });
// Export the Gemini Proxy from the new module
var geminiProxy_1 = require("./geminiProxy");
Object.defineProperty(exports, "callGeminiSocraticProxy", { enumerable: true, get: function () { return geminiProxy_1.callGeminiSocraticProxy; } });
// Export the Transaction Guard module
var transactionGuard_1 = require("./transactionGuard");
Object.defineProperty(exports, "validateAndStoreTelemetry", { enumerable: true, get: function () { return transactionGuard_1.validateAndStoreTelemetry; } });
// Export the Google Drive Admin PDF Report module
var exportDriveReport_1 = require("./exportDriveReport");
Object.defineProperty(exports, "exportAdminReportToDrive", { enumerable: true, get: function () { return exportDriveReport_1.exportAdminReportToDrive; } });
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
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { session_id, anonymous_student_id, interaction_data, somatic_indicators } = request.data || {};
    if (!session_id || anonymous_student_id === undefined) {
        throw new https_1.HttpsError("invalid-argument", "Missing required payload parameters.");
    }
    // Enforce PII Scrubbing: Stripping any text fields not explicitly allowed
    const cleanPayload = {
        event_type: "vector_replay",
        session_id,
        anonymous_student_id, // 1 - 35
        timestamp: Date.now(),
        interaction_data: {
            action_type: (interaction_data === null || interaction_data === void 0 ? void 0 : interaction_data.action_type) || "vector_replay",
            details: (interaction_data === null || interaction_data === void 0 ? void 0 : interaction_data.details) || {}
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
//# sourceMappingURL=index.js.map