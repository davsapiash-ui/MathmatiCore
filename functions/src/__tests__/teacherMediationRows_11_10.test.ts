import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildTeacherMediationRows, CHAT_HELP_PAIR_MS, MEDIATION_COLUMNS } from '../teacherMediationRows';

/**
 * The sixth research file, "תיווך המורה" (PRD Module 24 §ב): the system side of the
 * researcher's journal for measure 5. One row per event, only values already stored,
 * no text and no teacher identity.
 */
const T = Date.UTC(2026, 9, 5, 8, 0, 0);
const ev = (id: string, type: string, student: number, meeting: number, at: number, details: Record<string, unknown> = {}) => ({
  id,
  data: { event_type: type, student_id: student, session_id: `session_${meeting}_student_student_user${student}`, client_timestamp: at, details },
});

describe('buildTeacherMediationRows', () => {
  it('a learner who calls the teacher four times gets four rows, in time order', () => {
    const telemetry = [1, 2, 3, 4].map((k) => ev(`log_${k}`, 'HELP_REQUESTED', 3, 4, T + k * 60_000, { help_count: k }));
    const rows = buildTeacherMediationRows({ telemetry, chat: null, sessionDocs: [], students: null, catchUp: [] }, null);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.event_kind)).toEqual(Array(4).fill('help_called'));
    expect(rows.map((r) => r.detail_number)).toEqual([1, 2, 3, 4]);
    expect(rows.map((r) => r.ref_id)).toEqual(['log_1', 'log_2', 'log_3', 'log_4']);
    expect(rows.every((r) => r.student_id === 3 && r.session_number === 4 && r.session_number_basis === 'stored')).toBe(true);
    const times = rows.map((r) => r.event_time_iso);
    expect([...times].sort()).toEqual(times);
  });

  it('has exactly the agreed columns, in order', () => {
    const rows = buildTeacherMediationRows({ telemetry: [ev('a', 'HESITATION_DETECTED', 1, 3, T, { hesitation_seconds: 31 })], chat: null, sessionDocs: [], students: null, catchUp: [] }, null);
    expect(Object.keys(rows[0])).toEqual([...MEDIATION_COLUMNS]);
    // The PRD's nine columns in their order, then the teacher's three, appended last (owner, 11.10.2026).
    expect([...MEDIATION_COLUMNS]).toEqual([
      'event_time_iso', 'student_id', 'session_number', 'session_number_basis', 'event_kind', 'event_source', 'ref_id', 'detail_code', 'detail_number',
      'teacher_action', 'data_led', 'teacher_note',
    ]);
    expect(rows[0]).toMatchObject({ event_kind: 'radar_hesitation', detail_number: 31 });
  });

  it('chat: length and who wrote, never the text, never an id', () => {
    const chat = {
      student_user3: {
        m1: { id: 'm1', senderId: 'AbCdTeacherUid', senderName: 'מורה', text: 'שלום דנה, כל הכבוד', timestamp: T + 5_000, read: true },
        m2: { id: 'm2', senderId: 'student_user3', senderName: 'תלמיד 3', text: 'אפשר עזרה', timestamp: T + 9_000, read: false },
      },
    };
    const telemetry = [ev('a', 'PROBLEM_LOAD', 3, 4, T), ev('b', 'PROBLEM_COMPLETE', 3, 4, T + 60_000)];
    const rows = buildTeacherMediationRows({ telemetry, chat, sessionDocs: [], students: null, catchUp: [] }, null);
    const chatRows = rows.filter((r) => r.event_source === 'chat');
    expect(chatRows.map((r) => r.event_kind)).toEqual(['chat_teacher_message', 'chat_learner_message']);
    // Read/unread is not claimed (L5): the stored flag does not say the teacher read it.
    expect(chatRows[0]).toMatchObject({ detail_code: '', detail_number: 'שלום דנה, כל הכבוד'.length, session_number: 4, session_number_basis: 'telemetry_window' });
    expect(chatRows.every((r) => r.detail_code === '')).toBe(true);
    expect(rows.some((r) => r.detail_code === 'read' || r.detail_code === 'unread')).toBe(false);
    const flat = JSON.stringify(rows);
    expect(flat).not.toContain('שלום');
    expect(flat).not.toContain('AbCdTeacherUid');
    expect(flat).not.toContain('דנה');
  });

  it('a message outside every meeting window has no meeting rather than a guess', () => {
    const chat = { student_user3: { m1: { senderId: 'T', text: 'x', timestamp: T + 10 * 3_600_000, read: false } } };
    const rows = buildTeacherMediationRows({ telemetry: [ev('a', 'PROBLEM_LOAD', 3, 4, T)], chat, sessionDocs: [], students: null, catchUp: [] }, null);
    expect(rows[0]).toMatchObject({ session_number: '', session_number_basis: '' });
  });

  it('gate approval, support profile and catch-up rounds carry times and closed values only', () => {
    const rows = buildTeacherMediationRows({
      telemetry: [],
      chat: null,
      sessionDocs: [{ id: 'session_02_student_5', data: { student_id: 5, session_number: 2, teacher_gate_approved: true, gate_approved_at: T, gate_approved_by: 'uid-teacher', teacher_selected_path: 'remediation_path' } }],
      students: { student_user5: { support_profile_id: 'enhanced_cognitive_support', support_profile_version: 2, support_profile_updated_at: T + 1, support_profile_updated_by: 'uid-teacher' }, student_user6: { support_profile_id: null, support_profile_version: 1, support_profile_updated_at: T + 2 } },
      catchUp: [{ id: 'session_03_student_5', data: { student_id: 5, session_number: 3, rounds: { r_1: { action: 'reopen', reason: 'technical_fault', note: 'שם פרטי', recorded_by: 'uid-teacher', recorded_at: T + 3, opened_at: T + 4, closed_at: T + 5, closed_by: 'teacher', active_minutes: 7 } } } }],
    }, null);
    const kinds = rows.map((r) => r.event_kind).sort();
    expect(kinds).toEqual(['catchup_closed', 'catchup_opened', 'catchup_recorded', 'gate_approved', 'support_profile_set', 'support_profile_set']);
    expect(rows.find((r) => r.event_kind === 'gate_approved')).toMatchObject({ student_id: 5, session_number: 2, detail_code: 'remediation_path' });
    expect(rows.filter((r) => r.event_kind === 'support_profile_set').map((r) => r.detail_code)).toEqual(['enhanced_cognitive_support', 'none']);
    expect(rows.find((r) => r.event_kind === 'catchup_closed')).toMatchObject({ detail_code: 'teacher', detail_number: 7 });
    const flat = JSON.stringify(rows);
    expect(flat).not.toContain('uid-teacher');
    expect(flat).not.toContain('שם פרטי');
  });

  it('a single-meeting export keeps only that meeting', () => {
    const telemetry = [ev('a', 'HELP_REQUESTED', 1, 3, T, { help_count: 1 }), ev('b', 'HELP_REQUESTED', 1, 4, T + 1, { help_count: 1 })];
    const rows = buildTeacherMediationRows({ telemetry, chat: null, sessionDocs: [], students: null, catchUp: [] }, 4);
    expect(rows).toHaveLength(1);
    expect(rows[0].session_number).toBe(4);
  });

  it('orders learners by number, not as text', () => {
    const telemetry = [ev('a', 'HELP_REQUESTED', 10, 3, T), ev('b', 'HELP_REQUESTED', 2, 3, T + 1)];
    const rows = buildTeacherMediationRows({ telemetry, chat: null, sessionDocs: [], students: null, catchUp: [] }, null);
    expect(rows.map((r) => r.student_id)).toEqual([2, 10]);
  });
});

