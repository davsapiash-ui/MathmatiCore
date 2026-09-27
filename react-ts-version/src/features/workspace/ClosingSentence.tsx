import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { encouragementSentenceHe, hasClosingSentence, type PersistenceCounts } from '@/core/persistenceEncouragement';

/**
 * The one sentence a child reads at the end of meetings 3 to 7.
 *
 * Owner decisions E1 and E2 (27.9.2026, register deviation 24): one of four
 * encouraging sentences, chosen by this meeting's own persistence index, with
 * its read-aloud button — on the child's click only (AGENTS.md invariant 6).
 * Nothing else: no number, no board, no question. Meetings 1 (the sandbox) and
 * 2 (the diagnostic) get no sentence; meeting 8 gets its own on stage 3 of the
 * reflection board.
 */
export function ClosingSentence({ sessionNumber, counts }: { sessionNumber: number; counts: PersistenceCounts }) {
  if (!hasClosingSentence(sessionNumber)) return null;
  const sentence = encouragementSentenceHe(counts);
  return (
    <div data-testid="closing-sentence" className="flex items-start gap-3 rounded-2xl p-4 bg-ws-accentSoft/50 border border-ws-accent/25 text-right">
      <p className="flex-1 text-lg font-bold text-ws-ink leading-relaxed">{sentence}</p>
      <UdlSpeechButton text={sentence} className="shrink-0" />
    </div>
  );
}
