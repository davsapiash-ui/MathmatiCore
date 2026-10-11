import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeExerciseOutcomes, splitMeetingRuns, summarizeMeeting, type MeetingReset } from '../meetingMetrics';
import { generateExerciseNarrativeFromEvents } from '../pedagogicalReport';
import { buildFailedExercises, buildTelemetrySummary } from '../reportAnalysis';
import { aggregateClass, buildClassCsv, buildLearnerRow, createClassReportPdfBufferWithPdfkit } from '../classReport';
import {
  CHOICE_EXERCISES_HEADING_HE,
  classCatchUpLinesHe,
  classReportHtml,
  classScaffoldsLineHe,
  pedagogicalReportHtml,
  reportFooterTemplate,
} from '../reportHtml';
import { buildPreResetRecord, classPreResetNotes, lastResetAtOf, splitCatchUpAtReset } from '../preResetRecord';
import { buildClassCatchUpSummary, type CatchUpRecord, type CatchUpRound } from '../catchUp';

/**
 * The reports round of 11.10.2026 (owner's decisions on the audit): the
 * reports say the same thing the PRD says, in the PRD's names.
 */
const src = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');

let t = 0;
const ev = (exercise: string, type: string, details: Record<string, unknown> = {}, column_index?: number) => ({
  session_id: 'session_4_student_student_user3',
  student_id: 3,
  exercise_id: exercise,
  event_type: type,
  details,
  client_timestamp: 1_000_000 + ++t,
  ...(column_index !== undefined ? { column_index } : {}),
});

describe('M5 — the result-row scaffold by profile (PRD 23 §ב, Module 9 §א)', () => {
  const events = [
    ev('s4_g_t1', 'PLACE_CUES_SHOWN', { profile: 'regular' }),
    ev('s4_g_t2', 'PLACE_CUES_SHOWN', { profile: 'regular' }),
    ev('s4_g_t3', 'PLACE_CUES_SHOWN', { profile: 'enhanced' }),
    ev('s4_g_t4', 'PLACE_CUES_SHOWN', {}),
  ];

  it('counts each profile; an event with no profile counts in the total only', () => {
    const s = summarizeMeeting(events);
    expect(s.place_cue_scaffolds).toBe(4);
    expect(s.place_cues_regular).toBe(2);
    expect(s.place_cues_enhanced).toBe(1);
  });

  it('the class aggregates and the printed line carry both numbers', () => {
    const row = buildLearnerRow(3, events, 7, 'green_path', null, null, 0, null, { sessionNumber: 4, allEvents: events });
    const a = aggregateClass([row], new Map([[3, events]]), 4);
    expect(a.place_cues_regular_total).toBe(2);
    expect(a.place_cues_enhanced_total).toBe(1);
    expect(classScaffoldsLineHe(a)).toContain('פיגום בשורת התוצאה: 4 (2 בפרופיל הרגיל, 1 בפרופיל התמיכה המוגבר)');
    expect(classReportHtml({ session_number: 4, aggregates: a, learners: [row] })).toContain('2 בפרופיל הרגיל, 1 בפרופיל התמיכה המוגבר');
  });

  it('a report stored before the split prints the total alone', () => {
    const row = buildLearnerRow(3, events, 7, 'green_path', null, null, 0);
    const a = aggregateClass([row], new Map([[3, events]]), 4);
    delete a.place_cues_regular_total;
    delete a.place_cues_enhanced_total;
    expect(classScaffoldsLineHe(a)).toMatch(/פיגום בשורת התוצאה: 4$/);
  });
});

describe('M4 + M5 — the class CSV: fixed columns, catch-up, place cues, then outcome_* last', () => {
  const events = [ev('s4_g_t1', 'PROBLEM_COMPLETE'), ev('s4_g_t2', 'PLACE_CUES_SHOWN', { profile: 'enhanced' })];
  const row = buildLearnerRow(3, events, 7, 'green_path', null, null, 0, null, { sessionNumber: 4, allEvents: events });
  const a = aggregateClass([row], new Map([[3, events]]), 4);
  const parse = (line: string) => line.split('","').map((c) => c.replace(/^﻿?"|"$/g, ''));
  const [head, line] = buildClassCsv([row], a.exercises).split('\n').map(parse);

  it('header and row agree, and every outcome_* column is at the end', () => {
    expect(head).toHaveLength(line.length);
    const firstOutcome = head.findIndex((h) => h.startsWith('outcome_'));
    expect(head.slice(firstOutcome)).toEqual(a.exercises.map((e) => `outcome_${e.exercise_id}`));
    expect(head.slice(firstOutcome - 3, firstOutcome)).toEqual(['catchup_note', 'place_cues_regular', 'place_cues_enhanced']);
    const cell = (name: string) => line[head.indexOf(name)];
    expect(cell('place_cues_regular')).toBe('0');
    expect(cell('place_cues_enhanced')).toBe('1');
    expect(cell('outcome_s4_g_t1')).toBe('first_try');
  });

  it('the research export appends the same two columns last', () => {
    const exp = src('exportDriveReport.ts');
    const push = exp.slice(exp.indexOf('meetingRows.push({'));
    const row = push.slice(0, push.indexOf('\n      });'));
    expect(row.trimEnd()).toMatch(/place_cues_regular: summary\.place_cues_regular \?\? 0,\s*place_cues_enhanced: summary\.place_cues_enhanced \?\? 0,$/);
  });
});

