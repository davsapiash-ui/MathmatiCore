/**
 * DEV ONLY — never used by `npm run build` and never imported by src/.
 *
 * Runs the real frontend against the Firebase Emulator Suite (demo project, the
 * repository's real security rules, no credentials). It rewrites nothing on
 * disk: a Vite transform, applied only by this config, adds the emulator
 * connections to src/infrastructure/firebase.ts and replaces the anonymous
 * sign-in with an unsigned emulator custom token carrying the claims found in
 * localStorage "harness_claims" (student 12, teacher or admin). See README.md.
 */
import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const harnessFirebase: Plugin = {
  name: 'harness-firebase-emulators',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('/src/infrastructure/firebase.ts')) return null;
    const head = [
      "import { connectAuthEmulator as __cae, signInWithCustomToken as __swct } from 'firebase/auth';",
      "import { connectDatabaseEmulator as __cde } from 'firebase/database';",
      "import { connectFirestoreEmulator as __cfe } from 'firebase/firestore';",
      'function __harnessSignIn(a) {',
      "  const raw = localStorage.getItem('harness_claims');",
      '  if (!raw) return signInAnonymously(a);',
      '  const claims = JSON.parse(raw);',
      "  const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');",
      '  const now = Math.floor(Date.now() / 1000);',
      "  const iss = 'harness@demo-mathmaticore.iam.gserviceaccount.com';",
      "  const token = b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ iss, sub: iss, aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 3600, uid: claims.__uid, claims }) + '.';",
      '  return __swct(a, token);',
      '}',
    ].join('\n');
    let out = code
      .replace('export const functions = getFunctions(app);', "export const functions = getFunctions(app);\n__cde(database, '127.0.0.1', 9000);\n__cfe(firestore, '127.0.0.1', 8080);")
      .replace('authInstance = getAuth(app);', "authInstance = getAuth(app);\n  __cae(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });")
      .replace('signInAnonymously(authInstance)\n', '__harnessSignIn(authInstance)\n');
    if (out === code || !out.includes('__harnessSignIn(authInstance)') || !out.includes('__cde(') || !out.includes('__cae(')) {
      throw new Error('harness: src/infrastructure/firebase.ts changed shape; update dev-harness/vite.harness.config.ts');
    }
    out = head + '\n' + out;
    return { code: out, map: null };
  },
};

export default defineConfig({
  root: path.resolve(__dirname, '..'),
  plugins: [harnessFirebase, react()],
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  css: { postcss: path.resolve(__dirname, '..') },
  server: { port: 5199, strictPort: true },
});
