import { useEffect, useRef } from "react";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";

interface ReplayViewerProps {
  events: any[];
}

export function ReplayViewer({ events }: ReplayViewerProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (playerRef.current && events && events.length > 1) {
      // Clear previous instance if any
      playerRef.current.innerHTML = "";
      
      try {
        instanceRef.current = new rrwebPlayer({
          target: playerRef.current,
          props: {
            events,
            width: 900,
            height: 600,
            autoPlay: false,
            showController: true,
            mouseTail: false, // Disable the red line trails
          },
        });
      } catch (err) {
        console.error("Failed to initialize rrweb-player:", err);
      }
    }

    const el = playerRef.current;
    return () => {
      // Cleanup
      if (el) {
        el.innerHTML = "";
      }
    };
  }, [events]);

  if (!events || events.length < 2) {
    return (
      <div className="flex items-center justify-center h-[500px] glass-card rounded-3xl overflow-hidden w-full">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-ws-soft font-medium text-lg">אין מספיק נתוני הקלטה כדי להציג את השחזור</p>
          <p className="text-ws-soft/70 text-sm">(נדרשים לפחות 2 אירועים מוקלטים)</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center glass-card p-6 rounded-3xl overflow-hidden w-full" dir="ltr">
      <div ref={playerRef} className="rrweb-player-container rounded-2xl overflow-hidden shadow-2xl"></div>
    </div>
  );
}
