import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

/**
 * משימה למציאת רכיב חסר במשוואה (מציאת המחסר).
 * מציג משוואה עם תיבת טקסט עבור הנעלם, למשל: 52 - [  ] = 34
 */
export function MissingElementTask({
  numberA,
  numberB,
  isSubtraction,
  instructionHe
}: {
  numberA: number;
  numberB: number;
  isSubtraction?: boolean;
  instructionHe: string;
}) {
  const probeAnswer = useWorkspaceStore((s) => s.probeAnswer);
  const setProbeAnswer = useWorkspaceStore((s) => s.setProbeAnswer);

  const sign = isSubtraction ? '-' : '+';
  const speechText = isSubtraction 
    ? `${instructionHe}. כמה צריך לחסר מ-${numberA} כדי להגיע ל-${numberB}?`
    : `${instructionHe}. כמה צריך להוסיף ל-${numberA} כדי להגיע ל-${numberB}?`;

  return (
    <div className="flex flex-col gap-6 mt-4 items-center w-full">
      <div className="flex items-center gap-3">
        <p className="text-xl font-bold text-ws-ink text-center">{instructionHe}</p>
        <UdlSpeechButton text={speechText} />
      </div>

      <div className="flex items-center justify-center gap-4 bg-ws-surface2/40 px-10 py-8 rounded-3xl border border-ws-surface2 w-full max-w-lg shadow-sm" dir="ltr">
        <span className="font-mono font-black text-5xl text-ws-ink tabular-nums">
          {numberA}
        </span>
        <span className="font-mono font-black text-5xl text-ws-ink">
          {sign}
        </span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={probeAnswer}
          onChange={(e) => setProbeAnswer(e.target.value.replace(/[^0-9]/g, ''))}
          aria-label="הזינו את המספר החסר"
          className="w-28 h-20 rounded-2xl border-4 border-ws-accent text-center font-mono font-black text-4xl bg-ws-surface focus:outline-none focus:ring-4 focus:ring-ws-accent/30 focus:border-ws-accent shadow-inner text-ws-ink"
        />
        <span className="font-mono font-black text-5xl text-ws-ink">
          =
        </span>
        <span className="font-mono font-black text-5xl text-ws-ink tabular-nums">
          {numberB}
        </span>
      </div>
    </div>
  );
}
