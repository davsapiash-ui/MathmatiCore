// @vitest-environment jsdom
/**
 * PRD Module 15 §ג — מסך ההדגמה של המורה (owner, 9.10.2026).
 *
 *  - A station picker (1–8) replaced the range picker ("תחום ה-1,000 /
 *    תחום ה-10,000"): station 1 is the 1,000 range, stations 3–7 the 10,000
 *    range, with the thousands column.
 *  - Stations 2 and 8 have no demonstration: one sentence, no board.
 *  - Stations 3–7 show the task card as the learners see it, beside the board,
 *    in demo mode: no read-aloud, no checking, no "ממשיכים".
 *  - Nothing the teacher does is recorded: no telemetry event, no research
 *    trace, no write to a learner record. The only database write is the
 *    broadcast flag, as before; the chosen station is written nowhere.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('firebase/database', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  set: vi.fn(() => Promise.resolve()),
  onDisconnect: vi.fn(() => ({ set: () => Promise.resolve(), cancel: () => Promise.resolve() })),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
  onValue: vi.fn(() => () => {}),
  get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => ({ key: 'k' })),
}));

const emitTelemetry = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  emitTelemetry,
}));

const throttledRtdbUpdate = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/infrastructure/services/ThrottledRtdbWriter', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  throttledRtdbUpdate,
}));

import { set as rtdbSet, update as rtdbUpdate } from 'firebase/database';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { ProjectorSandboxPage } from '../ProjectorSandboxPage';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { NO_DEMO_HE, TEACHER_DEMOS } from '@/data/teacherDemos';

function renderProjector() {
  return render(
    <MemoryRouter initialEntries={['/projector']}>
      <Routes>
        <Route path="/projector" element={<ProjectorSandboxPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const pick = (n: number) => fireEvent.click(screen.getByRole('button', { name: `תחנה ${n}` }));
const board = () => screen.queryByLabelText('בית המספרים');

beforeEach(() => {
  useAuthStore.setState({
    user: { uid: 'teacher_1', role: 'teacher' } as never,
    role: 'teacher',
    isAuthenticated: true,
    isStudentAuthenticated: false,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the station picker', () => {
  it('replaces the range picker: eight stations, no "תחום ה-…" button', () => {
    renderProjector();
    const group = screen.getByRole('group', { name: 'בחירת תחנה' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(
      ['תחנה 1', 'תחנה 2', 'תחנה 3', 'תחנה 4', 'תחנה 5', 'תחנה 6', 'תחנה 7', 'תחנה 8']
    );
    expect(screen.queryByText(/תחום ה-1,000/)).toBeNull();
    expect(screen.queryByText(/תחום ה-10,000/)).toBeNull();
  });

  it('station 1: the 1,000 range — an empty board without a thousands column, its digits shown, no task card', () => {
    renderProjector();
    expect(screen.getByRole('button', { name: 'תחנה 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(useWorkspaceStore.getState().sessionNumber).toBe(1);
    expect(useWorkspaceStore.getState().projectorBoard).toBe(true);
    expect(board()).not.toBeNull();
    expect(document.getElementById('column-thousands-dropzone')).toBeNull();
    expect(screen.queryByTestId('demo-task-card')).toBeNull();
    // Undo and clear stay; "התחילו מחדש" belongs to stations 3–7.
    expect(screen.getByTitle('ביטול הפעולה האחרונה')).toBeTruthy();
    expect(screen.getByTitle('ניקוי כל הלבנים מבית המספרים')).toBeTruthy();
    expect(screen.queryByText('התחילו מחדש')).toBeNull();
  });

  it('stations 3–7: the 10,000 range — the thousands column, beside the task card', () => {
    renderProjector();
    for (const n of [3, 4, 5, 6, 7]) {
      pick(n);
      expect(screen.getByText('התחילו מחדש')).toBeTruthy();
      expect(useWorkspaceStore.getState().sessionNumber).toBe(n);
      expect(board()).not.toBeNull();
      expect(document.getElementById('column-thousands-dropzone')).not.toBeNull();
      const card = screen.getByTestId('demo-task-card');
      expect(within(card).getByTestId('station-tag').textContent).toBe(`תחנה ${n}`);
      expect(within(card).getByTestId('demo-instruction').textContent).toBe(TEACHER_DEMOS[n as 3][0].instructionHe);
    }
  });

  it.each([2, 8])('station %i: "בתחנה זו אין הדגמה." and no board', (n) => {
    renderProjector();
    pick(n);
    expect(screen.getByText(NO_DEMO_HE)).toBeTruthy();
    expect(NO_DEMO_HE).toBe('בתחנה זו אין הדגמה.');
    expect(board()).toBeNull();
    expect(screen.queryByTestId('demo-task-card')).toBeNull();
    expect(screen.queryByTitle('ביטול הפעולה האחרונה')).toBeNull();
  });

  it('the part switch: stations 3 and 7 only, and a part starts from the beginning', () => {
    renderProjector();
    pick(4);
    expect(screen.queryByRole('group', { name: 'בחירת חלק ההדגמה' })).toBeNull();
    pick(3);
    const parts = screen.getByRole('group', { name: 'בחירת חלק ההדגמה' });
    expect(within(parts).getAllByRole('button').map((b) => b.textContent)).toEqual(['חלק א', 'חלק ב']);
    expect(screen.getByTestId('task-heading').textContent).toContain('פורטים לבנים');
    act(() => useWorkspaceStore.getState().applyDrop({ source: 'palette', sourcePlace: 'hundreds', target: { kind: 'column', place: 'hundreds' } } as never));
    fireEvent.click(within(parts).getByRole('button', { name: 'חלק ב' }));
    expect(screen.getByTestId('task-heading').textContent).toContain('קוראים וכותבים מספרים');
    expect(useWorkspaceStore.getState().counts.hundreds).toBe(0);
    pick(7);
    expect(within(screen.getByRole('group', { name: 'בחירת חלק ההדגמה' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['דוגמה א', 'דוגמה ב']);
  });
});

describe('demo mode: the teacher does everything, nothing judges it', () => {
  it('the card has no read-aloud, no steps, no done box, no "ממשיכים"', () => {
    renderProjector();
    for (const n of [3, 4, 5, 6, 7]) {
      pick(n);
      expect(screen.queryAllByLabelText('הקראה בקול')).toEqual([]);
      expect(screen.queryByTestId('guide-steps')).toBeNull();
      expect(screen.queryByTestId('session1-done')).toBeNull();
      expect(screen.queryByText(/ממשיכים/)).toBeNull();
    }
  });

  it('a wrong digit is just a digit: no card, no cue, no lock', () => {
    renderProjector();
    pick(4);
    const units = screen.getByLabelText('ספרה 3 מתוך 3 בשורת התוצאה') as HTMLInputElement;
    for (let i = 0; i < 5; i++) fireEvent.change(units, { target: { value: String(i) } });
    const s = useWorkspaceStore.getState();
    expect(s.answerDigits.units).toBe('4');
    expect(s.helpState).toBe('closed');
    expect(s.placeCuesShown).toBe(false);
    expect(units.readOnly).toBe(false);
    expect(screen.queryByText(/נכון/)).toBeNull();
  });

  it('"התחילו מחדש" takes the demonstration back to its start', () => {
    renderProjector();
    pick(5);
    act(() => useWorkspaceStore.getState().applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } } as never));
    fireEvent.change(screen.getByLabelText('ספרה 2 מתוך 2 בשורת התוצאה'), { target: { value: '6' } });
    fireEvent.click(screen.getByText('התחילו מחדש'));
    const s = useWorkspaceStore.getState();
    expect(s.counts.tens).toBe(0);
    expect(s.answerDigits).toEqual({});
    expect(s.undoStack).toEqual([]);
  });

  it('"נקו את בית המספרים" takes the blocks away, and undo brings them back', () => {
    renderProjector();
    pick(3);
    act(() => useWorkspaceStore.getState().applyDrop({ source: 'palette', sourcePlace: 'hundreds', target: { kind: 'column', place: 'hundreds' } } as never));
    fireEvent.click(screen.getByTitle('ניקוי כל הלבנים מבית המספרים'));
    expect(useWorkspaceStore.getState().counts.hundreds).toBe(0);
    fireEvent.click(screen.getByTitle('ביטול הפעולה האחרונה'));
    expect(useWorkspaceStore.getState().counts.hundreds).toBe(1);
  });
});

describe('demo mode writes nothing', () => {
  it('no telemetry, no research trace, no learner record — only the broadcast flag', () => {
    vi.mocked(rtdbSet).mockClear();
    vi.mocked(rtdbUpdate).mockClear();
    emitTelemetry.mockClear();
    throttledRtdbUpdate.mockClear();
    const serviceEmit = vi.spyOn(firebaseSyncService, 'emitTelemetry');
    const traceSync = vi.spyOn(firebaseSyncService, 'syncTraceData');
    // A learner record under the teacher's id would let a trace through.
    useStore.setState({ students: { teacher_1: { id: 'teacher_1' } } } as never);

    renderProjector();
    const drop = (place: string, target: unknown = { kind: 'column', place }) =>
      act(() => useWorkspaceStore.getState().applyDrop({ source: 'palette', sourcePlace: place, target } as never));

    // Station 1: blocks, a trash drop, undo, clear.
    drop('tens');
    drop('tens', { kind: 'trash' });
    fireEvent.click(screen.getByTitle('ביטול הפעולה האחרונה'));
    fireEvent.click(screen.getByTitle('ניקוי כל הלבנים מבית המספרים'));

    // Station 3: build, break a hundred, write the number.
    pick(3);
    drop('hundreds');
    drop('hundreds');
    drop('hundreds');
    act(() => useWorkspaceStore.getState().applyDrop({ source: 'column', sourcePlace: 'hundreds', target: { kind: 'column', place: 'tens' } } as never));
    fireEvent.change(screen.getByTestId('representation-answer'), { target: { value: '350' } });

    // Station 4: the sheet, its circle, a wrong digit, its deletion.
    pick(4);
    for (let i = 0; i < 10; i++) drop('units');
    fireEvent.change(screen.getByLabelText('עיגול זיכרון 2 מתוך 3'), { target: { value: '1' } });
    const units = screen.getByLabelText('ספרה 3 מתוך 3 בשורת התוצאה');
    fireEvent.change(units, { target: { value: '9' } });
    fireEvent.change(units, { target: { value: '' } });
    fireEvent.change(units, { target: { value: '4' } });
    fireEvent.click(screen.getByTitle('ביטול הפעולה האחרונה'));

    // Station 7: the hidden digit of the first number, then the other example.
    pick(7);
    fireEvent.change(screen.getByLabelText('הספרה החסרה במספר הראשון: ספרה 2 מתוך 3'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('ספרה 3 מתוך 3 בשורת התוצאה'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'דוגמה ב' }));
    fireEvent.click(screen.getByText('התחילו מחדש'));

    expect(emitTelemetry).not.toHaveBeenCalled();
    expect(serviceEmit).not.toHaveBeenCalled();
    expect(traceSync).not.toHaveBeenCalled();
    expect(throttledRtdbUpdate).not.toHaveBeenCalled();
    expect(rtdbUpdate).not.toHaveBeenCalled();
    // Every database write is the broadcast flag, and none names a station.
    const writes = vi.mocked(rtdbSet).mock.calls;
    expect(writes.length).toBeGreaterThan(0);
    for (const [r, v] of writes) {
      expect((r as unknown as { path: string }).path).toBe('system_control/projector_mode');
      expect(Object.keys(v as object).sort()).toEqual(['projector_mode', 'projector_mode_updated_at', 'updated_by_teacher_id']);
    }
    expect((useStore.getState().students as Record<string, { traceData?: unknown }>).teacher_1?.traceData).toBeUndefined();
    useStore.setState({ students: {} } as never);
  });

  it('closing the page ends demo mode', () => {
    const { unmount } = renderProjector();
    expect(useWorkspaceStore.getState().projectorBoard).toBe(true);
    unmount();
    expect(useWorkspaceStore.getState().projectorBoard).toBe(false);
  });
});
