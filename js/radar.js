/* ============================================================
   מתמטיקאור — Silent Pedagogical Radar
   
   Monitors student interaction silently and invisibly.
   CRITICAL RULES:
   - NEVER displays any timer, countdown, or time indicator to student.
   - NEVER interrupts the student's work.
   - 15-second hesitation threshold → silent alert to teacher queue.
   - All data stored in localStorage (teacher dashboard reads it).
   - Student is completely unaware of this monitoring.
   ============================================================ */

'use strict';

/* global rrweb, SessionManager, App, PlaceValueModel, DragController, StudentLogger, SilentRadar */

const SilentRadar = (() => {

  /* Configuration constants */
  const HESITATION_THRESHOLD_MS = 30000;   /* 30 seconds of inactivity = cognitive hesitation (per pedagogical spec) */
  const RADAR_STORAGE_KEY       = 'mathematicor_radar_alerts';
  const MAX_STORED_ALERTS       = 50;

  /* Internal state */
  let hesitationTimer     = null;
  let lastActionTime      = Date.now();
  let currentTaskId       = null;
  let studentUsername     = '';
  let sessionNumber       = 0;
  let isRadarActive       = false;

  /* Rapid-delete detection */
  let recentDeleteTimes   = [];
  const RAPID_DELETE_WINDOW_MS = 3000;  /* 3 seconds */
  const RAPID_DELETE_THRESHOLD = 3;     /* 3+ deletes in window = "passive drifting" */

  /* ── Initialize Radar ── */
  /**
   * Start the radar for a specific student and task.
   * Called by app.js when a task becomes active.
   * @param {string} username
   * @param {number} session
   * @param {string} taskId
   */
  function start(username, session, taskId) {
    studentUsername = username;
    sessionNumber   = session;
    currentTaskId   = taskId;
    isRadarActive   = true;
    lastActionTime  = Date.now();
    resetHesitationTimer();
  }

  /** Stop radar (e.g. task completed, page unload) */
  function stop() {
    isRadarActive = false;
    clearTimeout(hesitationTimer);
    hesitationTimer = null;
  }

  /** Update current task context when navigating */
  function setTask(taskId) {
    currentTaskId = taskId;
    resetHesitationTimer();
    recentDeleteTimes = [];
  }

  /* ── Hesitation Timer ────────────────────────────────────────
     Resets every time the student takes an action.
     If 15 seconds pass without any action → fire hesitation alert.
     This fires silently into localStorage — no UI change for student.
  ─────────────────────────────────────────────────────────── */
  function resetHesitationTimer() {
    clearTimeout(hesitationTimer);
    if (!isRadarActive) return;
    lastActionTime = Date.now();
    hesitationTimer = setTimeout(() => {
      fireHesitationAlert();
    }, HESITATION_THRESHOLD_MS);
  }

  function fireHesitationAlert() {
    const alert = buildAlert('HESITATION', {
      taskId:         currentTaskId,
      durationMs:     Date.now() - lastActionTime,
      sessionNumber:  sessionNumber
    });
    storeAlert(alert);
    if (typeof StudentLogger !== 'undefined') {
      StudentLogger.logEvent('hesitation_alert', { durationMs: Date.now() - lastActionTime });
    }
    /* Restart timer in case student remains idle */
    hesitationTimer = setTimeout(() => {
      fireHesitationAlert();
    }, HESITATION_THRESHOLD_MS);
  }

  /* ── Rapid Delete Detection ──────────────────────────────────
     If student deletes 3+ blocks in under 3 seconds without task
     progress, this signals "passive drifting" not self-correction.
  ─────────────────────────────────────────────────────────── */
  function recordDeleteAction() {
    const now = Date.now();
    /* Keep only recent deletes within the window */
    recentDeleteTimes = recentDeleteTimes.filter(t => now - t < RAPID_DELETE_WINDOW_MS);
    recentDeleteTimes.push(now);

    if (recentDeleteTimes.length >= RAPID_DELETE_THRESHOLD) {
      const alert = buildAlert('PASSIVE_DRIFTING', {
        taskId:        currentTaskId,
        deleteCount:   recentDeleteTimes.length,
        windowMs:      RAPID_DELETE_WINDOW_MS,
        sessionNumber: sessionNumber
      });
      storeAlert(alert);
      /* Increment session persistence negative signal */
      if (typeof SessionManager !== 'undefined') {
        SessionManager.state.persistence.randomDeleteCount++;
      }
      recentDeleteTimes = [];  /* reset window after alert */
    }
  }

  /* ── Hint Request Recording ── */
  function recordHintRequest() {
    const alert = buildAlert('HINT_REQUESTED', {
      taskId:        currentTaskId,
      sessionNumber: sessionNumber
    });
    storeAlert(alert);
  }

  /* ── Task Struggle Recording ── */
  function recordTaskError(taskId, errorDetail) {
    const alert = buildAlert('TASK_ERROR', {
      taskId:        taskId,
      detail:        errorDetail,
      sessionNumber: sessionNumber
    });
    storeAlert(alert);
  }

  /* ── Student Action (resets hesitation timer) ──
     Call this on every meaningful student interaction:
     drag, drop, click, input change. ── */
  function recordStudentAction() {
    if (!isRadarActive) return;
    resetHesitationTimer();
  }

  /* ── Alert Builder ── */
  function buildAlert(type, data) {
    return {
      id:            `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,          /* 'HESITATION' | 'PASSIVE_DRIFTING' | 'HINT_REQUESTED' | 'TASK_ERROR' */
      student:       studentUsername,
      timestamp:     new Date().toISOString(),
      unread:        true,
      ...data
    };
  }

  /* ── localStorage Alert Queue (teacher dashboard reads this) ── */
  function storeAlert(alert) {
    try {
      const key = RADAR_STORAGE_KEY;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push(alert);
      /* Prevent unbounded growth */
      if (existing.length > MAX_STORED_ALERTS) {
        existing.splice(0, existing.length - MAX_STORED_ALERTS);
      }
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {
      /* Silent fail — storage might be unavailable */
    }
  }

  /** Read all pending alerts (for teacher dashboard — Phase B) */
  function readAlerts() {
    try {
      return JSON.parse(localStorage.getItem(RADAR_STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  /** Mark alerts as read (called by teacher dashboard) */
  function markAlertsRead() {
    try {
      const alerts = readAlerts().map(a => ({ ...a, unread: false }));
      localStorage.setItem(RADAR_STORAGE_KEY, JSON.stringify(alerts));
    } catch { /* silent fail */ }
  }

  /** Clear all alerts (called after teacher reviews session) */
  function clearAlerts() {
    try {
      localStorage.removeItem(RADAR_STORAGE_KEY);
    } catch { /* silent fail */ }
  }

  /* ── Public API ── */
  return {
    start,
    stop,
    setTask,
    recordStudentAction,
    recordDeleteAction,
    recordHintRequest,
    recordTaskError,
    readAlerts,
    markAlertsRead,
    clearAlerts
  };

})();
