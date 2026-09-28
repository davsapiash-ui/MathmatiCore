// Harness only — lives in the scratchpad, never in the repo or the production build.
// Serves the real frontend (root = the checkout passed in APP_ROOT) against the
// Firebase Emulator Suite with a demo project and no real credentials.
import path from "path";
import { createRequire } from "module";
const APP_ROOT = process.env.APP_ROOT;
const require = createRequire(path.join(APP_ROOT, "package.json"));
const react = require("@vitejs/plugin-react").default;

process.env.VITE_FIREBASE_API_KEY = "demo-key";
process.env.VITE_FIREBASE_AUTH_DOMAIN = "demo-mathmaticore.firebaseapp.com";
process.env.VITE_FIREBASE_DATABASE_URL = "http://127.0.0.1:9000?ns=demo-mathmaticore-default-rtdb";
process.env.VITE_FIREBASE_PROJECT_ID = "demo-mathmaticore";
process.env.VITE_FIREBASE_STORAGE_BUCKET = "demo-mathmaticore.appspot.com";
process.env.VITE_FIREBASE_APP_ID = "1:0:web:0";

const emulatorPlugin = {
  name: "harness-emulators",
  enforce: "pre",
  transform(code, id) {
    if (!id.replace(/\\/g, "/").endsWith("src/infrastructure/firebase.ts")) return null;
    const head = `import { connectAuthEmulator as __cAE, signInWithCustomToken as __sIWCT } from 'firebase/auth';
import { connectFirestoreEmulator as __cFE, doc as __doc, getDoc as __getDoc, collection as __col, getDocs as __getDocs, updateDoc as __updateDoc } from 'firebase/firestore';
import { connectDatabaseEmulator as __cDE, ref as __ref, get as __get, set as __set, update as __update } from 'firebase/database';
`;
    const hook = `export const auth = authInstance;
__cAE(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
__cFE(firestore, '127.0.0.1', 8080);
__cDE(database, '127.0.0.1', 9000);
if (window.location.hostname !== 'localhost') connectFunctionsEmulator(functions, '127.0.0.1', 5001);
window.__harness = { auth: authInstance, database, firestore, signIn: (t) => __sIWCT(authInstance, t),
  rtdb: { ref: __ref, get: __get, set: __set, update: __update },
  fs: { doc: __doc, getDoc: __getDoc, collection: __col, getDocs: __getDocs, updateDoc: __updateDoc } };
`;
    if (!code.includes("export const auth = authInstance;")) throw new Error("harness hook point moved");
    return head + code.replace("export const auth = authInstance;", hook);
  },
};

export default {
  root: APP_ROOT,
  plugins: [emulatorPlugin, react()],
  resolve: { alias: { "@": path.join(APP_ROOT, "src") } },
  server: { host: "127.0.0.1", port: Number(process.env.PORT || 5173), strictPort: true },
};
