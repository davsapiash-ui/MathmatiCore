import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * החלטת בעל המוצר, 23.9.2026 — פער יב במסמך הסטיות.
 *
 * דוחות וגיבויים נוצרים **בשרת**. "אין רשת אצלי" אינו התרחיש: בלי רשת אי
 * אפשר בכלל ללחוץ על הכפתור. התרחיש האמיתי הוא שהשרת אינו מצליח לכתוב
 * לדרייב — פג תוקף ההרשאה, מכסה, או תקלה ב-API של גוגל — ואז הקובץ נוצר
 * ונזרק.
 *
 * מעכשיו הוא נשמר ב-Cloud Storage וממתין שם עם קישור הורדה. גיבוי האיפוס
 * כבר נהנה מנפילה כזו; ההגנה עברה למעלה, לפונקציה שכל העלאה לדרייב עוברת
 * דרכה — הדוח האישי, דוח הכיתה, וייצוא נתוני המחקר.
 */
const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');

describe('קובץ שהדרייב דחה אינו נזרק', () => {
  it('יש נתיב נפילה לאחסון, עם קישור חתום', () => {
    expect(src).toContain('export async function uploadBufferToFallbackStorage(');
    expect(src).toContain('admin.storage().bucket().file(storagePath)');
    expect(src).toContain('action: "read"');
  });

  it('כל שלושת מסלולי הכישלון של הדרייב עוברים דרכו', () => {
    const fn = src.slice(src.indexOf('export async function uploadBufferToDrive('), src.indexOf('export const VALID_RESET_REASONS'));
    // אין אסימון; ה-API החזיר שגיאה; חריגה בזמן הקריאה.
    expect(fn).toContain("return await parkInStorage('Google Drive access token unavailable');");
    expect(fn).toContain('return await parkInStorage(`Drive API ${response.status}: ${errText}`);');
    expect(fn).toContain('return await parkInStorage(err?.message || String(err));');
    // ולא נשאר שום מסלול שמחזיר כישלון בלי להציל את הקובץ.
    expect(fn).not.toContain("return { success: false, fileId: '', webViewLink: '', error: `Drive API");
  });

  it('שגיאת הדרייב נשמרת על הקובץ, כדי שיהיה ברור למה הוא שם', () => {
    expect(src).toContain('drive_error: driveError.slice(0, 500)');
  });

  it('ייצוא המחקר מדווח על הקבצים הממתינים ואינו מכריז כישלון כשהם קיימים', () => {
    expect(src).toContain('const parked: Array<{ name: string; url: string | null; path: string }> = [];');
    expect(src).toContain('if (uploadedIds.length === 0 && parked.length === 0) {');
    expect(src).toContain('parked_files: parked.map((p) => p.path),');
    expect(src).toContain('"SUCCESS_STORAGE_ONLY"');
  });

  it('גיבוי האיפוס שומר את נפילת האחסון שהייתה לו', () => {
    expect(src).toContain('const storagePath = `backups/${class_id}/${resetId}.json`;');
  });
});
