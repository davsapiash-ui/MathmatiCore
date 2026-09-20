import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';

/**
 * מודול 11 §א: "שחזור Snapshot דטרמיניסטי של מצב ה-VRA (קואורדינטות, כמויות,
 * **קלט**)". המחסנית שמרה את הלוח בלבד, ולכן הקלדה לא הייתה ניתנת לביטול.
 * במפגשים 2 ו-8 הלבנים אינן על המסך וההקלדה היא הפעולה היחידה — כך שלכפתור
 * הביטול לא היה מה לבטל, והוא הוסתר לגמרי במפגש 8.
 *
 * מודול 12 §א קובע שדווקא במפגש 8, "שבו לבני הדינס אינן מוצגות על המסך,
 * מתווסף תנאי שלישי: ביצוע שלוש פעולות ביטול פעולה רצופות בתרגיל בודד" —
 * כלומר הכפתור חייב להיות שם. גם טבלת התיקונים במסמך הסטיות (שורה 8) קובעת
 * שבמפגש 8 שלוש פעולות ביטול רצופות פותחות כרטיס חניכה.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

describe('undo restores what the learner typed (Module 11 §א)', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(8, false);
    const s = useWorkspaceStore.getState();
    const idx = getActiveTasks(s).findIndex((t) => typeof t.numberA === 'number' && typeof t.numberB === 'number');
    useWorkspaceStore.setState({ standardTaskIdx: Math.max(0, idx) });
  });

  it('a typed digit can be taken back, one step at a time', () => {
    useWorkspaceStore.getState().setAnswerDigit('units', '7');
    useWorkspaceStore.getState().setAnswerDigit('tens', '4');
    expect(useWorkspaceStore.getState().answerDigits).toMatchObject({ units: '7', tens: '4' });

    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().answerDigits.tens).toBeUndefined();
    expect(useWorkspaceStore.getState().answerDigits.units).toBe('7');

    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().answerDigits.units).toBeUndefined();
  });

  it('the memory circles and the hidden operand cells are restored too', () => {
    useWorkspaceStore.getState().setCarryDigit('tens', '1');
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().carryDigits.tens).toBeUndefined();

    useWorkspaceStore.getState().setOperandDigit('a', 'units', '3');
    expect(useWorkspaceStore.getState().operandDigits.a.units).toBe('3');
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().operandDigits.a.units).toBeFalsy();
  });

  it('meeting 8: three consecutive undos open the coaching card (Module 12 §א, trigger 3)', async () => {
    for (const [place, digit] of [['units', '1'], ['tens', '2'], ['hundreds', '3']] as const) {
      useWorkspaceStore.getState().setAnswerDigit(place, digit);
    }
    expect(useWorkspaceStore.getState().undoStack.length).toBe(3);

    useWorkspaceStore.getState().undo();
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().consecutiveUndoCount).toBe(2);
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().consecutiveUndoCount).toBe(3);

    // The card opens on the next tick, like every other trigger.
    await new Promise((r) => setTimeout(r, 0));
    expect(useWorkspaceStore.getState().socraticTriggerReason).toBe('consecutive_undos_3');
    expect(useWorkspaceStore.getState().helpState).toBe('socratic');
  });

  it('"consecutive" really means consecutive: typing between undos restarts the run', () => {
    useWorkspaceStore.getState().setAnswerDigit('units', '1');
    useWorkspaceStore.getState().setAnswerDigit('tens', '2');
    useWorkspaceStore.getState().undo();
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().consecutiveUndoCount).toBe(2);

    useWorkspaceStore.getState().setAnswerDigit('units', '9');
    expect(useWorkspaceStore.getState().consecutiveUndoCount).toBe(0);
  });

  it('undo is still not an error: it does not touch the error counters (Module 11 §א)', () => {
    useWorkspaceStore.getState().setAnswerDigit('units', '7');
    const before = useWorkspaceStore.getState();
    useWorkspaceStore.getState().undo();
    const after = useWorkspaceStore.getState();
    expect(after.typedErrorCount).toBe(before.typedErrorCount);
    expect(after.consecutiveErrorCount).toBe(before.consecutiveErrorCount);
    expect(after.undoCount).toBe(before.undoCount + 1);
  });

  it('the button is present in every meeting, meeting 8 included', () => {
    const topbar = src('features/workspace/WorkspaceTopbar.tsx');
    const label = topbar.indexOf('aria-label="בטל פעולה אחרונה"');
    expect(label).toBeGreaterThan(-1);
    // Nothing gates it on the meeting number. ("הצג לוח" right below it IS gated
    // on meeting 8, correctly — there are no blocks there.)
    const buttonStart = topbar.lastIndexOf('<button', label);
    expect(topbar.slice(topbar.lastIndexOf('>', buttonStart), buttonStart)).not.toContain('sessionNumber');
  });

  it('the stack is still capped at 10 (Module 11 §א)', () => {
    for (let i = 0; i < 15; i++) useWorkspaceStore.getState().setAnswerDigit('units', String(i % 10));
    expect(useWorkspaceStore.getState().undoStack.length).toBe(10);
  });
});