describe('M6 — catch-up time before a reset belongs to "לפני האיפוס"', () => {
  const T_RESET = 1_790_935_980_000;
  const round = (over: Partial<CatchUpRound> = {}): CatchUpRound => ({
    action: 'reopen', reason: 'slow_pace', note: null, stopped_at: null, recorded_by: 'teacher',
    recorded_at: T_RESET - 60_000, opened_at: T_RESET - 60_000, closed_at: T_RESET - 1_000, closed_by: 'teacher', active_minutes: 7,
    ...over,
  });
  const record = (rounds: Record<string, CatchUpRound>): Partial<CatchUpRecord> => ({ student_id: 4, session_number: 3, class_id: 'class_1', rounds });
  const reset: MeetingReset = { at: T_RESET, reason: null, scope: 'active_session' };
  const runs = splitMeetingRuns([
    { data: { ...ev('s3_g_t1', 'DIGIT_ENTERED', { is_correct: false, digit_value: 2 }, 0), client_timestamp: T_RESET - 30_000 }, writtenAtMs: T_RESET - 30_000 },
    { data: { ...ev('s3_g_t1', 'PROBLEM_COMPLETE'), client_timestamp: T_RESET + 30_000 }, writtenAtMs: T_RESET + 30_000 },
  ], [reset]);

  it('splits the rounds at the reset by when they were recorded', () => {
    const split = splitCatchUpAtReset(record({ r_1: round(), r_2: round({ recorded_at: T_RESET + 5_000, opened_at: T_RESET + 5_000, closed_at: T_RESET + 60_000, active_minutes: 3 }) }), lastResetAtOf(runs));
    expect(Object.keys(split.before?.rounds ?? {})).toEqual(['r_1']);
    expect(Object.keys(split.after?.rounds ?? {})).toEqual(['r_2']);
    // No reset: the whole record is current.
    expect(splitCatchUpAtReset(record({ r_1: round() }), null)).toEqual({ before: null, after: record({ r_1: round() }) });
  });

  it('the learner report: the card counts the rounds since; "לפני האיפוס" names the earlier ones', () => {
    const split = splitCatchUpAtReset(record({ r_1: round() }), lastResetAtOf(runs));
    expect(split.after).toBeNull();
    const pre = buildPreResetRecord(runs, {}, split.before)!;
    expect(pre.lines_he.at(-1)).toBe('רישום זמן ההשלמה — קיבל זמן השלמה: 7 דקות · סיבה: עבד בקצב איטי');
    expect(pedagogicalReportHtml({ session_number: 3, score_percent: 100, pre_reset: pre })).toContain('רישום זמן ההשלמה — קיבל זמן השלמה: 7 דקות');
  });

  it('the class report: 4ג carries it, the catch-up block counts only the rounds since', () => {
    const split = splitCatchUpAtReset(record({ r_1: round() }), lastResetAtOf(runs));
    const pre = buildPreResetRecord(runs, {}, split.before)!;
    expect(classPreResetNotes({ learners: [{ student_id: 4, pre_reset: pre }] })[0]).toMatch(/^תלמיד 4: .*רישום זמן ההשלמה — קיבל זמן השלמה: 7 דקות · סיבה: עבד בקצב איטי\.$/);
    expect(buildClassCatchUpSummary(split.after ? { 4: split.after } : {}).learners).toEqual([]);
    const src1 = src('classReport.ts');
    expect(src1).toContain('catchUp = buildClassCatchUpSummary(sinceReset);');
    expect(src1).toContain('buildPreResetRecord(run, exerciseTitles, catchUpBeforeReset.get(n) ?? null)');
    expect(src('pedagogicalReport.ts')).toContain('catchUp = reportCatchUpOf(split.after);');
  });
});

