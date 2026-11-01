/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { narrationSegments, narrationKey, namesTeacher } from '@/core/narrationSegments';

/**
 * ההקראה המוקלטת (אפיון מודול 7, החלטת בעל המוצר, 29.10.2026): לכל משפט קבוע במסכי
 * הלומד יש הקלטה מטקסט מנוקד, ומשפט בלי הקלטה מוקרא בקול המכשיר.
 */

const ROOT = resolve(__dirname, '../../..');

describe('חלוקת טקסט למשפטים', () => {
  it('מפצלת בסוף משפט ובנקודתיים, ומשאירה מספרים שלמים', () => {
    expect(narrationSegments('משימה 3 מתוך 7: בונים מספר. בנו את 6,284 בבית המספרים. כתבו את ה־1 בעיגול הזיכרון!')).toEqual([
      'משימה 3 מתוך 7:',
      'בונים מספר.',
      'בנו את 6,284 בבית המספרים.',
      'כתבו את ה־1 בעיגול הזיכרון!',
    ]);
  });

  it('מתעלמת מאמוג׳י, מחצים ושלוש נקודות לבדן, כמו קול המכשיר', () => {
    expect(narrationSegments('המורה יודעת 🤝')).toEqual(['המורה יודעת']);
    expect(narrationSegments('לחצו על ביטול הפעולה ↺.')).toEqual(['לחצו על ביטול הפעולה .']);
    expect(narrationSegments('...')).toEqual([]);
  });

  it('אותו משפט תמיד מקבל אותו שם קובץ', () => {
    expect(narrationKey('בנו את המספר.', 'female')).toBe(narrationKey('בנו את המספר.', 'male'));
    expect(narrationKey('בנו את המספר.', 'female')).not.toBe(narrationKey('בנו את המספר!', 'female'));
  });

  it('משפט על המורה מוקלט פעמיים, מוֹרָה ומוֹרֶה; "שמורה" (נשמרה) אינו המורה', () => {
    for (const s of ['המורה תפתח את הפעילות בקרוב.', 'כתבו את קוד הגישה שקיבלתם מהמורה.', 'קראו למורה', 'כשהמורה תפתח את התחנה הבאה, נמשיך יחד.']) {
      expect(namesTeacher(s), s).toBe(true);
      expect(narrationKey(s, 'female')).not.toBe(narrationKey(s, 'male'));
    }
    expect(namesTeacher('העבודה שלכם שמורה בדיוק כמו שהשארתם אותה.')).toBe(false);
  });
});

describe('כיסוי: לכל משפט קבוע יש ניקוד והקלטה', () => {
  it('כל משפט שהקוד יכול למנות מראש מנוקד ומוקלט — טקסט שהשתנה בלי הקלטה חדשה נתפס כאן', async () => {
    const { recordingPlan } = await import('../../../tools/narration/generate');
    const entries = JSON.parse(readFileSync(resolve(ROOT, 'narration/pointed.he.json'), 'utf8'));
    const { jobs, unpointed } = recordingPlan(entries);
    expect(unpointed, 'משפטים בלי ניקוד: npm run narration').toEqual([]);

    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'public/narration/manifest.json'), 'utf8')) as { keys: string[] };
    const listed = new Set(manifest.keys);
    const missing = jobs.filter((j) => !listed.has(j.key) || !existsSync(resolve(ROOT, `public/narration/${j.key}.mp3`)));
    expect(missing.map((j) => j.text), 'משפטים בלי הקלטה: npm run narration').toEqual([]);
  }, 60_000);

  it('בטקסט המנוקד אין ספרות ואין סימני חשבון: הכול נאמר במילים', () => {
    const entries = JSON.parse(readFileSync(resolve(ROOT, 'narration/pointed.he.json'), 'utf8')) as Array<Record<string, string>>;
    const bad = entries.flatMap((e) => [e.pointed, e.pointed_f, e.pointed_m].filter((p): p is string => typeof p === 'string' && /[0-9+=▢−]/.test(p)));
    expect(bad).toEqual([]);
  });
});

/* ── ההשמעה עצמה ── */

