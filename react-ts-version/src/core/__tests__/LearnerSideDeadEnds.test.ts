import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';


import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

/**
 * מבואות סתומים בצד הלומד — מקומות שבהם ילד בן 8 לחץ ולא קרה כלום, או שהמערכת
 * זרקה את העבודה שלו, או ששכחה לרשום שסיים.
 *
 * 1. "הוסף ייצוג" מחק את הלוח בין שני הייצוגים — ובמקביל ההנחיה אמרה "בנו, הוסיפו,
 *    ואז קבצו והוסיפו שוב". לא היה מה לקבץ. הלוח נשאר; לחיצה כפולה על אותה
 *    בנייה אינה נספרת כייצוג שני.
 * 2. "סיום המפגש כעת" קבע flowStatus ולא רשם highestCompletedMeeting — הלומד
 *    שסיים את כל שבע משימות החובה נרשם כמי שלא סיים.
 * 3. "התקדם" בלי בחירה / בלי תשובה עשה כלום, בלי שום הודעה.
 * 4. שלושת חלונות העזרה לא נסגרו ב-Escape (מסמך העיצוב §1.2), וכפתור
 *    "הבנתי, סגור" ננעל ל-30 שניות יחד עם כפתורי המענה — מודול 12 §ב נועל
 *    את כפתורי המענה בלבד.
 * 5. אירועי לומד נדחפו ליומן הביקורת הגלובלי שמנהל המערכת רואה (מודול 24 §ב).
 * 6. מונח אחיד לילד: "פח האשפה", לא "פח המחזור" / "מחוץ ללוח".
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

describe('ייצוג שני — הלוח נשאר, ואותה בנייה אינה נספרת פעמיים', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(3, false);
  });

  it('הייצוג הראשון נרשם והלבנים נשארות על הלוח', () => {
    // Find the active task's target so the representation is accepted.
    const state = useWorkspaceStore.getState();
    const activeTask = getActiveTasks(state)[state.standardTaskIdx];
    const target = activeTask?.numberA as number | undefined;
    expect(typeof target).toBe('number');
    const counts = countsFor(target as number);
    useWorkspaceStore.setState({ counts, undoStack: [{ ...counts }] as any });

    useWorkspaceStore.getState().addRepresentation();

    const after = useWorkspaceStore.getState();
    expect(after.q3Reps).toHaveLength(1);
    expect(after.counts).toEqual(counts);
    expect(after.undoStack.length).toBeGreaterThan(0);
  });

  it('לחיצה שנייה על אותה בנייה אינה נספרת כייצוג שני, ומוסברת', () => {
    const state = useWorkspaceStore.getState();
    const activeTask = getActiveTasks(state)[state.standardTaskIdx];
    const target = activeTask?.numberA as number;
    const counts = countsFor(target);
    useWorkspaceStore.setState({ counts });
    useWorkspaceStore.getState().addRepresentation();
    expect(useWorkspaceStore.getState().q3Reps).toHaveLength(1);

    useWorkspaceStore.getState().addRepresentation();
    const after = useWorkspaceStore.getState();
    expect(after.q3Reps).toHaveLength(1);
    expect(after.feedback?.title).toContain('אוֹתָהּ דֶּרֶךְ');
  });

  it('בנייה שונה של אותו מספר נספרת כייצוג שני', () => {
    const state = useWorkspaceStore.getState();
    const activeTask = getActiveTasks(state)[state.standardTaskIdx];
    const target = activeTask?.numberA as number;
    const first = countsFor(target);
    useWorkspaceStore.setState({ counts: first });
    useWorkspaceStore.getState().addRepresentation();

    // Regroup one ten into ten units — same value, different representation.
    const second = { ...first, tens: first.tens - 1, units: first.units + 10 };
    useWorkspaceStore.setState({ counts: second });
    useWorkspaceStore.getState().addRepresentation();
    expect(useWorkspaceStore.getState().q3Reps).toHaveLength(2);
  });
});

describe('"סיום המפגש כעת" רושם את המפגש כמושלם', () => {
  const syncSpy = vi.spyOn(firebaseSyncService, 'syncHighestCompletedMeeting').mockResolvedValue(undefined);
  beforeEach(() => {
    syncSpy.mockClear();
    useWorkspaceStore.getState().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user4', name: 'user4' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({
      students: {
        student_user4: { studentId: 'student_user4', name: 'user4', classId: 'live', highestCompletedMeeting: 2 } as any,
      },
    } as any);
    useWorkspaceStore.getState().initSession(3, false);
  });

  it('highestCompletedMeeting מתעדכן מקומית ונשלח לשרת', () => {
    useWorkspaceStore.getState().finishMeetingEarly();

    expect(useWorkspaceStore.getState().flowStatus).toBe('reflection');
    expect(useStore.getState().students.student_user4.highestCompletedMeeting).toBe(3);
    expect(syncSpy).toHaveBeenCalledWith('student_user4', 3);
  });

  it('מכשיר שהוחלף אינו רושם השלמה בשם הלומד', () => {
    useWorkspaceStore.setState({ isSupersededByOtherDevice: true });
    useWorkspaceStore.getState().finishMeetingEarly();
    expect(useWorkspaceStore.getState().flowStatus).toBe('reflection');
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('המסך של המסיימים-מוקדם קורא לפעולה הזו, לא קובע flowStatus ישירות', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    const skip = page.slice(page.indexOf('onSkipToFinish'), page.indexOf('onSkipToFinish') + 200);
    expect(skip).toContain('finishMeetingEarly()');
    expect(skip).not.toContain("setState({ flowStatus: 'reflection' })");
  });
});

describe('"התקדם" בלי בחירה מסביר, לא שותק', () => {
  const store = src('application/useWorkspaceStore.ts');

  it('small_change ללא בחירה מציג משוב', () => {
    const block = store.slice(store.indexOf("if (task.type === 'small_change')"), store.indexOf("if (task.type === 'small_change')") + 600);
    expect(block).toContain('בַּחֲרוּ תְּשׁוּבָה');
    expect(block).not.toMatch(/if \(!s\.selectedChoiceId\) return;/);
  });

  it('missing_element ללא תשובה מציג משוב', () => {
    const block = store.slice(store.indexOf("if (task.type === 'missing_element')"), store.indexOf("if (task.type === 'missing_element')") + 600);
    expect(block).toContain('נָא לְהַקְלִיד תְּשׁוּבָה');
    expect(block).not.toMatch(/Number\.isNaN\(answer\)\) return;/);
  });
});

describe('חלונות העזרה — Escape סוגר, וכפתור הסגירה אינו ננעל', () => {
  const overlays = src('features/workspace/overlays/HelpOverlays.tsx');

  it('שני חלונות העזרה מחוברים ל-useDismissableOverlay', () => {
    expect(overlays).toContain("import { useDismissableOverlay } from '@/hooks/useDismissableOverlay'");
    expect(overlays).toContain("useDismissableOverlay<HTMLDivElement>(helpState === 'palette', closeHelp)");
    expect(overlays).toContain("helpState === 'metacognitive' || helpState === 'worked_example'");
    expect(overlays).toContain('ref={paletteRef}');
    expect(overlays).toContain('ref={contentRef}');
  });

  it('כפתור "הבנתי, סגור" אינו disabled בזמן נעילת המענה', () => {
    const closeBtn = overlays.slice(overlays.lastIndexOf('onClick={onClose}'), overlays.lastIndexOf('onClick={onClose}') + 500);
    expect(closeBtn).not.toContain('disabled={lockSeconds > 0}');
    expect(closeBtn).not.toContain('חלונית נעולה');
    expect(closeBtn).toContain('הבנתי, סגור חלונית');
  });
});

describe('יומן הביקורת הגלובלי אינו מקבל אירועי לומד (מודול 24 §ב)', () => {
  const logger = src('infrastructure/services/AuditLogger.ts');

  it('הדחיפה ל-audit_logs מותנית ב-!isStudentEvent', () => {
    const pushIdx = logger.indexOf("ref(database, 'audit_logs')");
    expect(pushIdx).toBeGreaterThan(0);
    const before = logger.slice(Math.max(0, pushIdx - 200), pushIdx);
    expect(before).toContain('if (!isStudentEvent)');
  });
});

describe('מונח אחיד לילד: פח האשפה', () => {
  it('ההנחיות והטיפים אינם מדברים על "פח המחזור" או "מחוץ ללוח"', () => {
    for (const p of [
      'features/workspace/tasks/IntroTask.tsx',
      'features/workspace/overlays/HelpOverlays.tsx',
      'application/useWorkspaceStore.ts',
    ]) {
      const text = src(p);
      expect(text, p).not.toContain('פח המחזור');
      expect(text, p).not.toContain('מחוץ ללוח');
    }
    expect(src('features/workspace/tasks/IntroTask.tsx')).toContain('פח האשפה');
  });
});

/* helpers */
function countsFor(n: number) {
  return {
    thousands: Math.floor(n / 1000),
    hundreds: Math.floor((n % 1000) / 100),
    tens: Math.floor((n % 100) / 10),
    units: n % 10,
  };
}

