/**
 * Catch-up (owner decision 2.10.2026): how a learner enters a meeting the
 * teacher opened again — the plan, per meeting.
 */
import { describe, it, expect } from 'vitest';
import { planMeetingEntry, isPastCompulsoryInProgress } from '../meetingEntry';

const copy = (meeting: number, extra: Record<string, unknown> = {}) => ({
  sessionNumber: meeting, flowStatus: 'task', standardTaskIdx: 3, hasInteracted: true, savedAt: 100, ...extra,
});

describe('planMeetingEntry', () => {
  it.each([1, 3, 4, 5, 6, 7, 8])('meeting %i finished (mark): the quiet end screen, from its own copy', (m) => {
    const record = {
      completedMeetings: { [`m${m}`]: 500 },
      workspaceByMeeting: { [`m${m}`]: copy(m, { flowStatus: 'sessionDone', standardTaskIdx: 6 }) },
      workspaceState: copy(m === 8 ? 7 : m + 1, { savedAt: 900 }),
    };
    const entry = planMeetingEntry(record, null, m);
    expect(entry.kind).toBe('finished');
    if (entry.kind !== 'finished') return;
    expect(entry.snapshot.flowStatus).toBe('sessionDone');
    expect(entry.snapshot.sessionNumber).toBe(m);
    expect(entry.snapshot.standardTaskIdx).toBe(6);
  });

  it('finished before per-meeting copies existed (highestCompletedMeeting only): end screen with no copy', () => {
    const entry = planMeetingEntry({ highestCompletedMeeting: 5, workspaceState: copy(6) }, null, 4);
    expect(entry).toEqual({ kind: 'finished', snapshot: { sessionNumber: 4, flowStatus: 'sessionDone' } });
  });

  it('marked finished but the copy stopped earlier: the end screen, never a redo', () => {
    const record = { completedMeetings: { m1: 1 }, workspaceByMeeting: { m1: copy(1, { standardTaskIdx: 2 }) } };
    const entry = planMeetingEntry(record, null, 1);
    expect(entry.kind).toBe('finished');
  });

  it.each([3, 4, 5, 6, 7])('meeting %i finished at the choice or in an optional exercise: restored there', (m) => {
    const atChoice = { workspaceByMeeting: { [`m${m}`]: copy(m, { flowStatus: 'choice_branch', standardTaskIdx: 6 }) } };
    expect(planMeetingEntry(atChoice, null, m)).toMatchObject({ kind: 'resume', snapshot: { flowStatus: 'choice_branch' } });

    const inBranch = {
      completedMeetings: { [`m${m}`]: 1 },
      workspaceByMeeting: { [`m${m}`]: copy(m, { selectedBranch: 'challenge', standardTaskIdx: 8 }) },
    };
    expect(planMeetingEntry(inBranch, null, m)).toMatchObject({ kind: 'resume', snapshot: { selectedBranch: 'challenge', standardTaskIdx: 8 } });
  });

  it.each([1, 3, 4, 5, 6, 7, 8])('meeting %i unfinished: resumes at its saved exercise, after the class moved on', (m) => {
    const record = {
      workspaceByMeeting: { [`m${m}`]: copy(m, { standardTaskIdx: 4 }) },
      workspaceState: copy(m === 8 ? 7 : m + 1, { savedAt: 900 }),
      highestCompletedMeeting: m - 1,
    };
    expect(planMeetingEntry(record, null, m)).toMatchObject({ kind: 'resume', snapshot: { sessionNumber: m, standardTaskIdx: 4 } });
  });

  it('meeting 8 unfinished at the reflection board: back to the board', () => {
    const record = { workspaceByMeeting: { m8: copy(8, { flowStatus: 'reflection', standardTaskIdx: 6 }) } };
    expect(planMeetingEntry(record, null, 8)).toMatchObject({ kind: 'resume', snapshot: { flowStatus: 'reflection' } });
  });

  it("this device's later copy of the meeting wins over the record's (X55)", () => {
    const record = { workspaceByMeeting: { m5: copy(5, { standardTaskIdx: 2, savedAt: 100 }) } };
    expect(planMeetingEntry(record, copy(5, { standardTaskIdx: 4, savedAt: 200 }), 5))
      .toMatchObject({ kind: 'resume', snapshot: { standardTaskIdx: 4 } });
  });

  it('nothing saved and not finished: the meeting starts', () => {
    expect(planMeetingEntry({ highestCompletedMeeting: 2 }, null, 3)).toEqual({ kind: 'start' });
    expect(planMeetingEntry(null, null, 1)).toEqual({ kind: 'start' });
  });

  it('meeting 2 is never planned as finished (its own screens, #196/#207)', () => {
    const record = { completedMeeting2: true, workspaceState: copy(2, { qflow: { phase: 'primary' } }) };
    expect(planMeetingEntry(record, null, 2).kind).toBe('resume');
    expect(planMeetingEntry({ completedMeeting2: true }, null, 2).kind).toBe('start');
  });
});

describe('isPastCompulsoryInProgress', () => {
  it('only meetings 3–7, only the choice or an optional exercise', () => {
    expect(isPastCompulsoryInProgress(copy(4, { flowStatus: 'choice_branch' }), 4)).toBe(true);
    expect(isPastCompulsoryInProgress(copy(4, { selectedBranch: 'reinforcement' }), 4)).toBe(true);
    expect(isPastCompulsoryInProgress(copy(4, { selectedBranch: 'reinforcement', flowStatus: 'sessionDone' }), 4)).toBe(false);
    expect(isPastCompulsoryInProgress(copy(4), 4)).toBe(false);
    expect(isPastCompulsoryInProgress(copy(8, { flowStatus: 'choice_branch' }), 8)).toBe(false);
    expect(isPastCompulsoryInProgress(null, 4)).toBe(false);
  });
});
