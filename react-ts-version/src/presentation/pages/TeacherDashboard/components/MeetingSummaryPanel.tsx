/**
 * After the teacher closes a meeting (owner decision 11.10.2026): a short,
 * anonymous summary for the class discussion — the radar's colours at the
 * moment of the close, how many finished, the ח/ר/מ classifications of the
 * meeting and the help calls. Teacher-only: it lives on the dashboard, never
 * on the projector page, and it reads data the dashboard already holds
 * (core/teacherLessonFlow.ts buildMeetingSummary). The teacher closes it.
 */
import type { ReactElement } from 'react';
import { BarChart3, X } from 'lucide-react';
import { LESSON_FLOW_HE, type MeetingSummary } from '@/core/teacherLessonFlow';
import { radarLegendItems, RADAR_LEGEND_LETTERS } from './HeatmapGrid';

const LETTER_KEY = { 'ח': 'calculation', 'ר': 'procedural', 'מ': 'conceptual' } as const;

export function MeetingSummaryPanel({ summary, thresholdSeconds, onClose }: { summary: MeetingSummary; thresholdSeconds: number; onClose: () => void }): ReactElement {
  const colours = radarLegendItems(thresholdSeconds);
  return (
    <section
      data-testid="meeting-summary"
      aria-labelledby="meeting-summary-title"
      className="mb-[clamp(12px,1.2vw,24px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-[clamp(12px,1.1vw,20px)] shadow-sm flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="meeting-summary-title" className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-violet-700 dark:text-violet-300" aria-hidden="true" />
            {LESSON_FLOW_HE.summaryTitle(summary.meeting)}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">{LESSON_FLOW_HE.summaryLead}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={LESSON_FLOW_HE.summaryClose} title={LESSON_FLOW_HE.summaryClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 cursor-pointer">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs leading-normal">{/* A bento of three cards (owner, 11.10.2026). */}
        <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-stone-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100">{LESSON_FLOW_HE.summaryColours}</h3>
          <ul className="flex flex-col gap-0.5" data-testid="meeting-summary-colours">
            {colours.map((c) => (
              <li key={c.color} data-testid={`meeting-summary-${c.color}`} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`w-3 h-3 rounded-full shrink-0 ${c.dot}`} />
                <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-300" title={c.meaning}>{c.meaning}</span>
                <span className="font-black tabular-nums text-slate-900 dark:text-slate-100">{summary.colours[c.color]}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-stone-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100">{LESSON_FLOW_HE.summaryLetters}</h3>
          <ul className="flex flex-col gap-0.5" data-testid="meeting-summary-letters">
            {RADAR_LEGEND_LETTERS.map((l) => (
              <li key={l.glyph} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-black rounded bg-slate-900/10 dark:bg-white/10 border border-slate-400/40">{l.glyph}</span>
                <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-300">{l.meaning}</span>
                <span className="font-black tabular-nums text-slate-900 dark:text-slate-100">{summary.letters[LETTER_KEY[l.glyph]]}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-center gap-2 p-3 rounded-xl bg-stone-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-800 dark:text-slate-100">
          <span data-testid="meeting-summary-finished">{LESSON_FLOW_HE.summaryFinished(summary.finished)}</span>
          <span data-testid="meeting-summary-help">{LESSON_FLOW_HE.summaryHelpCalls(summary.helpCalls)}</span>
        </div>
      </div>
    </section>
  );
}
