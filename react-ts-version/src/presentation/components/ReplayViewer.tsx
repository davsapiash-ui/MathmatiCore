import { useEffect, useRef, useState } from "react";
import { Replayer } from "rrweb";
import "rrweb-player/dist/style.css";

interface ReplayViewerProps {
  events: any[];
  seekToTime?: number;
}

export function ReplayViewer({ events, seekToTime }: ReplayViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!events || events.length < 2 || !containerRef.current) {
      if (containerRef.current) containerRef.current.innerHTML = "";
      return;
    }

    containerRef.current.innerHTML = "";

    try {
      const metaEvent = events.find((e: any) => e.type === 4);
      const originalWidth = metaEvent?.data?.width || 1280;
      const originalHeight = metaEvent?.data?.height || 720;
      
      const targetWidth = 900;
      const scale = targetWidth / originalWidth;

      // Initialize raw rrweb Replayer
      replayerRef.current = new Replayer(events, {
        root: containerRef.current,
        mouseTail: false
      });

      // Start playing immediately
      replayerRef.current.play();
      setIsPlaying(true);

      const applyScale = () => {
        if (!containerRef.current) return;
        
        // Measure the actual available width from the parent container
        const currentWidth = containerRef.current.parentElement?.clientWidth || 900;
        const scale = currentWidth / originalWidth;

        const iframeWrapper = containerRef.current.querySelector('.replayer-wrapper') as HTMLElement || containerRef.current.querySelector('iframe')?.parentElement;
        if (iframeWrapper) {
          iframeWrapper.style.transform = `scale(${scale})`;
          // Anchor scaling to the top-right for correct RTL scaling
          iframeWrapper.style.transformOrigin = 'top right';
          iframeWrapper.style.position = 'absolute';
          iframeWrapper.style.right = '0';
          iframeWrapper.style.left = 'auto';
          iframeWrapper.style.top = '0';
          
          containerRef.current.style.height = `${originalHeight * scale}px`;
          containerRef.current.style.width = `${currentWidth}px`;
        }
      };

      // Apply scale after the iframe has been injected
      setTimeout(applyScale, 50);

      // Make it responsive to window resizes
      window.addEventListener('resize', applyScale);
      
      // Store the listener so we can clean it up
      (containerRef.current as any)._resizeListener = applyScale;

    } catch (err: any) {
      console.error("rrweb Replayer failed:", err);
      if (containerRef.current) {
        containerRef.current.innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-lg m-4">שגיאה בטעינת נגן ההקלטות: ${err.message || 'Unknown error'}</div>`;
      }
    }

    return () => {
      if (replayerRef.current) {
        try { replayerRef.current.pause(); } catch(e){}
      }
      if (containerRef.current) {
        if ((containerRef.current as any)._resizeListener) {
          window.removeEventListener('resize', (containerRef.current as any)._resizeListener);
        }
        containerRef.current.innerHTML = "";
      }
    };
  }, [events]);

  // Handle seeking to specific time from teacher alerts
  useEffect(() => {
    if (seekToTime && replayerRef.current && events.length > 0) {
      const firstEventTime = events[0].timestamp;
      const offset = Math.max(0, seekToTime - firstEventTime - 2000);
      try {
        replayerRef.current.pause();
        // Give it a tiny delay to ensure pause registers before seeking
        setTimeout(() => {
          if (replayerRef.current) {
            replayerRef.current.play(offset);
            setIsPlaying(true);
          }
        }, 10);
      } catch (err) {
        console.warn("Could not seek player:", err);
      }
    }
  }, [seekToTime, events]);

  const togglePlay = () => {
    if (replayerRef.current) {
      if (isPlaying) {
        replayerRef.current.pause();
      } else {
        replayerRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

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
    <div className="flex flex-col items-center w-full mx-auto bg-slate-50 border border-slate-200 shadow-sm overflow-hidden relative">
      {/* Custom Timeline Controller */}
      <div className="w-full bg-slate-800 p-3 flex items-center justify-between z-10 text-white shadow-md" dir="rtl">
        <div className="flex items-center gap-4">
          <button 
            onClick={togglePlay}
            className="px-6 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            {isPlaying ? 'השהה ⏸' : 'נגן ▶️'}
          </button>
          <div className="text-sm font-medium text-slate-300">
            תצוגת רדאר פדגוגי 
          </div>
        </div>
        <div className="text-xs text-slate-400 font-mono" dir="ltr">
          {events.length} frames
        </div>
      </div>
      
      {/* Replayer Container */}
      <div 
        ref={containerRef} 
        className="w-full relative flex items-start justify-center bg-[#F0F4F8]"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}
