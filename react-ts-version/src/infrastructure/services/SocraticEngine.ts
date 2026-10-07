import { functions, authReady } from "@/infrastructure/firebase";
import { httpsCallable } from "firebase/functions";
import type { GeminiSocraticRequest, GeminiSocraticResponse, GeminiSocraticOption } from "@/types";
import type { TelemetryEventType, TelemetryPayload } from "@/types/telemetry";
import { normalizeStudentId } from "@/application/useChatStore";
import { digitAt, type Place } from "@/core/placeValue";
import { researchErrorCategory } from "./socraticResearchCategory";
import { builtAnyWay } from "@/data/representationLocks";
import { recentTelemetryFor, MAX_RECENT_FOR_ENGINE } from "./recentTelemetry";
import { exerciseCard, givenBlocksChangedCard, whichNumberIsBuiltCard, meetingOfTaskId, blocksOnScreen, secretNumbersOf, revealsSecret, formatNumberHe, stripDigitGroupSeparators, revealsSecretInCounts, contradictsRequiredRepresentation, wrongHintViolation, statesBoardCount, numbersInInstruction, HINT, tenBlocksHint, representationKindOf, framed, meeting1Card, s1NoButtonCard, s1GroupActionCard, s1DeficitSecondCard, s1WrongBreakCard, s1StartChangedCard, groupActionCard, strayAddition, strayBlocksCard, multiStepTarget, showBoardCard, boardHiddenCard, noBoardColumnCard, revealsHiddenDigit, ladder as cardLadder, buildNumberCard, digitsInColumnsCard, addBuildCard, skeletonShown, inFamily, withKind, type StaticCardContext, type StaticCardKind } from "./staticSocraticCards";

export type { GeminiSocraticRequest, GeminiSocraticResponse, GeminiSocraticOption };

/**
 * Wire payload of callGeminiSocraticProxy — the Module 13 §ב contract, and
 * nothing else. The free-text fields (prompt/context/history) were removed
 * together with the server path that read them: forwarding caller prose to
 * the model is the open-ended chat Module 13 forbids.
 */
export interface SocraticProxyPayload {
  socratic_request?: GeminiSocraticRequest;
  anchor?: { questionHe: string; pedagogical_intent?: string; choices: { id: string; textHe: string; isCorrect?: boolean }[] };
}

async function ready(): Promise<void> {
  await authReady;
}

export interface SocraticChoice {
  id: string;
  textHe: string;
  isCorrect?: boolean;
  hint?: string;
  feedbackHe?: string;
}

export interface SocraticHintResponse {
  pedagogical_intent?: "conceptual" | "procedural" | "focus";
  error_category?: 'calculation' | 'procedural' | 'conceptual' | null;
  tts_text?: string;
  suggested_highlight?: string | null;
  questionHe: string;
  choices: SocraticChoice[];
  correctChoiceId?: string;
  /** A card of 30.9.2026 (staticSocraticCards.ts): the store records it once shown in the exercise. */
  cardKind?: StaticCardKind;
  /** The situation the static selection recognised — the engine's card frame (owner, 1.10.2026). */
  situation?: string;
  /** The card's level when it is not read from its question: 1 general, 2 names the column, 3 names the action. */
  frameLevel?: 1 | 2 | 3;
  /** What the child should come to notice, in a line, for the engine's frame. */
  intentHe?: string;
  /**
   * The situation family, when it is not the card kind's own
   * (staticSocraticCards.cardFamilyOf): the levels of one card share it, and
   * with the trigger and the column it is the card's identity in the store.
   */
  family?: string;
  /** "gemini" when the AI engine wrote the card (research data, SOCRATIC_CARD_SHOWN.card_source). */
  source?: 'gemini' | 'static';
  /** The model that wrote it (server meta.model_id). */
  modelId?: string;
  /**
   * 7.10.2026, owner: a static card shown in place of the engine's says why
   * (SOCRATIC_CARD_SHOWN.card_fallback_reason), so the research data and the
   * admin console count what the child actually saw, not what the server
   * believes it sent. Absent on the engine's own card.
   */
  fallbackReason?: SocraticFallbackReason;
  /** A short code beside the reason: the server's error code, or the content rule that refused the card. */
  fallbackDetail?: string;
  /** How long the hourglass turned before this card appeared (SOCRATIC_CARD_SHOWN.card_wait_ms). */
  waitMs?: number;
}

/**
 * Why the child saw a static card instead of the engine's (7.10.2026):
 * - offline: no network, the engine was not asked;
 * - timeout: no answer within SOCRATIC_PROXY_TIMEOUT_MS;
 * - server_failed: the server answered with an error — it could not get a valid card from the model;
 * - schema_rejected: the server's answer was not a complete card;
 * - rule_rejected: the card broke a content rule checked on the learner's side;
 * - board_changed: the child changed the board under the hourglass, and the card was built again from the screen;
 * - not_coached: an exercise the engine never coaches (the sandbox, the tool steps);
 * - error: anything else on the learner's side.
 */
export type SocraticFallbackReason =
  | 'offline'
  | 'timeout'
  | 'server_failed'
  | 'schema_rejected'
  | 'rule_rejected'
  | 'board_changed'
  | 'not_coached'
  | 'error';

/** A content rule's message as a short code for the research data ("hidden number leaked" → hidden_number_leaked). */
export function ruleCode(violation: string): string {
  return violation.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'rule';
}

