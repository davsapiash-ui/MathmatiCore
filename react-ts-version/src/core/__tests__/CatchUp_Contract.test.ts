import { describe, it, expect } from 'vitest';
import {
  CATCHUP_REASON_KEYS,
  CATCHUP_REASON_HE,
  catchUpDocId,
  catchUpReasonHe,
  catchUpRoundId,
  catchUpSummaryHe,
  summarizeCatchUpRecord,
  validateCatchUpNote,
  CATCHUP_NOTE_MAX_LENGTH,
  type CatchUpRound,
} from '@/core/catchUp';
import {
  COMPLETED_MEETINGS_KEY,
  WORKSPACE_BY_MEETING_KEY,
  hasStartedMeeting,
  isMeetingFinished,
  meetingKey,
  resumeSnapshotFor,
  savedSnapshotOfMeeting,
} from '@/core/meetingCompletion';

describe('resume', () => {
  it('meeting 3 after the class moved on resumes from its own copy', () => {
    const rec = { workspaceState: { sessionNumber: 4, flowStatus: 'task', savedAt: 50 }, workspaceByMeeting: { m3: { sessionNumber: 3, flowStatus: 'task', savedAt: 40, standardTaskIdx: 3 } } };
    expect(resumeSnapshotFor(rec, null, 3)).toMatchObject({ standardTaskIdx: 3 });
    expect(resumeSnapshotFor(rec, { sessionNumber: 3, flowStatus: 'task', savedAt: 45, standardTaskIdx: 4 }, 3)).toMatchObject({ standardTaskIdx: 4 });
    expect(resumeSnapshotFor(rec, null, 5)).toBeNull();
  });
});

// Owner decision, 2.10.2026 (catch-up time): the closed list, its wording, and
// what "finished" means per meeting.

describe('catch-up reasons', () => {
  it('the closed list and the owner’s wording', () => {
    expect([...CATCHUP_REASON_KEYS]).toEqual(['slow_pace', 'partial_absence', 'technical_fault', 'content_difficulty', 'other']);
    expect(CATCHUP_REASON_HE).toEqual({
      slow_pace: 'עבד בקצב איטי',
      partial_absence: 'נעדר בחלק מהשיעור',
      technical_fault: 'תקלה טכנית',
      content_difficulty: 'התקשה בתוכן',
      other: 'אחר',
    });
    expect(catchUpReasonHe('other')).toBe('אחר');
    expect(catchUpReasonHe('toString')).toBeNull();
  });

  it('ids', () => {
    expect(catchUpDocId(8, 12)).toBe('session_08_student_12');
    expect(catchUpRoundId(1700000000123.7)).toBe('r_1700000000123');
  });

  it('the note: blank is null, PII refused, long capped', () => {
    expect(validateCatchUpNote('   ')).toEqual({ ok: true, note: null });
    expect(validateCatchUpNote(' יצא לחדר אחר ')).toEqual({ ok: true, note: 'יצא לחדר אחר' });
    expect(validateCatchUpNote('אמא 0521234567').ok).toBe(false);
    expect(validateCatchUpNote('a@b.co').ok).toBe(false);
    const long = validateCatchUpNote('א'.repeat(CATCHUP_NOTE_MAX_LENGTH + 50));
    expect(long.ok && long.note!.length).toBe(CATCHUP_NOTE_MAX_LENGTH);
  });

  it('the summary line', () => {
    const r: CatchUpRound = {
      action: 'reopen', reason: 'slow_pace', note: null, stopped_at: null, recorded_by: 't', recorded_at: 1,
      opened_at: 2, closed_at: 3, closed_by: 'teacher', active_minutes: 3,
    };
    expect(catchUpSummaryHe(summarizeCatchUpRecord({ rounds: { r_1: r } }))).toBe('קיבל זמן השלמה: 3 דקות · סיבה: עבד בקצב איטי');
  });
});

