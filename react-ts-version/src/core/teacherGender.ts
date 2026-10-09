/**
 * The sentences a child reads or hears about the teacher, in both genders.
 *
 * Owner, 1.10.2026: the teacher marks once whether the children's screens speak
 * of the teacher in the feminine or in the masculine, and every sentence about
 * the teacher on the child's screens and read-aloud buttons follows. Only the
 * children's screens: the teacher's own screens keep addressing the teacher in
 * the plural ("בחרו", "לחצו"), which is right for everyone.
 *
 * The feminine is the default — it is what every child screen said before the
 * choice existed (register, Module 20 §ב: "בנקבה כמו בשאר מסכי הילד"),
 * so a class whose teacher never marks anything sees exactly what it saw.
 *
 * A child sentence that names the teacher without a gendered verb ("קראו
 * למורה", "בקשו עזרה מהמורה", "קוד הגישה שקיבלתם מהמורה") is the same in both
 * and does not belong here. A new child sentence with a gendered verb about
 * the teacher goes here, in both forms, or it ignores the teacher's choice.
 */

export type TeacherGender = 'female' | 'male';

export const DEFAULT_TEACHER_GENDER: TeacherGender = 'female';

/** The stored value, read leniently: anything but 'male' is the default. */
export function parseTeacherGender(raw: unknown): TeacherGender {
  return raw === 'male' ? 'male' : DEFAULT_TEACHER_GENDER;
}

type Gendered = Readonly<Record<TeacherGender, string>>;

export const TEACHER_SENTENCES_HE = {
  /** The toast after the silent help call. */
  helpCallReceived: { female: 'המורה יודעת 🤝', male: 'המורה יודע 🤝' },
  /** PRD 14 §ב0's second sentence: the lobby, and the workspace's quiet wait. */
  willOpenActivity: { female: 'המורה תפתח את הפעילות בקרוב.', male: 'המורה יפתח את הפעילות בקרוב.' },
  /** The pause, as a heading (workspace) and as the lobby card's line. */
  pausedTitle: { female: 'המורה עצרה את הפעילות לרגע', male: 'המורה עצר את הפעילות לרגע' },
  /**
   * PRD 14 §ב0, the pause: the workspace screen's second line (the lobby shows
   * the pause sentence alone). It names no gendered verb about the teacher, so
   * it reads the same in both forms; it stays here beside its title.
   */
  pausedBody: {
    female: 'חכו רגע. העבודה שלכם שמורה בדיוק כמו שהשארתם אותה.',
    male: 'חכו רגע. העבודה שלכם שמורה בדיוק כמו שהשארתם אותה.',
  },
  /** The teacher closed the station. */
  closedTitle: { female: 'המורה סגרה את התחנה', male: 'המורה סגר את התחנה' },
  /**
   * PRD 14 §ב0, the close: the second line for a learner who has not finished
   * the station, in every station and not only station 2 — in stations 3–8 too
   * whoever did not finish gets catch-up time. (A learner who finished sees the
   * station's own end screen instead.) The name keeps the key it was born with
   * (owner, 4.10.2026, A3-106, then meeting 2 only).
   */
  closedBodyMeeting2Unfinished: {
    female: 'העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.',
    male: 'העבודה שלכם נשמרה בבטחה. המורה יקבע איתכם מתי תמשיכו.',
  },
  /** Module 20 §ב: the wait at the end of meeting 2, until the path is approved. */
  meeting2Waiting: {
    female: 'כל הכבוד, מתמטיקאים! סיימתם את התחנה השנייה. המורה בודקת את העבודה שלכם. כשהמורה תסיים לבדוק, נמשיך.',
    male: 'כל הכבוד, מתמטיקאים! סיימתם את התחנה השנייה. המורה בודק את העבודה שלכם. כשהמורה יסיים לבדוק, נמשיך.',
  },
  /**
   * PRD 14 §ב0: the lobby's quiet waiting screen, one sentence per state
   * (core/lobbyState.ts). Station 8 finished has no gendered verb and lives in
   * lobbyState.ts (LOBBY_FINISHED_LAST_STATION_HE).
   */
  lobbyNotStarted: {
    female: 'היום עוד לא התחלנו. המורה תפתח את הפעילות בקרוב.',
    male: 'היום עוד לא התחלנו. המורה יפתח את הפעילות בקרוב.',
  },
  lobbyPaused: { female: 'המורה עצרה את הפעילות לרגע.', male: 'המורה עצר את הפעילות לרגע.' },
  lobbyClosedUnfinished: {
    female: 'העבודה שלכם נשמרה בבטחה. המורה תקבע איתכם מתי תמשיכו.',
    male: 'העבודה שלכם נשמרה בבטחה. המורה יקבע איתכם מתי תמשיכו.',
  },
  /** PRD 14 §ב0: the lobby's sentence for a learner who finished the station (stations 1–7). */
  lobbyFinished: {
    female: 'סיימתם את התחנה. כשהמורה תפתח את התחנה הבאה, נמשיך יחד.',
    male: 'סיימתם את התחנה. כשהמורה יפתח את התחנה הבאה, נמשיך יחד.',
  },
  /** The end-of-station screen's last line, under "העבודה שלכם נשמרה בבטחה." (PRD 14 §ג). */
  nextStation: {
    female: 'כשהמורה תפתח את התחנה הבאה, נמשיך יחד.',
    male: 'כשהמורה יפתח את התחנה הבאה, נמשיך יחד.',
  },
} as const satisfies Readonly<Record<string, Gendered>>;

export type TeacherSentenceKey = keyof typeof TEACHER_SENTENCES_HE;

/** The sentence `key` in the teacher's gender. */
export function teacherSentenceHe(key: TeacherSentenceKey, gender: TeacherGender): string {
  return TEACHER_SENTENCES_HE[key][gender];
}
