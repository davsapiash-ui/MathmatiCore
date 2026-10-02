import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  finishedMeetingRefusalHe,
  learnerAliasesForReset,
  learnerCompletedMeeting,
  learnerMeeting,
  liveClassMeeting,
  resolveResetMeeting,
} from '../resetMeetingTarget';

/**
 * Owner, 2.10.2026: "תתקן ותפטור כבר עכשיו את הבאג של 4". The dialog names the
 * meeting a single learner's "המפגש הנוכחי" reset restarts, by the server's
 * own rule (functions/src/resetMeetingTarget.ts): the class's meeting only
 * while it is open now, else the meeting the learner is in.
 */

const NOW = 1_800_000_000_000;
const MIN = 60 * 1000;

describe('the class meeting counts only while it is open now (isClassSessionLive)', () => {
  it('open or paused: its number', () => {
    expect(liveClassMeeting({ active: true, status: 'active', sessionNumber: 3, startedAt: NOW - 10 * MIN }, NOW)).toBe(3);
    expect(liveClassMeeting({ active: true, status: 'paused', sessionNumber: 3, startedAt: NOW - 10 * MIN }, NOW)).toBe(3);
  });

  it('closed, past 45 minutes, or the teacher away past 15 minutes: none', () => {
    expect(liveClassMeeting({ active: false, status: 'closed', sessionNumber: 3 }, NOW)).toBeNull();
    expect(liveClassMeeting({ active: true, sessionNumber: 3, startedAt: NOW - 46 * MIN }, NOW)).toBeNull();
    expect(liveClassMeeting({ active: true, sessionNumber: 3, teacherDisconnectedAt: NOW - 16 * MIN }, NOW)).toBeNull();
    expect(liveClassMeeting(null, NOW)).toBeNull();
  });
});

describe('the meeting the learner is in', () => {
  it('activeSessionNumber first, under any alias, then the old activeSessionId', () => {
    expect(learnerMeeting([null, { activeSessionNumber: 4 }, null, null])).toBe(4);
    expect(learnerMeeting([{ activeSessionId: 1 }, { activeSessionNumber: 5 }])).toBe(5);
    expect(learnerMeeting([{ activeSessionId: 3 }])).toBe(3);
  });

  it('a finished meeting the learner last entered is where the learner is', () => {
    expect(learnerMeeting([{ activeSessionNumber: 3, highestCompletedMeeting: 3 }])).toBe(3);
  });

  it('the old field behind a later finished meeting is stale', () => {
    expect(learnerMeeting([{ activeSessionId: 2, highestCompletedMeeting: 5 }])).toBeNull();
  });

  it('nothing: null', () => {
    expect(learnerMeeting([null, {}, undefined])).toBeNull();
    expect(learnerMeeting([{ activeSessionNumber: 9, activeSessionId: 'x' }])).toBeNull();
  });

  it('the server reads the same aliases in the same order', () => {
    expect(learnerAliasesForReset(7)).toEqual(['student_user7', 'student_7', 'user7', '7']);
    const server = readFileSync(resolve(__dirname, '../../../../functions/src/resetMeetingTarget.ts'), 'utf-8');
    expect(server).toContain('return [`student_user${rawNum}`, `student_${rawNum}`, `user${rawNum}`, rawNum];');
  });
});

describe('the whole rule, with what the dialog says about it', () => {
  it('an open class meeting wins', () => {
    expect(resolveResetMeeting(6, [{ activeSessionNumber: 4 }])).toEqual({ sessionNumber: 6, source: 'class', completed: false });
  });

  it('no open meeting: the meeting the learner is in the middle of', () => {
    expect(resolveResetMeeting(null, [{ activeSessionNumber: 4, highestCompletedMeeting: 3 }])).toEqual({ sessionNumber: 4, source: 'learner', completed: false });
  });

  it('no open meeting and the learner finished the last meeting entered: refused (A: meeting 4; B: meeting 2, at the gate or approved)', () => {
    expect(resolveResetMeeting(null, [{ activeSessionNumber: 4, completedMeeting4: true, highestCompletedMeeting: 4 }]))
      .toEqual({ sessionNumber: 4, source: 'learner', completed: true, finished: true });
    expect(resolveResetMeeting(null, [{ activeSessionNumber: 2, session_02_completed: true }])?.finished).toBe(true);
    expect(resolveResetMeeting(null, [{ activeSessionNumber: 2, completedMeeting2: true, teacher_gate_approved: true }])?.finished).toBe(true);
  });

  it('an open class meeting the learner finished is reset, and the window says the finish is undone', () => {
    expect(resolveResetMeeting(4, [{ activeSessionNumber: 4, completedMeeting4: true }])).toEqual({ sessionNumber: 4, source: 'class', completed: true });
  });

  it('the refusal is the server\'s own sentence', () => {
    const server = readFileSync(resolve(__dirname, '../../../../functions/src/resetMeetingTarget.ts'), 'utf-8');
    const sentence = finishedMeetingRefusalHe(4, 2);
    expect(sentence).toBe('תלמיד 4 סיים את מפגש 2, ועכשיו הוא לא באמצע מפגש. כדי לאפס מפגש שהסתיים, פתחו אותו לכיתה ואפסו אותו בזמן שהוא פתוח, או בחרו איפוס מוחלט של התלמיד.');
    expect(server).toContain(sentence.replace('תלמיד 4', 'תלמיד ${learnerNumber}').replace('מפגש 2,', 'מפגש ${sessionNumber},'));
  });

  it('meeting 2 is finished by any of its completion keys', () => {
    expect(learnerCompletedMeeting([{ session_02_completed: true }], 2)).toBe(true);
    expect(learnerCompletedMeeting([{ session_2_completed: true }], 2)).toBe(true);
    expect(learnerCompletedMeeting([{ completedMeeting2: false }], 2)).toBe(false);
  });

  it('nothing to go by: null', () => {
    expect(resolveResetMeeting(null, [])).toBeNull();
  });
});
