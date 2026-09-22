import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore, getActiveTasks, activeExerciseId } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { getSessionTasks } from '@/data/sessionTasks';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * סימולציה של מסלול מלא, 23.9.2026 — ילד אמיתי דרך החנות האמיתית.
 *
 * כל הבדיקות עד כה היו נקודתיות: פונקציה אחת, מחרוזת אחת, מצב אחד. באגים
 * אמיתיים בפיילוט לא יושבים שם — הם יושבים **בין** הצעדים: התרגיל החמישי
 * שנפתח על מספרים של התרגיל הרביעי, המונה שלא התאפס, מסך שנתקע אחרי
 * התרגיל השביעי. כאן הילד באמת פותר מפגש שלם, תרגיל אחרי תרגיל, ואני בודק
 * את המצב אחרי כל צעד.
 *
 * מה שזה לא מחליף: רינדור אמיתי, רשת אמיתית, חוקי אבטחה (אלה נבדקים
 * בנפרד מול אמולטור, `npm run test:rules`).
 */
const STUDENT = 'student_user12';

function setPath(path: 'green_path' | 'remediation_path') {
  useStore.setState((s) => ({
    students: { ...s.students, [STUDENT]: { ...(s.students[STUDENT] ?? {}), pedagogicalPath: path } as any },
  }));
}

/** הילד פותר נכון את התרגיל שעל המסך: בונה בלוח ומקליד את התשובה. */
function solveCurrentExercise(): { id: string; answered: number | string | null } {
  const s = useWorkspaceStore.getState();
  const task = getActiveTasks(s)[s.standardTaskIdx];
  if (!task) return { id: '', answered: null };

  if (task.choices && task.choices.length > 0) {
    // השדה הוא `correct`. בגרסה הראשונה של הקובץ הזה נכתב `isCorrect`,
    // ואז ה-find החזיר undefined והסימולציה בחרה תמיד את האפשרות הראשונה —
    // כלומר לא הוכיחה את מה שטענה. אם אין אפשרות מסומנת, זו טעות בנתונים
    // ולא משהו שצריך לעקוף בשקט.
    const correct = task.choices.find((c) => c.correct === true);
    if (!correct) throw new Error(`התרגיל ${task.id} אינו מסמן אף אפשרות כנכונה`);
    useWorkspaceStore.getState().selectChoice(correct.id);
    return { id: task.id, answered: correct.id };
  }

  const target =
    typeof task.correctAnswer === 'number'
      ? task.correctAnswer
      : typeof task.numberA === 'number' && typeof task.numberB === 'number'
        ? (task.isSubtraction ? task.numberA - task.numberB : task.numberA + task.numberB)
        : null;

  if (target === null) return { id: task.id, answered: null };

  const digits = String(Math.abs(target)).padStart(4, '0').split('').map(Number);
  const [th, h, t, u] = digits.slice(-4);
  useWorkspaceStore.setState({ counts: { units: u, tens: t, hundreds: h, thousands: th } } as any);
  const set = useWorkspaceStore.getState().setAnswerDigit;
  set('units', String(u));
  set('tens', String(t));
  set('hundreds', String(h));
  set('thousands', String(th));
  return { id: task.id, answered: target };
}