/** The reason an engine call failed, from the error it threw (a callable's code, or the local race). */
export function fallbackReasonOfError(err: unknown): { reason: SocraticFallbackReason; detail?: string } {
  const code = String((err as { code?: unknown })?.code ?? '');
  const message = String((err as { message?: unknown })?.message ?? '');
  if (message === 'Gemini Socratic Proxy timeout' || code === 'functions/deadline-exceeded') return { reason: 'timeout', detail: code.replace(/^functions\//, '') || undefined };
  if (code === 'functions/unavailable') return { reason: 'offline', detail: 'unavailable' };
  if (code.startsWith('functions/')) return { reason: 'server_failed', detail: code.replace(/^functions\//, '').slice(0, 32) };
  return { reason: 'error' };
}

/**
 * The card frame the engine writes inside (owner, 1.10.2026: "the static cards
 * are the base and the boundaries for Gemini"): the static card the selection
 * picked sets the situation, the intent and the level; the card itself is the
 * exemplar (the anchor). A card whose question names no column is level 1 —
 * the engine's card may not name one either.
 */
const LEVEL_1_KINDS: readonly string[] = ['borrow_check', 'place_cues', 'error_analysis', 'read_write_zero'];
export function cardFrameOf(card: SocraticHintResponse, task?: any): NonNullable<GeminiSocraticRequest['card_frame']> {
  // Level 1 where the owner decided the child finds the column: meeting 1
  // (29.9.2026), C3–C6 and the first card of a family (30.9.2026), and any
  // card that says so itself. Elsewhere the engine may name the column.
  const explicitLevel1 = meetingOfTaskId(task?.id) === 1 || LEVEL_1_KINDS.includes(String(card.cardKind ?? card.situation ?? ''));
  const situation = String(card.situation ?? card.cardKind ?? 'static').replace(/[^a-z0-9_]/g, '_').slice(0, 40) || 'static';
  const intent = card.intentHe ? card.intentHe.replace(/[^֐-׿0-9\s.,:;!?"'()\-–—−+=×/״׳%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return {
    situation,
    level: card.frameLevel ?? (explicitLevel1 ? 1 : 2),
    ...(intent && /[א-ת]/.test(intent) ? { intent_he: intent } : {}),
  };
}

export function normalizeTaskIdForHints(id?: string): string {
  if (!id) return '';
  // Normalize e.g. s3_g_t1 or s3_r_t1 -> s3_t1
  return id.replace(/^(s\d+)_[gr]_t(\d+)$/, '$1_t$2');
}

/**
 * PRD Module 13 (חוק ברזל — השילוש הפדגוגי ההוליסטי): a guiding question may not
 * float free of the exercise. מסמך 03 writes one card per session, so when that
 * card is the only thing left to serve, name the exercise inside its question.
 */
export function groundCardInExercise(card: SocraticHintResponse, currentTask?: any): SocraticHintResponse {
  const a = currentTask?.numberA;
  const b = currentTask?.numberB;
  let context: string | null = null;
  if (typeof a === 'number' && typeof b === 'number' && (currentTask?.hiddenDigits?.a?.length || currentTask?.hiddenDigits?.b?.length)) {
    // A skeleton exercise as the screen shows it, hidden digits as "▢"
    // (audit D13): its operands named whole gave the hidden digits away, and
    // the iron rule then served the card without its exercise.
    context = `בתרגיל ${skeletonShown(currentTask)}`;
  } else if (typeof a === 'number' && typeof b === 'number') {
    // With signs, as every computed card and the exercise sheet write it (one
    // name per thing, audit 4.10.2026 A7-007); the read-aloud says them as
    // "ועוד" / "פחות" (TTSService.cleanTextForSpeech).
    context = `בתרגיל ${formatNumberHe(a)} ${currentTask?.isSubtraction ? '−' : '+'} ${formatNumberHe(b)}`;
  } else if (typeof a === 'number') {
    context = `בתרגיל על המספר ${a.toLocaleString('he-IL')}`;
  }
  if (!context) return card;
  // "נסו לחשוב: בתרגיל 61 − 24, אין מספיק יחידות…", not two
  // colons in a row ("בתרגיל 61 − 24: נסו לחשוב: …").
  const OPENING = 'נסו לחשוב: ';
  const grounded = (text: string) =>
    text.startsWith(OPENING) ? `${OPENING}${context}, ${text.slice(OPENING.length)}` : `${context}: ${text}`;
  return {
    ...card,
    questionHe: grounded(card.questionHe),
    tts_text: card.tts_text ? grounded(card.tts_text) : card.tts_text,
  };
}

/**
 * Static-card keys for a session 3–8 exercise id (compulsory or early-finisher):
 * the path-specific card first (`s4_r_card`), then the session card (`s4_card`).
 * מסמך 03 writes one Socratic card per session, so every exercise of a session
 * shares it; only session 3 differs by path (34 tens vs 34 hundreds).
 */
export function sessionCardKeysForTaskId(id?: string): string[] {
  const m = id ? /^s([3-8])_(?:([gr])_)?(?:t\d+|reinforce_\d+|challenge_\d+)$/.exec(id) : null;
  if (!m) return [];
  const [, session, path] = m;
  return path ? [`s${session}_${path}_card`, `s${session}_card`] : [`s${session}_card`];
}

/** Ceiling on how long a learner waits for an AI hint before the static one is served (Module 13 §4). */
export const SOCRATIC_PROXY_TIMEOUT_MS = 8000;

export type SocraticTriggerReasonWire =
  | 'hesitation_45s'
  | 'consecutive_errors_4'
  | 'consecutive_undos_3'
  | 'conversion_not_performed'
  | 'repeated_errors';

/**
 * Pillar 3 of PRD Module 13's triad — what the platform has MONITORED about
 * the learner's steps on this exercise. The store fills it from live state
 * (useWorkspaceStore.fetchSocraticHint); the engine turns it into the
 * student_progress_state of the GeminiSocraticRequest so the model reasons
 * over facts instead of a prose summary of them.
 */
export interface SocraticMonitoringSnapshot {
  studentId?: number | string;
  sessionNumber?: number;
  triggerReason?: SocraticTriggerReasonWire | null;
  consecutiveErrors?: number;
  consecutiveUndos?: number;
  hesitationSeconds?: number;
  /** Memory-circle (carry) digits per place, as typed. */
  memoryCircles?: Partial<Record<string, string | number>>;
  /** Result-row digits per place, as typed. */
  answerDigits?: Partial<Record<string, string>>;
  /** Effective operands (ASD-adjusted) so completed columns are judged against what is on screen. */
  operands?: { a: number; b: number; isSubtraction: boolean } | null;
  activeColumnIndex?: number;
  hasRegroupedInCanvas?: boolean;
  /** Columns whose conversion is done with the blocks (or written in a memory circle, meeting 8) — per column. */
  conversionsDone?: Place[];
  /** The enhanced support profile and the quiet mode: the engine writes shorter, more concrete cards (measured 1.10.2026). */
  learnerProfile?: { enhanced: boolean; quiet: boolean };
  recentEvents?: TelemetryPayload<TelemetryEventType>[];
  /**
   * What the static card chooser knows beyond the board (the place cues, the
   * cards already shown in this exercise), so the anchor the model gets is
   * the card the child would see. Never sent to the server.
   */
  cardContext?: StaticCardContext;
}

const WIRE_COLUMNS: Place[] = ['units', 'tens', 'hundreds', 'thousands'];

/** Terminology PRD Module 13 forbids in anything a learner reads; mirrored from functions/src/socraticContract.ts. */
export const FORBIDDEN_TERMS_HE = [
  'שבירה', 'לשבור', 'שוברים', 'נשבור',
  'הלוואה', 'ללוות', 'לווים', 'נלווה', 'להלוות',
  'נשיאה', 'נושאים', 'לשאת',
  'אבקוס', 'חשבונייה', 'מקלות', 'חרוזים', 'אצבעות', 'מטבעות', 'גפרורים', 'קשיות',
  // One name per component (owner, 27.9.2026, register ט).
  'קובי', 'בלוק', 'לוח הדינס', 'לוח הלבנים', 'קנבס',
  // The child reads "לבנים", never "לבני דינס" (register ט; audit 4.10.2026 A7-018).
  'דינס',
];

/**
 * The board named "לוח" ("הלוח", "בלוח") instead of "בית המספרים" (register ט).
 * A whole word only — "לוחצים" is not it — and "לוח החיבור", the addition
 * grid's own name, is allowed. Mirrored from functions/src/socraticContract.ts.
 */
export const BARE_BOARD_WORD_HE = /(^|[^א-ת])[ובלמהשכ]{0,4}לוח(?![א-ת])(?!\s+החיבור)/;

/**
 * Client-side copy of the server's two hard content rules (defence in depth —
 * the proxy already enforces them, but a card is shown to a child, so the
 * client refuses to render a leaked answer or a forbidden term even if a
 * stale or third-party server let one through).
 */
export function socraticTextViolation(
  texts: string[],
  operands?: { a: number; b: number; isSubtraction: boolean } | null
): string | null {
  for (const t of texts) {
    for (const term of FORBIDDEN_TERMS_HE) if (t.includes(term)) return `forbidden term: ${term}`;
    if (BARE_BOARD_WORD_HE.test(t)) return 'forbidden term: לוח';
  }
  if (operands) {
    const answer = operands.isSubtraction ? operands.a - operands.b : operands.a + operands.b;
    const exempt = answer === 10 || answer === 100 || answer === 1000 || answer === operands.a || answer === operands.b;
    if (!exempt) {
      const re = new RegExp(`(^|[^0-9])${answer}(?![0-9])`);
      // "1,573" and "1 573" are 1573 to the child (stripDigitGroupSeparators).
      if (texts.some((t) => re.test(stripDigitGroupSeparators(t)))) return 'final answer leaked';
    }
  }
  return null;
}

/**
 * Words for aids that meeting 8 does not put on the screen (PRD Module 14 §ב:
 * no blocks and no board in meetings 2 and 8). A card that names them points
 * the child at something that is not there (Module 13 §א). Mirrored on the
 * server (functions/src/socraticContract.ts).
 */
const WORD = (w: string) => new RegExp(`(^|[^א-ת])[ובלמהשכ]{0,4}(${w})(?![א-ת])`);
export const ABSENT_AIDS_MEETING_8_HE: RegExp[] = [
  WORD('לבנה|לבנים|לבנת|לבני'), // not "לבנות" (to build)
  WORD('פח'), // not "לפחות"
  WORD('מחסן'),
  WORD('לוח'), // not "לוחצים"
  WORD('קבץ|קבצו'), // the button "קבצו 10 לעשרת"
  WORD('דינס'),
  /קובי/,
  /בית המספרים/,
];

export function absentAidViolation(texts: string[], sessionNumber?: number | null): string | null {
  if (sessionNumber !== 8) return null;
  for (const raw of texts) {
    // מסמך 03's own meeting-8 question names the blocks to say they are gone
    // (its "לבני דינס" is "לבנים" on the screen: owner, 28.9.2026, register ט).
    const t = raw.replace(/אין לכם לבנים על המסך/g, '');
    for (const re of ABSENT_AIDS_MEETING_8_HE) if (re.test(t)) return `aid not on screen: ${re.source}`;
  }
  return null;
}

/** Exercises that are neither an addition nor a subtraction: no exercise_context goes to the model. */
export const NON_ARITHMETIC_TYPES = ['representation', 'flexible_decomp', 'missing_element', 'small_change'];

const PLACES_LOW_TO_HIGH: Place[] = ['units', 'tens', 'hundreds', 'thousands'];

/** Only what an instruction can contain reaches the server's whitelist (functions socraticContract.cleanInstruction). */
function instructionForEngine(text: string): string {
  return text
    .replace(/[^֐-׿0-9\s.,:;!?"'()\-–—−+=×▢↺/״׳%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

const standardCountsOf = (n: number): Partial<Record<Place, number>> => {
  const out: Partial<Record<Place, number>> = {};
  for (const p of PLACES_LOW_TO_HIGH) if (digitAt(n, p) > 0) out[p] = digitAt(n, p);
  return out;
};

/**
 * The board a break / grouping exercise builds BEFORE its conversion: a break
 * starts from the number's usual blocks (340 as 3 hundreds and 4 tens); a
 * grouping from the blocks before it (125 as 12 tens and 5 units — the same
 * reading as staticSocraticCards.composeGroupCard).
 */
function startCountsOf(task: any, kind: string): Partial<Record<Place, number>> | undefined {
  const after: Partial<Record<Place, number>> | undefined = task?.requiredCounts;
  if (!after || typeof task?.numberA !== 'number') return undefined;
  if (kind === 'compose_break') return standardCountsOf(task.numberA);
  if (kind === 'compose_group') {
    const made = [...PLACES_LOW_TO_HIGH].reverse().find((p) => (after[p] ?? 0) > 0);
    const from = made ? PLACES_LOW_TO_HIGH[PLACES_LOW_TO_HIGH.indexOf(made) - 1] : undefined;
    if (!made || !from) return undefined;
    const g = after[made] ?? 0;
    return { ...after, [from]: (after[from] ?? 0) + 10 * g, [made]: 0 };
  }
  return undefined;
}

/**
 * The task context of the request (1.10.2026; functions socraticContract
 * SocraticTaskContext): the kind of exercise, the instruction the screen shows,
 * and — for the leak check and the board comparison only — the board the
 * instruction asks for and the numbers the child must find. Without it, a
 * representation reached the model as its id and "the active column: units".
 */
export function socraticTaskContextFor(task: any, ctx?: StaticCardContext, counts?: Partial<Record<Place, number>>): GeminiSocraticRequest['task_context'] {
  if (!task || task.type === 'session1_intro') return undefined;
  const repKind = representationKindOf(task);
  const hasOps = typeof task.numberA === 'number' && typeof task.numberB === 'number';
  let kind: NonNullable<GeminiSocraticRequest['task_context']>['kind'];
  if (task.type === 'representation') kind = repKind ?? 'representation';
  else if (task.type === 'flexible_decomp') kind = 'flexible';
  else if (task.type === 'missing_element') kind = 'missing_element';
  else if (task.type === 'small_change') kind = 'small_change';
  else if (!hasOps) return undefined;
  else if (task.hiddenDigits?.a?.length || task.hiddenDigits?.b?.length) kind = 'skeleton';
  else if (Array.isArray(task.revealedResultDigits)) kind = 'missing_result_digit';
  else if (/תלמיד פתר .+ וקיבל/.test(String(task.instructionHe ?? ''))) kind = 'error_analysis';
  else kind = inferIsSubtraction(task) ? 'subtraction' : 'addition';

  const shownTexts = [task.instructionHe, task.givenHe, task.questionHe].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  const instruction = instructionForEngine(shownTexts.join(' '));
  if (!instruction || !/[א-ת]/.test(instruction)) return undefined;

  // What the child must find, for the server's leak check only: the client's
  // own list (secretNumbersOf), and on a choice task the numbers of the right
  // option that the screen does not show elsewhere.
  let secrets = secretNumbersOf(task).filter((n) => n !== 10 && n !== 100 && n !== 1000 && n <= 99999);
  if (kind === 'small_change' && Array.isArray(task.choices)) {
    const right = task.choices.find((c: any) => c?.correct === true || c?.id === task.correctAnswer);
    const onScreen = new Set(numbersInInstruction({ instructionHe: shownTexts.join(' ') }));
    if (right?.textHe) {
      secrets = [...secrets, ...numbersInInstruction({ instructionHe: right.textHe }).filter((n: number) => !onScreen.has(n) && n > 9)];
    }
  }
  const resultDigits: string[] | undefined = Array.isArray(task.revealedResultDigits) ? task.revealedResultDigits : undefined;
  const hiddenResult = kind === 'missing_result_digit' && hasOps
    ? PLACES_LOW_TO_HIGH.slice(0, String(task.isSubtraction ? task.numberA - task.numberB : task.numberA + task.numberB).length)
        .filter((p) => !(resultDigits ?? []).includes(p))
    : [];
  // An exercise that opens with its blocks on the board (meeting 1's 26
  // units; station 7's 2,730 since 4.10.2026): the opening board is the
  // exercise's, not the child's work — the function reads the board against
  // it, and never as something the child built.
  const given = task.type === 'representation' && task.initialCounts && typeof task.initialCounts === 'object'
    ? ({ ...task.initialCounts } as Partial<Record<Place, number>>)
    : undefined;
  const start = repKind ? startCountsOf(task, repKind) : given;
  const accepted = builtAnyWay(task, counts)
    ? Object.fromEntries(PLACES_LOW_TO_HIGH.filter((p) => (counts?.[p] ?? 0) > 0).map((p) => [p, counts![p]])) as Partial<Record<Place, number>>
    : null;
  return {
    kind,
    instruction_he: instruction,
    // "Build the number X" built another way (owner, 4.10.2026): the child's
    // own board is the required one, so the server never reads it as wrong.
    ...(task.requiredCounts ? { required_counts: accepted ?? { ...task.requiredCounts } } : {}),
    ...(start ? { start_counts: start } : {}),
    ...(given ? { start_given: true } : {}),
    ...(typeof ctx?.conversionDone === 'boolean' ? { conversion_done: ctx.conversionDone } : {}),
    ...(secrets.length ? { secret_numbers: [...new Set(secrets)].slice(0, 4) } : {}),
    ...(hiddenResult.length ? { hidden_result_places: hiddenResult } : {}),
  };
}

/** Same operation inference analyzeLiveBoardState uses, so the AI and the static engine never disagree on the sign. */
export function inferIsSubtraction(task: any, targetNode?: string): boolean {
  if (!task) return targetNode === 'subtraction_regrouping';
  // A bank exercise says what it is. Guessing from the instruction read
  // "חסרות שתי ספרות" (missing digits) and "החלק החסר" as a subtraction and
  // coached "build the first number, take the second away" on additions.
  if (typeof task.isSubtraction === 'boolean') return task.isSubtraction;
  if (['vertical_addition', 'addition_simple', 'representation', 'flexible_decomp', 'missing_element', 'small_change', 'session1_intro'].includes(task.type)) return false;
  return Boolean(task.isSubtraction) ||
    task.requiresUngrouping === true ||
    targetNode === 'subtraction_regrouping' ||
    (typeof task.instructionHe === 'string' && (task.instructionHe.includes('חסר') || task.instructionHe.includes('הפחת'))) ||
    (typeof task.exercise === 'string' && task.exercise.includes('-'));
}

/** Columns whose typed result digit already matches the exercise — "what is solved" in pillar 3. */
export function completedColumnsFrom(
  answerDigits: Partial<Record<string, string>> | undefined,
  operands: { a: number; b: number; isSubtraction: boolean } | null | undefined
): Place[] {
  if (!answerDigits || !operands) return [];
  const target = operands.isSubtraction ? operands.a - operands.b : operands.a + operands.b;
  return WIRE_COLUMNS.filter((place) => {
    const typed = answerDigits[place];
    if (typed === undefined || typed === '') return false;
    return parseInt(typed, 10) === digitAt(target, place);
  });
}

/** Up to two digits per circle (register gap טו: "12" above the units after a decomposition). */
export function toWireMemoryCircles(raw?: Partial<Record<string, string | number>>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === 'string' ? parseInt(v, 10) : v;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 99) out[k] = n;
  }
  return out;
}

/**
 * The learner's real recent events in this exercise (PRD Module 13 §א,
 * Appendix A §6 recent_actions). They used to be rebuilt from the store's
 * counters — undos all "DIGIT_ENTERED", digits all 0 and wrong, every
 * timestamp "now" — so the engine reasoned over steps the child never took.
 * The trigger, the streak counts and the board still travel in their own fields.
 */
function recentEventsFor(
  m: SocraticMonitoringSnapshot,
  studentId: number,
  exerciseId: string
): TelemetryPayload<TelemetryEventType>[] {
  if (m.recentEvents && m.recentEvents.length > 0) return m.recentEvents.slice(-MAX_RECENT_FOR_ENGINE);
  return recentTelemetryFor(studentId, exerciseId);
}

// ─────────────────────────────────────────────────────────────
// TASK-LEVEL SOCRATIC HINT MAP
// Each entry is keyed by task ID (exact match from sessionTasks.ts).
// The hints must address ONLY what is pedagogically required in that task.
// ─────────────────────────────────────────────────────────────
/** "יחידה אחת", not "1 יחידות". */
const unitsHe = (n: number) => (n === 1 ? 'יחידה אחת' : `${n} יחידות`);
/** "עשרת אחת", not "1 עשרות". */
const tensHe = (n: number) => (n === 1 ? 'עשרת אחת' : `${n} עשרות`);
/** "מאה אחת", not "1 מאות". */
const hundredsHe = (n: number) => (n === 1 ? 'מאה אחת' : `${n} מאות`);
/**
 * What a column holds, as the exercise card says it ("בטור העשרות יש 2 עשרות"):
 * the column by name, and "אין אף עשרת" rather than "יש לנו 0 עשרות".
 */
const inUnitsHe = (n: number) => (n === 0 ? 'בטור היחידות אין אף יחידה' : `בטור היחידות יש ${unitsHe(n)}`);
const inTensHe = (n: number) => (n === 0 ? 'בטור העשרות אין אף עשרת' : `בטור העשרות יש ${tensHe(n)}`);
const inHundredsHe = (n: number) => (n === 0 ? 'בטור המאות אין אף מאה' : `בטור המאות יש ${hundredsHe(n)}`);

/**
 * Station 1 (meeting 1): nothing on the screen or read aloud gives the child
 * the answer, a block count he must find himself, or where the difficulty is
 * (owner, 29.9.2026). The live cards of the other meetings name the column
 * and its count; in meeting 1 they ask instead, and the highlight is the
 * whole board rather than the column.
 */
const MEETING1_CROWDED_QUESTION = 'נסו לחשוב: באחד הטורים יש 10 לבנים או יותר. מה עושים?';
// Owner's D10 (1.10.2026): station 1's wrong options get "רמז:" and one
// guiding question, like stations 3–8. The question and the options are the
// owner's of 29.9.2026, unchanged.
function meeting1CrowdedCard(): SocraticHintResponse {
  return {
    pedagogical_intent: "procedural",
    tts_text: MEETING1_CROWDED_QUESTION,
    suggested_highlight: "tour-place-value-board",
    questionHe: MEETING1_CROWDED_QUESTION,
    choices: [
      { id: "opt_1", textHe: "מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו", isCorrect: true, feedbackHe: 'נכון מאוד! לחצו על הכפתור שמופיע בראש אותו טור.' },
      { id: "opt_2", textHe: "מוחקים 10 לבנים לפח בלי להוסיף לבנה", isCorrect: false, feedbackHe: HINT.deleteBlocks },
      { id: "opt_3", textHe: "מעבירים לבנה אחת בלבד לטור שמשמאלו", isCorrect: false, feedbackHe: "רמז: כמה לבנים צריך כדי לקבל לבנה אחת בטור שמשמאל?" }
    ],
    correctChoiceId: "opt_1",
    cardKind: 's1_crowded',
    situation: 's1_crowded',
    frameLevel: 1,
    intentHe: 'באחד הטורים יש 10 לבנים או יותר: מקבצים אותן ללבנה אחת של הטור שמשמאל, בלי לומר באיזה טור',
  };
}

/**
 * Meeting 1's subtraction-shortage card: the child finds the column himself.
 * `lacking` is every column whose blocks are fewer than the digit taken from
 * it, lowest first; the first is the one to fix. With more than one, the
 * question says where to start, so exactly one option is right.
 */
const DEFICIT_PLACES = ['units', 'tens', 'hundreds'] as const;
type DeficitPlace = typeof DEFICIT_PLACES[number];
const IN_COLUMN_HE: Record<DeficitPlace, string> = { units: 'בטור היחידות', tens: 'בטור העשרות', hundreds: 'בטור המאות' };
function meeting1DeficitCard(lacking: DeficitPlace[]): SocraticHintResponse {
  const question = lacking.length > 1
    // "נסו לחשוב:" opens every coaching card (owner); a second colon after it
    // becomes a full stop (audit A2-F15).
    ? 'נסו לחשוב: בודקים מטור היחידות שמאלה. באיזה טור אין מספיק לבנים כדי לחסר?'
    : 'נסו לחשוב: באיזה טור אין מספיק לבנים כדי לחסר?';
  const choices = DEFICIT_PLACES.map((p, i) => {
    const isCorrect = p === lacking[0];
    return {
      id: `opt_${i + 1}`,
      textHe: IN_COLUMN_HE[p],
      isCorrect,
      // D10 (owner, 1.10.2026): a wrong option gets "רמז:" and one guiding question.
      feedbackHe: isCorrect
        ? "נכון מאוד! לחצו על לבנה בטור שמשמאל לו כדי לפרוט אותה ל-10 לבנים."
        : lacking.includes(p)
          ? "רמז: מאיזה טור מתחילים לבדוק בחיסור?"
          : "רמז: האם בטור הזה יש פחות לבנים ממה שצריך להוציא ממנו?",
    };
  });
  return {
    pedagogical_intent: "procedural",
    tts_text: question,
    suggested_highlight: "tour-place-value-board",
    questionHe: question,
    choices,
    correctChoiceId: choices.find((c) => c.isCorrect)!.id,
    cardKind: 's1_deficit',
    situation: 's1_find_short_column',
    frameLevel: 1,
    intentHe: 'מוצאים בעצמכם את הטור שאין בו מספיק לבנים כדי לחסר, מטור היחידות שמאלה',
  };
}

export const TASK_HINTS: Record<string, SocraticHintResponse> = {

  // ── Session 1 — ארגז החול המונחה (מסמך 03 §3.1) ────────────────
  // The tool steps (session1_intro) never open a card: "התקדם" stays
  // disabled until the step is done, so no wrong answer is ever checked, and
  // the 45-second hesitation card is off for them (StudentWorkspacePage).
  // The sandbox entry is the one safety net that was there before.

  // Steps 1–5 (the sandbox entry serves every tool step). D10 (owner,
  // 1.10.2026), in its scope only (audit D17, 2.10.2026): the question and
  // the options are the card's own, unchanged; the wrong options' feedback
  // becomes "רמז:" and one guiding question, the right one opens "נכון מאוד!".
  's1_sandbox_controlled': {
    pedagogical_intent: "procedural",
    tts_text: 'הסתכלו ברשימה "מה עושים בשלב הזה". מה עוד נשאר לעשות כדי לעבור לשלב הבא?',
    suggested_highlight: "tour-place-value-board",
    questionHe: 'הסתכלו ברשימה "מה עושים בשלב הזה". מה עוד נשאר לעשות כדי לעבור לשלב הבא?',
    choices: [
      { id: "1", textHe: "לגרור עוד לבנים לטורים ולצפות בספרות בבית המספרים", isCorrect: true, feedbackHe: "נכון מאוד! גררו עוד לבנים, ושימו לב איך הספרות משתנות." },
      { id: "2", textHe: "לקבץ 10 עשרות ולהמיר אותן למאה אחת", isCorrect: false, feedbackHe: "רמז: מה כתוב בשורה שעוד לא סומנה ברשימה?" },
      { id: "3", textHe: "לכתוב מספר בשורת התוצאה", isCorrect: false, feedbackHe: "רמז: האם משהו ברשימה מבקש לכתוב מספר?" }
    ],
    correctChoiceId: "1",
    cardKind: 's1_card',
    situation: 's1_tool_step',
    frameLevel: 1,
    intentHe: 'בשלב הזה מכירים את הכלים: גוררים לבנים ומסתכלים איך הספרות בבית המספרים משתנות',
  },

  // Step 6, the target task (347 → 3 hundreds, 3 tens, 17 units): the card מסמך 03 §3.1 writes for meeting 1, meaning
  // unchanged, in the words of the screen (28.9.2026): "פורטים" as the task says "פרטו" (not "מפרקים"), "בית המספרים" for
  // the board (not "הלוח"), no formal "אנו"; the pieces are "לבנים" (owner, 27.9.2026; register ט).
  // The task asks "which number do the blocks show after the decomposition?"; the document's hints answered it
  // ("שומרת על ערך הכמות הכולל", "הכמות המתמטית נשמרת תמיד"). Now they send the child to the columns and the ten block
  // without saying what happens to the number (owner's instruction, 28.9.2026: change only the wording, so it no longer
  // gives the answer). "פורטים עשרת" takes no "לטור…": one decomposes a ten, into units (owner, 28.9.2026).
  's1_target_347': {
    pedagogical_intent: "conceptual",
    tts_text: "נסו לחשוב: מה קורה בבית המספרים כשפורטים עשרת אחת?",
    suggested_highlight: "tour-column-tens",
    questionHe: "נסו לחשוב: מה קורה בבית המספרים כשפורטים עשרת אחת?",
    choices: [
      { id: "opt_1", textHe: "מקבלים עשר יחידות שנוספות לטור היחידות", isCorrect: true, feedbackHe: "נכון מאוד! לחצו על לבנת עשרת, וראו את היחידות שנוספות לטור היחידות." },
      // D10 (owner, 1.10.2026): a guiding question. The card serves the board
      // before the break; after it, meeting1Card speaks (staticSocraticCards.ts).
      { id: "opt_2", textHe: "בית המספרים נשאר בלי שינוי", isCorrect: false, feedbackHe: "רמז: מה קורה ללבנת העשרת כשלוחצים עליה?" },
      { id: "opt_3", textHe: "העשרת נמחקת מבית המספרים", isCorrect: false, feedbackHe: "רמז: מה מופיע בבית המספרים במקום העשרת?" }
    ],
    correctChoiceId: "opt_1",
    cardKind: 's1_card',
    situation: 's1_break_a_ten',
    frameLevel: 1,
    intentHe: 'כשפורטים עשרת אחת, היא הופכת לעשר יחידות שנוספות לטור היחידות',
  },

  // Refresh, mirrors diagnostic task 1 (owner, 29.9.2026): 703 said in words.
  // Names none of its digits; the third option is the dropped zero (73).
  's1_r_words703': {
    pedagogical_intent: "conceptual",
    tts_text: "נסו לחשוב: איך כותבים בספרות מספר שכתוב במילים?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "נסו לחשוב: איך כותבים בספרות מספר שכתוב במילים?",
    choices: [
      { id: "opt_1", textHe: "כל טור מקבל תיבה משלו", isCorrect: true, feedbackHe: "נכון מאוד! בנו את המספר, וכתבו בכל תיבה כמה לבנים יש בטור שלה." },
      // D10 (owner, 1.10.2026): guiding questions.
      { id: "opt_2", textHe: "כל חלק כמו שהוא, זה אחרי זה", isCorrect: false, feedbackHe: HINT.oneDigitPerBox },
      { id: "opt_3", textHe: "רק את החלקים שנאמרים במילים", isCorrect: false, feedbackHe: HINT.emptyColumnBox }
    ],
    correctChoiceId: "opt_1",
    cardKind: 's1_card',
    situation: 's1_number_in_words',
    frameLevel: 1,
    intentHe: 'כל טור מקבל תיבה וספרה משלו, גם טור שאין בו לבנים',
  },

  // Refresh, mirrors diagnostic task 2 (owner, 29.9.2026): 368, the value of
  // the 6. Names neither 60 nor "עשרות": the child finds the place himself.
  's1_r_value368': {
    pedagogical_intent: "conceptual",
    tts_text: "נסו לחשוב: איך יודעים מה הערך של ספרה במספר?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "נסו לחשוב: איך יודעים מה הערך של ספרה במספר?",
    choices: [
      { id: "opt_1", textHe: "בודקים באיזה טור היא נמצאת", isCorrect: true, feedbackHe: "נכון מאוד! בדקו בבית המספרים כמה שווה כל לבנה בטור של הספרה." },
      // D10 (owner, 1.10.2026): guiding questions; neither names the 6's column.
      { id: "opt_2", textHe: "הערך שלה שווה תמיד לספרה", isCorrect: false, feedbackHe: "רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?" },
      { id: "opt_3", textHe: "סופרים את כל הלבנים יחד", isCorrect: false, feedbackHe: "רמז: האם שואלים על כל המספר, או על ספרה אחת?" }
    ],
    correctChoiceId: "opt_1",
    cardKind: 's1_card',
    situation: 's1_digit_value',
    frameLevel: 1,
    intentHe: 'ערך של ספרה תלוי בטור שבו היא בנויה',
  },

  // Refresh, mirrors diagnostic task 4 (owner, 29.9.2026): a number said in
  // words, written in digits. Names none of its digits.
  's1_r_words482': {
    pedagogical_intent: "conceptual",
    tts_text: "נסו לחשוב: איך כותבים בספרות מספר שכתוב במילים?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "נסו לחשוב: איך כותבים בספרות מספר שכתוב במילים?",
    choices: [
      { id: "opt_1", textHe: "כל חלק בתיבה של הטור שלו", isCorrect: true, feedbackHe: "נכון מאוד! בנו כל חלק בטור שלו, וכתבו ספרה אחת בכל תיבה." },
      // D10 (owner, 1.10.2026): guiding questions.
      { id: "opt_2", textHe: "כל חלק כמו שהוא, זה אחרי זה", isCorrect: false, feedbackHe: HINT.oneDigitPerBox },
      { id: "opt_3", textHe: "רק את החלק הראשון במספר", isCorrect: false, feedbackHe: "רמז: כמה חלקים יש במספר שבהנחיה?" }
    ],
    correctChoiceId: "opt_1",
    cardKind: 's1_card',
    situation: 's1_number_in_words',
    frameLevel: 1,
    intentHe: 'כל חלק של המספר בתיבה של הטור שלו, ספרה אחת בכל תיבה',
  },

  // Refresh, mirrors diagnostic task 5: 26 unit cubes grouped into tens. With
  // 10 or more units on the board the live card speaks; this one is true in
  // every other state and does not name the result.
  's1_r_group26': {
    pedagogical_intent: "conceptual",
    tts_text: "נסו לחשוב: מה צריך להיות בטור היחידות בסוף התרגיל?",
    suggested_highlight: "tour-column-units",
    questionHe: "נסו לחשוב: מה צריך להיות בטור היחידות בסוף התרגיל?",
    choices: [
      { id: "opt_1", textHe: "פחות מ-10 לבנים", isCorrect: true, feedbackHe: 'נכון מאוד! כשיש בטור 10 יחידות או יותר, לחצו על הכפתור "קבצו 10 לעשרת" שבראש הטור.' },
      // D10 (owner, 1.10.2026): guiding questions.
      { id: "opt_2", textHe: "כל הלבנים שהיו בטור", isCorrect: false, feedbackHe: "רמז: מה עושים עם כל 10 יחידות שבטור?" },
      { id: "opt_3", textHe: "אף לבנה, הטור ריק", isCorrect: false, feedbackHe: "רמז: אם בטור יש פחות מ-10 יחידות, האם אפשר לקבץ אותן?" }
    ],
    correctChoiceId: "opt_1",
    cardKind: 's1_card',
    situation: 's1_group_units',
    frameLevel: 1,
    intentHe: 'מקבצים כל 10 יחידות לעשרת אחת, עד שבטור נשארות פחות מ-10',
  },

  // Refresh, mirrors diagnostic task 6: 713 + 94 (1 ten + 9 tens = exactly 10
  // tens). With 10 or more tens on the board the live card speaks; this one is
  // true before and after the grouping, and does not give the tens digit away.
  's1_t8': {
    pedagogical_intent: "procedural",
    tts_text: "נסו לחשוב: בתרגיל 713 + 94, מה עושים כשבאחד הטורים יש 10 לבנים או יותר?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "נסו לחשוב: בתרגיל 713 + 94, מה עושים כשבאחד הטורים יש 10 לבנים או יותר?",
    choices: [
      { id: "opt_1", textHe: "מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו", isCorrect: true, feedbackHe: 'נכון מאוד! לחצו על הכפתור שמופיע בראש אותו טור.' },
      // D10 (owner, 1.10.2026): the guiding questions of stations 3–8.
      { id: "opt_2", textHe: "מוחקים 10 לבנים לפח בלי להוסיף לבנה", isCorrect: false, feedbackHe: HINT.deleteBlocks },
      { id: "opt_3", textHe: "רושמים 10 בתיבה אחת בשורת התוצאה", isCorrect: false, feedbackHe: HINT.oneDigitPerBox }
    ],
    correctChoiceId: "opt_1",
    cardKind: 's1_card',
    situation: 's1_group_in_addition',
    frameLevel: 1,
    intentHe: 'בחיבור, כשבאחד הטורים יש 10 לבנים או יותר, מקבצים אותן ללבנה אחת של הטור שמשמאל',
  },

  // Refresh, mirrors diagnostic task 3: 61 − 24, one borrow in the units.
  // Before the borrow the live deficit card speaks. This one is true at every
  // later point — just after the borrow, halfway through taking 24 away, or
  // after it — and does not give the result.
  's1_r_sub61': {
    pedagogical_intent: "procedural",
    tts_text: "נסו לחשוב: בחיסור 61 − 24, איך יודעים שסיימתם להוציא מבית המספרים?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "נסו לחשוב: בחיסור 61 − 24, איך יודעים שסיימתם להוציא מבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "כשהוצאתם 24 מבית המספרים", isCorrect: true, feedbackHe: "נכון מאוד! בדקו כמה כבר הוצאתם, וכתבו בשורת התוצאה את מה שנשאר בבית המספרים." },
      // D10 (owner, 1.10.2026): guiding questions.
      { id: "opt_2", textHe: "כשפרטתם עוד עשרת אחת", isCorrect: false, feedbackHe: "רמז: מתי פורטים לבנה: כשיש בטור מספיק לבנים, או כשאין?" },
      { id: "opt_3", textHe: "כשהוספתם 24 לבית המספרים", isCorrect: false, feedbackHe: HINT.addOrTakeOut }
    ],
    correctChoiceId: "opt_1",
    cardKind: 's1_card',
    situation: 's1_finished_taking_away',
    frameLevel: 1,
    intentHe: 'מסיימים להוציא כשהוצאתם את כל המספר השני, ואז כותבים את מה שנשאר',
  },

  // Refresh, mirrors diagnostic task 7: 806 − 351, a borrow into an empty tens
  // column. Before the borrow the live deficit card speaks. This one is true at
  // every later point, and does not give the result.
  's1_r_sub806': {
    pedagogical_intent: "procedural",
    tts_text: "נסו לחשוב: בחיסור 806 − 351, איך יודעים שסיימתם להוציא מבית המספרים?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "נסו לחשוב: בחיסור 806 − 351, איך יודעים שסיימתם להוציא מבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "כשהוצאתם 351 מבית המספרים", isCorrect: true, feedbackHe: "נכון מאוד! בדקו כמה כבר הוצאתם, וכתבו בשורת התוצאה את מה שנשאר בבית המספרים." },
      // D10 (owner, 1.10.2026): guiding questions.
      { id: "opt_2", textHe: "כשפרטתם עוד מאה אחת", isCorrect: false, feedbackHe: "רמז: מתי פורטים לבנה: כשיש בטור מספיק לבנים, או כשאין?" },
      { id: "opt_3", textHe: "כשהוספתם 351 לבית המספרים", isCorrect: false, feedbackHe: HINT.addOrTakeOut }
    ],
    correctChoiceId: "opt_1",
    cardKind: 's1_card',
    situation: 's1_finished_taking_away',
    frameLevel: 1,
    intentHe: 'מסיימים להוציא כשהוצאתם את כל המספר השני, ואז כותבים את מה שנשאר',
  },

  // ── Sessions 3–8 — the Socratic cards written in מסמך 03 (one card per session,
  //    with the board called "בית המספרים" and the pieces "לבנים": owner, 27.9.2026, register ט;
  //    served for every exercise of that session; session 3 has a card per path). ──
  // מסמך 03 §3.3 — no session card: its "34 עשרות / 34 מאות" marked the
  // instruction's own representation wrong in tasks 1, 2 and 4–6 (owner,
  // 28.9.2026, שהB.1). Every meeting-3 task gets the card of its own
  // instruction (staticSocraticCards.ts), and an unrecognised one gets
  // "איך יודעים איזה מספר בנוי בבית המספרים?" (resolveStaticHint).
  // מסמך 03 §3.4
  's4_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'נסו לחשוב: נצברו עשר יחידות בטור. מה עושים איתן?',
    suggested_highlight: "tour-column-units",
    questionHe: 'נסו לחשוב: נצברו עשר יחידות בטור. מה עושים איתן?',
    choices: [
      { id: "opt_1", textHe: 'מקבצים 10 יחידות לעשרת אחת ומעבירים אותה שמאלה לטור העשרות', isCorrect: true, feedbackHe: 'נכון מאוד! לחצו על הכפתור "קבצו 10" וצפו בעשרת הנודדת שמאלה.' },
      // Wrong options get a guiding question (owner, 30.9.2026).
      { id: "opt_2", textHe: 'משאירים את כולן בטור היחידות', isCorrect: false, feedbackHe: tenBlocksHint('units') },
      { id: "opt_3", textHe: 'מוחקים את היחידות המיותרות', isCorrect: false, feedbackHe: HINT.deleteBlocks }
    ],
    correctChoiceId: "opt_1",
    situation: 'session_card',
    frameLevel: 1,
    intentHe: 'בטור שמצטברות בו 10 לבנים או יותר מקבצים אותן ללבנה אחת של הטור שמשמאל',
  },
  // מסמך 03 §3.5
  's5_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'נסו לחשוב: אין מספיק יחידות כדי לחסר. מה עושים?',
    suggested_highlight: "tour-column-tens",
    questionHe: 'נסו לחשוב: אין מספיק יחידות כדי לחסר. מה עושים?',
    choices: [
      { id: "opt_1", textHe: 'פורטים עשרת אחת לעשר יחידות בודדות ומעבירים אותן לטור היחידות', isCorrect: true, feedbackHe: 'נכון מאוד! לחצו על לבנת עשרת אחת כדי לפרוט אותה לעשר יחידות.' },
      { id: "opt_2", textHe: 'מחסרים את המספר הקטן מהמספר הגדול בטור היחידות', isCorrect: false, feedbackHe: HINT.topOrBottom },
      { id: "opt_3", textHe: 'כותבים את התשובה בטור העשרות תחילה', isCorrect: false, feedbackHe: HINT.startSub }
    ],
    correctChoiceId: "opt_1",
    situation: 'session_card',
    frameLevel: 1,
    intentHe: 'כשאין מספיק לבנים כדי לחסר, פורטים לבנה מהטור שמשמאל',
  },
  // מסמך 03 §3.6
  's6_card':   {
    pedagogical_intent: "conceptual",
    error_category: "conceptual",
    tts_text: 'נסו לחשוב: איך פורטים כשבטור העשרות יש אפס?',
    suggested_highlight: "tour-column-hundreds",
    questionHe: 'נסו לחשוב: איך פורטים כשבטור העשרות יש אפס?',
    // Options in the impersonal present, like every card (owner, 30.9.2026).
    choices: [
      { id: "opt_1", textHe: 'פורטים תחילה לבנת מאה אחת לעשר עשרות בטור העשרות', isCorrect: true, feedbackHe: 'נכון מאוד! כעת לחצו על לבנת המאה וצפו בעשרות הנוצרות בבית המספרים.' },
      { id: "opt_2", textHe: 'מתעלמים מהאפס וממשיכים לטור הבא', isCorrect: false, feedbackHe: 'רמז: כשפורטים מאה אחת, מה מקבלים: עשר עשרות או עשר יחידות?' },
      { id: "opt_3", textHe: 'מוסיפים עשרת אחת לטור היחידות ללא פריטה', isCorrect: false, feedbackHe: HINT.addBlocks }
    ],
    correctChoiceId: "opt_1",
    situation: 'session_card',
    frameLevel: 1,
    intentHe: 'כשבטור שמשמאל יש אפס, פורטים מהטור הקרוב שיש בו, טור אחר טור',
  },
  // מסמך 03 §3.7
  's7_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'נסו לחשוב: איך מגלים כמה יחידות או עשרות חסרות כדי להגיע לתוצאה?',
    suggested_highlight: "tour-column-tens",
    questionHe: 'נסו לחשוב: איך מגלים כמה יחידות או עשרות חסרות כדי להגיע לתוצאה?',
    choices: [
      { id: "opt_1", textHe: 'נעזרים בלבנים משמאל, בודקים כמה עשרות יש כעת בבית המספרים וכמה חסרות כדי להגיע לתוצאה הרשומה בתרגיל', isCorrect: true, feedbackHe: 'נכון מאוד! בדקו בבית המספרים וכתבו את הספרה החסרה.' },
      { id: "opt_2", textHe: 'מנחשים מספר אקראי וכותבים אותו בתיבת התשובה', isCorrect: false, feedbackHe: 'רמז: איך אפשר לבדוק בבית המספרים אם הספרה נכונה?' },
      { id: "opt_3", textHe: 'עוברים קודם לטור הבא', isCorrect: false, feedbackHe: 'רמז: אם תעברו קודם לטור הבא, איך תדעו מה לרשום בעיגול הזיכרון?' }
    ],
    correctChoiceId: "opt_1",
    situation: 'session_card',
    frameLevel: 1,
    intentHe: 'בודקים בכל טור כמה חסר כדי להגיע לספרה של התוצאה',
  },
  // מסמך 03 §3.8
  's8_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'נסו לחשוב: כיצד תפתרו את התרגיל כאשר אין לכם לבנים על המסך?',
    suggested_highlight: "tour-column-units",
    questionHe: 'נסו לחשוב: כיצד תפתרו את התרגיל כאשר אין לכם לבנים על המסך?',
    choices: [
      { id: "opt_1", textHe: 'מתבוננים בתרגיל ונעזרים בעיגולי הזיכרון בראש הטורים כדי לנהל את פעולת ההמרה או הפריטה בשלבים', isCorrect: true, feedbackHe: 'נכון מאוד! התקדמו טור אחר טור ורשמו את המעברים בעיגולי הזיכרון.' },
      { id: "opt_2", textHe: 'מנחשים את התוצאה הסופית ומקלידים אותה מיד', isCorrect: false, feedbackHe: 'רמז: איך אפשר למצוא את התוצאה בלי לנחש?' },
      { id: "opt_3", textHe: 'מחכים שהתשובה הנכונה תופיע על המסך', isCorrect: false, feedbackHe: 'רמז: מאיזה טור אפשר להתחיל לפתור בעצמכם?' }
    ],
    correctChoiceId: "opt_1",
    situation: 'guessing_loop',
    frameLevel: 1,
    intentHe: 'בלי לבנים: לא מנחשים, פותרים טור אחר טור ורושמים כל המרה ופריטה בעיגולי הזיכרון',
  }
};

