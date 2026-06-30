/* ============================================================
   מתמטיקאור — Teacher Radar Reader (js/teacher-radar-reader.js)

   Reads the silent radar buffer written by radar.js and
   exposes structured RadarAlert objects to the dashboard UI.

   NEVER writes to the student's screen.
   Teacher has full Override on every alert.
   ============================================================ */

'use strict';

/* global App, QMatrix, PlaceValueModel, DragController, SessionManager, StudentLogger, SilentRadar, gsap, Draggable, Swal, rrweb, Chart, bootstrap */

const TeacherRadarReader = (() => {

  const STORAGE_KEY = 'mathematicor_radar_alerts';
  const HANDLED_KEY = 'mathematicor_radar_handled';

  /* ── Alert Type Definitions ── */
  const ALERT_META = {
    HESITATION: {
      icon:     '⏸',
      titleFn:  (a) => `${a.studentName} — היסוס קוגניטיבי ב-${a.taskLabel}`,
      detailFn: (a) => `לא בוצעה פעולה במשך ${a.durationSec} שניות`,
      severity: 'warning',
      actionLabel: 'שלח רמז שקט'
    },
    PASSIVE_DRIFTING: {
      icon:     '🌀',
      titleFn:  (a) => `${a.studentName} — שיוט פסיבי ב-${a.taskLabel}`,
      detailFn: (a) => `${a.deleteCount} מחיקות ברצף ללא התקדמות (${a.durationSec}s)`,
      severity: 'danger',
      actionLabel: 'גש אליו עכשיו'
    },
    HINT_REQUESTED: {
      icon:     '💡',
      titleFn:  (a) => `${a.studentName} — ביקש עזרה ב-${a.taskLabel}`,
      detailFn: (a) => `סוג עזרה שנבחר: ${_translateHintType(a.hintType)} (פעם ${a.hintCount})`,
      severity: 'info',
      actionLabel: 'עקוב'
    },
    TASK_ERROR: {
      icon:     '❌',
      titleFn:  (a) => `${a.studentName} — שגיאה ב-${a.taskLabel}`,
      detailFn: (a) => `תשובה שגויה${a.detail ? ': ' + a.detail : ''}. מופעל אבחון לאחור.`,
      severity: 'error',
      actionLabel: 'ספק משוב תהליך'
    }
  };

  /* ── Internal Helpers ── */
  function _translateHintType(type) {
    const m = { metacognitive: 'רמז מטא-קוגניטיבי', socratic: 'שאלה מנחה', worked_example: 'דוגמה פתורה' };
    return m[type] ?? type;
  }

  function _taskLabel(taskId) {
    const m = {
      q1: 'ערך המקום והאפס',
      q2: 'ישר המספרים',
      q3: 'פירוק גמיש',
      q4: 'חיבור במאונך',
      q5: 'השינוי הקטן',
      's1_t0': 'מפגש 1 — היכרות',
      's1_t1': 'תרגיל 1',
      's1_t2': 'תרגיל 2',
      's1_t3': 'תרגיל 3'
    };
    return m[taskId] ?? taskId;
  }

  /* ── Read raw alerts from localStorage ── */
  function _readRawAlerts() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function _readHandled() {
    try {
      return new Set(JSON.parse(localStorage.getItem(HANDLED_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }

  /* ── Parse raw alert object into a rich RadarAlert ── */
  function _enrich(raw) {
    const meta = ALERT_META[raw.type] || {
      icon: '❔',
      titleFn:  (a) => a.type,
      detailFn: ()  => '',
      severity: 'info',
      actionLabel: 'עיין'
    };

    const enriched = {
      ...raw,
      taskLabel:   _taskLabel(raw.taskId),
      icon:        meta.icon,
      title:       meta.titleFn(raw),
      detail:      meta.detailFn(raw),
      severity:    meta.severity,
      actionLabel: meta.actionLabel,
      timeAgo:     _timeAgo(raw.timestamp),
      handled:     false
    };

    return enriched;
  }

  function _timeAgo(ts) {
    const diffMs  = Date.now() - ts;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)  return 'לפני רגע';
    if (diffMin < 60) return `לפני ${diffMin} ד׳`;
    return `לפני ${Math.floor(diffMin / 60)} ש׳`;
  }

  /* ── Public API ── */

  /**
   * Returns all unhandled radar alerts, newest first.
   */
  function getAlerts({ sessionId = null } = {}) {
    const raw     = _readRawAlerts();
    const handled = _readHandled();

    return raw
      .filter(a => !sessionId || a.sessionId === sessionId)
      .map(a => ({ ..._enrich(a), handled: handled.has(a.id) }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Returns count of unhandled alerts (for badge).
   */
  function getUnhandledCount(sessionId = null) {
    return getAlerts({ sessionId }).filter(a => !a.handled).length;
  }

  /**
   * Mark an alert as handled (teacher override).
   * @param {string} alertId
   */
  function markHandled(alertId) {
    const handled = _readHandled();
    handled.add(alertId);
    localStorage.setItem(HANDLED_KEY, JSON.stringify([...handled]));
  }

  /**
   * Returns latest status per student.
   * Status: 'active' | 'hesitant' | 'stuck' | 'done'
   */
  function getStudentStatuses() {
    const alerts = getAlerts();
    const now    = Date.now();
    const map    = {};

    for (const alert of alerts) {
      const un = alert.username;
      if (!map[un]) map[un] = { username: un, studentName: alert.studentName, status: 'active', lastActivity: 0, taskId: alert.taskId };

      if (alert.timestamp > map[un].lastActivity) {
        map[un].lastActivity = alert.timestamp;
        map[un].taskId = alert.taskId;
      }

      /* Escalate status */
      if (alert.type === 'PASSIVE_DRIFTING' && !alert.handled) map[un].status = 'stuck';
      else if (alert.type === 'HESITATION'  && !alert.handled && map[un].status !== 'stuck') map[un].status = 'hesitant';
    }

    /* Students idle for >30s from last radar event → stuck */
    for (const s of Object.values(map)) {
      if ((now - s.lastActivity) > 30000 && s.status === 'active') {
        s.status = 'hesitant';
      }
    }

    return Object.values(map);
  }

  /**
   * Returns session Q-Matrix results per student (for clustering).
   */
  function getQMatrixResults() {
    try {
      return JSON.parse(localStorage.getItem('mathematicor_qmatrix_results') || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Returns session reflections (for classroom manager).
   */
  function getReflections() {
    try {
      return JSON.parse(localStorage.getItem('mathematicor_reflections') || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Live polling: calls `callback(alerts, statuses)` every `intervalMs`.
   * Returns a stop function.
   */
  function startPolling(callback, intervalMs = 3000) {
    callback(getAlerts(), getStudentStatuses());
    const timer = setInterval(() => {
      callback(getAlerts(), getStudentStatuses());
    }, intervalMs);
    return () => clearInterval(timer);
  }

  return {
    getAlerts,
    getUnhandledCount,
    markHandled,
    getStudentStatuses,
    getQMatrixResults,
    getReflections,
    startPolling
  };

})();
