/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <span data-testid="speech" data-text={text} />,
}));

import { TASKS, QMatrixEvaluator } from '@/core/QMatrix';
import { initQFlow, type QMatrixFlowState } from '@/core/qmatrixFlow';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { ENHANCED_SUPPORT_PROFILE_ID } from '@/core/supportProfile';
import { PLACE_COLORS, NEUTRAL_BOX_BORDER } from '@/features/workspace/placeColors';
import { probeExerciseText } from '@/features/workspace/tasks/probeExerciseText';

/**
 * Meeting 2, "תחנה 2: יוצאים למסע" — the owner's decisions of 27.9.2026 and the
 * report rows fixed on 28.9.2026 (report spec-vs-software-2026-09-28, rows 2.13,
 * 2.15, 2.17, 2.18, 2.21, 2.23 and ע2.1–ע2.3, ע2.7).
 */

const SRC = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf-8');
const byId = (id: string) => TASKS.find((t) => t.id === id)!;

function atTask(id: string, phase: QMatrixFlowState['phase'] = 'primary', subphase: QMatrixFlowState['subphase'] = 'subtask') {
  const taskIdx = TASKS.findIndex((t) => t.id === id);
  useWorkspaceStore.setState({ qflow: { ...initQFlow(), taskIdx, phase, subphase, failedTasks: [id] } });
}

function setProfile(enhanced: boolean) {
  // The profile in force (receiveSupportProfile → activeSupportProfileId), as in production since #139.
  useWorkspaceStore.setState({ activeSupportProfileId: enhanced ? ENHANCED_SUPPORT_PROFILE_ID : null });
}

/** jsdom keeps var() colours as written; compare the declared style. */
const borderOf = (el: HTMLElement) => el.style.borderColor;

async function renderCard() {
  const { TaskCard } = await import('@/features/workspace/tasks/TaskCard');
  return render(<TaskCard />);
}

