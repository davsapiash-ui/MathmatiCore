import { describe, it, expect } from 'vitest';
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { boardHiddenCard, showBoardCard } from '@/infrastructure/services/staticSocraticCards';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';

/**
 * Coaching-card wording, round 2 (owner, 4.10.2026):
 *  A. Meeting 1, 368 — the second card asks which digit of the written number
 *     the 6 is; true for every board worth 368.
 *  C. The hidden-board cards: "האם הלבנים נמחקו", not "הלבנים שבניתם".
 *  D. The through-zero borrow card with blocks: one breaks a BLOCK — the forms
 *     of the owner's documents (02; 03 §3.6), for every exercise it serves.
 */

type Counts = { thousands: number; hundreds: number; tens: number; units: number };
const C = (th: number, h: number, t: number, u: number): Counts => ({ thousands: th, hundreds: h, tens: t, units: u });
const digitsOf = (n: number) => C(Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10);
const textsOf = (h: SocraticHintResponse) => [h.questionHe, ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
const right = (h: SocraticHintResponse) => h.choices.find((c) => c.isCorrect)!;
const wrong = (h: SocraticHintResponse) => h.choices.filter((c) => !c.isCorrect);

/** The cards of three openings in a row on one board: each opening records the kind it showed. */
function openings(task: SessionTask, counts: Counts): SocraticHintResponse[] {
  const shownKinds: string[] = [];
  const out: SocraticHintResponse[] = [];
  for (let i = 0; i < 3; i++) {
    const card = SocraticEngine.getSynchronousTaskHint(task, counts, { shownKinds: [...shownKinds] } as any);
    out.push(card);
    if (card.cardKind && !shownKinds.includes(card.cardKind)) shownKinds.push(card.cardKind);
  }
  return out;
}

describe('A — 368: the second card is about the written number', () => {
  const task = SESSION1_TASKS.find((t) => t.id === 's1_r_value368')!;
  const BOARDS: [string, Counts][] = [
    ['3 hundreds, 6 tens, 8 units', C(0, 3, 6, 8)],
    ['2 hundreds, 16 tens, 8 units', C(0, 2, 16, 8)],
    ['36 tens, 8 units', C(0, 0, 36, 8)],
  ];

  for (const [what, counts] of BOARDS) {
    it(`${what}: the card, word for word`, () => {
      const card = openings(task, counts).find((c) => c.cardKind === 'digit_column');
      expect(card, 'the digit card is served on this board').toBeTruthy();
      expect(card!.questionHe).toBe('נסו לחשוב: במספר 368, הספרה 6 היא ספרת היחידות, ספרת העשרות או ספרת המאות?');
      expect([right(card!).textHe, right(card!).feedbackHe]).toEqual(['ספרת העשרות', 'נכון מאוד! כמה שוות 6 לבני עשרת יחד?']);
      expect(wrong(card!).map((c) => [c.textHe, c.feedbackHe]).sort()).toEqual([
        ['ספרת היחידות', 'רמז: איזו ספרה במספר 368 היא ספרת היחידות?'],
        ['ספרת המאות', 'רמז: איזו ספרה במספר 368 היא ספרת המאות?'],
      ].sort());
      expect(card!.intentHe).toBe('ערך הספרה לפי מקומה במספר: כמה שוות הלבנים של הטור הזה יחד');
      // Nothing about what the child built, and never the answer (60).
      for (const t of textsOf(card!)) {
        expect(t).not.toMatch(/בניתם|באות אחרי/);
        expect(t).not.toMatch(/(?<!\d)60(?!\d)/);
      }
    });
  }
});

describe('C — the hidden board: the blocks, built or given', () => {
  it('both cards carry the same hint, without "שבניתם"', () => {
    for (const card of [boardHiddenCard(), showBoardCard()]) {
      const restart = card.choices.find((c) => c.textHe === 'מתחילים את התרגיל מההתחלה')!;
      expect(restart.feedbackHe).toBe('רמז: האם הלבנים נמחקו, או שהן רק מוסתרות?');
      for (const t of textsOf(card)) expect(t).not.toContain('בניתם');
    }
  });
});

describe('D — a break through a zero, with blocks: one breaks a block', () => {
  const bank: SessionTask[] = [...SESSION1_TASKS];
  for (const m of [3, 4, 5, 6, 7, 8] as const) {
    for (const p of ['green_path', 'remediation_path'] as const) {
      bank.push(...getSessionTasks(m, p));
      if (m <= 7) for (const b of ['reinforcement', 'challenge'] as const) bank.push(...getSessionBranchTasks(m as 3 | 4 | 5 | 6 | 7, b, p));
    }
  }
  const byId = (id: string) => bank.find((t) => t.id === id)!;
  const subtractions = bank.filter((t) => t.isSubtraction && typeof t.numberA === 'number' && typeof t.numberB === 'number' && !t.hiddenDigits);
  /** The through-zero card of an exercise, on the board that shows its first number, or undefined. */
  const throughZero = (t: SessionTask) => openings(t, digitsOf(t.numberA!)).find((c) => (c as any).situation === 'borrow_through_zero');
  const served = subtractions.map((t) => ({ t, card: throughZero(t) })).filter((x): x is { t: SessionTask; card: SocraticHintResponse } => Boolean(x.card));
  const withBlocks = served.filter((x) => !x.t.id.startsWith('s8_'));
  const noBlocks = served.filter((x) => x.t.id.startsWith('s8_'));

  const NAME = { עשרת: 'tens', מאה: 'hundreds', אלף: 'thousands' } as const;
  const TEN_OF = { units: 'עשר יחידות', tens: 'עשר עשרות', hundreds: 'עשר מאות' } as const;
  const COLUMN = { units: 'טור היחידות', tens: 'טור העשרות', hundreds: 'טור המאות', thousands: 'טור האלפים' } as const;
  const ORDER = ['units', 'tens', 'hundreds', 'thousands'] as const;

  it('400 − 156 (s6_r_t7), word for word — the forms of the documents', () => {
    const card = throughZero(byId('s6_r_t7'))!;
    expect(card.questionHe).toBe('נסו לחשוב: בתרגיל 400 − 156, איך פורטים כשבטור העשרות יש אפס?');
    expect(card.choices.map((c) => [c.textHe, c.feedbackHe])).toEqual(expect.arrayContaining([
      ['פורטים תחילה לבנת מאה אחת לעשר עשרות בטור העשרות', 'נכון מאוד! לחצו על לבנת המאה כדי לפרוט אותה. אחר כך פרטו שוב, טור אחר טור, עד טור היחידות.'],
      ['מדלגים על האפס וממשיכים לטור הבא', 'רמז: כשפורטים לבנת מאה אחת, מה מקבלים: עשר עשרות או עשר יחידות?'],
      ['מוסיפים לבנת עשרת אחת לטור היחידות בלי לפרוט', 'רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?'],
    ]));
  });

  it('every exercise with blocks that gets the card: the block, its column and the column below agree', () => {
    expect(withBlocks.length).toBeGreaterThanOrEqual(8);
    for (const { t, card } of withBlocks) {
      const r = right(card);
      const m = /^פורטים תחילה לבנת (עשרת|מאה|אלף) אחת ל(עשר יחידות|עשר עשרות|עשר מאות) ב(טור היחידות|טור העשרות|טור המאות)$/.exec(r.textHe);
      expect(m, `${t.id}: ${r.textHe}`).toBeTruthy();
      const from = NAME[m![1] as keyof typeof NAME];
      const below = ORDER[ORDER.indexOf(from) - 1] as 'units' | 'tens' | 'hundreds';
      expect([m![2], m![3]], t.id).toEqual([TEN_OF[below], COLUMN[below]]);
      // The block broken first is the nearest column of the first number that holds blocks.
      const counts = digitsOf(t.numberA!);
      expect(counts[from], `${t.id}: there is a ${m![1]} block to break`).toBeGreaterThan(0);
      const fb = /^נכון מאוד! לחצו על לבנת ה(עשרת|מאה|אלף) כדי לפרוט אותה\. אחר כך פרטו שוב, טור אחר טור, עד (טור היחידות|טור העשרות|טור המאות)\.$/.exec(r.feedbackHe ?? '');
      expect(fb, `${t.id}: ${r.feedbackHe}`).toBeTruthy();
      expect(fb![1], t.id).toBe(m![1]);
      const short = (Object.keys(COLUMN) as (keyof typeof COLUMN)[]).find((k) => COLUMN[k] === fb![2])!;
      // The column short of blocks lies below the zero(s), and the first number has none to give in between.
      expect(ORDER.indexOf(short), t.id).toBeLessThan(ORDER.indexOf(below));
      for (const z of ORDER.slice(ORDER.indexOf(short) + 1, ORDER.indexOf(from))) expect(counts[z], `${t.id}: ${z} is a zero`).toBe(0);
      const others = wrong(card);
      const skip = others.find((c) => c.textHe.startsWith('מדלגים'))!;
      expect(skip.feedbackHe, t.id).toBe(`רמז: כשפורטים לבנת ${m![1]} אחת, מה מקבלים: ${TEN_OF[below]} או ${TEN_OF[short as 'units' | 'tens' | 'hundreds']}?`);
      const add = others.find((c) => c.textHe.startsWith('מוסיפים'))!;
      const above = ORDER[ORDER.indexOf(short) + 1];
      const aboveName = (Object.keys(NAME) as (keyof typeof NAME)[]).find((k) => NAME[k] === above)!;
      expect(add.textHe, t.id).toBe(`מוסיפים לבנת ${aboveName} אחת ל${COLUMN[short]} בלי לפרוט`);
      // No bare "מאה אחת" / "עשרת אחת" / "אלף אחד" is broken or added on this card.
      for (const c of card.choices) {
        expect(`${c.textHe} ${c.feedbackHe}`, t.id).not.toMatch(/(?:פורטים תחילה|כשפורטים|מוסיפים) (?:מאה אחת|עשרת אחת|אלף אחד)/);
      }
    }
  });

  it('station 8 has no blocks: the card keeps "מאה אחת" and the memory circles', () => {
    expect(noBlocks.length).toBeGreaterThan(0);
    for (const { t, card } of noBlocks) {
      for (const text of textsOf(card)) expect(text, t.id).not.toMatch(/לבנת|לבני|לחצו על/);
      expect(right(card).textHe, t.id).toMatch(/^פורטים תחילה (מאה אחת|אלף אחד|עשרת אחת) ל(עשר יחידות|עשר עשרות|עשר מאות), ורושמים את השינוי בעיגולי הזיכרון$/);
    }
  });

  if (process.env.G7_DUMP) {
    it('dump', async () => {
      const fs = await import('node:fs');
      fs.writeFileSync(process.env.G7_DUMP!, served.map(({ t, card }) => `${t.id} ${t.numberA} − ${t.numberB}\n  ${textsOf(card).join('\n  ')}`).join('\n\n'));
    });
  }
});