// ─────────────────────────────────────────────────────────────
// TARGET NODE FALLBACK MAP
// Used when the task has a targetNode but no specific task-ID entry above.
// ─────────────────────────────────────────────────────────────
const NODE_HINTS: Record<string, SocraticHintResponse> = {
  basic_addition_fluency: {
    pedagogical_intent: "conceptual",
    tts_text: "בנו את שני המספרים בבית המספרים וספרו כל טור בנפרד.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מחברים שני מספרים בבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "בונים את שני המספרים וסופרים את הלבנים בכל טור בנפרד" },
      { id: "opt_2", textHe: "בונים רק את המספר הגדול" },
      { id: "opt_3", textHe: "מוחקים את כל הלבנים ורושמים ישירות" }
    ],
    correctChoiceId: "opt_1"
  },
  regrouping_fluency: {
    pedagogical_intent: "procedural",
    tts_text: "כאשר יש 10 לבנים ומעלה בטור — מקבצים 10 מהן ללבנה אחת בטור הבא.",
    suggested_highlight: "tour-column-units",
    questionHe: "יש יותר מ-9 לבנים בטור — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "מקבצים 10 לבנים ללבנה גדולה אחת בטור הבא" },
      { id: "opt_2", textHe: "כותבים 10 בתוצאה" },
      { id: "opt_3", textHe: "מוחקים לבנים מיותרות" }
    ],
    correctChoiceId: "opt_1"
  },
  flexible_regrouping: {
    pedagogical_intent: "conceptual",
    tts_text: "ניתן לפרוט לבנה גדולה לקטנות יותר — הכמות הכוללת לא משתנה.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "כיצד מייצגים את אותו מספר בדרך אחרת?",
    choices: [
      { id: "opt_1", textHe: "פורטים לבנה גדולה ללבנים קטנות — הכמות נשמרת" },
      { id: "opt_2", textHe: "מוסיפים לבנים נוספות" },
      { id: "opt_3", textHe: "לכל מספר יש ייצוג אחד בלבד" }
    ],
    correctChoiceId: "opt_1"
  },
  procedural_fluency: {
    pedagogical_intent: "procedural",
    tts_text: "עבדו טור טור מימין לשמאל, ואל תשכחו לרשום את ההמרה בעיגול הזיכרון.",
    suggested_highlight: "tour-column-units",
    questionHe: "מה הסדר הנכון בחיבור במאונך?",
    choices: [
      { id: "opt_1", textHe: "מתחילים מהיחידות, עוברים לעשרות ואחר כך למאות, ורושמים כל המרה בעיגול הזיכרון" },
      { id: "opt_2", textHe: "מתחילים מהמספר הגדול" },
      { id: "opt_3", textHe: "אין חשיבות לסדר" }
    ],
    correctChoiceId: "opt_1"
  },
  zero_placeholder: {
    pedagogical_intent: "conceptual",
    tts_text: "כאשר טור ריק לחלוטין — כותבים 0 כדי לשמור על ערכי הטורים האחרים.",
    suggested_highlight: "tour-column-tens",
    questionHe: "מה קורה לספרות האחרות אם לא רושמים 0 בטור הריק?",
    choices: [
      { id: "opt_1", textHe: "הספרות יזוזו ממקומן וישנו את ערך המספר כולו" },
      { id: "opt_2", textHe: "כלום — אפשר לדלג על טורים ריקים" },
      { id: "opt_3", textHe: "הטורים הריקים לא משפיעים" }
    ],
    correctChoiceId: "opt_1"
  },
  relational_thinking: {
    pedagogical_intent: "focus",
    tts_text: "חשבו: אם הפעולה הפוכה — חיבור ↔ חיסור — מה אפשר לגלות מכך?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "איך פעולה הפוכה עוזרת לבדוק תשובה?",
    choices: [
      { id: "opt_1", textHe: "מחסרים את אחד המחוברים מהסכום — אם מקבלים את השני, נכון" },
      { id: "opt_2", textHe: "עושים שוב את אותה פעולה" },
      { id: "opt_3", textHe: "פעולה הפוכה לא קשורה לבדיקה" }
    ],
    correctChoiceId: "opt_1"
  },
  missing_subtrahend: {
    pedagogical_intent: "conceptual",
    tts_text: "אם יודעים מה נשאר — מורידים אותו מהמספר המקורי כדי לגלות את המספר שמחסרים.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מוצאים את המספר שמחסרים?",
    choices: [
      { id: "opt_1", textHe: "מהמספר שממנו מחסרים מורידים את התוצאה, ומקבלים את המספר שמחסרים" },
      { id: "opt_2", textHe: "מנחשים" },
      { id: "opt_3", textHe: "אי אפשר למצוא" }
    ],
    correctChoiceId: "opt_1"
  },
  missing_addend: {
    pedagogical_intent: "conceptual",
    tts_text: "מחובר ועוד מחובר שווה סכום. אם חסר מחובר, מחסרים מהסכום את המחובר הידוע.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מוצאים מחובר חסר?",
    choices: [
      { id: "opt_1", textHe: "מהסכום מחסרים את המחובר הידוע, ומקבלים את המחובר החסר" },
      { id: "opt_2", textHe: "מנחשים" },
      { id: "opt_3", textHe: "מחברים את כל המספרים" }
    ],
    correctChoiceId: "opt_1"
  }
};

