import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, FastForward, Rewind, MousePointer2, Layers, Map, Target } from 'lucide-react';

/**
 * Renders a session replay for a student.
 * 
 * @param {Object} props
 * @param {Array} props.events - Array of {time, type, x, y, ...data}
 * @param {number} props.duration - Total duration of the session in ms
 */
export default function SessionReplayViewer({ events = [], duration = 10000 }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [viewOptions, setViewOptions] = useState({
    showCursor: true,
    showClicks: true,
    showTrails: true,
    showHeatmap: false
  });

  const requestRef = useRef();
  const lastUpdateRef = useRef();
  const canvasRef = useRef();

  // Sort events by time just in case
  const sortedEvents = [...events].sort((a, b) => a.time - b.time);
  
  // Find current cursor position
  const currentEventIndex = sortedEvents.findIndex(e => e.time >= currentTime);
  const lastEvent = currentEventIndex > 0 ? sortedEvents[currentEventIndex - 1] : sortedEvents[0];
  
  // Calculate trail (last 2 seconds)
  const trailEvents = viewOptions.showTrails 
    ? sortedEvents.filter(e => e.time <= currentTime && e.time >= currentTime - 2000 && e.type === 'mousemove')
    : [];

  const clicksToDraw = viewOptions.showClicks
    ? sortedEvents.filter(e => e.type === 'click' && e.time <= currentTime)
    : [];

  // Playback Loop
  const animate = time => {
    if (lastUpdateRef.current != undefined) {
      const deltaTime = time - lastUpdateRef.current;
      setCurrentTime(prevTime => {
        const nextTime = prevTime + deltaTime * playbackSpeed;
        if (nextTime >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return nextTime;
      });
    }
    lastUpdateRef.current = time;
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      lastUpdateRef.current = undefined;
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, playbackSpeed, duration]);

  // Heatmap rendering (Canvas)
  useEffect(() => {
    if (viewOptions.showHeatmap && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      // Resize canvas to match container exactly
      const parent = canvas.parentElement;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw all mousemove events up to current time as soft glowing dots
      const heatmapEvents = sortedEvents.filter(e => e.time <= currentTime && e.type === 'mousemove');
      
      heatmapEvents.forEach(e => {
        const gradient = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 20);
        gradient.addColorStop(0, 'rgba(255, 0, 0, 0.05)');
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 20, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, [currentTime, viewOptions.showHeatmap, sortedEvents]);

  const toggleOption = (opt) => setViewOptions(prev => ({ ...prev, [opt]: !prev[opt] }));

  return (
    <div className="replay-container relative bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700 w-full h-[600px] flex flex-col">
      {/* Replay Screen */}
      <div className="flex-1 relative overflow-hidden bg-slate-800">
        <div className="absolute top-4 right-4 text-white/50 text-sm font-mono z-20 pointer-events-none">
          {Math.floor(currentTime / 1000)}s / {Math.floor(duration / 1000)}s
        </div>

        {/* Heatmap Canvas */}
        {viewOptions.showHeatmap && (
          <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none opacity-80" />
        )}

        {/* Trail SVG Layer */}
        {viewOptions.showTrails && trailEvents.length > 1 && (
          <svg className="absolute inset-0 z-20 pointer-events-none w-full h-full">
            <polyline
              points={trailEvents.map(e => `${e.x},${e.y}`).join(' ')}
              fill="none"
              stroke="rgba(255, 50, 50, 0.6)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-md"
            />
          </svg>
        )}

        {/* Clicks */}
        {clicksToDraw.map((c, i) => (
          <div 
            key={i}
            className="absolute z-20 w-4 h-4 rounded-full bg-yellow-400/60 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 shadow-lg"
            style={{ left: c.x, top: c.y }}
            title="Click"
          >
            {/* Ripple effect for recent clicks */}
            {currentTime - c.time < 500 && (
              <div className="absolute inset-0 rounded-full bg-yellow-400 animate-ping opacity-75"></div>
            )}
          </div>
        ))}

        {/* Virtual Cursor */}
        {viewOptions.showCursor && lastEvent && (
          <div 
            className="absolute z-30 pointer-events-none transition-transform duration-100 ease-linear"
            style={{ 
              transform: `translate(${lastEvent.x}px, ${lastEvent.y}px)`,
              marginLeft: '-10px',
              marginTop: '-10px'
            }}
          >
            <MousePointer2 className="text-white drop-shadow-md" size={24} fill="rgba(0,0,0,0.5)" />
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="bg-slate-900 border-t border-slate-700 p-4 flex flex-col gap-4">
        {/* Scrubber */}
        <input 
          type="range" 
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
          min="0"
          max={duration}
          value={currentTime}
          onChange={(e) => {
            setCurrentTime(Number(e.target.value));
            if (!isPlaying) lastUpdateRef.current = undefined;
          }}
        />

        <div className="flex justify-between items-center">
          {/* Playback Controls */}
          <div className="flex gap-2">
            <button 
              className="p-2 hover:bg-slate-800 rounded-full text-white transition-colors"
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "השהה" : "נגן"}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button 
              className="p-2 hover:bg-slate-800 rounded-full text-white transition-colors flex items-center gap-1 text-sm font-medium"
              onClick={() => setPlaybackSpeed(s => s === 4 ? 1 : s * 2)}
              title="מהירות ניגון"
            >
              <FastForward size={16} /> x{playbackSpeed}
            </button>
            <button 
              className="p-2 hover:bg-slate-800 rounded-full text-white transition-colors"
              onClick={() => setCurrentTime(0)}
              title="התחל מחדש"
            >
              <Rewind size={16} />
            </button>
          </div>

          {/* View Toggles */}
          <div className="flex gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button 
              className={`p-2 rounded-md transition-all ${viewOptions.showCursor ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              onClick={() => toggleOption('showCursor')}
              title="הצג סמן"
            >
              <MousePointer2 size={18} />
            </button>
            <button 
              className={`p-2 rounded-md transition-all ${viewOptions.showClicks ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              onClick={() => toggleOption('showClicks')}
              title="הצג לחיצות"
            >
              <Target size={18} />
            </button>
            <button 
              className={`p-2 rounded-md transition-all ${viewOptions.showTrails ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              onClick={() => toggleOption('showTrails')}
              title="הצג שובל תנועה (מרקורים)"
            >
              <Layers size={18} />
            </button>
            <button 
              className={`p-2 rounded-md transition-all ${viewOptions.showHeatmap ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              onClick={() => toggleOption('showHeatmap')}
              title="הצג מפת חום"
            >
              <Map size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
