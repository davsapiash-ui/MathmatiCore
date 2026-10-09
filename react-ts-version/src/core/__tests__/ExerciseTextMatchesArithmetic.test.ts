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
      .filter((t) => /פרקו|פרטו|בצעו את הפריטה/.test(t.instructionHe ?? ''))
      .map((t) => t.id);
    expect(offenders).toEqual([]);
  });

  it('תרגיל תרגול שדורש פריטה או המרה אומר לילד לבצע אותה', () => {
    // מפגשים 4 עד 6 הם שלב התרגול המונחה: ההוראה מלווה את הילד בפעולה.
    // מפגש 7 הוא חקר — הילד אמור לגלות בעצמו — ומפגש 8 הוא שלב ההפשטה,
    // בלי לוח ובלי לבנים כלל, ולכן שניהם אינם מתארים את הפעולה.
    const guided = ([4, 5, 6] as const).flatMap((sessionNumber) =>
      PATHS.flatMap((path) => [
        ...SESSIONS_BY_PATH[sessionNumber][path],
        ...SESSION_BRANCH_TASKS[sessionNumber][path].reinforcement,
        ...SESSION_BRANCH_TASKS[sessionNumber][path].challenge,
      ])
    ).filter((t) => t.type === 'vertical_addition');

    // A hidden MINUEND is found by adding back (a grouping), not by the break
    // the exercise's own subtraction needs: its instruction names no operation
    // and leaves it to the child — "גלו אותן בעזרת הלבנים" (owner, 1.10.2026, D12).
    const hiddenMinuend = (t: SessionTask) => Boolean(t.isSubtraction && t.hiddenDigits?.a?.length);
    const offenders = guided
      .filter((t) => regroupCount(t) > 0 && !hiddenMinuend(t))
      .filter((t) => !/פרקו|פרטו|לפרוט|פרטתם|הקבצ|קבצו|פריט|המרה|המרות/.test(text(t)))
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

describe('מפגש 5 — ההוראה אינה אומרת מראש אילו לבנים פורטים (בעל המוצר, 30.9.2026)', () => {
  // Until 30.9.2026 the instruction named the blocks to break. Since then it
  // carries the station-1 borrowing sentence and the child finds the column that
  // lacks blocks; WHAT stays to prove no instruction brings the old wording back.
  const WHAT: Record<Place, string> = {
    units: 'עשרת אחת ליחידות',
    tens: 'מאה אחת לעשרות',
    hundreds: 'אלף אחד למאות',
    thousands: '',
  };

  const session5 = PATHS.flatMap((p) => [
    ...SESSIONS_BY_PATH[5][p],
    ...SESSION_BRANCH_TASKS[5][p].reinforcement,
    ...SESSION_BRANCH_TASKS[5][p].challenge,
  ]).filter((t) => t.type === 'vertical_addition' && t.isSubtraction && !t.hiddenDigits);

  it('מכסה את כל 18 תרגילי החיסור במאונך של מפגש 5 (12 חובה, 6 בחירה)', () => {
    expect(session5).toHaveLength(18);
  });

  // Owner, 30.9.2026: the instruction no longer says in advance where to borrow —
  // the child finds the column that lacks blocks; the coaching card helps on need.
  it('ההוראה אינה אומרת מראש איפה פורטים (בעל המוצר, 30.9.2026)', () => {
    const offenders = session5
      .filter((t) => Object.values(WHAT).filter(Boolean).some((w) => (t.instructionHe ?? '').includes(w)))
      .map((t) => t.id);
    expect(offenders).toEqual([]);
  });

  it('אין יותר "(או מאה לעשרות)" — ההוראה לא משאירה לילד לנחש', () => {
    expect(session5.filter((t) => /או מאה לעשרות/.test(t.instructionHe ?? '')).map((t) => t.id)).toEqual([]);
  });

  it('כל תרגיל אומר את משפט הפריטה של תחנה 1: "אם בטור אין מספיק לבנים…" (בעל המוצר, 30.9.2026)', () => {
    const offenders = session5.filter((t) => !(t.instructionHe ?? '').includes('אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו. לחצו על הלבנה, או גררו אותה אל הטור שמימין. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.')).map((t) => t.id);
    expect(offenders).toEqual([]);
  });

  // Owner, 28.9.2026: subtraction says "פרטו" (פריטה), and the board is "בית המספרים".
  it('הנוסחים המלאים של התרגילים שהביקורת הצביעה עליהם', () => {
    const byId = (id: string) => session5.find((t) => t.id === id)!.instructionHe;
    expect(byId('s5_r_t2')).toBe(
      'פתרו במאונך: 53 − 18. בנו בבית המספרים את המספר הראשון, 53. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו. לחצו על הלבנה, או גררו אותה אל הטור שמימין. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה. הוציאו מבית המספרים את המספר השני, 18. כתבו את התוצאה בשורת התוצאה.'
    );
    expect(byId('s5_g_t4')).toBe(
      'פתרו במאונך: 8,762 − 4,932. בנו בבית המספרים את המספר הראשון, 8,762. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו. לחצו על הלבנה, או גררו אותה אל הטור שמימין. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה. הוציאו מבית המספרים את המספר השני, 4,932. כתבו את התוצאה בשורת התוצאה.'
    );
    expect(byId('s5_r_t1')).toBe(
      'פתרו במאונך: 78 − 25. בנו בבית המספרים את המספר הראשון, 78. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו. לחצו על הלבנה, או גררו אותה אל הטור שמימין. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה. הוציאו מבית המספרים את המספר השני, 25. כתבו את התוצאה בשורת התוצאה.'
    );
  });
});
