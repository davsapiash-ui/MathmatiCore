import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';
import {
  MEETING_NUMBERS,
  STATION_NAMES_HE,
  meetingLabelHe,
  meetingShortLabelHe,
  stationNameHe,
  stationTitleHe,
} from '@/core/stationNames';
import { buildSessionCatalog } from '@/presentation/pages/admin/AdminCurriculumView';
import * as JourneyService from '@/infrastructure/services/LearnerJourneyService';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { SESSION1_TASKS } from '@/data/sessionTasks';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { EMPTY_COUNTS } from '@/core/placeValue';

/**
 * Owner decision, 27.9.2026 (register, "החלטות בעל המוצר במקום שהאפיון שותק",
 * entry ט): the station names in the child's language, one name per component
 * ("בית המספרים", "לבנים", "לוח הרפלקציה", "הרדאר הפדגוגי השקט"), and the
 * teacher sees the child's station name next to every meeting.
 */

const SRC = resolve(__dirname, '../..');
const REPO = resolve(SRC, '../..');
const read = (abs: string) => readFileSync(abs, 'utf-8').replace(/\r\n/g, '\n');
const src = (p: string) => read(resolve(SRC, p));
/** The source without comments: comments may quote the old wording on purpose. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (p: string) => stripComments(src(p));

/** Every .ts/.tsx file under a directory of src, tests excluded. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    for (const name of readdirSync(abs)) {
      const full = join(abs, name);
      if (statSync(full).isDirectory()) {
        if (name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push(relative(SRC, full).replace(/\\/g, '/'));
      }
    }
  };
  walk(resolve(SRC, dir));
  return out;
}

/** "file: …context…" for every match of a pattern in a file's code. */
function hits(files: string[], pattern: RegExp, allow: string[] = []): string[] {
  const found: string[] = [];
  for (const f of files) {
    let text = code(f);
    for (const a of allow) text = text.split(a).join('');
    for (const m of text.matchAll(new RegExp(pattern.source, 'g'))) {
      const at = m.index ?? 0;
      found.push(`${f}: …${text.slice(Math.max(0, at - 30), at + 30).replace(/\s+/g, ' ')}…`);
    }
  }
  return found;
}

