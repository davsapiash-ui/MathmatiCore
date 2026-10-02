/**
 * The route names the teacher reads, for the reports the server writes.
 *
 * The source of truth is react-ts-version/src/core/routeLabels.ts (every
 * staff screen reads it). The functions build cannot import from the
 * frontend, so this is a copy, and `__tests__/teacherLabels.test.ts` fails
 * the moment the two differ (owner, 27.9.2026: one wording everywhere).
 * Labels only: the stored values 'green_path' and 'remediation_path' do not
 * change.
 */
export const ROUTE_NAME_HE = {
  green_path: "המסלול הירוק",
  remediation_path: "מסלול צמצום פערי קדם",
} as const;

/**
 * The three error categories of PRD Module 18, as the teacher reads them. The
 * source of truth is ERROR_CATEGORY_HE in the same frontend file, and the same
 * test keeps this copy equal to it. The stored keys ('calculation',
 * 'procedural', 'conceptual') do not change; only what the reports print.
 */
export const ERROR_CATEGORY_HE = {
  calculation: "טעות חישוב",
  procedural: "טעות בשלבי הפתרון",
  conceptual: "טעות בהבנת ערך המקום",
} as const;

/** The Hebrew name of a stored error category, or null for a key outside the three. */
export function errorCategoryHe(key: string): string | null {
  return Object.prototype.hasOwnProperty.call(ERROR_CATEGORY_HE, key)
    ? ERROR_CATEGORY_HE[key as keyof typeof ERROR_CATEGORY_HE]
    : null;
}

/**
 * Why a coaching card opened, as the teacher reads it. The source of truth is
 * TRIGGER_REASON_HE in react-ts-version/src/core/routeLabels.ts (the learner's
 * timeline reads it); `__tests__/teacherLabels.test.ts` keeps this copy equal.
 * The stored trigger_reason values do not change; only what the reports print
 * (acceptance run of 2.10.2026: the class report printed "hesitation_45s: 24").
 */
export const TRIGGER_REASON_HE = {
  hesitation_45s: "היסוס 45 שניות",
  consecutive_errors_4: "ארבע מחיקות או הקלדות שגויות רצופות",
  consecutive_undos_3: "שלושה ביטולים רצופים",
  conversion_not_performed: "לא בוצעה המרה נדרשת",
  repeated_errors: "תשובה שגויה שנייה ברצף באותו תרגיל",
} as const;

/** The Hebrew reason for a stored trigger_reason, or null for a value outside the five. */
export function triggerReasonHe(key: string): string | null {
  return Object.prototype.hasOwnProperty.call(TRIGGER_REASON_HE, key)
    ? TRIGGER_REASON_HE[key as keyof typeof TRIGGER_REASON_HE]
    : null;
}

/**
 * "trigger: count" pairs by their Hebrew names. A value outside the known set
 * (a stored report from an older client) reads "סיבה אחרת" rather than an
 * English identifier on the teacher's page.
 */
export function triggerCountsHe(map: Record<string, number> | null | undefined): string {
  return Object.entries(map ?? {}).map(([k, v]) => `${triggerReasonHe(k) ?? "סיבה אחרת"}: ${v}`).join(", ");
}

/** The same for the error categories; a key outside the three reads "סיווג אחר". */
export function errorCategoryCountsHe(map: Record<string, number> | null | undefined): string {
  return Object.entries(map ?? {}).map(([k, v]) => `${errorCategoryHe(k) ?? "סיווג אחר"}: ${v}`).join(", ");
}

/**
 * The four columns as every screen names them: "יחידות", not "אחדות" (owner,
 * 1.10.2026: one name per thing; the learner's timeline already says
 * "בטור היחידות"). Index 0 is the units.
 */
export const COLUMN_NAMES_HE = ["יחידות", "עשרות", "מאות", "אלפים"] as const;

/**
 * Why the teacher reset a meeting, as the reports print it (the "לפני האיפוס"
 * section, owner 2.10.2026). The source of truth is RESET_REASON_HE in
 * react-ts-version/src/core/routeLabels.ts, the closed list the reset dialog
 * offers; `__tests__/teacherLabels.test.ts` keeps this copy equal. Only "other"
 * is shorter here, as resetReasonHe there prints it: the dialog's
 * "(פירוט בהערה)" asks for a note, and the note is not printed in a report.
 */
export const RESET_REASON_HE = {
  technical_fault: "תקלה טכנית במכשיר או בתקשורת",
  student_stuck: "הלומד נתקע וזקוק להתחלה מחדש",
  restart_session: "פתיחה מחודשת של המפגש לכלל הכיתה",
  test_run: "הרצת בדיקה / פיילוט מבוקר",
  other: "אחר",
} as const;

/** The Hebrew reason for a stored reset_reason, or null for a value outside the list. */
export function resetReasonHe(key: string | null | undefined): string | null {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(RESET_REASON_HE, key)
    ? RESET_REASON_HE[key as keyof typeof RESET_REASON_HE]
    : null;
}

