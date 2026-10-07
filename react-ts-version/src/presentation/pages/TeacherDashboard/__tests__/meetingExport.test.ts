import { describe, it, expect } from 'vitest';
import { buildMeetingExport, buildMeetingViewerHtml, meetingExportFileName, meetingExportRows } from '../meetingExport';
import type { JourneyEvent } from '@/infrastructure/services/LearnerJourneyService';

const ev = (id: string, timestamp: number, exerciseId: string): JourneyEvent => ({
  id, timestamp, sessionNumber: 4, sessionId: 's', exerciseId, eventType: 'BLOCK_ADDED', details: {},
});

describe('meeting export', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const data = buildMeetingExport({
    learner: 3,
    meeting: 4,
    actions: [ev('b', 200, 's4_t2'), ev('a', 100, 's4_t1')],
    resets: [],
    chapters: [{ exerciseId: 's4_t1', start: 90, end: 160 } as never],
    recordingEvents: [{ type: 2, timestamp: 95 }],
    truncated: false,
    now,
  });

  it('holds every action of the meeting in time order, the chapters and the recording', () => {
    expect(data.format).toBe('mathematicore-meeting-export');
    expect(data.learner).toBe(3);
    expect(data.meeting).toBe(4);
    expect(data.actions.map((a) => a.id)).toEqual(['a', 'b']);
    expect(data.chapters).toHaveLength(1);
    expect(data.recording).toEqual({ truncated: false, events: [{ type: 2, timestamp: 95 }] });
    expect(data.exportedAt).toBe('2026-10-06T12:00:00.000Z');
  });

  it('is a web page named by learner number, meeting and date — no personal detail', () => {
    // Owner, 6.10.2026: the .json download opened as code ("יורד JS").
    expect(meetingExportFileName(3, 4, now)).toBe('mathematicore-learner-3-meeting-4-2026-10-06.html');
  });

  it('the page carries the table rows, the data and the player library, in Hebrew, right to left', () => {
    const rows = meetingExportRows(data);
    expect(rows.filter((r) => r.kind === 'event')).toHaveLength(2);
    const html = buildMeetingViewerHtml(data, { js: 'window.rrweb = {};', css: '.replayer-wrapper{}' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html).toContain('תלמיד 3 · מפגש 4');
    expect(html).toContain('window.rrweb = {};');
    const json = html.match(/<script type="application\/json" id="meeting-data">([\s\S]*?)<\/script>/)?.[1];
    expect(JSON.parse(json!)).toEqual(data);
  });

  it('recorded text cannot close the page\'s script early', () => {
    const tricky = { ...data, recording: { truncated: false, events: [{ type: 3, timestamp: 96, data: { text: '</script><b>x</b>' } }] } };
    const html = buildMeetingViewerHtml(tricky, { js: '', css: '' });
    expect(html).not.toContain('</script><b>');
  });
});
