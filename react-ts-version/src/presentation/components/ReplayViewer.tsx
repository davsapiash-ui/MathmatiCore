import { useEffect, useMemo, useRef, useState } from "react";
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
  /**
   * מודול 21 §ב: "ההפעלה מתבצעת עבור התרגיל הספציפי שנבחר בלבד".
   * חותמת זמן מוחלטת שבה ההפעלה נעצרת — סוף התרגיל שנבחר. ללא ערך,
   * ההקלטה רצה עד סופה כרגיל.
   *
   * ה-Replayer עצמו מקבל את כל האירועים, כי תצלום המסך המלא (rrweb type 2)
   * יושב בתחילת ההקלטה — חיתוך המערך היה משאיר נגן בלי מה לצייר. הגבול
   * הוא על ההפעלה, לא על הנתונים.
   */
  stopAtTime?: number;
  /**
   * מודול 21 §ב: "הנגן מציג ציר זמן רציף של המפגש כולו, המחולק חזותית לקטעים
   * לפי exercise_id, בדומה לפרקים בנגן וידאו". קטע לכל פרק, על ציר הזמן עצמו;
   * לחיצה עליו מגיעה ל-onChapterSelect עם מספר הפרק.
   */
  chapters?: { start: number; end: number; label: string }[];
  onChapterSelect?: (index: number) => void;
}