class FakeAudio {
  static instances: FakeAudio[] = [];
  static failOn: string | null = null;
  src = '';
  preload = '';
  played: string[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  constructor() {
    FakeAudio.instances.push(this);
  }
  play() {
    this.played.push(this.src);
    if (FakeAudio.failOn && this.src.includes(FakeAudio.failOn)) return Promise.reject(new Error('load failed'));
    queueMicrotask(() => this.onplaying?.());
    return Promise.resolve();
  }
  pause() {}
  load() {}
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  /** The current file finished playing. */
  end() {
    this.onended?.();
  }
}

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onstart: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const synth = {
  queue: [] as FakeUtterance[],
  speaking: false,
  pending: false,
  paused: false,
  getVoices: () => [{ name: 'Carmit', lang: 'he-IL', localService: true }],
  addEventListener: () => {},
  speak(u: FakeUtterance) {
    this.queue.push(u);
  },
  cancel() {
    this.queue = [];
  },
  resume() {},
};

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

async function setup(recorded: string[]) {
  synth.queue = [];
  FakeAudio.instances = [];
  FakeAudio.failOn = null;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  const keys = recorded.flatMap((s) => [narrationKey(s, 'female'), narrationKey(s, 'male')]);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ keys }) })));
  vi.resetModules();
  const { tts } = await import('@/infrastructure/services/TTSService');
  tts.preloadRecordings();
  await flush();
  return tts;
}

describe('השמעת ההקלטות', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('כשלכל משפט יש הקלטה: מושמעות ההקלטות לפי הסדר, וקול המכשיר אינו משמש', async () => {
    const tts = await setup(['בנו את המספר.', 'כתבו את התוצאה.']);
    const ended = vi.fn();
    const started = vi.fn();
    tts.speak('בנו את המספר. כתבו את התוצאה.', 'he-IL', ended, undefined, started);
    const audio = FakeAudio.instances[0];
    await flush();
    expect(started).toHaveBeenCalledTimes(1);
    audio.end();
    audio.end();
    expect(audio.played).toEqual([`/narration/${narrationKey('בנו את המספר.', 'female')}.mp3`, `/narration/${narrationKey('כתבו את התוצאה.', 'female')}.mp3`]);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(synth.queue).toHaveLength(0);
  });

  it('משפט אחד בלי הקלטה: הטקסט כולו מוקרא בקול המכשיר', async () => {
    const tts = await setup(['בנו את המספר.']);
    tts.speak('בנו את המספר. משפט חדש שעוד לא הוקלט.');
    expect(FakeAudio.instances).toHaveLength(0);
    expect(synth.queue.map((u) => u.text).join(' ')).toContain('משפט חדש שעוד לא הוקלט');
  });

  it('הקלטה שלא נטענת (אין רשת): מה שעוד לא נשמע עובר לקול המכשיר, והילד אינו נשאר בשקט', async () => {
    const tts = await setup(['בנו את המספר.', 'כתבו את התוצאה.']);
    FakeAudio.failOn = narrationKey('כתבו את התוצאה.', 'female');
    tts.speak('בנו את המספר. כתבו את התוצאה.');
    FakeAudio.instances[0].end();
    await flush();
    expect(synth.queue.map((u) => u.text)).toEqual(['כתבו את התוצאה.']);
  });

  it('משפט על המורה מושמע בלשון שהמורה בחרה', async () => {
    const tts = await setup(['כתבו את קוד הגישה שקיבלתם מהמורה.']);
    tts.speak('כתבו את קוד הגישה שקיבלתם מהמורה.', 'he-IL', undefined, undefined, undefined, 'male');
    expect(FakeAudio.instances[0].played[0]).toContain(`${narrationKey('כתבו את קוד הגישה שקיבלתם מהמורה.', 'male')}.mp3`);
    expect(FakeAudio.instances[0].played[0]).toMatch(/-m\.mp3$/);
  });

  it('לחיצה על כפתור אחר עוצרת את ההקלטה הקודמת ומשחררת את הכפתור שלה', async () => {
    const tts = await setup(['בנו את המספר.', 'כתבו את התוצאה.']);
    const firstEnded = vi.fn();
    tts.speak('בנו את המספר.', 'he-IL', firstEnded);
    tts.speak('כתבו את התוצאה.');
    expect(firstEnded).toHaveBeenCalledTimes(1);
    const audio = FakeAudio.instances[0];
    expect(audio.played.at(-1)).toContain(narrationKey('כתבו את התוצאה.', 'female'));
  });

  it('עצירה עוצרת גם הקלטה', async () => {
    const tts = await setup(['בנו את המספר.']);
    const ended = vi.fn();
    tts.speak('בנו את המספר.', 'he-IL', ended);
    tts.stop();
    FakeAudio.instances[0].end();
    expect(FakeAudio.instances[0].src).toBe('');
    expect(ended).toHaveBeenCalledTimes(1);
  });
});