describe('meeting completion per meeting', () => {
  const ws = (sessionNumber: number, flowStatus: string, extra: Record<string, unknown> = {}) => ({ sessionNumber, flowStatus, savedAt: 10, ...extra });

  it('keys never become RTDB array indices', () => {
    expect(meetingKey(3)).toBe('m3');
    expect(COMPLETED_MEETINGS_KEY).toBe('completedMeetings');
    expect(WORKSPACE_BY_MEETING_KEY).toBe('workspaceByMeeting');
  });

  it('the copy of a meeting the class has moved past is still found', () => {
    const rec = { workspaceState: ws(4, 'task'), workspaceByMeeting: { m3: ws(3, 'task', { standardTaskIdx: 3 }) } };
    expect(savedSnapshotOfMeeting(rec, 3)).toMatchObject({ sessionNumber: 3, standardTaskIdx: 3 });
    expect(savedSnapshotOfMeeting(rec, 4)).toMatchObject({ sessionNumber: 4 });
    expect(savedSnapshotOfMeeting(rec, 5)).toBeNull();
  });

  it('the later copy wins', () => {
    const rec = { workspaceState: ws(3, 'task', { savedAt: 20, standardTaskIdx: 5 }), workspaceByMeeting: { m3: ws(3, 'task', { savedAt: 10, standardTaskIdx: 2 }) } };
    expect(savedSnapshotOfMeeting(rec, 3)).toMatchObject({ standardTaskIdx: 5 });
  });

  it('the explicit mark finishes a meeting', () => {
    expect(isMeetingFinished({ completedMeetings: { m5: 123 } }, 5)).toBe(true);
    expect(isMeetingFinished({ completedMeetings: { m5: 123 } }, 6)).toBe(false);
  });

  it('meetings 3–7: the branch choice is finished, exercise 4 is not', () => {
    expect(isMeetingFinished({ workspaceByMeeting: { m3: ws(3, 'choice_branch') } }, 3)).toBe(true);
    expect(isMeetingFinished({ workspaceByMeeting: { m3: ws(3, 'task', { selectedBranch: 'challenge' }) } }, 3)).toBe(true);
    expect(isMeetingFinished({ workspaceByMeeting: { m3: ws(3, 'task', { standardTaskIdx: 3 }) }, highestCompletedMeeting: 4 }, 3)).toBe(false);
  });

  it('meeting 8: the seven exercises are not enough, the reflection is', () => {
    expect(isMeetingFinished({ workspaceState: ws(8, 'reflection') }, 8)).toBe(false);
    expect(isMeetingFinished({ workspaceState: ws(8, 'sessionDone') }, 8)).toBe(true);
  });

  it('meeting 2 keeps its own markers', () => {
    expect(isMeetingFinished({ completedMeeting2: true }, 2)).toBe(true);
    expect(isMeetingFinished({ routeStatus: 'PENDING_TEACHER_APPROVAL' }, 2)).toBe(true);
    expect(isMeetingFinished({ workspaceState: ws(2, 'task') }, 2)).toBe(false);
  });

  it('no copy of the meeting: the old monotonic marker', () => {
    expect(isMeetingFinished({ highestCompletedMeeting: 3 }, 3)).toBe(true);
    expect(isMeetingFinished({ highestCompletedMeeting: 2 }, 3)).toBe(false);
  });

  it('started', () => {
    expect(hasStartedMeeting({ workspaceByMeeting: { m3: ws(3, 'task', { standardTaskIdx: 1 }) } }, 3)).toBe(true);
    expect(hasStartedMeeting({ workspaceByMeeting: { m3: ws(3, 'task', { hasInteracted: true }) } }, 3)).toBe(true);
    expect(hasStartedMeeting({ workspaceByMeeting: { m3: ws(3, 'task') } }, 3)).toBe(false);
    expect(hasStartedMeeting({}, 3)).toBe(false);
  });
});
