/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { WorkspaceTopbar } from '@/features/workspace/WorkspaceTopbar';
import { TaskCard } from '@/features/workspace/tasks/TaskCard';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { SESSION1_TASKS, getSessionTasks } from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';
import { LOGOUT_HE, PROCEED_HE, studentBadgeHe } from '@/core/toolbarNames';
import { TEACHER_SENTENCES_HE } from '@/core/teacherGender';
import { PlaceValueBoard } from '@/features/workspace/board/PlaceValueBoard';

/**
 * The spec-vs-software report of 28.9.2026 (branch claude/spec-vs-software-report),
 * the rows the owner approved for this pull request. Each test names its row.
 */

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const ws = () => useWorkspaceStore.getState();

beforeEach(() => {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user12', student_id: 12, role: 'student' }, role: 'student' } as any);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const topbar = () =>
  render(
    <MemoryRouter>
      <WorkspaceTopbar />
    </MemoryRouter>
  );

describe('the toolbar speaks to the class in neutral words (owner, 28.9.2026)', () => {
  it('"ממשיכים", "יציאה" and "מספר תלמיד: 12" — no masculine singular', () => {
    ws().initSession(3, false, 0);
    topbar();
    expect(PROCEED_HE).toBe('ממשיכים');
    expect(LOGOUT_HE).toBe('יציאה');
    // Owner, 28.9.2026: "תלמיד:" before the number; only the number changes, 1–12.
    expect(studentBadgeHe(12)).toBe('מספר תלמיד: 12');
    expect(studentBadgeHe(1)).toBe('מספר תלמיד: 1');
    const nav = document.querySelector('nav')!;
    expect(screen.getByTestId('proceed-button').textContent).toBe('ממשיכים');
    expect(screen.getByTestId('student-badge').textContent).toContain('מספר תלמיד: 12');
    expect(nav.textContent).toContain('יציאה');
    for (const old of ['התקדם', 'התנתק', 'תלמיד 12', 'מתנתק']) expect(nav.textContent).not.toContain(old);
    for (const el of nav.querySelectorAll('[aria-label],[title]')) {
      const said = `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`;
      expect(said).not.toMatch(/התקדם|התנתק|תלמיד 12/);
    }
  });

  it('the lobby badge and every sentence that names the button use the same names', () => {
    expect(src('presentation/components/layout/Topbar.tsx')).toContain("user?.role === 'student' ? studentBadgeHe(");
    expect(src('presentation/components/ui/LogoutButton.tsx')).not.toMatch(/"התנתק|"מתנתק/);
    const store = src('application/useWorkspaceStore.ts');
    expect(store).not.toMatch(/לַחֲצוּ "הִתְקַדֵּם"|לחצו "התקדם"|כפתור התקדם/);
    expect(store).toContain('ואז לחצו על "${PROCEED_HE}"');
  });
});

describe('rows 1.30, 2.11, 3.18 — every toolbar button fits a 1024 px screen', () => {
  it('the button row does not scroll sideways (a hidden scroll is how the proceed button vanished)', () => {
    const bar = src('features/workspace/WorkspaceTopbar.tsx');
    const row = bar.slice(bar.indexOf('id="tour-action-buttons"'), bar.indexOf('>', bar.indexOf('id="tour-action-buttons"')));
    expect(row).not.toContain('overflow-x-auto');
    expect(row).not.toContain('no-scrollbar');
    expect(row).toContain('shrink-0');
  });

  it('the bar is fluid by width, with no step; the logo follows the bar\'s own width; every button keeps its words', () => {
    const bar = src('features/workspace/WorkspaceTopbar.tsx');
    expect(bar).not.toMatch(/\b(xl|lg):(px|gap|hidden|inline)/);
    expect(bar).toContain('<span className="ws-topbar-wide"><Logo size="md" subtitle="מרחב חקר אישי" /></span>');
    expect(bar).toContain('<span className="ws-topbar-narrow"><Logo size="md" showText={false} /></span>');
    expect(src('index.css')).toMatch(/\.ws-topbar \{\s*container-type: inline-size;/);
    expect(src('index.css')).toContain('@container (min-width: 1240px)');
    expect(src('features/workspace/ProgressDots.tsx')).not.toContain('xl:');
    expect(bar).not.toContain('sr-only xl:not-sr-only');
    ws().initSession(4, false, 0);
    topbar();
    const exit = [...document.querySelectorAll('nav button')].find((b) => b.getAttribute('aria-label') === 'יציאה מהמערכת')!;
    expect(exit.getAttribute('title')).toBe('יציאה');
    expect(exit.textContent).toBe('יציאה');
    expect(exit.querySelector('span')!.className).not.toContain('sr-only');
    const badge = screen.getByTestId('student-badge').querySelector('span')!;
    expect(badge.textContent?.trim()).toBe('מספר תלמיד: 12');
    expect(badge.className).not.toContain('sr-only');
  });

  it('the proceed button is announced by the name it shows', () => {
    ws().initSession(3, false, 0);
    topbar();
    const b = screen.getByTestId('proceed-button');
    expect(b.hasAttribute('aria-label')).toBe(false);
    expect(b.textContent).toBe('ממשיכים');
    expect(b.getAttribute('title')).toBe('ממשיכים');
  });
});

describe('the column\'s digit sits beside its name, not over it (seen on screen at 1024 px, four columns)', () => {
  it('in the header flow, not pinned to the corner', () => {
    const col = src('features/workspace/board/PlaceColumn.tsx');
    // The header wraps, so in the narrowest column the digit goes under the name.
    expect(col).toContain('className="relative flex flex-wrap items-center justify-center');
    expect(col).not.toContain('absolute left-3');
  });
});

describe('row 1.15 — the feedback covers neither the board nor the coaching card', () => {
  for (const meeting of [1, 3, 4, 7] as const) {
    it(`meeting ${meeting}: the feedback sits in the task card, over its heading, not floating over the page`, () => {
      vi.useFakeTimers();
      ws().initSession(meeting, false, meeting === 1 ? SESSION1_TASKS.findIndex((t) => t.id === 's1_t8') : 0);
      render(<TaskCard />);
      act(() => {
        ws().showFeedback({ correct: false, title: 'בּוֹאוּ נְקַבֵּץ 🧱', sub: 'בדיקה' }, 3000);
      });
      const toast = screen.getByTestId('feedback-toast');
      expect(toast.getAttribute('data-placement')).toBe('inline');
      expect(toast.className).not.toContain('fixed');
      // Out of the flow, just under the position label (UX-004; review of #238): the
      // label stays visible and the result row is never pushed out of the card.
      expect(toast.className).toContain('absolute inset-x-3');
      expect(toast.style.top).not.toBe('');
      const card = document.getElementById('tour-task-card')!;
      expect(card.contains(toast)).toBe(true);
      // it comes before the column in the DOM, not under the exercise
      expect(toast.compareDocumentPosition(screen.getByTestId('task-column')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  }

  it('the page mounts the floating bubble only in meetings 2 and 8, which have no board', () => {
    expect(src('features/workspace/StudentWorkspacePage.tsx')).toContain('{(sessionNumber === 2 || sessionNumber === 8) && <FeedbackToast />}');
  });
});

describe('row 1.28 (and audit A5-F07 / UX-001 / UX-002, 4.10.2026) — the addition grid never covers the card, the board, the tray or the trash', () => {
  it('the grid and its tab are in the workspace row, not pinned over the screen', () => {
    const grid = src('features/workspace/board/AdaptiveAdditionGrid.tsx');
    expect(grid).not.toMatch(/(?<![-\w])fixed(?![-\w])/);
    expect(grid).not.toMatch(/bottom-6|left-6/);
    expect(existsSync(resolve(__dirname, '../../features/workspace/board/useLeftClearOfSidePanel.ts'))).toBe(false);
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    const row = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
    expect(row).toContain('<AdaptiveAdditionGrid key="adaptive-grid"');
    expect(row).toContain('<AdditionGridTab />');
    // the grid's slot is beside the board, in the representations zone (PRD 7 §א; Module 10)
    const zone = row.slice(row.indexOf('data-testid="representations-zone"'));
    expect(zone).toContain('<AdaptiveAdditionGrid key="adaptive-grid"');
    expect(zone).toContain('<AdditionGridTab />');
  });

  // The grid and the coaching card are never shown together; what each does
  // while the other is shown is tested on the rendered page, in
  // OwnerDecision_2026_10_04_GridAndCardTabs.test.tsx.

  it('the grid has one name', () => {
    const grid = src('features/workspace/board/AdaptiveAdditionGrid.tsx');
    expect(grid).not.toMatch(/לוח עזר|תמיכה אדפטיבית/);
    expect(src('features/workspace/StudentWorkspacePage.tsx')).not.toMatch(/<span>לוח חיבור<\/span>/);
  });
});

describe('row 3.20 (owner, 28.9.2026) — no "בנו בלוח בדיוק / בלוח כרגע" box, and no "בניתי את" sum in any meeting', () => {
  it('the box is gone from every representation exercise', () => {
    const rep = src('features/workspace/tasks/RepresentationTask.tsx');
    expect(rep).not.toContain('describeCountsHe');
    for (const gone of ['בנו בלוח בדיוק', 'בלוח כרגע', 'הלוח תואם']) expect(rep).not.toContain(gone);
  });

  // Not in 3, 4 and 7 (the first decision), not in 5 and 6 (the second,
  // "כל עוד שזה לא נוגד את האפיון אז אני מאשר"), not in 1 (as before).
  it.each([1, 3, 4, 5, 6, 7] as const)('meeting %i: blocks on the board, and no sum under the columns', (meeting) => {
    ws().initSession(meeting, false, 0);
    useWorkspaceStore.setState({ counts: { units: 7, tens: 4, hundreds: 3, thousands: 0 } });
    const { container } = render(
      <DndContext>
        <PlaceValueBoard />
      </DndContext>
    );
    expect(container.querySelector('section[aria-label="בית המספרים"]')).not.toBeNull();
    expect(container.textContent).not.toContain('בניתי');
    expect(container.querySelector('[aria-label="ערך כולל"]')).toBeNull();
  });

  it('the component and its per-meeting switch are gone, so no meeting can bring the sum back', () => {
    expect(existsSync(resolve(__dirname, '../../features/workspace/board/ValueDisplay.tsx'))).toBe(false);
    expect(src('features/workspace/board/PlaceValueBoard.tsx')).not.toMatch(/<ValueDisplay|showsBuiltSum/);
    expect(src('core/boardVisibility.ts')).not.toContain('showsBuiltSum');
  });
});

describe('meeting 7, gap-closing track, exercise 7 (owner, 28.9.2026; מסמך 03 §3.7)', () => {
  const t = getSessionTasks(7, 'remediation_path').find((x) => x.id === 's7_r_t7')!;

  it('asks for two ways, as the document does, and gives no answer away', () => {
    expect(t.instructionHe.startsWith('מצאו שתי דרכים שונות לייצג את המספר 150 כך שבכל דרך יש לבני עשרת, ומספר לבני העשרת זוגי. ')).toBe(true);
    expect(t.instructionHe).not.toContain('למשל');
    expect(t.instructionHe).not.toContain('14 עשרות');
  });

  it('the exercise is still solvable in at least two different ways (Rule 3)', () => {
    const ways: Array<[number, number, number]> = [];
    for (let h = 0; h <= 1; h++) for (let tens = 0; tens <= 15; tens++) {
      const units = 150 - h * 100 - tens * 10;
      if (units >= 0 && tens % 2 === 0) ways.push([h, tens, units]);
    }
    expect(ways.length).toBeGreaterThanOrEqual(2);
    expect(t.numberA).toBe(150);
    expect(t.requireEvenTens).toBe(true);
  });
});

describe('one name per thing on the child\'s screen: "בית המספרים", "לבנים", "קבצו"', () => {
  const childTexts = () => {
    const banks = [
      ...SESSION1_TASKS,
      ...([3, 4, 5, 6, 7] as const).flatMap((m) => [...getSessionTasks(m, 'green_path'), ...getSessionTasks(m, 'remediation_path')]),
      ...Object.values(SESSION_BRANCH_TASKS).flatMap((byPath) => Object.values(byPath).flatMap((b) => [...b.reinforcement, ...b.challenge])),
    ];
    return banks.map((t) => [t.id, t.instructionHe] as const);
  };

  it('no exercise instruction in meetings 1 and 3–7 says "הלוח", "לבני דינס" or "הקבצו"; subtraction says "פרטו", not "פרקו"', () => {
    for (const [id, text] of childTexts()) {
      expect(text, id).not.toContain('כפתור הקבץ');
      if (/[−-]\s?\d/.test(text) && /^פתרו (במאונך|חיסור)/.test(text)) expect(text, id).not.toMatch(/(^|\s)פרקו(\s|$)/);
      expect(text, id).not.toMatch(/(^|[\s(])(ה|ב|על ה|ל)?לוח(?!\s*החיבור)/);
      expect(text, id).not.toMatch(/לבני (ה)?דינס/);
      expect(text, id).not.toMatch(/(^|\s)הקבצו(?=[\s,.])/);
    }
  });

  it('the checks after "ממשיכים" use the same names (report rows ע1.2, ע1.3)', () => {
    const store = src('application/useWorkspaceStore.ts');
    expect(store).toContain("'בית המספרים עוד לא מראה את מה שההנחיה מבקשת. קראו אותה שוב ובדקו כמה לבנים יש בכל טור.'");
    expect(store).toContain("'בניתם בדיוק את מה שהתבקש, והמספר שכתבתם מתאים ללבנים בבית המספרים.'");
    expect(store).toContain("'המספר שכתבתם לא מתאים ללבנים בבית המספרים. בדקו שוב!'");
    // Only what the child reads: the string literals, niqqud (U+0591–U+05C7)
    // stripped first — "קֻבִּיּוֹת" slipped past a match on the pointed text.
    // comments out first: an apostrophe in an English comment would pair with the wrong quote
    const code = store.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const literals = [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
      .map((m) => (m[1] ?? m[2] ?? m[3] ?? '').replace(/[֑-ׇ]/g, ''))
      .filter((t) => /[א-ת]/.test(t));
    expect(literals.length).toBeGreaterThan(50);
    for (const t of literals) {
      expect(t).not.toMatch(/תואם ללוח|שבלוח|קוביות|קובייה|קביות|להקבץ|הניסוי|כפתור הקבץ|לפרק|לבני (ה)?דינס|הדינס/);
    }
    // the guard itself sees through niqqud
    expect('קֻבִּיּוֹת'.replace(/[֑-ׇ]/g, '')).toMatch(/קביות|קוביות/);
    expect(store).toContain("'עוד אין לבנים בבית המספרים. לחצו על אחת הלבנים שמתחת לבית המספרים, או גררו אותה אליו, ובנו את המספרים שבתרגיל.'");
    expect(store).toContain("'הלבנים מסודרות נכון, אבל המשימה היא לפרוט בעצמכם: בנו את המספר ולחצו על לבנת עשרת כדי לפרוט אותה.'");
    // a wrong board is refused without spelling out the blocks to build
    expect(store).not.toContain('בבית המספרים צריך להיות בדיוק');
  });

  it('the tray and the trash name them the same way', () => {
    expect(src('features/workspace/board/BlockPalette.tsx')).not.toMatch(/>\s*לבני דינס\s*</);
    expect(src('features/workspace/board/TrashZone.tsx')).toContain('לניקוי בית המספרים');
  });
});

describe('row ע1.1 and ע3.2 — the child reads "תחנה", not "מפגש"', () => {
  it('the end screen, the closed screen and the choice screen', () => {
    // The sentences about the teacher live in core/teacherGender.ts, in both
    // genders; both say "תחנה".
    for (const gender of ['female', 'male'] as const) {
      expect(TEACHER_SENTENCES_HE.nextStation[gender]).toContain('את התחנה הבאה, נמשיך יחד.');
      expect(TEACHER_SENTENCES_HE.closedTitle[gender]).toMatch(/^המורה סגרה? את התחנה$/);
      expect(TEACHER_SENTENCES_HE.closedBodyMeeting2Unfinished[gender]).toMatch(/המורה (תקבע|יקבע) איתכם מתי תמשיכו/);
    }
    expect(src('features/workspace/StudentWorkspacePage.tsx')).toContain("teacherSentenceHe('nextStation', teacherGender)");
    const closed = src('presentation/components/student/SessionClosedOverlay.tsx');
    expect(closed).toContain("teacherSentenceHe('closedTitle', gender)");
    expect(closed).toContain("teacherSentenceHe('closedBodyMeeting2Unfinished', gender)");
    const choice = src('features/workspace/overlays/ReinforcementOrChallengeScreen.tsx');
    expect(choice).toContain("badge: 'סיימתם את שבעת התרגילים של התחנה!'");
    expect(choice).toContain("finish: 'סיום התחנה עכשיו'");
    expect(choice).toContain("'אפשר גם לסיים את התחנה עכשיו.'");
    const texts = choice.slice(choice.indexOf('const BRANCH_CHOICE_TEXT'), choice.indexOf('interface ReinforcementOrChallengeScreenProps'));
    expect(texts).not.toContain('המפגש');
  });
});

describe('the undo button is named as the child sees it (review of PR #125, item 10)', () => {
  it('no exercise says "לחקירה עצמאית"; the flexible tasks point to the ↺ button', () => {
    const all = [
      ...([3, 4, 5, 6, 7, 8] as const).flatMap((m) => [...getSessionTasks(m, 'green_path'), ...getSessionTasks(m, 'remediation_path')]),
      ...Object.values(SESSION_BRANCH_TASKS).flatMap((byPath) => Object.values(byPath).flatMap((b) => [...b.reinforcement, ...b.challenge])),
    ];
    for (const t of all) expect(t.instructionHe, t.id).not.toContain('לחקירה עצמאית');
    const s6 = getSessionTasks(6, 'green_path').find((t) => t.id === 's6_g_t7')!;
    const s7 = getSessionTasks(7, 'remediation_path').find((t) => t.id === 's7_r_t7')!;
    // the name station 1 teaches ("לחצו על כפתור ביטול הפעולה…", owner 1.10.2026, D11c), and the arrow it shows
    for (const t of [s6, s7]) expect(t.instructionHe, t.id).toMatch(/רוצים לחזור צעד אחד אחורה\? לחצו על כפתור ביטול הפעולה ↺\.$/);
    // the arrow is not read aloud
    expect(src('infrastructure/services/TTSService.ts')).toContain("cleaned.replace(/[\\u2190-\\u21FF]/g, '')");
    // the toolbar's undo button is that arrow
    expect(src('features/workspace/WorkspaceTopbar.tsx')).toMatch(/aria-label="ביטול הפעולה האחרונה"[\s\S]{0,120}<RotateCcw/);
  });
});
