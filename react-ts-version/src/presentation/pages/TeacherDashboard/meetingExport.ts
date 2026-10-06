/**
 * The learner-journey screen's "הורדת המפגש": one file with everything the
 * screen shows for a meeting — every recorded action of the meeting (not only
 * the exercise picked in the table), the resets that cut it, the chapters,
 * and the recording itself (the rrweb events the player replays). Owner's
 * request, 6.10.2026, so a meeting can be studied outside the dashboard.
 *
 * Nothing here is new data: the learner is the anonymous number 1–12 the
 * screen already shows, and the file holds what the screen already read.
 */
import type { JourneyEvent, RecordingChapter } from '@/infrastructure/services/LearnerJourneyService';

export interface MeetingExport {
  format: 'mathematicore-meeting-export';
  version: 1;
  exportedAt: string;
  learner: number;
  meeting: number;
  actions: JourneyEvent[];
  resets: unknown[];
  chapters: RecordingChapter[];
  recording: { truncated: boolean; events: unknown[] };
}

export function buildMeetingExport(input: {
  learner: number;
  meeting: number;
  actions: JourneyEvent[];
  resets: unknown[];
  chapters: RecordingChapter[];
  recordingEvents: unknown[];
  truncated: boolean;
  now?: Date;
}): MeetingExport {
  return {
    format: 'mathematicore-meeting-export',
    version: 1,
    exportedAt: (input.now ?? new Date()).toISOString(),
    learner: input.learner,
    meeting: input.meeting,
    actions: [...input.actions].sort((a, b) => a.timestamp - b.timestamp),
    resets: input.resets,
    chapters: input.chapters,
    recording: { truncated: input.truncated, events: input.recordingEvents },
  };
}

/** e.g. mathematicore-learner-3-meeting-4-2026-10-06.json */
export function meetingExportFileName(learner: number, meeting: number, now: Date = new Date()): string {
  return `mathematicore-learner-${learner}-meeting-${meeting}-${now.toISOString().slice(0, 10)}.json`;
}

export function downloadMeetingExport(data: MeetingExport): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = meetingExportFileName(data.learner, data.meeting, new Date(data.exportedAt));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
