import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * חוקי האבטחה האמיתיים מול אמולטור Firebase — לא קריאת טקסט של קובץ החוקים,
 * אלא מנוע החוקים עצמו, עם אסימון אמיתי של תלמיד, מורה ומנהל.
 *
 * רץ בנפרד מ-`npm test` כי הוא דורש אמולטור חי:
 *   npm run test:rules
 *
 * זה הדבר הקרוב ביותר להליכה חיה שאפשר לעשות בלי להתחבר לחשבון: כל כתיבה
 * וקריאה כאן נבדקות בדיוק באותו קוד שירוץ בייצור.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/emulator/**/*.test.ts'],
    cache: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
