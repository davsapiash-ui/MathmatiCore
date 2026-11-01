/**
 * Every sentence a child can hear from a read-aloud button that the code can list ahead
 * of time: the guide and instruction of every exercise in every bank, and the fixed
 * sentences of the child's screens, in both of the teacher's genders. The recordings are
 * made from this list (tools/narration), and NarrationCoverage.test.ts fails when a
 * sentence on it has no recording — so a text changed in the code without a new
 * recording is caught before it ships, and is read by the device voice until it has one.
 *
 * What cannot be listed ahead (a teacher's chat message, a coaching card the AI wrote, a
 * message carrying the child's own numbers) has no recording and stays with the device voice.
 */

import { getHardcodedCatalogBanks, type SessionTask } from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { taskGuide } from '@/core/taskGuide';
import { TASK_LABEL_HE } from '@/core/taskPositionLabel';
import { TEACHER_SENTENCES_HE } from '@/core/teacherGender';
import { stationOpeningHe } from '@/core/stationOpening';
import { ENCOURAGEMENT_SENTENCES_HE } from '@/core/persistenceEncouragement';
import { LOBBY_FINISHED_LAST_STATION_HE } from '@/core/lobbyState';
import { proceedSentenceHe } from '@/core/toolbarNames';
import { BOARD_STAYS_OPEN_HE } from '@/core/boardVisibility';
import { narrationSegments } from './narrationSegments';

export interface CatalogSentence {
  /** The sentence as the screen writes it. */
  text: string;
  /** Where it comes from, for the people who review the recordings. */
  source: string;
}

const MAX_TASKS_IN_A_STATION = 15;

function addText(out: Map<string, CatalogSentence>, text: string | null | undefined, source: string) {
  if (!text || text.includes('{{')) return;
  for (const s of narrationSegments(text)) if (!out.has(s)) out.set(s, { text: s, source });
}

function addTask(out: Map<string, CatalogSentence>, task: SessionTask, session: number, source: string) {
  const guide = taskGuide(task, session);
  if (guide) {
    addText(out, guide.topicHe, `${source} · נושא`);
    addText(out, guide.goalHe, `${source} · מטרה`);
    for (const st of guide.steps) {
      addText(out, st.label, `${source} · שלב`);
      for (const sub of st.subs ?? []) addText(out, sub, `${source} · שלב`);
    }
    addText(out, guide.doneNoteHe, `${source} · סיום`);
  } else {
    addText(out, task.instructionHe, `${source} · הוראה`);
  }
  const t = task as SessionTask & { retryInstructionHe?: string; thoughtQuestionHe?: string };
  addText(out, t.retryInstructionHe, `${source} · הוראה חוזרת`);
}

/** The listable sentences, each once, in a stable order. */
export function narrationCatalog(): CatalogSentence[] {
  const out = new Map<string, CatalogSentence>();

  for (const bank of getHardcodedCatalogBanks()) {
    bank.tasks.forEach((task) => addTask(out, task, bank.session_number, `${bank.id} ${task.id}`));
  }
  for (const [session, paths] of Object.entries(SESSION_BRANCH_TASKS)) {
    for (const [path, bank] of Object.entries(paths)) {
      for (const task of [...bank.reinforcement, ...bank.challenge]) addTask(out, task, Number(session), `branch ${session} ${path} ${task.id}`);
    }
  }
  // The diagnostic's instructions sit at several depths (a correction subtask carries its
  // own probe), so every field whose name ends in "InstructionHe" is taken, at any depth.
  const walk = (value: unknown, source: string) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === 'string' && /InstructionHe$/.test(key)) addText(out, v, source);
      else walk(v, source);
    }
  };
  for (const task of DIAGNOSTIC_TASKS as Array<{ id: string }>) walk(task, `diagnostic ${task.id}`);

  // The heading read before every guide: "משימה N מתוך M:".
  for (let total = 1; total <= MAX_TASKS_IN_A_STATION; total++) {
    for (let n = 1; n <= total; n++) addText(out, `משימה ${n} מתוך ${total}:`, 'כותרת המשימה');
  }
  for (const label of Object.values(TASK_LABEL_HE)) addText(out, `${label}:`, 'כותרת המשימה');

  for (const pair of Object.values(TEACHER_SENTENCES_HE)) {
    addText(out, pair.female, 'משפט על המורה');
    addText(out, pair.male, 'משפט על המורה');
  }
  for (let meeting = 1; meeting <= 8; meeting++) addText(out, stationOpeningHe(meeting), `פתיחת תחנה ${meeting}`);
  for (const sentence of Object.values(ENCOURAGEMENT_SENTENCES_HE)) addText(out, sentence, 'משפט עידוד');
  addText(out, LOBBY_FINISHED_LAST_STATION_HE, 'לובי');
  addText(out, proceedSentenceHe(), 'תיבת סיום');
  addText(out, BOARD_STAYS_OPEN_HE, 'סרגל עליון');
  addText(out, 'כתבו את קוד הגישה שקיבלתם מהמורה.', 'מסך הכניסה');
  addText(out, 'הקשיבו להסבר של המורה על גבי המקרן', 'מסך המקרן');

  return [...out.values()];
}
