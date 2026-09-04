import { useEffect, useRef, useState } from "react";
import { Replayer } from "rrweb";
import "rrweb-player/dist/style.css";
import { Play, Pause, RotateCcw } from "lucide-react";

interface ReplayViewerProps {
  events: any[];
  seekToTime?: number;
  /** Bumped per seek request so seeking twice to the same timestamp still fires. */
  seekNonce?: number;
  onEnd?: () => void;
  /** Fires on every progress tick with the current absolute event timestamp (ms epoch), so a parent can auto-highlight the matching decision-table row as playback advances. */
  onProgress?: (absoluteTimestampMs: number) => void;
}

function formatTime(ms: number): string {
  if (!ms || isNaN(ms) || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function ReplayViewer({ events, seekToTime, seekNonce, onEnd, onProgress }: ReplayViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const progressTimerRef = useRef<any>(null);

  const firstTimestamp = events && events.length > 0 ? events[0].timestamp : 0;
  const lastTimestamp = events && events.length > 0 ? events[events.length - 1].timestamp : 0;
  const totalDurationMs = Math.max(0, lastTimestamp - firstTimestamp);

  const prevFingerprintRef = useRef<string>('');
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Initialize Replayer only when event content actually changes
  useEffect(() => {
    const container = containerRef.current;
    if (!events || events.length < 2 || !container) {
      if (container) container.innerHTML = "";
      prevFingerprintRef.current = '';
      return;
    }

    const currentFingerprint = `${events.length}_${events[0]?.timestamp}_${events[events.length - 1]?.timestamp}`;
    if (replayerRef.current && prevFingerprintRef.current === currentFingerprint) {
      return; // Stable instance - avoid destroy/rebuild to prevent ANY flicker
    }

    prevFingerprintRef.current = currentFingerprint;
    container.innerHTML = "";

    try {
      const metaEvent = events.find((e: any) => e.type === 4);
      const originalWidth = metaEvent?.data?.width || 1280;
      const originalHeight = metaEvent?.data?.height || 720;

      const replayer = new Replayer(events, {
        root: container,
        mouseTail: true,
        speed: playbackSpeed,
        showWarning: false,
        showDebug: false,
        UNSAFE_replayCanvas: true,
      });

      replayerRef.current = replayer;

      // Start playing
      replayer.play(0);
      setIsPlaying(true);
      setCurrentTimeMs(0);

      replayer.on('finish', () => {
        setIsPlaying(false);
        if (onEnd) onEnd();
      });

      // Precise responsive scaling to show entire student screen with zero flicker
      const applyScale = () => {
        if (!container) return;
        const parentWidth = container.clientWidth || 600;
        const scale = parentWidth / originalWidth;
        const effectiveHeight = Math.round(originalHeight * scale);

        const iframeWrapper = (container.querySelector('.replayer-wrapper') as HTMLElement) || container.querySelector('iframe')?.parentElement;
        if (iframeWrapper) {
          iframeWrapper.style.width = `${originalWidth}px`;
          iframeWrapper.style.height = `${originalHeight}px`;
          iframeWrapper.style.transform = `scale(${scale}) translateZ(0)`;
          iframeWrapper.style.transformOrigin = 'top left';
          iframeWrapper.style.position = 'absolute';
          iframeWrapper.style.top = '0';
          iframeWrapper.style.left = '0';
          iframeWrapper.style.backfaceVisibility = 'hidden';
          container.style.height = `${effectiveHeight}px`;
          container.style.minHeight = `${effectiveHeight}px`;
        }
      };

      applyScale();
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      resizeObserverRef.current = new ResizeObserver(() => {
        applyScale();
      });
      resizeObserverRef.current.observe(container);

    } catch (err: any) {
      console.error("rrweb Replayer failed to initialize:", err);
      if (container) {
        container.innerHTML = `<div class="p-6 bg-red-50 text-red-700 rounded-2xl m-4 font-bold text-center">שגיאה בטעינת נגן ההקלטות: ${err.message || 'Unknown error'}</div>`;
      }
    }

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (replayerRef.current) {
        try { replayerRef.current.pause(); } catch {}
        replayerRef.current = null;
      }
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [events]);

  // Keep the latest onProgress in a ref so the polling interval below doesn't
  // need to be torn down and recreated whenever the parent re-renders with a
  // fresh inline callback.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  // Track progress timer smoothly
  useEffect(() => {
    if (isPlaying) {
      progressTimerRef.current = setInterval(() => {
        if (replayerRef.current) {
          try {
            const current = replayerRef.current.getCurrentTime();
            setCurrentTimeMs(current);
            // PRD Module 21 §ב: the bidirectional table<->player link requires
            // the decision table to auto-highlight the matching row as the
            // player advances, not just seek the player when a row is clicked.
            onProgressRef.current?.(firstTimestamp + current);
          } catch {}
        }
      }, 250);
    } else {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    }

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [isPlaying, firstTimestamp]);

  // Handle external seek requests (e.g. clicking an event in the radar history)
  useEffect(() => {
    if (seekToTime && replayerRef.current && events.length > 0) {
      const offset = Math.max(0, Math.min(totalDurationMs, seekToTime - firstTimestamp));
      try {
        replayerRef.current.play(offset);
        setIsPlaying(true);
        setCurrentTimeMs(offset);
      } catch (err) {
        console.warn("Could not seek player:", err);
      }
    }
  }, [seekToTime, seekNonce, events, firstTimestamp, totalDurationMs]);

  const togglePlay = () => {
    if (!replayerRef.current) return;
    if (isPlaying) {
      replayerRef.current.pause();
      setIsPlaying(false);
    } else {
      replayerRef.current.play(currentTimeMs);
      setIsPlaying(true);
    }
  };

  const handleRestart = () => {
    if (!replayerRef.current) return;
    replayerRef.current.play(0);
    setIsPlaying(true);
    setCurrentTimeMs(0);
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetOffset = Number(e.target.value);
    setCurrentTimeMs(targetOffset);
    if (replayerRef.current) {
      replayerRef.current.play(targetOffset);
      setIsPlaying(true);
    }
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (replayerRef.current) {
      replayerRef.current.setConfig({ speed });
    }
  };

  if (!events || events.length < 2) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-slate-50 dark:bg-slate-900 rounded-3xl overflow-hidden w-full p-8" dir="rtl">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner">
            <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-slate-800 dark:text-slate-200 font-bold text-xl">אין מספיק נתוני הקלטה עבור סשן זה</p>
          <p className="text-slate-500 text-sm leading-relaxed">
            המערכת מקליטה את מסך התלמיד באופן אוטומטי בעת ביצוע משימות בשיעור. ברגע שהתלמיד יבצע פעולות על הלוח, ההקלטה תופיע כאן ברציפות.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full mx-auto bg-slate-900 text-white rounded-2xl shadow-xl overflow-hidden relative select-none" dir="rtl">
      {/* Top Controls Bar */}
      <div className="w-full bg-slate-900/90 border-b border-slate-800 p-4 flex flex-wrap items-center justify-between z-10 gap-4">
        {/* Playback Actions */}
        <div className="flex items-center gap-3">
          <button 
            onClick={togglePlay}
            className="w-11 h-11 bg-indigo-600 hover:bg-indigo-500 active:scale-95 rounded-xl flex items-center justify-center text-white transition-all shadow-md cursor-pointer"
            aria-label={isPlaying ? 'השהה' : 'נגן'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button 
            onClick={handleRestart}
            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-xl flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
            title="חזור לתחילת הסשן"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          
          {/* Speed Controls */}
          <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
            {[0.5, 1, 2, 4].map((speed) => (
              <button
                key={speed}
                onClick={() => changeSpeed(speed)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  playbackSpeed === speed 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                x{speed}
              </button>
            ))}
          </div>
        </div>

        {/* Time & Frame Counter */}
        <div className="flex items-center gap-4">
          <div className="text-sm font-mono font-bold bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-700 text-indigo-200" dir="ltr">
            <span>{formatTime(currentTimeMs)}</span>
            <span className="text-slate-500 mx-1.5">/</span>
            <span className="text-slate-400">{formatTime(totalDurationMs)}</span>
          </div>
          {/* The learner's own clock at the playhead — the same clock the
              decision table shows, so a row and a frame can be matched. */}
          <div className="text-xs font-mono bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/50 text-slate-300" dir="ltr" title="שעון התלמיד בנקודה הנוכחית">
            {firstTimestamp ? new Date(firstTimestamp + currentTimeMs).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
          </div>

          <div className="text-xs text-slate-400 font-mono bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/50" dir="ltr">
            {events.length} frames
          </div>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <div className="w-full bg-slate-850 px-5 py-2.5 border-b border-slate-800 flex items-center gap-3">
        <input 
          type="range"
          min={0}
          max={totalDurationMs || 100}
          value={currentTimeMs}
          onChange={handleScrubberChange}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
      </div>
      
      {/* Replayer Container - Hugs exact screen aspect ratio */}
      <div 
        ref={containerRef} 
        className="w-full relative overflow-hidden bg-slate-950"
      />
    </div>
  );
}