describe('M7 — the story tells the memory circle from the result row, and the digit typed', () => {
  it('a carry typed in the memory circle, then the result row', () => {
    const { compulsory } = generateExerciseNarrativeFromEvents([
      ev('s4_g_t1', 'DIGIT_ENTERED', { digit_value: 5, is_correct: true }, 0),
      ev('s4_g_t1', 'DIGIT_ENTERED', { digit_value: 1, is_correct: true, input_target: 'carry_circle' }, 1),
      ev('s4_g_t1', 'DIGIT_ENTERED', { digit_value: 7, is_correct: true }, 1),
      ev('s4_g_t1', 'PROBLEM_COMPLETE'),
    ]);
    expect(compulsory[0]).toBe(
      'בתרגיל הראשון (תרגיל במפגש 4, מס׳ זיהוי 1) הלומד הזין בשורת התוצאה את הספרה 5 בטור היחידות, הזין בעיגול הזיכרון של טור העשרות את הספרה 1, הזין בשורת התוצאה את הספרה 7 בטור העשרות, והשלים את התרגיל בניסיון הראשון.'
    );
  });

  it('a wrong digit in the memory circle, and its deletion', () => {
    const { compulsory } = generateExerciseNarrativeFromEvents([
      ev('s4_g_t1', 'DIGIT_ENTERED', { digit_value: 2, is_correct: false, input_target: 'carry_circle' }, 1),
      ev('s4_g_t1', 'DIGIT_DELETED', { deleted_digit_value: 2, input_target: 'carry_circle' }, 1),
      ev('s4_g_t1', 'PROBLEM_COMPLETE'),
    ]);
    expect(compulsory[0]).toContain('הזין בעיגול הזיכרון של טור העשרות ספרה שגויה (פעם אחת, הספרה 2), מחק את הספרה מעיגול הזיכרון של טור העשרות');
  });

  it('the engine receives input_target only as the memory circle of a digit event', () => {
    const summary = buildTelemetrySummary([
      ev('s4_g_t1', 'DIGIT_ENTERED', { digit_value: 1, is_correct: true, input_target: 'carry_circle' }, 1),
      ev('s4_g_t1', 'DIGIT_ENTERED', { digit_value: 1, is_correct: true, input_target: 'something_else' }, 1),
      ev('s4_g_t1', 'HESITATION_DETECTED', { hesitation_seconds: 45, input_target: 'carry_circle' }, 1),
    ]);
    expect(summary[0].details.input_target).toBe('carry_circle');
    expect(summary[1].details).not.toHaveProperty('input_target');
    expect(summary[2].details).not.toHaveProperty('input_target');
  });
});

describe('L15 / L21 — one name for measure 1, the PRD chapter names, no engine version', () => {
  it('the choice heading names measure 1 as the PRD does', () => {
    expect(CHOICE_EXERCISES_HEADING_HE).toContain('ציון ניסיון ראשון (מדד 1)');
    expect(CHOICE_EXERCISES_HEADING_HE).not.toContain('ציון השליטה');
    expect(src('classReport.ts')).toContain('`לומד | ${FIRST_ATTEMPT_SCORE_LABEL_HE} | נכון בניסיון ראשון |');
  });

  it('"סיפור התרגילים", "פערי הידע", and no "מנוע MathematiCore v7.0" in either renderer', () => {
    const html = pedagogicalReportHtml({ session_number: 4, score_percent: 86, exercise_narratives: ['x'], knowledge_gaps: ['y'] });
    expect(html).toContain('2. סיפור התרגילים</h2>');
    expect(html).toContain('3. פערי הידע והמלצות ההוראה</h2>');
    expect(html).toContain('פערי הידע שאותרו:');
    expect(html).not.toContain('הכרונולוגי');
    expect(reportFooterTemplate(0)).not.toContain('MathematiCore v7');
    for (const f of ['reportHtml.ts', 'pedagogicalReport.ts', 'classReport.ts']) expect(src(f), f).not.toContain('מנוע MathematiCore v7.0');
  });
});

describe('L16 / L17 — the meeting-1 class report', () => {
  const learner = [ev('s1_t5', 'DIGIT_ENTERED', { is_correct: false, digit_value: 3 }, 0), ev('s1_t5', 'PROBLEM_COMPLETE'), ev('s1_t5', 'HELP_REQUESTED')];
  const row = buildLearnerRow(4, learner, null, 'green_path', null, null, 0, null, { sessionNumber: 1, allEvents: learner });
  const a = aggregateClass([row], new Map([[4, learner]]), 1);
  const html = classReportHtml({ session_number: 1, aggregates: a, learners: [row] });

  it('prints the help and chat paragraph', () => {
    expect(html).toContain('קריאות שקטות למורה: 1');
    expect(html).toContain('בקשות עזרה מהצ׳אט: 0');
  });

  it('the exercise table has no percentage', () => {
    expect(html).not.toContain('אחוז בניסיון ראשון');
    const table = html.slice(html.indexOf('3. תרגילי הריענון'), html.indexOf('4. טבלת הלומדים'));
    expect(table).not.toContain('%');
  });
});

