"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGeminiSocraticProxy = void 0;
exports.scrubPII = scrubPII;
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const generative_ai_1 = require("@google/generative-ai");
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
    // Password-like patterns (e.g., password: <something>, סיסמה: <משהו>)
    const passwordRegex = /(password|pass|סיסמה|ססמא)[\s:=]+(\S+)/gi;
    scrubbed = scrubbed.replace(passwordRegex, "$1 [REDACTED_PASSWORD]");
    return scrubbed;
}
/**
 * callGeminiSocraticProxy
 * Exclusive gateway for all client-side AI analysis requests.
 * Mediates and enforces the Zero-Chatbot Policy and zero-trust security.
 */
exports.callGeminiSocraticProxy = (0, https_1.onCall)(async (request) => {
    // 1. Verify Authentication
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Client must be authenticated to call the AI proxy.");
    }
    const data = request.data || {};
    const { prompt, history, context, isChatbotAttempt, requestedAction } = data;
    // 2. Enforce Socratic Constraint (Zero-Chatbot Policy)
    // Reject any payload that attempts open-ended chat or violates strict Socratic mapping
    if (isChatbotAttempt || requestedAction === "open_chat" || requestedAction === "free_text") {
        logger.warn(`User ${request.auth.uid} attempted open-ended chat, violating Zero-Chatbot Policy.`);
        throw new https_1.HttpsError("failed-precondition", "Zero-Chatbot Policy Violation: Open-ended chat requests are strictly forbidden. Only closed-ended Socratic items and prompts are allowed.");
    }
    if (!prompt && !context) {
        throw new https_1.HttpsError("invalid-argument", "Missing required payload fields (prompt or context).");
    }
    // 3. Regex-Based PII Scrubbing
    // Scrub the incoming payload components before they hit the LLM
    const scrubbedPrompt = scrubPII(prompt || "");
    const scrubbedContext = scrubPII(typeof context === "string" ? context : JSON.stringify(context || {}));
    const scrubbedHistory = history ? JSON.parse(scrubPII(JSON.stringify(history))) : [];
    // 4. API Key Security (Load from Env / Secret Manager)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        logger.error("GEMINI_API_KEY is not configured on the server.");
        throw new https_1.HttpsError("internal", "AI Service configuration is missing.");
    }
    try {
        const ai = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = ai.getGenerativeModel({
            model: 'gemini-3.7-flash',
            generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json"
            },
            systemInstruction: `You are the MathmatiCore Pedagogical Engine. You must ONLY return JSON containing predefined Socratic mapping identifiers. You are strictly forbidden from acting as a conversational chatbot. You do not respond with free text.`
        });
        // Construct the secure, scrubbed prompt payload
        const securePayload = `
      Context: ${scrubbedContext}
      Prompt: ${scrubbedPrompt}
      History: ${JSON.stringify(scrubbedHistory)}
      `;
        const response = await model.generateContent(securePayload);
        const textResponse = response.response.text();
        // Return the LLM response to the client
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(textResponse);
        }
        catch (e) {
            // Fallback if not valid json
            parsedResponse = { rawText: textResponse };
        }
        logger.info(`Successfully proxied Socratic request for user ${request.auth.uid}`);
        return parsedResponse;
    }
    catch (error) {
        logger.error("Error communicating with Gemini API", error);
        throw new https_1.HttpsError("internal", "Failed to process the request through the Socratic Proxy.");
    }
});
//# sourceMappingURL=geminiProxy.js.map