function formatTime(ms: number): string {
  if (!ms || isNaN(ms) || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * A stretch with no recorded event at all for this long is the time between
 * two openings of the same meeting (each opening is its own recording, and the
 * journey hands the player all of them as one stream). The player jumps over
 * it; a learner's pause inside a lesson is far shorter and plays as it was.
 */
const RUN_GAP_MS = 5 * 60 * 1000;

export function ReplayViewer({ events, seekToTime, seekNonce, onEnd, onProgress, stopAtTime, chapters, onChapterSelect }: ReplayViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const progressTimerRef = useRef<any>(null);
  // The teacher paused (or the chosen exercise ended): a new chunk keeps the
  // player paused. The end of the recording itself is not a pause — a
  // recording still being written carries on into what arrives.
  const holdPausedRef = useRef(false);

  // An event without a time cannot be placed on the timeline: one such event
  // at the head of the stream made the length NaN, the clock 00:00/00:00 and
  // the screen black, with no word to the teacher. The player plays the rest.
  const playable = useMemo(
    () => (events ?? []).filter((e: any) => Number.isFinite(e?.timestamp)),
    [events],
  );
  const brokenCount = (events?.length ?? 0) - playable.length;

  const firstTimestamp = playable.length > 0 ? playable[0].timestamp : 0;
  const lastTimestamp = playable.length > 0 ? playable[playable.length - 1].timestamp : 0;
  const totalDurationMs = Math.max(0, lastTimestamp - firstTimestamp);

  // The stretches between two openings of the meeting, as player offsets.
  const runGaps = useMemo(() => {
    const gaps: { from: number; to: number }[] = [];
    for (let i = 1; i < playable.length; i++) {
      if (playable[i].timestamp - playable[i - 1].timestamp > RUN_GAP_MS) {
        gaps.push({ from: playable[i - 1].timestamp - playable[0].timestamp, to: playable[i].timestamp - playable[0].timestamp });
      }
    }
    return gaps;
  }, [playable]);
  const runGapsRef = useRef(runGaps);
  runGapsRef.current = runGaps;

  const prevFingerprintRef = useRef<string>('');
  const recordingStartRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Torn down once, when the player leaves the page. This used to be the
  // cleanup of the effect below, which React runs before every re-run — so
  // each new chunk (and every write anywhere in the learner's recordings,
  // about every 2 s) destroyed the player first, the "stable instance" check
  // never held, and the resume point was always 0:00.
  useEffect(() => () => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (replayerRef.current) {
      try { replayerRef.current.pause(); } catch {}
      replayerRef.current = null;
    }
  }, []);

  // Initialize Replayer only when event content actually changes
  useEffect(() => {
    const container = containerRef.current;
    if (playable.length < 2 || !container) {
      if (replayerRef.current) {
        try { replayerRef.current.pause(); } catch { /* already gone */ }
        replayerRef.current = null;
      }
      if (container) container.innerHTML = "";
      prevFingerprintRef.current = '';
      recordingStartRef.current = null;
      return;
    }

    const currentFingerprint = `${playable.length}_${playable[0]?.timestamp}_${playable[playable.length - 1]?.timestamp}`;
    if (replayerRef.current && prevFingerprintRef.current === currentFingerprint) {
      return; // Stable instance - avoid destroy/rebuild to prevent ANY flicker
    }

    prevFingerprintRef.current = currentFingerprint;
    // A recording that is still being written grows under the teacher’s eyes.
    // Rebuilding the player is unavoidable (rrweb takes its events once); it
    // resumes from where the previous instance was, playing or paused as it
    // was. Another recording (another meeting) starts from its beginning.
    const sameRecording = replayerRef.current !== null && recordingStartRef.current === playable[0]?.timestamp;
    recordingStartRef.current = playable[0]?.timestamp ?? null;
    let resumeFrom = 0;
    let resumePaused = false;
    if (replayerRef.current) {
      if (sameRecording) {
        try { resumeFrom = Math.max(0, replayerRef.current.getCurrentTime() || 0); } catch { resumeFrom = 0; }
        resumePaused = holdPausedRef.current;
      }
      try { replayerRef.current.pause(); } catch { /* already gone */ }
      replayerRef.current = null;
    }
    if (!sameRecording) holdPausedRef.current = false;
    container.innerHTML = "";

    try {
      const metaEvent = playable.find((e: any) => e.type === 4);
      const originalWidth = metaEvent?.data?.width || 1280;
      const originalHeight = metaEvent?.data?.height || 720;

      const replayer = new Replayer(playable, {
        root: container,
        mouseTail: true,
        // rrweb replays the learner's recorded focus events with a real
        // focus() inside its iframe. That took the keyboard away from the
        // teacher's page: Escape and Tab stopped reaching a drawer opened
        // over the player.
        triggerFocus: false,
        speed: playbackSpeed,
        showWarning: false,
        showDebug: false,
        UNSAFE_replayCanvas: true,
      });

      replayerRef.current = replayer;

      // Start playing — from where the previous instance was, if there was one.
      if (resumePaused) {
        replayer.pause(resumeFrom);
        setIsPlaying(false);
      } else {
        replayer.play(resumeFrom);
        setIsPlaying(true);
      }
      setCurrentTimeMs(resumeFrom);

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
        // The exception text is for the console. Interpolating it into
        // innerHTML put a raw stack fragment on the teacher's screen — and
        // markup, had the recording carried any.
        container.replaceChildren();
        const notice = document.createElement('div');
        notice.setAttribute('role', 'alert');
        notice.className = 'p-6 bg-red-50 text-red-700 rounded-2xl m-4 font-bold text-center';
        notice.textContent = 'לא הצלחנו להפעיל את ההקלטה הזו. נסו לרענן את הדף; אם זה חוזר, ייתכן שההקלטה פגומה.';
        container.appendChild(notice);
      }
    }
  }, [playable]);

  // Keep the latest onProgress in a ref so the polling interval below doesn't
  // need to be torn down and recreated whenever the parent re-renders with a
  // fresh inline callback.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const stopAtRef = useRef(stopAtTime);
  stopAtRef.current = stopAtTime;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  // Track progress timer smoothly
  useEffect(() => {
    if (isPlaying) {
      progressTimerRef.current = setInterval(() => {
        if (replayerRef.current) {
          try {
            const current = replayerRef.current.getCurrentTime();
            if (!Number.isFinite(current)) return;
            setCurrentTimeMs(current);
            // מודול 21 §ב: סוף התרגיל שנבחר הוא סוף ההפעלה.
            const stopAt = stopAtRef.current;
            if (typeof stopAt === 'number' && firstTimestamp + current >= stopAt) {
              try { replayerRef.current.pause(); } catch {}
              holdPausedRef.current = true;
              setIsPlaying(false);
              onProgressRef.current?.(stopAt);
              onEndRef.current?.();
              return;
            }
            // Between two openings of the meeting nothing was recorded:
            // the player goes straight on to the next opening.
            const gap = runGapsRef.current.find((g) => current > g.from && current < g.to);
            if (gap) {
              replayerRef.current.play(gap.to);
              setCurrentTimeMs(gap.to);
              onProgressRef.current?.(firstTimestamp + gap.to);
              return;
            }
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

  // Handle external seek requests (e.g. clicking an event in the radar history).
  // Each request is applied once. The effect also re-runs when `events`
  // changes — so that a request made before the player existed is applied when
  // it does — and it used to seek again then: every chunk the learner wrote
  // threw the teacher back to the last row she had clicked and un-paused the
  // player (Module 21 §ב: both directions of the table↔player link).
  const appliedSeekRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seekToTime) {
      appliedSeekRef.current = null; // the parent withdrew its request (another meeting)
      return;
    }
    if (replayerRef.current && playable.length > 0) {
      const request = `${seekNonce ?? ''}@${seekToTime}`;
      if (appliedSeekRef.current === request) return;
      appliedSeekRef.current = request;
      const offset = Math.max(0, Math.min(totalDurationMs, seekToTime - firstTimestamp));
      try {
        replayerRef.current.play(offset);
        holdPausedRef.current = false;
        setIsPlaying(true);
        setCurrentTimeMs(offset);
      } catch (err) {
        console.warn("Could not seek player:", err);
      }
    }
  }, [seekToTime, seekNonce, playable, firstTimestamp, totalDurationMs]);

  const togglePlay = () => {
    if (!replayerRef.current) return;
    if (isPlaying) {
      replayerRef.current.pause();
      holdPausedRef.current = true;
      setIsPlaying(false);
    } else {
      replayerRef.current.play(currentTimeMs);
      holdPausedRef.current = false;
      setIsPlaying(true);
    }
  };

  const handleRestart = () => {
    if (!replayerRef.current) return;
    replayerRef.current.play(0);
    holdPausedRef.current = false;
    setIsPlaying(true);
    setCurrentTimeMs(0);
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetOffset = Number(e.target.value);
    setCurrentTimeMs(targetOffset);
    if (replayerRef.current) {
      replayerRef.current.play(targetOffset);
      holdPausedRef.current = false;
      setIsPlaying(true);
    }
  };

  // Module 21 §ב: the exercise segments on the timeline, placed by time.
  const playheadTs = firstTimestamp + currentTimeMs;
  const segments = (chapters ?? []).map((c, index) => {
    const startOffset = Math.max(0, Math.min(totalDurationMs, c.start - firstTimestamp));
    const endOffset = Math.max(startOffset, Math.min(totalDurationMs, c.end - firstTimestamp));
    const span = totalDurationMs || 1;
    return {
      index,
      label: c.label,
      leftPct: (startOffset / span) * 100,
      widthPct: ((endOffset - startOffset) / span) * 100,
      active: playheadTs >= c.start && playheadTs <= c.end,
    };
  });

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
          <p className="text-slate-800 dark:text-slate-200 font-bold text-xl">אין די נתוני הקלטה עבור מפגש זה</p>
          <p className="text-slate-500 text-sm leading-relaxed">
            המערכת מקליטה את מסך התלמיד באופן אוטומטי במהלך העבודה. עם ביצוע פעולות בבית המספרים, השחזור יוצג כאן במלואו.
          </p>
        </div>
      </div>
    );
  }

  // The recording arrived, and too little of it can be placed in time to play.
  if (playable.length < 2) {
    return (
      <div role="alert" className="p-6 bg-red-50 text-red-700 rounded-2xl m-4 font-bold text-center" dir="rtl">
        ההקלטה של המפגש הזה פגומה, ואי אפשר להציג אותה.
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full mx-auto bg-slate-900 text-white rounded-2xl shadow-xl overflow-hidden relative select-none" dir="rtl">
      {/* Top Controls Bar */}
      <div className="w-full bg-slate-900/90 border-b border-slate-800 p-4 flex flex-wrap items-center justify-between z-10 gap-4">
        {/* Playback Actions — they wrap rather than run out of a narrow player */}
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={togglePlay}
            className="w-11 h-11 bg-indigo-600 hover:bg-indigo-500 active:scale-95 rounded-xl flex items-center justify-center text-white transition-all shadow-md cursor-pointer"
            aria-label={isPlaying ? 'השהו את השחזור' : 'הפעילו את השחזור'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button 
            onClick={handleRestart}
            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-xl flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
            title="חזרה לתחילת המפגש"
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
        <div className="flex flex-wrap items-center gap-2">
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
            {/* rrweb's own events (snapshots, mouse moves, DOM changes) — not the
                learner's actions, which the decision table counts as "פעולות". */}
            {playable.length} אירועי הקלטה
          </div>
        </div>
      </div>

      {brokenCount > 0 && (
        <div role="status" className="w-full bg-amber-100 text-amber-950 text-xs font-bold px-5 py-2 border-b border-amber-300">
          חלק מההקלטה פגום ואינו מוצג.
        </div>
      )}

      {/* Timeline Scrubber, with the meeting's exercise segments on it (Module 21 §ב) */}
      <div dir="ltr" className="w-full bg-slate-850 px-5 py-2.5 border-b border-slate-800 flex flex-col gap-1.5">
        {segments.length > 0 && (
          <div className="relative w-full h-3" role="group" aria-label="התרגילים במפגש על ציר הזמן">
            {segments.map((s) => (
              <button
                key={`${s.index}-${s.leftPct}`}
                type="button"
                onClick={() => onChapterSelect?.(s.index)}
                title={s.label}
                aria-label={s.label}
                aria-current={s.active ? 'true' : undefined}
                style={{ left: `${s.leftPct}%`, width: `${s.widthPct}%`, minWidth: '4px' }}
                className={`absolute top-0 h-full rounded-sm border border-slate-900 cursor-pointer transition-colors ${
                  s.active
                    ? 'bg-indigo-400'
                    : s.index % 2 === 0
                      ? 'bg-slate-600 hover:bg-indigo-500'
                      : 'bg-slate-500 hover:bg-indigo-500'
                }`}
              />
            ))}
          </div>
        )}
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
