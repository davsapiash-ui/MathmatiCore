import { describe, it, expect } from 'vitest';
import { buildMeetingExport, meetingExportFileName } from '../meetingExport';
import type { JourneyEvent } from '@/infrastructure/services/LearnerJourneyService';

const ev = (id: string, timestamp: number, exerciseId: string): JourneyEvent => ({
  id, timestamp, sessionNumber: 4, sessionId: 's', exerciseId, eventType: 'BLOCK_ADDED', details: {},
});

describe('meeting export', () => {
  const now = new Date('2026-10-06T12:00:00Z');

  it('holds every action of the meeting in time order, the chapters and the recording', () => {
    const data = buildMeetingExport({
      learner: 3,
      meeting: 4,
      actions: [ev('b', 200, 's4_t2'), ev('a', 100, 's4_t1')],
      resets: [{ at: 150 }],
      chapters: [{ exerciseId: 's4_t1', start: 90, end: 160 } as never],
      recordingEvents: [{ type: 2, timestamp: 95 }],
      truncated: false,
      now,
    });
    expect(data.format).toBe('mathematicore-meeting-export');
    expect(data.learner).toBe(3);
    expect(data.meeting).toBe(4);
    expect(data.actions.map((a) => a.id)).toEqual(['a', 'b']);
    expect(data.resets).toEqual([{ at: 150 }]);
    expect(data.chapters).toHaveLength(1);
    expect(data.recording).toEqual({ truncated: false, events: [{ type: 2, timestamp: 95 }] });
    expect(data.exportedAt).toBe('2026-10-06T12:00:00.000Z');
  });

  it('names the file by learner number, meeting and date — no personal detail', () => {
    expect(meetingExportFileName(3, 4, now)).toBe('mathematicore-learner-3-meeting-4-2026-10-06.json');
  });
});
