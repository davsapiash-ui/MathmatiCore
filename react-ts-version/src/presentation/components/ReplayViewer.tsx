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
      <div className="flex items-center justify-center h-[500px] bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <p className="text-slate-500 dark:text-slate-400">אין מספיק נתוני הקלטה להצגה (נדרשים לפחות 2 אירועים).</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-inner overflow-hidden border border-slate-200 dark:border-slate-700" dir="ltr">
      <div ref={playerRef} className="rrweb-player-container"></div>
    </div>
  );
}
