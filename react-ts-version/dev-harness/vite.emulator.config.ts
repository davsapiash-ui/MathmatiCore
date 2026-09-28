/**
 * DEV ONLY. Runs the real frontend against the Firebase Emulator Suite:
 *   ./dev-harness/start-emulators.sh
 *   npx vite --config dev-harness/vite.emulator.config.ts --port 5180
 * The only difference from vite.config.ts is that "@/infrastructure/firebase"
 * resolves to dev-harness/firebase.emulator.ts. Nothing in src imports this
 * folder, and the production build (vite.config.ts) never sees it.
 */
import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(__dirname, '..'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/infrastructure\/firebase$/, replacement: path.resolve(__dirname, 'firebase.emulator.ts') },
      { find: '@', replacement: path.resolve(__dirname, '../src') },
    ],
  },
  server: { host: '127.0.0.1' },
});
