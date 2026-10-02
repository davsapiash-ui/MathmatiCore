import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { aggregateClass, buildLearnerRow } from '../classReport';
import { classReportHtml, pedagogicalReportHtml, EXACT_AI_FALLBACK_TEXT_HE } from '../reportHtml';
import { generateExerciseNarrativeFromEvents } from '../pedagogicalReport';
import { keepHebrewLines, normalizeReportTerms, reportTextViolation, REPORT_TERMS_HE } from '../reportAnalysis';

/**
 * Acceptance run of 2.10.2026 with the real engine (D1–D3): the class report
 * printed "consecutive_errors_4: 1, … hesitation_45s: 24", every report's
 * subtitle said "(Zero PII)" and its narrative heading "(Exercise
 * Narratives)", the exercises appeared as "s4_g_t1", and the AI analysis
 * wrote "אחדות" where every screen says "יחידות" and once "הכרטיסייה
 * הסוקרטית". Owner, 1.10.2026: every report in Hebrew, one name per thing.
 */
const read = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');
/** What the teacher reads: the page text, without markup, styles and the embedded font. */
const visibleText = (html: string) =>
  html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const ev = (exercise: string, type: string, details: Record<string, unknown> = {}, t = 0, column?: number) => ({
  session_id: 'session_4_student_student_user3', student_id: 3, exercise_id: exercise, event_type: type, details,
  client_timestamp: 1_000_000 + t, ...(column === undefined ? {} : { column_index: column }),
});
const meeting = [
  ev('s4_g_t1', 'DIGIT_ENTERED', { digit_value: 4, is_correct: false }, 1, 0),
  ev('s4_g_t1', 'SOCRATIC_CARD_SHOWN', { trigger_reason: 'conversion_not_performed', error_category: 'procedural' }, 2, 0),
  ev('s4_g_t1', 'HESITATION_DETECTED', { hesitation_seconds: 45 }, 3, 1),
  ev('s4_g_t1', 'SOCRATIC_CARD_SHOWN', { trigger_reason: 'hesitation_45s', error_category: 'conceptual' }, 4, 1),
  ev('s4_g_t1', 'PROBLEM_COMPLETE', { total_duration_ms: 1000 }, 5),
  ev('s4_g_t2', 'SOCRATIC_CARD_SHOWN', { trigger_reason: 'consecutive_errors_4', error_category: 'calculation' }, 6, 2),
  ev('s4_g_t2', 'PROBLEM_COMPLETE', { total_duration_ms: 1000 }, 7),
];
const titles = { s4_g_t1: 'חיבור במאונך עם המרה', s4_g_t2: 'חיבור במאונך עם שתי המרות' };

describe('D1 — the class report says why the cards opened in Hebrew', () => {
  const row = buildLearnerRow(3, meeting, 7, 'green_path', null, null, 0);
  const a = aggregateClass([row], new Map([[3, meeting]]));

  it('the counts are as stored, the names are the timeline’s', () => {
    expect(a.socratic_triggers).toEqual({ conversion_not_performed: 1, hesitation_45s: 1, consecutive_errors_4: 1 });
    const html = classReportHtml({ session_number: 4, aggregates: a, learners: [row], exercise_titles: titles });
    const text = visibleText(html);
    expect(text).toContain('לא בוצעה המרה נדרשת: 1');
    expect(text).toContain('היסוס 45 שניות: 1');
    expect(text).toContain('ארבע מחיקות או הקלדות שגויות רצופות: 1');
    expect(text).not.toMatch(/hesitation_45s|consecutive_errors_4|conversion_not_performed|procedural|conceptual|calculation/);
  });

  it('nothing on the page is Latin except the product name', () => {
    const html = classReportHtml({ session_number: 4, aggregates: a, learners: [row], exercise_titles: titles });
    const latin = visibleText(html).replace(/MathematiCore/g, '').match(/[A-Za-z_]{2,}/g);
    expect(latin).toBeNull();
  });

  it('the exercises by their titles; without a title a Hebrew label, never the id (coordinator, 2.10.2026)', () => {
    const html = classReportHtml({ session_number: 4, aggregates: a, learners: [row], exercise_titles: titles });
    expect(html).toContain('חיבור במאונך עם המרה');
    expect(html).not.toContain('s4_g_t1');
    const untitled = classReportHtml({ session_number: 4, aggregates: a, learners: [row] });
    expect(untitled).toContain('תרגיל 1 בתחנה 4');
    expect(untitled).not.toContain('s4_g_t1');
  });

  it('the columns: יחידות, never אחדות', () => {
    const text = visibleText(classReportHtml({ session_number: 4, aggregates: a, learners: [row], exercise_titles: titles }));
    expect(text).toContain('שגויות: יחידות');
    expect(text).toContain('(יחידות ');
    expect(text).not.toContain('אחדות');
  });

  it('the class prompt hands the model Hebrew names, not stored keys', () => {
    const src = read('classReport.ts');
    expect(src).toContain('סיבות לפתיחת כרטיסי החניכה: ${triggerCountsHe(a.socratic_triggers) || "אין"}');
    expect(src).not.toContain('טריגרים של כרטיסי חניכה: ${JSON.stringify(a.socratic_triggers)}');
    expect(src).toContain('socratic_triggers: hebrewKeys(r.socratic_triggers');
  });
});

