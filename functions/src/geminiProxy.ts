import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
  GEMINI_MODEL_ID,
  GEMINI_SECRETS,
  SOCRATIC_FALLBACK_MODEL,
  SOCRATIC_PRIMARY_MODEL,
  type GeminiModelChoice,
  classifyGeminiError,
  generateGeminiText,
  getGeminiClient,
  getGeminiKeyStatus,
} from "./geminiConfig";
import { recordAiCall, warmAiMonitoring, type AiOutcome } from "./aiMonitoring";
import { readCallerRoles } from "./callerIdentity";
import { redactPhoneNumbers } from "./phonePattern";
import {
  SOCRATIC_RESPONSE_SCHEMA,
  socraticSystemInstructionFor,
  buildSocraticPrompt,
  deriveSocraticFacts,
  toLegacyIntervention,
  validateSocraticAnchor,
  validateSocraticRequest,
  validateSocraticResponse,
  type SocraticFacts,
  type SocraticResponse,
} from "./socraticContract";

/** The check digit of an Israeli ID number (the client's isValidIsraeliID, PiiFilter.ts). */
function hasIsraeliIdCheckDigit(text: string): boolean {
  const digits = text.replace(/\D/g, "").padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let num = Number(digits[i]) * ((i % 2) + 1);
    if (num > 9) num -= 9;
    sum += num;
  }
  return sum % 10 === 0;
}

/**
 * Robust Regex Engine for PII Scrubbing
 * Active scrubbing of:
 * - Emails
 * - IDs and standard PII (e.g., 9-digit Israeli IDs, passwords)
 * - Hebrew/English name prefixes ("My name is X", "קוראים לי Y")
 *
 * It runs on the teacher-admin chat (Module 22), which is ordinary adult prose,
 * so a false positive is not harmless: it deletes a word out of a real message.
 * Every pattern here has to be one that cannot fire on normal writing.
 */
