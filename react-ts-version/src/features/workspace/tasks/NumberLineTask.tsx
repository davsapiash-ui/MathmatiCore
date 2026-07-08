import { useCallback, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/**
 * ישר המספרים הדיגיטלי — גרירת חץ למיקום (אומדן ותפיסת גודל יחסי).
 * Tick density follows the vanilla algorithm (range 1000 → 10/50/100; range 100 → 1/5/10).
 * showMarkerValue=false in session-2 estimation mode (the whole point is estimating).
 * asdAnchors: glowing anchor ticks for ASD accessibility.
 */
export function NumberLineTask({
  range,
  showMarkerValue,
  asdAnchors,
}: {
  range: [number, number];
  showMarkerValue: boolean;
  asdAnchors?: number[];
}) {
  const value = useWorkspaceStore((s) => s.numberLineValue);
  const setNumberLineValue = useWorkspaceStore((s) => s.setNumberLineValue);
  const trackRef = useRef<HTMLDivElement>(null);

  const [min, max] = range;
  const span = max - min;
  const minorStep = span >= 1000 ? 10 : span >= 100 ? 1 : 1;
  const mediumStep = span >= 1000 ? 50 : 5;
  const majorStep = span >= 1000 ? 100 : 10;

  // Initialize value to min if null, so the arrow is always visible at 0
  useEffect(() => {
    if (value === null) {
      setNumberLineValue(min);
    }
  }, [value, min, setNumberLineValue]);

  const displayValue = value ?? min;
  const pct = ((displayValue - min) / span) * 100;

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      // dir=ltr track: left edge = min
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const raw = min + ratio * span;
      const snapped = Math.round(raw / minorStep) * minorStep;
      setNumberLineValue(Math.min(max, Math.max(min, snapped)));
    },
    [min, max, span, minorStep, setNumberLineValue]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateFromClientX(e.clientX);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons > 0) updateFromClientX(e.clientX);
  };

  const majorTicks: number[] = [];
  for (let t = min; t <= max; t += majorStep) majorTicks.push(t);

  return (
    <div className="mt-6 select-none" dir="ltr">
      <div
        ref={trackRef}
        role="slider"
        aria-label="ישר המספרים — גררו את החץ"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={displayValue}
        tabIndex={0}
        className="relative h-20 cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onKeyDown={(e) => {
          const cur = displayValue;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setNumberLineValue(Math.min(max, cur + minorStep));
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setNumberLineValue(Math.max(min, cur - minorStep));
          }
        }}
      >
        {/* Track */}
        <div className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 rounded-full bg-ws-surface2" />

        {/* Progress Fill (פס צבירה) */}
        <div 
          className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-full bg-ws-accent pointer-events-none transition-all duration-75"
          style={{ width: `${pct}%` }} 
        />

        {/* All ticks */}
        {Array.from({ length: Math.floor(span / minorStep) + 1 }).map((_, i) => {
          const t = min + i * minorStep;
          const p = ((t - min) / span) * 100;
          const isMajor = t % majorStep === 0;
          const isMedium = t % mediumStep === 0;
          const isAnchor = asdAnchors?.includes(t);
          
          let heightClass = 'h-2 bg-ws-surface2'; // minor
          if (isMajor) heightClass = 'h-5 bg-ws-soft';
          else if (isMedium) heightClass = 'h-3.5 bg-ws-soft opacity-70';

          return (
            <div
              key={t}
              className={`absolute top-1/2 -translate-y-1/2 w-0.5 rounded ${heightClass} ${
                isAnchor ? '!h-6 bg-ws-accent shadow-[0_0_8px_2px_rgba(249,115,22,0.5)]' : ''
              }`}
              style={{ left: `${p}%` }}
            />
          );
        })}

        {/* Major labels */}
        {majorTicks.map((t) => (
          <span
            key={t}
            className="absolute top-[72%] -translate-x-1/2 text-xs font-bold text-ws-soft tabular-nums"
            style={{ left: `${((t - min) / span) * 100}%` }}
          >
            {t.toLocaleString('he-IL')}
          </span>
        ))}

        {/* Marker arrow */}
        <div className="absolute -top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-75" style={{ left: `${pct}%` }}>
          {showMarkerValue && (
            <span className="mb-0.5 px-2 py-0.5 rounded-lg bg-ws-accent text-white text-sm font-black tabular-nums shadow">
              {displayValue.toLocaleString('he-IL')}
            </span>
          )}
          <span className="text-2xl leading-none text-ws-accent drop-shadow">▼</span>
        </div>
      </div>
    </div>
  );
}
