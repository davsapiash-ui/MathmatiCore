/// <reference types="vitest" />
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    cache: false,
    // `npm run test:direct` reads this file, not vitest.config.ts: the same guard
    // keeps it away from the live project (src/test/noProductionNetwork.ts).
    setupFiles: ["src/test/noProductionNetwork.ts"],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // The meeting download's offline player (meetingExport.ts): its own
          // chunk, read only when the teacher downloads a meeting.
          if (id.includes('node_modules/rrweb/dist/') && id.includes('?raw')) return 'rrweb-standalone';
          if (id.includes('node_modules/rrweb')) return 'rrweb';
          if (id.includes('node_modules/recharts')) return 'recharts';
          if (id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules')) return 'vendor';
        }
      }
    }
  }
} as any);
