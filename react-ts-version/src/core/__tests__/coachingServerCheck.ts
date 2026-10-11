import { vi } from 'vitest';
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import type { StaticCardContext } from '@/infrastructure/services/staticSocraticCards';
import type { Place } from '@/core/placeValue';
import type { SessionTask } from '@/data/sessionTasks';
import {
  validateSocraticRequest,
  deriveSocraticFacts,
  validateSocraticResponse,
  validateSocraticAnchor,
  buildSocraticPrompt,
} from '../../../../functions/src/socraticContract';

const COLUMN_INDEX: Record<Place, number> = { units: 0, tens: 1, hundreds: 2, thousands: 3 };

/**
 * The request the client would send to the server for this card — the same
 * path as the store's fetchSocraticHint (SocraticEngine.fetchGroundedGeminiSocraticQuery),
 * with the proxy call captured instead of made.
 */
export async function capturedRequest(
  task: SessionTask,
  counts: Record<Place, number>,
  ctx: StaticCardContext,
  card: SocraticHintResponse,
): Promise<any> {
  let captured: any = null;
  const proxy = vi.spyOn(SocraticEngine, 'callGeminiProxy').mockImplementation(async (payload: any) => {
    captured = payload;
    throw new Error('captured');
  });
  const meeting = Number(/^s(\d)_/.exec(task.id)?.[1] ?? 0);
  const hasOperands = typeof task.numberA === 'number' && typeof task.numberB === 'number';
  try {
    await SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: task,
      targetNode: 'general',
      activeColumnName: 'יחידות',
      counts,
      qMatrixAnchor: card,
      monitoring: {
        studentId: 3,
        sessionNumber: meeting,
        triggerReason: ctx.trigger ?? 'hesitation_45s',
        consecutiveErrors: ctx.trigger === 'consecutive_errors_4' ? 4 : 0,
        consecutiveUndos: ctx.trigger === 'consecutive_undos_3' ? 3 : 0,
        hesitationSeconds: 45,
        memoryCircles: ctx.memoryCircles ?? {},
        answerDigits: ctx.answerDigits ?? {},
        operands: hasOperands ? { a: task.numberA as number, b: task.numberB as number, isSubtraction: Boolean(task.isSubtraction) } : null,
        activeColumnIndex: ctx.focusColumn ? COLUMN_INDEX[ctx.focusColumn] : 0,
        hasRegroupedInCanvas: false,
        conversionsDone: ctx.conversionsDone ? [...ctx.conversionsDone] : undefined,
        recentEvents: [],
        cardContext: ctx,
      },
    } as any);
  } finally {
    proxy.mockRestore();
  }
  return captured;
}

/** The server's verdict on a static card as the model's answer (validateSocraticResponse), or null when the request itself is not built. */
export function serverVerdictFor(payload: any, card: SocraticHintResponse): { ok: boolean; reason?: string; prompt?: string } | null {
  const req = validateSocraticRequest(payload?.socratic_request);
  if (!req.ok) return null;
  const facts = deriveSocraticFacts(req.value);
  const v = validateSocraticResponse({
    error_category: 'procedural',
    guiding_question: card.questionHe,
    options: card.choices.map((c) => ({
      option_text: c.textHe,
      feedback_text: c.feedbackHe ?? '',
      is_correct: c.isCorrect ?? c.id === card.correctChoiceId,
    })),
  }, facts);
  const prompt = buildSocraticPrompt(req.value, facts, validateSocraticAnchor(payload?.anchor));
  return v.ok ? { ok: true, prompt } : { ok: false, reason: v.reason, prompt };
}
