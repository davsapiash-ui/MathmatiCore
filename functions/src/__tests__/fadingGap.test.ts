import { describe, it, expect } from 'vitest';
import { computeFadingGap, exerciseAttempts, summarizeMeeting, FADING_GUESS_SECONDS } from '../meetingMetrics';

/**
 * פער הדעיכה (מסמך 03 §1.3 א׳ ו-§3.8; Bassette et al., 2020). מפגש 8 נפתר
 * בלי לבנים על מספרים שהלומד פגש עם לבנים במפגשים 4–6, ולכן אפשר להשוות
 * את הלומד לעצמו על אותו תרגיל: דיוק בניסיון ראשון וזמן, עם ובלי.
 * החלטת בעל המוצר 16.9.2026 (סטייה 19).
 */
const ev = (session: number, exercise: string, type: string, details: Record<string, unknown> = {}, t = 0) => ({
  session_id: `session_${session}_student_user1`,
  student_id: 'student_user1',
  exercise_id: exercise,
  event_type: type,
  details,
  client_timestamp: 1_000_000 + t,
});

describe('exerciseAttempts', () => {
  it('a wrong digit before completion means not first try; duration comes from PROBLEM_COMPLETE', () => {
    const a = exerciseAttempts([
      ev(4, 's4_r_t1', 'DIGIT_ENTERED', { digit_value: 3, is_correct: false }, 1),
      ev(4, 's4_r_t1', 'PROBLEM_COMPLETE', { total_duration_ms: 42_000, undo_count: 0, error_count: 1 }, 2),
      ev(4, 's4_r_t2', 'PROBLEM_COMPLETE', { total_duration_ms: 30_000, undo_count: 0, error_count: 0 }, 3),
      ev(4, 's4_r_t3', 'PROBLEM_LOAD', {}, 4),
    ]);
    expect(a.s4_r_t1).toEqual({ completed: true, first_try: false, duration_ms: 42_000 });
    expect(a.s4_r_t2).toEqual({ completed: true, first_try: true, duration_ms: 30_000 });
    expect(a.s4_r_t3).toEqual({ completed: false, first_try: false, duration_ms: null });
  });
});

describe('computeFadingGap', () => {
  const earlier = [
    ev(4, 's4_r_t1', 'PROBLEM_COMPLETE', { total_duration_ms: 60_000 }, 1),
    ev(4, 's4_r_t2', 'DIGIT_ENTERED', { is_correct: false }, 2),
    ev(4, 's4_r_t2', 'PROBLEM_COMPLETE', { total_duration_ms: 90_000 }, 3),
    ev(5, 's5_r_t1', 'PROBLEM_COMPLETE', { total_duration_ms: 50_000 }, 4),
  ];

  it('compares each session-8 exercise with its session 4–6 twin, for the same learner', () => {
    const gap = computeFadingGap(
      [
        ev(8, 's8_r_t1', 'PROBLEM_COMPLETE', { total_duration_ms: 20_000 }, 1), // twin s4_r_t1
        ev(8, 's8_r_t2', 'DIGIT_ENTERED', { is_correct: false }, 2),
        ev(8, 's8_r_t2', 'PROBLEM_COMPLETE', { total_duration_ms: 40_000 }, 3), // twin s4_r_t2
        ev(8, 's8_r_t4', 'PROBLEM_COMPLETE', { total_duration_ms: 10_000 }, 4), // twin s5_r_t1 — rushed
        ev(8, 's8_r_t7', 'PROBLEM_COMPLETE', { total_duration_ms: 30_000 }, 5), // missing-digit puzzle: no twin
      ],
      earlier
    );
    expect(gap.pairs_measured).toBe(3);
    expect(gap.accuracy_with_blocks_percent).toBe(67); // s4_r_t2 was not first try
    expect(gap.accuracy_without_blocks_percent).toBe(67); // s8_r_t2 was not first try
    expect(gap.mean_seconds_with_blocks).toBe(66.7);
    expect(gap.mean_seconds_without_blocks).toBe(23.3);
    expect(gap.guessed_exercises).toEqual(['s8_r_t4']);
    expect(gap.unpaired_exercises).toEqual(['s8_r_t7']);
  });

  it('a twin that was never completed with blocks is not a pair; with no pairs the percentages are null, not 0', () => {
    const gap = computeFadingGap([ev(8, 's8_r_t5', 'PROBLEM_COMPLETE', { total_duration_ms: 20_000 })], earlier);
    expect(gap.pairs_measured).toBe(0);
    expect(gap.accuracy_with_blocks_percent).toBeNull();
    expect(gap.accuracy_without_blocks_percent).toBeNull();
    expect(gap.mean_seconds_without_blocks).toBeNull();
  });

  it('the rushed threshold is the calibration point the owner can change', () => {
    expect(FADING_GUESS_SECONDS).toBe(15);
  });
});

describe('summarizeMeeting counts the three scaffold events (register deviation 19)', () => {
  it('grid openings by stage and by learner, blocked keystrokes, silent help calls', () => {
    const s = summarizeMeeting([
      ev(4, 's4_r_t1', 'ADAPTIVE_GRID_TOGGLED', { action: 'opened', source: 'hesitation_30s' }, 1),
      ev(4, 's4_r_t1', 'ADAPTIVE_GRID_TOGGLED', { action: 'closed', source: 'learner' }, 2),
      ev(4, 's4_r_t1', 'ADAPTIVE_GRID_TOGGLED', { action: 'opened', source: 'learner' }, 3),
      ev(4, 's4_r_t2', 'KEYBOARD_LOCK_BLOCKED', { conversion_required: 'composition' }, 4),
      ev(4, 's4_r_t2', 'KEYBOARD_LOCK_BLOCKED', { conversion_required: 'composition' }, 5),
      ev(4, 's4_r_t3', 'HELP_REQUESTED', { help_count: 1 }, 6),
    ]);
    expect(s.grid_openings).toBe(1);
    expect(s.grid_reopenings).toBe(1);
    expect(s.keyboard_lock_blocks).toBe(2);
    expect(s.help_requests).toBe(1);
  });
});
