import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { researchDetailsColumns } from '../researchTelemetryRow';

/**
 * PRD Module 24: the research export carries "כל השדות" of every telemetry
 * event. The "פעולות" file kept a dozen typed fields and lost the rest of
 * Appendix A §3 — an opened grid looked like a closed one, a system opening
 * like the learner's, and no exercise had a duration.
 */
describe('research export — every typed details field has a column', () => {
  it('the scaffold grid: opened or closed, and by whom (register deviation 19)', () => {
    const opened = researchDetailsColumns('ADAPTIVE_GRID_TOGGLED', { action: 'opened', source: 'hesitation_30s' });
    const closed = researchDetailsColumns('ADAPTIVE_GRID_TOGGLED', { action: 'closed', source: 'learner' });
    expect([opened.grid_action, opened.grid_source]).toEqual(['opened', 'hesitation_30s']);
    expect([closed.grid_action, closed.grid_source]).toEqual(['closed', 'learner']);
  });

  it('the exercise: template and path on load; duration, undos and errors on completion', () => {
    expect(researchDetailsColumns('PROBLEM_LOAD', { exercise_template_id: 's3_g_t3', path_type: 'compulsory' }))
      .toMatchObject({ exercise_template_id: 's3_g_t3', path_type: 'compulsory' });
    expect(researchDetailsColumns('PROBLEM_COMPLETE', { total_duration_ms: 84000, undo_count: 2, error_count: 1 }))
      .toMatchObject({ total_duration_ms: 84000, undo_count: 2, error_count: 1 });
  });

  it('drags, regroupings, card options, keyboard locks, help and board clears', () => {
    expect(researchDetailsColumns('BLOCK_DRAG_COMPLETE', { block_value: 10, source_column_index: 1 }).source_column_index).toBe(1);
    expect(researchDetailsColumns('BLOCK_DRAG_COMPLETE', { block_value: 10, source_column_index: null }).source_column_index).toBe('');
    expect(researchDetailsColumns('REGROUPING_SUCCESS', { regrouping_type: 'composition', duration_ms: 3200 }).duration_ms).toBe(3200);
    expect(researchDetailsColumns('SOCRATIC_OPTION_SELECTED', { option_id: 'opt_2', is_correct: false }).option_id).toBe('opt_2');
    expect(researchDetailsColumns('KEYBOARD_LOCK_BLOCKED', { conversion_required: 'decomposition' }).conversion_required).toBe('decomposition');
    expect(researchDetailsColumns('HELP_REQUESTED', { help_count: 3 }).help_count).toBe(3);
    expect(researchDetailsColumns('HELP_WITHDRAWN', { help_count: 0 }).help_count).toBe(0);
    expect(researchDetailsColumns('BOARD_CLEARED', { units: 4, tens: 2, hundreds: 0, thousands: 0, blocks_removed: 6 }))
      .toMatchObject({ cleared_units: 4, cleared_tens: 2, cleared_hundreds: 0, cleared_thousands: 0, blocks_removed: 6 });
  });

  it('the reflection: step, effort, strategies and persistence', () => {
    expect(researchDetailsColumns('REFLECTION_SUBMITTED', {
      reflection_step: 3, effort_score: 'HIGH', selected_strategies: ['UNDO_BUTTON', 'SOCRATIC_CARD'], persistence_index: 78,
    })).toMatchObject({ reflection_step: 3, effort_score: 'HIGH', selected_strategies: 'UNDO_BUTTON;SOCRATIC_CARD', persistence_index: 78 });
  });

  it('no free text: a string outside the closed lists is left out, wherever it was parked', () => {
    const cols = researchDetailsColumns('ADAPTIVE_GRID_TOGGLED', { action: 'נפתח ע"י דנה כהן', source: 'learner', note: 'שמי דנה' });
    expect(cols.grid_action).toBe('');
    expect(JSON.stringify(cols)).not.toContain('דנה');
    expect(researchDetailsColumns('PROBLEM_LOAD', { exercise_template_id: 'דנה כהן 050-1234567', path_type: 'x' }))
      .toMatchObject({ exercise_template_id: '', path_type: '' });
    expect(researchDetailsColumns('REFLECTION_SUBMITTED', { selected_strategies: ['UNDO_BUTTON', 'אני דנה'] }).selected_strategies).toBe('UNDO_BUTTON');
  });

  it('the coaching card\'s text (2.10.2026): kept in the card\'s alphabet only, on its own event only', () => {
    const q = 'נסו לחשוב: בתרגיל 1,245 + 328, מה מחברים בטור העשרות?';
    const options = ['את שתי הספרות של הטור, ועוד העשרת שעברה', 'רק את שתי הספרות', 'לוחצים על "קבצו 10"'];
    expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_question_he: q, card_options_he: options }))
      .toMatchObject({ card_question_he: q, card_options_he: options.join(' | ') });
    // A Latin letter, an email or a link empties the text; so does an over-long one.
    const bad = researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_question_he: 'שלום dana@example.com', card_options_he: ['Dana', 'א'.repeat(401), 'ב'] });
    expect(bad.card_question_he).toBe('');
    expect(bad.card_options_he).toBe(' |  | ב');
    expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_options_he: ['א', 'ב', 'ג', 'ד'] }).card_options_he).toBe('');
    expect(researchDetailsColumns('DIGIT_ENTERED', { card_question_he: q }).card_question_he).toBe('');
  });

  it('the card\'s text: direction marks are dropped, the card\'s own signs are kept, Latin and "@" still empty it', () => {
    const marked = '⁧נסו לחשוב: בתרגיל‏ 345 − 182, בטור העשרות אין מספיק לבנים כדי לחסר. מה עושים?⁩';
    expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_question_he: marked }).card_question_he)
      .toBe('נסו לחשוב: בתרגיל 345 − 182, בטור העשרות אין מספיק לבנים כדי לחסר. מה עושים?');
    for (const t of ['סופרים: עשר, עשרים, שלושים…', 'אם 7 > 5 → פורטים [עשרת אחת]', 'הספרה < 10']) {
      expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_question_he: t }).card_question_he, t).toBe(t);
    }
    for (const t of ['‏שלום Dana', 'כתבו ל‎a@b', 'ראו www']) {
      expect(researchDetailsColumns('SOCRATIC_CARD_SHOWN', { card_question_he: t }).card_question_he, t).toBe('');
    }
  });

  it('a field belongs to its own event only, and every row has the same columns', () => {
    const a = researchDetailsColumns('DIGIT_ENTERED', { digit_value: 4, is_correct: true, duration_ms: 5 });
    const b = researchDetailsColumns('BOARD_CLEARED', { units: 1 });
    expect(Object.keys(a)).toEqual(Object.keys(b));
    expect(Object.values(a).every((v) => v === '')).toBe(true);
    expect(researchDetailsColumns('BOARD_CLEARED', null).blocks_removed).toBe('');
  });

  it('the export spreads these columns into every row of "פעולות"', () => {
    const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
    const rows = src.slice(src.indexOf('const telemetryRows = telemetry.map('), src.indexOf('// ── 2. One row per learner × meeting'));
    expect(rows).toContain('...researchDetailsColumns(data.event_type, d),');
    expect(rows).not.toContain('details_json: d');
  });
});
