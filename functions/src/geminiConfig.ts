import { defineSecret } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
export const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const GEMINI_SECRETS = { secrets: [geminiApiKey] };

/** Model id shared by every Gemini call so the two engines can never drift apart. */
export const GEMINI_MODEL_ID = "gemini-2.5-flash";

/**
 * Resolves the key from the bound secret, falling back to a plain env var so a
 * local emulator run with a .env file still works. Throws the same explicit
 * error everywhere instead of handing the SDK an empty key and surfacing an
 * opaque auth failure from deep inside the request.
 */
export function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error("GEMINI_API_KEY is not configured on the server (set it with: firebase functions:secrets:set GEMINI_API_KEY).");
    throw new HttpsError("internal", "AI Service configuration is missing.");
  }
  return new GoogleGenerativeAI(apiKey);
}
