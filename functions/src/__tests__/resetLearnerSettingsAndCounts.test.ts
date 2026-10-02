import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Module 23א, live reset audit of 2.10.2026:
 *
 * A — owner, 2.10.2026: "ברור שלשמור את הגדרות התלמיד אין צורך להקים לו את זה
 *     מחדש". A full learner reset deleted users/students/<alias> whole, so the
 *     support profile and quiet mode the teacher set were gone and had to be set
 *     again. They now stay on every alias; everything else goes as before.
 *     Level 3 still deletes them.
 * C1 — the alerts reset wrote help flags under every alias of all 12 learners
 *     and so created 36 empty records for learners who never signed in. It now
 *     updates only records that exist.
 * C4 — records_deleted_count of a meeting restart counted the alias records
 *     reset in place (4–5) as deleted. It counts deletions only; the records
 *     reset in place go to records_reset_count.
 */

const h = vi.hoisted(() => ({
  log: [] as string[],
  writes: [] as Array<{ op: 'set' | 'update' | 'remove'; path: string; values?: Record<string, unknown> }>,
  rtdbData: {} as Record<string, unknown>,
  auditUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() { throw new Error('no Drive credentials in tests'); }
  },
}));

vi.mock('firebase-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin')>();
  const snapOf = (v: unknown) => {
    const isObj = v !== null && typeof v === 'object';
    return {
      val: () => (v === undefined ? null : v),
      exists: () => v !== undefined && v !== null,
      hasChildren: () => isObj && Object.keys(v as object).length > 0,
      numChildren: () => (isObj ? Object.keys(v as object).length : 0),
    };
  };
  const database = () => ({
    ref: (path: string) => ({
      get: async () => snapOf(h.rtdbData[path]),
      set: async (values: Record<string, unknown>) => { h.writes.push({ op: 'set', path, values }); },
      update: async (values: Record<string, unknown>) => { h.writes.push({ op: 'update', path, values }); },
      remove: async () => { h.writes.push({ op: 'remove', path }); },
    }),
  });
  const emptyQuery: any = {
    where: () => emptyQuery,
    orderBy: () => emptyQuery,
    limit: () => emptyQuery,
    startAfter: () => emptyQuery,
    get: async () => ({ docs: [], empty: true, size: 0 }),
  };
  const firestore = Object.assign(
    () => ({
      collection: (name: string) => ({
        ...emptyQuery,
        doc: (id: string) => ({
          set: async () => { h.log.push(`firestore set ${name}/${id}`); },
          update: async (values: Record<string, unknown>) => {
            if (name === 'reset_audit_log') h.auditUpdates.push(values);
          },
        }),
      }),
      batch: () => ({ delete: () => {}, commit: async () => {} }),
    }),
    actual.firestore
  );
  const storage = () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: () => ({ save: async () => {}, getSignedUrl: async () => ['https://signed.example/file'] }),
    }),
  });
  const app = () => { throw new Error('no default app in tests'); };
  return { ...actual, default: { ...actual, database, firestore, storage, app }, database, firestore, storage, app };
});

import {
  backupAndResetSessionData,
  buildResetScope,
  executeResetDeletion,
  LEARNER_SETTINGS_FIELDS,
  pickKeptFields,
} from '../exportDriveReport';
import * as admin from 'firebase-admin';

const run = (data: Record<string, unknown>) => (backupAndResetSessionData as any).run({
  auth: { uid: 'teacher-uid', token: { role: 'teacher', roles: ['TEACHER'], teacher: true, class_id: 'class_1' } },
  data: { reason: 'technical_fault', class_id: 'class_1', ...data },
});

const SETTINGS = {
  support_profile_id: 'enhanced_cognitive_support',
  support_profile_version: 3,
  support_profile_updated_at: 1790000000000,
  support_profile_updated_by: 'teacher-uid',
  isASD: true,
};

beforeEach(() => {
  h.log.length = 0;
  h.writes.length = 0;
  h.auditUpdates.length = 0;
  h.rtdbData = {};
});

