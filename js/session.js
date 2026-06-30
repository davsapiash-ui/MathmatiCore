/* ============================================================
   מתמטיקאור — Session State Manager + Undo Stack
   
   Manages:
   - Student session data (name, session number, class mode)
   - Undo stack for place-value block actions (max 20 states)
   - Persistence Index: tracks time-on-task vs. random deletions
   - No timers displayed to student — all tracking is silent
   ============================================================ */

'use strict';

/* global rrweb, SessionManager, App, PlaceValueModel, DragController, StudentLogger, SilentRadar */

const SessionManager = (() => {

  /* ── Load from sessionStorage (set on login) ── */
  let isImpersonating = false;

  function loadStudentData() {
    try {
      const adminRaw = sessionStorage.getItem('mathematicor_admin_student_impersonation');
      if (adminRaw) {
        isImpersonating = true;
        return JSON.parse(adminRaw);
      }
      const raw = sessionStorage.getItem('mathematicor_student');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /* ── Current Session State ── */
  const student = loadStudentData();

  const state = {
    studentName:   student ? student.name      : 'תלמיד',
    username:      student ? student.username   : '',
    sessionNumber: student ? student.session    : 1,
    classMode:     student ? student.classMode  : 'regular',   // 'regular' | 'asd'
    loginTime:     student ? student.loginTime  : Date.now(),

    /* Current task within the session (0-indexed) */
    taskIndex: 0,

    /* Q-Matrix results — filled during session 2 */
    qmatrixResults: {
      q1: null,  /* ערך המקום והאפס */
      q2: null,  /* ישר המספרים */
      q3: null,  /* פירוק והרכבה */
      q4: null,  /* אבחון לאחור */
      q5: null   /* השינוי הקטן */
    },

    /* Persistence Index components (measured silently) */
    persistence: {
      undoCount:         0,    /* total Undo actions — pedagogical, not penalized */
      randomDeleteCount: 0,    /* rapid deletions without task progress */
      taskCompletions:   0,    /* tasks completed independently */
      hintsRequested:    0,    /* support palette uses */
      totalTimeMs:       0     /* cumulative active time */
    }
  };

  /* ── Undo Stack ─────────────────────────────────────────────
     Each entry is a deep-snapshot of the PlaceValue model state.
     Max depth: 20 states.
     Undo is PEDAGOGICAL — it is encouraged as self-regulation,
     not penalized. Each use increments persistence.undoCount.
  ─────────────────────────────────────────────────────────── */
  const UNDO_MAX_DEPTH = 20;
  const undoStack = [];

  /**
   * Push a snapshot of the place-value model onto the undo stack.
   * @param {object} pvSnapshot - { units, tens, hundreds, thousands }
   */
  function pushUndoState(pvSnapshot) {
    undoStack.push(JSON.parse(JSON.stringify(pvSnapshot)));
    if (undoStack.length > UNDO_MAX_DEPTH) {
      undoStack.shift();  /* drop oldest state */
    }
  }

  /**
   * Pop the most recent undo state. Returns null if stack is empty.
   * Also increments the Persistence Index undo counter.
   * @returns {object|null}
   */
  function popUndoState() {
    if (undoStack.length === 0) return null;
    state.persistence.undoCount++;
    return undoStack.pop();
  }

  /** Check if there's anything to undo */
  function canUndo() {
    return undoStack.length > 0;
  }

  /** Clear the undo stack (e.g. when moving to a new task) */
  function clearUndoStack() {
    undoStack.length = 0;
  }

  /* ── Q-Matrix Result Recording ── */
  /**
   * Record the result of a Q-Matrix diagnostic task.
   * @param {string}  taskId   - 'q1' through 'q5'
   * @param {boolean} correct  - whether the student answered correctly
   * @param {string}  detail   - optional detail about the error type
   */
  function recordQMatrixResult(taskId, correct, detail = '') {
    state.qmatrixResults[taskId] = {
      correct,
      detail,
      timestamp: Date.now(),
      undoUsed: state.persistence.undoCount,
      hintsUsed: state.persistence.hintsRequested
    };
    if (correct) state.persistence.taskCompletions++;
  }

  function updateQMatrixResult(taskId, data) {
    state.qmatrixResults[taskId] = {
      ...state.qmatrixResults[taskId],
      ...data
    };
    saveToStorage();
  }

  /* ── Task Navigation ── */
  function advanceTask() {
    state.taskIndex++;
    clearUndoStack();
    saveToStorage();
  }

  function getCurrentTaskIndex() {
    return state.taskIndex;
  }

  /* ── Persistence Index Calculations ── */
  function incrementHintCount() {
    state.persistence.hintsRequested++;
  }

  /**
   * Compute the Persistence Index score.
   * High score = long time on task + low random deletes.
   * Returned as a 0-100 normalized value for teacher dashboard.
   * NEVER displayed to the student.
   */
  function computePersistenceIndex() {
    const { undoCount, randomDeleteCount, taskCompletions, hintsRequested } = state.persistence;
    /* Positive signals: undo usage (self-correction), task completions */
    const positive = (undoCount * 2) + (taskCompletions * 10);
    /* Negative signals: random rapid deletes without progress */
    const negative = randomDeleteCount * 3;
    const raw = Math.max(0, positive - negative);
    return Math.min(100, raw);
  }

  /* ── ASD Mode Helpers ── */
  function isASDMode() {
    return state.classMode === 'asd';
  }

  /* ── Storage Persistence (between pages) ── */
  function saveToStorage() {
    if (isImpersonating) return; /* Prevent altering real student data while admin is viewing */
    try {
      sessionStorage.setItem('mathematicor_state', JSON.stringify({
        taskIndex:      state.taskIndex,
        qmatrixResults: state.qmatrixResults,
        persistence:    state.persistence
      }));
    } catch { /* silent fail */ }
  }

  function restoreFromStorage() {
    try {
      const raw = sessionStorage.getItem('mathematicor_state');
      if (!raw) return;
      const saved = JSON.parse(raw);
      state.taskIndex      = saved.taskIndex      ?? 0;
      state.qmatrixResults = saved.qmatrixResults ?? state.qmatrixResults;
      state.persistence    = saved.persistence    ?? state.persistence;
    } catch { /* silent fail */ }
  }

  /* Initialize: restore previous state if page was refreshed */
  restoreFromStorage();

  /* ── Guard: redirect to login if no session ── */
  function requireStudentSession() {
    if (!student) {
      window.location.href = '../index.html';
      return false;
    }
    return true;
  }

  /* ── Public API ── */
  return {
    state,
    pushUndoState,
    popUndoState,
    canUndo,
    clearUndoStack,
    recordQMatrixResult,
    updateQMatrixResult,
    advanceTask,
    getCurrentTaskIndex,
    incrementHintCount,
    computePersistenceIndex,
    isASDMode,
    saveToStorage,
    requireStudentSession,
    isImpersonating: () => isImpersonating
  };

})();
