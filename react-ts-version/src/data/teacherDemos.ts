import type { Place, PlaceCounts } from '@/core/placeValue';
import type { TaskChoice } from './sessionTasks';
import { S4_ADD, S5_SUB, S6_SUB } from './taskBuilders';

/**
 * The teacher's demonstration exercises (PRD Module 15 §ג, "מסך ההדגמה של
 * המורה"; numbers decided by the owner on 9.10.2026). One demonstration per
 * station, shared by both learning paths, in the number range of מסלול צמצום
 * פערי קדם, with numbers that differ from every exercise the learners get.
 *
 * Fixed here on purpose: these are not learner exercises. They are not in the
 * curriculum catalogue or in sessionTasks.ts, nothing checks them, and nothing
 * of a demonstration is recorded. The teacher performs every action herself;
 * the expected numbers below are for the tests (and for her), never shown as
 * a verdict on the screen.
 *
 * Stations 2 and 8 have no demonstration (מסמכים 02 ו-03).
 */

export type DemoStation = 3 | 4 | 5 | 6 | 7;

/** One free result box (station 3 and station 7's board exercise), as the learners' representation exercises. */
export interface DemoBuildBody {
  kind: 'build';
  /** The number the teacher writes in the result row. */
  answer: number;
  /** The blocks on the board when she writes it. */
  finalCounts: Partial<PlaceCounts>;
}

/** The vertical sheet of stations 4–7, with its result row and memory circles. */
export interface DemoVerticalBody {
  kind: 'vertical';
  a: number;
  b: number;
  isSubtraction: boolean;
  /** a + b or a − b. */
  answer: number;
  /** Skeleton exercise: digits of the first number the teacher finds and types. */
  hiddenA?: Place[];
  /** Skeleton exercise: digits of the result shown fixed (the rest are boxes). */
  revealedResult?: Place[];
  /** What the memory circles hold at the end, column by column. */
  memoryCircles: Partial<Record<Place, string>>;
}

/**
 * A multiple-choice exercise, drawn as the green path's choice exercise of the
 * station (s4_g_t7, SmallChangeTask): a solved exercise, a question, three
 * options. The teacher selects one; nothing is checked.
 */
export interface DemoChoiceBody {
  kind: 'choice';
  /** The solved exercise: a + b = given. */
  a: number;
  b: number;
  /** The changed second number, and the result it gives. */
  changedB: number;
  givenHe: string;
  questionHe: string;
  choices: TaskChoice[];
}

export type DemoBody = DemoBuildBody | DemoVerticalBody | DemoChoiceBody;

export interface TeacherDemoPart {
  id: string;
  /** The part switch's label; null where the station has one demonstration. */
  partLabelHe: string | null;
  /** The task zone's heading topic, in the words of the learners' topics (core/taskGuide.ts). */
  topicHe: string;
  /** The instruction on the card, in the style of the station's learner exercises. */
  instructionHe: string;
  body: DemoBody;
  /**
   * The board at the moment the example coaching card speaks of ("דוגמה לכרטיס
   * החניכה"): the card is the station's static card for this exercise and this
   * board (SocraticEngine), so the teacher shows the card a learner gets at the
   * station's core step, the same card every time.
   */
  coachingBoard: Partial<PlaceCounts>;
}