describe('A — a full learner reset keeps the settings the teacher set', () => {
  it('the scope names the settings for every alias of the learner, and only there', () => {
    const scope = buildResetScope('single_student', '5', 'full_student', null, 'student');
    for (const alias of ['student_user5', 'student_5', 'user5', '5']) {
      expect(scope.rtdbKeepFields?.[`users/students/${alias}`]).toEqual(LEARNER_SETTINGS_FIELDS);
    }
    expect(scope.rtdbKeepFields?.['chat_messages/student_user5']).toBeUndefined();
    // Level 3 and the meeting restart keep nothing this way.
    expect(buildResetScope('system', '').rtdbKeepFields).toBeUndefined();
    expect(buildResetScope('single_student', '5', 'active_session', 3, 'student').rtdbKeepFields).toBeUndefined();
  });

  it('pickKeptFields: the settings present, nothing else; null when the record has none', () => {
    expect(pickKeptFields({ ...SETTINGS, workspaceState: { a: 1 }, highestCompletedMeeting: 4 }, LEARNER_SETTINGS_FIELDS)).toEqual(SETTINGS);
    expect(pickKeptFields({ isASD: false }, LEARNER_SETTINGS_FIELDS)).toEqual({ isASD: false });
    expect(pickKeptFields({ workspaceState: {} }, LEARNER_SETTINGS_FIELDS)).toBeNull();
    expect(pickKeptFields(null, LEARNER_SETTINGS_FIELDS)).toBeNull();
  });

  it('end to end: each alias record is replaced by its settings; a record without settings is removed', async () => {
    h.rtdbData['users/students/student_user5'] = {
      ...SETTINGS,
      workspaceState: { sessionNumber: 4 },
      highestCompletedMeeting: 3,
      pedagogicalPath: 'green_path',
      teacher_gate_approved: true,
      qMatrixResults: { task1: true },
    };
    h.rtdbData['users/students/student_5'] = { support_profile_id: 'enhanced_cognitive_support', support_profile_version: 3 };
    h.rtdbData['users/students/5'] = { isASD: true, overrideUpdatedAt: 1 };
    h.rtdbData['users/students/user5'] = { lastPing: 1 };
    h.rtdbData['chat_messages/student_user5'] = { m1: { text: 'x' } };

    const result = await run({ reset_level: 'single_student', reset_scope: 'full_student', student_id: 5 });
    expect(result.status).toBe('SUCCESS');

    const at = (path: string) => h.writes.filter((w) => w.path === path);
    expect(at('users/students/student_user5')).toEqual([{ op: 'set', path: 'users/students/student_user5', values: SETTINGS }]);
    expect(at('users/students/student_5')).toEqual([{ op: 'set', path: 'users/students/student_5', values: { support_profile_id: 'enhanced_cognitive_support', support_profile_version: 3 } }]);
    expect(at('users/students/5')).toEqual([{ op: 'set', path: 'users/students/5', values: { isASD: true } }]);
    expect(at('users/students/user5')).toEqual([{ op: 'remove', path: 'users/students/user5' }]);
    expect(at('chat_messages/student_user5')).toEqual([{ op: 'remove', path: 'chat_messages/student_user5' }]);

    // Deleted = everything but the kept settings: 10+2+2+1 fields minus 5+2+1 kept, plus 1 chat message.
    expect(h.auditUpdates.at(-1)).toMatchObject({ records_deleted_count: 8, records_reset_count: 0 });
  });

  it('level 3 still deletes the settings with everything else', async () => {
    h.rtdbData['users/students'] = { student_user5: { ...SETTINGS, workspaceState: {} } };
    const result = await run({ reset_level: 'system' });
    expect(result.status).toBe('SUCCESS');
    expect(h.writes).toContainEqual({ op: 'remove', path: 'users/students' });
    expect(h.writes.some((w) => w.op === 'set' && w.path.startsWith('users/students'))).toBe(false);
  });
});

describe('C1 — the alerts reset touches only learner records that exist', () => {
  it('no record is created for a learner who never signed in', async () => {
    h.rtdbData['users/students'] = {
      student_user2: { helpRequested: true, workspaceState: {} },
      student_2: { support_profile_id: 'enhanced_cognitive_support' },
      user7: { handRaised: true },
    };
    await run({ reset_level: 'alerts' });
    const learnerUpdates = h.writes.filter((w) => w.path.startsWith('users/students/')).map((w) => w.path).sort();
    expect(learnerUpdates).toEqual(['users/students/student_2', 'users/students/student_user2', 'users/students/user7']);
    for (const w of h.writes.filter((x) => x.path.startsWith('users/students/'))) {
      expect(w.op).toBe('update');
      expect(w.values).toMatchObject({ helpRequested: false, handRaised: false, isStruggling: false });
    }
  });

  it('an empty class: the alerts feed is cleared and no learner record is written', async () => {
    await run({ reset_level: 'alerts' });
    expect(h.writes.filter((w) => w.path.startsWith('users/students'))).toEqual([]);
    expect(h.writes).toContainEqual({ op: 'remove', path: 'radar_alerts' });
  });
});

describe('C4 — records_deleted_count counts deletions only', () => {
  it('a meeting restart of one learner: the alias records reset in place are counted apart', async () => {
    h.rtdbData['users/students/student_user4'] = { activeSessionNumber: 3, highestCompletedMeeting: 3, workspaceState: {} };
    h.rtdbData['users/students/student_4'] = { isASD: true };
    h.rtdbData['users/students/4'] = { lastPing: 1 };
    const result = await run({ reset_level: 'single_student', reset_scope: 'active_session', student_id: 4, session_number: 3 });
    expect(result.status).toBe('SUCCESS');
    // No Firestore session documents in this fake, and nothing in RTDB is deleted.
    expect(result.deletedRecords).toBe(0);
    expect(h.auditUpdates.at(-1)).toEqual({ records_deleted_count: 0, records_reset_count: 3 });
  });

  it('executeResetDeletion: reset_in_place is apart from total', async () => {
    h.rtdbData['users/students/student_user4'] = { activeSessionNumber: 2 };
    const counts = await executeResetDeletion(admin.database(), admin.firestore(), buildResetScope('single_student', '4', 'active_session', 2, 'student'));
    expect(counts.total).toBe(0);
    expect(counts.reset_in_place).toBe(1);
    expect(counts.realtime_database).toEqual({});
  });
});
