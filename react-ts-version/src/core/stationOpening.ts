import { stationTitleHe } from '@/core/stationNames';

/**
 * The opening screen of station 2 and of station 8: the words the child reads
 * before the first task (owner, 27.9.2026; register, approved deviation 24).
 * The station's name comes from the lobby's own source.
 */
export const STATION2_OPENING_HE = `שלום. התחילו ב"${stationTitleHe(2)}". אין לחץ. עבדו בקצב שלכם.`;
export const STATION8_OPENING_HE = `שלום מתמטיקאים! היום הגענו ל${stationTitleHe(8)}. פתרו את התרגילים בנחת ובקצב שלכם, בדיוק כמו שתרגלתם בתחנות הקודמות. בהצלחה!`;
export const STATION_START_HE = 'מתחילים';

const OPENING_HE: Readonly<Record<number, string>> = { 2: STATION2_OPENING_HE, 8: STATION8_OPENING_HE };

/** The opening text of a meeting, or null for a meeting that opens straight on its first task. */
export function stationOpeningHe(meeting: number): string | null {
  return OPENING_HE[meeting] ?? null;
}

/** Stations 2 and 8 open with one quiet screen; the others do not. */
export function hasOpeningScreen(meeting: number): boolean {
  return stationOpeningHe(meeting) !== null;
}