describe('one source for the station names', () => {
  it('the eight names the children see on the lobby card', () => {
    expect(STATION_NAMES_HE).toEqual({
      1: 'ארגז החול',
      2: 'יוצאים למסע',
      3: 'בונים מספרים בכמה דרכים',
      4: 'חיבור במאונך עם הקבצה',
      5: 'חיסור במאונך עם פריטה',
      6: 'אתגר האפס',
      7: 'בלשי המספרים',
      8: 'חוקרים בעצמנו',
    });
    expect(MEETING_NUMBERS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('the child reads "תחנה 7: …", the teacher "מפגש 7 · אצל התלמידים: …"', () => {
    expect(stationTitleHe(7)).toBe('תחנה 7: בלשי המספרים');
    expect(meetingLabelHe(7)).toBe('מפגש 7 · אצל התלמידים: בלשי המספרים');
    expect(meetingShortLabelHe(7)).toBe('מפגש 7 · בלשי המספרים');
    expect(meetingLabelHe(3)).toBe('מפגש 3 · אצל התלמידים: בונים מספרים בכמה דרכים');
    expect(meetingLabelHe(8)).toBe('מפגש 8 · אצל התלמידים: חוקרים בעצמנו');
    // outside 1–8 there is no station, only the number
    expect(meetingLabelHe(9)).toBe('מפגש 9');
    expect(stationNameHe(0)).toBeNull();
  });

  it('the lobby reads every title from it and spells none itself', () => {
    const hub = code('presentation/pages/StudentHub.tsx');
    for (const n of MEETING_NUMBERS) expect(hub).toContain(`title: stationTitleHe(${n}),`);
    expect(hub).not.toMatch(/title: '/);
  });

  it('no other source file spells a station name of its own', () => {
    const everything = filesUnder('.').filter((f) => f !== 'core/stationNames.ts');
    // A name as a whole string of its own. Exercise titles may contain the
    // words ("חיסור במאונך עם פריטה דרך אפס"); that is not a station name.
    for (const n of MEETING_NUMBERS) {
      const literal = new RegExp(`(['"\`])${STATION_NAMES_HE[n]}\\1`);
      expect(hits(everything, literal), STATION_NAMES_HE[n]).toEqual([]);
    }
  });
});

describe('the teacher and the admin see the child’s station name next to each meeting', () => {
  it('the class controller: the open meeting in full, the picker in short form', () => {
    const dash = code('presentation/pages/TeacherDashboard.tsx');
    expect(dash).toMatch(/classSessionStatus === 'active' \|\| classSessionStatus === 'paused'\s*\?\s*meetingLabelHe\(selectedSessionNum\)/);
    expect(dash).toContain("{`${meetingShortLabelHe(sessionNumber)} — ${state === 'active' ? 'פעיל כעת'");
    expect(dash).not.toContain('פעיל בכיתה`');
  });

  it('the skills-mapping meeting buttons', () => {
    const dash = code('presentation/pages/TeacherDashboard.tsx');
    expect(dash).toContain('{meetingShortLabelHe(num)}');
    expect(dash).toContain('title={meetingLabelHe(num)}');
    expect(dash).not.toContain('(מיפוי יסוד)');
  });

  it('the confirmation to open a meeting, the reset window and the class report', () => {
    expect(code('presentation/pages/TeacherDashboard/components/SessionActivationModal.tsx')).toContain('{meetingLabelHe(sessionNumber)}');
    expect(code('presentation/pages/TeacherDashboard/components/ResetConfirmationModal.tsx')).toContain('{meetingLabelHe(activeSessionNumber)}');
    expect(code('presentation/pages/TeacherDashboard/components/ClassMeetingReportPanel.tsx')).toContain('{meetingLabelHe(selectedSession)}');
  });

  it('the radar tiles and the learner detail', () => {
    const grid = code('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
    expect(grid).toContain('{meetingShortLabelHe(student.sessionNumber)}');
    expect(grid).toContain('אצל התלמידים: {stationNameHe(selectedStudent.sessionNumber)}');
  });

  it('the learner journey: every meeting tile says what the children call it', () => {
    const journey = code('presentation/pages/TeacherDashboard/components/LearnerJourney.tsx');
    expect(journey).toContain('אצל התלמידים:');
    expect(journey).toContain('{STATION_NAMES_HE[n]}');
    // the journey's own list of names is gone, and with it "תחנה שתיים: אבחון"
    expect('SESSION_NAMES_HE' in JourneyService).toBe(false);
    const service = code('infrastructure/services/LearnerJourneyService.ts');
    for (const old of ['תחנה שתיים: אבחון', 'ערך המקום ופירוק', 'האפס והמרה כפולה', 'חקר ואינטגרציה', 'מפגש חוקר מסכם']) {
      expect(service, old).not.toContain(old);
    }
  });

  it('the admin catalog: the child’s name first, the formal name after it', () => {
    const catalog = buildSessionCatalog();
    for (const item of catalog) {
      expect(item.sessionTitle.startsWith(`${meetingLabelHe(item.sessionId)} — `), item.sessionTitle).toBe(true);
    }
    expect(catalog.find((i) => i.sessionId === 7)?.sessionTitle).toBe('מפגש 7 · אצל התלמידים: בלשי המספרים — שיעור VRA אדפטיבי');
  });

  it('the admin overview', () => {
    const overview = code('presentation/pages/admin/AdminOverview.tsx');
    expect(overview).toContain('childName: stationNameHe(session)');
    expect(overview).toContain('אצל התלמידים: {stat.childName}');
  });
});

/** Words the owner replaced on 27.9.2026. */
const OLD_BOARD_OR_PIECE = /לוח הדינס|לוח הלבנים|קנבס|בלוק|קוביות|קובייה|קוביה/;

/**
 * Texts the tests lock word for word to the repository copy of מסמך 03
 * (Session1_IntegratedMeeting). An agent does not edit that document, so these
 * keep the old word until the owner syncs it (register ט, "נותר"; table of
 * required document fixes, row 19).
 */
const WAITS_FOR_DOC_SYNC = ['בטור היחידות יש 26 קוביות יחידה.'];

describe('the child reads "בית המספרים" and "לבנים"', () => {
  const childFiles = [
    ...filesUnder('features/workspace'),
    ...filesUnder('presentation/components/student'),
    'presentation/pages/StudentHub.tsx',
    'infrastructure/services/SocraticEngine.ts',
    'application/useWorkspaceStore.ts',
    ...filesUnder('data'),
    'core/QMatrix.ts',
    'core/session1Checklist.ts',
    'core/stationNames.ts',
  ];

  it('no "לוח הדינס", "לוח הלבנים", "קנבס", "בלוק" or "קובייה" in anything the child sees or hears', () => {
    expect(hits(childFiles, OLD_BOARD_OR_PIECE, WAITS_FOR_DOC_SYNC)).toEqual([]);
  });

  it('what is left is only what the copy of מסמך 03 still says, word for word', () => {
    const doc03 = read(resolve(REPO, 'מסמכי אפיון/מקור פדגוגי/03- אפיון מפורט לקראת פיתוח.md')).replace(/\\!/g, '!');
    for (const text of WAITS_FOR_DOC_SYNC) {
      expect(doc03, text).toContain(text);
      expect(SESSION1_TASKS.find((t) => t.id === 's1_r_group26')?.instructionHe).toContain(text);
    }
  });

  it('diagnostic task 5 shows "25 לבני יחידה"', () => {
    const t5 = DIAGNOSTIC_TASKS.find((t) => t.id === 'task5_units_to_tens')!;
    expect(t5.givenHe).toBe('25 לבני יחידה');
    expect(t5.instructionHe).toContain('תקבלו מהלבנים שעל המסך');
    expect(t5.backwardDiagnosis?.probeInstructionHe).toContain('תקבלו מהלבנים');
  });

  it('the live cards count "לבנים" and tap "לבנת העשרת"', () => {
    const crowded = SocraticEngine.analyzeLiveBoardState({ id: 's4_r_t1', numberA: 146, numberB: 235 }, 'regrouping_fluency', { ...EMPTY_COUNTS, hundreds: 3, tens: 7, units: 14 })!;
    expect(crowded.questionHe).toContain('14 לבנים');
    expect(crowded.choices.map((c) => c.textHe).join(' ')).toContain('נעביר לבנה אחת בלבד');
    const deficit = SocraticEngine.analyzeLiveBoardState({ id: 's5_r_t1', numberA: 52, numberB: 27, isSubtraction: true }, 'subtraction_regrouping', { ...EMPTY_COUNTS, tens: 5, units: 2 })!;
    expect(deficit.choices[0].feedbackHe).toBe('מעולה! לחצו על לבנת העשרת בלוח כדי לפרוט אותה ל-10 יחידות.');
    const zero = SocraticEngine.analyzeLiveBoardState({ id: 's6_r_t1', numberA: 305 }, 'zero_placeholder', { ...EMPTY_COUNTS, hundreds: 3, units: 5 })!;
    expect(zero.questionHe).toBe('כאשר אין לבנים בעמודת העשרות, איזה מספר נרשום בבית המספרים?');
    for (const card of [crowded, deficit, zero]) {
      const all = [card.questionHe, card.tts_text ?? '', ...card.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])].join(' ');
      expect(all).not.toMatch(OLD_BOARD_OR_PIECE);
    }
  });

  it('the board button and the lock notice name the board', () => {
    const topbar = code('features/workspace/WorkspaceTopbar.tsx');
    expect(topbar).toContain('{boardOpen ? "הסתר את בית המספרים" : "הצג את בית המספרים"}');
    expect(code('features/workspace/board/PlaceValueBoard.tsx')).toContain('בית המספרים נעול זמנית על ידי המורה');
  });

  it('a digit cell belongs to the result row, not to the board', () => {
    expect(code('features/workspace/overlays/HelpOverlays.tsx')).not.toContain('בכל משבצת בבית המספרים');
  });

  it('no radar on a child’s screen', () => {
    expect(hits(childFiles.filter((f) => f !== 'features/workspace/StudentWorkspacePage.tsx'), /הרדאר|רדאר/)).toEqual([]);
  });

  it('the AI that writes the coaching card is told the same names', () => {
    const contract = stripComments(read(resolve(REPO, 'functions/src/socraticContract.ts')));
    expect(contract).toContain('The blocks are "לבנים" ONLY');
    expect(contract).toContain('the board is "בית המספרים" ONLY');
    expect(contract).not.toContain('or "קוביות"');
    expect(contract).not.toContain('לבלוק');
  });
});

describe('the teacher and the admin read the same names', () => {
  const staffFiles = [
    'presentation/pages/TeacherDashboard.tsx',
    ...filesUnder('presentation/pages/TeacherDashboard'),
    ...filesUnder('presentation/pages/admin'),
    'presentation/pages/LandingPage.tsx',
    'presentation/components/RoleSelectionModal.tsx',
    'infrastructure/services/LearnerJourneyService.ts',
  ];

  it('the board is "בית המספרים", the pieces "לבנים", the meeting-8 board "לוח הרפלקציה", the 12 tiles "הרדאר הפדגוגי השקט"', () => {
    expect(hits(staffFiles, OLD_BOARD_OR_PIECE)).toEqual([]);
    expect(hits(staffFiles, /מסך הרפלקציה|מפת חום/)).toEqual([]);
  });

  it('the radar tab, the sidebar entry and the radar heading all say "הרדאר הפדגוגי השקט"', () => {
    const dash = code('presentation/pages/TeacherDashboard.tsx');
    expect(dash.split('הרדאר הפדגוגי השקט').length - 1).toBeGreaterThanOrEqual(3);
    expect(code('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx')).toContain('<span>הרדאר הפדגוגי השקט</span>');
  });

  it('the learner report names the board and the pieces the same way', () => {
    const report = stripComments(read(resolve(REPO, 'functions/src/pedagogicalReport.ts')));
    expect(report).toContain('ייצג את המספרים בבית המספרים באמצעות לבנים של');
    for (const f of ['pedagogicalReport.ts', 'classReport.ts', 'reportHtml.ts', 'reportAnalysis.ts', 'meetingMetrics.ts']) {
      const text = stripComments(read(resolve(REPO, 'functions/src', f)));
      expect(text, f).not.toMatch(OLD_BOARD_OR_PIECE);
      expect(text, f).not.toMatch(/מסך הרפלקציה|מפת חום/);
    }
  });
});
