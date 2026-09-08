"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiTimeoutError = exports.GEMINI_MODEL_ID = exports.GEMINI_SECRETS = exports.geminiApiKey = void 0;
exports.getGeminiKeyStatus = getGeminiKeyStatus;
exports.getGeminiClient = getGeminiClient;
exports.resetGeminiClientCache = resetGeminiClientCache;
exports.withGeminiTimeout = withGeminiTimeout;
exports.classifyGeminiError = classifyGeminiError;
const params_1 = require("firebase-functions/params");
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const generative_ai_1 = require("@google/generative-ai");
/**
 * Single source of truth for the Gemini credential and model id (Module 13,
 * Module 27 §ב.6).
 *
 * The key is held in Google Secret Manager, never in the repo. A Functions v2
 * handler only receives it in process.env when it declares the secret in its
 * own options — so every Gemini-calling function must spread GEMINI_SECRETS
 * into its onCall options, or the key reads back undefined at runtime and the
 * whole Socratic engine falls back to static hints on every request.
 *
 * Set it with: firebase functions:secrets:set GEMINI_API_KEY
 */
exports.geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
exports.GEMINI_SECRETS = { secrets: [exports.geminiApiKey] };
/** Model id shared by every Gemini call so the engines can never drift apart. */
exports.GEMINI_MODEL_ID = "gemini-2.5-flash";
/** Values people leave in a .env template; never a real credential. */
const PLACEHOLDER_KEYS = new Set([
    "",
    "your_api_key_here",
    "your-api-key-here",
    "changeme",
    "replace_me",
    "todo",
    "null",
    "undefined",
]);
/** Google API keys are "AIza" + 35 URL-safe characters. Anything else is almost certainly a paste error. */
const GOOGLE_API_KEY_RE = /^AIza[0-9A-Za-z_-]{35}$/;
function readRawKey() {
    let fromSecret = "";
    try {
        // .value() throws when the secret is not bound to the running function.
        fromSecret = exports.geminiApiKey.value() || "";
    }
    catch (_a) {
        fromSecret = "";
    }
    if (fromSecret.trim())
        return { raw: fromSecret, source: "secret_manager" };
    const fromEnv = process.env.GEMINI_API_KEY || "";
    if (fromEnv.trim())
        return { raw: fromEnv, source: "environment" };
    return { raw: "", source: "none" };
}
/**
 * Inspects the bound credential without ever returning it. Used by the
 * monitoring endpoint and by getGeminiClient() so both report the same thing.
 */
function getGeminiKeyStatus() {
    const { raw, source } = readRawKey();
    const key = raw.trim().replace(/^["']|["']$/g, "");
    const lowered = key.toLowerCase();
    if (source === "none" || PLACEHOLDER_KEYS.has(lowered)) {
        return {
            configured: false,
            source,
            well_formed: false,
            key_hint: null,
            model_id: exports.GEMINI_MODEL_ID,
            problem: source === "none"
                ? "GEMINI_API_KEY is not set. Bind it with: firebase functions:secrets:set GEMINI_API_KEY"
                : "GEMINI_API_KEY holds a placeholder value, not a real key.",
        };
    }
    const wellFormed = GOOGLE_API_KEY_RE.test(key);
    return {
        configured: true,
        source,
        well_formed: wellFormed,
        key_hint: key.slice(-4),
        model_id: exports.GEMINI_MODEL_ID,
        problem: wellFormed
            ? null
            : raw !== key
                ? "GEMINI_API_KEY carried surrounding whitespace or quotes (trimmed at runtime — re-set the secret cleanly)."
                : "GEMINI_API_KEY does not look like a Google API key (expected AIza… 39 chars).",
    };
}
function resolveKey() {
    const { raw } = readRawKey();
    return raw.trim().replace(/^["']|["']$/g, "");
}
let cachedClient = null;
/**
 * Resolves the key from the bound secret, falling back to a plain env var so a
 * local emulator run with a .env file still works. Throws the same explicit
 * error everywhere instead of handing the SDK an empty or placeholder key and
 * surfacing an opaque auth failure from deep inside the request.
 *
 * The client is cached per process (keyed on the credential, so a rotated
 * secret takes effect on the next instance without a restart).
 */
function getGeminiClient() {
    const status = getGeminiKeyStatus();
    if (!status.configured) {
        logger.error("[gemini] credential missing", { source: status.source, problem: status.problem });
        throw new https_1.HttpsError("failed-precondition", "AI Service configuration is missing.");
    }
    if (!status.well_formed) {
        // Still try the call — a malformed-looking key is a warning, not proof —
        // but say so loudly so a paste error is diagnosed from the logs in seconds.
        logger.warn("[gemini] credential looks malformed", { source: status.source, problem: status.problem, key_hint: status.key_hint });
    }
    const key = resolveKey();
    if (!cachedClient || cachedClient.key !== key) {
        cachedClient = { key, client: new generative_ai_1.GoogleGenerativeAI(key) };
    }
    return cachedClient.client;
}
/** Test seam: drop the cached SDK client (e.g. after rotating the key in an emulator). */
function resetGeminiClientCache() {
    cachedClient = null;
}
class GeminiTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Gemini call exceeded ${timeoutMs}ms`);
        this.timeoutMs = timeoutMs;
        this.name = "GeminiTimeoutError";
    }
}
exports.GeminiTimeoutError = GeminiTimeoutError;
/**
 * Bounds a Gemini call. Cloud Functions will happily wait the full function
 * timeout, but the learner's client gives up long before that, so an unbounded
 * call just burns quota answering nobody.
 */
function withGeminiTimeout(promise, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new GeminiTimeoutError(timeoutMs)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer)
            clearTimeout(timer);
    });
}
/**
 * Maps an SDK / network failure to a stable, PII-free code for the monitoring
 * counters. The raw message is logged separately, never stored.
 */
function classifyGeminiError(err) {
    var _a, _b;
    if (err instanceof GeminiTimeoutError)
        return "timeout";
    const msg = String((_b = (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err) !== null && _b !== void 0 ? _b : "").toLowerCase();
    if (/api key|api_key|permission denied|unauthenticated|401|403/.test(msg))
        return "auth";
    if (/quota|resource exhausted|rate limit|429/.test(msg))
        return "quota";
    if (/safety|blocked|candidate/.test(msg))
        return "safety";
    if (/fetch|network|econn|socket|timeout|timed out|503|502|unavailable/.test(msg))
        return "network";
    return "unknown";
}
//# sourceMappingURL=geminiConfig.js.map