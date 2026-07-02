/**
 * נקודות התקדמות — ללא מספרים, ללא אחוזים (בהתאם לאיסור חיוויי לחץ).
 * done = ירוק, active = מודגש. aria-hidden per vanilla (decorative only).
 */
export function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-2 items-center" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current ? 'w-3 h-3 bg-ws-accent scale-110' : i < current ? 'w-2.5 h-2.5 bg-ws-success' : 'w-2.5 h-2.5 bg-ws-surface2'
          }`}
        />
      ))}
    </div>
  );
}
