/**
 * The order in which a Socratic coaching card shows its three options.
 *
 * Every card is authored — and the model is asked to answer — with the
 * correct option first. Shown that way, a child can learn to press the first
 * answer: a position cue, which distorts G of the persistence index (wrong
 * card choices, Module 16 §ב) and the mediation measure. The owner approved
 * mixing the order (David, 28.9.2026: "מאשר לערבב את סדר התשובות"; register,
 * deviation 2).
 *
 * So the research data stays comparable, the order is not random:
 * - it is a pure function of the exercise id and the card's question, so every
 *   learner sees the same card in the same order, on every render and reload;
 * - it does not depend on the order the card arrived in (the options are first
 *   put in their authored order, by id), so ordering twice changes nothing;
 * - the same rule orders static cards and AI cards, after the card is built.
 *
 * Only the position changes. Each option keeps its id and its isCorrect, so
 * SOCRATIC_OPTION_SELECTED records the same option_id / is_correct as before.
 */
import type { SocraticChoice, SocraticHintResponse } from './SocraticEngine';

/** FNV-1a, 32 bit. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator, the same sequence on every device. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const byAuthoredId = (a: SocraticChoice, b: SocraticChoice) =>
  a.id.localeCompare(b.id, 'en', { numeric: true });

/**
 * The card's options in the order the child sees them. A choice whose
 * isCorrect was left implicit gets it from correctChoiceId, or — as the card
 * panel always read it — from being first as received, before anything moves.
 */
export function orderSocraticChoices(
  choices: SocraticChoice[],
  exerciseId: string | undefined,
  questionHe: string | undefined,
  correctChoiceId?: string,
): SocraticChoice[] {
  const resolved = choices.map((c, idx) =>
    c.isCorrect !== undefined
      ? c
      : { ...c, isCorrect: correctChoiceId ? c.id === correctChoiceId : idx === 0 },
  );
  const ordered = [...resolved].sort(byAuthoredId);
  const random = seededRandom(hash(`${exerciseId ?? ''}|${questionHe ?? ''}`));
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  return ordered;
}

/** The same card with its options in the shown order. */
export function withShownOptionOrder<T extends SocraticHintResponse>(card: T, exerciseId: string | undefined): T {
  return { ...card, choices: orderSocraticChoices(card.choices ?? [], exerciseId, card.questionHe, card.correctChoiceId) };
}
