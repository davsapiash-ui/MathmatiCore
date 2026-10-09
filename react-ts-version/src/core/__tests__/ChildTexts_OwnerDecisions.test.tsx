/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

// The real button is tested in TTSNarrationButton.test.tsx; here only the text it is given.
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { taskPositionLabelHe, TASK_LABEL_HE } from '@/core/taskPositionLabel';
import { StationOpening } from '@/features/workspace/StationOpening';
import {
  STATION2_OPENING_HE,
  STATION8_OPENING_HE,
  STATION_START_HE,
  hasOpeningScreen,
  stationOpeningHe,
} from '@/core/stationOpening';
const PRD_FILE = resolve(__dirname, '../../../../מסמכי אפיון/07- 3.MathematiCore_PRD_v07 הסופי.md');
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import {
  getHardcodedCatalogBanks,
  SESSION1_TASKS,
  SOCRATIC_HINTS,
  getDynamicSocraticHint,
} from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { tenBlocksHint } from '@/infrastructure/services/staticSocraticCards';

/**
 * Owner decisions, 27.9.2026 (register, approved deviation 24): what the child
 * reads inside the workspace.
 *  1. No exercise title: "משימה N מתוך M" above the instruction.
 *  2. Station 2 opens with one sentence, its read-aloud button and "מתחילים", once.
 *  3. "תחנה N", never "מפגש N".
 *  5. The coaching-card texts the owner rewrote.
 * And no educator word reaches the child (register ט).
 */

const SRC = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf-8').replace(/\r\n/g, '\n');
const stripComments = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (p: string) => stripComments(read(p));

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

afterEach(cleanup);

describe('1 — the child reads where it is, not the exercise title', () => {
  it('"משימה N מתוך M" for a compulsory exercise, a plain label otherwise', () => {
    expect(taskPositionLabelHe({ sessionNumber: 4, position: 3, total: 7 })).toBe('משימה 3 מתוך 7');
    expect(taskPositionLabelHe({ sessionNumber: 2, position: 7, total: 7 })).toBe('משימה 7 מתוך 7');
    expect(taskPositionLabelHe({ sessionNumber: 5, isChoice: true, position: null, total: 7 })).toBe('משימת בחירה');
    expect(taskPositionLabelHe({ sessionNumber: 2, isCorrection: true, position: 4, total: 7 })).toBe('משימה חוזרת');
    // PRD Module 14 §ב: meeting 1 has no numbered compulsory tasks.
    expect(taskPositionLabelHe({ sessionNumber: 1, position: 3, total: 10 })).toBe('משימת היכרות');
    expect(Object.values(TASK_LABEL_HE).join(' ')).not.toMatch(/אבחון|הערכה|רפלקציה|אינטגרציה|צד/);
  });

  it('the task card never renders a title', () => {
    const card = code('features/workspace/tasks/TaskCard.tsx');
    expect(card).not.toMatch(/titleHe/);
    expect(card).toContain('{positionLabel}');
    expect(card).not.toContain('משימת צד');
  });

  describe('rendered', () => {
    const STUDENT = 'student_user6';
    beforeEach(() => {
      useAuthStore.setState({ user: { uid: STUDENT, name: 'user6' } as any, role: 'student', isAuthenticated: true });
      useStore.setState({ students: { [STUDENT]: { pedagogicalPath: 'green_path' } } as any });
      useWorkspaceStore.getState().resetWorkspace();
    });

    // Owner, 8.10.2026: the heading line is the position and the learner's topic
    // ("משימה 1 מתוך 7: קוראים וכותבים מספרים" — owner, 9.10.2026: a general topic);
    // the teacher's exercise title is still nowhere.
    it('meeting 3, first exercise: "משימה 1 מתוך 7: <topic>", and its title is nowhere', async () => {
      const { TaskCard } = await import('@/features/workspace/tasks/TaskCard');
      useWorkspaceStore.getState().initSession(3, false);
      const { container } = render(<TaskCard />);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('משימה 1 מתוך 7: קוראים וכותבים מספרים');
      const title = (useWorkspaceStore.getState().dynamicTasks ?? [])[0]?.titleHe
        ?? getHardcodedCatalogBanks().find((b: any) => b.id === 'session_3_green_path')?.tasks[0]?.titleHe;
      expect(title).toBeTruthy();
      expect(container.textContent).not.toContain(title as string);
      expect(container.textContent).toContain('תחנה 3');
      expect(container.textContent).not.toContain('מפגש 3');
    });

    it('meeting 2: "משימה 1 מתוך 7", not the diagnostic task’s title', async () => {
      const { TaskCard } = await import('@/features/workspace/tasks/TaskCard');
      useWorkspaceStore.getState().initSession(2, false);
      const { container } = render(<TaskCard />);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(`משימה 1 מתוך ${DIAGNOSTIC_TASKS.length}`);
      expect(container.textContent).not.toContain(DIAGNOSTIC_TASKS[0].titleHe);
    });
  });
});

