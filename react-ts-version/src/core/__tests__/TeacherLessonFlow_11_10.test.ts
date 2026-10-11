/**
 * Round two of the teacher interface (owner decision 11.10.2026): the radar
 * tile's progress and clocks, and the after-close summary — read from data the
 * learner record and the mediation log already hold.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/firebase', () => ({ serverNow: () => 1_000_000 }));

import { tileProgressOf, tileProgressHe, elapsedClockHe, stateSinceOf, buildMeetingSummary, LESSON_FLOW_HE, TILE_HE } from '@/core/teacherLessonFlow';

const ws = (sessionNumber: number, over: Record<string, unknown> = {}) => ({ workspaceState: { sessionNumber, flowStatus: 'task', standardTaskIdx: 0, savedAt: 1, ...over } });

describe('B — the tile says where the learner is in the open meeting', () => {
  it('"משימה N/7" from the compulsory task index (meetings 3–8), clamped', () => {
    expect(tileProgressOf(ws(4, { standardTaskIdx: 3 }), 4)).toEqual({ kind: 'task', taskNumber: 4 });
    expect(tileProgressOf(ws(4, { standardTaskIdx: 12 }), 4)).toEqual({ kind: 'task', taskNumber: 7 });
    expect(tileProgressHe({ kind: 'task', taskNumber: 4 })).toBe('משימה 4/7');
  });
  it('meeting 2 reads the diagnostic task index', () => {
    expect(tileProgressOf(ws(2, { qflow: { taskIdx: 2 } }), 2)).toEqual({ kind: 'task', taskNumber: 3 });
  });
  it('"סיים" once the seven compulsory tasks are done (branch choice), with no new colour', () => {
    expect(tileProgressOf(ws(5, { flowStatus: 'choice_branch' }), 5)).toEqual({ kind: 'finished' });
    expect(tileProgressHe({ kind: 'finished' })).toBe(TILE_HE.finished);
  });
  it('meeting 8: "ברפלקציה" on the board, "סיים" only after it is sent', () => {
    expect(tileProgressOf(ws(8, { flowStatus: 'reflection' }), 8)).toEqual({ kind: 'reflection' });
    expect(tileProgressOf(ws(8, { flowStatus: 'sessionDone' }), 8)).toEqual({ kind: 'finished' });
    expect(tileProgressHe({ kind: 'reflection' })).toBe('ברפלקציה');
  });
  it('nothing for a learner with no copy of the meeting, or for no open meeting', () => {
    expect(tileProgressOf(ws(3), 4)).toBeNull();
    expect(tileProgressOf(ws(4), null)).toBeNull();
    expect(tileProgressOf(null, 4)).toBeNull();
  });
});

describe('B — the tile clocks', () => {
  it('M:SS, never negative', () => {
    expect(elapsedClockHe(0)).toBe('0:00');
    expect(elapsedClockHe(83_400)).toBe('1:23');
    expect(elapsedClockHe(-5_000)).toBe('0:00');
    expect(TILE_HE.waiting('1:23')).toBe('מחכה 1:23');
    expect(TILE_HE.cardOpen('0:42')).toBe('כרטיס פתוח 0:42');
  });
  it('the learner client stamp when plausible, else the moment the dashboard saw the state', () => {
    const seen = 10_000_000;
    expect(stateSinceOf(seen - 60_000, seen)).toBe(seen - 60_000);
    expect(stateSinceOf(seen + 60_000, seen)).toBe(seen);           // a tablet clock ahead
    expect(stateSinceOf(seen - 2 * 60 * 60_000, seen)).toBe(seen);  // a stale stamp of an earlier call
    expect(stateSinceOf(undefined, seen)).toBe(seen);
  });
});

describe('F — the after-close summary', () => {
  it('counts colours by the radar rule, finished learners, ח/ר/מ of the meeting and help calls', () => {
    const now = 1_000_000;
    const online = { isOnline: true, lastPing: now };
    const records = {
      student_user1: { ...online, ...ws(4), helpRequested: true, errorCategoryDistribution: { session_4: { calculation: 2, conceptual: 1 }, session_3: { calculation: 9 } } },
      student_user2: { ...online, ...ws(4), isSocraticActive: true, errorCategoryDistribution: { session_4: { procedural: 1 } } },
      student_user3: { ...online, ...ws(4, { flowStatus: 'choice_branch' }) },
      student_user4: { ...online, ...ws(4), hesitating: { hesitating: true, timestamp: now } },
      student_user5: { ...ws(4) },
    };
    const s = buildMeetingSummary({
      records,
      meeting: 4,
      events: [
        { ref: 'a', studentNumber: 1, kind: 'help_called', at: 1 },
        { ref: 'b', studentNumber: 1, kind: 'chat_help_called', at: 2 },
        { ref: 'c', studentNumber: 2, kind: 'radar_card_open', at: 3 },
      ],
      serverNow: now,
      hesitationThresholdSeconds: 45,
    });
    expect(s.colours).toEqual({ BLUE: 1, RED: 1, GREY: 8, YELLOW: 1, GREEN: 1 });
    expect(s.finished).toBe(1);
    expect(s.letters).toEqual({ calculation: 2, procedural: 1, conceptual: 1 });
    expect(s.helpCalls).toBe(2);
  });
  it('wording', () => {
    expect(LESSON_FLOW_HE.summaryFinished(7)).toBe('סיימו: 7 מתוך 12');
    expect(LESSON_FLOW_HE.summaryHelpCalls(0)).toBe('לא היו קריאות לעזרה');
    expect(LESSON_FLOW_HE.summaryHelpCalls(1)).toBe('קריאה אחת לעזרה');
    expect(LESSON_FLOW_HE.deadline(25)).toBe('עברו 25 דקות');
  });
});