export const TEACHER_DEMOS: Record<DemoStation, TeacherDemoPart[]> = {
  3: [
    {
      id: 'demo_s3_a',
      partLabelHe: 'חלק א',
      topicHe: 'פורטים לבנים',
      instructionHe:
        'בנו בבית המספרים את המספר 350. פרטו לבנת מאה אחת לעשר לבני עשרת. כתבו בשורת התוצאה איזה מספר מייצגות הלבנים עכשיו.',
      // 3 hundreds and 5 tens; a hundred broken into ten tens: 2 hundreds and 15 tens, still 350.
      body: { kind: 'build', answer: 350, finalCounts: { hundreds: 2, tens: 15 } },
      // 350 built, before the break.
      coachingBoard: { hundreds: 3, tens: 5 },
    },
    {
      id: 'demo_s3_b',
      partLabelHe: 'חלק ב',
      topicHe: 'קוראים וכותבים מספרים',
      instructionHe: 'בנו בבית המספרים את המספר ארבע מאות ושבע. כתבו אותו בספרות בשורת התוצאה.',
      body: { kind: 'build', answer: 407, finalCounts: { hundreds: 4, units: 7 } },
      // 407 built, before it is written.
      coachingBoard: { hundreds: 4, units: 7 },
    },
  ],
  4: [
    {
      id: 'demo_s4',
      partLabelHe: 'תרגיל במאונך',
      topicHe: 'מחברים במאונך',
      // One grouping, in the units (8 + 6 = 14): the memory circle over the tens gets 1.
      instructionHe: S4_ADD('238 + 146'),
      body: { kind: 'vertical', a: 238, b: 146, isSubtraction: false, answer: 384, memoryCircles: { tens: '1' } },
      // Both numbers built: 14 unit blocks, before the grouping.
      coachingBoard: { hundreds: 3, tens: 7, units: 14 },
    },
    {
      // ★ chosen (owner, 9.10.2026: "תשובות לבחירה" in the demonstration of
      // station 4; numbers chosen here, checked by the pedagogy gate). Drawn as
      // the green path's s4_g_t7. 238 + 146 = 384 groups in the units only;
      // 238 + 186 groups in the units (8 + 6 = 14) and in the tens
      // (3 + 8 + 1 = 12): 424. The wrong options are the two forgotten carries:
      // the tens' 1 into the hundreds (324) and the units' 1 into the tens (414).
      // None of these numbers is in a learner exercise (TeacherDemos_Arithmetic.test.ts).
      id: 'demo_s4_choice',
      partLabelHe: 'תשובות לבחירה',
      topicHe: 'מחברים במאונך',
      instructionHe: 'השוו בין שני תרגילים קרובים וגלו כיצד המרה בטור העשרות משפיעה על הטורים הבאים.',
      body: {
        kind: 'choice',
        a: 238,
        b: 146,
        changedB: 186,
        givenHe: '238 + 146 = 384',
        questionHe: 'מחליפים רק את ספרת העשרות של המחובר השני: 238 + 186. מה ישתנה?',
        choices: [
          { id: 'א', textHe: 'תיווסף המרה גם בטור העשרות, ההמרה בטור היחידות תישאר, והתוצאה תהיה 424', correct: true },
          { id: 'ב', textHe: 'רק ספרת העשרות בתוצאה תשתנה, והתוצאה תהיה 324' },
          { id: 'ג', textHe: 'ההמרה בטור היחידות תיעלם, והתוצאה תהיה 414' },
        ],
      },
      coachingBoard: {},
    },
  ],
  5: [
    {
      id: 'demo_s5',
      partLabelHe: null,
      topicHe: 'מחסרים במאונך',
      // One break, a ten into the units: 6 tens, 14 units.
      instructionHe: S5_SUB('74 − 38', 74, 38),
      body: { kind: 'vertical', a: 74, b: 38, isSubtraction: true, answer: 36, memoryCircles: { tens: '6', units: '14' } },
      // 74 built, before anything is taken away.
      coachingBoard: { tens: 7, units: 4 },
    },
  ],
  6: [
    {
      id: 'demo_s6',
      partLabelHe: null,
      topicHe: 'מחסרים במאונך',
      // A double break through the zero in the tens: 6 hundreds, 9 tens, 10 units.
      instructionHe: S6_SUB('700 − 234', 700, 234),
      body: {
        kind: 'vertical',
        a: 700,
        b: 234,
        isSubtraction: true,
        answer: 466,
        memoryCircles: { hundreds: '6', tens: '9', units: '10' },
      },
      // 700 built, before anything is taken away.
      coachingBoard: { hundreds: 7 },
    },
  ],
  7: [
    {
      id: 'demo_s7_a',
      partLabelHe: 'דוגמה א',
      topicHe: 'מגלים מה חסר',
      // 2▢3 + 134 = 35▢: the units give 3 + 4 = 7, then the tens ▢ + 3 = 5, so 223 + 134 = 357.
      instructionHe:
        'בתרגיל 2▢3 + 134 = 35▢ חסרות ספרת העשרות של המחובר הראשון וספרת היחידות בשורת התוצאה. גלו אותן בעזרת הלבנים וכתבו אותן בתיבות הריקות.',
      body: {
        kind: 'vertical',
        a: 223,
        b: 134,
        isSubtraction: false,
        answer: 357,
        hiddenA: ['tens'],
        revealedResult: ['hundreds', 'tens'],
        memoryCircles: {},
      },
      coachingBoard: {},
    },
    {
      id: 'demo_s7_b',
      partLabelHe: 'דוגמה ב',
      topicHe: 'משנים מספר',
      // 260, one hundred more: 360. Six tens are too few to take 8 away: a
      // hundred is broken into ten tens (2 hundreds, 16 tens), then 8 tens go: 280.
      instructionHe:
        'בנו את המספר 260 בבית המספרים. הוסיפו מאה אחת, ואז הוציאו 8 עשרות. השאירו את הלבנים בבית המספרים. איזה מספר קיבלתם? כתבו אותו בשורת התוצאה.',
      body: { kind: 'build', answer: 280, finalCounts: { hundreds: 2, tens: 8 } },
      // An empty board: the card of the start ("מה עושים קודם?").
      coachingBoard: {},
    },
  ],
};

/** Station 7, demonstration ב, step by step (for the tests): build, add a hundred, take away 8 tens. */
export const DEMO_S7_B_STEPS = { start: 260, add: 100, takeAway: 80 } as const;

export function isDemoStation(station: number): station is DemoStation {
  return station >= 3 && station <= 7;
}

/** The teacher's buttons for the demonstration aids (owner, 9.10.2026). */
export const DEMO_SHOW_COLOURS_HE = 'הצגת הצבעים בשורת התוצאה';
export const DEMO_HIDE_COLOURS_HE = 'הסתרת הצבעים בשורת התוצאה';
export const DEMO_CARD_HE = 'דוגמה לכרטיס החניכה';

/** The sentence a station without a demonstration shows (stations 2 and 8). */
export const NO_DEMO_HE = 'בתחנה זו אין הדגמה.';
