import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, getDocs, query, where } from 'firebase/firestore';
import { CATCHUP_COLLECTION, catchUpDocId, catchUpRoundId, type CatchUpRound } from '@/core/catchUp';

/**
 * Catch-up time (owner, 2.10.2026): "המורה יקח את אותם ילדים שלא סיימו למפגש
 * נוסף \ זמן נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל
 * הקבוצה למפגש הבא".
 *
 * catchup_records: the teacher of the class creates a learner's record or adds
 * ONE new round per write, with the server fields null; she never changes or
 * removes a round. The admin reads; learners neither read nor write.
 *
 * Runs against the emulator (npm run test:rules). The host and project come
 * from emulators:exec when it sets them, so a run on a fresh demo-* project
 * and free ports touches nothing else.
 */
const root = resolve(__dirname, '../../../..');
const [host, portText] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const projectId = process.env.GCLOUD_PROJECT?.startsWith('demo-') ? process.env.GCLOUD_PROJECT : 'demo-mathmaticore';
let env: RulesTestEnvironment;

const ID = catchUpDocId(3, 4); // session_03_student_4
const T0 = 1_760_000_000_000;

const teacher = () => env.authenticatedContext('teacher_uid', { role: 'teacher', teacher: true, class_id: 'class_1', email: 'teacher@example.com' });
const otherClassTeacher = () => env.authenticatedContext('teacher_2', { role: 'teacher', teacher: true, class_id: 'class_2' });
const admin = () => env.authenticatedContext('admin_uid', { role: 'admin', admin: true });
const learner4 = () => env.authenticatedContext('student_user4', { role: 'student', student_id: 4, class_id: 'class_1' });

const round = (over: Partial<CatchUpRound> = {}, at = T0): CatchUpRound => ({
  action: 'reopen', reason: 'slow_pace', note: null, stopped_at: 'תרגיל 4 מתוך 7',
  recorded_by: 'teacher_uid', recorded_at: at,
  opened_at: null, closed_at: null, closed_by: null, active_minutes: null,
  ...over,
});

/** The write the client makes (CatchUpService: merge, only the new round key). */
const record = (r: CatchUpRound, id = catchUpRoundId(r.recorded_at), meeting = 3, learner = 4) => ({
  student_id: learner, session_number: meeting, class_id: 'class_1', rounds: { [id]: r },
});

const ref = (ctx: ReturnType<typeof teacher>, id = ID) => doc(ctx.firestore(), CATCHUP_COLLECTION, id);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(resolve(root, 'firestore.rules'), 'utf-8'),
      host,
      port: Number(portText),
    },
  });
});

afterAll(async () => { if (env) await env.cleanup(); });

beforeEach(async () => { await env.clearFirestore(); });

/** A record with one round the server has already opened and closed. */
async function seedClosedRound() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), CATCHUP_COLLECTION, ID), record(round({
      opened_at: T0 + 1000, closed_at: T0 + 600_000, closed_by: 'teacher', active_minutes: 8,
    })));
  });
}

describe('catchup_records — the teacher records a reason', () => {
  it('creates the record with one round', async () => {
    await assertSucceeds(setDoc(ref(teacher()), record(round()), { merge: true }));
    await assertSucceeds(setDoc(ref(teacher(), catchUpDocId(3, 5)), record(round({ action: 'continue', reason: 'other', note: 'הגיע באמצע השיעור' }), undefined, 3, 5)));
  });

  it('adds one new round next to an existing one, as a merge', async () => {
    await seedClosedRound();
    const next = round({ action: 'continue', reason: 'technical_fault' }, T0 + 700_000);
    await assertSucceeds(setDoc(ref(teacher()), record(next), { merge: true }));
    const snap = await getDoc(ref(teacher()));
    const rounds = snap.data()?.rounds ?? {};
    if (Object.keys(rounds).length !== 2 || rounds[catchUpRoundId(T0)].active_minutes !== 8) {
      throw new Error(`the earlier round was not kept: ${JSON.stringify(rounds)}`);
    }
  });

  it('adds one new round by field path', async () => {
    await seedClosedRound();
    const next = round({}, T0 + 700_000);
    await assertSucceeds(updateDoc(ref(teacher()), { [`rounds.${catchUpRoundId(next.recorded_at)}`]: next }));
  });

  it('a note of up to 300 characters; null is fine', async () => {
    await assertSucceeds(setDoc(ref(teacher()), record(round({ note: 'א'.repeat(300) }))));
    await env.clearFirestore();
    await assertFails(setDoc(ref(teacher()), record(round({ note: 'א'.repeat(301) }))));
  });
});

