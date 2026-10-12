import { describe, it, expect } from 'vitest';
import { generateExerciseNarrativeFromEvents } from '../pedagogicalReport';
import { aggregateClass, buildLearnerRow } from '../classReport';
import { classReportHtml, classScaffoldsLineHe, pedagogicalReportHtml } from '../reportHtml';
import { aiRejectionsReportHtml, aiRejectionsReportLines, buildAiRejectionsReport, AI_REJECTIONS_NOTE_HE } from '../aiRejectionsReport';

/**
 * The reports read as the PRD writes them (render check of 12.10.2026): every
 * report rendered from fixture data, then read as text. Each case below is a
 * defect that rendering found.
 */
let t = 0;
const ev = (exercise: string, type: string, details: Record<string, unknown> = {}, column_index?: number) => ({
  session_id: 'session_4_student_student_user3', student_id: 3, exercise_id: exercise, event_type: type, details,
  client_timestamp: 1_000_000 + ++t * 1000, ...(column_index !== undefined ? { column_index } : {}),
});
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the exercise story: the block values are a list, the last one joined with ו-', () => {
  it('"של 100, 10 ו-1", and one value alone', () => {
    const three = generateExerciseNarrativeFromEvents([
      ev('s4_g_t1', 'BLOCK_DRAG_COMPLETE', { block_value: 1 }), ev('s4_g_t1', 'BLOCK_DRAG_COMPLETE', { block_value: 100 }),
      ev('s4_g_t1', 'BLOCK_DRAG_COMPLETE', { block_value: 10 }), ev('s4_g_t1', 'PROBLEM_COMPLETE'),
    ]).compulsory[0];
    expect(three).toContain('באמצעות לבני הדינס של 100, 10 ו-1, והשלים את התרגיל בניסיון הראשון');
    const one = generateExerciseNarrativeFromEvents([ev('s4_g_t2', 'BLOCK_DRAG_COMPLETE', { block_value: 10 }), ev('s4_g_t2', 'PROBLEM_COMPLETE')]).compulsory[0];
    expect(one).toContain('באמצעות לבני הדינס של 10, והשלים');
  });
});

describe('the learner report: a cumulative value names its scope first, without a second bracket', () => {
  it('"כל המפגשים: …" and "מפגשים 3 ו-7: …"', () => {
    const html = text(pedagogicalReportHtml({
      session_number: 4, score_percent: 86,
      research_measures: { persistence: null, persistence_without_help: null, flexibility: null, flexibility_cumulative: null, mediation: { cards: 0, effective: 0, percent: null }, mediation_cumulative: { cards: 0, effective: 0, percent: null } },
    }));
    expect(html).toContain('כל המפגשים: לא נדרש תיווך (0 כרטיסים)');
    expect(html).toContain('מפגשים 3 ו-7: לא נמדד');
    expect(html).not.toContain(') (');
  });
});

describe('the class report', () => {
  const events = [ev('s4_g_t1', 'PROBLEM_COMPLETE'), ev('s4_g_t1', 'ADAPTIVE_GRID_TOGGLED', { action: 'show', source: 'learner' })];
  const row = buildLearnerRow(3, events, 7, 'green_path', null, { minutes: 12, truncated: false }, 0, null, { sessionNumber: 4, allEvents: events });
  const a = aggregateClass([row], new Map([[3, events]]), 4);

  it('the grid line speaks of the class: "הוחזר בידי הלומדים"', () => {
    expect(classScaffoldsLineHe({ ...a, grid_reopenings_total: 1 })).toContain('הוחזר בידי הלומדים 1');
    expect(classScaffoldsLineHe(a)).not.toContain('הלומד ');
  });

  it('the learner table carries the recording minutes and the path (PRD 23 §ב), with plain headings', () => {
    const html = classReportHtml({ session_number: 4, aggregates: a, learners: [row] });
    for (const h of ['כרטיסי חניכה', 'דקות פעילות', 'דקות הקלטה', 'מסלול']) expect(html).toContain(`<th>${h}</th>`);
    expect(html).not.toContain('<th>דקות</th>');
    expect(html).not.toContain('<th>כרטיסים</th>');
    const learnerRow = html.slice(html.indexOf('<td class="label">תלמיד 3</td>'));
    expect(learnerRow.slice(0, learnerRow.indexOf('</tr>'))).toMatch(/<td>12<\/td>[\s\S]*<td>המסלול הירוק<\/td>/);
  });

  it('a meeting without a path prints a dash, never "undefined"', () => {
    const r1 = { ...buildLearnerRow(3, events, null, 'green_path', null, null, 0), learning_path: null };
    const html = classReportHtml({ session_number: 2, aggregates: aggregateClass([r1], new Map([[3, events]]), 2), learners: [r1] });
    expect(html).not.toMatch(/undefined|NaN/);
    expect(html).toContain('<td>—</td>');
  });
});

describe('the weekly rejected-cards report', () => {
  const period = { from_ms: Date.UTC(2026, 9, 1), to_ms: Date.UTC(2026, 9, 8) };
  const rows = [
    { exercise_id: 's5_r_t2', meeting: 5, reason: 'x', outcome: 'mystery_a', card_text: '', created_at_ms: 3 },
    { exercise_id: 's5_r_t2', meeting: 5, reason: 'y', outcome: 'mystery_b', card_text: '', created_at_ms: 2 },
    { exercise_id: 's4_g_t3', meeting: 4, reason: 'forbidden terminology: x', outcome: 'forbidden_term', card_text: 'נסו לחשוב', created_at_ms: 1 },
  ];

  it('two unknown kinds are one row "אחר", not two rows of the same name', () => {
    const r = buildAiRejectionsReport(rows, period);
    expect(r.by_kind.filter((k) => k.label_he === 'אחר')).toEqual([{ code: 'other', label_he: 'אחר', count: 2 }]);
  });

  it('an exercise is named by its title, never by its id', () => {
    const titled = buildAiRejectionsReport(rows, period, { s4_g_t3: 'המרה בטור העשרות בלבד' });
    const html = aiRejectionsReportHtml(titled);
    expect(html).toContain('<td>המרה בטור העשרות בלבד</td>');
    expect(html).toContain('<td>תרגיל במפגש 5, מס׳ זיהוי 2</td>');
    expect(html).not.toMatch(/s4_g_t3|s5_r_t2/);
    expect(aiRejectionsReportLines(titled).join('\n')).not.toMatch(/s4_g_t3|s5_r_t2/);
  });

  it('the note says plainly what is counted', () => {
    expect(AI_REJECTIONS_NOTE_HE).toContain('נספר גם כל כרטיס שנדחה בבדיקה במחשב של הלומד, בין שכתב אותו המנוע ובין שהוא כרטיס קבוע.');
  });
});
