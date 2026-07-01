import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for recording raw telemetry data (mouse movements, clicks, interactions)
 * @param {boolean} isRecording - Whether to actively record events
 * @param {number} throttleMs - Throttle mousemove events to prevent huge arrays
 */
export default function useSessionRecorder(isRecording = true, throttleMs = 150) {
  const [events, setEvents] = useState([]);
  const startTimeRef = useRef(null);
  const lastMoveTimeRef = useRef(0);

  // Initialize start time when recording begins
  useEffect(() => {
    if (isRecording && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    if (!isRecording) {
      startTimeRef.current = null; // Reset on stop
    }
  }, [isRecording]);

  const addEvent = useCallback((type, data) => {
    if (!isRecording || !startTimeRef.current) return;
    const timeOffset = Date.now() - startTimeRef.current;
    
    setEvents(prev => [...prev, { time: timeOffset, type, ...data }]);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;

    const handleMouseMove = (e) => {
      const now = Date.now();
      if (now - lastMoveTimeRef.current >= throttleMs) {
        // Record relative to the viewport (or document). Using clientX/Y.
        addEvent('mousemove', { x: e.clientX, y: e.clientY });
        lastMoveTimeRef.current = now;
      }
    };

    const handleClick = (e) => {
      // Avoid recording clicks on the play/pause controls if this was a combined view,
      // but here it's running purely on the student workspace.
      addEvent('click', { x: e.clientX, y: e.clientY });
    };

    // Attach listeners to window
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('click', handleClick, { passive: true });
    // Also support touch
    window.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      if (touch) {
        const now = Date.now();
        if (now - lastMoveTimeRef.current >= throttleMs) {
          addEvent('mousemove', { x: touch.clientX, y: touch.clientY });
          lastMoveTimeRef.current = now;
        }
      }
    }, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('touchmove', handleMouseMove);
    };
  }, [isRecording, addEvent, throttleMs]);

  const clearRecording = useCallback(() => {
    setEvents([]);
    startTimeRef.current = Date.now(); // reset timer
  }, []);

  return {
    events,
    clearRecording,
    recordCustomEvent: (eventName, payload) => addEvent(eventName, payload)
  };
}
