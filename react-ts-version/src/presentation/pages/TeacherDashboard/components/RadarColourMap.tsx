/**
 * "מפת הצבעים" (owner, 11.10.2026, after the live radar): the radar's key moves
 * from a crowded strip above the grid to a card under the side action queue.
 * One row per state in the radar's priority (Module 18 §ב: BLUE > RED > GREY >
 * YELLOW > GREEN), a larger swatch, the meaning, and how many learners are in
 * that state now. Clicking a row outlines the tiles in that state (an outline
 * only — no colour change, no motion); clicking it again clears. The letters
 * and the level stripe fold to one line each and open on click.
 *
 * The counts come from the grid itself (HeatmapGrid publishes the colour of each
 * tile here), so the card and the tiles can never disagree. Viewing only, so a
 * read-only account uses it the same way.
 */
import type { ReactElement } from 'react';
import { create } from 'zustand';
import type { RadarColor } from '@/core/radarColor';
import { ROUTE_COLOR } from '@/core/routeColors';
import { ROUTE_NAME_HE } from '@/core/routeLabels';
import { useHesitationThresholdSeconds } from '@/core/hesitationCalibration';
import { radarLegendItems, RADAR_LEGEND_LETTERS } from './HeatmapGrid';
import { AnimatedNumber } from './AnimatedNumber';

/** Module 18 §ב's priority, highest first. */
export const RADAR_PRIORITY: readonly RadarColor[] = ['BLUE', 'RED', 'GREY', 'YELLOW', 'GREEN'];

export const COLOUR_MAP_HE = {
  title: 'מפת הצבעים',
  hint: 'לחיצה על שורה מסמנת את המשבצות במצב הזה.',
  letters: 'אותיות',
  stripe: 'פס בקצה המשבצת',
  stripeSummary: 'ארבע רמות',
  countLabel: (n: number) => (n === 1 ? 'תלמיד אחד' : `${n} תלמידים`),
} as const;

const EMPTY_COUNTS: Record<RadarColor, number> = { BLUE: 0, RED: 0, GREY: 0, YELLOW: 0, GREEN: 0 };

interface RadarColourMapState {
  counts: Record<RadarColor, number>;
  /** The row the teacher clicked (stays until clicked again). */
  highlight: RadarColor | null;
  /** The row under the pointer (temporary, while hovering). */
  hoverHighlight: RadarColor | null;
  setCounts: (counts: Record<RadarColor, number>) => void;
  toggleHighlight: (color: RadarColor) => void;
  setHoverHighlight: (color: RadarColor | null) => void;
}

export const useRadarColourMapStore = create<RadarColourMapState>((set) => ({
  counts: EMPTY_COUNTS,
  highlight: null,
  hoverHighlight: null,
  setCounts: (counts) => set((s) => (RADAR_PRIORITY.every((c) => s.counts[c] === counts[c]) ? s : { counts })),
  toggleHighlight: (color) => set((s) => ({ highlight: s.highlight === color ? null : color })),
  setHoverHighlight: (color) => set({ hoverHighlight: color }),
}));

/** The state whose tiles are outlined now: the hovered row first, else the clicked one. */
export const useRadarHighlight = (): RadarColor | null => useRadarColourMapStore((s) => s.hoverHighlight ?? s.highlight);

export function RadarColourMap(): ReactElement {
  const threshold = useHesitationThresholdSeconds();
  const counts = useRadarColourMapStore((s) => s.counts);
  const highlight = useRadarColourMapStore((s) => s.highlight);
  const toggle = useRadarColourMapStore((s) => s.toggleHighlight);
  const setHover = useRadarColourMapStore((s) => s.setHoverHighlight);
  const items = radarLegendItems(threshold);
  const byColour = new Map(items.map((i) => [i.color, i]));

  return (
    <section
      data-testid="radar-legend"
      aria-labelledby="radar-colour-map-title"
      className="shrink-0 px-[clamp(12px,1vw,16px)] py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col gap-1.5"
      dir="rtl"
    >
      {/* Secondary to the queue (owner, 11.10.2026): a small muted title; the hint is its tooltip. */}
      <h2 id="radar-colour-map-title" title={COLOUR_MAP_HE.hint} className="text-xs font-semibold text-slate-500 dark:text-slate-400">{COLOUR_MAP_HE.title}</h2>
      <ul className="flex flex-col">
        {RADAR_PRIORITY.map((color) => {
          const item = byColour.get(color)!;
          const pressed = highlight === color;
          return (
            <li key={color}>
              <button
                type="button"
                data-testid={`radar-legend-${color}`}
                aria-pressed={pressed}
                aria-label={`${item.meaning}: ${COLOUR_MAP_HE.countLabel(counts[color])}`}
                title={item.meaning}
                onClick={() => toggle(color)}
                onMouseEnter={() => setHover(color)}
                onMouseLeave={() => setHover(null)}
                className={`w-full flex items-center gap-2 px-1.5 py-1 rounded-lg text-right cursor-pointer transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800 border ${pressed ? 'border-slate-900 dark:border-slate-100' : 'border-transparent'}`}
              >
                {/* A key, never animated (Module 18: "אינו מהבהב ואינו פועם"). */}
                <span aria-hidden="true" data-testid={color === 'BLUE' ? 'legend-help-dot' : undefined} className={`w-2.5 h-2.5 shrink-0 rounded-full ${item.dot}`} />
                <span data-testid={`radar-legend-label-${color}`} className="flex-1 min-w-0 truncate whitespace-nowrap text-[13px] leading-snug text-slate-700 dark:text-slate-200">{item.short}</span>
                <AnimatedNumber testId={`radar-legend-count-${color}`} value={counts[color]} className="shrink-0 min-w-6 justify-center text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100" />
              </button>
            </li>
          );
        })}
      </ul>
      <details data-testid="radar-legend-letters" className="text-xs">
        <summary className="cursor-pointer font-medium text-slate-500 dark:text-slate-400">
          {COLOUR_MAP_HE.letters}: {RADAR_LEGEND_LETTERS.map((l) => l.glyph).join(' · ')}
        </summary>
        <ul className="mt-1 flex flex-col gap-1">
          {RADAR_LEGEND_LETTERS.map((l) => (
            <li key={l.glyph} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-black rounded bg-slate-900/10 dark:bg-white/10 text-slate-900 dark:text-slate-100 border border-slate-400/40">{l.glyph}</span>
              <span className="text-slate-700 dark:text-slate-300">{l.meaning}</span>
            </li>
          ))}
        </ul>
      </details>
      {/* The level stripe on a tile's edge (core/routeColors.ts): its own key, apart from the status colours. */}
      <details data-testid="radar-level-legend" className="text-xs">
        <summary className="cursor-pointer font-medium text-slate-500 dark:text-slate-400">
          {COLOUR_MAP_HE.stripe}: {COLOUR_MAP_HE.stripeSummary}
        </summary>
        <ul className="mt-1 flex flex-col gap-1">
          {(['green_path', 'remediation_path', 'graded_path', 'graded_foundation_path'] as const).map((path) => (
            <li key={path} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`w-1.5 h-3.5 rounded-sm ${ROUTE_COLOR[path].stripe}`} />
              <span className="text-slate-700 dark:text-slate-300">{ROUTE_NAME_HE[path]}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