describe('2 — every station opens with one quiet screen, once (PRD Module 14 §ב)', () => {
  it('the eight texts, word for word as the PRD writes them', () => {
    expect(STATION2_OPENING_HE).toBe('שלום. התחילו ב"תחנה 2: יוצאים למסע". אין לחץ. עבדו בקצב שלכם.');
    expect(STATION8_OPENING_HE).toBe('שלום מתמטיקאים! היום הגענו לתחנה 8: חוקרים בעצמנו. פתרו את התרגילים בנחת ובקצב שלכם, בדיוק כמו שתרגלתם בתחנות הקודמות. בהצלחה!');
    const prd = readFileSync(PRD_FILE, 'utf8');
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const text = stationOpeningHe(n);
      expect(text, `station ${n}`).not.toBeNull();
      expect(prd, `station ${n}: the PRD's own words`).toContain(`תחנה ${n}: "${text}"`);
      expect(text).not.toMatch(/[%]|ציון|אבחון|מבחן/);
    }
    expect([1, 2, 3, 4, 5, 6, 7, 8].filter(hasOpeningScreen)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(stationOpeningHe(0)).toBeNull();
    expect(stationOpeningHe(9)).toBeNull();
  });

  for (const meeting of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    it(`station ${meeting}: exactly the text, its read-aloud button and "מתחילים" — nothing else`, () => {
      const text = stationOpeningHe(meeting)!;
      const onStart = vi.fn();
      const { container } = render(<StationOpening meeting={meeting} onStart={onStart} />);
      expect(container.textContent).toBe(`${text}${STATION_START_HE}`);
      expect(screen.getByTestId('speech').getAttribute('data-text')).toBe(text);
      const buttons = screen.getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual(['מתחילים']);
      expect(onStart).not.toHaveBeenCalled();
      fireEvent.click(buttons[0]);
      expect(onStart).toHaveBeenCalledTimes(1);
      cleanup();
    });
  }

  it('outside 1–8 it renders nothing', () => {
    const { container } = render(<StationOpening meeting={9} onStart={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('a fresh meeting shows it; "מתחילים" ends it; a reload does not bring it back', () => {
    for (const n of [1, 2, 4, 8] as const) {
      useWorkspaceStore.getState().resetWorkspace();
      useWorkspaceStore.getState().initSession(n, false);
      expect(useWorkspaceStore.getState().openingScreenSeen, `meeting ${n}`).toBe(false);
      useWorkspaceStore.getState().markOpeningScreenSeen();
      expect(useWorkspaceStore.getState().openingScreenSeen).toBe(true);
      useWorkspaceStore.getState().restoreSession({ sessionNumber: n, flowStatus: 'task', openingScreenSeen: true });
      expect(useWorkspaceStore.getState().openingScreenSeen).toBe(true);
      // Reloaded before pressing "מתחילים": it is still there.
      useWorkspaceStore.getState().restoreSession({ sessionNumber: n, flowStatus: 'task', openingScreenSeen: false });
      expect(useWorkspaceStore.getState().openingScreenSeen).toBe(false);
      // A meeting saved before the screen existed is already under way.
      useWorkspaceStore.getState().restoreSession({ sessionNumber: n, flowStatus: 'task' });
      expect(useWorkspaceStore.getState().openingScreenSeen).toBe(true);
    }
    const sync = read('infrastructure/services/FirebaseSyncService.ts');
    expect(sync).toContain('openingScreenSeen: state.openingScreenSeen,');
  });

  it('B1: a copy saved mid-meeting with openingScreenSeen: false (before every station had the screen) does not reopen it', () => {
    const ws = () => useWorkspaceStore.getState();
    ws().resetWorkspace();
    // Meeting 4, task 4, saved by the code before this deploy (initSession wrote false).
    ws().restoreSession({ sessionNumber: 4, flowStatus: 'task', openingScreenSeen: false, standardTaskIdx: 3 });
    expect(ws().openingScreenSeen).toBe(true);
    ws().restoreSession({ sessionNumber: 4, flowStatus: 'task', openingScreenSeen: false, standardTaskIdx: 0, hasInteracted: true });
    expect(ws().openingScreenSeen).toBe(true);
    ws().restoreSession({ sessionNumber: 4, flowStatus: 'choice_branch', openingScreenSeen: false });
    expect(ws().openingScreenSeen).toBe(true);
    ws().restoreSession({ sessionNumber: 1, flowStatus: 'sessionDone', openingScreenSeen: false });
    expect(ws().openingScreenSeen).toBe(true);
    // Nothing done yet: the opening screen is still owed.
    ws().restoreSession({ sessionNumber: 4, flowStatus: 'task', openingScreenSeen: false, standardTaskIdx: 0, hasInteracted: false });
    expect(ws().openingScreenSeen).toBe(false);
  });

  it('S6: "מתחילים" starts task 1\'s clock', () => {
    const ws = () => useWorkspaceStore.getState();
    ws().resetWorkspace();
    ws().initSession(4, false);
    useWorkspaceStore.setState({ taskStartTime: 1 });
    const before = Date.now();
    ws().markOpeningScreenSeen();
    expect(ws().taskStartTime).toBeGreaterThanOrEqual(before);
  });

  it('the page shows it before the first task of every station, and measures no hesitation on it', () => {
    const page = code('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain("if (hasOpeningScreen(sessionNumber) && meeting === sessionNumber && endScreen === 'task' && !openingScreenSeen) {");
    expect(page).toContain('<StationOpening meeting={sessionNumber} onStart={markOpeningScreenSeen} />');
    expect(page).toContain("(hasOpeningScreen(sessionNumber) && flowStatus === 'task' && !openingScreenSeen) ||");
  });
});

describe('3 — "תחנה N" inside the workspace, never "מפגש N"', () => {
  it('the card badge, the end screen and the switch screen; no end toast', () => {
    // The station tag of the task zone (design-task-zone, 8.10.2026: no ✦ glyph).
    expect(code('features/workspace/tasks/TaskZone.tsx')).toContain('תחנה {stationNumber}');
    const page = code('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain("['סיימתם את תחנה 1!', savedLine");
    expect(page).toContain("['סיימתם את תחנה 8, התחנה האחרונה!', savedLine]");
    expect(page).toContain('עוברים לתחנה {activeClassSession?.sessionNumber}...');
    const store = code('application/useWorkspaceStore.ts');
    // No end toast at all (review S11, 9.10.2026): it was not PRD text.
    expect(store).not.toMatch(/הוּשְׁלְמָה בְּהַצְלָחָה/);
  });

  it('no meeting number anywhere the child reads (the radar\'s lastAction lines are the teacher\'s)', () => {
    const files = [...filesUnder('features/workspace'), ...filesUnder('presentation/components/student'), 'presentation/pages/StudentHub.tsx', 'application/useWorkspaceStore.ts'];
    const found: string[] = [];
    for (const f of files) {
      for (const line of code(f).split('\n')) {
        if (/lastAction/.test(line)) continue;
        if (/מפגש \{|מפגש \$\{|מִפְגָּשׁ/.test(line)) found.push(`${f}: ${line.trim()}`);
      }
    }
    expect(found).toEqual([]);
  });
});

describe('5 — the coaching-card texts the owner rewrote', () => {
  const engine = code('infrastructure/services/SocraticEngine.ts');

  it('the carried digit is written in the memory circle, never a "שארית" and never an "המרה" (owner, 9.10.2026)', () => {
    expect(engine).toContain('tts_text: "עבדו טור אחר טור, מימין לשמאל. רשמו בעיגול הזיכרון כל 1 שעובר לטור הבא."');
    expect(engine).toContain('textHe: "מתחילים מהיחידות, עוברים לעשרות ואחר כך למאות"');
    // The list of terms a card may not use names it — and only that list.
    expect(engine.replace(/export const FORBIDDEN_TERMS_HE = \[[\s\S]*?\];/, '')).not.toMatch(/שארית|שאריות/);
    expect(code('data/sessionTasks.ts')).not.toMatch(/שארית|שאריות/);
  });

  it('the memory-circle hint names the action of the exercise: grouping in addition, breaking in subtraction (owner, 9.10.2026)', () => {
    const counts = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
    expect(getDynamicSocraticHint('procedural_fluency', counts, { numberA: 146, numberB: 235 }, { units: '1' }, {}))
      .toBe('רשמתם ספרה בתשובה. האם קיבצתם 10 לבנים? אם כן, איפה רושמים את ה־1 בראש התרגיל כדי לא לשכוח?');
    expect(getDynamicSocraticHint('procedural_fluency', counts, { numberA: 52, numberB: 27, isSubtraction: true }, { units: '5' }, {}))
      .toBe('רשמתם ספרה בתשובה. האם פרטתם לבנה? אם כן, איפה רושמים את זה בראש התרגיל כדי לא לשכוח?');
  });

  it('the missing addend and the missing subtrahend, in correct Hebrew and correct mathematics', () => {
    // Owner, 9.10.2026: the learner's words — "המספר החסר", "התוצאה" — never "מחובר" (PRD Module 13 §א, k ops).
    expect(engine).toContain('tts_text: "שני המספרים יחד נותנים את התוצאה. אם חסר מספר, מחסרים מהתוצאה את המספר הידוע."');
    expect(engine).toContain('questionHe: "איך מוצאים את המספר החסר בתרגיל חיבור?"');
    expect(engine).toContain('textHe: "מהתוצאה מחסרים את המספר הידוע, ומקבלים את המספר החסר"');
    // PRD 7.4 Module 13 §א: the card "המספר שחיסרנו", in the PRD's own words.
    expect(engine).toContain('questionHe: "איך מוצאים את המספר שחיסרנו?"');
    expect(engine).toContain('textHe: "מהמספר שממנו מחסרים מורידים את התוצאה, ומקבלים את המספר שחיסרנו"');
    expect(engine).not.toContain('המספר שמחסרים"');
    expect(engine).not.toMatch(/מחוברים חסר|מחוברים ידוע|תוצאה - מה שנשאר/);
  });

  it('a column can hold more than nine blocks while the child works — only the written digit is at most 9', () => {
    // Since 30.9.2026 a wrong option's hint is a guiding question (owner): "10
    // hundred blocks are worth which block?" in place of the rule stated outright.
    expect(engine).toContain("feedbackHe: tenBlocksHint('hundreds')");
    expect(tenBlocksHint('hundreds')).toBe('רמז: 10 לבני מאה שוות לאיזו לבנה?');
    expect(engine).not.toContain('כל טור יכול להכיל לכל היותר 9');
  });
});

describe('no educator word reaches the child (register ט)', () => {
  /** Words of the staff room, not of a grade-3 child. */
  const EDUCATOR_HE = /אינטגרציה|אבחון|הערכה|רפלקציה|וירטואלי|מניפולציה|המערכת|אוטונומיה|מסכם|מסכמ|פתוחה למחצה|לומד דמיוני|מונחה|שימור כמות|ייצוג מינימלי|ייצוג סמלי|סוקרטי|רדאר|פדגוג|קוגניטיב/;
  /** Latin terms, checked in the Hebrew texts only (identifiers such as submitSRLReflection are code). */
  const EDUCATOR_LATIN = /\b(VRA|SRL|Q-Matrix)\b/;

  /**
   * Awaiting owner decision (Rule 3; listed in owner_items.json of 27.9.2026).
   * Each stays until the owner rules on it. A NEW educator word anywhere fails.
   */
  // The owner ruled on all of them on 27.9.2026; the list stays so that a new one is added here, not silently.
  const AWAITING_OWNER: string[] = [];
  const withoutAllowed = (s: string) => AWAITING_OWNER.reduce((t, a) => t.split(a).join(''), s);

  function hebrewStrings(text: string): string[] {
    return [...text.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? '')
      .filter((s) => /[א-ת]/.test(s));
  }

  it('in every screen, overlay and card of the child', () => {
    const files = [
      ...filesUnder('features/workspace'),
      ...filesUnder('presentation/components/student'),
      'presentation/pages/StudentHub.tsx',
      'infrastructure/services/SocraticEngine.ts',
      'core/session1Checklist.ts',
      'core/stationNames.ts',
      'core/taskPositionLabel.ts',
      'core/persistenceEncouragement.ts',
      'core/stationOpening.ts',
    ];
    const found: string[] = [];
    for (const f of files) {
      const text = withoutAllowed(code(f));
      for (const m of text.matchAll(new RegExp(EDUCATOR_HE.source, 'g'))) {
        const at = m.index ?? 0;
        found.push(`${f}: …${text.slice(Math.max(0, at - 30), at + 30).replace(/\s+/g, ' ')}…`);
      }
      for (const s of hebrewStrings(text)) if (EDUCATOR_LATIN.test(s)) found.push(`${f}: ${s}`);
    }
    expect(found).toEqual([]);
  });

  it('in every exercise text the child reads (the titles are the teacher’s and are not shown)', () => {
    const tasks: any[] = [
      ...getHardcodedCatalogBanks().flatMap((b: any) => b.tasks ?? []),
      ...SESSION1_TASKS,
      ...[3, 4, 5, 6, 7, 8].flatMap((n) =>
        (['reinforcement', 'challenge'] as const).flatMap((br) =>
          (['green_path', 'remediation_path'] as const).flatMap((p) => getSessionBranchTasks(n, br, p))
        )
      ),
      ...DIAGNOSTIC_TASKS,
    ];
    const found: string[] = [];
    for (const t of tasks) {
      const { titleHe: _title, ...shown } = t;
      const text = withoutAllowed(JSON.stringify(shown));
      if (EDUCATOR_HE.test(text) || EDUCATOR_LATIN.test(text)) found.push(`${t.id}: ${text.slice(0, 160)}`);
    }
    const hints = withoutAllowed(Object.values(SOCRATIC_HINTS).join(' '));
    if (EDUCATOR_HE.test(hints)) found.push(`SOCRATIC_HINTS: ${hints}`);
    expect(found).toEqual([]);
  });

  it('every text still waiting for the owner is really there, and the ones he ruled on are gone', () => {
    const all = [
      read('data/sessionTasks.ts'),
      read('data/sessionBranchTasks.ts'),
      read('infrastructure/services/SocraticEngine.ts'),
    ].join('\n');
    for (const a of AWAITING_OWNER) expect(all, a).toContain(a);
    for (const gone of ['הכרות עם המערכת שלנו', 'האוטונומיה היא שלכם', 'משימת יעד מסכמת: ', 'מניפולציה בלבני הדינס', 'נמתין שהמערכת']) expect(all, gone).not.toContain(gone);
  });
});

describe('the child is addressed in the plural (gender-equal writing, 27.9.2026)', () => {
  // The grouping button is "קבצו 10" (owner, 30.9.2026). The chat's call button is
  // "קראו למורה" (owner, 1.10.2026).
  const files = [
    ...filesUnder('features/workspace'),
    ...filesUnder('presentation/components/student'),
    'presentation/pages/StudentHub.tsx',
    'presentation/pages/Login.tsx',
    'presentation/design-system/UdlSpeechButton.tsx',
    'application/useWorkspaceStore.ts',
  ];
  const SINGULAR = /(^|[>"'`( ])(הקרא|קבץ|בטל|סגור|כתוב|הצג|הסתר|המשך|בחר|גרור|הקלד|בדוק|נסה|פתח|הוסף|שמור|שלח|הזן|התחל|חזור)([ .,!:<"'`)?]|$)|(?<![א-ת])(שלך|עבורך|לך|אתה|זקוק)(?![א-ת])|אני צריך/;

  it('no singular instruction, label, placeholder or "שלך" on a child screen', () => {
    const found: string[] = [];
    for (const f of files) {
      for (const line of code(f).split('\n')) {
        if (/lastAction|last_alert/.test(line)) continue; // the radar's lines are the teacher's
        if (SINGULAR.test(line)) found.push(`${f}: ${line.trim()}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('the read-aloud button, undo, the chat and the help card', () => {
    expect(code('presentation/design-system/UdlSpeechButton.tsx')).toContain('aria-label="הקראה בקול"');
    expect(code('features/workspace/WorkspaceTopbar.tsx')).toContain('aria-label="ביטול הפעולה האחרונה"');
    const chat = code('features/workspace/overlays/StudentChatOverlay.tsx');
    // Free text both ways (owner, 1.10.2026 evening), plus two ready messages.
    expect(chat).toContain('placeholder="כתבו הודעה למורה..."');
    expect(chat).toContain('כתבו הודעה למורה, או לחצו על "קראו למורה".');
    expect(chat).toContain("const CALL_BANNER_HE = 'צריכים עזרה עכשיו?';");
    expect(chat).toContain('<span>קראו למורה 🔔</span>');
    expect(code('features/workspace/overlays/HelpOverlays.tsx')).toContain("'הבנתי, סגירת החלונית'");
  });
});
