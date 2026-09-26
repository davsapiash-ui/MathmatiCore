/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';

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

describe('שלב 3 — משוב, האחוז וסיום', () => {
  function toStep3(onComplete = vi.fn()) {
    const r = renderBoard(onComplete);
    fireEvent.click(screen.getByRole('button', { name: 'רמה שלוש: מאתגר' }));
    fireEvent.click(screen.getByRole('button', { name: /המשיכו/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /כפתור ביטול פעולה/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /כרטיס החניכה/ }));
    fireEvent.click(screen.getByRole('button', { name: /המשיכו/ }));
    return r;
  }

  it('משפט המשוב של מסמך 03 והאחוז (PRD מודול 16 §ג)', () => {
    const { container } = toStep3();
    const text = visibleText(container);
    expect(text).toContain('כל הכבוד!');
    expect(text).toContain('ראינו שחקרתם, ניסיתם ותיקנתם טעויות בעצמכם כמו מתמטיקאים אמיתיים! המשיכו להאמין בכוח שלכם!');
    expect(text).toContain('מדד ההתמדה שלכם');
    expect(text).toContain('50%'); // U=2, E=1, G=1 → 2 / 4
  });

  it('ההקראה אומרת את המשוב ואת האחוז', () => {
    toStep3();
    const s = speech();
    expect(s).toContain(REFLECTION_TEXT_HE.feedbackBody);
    expect(s).toContain('50 אחוז');
  });

  it('הנתונים שנשלחים בסיום לא השתנו', () => {
    const onComplete = vi.fn();
    toStep3(onComplete);
    fireEvent.click(screen.getByRole('button', { name: /סיום המפגש/ }));
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
