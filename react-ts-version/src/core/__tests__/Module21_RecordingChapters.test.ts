import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 21 states three things about the replay recording that are easy to
 * lose in a refactor and impossible to notice from the UI until a teacher needs
 * them mid-lesson:
 *
 *   "לכל מקטע נשמרת מטא-דאטה הכוללת exercise_id בנוסף לחותמות הזמן"
 *   "ההקלטה מוגבלת ל-50MB לכל לומד לכל מפגש... נרשם דגל recording_truncated: true"
 *   "ציר זמן... המחולק חזותית לקטעים לפי exercise_id... לחיצה על קטע מדלגת
 *    ישירות לתחילת אותו תרגיל"
 *
 * These assert the wiring at its source, because the recorder only runs inside a
 * live rrweb session against Realtime Database and has no seam to unit-test.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

describe('Module 21 — replay recording contract', () => {
  const workspace = read('../../features/workspace/StudentWorkspacePage.tsx');
  const replay = read('../../presentation/pages/TeacherDashboard/components/StudentReplayAndLogs.tsx');

  it('writes exercise_id into every chunk metadata record', () => {
    expect(workspace).toMatch(/exercise_id:\s*currentExerciseId\(\)/);
  });

  it('caps a learner recording at 50MB per meeting', () => {
    expect(workspace).toMatch(/RECORDING_BYTE_CAP\s*=\s*50\s*\*\s*1024\s*\*\s*1024/);
    expect(workspace).toMatch(/recordedBytes \+ payloadBytes > RECORDING_BYTE_CAP/);
  });

  it('flags recording_truncated instead of failing loudly at the cap', () => {
    expect(workspace).toMatch(/recording_truncated:\s*true/);
  });

  it('groups chunks into per-exercise chapters for the player timeline', () => {
    expect(replay).toMatch(/type ExerciseChapter/);
    expect(replay).toMatch(/last\.exerciseId === c\.exerciseId/);
  });

  it('seeks to a chapter start on click', () => {
    expect(replay).toMatch(/onClick=\{\(\) => requestSeek\(ch\.start\)\}/);
  });

  it('never lets the auto-highlight drive the player, so both directions stay live', () => {
    // seekToTime bound to the highlighted row's timestamp is the feedback loop
    // that made playback jump to whichever row it had just highlighted.
    expect(replay).not.toMatch(/seekToTime=\{currentEvent\?\.timestamp\}/);
    expect(replay).toMatch(/seekToTime=\{seekRequest\?\.t\}/);
  });
});
