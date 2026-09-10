"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGeminiSocraticProxy = exports.SOCRATIC_TOTAL_BUDGET_MS = exports.SOCRATIC_AI_TIMEOUT_MS = void 0;
exports.scrubPII = scrubPII;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const geminiConfig_1 = require("./geminiConfig");
const aiMonitoring_1 = require("./aiMonitoring");
const socraticContract_1 = require("./socraticContract");
/**
 * Robust Regex Engine for PII Scrubbing
 * Active scrubbing of:
 * - Emails
 * - IDs and standard PII (e.g., 9-digit Israeli IDs, passwords)
 * - Hebrew/English name prefixes ("My name is X", "קוראים לי Y")
 */
function scrubPII(text) {
    if (!text)
        return text;
    let scrubbed = text;
    // Scrub Emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    scrubbed = scrubbed.replace(emailRegex, "[REDACTED_EMAIL]");
    // Scrub Israeli IDs (9 digits, with or without hyphens/spaces) and basic phone numbers
    const idRegex = /\b\d{1,3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
    scrubbed = scrubbed.replace(idRegex, "[REDACTED_ID]");
    // Scrub Name prefixes in English
    const englishNameRegex = /(my name is|i am|this is) ([A-Z][a-z]+(\s[A-Z][a-z]+)?)/gi;
    scrubbed = scrubbed.replace(englishNameRegex, "$1 [REDACTED_NAME]");
    // Scrub Name prefixes in Hebrew
    const hebrewNameRegex = /(קוראים לי|שמי|אני) ([א-ת]+(\s[א-ת]+)?)/g;
    scrubbed = scrubbed.replace(hebrewNameRegex, "$1 [REDACTED_NAME]");
    // Password-like patterns (e.g., password: <something>, סיסמה: <משהו>, סיסמה שלי היא <משהו>)
    const passwordRegex = /(password|pass|סיסמה|ססמא)(?:[\s:=]+(?:שלי|היא|הוא|שלנו|זה|הינו|הינה|is|my)+)*[\s:=]+(\S+)/gi;
    scrubbed = scrubbed.replace(passwordRegex, "$1: [REDACTED_PASSWORD]");
    return scrubbed;
}
/**
 * Server-side ceiling on one model call. The learner's client abandons the
 * proxy at 8s (SocraticEngine.SOCRATIC_PROXY_TIMEOUT_MS) and shows the static
 * card, so a slower answer helps nobody; keeping the server ceiling under that
 * lets a single retry still fit when the first attempt came back fast.
 */
exports.SOCRATIC_AI_TIMEOUT_MS = 6500;
/** Total budget for both attempts; a retry only starts if it can finish inside this. */
exports.SOCRATIC_TOTAL_BUDGET_MS = 7500;
const MIN_RETRY_WINDOW_MS = 2500;
async function generateOnce(prompt, facts, timeoutMs) {
    var _a;
    const ai = (0, geminiConfig_1.getGeminiClient)();
    const model = ai.getGenerativeModel({
        model: geminiConfig_1.GEMINI_MODEL_ID,
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            // Structured output: the SDK enum values are the same lowercase strings
            // the plain-object schema uses, so the cast is only a nominal one.
            responseSchema: socraticContract_1.SOCRATIC_RESPONSE_SCHEMA,
        },
        systemInstruction: socraticContract_1.SOCRATIC_SYSTEM_INSTRUCTION,
    });
    let raw;
    try {
        const result = await (0, geminiConfig_1.withGeminiTimeout)(model.generateContent(prompt), timeoutMs);
        raw = result.response.text();
    }
    catch (err) {
        const code = (0, geminiConfig_1.classifyGeminiError)(err);
        logger.warn("[socratic-proxy] model call failed", { code, error: String((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err) });
        return { ok: false, outcome: code, detail: code };
    }
    const validated = (0, socraticContract_1.validateSocraticResponse)(raw, facts);
    if (validated.ok)
        return { ok: true, value: validated.value, raw };
    const reason = validated.reason;
    const outcome = reason.startsWith("final answer")
        ? "answer_leak"
        : reason.startsWith("forbidden")
            ? "forbidden_term"
            : reason.startsWith("response is not JSON")
                ? "not_json"
                : "schema_reject";
    logger.warn("[socratic-proxy] response rejected", { reason, raw_length: raw.length });
    return { ok: false, outcome, detail: reason, raw };
}
/**
 * Runs the model once and, when the first answer was rejected by the validator
 * and there is still room inside the learner's timeout, once more with the
 * rejection reason appended so the model can correct itself. Transport
 * failures (timeout, auth, quota) are never retried: they will not get better
 * in two seconds and the static card is already waiting on the client.
 */
async function generateWithRetry(prompt, facts) {
    const started = Date.now();
    const first = await generateOnce(prompt, facts, exports.SOCRATIC_AI_TIMEOUT_MS);
    if (first.ok)
        return Object.assign(Object.assign({}, first), { attempts: 1 });
    const retryable = first.outcome === "schema_reject" || first.outcome === "answer_leak" || first.outcome === "forbidden_term" || first.outcome === "not_json";
    const remaining = exports.SOCRATIC_TOTAL_BUDGET_MS - (Date.now() - started);
    if (!retryable || remaining < MIN_RETRY_WINDOW_MS)
        return Object.assign(Object.assign({}, first), { attempts: 1 });
    const correction = `${prompt}\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${first.detail}. Fix exactly that and return the JSON again.`;
    const second = await generateOnce(correction, facts, remaining);
    return Object.assign(Object.assign({}, second), { attempts: 2 });
}
function fallbackError(outcome, message) {
    // The client treats every non-OK as "serve the static card"; the code just
    // tells it (and the logs) why.
    switch (outcome) {
        case "timeout":
            return new https_1.HttpsError("deadline-exceeded", message);
        case "misconfigured":
        case "auth":
            return new https_1.HttpsError("failed-precondition", message);
        case "quota":
            return new https_1.HttpsError("resource-exhausted", message);
        default:
            return new https_1.HttpsError("internal", message);
    }
}
/**
 * callGeminiSocraticProxy
 * Exclusive gateway for all client-side AI analysis requests.
 * Mediates and enforces the Zero-Chatbot Policy and zero-trust security.
 *
 * One request shape is accepted: `socratic_request` (+ optional `anchor`),
 * the Module 13 §ב GeminiSocraticRequest. The prompt is built server-side from
 * validated numbers only.
 *
 * The pre-contract free-text path (`prompt` / `context` / `history`) was
 * removed. It forwarded arbitrary caller text to the model — which is the
 * open-ended chat Module 13 forbids, and the guard above only caught callers
 * who declared the intent in the payload. No client used it: SocraticEngine
 * has always sent socratic_request.
 */
exports.callGeminiSocraticProxy = (0, https_1.onCall)(Object.assign(Object.assign({}, geminiConfig_1.GEMINI_SECRETS), { timeoutSeconds: 30 }), async (request) => {
    var _a, _b;
    // 1. Verify Authentication
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Client must be authenticated to call the AI proxy.");
    }
    const data = request.data || {};
    const { isChatbotAttempt, requestedAction, socratic_request, anchor } = data;
    // 2. Enforce Socratic Constraint (Zero-Chatbot Policy)
    // Reject any payload that attempts open-ended chat or violates strict Socratic mapping
    if (isChatbotAttempt || requestedAction === "open_chat" || requestedAction === "free_text") {
        logger.warn(`User ${request.auth.uid} attempted open-ended chat, violating Zero-Chatbot Policy.`);
        throw new https_1.HttpsError("failed-precondition", "Zero-Chatbot Policy Violation: Open-ended chat requests are strictly forbidden. Only closed-ended Socratic items and prompts are allowed.");
    }
    // 3. Credential check up front, so a missing key is one clear log line
    //    and one clear monitoring row instead of an SDK stack trace per call.
    const keyStatus = (0, geminiConfig_1.getGeminiKeyStatus)();
    if (!keyStatus.configured) {
        (0, aiMonitoring_1.recordAiCall)({ feature: "socratic", outcome: "misconfigured", latency_ms: 0, model_id: geminiConfig_1.GEMINI_MODEL_ID, detail: (_a = keyStatus.problem) !== null && _a !== void 0 ? _a : "missing" });
        throw fallbackError("misconfigured", "AI Service configuration is missing.");
    }
    if (socratic_request === undefined) {
        throw new https_1.HttpsError("invalid-argument", "Missing required payload field: socratic_request.");
    }
    const started = Date.now();
    {
        const validated = (0, socraticContract_1.validateSocraticRequest)(socratic_request);
        if (!validated.ok) {
            (0, aiMonitoring_1.recordAiCall)({ feature: "socratic", outcome: "invalid_request", latency_ms: 0, model_id: geminiConfig_1.GEMINI_MODEL_ID, detail: validated.reason });
            throw new https_1.HttpsError("invalid-argument", `Invalid socratic_request: ${validated.reason}`);
        }
        const req = validated.value;
        // A learner may ask for a hint about their own work only. Without this,
        // any authenticated caller — including the anonymous session the login
        // screen opens before a child identifies — could spend the project's
        // model quota and file monitoring rows against any of the twelve
        // learners. Staff may ask on a learner's behalf.
        const callerRole = String(request.auth.token.role || "");
        const isStaff = callerRole === "teacher" || callerRole === "admin";
        const callerStudentId = Number(request.auth.token.student_id);
        if (!isStaff && callerStudentId !== req.student_id) {
            (0, aiMonitoring_1.recordAiCall)({ feature: "socratic", outcome: "invalid_request", latency_ms: 0, model_id: geminiConfig_1.GEMINI_MODEL_ID, detail: "caller_student_mismatch" });
            throw new https_1.HttpsError("permission-denied", "A learner may only request a hint for their own work.");
        }
        const facts = (0, socraticContract_1.deriveSocraticFacts)(req);
        const safeAnchor = (0, socraticContract_1.validateSocraticAnchor)(anchor);
        const builtPrompt = (0, socraticContract_1.buildSocraticPrompt)(req, facts, safeAnchor);
        const attempt = await generateWithRetry(builtPrompt, facts);
        const latency = Date.now() - started;
        const base = {
            feature: "socratic",
            latency_ms: latency,
            model_id: geminiConfig_1.GEMINI_MODEL_ID,
            student_id: req.student_id,
            session_id: req.session_id,
            exercise_id: req.exercise_id,
            trigger_reason: (_b = facts.trigger_reason) !== null && _b !== void 0 ? _b : undefined,
            attempts: attempt.attempts,
        };
        if (!attempt.ok) {
            (0, aiMonitoring_1.recordAiCall)(Object.assign(Object.assign({}, base), { outcome: attempt.outcome, detail: attempt.detail }));
            throw fallbackError(attempt.outcome, `Socratic engine unavailable (${attempt.outcome}).`);
        }
        (0, aiMonitoring_1.recordAiCall)(Object.assign(Object.assign({}, base), { outcome: "ok", error_category: attempt.value.error_category }));
        return Object.assign(Object.assign({}, attempt.value), { final_intervention: (0, socraticContract_1.toLegacyIntervention)(attempt.value), meta: {
                source: "gemini",
                model_id: geminiConfig_1.GEMINI_MODEL_ID,
                latency_ms: latency,
                attempts: attempt.attempts,
                suggested_category: facts.suggested_category,
            } });
    }
});
//# sourceMappingURL=geminiProxy.js.map