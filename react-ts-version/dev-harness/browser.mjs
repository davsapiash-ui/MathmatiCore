// DEV-ONLY. Opens the harness app in headless Chromium as student 12 (or the
// teacher), with the identity set directly in the emulator: an unsigned token
// the Auth emulator accepts, carrying the claims the real rules check.
import { chromium } from '@playwright/test';

export const APP = process.env.HARNESS_APP || 'http://127.0.0.1:5173';

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }

/** An unsigned custom token — accepted only by the Auth emulator. */
export function emulatorToken(uid, claims) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 3600, iss: 'harness@demo', sub: 'harness@demo', uid, claims,
  })}.`;
}

export const STUDENT = {
  uid: 'student_user12',
  claims: { role: 'student', student_id: 12 },
  user: { uid: 'student_user12', student_id: 12, role: 'student', school_id: 'school_bikorot', class_name: 'המבקרים', class_type: 'כיתת ביקורת' },
  role: 'student',
};

export async function openAs(who = STUDENT, { width = 1366, height = 768, headless = true } = {}) {
  const browser = await chromium.launch({ headless, executablePath: process.env.CHROMIUM || undefined });
  const context = await browser.newContext({ viewport: { width, height }, locale: 'he-IL' });
  const token = emulatorToken(who.uid, who.claims);
  await context.addInitScript(([tok, user, role]) => {
    const now = String(Date.now());
    localStorage.setItem('__harness_token', tok);
    if (!sessionStorage.getItem('__harness_seeded')) {
      sessionStorage.setItem('__harness_seeded', '1');
      localStorage.setItem('mc_auth_user', JSON.stringify(user));
      localStorage.setItem('mc_auth_role', role);
      localStorage.setItem('mc_auth_time', now);
      localStorage.setItem('mc_student_last_active', now);
      localStorage.removeItem('mc_student_window_closed');
    }
  }, [token, who.user, who.role]);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  // Sign in once on the landing page, so the emulator session is already in
  // IndexedDB when the student surfaces attach their listeners (as it is for a
  // child who signed in on the login screen).
  await page.goto(APP + '/');
  await page.waitForFunction(() => new Promise((res) => {
    const req = indexedDB.open('firebaseLocalStorageDb');
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction('firebaseLocalStorage', 'readonly');
        const all = tx.objectStore('firebaseLocalStorage').getAll();
        all.onsuccess = () => res(all.result.length > 0);
        all.onerror = () => res(false);
      } catch { res(false); }
    };
    req.onerror = () => res(false);
  }), null, { timeout: 30000, polling: 500 });
  return { browser, context, page };
}
