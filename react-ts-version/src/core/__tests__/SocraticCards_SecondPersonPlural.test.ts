import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SocraticEngine, TASK_HINTS, groundCardInExercise } from '@/infrastructure/services/SocraticEngine';
import { exerciseCard } from '@/infrastructure/services/staticSocraticCards';
import { SESSION1_TASKS, getSessionTasks } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';

/**
 * The owner's lecturer (binding, 28.9.2026): what the child reads is addressed
 * in the second person plural (כתבו, בדקו, לחצו), never in the first person
 * plural ("בואו נ…", "נבדוק", "איך נגלה"). The coaching card follows it: the
 * instructions and the feedback in the second person plural, the three
 * options in the impersonal present ("מקבצים", "משתמשים"), the questions
 * impersonal ("איך מגלים…?"), and the opening "נסו לחשוב: ".
 */

const SRC = resolve(__dirname, '../..');
const stripComments = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (p: string) => stripComments(readFileSync(resolve(SRC, p), 'utf-8').replace(/\r\n/g, '\n'));

/** First person plural forms (with a prefix ו / ש / כש), whole words only. */
const FIRST_PERSON_PLURAL = new RegExp(
  `(^|[^א-ת])(ו|ש|כש)?(${[
    'בואו', 'אנחנו', 'אנו', 'לנו', 'שלנו', 'עלינו', 'אותנו',
    'נבדוק', 'נפרוט', 'נשתמש', 'נכתוב', 'ננחש', 'נעשה', 'נגלה', 'נבנה', 'נוציא', 'נחבר', 'נאסוף', 'נמיר',
    'נקבץ', 'נעביר', 'נרשום', 'נשאיר', 'נקליד', 'נלחץ', 'נחסיר', 'נחסר', 'נוסיף', 'נוכל', 'נבצע', 'נרצה',
    'נתחיל', 'נעבור', 'נפתור', 'נשווה', 'נבחר', 'נתבונן', 'ניעזר', 'נחכה', 'נסתכל', 'נשמור', 'נתחשב',
    'נחשוב', 'נמשיך',
    'סיימנו', 'הוצאנו', 'פרטנו', 'הוספנו', 'חיסרנו', 'קיבצנו', 'בנינו', 'כתבנו', 'מחקנו',
  ].join('|')})(?![א-ת])`,
  'g',
);

const EMPTY = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
const STATES = [
  EMPTY,
  { units: 3, tens: 2, hundreds: 1, thousands: 0 },
  { ...EMPTY, units: 12 },
  { ...EMPTY, tens: 16 },
  { ...EMPTY, hundreds: 12 },
  { ...EMPTY, tens: 5, units: 2 },
];

const tasks: any[] = [...SESSION1_TASKS];
for (const m of [3, 4, 5, 6, 7, 8] as const) {
  for (const path of ['green_path', 'remediation_path'] as const) {
    tasks.push(...getSessionTasks(m, path));
    if (m <= 7) for (const b of ['reinforcement', 'challenge'] as const) tasks.push(...getSessionBranchTasks(m, b, path));
  }
}

const textsOf = (h: { questionHe: string; tts_text?: string; choices: { textHe: string; feedbackHe?: string }[] }) =>
  [h.questionHe, h.tts_text ?? '', ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];

describe('the coaching card speaks in the second person plural (owner\'s lecturer, 28.9.2026)', () => {
  it('no first person plural anywhere in the card texts, the fallbacks or the "thinking" screen', () => {
    const found: string[] = [];
    for (const f of [
      'infrastructure/services/SocraticEngine.ts',
      'infrastructure/services/staticSocraticCards.ts',
      'features/workspace/overlays/HelpOverlays.tsx',
    ]) {
      // The guard that reads the model's options accepts both persons ("נשתמש ב-…" and "משתמשים ב-…").
      const text = code(f).replace(/^const REPRESENTATION_CHOICE = .*$/m, '');
      for (const m of text.matchAll(FIRST_PERSON_PLURAL)) {
        const at = m.index ?? 0;
        found.push(`${f}: …${text.slice(Math.max(0, at - 30), at + 30).replace(/\s+/g, ' ')}…`);
      }
    }
    expect(found).toEqual([]);
  });

  it('every card served in meetings 1 and 3–8, in any board state, has no first person plural', () => {
    const found: string[] = [];
    for (const t of tasks) {
      for (const counts of STATES) {
        for (const s of textsOf(SocraticEngine.getSynchronousTaskHint(t, counts))) {
          if (new RegExp(FIRST_PERSON_PLURAL.source).test(s)) found.push(`${t.id} ${JSON.stringify(counts)}: ${s}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('the opening is "נסו לחשוב: " — on the session cards, on every computed card, and after the exercise is named', () => {
    for (const key of ['s1_target_347', 's4_card', 's5_card', 's6_card', 's7_card', 's8_card']) {
      expect(TASK_HINTS[key].questionHe, key).toMatch(/^נסו לחשוב: /);
      expect(TASK_HINTS[key].tts_text, key).toBe(TASK_HINTS[key].questionHe);
    }
    for (const t of tasks.filter((x) => /^s[3-8]_/.test(x.id))) {
      const card = exerciseCard(t, EMPTY);
      if (card) expect(card.questionHe, t.id).toMatch(/^נסו לחשוב: /);
    }
    const grounded = groundCardInExercise(TASK_HINTS.s5_card, { numberA: 61, numberB: 24, isSubtraction: true });
    expect(grounded.questionHe).toBe('נסו לחשוב: בתרגיל 61 פחות 24, אין מספיק יחידות כדי לחסר. מה עושים?');
    expect(code('features/workspace/overlays/HelpOverlays.tsx')).toContain('>נסו לחשוב…</p>');
  });
});
