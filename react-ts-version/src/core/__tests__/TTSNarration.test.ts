/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

/**
 * הקריינות (PRD מודול 24 / UDL) — רשת ביטחון כדי שהתקלה לא תחזור.
 *
 * אין קבצי שמע. כל הנחיה מוקראת על ידי Web Speech API בדפדפן, בעברית, ורק בלחיצה
 * יזומה של הילד. ה-API הזה נכשל בכמה דרכים שהילד שומע בדיוק אותו דבר — "הכפתור מת" —
 * וכל בדיקה כאן נועלת את אחד הכשלים האלה:
 *   F1. cancel() אסינכרוני, ולכן דיבור באותו tick נזרק בשקט (הלחיצה השנייה לא עבדה).
 *   F2. מנוע שנשאר מושהה בולע בשקט כל מה שנכנס לתור אחריו.
 *   F3. כרומיום עוצר אחרי ~15 שניות, וההנחיות הארוכות שלנו נקטעות באמצע.
 *   F4. הדפדפן אוסף utterance שאיש אינו מחזיק, onend לא מגיע, והכפתור נתקע.
 *   F5. getVoices() ריק עד שרשימת הקולות נטענת, והקליק הראשון מקבל קול אנגלי.
 */

const SRC = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

/** כל קובצי ה-tsx מתחת לתיקייה, לעומק — כדי שגם מסך חדש ייתפס. */
function tsxFilesUnder(dir: string): string[] {
  const root = resolve(__dirname, '../../', dir);
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((entry) => {
      const full = resolve(d, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.tsx') ? [full] : [];
    });
  return walk(root);
}

interface FakeVoice {
  name: string;
  lang: string;
  localService: boolean;
}

/**
 * שמות הקולות העבריים האמיתיים, כפי שהם מדווחים בפועל בכל פלטפורמה
 * (readium/speech he.json, נבדק בספטמבר 2026). לא שמות מומצאים.
 */
const REAL_HEBREW_VOICES = {
  windows: { name: 'Microsoft Asaf - Hebrew (Israel)', lang: 'he-IL', localService: true },
  edgeHila: { name: 'Microsoft Hila Online (Natural) - Hebrew (Israel)', lang: 'he-IL', localService: false },
  edgeAvri: { name: 'Microsoft Avri Online (Natural) - Hebrew (Israel)', lang: 'he-IL', localService: false },
  apple: { name: 'Carmit', lang: 'he-IL', localService: true },
  chromeOs: {
    name: 'Android Speech Recognition and Synthesis from Google he-il-x-heb-network',
    lang: 'he-IL',
    localService: false,
  },
  english: { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
} satisfies Record<string, FakeVoice>;

const HEBREW_VOICES: FakeVoice[] = [REAL_HEBREW_VOICES.english, REAL_HEBREW_VOICES.apple];

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

/** מודל של המנוע האמיתי, כולל ההתנהגויות שמפילות אותנו. */
class FakeSynth {
  queue: FakeUtterance[] = [];
  /** כל מה שנמסר ל-speak(), כולל מה שהמנוע זרק. */
  all: FakeUtterance[] = [];
  /** מה שנמסר בזמן ש-cancel() עוד מתנקז — כרומיום זורק את אלה בשקט (F1). */
  dropped: FakeUtterance[] = [];
  paused = false;
  cancels = 0;
  resumes = 0;
  /** חלון הזריקה הקצר שאחרי cancel(). */
  private draining = false;
  /** מנוע שמדווח speaking לנצח — נכנס לתור, אבל אף פעם לא מתנקז. */
  private wedged = false;
  private listeners: Record<string, Array<() => void>> = {};

  private voices: FakeVoice[];

  constructor(voices: FakeVoice[]) {
    this.voices = voices;
  }

  get speaking() {
    return this.wedged || this.draining || this.queue.length > 0;
  }
  /** המנוע נתקע ומדווח speaking בלי סוף. */
  wedge() {
    this.wedged = true;
  }
  get pending() {
    return this.queue.length > 1;
  }

  getVoices() {
    return this.voices;
  }
  setVoices(voices: FakeVoice[]) {
    this.voices = voices;
    for (const fn of [...(this.listeners['voiceschanged'] ?? [])]) fn();
  }
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }

  speak(u: FakeUtterance) {
    this.all.push(u);
    if (this.draining) {
      this.dropped.push(u); // בדיוק מה שכרומיום עושה אחרי cancel()
      return;
    }
    this.queue.push(u);
  }
  cancel() {
    this.cancels += 1;
    this.queue = [];
    // המנוע עוד מדווח speaking וזורק כל מה שנמסר לו, עד שהתנקז באמת — עשרות
    // מילי-שניות אחר כך. זה בדיוק החלון שבו ההקראה השנייה נעלמה.
    this.draining = true;
    setTimeout(() => {
      this.draining = false;
    }, 40);
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
    this.resumes += 1;
  }

  finishOne() {
    const u = this.queue.shift();
    u?.onend?.();
  }
  finishAll() {
    while (this.queue.length) this.finishOne();
  }
  failOne(error = 'interrupted') {
    const u = this.queue.shift();
    u?.onerror?.({ error });
  }
  /** המנוע נטש את התור בלי onend ובלי onerror — המקרה שמקפיא את הכפתור (F4). */
  vanish() {
    this.queue = [];
  }
}

type Tts = import('@/infrastructure/services/TTSService').TTSService;

let synth: FakeSynth;

async function setupTts(voices: FakeVoice[] = HEBREW_VOICES): Promise<Tts> {
  synth = new FakeSynth(voices);
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.resetModules();
  const mod = await import('@/infrastructure/services/TTSService');
  return mod.TTSService.getInstance();
}

/** מריץ את תורי המיקרו-משימות, כדי ש-await על טעינת הקולות ייסגר. */
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const spoken = () => synth.queue.map((u) => u.text).join(' ');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('קריינות: הקראה בסיסית', () => {
  it('אינה מקריאה דבר מעצמה בטעינת המודול — אין הקראה אוטומטית', async () => {
    await setupTts();
    expect(synth.all).toHaveLength(0);
  });

  it('הנחיה קצרה נאמרת מיד, בעברית ובקצב הפדגוגי', async () => {
    const tts = await setupTts();
    tts.speak('בנו את המספר 420 בבית המספרים.');

    expect(synth.queue).toHaveLength(1);
    expect(synth.queue[0].text).toBe('בנו את המספר 420 בבית המספרים.');
    expect(synth.queue[0].lang).toBe('he-IL');
    expect(synth.queue[0].rate).toBe(0.92);
    expect(synth.dropped).toHaveLength(0);
  });

  it('בוחרת קול עברי ולא את ברירת המחדל האנגלית', async () => {
    const tts = await setupTts();
    tts.speak('שלום');
    expect(synth.queue[0].voice?.lang).toBe('he-IL');
  });

  it('מזהה גם את תג השפה הישן iw', async () => {
    const tts = await setupTts([
      REAL_HEBREW_VOICES.english,
      { name: 'Asaf', lang: 'iw_IL', localService: true },
    ]);
    tts.speak('שלום');
    expect(synth.queue[0].voice?.name).toBe('Asaf');
  });

  it('טקסט ריק משחרר את הקורא ואינו מכניס דבר לתור', async () => {
    const tts = await setupTts();
    const onEnd = vi.fn();
    tts.speak('   ', 'he-IL', onEnd);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(synth.all).toHaveLength(0);
  });

  it('onEnd נקרא פעם אחת כשההקראה נגמרת', async () => {
    const tts = await setupTts();
    const onEnd = vi.fn();
    tts.speak('בנו את המספר 420.', 'he-IL', onEnd);

    expect(onEnd).not.toHaveBeenCalled();
    synth.finishAll();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('בחירת קול לפי מה שקיים באמת בכל פלטפורמה', () => {
  it('ווינדוס: נבחר Microsoft Asaf ולא הקול האנגלי', async () => {
    const tts = await setupTts([REAL_HEBREW_VOICES.english, REAL_HEBREW_VOICES.windows]);
    tts.speak('שלום');
    expect(synth.queue[0].voice?.name).toBe(REAL_HEBREW_VOICES.windows.name);
  });

  it('Edge: נבחר אחד מקולות Hila או Avri', async () => {
    const tts = await setupTts([
      REAL_HEBREW_VOICES.english,
      REAL_HEBREW_VOICES.edgeAvri,
      REAL_HEBREW_VOICES.edgeHila,
    ]);
    tts.speak('שלום');
    expect([REAL_HEBREW_VOICES.edgeAvri.name, REAL_HEBREW_VOICES.edgeHila.name]).toContain(
      synth.queue[0].voice?.name
    );
  });

  it('כרומבוק: הקול של גוגל נבחר אף שאין בשמו מילה עברית', async () => {
    // "Android Speech Recognition and Synthesis from Google he-il-x-heb-network" —
    // רק תג השפה he-IL מסגיר אותו, ולכן התאמה לפי שם בלבד הייתה מחמיצה אותו.
    const tts = await setupTts([REAL_HEBREW_VOICES.english, REAL_HEBREW_VOICES.chromeOs]);
    tts.speak('שלום');
    expect(synth.queue[0].voice?.name).toBe(REAL_HEBREW_VOICES.chromeOs.name);
  });

  it('מק ואייפד: נבחר Carmit', async () => {
    const tts = await setupTts([REAL_HEBREW_VOICES.english, REAL_HEBREW_VOICES.apple]);
    tts.speak('שלום');
    expect(synth.queue[0].voice?.name).toBe('Carmit');
  });
});

describe('אופליין — קולות הרשת אילמים, והאפליקציה בנויה לעבוד בלי רשת', () => {
  const setOnline = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
  };

  afterEach(() => {
    setOnline(true);
  });

  it('כשיש גם קול מקומי וגם קול רשת, באופליין נבחר המקומי', async () => {
    const tts = await setupTts([REAL_HEBREW_VOICES.chromeOs, REAL_HEBREW_VOICES.windows]);
    setOnline(false);
    tts.speak('שלום');
    expect(synth.queue[0].voice?.localService).toBe(true);
  });

  it('כשמחוברים לרשת אין העדפה למקומי — קול הרשת האיכותי נשאר זמין', async () => {
    const tts = await setupTts([REAL_HEBREW_VOICES.chromeOs, REAL_HEBREW_VOICES.windows]);
    setOnline(true);
    tts.speak('שלום');
    expect(synth.queue[0].voice?.name).toBe(REAL_HEBREW_VOICES.chromeOs.name);
  });

  it('כרומבוק באופליין מדווח שכל הקולות העבריים שלו הם קולות רשת', async () => {
    const tts = await setupTts([REAL_HEBREW_VOICES.english, REAL_HEBREW_VOICES.chromeOs]);
    setOnline(false);
    expect(tts.hasOnlyNetworkVoicesOffline('he-IL')).toBe(true);
  });

  it('מכונה עם קול מקומי אינה מסומנת ככזו', async () => {
    const tts = await setupTts([REAL_HEBREW_VOICES.windows]);
    setOnline(false);
    expect(tts.hasOnlyNetworkVoicesOffline('he-IL')).toBe(false);
  });
});

describe('F1 — לחיצה שנייה חייבת להישמע (cancel אסינכרוני)', () => {
  it('אינה מוסרת utterance בזמן ש-cancel עוד מתנקז, ולכן שום הקראה אינה נזרקת', async () => {
    const tts = await setupTts();
    tts.speak('הנחיה ראשונה.');
    expect(synth.queue).toHaveLength(1);

    tts.speak('הנחיה שנייה.');

    // המנוע עדיין מדווח speaking: מסירה כאן הייתה נזרקת בשקט.
    expect(synth.cancels).toBe(1);
    expect(synth.dropped).toHaveLength(0);
    expect(synth.queue).toHaveLength(0);

    vi.advanceTimersByTime(200);

    expect(synth.dropped).toHaveLength(0);
    expect(spoken()).toBe('הנחיה שנייה.');
  });

  it('כשהמנוע פנוי ההקראה יוצאת מיד, בלי השהיה לילד', async () => {
    const tts = await setupTts();
    tts.speak('הנחיה.');
    expect(synth.queue).toHaveLength(1); // בלי להריץ שום טיימר
    expect(synth.cancels).toBe(0); // אין מה לבטל, ולכן אין גם מרוץ
  });

  it('לחיצה שלישית גוברת על השנייה ורק היא נשמעת', async () => {
    const tts = await setupTts();
    tts.speak('ראשונה.');
    tts.speak('שנייה.');
    tts.speak('שלישית.');

    vi.advanceTimersByTime(300);

    expect(spoken()).toBe('שלישית.');
    expect(synth.dropped).toHaveLength(0);
  });

  it('מנוע שנתקע במצב speaking אינו משתיק את הכפתור לנצח', async () => {
    const tts = await setupTts();
    synth.wedge(); // מדווח speaking בלי סוף, באג ידוע בכרומיום
    tts.speak('הנחיה.');

    vi.advanceTimersByTime(2000);
    expect(spoken()).toBe('הנחיה.'); // אחרי תקרת ההמתנה מקריאים בכל זאת
  });
});

describe('F2 — מנוע מושהה', () => {
  it('משוחרר מהשהיה לפני ההקראה, אחרת הכול נבלע בשקט', async () => {
    const tts = await setupTts();
    synth.pause();

    tts.speak('הנחיה.');

    expect(synth.paused).toBe(false);
    expect(synth.resumes).toBeGreaterThan(0);
    expect(synth.queue).toHaveLength(1);
  });
});

describe('F3 — הנחיות ארוכות אינן נקטעות אחרי ~15 שניות', () => {
  const MAX_CHARS = 140;

  it('ההנחיה הארוכה ביותר בקטלוג מפוצלת למקטעים קצרים, בלי לאבד מילה', async () => {
    const catalog = ['data/sessionTasks.ts', 'data/taskBuilders.ts', 'core/QMatrix.ts']
      .map(SRC)
      .join('\n');
    const instructions = [...catalog.matchAll(/instructionHe: *(['"])([\s\S]*?)\1/g)].map((m) => m[2]);
    expect(instructions.length).toBeGreaterThan(15);

    const longest = instructions.sort((a, b) => b.length - a.length)[0];
    expect(longest.length).toBeGreaterThan(MAX_CHARS); // אחרת הבדיקה אינה בודקת כלום

    const tts = await setupTts();
    tts.speak(longest.replace(/\\n/g, '\n'));

    expect(synth.queue.length).toBeGreaterThan(1);
    for (const utterance of synth.queue) {
      expect(utterance.text.length).toBeLessThanOrEqual(MAX_CHARS);
      expect(utterance.lang).toBe('he-IL');
    }

    // אף מילה לא נפלה בין המקטעים.
    const words = (s: string) => s.split(/\s+/).filter(Boolean);
    const original = words(
      longest.replace(/\\n/g, ' ').replace(/[*_#`~]/g, '')
    ).filter((w) => !/^\d\.$/.test(w)).length;
    expect(words(spoken()).length).toBeGreaterThanOrEqual(original);
  });

  it('כל מקטע נשאר מתחת לתקרה גם בטקסט אחיד בלי סימני פיסוק', async () => {
    const tts = await setupTts();
    tts.speak(Array.from({ length: 120 }, (_, i) => `מילה${i}`).join(' '));

    expect(synth.queue.length).toBeGreaterThan(1);
    for (const utterance of synth.queue) {
      expect(utterance.text.length).toBeLessThanOrEqual(MAX_CHARS);
    }
  });

  it('ניקוד אינו מקצר את המקטעים — סימני ניקוד אינם הברות', async () => {
    // הנחיה מנוקדת נושאת בערך פי 1.7 תווים על אותו דיבור בדיוק. ספירה תמימה
    // הייתה חותכת אותה ליותר מקטעים ממה שהדיבור מצריך.
    const plain = 'בנו בבית המספרים את המספר ארבע מאות ועשרים בעזרת מאות ועשרות, והקלידו את התוצאה בתיבת המענה שלמטה.';
    const pointed =
      'בְּנוּ בְּבֵית הַמִּסְפָּרִים אֶת הַמִּסְפָּר אַרְבַּע מֵאוֹת וְעֶשְׂרִים בְּעֶזְרַת מֵאוֹת וַעֲשָׂרוֹת, וְהַקְלִידוּ אֶת הַתּוֹצָאָה בְּתֵיבַת הַמַּעֲנֶה שֶׁלְּמַטָּה.';
    expect(pointed.length).toBeGreaterThan(plain.length * 1.4); // אחרת הבדיקה אינה בודקת כלום

    const a = await setupTts();
    a.speak(plain);
    const plainChunks = synth.queue.length;

    const b = await setupTts();
    b.speak(pointed);
    const pointedChunks = synth.queue.length;

    expect(pointedChunks).toBe(plainChunks);
  });

  it('מקטע לעולם אינו נחתך בין אות לניקוד שלה', async () => {
    const tts = await setupTts();
    tts.speak(
      Array.from({ length: 40 }, () => 'בְּנוּ הַמִּסְפָּר הַמְבֻקָּשׁ').join(' ')
    );
    expect(synth.queue.length).toBeGreaterThan(1);
    for (const utterance of synth.queue) {
      // סימן ניקוד פותח מקטע = הוא נותק מהאות שלו.
      expect(/^[\u0591-\u05C7]/.test(utterance.text), utterance.text.slice(0, 12)).toBe(false);
    }
  });

  it('onEnd מגיע רק אחרי המקטע האחרון, ולא אחרי הראשון', async () => {
    const tts = await setupTts();
    const onEnd = vi.fn();
    tts.speak(Array.from({ length: 120 }, (_, i) => `מילה${i}`).join(' '), 'he-IL', onEnd);

    const total = synth.queue.length;
    expect(total).toBeGreaterThan(1);

    for (let i = 0; i < total - 1; i += 1) synth.finishOne();
    expect(onEnd).not.toHaveBeenCalled();

    synth.finishOne();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('F4 — הכפתור אינו נתקע באמצע הקראה', () => {
  it('מנוע שנטש את התור בלי onend משחרר בכל זאת את הכפתור', async () => {
    const tts = await setupTts();
    const onEnd = vi.fn();
    tts.speak('הנחיה שהמנוע יזרוק.', 'he-IL', onEnd);

    synth.vanish(); // בלי onend ובלי onerror, כמו באג האיסוף של כרומיום
    vi.advanceTimersByTime(5000);

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('שגיאת מנוע משחררת את הכפתור', async () => {
    const tts = await setupTts();
    const onError = vi.fn();
    tts.speak('הנחיה.', 'he-IL', undefined, onError);

    synth.failOne('synthesis-failed');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('הקראה שנקטעה על ידי לחיצה אחרת מודיעה לכפתור שלה שהיא נגמרה', async () => {
    const tts = await setupTts();
    const firstEnded = vi.fn();
    tts.speak('ראשונה.', 'he-IL', firstEnded, firstEnded);
    const first = synth.queue[0];

    tts.speak('שנייה.');
    first.onerror?.({ error: 'canceled' }); // המנוע מדווח על הביטול

    expect(firstEnded).toHaveBeenCalledTimes(1);
  });

  it('השירות מחזיק את ה-utterances כדי שאיסוף הזיכרון לא יבלע את onend', async () => {
    // התנהגות שאי אפשר לבדוק בלי לאלץ GC, ולכן היא ננעלת בקוד עצמו.
    const src = SRC('infrastructure/services/TTSService.ts');
    expect(src).toContain('this.activeUtterances = utterances;');
  });
});

describe('F5 — לחיצה לפני שרשימת הקולות נטענה', () => {
  it('ממתינה לקולות ואז מקריאה בקול עברי', async () => {
    const tts = await setupTts([]); // getVoices() ריק, כמו בכרומיום בטעינה קרה
    tts.speak('שלום');

    expect(synth.all).toHaveLength(0); // עוד לא דיברנו עם קול אנגלי

    synth.setVoices(HEBREW_VOICES);
    await flushMicrotasks();

    expect(synth.queue).toHaveLength(1);
    expect(synth.queue[0].voice?.lang).toBe('he-IL');
  });

  it('על מכונה בלי קולות כלל, רק הלחיצה הראשונה משלמת את ההמתנה', async () => {
    // אומת בכרום אמיתי: מכונה בלי מנוע דיבור מחזירה רשימת קולות ריקה לתמיד,
    // והמתנה חוזרת הייתה שמה חצי שנייה מתה לפני כל לחיצה.
    const tts = await setupTts([]);

    tts.speak('ראשונה.');
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(synth.queue).toHaveLength(1);

    tts.speak('שנייה.');
    vi.advanceTimersByTime(200); // רק כדי שהביטול יתנקז, בלי המתנה לקולות
    await flushMicrotasks();
    expect(spoken()).toBe('שנייה.');
  });

  it('קולות שמגיעים באיחור עדיין נקלטים אחרי שההמתנה נזנחה', async () => {
    const tts = await setupTts([]);
    tts.speak('ראשונה.');
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    synth.setVoices(HEBREW_VOICES); // כרום הוסיף את קולות הרשת מאוחר יותר
    tts.speak('שנייה.');
    vi.advanceTimersByTime(200);
    await flushMicrotasks();

    expect(synth.queue[0].voice?.lang).toBe('he-IL');
  });

  it('אינה נתקעת לנצח אם הקולות לעולם אינם מגיעים', async () => {
    const tts = await setupTts([]);
    tts.speak('שלום');

    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    expect(synth.queue).toHaveLength(1); // מוקרא בכל זאת, ולו בקול ברירת המחדל
  });
});

describe('עצירה — כפתור אחד אינו משתיק כפתור אחר', () => {
  it('stopIfCurrent עם ידית ישנה אינו קוטע הקראה חדשה', async () => {
    const tts = await setupTts();
    const staleHandle = tts.speak('ראשונה.');
    tts.speak('שנייה.');
    vi.advanceTimersByTime(200);

    const cancelsBefore = synth.cancels;
    tts.stopIfCurrent(staleHandle); // הכפתור הישן יורד מהמסך

    expect(synth.cancels).toBe(cancelsBefore);
    expect(spoken()).toBe('שנייה.');
  });

  it('stopIfCurrent עם הידית הנוכחית כן עוצר', async () => {
    const tts = await setupTts();
    const handle = tts.speak('הנחיה.');
    tts.stopIfCurrent(handle);

    expect(synth.cancels).toBe(1);
    expect(synth.queue).toHaveLength(0);
  });

  it('stop() מבטל גם הקראה שעוד ממתינה להתנקזות, ולא משאיר אותה לצאת אחר כך', async () => {
    const tts = await setupTts();
    tts.speak('ראשונה.');
    tts.speak('שנייה.'); // ממתינה להתנקזות
    tts.stop();

    vi.advanceTimersByTime(500);

    expect(synth.queue).toHaveLength(0);
  });
});

describe('שער השמע בכניסת הילד', () => {
  it('פותח את הרשאות השמע בלחיצת הכניסה, עם טקסט אמיתי ובעוצמה אפס', async () => {
    const tts = await setupTts();
    expect(tts.initializeAudioGate()).toBe(true);

    expect(synth.all).toHaveLength(1);
    expect(synth.all[0].volume).toBe(0);
    // כרומיום מתעלם מ-utterance של רווחים בלבד, והשמע היה נשאר נעול.
    expect(synth.all[0].text.trim().length).toBeGreaterThan(0);
    expect(tts.isAudioUnlocked()).toBe(true);
  });

  it('פותח את השמע גם לילד שרענן את הדף ולא עבר שוב במסך הכניסה', async () => {
    const tts = await setupTts();
    tts.armAudioGate();
    expect(synth.all).toHaveLength(0); // עוד לא נגעו במסך

    window.dispatchEvent(new Event('pointerdown'));

    expect(tts.isAudioUnlocked()).toBe(true);
    expect(synth.all).toHaveLength(1);
    expect(synth.all[0].volume).toBe(0);
  });

  it('מקלדת בלבד פותחת את השמע גם היא', async () => {
    const tts = await setupTts();
    tts.armAudioGate();
    window.dispatchEvent(new Event('keydown'));
    expect(tts.isAudioUnlocked()).toBe(true);
  });

  it('אינו חוזר על עצמו: נגיעה שנייה אינה מוסיפה עוד utterance', async () => {
    const tts = await setupTts();
    tts.armAudioGate();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerdown'));
    tts.initializeAudioGate();

    expect(synth.all).toHaveLength(1);
  });

  it('כפתור ההקראה דורך את השער בעצמו, ולכן הוא פעיל בכל מסך לומד', () => {
    expect(SRC('presentation/design-system/UdlSpeechButton.tsx')).toContain('tts.armAudioGate()');
  });

  it('דפדפן בלי Web Speech API אינו מפיל את המסך', async () => {
    // השם קיים על window אבל המנוע עצמו אינו — המלכודת שבה כל קריאה זורקת חריגה.
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.resetModules();
    const mod = await import('@/infrastructure/services/TTSService');
    const tts = mod.TTSService.getInstance();

    expect(tts.initializeAudioGate()).toBe(false);
    const onError = vi.fn();
    expect(() => tts.speak('שלום', 'he-IL', undefined, onError)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(() => tts.stop()).not.toThrow();
  });
});

describe('האפיון: הקראה בממשק הלומד בלבד', () => {
  it('אין הקראה בשום קובץ בממשק המורה או המנהל — גם לא בקובץ שייווסף מחר', () => {
    const files = [
      ...tsxFilesUnder('presentation/pages/admin'),
      ...tsxFilesUnder('presentation/pages/TeacherDashboard'),
    ];
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      expect(readFileSync(file, 'utf-8'), file).not.toContain('UdlSpeechButton');
    }
  });

  it('כל מסך לומד שמציג הנחיה משלו מקריא אותה', () => {
    // האפיון: "כל הנחיה המוצגת ללומד על גבי המסך מלווה בכפתור הקראה קולית ייעודי".
    // משימות המשנה אינן ברשימה משום שהן מוצגות בתוך TaskCard, שמקריא את ההנחיה.
    const surfaces = [
      'features/workspace/tasks/TaskCard.tsx',
      'features/workspace/tasks/IntroTask.tsx',
      'features/workspace/tasks/SmallChangeTask.tsx',
      'features/workspace/tasks/MissingElementTask.tsx',
      'features/workspace/tasks/BackwardDiagnosisView.tsx',
      'features/workspace/overlays/HelpOverlays.tsx',
      'features/workspace/overlays/ReinforcementOrChallengeScreen.tsx',
      'features/workspace/overlays/StudentChatOverlay.tsx',
      'features/workspace/ReflectionScreen.tsx',
      'presentation/components/student/SessionPausedOverlay.tsx',
      'presentation/components/student/SessionClosedOverlay.tsx',
      'presentation/components/student/ProjectorWaitingScreen.tsx',
      'presentation/components/student/BeeFlightWaitingScreen.tsx',
      'presentation/components/student/Session8ReflectionScreen.tsx',
      'presentation/pages/Login.tsx',
    ];
    for (const p of surfaces) {
      expect(SRC(p), p).toContain('<UdlSpeechButton');
    }
  });

  it('החונך הסוקרטי מקריא גם את האפשרויות, לא רק את השאלה', () => {
    const card = SRC('features/workspace/overlays/HelpOverlays.tsx');
    expect(card).toContain('aiSocraticHint?.choices?.map((c) => c.textHe)');
  });

  it('שלושת שלבי לוח מפגש 8 מוקראים, ולא רק הראשון', () => {
    const board = SRC('presentation/components/student/Session8ReflectionScreen.tsx');
    expect(board.match(/<UdlSpeechButton/g) ?? []).toHaveLength(3);
  });

  it('בצ׳אט של הילד מוקראות הודעות המורה, ולא מה שהילד עצמו כתב', () => {
    const chat = SRC('features/workspace/overlays/StudentChatOverlay.tsx');
    expect(chat).toContain('{!isMe && (');
    expect(chat).toContain('<UdlSpeechButton text={m.text}');
  });

  it('מסך הכניסה עדיין פותח את שער השמע', () => {
    expect(SRC('presentation/pages/Login.tsx')).toContain('tts.initializeAudioGate()');
  });

  it('כפתור ההקראה עוצר רק את ההקראה שלו עצמו בעת פירוק', () => {
    const src = SRC('presentation/design-system/UdlSpeechButton.tsx');
    expect(src).toContain('tts.stopIfCurrent(handleRef.current)');
    // stop() ללא תנאי בניקוי היה משתיק כפתור אחר בכל mount ב-StrictMode.
    expect(src).not.toMatch(/return\s*\(\)\s*=>\s*\{\s*tts\.stop\(\);/);
  });
});
