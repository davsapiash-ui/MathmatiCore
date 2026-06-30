/* ============================================================
   מתמטיקאור — Student Activity Logger & Session Recorder
   
   Logs structured pedagogical actions (drags, drops, undos, hints, errors)
   and records full visual sessions using rrweb for playback.
   
   Saves to localStorage:
   - 'mathematicor_student_logs_[username]' for structured events
   - 'mathematicor_student_replay_[username]' for rrweb visual events
   ============================================================ */

'use strict';

/* global rrweb, SessionManager, App, PlaceValueModel, DragController, StudentLogger, SilentRadar */

const StudentLogger = (() => {

  let rrwebEvents = [];
  let structuredLogs = [];
  let username = 'guest';
  let sessionNum = 1;
  let isRecording = false;

  function init() {
    /* Get student info from SessionManager if available */
    if (typeof SessionManager !== 'undefined' && SessionManager.state) {
      username = SessionManager.state.username || 'student_sso';
      sessionNum = SessionManager.state.sessionNumber || 1;
    }

    /* Load existing logs for this session to append */
    try {
      const existing = localStorage.getItem(`mathematicor_student_logs_${username}`);
      structuredLogs = existing ? JSON.parse(existing) : [];
    } catch (e) {
      structuredLogs = [];
    }

    logEvent('session_start', { sessionNum, timestamp: Date.now() });

    /* Start rrweb recording if rrweb is loaded */
    if (typeof rrweb !== 'undefined') {
      try {
        rrwebEvents = [];
        rrweb.record({
          emit(event) {
            rrwebEvents.push(event);
            /* Throttle saving to localStorage every 15 events to prevent heavy I/O */
            if (rrwebEvents.length % 15 === 0) {
              saveReplayData();
            }
          },
        });
        isRecording = true;
        console.log('rrweb recording started silently for student:', username);
      } catch (err) {
        console.warn('Failed to start rrweb recording:', err);
      }
    } else {
      console.warn('rrweb is not defined. Session replay recording is disabled.');
    }

    /* Save session on page unload/visibility change */
    window.addEventListener('beforeunload', saveAll);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveAll();
      }
    });
  }

  /**
   * Log a structured pedagogical event
   * @param {string} eventType - e.g., 'block_drop', 'undo', 'hint_shown'
   * @param {object} detail - key-value pairs of details
   */
  function logEvent(eventType, detail = {}) {
    const activeTask = (typeof QMatrix !== 'undefined' && QMatrix.getCurrentTask) 
      ? QMatrix.getCurrentTask() 
      : null;
    
    const pvState = (typeof PlaceValueModel !== 'undefined') 
      ? PlaceValueModel.getAllCounts() 
      : null;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: eventType,
      taskId: activeTask ? activeTask.id : 'unknown',
      taskType: activeTask ? activeTask.type : 'unknown',
      detail: detail,
      pvState: pvState
    };

    structuredLogs.push(logEntry);
    saveLogs();

    /* Also trigger active event updates to save to server/db simulation */
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('mathematicor_new_log', { detail: logEntry });
      window.dispatchEvent(event);
    }
  }

  function saveLogs() {
    try {
      localStorage.setItem(`mathematicor_student_logs_${username}`, JSON.stringify(structuredLogs));
    } catch (e) {
      console.error('Error saving structured logs:', e);
    }
  }

  function saveReplayData() {
    if (!isRecording) return;
    try {
      localStorage.setItem(`mathematicor_student_replay_${username}`, JSON.stringify(rrwebEvents));
    } catch (e) {
      /* If localStorage is full, truncate early rrweb events */
      if (e.name === 'QuotaExceededError' && rrwebEvents.length > 500) {
        rrwebEvents.splice(0, 100); // discard oldest 100 events
        try {
          localStorage.setItem(`mathematicor_student_replay_${username}`, JSON.stringify(rrwebEvents));
        } catch (inner) {}
      }
    }
  }

  function saveAll() {
    saveLogs();
    saveReplayData();
  }

  /* ── Public API ── */
  return {
    init,
    logEvent,
    saveAll
  };

})();

/* Auto-initialize on student space when DOM is ready */
if (typeof window !== 'undefined' && window.location.pathname.includes('/student/')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      /* Wait briefly for other modules to load */
      setTimeout(StudentLogger.init, 100);
    });
  } else {
    setTimeout(StudentLogger.init, 100);
  }
}
