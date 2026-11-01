/**
 * The recorded narration is cut by sentence, not by button: most read-aloud texts are
 * put together from sentences that change with the screen (which steps of a guide are
 * shown, "משימה 3 מתוך 7", the teacher's gender), so a recording per whole text would
 * miss most of what a child actually presses. A text is played from recordings only when
 * every one of its sentences has one (infrastructure/services/NarrationAudio.ts);
 * otherwise the device voice reads it, as before.
 *
 * The key of a sentence is a hash of its text as it is written on the screen (unpointed).
 * The pointed text the recording was made from lives beside the recordings
 * (public/narration/pointed.he.json), never on the screen.
 */

import type { TeacherGender } from './teacherGender';

/** What the device voice also drops (TTSService.cleanTextForSpeech): emoji, arrows, markdown marks. */
function normalize(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/\uFE0F/g, '')
    .replace(/[\u2190-\u21FF]/g, '')
    .replace(/[*_#`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The sentences of a read-aloud text, in order. A sentence ends at . ! ? or : followed by
 * a space or the end; "6,284" and "ה־1" stay whole. A line break ends a sentence too.
 */
export function narrationSegments(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .flatMap((line) => normalize(line).split(/(?<=[.!?:])\s+/))
    .map((s) => s.trim())
    // "..." alone, or a stray mark, is not a sentence.
    .filter((s) => /[א-ת0-9]/.test(s));
}

/**
 * Whether the sentence names the teacher. מוֹרָה and מוֹרֶה are spelled alike and said
 * differently, so such a sentence is recorded twice and played in the teacher's gender.
 * "שמורה" (saved) is not the teacher: a bare ש before מורה is left out on purpose.
 */
export function namesTeacher(segment: string): boolean {
  return /(^|[^א-ת])(ו?(ה|ל|מה|כשה|שה|בשביל ה|עם ה))?מורה(?![א-ת])/.test(segment);
}

/** cyrb53: a stable 53-bit string hash, the same in the browser, in Node and in tests. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The file name (without extension) of a sentence's recording, in the teacher's gender when it names the teacher. */
export function narrationKey(segment: string, gender: TeacherGender): string {
  const base = hash53(segment);
  return namesTeacher(segment) ? `${base}-${gender === 'male' ? 'm' : 'f'}` : base;
}
