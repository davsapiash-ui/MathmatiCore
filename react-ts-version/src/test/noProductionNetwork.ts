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
 * Three layers, each loaded before any test file imports the app:
 *  1. `.env.test` (read by Vite in test mode only) gives the app a `demo-` project
 *     config, and its Realtime Database URL is 127.0.0.1.
 *  2. Firestore does not use fetch (it speaks gRPC), so it is pointed at
 *     127.0.0.1:8080 here, through the defaults every Firebase SDK reads at
 *     getFirestore(). With no emulator running, the connection is refused locally.
 *  3. Every fetch to a Google or Firebase host is refused (Auth, Cloud Functions,
 *     and anything that builds its own URL).
 * Together nothing leaves the machine. The emulators on 127.0.0.1 used by
 * `npm run test:rules` are not affected.
 */

type FirebaseDefaults = { emulatorHosts?: Record<string, string> } & Record<string, unknown>;
const holder = globalThis as unknown as { __FIREBASE_DEFAULTS__?: FirebaseDefaults };
holder.__FIREBASE_DEFAULTS__ = {
  ...holder.__FIREBASE_DEFAULTS__,
  emulatorHosts: { ...holder.__FIREBASE_DEFAULTS__?.emulatorHosts, firestore: '127.0.0.1:8080' },
};

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
