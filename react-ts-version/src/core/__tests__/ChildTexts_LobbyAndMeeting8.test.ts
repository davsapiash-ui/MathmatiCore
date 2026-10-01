import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { REFLECTION_TEXT_HE } from '@/presentation/components/student/Session8ReflectionScreen';
import { TEACHER_SENTENCES_HE } from '@/core/teacherGender';

/**
 * The Hebrew rows of the spec-vs-software audit (28.9.2026) for meeting 8 and
 * for the entry and lobby screens, as fixed and checked on the screen.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

describe('ע8.1 — meeting 8’s board ends with "סיום התחנה"', () => {
  it('inside the workspace the child reads "תחנה", not "מפגש" (register, deviation 24(ג))', () => {
    expect(REFLECTION_TEXT_HE.finish).toBe('סיום התחנה');
  });
});

describe('ע0.1 — the lobby’s waiting screen says only what PRD Module 14 §ב0 gives', () => {
  const hub = src('presentation/pages/StudentHub.tsx');

  it('the second line, masculine singular with "ע״י", is gone', () => {
    expect(hub).not.toContain('<span>ממתין לפתיחת השיעור');
    expect(hub).not.toContain('ע״י המורה');
  });

  it('the PRD sentence and its read-aloud button stay', () => {
    expect(hub).toContain('היום עוד לא התחלנו');
    // The PRD's sentence, in the teacher's gender (core/teacherGender.ts).
    expect(TEACHER_SENTENCES_HE.willOpenActivity.female).toBe('המורה תפתח את הפעילות בקרוב.');
    expect(hub).toContain("const willOpenActivity = teacherSentenceHe('willOpenActivity', teacherGender);");
    expect(hub).toContain('{willOpenActivity}');
    expect(hub).toContain('<UdlSpeechButton text={`היום עוד לא התחלנו. ${willOpenActivity}`} className="shrink-0" />');
  });
});

describe('ע0.2 — the child’s sign-in screen is "כניסת תלמידים" (document 04: "פורטל כניסת תלמידים")', () => {
  const login = src('presentation/pages/Login.tsx');

  it('plural, not a masculine-singular label', () => {
    expect(login).toContain('? "כניסת תלמידים"');
    expect(login).not.toMatch(/כניסת תלמיד(?!ים)/);
  });
});

describe('ע0.4 — the public home page says "קושי", as decision ט did on the teacher screens', () => {
  it('no "מאבק"', () => {
    const landing = src('presentation/pages/LandingPage.tsx');
    expect(landing).toContain('זיהוי קושי, פערים ודפוסי חשיבה');
    expect(landing).not.toContain('מאבק');
  });
});
