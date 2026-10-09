/**
 * PRD Module 3 §א (v7.9): "אם רכיב הסינון עצמו נכשל (שגיאת ריצה), שום דבר
 * אינו ננעל: הצ'אט, ההקלדה והעבודה ממשיכים כרגיל, והכשל נרשם ביומן השרת
 * (רישום ביקורת) כדי שהחוקר יידע שהתרחש."
 *
 * The filter fails open: a runtime error is reported (console + the
 * registered audit-log sink) and the text is treated as clean. A text the
 * filter does read and finds PII in is still refused.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const phone = vi.hoisted(() => ({ broken: false }));
vi.mock('../phonePattern', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../phonePattern')>();
  return {
    ...actual,
    containsPhoneNumber: (t: string) => {
      if (phone.broken) throw new Error('regex engine crashed');
      return actual.containsPhoneNumber(t);
    },
    redactPhoneNumbers: (t: string, token: string) => {
      if (phone.broken) throw new Error('regex engine crashed');
      return actual.redactPhoneNumbers(t, token);
    },
  };
});

import {
  containsPII,
  validateChatInputForPII,
  validateZeroPIIPayload,
  anonymizeChatMessageBody,
  reportPiiFilterFailure,
  setPiiFilterFailureSink,
  PII_FILTER_FAILURE_REPORT_INTERVAL_MS,
} from '../PiiFilter';

describe('Module 3 §א — the PII filter fails open', () => {
  let sink: ReturnType<typeof vi.fn>;
  let consoleError: { mock: { calls: unknown[][] } };

  beforeEach(() => {
    phone.broken = false;
    sink = vi.fn();
    setPiiFilterFailureSink(sink);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    setPiiFilterFailureSink(null);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a runtime error lets the text through and is logged to the console and the server', () => {
    phone.broken = true;
    expect(containsPII('אפשר עזרה בתרגיל 3')).toBe(false);
    expect(validateChatInputForPII('אפשר עזרה בתרגיל 3')).toEqual({ valid: true });
    expect(validateZeroPIIPayload({ student_id: 3, note: 'שלום' })).toEqual({ valid: true });
    expect(anonymizeChatMessageBody('שלום לכולם')).toBe('שלום לכולם');
    expect(consoleError).toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith('containsPII', expect.any(Error));
    expect(sink).toHaveBeenCalledWith('validateChatInputForPII', expect.any(Error));
    expect(sink).toHaveBeenCalledWith('anonymizeChatMessageBody', expect.any(Error));
  });

  it('a message with an e-mail, phone or ID number is still refused while the filter works', () => {
    for (const text of ['כתבו ל-a@b.co', 'הטלפון 0501234567', 'ת"ז 012345674']) {
      expect(containsPII(text), text).toBe(true);
      expect(validateChatInputForPII(text).valid, text).toBe(false);
    }
    expect(validateZeroPIIPayload({ note: 'a@b.co' }).valid).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  });

  it('an e-mail is still refused even when the later phone check is the part that crashes', () => {
    phone.broken = true;
    expect(validateChatInputForPII('כתבו ל-a@b.co').valid).toBe(false);
  });

  it('the server log gets one entry per place per minute; the console gets every one', () => {
    vi.useFakeTimers();
    reportPiiFilterFailure('chat', new Error('x'));
    reportPiiFilterFailure('chat', new Error('x'));
    reportPiiFilterFailure('reset', new Error('x'));
    expect(sink).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(PII_FILTER_FAILURE_REPORT_INTERVAL_MS);
    reportPiiFilterFailure('chat', new Error('x'));
    expect(sink).toHaveBeenCalledTimes(3);
  });

  it('a sink that throws does not turn into a failure of the caller', () => {
    setPiiFilterFailureSink(() => { throw new Error('offline'); });
    expect(() => reportPiiFilterFailure('chat', new Error('x'))).not.toThrow();
  });
});
