import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    // האמולטור רץ בנפרד: npm run test:rules (vitest.emulator.config.ts).
    exclude: ['src/__tests__/emulator/**'],
    cache: false,
    // הבדיקות לעולם לא פונות לפרויקט החי: `.env.test` נותן להן פרויקט הדגמה,
    // והקובץ הזה חוסם כל פנייה לשרתי Google ו-Firebase.
    setupFiles: ['src/test/noProductionNetwork.ts'],
  },
});