beforeEach(() => {
  useAuthStore.setState({ user: { uid: 'student_user12', student_id: 12 } as never, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.getState().initSession(2, false);
  setProfile(false);
});
afterEach(cleanup);

describe('answer checking, scoring and the Q-matrix are unchanged', () => {
  it('605, 40, 27, 563, 25, 209, 273 are right; 506, 65, 52 are wrong', () => {
    const right: Record<string, number> = {
      task1_read_write_zero: 605,
      task2_digit_value: 40,
      task3_subtraction_regrouping: 27,
      task4_decompose_number: 563,
      task5_units_to_tens: 25,
      task6_vertical_addition: 209,
      task7_subtraction_zero_tens: 273,
    };
    for (const [id, n] of Object.entries(right)) expect(QMatrixEvaluator.evaluateGeneric(byId(id), n).correct, id).toBe(true);
    expect(QMatrixEvaluator.evaluateGeneric(byId('task1_read_write_zero'), 506).correct).toBe(false);
    expect(QMatrixEvaluator.evaluateGeneric(byId('task2_digit_value'), 65).correct).toBe(false);
    expect(QMatrixEvaluator.evaluateGeneric(byId('task5_units_to_tens'), 52).correct).toBe(false);
    expect(TASKS.map((t) => t.id)).toEqual([
      'task1_read_write_zero',
      'task2_digit_value',
      'task3_subtraction_regrouping',
      'task4_decompose_number',
      'task5_units_to_tens',
      'task6_vertical_addition',
      'task7_subtraction_zero_tens',
    ]);
  });
});

describe('(b) writing order: hundreds LEFT, units RIGHT, for every learner (rows 2.13, 2.18)', () => {
  for (const enhanced of [false, true]) {
    it(`task 1, ${enhanced ? 'with' : 'without'} the profile: typing 6, 0, 5 fills hundreds → tens → units and reads 605`, async () => {
      setProfile(enhanced);
      atTask('task1_read_write_zero');
      await renderCard();
      const row = screen.getByTestId('pv-result-row');
      expect(row.getAttribute('dir')).toBe('ltr');
      const boxes = within(row).getAllByRole('textbox') as HTMLInputElement[];
      expect(boxes.map((b) => b.dataset.place)).toEqual(['hundreds', 'tens', 'units']);
      // the hundreds box has the focus when the task opens, and each digit moves it right
      expect(document.activeElement).toBe(boxes[0]);
      for (const d of ['6', '0', '5']) fireEvent.change(document.activeElement as HTMLInputElement, { target: { value: d } });
      expect(boxes.map((b) => b.value).join('')).toBe('605');
      expect(useWorkspaceStore.getState().answerDigits).toMatchObject({ hundreds: '6', tens: '0', units: '5' });
    });
  }

  it('task 5: tens on the left, units on the right; 2 then 5 reads 25', async () => {
    atTask('task5_units_to_tens');
    await renderCard();
    const boxes = within(screen.getByTestId('pv-result-row')).getAllByRole('textbox') as HTMLInputElement[];
    expect(boxes.map((b) => b.dataset.place)).toEqual(['tens', 'units']);
    expect(document.activeElement).toBe(boxes[0]);
    fireEvent.change(boxes[0], { target: { value: '2' } });
    expect(document.activeElement).toBe(boxes[1]);
    fireEvent.change(boxes[1], { target: { value: '5' } });
    expect(boxes.map((b) => b.value).join('')).toBe('25');
  });
});

describe('row 2.15: 742 is shown as 742', () => {
  it('the number is one left-to-right run, and the marked digit is the 4', async () => {
    atTask('task2_digit_value');
    await renderCard();
    const num = screen.getByTestId('pv-highlight-number');
    expect(num.getAttribute('dir')).toBe('ltr');
    expect(num.textContent).toBe('742');
    expect(num.getAttribute('aria-label')).toBe('742, הספרה המסומנת: 4');
    const marked = [...num.querySelectorAll('span')].find((s) => s.className.includes('underline'));
    expect(marked?.textContent).toBe('4');
  });
});

describe('(a) place-value headings and colours by support profile (row 2.21)', () => {
  it('the board columns and the boxes share one colour code', () => {
    const column = read('features/workspace/board/PlaceColumn.tsx');
    expect(column).toContain('const COLUMN_COLORS = PLACE_COLORS;');
    expect(column).not.toMatch(/var\(--block-unit-dark\)/);
    const vertical = read('features/workspace/tasks/VerticalAdditionTask.tsx');
    expect(vertical).toContain('units: PLACE_COLORS.units.header');
    expect(vertical).not.toMatch(/'var\(--block-/);
    // the old second code of meeting 2 (amber hundreds, blue tens, green units) is gone
    expect(read('features/workspace/tasks/PlaceValueInputBoxes.tsx')).not.toMatch(/amber|emerald|text-blue|border-blue/);
  });

  for (const id of ['task1_read_write_zero', 'task4_decompose_number', 'task5_units_to_tens']) {
    it(`${id}: without the profile — one neutral colour, no headings`, async () => {
      atTask(id);
      const { container } = await renderCard();
      const boxes = within(screen.getByTestId('pv-result-row')).getAllByRole('textbox') as HTMLInputElement[];
      for (const b of boxes) expect(borderOf(b)).toBe(NEUTRAL_BOX_BORDER);
      expect(container.querySelectorAll('[id^="pv-label-"]').length).toBe(0);
      for (const w of ['מאות', 'עשרות', 'יחידות']) {
        // the given text may name the places (task 4 spells a number) — the boxes do not
        expect(container.querySelector('[data-testid="pv-result-row"]')!.textContent).not.toContain(w);
      }
      expect(boxes[0].getAttribute('aria-label')).toMatch(/^ספרה 1 מתוך \d בשורת התוצאה$/);
    });

    it(`${id}: with the profile — headings, in the board's colours`, async () => {
      setProfile(true);
      atTask(id);
      await renderCard();
      const boxes = within(screen.getByTestId('pv-result-row')).getAllByRole('textbox') as HTMLInputElement[];
      for (const b of boxes) {
        const place = b.dataset.place as 'hundreds' | 'tens' | 'units';
        // the same shade as the vertical exercises' boxes and the board column headers
        expect(borderOf(b)).toBe(PLACE_COLORS[place].header);
        const label = document.getElementById(`pv-label-${place}`)!;
        expect(label.textContent).toBe({ hundreds: 'מאות', tens: 'עשרות', units: 'יחידות' }[place]);
        expect(label.style.color).toBe(PLACE_COLORS[place].header);
      }
    });
  }

  it('follows the teacher\'s toggle live, without a reload', async () => {
    const { act } = await import('@testing-library/react');
    atTask('task1_read_write_zero');
    const { container } = await renderCard();
    expect(container.querySelectorAll('[id^="pv-label-"]').length).toBe(0);
    act(() => setProfile(true));
    expect(container.querySelectorAll('[id^="pv-label-"]').length).toBe(3);
    act(() => setProfile(false));
    expect(container.querySelectorAll('[id^="pv-label-"]').length).toBe(0);
  });

  it('task 2: the single box is neutral for every learner', async () => {
    for (const enhanced of [false, true]) {
      cleanup();
      setProfile(enhanced);
      atTask('task2_digit_value');
      await renderCard();
      expect(borderOf(screen.getByLabelText('ערך הספרה:'))).toBe(NEUTRAL_BOX_BORDER);
    }
  });

  it('vertical exercises of meeting 2: neutral and without place labels unless the profile is set', async () => {
    atTask('task6_vertical_addition');
    const { container } = await renderCard();
    const answers = screen.getAllByLabelText(/^ספרת ה.* בתשובה$/) as HTMLInputElement[];
    for (const a of answers) expect(borderOf(a)).toBe(NEUTRAL_BOX_BORDER);
    expect(container.textContent).not.toMatch(/מאות|עשרות|יחידות/);

    cleanup();
    setProfile(true);
    atTask('task6_vertical_addition');
    const again = await renderCard();
    const units = screen.getByLabelText('ספרת היחידות בתשובה') as HTMLInputElement;
    expect(borderOf(units)).toBe(PLACE_COLORS.units.header);
    expect(again.container.textContent).toMatch(/מאות/);
  });

  it('other meetings keep the board colours on the vertical exercise, whatever the profile', async () => {
    const { VerticalAdditionTask } = await import('@/features/workspace/tasks/VerticalAdditionTask');
    useWorkspaceStore.setState({ sessionNumber: 4 });
    const { container } = render(<VerticalAdditionTask numberA={124} numberB={85} answerLength={3} />);
    expect(borderOf(screen.getByLabelText('ספרת היחידות בתשובה'))).toBe(PLACE_COLORS.units.header);
    expect(container.textContent).toContain('יחידות');
  });
});

describe('(c) task 5 shows 25 unit blocks, a still picture, for every learner (row 2.17)', () => {
  for (const [phase, subphase] of [['primary', 'subtask'], ['correction', 'retry']] as const) {
    it(`${phase}: 25 blocks, role="img", nothing to drag, click or group`, async () => {
      atTask('task5_units_to_tens', phase, subphase);
      const { container } = await renderCard();
      const pic = screen.getByRole('img', { name: '25 לבני יחידה' });
      // a column, four across — not a square of fives
      // (the size follows the window's height: 14px blocks at 600px → the board's 20px at 950px)
      const grid = pic.firstElementChild as HTMLElement;
      expect(grid.dataset.perRow).toBe('4');
      expect(grid.style.width).toContain('4 * clamp(14px');
      expect(pic.querySelectorAll('[data-testid="unit-block-still"]').length).toBe(25);
      expect(pic.querySelectorAll('button, [role="button"], [tabindex], [draggable="true"]').length).toBe(0);
      expect(container.textContent).not.toContain('קבץ 10');
      expect(container.textContent).toContain('25 לבני יחידה');
    });
  }

  it('no virtual Dienes block is loaded (PRD Module 14 §ב): the picture uses the SVG, not DienesBlock', () => {
    const pic = read('features/workspace/tasks/UnitBlocksPicture.tsx');
    expect(pic).not.toMatch(/<DienesBlock|useDraggable\(|from '@dnd-kit|useWorkspaceStore\(/);
    expect(pic).toContain('UnitSVG');
  });
});

describe('(d) the texts of meeting 2', () => {
  it('task texts decided on 27.9.2026', () => {
    expect(byId('task1_read_write_zero').instructionHe).toBe('קראו את המספר וכתבו אותו בשורת התוצאה. הפעם פתרו לבד.');
    expect(byId('task2_digit_value').instructionHe).toBe('מה הערך של הספרה המסומנת? כתבו אותו בתיבה.');
    expect(byId('task4_decompose_number').instructionHe).toBe('כתבו בשורת התוצאה כמה מאות, עשרות ויחידות יש במספר שעל המסך.');
    expect(byId('task4_decompose_number').givenHe).toBe('חמש מאות שישים ושלוש');
    expect(byId('task5_units_to_tens').instructionHe).toBe(
      'אם תקבצו לעשרות את הלבנים שעל המסך, כמה עשרות וכמה יחידות יהיו? כתבו את התשובה בשורת התוצאה.'
    );
  });

  it('retry texts: "כתבו בספרות", tens and units in task 5, no "ששים", "במספרים", "ללא עזרים"', () => {
    expect(byId('task1_read_write_zero').backwardDiagnosis?.probeInstructionHe).toBe('כתבו בספרות: שש מאות וחמש.');
    expect(byId('task4_decompose_number').backwardDiagnosis?.probeInstructionHe).toBe('כתבו בספרות: חמש מאות שישים ושלוש.');
    const t5 = byId('task5_units_to_tens').backwardDiagnosis?.probeInstructionHe ?? '';
    expect(t5).toContain('כמה עשרות וכמה יחידות');
    expect(t5).not.toContain('את המספר');
    const all = JSON.stringify(TASKS);
    for (const w of ['ששים', 'כתבו במספרים', 'ללא עזרים', 'בתיבה המתאימה', 'פלוס']) expect(all, w).not.toContain(w);
  });

  it('the retry of tasks 1, 2, 4, 5 shows the task itself with its own text (decision ז)', async () => {
    atTask('task4_decompose_number', 'correction', 'retry');
    const { container } = await renderCard();
    expect(container.textContent).toContain('כתבו בשורת התוצאה כמה מאות, עשרות ויחידות יש במספר שעל המסך.');
    expect(container.textContent).toContain('חמש מאות שישים ושלוש');
    expect(container.textContent).not.toContain('ששים ');
  });
});

describe('(e) row 2.23: each round-number exercise once, no LaTeX or code on screen', () => {
  for (const id of ['task3_subtraction_regrouping', 'task6_vertical_addition', 'task7_subtraction_zero_tens']) {
    it(id, async () => {
      atTask(id, 'correction', 'subtask');
      const { container } = await renderCard();
      const d = byId(id).backwardDiagnosis!;
      const text = probeExerciseText(byId(id), d.probeA!, d.probeB);
      const shown = screen.getAllByTestId('probe-exercise');
      expect(shown).toHaveLength(1);
      expect(shown[0].textContent).toBe(text);
      expect(container.textContent?.split(text).length).toBe(2); // exactly once
      expect(container.textContent).not.toMatch(/\\|text\?|katex/i);
      expect(container.querySelector('.katex, math')).toBeNull();
      expect(shown[0].getAttribute('aria-label')).toBe(
        `תרגיל: ${d.probeA} ${byId(id).isSubtraction ? 'פחות' : 'ועוד'} ${d.probeB} שווה כמה`
      );
    });
  }

  it('the three exercises read as the child writes them', () => {
    expect(probeExerciseText(byId('task3_subtraction_regrouping'), 40, 10)).toBe('40 − 10 = ?');
    expect(probeExerciseText(byId('task6_vertical_addition'), 120, 80)).toBe('120 + 80 = ?');
    expect(probeExerciseText(byId('task7_subtraction_zero_tens'), 400, 130)).toBe('400 − 130 = ?');
    expect(read('features/workspace/tasks/BackwardDiagnosisView.tsx')).not.toMatch(/katex|InlineMath|'פלוס'/);
  });
});

describe('the Hebrew of meeting 2 (ע2.3)', () => {
  it('ע2.3: the bee screen', async () => {
    const { BeeFlightWaitingScreen } = await import('@/presentation/components/student/BeeFlightWaitingScreen');
    const { container } = render(<BeeFlightWaitingScreen />);
    const msg = 'כל הכבוד, מתמטיקאים! סיימתם את התחנה השנייה. המורה בודקת את העבודה שלכם. כשהמורה תסיים לבדוק, נמשיך.';
    expect(container.textContent).toContain(msg);
    expect(screen.getByTestId('speech').getAttribute('data-text')).toBe(msg);
    expect(container.textContent).not.toMatch(/המורה בודק |ומיד נמשיך/);
  });

  // ע2.4 (the logout button) and ע2.5 ("תלמיד 12") are PR #125's: it names the
  // button "יציאה" and the badge "מספר 12" from one source, core/toolbarNames.ts.
});
