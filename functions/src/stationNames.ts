/**
 * The station names the children see, for the reports the server writes.
 *
 * The source of truth is react-ts-version/src/core/stationNames.ts (the
 * lobby reads it). The functions build cannot import from the frontend (its
 * tsconfig compiles src/ only, and the deployed bundle has no frontend), so
 * this is a copy — and `__tests__/stationNames.test.ts` fails the moment the
 * two differ. Change a name there, then here.
 *
 * Owner decision, 27.9.2026 (register, "החלטות בעל המוצר במקום שהאפיון
 * שותק", entry ט): the teacher sees the child's station name next to every
 * meeting, so the report titles carry it too.
 */

export const STATION_NAMES_HE: Readonly<Record<number, string>> = {
  1: "ארגז החול",
  2: "יוצאים למסע",
  3: "בונים מספרים בכמה דרכים",
  4: "חיבור במאונך עם הקבצה",
  5: "חיסור במאונך עם פריטה",
  6: "אתגר האפס",
  7: "בלשי המספרים",
  8: "חוקרים בעצמנו",
};

/** The child's station name for a meeting number, or null outside 1–8. */
export function stationNameHe(n: number | null | undefined): string | null {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 8 ? STATION_NAMES_HE[n] : null;
}

/** "מפגש 7 · אצל התלמידים: בלשי המספרים"; outside 1–8, "מפגש N". */
export function meetingLabelHe(n: number | null | undefined): string {
  const name = stationNameHe(n);
  return name ? `מפגש ${n} · אצל התלמידים: ${name}` : `מפגש ${n}`;
}

/** "מפגש 7 · בלשי המספרים"; outside 1–8, "מפגש N". */
export function meetingShortLabelHe(n: number | null | undefined): string {
  const name = stationNameHe(n);
  return name ? `מפגש ${n} · ${name}` : `מפגש ${n}`;
}
