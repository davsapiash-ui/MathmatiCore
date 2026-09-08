import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Every control in the admin console, checked against what it actually does
 * on the server. Each case here pins a control that used to look functional
 * while doing nothing (or the wrong thing):
 *
 *  - Overview "שליחת דוח ל-Drive": pushed to an RTDB node no rule permits, so
 *    it failed before calling the function, and a second try/catch turned any
 *    server failure into a success toast with a hard-coded link.
 *  - Overview "ניקוי היסטוריית הקלטות": read `replays`, which nothing writes.
 *  - Layout bell: counted the RTDB student chat store — always zero.
 *  - Layout "Ghost Mode" banner: claimed admin actions are not recorded while
 *    AuditLogger records every one of them to audit_logs.
 *  - Chat: never marked teacher messages read; labelled teachers by their
 *    e-mail-derived record key.
 *  - Curriculum: a hand-written catalog describing multiplication lessons that
 *    exist in neither the banks nor the PRD; a calibration slider that never
 *    loaded the saved value; a second slider whose value nothing reads.
 *  - Wizard "הקמת כיתה": an editable student limit the save ignored; a class
 *    type the store dropped.
 */
vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, db: {}, functions: {}, auth: { currentUser: null }, authReady: Promise.resolve() }));
vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn(), get: vi.fn(), set: vi.fn(), update: vi.fn(), push: vi.fn(() => ({ key: 'k' })), runTransaction: vi.fn(), onDisconnect: vi.fn(() => ({ set: vi.fn() })), serverTimestamp: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), onSnapshot: vi.fn(), collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), getDocs: vi.fn() }));

import { buildSessionCatalog } from '../AdminCurriculumView';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

describe('Admin overview controls', () => {
  const view = read('../AdminOverview.tsx');

  it('the Drive export calls the function, awaits it, and reports its real outcome', () => {
    expect(view.includes("dbRef(database, 'reports')")).toBe(false);
    expect(view.includes('"exportAdminReportToDrive"')).toBe(true);
    expect(view.includes('const res = await exportDrive({')).toBe(true);
    expect(view.includes('res.data?.webViewLink')).toBe(true);
    // No more hard-coded Drive folder / service-account strings in the UI.
    expect(view.includes('0AMiALsm_TxT5Uk9PVA')).toBe(false);
    expect(view.includes('1002220159@edu-haifa.org.il')).toBe(false);
  });

  it('the dead "30-day recording cleanup" button is gone, with an accurate note in its place', () => {
    expect(view.includes('handleDataCleanup')).toBe(false);
    expect(view.includes("ref(database, 'replays')")).toBe(false);
    expect(view.includes('וידאו וקול')).toBe(false);
    expect(view.includes('ללא מצלמה, מיקרופון או שמע')).toBe(true);
  });
});

describe('Admin layout', () => {
  const layout = read('../../AdminLayout.tsx');

  it('the bell counts unread teacher messages from Firestore and opens the chat', () => {
    expect(layout.includes('useChatStore')).toBe(false);
    expect(layout.includes('where("receiver_id", "==", "admin"), where("read", "==", false)')).toBe(true);
    expect(layout).toMatch(/<NavLink\s+to="\/admin\/chat"/);
  });

  it('no longer claims a "Ghost Mode" in which admin actions are not recorded', () => {
    expect(layout.includes('Ghost Mode')).toBe(false);
    expect(layout.includes('מצב רפאים')).toBe(false);
  });
});

describe('Admin chat', () => {
  const chat = read('../AdminChatView.tsx');

  it('marks a teacher\'s incoming messages read when the conversation is opened', () => {
    expect(chat.includes('updateDoc(doc(db, "messages", m.id), { read: true })')).toBe(true);
  });

  it('labels teachers by name and school, never by the e-mail-derived key', () => {
    expect(chat.includes('label: t.name ||')).toBe(true);
    expect(chat.includes('מורה מוסמך (${anonId})')).toBe(false);
    expect(chat.includes('מזהה אנונימי: {selectedTeacher.id}')).toBe(false);
  });
});

describe('Admin curriculum', () => {
  const view = read('../AdminCurriculumView.tsx');

  it('derives the catalog from the real banks: 8 sessions, 7 compulsory tasks per bank from session 2 on', () => {
    const catalog = buildSessionCatalog();
    expect(catalog.map((s) => s.sessionId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const session of catalog.slice(1)) {
      for (const bank of session.banks) {
        expect(bank.compulsory).toHaveLength(7);
      }
    }
    // Sessions 3–8 carry a green and a remediation bank (Module 26).
    for (const session of catalog.slice(2)) expect(session.banks).toHaveLength(2);
    // Sessions 3–7 offer reinforcement/challenge branches after the 7 compulsory tasks (Module 14 §ג).
    for (const session of catalog.slice(2, 7)) {
      for (const bank of session.banks) {
        expect(bank.reinforcement.length + bank.challenge.length).toBeGreaterThan(0);
      }
    }
    const allText = JSON.stringify(catalog);
    expect(allText).not.toContain('כפל');
  });

  it('loads the saved hesitation threshold and no longer offers a dead deletions slider', () => {
    expect(view.includes("getDoc(doc(db, 'system_control', 'trace_calibration'))")).toBe(true);
    expect(view.includes('undo_threshold_clicks:')).toBe(false);
    expect(view.includes('setUndoThreshold')).toBe(false);
    expect(view.includes('SESSIONS_CURRICULUM_CATALOG')).toBe(false);
  });
});

describe('Admin wizard — class creation', () => {
  const wizard = read('../AdminWizardModal.tsx');
  const store = read('../../../../application/useAdminStore.ts');

  it('shows the global limit read-only where the save would ignore an edited one', () => {
    expect(wizard.includes('{globalStudentLimit} תלמידים')).toBe(true);
  });

  it('persists the chosen class type', () => {
    expect(wizard.includes('addClassRoom(selectedSchoolId, teacherId, PILOT_CLASS_NAME, classType)')).toBe(true);
    expect(store.includes('classType?: string;')).toBe(true);
    expect((store.match(/\.\.\.\(classType \? \{ classType \} : \{\}\)/g) || []).length).toBe(2);
  });
});