const GENERAL_FALLBACK: SocraticHintResponse = {
  pedagogical_intent: "focus",
  tts_text: "בדקו מה בנוי בבית המספרים ומה הצעד הבא הנדרש.",
  suggested_highlight: "tour-place-value-board",
  questionHe: "מה הצעד הבא שצריך לעשות בבית המספרים?",
  // The card of stations 3–7 when a card is refused (enforceIronRule): its
  // wrong options get a guiding question like every other (owner, 30.9.2026).
  choices: [
    { id: "opt_1", textHe: "בודקים את בית המספרים — מספר הלבנים בכל טור ומה חסר", feedbackHe: "נכון מאוד! בדקו כמה לבנים יש בכל טור." },
    { id: "opt_2", textHe: "כותבים את התשובה מיד", feedbackHe: "רמז: איך תדעו שהתשובה נכונה בלי לבדוק את בית המספרים?" },
    { id: "opt_3", textHe: "מוחקים הכול ומתחילים מחדש", feedbackHe: "רמז: מה כבר בנוי בבית המספרים?" }
  ],
  correctChoiceId: "opt_1",
  situation: 'general_next_step',
  frameLevel: 1,
  intentHe: 'בודקים מה כבר בנוי בבית המספרים ומה הצעד הבא',
};

export class SocraticEngine {
  private static localHintCache: Map<string, SocraticHintResponse> = new Map();