describe('D2 — no English in the headings', () => {
  it('the three reports, both renderers', () => {
    for (const f of ['reportHtml.ts', 'pedagogicalReport.ts', 'classReport.ts']) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/\(Zero PII\)|\(Exercise Narratives\)/);
    }
    const html = pedagogicalReportHtml({ session_number: 4, score_percent: 86, exercise_narratives: ['x'] });
    expect(html).toContain('מדיניות אפס מידע מזהה');
    expect(html).toContain('2. סיפור התרגילים הכרונולוגי</h2>');
  });

  it('the narrative names each exercise by its title', () => {
    const { compulsory } = generateExerciseNarrativeFromEvents([...meeting], titles);
    expect(compulsory[0]).toMatch(/^בתרגיל הראשון \(חיבור במאונך עם המרה\) הלומד הזין ספרה שגויה בטור היחידות/);
    expect(compulsory.join(' ')).not.toMatch(/s4_g_t|אחדות/);
    // Without a title (the catalog unavailable) a Hebrew label, never the id (coordinator, 2.10.2026).
    expect(generateExerciseNarrativeFromEvents([...meeting]).compulsory[0]).toContain('(תרגיל 1 בתחנה 4)');
  });
});

describe('D3 — the analysis in the system’s terms', () => {
  it('the prompt names the terms', () => {
    expect(REPORT_TERMS_HE).toContain('טור היחידות');
    expect(REPORT_TERMS_HE).toContain('לעולם לא "אחדות"');
    expect(REPORT_TERMS_HE).toContain('"כרטיס החניכה"');
    expect(REPORT_TERMS_HE).toContain('"בית המספרים"');
  });

  it('"אחדות" becomes "יחידות", with every prefix', () => {
    expect(normalizeReportTerms('הלומד טעה בטור האחדות.')).toBe('הלומד טעה בטור היחידות.');
    expect(normalizeReportTerms('ספרת האחדות, מהאחדות לעשרות, ואחדות, לאחדות, שבאחדות')).toBe('ספרת היחידות, מהיחידות לעשרות, ויחידות, ליחידות, שביחידות');
    expect(normalizeReportTerms('ספרות שגויות (אחדות 3, עשרות 2)')).toBe('ספרות שגויות (יחידות 3, עשרות 2)');
    expect(normalizeReportTerms('אחדות ועשרות')).toBe('יחידות ועשרות');
  });

  it('"a few" is left alone, and so is a word that only contains the letters', () => {
    expect(normalizeReportTerms('הלומד השתהה שניות אחדות לפני ההמרה.')).toBe('הלומד השתהה שניות אחדות לפני ההמרה.');
    expect(normalizeReportTerms('טעה פעמים אחדות')).toBe('טעה פעמים אחדות');
    expect(normalizeReportTerms('האחדותיות')).toBe('האחדותיות');
  });

  it('the card is "כרטיס החניכה"', () => {
    expect(normalizeReportTerms('הלומד נעזר בכרטיסייה הסוקרטית.')).toBe('הלומד נעזר בכרטיס החניכה.');
    expect(normalizeReportTerms('הכרטיסייה הסוקרטית הופיעה')).toBe('כרטיס החניכה הופיעה');
    expect(normalizeReportTerms('אחרי הכרטיס הסוקרטי ומהכרטיסיה הסוקרטית')).toBe('אחרי כרטיס החניכה ומכרטיס החניכה');
    expect(normalizeReportTerms('שלושה כרטיסים סוקרטיים')).toBe('שלושה כרטיסי החניכה');
    expect(normalizeReportTerms('כרטיסיות מספרים')).toBe('כרטיסיות מספרים');
  });

  it('the card jargon asks for one corrected try; a line that keeps it is fixed, not dropped', () => {
    expect(reportTextViolation(['הכרטיסייה הסוקרטית עזרה ללומד.'])).toMatch(/כרטיס החניכה/);
    expect(reportTextViolation(['הלומד טעה בטור האחדות.'])).toBeNull();
    expect(keepHebrewLines({ knowledge_gaps: ['הכרטיסייה הסוקרטית עזרה ללומד בטור האחדות.'], teaching_recommendations: [] }))
      .toEqual({ knowledge_gaps: ['כרטיס החניכה עזרה ללומד בטור היחידות.'], teaching_recommendations: [] });
  });

  it('the PRD’s fallback sentence is not touched', () => {
    expect(EXACT_AI_FALLBACK_TEXT_HE).toBe('הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע.');
    expect(normalizeReportTerms(EXACT_AI_FALLBACK_TEXT_HE)).toBe(EXACT_AI_FALLBACK_TEXT_HE);
  });
});
