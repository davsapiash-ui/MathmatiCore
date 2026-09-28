/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'fs';
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
import { DEFAULT_LEFT_PX, useLeftClearOfSidePanel } from '@/features/workspace/board/useLeftClearOfSidePanel';
import { showsBuiltSum } from '@/core/boardVisibility';

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
  it('"ממשיכים", "יציאה" and "מספר 12" — no masculine singular', () => {
    ws().initSession(3, false, 0);
    topbar();
    expect(PROCEED_HE).toBe('ממשיכים');
    expect(LOGOUT_HE).toBe('יציאה');
    expect(studentBadgeHe(12)).toBe('מספר 12');
    const nav = document.querySelector('nav')!;
    expect(screen.getByTestId('proceed-button').textContent).toBe('ממשיכים');
    expect(screen.getByTestId('student-badge').textContent).toContain('מספר 12');
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

  it('below 1280 px the bar tightens (logo badge only, smaller dots) but every button keeps its words', () => {
    const bar = src('features/workspace/WorkspaceTopbar.tsx');
    expect(bar).toContain('<span className="hidden xl:inline-flex"><Logo size="md" subtitle="מרחב חקר אישי" /></span>');
    expect(bar).toContain('<span className="inline-flex xl:hidden"><Logo size="md" showText={false} /></span>');
    expect(bar).not.toContain('sr-only xl:not-sr-only');
    ws().initSession(4, false, 0);
    topbar();
    const exit = [...document.querySelectorAll('nav button')].find((b) => b.getAttribute('aria-label') === 'יציאה מהמערכת')!;
    expect(exit.getAttribute('title')).toBe('יציאה');
    expect(exit.textContent).toBe('יציאה');
    expect(exit.querySelector('span')!.className).not.toContain('sr-only');
    const badge = screen.getByTestId('student-badge').querySelector('span')!;
    expect(badge.textContent?.trim()).toBe('מספר 12');
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
    expect(col).toContain('className="relative flex items-center justify-center gap-2 py-2.5');
    expect(col).not.toContain('absolute left-3 min-w-[22px]');
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
      expect(toast.className).toContain('absolute top-2');
      const card = document.getElementById('tour-task-card')!;
      expect(card.contains(toast)).toBe(true);
      // it comes before the column, so it lies over the heading, not under the exercise
      expect(toast.compareDocumentPosition(screen.getByTestId('task-column')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  }

  it('the page mounts the floating bubble only in meetings 2 and 8, which have no board', () => {
    expect(src('features/workspace/StudentWorkspacePage.tsx')).toContain('{(sessionNumber === 2 || sessionNumber === 8) && <FeedbackToast />}');
  });
});

describe('row 1.28 — the addition grid keeps clear of the coaching card', () => {
  function Probe() {
    const left = useLeftClearOfSidePanel();
    return <div data-testid="probe" data-left={left} />;
  }

  it('in its corner while no card is open, just right of the card while it is', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').getAttribute('data-left')).toBe(String(DEFAULT_LEFT_PX));
    const panel = document.createElement('div');
    panel.setAttribute('data-testid', 'socratic-side-panel');
    panel.getBoundingClientRect = () => ({ left: 20, right: 300, top: 0, bottom: 600, width: 280, height: 600, x: 20, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(panel);
    act(() => {
      useWorkspaceStore.setState({ helpState: 'socratic' } as any);
    });
    expect(screen.getByTestId('probe').getAttribute('data-left')).toBe('316');
    act(() => {
      useWorkspaceStore.setState({ helpState: 'closed' } as any);
    });
    expect(screen.getByTestId('probe').getAttribute('data-left')).toBe(String(DEFAULT_LEFT_PX));
    panel.remove();
  });

  it('the grid and its re-open tab are both placed by it, and the grid has one name', () => {
    const grid = src('features/workspace/board/AdaptiveAdditionGrid.tsx');
    expect(grid).toContain('const { left, maxWidth } = useClearOfSidePanel();');
    expect(grid).toContain('style={{ left, maxWidth }}');
    expect(grid).not.toContain('left-6');
    expect(grid).not.toMatch(/לוח עזר|תמיכה אדפטיבית/);
    expect(src('features/workspace/StudentWorkspacePage.tsx')).not.toMatch(/<span>לוח חיבור<\/span>/);
  });
});

describe('row 3.20 (owner, 28.9.2026) — no "בנו בלוח בדיוק / בלוח כרגע" box, and no "בניתי את" sum in meetings 3, 4 and 7', () => {
  it('the box is gone from every representation exercise', () => {
    const rep = src('features/workspace/tasks/RepresentationTask.tsx');
    expect(rep).not.toContain('describeCountsHe');
    for (const gone of ['בנו בלוח בדיוק', 'בלוח כרגע', 'הלוח תואם']) expect(rep).not.toContain(gone);
  });

  it('the sum is shown in meetings 5 and 6 only — not in 3, 4 and 7 (the decision), not in 1 (as before)', () => {
    for (const m of [1, 2, 3, 4, 7, 8]) expect(showsBuiltSum(m), `meeting ${m}`).toBe(false);
    for (const m of [5, 6]) expect(showsBuiltSum(m), `meeting ${m}`).toBe(true);
    expect(src('features/workspace/board/PlaceValueBoard.tsx')).toContain('{showsBuiltSum(sessionNumber) && <ValueDisplay />}');
  });
});

describe('meeting 7, gap-closing track, exercise 7 (owner, 28.9.2026; מסמך 03 §3.7)', () => {
  const t = getSessionTasks(7, 'remediation_path').find((x) => x.id === 's7_r_t7')!;

  it('asks for two ways, as the document does, and gives no answer away', () => {
    expect(t.instructionHe.startsWith('מצאו שתי דרכים שונות לייצג את המספר 150 כך שבכל דרך מספר העשרות זוגי. ')).toBe(true);
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
    const literals = [...store.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
      .map((m) => (m[1] ?? m[2] ?? m[3] ?? '').replace(/[֑-ׇ]/g, ''))
      .filter((t) => /[א-ת]/.test(t));
    expect(literals.length).toBeGreaterThan(50);
    for (const t of literals) {
      expect(t).not.toMatch(/תואם ללוח|שבלוח|קוביות|קובייה|קביות|להקבץ|הניסוי|כפתור הקבץ|לפרק|לבני (ה)?דינס|הדינס/);
    }
    // the guard itself sees through niqqud
    expect('קֻבִּיּוֹת'.replace(/[֑-ׇ]/g, '')).toMatch(/קביות|קוביות/);
    expect(store).toContain("'עוד אין לבנים בבית המספרים. לחצו על לבנה בארגז הכלים או גררו אותה לבית המספרים, ובנו את המספרים שבתרגיל.'");
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
    expect(src('features/workspace/StudentWorkspacePage.tsx')).toContain('כשהמורה תפתח את התחנה הבאה, נמשיך יחד.');
    const closed = src('presentation/components/student/SessionClosedOverlay.tsx');
    expect(closed).toContain('המורה סגרה את התחנה');
    expect(closed).toContain('כשהמורה תפתח תחנה חדשה');
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
    for (const t of [s6, s7]) expect(t.instructionHe, t.id).toMatch(/רוצים לחזור צעד\? לחצו על הכפתור עם החץ המעוגל ↺\.$/);
    // the toolbar's undo button is that arrow
    expect(src('features/workspace/WorkspaceTopbar.tsx')).toMatch(/aria-label="ביטול הפעולה האחרונה"[\s\S]{0,120}<RotateCcw/);
  });
});