  public static async prefetchSessionHints(sessionNumber: number): Promise<void> {
    // Cache both new node names and legacy node names the tests reference
    const nodesToCache: Record<string, SocraticHintResponse> = {
      regrouping_fluency: NODE_HINTS.regrouping_fluency,
      zero_placeholder: NODE_HINTS.zero_placeholder,
      procedural_fluency: NODE_HINTS.procedural_fluency,
      flexible_regrouping: NODE_HINTS.flexible_regrouping,
      relational_thinking: NODE_HINTS.relational_thinking,
      basic_addition_fluency: NODE_HINTS.basic_addition_fluency,
      // Legacy names kept for backward-compat with tests
      subtraction_regrouping: {
        pedagogical_intent: "procedural",
        tts_text: "חסרות יחידות בבית המספרים כדי לחסר. פרטו עשרת אחת ל-10 יחידות.",
        suggested_highlight: "tour-column-units",
        questionHe: "חסרות יחידות בבית המספרים לחיסור — מה עושים?",
        choices: [
          { id: "opt_1", textHe: "פורטים עשרת אחת מטור העשרות ל-10 יחידות" },
          { id: "opt_2", textHe: "מוסיפים יחידות חדשות" },
          { id: "opt_3", textHe: "מחסרים מלמטה למעלה" }
        ],
        correctChoiceId: "opt_1"
      },
      addition_regrouping: {
        pedagogical_intent: "procedural",
        tts_text: "יש יותר מ-9 לבנים בטור — קבצו 10 ללבנה אחת גדולה יותר.",
        suggested_highlight: "tour-column-units",
        questionHe: "יש יותר מ-9 לבנים בטור — מה עושים?",
        choices: [
          { id: "opt_1", textHe: "מקבצים 10 יחידות לעשרת אחת" },
          { id: "opt_2", textHe: "מוחקים את הלבנים המיותרות" },
          { id: "opt_3", textHe: "כותבים את המספר ישירות" }
        ],
        correctChoiceId: "opt_1"
      },
      q_matrix_general: GENERAL_FALLBACK
    };
    for (const [node, hint] of Object.entries(nodesToCache)) {
      this.localHintCache.set(`${sessionNumber}_${node}`, hint);
    }
  }

  public static getCachedHint(sessionNumber: number, targetNode: string): SocraticHintResponse | null {
    return this.localHintCache.get(`${sessionNumber}_${targetNode}`) ||
           this.localHintCache.get(`${sessionNumber}_regrouping_fluency`) ||
           null;
  }