describe('מפגש 4 מלא, מסלול ירוק — שבעת תרגילי החובה', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    setPath('green_path');
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(4, false);
  });

  it('המאגר הוא בדיוק שבעה תרגילי חובה, והראשון הוא התרגיל הראשון של המאגר', () => {
    const bank = getSessionTasks(4, 'green_path');
    expect(bank.length).toBe(7);
    const s = useWorkspaceStore.getState();
    expect(s.standardTaskIdx).toBe(0);
    expect(getActiveTasks(s)[0].id).toBe(bank[0].id);
  });

  it('הילד עובר את שבעת התרגילים ברצף, בלי לדלג ובלי להיתקע', () => {
    const bank = getSessionTasks(4, 'green_path');
    const visited: string[] = [];

    for (let i = 0; i < 7; i++) {
      const s = useWorkspaceStore.getState();
      const task = getActiveTasks(s)[s.standardTaskIdx];
      expect(task, `תרגיל ${i + 1} קיים`).toBeTruthy();
      visited.push(task.id);
      expect(activeExerciseId(s)).toBe(task.id);

      solveCurrentExercise();
      useWorkspaceStore.getState().proceed();

      if (i < 6) {
        expect(useWorkspaceStore.getState().standardTaskIdx, `אחרי תרגיל ${i + 1}`).toBe(i + 1);
      }
    }

    expect(visited).toEqual(bank.map((t) => t.id));
    expect(new Set(visited).size).toBe(7);
  });

  it('בסוף שבעת החובה מגיע מסך הבחירה — ולא מסך ריק', () => {
    for (let i = 0; i < 7; i++) {
      solveCurrentExercise();
      useWorkspaceStore.getState().proceed();
    }
    expect(useWorkspaceStore.getState().flowStatus).toBe('choice_branch');
  });

  it('"סיום המפגש כעת" מסיים את המפגש ורושם אותו כהושלם', () => {
    for (let i = 0; i < 7; i++) {
      solveCurrentExercise();
      useWorkspaceStore.getState().proceed();
    }
    useWorkspaceStore.getState().finishMeetingEarly();
    expect(useWorkspaceStore.getState().flowStatus).toBe('sessionDone');
    expect(useStore.getState().students[STUDENT]?.highestCompletedMeeting).toBeGreaterThanOrEqual(4);
  });

  it('נתיב ביסוס מוסיף תרגילים אחרי החובה — והמונה אינו חוזר לאפס', () => {
    for (let i = 0; i < 7; i++) {
      solveCurrentExercise();
      useWorkspaceStore.getState().proceed();
    }
    useWorkspaceStore.getState().selectBranch('reinforcement');
    const s = useWorkspaceStore.getState();
    expect(s.flowStatus).toBe('task');
    expect(getActiveTasks(s).length).toBeGreaterThan(7);
    expect(s.standardTaskIdx).toBe(7);
    expect(getActiveTasks(s)[s.standardTaskIdx]).toBeTruthy();
  });
});

describe('מסלול ביסוס — הילד מקבל מאגר אחר לגמרי', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    setPath('remediation_path');
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(4, false);
  });

  it('שבעה תרגילים, כולם של מסלול הביסוס, אף אחד לא מהירוק', () => {
    const green = new Set(getSessionTasks(4, 'green_path').map((t) => t.id));
    const shown = getActiveTasks(useWorkspaceStore.getState());
    expect(shown.length).toBe(7);
    for (const t of shown) {
      expect(green.has(t.id), `${t.id} אינו מהמאגר הירוק`).toBe(false);
      expect(t.id).toContain('_r_');
    }
  });

  it('המספרים בתחום עד 1,000, כנדרש למסלול הביסוס', () => {
    for (const t of getActiveTasks(useWorkspaceStore.getState())) {
      for (const n of [t.numberA, t.numberB]) {
        if (typeof n === 'number') expect(n, `${t.id}: ${n}`).toBeLessThanOrEqual(1000);
      }
    }
  });
});

describe('ביטול פעולה במהלך תרגיל אמיתי', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    setPath('green_path');
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(4, false);
  });

  it('מבטל פעולה אחת בכל לחיצה, בסדר הפוך — קודם ההקלדה, אחר כך הלבנה', () => {
    // מודול 11 §א: "שחזור Snapshot דטרמיניסטי של מצב ה-VRA (קואורדינטות,
    // כמויות, קלט)". הילד גרר לבנה ואז הקליד; הלחיצה הראשונה על ביטול
    // מוחקת את מה שהקליד ומשאירה את הלבנה, והשנייה מורידה את הלבנה.
    useWorkspaceStore.getState().applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    const afterDrop = useWorkspaceStore.getState().counts.tens;
    expect(afterDrop).toBe(1);
    useWorkspaceStore.getState().setAnswerDigit('units', '7');
    expect(useWorkspaceStore.getState().answerDigits.units).toBe('7');

    const errorsBefore = useWorkspaceStore.getState().typedErrorCount;

    useWorkspaceStore.getState().undo();
    const one = useWorkspaceStore.getState();
    expect(one.answerDigits.units ?? '').toBe('');
    expect(one.counts.tens).toBe(afterDrop);

    useWorkspaceStore.getState().undo();
    const two = useWorkspaceStore.getState();
    expect(two.counts.tens).toBe(0);

    // מודול 11: ביטול אינו טעות ואינו גורר קנס.
    expect(two.typedErrorCount).toBe(errorsBefore);
    expect(two.undoCount).toBe(2);
    expect(two.isSocraticCardLocked).toBe(false);
  });

  it('המחסנית אינה עוברת 10 פריטים, גם אחרי 25 פעולות', () => {
    for (let i = 0; i < 25; i++) {
      useWorkspaceStore.getState().applyDrop({ source: 'palette', sourcePlace: 'units', target: { kind: 'column', place: 'units' } });
    }
    expect(useWorkspaceStore.getState().undoStack.length).toBeLessThanOrEqual(10);
  });
});

