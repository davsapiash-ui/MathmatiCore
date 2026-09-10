import { describe, it, expect } from 'vitest';
import { SESSIONS_BY_PATH, type SessionTask, type LearningPath } from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';
import { borrowCount } from '@/data/taskBuilders';
import { PLACE_ORDER, digitAt, type Place } from '@/core/placeValue';

/**
 * הטקסט שהילד קורא חייב לתאר את המתמטיקה של התרגיל שלפניו.
 *
 * מה שהיה: הנחיית מפגש 6 אמרה "צפו בשינוי בפריטה הכפולה" בכל 20 התרגילים —
 * גם בארבעה שאינם דורשים פריטה כלל (305 − 102), בשלושה שדורשים אחת, ובשבעה
 * שדורשים שלוש. ילד שקיבל את 305 − 102 הונחה לפרוט פעמיים במקום שאין בו מה
 * לפרוט. בנוסף שתי כותרות במפגש 7 הבטיחו "כפולה" על תרגילים משולשים, ושני
 * תרגילים סמוכים במפגש 5 קראו לאותו מצב בשני שמות סותרים.
 *
 * הבדיקה הזו לא מסתכלת על ניסוח. היא מחשבת את הטורים בפועל ומשווה למילים.
 */
const PATHS: LearningPath[] = ['remediation_path', 'green_path'];

const everyTask: SessionTask[] = [
  ...([3, 4, 5, 6, 7, 8] as const).flatMap((s) => PATHS.flatMap((p) => SESSIONS_BY_PATH[s][p])),
  ...([3, 4, 5, 6, 7] as const).flatMap((s) =>
    PATHS.flatMap((p) => [
      ...SESSION_BRANCH_TASKS[s][p].reinforcement,
      ...SESSION_BRANCH_TASKS[s][p].challenge,
    ])
  ),
];

function carryCount(a: number, b: number): number {
  let count = 0;
  let carry = 0;
  for (const p of PLACE_ORDER) {
    if (digitAt(a, p) + digitAt(b, p) + carry >= 10) {
      count += 1;
      carry = 1;
    } else {
      carry = 0;
    }
  }
  return count;
}

/** כמה פעולות המרה או פריטה התרגיל דורש בפועל. */
function regroupCount(t: SessionTask): number {
  const a = t.numberA!;
  const b = t.numberB!;
  return t.isSubtraction ? borrowCount(a, b) : carryCount(a, b);
}

const vertical = everyTask.filter((t) => t.type === 'vertical_addition');
const text = (t: SessionTask) => `${t.titleHe ?? ''} ${t.instructionHe ?? ''}`;

