import { describe, it, expect, vi } from 'vitest';
import * as admin from 'firebase-admin';

/**
 * PRD 14 §ב0: the catch-up note is "נבדקת לפרטים מזהים בדפדפן ובשרת" (Module 3).
 * A trigger on catchup_records scrubs each stored note with scrubPII and
 * rewrites only the notes that changed, so its own write changes nothing more
 * and does not fire it again into another write.
 */

vi.mock('firebase-functions/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, log: () => {} }));

import { catchUpNoteRewrites, scrubCatchUpNotes } from '../catchUpNoteScrub';

const round = (note: string | null, extra: Record<string, unknown> = {}) => ({
  action: 'reopen', reason: 'other', note, stopped_at: null, recorded_by: 't', recorded_at: 1,
  opened_at: null, closed_at: null, closed_by: null, active_minutes: null, ...extra,
});

describe('catchUpNoteRewrites', () => {
  it('rewrites only the notes scrubPII changes', () => {
    const record = {
      student_id: 4, session_number: 3, class_id: 'class_1',
      rounds: {
        r_1: round('התקשה בהמרה, לדבר עם ההורים 050-123-4567'),
        r_2: round('עבד לאט היום'),
        r_3: round(null),
        r_4: round('אמא שלו כתבה: parent@example.com'),
      },
    };
    expect(catchUpNoteRewrites(record)).toEqual([
      { roundId: 'r_1', note: 'התקשה בהמרה, לדבר עם ההורים [REDACTED_PHONE]' },
      { roundId: 'r_4', note: 'אמא שלו כתבה: [REDACTED_EMAIL]' },
    ]);
  });

  it('the scrubbed record needs no further rewrite (no trigger loop)', () => {
    const rounds: Record<string, ReturnType<typeof round>> = {
      r_1: round('קוראים לו דני כהן, טלפון 0501234567, password: x1'),
    };
    const first = catchUpNoteRewrites({ rounds });
    expect(first).toHaveLength(1);
    rounds.r_1 = round(first[0].note);
    expect(catchUpNoteRewrites({ rounds })).toEqual([]);
  });

  it('a record without rounds, or with rounds that are not maps, has nothing to rewrite', () => {
    expect(catchUpNoteRewrites(null)).toEqual([]);
    expect(catchUpNoteRewrites({ rounds: 'x' })).toEqual([]);
    expect(catchUpNoteRewrites({ rounds: { r_1: null, r_2: 'note' } })).toEqual([]);
  });
});

describe('scrubCatchUpNotes', () => {
  const run = (data: Record<string, unknown> | undefined) => {
    const update = vi.fn(async () => undefined);
    const after = { exists: data !== undefined, data: () => data, ref: { update } };
    return { update, done: (scrubCatchUpNotes as any).run({ params: { docId: 'session_03_student_4' }, data: { before: undefined, after } }) };
  };

  it('writes only the changed note, by its field path', async () => {
    const { update, done } = run({ rounds: { r_1: round('טלפון 050-123-4567'), r_2: round('בסדר') } });
    await done;
    expect(update).toHaveBeenCalledTimes(1);
    const args = update.mock.calls[0] as unknown[];
    expect(args).toHaveLength(2);
    expect((args[0] as admin.firestore.FieldPath).isEqual(new admin.firestore.FieldPath('rounds', 'r_1', 'note'))).toBe(true);
    expect(args[1]).toBe('טלפון [REDACTED_PHONE]');
  });

  it('writes nothing when no note changes, nor for a deleted record', async () => {
    const clean = run({ rounds: { r_1: round('טלפון [REDACTED_PHONE]') } });
    await clean.done;
    expect(clean.update).not.toHaveBeenCalled();
    const deleted = run(undefined);
    await deleted.done;
    expect(deleted.update).not.toHaveBeenCalled();
  });
});
