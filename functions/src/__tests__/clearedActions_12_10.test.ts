import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  clearedActionsOfBackup, isClearedByReset, markerCovering, pickActionFields, loadClearedActions,
  clearedActionsPath, lateActionsPrefix, type ActionsBucket,
} from '../clearedActions';
import { isAwaitingRerun, resetsOfMeeting, splitMeetingRuns } from '../meetingMetrics';

// PRD 23א §ב.2, §ג (owner, 12.10.2026): a single-learner reset may also
// "לנקות גם את רשימת הפעולות"; the actions then live only in the backup.

const ev = (student: number, meeting: number, t: number, type = 'DIGIT_ENTERED') =>
  ({ student_id: student, session_id: `session_${meeting}_student_student_user${student}`, client_timestamp: t, event_type: type, exercise_id: 's3_t1' });

describe('which actions a reset clears', () => {
  const backup = [
    { id: 'a', data: ev(4, 3, 100) },
    { id: 'b', data: ev(4, 2, 100) },
    { id: 'c', data: ev(5, 3, 100) },
    { id: 'd', data: { ...ev(4, 3, 100), session_id: 'session_x_student_4' } },
  ];

  it('the meeting scope clears only that meeting of that learner', () => {
    expect(clearedActionsOfBackup(backup, 4, 3).map((a) => a.id)).toEqual(['a']);
  });

  it('the full learner reset clears every meeting of the learner, no one else', () => {
    expect(clearedActionsOfBackup(backup, 4, null).map((a) => a.id)).toEqual(['a', 'b', 'd']);
    expect(isClearedByReset(ev(5, 3, 1), 4, null)).toBe(false);
  });
});

describe('late actions never return to the list', () => {
  const marker = { reset_id: 'r1', class_id: 'class_1', performed_at: 1000, session_number: 3 };

  it('an action made before the reset, in the cleared meeting, falls under it', () => {
    expect(markerCovering(ev(4, 3, 999), [marker])).toEqual(marker);
  });

  it('an action of the new run, of another meeting, or with no device time stays', () => {
    expect(markerCovering(ev(4, 3, 1000), [marker])).toBeNull();
    expect(markerCovering(ev(4, 2, 10), [marker])).toBeNull();
    expect(markerCovering({ ...ev(4, 3, 10), client_timestamp: undefined }, [marker])).toBeNull();
  });

  it('a full learner reset covers every meeting', () => {
    expect(markerCovering(ev(4, 7, 10), [{ ...marker, session_number: null }])).not.toBeNull();
  });
});

describe('reading the cleared actions back', () => {
  it('merges the late ones once, oldest first, and keeps only the meeting asked for', async () => {
    const files: Record<string, string> = {
      [clearedActionsPath('class_1', 'r1')]: JSON.stringify({ actions: [{ id: 'a', data: ev(4, 3, 20) }, { id: 'b', data: ev(4, 2, 5) }] }),
      [`${lateActionsPrefix('class_1', 'r1')}c.json`]: JSON.stringify({ id: 'c', data: ev(4, 3, 10) }),
      [`${lateActionsPrefix('class_1', 'r1')}a.json`]: JSON.stringify({ id: 'a', data: ev(4, 3, 20) }),
    };
    const bucket: ActionsBucket = {
      file: (p) => ({ save: async () => undefined, download: async () => [Buffer.from(files[p])] as [Buffer] }),
      getFiles: async ({ prefix }) => [Object.keys(files).filter((k) => k.startsWith(prefix)).map((name) => ({
        name, download: async () => [Buffer.from(files[name])] as [Buffer],
      }))],
    };
    const actions = await loadClearedActions(bucket, { class_id: 'class_1', reset_id: 'r1' }, 3);
    expect(actions.map((a) => a.id)).toEqual(['c', 'a']);
  });

  it('only the action fields leave the backup', () => {
    expect(Object.keys(pickActionFields({ ...ev(4, 3, 1), device_id: 'x', synced_at: 2 }))).not.toContain('device_id');
  });
});

describe('a cleared meeting is still "awaiting a rerun" (review of PR #209)', () => {
  const entries = [{
    reset_level: 'single_student', reset_scope: 'active_session', session_number: 3, affected_student_ids: [4],
    performed_at: 1000, deletion_status: 'completed', actions_cleared: true,
  }];

  it('screen-open events after a clearing reset are not scored', () => {
    const runs = splitMeetingRuns([{ data: ev(4, 3, 1500, 'SESSION_START'), writtenAtMs: null }], resetsOfMeeting(entries, 4, 3));
    expect(runs.beforeReset).toHaveLength(0);
    expect(isAwaitingRerun(runs)).toBe(true);
  });

  it('an answer since the reset is a run again', () => {
    const runs = splitMeetingRuns([{ data: ev(4, 3, 1500), writtenAtMs: null }], resetsOfMeeting(entries, 4, 3));
    expect(isAwaitingRerun(runs)).toBe(false);
  });

  it('a reset that kept the actions still needs the earlier work to wait', () => {
    const kept = [{ ...entries[0], actions_cleared: undefined }];
    const runs = splitMeetingRuns([{ data: ev(4, 3, 1500, 'SESSION_START'), writtenAtMs: null }], resetsOfMeeting(kept, 4, 3));
    expect(isAwaitingRerun(runs)).toBe(false);
  });
});

describe('the reset deletes only what it backed up, and only for one learner', () => {
  const src = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');

  it('refuses the clearing outside a single-learner reset', () => {
    expect(src).toContain("if (clearActions && (reset_level !== 'single_student' || isClassTarget)) {");
  });

  it('deletes the backed-up ids, after the Storage copy, the cleared file and the marker', () => {
    const step = src.slice(src.indexOf('// Step 2c'), src.indexOf('// Step 3: the audit entry'));
    expect(step.indexOf('bucket.file(storagePath).save(')).toBeLessThan(step.indexOf('writeClearedActionsFile('));
    expect(step.indexOf('writeClearedActionsFile(')).toBeLessThan(step.indexOf('addClearedActionsMarker('));
    expect(step).toContain('telemetryEntry.deleteIds = cleared.map((a) => a.id);');
    expect(src).toContain('? await deleteDocsById(db, entry.collection, entry.deleteIds)');
  });
});
