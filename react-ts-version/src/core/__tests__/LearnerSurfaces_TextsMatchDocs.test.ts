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

describe('the station names, and a lobby with no station card (PRD 14 §ב0, Module 6)', () => {
  const hub = code('presentation/pages/StudentHub.tsx');
  // The names live in one place since 27.9.2026 (register ט); the opening screens read them from there.
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
    });
  }

  it('the lobby shows only the waiting sentence or the opening screen: no station card, no description of its own', () => {
    // The station's name and goal are the opening screen's (core/stationOpening.ts),
    // in the PRD's own words; the lobby had descriptions no document gives.
    expect(hub).not.toContain('SESSIONS_CONFIG');
    expect(hub).not.toMatch(/desc: '/);
    expect(hub).not.toContain('stationTitleHe');
  });

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
});

describe('the lobby has no entry button — the page swaps to the opening screen (PRD Module 6)', () => {
  const hub = code('presentation/pages/StudentHub.tsx');

  it('no "התחל פעילות" / "היכנס לפעילות" button and no click handler that navigates', () => {
    expect(hub).not.toContain('התחל פעילות');
    expect(hub).not.toContain('היכנס לפעילות');
    expect(hub).not.toContain('handleStartActiveSession');
    expect(hub).not.toMatch(/<button[\s\S]*?onClick/);
  });

  it('an activated session swaps the page, without a reload, to the workspace and its opening screen', () => {
    expect(hub).toContain("const openingMeeting = activeClassSession.isLoaded && (recordLoaded || !normUid) && state.kind === 'opening' && !isAwaitingTeacherGate && !isProjectorModeActive");
    expect(hub).toMatch(/navigate\(`\/workspace\?meeting=\$\{openingMeeting\}`, \{ replace: true \}\);/);
    expect(hub).not.toContain('window.location');
  });

  it('every other state is the waiting sentence of lobbyState, in the teacher\'s gender', () => {
    expect(hub).toContain("lobbySentenceHe(state.sentence, teacherGender)");
    expect(hub).toContain('<UdlSpeechButton text={sentence}');
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
    expect(page).toContain('const hasBoard = sessionNumber !== 2 && sessionNumber !== 8;');
    expect(page).toMatch(/\{hasBoard \? \([\s\S]*?<PlaceValueBoard[\s\S]*?\) : \(/);
  });
});

describe('the early-finisher choice screen tells the truth (מסמך 03 §3.3–3.7)', () => {
  const screen = code('features/workspace/overlays/ReinforcementOrChallengeScreen.tsx');

  it('one challenge task, two review tasks — named "משימה" like every other task screen', () => {
    // Register 24(א) ("משימה N מתוך M", "משימת בחירה") and the one-name rule
    // (audit A5-F13, 4.10.2026); never first person plural (A5-F04 / A4-F11).
    // PRD 7 (l.286) / 14 §ג, word for word (v7.15): the badge says "תרגילים" —
    // the PRD's own text, so the one-name rule below excepts it.
    expect(screen).toContain("badge: 'סיימתם את שבעת התרגילים של התחנה!'");
    expect(screen).toContain("reinforcementTitle: 'חיזוק וחזרה על החומר'");
    expect(screen).toContain("challengeTitle: 'אתגר'");
    expect(screen).toContain("intro: 'המשימות הבאות הן בחירה שלכם, לא חובה.'");
    expect(screen).toContain("reinforcement: 'שתי משימות נוספות, לחזרה על הנושא של היום.'");
    expect(screen).toContain("challenge: 'משימת אתגר אחת, קשה יותר, בנושא של היום.'");
    const texts = screen.slice(screen.indexOf('const BRANCH_CHOICE_TEXT'), screen.indexOf('interface ReinforcementOrChallengeScreenProps'));
    expect(texts.replace('שבעת התרגילים של התחנה', '')).not.toContain('תרגיל');
    // PRD 14 §ג: "המילה "מסלול" אינה מופיעה במסך הבחירה".
    expect(texts.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')).not.toContain('מסלול');
    expect(texts).not.toContain('שתרגלנו');
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
