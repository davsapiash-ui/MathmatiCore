/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, act } from '@testing-library/react';

/**
 * מודול 16 / מסמך 03 §3.8 — מסך הרפלקציה של מפגש 8, כפי שהילד רואה ושומע אותו.
 *
 * ביקורת (26.9.2026, מרשם שורה 18): המסך הציג לילד "(Undo)", "SRL Persistence
 * Index" ו-"MathmatiCore", אסטרטגיה בשם "לחישוב שארית", ונוסחים שאינם של
 * מסמך 03. כאן ננעל: הנוסחים של מסמך 03, בלי אנגלית, ההקראה מכסה כל הנחיה,
 * והנתונים שנשלחים בסיום לא השתנו.
 */

// ההקראה: הכפתור האמיתי נבדק ב-TTSNarrationButton.test.tsx. כאן רק הטקסט שהוא מקבל.
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

// בלי אנימציות: AnimatePresence mode="wait" מחכה ליציאה לפני הצגת השלב הבא.
vi.mock('framer-motion', () => {
  // One stable component: a fresh one per access would remount the subtree on every render.
  const Plain = ({ children, initial: _i, animate: _a, exit: _e, ...rest }: any) => <div {...rest}>{children}</div>;
  return {
    motion: new Proxy({}, { get: () => Plain }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import {
  Session8ReflectionScreen,
  REFLECTION_TEXT_HE,
  STRATEGY_OPTIONS,
} from '../Session8ReflectionScreen';
import { ENCOURAGEMENT_SENTENCES_HE, splitEncouragement } from '@/core/persistenceEncouragement';

afterEach(cleanup);

const LATIN = /[A-Za-z]/;

function visibleText(container: HTMLElement): string {
  return container.textContent ?? '';
}
function speech(): string {
  return screen.getByTestId('speech').getAttribute('data-text') ?? '';
}
function accessibleNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[aria-label],[title]')).flatMap((el) =>
    [el.getAttribute('aria-label'), el.getAttribute('title')].filter((v): v is string => Boolean(v))
  );
}

function renderBoard(onComplete = vi.fn(), metrics = { undoCount: 2, errorCount: 1, guessCount: 1 }) {
  const utils = render(<Session8ReflectionScreen onComplete={onComplete} metrics={metrics} />);
  return { ...utils, onComplete };
}

describe('שלב 1 — כמה מאמץ השקעתם', () => {
  it('השאלה היא של מסמך 03', () => {
    const { container } = renderBoard();
    expect(visibleText(container)).toContain('כמה מאמץ והשתדלות השקעתם היום בפתרון התרגילים?');
  });

  it('שלוש רמות, בלי מילים על המסך, עם שם נגיש לפי מסמך 03', () => {
    renderBoard();
    const levels = ['רמה אחת: קל', 'רמה שתיים: מתאים', 'רמה שלוש: מאתגר'].map((name) => screen.getByRole('button', { name }));
    expect(levels).toHaveLength(3);
    for (const b of levels) expect((b.textContent ?? '').trim()).toBe('');
  });

  it('ההקראה אומרת את השאלה, את ההנחיה ואת שם כל רמה', () => {
    renderBoard();
    const s = speech();
    expect(s).toContain(REFLECTION_TEXT_HE.effortQuestion);
    expect(s).toContain(REFLECTION_TEXT_HE.effortInstruction);
    for (const w of ['רמה אחת: קל', 'רמה שתיים: מתאים', 'רמה שלוש: מאתגר']) expect(s).toContain(w);
  });

  it('אי אפשר להמשיך בלי לבחור רמה', () => {
    renderBoard();
    const next = screen.getByRole('button', { name: /המשיכו/ });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'רמה שתיים: מתאים' }));
    expect((next as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('שלב 2 — מה עזר לכם', () => {
  function toStep2() {
    const r = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'רמה שלוש: מאתגר' }));
    fireEvent.click(screen.getByRole('button', { name: /המשיכו/ }));
    return r;
  }

  it('השאלה ושלוש האפשרויות של מסמך 03, בסדר של המרשם', () => {
    const { container } = toStep2();
    expect(visibleText(container)).toContain('מה עזר לכם הכי הרבה להצליח היום בפתרון התרגילים?');
    const boxes = screen.getAllByRole('checkbox').map((b) => (b.textContent ?? '').trim());
    expect(boxes).toEqual([
      'כפתור ביטול פעולה שאיפשר לי לתקן טעויות בביטחון וברוגע',
      'עיגולי הזיכרון שעזרו לי לנהל את המעברים',
      'השאלות המנחות בכרטיס החניכה',
    ]);
    expect(STRATEGY_OPTIONS.map((o) => o.id)).toEqual(['undo', 'memory', 'hints']);
    expect(visibleText(container)).not.toContain('שארית');
  });

  it('ההקראה אומרת את השאלה, את ההנחיה ואת שלוש האפשרויות', () => {
    toStep2();
    const s = speech();
    expect(s).toContain(REFLECTION_TEXT_HE.strategyQuestion);
    expect(s).toContain(REFLECTION_TEXT_HE.strategyInstruction);
    for (const o of STRATEGY_OPTIONS) expect(s).toContain(o.label);
  });
});

describe('שלב 3 — משפט עידוד לפי מדד ההתמדה של מפגש 8, בלי מספר, וסיום', () => {
  function toStep3(onComplete = vi.fn(), metrics = { undoCount: 2, errorCount: 1, guessCount: 1 }) {
    const r = renderBoard(onComplete, metrics);
    fireEvent.click(screen.getByRole('button', { name: 'רמה שלוש: מאתגר' }));
    fireEvent.click(screen.getByRole('button', { name: /המשיכו/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /כפתור ביטול פעולה/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /כרטיס החניכה/ }));
    fireEvent.click(screen.getByRole('button', { name: /המשיכו/ }));
    return r;
  }

  // Owner decision E1 (27.9.2026, register deviation 24): the index only CHOOSES the sentence.
  const CASES: Array<{ name: string; metrics: { undoCount: number; errorCount: number; guessCount: number }; sentence: string }> = [
    { name: 'E + G ≤ 2', metrics: { undoCount: 0, errorCount: 1, guessCount: 1 }, sentence: ENCOURAGEMENT_SENTENCES_HE.fewMistakes },
    { name: 'מדד 75', metrics: { undoCount: 9, errorCount: 2, guessCount: 1 }, sentence: ENCOURAGEMENT_SENTENCES_HE.selfCorrecting },
    { name: 'מדד 50', metrics: { undoCount: 3, errorCount: 2, guessCount: 1 }, sentence: ENCOURAGEMENT_SENTENCES_HE.persevering },
    { name: 'מדד 0', metrics: { undoCount: 0, errorCount: 3, guessCount: 2 }, sentence: ENCOURAGEMENT_SENTENCES_HE.keepTrying },
  ];

  for (const c of CASES) {
    it(`${c.name}: המשפט שנבחר מוצג ומוקרא מילה במילה, בלי ספרה ובלי אחוז`, () => {
      const { container } = toStep3(vi.fn(), c.metrics);
      const text = visibleText(container);
      const { title, body } = splitEncouragement(c.sentence);
      expect(`${title} ${body}`).toBe(c.sentence);
      expect(text).toContain(title);
      expect(text).toContain(body);
      for (const other of Object.values(ENCOURAGEMENT_SENTENCES_HE).filter((s) => s !== c.sentence)) {
        expect(text).not.toContain(splitEncouragement(other).body);
      }
      const s = speech();
      expect(s).toContain(c.sentence);
      // The step label "שלב 3 מתוך 3" is the only digit on this stage: no score, no index.
      const withoutStepLabel = text.replace(REFLECTION_TEXT_HE.stepLabel(3), '');
      expect(withoutStepLabel).not.toMatch(/[0-9]/);
      expect(text).not.toContain('%');
      expect(text).not.toContain('מדד ההתמדה');
      expect(s).not.toMatch(/[0-9%]/);
      expect(s).not.toContain('אחוז');
    });
  }

  // Audit 8.10 (28.9.2026): a save that failed does not end the meeting —
  // the board stays on step 3 and the finish button works again.
  it('שמירה שנכשלה: הלוח נשאר בשלב 3 והכפתור פעיל שוב', async () => {
    const onComplete = vi.fn(() => Promise.resolve(false));
    toStep3(onComplete);
    const finish = screen.getByRole('button', { name: /סיום התחנה/ }) as HTMLButtonElement;
    fireEvent.click(finish);
    expect(finish.disabled).toBe(true);
    // The failed save settles inside act(), so React applies it before the checks.
    await act(async () => {});
    expect(finish.disabled).toBe(false);
    expect(screen.getByText(REFLECTION_TEXT_HE.stepLabel(3))).toBeTruthy();
    await act(async () => {
      fireEvent.click(finish);
    });
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('שמירה שנזרקה: הכפתור פעיל שוב', async () => {
    const onComplete = vi.fn(() => Promise.reject(new Error('boom')));
    toStep3(onComplete);
    const finish = screen.getByRole('button', { name: /סיום התחנה/ }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(finish);
    });
    expect(finish.disabled).toBe(false);
  });

  it('לחיצה כפולה: הרפלקציה נשלחת פעם אחת בלבד', async () => {
    let settle: (done: boolean) => void = () => {};
    const onComplete = vi.fn(() => new Promise<boolean>((resolve) => { settle = resolve; }));
    toStep3(onComplete);
    const finish = screen.getByRole('button', { name: /סיום התחנה/ }) as HTMLButtonElement;
    // One act() scope: both clicks land before React renders the disabled
    // button, so the second click's handler still sees isSubmitting === false.
    await act(async () => {
      fireEvent.click(finish);
      fireEvent.click(finish);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(finish.disabled).toBe(true);
    // The save succeeds: the board is about to be replaced by the end screen,
    // and a click meanwhile sends nothing.
    await act(async () => {
      settle(true);
    });
    await act(async () => {
      fireEvent.click(finish);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(finish.disabled).toBe(true);
  });

  it('בזמן השמירה הכפתור מראה שמשהו קורה, ואחרי שמירה שנכשלה חוזר לשמו', async () => {
    let settle: (done: boolean) => void = () => {};
    const onComplete = vi.fn(() => new Promise<boolean>((resolve) => { settle = resolve; }));
    toStep3(onComplete);
    const finish = screen.getByRole('button', { name: /סיום התחנה/ }) as HTMLButtonElement;
    expect(finish.getAttribute('aria-busy')).toBe('false');
    fireEvent.click(finish);
    // Busy for a screen reader, and on the screen in words and with a turning icon.
    expect(finish.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: REFLECTION_TEXT_HE.saving })).toBe(finish);
    expect(finish.textContent).not.toContain(REFLECTION_TEXT_HE.finish);
    expect(finish.querySelector('.animate-spin')).not.toBeNull();
    expect(finish.className).toContain('disabled:cursor-wait');
    await act(async () => {
      settle(false);
    });
    expect(finish.getAttribute('aria-busy')).toBe('false');
    expect(finish.textContent).toContain(REFLECTION_TEXT_HE.finish);
    expect(finish.querySelector('.animate-spin')).toBeNull();
    expect(finish.disabled).toBe(false);
  });

  it('הנתונים שנשלחים בסיום לא השתנו', () => {
    const onComplete = vi.fn();
    toStep3(onComplete);
    fireEvent.click(screen.getByRole('button', { name: /סיום התחנה/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      effortLevel: 'HARD',
      strategies: ['undo', 'hints'],
      persistenceIndex: 50,
      undoCount: 2,
      errorCount: 1,
      guessCount: 1,
    });
  });
});

describe('אין מילים באנגלית, בשום שלב', () => {
  it('לא בטקסט, לא בהקראה ולא בשמות הנגישים', () => {
    const { container } = renderBoard();
    const check = () => {
      expect(visibleText(container)).not.toMatch(LATIN);
      expect(speech()).not.toMatch(LATIN);
      for (const name of accessibleNames(container)) expect(name).not.toMatch(LATIN);
    };
    check();
    fireEvent.click(screen.getByRole('button', { name: 'רמה אחת: קל' }));
    fireEvent.click(screen.getByRole('button', { name: /המשיכו/ }));
    check();
    fireEvent.click(screen.getByRole('button', { name: /המשיכו/ }));
    check();
    expect(visibleText(container)).not.toMatch(/MathmatiCore|Undo|SRL/);
  });
});
