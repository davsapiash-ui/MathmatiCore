import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

  const TITLES: Record<number, string> = {
    1: 'תחנה 1: ארגז החול',
    2: 'תחנה 2: יוצאים למסע',
    3: 'תחנה 3: ערך המקום, פירוק והרכבה',
    4: 'תחנה 4: חיבור במאונך עם הקבצה',
    5: 'תחנה 5: חיסור במאונך עם פריטה',
    6: 'תחנה 6: אתגר האפס',
    7: 'תחנה 7: בעיות חקר בחיבור ובחיסור',
    8: 'תחנה 8: מפגש חוקר',
  };

  for (const [n, title] of Object.entries(TITLES)) {
    it(`meeting ${n}: "${title}"`, () => {
      expect(hub).toContain(`title: '${title}'`);
    });
  }

  it('none of the old names that described no meeting is left', () => {
    for (const old of ['מחקר אישי', 'פריטה וקיבוץ', 'תכנון ניסויים', 'מחקר מתקדם', 'אתגרי חיבור וחיסור', 'סיכום ותובנות']) {
      expect(hub, old).not.toContain(old);
    }
  });

  it('the descriptions speak to the class, never to one child in the singular', () => {
    const descs = [...hub.matchAll(/desc: '([^']*)'/g)].map((m) => m[1]);
    expect(descs).toHaveLength(8);
    for (const d of descs) {
      expect(d, d).not.toMatch(/שלך|עבורך|\bלך\b/);
    }
  });

  it('meeting 8 says the blocks and the board are gone; meeting 5 is subtraction', () => {
    expect(hub).toContain("desc: 'פתרו את התרגילים בנחת ובקצב שלכם, בלי לבנים ובלי לוח.'");
    expect(hub).toMatch(/title: 'תחנה 5: [^']*חיסור/);
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
    expect(hub).toMatch(/activeClassSession\.status === 'paused' && \([\s\S]*?המורה עצרה את הפעילות לרגע/);
    expect(hub).toContain('{activeSession.title}');
  });
});

describe('"הצג לוח" appears only in meetings that have a board', () => {
  const topbar = src('features/workspace/WorkspaceTopbar.tsx');
  const page = src('features/workspace/StudentWorkspacePage.tsx');

  it('the board toggle is gated on meetings 2 and 8, like the board itself', () => {
    const at = topbar.indexOf('onClick={toggleBoard}');
    expect(at).toBeGreaterThan(-1);
    const gate = topbar.slice(topbar.lastIndexOf('{sessionNumber', at), at);
    expect(gate).toContain('sessionNumber !== 2 && sessionNumber !== 8');
    expect(page).toMatch(/\{sessionNumber !== 2 && sessionNumber !== 8 && \(\s*<PlaceValueBoard/);
  });
});

describe('the early-finisher choice screen tells the truth (מסמך 03 §3.3–3.7)', () => {
  const screen = code('features/workspace/overlays/ReinforcementOrChallengeScreen.tsx');

  it('one challenge exercise, two review exercises', () => {
    expect(screen).toContain("reinforcement: 'שני תרגילים נוספים, לחזרה על מה שתרגלנו היום.'");
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
    expect(journey).toContain('שחזור מסך העבודה, ללא קול · מפגש {selectedSession}');
  });

  it('keeps the fallback message PRD 7.3 Module 21 §ה quotes word for word', () => {
    expect(journey).toContain('וידאו השחזור בהכנה');
  });
});
