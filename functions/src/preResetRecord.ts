import { COLUMN_NAMES_HE, resetReasonHe } from "./teacherLabels";
import { isExerciseEvent, type MeetingReset, type MeetingRuns } from "./meetingMetrics";

/**
 * "לפני האיפוס": what the learner did in a meeting before it was last reset.
 *
 * Owner, 2.10.2026, word for word: "אני כן רוצה אבל שיהיה תיעוד איפה היו
 * טעויות בלי הורדת ציונים". After a reset every report scores the new run only
 * (meetingMetrics.splitMeetingRuns); this record keeps where the learner went
 * wrong before it — which exercise, which column, what kind of mistake — with
 * when the meeting was reset and why. It is printed apart, and nothing in it
 * enters a score, a working group or the exercise table.
 */

export const PRE_RESET_HEADING_HE = "לפני האיפוס";

export const PRE_RESET_NOTE_HE =
  "תיעוד בלבד: הטעויות שלפני האיפוס לא נכנסות לציון ולא משנות את קבוצת העבודה. כל שאר חלקי הדוח מחושבים רק מהעבודה שאחרי האיפוס.";

export const PRE_RESET_NO_MISTAKES_HE = "לפני האיפוס לא נרשמו טעויות, מחיקות או ביטולים.";

/** Where the learner went wrong in one exercise before the reset. */
export interface PreResetExercise {
  exercise_id: string;
  /** Wrong digits per column: units, tens, hundreds, thousands. */
  wrong_digits_by_column: [number, number, number, number];
  /** Wrong digits whose column was not recorded. */
  wrong_digits_no_column: number;
  /** Digits deleted per column, and without a column. */
  deletions_by_column: [number, number, number, number];
  deletions_no_column: number;
  undos: number;
  /** A wrong answer chosen in a coaching card. */
  wrong_card_choices: number;
  completed: boolean;
  line_he: string;
}

export interface PreResetRecord {
  resets: Array<MeetingReset & { line_he: string }>;
  /** Events before the last reset. */
  events: number;
  /** The exercises with at least one mistake, deletion or undo, in the order the learner met them. */
  exercises: PreResetExercise[];
  /** Ready to print, in order: the resets, then one line per exercise (or that there was nothing). */
  lines_he: string[];
  /** One short line for the class report. */
  class_note_he: string;
}

/**
 * "לפני האיפוס" in the class report: one line per learner whose meeting was
 * reset — the learners with a row, then those who have not worked on the
 * meeting again. Empty when no learner's meeting was reset.
 */
export function classPreResetNotes(report: Record<string, any>): string[] {
  const out: string[] = [];
  const rows: Array<Record<string, any>> = Array.isArray(report.learners) ? report.learners : [];
  for (const r of rows) {
    const note = r?.pre_reset?.class_note_he;
    if (typeof note === "string" && note) out.push(`תלמיד ${r.student_id}: ${note}`);
  }
  const waiting: Array<Record<string, any>> = Array.isArray(report.awaiting_rerun) ? report.awaiting_rerun : [];
  for (const w of waiting) {
    const note = typeof w?.pre_reset?.class_note_he === "string" ? ` ${w.pre_reset.class_note_he}` : "";
    out.push(`תלמיד ${w.student_id}: ${AWAITING_RERUN_HE}${note}`);
  }
  return out;
}

export const AWAITING_RERUN_HE = "עוד לא עבד על המפגש מחדש, ולכן אין לו ציון במפגש הזה.";

/** When the reset log cannot be read, no report: it would count the whole history (review of PR #209). */
export const RESET_LOG_UNAVAILABLE_HE = "לא ניתן לקרוא כרגע את יומן האיפוסים, ולכן הדוח לא הופק. נסו שוב בעוד כמה דקות.";

/** "תלמיד 4" / "תלמידים 4 ו-6" / "תלמידים 4, 6 ו-9". */
function learnersHe(ids: number[]): string {
  const sorted = [...ids].sort((a, b) => a - b);
  if (sorted.length === 1) return `תלמיד ${sorted[0]}`;
  return `תלמידים ${sorted.slice(0, -1).join(", ")} ו-${sorted[sorted.length - 1]}`;
}