describe('מפגש 2 — האבחון אינו מתנהג כמו מפגש רגיל', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(2, false);
  });

  it('אין רשימת משימות רגילה — הזרימה היא ה-Q-Matrix', () => {
    expect(getActiveTasks(useWorkspaceStore.getState())).toEqual([]);
    expect(activeExerciseId(useWorkspaceStore.getState())).not.toBe('ex_2_01');
  });

  it('כרטיס החניכה מושבת לחלוטין (מודול 12/14)', () => {
    useWorkspaceStore.getState().openSocraticCard('hesitation_45s');
    expect(useWorkspaceStore.getState().helpState).not.toBe('socratic');
  });

  it('נעילת המקלדת מושבתת לכל לומד, גם עם פרופיל תמיכה מוגבר', () => {
    useAuthStore.setState({ user: { uid: STUDENT, support_profile_id: 'enhanced_cognitive_support' } as any, role: 'student', isAuthenticated: true });
    expect(useWorkspaceStore.getState().isColumnInputLocked('units', 345, 178, false)).toBe(false);
  });
});


describe('מבחן הקבלה של מודול 14 §ד — רענון דפדפן בתרגיל 5 מתוך 7', () => {
  // "נתון: התלמיד בתרגיל 5/7, נותרו 7 דקות. התלמיד מרענן דפדפן או חווה
  // ניתוק רשת של 30 שניות. תוצאה: הסשן, מספר התרגיל (5) ומצב ה-VRA
  // משתחזרים בדיוק."
  //
  // הסימולציה עושה בדיוק את זה: פותרת ארבעה תרגילים, נעצרת באמצע החמישי עם
  // לבנים על הלוח וספרה בעיגול הזיכרון, מצלמת את מה שנשמר לשרת, מאפסת את
  // כל מרחב העבודה (זה מה שרענון עושה) ומשחזרת.
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    setPath('green_path');
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(4, false);
  });

  it('חוזר לאותו תרגיל, עם אותו לוח, אותה תשובה ואותו עיגול זיכרון', () => {
    for (let i = 0; i < 4; i++) {
      solveCurrentExercise();
      useWorkspaceStore.getState().proceed();
    }
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(4); // התרגיל החמישי

    // באמצע התרגיל החמישי: לבנים, ספרה בתשובה, ספרה בעיגול הזיכרון.
    useWorkspaceStore.getState().applyDrop({ source: 'palette', sourcePlace: 'hundreds', target: { kind: 'column', place: 'hundreds' } });
    useWorkspaceStore.getState().applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    useWorkspaceStore.getState().setAnswerDigit('units', '8');
    useWorkspaceStore.getState().setCarryDigit('tens', '1');

    const before = useWorkspaceStore.getState();
    const expected = {
      taskId: getActiveTasks(before)[before.standardTaskIdx].id,
      idx: before.standardTaskIdx,
      counts: { ...before.counts },
      answer: { ...before.answerDigits },
      carry: { ...before.carryDigits },
      deadline: before.sessionDeadlineTime,
    };

    // זה מה שנשמר לשרת (אותם שדות שהשירות שולח), וזה מה שחוזר אחרי רענון.
    const saved = {
      sessionNumber: before.sessionNumber,
      isASD: before.isASD,
      sessionDeadlineTime: before.sessionDeadlineTime,
      selectedBranch: before.selectedBranch,
      standardTaskIdx: before.standardTaskIdx,
      qflow: before.qflow,
      flowStatus: before.flowStatus,
      counts: before.counts,
      answerDigits: before.answerDigits,
      carryDigits: before.carryDigits,
      undoCount: before.undoCount,
      hesitationCount: before.hesitationCount,
      hasInteracted: before.hasInteracted,
    };

    // רענון.
    useWorkspaceStore.getState().resetWorkspace();
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(0);

    useWorkspaceStore.getState().restoreSession(saved);
    const after = useWorkspaceStore.getState();

    expect(after.standardTaskIdx).toBe(expected.idx);
    expect(getActiveTasks(after)[after.standardTaskIdx].id).toBe(expected.taskId);
    expect(after.counts).toEqual(expected.counts);
    expect(after.answerDigits).toEqual(expected.answer);
    expect(after.carryDigits).toEqual(expected.carry);
    // השעון ממשיך מהחותמת הסמכותית, לא מתאפס.
    expect(after.sessionDeadlineTime).toBe(expected.deadline);
  });

  it('רענון בתוך נתיב בחירה מחזיר את תרגילי הנתיב, לא מסך ריק', () => {
    for (let i = 0; i < 7; i++) {
      solveCurrentExercise();
      useWorkspaceStore.getState().proceed();
    }
    useWorkspaceStore.getState().selectBranch('challenge');
    const before = useWorkspaceStore.getState();
    const idx = before.standardTaskIdx;
    const taskId = getActiveTasks(before)[idx].id;

    const saved = {
      sessionNumber: 4, isASD: false, sessionDeadlineTime: before.sessionDeadlineTime,
      selectedBranch: 'challenge', standardTaskIdx: idx, qflow: before.qflow,
      flowStatus: 'task', counts: before.counts, answerDigits: {}, carryDigits: {},
    };

    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().restoreSession(saved);
    const after = useWorkspaceStore.getState();

    expect(getActiveTasks(after).length).toBeGreaterThan(7);
    expect(after.standardTaskIdx).toBe(idx);
    expect(getActiveTasks(after)[after.standardTaskIdx]?.id).toBe(taskId);
  });
});

