import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { stationTitleHe, MEETING_NUMBERS } from '@/core/stationNames';

/**
 * Texts on the learner's and teacher's screens that did not say what the
 * software does (register, "תיקונים נדרשים במסמכי האפיון 01–04", row 18,
 * "נותרו בקוד"). Each block names its source.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf-8');
/** The source without comments — the comments quote the old wording on purpose. */
const code = (p: string) =>
  src(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the lobby card names the meeting as documents 02 and 03 do (register row 4)', () => {
  const hub = code('presentation/pages/StudentHub.tsx');
  // The names live in one place since 27.9.2026 (register ט); the lobby reads them from there.
  const names = code('core/stationNames.ts');

  const TITLES: Record<number, string> = {
    1: 'תחנה 1: ארגז החול',
    2: 'תחנה 2: יוצאים למסע',
    3: 'תחנה 3: בונים מספרים בכמה דרכים',
    4: 'תחנה 4: חיבור במאונך עם הקבצה',
    5: 'תחנה 5: חיסור במאונך עם פריטה',
    6: 'תחנה 6: אתגר האפס',
    7: 'תחנה 7: בלשי המספרים',
    8: 'תחנה 8: חוקרים בעצמנו',
  };

  for (const [n, title] of Object.entries(TITLES)) {
    it(`meeting ${n}: "${title}"`, () => {
      expect(stationTitleHe(Number(n) as (typeof MEETING_NUMBERS)[number])).toBe(title);
      expect(hub).toContain(`title: stationTitleHe(${n}),`);
    });
  }

  it('no educator jargon reaches the child (owner, 27.9.2026)', () => {
    for (const word of ['אבחון', 'הערכה', 'רפלקציה', 'אינטגרציה', 'מסכם', 'המערכת']) {
      expect(hub, word).not.toContain(word);
      expect(names, word).not.toContain(word);
    }
  });

  it('none of the old names that described no meeting is left', () => {
    for (const old of ['מחקר אישי', 'פריטה וקיבוץ', 'תכנון ניסויים', 'מחקר מתקדם', 'אתגרי חיבור וחיסור', 'סיכום ותובנות']) {
      expect(hub, old).not.toContain(old);
      expect(names, old).not.toContain(old);
    }
  });

  it('the descriptions speak to the class, never to one child in the singular', () => {
    const descs = [...hub.matchAll(/desc: '([^']*)'/g)].map((m) => m[1]);
    expect(descs).toHaveLength(8);
    for (const d of descs) {
      expect(d, d).not.toMatch(/שלך|עבורך|\bלך\b/);
    }
  });

  it('meeting 8 says the blocks are gone, in a positive way; meeting 5 is subtraction', () => {
    // "סמנו": the reflection board has the child mark strategies; no ambiguous "ספרו", no filler "כבר גם".
    expect(hub).toContain("desc: 'הפעם פתרו בלי לבנים. בסוף סמנו מה עזר לכם.'");
    expect(stationTitleHe(5)).toMatch(/^תחנה 5: [^']*חיסור/);
  });

  it('meetings 3–6 use the approved terms and never state the answer (register ט, row 23; audit 4.10.2026)', () => {
    // 3: פרטו … ל־ with the blocks' child names; "the number stays the same" is the answer, so it is not said.
    expect(hub).toContain("desc: 'פרטו לבנת מאה אחת לעשר לבני עשרת. בדקו איזה מספר מייצגות הלבנים לאחר הפריטה.'");
    expect(hub).toContain("desc: 'כשמצטברות בטור עשר לבנים, קבצו אותן ללבנה אחת בטור שמשמאלו.'");
    expect(hub).toContain("desc: 'כשאין בטור מספיק לבנים, פרטו לבנה אחת מהטור שמשמאלו.'");
    expect(hub).toContain("desc: 'גלו מה עושים כשצריך לפרוט לבנה מטור שיש בו אפס.'");
    for (const old of ['פרקו', 'נשאר אותו מספר', 'לבנה אחת גדולה', 'מהטור שמשמאל.', 'ויש אפס?']) {
      expect(hub, old).not.toContain(old);
    }
  });
});

describe('the lobby has no entry button — the learner is moved in (register rows 14 and 17)', () => {
  const hub = code('presentation/pages/StudentHub.tsx');

  it('no "התחל פעילות" / "היכנס לפעילות" button and no click handler that navigates', () => {
    expect(hub).not.toContain('התחל פעילות');
    expect(hub).not.toContain('היכנס לפעילות');
    expect(hub).not.toContain('handleStartActiveSession');
    expect(hub).not.toMatch(/<button[\s\S]*?onClick/);
  });

  it('a running meeting still moves the learner into the workspace by itself', () => {
    expect(hub).toMatch(/activeClassSession\?\.status === 'active' && !isAwaitingTeacherGate && !isProjectorModeActive\) \{\s*navigate\(`\/workspace\?meeting=\$\{teacherSessionNum\}`, \{ replace: true \}\);/);
  });

  it('a paused meeting still shows the station card with the pause message (register item 7)', () => {
    // "המורה עצרה / עצר את הפעילות לרגע", in the teacher's gender (core/teacherGender.ts).
    expect(hub).toContain("const pausedTitle = teacherSentenceHe('pausedTitle', teacherGender);");
    expect(hub).toMatch(/activeClassSession\.status === 'paused' && \([\s\S]*?\{pausedTitle\}\. חכו…/);
    expect(hub).toContain('{activeSession.title}');
  });
});

describe('"הצגת בית המספרים" appears only in meetings that have a board', () => {
  const topbar = src('features/workspace/WorkspaceTopbar.tsx');
  const page = src('features/workspace/StudentWorkspacePage.tsx');

  it('the board toggle is gated on meetings 2 and 8, like the board itself', () => {
    const at = topbar.indexOf(': toggleBoard}'); // station 1 shows a note instead (owner, 27.9.2026)
    expect(at).toBeGreaterThan(-1);
    const gate = topbar.slice(topbar.lastIndexOf('{sessionNumber', at), at);
    expect(gate).toContain('sessionNumber !== 2 && sessionNumber !== 8');
    expect(page).toMatch(/\{sessionNumber !== 2 && sessionNumber !== 8 && \(\s*<PlaceValueBoard/);
  });
});

describe('the early-finisher choice screen tells the truth (מסמך 03 §3.3–3.7)', () => {
  const screen = code('features/workspace/overlays/ReinforcementOrChallengeScreen.tsx');

  it('one challenge exercise, two review exercises', () => {
    // Second person plural, never first person plural (audit A5-F04 / A4-F11, 4.10.2026).
    expect(screen).toContain("reinforcement: 'שני תרגילים נוספים, לחזרה על מה שתרגלתם היום.'");
    expect(screen).not.toContain('שתרגלנו');
    expect(screen).toContain("challenge: 'תרגיל אתגר אחד, קשה יותר, בנושא של היום.'");
  });

  it('no plural "משימות חשיבה", no "ציון השליטה", no "מספרים גדולים" promised to every track', () => {
    expect(screen).not.toContain('משימות חשיבה');
    expect(screen).not.toContain('ציון');
    expect(screen).not.toContain('מספרים גדולים');
  });

  it('the read-aloud text is built from the same strings the screen shows', () => {
    expect(screen).toMatch(/const BRANCH_CHOICE_SPEECH = \[\s*BRANCH_CHOICE_TEXT\.badge,/);
    expect(screen).toContain('<UdlSpeechButton text={BRANCH_CHOICE_SPEECH}');
  });

  it('matches the bank: two reinforcement exercises and one challenge in every meeting and track', async () => {
    const { SESSION_BRANCH_TASKS } = await import('@/data/sessionBranchTasks');
    for (const s of [3, 4, 5, 6, 7] as const) {
      for (const p of ['remediation_path', 'green_path'] as const) {
        expect(SESSION_BRANCH_TASKS[s][p].reinforcement, `${s} ${p}`).toHaveLength(2);
        expect(SESSION_BRANCH_TASKS[s][p].challenge, `${s} ${p}`).toHaveLength(1);
      }
    }
  });
});

describe("the teacher's replay panel is a reconstruction without sound, not a video", () => {
  const journey = code('presentation/pages/TeacherDashboard/components/LearnerJourney.tsx');

  it('no camera icon and no English "chunks" on screen', () => {
    expect(journey).not.toMatch(/<Video\b|import \{[^}]*\bVideo\b/);
    expect(journey).not.toMatch(/\} chunks`/);
    expect(journey).toContain('מקטעי הקלטה');
  });

  it('the panel heading says what it is', () => {
    expect(journey).toContain('שחזור מסך העבודה, ללא קול · {meetingShortLabelHe(selectedSession)}');
  });

  it('keeps the fallback message PRD 7.3 Module 21 §ה quotes word for word', () => {
    expect(journey).toContain('וידאו השחזור בהכנה');
  });
});
