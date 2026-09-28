/**
 * Tests never reach the live Firebase project.
 *
 * `src/infrastructure/firebase.ts` signs in anonymously as soon as it is imported,
 * and most store and service modules import it. Until 28.9.2026 every `npm test`
 * run, locally and on every CI push, created about 71 anonymous accounts in the
 * production project and made about 125 calls to the production Gemini proxy.
 * Anonymous sign-ups share a per-IP quota, and that quota is what locked the class
 * out on 15.9.2026 (register: "כניסת התלמידים נחסמה בלייב").
 *
 * Two layers:
 *  1. `vite.config.ts` and `vitest.emulator.config.ts` give the tests a `demo-`
 *     project config, so the SDK is never pointed at production data.
 *  2. This setup file refuses every fetch to a Google or Firebase host, so nothing
 *     leaves the machine even when a module builds its own URL. The emulators on
 *     127.0.0.1 are not affected.
 */

const BLOCKED_HOST =
  /(^|\.)(googleapis\.com|cloudfunctions\.net|firebaseio\.com|firebasedatabase\.app|firebaseapp\.com|web\.app|run\.app)$/i;

function hostOf(input: unknown): string | null {
  try {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as { url?: string } | null)?.url;
    return raw ? new URL(raw).hostname : null;
  } catch {
    return null;
  }
}

export function isBlockedHost(host: string | null): boolean {
  return host !== null && BLOCKED_HOST.test(host);
}

const realFetch = globalThis.fetch;
if (typeof realFetch === 'function') {
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const host = hostOf(input);
    if (isBlockedHost(host)) {
      return Promise.reject(new TypeError(`tests never call ${host}`));
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