describe('המורה מחליפה מסלול באמצע המפגש', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    setPath('green_path');
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(4, false);
  });

  it('התרגיל שעל המסך אינו משתנה, והתרגיל הבא כבר מהמאגר החדש', () => {
    solveCurrentExercise();
    useWorkspaceStore.getState().proceed();
    solveCurrentExercise();
    useWorkspaceStore.getState().proceed();

    const during = useWorkspaceStore.getState();
    const onScreen = getActiveTasks(during)[during.standardTaskIdx];
    expect(onScreen.id).toContain('_g_');

    setPath('remediation_path');

    const still = useWorkspaceStore.getState();
    expect(getActiveTasks(still)[still.standardTaskIdx].id).toBe(onScreen.id);
    expect(getActiveTasks(still)[still.standardTaskIdx].numberA).toBe(onScreen.numberA);

    solveCurrentExercise();
    useWorkspaceStore.getState().proceed();

    const next = useWorkspaceStore.getState();
    expect(next.activeBankPath).toBe('remediation_path');
    expect(getActiveTasks(next)[next.standardTaskIdx].id).toContain('_r_');
  });
});

describe('מפגש 8 — בלי לבנים, ועם טריגר שלושת הביטולים', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    setPath('green_path');
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(8, false);
  });

  it('יש שבעה תרגילי חובה, והם של מפגש 8', () => {
    const shown = getActiveTasks(useWorkspaceStore.getState());
    expect(shown.length).toBe(7);
    for (const t of shown) expect(t.id).toContain('s8_');
  });

  it('שלושה ביטולים רצופים בתרגיל אחד פותחים כרטיס חניכה (מודול 12 §א, שורה 8 בטבלת התיקונים)', async () => {
    // "רצופים" פירושו רצופים: קודם שלוש פעולות, ואז שלוש לחיצות ביטול זו
    // אחר זו. הקלדה בין ביטול לביטול מאפסת את הרצף בכוונה, וזה הנכון.
    useWorkspaceStore.getState().setAnswerDigit('units', '1');
    useWorkspaceStore.getState().setAnswerDigit('tens', '2');
    useWorkspaceStore.getState().setAnswerDigit('hundreds', '3');

    useWorkspaceStore.getState().undo();
    useWorkspaceStore.getState().undo();
    useWorkspaceStore.getState().undo();

    await new Promise((r) => setTimeout(r, 0));
    const s = useWorkspaceStore.getState();
    expect(s.consecutiveUndoCount).toBeGreaterThanOrEqual(3);
    expect(s.socraticTriggerReason).toBe('consecutive_undos_3');
    expect(s.helpState).toBe('socratic');
  });

  it('הקלדה בין הביטולים מאפסת את הרצף — ולכן אין כרטיס', async () => {
    for (let i = 0; i < 3; i++) {
      useWorkspaceStore.getState().setAnswerDigit('units', String(i + 1));
      useWorkspaceStore.getState().undo();
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(useWorkspaceStore.getState().consecutiveUndoCount).toBeLessThan(3);
    expect(useWorkspaceStore.getState().socraticTriggerReason).not.toBe('consecutive_undos_3');
  });

  it('אותם שלושה ביטולים רצופים במפגש 4 — שום כרטיס (התנאי הוא מפגש 8 בלבד)', async () => {
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(4, false);
    useWorkspaceStore.getState().setAnswerDigit('units', '1');
    useWorkspaceStore.getState().setAnswerDigit('tens', '2');
    useWorkspaceStore.getState().setAnswerDigit('hundreds', '3');
    useWorkspaceStore.getState().undo();
    useWorkspaceStore.getState().undo();
    useWorkspaceStore.getState().undo();
    await new Promise((r) => setTimeout(r, 0));
    expect(useWorkspaceStore.getState().consecutiveUndoCount).toBeGreaterThanOrEqual(3);
    expect(useWorkspaceStore.getState().socraticTriggerReason).not.toBe('consecutive_undos_3');
  });
});

