import { defineSecret } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";

/**
 * Single source of truth for the Gemini credential, the model id and the one
 * function every engine calls the model through (Module 13, Module 23 layer 2,
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
export const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const GEMINI_SECRETS = { secrets: [geminiApiKey] };

/**
 * Model id shared by every Gemini call so the engines can never drift apart.
 *
 * "gemini-2.5-flash" stopped serving new users: every call since at least
 * 28.9.2026 came back 404 "no longer available to new users", in production and
 * in the emulator, and the child always got the static card (audit of
 * 1.10.2026). The id below is the one the API itself names, measured against
 * the 33 audit cases before it was set.
 */
export const GEMINI_MODEL_ID = "gemini-3.8-flash";

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

export type GeminiKeySource = "secret_manager" | "environment" | "none";

export interface GeminiKeyStatus {
  configured: boolean;
  source: GeminiKeySource;
  /**
   * true unless the stored value carries whitespace or quotes around it. The
   * old "AIza + 35 characters" shape check is gone: the key in Secret Manager
   * authenticates and did not match it, so every call logged a false
   * "malformed key" warning (audit of 1.10.2026). Whether a key works is what
   * the live test call (getAiServiceStatus with test_call) answers.
   */
  well_formed: boolean;
  /** Last four characters, so an admin can tell which key is bound without seeing it. */
  key_hint: string | null;
  model_id: string;
  problem: string | null;
}

function readRawKey(): { raw: string; source: GeminiKeySource } {
  let fromSecret = "";
  try {
    // .value() throws when the secret is not bound to the running function.
    fromSecret = geminiApiKey.value() || "";
  } catch {
    fromSecret = "";
  }
  if (fromSecret.trim()) return { raw: fromSecret, source: "secret_manager" };
  const fromEnv = process.env.GEMINI_API_KEY || "";
  if (fromEnv.trim()) return { raw: fromEnv, source: "environment" };
  return { raw: "", source: "none" };
}

/**
 * Inspects the bound credential without ever returning it. Used by the
 * monitoring endpoint and by getGeminiClient() so both report the same thing.
 */
