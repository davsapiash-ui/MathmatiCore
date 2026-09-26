import { describe, it, expect } from 'vitest';
import { SESSIONS_BY_PATH, type SessionTask, type LearningPath } from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';
import { borrowCount, borrowColumns } from '@/data/taskBuilders';
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

describe('מפגש 5 — ההנחיה אומרת בדיוק אילו לבנים פורטים', () => {
  // ההנחיה הקודמת אמרה בכל תרגיל "פרקו עשרת אחת ליחידות (או מאה לעשרות)",
  // גם כשהתרגיל דורש פריטת אלף (8,762 − 4,932) או שתיים-שלוש פריטות
  // (523 − 187; 7,214 − 3,568). מסמך 02: "פרקו עשרת אחת ליחידות בלחיצה עליה",
  // "בדקו את הכמויות החדשות בלוח בית המספרים".
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

  it('כל פריטה שהחשבון דורש נאמרת, לפי הסדר מימין לשמאל, ואין אחרות', () => {
    const offenders: string[] = [];
    for (const t of session5) {
      const need = borrowColumns(t.numberA!, t.numberB!).map((p) => WHAT[p]);
      const said = Object.values(WHAT)
        .filter(Boolean)
        .map((w) => ({ w, at: (t.instructionHe ?? '').indexOf(w) }))
        .filter((x) => x.at >= 0)
        .sort((x, y) => x.at - y.at)
        .map((x) => x.w);
      if (JSON.stringify(said) !== JSON.stringify(need)) {
        offenders.push(`${t.id}: צריך [${need.join(', ')}], כתוב [${said.join(', ')}]`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('אין יותר "(או מאה לעשרות)" — ההנחיה לא משאירה לילד לנחש', () => {
    expect(session5.filter((t) => /או מאה לעשרות/.test(t.instructionHe ?? '')).map((t) => t.id)).toEqual([]);
  });

  it('כל תרגיל עם פריטה אומר "בדקו את הכמויות החדשות בלוח בית המספרים" (הכרעת בעל המוצר)', () => {
    const offenders = session5
      .filter((t) => borrowColumns(t.numberA!, t.numberB!).length > 0)
      .filter((t) => !(t.instructionHe ?? '').includes('בדקו את הכמויות החדשות בלוח בית המספרים'))
      .map((t) => t.id);
    expect(offenders).toEqual([]);
  });

  it('הנוסחים המלאים של התרגילים שהביקורת הצביעה עליהם', () => {
    const byId = (id: string) => session5.find((t) => t.id === id)!.instructionHe;
    expect(byId('s5_r_t2')).toBe(
      'פתרו במאונך: 53 − 18. בנו את המחוסר בלוח. פרקו עשרת אחת ליחידות בלחיצה עליה ובדקו את הכמויות החדשות בלוח בית המספרים. החסירו את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.'
    );
    expect(byId('s5_r_t4')).toBe(
      'פתרו במאונך: 345 − 182. בנו את המחוסר בלוח. פרקו מאה אחת לעשרות בלחיצה עליה ובדקו את הכמויות החדשות בלוח בית המספרים. החסירו את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.'
    );
    expect(byId('s5_g_t4')).toBe(
      'פתרו במאונך: 8,762 − 4,932. בנו את המחוסר בלוח. פרקו אלף אחד למאות בלחיצה עליו ובדקו את הכמויות החדשות בלוח בית המספרים. החסירו את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.'
    );
    expect(byId('s5_r_challenge_1')).toBe(
      'פתרו במאונך: 523 − 187. בנו את המחוסר בלוח. פרקו עשרת אחת ליחידות, ואחר כך מאה אחת לעשרות, בלחיצה על כל לבנה, ובדקו את הכמויות החדשות בלוח בית המספרים. החסירו את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.'
    );
    expect(byId('s5_g_challenge_1')).toBe(
      'פתרו במאונך: 7,214 − 3,568. בנו את המחוסר בלוח. פרקו עשרת אחת ליחידות, אחר כך מאה אחת לעשרות, ואחר כך אלף אחד למאות, בלחיצה על כל לבנה, ובדקו את הכמויות החדשות בלוח בית המספרים. החסירו את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.'
    );
    expect(byId('s5_r_t1')).toBe(
      'פתרו במאונך: 78 − 25. בנו את המחוסר בלוח. החסירו את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.'
    );
  });
});
