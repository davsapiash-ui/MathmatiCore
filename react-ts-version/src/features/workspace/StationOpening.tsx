import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { STATION_START_HE, stationOpeningHe } from '@/core/stationOpening';

/**
 * The one screen before the first task of station 2 and of station 8 (owner,
 * 27.9.2026; register, approved deviation 24): exactly one text, its
 * read-aloud button — on the child's click only (AGENTS.md invariant 6) — and
 * "מתחילים". No hint and nothing else. One component; the text is chosen by
 * the meeting (core/stationOpening.ts).
 */
export function StationOpening({ meeting, onStart }: { meeting: number; onStart: () => void }) {
  const text = stationOpeningHe(meeting);
  if (!text) return null;
  return (
    <div dir="rtl" className="h-screen w-full flex flex-col items-center justify-center bg-ws-bg text-ws-ink font-body p-6">
      <div className="bg-ws-surface p-10 rounded-3xl shadow-xl max-w-md w-full text-center border-2 border-ws-surface2 space-y-6">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-2xl font-display font-extrabold leading-relaxed text-ws-ink">{text}</p>
          <UdlSpeechButton text={text} className="shrink-0 mt-1" />
        </div>
        <button
          type="button"
          onClick={onStart}
          className="w-full py-3.5 rounded-full font-display font-extrabold text-lg text-white bg-ws-accent shadow-md hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
        >
          {STATION_START_HE}
        </button>
      </div>
    </div>
  );
}
