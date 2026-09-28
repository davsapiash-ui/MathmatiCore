// DEV-ONLY screen harness. Never imported by src, never part of `npm run build`.
// Runs the real frontend against the Firebase Emulator Suite (demo project, the
// repo's real security rules, no real credentials). See dev-harness/README.md.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'demo-mathmaticore';

/** Rewrites src/infrastructure/firebase.ts in the dev server only: emulators, and
 *  sign-in with an unsigned emulator token that carries the identity claims. */
function emulatorPlugin() {
  return {
    name: 'mc-emulator-harness',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/infrastructure/firebase.ts')) {
        const header = `import { connectAuthEmulator as __cae, signInWithCustomToken as __swct } from 'firebase/auth';\n` +
          `import { connectFirestoreEmulator as __cfe } from 'firebase/firestore';\n`;
        let out = header + code;
        out = out.replace(
          'export const functions = getFunctions(app);',
          'export const functions = getFunctions(app);\n__cfe(firestore, "127.0.0.1", 8080);'
        );
        out = out.replace(
          "export const auth = authInstance;",
          'try { __cae(authInstance, "http://127.0.0.1:9099", { disableWarnings: true }); } catch {}\nexport const auth = authInstance;'
        );
        out = out.replace(
          'signInAnonymously(authInstance)',
          '__swct(authInstance, window.localStorage.getItem("__harness_token") || "")'
        );
        // Nothing imports the database before the emulator session exists, so
        // no listener is attached (and refused) while signed out.
        out += '\nawait authReady;\n';
        return out;
      }
      if (id.endsWith('/src/application/useWorkspaceStore.ts')) {
        return code + '\n;(window as any).__ws = useWorkspaceStore;\n;(window as any).__tasks = () => getActiveTasks(useWorkspaceStore.getState());\n';
      }
      return null;
    },
  };
}

export default defineConfig({
  root,
  plugins: [emulatorPlugin(), react()],
  resolve: { alias: { '@': path.resolve(root, 'src') } },
  define: {
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(PROJECT),
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('demo-key'),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify('localhost'),
    'import.meta.env.VITE_FIREBASE_DATABASE_URL': JSON.stringify(`http://127.0.0.1:9000/?ns=${PROJECT}-default-rtdb`),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(`${PROJECT}.appspot.com`),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:1:web:demo'),
  },
  server: { port: Number(process.env.HARNESS_PORT || 5173), strictPort: true, host: '127.0.0.1' },
});
