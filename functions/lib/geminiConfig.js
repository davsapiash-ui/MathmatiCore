"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GEMINI_MODEL_ID = exports.GEMINI_SECRETS = exports.geminiApiKey = void 0;
exports.getGeminiClient = getGeminiClient;
const params_1 = require("firebase-functions/params");
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const generative_ai_1 = require("@google/generative-ai");
/**
 * Single source of truth for the Gemini credential and model id (Module 13).
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
/** Model id shared by every Gemini call so the two engines can never drift apart. */
exports.GEMINI_MODEL_ID = "gemini-2.5-flash";
/**
 * Resolves the key from the bound secret, falling back to a plain env var so a
 * local emulator run with a .env file still works. Throws the same explicit
 * error everywhere instead of handing the SDK an empty key and surfacing an
 * opaque auth failure from deep inside the request.
 */
function getGeminiClient() {
    const apiKey = exports.geminiApiKey.value() || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        logger.error("GEMINI_API_KEY is not configured on the server (set it with: firebase functions:secrets:set GEMINI_API_KEY).");
        throw new https_1.HttpsError("internal", "AI Service configuration is missing.");
    }
    return new generative_ai_1.GoogleGenerativeAI(apiKey);
}
//# sourceMappingURL=geminiConfig.js.map