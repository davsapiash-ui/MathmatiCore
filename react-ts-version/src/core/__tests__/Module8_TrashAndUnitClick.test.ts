import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * ביקורת צד הילד, 22.9.2026 — מודול 8 §א.
 *
 * 1. לחיצה על לבנה = פריטה לעשר לבנות בערך הנמוך הסמוך. ליחידה אין ערך נמוך
 *    יותר, ולכן הלחיצה אינה עושה דבר. בקוד היא **מחקה** את הלבנה — נתיב
 *    מחיקה שלישי שאינו באפיון (יש בדיוק שניים: גרירה לפח ולחיצה על הפח).
 * 2. "גרירת לבנת דינס בודדת אל פח האשפה… מתועדת כאירוע טלמטריה תקני ומסונכרנת
 *    לשרת". עד כה רק היומן הסמנטי ב-RTDB ראה אותה; שום אירוע ממודול 5 לא נשלח.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const store = src('application/useWorkspaceStore.ts');

describe('לחיצה על לבנת יחידה אינה מוחקת אותה', () => {
  it('הטור מפעיל פריטה רק לטורים שיש להם ערך נמוך יותר', () => {
    const column = src('features/workspace/board/PlaceColumn.tsx');
    expect(column).toContain("if (place !== 'units') splitBlockClick(place);");
    expect(column).not.toContain("removeBlockClick('units')");
  });
});

describe('השלכה לפח היא אירוע טלמטריה תקני', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: 'student_user5', name: 'user5' } as any, role: 'student', isAuthenticated: true });
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(3, false);
    useWorkspaceStore.setState({ counts: { units: 2, tens: 1, hundreds: 0, thousands: 0 } } as any);
  });

  it('הענף קיים: BLOCK_DRAG_COMPLETE, ושני שדות הטור נושאים את הטור שהלבנה עזבה', () => {
    const branch = store.slice(
      store.indexOf("} else if (isDelete && input.sourcePlace) {"),
      store.indexOf('return { ', store.indexOf("} else if (isDelete && input.sourcePlace) {"))
    );
    expect(branch).toContain("event_type: 'BLOCK_DRAG_COMPLETE'");
    expect(branch).toContain('column_index: leftColIdx,');
    expect(branch).toContain('source_column_index: leftColIdx,');
  });

  it('הלבנה נמחקת, המחיקה אינה נספרת כטעות ואינה נוגעת במונה הביטולים', () => {
    const before = useWorkspaceStore.getState();
    useWorkspaceStore.getState().applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'trash' } });
    const after = useWorkspaceStore.getState();
    expect(after.counts.tens).toBe(0);
    expect(after.consecutiveErrorCount).toBe(before.consecutiveErrorCount);
    expect(after.typedErrorCount).toBe(before.typedErrorCount);
    expect(after.undoCount).toBe(before.undoCount);
    expect(after.hasDeletedBlock).toBe(true);
  });

  it('גרירה לאותו טור שקטה — ולכן שוויון שני שדות הטור מזהה השלכה בלבד', () => {
    const before = useWorkspaceStore.getState().counts;
    useWorkspaceStore.getState().applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    expect(useWorkspaceStore.getState().counts).toEqual(before);
  });

  it('ציר הזמן של המורה מתאר את ההשלכה כהשלכה', () => {
    const journey = src('infrastructure/services/LearnerJourneyService.ts');
    expect(journey).toContain('הושלכה לפח האשפה');
    expect(journey).toContain('d.source_column_index === e.columnIndex');
  });
});