describe('L22 — no qMatrixResults score fallback', () => {
  it('the learner report scores from the session document or the telemetry only', () => {
    const report = src('pedagogicalReport.ts').replace(/^\s*\/\/.*$/gm, '');
    expect(report).not.toContain('qMatrixResults');
    expect(report).not.toContain('"q_matrix"');
  });
});

describe('L23 — never a raw id, never a default operation', () => {
  it('an exercise the catalog does not have: operation null, a Hebrew label', () => {
    const [ex] = buildFailedExercises(['s5_g_t3'], {}, [], 5, 'green_path');
    expect(ex.operation).toBeNull();
    expect(ex.label).toBe('תרגיל במפגש 5, מס׳ זיהוי 3');
    expect(ex.label).not.toMatch(/[A-Za-z]/);
  });

  it('"לפני האיפוס" names an untitled exercise in Hebrew', () => {
    const runs = splitMeetingRuns([
      { data: { ...ev('s3_g_t2', 'DIGIT_ENTERED', { is_correct: false }, 0), client_timestamp: 1 }, writtenAtMs: 1 },
    ], [{ at: 10, reason: null, scope: 'active_session' }]);
    const pre = buildPreResetRecord(runs, {})!;
    expect(pre.exercises[0].line_he).toMatch(/^תרגיל במפגש 3, מס׳ זיהוי 2: /);
  });
});

describe('L24 — the secondary PDF engine prints landscape, with the catch-up block', () => {
  it('landscape A4, and the block in the same lines as the Chromium one', async () => {
    const catchUp = buildClassCatchUpSummary({
      4: { student_id: 4, session_number: 3, class_id: 'class_1', rounds: { r_1: { action: 'reopen', reason: 'technical_fault', note: null, stopped_at: null, recorded_by: 't', recorded_at: 1, opened_at: 1, closed_at: 2, closed_by: 'teacher', active_minutes: 4 } } },
    });
    expect(classCatchUpLinesHe(catchUp)).toEqual([
      'קיבלו זמן השלמה: תלמיד אחד, 4 דקות בסך הכול',
      'סיבות שנרשמו: תקלה טכנית: תלמיד אחד',
      'תלמיד 4: קיבל זמן השלמה: 4 דקות · סיבה: תקלה טכנית',
    ]);
    const events = [ev('s3_g_t1', 'PROBLEM_COMPLETE')];
    const row = buildLearnerRow(4, events, 7, 'green_path', null, null, 0, null, { sessionNumber: 3, allEvents: events });
    const pdf = await createClassReportPdfBufferWithPdfkit({
      title_he: 'דוח כיתה', session_number: 3, aggregates: aggregateClass([row], new Map([[4, events]]), 3), learners: [row], catch_up: catchUp,
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
    expect(src('classReport.ts')).toContain('heading(`4ד. ${CATCH_UP_HEADING_HE}`);');
  }, 30000);
});

describe('L25 — the first completion decides; an unopened compulsory exercise is told', () => {
  it('reopened and completed again after a wrong digit: still first try', () => {
    const outcomes = computeExerciseOutcomes([
      ev('s4_g_t1', 'PROBLEM_COMPLETE'),
      ev('s4_g_t1', 'DIGIT_ENTERED', { is_correct: false }, 0),
      ev('s4_g_t1', 'PROBLEM_COMPLETE'),
    ]);
    expect(outcomes.s4_g_t1).toBe('first_try');
  });

  it('"לא נפתח" in its place in the meeting, with the bank of the meeting', () => {
    const bank = ['s4_g_t1', 's4_g_t2', 's4_g_t3'];
    const { compulsory } = generateExerciseNarrativeFromEvents([ev('s4_g_t1', 'PROBLEM_COMPLETE'), ev('s4_g_t3', 'PROBLEM_COMPLETE')], {}, bank);
    expect(compulsory).toEqual([
      'בתרגיל הראשון (תרגיל במפגש 4, מס׳ זיהוי 1) הלומד השלים את התרגיל בניסיון הראשון.',
      'התרגיל השני (תרגיל במפגש 4, מס׳ זיהוי 2) לא נפתח.',
      'בתרגיל השלישי (תרגיל במפגש 4, מס׳ זיהוי 3) הלומד השלים את התרגיל בניסיון הראשון.',
    ]);
  });

  it('another track\'s bank (none of its exercises opened) adds nothing', () => {
    const { compulsory } = generateExerciseNarrativeFromEvents([ev('s4_r_t1', 'PROBLEM_COMPLETE')], {}, ['s4_g_t1', 's4_g_t2']);
    expect(compulsory).toHaveLength(1);
    expect(compulsory[0]).not.toContain('לא נפתח');
  });
});