export function getGeminiKeyStatus(): GeminiKeyStatus {
  const { raw, source } = readRawKey();
  const key = raw.trim().replace(/^["']|["']$/g, "");
  const lowered = key.toLowerCase();

  if (source === "none" || PLACEHOLDER_KEYS.has(lowered)) {
    return {
      configured: false,
      source,
      well_formed: false,
      key_hint: null,
      model_id: GEMINI_MODEL_ID,
      problem: source === "none"
        ? "GEMINI_API_KEY is not set. Bind it with: firebase functions:secrets:set GEMINI_API_KEY"
        : "GEMINI_API_KEY holds a placeholder value, not a real key.",
    };
  }

  const clean = raw === key;
  return {
    configured: true,
    source,
    well_formed: clean,
    key_hint: key.slice(-4),
    model_id: GEMINI_MODEL_ID,
    problem: clean
      ? null
      : "GEMINI_API_KEY carried surrounding whitespace or quotes (trimmed at runtime — re-set the secret cleanly).",
  };
}

function resolveKey(): string {
  const { raw } = readRawKey();
  return raw.trim().replace(/^["']|["']$/g, "");
}

let cachedClient: { key: string; client: GoogleGenAI } | null = null;

/**
 * Resolves the key from the bound secret, falling back to a plain env var so a
 * local emulator run with a .env file still works. Throws the same explicit
 * error everywhere instead of handing the SDK an empty or placeholder key and
 * surfacing an opaque auth failure from deep inside the request.
 *
 * The client is cached per process (keyed on the credential, so a rotated
 * secret takes effect on the next instance without a restart). It is the
 * current SDK (@google/genai): the legacy @google/generative-ai had no way to
 * turn the model's thinking down, and thinking is most of the latency.
 */
export function getGeminiClient(): GoogleGenAI {
  const status = getGeminiKeyStatus();
  if (!status.configured) {
    logger.error("[gemini] credential missing", { source: status.source, problem: status.problem });
    throw new HttpsError("failed-precondition", "AI Service configuration is missing.");
  }
  const key = resolveKey();
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = { key, client: new GoogleGenAI({ apiKey: key }) };
  }
  return cachedClient.client;
}

/** Test seam: drop the cached SDK client (e.g. after rotating the key in an emulator). */
export function resetGeminiClientCache(): void {
  cachedClient = null;
}

export class GeminiTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Gemini call exceeded ${timeoutMs}ms`);
    this.name = "GeminiTimeoutError";
  }
}

/**
 * Bounds a Gemini call. Cloud Functions will happily wait the full function
 * timeout, but the learner's client gives up long before that, so an unbounded
 * call just burns quota answering nobody.
 */
export function withGeminiTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GeminiTimeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/**
 * How much the model may think before it answers. Thinking is most of the
 * latency. "off" is a zero thinking budget (models that allow it), "default"
 * leaves the model's own setting; the others are thinking levels.
 */
export type GeminiThinking = "off" | "default" | "minimal" | "low" | "medium" | "high";

function thinkingConfigFor(t: GeminiThinking): GenerateContentConfig["thinkingConfig"] | undefined {
  switch (t) {
    case "default": return undefined;
    case "off": return { thinkingBudget: 0 };
    case "minimal": return { thinkingLevel: ThinkingLevel.MINIMAL };
    case "low": return { thinkingLevel: ThinkingLevel.LOW };
    case "medium": return { thinkingLevel: ThinkingLevel.MEDIUM };
    case "high": return { thinkingLevel: ThinkingLevel.HIGH };
  }
}

/** A model and how much it thinks. Not every model accepts every level (gemini-3.8-flash refuses "minimal"). */
export interface GeminiModelChoice {
  id: string;
  thinking: GeminiThinking;
}

/**
 * The coaching card's models (Module 13), measured on the 33 audit cases with
 * real calls on 1.10.2026. The primary answers; the fallback takes the second
 * try when the primary is overloaded (503), too slow, over quota or gone.
 */
export const SOCRATIC_PRIMARY_MODEL: GeminiModelChoice = { id: GEMINI_MODEL_ID, thinking: "low" };
export const SOCRATIC_FALLBACK_MODEL: GeminiModelChoice = { id: "gemini-3.1-flash-lite", thinking: "minimal" };

export interface GeminiTextCall {
  systemInstruction: string;
  prompt: string;
  temperature: number;
  /** A JSON answer: the response MIME type is set, and the schema when given. */
  json?: boolean;
  responseSchema?: unknown;
  thinking: GeminiThinking;
  timeoutMs: number;
  /** Defaults to GEMINI_MODEL_ID. */
  model?: string;
}

export interface GeminiTextResult {
  text: string;
  latency_ms: number;
}

/**
 * The one way every engine calls the model. Bounded by `timeoutMs` twice: the
 * SDK's own per-request timeout aborts the HTTP request, and the race rejects
 * with GeminiTimeoutError so the caller never waits past it. No SDK retries:
 * a retry is the caller's decision, inside its own budget.
 */
export async function generateGeminiText(call: GeminiTextCall): Promise<GeminiTextResult> {
  const ai = getGeminiClient();
  const started = Date.now();
  const controller = new AbortController();
  const config: GenerateContentConfig = {
    systemInstruction: call.systemInstruction,
    temperature: call.temperature,
    httpOptions: { timeout: call.timeoutMs },
    abortSignal: controller.signal,
  };
  const thinkingConfig = thinkingConfigFor(call.thinking);
  if (thinkingConfig) config.thinkingConfig = thinkingConfig;
  if (call.json) config.responseMimeType = "application/json";
  if (call.responseSchema) config.responseSchema = call.responseSchema as GenerateContentConfig["responseSchema"];
  try {
    const res = await withGeminiTimeout(
      ai.models.generateContent({ model: call.model ?? GEMINI_MODEL_ID, contents: call.prompt, config }),
      call.timeoutMs
    );
    const text = res.text;
    if (typeof text !== "string" || !text.trim()) {
      const reason = res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason ?? "empty";
      throw new Error(`Gemini returned no text (blocked or empty: ${String(reason)})`);
    }
    return { text, latency_ms: Date.now() - started };
  } catch (err) {
    controller.abort();
    if ((err as { name?: string })?.name === "AbortError") throw new GeminiTimeoutError(call.timeoutMs);
    throw err;
  }
}

export type GeminiErrorCode = "timeout" | "auth" | "quota" | "network" | "safety" | "misconfigured" | "unknown";

/**
 * Maps an SDK / network failure to a stable, PII-free code for the monitoring
 * counters. The raw message is logged separately, never stored.
 *
 * A model the API no longer serves (404 "no longer available", "not found",
 * "not supported for generateContent") or a configuration it refuses is
 * "misconfigured": it is our code, not the network, and it will not fix
 * itself. It used to read "network" because the legacy SDK's message starts
 * "Error fetching from …" and /fetch/ matched first, so for days the counters
 * showed a passing network problem while every call failed the same way.
 */
export function classifyGeminiError(err: unknown): GeminiErrorCode {
  if (err instanceof GeminiTimeoutError) return "timeout";
  const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : null;
  const msg = String((err as { message?: unknown })?.message ?? err ?? "").toLowerCase();
  if (status === 404 || /\b404\b|not found|no longer available|is not supported for|unknown name|invalid argument.*(model|thinking)|thinking.*(not supported|invalid)/.test(msg)) {
    return "misconfigured";
  }
  if (status === 401 || status === 403 || /api key|api_key|permission denied|unauthenticated|\b401\b|\b403\b/.test(msg)) return "auth";
  if (status === 429 || /quota|resource exhausted|resource_exhausted|rate limit|\b429\b/.test(msg)) return "quota";
  if (/safety|blocked|prohibited_content|recitation/.test(msg)) return "safety";
  if (status === 400) return "misconfigured";
  if ((status !== null && status >= 500) || /network|econn|socket|timed out|timeout|\b50[234]\b|unavailable|fetch failed/.test(msg)) return "network";
  return "unknown";
}
