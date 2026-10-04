/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render } from '@testing-library/react';
import { MathText } from '../MathText';
import { mathTextParts, WRITTEN_NUMBER_SOURCE } from '../mathTextParts';
import { joinSpokenSentences } from '../spokenSentences';

/**
 * Audit 4.10.2026, A6-101: an exercise inside a Hebrew sentence showed
 * mirrored ("4▢2 − 128 = 314" as "314=128−2▢4"). Each exercise is isolated
 * left to right; the sentence around it, and its punctuation, are not.
 */
describe('MathText: every exercise in a sentence reads left to right', () => {
  const ltrRuns = (text: string) => mathTextParts(text).filter((p) => p.ltr).map((p) => p.text);

  it('a skeleton exercise is one isolated run, its period outside', () => {
    const s = 'בשורת המחוסר חסרה ספרת העשרות: 4▢2 − 128 = 314. גלו את הספרה בעזרת הלבנים.';
    expect(ltrRuns(s)).toEqual(['4▢2 − 128 = 314']);
    expect(mathTextParts(s).map((p) => p.text).join('')).toBe(s);
  });

  it('thousands commas stay inside; the comma after the exercise stays outside', () => {
    expect(ltrRuns('נסו לחשוב: בתרגיל 2,▢3▢ + 1,554 = 4,191, איך מוצאים את הספרות?')).toEqual(['2,▢3▢ + 1,554 = 4,191']);
    expect(ltrRuns('בשורת המחוסר חסרות שתי ספרות: 6,0▢▢ − 2,847 = 3,158. גלו אותן')).toEqual(['6,0▢▢ − 2,847 = 3,158']);
  });

  it('a lone number with a box is isolated; a plain number and a plain sentence are left alone', () => {
    expect(ltrRuns('המספר 3▢6 חסר')).toEqual(['3▢6']);
    expect(mathTextParts('יש 10 לבנים בטור היחידות')).toEqual([{ text: 'יש 10 לבנים בטור היחידות', ltr: false }]);
    expect(ltrRuns('מחליפים רק את ספרת העשרות של המחוסר: 7,691 − 3,381. מה ישתנה?')).toEqual(['7,691 − 3,381']);
  });

  it('renders each exercise in a <bdi dir="ltr">, the text unchanged', () => {
    const s = 'בתרגיל 41▢ + 253 = 665 חסרה ספרת היחידות.';
    const { container } = render(<p><MathText text={s} /></p>);
    const bdi = container.querySelectorAll('bdi');
    expect(bdi).toHaveLength(1);
    expect(bdi[0].getAttribute('dir')).toBe('ltr');
    expect(bdi[0].textContent).toBe('41▢ + 253 = 665');
    expect(container.textContent).toBe(s);
  });

  it('the written number is the read-aloud\'s own (core/missingDigitSpeech.ts)', () => {
    const speech = readFileSync(resolve(__dirname, '../../../../core/missingDigitSpeech.ts'), 'utf-8');
    expect(speech).toContain(`const WRITTEN_NUMBER = /${WRITTEN_NUMBER_SOURCE}/g;`);
  });
});

describe('joinSpokenSentences: no "?." in what the voice reads', () => {
  it('a question keeps its mark; a sentence without one gets a period', () => {
    expect(joinSpokenSentences(['מה ישתנה?', 'א. ספרת היחידות', 'ב. ספרת העשרות'])).toBe('מה ישתנה? א. ספרת היחידות. ב. ספרת העשרות');
    expect(joinSpokenSentences(['רמז: באיזה טור כדאי לבדוק שוב?', 'רגע לחשיבה. אפשר לבחור תשובה שוב עוד מעט.'])).toBe(
      'רמז: באיזה טור כדאי לבדוק שוב? רגע לחשיבה. אפשר לבחור תשובה שוב עוד מעט.'
    );
    expect(joinSpokenSentences(['מה עושים?', ''])).toBe('מה עושים?');
  });
});
