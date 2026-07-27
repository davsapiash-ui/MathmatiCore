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
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/rrweb')) return 'rrweb';
          if (id.includes('node_modules/recharts')) return 'recharts';
          if (id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules')) return 'vendor';
        }
      }
    }
  }
} as any);