describe('ילד שטועה — לולאת התיקון העצמי לפני הפיגום (סטייה 17)', () => {
  // מפגש 4, מסלול ביסוס, תרגיל 1: 142 + 23 — "ללא המרה". זה חשוב: מודול 12
  // מכיר ארבעה טריגרים לכרטיס, ואחד מהם (מסמך 03 טריגר 3, "אי-ביצוע המרה
  // נדרשת") נפתח כבר בספרה השגויה הראשונה בטור שדורש המרה. בתרגיל בלי המרה
  // הטריגר ההוא אינו יכול לפעול, ולכן אפשר לבדוק כאן רק את מה שסטייה 17
  // קובעת: הטעות הראשונה שייכת ללומד, הכרטיס מגיע בשנייה.
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    setPath('remediation_path');
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(4, false);
  });

  it('התרגיל הנבחר אכן אינו דורש המרה בשום טור', () => {
    const s = useWorkspaceStore.getState();
    const task = getActiveTasks(s)[s.standardTaskIdx];
    expect(task.id).toBe('s4_r_t1');
    expect((task.numberA as number) % 10 + (task.numberB as number) % 10).toBeLessThan(10);
  });

  /** מקליד ספרת יחידות שגויה ולוחץ "התקדם". */
  const answerWrongUnits = async () => {
    const s = useWorkspaceStore.getState();
    const task = getActiveTasks(s)[s.standardTaskIdx];
    const target = (task.numberA as number) + (task.numberB as number);
    const correctUnit = target % 10;
    useWorkspaceStore.getState().setAnswerDigit('units', String((correctUnit + 3) % 10));
    useWorkspaceStore.getState().proceed();
    await new Promise((r) => setTimeout(r, 500));
  };

  it('טעות ראשונה: נשאר באותו תרגיל, בלי כרטיס — הלומד מתקן בעצמו', async () => {
    const idxBefore = useWorkspaceStore.getState().standardTaskIdx;
    await answerWrongUnits();

    const s = useWorkspaceStore.getState();
    expect(s.standardTaskIdx, 'לא מתקדם עם תשובה שגויה').toBe(idxBefore);
    expect(s.wrongAnswerStreak).toBe(1);
    expect(s.helpState, 'אין כרטיס בטעות הראשונה').not.toBe('socratic');
    expect(s.socraticTriggerReason).not.toBe('repeated_errors');
  });

  it('טעות שנייה ברצף: פעימה של 300 מ"ש, ואז הכרטיס עם הסיבה repeated_errors', async () => {
    await answerWrongUnits();
    await answerWrongUnits();

    // סטייה 17: הכרטיס נפתח "אחרי אותה פעימה של 300 מילישניות". הפעימה
    // עצמה היא טיימר בתוך HelpOverlays, שאינו מורכב בסימולציה של החנות —
    // כאן היא מופעלת ידנית, בדיוק כפי שהרכיב עושה.
    expect(useWorkspaceStore.getState().wrongAnswerStreak).toBeGreaterThanOrEqual(2);
    expect(useWorkspaceStore.getState().helpState).toBe('friction');

    useWorkspaceStore.getState().helpFrictionDone();
    await new Promise((r) => setTimeout(r, 0));

    const s = useWorkspaceStore.getState();
    expect(s.helpState).toBe('socratic');
    expect(s.socraticTriggerReason).toBe('repeated_errors');
  });

  it('הפעימה קצובה ב-300 מ"ש ברכיב, ואינה יכולה להישאר תקועה', () => {
    const overlays = readFileSync(
      resolve(__dirname, '../../features/workspace/overlays/HelpOverlays.tsx'),
      'utf-8'
    );
    expect(overlays).toContain('window.setTimeout(helpFrictionDone, 300)');
    expect(overlays).toContain('return () => window.clearTimeout(t);');
  });

  it('תשובה נכונה מאפסת את הרצף ומעבירה לתרגיל הבא', async () => {
    await answerWrongUnits();
    expect(useWorkspaceStore.getState().wrongAnswerStreak).toBe(1);

    solveCurrentExercise();
    useWorkspaceStore.getState().proceed();

    const s = useWorkspaceStore.getState();
    expect(s.standardTaskIdx).toBe(1);
    expect(s.wrongAnswerStreak).toBe(0);
  });
});