describe('catchup_records — what the teacher may not write', () => {
  it('a reason outside the closed list, an action outside reopen|continue', async () => {
    await assertFails(setDoc(ref(teacher()), record(round({ reason: 'lazy' as never }))));
    await assertFails(setDoc(ref(teacher()), record(round({ action: 'skip' as never }))));
  });

  it('a note that is not a string', async () => {
    await assertFails(setDoc(ref(teacher()), record(round({ note: 5 as never }))));
  });

  it('a round recorded in another teacher\'s name, or without a number time', async () => {
    await assertFails(setDoc(ref(teacher()), record(round({ recorded_by: 'someone_else' }))));
    await assertFails(setDoc(ref(teacher()), record(round({ recorded_at: 'now' as never }), 'r_1')));
  });

  it('any of the four server fields', async () => {
    await assertFails(setDoc(ref(teacher()), record(round({ opened_at: T0 }))));
    await assertFails(setDoc(ref(teacher()), record(round({ closed_at: T0 }))));
    await assertFails(setDoc(ref(teacher()), record(round({ closed_by: 'teacher' }))));
    await assertFails(setDoc(ref(teacher()), record(round({ active_minutes: 30 }))));
  });

  it('a round missing a field, or with an extra one', async () => {
    const { stopped_at: _omit, ...missing } = round();
    await assertFails(setDoc(ref(teacher()), { ...record(round()), rounds: { [catchUpRoundId(T0)]: missing } }));
    await assertFails(setDoc(ref(teacher()), { ...record(round()), rounds: { [catchUpRoundId(T0)]: { ...round(), name: 'x' } } }));
  });

  it('a document whose id is not its learner and meeting, or an extra field', async () => {
    await assertFails(setDoc(ref(teacher(), catchUpDocId(3, 5)), record(round())));
    await assertFails(setDoc(ref(teacher(), catchUpDocId(4, 4)), record(round())));
    await assertFails(setDoc(ref(teacher()), { ...record(round()), student_name: 'x' }));
    await assertFails(setDoc(ref(teacher(), 'session_09_student_4'), record(round(), undefined, 9)));
  });

  it('two rounds in one create, or none', async () => {
    await assertFails(setDoc(ref(teacher()), { ...record(round()), rounds: { r_1: round({}, 1), r_2: round({}, 2) } }));
    await assertFails(setDoc(ref(teacher()), { ...record(round()), rounds: {} }));
    await assertFails(setDoc(ref(teacher()), { ...record(round()), rounds: { round1: round() } }));
  });

  it('two new rounds in one write', async () => {
    await seedClosedRound();
    await assertFails(updateDoc(ref(teacher()), { 'rounds.r_10': round({}, 10), 'rounds.r_11': round({}, 11) }));
  });

  it('changing or removing an existing round, even with a new one beside it', async () => {
    await seedClosedRound();
    const id = catchUpRoundId(T0);
    await assertFails(updateDoc(ref(teacher()), { [`rounds.${id}.reason`]: 'other' }));
    await assertFails(updateDoc(ref(teacher()), { [`rounds.${id}.active_minutes`]: 45 }));
    await assertFails(updateDoc(ref(teacher()), { [`rounds.${id}`]: deleteField() }));
    await assertFails(updateDoc(ref(teacher()), { [`rounds.${id}`]: deleteField(), 'rounds.r_10': round({}, 10) }));
    await assertFails(updateDoc(ref(teacher()), { [`rounds.${id}.note`]: 'x', 'rounds.r_10': round({}, 10) }));
  });

  it('changing the learner, the meeting or the class of a record', async () => {
    await seedClosedRound();
    await assertFails(updateDoc(ref(teacher()), { class_id: 'class_2', 'rounds.r_10': round({}, 10) }));
    await assertFails(updateDoc(ref(teacher()), { session_number: 4 }));
  });

  it('deleting a record (a reset does that, on the server)', async () => {
    await seedClosedRound();
    await assertFails(deleteDoc(ref(teacher())));
  });

  it('a teacher of another class', async () => {
    await assertFails(setDoc(ref(otherClassTeacher()), record(round({ recorded_by: 'teacher_2' }))));
  });
});

describe('catchup_records — who reads', () => {
  it('the class teacher reads (PRD 23א §ו); the admin neither reads nor writes', async () => {
    await seedClosedRound();
    await assertSucceeds(getDoc(ref(teacher())));
    await assertSucceeds(getDocs(query(collection(teacher().firestore(), CATCHUP_COLLECTION), where('class_id', '==', 'class_1'), where('session_number', '==', 3))));
    await assertFails(getDoc(ref(otherClassTeacher())));
    await assertFails(getDoc(ref(admin())));
    await assertFails(getDocs(collection(admin().firestore(), CATCHUP_COLLECTION)));
    await assertFails(setDoc(ref(admin(), catchUpDocId(5, 4)), record(round({ recorded_by: 'admin_uid' }), undefined, 5)));
  });

  it('a learner neither reads nor writes — not even their own record', async () => {
    await seedClosedRound();
    await assertFails(getDoc(ref(learner4())));
    await assertFails(getDocs(collection(learner4().firestore(), CATCHUP_COLLECTION)));
    await assertFails(setDoc(ref(learner4(), catchUpDocId(5, 4)), record(round({ recorded_by: 'student_user4' }), undefined, 5)));
    await assertFails(updateDoc(ref(learner4()), { 'rounds.r_10': round({ recorded_by: 'student_user4' }, 10) }));
  });

  it('nobody signed in reads nothing', async () => {
    await seedClosedRound();
    await assertFails(getDoc(ref(env.unauthenticatedContext() as ReturnType<typeof teacher>)));
  });
});
