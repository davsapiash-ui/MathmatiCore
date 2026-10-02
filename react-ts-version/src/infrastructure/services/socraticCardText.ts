/**
 * The text of a coaching card, for SOCRATIC_CARD_SHOWN (2.10.2026): every card
 * a child sees is saved, so the pilot's real cards — the engine's and the
 * static ones — can be read and the engine tuned.
 *
 * Zero-PII (Module 3): the card is generated text — the engine's or the
 * owner's static card — built from the exercise and the board. It holds no
 * name and no free text of the learner; the chat's free text never reaches a
 * card. The options are stored in their id order (opt_1, opt_2, opt_3), so
 * SOCRATIC_OPTION_SELECTED.option_id points at the option chosen.
 */

/**
 * A card option id → its telemetry key: "opt_2" / "B" / "2" → opt_2, "opt_3" /
 * "C" / "3" → opt_3, anything else → opt_1. Some static cards number their
 * options "1", "2", "3"; until 2.10.2026 SOCRATIC_OPTION_SELECTED recorded
 * all three of those as opt_1.
 */
export function socraticOptionKey(id: string): 'opt_1' | 'opt_2' | 'opt_3' {
  return id === 'opt_2' || id === 'B' || id === '2' ? 'opt_2' : id === 'opt_3' || id === 'C' || id === '3' ? 'opt_3' : 'opt_1';
}

/** Long enough for any valid card (the server refuses a question over 400 characters). */
const MAX_QUESTION_CHARS = 400;
const MAX_OPTION_CHARS = 300;

const clean = (t: unknown, max: number) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export interface SocraticCardTextDetails {
  card_question_he: string;
  card_options_he: string[];
}

export function socraticCardTextDetails(card: {
  questionHe?: string;
  choices?: { id: string; textHe?: string }[];
}): SocraticCardTextDetails {
  const options = ['', '', ''];
  for (const c of card.choices ?? []) {
    const i = Number(socraticOptionKey(String(c.id)).slice(4)) - 1;
    if (!options[i]) options[i] = clean(c.textHe, MAX_OPTION_CHARS);
  }
  return { card_question_he: clean(card.questionHe, MAX_QUESTION_CHARS), card_options_he: options };
}
