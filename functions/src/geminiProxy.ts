import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
  GEMINI_MODEL_ID,
  GEMINI_SECRETS,
  classifyGeminiError,
  getGeminiClient,
  getGeminiKeyStatus,
  withGeminiTimeout,
} from "./geminiConfig";
import { recordAiCall, type AiOutcome } from "./aiMonitoring";
import {
  SOCRATIC_RESPONSE_SCHEMA,
  SOCRATIC_SYSTEM_INSTRUCTION,
  buildSocraticPrompt,
  deriveSocraticFacts,
  toLegacyIntervention,
  validateSocraticAnchor,
  validateSocraticRequest,
  validateSocraticResponse,
  type SocraticFacts,
  type SocraticResponse,
} from "./socraticContract";

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
 * Server-side ceiling on one model call. The learner's client abandons the
 * proxy at 8s (SocraticEngine.SOCRATIC_PROXY_TIMEOUT_MS) and shows the static
 * card, so a slower answer helps nobody; keeping the server ceiling under that
 * lets a single retry still fit when the first attempt came back fast.
 */
export const SOCRATIC_AI_TIMEOUT_MS = 6500;
/** Total budget for both attempts; a retry only starts if it can finish inside this. */
export const SOCRATIC_TOTAL_BUDGET_MS = 7500;
const MIN_RETRY_WINDOW_MS = 2500;

type Attempt =
  | { ok: true; value: SocraticResponse; raw: string }
  | { ok: false; outcome: AiOutcome; detail: string; raw?: string };

async function generateOnce(prompt: string, facts: SocraticFacts | null, timeoutMs: number): Promise<Attempt> {
  const ai = getGeminiClient();
  const model = ai.getGenerativeModel({
    model: GEMINI_MODEL_ID,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      // Structured output: the SDK enum values are the same lowercase strings
      // the plain-object schema uses, so the cast is only a nominal one.
      responseSchema: SOCRATIC_RESPONSE_SCHEMA as unknown as NonNullable<
        Parameters<typeof ai.getGenerativeModel>[0]["generationConfig"]
      >["responseSchema"],
    },
    systemInstruction: SOCRATIC_SYSTEM_INSTRUCTION,
  });

  let raw: string;
  try {
    const result = await withGeminiTimeout(model.generateContent(prompt), timeoutMs);
    raw = result.response.text();
  } catch (err) {
    const code = classifyGeminiError(err);
    logger.warn("[socratic-proxy] model call failed", { code, error: String((err as Error)?.message ?? err) });
    return { ok: false, outcome: code, detail: code };
  }

  const validated = validateSocraticResponse(raw, facts);
  if (validated.ok) return { ok: true, value: validated.value, raw };

  const reason = validated.reason;
  const outcome: AiOutcome = reason.startsWith("final answer")
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
async function generateWithRetry(prompt: string, facts: SocraticFacts | null): Promise<Attempt & { attempts: number }> {
  const started = Date.now();
  const first = await generateOnce(prompt, facts, SOCRATIC_AI_TIMEOUT_MS);
  if (first.ok) return { ...first, attempts: 1 };

  const retryable = first.outcome === "schema_reject" || first.outcome === "answer_leak" || first.outcome === "forbidden_term" || first.outcome === "not_json";
  const remaining = SOCRATIC_TOTAL_BUDGET_MS - (Date.now() - started);
  if (!retryable || remaining < MIN_RETRY_WINDOW_MS) return { ...first, attempts: 1 };

  const correction = `${prompt}\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${first.detail}. Fix exactly that and return the JSON again.`;
  const second = await generateOnce(correction, facts, remaining);
  return { ...second, attempts: 2 };
}

function fallbackError(outcome: AiOutcome, message: string): HttpsError {
  // The client treats every non-OK as "serve the static card"; the code just
  // tells it (and the logs) why.
  switch (outcome) {
    case "timeout":
      return new HttpsError("deadline-exceeded", message);
    case "misconfigured":
    case "auth":
      return new HttpsError("failed-precondition", message);
    case "quota":
      return new HttpsError("resource-exhausted", message);
    default:
      return new HttpsError("internal", message);
  }
}

/**
 * callGeminiSocraticProxy
 * Exclusive gateway for all client-side AI analysis requests.
 * Mediates and enforces the Zero-Chatbot Policy and zero-trust security.
 *
 * Two request shapes are accepted:
 *   - `socratic_request` (+ optional `anchor`): the PRD Appendix A §6
 *     GeminiSocraticRequest. The prompt is built server-side from validated
 *     numbers only — this is the path the current client uses.
 *   - `prompt` / `context` / `history`: the pre-contract free-text path, kept
 *     for older clients. It is PII-scrubbed and its answer is validated with
 *     the same validator (minus the leak check, which needs the operands).
 */
