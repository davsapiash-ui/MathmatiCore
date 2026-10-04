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
import { MEETING_FORMAL_HE, meetingFullLabelHe } from '@/core/meetingFormalNames';
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

  it('nor inside a longer text: every station name in code is built from the source', () => {
    // A name hidden inside a sentence ('מפגש 1 (ארגז החול והיכרות) הושלם.')
    // drifts just the same. Exercise titles may contain the words for their
    // own mathematics; only those, listed here, are allowed.
    const everything = filesUnder('.').filter((f) => f !== 'core/stationNames.ts');
    const EXERCISE_WORDS = ['חיסור במאונך עם פריטה דרך אפס בטור העשרות'];
    for (const n of MEETING_NUMBERS) {
      expect(hits(everything, new RegExp(STATION_NAMES_HE[n]), EXERCISE_WORDS), STATION_NAMES_HE[n]).toEqual([]);
    }
  });
});

describe('the teacher and the admin see the child’s station name next to each meeting', () => {
  it('the class controller: the open meeting in full, the picker in short form', () => {
    const dash = code('presentation/pages/TeacherDashboard.tsx');
    expect(dash).toMatch(/classSessionStatus === 'active' \|\| classSessionStatus === 'paused'\s*\?\s*meetingLabelHe\(selectedSessionNum\)/);
    expect(dash).toContain('{`${meetingShortLabelHe(row.sessionNumber)} — ${sessionStateLabelHe(row)}`}');
    expect(dash).not.toContain('פעיל בכיתה`');
  });

  it('the skills-mapping meeting buttons: the child’s name and the teacher’s formal information', () => {
    const dash = code('presentation/pages/TeacherDashboard.tsx');
    // "מפגש 2 · יוצאים למסע (מיפוי יסוד)": the formal information stays beside the name.
    expect(dash).toContain("{meetingShortLabelHe(num)}{num === 2 ? ' (מיפוי יסוד)' : ''}");
    expect(dash).toContain('title={meetingFullLabelHe(num)}');
    expect(meetingFullLabelHe(3)).toBe('מפגש 3 · אצל התלמידים: בונים מספרים בכמה דרכים — ערך המקום וגמישות ייצוגית');
  });

  it('the learner journey keeps a short formal description under the child’s name', () => {
    const journey = code('presentation/pages/TeacherDashboard/components/LearnerJourney.tsx');
    expect(journey).toContain('{MEETING_FORMAL_HE[n]}');
    expect(journey).toContain('title={meetingFullLabelHe(n)}');
    for (const n of MEETING_NUMBERS) expect(MEETING_FORMAL_HE[n].length).toBeGreaterThan(0);
  });

  it('section headings, toasts, bank labels, journey rows and the reset window name the station too', () => {
    const journey = code('presentation/pages/TeacherDashboard/components/LearnerJourney.tsx');
    for (const h of [
      'תרגילים ב{meetingShortLabelHe(selectedSession)}:',
      'דוח תובנות פדגוגיות · {meetingShortLabelHe(selectedSession)}',
      'ציר ההחלטות · {meetingShortLabelHe(selectedSession)}',
      'שחזור מסך העבודה, ללא קול · {meetingShortLabelHe(selectedSession)}',
    ]) {
      expect(journey, h).toContain(h);
    }
    expect(code('presentation/pages/TeacherDashboard.tsx')).toContain('מיפוי מיומנויות — {meetingShortLabelHe(diagnosticSelectedSession)}');
    expect(code('presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx')).toContain('התפלגות סיווגי הטעות · {meetingShortLabelHe(selectedStudent.sessionNumber)}');
    expect(code('presentation/pages/TeacherDashboard/components/SessionActivationModal.tsx')).toContain('המפגש הפעיל כעת, {meetingShortLabelHe(currentlyActive.sessionNumber)}, ייסגר');
    const store = code('application/useStore.ts');
    expect(store).toContain('${meetingShortLabelHe(sessionNumber)} אופס לכל הכיתה,');
    expect(store).toContain('const sessionLabel = resetSession ? meetingShortLabelHe(resetSession)');
    expect(code('core/catalogFreshness.ts')).toContain('${meetingShortLabelHe(Number(match[1]))}${path}');
    expect(code('infrastructure/services/LearnerJourneyService.ts')).toContain('meetingShortLabelHe(d.session_number)');
    const modal = code('presentation/pages/TeacherDashboard/components/ResetConfirmationModal.tsx');
    expect(modal).toContain("const meetingLabel = activeSessionNumber ? meetingLabelHe(activeSessionNumber) : '';");
    expect(modal).toContain('isLevel2 && !isFullStudent && activeSessionNumber ?');
  });

  it('the confirmation to open a meeting, the reset window and the class report', () => {
    expect(code('presentation/pages/TeacherDashboard/components/SessionActivationModal.tsx')).toContain('{meetingLabelHe(sessionNumber)}');
    expect(code('presentation/pages/TeacherDashboard/components/ResetConfirmationModal.tsx')).toContain('{meetingLabelHe(activeSessionNumber)}');
    expect(code('presentation/pages/TeacherDashboard/components/ClassMeetingReportPanel.tsx')).toContain('{meetingLabelHe(selectedSession)}');
  });

  it('the gate between meetings 2 and 3 names both stations, in every text and message', () => {
    const gate = [
      'presentation/pages/TeacherDashboard/ClassManagement.tsx',
      'presentation/pages/TeacherDashboard/components/TeacherApprovalGate.tsx',
      'presentation/pages/TeacherDashboard/components/TeacherGateApprovalDrawer.tsx',
      'core/teacherGate.ts',
    ];
    expect(hits(gate, /מפגש [23](?![0-9])/)).toEqual([]);
    for (const f of gate) expect(code(f), f).toMatch(/meetingShortLabelHe\([23]\)/);
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

/** Words the owner replaced on 27.9.2026: the board and the pieces have one name each. */
const OLD_BOARD_OR_PIECE = /לוח הדינס|לוח הלבנים|לוח לבני הדינס|לוח העבודה|לוח הפעילות|קנבס|בלוק|קוביות|קובייה|קוביה/;

/**
 * On the child's side there is no table and no "לוח בית המספרים": "טבלה" can
 * only mean the board, and the owner replaced "בלוח בית המספרים" with
 * "בבית המספרים" in every child text (27.9.2026). Staff screens do have real
 * tables, so this is checked on the child's files only.
 */
const CHILD_BOARD_WORDS = /טבלה|טבלת ערך המקום|לוח בית המספרים/;

/**
 * Child texts that still carry an old name, awaiting owner decision (Rule 3).
 * The owner ruled on the last one on 27.9.2026 (s7_r_challenge_1 now says
 * "בעזרת הלבנים בבית המספרים"); the list stays so that a new one is added
 * here, not silently — a NEW one anywhere else fails.
 */
const AWAITING_OWNER: string[] = [];

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
    // The coaching card's refusal list names the old words in order to refuse them.
    const REFUSAL_LIST = ["'קובי', 'בלוק', 'לוח הדינס', 'לוח הלבנים', 'קנבס',"];
    expect(hits(childFiles, OLD_BOARD_OR_PIECE, [...AWAITING_OWNER, ...REFUSAL_LIST])).toEqual([]);
  });

  it('no "טבלה" and no "לוח בית המספרים" on the child’s side: the board is "בית המספרים"', () => {
    expect(hits(childFiles, CHILD_BOARD_WORDS)).toEqual([]);
    expect(code('features/workspace/board/PlaceValueBoard.tsx')).toContain('aria-label="בית המספרים"');
    const palette = code('features/workspace/board/BlockPalette.tsx');
    expect(palette).toContain('לחצו או גררו ${PLACE_NAMES_HE[place]} לבית המספרים');
    expect(palette).not.toMatch(/לחץ או גרור/);
  });

  it('meeting 1 says "לבני יחידה" and, since 29.9.2026, not how many (the child finds 26)', () => {
    const text = SESSION1_TASKS.find((t) => t.id === 's1_r_group26')?.instructionHe;
    expect(text).toContain('בטור היחידות יש לבני יחידה.');
    expect(text).not.toMatch(/26/);
  });

  it('diagnostic task 5 keeps "25 לבני יחידה" in its data, for the teacher (the child sees only the picture)', () => {
    const t5 = DIAGNOSTIC_TASKS.find((t) => t.id === 'task5_units_to_tens')!;
    expect(t5.givenHe).toBe('25 לבני יחידה');
    // owner, 27.9.2026: the grouping is named (הקבצה) and the blocks are on the screen
    expect(t5.instructionHe).toContain('תקבצו לעשרות את הלבנים שעל המסך');
    expect(t5.backwardDiagnosis?.probeInstructionHe).toContain('תקבצו לעשרות את הלבנים שעל המסך');
  });

  it('the live cards count "לבנים" and tap "לבנת העשרת"', () => {
    const crowded = SocraticEngine.analyzeLiveBoardState({ id: 's4_r_t1', numberA: 146, numberB: 235 }, 'regrouping_fluency', { ...EMPTY_COUNTS, hundreds: 3, tens: 7, units: 14 })!;
    // "לבנים", and no count: stations 3–7 hide the column digits (owner, 30.9.2026).
    expect(crowded.questionHe).toContain('יש 10 לבנים או יותר');
    expect(crowded.choices.map((c) => c.textHe).join(' ')).toContain('מעבירים לבנה אחת בלבד');
    const deficit = SocraticEngine.analyzeLiveBoardState({ id: 'fixture_sub52', numberA: 52, numberB: 27, isSubtraction: true }, 'subtraction_regrouping', { ...EMPTY_COUNTS, tens: 5, units: 2 })!;
    // The right option's feedback opens with "נכון מאוד!" (owner, 30.9.2026).
    expect(deficit.choices[0].feedbackHe).toBe('נכון מאוד! לחצו על לבנת העשרת בבית המספרים כדי לפרוט אותה ל-10 יחידות.');
    for (const card of [crowded, deficit]) {
      const all = [card.questionHe, card.tts_text ?? '', ...card.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])].join(' ');
      expect(all).not.toMatch(OLD_BOARD_OR_PIECE);
    }
  });

  it('the board button and the lock notice name the board', () => {
    const topbar = code('features/workspace/WorkspaceTopbar.tsx');
    expect(topbar).toContain("staysOpen ? BOARD_OPEN_HE : boardOpen ? 'הסתרת בית המספרים' : 'הצגת בית המספרים'");
    expect(code('features/workspace/board/PlaceValueBoard.tsx')).toContain('בית המספרים נעול זמנית על ידי המורה');
  });

  it('a digit cell belongs to the result row, not to the board', () => {
    expect(code('features/workspace/overlays/HelpOverlays.tsx')).not.toContain('בכל משבצת בבית המספרים');
  });

  it('no radar on a child’s screen', () => {
    expect(hits(childFiles, /הרדאר|רדאר/)).toEqual([]);
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
    // Owner, 30.9.2026: the teacher reads "לבני הדינס"; the child keeps "לבנים" (register, decision ט).
    expect(report).toContain('ייצג את המספרים בבית המספרים באמצעות לבני הדינס של');
    for (const f of ['pedagogicalReport.ts', 'classReport.ts', 'reportHtml.ts', 'reportAnalysis.ts', 'meetingMetrics.ts']) {
      const text = stripComments(read(resolve(REPO, 'functions/src', f)));
      expect(text, f).not.toMatch(OLD_BOARD_OR_PIECE);
      expect(text, f).not.toMatch(/מסך הרפלקציה|מפת חום/);
    }
  });
});
