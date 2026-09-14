/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';

/**
 * כפתור ההקראה מקצה לקצה: לחיצה אמיתית → המנוע מקבל את הטקסט.
 * הבדיקות האחרות נועלות את המנוע; כאן נבדק שהלחיצה בכלל מגיעה אליו, ושהכפתור
 * חוזר למצב מנוחה בכל דרך שבה הקראה יכולה להסתיים.
 */

interface FakeVoice {
  name: string;
  lang: string;
}

const HEBREW_VOICES: FakeVoice[] = [{ name: 'Carmit', lang: 'he-IL' }];

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: FakeVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

class FakeSynth {
  queue: FakeUtterance[] = [];
  all: FakeUtterance[] = [];
  paused = false;
  cancels = 0;
  private voices: FakeVoice[];

  constructor(voices: FakeVoice[]) {
    this.voices = voices;
  }

  get speaking() {
    return this.queue.length > 0;
  }
  get pending() {
    return this.queue.length > 1;
  }
  getVoices() {
    return this.voices;
  }
  addEventListener() {}
  speak(u: FakeUtterance) {
    this.all.push(u);
    this.queue.push(u);
  }
  cancel() {
    this.cancels += 1;
    this.queue = [];
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }
  finishAll() {
    const queued = this.queue;
    this.queue = [];
    queued[queued.length - 1]?.onend?.();
  }
  failAll() {
    const queued = this.queue;
    this.queue = [];
    queued[0]?.onerror?.({ error: 'synthesis-failed' });
  }
}

let synth: FakeSynth;

async function loadButton() {
  synth = new FakeSynth(HEBREW_VOICES);
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.resetModules();
  const mod = await import('@/presentation/design-system/UdlSpeechButton');
  return mod.UdlSpeechButton;
}

const INSTRUCTION = 'בנו בבית המספרים את המספר 420 והקלידו את התוצאה.';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('כפתור ההקראה — מהלחיצה ועד המנוע', () => {
  it('לחיצה מוסרת למנוע בדיוק את הטקסט שעל המסך', async () => {
    const UdlSpeechButton = await loadButton();
    const { getByRole } = render(<UdlSpeechButton text={INSTRUCTION} />);

    fireEvent.click(getByRole('button'));

    expect(synth.queue).toHaveLength(1);
    expect(synth.queue[0].text).toBe(INSTRUCTION);
    expect(synth.queue[0].lang).toBe('he-IL');
  });

  it('הכפתור מסמן שהוא מקריא, וחוזר למנוחה כשההקראה נגמרת', async () => {
    const UdlSpeechButton = await loadButton();
    const { getByRole } = render(<UdlSpeechButton text={INSTRUCTION} />);
    const button = getByRole('button');

    fireEvent.click(button);
    expect(button.className).toContain('animate-pulse');

    act(() => synth.finishAll());
    expect(button.className).not.toContain('animate-pulse');
  });

  it('גם שגיאת מנוע מחזירה את הכפתור למנוחה ולא מקפיאה אותו', async () => {
    const UdlSpeechButton = await loadButton();
    const { getByRole } = render(<UdlSpeechButton text={INSTRUCTION} />);
    const button = getByRole('button');

    fireEvent.click(button);
    act(() => synth.failAll());

    expect(button.className).not.toContain('animate-pulse');
  });

  it('אפשר להקריא שוב אחרי שההקראה נגמרה', async () => {
    const UdlSpeechButton = await loadButton();
    const { getByRole } = render(<UdlSpeechButton text={INSTRUCTION} />);
    const button = getByRole('button');

    fireEvent.click(button);
    act(() => synth.finishAll());
    fireEvent.click(button);

    expect(synth.all).toHaveLength(2);
  });

  it('לחיצה שנייה בזמן הקראה עוצרת אותה', async () => {
    const UdlSpeechButton = await loadButton();
    const { getByRole } = render(<UdlSpeechButton text={INSTRUCTION} />);
    const button = getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);

    expect(synth.cancels).toBe(1);
    expect(synth.queue).toHaveLength(0);
    expect(button.className).not.toContain('animate-pulse');
  });

  it('כפתור שיורד מהמסך אינו משתיק כפתור אחר שמקריא', async () => {
    const UdlSpeechButton = await loadButton();
    const Pair = ({ showFirst }: { showFirst: boolean }) => (
      <>
        {showFirst && <UdlSpeechButton text="הנחיה ראשונה." className="first-button" />}
        <UdlSpeechButton text="הנחיה שנייה." className="second-button" />
      </>
    );

    const { container, rerender } = render(<Pair showFirst />);
    fireEvent.click(container.querySelector('.second-button')!);
    expect(synth.queue).toHaveLength(1);

    rerender(<Pair showFirst={false} />); // המסך התחלף והכפתור הראשון ירד

    expect(synth.cancels).toBe(0);
    expect(synth.queue).toHaveLength(1);
    expect(synth.queue[0].text).toBe('הנחיה שנייה.');
  });

  it('אינו מקריא דבר בלי לחיצה — אין הקראה אוטומטית', async () => {
    const UdlSpeechButton = await loadButton();
    render(<UdlSpeechButton text={INSTRUCTION} />);

    expect(synth.all).toHaveLength(0);
  });

  it('נשאר נגיש: שם נגיש בעברית ותווית כפתור', async () => {
    const UdlSpeechButton = await loadButton();
    const { getByRole } = render(<UdlSpeechButton text={INSTRUCTION} />);

    expect(getByRole('button').getAttribute('aria-label')).toBe('הקרא טקסט בקול');
  });
});

describe('כפתור ההקראה תחת StrictMode', () => {
  it('mount כפול אינו משתיק את ההקראה', async () => {
    const UdlSpeechButton = await loadButton();
    const { StrictMode } = await import('react');
    const { getByRole } = render(
      <StrictMode>
        <UdlSpeechButton text={INSTRUCTION} />
      </StrictMode>
    );

    fireEvent.click(getByRole('button'));

    expect(synth.queue).toHaveLength(1);
    expect(synth.queue[0].text).toBe(INSTRUCTION);
  });
});
