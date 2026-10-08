import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { lobbyState, lastMeetingOf } from '@/core/lobbyState';
import { TEACHER_SENTENCES_HE } from '@/core/teacherGender';

/**
 * PRD Module 6 and Module 14 §ב0: the learner's lobby shows one of two things —
 * the quiet waiting screen with the one sentence of its state, or the station's
 * opening screen once the teacher activates the session. The sentence follows
 * the session's state and the learner's finished mark at that station, not the
 * reason the session closed.
 */
const PRD = readFileSync(resolve(__dirname, '../../../../מסמכי אפיון/07- 3.MathematiCore_PRD_v07 הסופי.md'), 'utf8');

const finished4 = { completedMeetings: { m4: 1_700_000_000_000 } };
const started4 = { workspaceByMeeting: { m4: { sessionNumber: 4, flowStatus: 'task', hasInteracted: true, savedAt: 1 } } };

describe('the four waiting sentences are the PRD\'s, word for word, in both genders', () => {
  it('feminine (the PRD\'s own text)', () => {
    for (const key of ['lobbyNotStarted', 'lobbyPaused', 'nextStation', 'lobbyClosedUnfinished'] as const) {
      expect(PRD, key).toContain(`"${TEACHER_SENTENCES_HE[key].female}"`);
    }
  });

  it('masculine: the verbs in the masculine — יפתח, עצר, יפתח, יקבע', () => {
    expect(TEACHER_SENTENCES_HE.lobbyNotStarted.male).toBe('היום עוד לא התחלנו. המורה יפתח את הפעילות בקרוב.');
    expect(TEACHER_SENTENCES_HE.lobbyPaused.male).toBe('המורה עצר את הפעילות לרגע.');
    expect(TEACHER_SENTENCES_HE.nextStation.male).toBe('כשהמורה יפתח את התחנה הבאה, נמשיך יחד.');
    expect(TEACHER_SENTENCES_HE.lobbyClosedUnfinished.male).toBe('העבודה שלכם נשמרה בבטחה. המורה יקבע איתכם מתי תמשיכו.');
  });
});

describe('lobbyState', () => {
  const closed = { live: false, status: 'closed' as const, sessionNumber: null };

  it('nothing opened yet: "היום עוד לא התחלנו"', () => {
    expect(lobbyState({ ...closed, lastMeeting: null, record: {} })).toEqual({ kind: 'waiting', sentence: 'lobbyNotStarted' });
  });

  it('activated: the opening screen of that station', () => {
    expect(lobbyState({ live: true, status: 'active', sessionNumber: 4, lastMeeting: null, record: {} })).toEqual({ kind: 'opening', meeting: 4 });
  });

  it('paused: the paused sentence — or the finished one, for a learner who finished the station', () => {
    expect(lobbyState({ live: true, status: 'paused', sessionNumber: 4, lastMeeting: null, record: {} })).toEqual({ kind: 'waiting', sentence: 'lobbyPaused' });
    expect(lobbyState({ live: true, status: 'paused', sessionNumber: 4, lastMeeting: null, record: finished4 })).toEqual({ kind: 'waiting', sentence: 'nextStation' });
  });

  it('closed: a closed or completed session never says "היום עוד לא התחלנו" to a learner who worked in it', () => {
    expect(lobbyState({ ...closed, lastMeeting: 4, record: finished4 })).toEqual({ kind: 'waiting', sentence: 'nextStation' });
    expect(lobbyState({ ...closed, lastMeeting: 4, record: started4 })).toEqual({ kind: 'waiting', sentence: 'lobbyClosedUnfinished' });
  });

  it('closed, and this learner never started that station: for them nothing was opened yet', () => {
    expect(lobbyState({ ...closed, lastMeeting: 4, record: {} })).toEqual({ kind: 'waiting', sentence: 'lobbyNotStarted' });
  });
});

describe('lastMeetingOf: the station a session that is no longer live last ran', () => {
  it('the close stamp of a closed session', () => {
    expect(lastMeetingOf({ active: false, status: 'closed', sessionNumber: null, lastSessionNumber: 5 })).toBe(5);
  });
  it('a session past its time that was never closed still carries its number', () => {
    expect(lastMeetingOf({ active: true, status: 'active', sessionNumber: 3 })).toBe(3);
  });
  it('none', () => {
    expect(lastMeetingOf(null)).toBeNull();
    expect(lastMeetingOf({ active: false, status: 'closed', sessionNumber: null })).toBeNull();
  });
});
