import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  describeEvent,
  groupEventsBySession,
  parseRecordingEvents,
  parseRecordingSessions,
  sessionNumberFromSessionId,
  type JourneyEvent,
} from '@/infrastructure/services/LearnerJourneyService';

/**
 * Module 21 states things about the replay that are easy to lose in a refactor
 * and impossible to notice from the UI until a teacher needs them mid-lesson:
 *
 *   "לכל מקטע נשמרת מטא-דאטה הכוללת exercise_id בנוסף לחותמות הזמן"
 *   "ההקלטה מוגבלת ל-50MB לכל לומד לכל מפגש... נרשם דגל recording_truncated: true"
 *   "חל איסור מוחלט על השלכת מקטע שנכשל"
 *   "ציר זמן... המחולק חזותית לקטעים לפי exercise_id"
 *   "טבלת ציר ההחלטות... populated from the typed TelemetryDetailsMap payloads"
 *
 * The recorder only runs inside a live rrweb session, so its wiring is asserted
 * at the source; the journey parsing is pure and tested directly.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

describe('Module 21 — recorder contract (learner side)', () => {
  const workspace = read('../../features/workspace/StudentWorkspacePage.tsx');

  it('writes exercise_id into every chunk metadata record', () => {
    expect(workspace).toMatch(/exercise_id:\s*currentExerciseId\(\)/);
  });

  it('caps a learner recording at 50MB per meeting and flags recording_truncated', () => {
    expect(workspace).toMatch(/RECORDING_BYTE_CAP\s*=\s*50\s*\*\s*1024\s*\*\s*1024/);
    expect(workspace).toMatch(/recordedBytes \+ payloadBytes > RECORDING_BYTE_CAP/);
    expect(workspace).toMatch(/recording_truncated:\s*true/);
  });

  it('never drops a chunk whose write failed — it is queued for retry', () => {
    expect(workspace).toMatch(/indexedDBQueue\.enqueue\(chunksPath, \{ idempotency_key: chunkKey, data: payload \}\)/);
    expect(workspace).toMatch(/indexedDBQueue\.enqueue\(metadataPath, \{ idempotency_key: chunkKey, \.\.\.metaPayload \}\)/);
  });
});

describe('Module 21 — learner journey parsing (teacher side)', () => {
  const node = {
    session_1757000000000: {
      recording_truncated: true,
      chunks: {
        a: JSON.stringify([{ type: 4, timestamp: 1000, data: {} }, { type: 2, timestamp: 1010, data: {} }]),
        // A chunk re-sent through the offline queue is stored as { data }.
        b: { idempotency_key: 'b', data: JSON.stringify([{ type: 3, timestamp: 3000, data: {} }]) },
        broken: '{not json',
      },
      metadata: {
        a: { startTime: 1000, endTime: 2000, sessionNumber: 4, exercise_id: 's4_g_t1' },
        b: { startTime: 2000, endTime: 3000, sessionNumber: 4, exercise_id: 's4_g_t1' },
        c: { startTime: 3000, endTime: 4000, sessionNumber: 4, exercise_id: 's4_g_t2' },
      },
    },
    session_1757100000000: {
      chunks: { x: JSON.stringify([{ type: 4, timestamp: 9000, data: {} }]) },
      metadata: { x: { startTime: 9000, endTime: 9500, sessionNumber: 5, exercise_id: 's5_g_t1' } },
    },
  };

  it('yields one recording per login, stamped with its meeting number and truncation flag', () => {
    const sessions = parseRecordingSessions(node);
    expect(sessions.map((s) => s.sessionNumber)).toEqual([4, 5]);
    expect(sessions[0].truncated).toBe(true);
    expect(sessions[1].truncated).toBe(false);
    expect(sessions[0].chunkCount).toBe(3);
    expect(sessions[0].start).toBe(1000);
    expect(sessions[0].end).toBe(4000);
  });

  it('merges adjacent chunks of the same exercise into one chapter, in order', () => {
    const [s4] = parseRecordingSessions(node);
    expect(s4.chapters).toEqual([
      { exerciseId: 's4_g_t1', start: 1000, end: 3000 },
      { exerciseId: 's4_g_t2', start: 3000, end: 4000 },
    ]);
  });

  it('plays string chunks and re-sent { data } chunks alike, skipping a corrupt one', () => {
    const [s4] = parseRecordingSessions(node);
    const events = parseRecordingEvents([s4]);
    expect(events.map((e) => e.timestamp)).toEqual([1000, 1010, 3000]);
  });

  it('reads the meeting number out of the telemetry session_id', () => {
    expect(sessionNumberFromSessionId('session_3_student_user4')).toBe(3);
    expect(sessionNumberFromSessionId('session_8_student_7')).toBe(8);
    expect(sessionNumberFromSessionId('session_1')).toBe(1);
    expect(sessionNumberFromSessionId('session_42_x')).toBeNull();
    expect(sessionNumberFromSessionId('')).toBeNull();
  });

  it('groups events by meeting and keeps each meeting in time order', () => {
    const mk = (n: number, t: number): JourneyEvent => ({
      id: `${n}_${t}`, timestamp: t, sessionNumber: n, sessionId: `session_${n}_student_user1`, exerciseId: 'x', eventType: 'DIGIT_ENTERED', details: {},
    });
    const grouped = groupEventsBySession([mk(3, 30), mk(2, 20), mk(3, 10), { ...mk(1, 5), sessionNumber: null }]);
    expect([...grouped.keys()].sort()).toEqual([2, 3]);
    expect(grouped.get(3)!.map((e) => e.timestamp)).toEqual([10, 30]);
  });

  it('describes events from their own details only, and marks self-regulation rows', () => {
    const base = { id: 'e', timestamp: 0, sessionNumber: 4, sessionId: 's', exerciseId: 's4_g_t1' };
    expect(describeEvent({ ...base, eventType: 'DIGIT_ENTERED', columnIndex: 1, details: { digit_value: 7, is_correct: false } }))
      .toMatchObject({ label: 'הקלדת ספרה', detail: '7 בטור העשרות — שגוי', selfRegulation: false, attention: true });
    expect(describeEvent({ ...base, eventType: 'UNDO_EXECUTED', details: { undo_stack_depth_before: 2, reverted_event_type: 'BLOCK_DRAG_COMPLETE' } }))
      .toMatchObject({ label: 'ביטול פעולה', detail: 'ביטל: גרירת לבנה', selfRegulation: true });
    expect(describeEvent({ ...base, eventType: 'DIGIT_DELETED', columnIndex: 0, details: { deleted_digit_value: 3 } }).selfRegulation).toBe(true);
    expect(describeEvent({ ...base, eventType: 'HESITATION_DETECTED', columnIndex: 2, details: { hesitation_seconds: 45 } }))
      .toMatchObject({ detail: '45 שניות ללא פעולה בטור המאות', attention: true });
    expect(describeEvent({ ...base, eventType: 'SOCRATIC_CARD_SHOWN', details: { trigger_reason: 'conversion_not_performed', error_category: 'procedural' } }).detail)
      .toBe('לא בוצעה המרה נדרשת · סיווג: רכיב');
  });
});

describe('Module 21 — split screen wiring (teacher side)', () => {
  const journey = read('../../presentation/pages/TeacherDashboard/components/LearnerJourney.tsx');

  it('seeks the player from a table row and from a chapter, through an explicit request', () => {
    expect(journey).toMatch(/onClick=\{\(\) => requestSeek\(e\.timestamp\)\}/);
    expect(journey).toMatch(/requestSeek\(c\.start\)/);
    expect(journey).toMatch(/seekToTime=\{seekRequest\?\.t\}/);
  });

  it('highlights the table row from the playhead, never the other way round', () => {
    expect(journey).toMatch(/onProgress=\{\(absTs\) => setPlayheadTs\(absTs\)\}/);
    expect(journey).not.toMatch(/seekToTime=\{.*highlighted/);
  });

  it('shows the Module 21 fallback text when no recording exists', () => {
    expect(journey).toContain('וידאו השחזור בהכנה');
  });

  it('carries no fabricated board state', () => {
    expect(journey).not.toMatch(/stepRatio|Math\.random|idx % 2/);
  });
});