export const callGeminiSocraticProxy = onCall(
  { ...GEMINI_SECRETS, timeoutSeconds: 30 },
  async (request) => {
    // 1. Verify Authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Client must be authenticated to call the AI proxy."
      );
    }

    const data = request.data || {};
    const { prompt, history, context, isChatbotAttempt, requestedAction, socratic_request, anchor } = data;

    // 2. Enforce Socratic Constraint (Zero-Chatbot Policy)
    // Reject any payload that attempts open-ended chat or violates strict Socratic mapping
    if (isChatbotAttempt || requestedAction === "open_chat" || requestedAction === "free_text") {
      logger.warn(`User ${request.auth.uid} attempted open-ended chat, violating Zero-Chatbot Policy.`);
      throw new HttpsError(
        "failed-precondition",
        "Zero-Chatbot Policy Violation: Open-ended chat requests are strictly forbidden. Only closed-ended Socratic items and prompts are allowed."
      );
    }

    // 3. Credential check up front, so a missing key is one clear log line
    //    and one clear monitoring row instead of an SDK stack trace per call.
    const keyStatus = getGeminiKeyStatus();
    if (!keyStatus.configured) {
      recordAiCall({ feature: socratic_request ? "socratic" : "socratic_legacy", outcome: "misconfigured", latency_ms: 0, model_id: GEMINI_MODEL_ID, detail: keyStatus.problem ?? "missing" });
      throw fallbackError("misconfigured", "AI Service configuration is missing.");
    }

    // ---------------------------------------------------------------
    // Structured path (PRD contract)
    // ---------------------------------------------------------------
    if (socratic_request !== undefined) {
      const started = Date.now();
      const validated = validateSocraticRequest(socratic_request);
      if (!validated.ok) {
        recordAiCall({ feature: "socratic", outcome: "invalid_request", latency_ms: 0, model_id: GEMINI_MODEL_ID, detail: validated.reason });
        throw new HttpsError("invalid-argument", `Invalid socratic_request: ${validated.reason}`);
      }
      const req = validated.value;
      const facts = deriveSocraticFacts(req);
      const safeAnchor = validateSocraticAnchor(anchor);
      const builtPrompt = buildSocraticPrompt(req, facts, safeAnchor);

      const attempt = await generateWithRetry(builtPrompt, facts);
      const latency = Date.now() - started;
      const base = {
        feature: "socratic" as const,
        latency_ms: latency,
        model_id: GEMINI_MODEL_ID,
        student_id: req.student_id,
        session_id: req.session_id,
        exercise_id: req.exercise_id,
        trigger_reason: facts.trigger_reason ?? undefined,
        attempts: attempt.attempts,
      };

      if (!attempt.ok) {
        recordAiCall({ ...base, outcome: attempt.outcome, detail: attempt.detail });
        throw fallbackError(attempt.outcome, `Socratic engine unavailable (${attempt.outcome}).`);
      }

      recordAiCall({ ...base, outcome: "ok", error_category: attempt.value.error_category });
      return {
        ...attempt.value,
        final_intervention: toLegacyIntervention(attempt.value),
        meta: {
          source: "gemini",
          model_id: GEMINI_MODEL_ID,
          latency_ms: latency,
          attempts: attempt.attempts,
          suggested_category: facts.suggested_category,
        },
      };
    }

    // ---------------------------------------------------------------
    // Legacy free-text path
    // ---------------------------------------------------------------
    if (!prompt && !context) {
      throw new HttpsError("invalid-argument", "Missing required payload fields (socratic_request, prompt or context).");
    }

    const started = Date.now();
    // Regex-based PII scrubbing before anything reaches the model.
    const scrubbedPrompt = scrubPII(String(prompt || ""));
    const scrubbedContext = scrubPII(typeof context === "string" ? context : JSON.stringify(context || {}));
    let scrubbedHistory: unknown = [];
    try {
      scrubbedHistory = history ? JSON.parse(scrubPII(JSON.stringify(history))) : [];
    } catch {
      scrubbedHistory = [];
    }

    const securePayload = `
      Context: ${scrubbedContext}
      Prompt: ${scrubbedPrompt}
      History: ${JSON.stringify(scrubbedHistory)}
      `;

    const attempt = await generateWithRetry(securePayload, null);
    const latency = Date.now() - started;
    if (!attempt.ok) {
      recordAiCall({ feature: "socratic_legacy", outcome: attempt.outcome, latency_ms: latency, model_id: GEMINI_MODEL_ID, detail: attempt.detail, attempts: attempt.attempts });
      throw fallbackError(attempt.outcome, "Failed to process the request through the Socratic Proxy.");
    }

    recordAiCall({ feature: "socratic_legacy", outcome: "ok", latency_ms: latency, model_id: GEMINI_MODEL_ID, error_category: attempt.value.error_category, attempts: attempt.attempts });
    logger.info(`Successfully proxied Socratic request for user ${request.auth.uid}`);
    return {
      ...attempt.value,
      final_intervention: toLegacyIntervention(attempt.value),
      meta: { source: "gemini", model_id: GEMINI_MODEL_ID, latency_ms: latency, attempts: attempt.attempts },
    };
  }
);