/**
 * The class report has nothing to analyse: the meeting was reset for some
 * learners and they have not worked on it again, and the others have no
 * events in it at all. Both facts, so the sentence is true for each learner.
 */
export function nothingToAnalyseAfterResetHe(sessionNumber: number, awaiting: number[]): string {
  const who = awaiting.length === 1 ? "והוא עוד לא עבד עליו מחדש" : "והם עוד לא עבדו עליו מחדש";
  const others = awaiting.length < 12 ? " לשאר התלמידים אין פעולות מתועדות במפגש הזה." : "";
  return `אין עדיין מה לנתח במפגש ${sessionNumber}. המפגש אופס ל${learnersHe(awaiting)}, ${who}.${others}`;
}

/** "פעם אחת", "פעמיים", "3 פעמים" — as the exercise narrative counts. */
function timesHe(n: number): string {
  return n === 1 ? "פעם אחת" : n === 2 ? "פעמיים" : `${n} פעמים`;
}

/** Israel's date and time of a server timestamp: "2.10.2026", "14:05". */
export function israelDateTimeHe(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  return {
    date: d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

/**
 * What was reset, in one wording for every screen and report: "המפגש אופס"
 * (the learner journey's separator row says the same).
 */
export function resetWhatHe(scope: MeetingReset["scope"]): string {
  return scope === "active_session"
    ? "המפגש אופס"
    : scope === "full_student"
      ? "כל העבודה של התלמיד אופסה"
      : "המערכת אופסה";
}

export function resetLineHe(r: MeetingReset): string {
  const { date, time } = israelDateTimeHe(r.at);
  const reason = resetReasonHe(r.reason);
  return `${resetWhatHe(r.scope)} ב-${date} בשעה ${time}.${reason ? ` הסיבה: ${reason}.` : ""}`;
}

const column = (i: number) => (i >= 0 && i < 4 ? i : -1);

function exerciseLineHe(ex: Omit<PreResetExercise, "line_he">, title: string): string {
  const parts: string[] = [];
  ex.wrong_digits_by_column.forEach((n, i) => {
    if (n > 0) parts.push(`ספרה שגויה בטור ה${COLUMN_NAMES_HE[i]} (${timesHe(n)})`);
  });
  if (ex.wrong_digits_no_column > 0) parts.push(`ספרה שגויה (${timesHe(ex.wrong_digits_no_column)})`);
  if (ex.wrong_card_choices > 0) parts.push(`בחירה שגויה בכרטיס החניכה (${timesHe(ex.wrong_card_choices)})`);
  ex.deletions_by_column.forEach((n, i) => {
    if (n > 0) parts.push(`מחיקת ספרה בטור ה${COLUMN_NAMES_HE[i]} (${timesHe(n)})`);
  });
  if (ex.deletions_no_column > 0) parts.push(`מחיקת ספרה (${timesHe(ex.deletions_no_column)})`);
  if (ex.undos > 0) parts.push(`ביטול פעולה (${timesHe(ex.undos)})`);
  return `${title}: ${parts.join(", ")}. ${ex.completed ? "התרגיל הושלם לפני האיפוס." : "התרגיל לא הושלם לפני האיפוס."}`;
}

/** "3 ספרות שגויות" / "ספרה שגויה אחת" and the like, for the class note. */
function countHe(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

/**
 * The record of one learner's meeting, or null when nothing happened in it
 * before its last reset (no reset, or a reset before the learner started it).
 */
export function buildPreResetRecord(runs: MeetingRuns, titles: Record<string, string> = {}): PreResetRecord | null {
  if (runs.beforeReset.length === 0 || runs.resets.length === 0) return null;
  // A reset of the whole learner before this meeting was started cut nothing here.
  const resets = runs.resets.filter((r) => runs.firstWrittenAtMs === null || r.at >= runs.firstWrittenAtMs);
  const shown = resets.length > 0 ? resets : [runs.resets[runs.resets.length - 1]];

  const byExercise = new Map<string, Omit<PreResetExercise, "line_he">>();
  for (const ev of runs.beforeReset) {
    const exId = String(ev?.exercise_id || "");
    if (!exId || !isExerciseEvent(ev)) continue;
    let ex = byExercise.get(exId);
    if (!ex) {
      ex = {
        exercise_id: exId,
        wrong_digits_by_column: [0, 0, 0, 0],
        wrong_digits_no_column: 0,
        deletions_by_column: [0, 0, 0, 0],
        deletions_no_column: 0,
        undos: 0,
        wrong_card_choices: 0,
        completed: false,
      };
      byExercise.set(exId, ex);
    }
    const col = typeof ev.column_index === "number" ? column(ev.column_index) : -1;
    switch (ev.event_type) {
      case "DIGIT_ENTERED":
        if (ev.details?.is_correct === false) {
          if (col >= 0) ex.wrong_digits_by_column[col]++;
          else ex.wrong_digits_no_column++;
        }
        break;
      case "DIGIT_DELETED":
        if (col >= 0) ex.deletions_by_column[col]++;
        else ex.deletions_no_column++;
        break;
      case "UNDO_EXECUTED": ex.undos++; break;
      case "SOCRATIC_OPTION_SELECTED": if (ev.details?.is_correct === false) ex.wrong_card_choices++; break;
      case "PROBLEM_COMPLETE": ex.completed = true; break;
      default: break;
    }
  }
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const exercises: PreResetExercise[] = [];
  for (const ex of byExercise.values()) {
    const marks = sum(ex.wrong_digits_by_column) + ex.wrong_digits_no_column + sum(ex.deletions_by_column) +
      ex.deletions_no_column + ex.undos + ex.wrong_card_choices;
    if (marks === 0) continue;
    exercises.push({ ...ex, line_he: exerciseLineHe(ex, titles[ex.exercise_id] ?? ex.exercise_id) });
  }

  const resetEntries = shown.map((r) => ({ ...r, line_he: resetLineHe(r) }));
  const lines = [
    ...resetEntries.map((r) => r.line_he),
    ...(exercises.length > 0 ? exercises.map((e) => e.line_he) : [PRE_RESET_NO_MISTAKES_HE]),
  ];

  // The class report's short line: when, why, and how many of each mistake.
  const last = shown[shown.length - 1];
  const { date, time } = israelDateTimeHe(last.at);
  const reason = resetReasonHe(last.reason);
  const when = shown.length === 1
    ? `${resetWhatHe(last.scope)} ב-${date} בשעה ${time}${reason ? ` (${reason})` : ""}.`
    : `המפגש אופס ${shown.length} פעמים. האיפוס האחרון: ${date} בשעה ${time}${reason ? ` (${reason})` : ""}.`;
  const wrongByColumn = [0, 1, 2, 3].map((i) => sum(exercises.map((e) => e.wrong_digits_by_column[i])));
  const wrong = sum(wrongByColumn) + sum(exercises.map((e) => e.wrong_digits_no_column));
  const cards = sum(exercises.map((e) => e.wrong_card_choices));
  const deletions = sum(exercises.map((e) => sum(e.deletions_by_column) + e.deletions_no_column));
  const undos = sum(exercises.map((e) => e.undos));
  const parts: string[] = [];
  if (wrong > 0) {
    const where = wrongByColumn
      .map((n, i) => (n > 0 ? `${n} בטור ה${COLUMN_NAMES_HE[i]}` : ""))
      .filter(Boolean);
    parts.push(`${countHe(wrong, "ספרה שגויה אחת", "ספרות שגויות")}${where.length > 0 ? ` (${where.join(", ")})` : ""}`);
  }
  if (cards > 0) parts.push(countHe(cards, "בחירה שגויה אחת בכרטיס החניכה", "בחירות שגויות בכרטיס החניכה"));
  if (deletions > 0) parts.push(countHe(deletions, "מחיקה אחת", "מחיקות"));
  if (undos > 0) parts.push(countHe(undos, "ביטול אחד", "ביטולים"));
  const classNote = parts.length === 0
    ? `${when} ${PRE_RESET_NO_MISTAKES_HE}`
    : `${when} לפני האיפוס: ${parts.join(", ")}, ${exercises.length === 1 ? "בתרגיל אחד" : `ב-${exercises.length} תרגילים`}.`;

  return {
    resets: resetEntries,
    events: runs.beforeReset.length,
    exercises,
    lines_he: lines,
    class_note_he: classNote,
  };
}
