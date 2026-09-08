import { defineSecret } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
export const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const GEMINI_SECRETS = { secrets: [geminiApiKey] };

/** Model id shared by every Gemini call so the engines can never drift apart. */
export const GEMINI_MODEL_ID = "gemini-2.5-flash";

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

export type GeminiKeySource = "secret_manager" | "environment" | "none";

export interface GeminiKeyStatus {
  configured: boolean;
  source: GeminiKeySource;
  /** true when the value has the shape of a real Google API key. */
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

  const wellFormed = GOOGLE_API_KEY_RE.test(key);
  return {
    configured: true,
    source,
    well_formed: wellFormed,
    key_hint: key.slice(-4),
    model_id: GEMINI_MODEL_ID,
    problem: wellFormed
      ? null
      : raw !== key
        ? "GEMINI_API_KEY carried surrounding whitespace or quotes (trimmed at runtime — re-set the secret cleanly)."
        : "GEMINI_API_KEY does not look like a Google API key (expected AIza… 39 chars).",
  };
}

function resolveKey(): string {
  const { raw } = readRawKey();
  return raw.trim().replace(/^["']|["']$/g, "");
}

let cachedClient: { key: string; client: GoogleGenerativeAI } | null = null;

/**
 * Resolves the key from the bound secret, falling back to a plain env var so a
 * local emulator run with a .env file still works. Throws the same explicit
 * error everywhere instead of handing the SDK an empty or placeholder key and
 * surfacing an opaque auth failure from deep inside the request.
 *
 * The client is cached per process (keyed on the credential, so a rotated
 * secret takes effect on the next instance without a restart).
 */
export function getGeminiClient(): GoogleGenerativeAI {
  const status = getGeminiKeyStatus();
  if (!status.configured) {
    logger.error("[gemini] credential missing", { source: status.source, problem: status.problem });
    throw new HttpsError("failed-precondition", "AI Service configuration is missing.");
  }
  if (!status.well_formed) {
    // Still try the call — a malformed-looking key is a warning, not proof —
    // but say so loudly so a paste error is diagnosed from the logs in seconds.
    logger.warn("[gemini] credential looks malformed", { source: status.source, problem: status.problem, key_hint: status.key_hint });
  }
  const key = resolveKey();
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = { key, client: new GoogleGenerativeAI(key) };
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
 * Maps an SDK / network failure to a stable, PII-free code for the monitoring
 * counters. The raw message is logged separately, never stored.
 */
export function classifyGeminiError(err: unknown): "timeout" | "auth" | "quota" | "network" | "safety" | "unknown" {
  if (err instanceof GeminiTimeoutError) return "timeout";
  const msg = String((err as { message?: unknown })?.message ?? err ?? "").toLowerCase();
  if (/api key|api_key|permission denied|unauthenticated|401|403/.test(msg)) return "auth";
  if (/quota|resource exhausted|rate limit|429/.test(msg)) return "quota";
  if (/safety|blocked|candidate/.test(msg)) return "safety";
  if (/fetch|network|econn|socket|timeout|timed out|503|502|unavailable/.test(msg)) return "network";
  return "unknown";
}
