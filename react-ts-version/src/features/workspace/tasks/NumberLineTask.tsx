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
  activeRange,
}: {
  range: [number, number];
  showMarkerValue: boolean;
  asdAnchors?: number[];
  activeRange?: [number, number];
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
      // Ticks are inset by left-4 right-4 (16px on each side)
      const insetLeft = rect.left + 16;
      const insetWidth = rect.width - 32;
      const ratio = Math.min(1, Math.max(0, (clientX - insetLeft) / insetWidth));
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
        {/* Main Axis Line */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-ws-ink/30" />
        
        {/* Active Range Highlight (if any) */}
        {activeRange && (
          <div 
            className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-ws-ink"
            style={{ 
              left: `${((activeRange[0] - min) / span) * 100}%`,
              width: `${((activeRange[1] - activeRange[0]) / span) * 100}%`
            }}
          />
        )}
        {!activeRange && (
          <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-ws-ink" />
        )}

        {/* Arrow at the right end */}
        <div className={`absolute top-1/2 -translate-y-1/2 right-0 w-0 h-0 
          border-t-[5px] border-t-transparent 
          border-b-[5px] border-b-transparent 
          border-l-[8px] border-l-ws-ink ${activeRange && activeRange[1] < max ? 'opacity-30' : ''}`} 
        />
        {/* Arrow at the left end */}
        <div className={`absolute top-1/2 -translate-y-1/2 left-0 w-0 h-0 
          border-t-[5px] border-t-transparent 
          border-b-[5px] border-b-transparent 
          border-r-[8px] border-r-ws-ink ${activeRange && activeRange[0] > min ? 'opacity-30' : ''}`} 
        />

        <div className="absolute top-0 bottom-0 left-4 right-4 pointer-events-none">
          {/* Ticks */}
          {Array.from({ length: Math.floor(span / minorStep) + 1 }).map((_, i) => {
            const t = min + i * minorStep;
            const p = ((t - min) / span) * 100;
            const isMajor = t % majorStep === 0;
            const isMedium = t % mediumStep === 0;
            const isAnchor = asdAnchors?.includes(t);
            const isOutside = activeRange && (t < activeRange[0] || t > activeRange[1]);
            
            let heightClass = 'h-3 bg-ws-ink/40'; // minor
            if (isMajor) heightClass = 'h-5 bg-ws-ink'; // major
            else if (isMedium) heightClass = 'h-4 bg-ws-ink/70'; // medium

            const widthClass = isMajor ? 'w-[2px]' : 'w-[1px]';

            return (
              <div
                key={t}
                className={`absolute top-1/2 -translate-y-1/2 ${widthClass} ${heightClass} ${
                  isAnchor ? '!h-7 bg-ws-accent shadow-[0_0_8px_2px_rgba(249,115,22,0.5)]' : ''
                } ${isOutside ? 'opacity-30' : ''}`}
                style={{ left: `${p}%` }}
              />
            );
          })}

          {/* Major labels */}
          {majorTicks.map((t) => {
            const isOutside = activeRange && (t < activeRange[0] || t > activeRange[1]);
            return (
              <span
                key={t}
                className={`absolute top-[calc(50%+12px)] -translate-x-1/2 text-sm font-semibold text-ws-ink tabular-nums ${isOutside ? 'opacity-30' : ''}`}
                style={{ left: `${((t - min) / span) * 100}%` }}
              >
                {t.toLocaleString('he-IL')}
              </span>
            );
          })}

          {/* Marker arrow */}
          <div className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-75 z-20" style={{ left: `${pct}%` }}>
            {showMarkerValue && (
              <span className="mb-0.5 px-2 py-0.5 rounded border border-ws-accent/30 bg-white text-ws-accent text-sm font-black tabular-nums shadow-sm">
                {displayValue.toLocaleString('he-IL')}
              </span>
            )}
            <span className="text-xl leading-none text-ws-accent drop-shadow-sm">▼</span>
          </div>
        </div>
      </div>
    </div>
  );
}
