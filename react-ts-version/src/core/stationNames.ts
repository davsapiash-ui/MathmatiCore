/**
 * The name each meeting carries on the children's lobby card, and the one
 * place every other screen reads it from.
 *
 * Owner decision, 27.9.2026 (register, "החלטות בעל המוצר במקום שהאפיון
 * שותק"): the child meets each station under a name in the child's own
 * language, with no educator words, percentages, scores or rankings. The
 * teacher and the admin see that same name next to every meeting, so what the
 * teacher says in class is what the children read on the screen. The formal
 * meeting name may stay beside it on staff screens; it never replaces it.
 *
 * Change a name here and the lobby, the teacher's dashboard, the learner
 * journey and the admin catalog all follow. There is no second copy.
 */

export type MeetingNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const MEETING_NUMBERS: readonly MeetingNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** The station name the children see, without the "תחנה N:" prefix. */
export const STATION_NAMES_HE: Readonly<Record<MeetingNumber, string>> = {
  1: 'ארגז החול',
  2: 'יוצאים למסע',
  3: 'בונים מספרים בכמה דרכים',
  4: 'חיבור במאונך עם הקבצה',
  5: 'חיסור במאונך עם פריטה',
  6: 'אתגר האפס',
  7: 'בלשי המספרים',
  8: 'חוקרים בעצמנו',
};

function isMeetingNumber(n: number | null | undefined): n is MeetingNumber {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 8;
}

/** The child's station name for a meeting number, or null outside 1–8. */
export function stationNameHe(n: number | null | undefined): string | null {
  return isMeetingNumber(n) ? STATION_NAMES_HE[n] : null;
}

/** The lobby card title the child reads: "תחנה 7: בלשי המספרים". */
export function stationTitleHe(n: MeetingNumber): string {
  return `תחנה ${n}: ${STATION_NAMES_HE[n]}`;
}

/**
 * The meeting as a teacher or an admin sees it:
 * "מפגש 7 · אצל התלמידים: בלשי המספרים". Outside 1–8, just "מפגש N".
 */
export function meetingLabelHe(n: number | null | undefined): string {
  const name = stationNameHe(n);
  return name ? `מפגש ${n} · אצל התלמידים: ${name}` : `מפגש ${n}`;
}

/**
 * The short form, for a button or a tile where the full label does not fit:
 * "מפגש 7 · בלשי המספרים". The child's name stays visible.
 */
export function meetingShortLabelHe(n: number | null | undefined): string {
  const name = stationNameHe(n);
  return name ? `מפגש ${n} · ${name}` : `מפגש ${n}`;
}