describe('הטקסט מבטיח את מספר ההמרות שהתרגיל באמת דורש', () => {
  const CLAIMS: Array<{ word: RegExp; count: number; label: string }> = [
    { word: /כפול(ה|ות)/, count: 2, label: 'כפולה' },
    { word: /משולש(ת|ות)/, count: 3, label: 'משולשת' },
  ];

  for (const { word, count, label } of CLAIMS) {
    it(`"${label}" נאמר רק על תרגיל עם ${count} טורים`, () => {
      const offenders = vertical
        .filter((t) => word.test(text(t)))
        .filter((t) => regroupCount(t) !== count)
        .map((t) => `${t.id}: ${t.numberA}${t.isSubtraction ? '−' : '+'}${t.numberB} דורש ${regroupCount(t)}`);
      expect(offenders).toEqual([]);
    });
  }

  it('"ללא המרה" או "ללא פריטה" נאמר רק על תרגיל שאינו דורש אף אחת', () => {
    const offenders = vertical
      .filter((t) => /ללא (המרה|פריטה)|אין כאן צורך בפריטה/.test(text(t)))
      .filter((t) => regroupCount(t) !== 0)
      .map((t) => `${t.id}: דורש ${regroupCount(t)}`);
    expect(offenders).toEqual([]);
  });

  it('תרגיל שאינו דורש פריטה אינו מונחה לפרוט', () => {
    // זה היה המקרה החמור: הנחיה לבצע פעולה שאין לה מקום בתרגיל.
    const offenders = vertical
      .filter((t) => t.isSubtraction && regroupCount(t) === 0)
      .filter((t) => /פרקו|בצעו את הפריטה/.test(t.instructionHe ?? ''))
      .map((t) => t.id);
    expect(offenders).toEqual([]);
  });

  it('תרגיל תרגול שדורש פריטה או המרה אומר לילד לבצע אותה', () => {
    // מפגשים 4 עד 6 הם שלב התרגול המונחה: ההנחיה מלווה את הילד בפעולה.
    // מפגש 7 הוא חקר — הילד אמור לגלות בעצמו — ומפגש 8 הוא שלב ההפשטה,
    // בלי לוח ובלי לבנים כלל, ולכן שניהם אינם מתארים את הפעולה.
    const guided = ([4, 5, 6] as const).flatMap((sessionNumber) =>
      PATHS.flatMap((path) => [
        ...SESSIONS_BY_PATH[sessionNumber][path],
        ...SESSION_BRANCH_TASKS[sessionNumber][path].reinforcement,
        ...SESSION_BRANCH_TASKS[sessionNumber][path].challenge,
      ])
    ).filter((t) => t.type === 'vertical_addition');

    const offenders = guided
      .filter((t) => regroupCount(t) > 0)
      .filter((t) => !/פרקו|הקבצ|פריט|המרה|המרות/.test(text(t)))
      .map((t) => t.id);
    expect(offenders).toEqual([]);
  });
});

describe('שם הטור בכותרת תואם את הטור שבו יש חוסר', () => {
  const HE: Record<Place, string> = {
    units: 'היחידות',
    tens: 'העשרות',
    hundreds: 'המאות',
    thousands: 'האלפים',
  };

  function shortColumns(a: number, b: number): Place[] {
    const out: Place[] = [];
    let borrow = 0;
    for (const p of PLACE_ORDER) {
      const d = digitAt(a, p) - borrow;
      if (d < digitAt(b, p)) {
        out.push(p);
        borrow = 1;
      } else {
        borrow = 0;
      }
    }
    return out;
  }

  it('"בטור X בלבד" מצביע על הטור שבו באמת חסר', () => {
    const offenders: string[] = [];
    for (const t of vertical.filter((x) => x.isSubtraction)) {
      const m = /בטור (היחידות|העשרות|המאות|האלפים) בלבד/.exec(t.titleHe ?? '');
      if (!m) continue;
      const short = shortColumns(t.numberA!, t.numberB!);
      if (short.length !== 1 || HE[short[0]] !== m[1]) {
        offenders.push(`${t.id}: הכותרת אומרת ${m[1]}, בפועל ${short.map((p) => HE[p]).join('+') || 'ללא'}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('אין שני תרגילים עם אותו מצב פריטה שנקראים בשמות סותרים', () => {
    // 563 − 128 ו-480 − 155: באותו מפגש ואותו מסלול, שניהם חסרים בטור
    // היחידות, וכל אחד נקרא בשם אחר. הכותרת של 480 מתקנת עכשיו לניסוח
    // המלא "מטור העשרות לטור היחידות" שמציין גם מקור וגם יעד.
    const t5 = SESSIONS_BY_PATH[5].remediation_path.find((t) => t.id === 's5_r_t5')!;
    const t6 = SESSIONS_BY_PATH[5].remediation_path.find((t) => t.id === 's5_r_t6')!;
    expect(shortColumns(t5.numberA!, t5.numberB!)).toEqual(['units']);
    expect(shortColumns(t6.numberA!, t6.numberB!)).toEqual(['units']);
    expect(t6.titleHe).toContain('לטור היחידות');
  });
});
