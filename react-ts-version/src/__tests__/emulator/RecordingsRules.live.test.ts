import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, get as rtdbGet, set as rtdbSet, update as rtdbUpdate, remove as rtdbRemove } from 'firebase/database';

/**
 * Module 21 — the recordings' own node, recordings/{student}, in the real rules
 * engine (2.10.2026). It gives exactly what users/students/{student} gave the
 * recordings before they moved: the learner writes and reads only their own,
 * the teacher reads every learner's (the replay) and may write, the admin
 * reads nothing (Module 24 §ב). Nothing but recordings and their budgets may
 * be stored there.
 *
 * Ports: the emulator `emulators:exec` started (FIREBASE_DATABASE_EMULATOR_HOST),
 * else the project's default 9000.
 */
const root = resolve(__dirname, '../../../..');
let env: RulesTestEnvironment;

const hostPort = (raw: string | undefined, fallback: number) => {
  const m = /^(.+):(\d+)$/.exec(raw ?? '');
  return m ? { host: m[1], port: Number(m[2]) } : { host: '127.0.0.1', port: fallback };
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mathmaticore',
    database: {
      rules: readFileSync(resolve(root, 'database.rules.json'), 'utf-8'),
      ...hostPort(process.env.FIREBASE_DATABASE_EMULATOR_HOST, 9000),
    },
  });
});

afterAll(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await rtdbSet(ref(ctx.database(), 'recordings/student_user7/telemetry_sessions/session_1/chunks/c1'), { data: '[]', idempotency_key: 'c1' });
  });
});

const learner12 = () => env.authenticatedContext('anon_12', { student_id: 12 }).database();
const teacher = () => env.authenticatedContext('teacher_uid', { role: 'teacher', teacher: true, roles: ['TEACHER'], email: 'teacher@example.com' }).database();
const adminDb = () => env.authenticatedContext('admin_uid', { role: 'admin', admin: true, roles: ['ADMIN'], email: 'admin@example.com' }).database();

const OWN = 'recordings/student_user12';

describe('Module 21 — the learner writes their own recording, as the recorder does', () => {
  it('a chunk, its metadata, the truncated flag and the meeting budget', async () => {
    const db = learner12();
    await assertSucceeds(rtdbSet(ref(db, `${OWN}/telemetry_sessions/session_5/chunks/k1`), { data: '[{"t":1}]', idempotency_key: 'k1' }));
    await assertSucceeds(rtdbSet(ref(db, `${OWN}/telemetry_sessions/session_5/metadata/k1`), { startTime: 1, endTime: 2, sessionNumber: 4, exercise_id: 's4_g_t1', idempotency_key: 'k1' }));
    await assertSucceeds(rtdbUpdate(ref(db, `${OWN}/telemetry_sessions/session_5`), { recording_truncated: true }));
    await assertSucceeds(rtdbUpdate(ref(db, `${OWN}/recorded_bytes/meeting_4/chunks`), { k1: 9 }));
    await assertSucceeds(rtdbUpdate(ref(db, `${OWN}/recorded_bytes/meeting_4`), { truncated: true }));
    await assertSucceeds(rtdbGet(ref(db, `${OWN}/recorded_bytes/meeting_4`)));
  });

  it('nothing else may be stored in the recordings node', async () => {
    await assertFails(rtdbSet(ref(learner12(), `${OWN}/workspaceState`), { x: 1 }));
  });

  it("never another learner's recordings, and never the whole node", async () => {
    const db = learner12();
    await assertFails(rtdbGet(ref(db, 'recordings/student_user7')));
    await assertFails(rtdbSet(ref(db, 'recordings/student_user7/telemetry_sessions/s/chunks/k'), { data: '[]' }));
    await assertFails(rtdbGet(ref(db, 'recordings')));
  });

  it('nobody signed out', async () => {
    const anon = env.unauthenticatedContext().database();
    await assertFails(rtdbGet(ref(anon, 'recordings/student_user7')));
    await assertFails(rtdbSet(ref(anon, `${OWN}/telemetry_sessions/s/chunks/k`), { data: '[]' }));
  });
});

describe('Module 21 §ג — the teacher reads every recording (the replay)', () => {
  it('reads the whole node and one learner', async () => {
    await assertSucceeds(rtdbGet(ref(teacher(), 'recordings')));
    await assertSucceeds(rtdbGet(ref(teacher(), 'recordings/student_user7/telemetry_sessions')));
  });
  it('may remove one learner, as with the learner record', async () => {
    await assertSucceeds(rtdbRemove(ref(teacher(), 'recordings/student_user7')));
  });
});

describe('Module 24 §ב — the admin reads no recording', () => {
  it('neither the node nor one learner, and writes nothing', async () => {
    await assertFails(rtdbGet(ref(adminDb(), 'recordings')));
    await assertFails(rtdbGet(ref(adminDb(), 'recordings/student_user7')));
    await assertFails(rtdbSet(ref(adminDb(), 'recordings/student_user7/telemetry_sessions/s/chunks/k'), { data: '[]' }));
  });
});