  /**
   * Evaluates the live board state (counts, deficits, overcrowding, active operation)
   * to produce a high-precision, real-time Socratic question and 3 closed pedagogical options.
   */
  public static analyzeLiveBoardState(
    currentTask: any,
    targetNode: string,
    counts: { units: number; tens: number; hundreds: number; thousands: number },
    context: StaticCardContext = {}
  ): SocraticHintResponse | null {
    if (!counts) return null;

    // Sandbox / technical training or intro tasks must not trigger regrouping / arithmetic mentoring
    if (currentTask?.id === 's1_sandbox_controlled' || currentTask?.type === 'session1_intro') {
      return null;
    }
    // "160 is 100 and how much more?" — 16 tens or 10 units on the board are
    // a way of building 160, not a column to group; the missing-part card
    // speaks in every board state (owner, 28.9.2026, שהB.1).
    if (currentTask?.type === 'missing_element') return null;
    // The choice tasks (s4_g_t7, s5_g_t7): the board is the child's scratch
    // pad, and the card is about the two exercises (1.10.2026).
    if (currentTask?.type === 'small_change') return null;

    const meeting = meetingOfTaskId(currentTask?.id);
    const shown = (k: StaticCardKind) => (context.shownKinds ?? []).includes(k);
    const value = counts.units + counts.tens * 10 + counts.hundreds * 100 + counts.thousands * 1000;
    const a = typeof currentTask?.numberA === 'number' ? currentTask.numberA : null;
    const b = typeof currentTask?.numberB === 'number' ? currentTask.numberB : null;
    // Meeting 1 has no thousands column, so no "קבצו 10" button over the
    // hundreds: "click the button at the top of that column" pointed at
    // nothing (1.10.2026). A subtraction with both numbers built (806 + 351:
    // 11 hundreds) gets "what do you build in subtraction" (meeting1Card).
    const bothBuilt = currentTask?.isSubtraction === true && a !== null && value > a;
    // Its second card (2.10.2026): how a number is built with each digit in
    // its column — no column named (owner, 29.9.2026).
    if (meeting === 1 && counts.hundreds >= 10 && !bothBuilt) {
      return cardLadder(context, 'no_button', [['no_button', s1NoButtonCard], ['digits_in_columns', digitsInColumnsCard]]);
    }
    // Meeting 1's 347 with a hundred (or a second ten) broken: undo the break,
    // not "group the 10 or more" (1.10.2026).
    // Meeting 1's 26 worth another number now (blocks deleted or added): is it
    // the same number? Then back to the blocks it started with, before "10 or more".
    if (meeting === 1) {
      const wrongBreak = s1WrongBreakCard(currentTask, counts, context) ?? s1StartChangedCard(currentTask, counts, context);
      if (wrongBreak) return wrongBreak;
    }
    // More blocks than the two numbers need (audit C13, C14): taking the extra
    // ones out, not grouping them (1.10.2026). The second card: what is built
    // in this exercise — both numbers, each checked column by column.
    const stray = strayAddition(currentTask, counts);
    if (stray) {
      const ex = `${formatNumberHe(a!)} + ${formatNumberHe(b!)}`;
      return cardLadder(context, 'stray', [
        ['stray', () => (meeting === 1 ? strayBlocksCard(null) : strayBlocksCard(stray.column))],
        ['build_both', () => addBuildCard(ex)],
      ]);
    }

    // 1. Overcrowding Check (>= 10 blocks in a column). Three states where ten
    // or more in a column is the goal, not a mess: a representation whose
    // required board holds it (meeting 3's 13 and 14 tens, meeting 1's 347 as
    // 3, 3 and 17), a "two different representations" task (150 as 15 tens),
    // and a subtraction after a borrow (61 − 24 as 5 tens and 11 units).
    // "Group them back" would undo the very step the exercise asks for;
    // subtraction gets its own deficit reading below. Station 7's two-step
    // exercises too, on the way (3,400 + 1,000 − 600 as 3 thousands and 14
    // hundreds, before the 6 hundreds are removed) — until the board is worth
    // the number they end on (1.10.2026).
    const required = (currentTask?.requiredCounts ?? {}) as Partial<Record<'units' | 'tens' | 'hundreds', number>>;
    const stepsTarget = multiStepTarget(currentTask);
    // Meeting 1's subtraction finished with a block broken too many (806 − 351
    // ending with 15 units): the board is the result, and 10 or more in a
    // column cannot be written in a box — group it (analysts' matrix S21).
    // Stations 5–6 have their own card for it (staticSocraticCards).
    const subtractionDone = meeting === 1 && currentTask?.isSubtraction === true && a !== null && b !== null && value === a - b;
    // And "build the number X" with no word on how (owner, 4.10.2026): a
    // board worth X is right as it stands (340 as 34 tens).
    const accepted = builtAnyWay(currentTask, counts);
    const crowdingIsTheGoal = (place: 'units' | 'tens' | 'hundreds') =>
      accepted || (currentTask?.isSubtraction === true && !subtractionDone) || currentTask?.type === 'flexible_decomp' || (required[place] ?? 0) >= 10 ||
      (stepsTarget !== null && value !== stepsTarget);
    // Meeting 1: the column and its count stay for the child to find (owner, 29.9.2026).
    if (meeting === 1 &&
      (['units', 'tens', 'hundreds'] as const).some((p) => counts[p] >= 10 && !crowdingIsTheGoal(p))) {
      return shown('s1_crowded') ? s1GroupActionCard() : meeting1CrowdedCard();
    }
    // The second "10 or more" card of an exercise: the button itself (1.10.2026).
    const vertical = currentTask?.type === 'vertical_addition' || currentTask?.type === 'addition_simple';
    const crowded = (['units', 'tens', 'hundreds'] as const).find((p) => counts[p] >= 10 && !crowdingIsTheGoal(p));
    if (crowded && shown('crowded')) return groupActionCard(crowded, vertical);
    const crowdedFrame = (p: 'units' | 'tens' | 'hundreds', next: string) => ({
      cardKind: 'crowded' as const,
      situation: 'crowded_column',
      frameLevel: 2 as const,
      intentHe: `ב${p === 'units' ? 'טור היחידות' : p === 'tens' ? 'טור העשרות' : 'טור המאות'} יש 10 לבנים או יותר: מקבצים 10 מהן ל${next}`,
    });
    // Stations 3–7 hide the digit beside each column name and the child
    // counts the blocks, so the card names the column but not its count
    // (owner, 30.9.2026). Station 1 has its own card above; station 8 has no
    // board.
    if (counts.units >= 10 && !crowdingIsTheGoal('units')) {
      return {
        ...crowdedFrame('units', 'עשרת אחת'),
        pedagogical_intent: "procedural",
        tts_text: 'נסו לחשוב: בטור היחידות יש 10 לבנים או יותר. מה עושים?',
        suggested_highlight: "tour-column-units",
        questionHe: 'נסו לחשוב: בטור היחידות יש 10 לבנים או יותר. מה עושים?',
        choices: [
          {
            id: "opt_1",
            textHe: "אוספים 10 יחידות מטור היחידות ומקבצים אותן לעשרת אחת בטור העשרות",
            isCorrect: true,
            feedbackHe: 'נכון מאוד! לחצו על הכפתור "קבצו 10" שבראש טור היחידות.'
          },
          // Wrong options get a guiding question (owner, 30.9.2026).
          {
            id: "opt_2",
            textHe: "מוחקים 10 יחידות מטור היחידות לפח האשפה מבלי להוסיף עשרת",
            isCorrect: false,
            feedbackHe: HINT.deleteBlocks
          },
          {
            id: "opt_3",
            textHe: "מעבירים לבנה אחת בלבד לטור העשרות",
            isCorrect: false,
            feedbackHe: "רמז: כמה לבני יחידה שוות ללבנת עשרת אחת?"
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    if (counts.tens >= 10 && !crowdingIsTheGoal('tens')) {
      return {
        ...crowdedFrame('tens', 'מאה אחת'),
        pedagogical_intent: "procedural",
        tts_text: 'נסו לחשוב: בטור העשרות יש 10 לבנים או יותר. מה עושים?',
        suggested_highlight: "tour-column-tens",
        questionHe: 'נסו לחשוב: בטור העשרות יש 10 לבנים או יותר. מה עושים?',
        choices: [
          { 
            id: "opt_1", 
            textHe: "אוספים 10 עשרות ומקבצים אותן למאה אחת בטור המאות", 
            isCorrect: true, 
            feedbackHe: 'נכון מאוד! לחצו על הכפתור "קבצו 10" שבראש טור העשרות כדי להמיר למאה אחת.'
          },
          {
            id: "opt_2",
            textHe: "מוחקים עשרות מיותרות לפח האשפה",
            isCorrect: false,
            feedbackHe: HINT.deleteBlocks
          },
          {
            id: "opt_3",
            textHe: "רושמים מספר דו-ספרתי בתיבת העשרות",
            isCorrect: false,
            feedbackHe: HINT.oneDigitPerBox
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    if (counts.hundreds >= 10 && !crowdingIsTheGoal('hundreds')) {
      return {
        ...crowdedFrame('hundreds', 'אלף אחד'),
        pedagogical_intent: "procedural",
        tts_text: 'נסו לחשוב: בטור המאות יש 10 לבנים או יותר. מה עושים?',
        suggested_highlight: "tour-column-hundreds",
        questionHe: 'נסו לחשוב: בטור המאות יש 10 לבנים או יותר. מה עושים?',
        choices: [
          {
            id: "opt_1",
            textHe: "אוספים 10 מאות ומקבצים אותן לאלף אחד בטור האלפים",
            isCorrect: true,
            feedbackHe: 'נכון מאוד! לחצו על הכפתור "קבצו 10" שבראש טור המאות כדי לקבץ אותן לאלף אחד.'
          },
          {
            id: "opt_2",
            textHe: "משאירים 10 מאות באותו הטור",
            isCorrect: false,
            feedbackHe: tenBlocksHint('hundreds')
          },
          {
            id: "opt_3",
            textHe: "מוחקים מאות לפח האשפה",
            isCorrect: false,
            feedbackHe: HINT.deleteBlocks
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    // 2. Subtraction Deficit Checks
    // A skeleton whose first number is hidden is not solved by building that
    // number — and naming it would give the hidden digits away.
    const isSubtraction = inferIsSubtraction(currentTask, targetNode) && !currentTask?.hiddenDigits?.a?.length;

    let subtrahend = currentTask?.numberB;
    let minuend: number | undefined = typeof currentTask?.numberA === 'number' ? currentTask.numberA : undefined;
    if (typeof currentTask?.exercise === 'string' && currentTask.exercise.includes('-')) {
      const parts = currentTask.exercise.split('-');
      if (!subtrahend && parts[1]) {
        const parsed = parseInt(parts[1].trim(), 10);
        if (!isNaN(parsed)) subtrahend = parsed;
      }
      if (minuend === undefined && parts[0]) {
        const parsed = parseInt(parts[0].replace(/\D/g, ''), 10);
        if (!isNaN(parsed)) minuend = parsed;
      }
    }

    if (isSubtraction && subtrahend) {
      const unitsB = subtrahend % 10;
      const tensB = Math.floor((subtrahend % 100) / 10);
      const hundredsB = Math.floor((subtrahend % 1000) / 100);
      const boardValue = counts.units + counts.tens * 10 + counts.hundreds * 100 + counts.thousands * 1000;

      // Nothing on the canvas yet: the only sensible coaching is "build the first
      // number". A deficit read off an empty board ("יש לנו 0 עשרות") is nonsense.
      // The guiding questions of 30.9.2026, in station 1 too (owner's D10, 1.10.2026).
      // Its second card (2.10.2026): how the first number is built.
      if (boardValue === 0 && minuend !== undefined && shown('sub_board_empty')) {
        return cardLadder(context, 'sub_board_empty', [['build_number', () => buildNumberCard(minuend!, 'sub')]]);
      }
      if (boardValue === 0) {
        return {
          cardKind: 'sub_board_empty',
          family: 'sub_board_empty',
          pedagogical_intent: "procedural",
          tts_text: `בחיסור בונים בבית המספרים רק את המספר הראשון${minuend !== undefined ? ` (${formatNumberHe(minuend)})` : ''}, ואחר כך מוציאים ממנו.`,
          suggested_highlight: "tour-palette",
          questionHe: `נסו לחשוב: בית המספרים עדיין ריק. בחיסור, מה בונים קודם?`,
          choices: [
            {
              id: "opt_1",
              textHe: `בונים רק את המספר הראשון${minuend !== undefined ? ` (${formatNumberHe(minuend)})` : ''} בבית המספרים, ואחר כך מוציאים ממנו ${formatNumberHe(subtrahend)} לפח האשפה`,
              isCorrect: true,
              feedbackHe: 'נכון מאוד! בנו קודם את המספר הראשון, ורק אחר כך הוציאו ממנו את המספר השני.'
            },
            {
              id: "opt_2",
              textHe: "בונים את שני המספרים בבית המספרים ומחברים אותם",
              isCorrect: false,
              feedbackHe: HINT.secondNumber
            },
            {
              id: "opt_3",
              textHe: "מקלידים את התוצאה בלי לבנות כלום",
              isCorrect: false,
              feedbackHe: "רמז: בלי לבנים בבית המספרים, איך תמצאו את התוצאה?"
            }
          ],
          correctChoiceId: "opt_1",
          situation: 'sub_board_empty',
          frameLevel: 1,
          intentHe: 'בחיסור בונים קודם רק את המספר הראשון, ואחר כך מוציאים ממנו את השני',
        };
      }

      // A deficit is a property of the exercise (the minuend's digit is smaller
      // than the subtrahend's, after any borrow the column to its right needs),
      // not of whatever happens to be on the board right now. Reading it off the
      // board turned "470 − 250 with 2 tens left after removing 5" into a
      // demand to decompose a hundred. When the minuend is unknown the old
      // board-only reading is all there is.
      const digitsKnown = minuend !== undefined;
      const unitsA = digitsKnown ? minuend! % 10 : counts.units;
      const tensA = digitsKnown ? Math.floor((minuend! % 100) / 10) : counts.tens;
      const hundredsA = digitsKnown ? Math.floor((minuend! % 1000) / 100) : counts.hundreds;
      const needUnits = unitsA < unitsB;
      const needTens = tensA - (needUnits ? 1 : 0) < tensB;
      const needHundreds = hundredsA - (needTens ? 1 : 0) < hundredsB;

      // From here on the card reads a deficit off the board, which is only true
      // while the first number stands on it whole: once taking away starts,
      // "5 units, and 8 to take" asked for a second decomposition. In meetings
      // 3–7 the exercise card (staticSocraticCards.ts) reads the board itself,
      // and also handles the empty column on the way ("4,000 − 1,562": no ten
      // to break); this reading stays for meeting 1's refresh exercises.
      const deficitMeeting = meetingOfTaskId(currentTask?.id);
      if ((deficitMeeting !== null && deficitMeeting !== 1) || (digitsKnown && boardValue !== minuend)) return null;

      // Meeting 1: the same deficit, but the child finds the column; the
      // card names no column and no count (owner, 29.9.2026).
      if (deficitMeeting === 1) {
        const digitB: Record<DeficitPlace, number> = { units: unitsB, tens: tensB, hundreds: hundredsB };
        const first: DeficitPlace | null =
          needUnits && unitsB > 0 && counts.units < unitsB ? 'units'
          : needTens && tensB > 0 && counts.tens < tensB ? 'tens'
          : needHundreds && hundredsB > 0 && counts.hundreds < hundredsB ? 'hundreds'
          : null;
        if (first) {
          // The second card of the exercise: where the block to break comes from (1.10.2026).
          if (shown('s1_deficit')) return s1DeficitSecondCard();
          const lacking = DEFICIT_PLACES.filter((p) => p === first ||
            (DEFICIT_PLACES.indexOf(p) > DEFICIT_PLACES.indexOf(first) && digitB[p] > 0 && counts[p] < digitB[p]));
          return meeting1DeficitCard(lacking);
        }
      }

      // Check Units Deficit — real for this exercise, and not yet resolved on the board.
      if (needUnits && unitsB > 0 && counts.units < unitsB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `${inUnitsHe(counts.units)}, וצריך לחסר ${unitsB}. פרטו עשרת אחת ל-10 יחידות.`,
          suggested_highlight: "tour-column-tens",
          situation: 'deficit_column', frameLevel: 2, intentHe: 'בטור היחידות אין מספיק כדי לחסר: פורטים עשרת אחת לעשר יחידות',
          questionHe: `${inUnitsHe(counts.units)}, וצריך לחסר ${unitsHe(unitsB)}. מה הצעד הנכון לבצע?`,
          choices: [
            {
              id: "opt_1",
              textHe: "לוחצים על עשרת אחת מטור העשרות כדי לפרוט אותה ל-10 יחידות",
              isCorrect: true,
              feedbackHe: "נכון מאוד! לחצו על לבנת העשרת בבית המספרים כדי לפרוט אותה ל-10 יחידות."
            },
            {
              id: "opt_2",
              textHe: `מחסרים הפוך: ${unitsB} פחות ${counts.units}`,
              isCorrect: false,
              feedbackHe: HINT.topOrBottom
            },
            {
              id: "opt_3",
              textHe: unitsB - counts.units === 1 ? 'מוסיפים לבנת יחידה אחת חדשה' : `מוסיפים ${unitsB - counts.units} לבני יחידה חדשות`,
              isCorrect: false,
              feedbackHe: HINT.addBlocks
            }
          ],
          correctChoiceId: "opt_1"
        };
      }

      // Check Tens Deficit
      if (needTens && tensB > 0 && counts.tens < tensB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `${inTensHe(counts.tens)}, וצריך לחסר ${tensB}. פרטו מאה אחת ל-10 עשרות.`,
          suggested_highlight: "tour-column-hundreds",
          situation: 'deficit_column', frameLevel: 2, intentHe: 'בטור העשרות אין מספיק כדי לחסר: פורטים מאה אחת לעשר עשרות',
          questionHe: `${inTensHe(counts.tens)}, וצריך לחסר ${tensHe(tensB)}. מאיזה טור שכן אפשר לפרוט לבנה?`,
          choices: [
            {
              id: "opt_1",
              textHe: "לוחצים על מאה אחת מטור המאות כדי לפרוט אותה ל-10 עשרות",
              isCorrect: true,
              feedbackHe: "נכון מאוד! לחצו על לבנת המאה בבית המספרים כדי לפרוט אותה ל-10 עשרות."
            },
            {
              id: "opt_2",
              textHe: `מחסרים הפוך: ${tensB} פחות ${counts.tens}`,
              isCorrect: false,
              feedbackHe: HINT.topOrBottom
            },
            {
              id: "opt_3",
              textHe: "מוחקים לבנת מאה לפח האשפה",
              isCorrect: false,
              feedbackHe: HINT.deleteBlocks
            }
          ],
          correctChoiceId: "opt_1"
        };
      }

      // Check Hundreds Deficit
      if (needHundreds && hundredsB > 0 && counts.hundreds < hundredsB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `${inHundredsHe(counts.hundreds)}, וצריך לחסר ${hundredsB}. פרטו אלף אחד ל-10 מאות.`,
          suggested_highlight: "tour-column-thousands",
          situation: 'deficit_column', frameLevel: 2, intentHe: 'בטור המאות אין מספיק כדי לחסר: פורטים אלף אחד לעשר מאות',
          questionHe: `${inHundredsHe(counts.hundreds)}, וצריך לחסר ${hundredsHe(hundredsB)}. מה עושים?`,
          choices: [
            { 
              id: "opt_1", 
              textHe: "לוחצים על אלף אחד מטור האלפים כדי לפרוט אותו ל-10 מאות",
              isCorrect: true,
              feedbackHe: "נכון מאוד! לחצו על לבנת האלף בטור האלפים כדי לפרוט אותה ל-10 מאות."
            },
            {
              id: "opt_2",
              textHe: `מחסרים הפוך: ${hundredsB} פחות ${counts.hundreds}`,
              isCorrect: false,
              feedbackHe: HINT.topOrBottom
            },
            {
              id: "opt_3",
              textHe: "מוסיפים לבני מאה חדשות",
              isCorrect: false,
              feedbackHe: HINT.addBlocks
            }
          ],
          correctChoiceId: "opt_1"
        };
      }
    }

    // (A "zero placeholder" card used to follow: "when the tens column has no
    // blocks, write 0 in the tens". It fired on every meeting-6 exercise with an
    // empty board — 602 − 145, whose tens result is 5 — and on 6,0▢▢ − 2,847,
    // where it told the child a hidden digit. Removed; the exercise card
    // (staticSocraticCards.ts) speaks of the zero the exercise really has.)

    return null;
  }

  /**
   * Grounded Hybrid Socratic Query via Gemini (Modules 12–13)
   * Feeds both the Q-Matrix baseline reference and live board state into Gemini
   * under the Holistic Pedagogical Triad (Exercise + Board State + Student Progress)
   * to generate a coherent, context-tailored Socratic question and 3 closed options.
   */
  static async fetchGroundedGeminiSocraticQuery(params: {
    currentTask: any;
    targetNode: string;
    activeColumnName: string;
    counts: { units: number; tens: number; hundreds: number; thousands: number };
    recentActions?: string[];
    qMatrixAnchor: SocraticHintResponse;
    monitoring?: SocraticMonitoringSnapshot;
    /** Told why, whenever this returns null (7.10.2026: the static card records it). */
    onFallback?: (reason: SocraticFallbackReason, detail?: string) => void;
  }): Promise<SocraticHintResponse | null> {
    const fallback = (reason: SocraticFallbackReason, detail?: string): null => {
      params.onFallback?.(reason, detail);
      return null;
    };
    try {
      const { currentTask, targetNode, activeColumnName, counts, recentActions, qMatrixAnchor } = params;
      const monitoring: SocraticMonitoringSnapshot = params.monitoring ?? {};

      // Sandbox / intro tasks are never AI-coached (Module 12): nothing to diagnose.
      if (currentTask?.id === 's1_sandbox_controlled' || currentTask?.type === 'session1_intro') {
        return fallback('not_coached');
      }

      // ── Pillar 1: the exercise ─────────────────────────────────────────
      const colIdx = Math.max(0, Math.min(3, monitoring.activeColumnIndex ?? Math.max(0, ['יחידות', 'עשרות', 'מאות', 'אלפים'].indexOf(activeColumnName))));
      const activeColumn = WIRE_COLUMNS[colIdx];
      // A representation, a "different ways" task and a missing part are
      // not an addition or a subtraction: "160 is 100 and how much more?"
      // went to the model as 100 + 160 (owner, 28.9.2026, שהB.1).
      const arithmetic = !NON_ARITHMETIC_TYPES.includes(currentTask?.type);
      const operands: { a: number; b: number; isSubtraction: boolean } | null = !arithmetic ? null :
        monitoring.operands ??
        (typeof currentTask?.numberA === 'number' && typeof currentTask?.numberB === 'number'
          ? { a: currentTask.numberA, b: currentTask.numberB, isSubtraction: inferIsSubtraction(currentTask, targetNode) }
          : null);

      const rawStudent = monitoring.studentId ?? normalizeStudentId(String(currentTask?.studentId ?? '1'));
      const studentNum = typeof rawStudent === 'number' ? rawStudent : parseInt(String(rawStudent).replace(/\D/g, '') || '1', 10);
      const studentId = Math.min(12, Math.max(1, Number.isNaN(studentNum) ? 1 : studentNum));
      const sessionNumber = monitoring.sessionNumber ?? (parseInt(String(currentTask?.id ?? '').replace(/^s(\d+).*/, '$1'), 10) || 0);
      const sessionId = `session_${sessionNumber || 'x'}_student_${studentId}`;
      const exerciseId = String(currentTask?.id ?? targetNode ?? 'unknown').slice(0, 64);

      let exerciseContext: GeminiSocraticRequest['exercise_context'];
      if (operands && operands.a >= 0 && operands.b >= 0 && !(operands.isSubtraction && operands.b > operands.a)) {
        // A skeleton's hidden digits never leave the client as digits.
        const hiddenA: Place[] = currentTask?.hiddenDigits?.a ?? [];
        const hiddenB: Place[] = currentTask?.hiddenDigits?.b ?? [];
        const da = hiddenA.includes(activeColumn) ? '▢' : digitAt(operands.a, activeColumn);
        const db = hiddenB.includes(activeColumn) ? '▢' : digitAt(operands.b, activeColumn);
        exerciseContext = {
          operation: operands.isSubtraction ? 'subtraction' : 'addition',
          number_a: operands.a,
          number_b: operands.b,
          session_id: sessionId,
          session_topic: String(currentTask?.titleHe ?? '').slice(0, 120),
          active_column: activeColumn,
          active_column_index: colIdx,
          target_sub_problem: operands.isSubtraction ? `${da} - ${db}` : `${da} + ${db}`,
          ...(hiddenA.length || hiddenB.length ? { hidden_places: { a: hiddenA, b: hiddenB } } : {}),
        };
      }

      // ── Pillar 3: what was monitored ───────────────────────────────────
      const memoryCircles = toWireMemoryCircles(monitoring.memoryCircles);
      const completedColumns = completedColumnsFrom(monitoring.answerDigits, operands);
      const currentInput = monitoring.answerDigits?.[activeColumn] ?? null;
      const triggerReason: SocraticTriggerReasonWire =
        monitoring.triggerReason ??
        ((monitoring.consecutiveErrors ?? 0) >= 4
          ? 'consecutive_errors_4'
          : (monitoring.consecutiveUndos ?? 0) >= 3
          ? 'consecutive_undos_3'
          : 'hesitation_45s');
      const recentEvents = recentEventsFor(monitoring, studentId, exerciseId);

      const socraticRequest = SocraticEngine.buildGeminiSocraticRequest({
        studentId,
        sessionId,
        exerciseId,
        activeColumnIndex: colIdx,
        exerciseContext,
        workspaceState: {
          ones_count: counts.units || 0,
          tens_count: counts.tens || 0,
          hundreds_count: counts.hundreds || 0,
          thousands_count: counts.thousands || 0,
          memory_circles: memoryCircles,
          is_regrouped_in_canvas: monitoring.hasRegroupedInCanvas,
          ...(monitoring.conversionsDone ? { conversions_done: monitoring.conversionsDone } : {}),
        },
        studentProgressState: {
          completed_columns: completedColumns,
          current_column_input: currentInput && /^\d{1,4}$/.test(currentInput) ? currentInput : null,
          memory_circles_state: memoryCircles,
          trigger_reason: triggerReason,
          consecutive_errors_count: monitoring.consecutiveErrors ?? 0,
          recent_actions: recentEvents,
          ...(monitoring.hesitationSeconds ? { hesitation_seconds: Math.min(3600, Math.round(monitoring.hesitationSeconds)) } : {}),
          ...(monitoring.cardContext?.shownKinds?.length ? { earlier_card_kinds: [...monitoring.cardContext.shownKinds] } : {}),
        },
        recentActions: recentEvents,
      });
      const taskContext = socraticTaskContextFor(currentTask, monitoring.cardContext, counts);
      if (taskContext) socraticRequest.task_context = taskContext;
      socraticRequest.card_frame = cardFrameOf(qMatrixAnchor, currentTask);
      if (monitoring.learnerProfile && (monitoring.learnerProfile.enhanced || monitoring.learnerProfile.quiet)) {
        socraticRequest.learner_profile = { enhanced: monitoring.learnerProfile.enhanced, quiet: monitoring.learnerProfile.quiet };
      }

      // The static card is the pedagogical baseline the model must improve on,
      // never contradict — its level, terms and form, feedback included
      // (owner, 1.10.2026: the static cards set the engine's boundaries).
      const anchor = {
        questionHe: qMatrixAnchor.questionHe,
        pedagogical_intent: qMatrixAnchor.pedagogical_intent,
        choices: (qMatrixAnchor.choices || []).slice(0, 3).map((c) => ({
          id: c.id,
          textHe: c.textHe,
          isCorrect: c.isCorrect ?? (qMatrixAnchor.correctChoiceId ? c.id === qMatrixAnchor.correctChoiceId : undefined),
          ...(c.feedbackHe ? { feedbackHe: c.feedbackHe } : {}),
        })),
      };

      // Both guards use the same ceiling: the callable's own timeout, and a
      // local race so a hung transport can never outlive the static fallback.
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ data: any }>((_, reject) => {
        raceTimer = setTimeout(() => reject(new Error('Gemini Socratic Proxy timeout')), SOCRATIC_PROXY_TIMEOUT_MS);
      });

      const res = await Promise.race([
        SocraticEngine.callGeminiProxy({
          socratic_request: socraticRequest,
          anchor,
        }),
        timeoutPromise,
      ]).finally(() => {
        if (raceTimer) clearTimeout(raceTimer);
      });

      const data = res?.data;
      if (!data) return fallback('schema_rejected', 'empty');

      const parsed = typeof data === 'string' ? JSON.parse(data) : (data?.rawText ? JSON.parse(data.rawText) : data);
      // PRD shape (guiding_question / options[].option_text) or the older
      // final_intervention wrapper — both are read, the PRD shape wins.
      const body = parsed?.guiding_question ? parsed : (parsed?.final_intervention ?? parsed);
      const guidingQuestion = body?.guiding_question;
      const optionsList = body?.options;
      const rawErrorCategory = body?.error_category;

      const validCategories = ['calculation', 'procedural', 'conceptual'];
      const isValidCategory = typeof rawErrorCategory === 'string' && validCategories.includes(rawErrorCategory.toLowerCase());

      // Module 13(a): Rigid validation — missing guiding_question, wrong options count, or missing/invalid error_category MUST fail validation
      if (typeof guidingQuestion !== 'string' || !guidingQuestion.trim() || !Array.isArray(optionsList) || optionsList.length !== 3 || !isValidCategory) {
        console.warn('[Gemini Proxy] Schema validation failed for response (missing required fields or invalid error_category):', parsed);
        return fallback('schema_rejected', 'fields');
      }

      const choices = optionsList.map((opt: any, idx: number) => ({
        id: `opt_${idx + 1}`,
        textHe: String(opt?.option_text ?? opt?.text ?? ''),
        feedbackHe: typeof (opt?.feedback_text ?? opt?.feedback) === 'string' ? String(opt.feedback_text ?? opt.feedback) : undefined,
        isCorrect: opt?.is_correct === true,
      }));

      if (choices.some((c: { textHe: string }) => !c.textHe.trim()) || choices.filter((c: { isCorrect: boolean }) => c.isCorrect).length !== 1) {
        console.warn('[Gemini Proxy] Options rejected: every option needs text and exactly one must be correct.');
        return fallback('schema_rejected', 'options');
      }

      const aiTexts = [guidingQuestion, ...choices.flatMap((c: { textHe: string; feedbackHe?: string }) => [c.textHe, c.feedbackHe ?? ''])];
      // The model receives the whole exercise, hidden digits included. What
      // the screen hides (a skeleton's operand, a number the task asks for)
      // must not come back in the card; and in meeting 8 there are no blocks,
      // no trash and no number house to point at (PRD Module 13 §א).
      const aiSecrets = secretNumbersOf(currentTask).filter((n) => n !== 10 && n !== 100 && n !== 1000);
      // ...and, where the child finds a number rather than a result, also
      // written as blocks: "6 עשרות" is s3_r_t7's missing 60. Not in an
      // addition or a subtraction, where the board — both numbers built,
      // not yet grouped — is worth the result and naming it is the coaching.
      // Except in meeting 1, where the child finds the counts himself and no
      // card may give them (owner, 29.9.2026).
      const countsAreTheCoaching = arithmetic && sessionNumber !== 1;
      // A hidden single digit the screen shows nowhere (the 8 of 3▢6 + 271 =
      // 657) is a secret in any wording: "מוסיפים 8" (final review, 2.10.2026).
      const hiddenLeak = revealsSecret(aiTexts, aiSecrets) ??
        revealsHiddenDigit(aiTexts, currentTask) ??
        (countsAreTheCoaching ? null : revealsSecretInCounts(aiTexts, aiSecrets));
      // What the exercise itself shows is not a count of the board: the active
      // column's digits ("7 + 5") and every number of the instruction.
      const shownNumbers = [
        ...(operands ? [digitAt(operands.a, activeColumn), digitAt(operands.b, activeColumn)] : []),
        ...numbersInInstruction(currentTask),
      ];
      const violation =
        // A skeleton exercise shows its result; the digits it hides are the secret.
        socraticTextViolation(aiTexts, Array.isArray(currentTask?.revealedResultDigits) ? null : operands) ??
        (hiddenLeak !== null ? 'hidden number leaked' : null) ??
        (contradictsRequiredRepresentation(currentTask, choices) ? 'marks the instruction\'s representation wrong' : null) ??
        absentAidViolation(aiTexts, sessionNumber) ??
        // Stations 3–8 (owner, 30.9.2026): a wrong option's hint is "רמז:" and a
        // guiding question; an engine card that explains instead is refused
        // and the child gets the static card, whose hints are questions.
        (sessionNumber >= 3 ? wrongHintViolation({ choices }) : null) ??
        // Station 1 (the child finds the counts) and stations 3–7 (the digit
        // beside each column name is hidden): the child counts the blocks. An
        // engine card that gives a column's count as it is on the board now is
        // refused, and the static card is shown (owner, 29–30.9.2026).
        ((sessionNumber === 1 || (sessionNumber >= 3 && sessionNumber <= 7)) && statesBoardCount(aiTexts, counts, shownNumbers) !== null
          ? 'states a column\'s block count'
          : null);
      if (violation) {
        console.warn('[Gemini Proxy] Response rejected by content rule:', violation);
        return fallback('rule_rejected', ruleCode(violation));
      }

      const errorCategory = rawErrorCategory.toLowerCase() as 'calculation' | 'procedural' | 'conceptual';

      if (parsed.hard_evidence_log && Array.isArray(parsed.hard_evidence_log)) {
        console.info('[Gemini Socratic Engine] Hard Evidence Log:', parsed.hard_evidence_log);
      }

      const correctOpt = choices.find((c: { isCorrect: boolean }) => c.isCorrect) || choices[0];

      return {
        pedagogical_intent: errorCategory === 'conceptual' ? 'conceptual' : 'procedural',
        error_category: errorCategory,
        questionHe: guidingQuestion,
        choices,
        correctChoiceId: correctOpt.id,
        source: 'gemini',
        ...(typeof parsed?.meta?.model_id === 'string' ? { modelId: String(parsed.meta.model_id).slice(0, 48) } : {}),
        // The AI card was written inside the static card's frame: it keeps its situation and level.
        situation: socraticRequest.card_frame?.situation,
        frameLevel: socraticRequest.card_frame?.level,
      };
    } catch (err) {
      console.warn('[Gemini Socratic Engine] Cloud Function proxy query fallback triggered:', err);
      // A reply that is not JSON at all is a malformed card, not a failure of the call.
      if (err instanceof SyntaxError) return fallback('schema_rejected', 'json');
      const { reason, detail } = fallbackReasonOfError(err);
      return fallback(reason, detail);
    }
  }

  /**
   * The teacher's warm-up when a meeting is activated (1.10.2026): one staff
   * call that only starts the proxy's server instance — the server answers
   * { warm: true } without calling the model and writes nothing. Fire and
   * forget: nothing waits for it, and a failure is silent.
   */
  public static warmUp(): void {
    try {
      const fn = httpsCallable<{ warm: true }, { warm?: boolean }>(functions, "callGeminiSocraticProxy", { timeout: 20_000 });
      fn({ warm: true }).catch(() => undefined);
    } catch {
      // no functions instance (tests, offline): nothing to warm
    }
  }

  /**
   * Secure Cloud Function Proxy caller for Gemini Socratic queries.
   */
  public static async callGeminiProxy(data: SocraticProxyPayload): Promise<{ data: any }> {
    const fn = httpsCallable<SocraticProxyPayload, any>(
      functions,
      "callGeminiSocraticProxy",
      // Module 13: a hung AI call must yield to the static Socratic hint quickly.
      // The SDK's 70s default leaves a 3rd-grader staring at a spinner mid-exercise
      // when the far cheaper, pedagogically valid fallback is already on hand.
      { timeout: SOCRATIC_PROXY_TIMEOUT_MS }
    );
    return fn(data);
  }

  /**
   * Legacy fetchGeminiSocraticQuery alias for backward-compatibility.
   */
  static async fetchGeminiSocraticQuery(
    studentIdNum: number,
    taskId: string,
    activeColumn: string,
    counts: { units: number; tens: number; hundreds: number; thousands: number },
    memoryCircles?: Partial<Record<string, string>>,
    recentActions?: string[]
  ): Promise<SocraticHintResponse | null> {
    const qMatrixAnchor = TASK_HINTS[taskId] || GENERAL_FALLBACK;
    return SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: { id: taskId, titleHe: `Student #${studentIdNum}` },
      targetNode: taskId,
      activeColumnName: activeColumn,
      counts,
      recentActions,
      qMatrixAnchor
    });
  }

  /**
   * יוצר אובייקט בקשה מאומת בדיוק לפי סכמת GeminiSocraticRequest (נספח א' §6 ומודול 13).
   * משתמש במזהה student_id קנוני (1-12) בלבד ומעביר את כל רכיבי השילוש הפדגוגי ההוליסטי.
   */
  static buildGeminiSocraticRequest(params: {
    studentId: number | string;
    sessionId: string;
    exerciseId: string;
    activeColumnIndex: number;
    exerciseContext?: {
      operation: 'addition' | 'subtraction';
      number_a: number;
      number_b: number;
      session_id: string;
      session_topic: string;
      active_column: 'units' | 'tens' | 'hundreds' | 'thousands';
      active_column_index: number;
      target_sub_problem: string;
    };
    workspaceState: {
      ones_count: number;
      tens_count: number;
      hundreds_count: number;
      thousands_count?: number;
      memory_circles?: Record<string, number>;
      is_regrouped_in_canvas?: boolean;
      conversions_done?: Place[];
    };
    studentProgressState?: GeminiSocraticRequest['student_progress_state'];
    recentActions?: TelemetryPayload<TelemetryEventType>[];
  }): GeminiSocraticRequest {
    const rawId = typeof params.studentId === 'number' 
      ? params.studentId 
      : parseInt(String(params.studentId).replace(/\D/g, '') || '1', 10);
    const student_id = Math.min(12, Math.max(1, isNaN(rawId) ? 1 : rawId));

    return {
      student_id,
      session_id: params.sessionId,
      exercise_id: params.exerciseId,
      active_column_index: params.activeColumnIndex,
      exercise_context: params.exerciseContext,
      workspace_state: {
        ones_count: params.workspaceState.ones_count,
        tens_count: params.workspaceState.tens_count,
        hundreds_count: params.workspaceState.hundreds_count,
        thousands_count: params.workspaceState.thousands_count || 0,
        memory_circles: params.workspaceState.memory_circles || {},
        is_regrouped_in_canvas: params.workspaceState.is_regrouped_in_canvas,
        ...(params.workspaceState.conversions_done ? { conversions_done: params.workspaceState.conversions_done } : {}),
      },
      student_progress_state: params.studentProgressState,
      recent_actions: params.recentActions || [],
    };
  }

  /**
   * מנגנון עמידות ונסיגה (Fallback):
   * שולח שאילתה ל-Gemini API ובמקרה של כשל רשת, Timeout או שגיאת 500,
   * מזריק מיד רמז סוקרטי סטטי מוגדר מראש ללא קריסת הממשק.
   */
  static async requestSocraticHintWithFallback(
    request: GeminiSocraticRequest,
    fallbackTask?: any
  ): Promise<SocraticHintResponse> {
    const staticFallback: SocraticHintResponse = (fallbackTask?.id && TASK_HINTS[fallbackTask.id]) || {
        pedagogical_intent: 'conceptual',
        error_category: 'conceptual',
        questionHe: 'מה הפעולה המתמטית שצריך לבצע בבית המספרים?',
        choices: [
          { id: 'opt_1', textHe: 'לבדוק את כמות הלבנים בכל טור בבית המספרים', isCorrect: true },
          { id: 'opt_2', textHe: 'לפרוט עשרת אחת ל-10 יחידות', isCorrect: false },
          { id: 'opt_3', textHe: 'לקבץ 10 יחידות לעשרת אחת', isCorrect: false },
        ],
        correctChoiceId: 'opt_1',
      };

    try {
      const hint = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
        currentTask: fallbackTask || { id: request.exercise_id },
        targetNode: request.exercise_id,
        activeColumnName: ['יחידות', 'עשרות', 'מאות'][request.active_column_index] || 'יחידות',
        counts: {
          units: request.workspace_state.ones_count,
          tens: request.workspace_state.tens_count,
          hundreds: request.workspace_state.hundreds_count,
          thousands: 0,
        },
        recentActions: (request.recent_actions || []).map((a) => String(a.event_type)),
        qMatrixAnchor: staticFallback,
        monitoring: {
          studentId: request.student_id,
          sessionNumber: parseInt(String(request.session_id).replace(/^session_(\d+).*/, '$1'), 10) || undefined,
          activeColumnIndex: request.active_column_index,
          triggerReason: request.student_progress_state?.trigger_reason ?? null,
          consecutiveErrors: request.student_progress_state?.consecutive_errors_count ?? 0,
          memoryCircles: request.workspace_state.memory_circles,
          hasRegroupedInCanvas: request.workspace_state.is_regrouped_in_canvas,
          operands: request.exercise_context
            ? { a: request.exercise_context.number_a, b: request.exercise_context.number_b, isSubtraction: request.exercise_context.operation === 'subtraction' }
            : null,
          recentEvents: request.recent_actions,
        },
      });

      if (hint) {
        return hint;
      }
    } catch (err) {
      console.warn('[SocraticEngine] Gemini API error, falling back to static hint:', err);
    }

    // מודול 13: "המנוע נדרש להחזיר את הסיווג בשדה error_category… והמערכת
    // שומרת אותו". הסיווג הוא של המנוע. כשהמנוע לא ענה אין סיווג — והכרטיס
    // הסטטי נשא עד כה ערך קבוע ('conceptual' / 'procedural') שנרשם
    // ב-SOCRATIC_CARD_SHOWN כאילו המנוע קבע אותו, והזין את האות הקוגניטיבי
    // ברדאר (מודול 18) ואת הדוח (מודול 23) במדידה מומצאת (מודול 24 §ב).
    // התוכן הסטטי נשאר; הסיווג — לא.
    return { ...staticFallback, error_category: null };
  }

  /**
   * Resolves a fully calibrated Socratic hint synchronously (0ms) based on the exact active task,
   * live counts, and mathematical operands without awaiting remote network requests.
   */
  /**
   * מודול 13, כלל הברזל: כרטיס חניכה לעולם אינו מוסר את התוצאה הסופית.
   *
   * socraticTextViolation נאכף עד כה על תשובת הבינה בלבד. הכרטיסים
   * הסטטיים — מה שהלומד מקבל בכל פעם שהבינה אינה זמינה, וזה המצב הנפוץ
   * ולא החריג — עקפו אותו לגמרי. חלקם מחושבים מהמספרים של התרגיל עצמו,
   * ו-groundCardInExercise מזריק את המספרים לתוך טקסט כתוב, כך שדווקא
   * שם ההזלגה סבירה יותר.
   *
   * השער עובר עכשיו על כל כרטיס שיוצא מכאן. כרטיס שמפר את הכלל מוחלף
   * בכרטיס הכללי, שאינו מכיל מספרים כלל — עדיף רמז רחב על פני מסירת
   * התשובה לילד.
   */
  private static enforceIronRule(card: SocraticHintResponse, currentTask?: any): SocraticHintResponse {
    const texts = [card.questionHe, ...card.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
    // What the child must find is never shown: the result, the hidden digits of
    // a skeleton, a number the task asks for (staticSocraticCards.secretNumbersOf).
    // 10, 100 and 1,000 are the names of the regroupings themselves.
    const secrets = secretNumbersOf(currentTask).filter((n) => n !== 10 && n !== 100 && n !== 1000);
    const leaked = revealsSecret(texts, secrets) ?? revealsHiddenDigit(texts, currentTask);
    const meeting = meetingOfTaskId(currentTask?.id);
    const violation =
      socraticTextViolation(texts, null) ??
      (leaked !== null ? 'final answer leaked' : null) ??
      absentAidViolation(texts, meeting) ??
      // Stations 3–8 (owner, 30.9.2026) and station 1 (owner's D10,
      // 1.10.2026): a wrong option's hint is a guiding question.
      (meeting !== null && (meeting === 1 || meeting >= 3) ? wrongHintViolation(card) : null);
    if (!violation) return card;

    console.warn('[SocraticEngine] Static card rejected by the Module 13 iron rule:', violation, currentTask?.id);
    // Meeting 8 has no blocks on the screen: its fallback is מסמך 03's own
    // meeting-8 card, which speaks of the exercise and the memory circles only.
    return blocksOnScreen(meetingOfTaskId(currentTask?.id)) ? GENERAL_FALLBACK : TASK_HINTS['s8_card'];
  }

  /**
   * `context` is what the store knows beyond the board — the result row's
   * place cues, and the cards already shown in this exercise
   * (useWorkspaceStore.staticCardContextFor). Without it, nothing was shown.
   */
  public static getSynchronousTaskHint(
    currentTask?: any,
    counts?: { units: number; tens: number; hundreds: number; thousands: number },
    context?: StaticCardContext
  ): SocraticHintResponse {
    const card = SocraticEngine.enforceIronRule(
      SocraticEngine.resolveStaticHint(currentTask, counts, context),
      currentTask
    );
    // What the child reads follows the exercise; the category stays what main
    // computed for the same exercise and board (socraticResearchCategory.ts).
    // It is no longer recorded: when the static card is what the child sees,
    // SOCRATIC_CARD_SHOWN carries error_category null — the classification is
    // the engine's (owner, 28.9.2026; X19; useWorkspaceStore.fetchSocraticHint).
    return { ...card, error_category: researchErrorCategory(currentTask, counts) };
  }

  private static resolveStaticHint(
    currentTask?: any,
    counts?: { units: number; tens: number; hundreds: number; thousands: number },
    context?: StaticCardContext
  ): SocraticHintResponse {
    const currentCounts = counts || { units: 0, tens: 0, hundreds: 0, thousands: 0 };
    const ctx: StaticCardContext = context ?? {};
    const taskId: string | undefined = currentTask?.id;
    const taskType: string | undefined = currentTask?.type;
    const targetNode: string = currentTask?.targetNode || (currentTask?.requiresGrouping ? 'regrouping_fluency' : currentTask?.requiresUngrouping ? 'subtraction_regrouping' : 'basic_addition_fluency');
    const meeting = meetingOfTaskId(taskId);

    // 0. By trigger and by screen (owner, 1.10.2026: the card follows the
    //    situation, the trigger and the level). Meeting 8's third trigger —
    //    three undos in a row, a guessing loop (PRD Module 12) — gets מסמך 03's
    //    own meeting-8 card, whose wrong options are guessing and waiting.
    //    The next card of the run is the column's own card (audit D13: it is
    //    the general first card the owner asked for in meeting 8, D8).
    if (meeting === 8 && ctx.trigger === 'consecutive_undos_3' && !(ctx.shownKinds ?? []).includes('guessing')) {
      return inFamily(withKind(framed(groundCardInExercise(TASK_HINTS['s8_card'], currentTask), {
        situation: 'guessing_loop',
        frameLevel: 1,
        intentHe: 'שלוש פעולות ביטול ברצף: לא מנחשים, פותרים טור אחר טור בעזרת עיגולי הזיכרון',
      }), 'guessing'), 'guessing_loop');
    }
    //    Stations 3–7: the child hid the number house (top-bar button). A card
    //    about blocks on a hidden board points at nothing (audit D15). Showing
    //    it again is a suggestion, not a requirement (register יא): the card
    //    that suggests it comes once per exercise; after it a vertical exercise
    //    gets its column card worded without blocks (coordinator's decision,
    //    2.10.2026) — the child who works without the board still gets help.
    //    An exercise that needs the blocks (a representation) gets the card
    //    that names the button.
    if (meeting !== null && meeting >= 3 && meeting <= 7 && ctx.boardHidden === true) {
      const suggested = (ctx.shownKinds ?? []).some((k) => k === 'board_hidden' || k === 'show_board');
      if (!suggested) return inFamily(withKind(boardHiddenCard(), 'board_hidden'), 'board_hidden');
      const withoutBlocks = noBoardColumnCard(currentTask, ctx);
      if (withoutBlocks) return withoutBlocks;
      return cardLadder(ctx, 'board_hidden', [['board_hidden', boardHiddenCard], ['show_board', showBoardCard]]);
    }

    // 1. Live Board Evaluation (overcrowding >=10 in any column or subtraction
    //    deficit) — only where there is a board. In meeting 8 no blocks are on
    //    the screen and the counts are always 0: reading them produced "the
    //    number house is empty, build the first number" (PRD Module 14 §ב;
    //    Module 13 §א: no aids that are not on the screen).
    if (blocksOnScreen(meeting)) {
      // The blocks an exercise put on the board are no longer the ones it gave
      // (station 7's 2,730; owner, 4.10.2026, cards round 2): back to them,
      // before "10 or more in a column" is read on a board worth another number.
      const givenChanged = givenBlocksChangedCard(currentTask, currentCounts, ctx);
      if (givenChanged) return givenChanged;
      const liveHint = SocraticEngine.analyzeLiveBoardState(currentTask, targetNode, currentCounts, ctx);
      if (liveHint) return liveHint;
    }

    // 1b. Meeting 1: the situations its own card does not fit — an empty
    //     board, the ten already broken, a block broken too many, the blocks
    //     all in place, taking away under way — and the second card of the
    //     exercise (staticSocraticCards.meeting1Card, 1.10.2026).
    if (meeting === 1) {
      const m1 = meeting1Card(currentTask, currentCounts, ctx);
      if (m1) return m1;
    }

    // 2. Direct lookup in TASK_HINTS with exact ID or normalized ID (e.g. s3_g_t1 -> s3_t1)
    const normalizedId = normalizeTaskIdForHints(taskId);
    if (taskId && TASK_HINTS[taskId]) return TASK_HINTS[taskId];
    if (normalizedId && TASK_HINTS[normalizedId]) return TASK_HINTS[normalizedId];

    if (taskType === 'session1_intro') return TASK_HINTS['s1_sandbox_controlled'];

    // 3. The card computed from the exercise on the screen: its own numbers
    //    (hidden digits stay hidden), the column where it really converts, and
    //    in meeting 8 the memory circles instead of blocks (register, approved
    //    deviation 2; owner, 28.9.2026 — staticSocraticCards.ts), and the
    //    cards of 30.9.2026 that follow the place cues and the cards already
    //    shown in the exercise.
    const computed = exerciseCard(currentTask, currentCounts, context);
    if (computed) return computed;
    // A meeting-3 task this module does not recognise gets the card that marks
    // no representation wrong (owner, 28.9.2026, שהB.1).
    if (meetingOfTaskId(taskId) === 3) return whichNumberIsBuiltCard();

    // 4. The מסמך 03 session card, grounded in this exercise. It comes AFTER the
    //    operand-specific computation above: PRD Module 13's holistic-triad rule
    //    forbids a guiding question detached from the exercise and the live board,
    //    so a card written per session is the last resort, never the first answer,
    //    and it is served naming the exercise the learner is actually on.
    for (const key of sessionCardKeysForTaskId(taskId)) {
      const card = TASK_HINTS[key];
      if (card) return groundCardInExercise(card, currentTask);
    }

    if (targetNode && NODE_HINTS[targetNode]) return NODE_HINTS[targetNode];

    return GENERAL_FALLBACK;
  }

  static async getSocraticHint(
    currentTask: any,
    targetNode: string,
    counts: { units: number; tens: number; hundreds: number; thousands: number },
    traceData?: { hesitation_events: number; undo_clicks: number },
    _enhancedCognitiveSupport: boolean = false,
    activeColumnIndex: number = 0,
    recentActions: string[] = [],
    monitoring?: SocraticMonitoringSnapshot
  ): Promise<SocraticHintResponse | null> {
    await ready();

    // 1. Resolve synchronous baseline anchor: the card the child would see.
    const baselineAnchor = SocraticEngine.getSynchronousTaskHint(currentTask, counts, monitoring?.cardContext);

    // 2. Map active column index
    const colNames = ['יחידות', 'עשרות', 'מאות', 'אלפים'];
    const activeColumnName = colNames[activeColumnIndex] || 'יחידות';

    // 3. Grounded AI Socratic Query (Synthesize live board numbers with Q-Matrix anchor)
    let why: { reason: SocraticFallbackReason; detail?: string } = { reason: 'error' };
    try {
      const dynamicAiHint = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
        onFallback: (reason, detail) => { why = { reason, detail }; },
        currentTask: currentTask || {},
        targetNode: targetNode || 'general',
        activeColumnName,
        counts,
        recentActions: recentActions.length > 0 ? recentActions : [
          `Hesitations: ${traceData?.hesitation_events || 0}`,
          `Undos: ${traceData?.undo_clicks || 0}`
        ],
        qMatrixAnchor: baselineAnchor,
        monitoring: {
          activeColumnIndex,
          hesitationSeconds: traceData?.hesitation_events ? 45 : 0,
          consecutiveUndos: traceData?.undo_clicks,
          ...(monitoring ?? {}),
        },
      });

      if (dynamicAiHint) {
        return dynamicAiHint;
      }
    } catch (err) {
      console.warn('[SocraticEngine] Dynamic AI hint synthesis notice, using baseline anchor:', err);
    }

    // 4. Fallback: the grounded baseline anchor — its content, not its
    // classification. error_category is the engine's verdict (Module 13);
    // the anchor's hard-coded value would be stored as if the engine had
    // spoken. See requestSocraticHintWithFallback for the same rule. It
    // carries why the engine's card is not the one shown (7.10.2026).
    return baselineAnchor
      ? { ...baselineAnchor, error_category: null, fallbackReason: why.reason, ...(why.detail ? { fallbackDetail: why.detail } : {}) }
      : baselineAnchor;
  }
}
