import { stationTitleHe, type MeetingNumber } from '@/core/stationNames';

/**
 * The opening screen of every station (PRD Module 14 §ב, "מה הלומד קורא בתוך
 * מרחב העבודה"): before the first task of each station, one screen with a
 * greeting, the station's name and its goal, a read-aloud button and
 * "מתחילים", and nothing else. The texts are the PRD's, word for word; the
 * station's name comes from the lobby's own source (core/stationNames.ts), so
 * the two can never differ.
 */
export const STATION1_OPENING_HE = `שלום מתמטיקאים! ברוכים הבאים ל${stationTitleHe(1)}. בתחנה הזו נכיר את הכלים שנעבוד איתם: בית המספרים, הלבנים, כפתור ביטול הפעולה ופח האשפה. אחר כך נתרגל קצת חשבון. עבדו בקצב שלכם.`;
export const STATION2_OPENING_HE = `שלום. התחילו ב"${stationTitleHe(2)}". אין לחץ. עבדו בקצב שלכם.`;
export const STATION3_OPENING_HE = `שלום מתמטיקאים! ברוכים הבאים ל${stationTitleHe(3)}. בתחנה הזו נגלה שאפשר לבנות את אותו מספר בלבנים שונות, ונפרוט לבנים ללבנים קטנות יותר. עבדו בקצב שלכם.`;
export const STATION4_OPENING_HE = `שלום מתמטיקאים! ברוכים הבאים ל${stationTitleHe(4)}. בתחנה הזו נחבר מספרים במאונך, ונקבץ 10 לבנים בטור ללבנה אחת בטור שמשמאלו. עבדו בקצב שלכם.`;
export const STATION5_OPENING_HE = `שלום מתמטיקאים! ברוכים הבאים ל${stationTitleHe(5)}. בתחנה הזו נחסר מספרים במאונך, וכשבטור אין מספיק לבנים נפרוט לבנה מהטור שמשמאלו. עבדו בקצב שלכם.`;
export const STATION6_OPENING_HE = `שלום מתמטיקאים! ברוכים הבאים ל${stationTitleHe(6)}. בתחנה הזו נחסר ממספרים שיש בהם אפס, ונגלה איך פורטים כשטור ריק. עבדו בקצב שלכם.`;
export const STATION7_OPENING_HE = `שלום מתמטיקאים! ברוכים הבאים ל${stationTitleHe(7)}. בתחנה הזו נגלה ספרות חסרות ונמצא טעויות בתרגילים, בעזרת הלבנים. עבדו בקצב שלכם.`;
export const STATION8_OPENING_HE = `שלום מתמטיקאים! היום הגענו ל${stationTitleHe(8)}. פתרו את התרגילים בנחת ובקצב שלכם, בדיוק כמו שתרגלתם בתחנות הקודמות. בהצלחה!`;
export const STATION_START_HE = 'מתחילים';

const OPENING_HE: Readonly<Record<MeetingNumber, string>> = {
  1: STATION1_OPENING_HE,
  2: STATION2_OPENING_HE,
  3: STATION3_OPENING_HE,
  4: STATION4_OPENING_HE,
  5: STATION5_OPENING_HE,
  6: STATION6_OPENING_HE,
  7: STATION7_OPENING_HE,
  8: STATION8_OPENING_HE,
};

/** The opening text of a station, or null outside 1–8. */
export function stationOpeningHe(meeting: number): string | null {
  return OPENING_HE[meeting as MeetingNumber] ?? null;
}

/** Every station 1–8 opens with its one quiet screen (PRD Module 14 §ב). */
export function hasOpeningScreen(meeting: number): boolean {
  return stationOpeningHe(meeting) !== null;
}