export function scrubPII(text: string): string {
  if (!text) return text;

  let scrubbed = text;

  // Scrub Emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  scrubbed = scrubbed.replace(emailRegex, "[REDACTED_EMAIL]");
  scrubbed = redactPhoneNumbers(scrubbed); // every common Israeli layout (phonePattern.ts)

  // Scrub Israeli IDs (9 digits, with or without hyphens/spaces) and basic phone numbers.
  //
  // A run of digits with nothing between them is always scrubbed. Groups that
  // are separated by a space or a hyphen are also what a teacher writes about
  // exercises ("100 200 300"), so those are scrubbed only when the digits pass
  // the ID check digit.
  const idRegex = /\b\d{1,3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
  scrubbed = scrubbed.replace(idRegex, (match) =>
    /[-\s]/.test(match) && !hasIsraeliIdCheckDigit(match) ? match : "[REDACTED_ID]"
  );

  // Scrub Name prefixes in English.
  //
  // The /i flag used to apply to the name group as well, so "i am tired"
  // became "i am [REDACTED_NAME]". The prefixes carry their own casing here
  // and the flag is gone: a name still has to look like a name.
  const englishNameRegex = /([Mm]y name is|[Ii] am|[Tt]his is) ([A-Z][a-z]+(\s[A-Z][a-z]+)?)/g;
  scrubbed = scrubbed.replace(englishNameRegex, "$1 [REDACTED_NAME]");

  // Scrub Name prefixes in Hebrew.
  //
  // "אני" is not a name introducer in Hebrew, it is the word "I" — the most
  // common word a teacher writes. This function scrubs the teacher-admin chat
  // (Module 22), so "אני צריכה עזרה עם תלמיד 4" reached the other side as
  // "אני [REDACTED_NAME] עם תלמיד 4" and the message was destroyed. It also
  // protected nothing: no name is ever stored anywhere in the system
  // (Zero-PII), and staff write learner IDs 1–12 only (Module 22 §ב).
  //
  // What replaces it is wider where it matters — every real Hebrew introducer,
  // for oneself and for a third person — and it no longer fires on the middle
  // of a word ("בשמי הארץ").
  const hebrewNameRegex =
    /(?<![א-ת])(קוראים לי|קוראים לו|קוראים לה|השם שלי|שמי|שמו|שמה) ([א-ת]+(\s[א-ת]+)?)/g;
  scrubbed = scrubbed.replace(hebrewNameRegex, "$1 [REDACTED_NAME]");

  // Password-like patterns (e.g., password: <something>, סיסמה: <משהו>, סיסמה שלי היא <משהו>)
  const passwordRegex = /(password|pass|סיסמה|ססמא)(?:[\s:=]+(?:שלי|היא|הוא|שלנו|זה|הינו|הינה|is|my)+)*[\s:=]+(\S+)/gi;
  scrubbed = scrubbed.replace(passwordRegex, "$1: [REDACTED_PASSWORD]");

  return scrubbed;
}

/**
 * Server-side ceilings. The learner's client abandons the proxy at 8 s
 * (SocraticEngine.SOCRATIC_PROXY_TIMEOUT_MS, owner's decision of 28.9.2026)
 * and shows the static card, so a slower answer helps nobody.
 *
 * Measured on the 33 audit cases (1.10.2026): the model answers in about
 * 2.5 s (p90 under 3 s), and about one call in ten comes back 503 "high
 * demand". So the first try is cut at 4.5 s, which leaves room inside the
 * 7.5 s total for a second try — on the fallback model when the first one was
 * overloaded, slow or gone, or on the same model with the rejection reason
 * when its card broke a rule.
 */
export const SOCRATIC_AI_TIMEOUT_MS = 4500;
/**
 * Total budget for both attempts; a retry only starts if it can finish inside this.
 * 7.10.2026: 7 s, not 7.5 s. The learner's 8 s count from the click and also
 * hold the trip to the server and back; with half a second to spare, a card
 * the server counted as answered could reach a client that had already shown
 * the static one. A full second keeps the two counts the same card.
 */
export const SOCRATIC_TOTAL_BUDGET_MS = 7000;
const MIN_RETRY_WINDOW_MS = 2000;
/**
 * A corrected retry stays on the primary model only with this much budget
 * left: it answered in about 2.3 s (p90 under 3 s) on the audit cases, the
 * fallback in about 2.0 s. A rule rejection that comes late — after a slow
 * first answer — leaves less, and the corrected card then goes to the faster
 * fallback model rather than run into the learner's timeout (review of
 * 1.10.2026).
 */
export const CORRECTED_RETRY_ON_PRIMARY_MIN_MS = 3500;
/** A short card in the classroom's vocabulary: little room for invention. */
const SOCRATIC_TEMPERATURE = 0.2;

type Attempt =
  | { ok: true; value: SocraticResponse; raw: string; model_id: string }
  | { ok: false; outcome: AiOutcome; detail: string; raw?: string; model_id: string };

/** A validator reason → the monitoring outcome. */
function rejectionOutcome(reason: string): AiOutcome {
  if (reason.startsWith("final answer") || reason.startsWith("hidden digits") || reason.startsWith("secret number")) return "answer_leak";
  if (reason.startsWith("forbidden")) return "forbidden_term";
  if (reason.startsWith("response is not JSON")) return "not_json";
  if (reason.startsWith("frame:")) return "frame_reject";
  if (reason.startsWith("form:") || reason.startsWith("language:") || reason.startsWith("style:") || reason.startsWith("screen:") || reason.startsWith("counts:") || reason.startsWith("names an aid")) {
    return "language_reject";
  }
  return "schema_reject";
}

async function generateOnce(prompt: string, facts: SocraticFacts | null, timeoutMs: number, model: GeminiModelChoice): Promise<Attempt> {
  let raw: string;
  try {
    const result = await generateGeminiText({
      // Meetings 2 and 8 have no blocks on the screen (PRD Module 14 §ב);
      // meeting 1 never states a count or the column (owner, 29.9.2026).
      systemInstruction: socraticSystemInstructionFor(facts),
      prompt,
      temperature: SOCRATIC_TEMPERATURE,
      json: true,
      // Structured output: the card's shape is enforced by the API as well as by the validator.
      responseSchema: SOCRATIC_RESPONSE_SCHEMA,
      thinking: model.thinking,
      timeoutMs,
      model: model.id,
    });
    raw = result.text;
  } catch (err) {
    const code = classifyGeminiError(err);
    logger.warn("[socratic-proxy] model call failed", { code, model_id: model.id, error: String((err as Error)?.message ?? err).slice(0, 300) });
    return { ok: false, outcome: code, detail: code, model_id: model.id };
  }

  const validated = validateSocraticResponse(raw, facts);
  if (validated.ok) return { ok: true, value: validated.value, raw, model_id: model.id };

  const reason = validated.reason;
  logger.warn("[socratic-proxy] response rejected", { reason, model_id: model.id, raw_length: raw.length });
  return { ok: false, outcome: rejectionOutcome(reason), detail: reason, raw, model_id: model.id };
}

/** The first try failed in the transport or the model is gone: the second try goes to the other model. */
const TRY_THE_OTHER_MODEL: AiOutcome[] = ["network", "timeout", "quota", "misconfigured", "unknown", "safety"];
/** The first card broke a rule: the same model tries again, told exactly what to fix. */
const TRY_AGAIN_CORRECTED: AiOutcome[] = ["schema_reject", "answer_leak", "forbidden_term", "not_json", "language_reject", "frame_reject"];

/**
 * Runs the model once and, when there is still room inside the learner's
 * timeout, once more: on the fallback model when the first try was
 * overloaded (503), too slow, over quota or misconfigured (a retired model id
 * is exactly how every card failed until 1.10.2026); with the rejection
 * reason appended when its card broke a rule — on the same model, or on the
 * faster fallback when less than CORRECTED_RETRY_ON_PRIMARY_MIN_MS is left.
 * An auth failure is never retried: the key is the same for both models.
 */
export async function generateWithRetry(prompt: string, facts: SocraticFacts | null): Promise<Attempt & { attempts: number; first_outcome?: AiOutcome }> {
  const started = Date.now();
  const first = await generateOnce(prompt, facts, SOCRATIC_AI_TIMEOUT_MS, SOCRATIC_PRIMARY_MODEL);
  if (first.ok) return { ...first, attempts: 1 };

  const remaining = SOCRATIC_TOTAL_BUDGET_MS - (Date.now() - started);
  if (remaining < MIN_RETRY_WINDOW_MS) return { ...first, attempts: 1 };

  if (TRY_AGAIN_CORRECTED.includes(first.outcome)) {
    const correction = `${prompt}\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${first.detail}. Fix exactly that and return the JSON again.`;
    const model = remaining >= CORRECTED_RETRY_ON_PRIMARY_MIN_MS ? SOCRATIC_PRIMARY_MODEL : SOCRATIC_FALLBACK_MODEL;
    const second = await generateOnce(correction, facts, remaining, model);
    return { ...second, attempts: 2, first_outcome: first.outcome };
  }
  if (TRY_THE_OTHER_MODEL.includes(first.outcome)) {
    const second = await generateOnce(prompt, facts, remaining, SOCRATIC_FALLBACK_MODEL);
    return { ...second, attempts: 2, first_outcome: first.outcome };
  }
  return { ...first, attempts: 1 };
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
    const { isChatbotAttempt, requestedAction, socratic_request, anchor } = data;

    // 2. Enforce Socratic Constraint (Zero-Chatbot Policy)
    // Reject any payload that attempts open-ended chat or violates strict Socratic mapping
    if (isChatbotAttempt || requestedAction === "open_chat" || requestedAction === "free_text") {
      logger.warn(`User ${request.auth.uid} attempted open-ended chat, violating Zero-Chatbot Policy.`);
      throw new HttpsError(
        "failed-precondition",
        "Zero-Chatbot Policy Violation: Open-ended chat requests are strictly forbidden. Only closed-ended Socratic items and prompts are allowed."
      );
    }

    // A warm-up ping (the teacher activating a meeting, TeacherDashboard): it
    // only starts this function's instance so the first child's card does not
    // pay the cold start. No model call, no data written, staff only.
    // It also builds what the first card would otherwise build on its own
    // time: the Firestore client of the monitoring counters (one read) and
    // the model's SDK client (acceptance run of 2.10.2026).
    if (data.warm === true) {
      if (!readCallerRoles(request.auth.token as Record<string, unknown>).isTeacher) {
        throw new HttpsError("permission-denied", "Warm-up is for staff only.");
      }
      if (getGeminiKeyStatus().configured) {
        try {
          getGeminiClient();
        } catch {
          /* the first card reports a missing key on its own */
        }
      }
      await warmAiMonitoring();
      return { warm: true };
    }

    // 3. Credential check up front, so a missing key is one clear log line
    //    and one clear monitoring row instead of an SDK stack trace per call.
    const keyStatus = getGeminiKeyStatus();
    if (!keyStatus.configured) {
      recordAiCall({ feature: "socratic", outcome: "misconfigured", latency_ms: 0, model_id: GEMINI_MODEL_ID, detail: keyStatus.problem ?? "missing" });
      throw fallbackError("misconfigured", "AI Service configuration is missing.");
    }

    if (socratic_request === undefined) {
      throw new HttpsError("invalid-argument", "Missing required payload field: socratic_request.");
    }

    const started = Date.now();
    {
      const validated = validateSocraticRequest(socratic_request);
      if (!validated.ok) {
        recordAiCall({ feature: "socratic", outcome: "invalid_request", latency_ms: 0, model_id: GEMINI_MODEL_ID, detail: validated.reason });
        throw new HttpsError("invalid-argument", `Invalid socratic_request: ${validated.reason}`);
      }
      const req = validated.value;

      // A learner may ask for a hint about their own work only. Without this,
      // any authenticated caller — including the anonymous session the login
      // screen opens before a child identifies — could spend the project's
      // model quota and file monitoring rows against any of the twelve
      // learners. The teacher may ask on a learner's behalf; an admin sign-in
      // may not (PRD Module 24 §ב: no individual learner data for the admin).
      const isTeacher = readCallerRoles(request.auth.token as Record<string, unknown>).isTeacher;
      const callerStudentId = Number(request.auth.token.student_id);
      if (!isTeacher && callerStudentId !== req.student_id) {
        recordAiCall({ feature: "socratic", outcome: "invalid_request", latency_ms: 0, model_id: GEMINI_MODEL_ID, detail: "caller_student_mismatch" });
        throw new HttpsError("permission-denied", "A learner may only request a hint for their own work.");
      }
      const facts = deriveSocraticFacts(req);
      const safeAnchor = validateSocraticAnchor(anchor);
      const builtPrompt = buildSocraticPrompt(req, facts, safeAnchor);

      const attempt = await generateWithRetry(builtPrompt, facts);
      const latency = Date.now() - started;
      const base = {
        feature: "socratic" as const,
        latency_ms: latency,
        // The model that gave this answer (or failed last): the fallback answers some calls.
        model_id: attempt.model_id,
        student_id: req.student_id,
        session_id: req.session_id,
        exercise_id: req.exercise_id,
        trigger_reason: facts.trigger_reason ?? undefined,
        attempts: attempt.attempts,
      };

      if (!attempt.ok) {
        recordAiCall({ ...base, outcome: attempt.outcome, detail: attempt.first_outcome ? `${attempt.first_outcome} → ${attempt.detail}` : attempt.detail });
        throw fallbackError(attempt.outcome, `Socratic engine unavailable (${attempt.outcome}).`);
      }

      recordAiCall({ ...base, outcome: "ok", error_category: attempt.value.error_category, ...(attempt.first_outcome ? { detail: `retried after ${attempt.first_outcome}` } : {}) });
      return {
        ...attempt.value,
        final_intervention: toLegacyIntervention(attempt.value),
        meta: {
          source: "gemini",
          model_id: attempt.model_id,
          latency_ms: latency,
          attempts: attempt.attempts,
          suggested_category: facts.suggested_category,
        },
      };
    }

  }
);
