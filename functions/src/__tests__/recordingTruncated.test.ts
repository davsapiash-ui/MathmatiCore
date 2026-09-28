import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { meetingRecordingTruncated, truncatedRecordingMeetings } from '../meetingMetrics';

/**
 * Module 21: "ההקלטה מוגבלת ל-50MB לכל לומד לכל מפגש… נרשם דגל recording_truncated: true".
 * The learner's client keeps the budget per meeting, and flags it there
 * (users/students/{id}/recorded_bytes/meeting_{N}/truncated). The per-meeting
 * reports must find that flag — also when the recording that reached the cap
 * holds no chunk, and so no metadata that names its meeting.
 */
describe('Module 21 — the per-meeting truncation flag', () => {
  const learner = {
    telemetry_sessions: {
      // The recording that hit the cap with its first chunk: no metadata at all.
      session_1790000000000: { recording_truncated: true },
    },
    recorded_bytes: {
      meeting_4: { chunks: { a: 10, b: 20 }, truncated: true },
      meeting_5: { chunks: { c: 30 } },
    },
  };

  it('reads the flag of the meeting from the learner\'s budget', () => {
    expect(meetingRecordingTruncated(learner, 4)).toBe(true);
    expect(meetingRecordingTruncated(learner, 5)).toBe(false);
    expect(meetingRecordingTruncated(learner, 6)).toBe(false);
    expect(meetingRecordingTruncated({}, 4)).toBe(false);
    expect(meetingRecordingTruncated(null, 4)).toBe(false);
    expect(truncatedRecordingMeetings(learner)).toEqual([4]);
    expect(truncatedRecordingMeetings({ recorded_bytes: 7 })).toEqual([]);
  });

  it('the class report and the research export both read it, beside the recording\'s own flag', () => {
    const classReport = readFileSync(resolve(__dirname, '../classReport.ts'), 'utf-8');
    expect(classReport).toMatch(/meetingRecordingTruncated\(node, sessionNumber\)/);
    expect(classReport).toMatch(/rec\.recording_truncated === true/);
    const exportReport = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');
    expect(exportReport).toMatch(/for \(const meeting of truncatedRecordingMeetings\(node\)\)/);
    expect(exportReport).toMatch(/rec\.recording_truncated === true/);
  });
});