describe('measure 5: the teacher live records (owner, 11.10.2026)', () => {
  const rec = (id: string, data: Record<string, unknown>) => ({ id, data: { class_id: 'class_1', session_number: 4, note: null, recorded_by: 'uid-teacher', ...data } });

  it('joins a record to its telemetry row by ref_id, and to a learner chat message by its push id', () => {
    const telemetry = [ev('log_help', 'HELP_REQUESTED', 3, 4, T, { help_count: 1 }), ev('log_hes', 'HESITATION_DETECTED', 3, 4, T + 30_000, { hesitation_seconds: 45 })];
    const chat = { student_user3: { '-Nmsg1': { id: '-Nmsg1', senderId: 'student_user3', text: 'עזרה', timestamp: T + 10_000, read: false } } };
    const teacherLog = [
      rec('ev_log_help', { student_id: 3, event_ref: 'log_help', event_time_iso: new Date(T).toISOString(), action: 'approached', data_led: true, recorded_at: T + 60_000 }),
      rec('ev_chat__Nmsg1', { student_id: 3, event_ref: 'chat:-Nmsg1', event_time_iso: new Date(T + 10_000).toISOString(), action: 'wrote', data_led: false, recorded_at: T + 61_000 }),
    ];
    const rows = buildTeacherMediationRows({ telemetry, chat, sessionDocs: [], students: null, catchUp: [], teacherLog }, null);
    const help = rows.find((r) => r.ref_id === 'log_help')!;
    expect(help).toMatchObject({ teacher_action: 'ניגשה', data_led: 'כן', teacher_note: '' });
    const msg = rows.find((r) => r.event_kind === 'chat_learner_message')!;
    expect(msg).toMatchObject({ ref_id: '', teacher_action: 'כתבה', data_led: 'לא' });
    // An event with no record keeps the three cells blank.
    expect(rows.find((r) => r.ref_id === 'log_hes')).toMatchObject({ teacher_action: '', data_led: '', teacher_note: '' });
    const flat = JSON.stringify(rows);
    expect(flat).not.toContain('uid-teacher');
    expect(flat).not.toContain('chat:-Nmsg1');
  });

  it('the latest record of an event wins (the teacher changed the choice)', () => {
    const telemetry = [ev('log_card', 'SOCRATIC_CARD_SHOWN', 5, 4, T, { card_level: 1 })];
    const teacherLog = [
      rec('a', { student_id: 5, event_ref: 'log_card', event_time_iso: '', action: 'none', data_led: false, recorded_at: T + 1 }),
      rec('b', { student_id: 5, event_ref: 'log_card', event_time_iso: '', action: 'wrote_and_approached', data_led: true, recorded_at: T + 2 }),
    ];
    const rows = buildTeacherMediationRows({ telemetry, chat: null, sessionDocs: [], students: null, catchUp: [], teacherLog }, null);
    expect(rows[0]).toMatchObject({ teacher_action: 'כתבה וניגשה', data_led: 'כן' });
  });

  it('a physical approach without an event is its own row, and a single-meeting export keeps only its meeting', () => {
    const teacherLog = [
      rec('selfA', { student_id: 7, event_ref: null, event_time_iso: new Date(T + 5_000).toISOString(), action: 'approached', data_led: true, recorded_at: T + 5_000 }),
      rec('selfB', { student_id: 7, session_number: 5, event_ref: null, event_time_iso: new Date(T + 9_000).toISOString(), action: 'approached', data_led: false, recorded_at: T + 9_000 }),
      // Not a record: no data_led.
      rec('bad', { student_id: 7, event_ref: null, event_time_iso: new Date(T).toISOString(), action: 'approached' }),
    ];
    const all = buildTeacherMediationRows({ telemetry: [], chat: null, sessionDocs: [], students: null, catchUp: [], teacherLog }, null);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({
      student_id: 7, session_number: 4, session_number_basis: 'stored', event_kind: 'teacher_approach_self', event_source: 'teacher_log',
      ref_id: 'selfA', event_time_iso: new Date(T + 5_000).toISOString(), teacher_action: 'ניגשה', data_led: 'כן', teacher_note: '',
    });
    const scoped = buildTeacherMediationRows({ telemetry: [], chat: null, sessionDocs: [], students: null, catchUp: [], teacherLog }, 5);
    expect(scoped.map((r) => r.ref_id)).toEqual(['selfB']);
  });

  // L6: the client lists a chat help call once (mergeMediationEvents, CHAT_HELP_PAIR_MS);
  // the learner message within 10 seconds of it takes the call's record here too.
  it('a learner message within 10 seconds of a chat help call of the same learner takes the call\'s record', () => {
    const telemetry = [ev('log_chat_help', 'CHAT_HELP_REQUESTED', 3, 4, T, { kind: 'call' })];
    const chat = {
      student_user3: {
        '-Nnear': { id: '-Nnear', senderId: 'student_user3', text: 'קראו למורה', timestamp: T + 10_000 },
        '-Nfar': { id: '-Nfar', senderId: 'student_user3', text: 'עוד שאלה', timestamp: T + 10_001 },
      },
      student_user5: { '-Nother': { id: '-Nother', senderId: 'student_user5', text: 'עזרה', timestamp: T + 1_000 } },
    };
    const teacherLog = [
      rec('ev_log_chat_help', { student_id: 3, event_ref: 'log_chat_help', event_time_iso: new Date(T).toISOString(), action: 'approached', data_led: true, recorded_at: T + 30_000 }),
    ];
    const rows = buildTeacherMediationRows({ telemetry, chat, sessionDocs: [], students: null, catchUp: [], teacherLog }, null);
    expect(rows.find((r) => r.ref_id === 'log_chat_help')).toMatchObject({ teacher_action: 'ניגשה', data_led: 'כן' });
    const learner3 = rows.filter((r) => r.event_kind === 'chat_learner_message' && r.student_id === 3);
    expect(learner3.map((r) => r.event_time_iso)).toEqual([new Date(T + 10_000).toISOString(), new Date(T + 10_001).toISOString()]);
    // Inside the window: the call's record. One millisecond past it: a message of its own, unrecorded.
    expect(learner3[0]).toMatchObject({ teacher_action: 'ניגשה', data_led: 'כן', ref_id: '' });
    expect(learner3[1]).toMatchObject({ teacher_action: '', data_led: '' });
    // Another learner's message at the same moment is not that call.
    expect(rows.find((r) => r.student_id === 5)).toMatchObject({ teacher_action: '', data_led: '' });
  });

  it('a paired message keeps its own record when it has one, and a teacher message is never paired', () => {
    const telemetry = [ev('log_chat_help', 'CHAT_HELP_REQUESTED', 3, 4, T, { kind: 'ready_message' })];
    const chat = {
      student_user3: {
        '-Nown': { id: '-Nown', senderId: 'student_user3', text: 'אפשר עזרה בתרגיל?', timestamp: T - 4_000 },
        '-Nteacher': { id: '-Nteacher', senderId: 'TeacherUid', text: 'בא', timestamp: T + 2_000, read: true },
      },
    };
    const teacherLog = [
      rec('ev_log_chat_help', { student_id: 3, event_ref: 'log_chat_help', event_time_iso: '', action: 'approached', data_led: true, recorded_at: T + 30_000 }),
      rec('ev_chat__Nown', { student_id: 3, event_ref: 'chat:-Nown', event_time_iso: '', action: 'wrote', data_led: false, recorded_at: T + 31_000 }),
    ];
    const rows = buildTeacherMediationRows({ telemetry, chat, sessionDocs: [], students: null, catchUp: [], teacherLog }, null);
    expect(rows.find((r) => r.event_kind === 'chat_learner_message')).toMatchObject({ teacher_action: 'כתבה', data_led: 'לא' });
    expect(rows.find((r) => r.event_kind === 'chat_teacher_message')).toMatchObject({ teacher_action: '', data_led: '', detail_code: '' });
  });

  it('the pairing window is the client\'s, to the millisecond', () => {
    const client = readFileSync(resolve(__dirname, '../../../react-ts-version/src/core/teacherMediation.ts'), 'utf-8');
    expect(client).toContain(`export const CHAT_HELP_PAIR_MS = ${CHAT_HELP_PAIR_MS.toLocaleString('en-US').replace(/,/g, '_')};`);
    expect(client).toContain('Math.abs(h.at - c.at) <= CHAT_HELP_PAIR_MS');
  });

  it('a record never fills the row of another learner', () => {
    const telemetry = [ev('log_x', 'HELP_REQUESTED', 2, 4, T)];
    const teacherLog = [rec('c', { student_id: 9, event_ref: 'log_x', event_time_iso: '', action: 'wrote', data_led: true, recorded_at: T })];
    const rows = buildTeacherMediationRows({ telemetry, chat: null, sessionDocs: [], students: null, catchUp: [], teacherLog }, null);
    expect(rows[0].teacher_action).toBe('');
  });
});
