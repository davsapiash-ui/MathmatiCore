import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GEMINI_MODEL_ID, GEMINI_SECRETS, getGeminiClient } from "./geminiConfig";

/**
 * Robust Regex Engine for PII Scrubbing
 * Active scrubbing of:
 * - Emails
 * - IDs and standard PII (e.g., 9-digit Israeli IDs, passwords)
 * - Hebrew/English name prefixes ("My name is X", "קוראים לי Y")
 */
export function scrubPII(text: string): string {
  if (!text) return text;

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
 * callGeminiSocraticProxy
 * Exclusive gateway for all client-side AI analysis requests.
 * Mediates and enforces the Zero-Chatbot Policy and zero-trust security.
 */
export const callGeminiSocraticProxy = onCall(
  GEMINI_SECRETS,
  async (request) => {
    // 1. Verify Authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Client must be authenticated to call the AI proxy."
      );
    }

    const data = request.data || {};
    const { prompt, history, context, isChatbotAttempt, requestedAction } = data;

    // 2. Enforce Socratic Constraint (Zero-Chatbot Policy)
    // Reject any payload that attempts open-ended chat or violates strict Socratic mapping
    if (isChatbotAttempt || requestedAction === "open_chat" || requestedAction === "free_text") {
      logger.warn(`User ${request.auth.uid} attempted open-ended chat, violating Zero-Chatbot Policy.`);
      throw new HttpsError(
        "failed-precondition",
        "Zero-Chatbot Policy Violation: Open-ended chat requests are strictly forbidden. Only closed-ended Socratic items and prompts are allowed."
      );
    }

    if (!prompt && !context) {
      throw new HttpsError("invalid-argument", "Missing required payload fields (prompt or context).");
    }

    // 3. Regex-Based PII Scrubbing
    // Scrub the incoming payload components before they hit the LLM
    const scrubbedPrompt = scrubPII(prompt || "");
    const scrubbedContext = scrubPII(typeof context === "string" ? context : JSON.stringify(context || {}));
    const scrubbedHistory = history ? JSON.parse(scrubPII(JSON.stringify(history))) : [];

    // 4. API Key Security (bound Secret Manager secret — see geminiConfig.ts)
    const ai = getGeminiClient();

    try {
      const model = ai.getGenerativeModel({
        model: GEMINI_MODEL_ID,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        },
        systemInstruction: `You are the MathmatiCore Socratic Pedagogical Engine.
You operate strictly under the HOLISTIC PEDAGOGICAL TRIAD:
1. Exercise & Algorithm: Mathematical operation (addition/subtraction), operands, active column, and specific step.
2. Visual / Dienes Board State: Virtual block counts, place value representation, and canvas decomposition/composition state.
3. Student Progress & Step History: Completed columns, memory circles, input attempts, and the trigger reason (hesitation/errors).

STRICT PEDAGOGICAL & HEBREW SYNTAX RULES:
- HEBREW SYNTAX & GRAMMAR: Write in natural, grammatically flawless Hebrew adapted for 3rd-grade elementary students (ages 8-9). Use precise gender and number agreement (e.g., 4 מאות, 2 עשרות, 5 יחידות, 10 עשרות). Keep sentences simple, friendly, empowering, and free of complex or awkward syntax.
- OFFICIAL TERMINOLOGY: Use standard Ministry of Education math terms: "פריטה" (decomposition in subtraction), "קיבוץ" / "הקבצה" (regrouping in addition), "בית המספרים" (place value chart), "טור היחידות / העשרות / המאות", "עיגולי הזיכרון", "פח האשפה".
- HOLISTIC SYNTHESIS: NEVER analyze or mention "בית המספרים" or blocks in isolation! Always synthesize the blocks with the arithmetic exercise and the student's current step.
- CLOSED SOCRATIC FORMAT: Formulate a clear, empowering Socratic guiding question in Hebrew connecting the active column calculation with the visual board state. Provide exactly 3 closed options with clear, encouraging pedagogical feedback for each option.
- STRICT DIAGNOSTIC CLASSIFICATION: Classify the error strictly as "calculation", "procedural", or "conceptual" in "error_category".
- ZERO CHATBOT & PRIVACY: Strictly forbidden from acting as an open chatbot, exposing PII, or revealing the direct final answer. Output ONLY valid JSON.`
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
      } catch (e) {
         // Fallback if not valid json
         parsedResponse = { rawText: textResponse };
      }

      logger.info(`Successfully proxied Socratic request for user ${request.auth.uid}`);
      return parsedResponse;

    } catch (error) {
      logger.error("Error communicating with Gemini API", error);
      throw new HttpsError("internal", "Failed to process the request through the Socratic Proxy.");
    }
  }
);
