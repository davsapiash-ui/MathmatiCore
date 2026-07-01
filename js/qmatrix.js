/* ============================================================
   מתמטיקאור — Q-Matrix Diagnostic Engine (Session 2)
   
   Implements the 5 adaptive mapping tasks (מפגש 2 — מיפוי יכולות).
   Each task maps to prerequisite skills from grades 1-3.
   On error, "Backward Diagnosis" (מעוף הדבורה) activates.
   
   ASD adaptations are embedded and activated via classMode.
   No scores or times are shown to students.
   ============================================================ */

'use strict';

/* global App, PlaceValueModel, DragController, SessionManager, StudentLogger, SilentRadar */

const QMatrix = (() => {

  /* ── Task Definitions ────────────────────────────────────────
     Each task:
       id            : unique identifier
       targetSkill   : grade 3 skill being assessed
       prereqSkill   : grade 2 prerequisite
       rootSkill     : grade 1 foundational skill
       number        : main number for this task
       asdNumber     : simplified number for ASD mode
       type          : rendering type for the workspace renderer
   ─────────────────────────────────────────────────────────── */
  const TASKS = [
    {
      id:           'task1_zero_placeholder',
      type:         'place_value_zero',
      titleHe:      'שומר המקום',
      instructionHe: 'בנו את המספר המופיע למטה בטבלת ערך המקום, ואז בחרו את התשובה הנכונה:',
      number:       304,
      asdNumber:    70,
      /* Three closed-choice options (always in this order) */
      choices: [
        { id: 'A', textHe: 'האפס שומר על טור העשרות, ומראה שאין עשרות במספר זה.' },
        { id: 'B', textHe: 'האפס לא באמת משנה, המספר הוא בדיוק כמו 34.' },
        { id: 'C', textHe: 'האפס רק מקשט את המספר, ואפשר למחוק אותו.' }
      ],
      correctChoice: 'A',
      /* What to check in the block placement */
      expectedBlocks: { hundreds: 3, tens: 0, units: 4 },
      asdExpectedBlocks: { tens: 7, units: 0 },
      /* Backward diagnosis trigger on error */
      backwardDiagnosis: {
        triggerOn:    'wrong_choice',
        subtaskNumber: 70,
        asdSubtaskNumber: 30,
        subtaskInstructionHe: 'בואו נבדוק על מספר קטן יותר: מה עושה האפס במספר?',
        subtaskChoices: [
          { id: 'A', textHe: 'הוא שומר על המקום של טור היחידות, ומראה שאין לנו יחידות כלל.' },
          { id: 'B', textHe: 'האפס מיותר לחלוטין ואפשר למחוק אותו.' }
        ],
        correctChoice: 'A'
      }
    },
    {
      id:           'task2_estimation_error_margin',
      type:         'number_line',
      titleHe:      'מסע על ישר המספרים',
      instructionHe: 'היכן לדעתכם ממוקם המספר 750 על ישר המספרים? גררו את החץ למקום המתאים.',
      number:       750,
      range:        [0, 1000],
      asdNumber:    35,
      asdRange:     [0, 100],
      /* Acceptable error margin (±5% of range = ±50) */
      errorMarginPct: 0.07,
      backwardDiagnosis: {
        triggerOn:     'large_deviation',
        deviationPct:  0.15,
        subtaskNumber: 35,
        subtaskRange:  [0, 100],
        asdSubtaskNumber: 15,
        asdSubtaskRange:  [0, 50],
        subtaskInstructionHe: 'בואו ננסה על ישר קצר יותר: איפה נמקם את המספר?',
        /* ASD: glowing anchor ticks at 10, 20, 30, ... */
        asdAnchors: [10, 20, 30, 40, 50, 60, 70, 80, 90]
      }
    },
    {
      id:           'task3_flexible_regrouping',
      type:         'flexible_decomp',
      titleHe:      'פירוק והרכבה גמישים',
      instructionHe: 'בנו את המספר 240 בטבלת ערך המקום, ולחצו "הוסף ייצוג". לאחר מכן, מצאו דרך נוספת לייצג את אותו המספר ולחצו שוב! (רמז: נסו להיעזר בפריטה).',
      number:       240,
      asdNumber:    34,
      /* Two valid representations */
      validRepresentations: [
        { hundreds: 2, tens: 4, units: 0 },             /* 2 מאות + 4 עשרות */
        { hundreds: 1, tens: 14, units: 0 },             /* 1 מאה + 14 עשרות */
        { hundreds: 2, tens: 3,  units: 10 },            /* 2 מאות + 3 עשרות + 10 יחידות */
        { hundreds: 0, tens: 24, units: 0 }              /* 24 עשרות */
      ],
      asdValidRepresentations: [
        { tens: 3, units: 4 },
        { tens: 2, units: 14 },
        { tens: 1, units: 24 }
      ],
      backwardDiagnosis: {
        triggerOn:    'only_canonical',
        subtaskInstructionHe: 'הדגמה מודרכת: לחץ פעמיים על עמודת עשרת אחת כדי לפרק אותה ל-10 יחידות, ואז הוסף את הייצוג החדש בטבלה.',
        showAutoUngroup: true,
        subtaskNumber: 34,
        asdSubtaskNumber: 34
      }
    },
    {
      id:           'task4_basic_addition_fluency',
      type:         'vertical_addition',
      titleHe:      'חיבור במאונך',
      instructionHe: 'פתרו את תרגיל החיבור בטבלת ערך המקום, ורשמו את התוצאה בתיבות התשובה.',
      numberA:      126,
      numberB:      235,
      asdNumberA:   26,
      asdNumberB:   15,
      correctAnswer:    361,
      asdCorrectAnswer: 41,
      backwardDiagnosis: {
        triggerOn:    'wrong_answer',
        /* Probe: is this a procedural (column alignment) or fact error? */
        probeA:       4,
        probeB:       3,
        probeAnswer:  7,
        probeInstructionHe: 'בואו ננסה תרגיל קטן יותר כדי להתחמם: כמה הם 4 ועוד 3?',
        graphicOrganizerASD: true   /* ASD: show as graphic organizer */
      }
    },
    {
      id:           'q5_small_change', /* Not strictly in required schema, kept for logic but named uniquely */
      type:         'small_change',
      titleHe:      'השינוי הקטן — אומדן',
      instructionHe: 'הביטו בתרגיל שפתרנו עבורכם. נסו לענות על השאלה הבאה בלי לחשב מחדש, רק בעזרת חשיבה והיגיון!',
      givenHe:      '45 + 10 = 55',
      questionHe:   'כמה הם 45 + 9?',
      choices: [
        { id: 'A', textHe: '54 — כי חיברנו 9 במקום 10, ולכן הסכום קטן ב-1.' },
        { id: 'B', textHe: '55 — הסכום תמיד נשאר זהה.' },
        { id: 'C', textHe: '56 — כי הוספנו עוד יחידה אחת.' },
        { id: 'D', textHe: 'חייבים לחשב הכול מחדש בשביל לדעת.' }
      ],
      correctChoice: 'A',
      /* 'D' is the procedural-trap (lack of flexibility) */
      flexibilityTrapChoice: 'D',
      backwardDiagnosis: {
        triggerOn:    'flexibility_trap',
        visualHint:   true,   /* show animated cube removal */
        hintHe:       'רמז: אם נוסיף 9 במקום 10, אנחנו בעצם מוסיפים יחידה אחת פחות. איך זה משפיע על סכום התרגיל?'
      }
    }
  ];

  /* Current state */
  let currentTaskIdx      = 0;
  let phase               = 'primary';   /* 'primary' | 'correction' */
  let correctionSubphase  = 'subtask';   /* 'subtask' | 'retry' */
  let failedTasks         = [];
  let correctionIdx       = 0;
  let representationCount = 0;          /* for task q3: how many shown so far */
  let isASD               = false;
  let onTaskComplete      = null;        /* callback(taskId, correct, detail, spec) */
  let onAllComplete       = null;        /* callback: all 5 tasks done */

  /* ── Initialize ── */
  function init(options = {}) {
    isASD               = options.asdMode   ?? false;
    onTaskComplete      = options.onTaskComplete ?? null;
    onAllComplete       = options.onAllComplete  ?? null;
    currentTaskIdx      = 0;
    phase               = 'primary';
    correctionSubphase  = 'subtask';
    failedTasks         = [];
    correctionIdx       = 0;
  }

  /** Get the current task definition */
  function getCurrentTask() {
    return TASKS[currentTaskIdx] ?? null;
  }

  /** Get total task count */
  function getTotalTasks() {
    return TASKS.length;
  }

  /** Get effective number for current mode */
  function getEffectiveNumber(task) {
    if (!task) return null;
    if (phase === 'correction' && correctionSubphase === 'subtask') {
      if (isASD && task.backwardDiagnosis?.asdSubtaskNumber !== undefined) {
        return task.backwardDiagnosis.asdSubtaskNumber;
      }
      if (task.backwardDiagnosis?.subtaskNumber !== undefined) {
        return task.backwardDiagnosis.subtaskNumber;
      }
    }
    if (isASD && task.asdNumber !== undefined) return task.asdNumber;
    return task.number;
  }

  /** Get effective range for number line */
  function getEffectiveRange(task) {
    if (!task) return null;
    if (phase === 'correction' && correctionSubphase === 'subtask') {
      if (isASD && task.backwardDiagnosis?.asdSubtaskRange !== undefined) {
        return task.backwardDiagnosis.asdSubtaskRange;
      }
      if (task.backwardDiagnosis?.subtaskRange) {
        return task.backwardDiagnosis.subtaskRange;
      }
    }
    if (isASD && task.asdRange) return task.asdRange;
    return task.range;
  }

  /** Get effective choices for current mode */
  function getEffectiveChoices(task) {
    if (!task) return [];
    if (phase === 'correction' && correctionSubphase === 'subtask' && task.backwardDiagnosis?.subtaskChoices) {
      return task.backwardDiagnosis.subtaskChoices;
    }
    return task.choices ?? [];
  }

  /** Get expected blocks for validation */
  function getExpectedBlocks(task) {
    if (phase === 'correction' && correctionSubphase === 'subtask') return null; // We do not validate blocks in backward subtasks
    if (isASD && task.asdExpectedBlocks) return task.asdExpectedBlocks;
    return task.expectedBlocks ?? null;
  }

  /* ── Answer Evaluation ──────────────────────────────────────
     Each task type has its own evaluation logic.
  ─────────────────────────────────────────────────────────── */

  /**
   * Evaluate task q1 (place value & zero).
   * Checks: (1) correct multiple choice, (2) correct block placement.
   * @param {string}  selectedChoice - 'A' | 'B' | 'C'
   * @param {object}  blockCounts    - { units, tens, hundreds, ... }
   * @returns {{ correct: boolean, detail: string, triggerBackward: boolean }}
   */
  function evaluateQ1(selectedChoice, blockCounts) {
    const task          = TASKS[0];
    if (phase === 'correction' && correctionSubphase === 'subtask') {
      const correct = selectedChoice === task.backwardDiagnosis.correctChoice;
      return {
        correct,
        detail:          correct ? '' : 'wrong_subtask_choice',
        triggerBackward: false
      };
    }
    const choiceCorrect = selectedChoice === task.correctChoice;
    const expected      = getExpectedBlocks(task);

    let blockCorrect = true;
    if (expected) {
      blockCorrect = Object.entries(expected).every(([place, count]) => {
        return (blockCounts[place] ?? 0) === count;
      });
    }

    const correct = choiceCorrect && blockCorrect;
    return {
      correct,
      detail:          correct ? '' : (choiceCorrect ? 'wrong_blocks' : 'wrong_choice'),
      triggerBackward: !correct
    };
  }

  /**
   * Evaluate task q2 (number line positioning).
   * @param {number} markerValue   - the value the student placed the marker at
   * @returns {{ correct: boolean, deviation: number, triggerBackward: boolean }}
   */
  function evaluateQ2(markerValue) {
    const task       = TASKS[1];
    if (phase === 'correction' && correctionSubphase === 'subtask') {
      const target     = task.backwardDiagnosis.subtaskNumber;
      const rangeSize  = task.backwardDiagnosis.subtaskRange[1] - task.backwardDiagnosis.subtaskRange[0];
      const deviation  = Math.abs(markerValue - target);
      const deviationPct = deviation / rangeSize;
      const correct    = deviationPct <= task.errorMarginPct;
      return {
        correct,
        deviation,
        deviationPct,
        detail:          correct ? '' : `subtask_deviation_${Math.round(deviationPct * 100)}pct`,
        triggerBackward: false
      };
    }
    const target     = isASD ? task.asdNumber  : task.number;
    const rangeSize  = isASD ? (task.asdRange[1] - task.asdRange[0])
                             : (task.range[1] - task.range[0]);
    const deviation  = Math.abs(markerValue - target);
    const deviationPct = deviation / rangeSize;
    const correct    = deviationPct <= task.errorMarginPct;
    const largeDev   = deviationPct >= (task.backwardDiagnosis.deviationPct ?? 0.15);

    return {
      correct,
      deviation,
      deviationPct,
      detail:          correct ? '' : `deviation_${Math.round(deviationPct * 100)}pct`,
      triggerBackward: !correct && largeDev
    };
  }

  /**
   * Evaluate task q3 (flexible decomposition).
   * Must show two DIFFERENT valid representations.
   * @param {object[]} representations - array of { units, tens, hundreds, thousands }
   * @returns {{ correct: boolean, triggerBackward: boolean }}
   */
  function evaluateQ3(representations) {
    const task    = TASKS[2];
    let validArray;

    if (phase === 'correction' && correctionSubphase === 'subtask') {
       validArray = isASD ? [{ tens: 1, units: 4 }, { tens: 0, units: 14 }] 
                          : [{ tens: 3, units: 4 }, { tens: 2, units: 14 }, { tens: 1, units: 24 }];
    } else {
       validArray = isASD ? task.asdValidRepresentations : task.validRepresentations;
    }

    /* Check: values match one of the predefined valid representations */
    const validatedReps = representations.filter(rep => {
      return validArray.some(validRep => {
        return (rep.units ?? 0) === (validRep.units ?? 0) &&
               (rep.tens ?? 0) === (validRep.tens ?? 0) &&
               (rep.hundreds ?? 0) === (validRep.hundreds ?? 0) &&
               (rep.thousands ?? 0) === (validRep.thousands ?? 0);
      });
    });

    if (phase === 'correction' && correctionSubphase === 'subtask') {
      if (validatedReps.length < 2) return { correct: false, detail: 'insufficient_reps', triggerBackward: false };
      const r1 = validatedReps[0];
      const r2 = validatedReps[1];
      const different = (r1.units ?? 0) !== (r2.units ?? 0) ||
                        (r1.tens ?? 0) !== (r2.tens ?? 0) ||
                        (r1.hundreds ?? 0) !== (r2.hundreds ?? 0) ||
                        (r1.thousands ?? 0) !== (r2.thousands ?? 0);
      return { correct: different, detail: different ? '' : 'only_canonical', triggerBackward: false };
    }

    if (validatedReps.length < 2) {
      return { correct: false, detail: 'insufficient_reps', triggerBackward: true };
    }

    /* Check they are genuinely different */
    const r1 = validatedReps[0];
    const r2 = validatedReps[1];
    const different = (r1.units ?? 0) !== (r2.units ?? 0) ||
                      (r1.tens ?? 0) !== (r2.tens ?? 0) ||
                      (r1.hundreds ?? 0) !== (r2.hundreds ?? 0) ||
                      (r1.thousands ?? 0) !== (r2.thousands ?? 0);

    /* Backward diagnosis: only canonical form shown (no flexibility) */
    const onlyCanonical = !different;

    return {
      correct:         different,
      detail:          different ? '' : 'only_canonical',
      triggerBackward: onlyCanonical
    };
  }

  /**
   * Evaluate task q4 (vertical addition).
   * @param {number} studentAnswer
   * @returns {{ correct: boolean, triggerBackward: boolean }}
   */
  function evaluateQ4(studentAnswer) {
    const task    = TASKS[3];
    if (phase === 'correction' && correctionSubphase === 'subtask') {
      const correct = studentAnswer === task.backwardDiagnosis.probeAnswer;
      return {
        correct,
        detail:          correct ? '' : 'wrong_subtask_answer',
        triggerBackward: false
      };
    }
    const correct = isASD
      ? (studentAnswer === task.asdCorrectAnswer)
      : (studentAnswer === task.correctAnswer);
    return {
      correct,
      detail:          correct ? '' : 'wrong_answer',
      triggerBackward: !correct
    };
  }

  /**
   * Evaluate task q5 (small change / estimation).
   * @param {string} selectedChoice
   * @returns {{ correct: boolean, isFlexibilityTrap: boolean }}
   */
  function evaluateQ5(selectedChoice) {
    const task              = TASKS[4];
    const correct           = selectedChoice === task.correctChoice;
    const isFlexibilityTrap = selectedChoice === task.flexibilityTrapChoice;
    
    if (phase === 'correction' && correctionSubphase === 'subtask') {
        return { correct, isFlexibilityTrap, detail: correct ? '' : 'wrong_subtask_choice', triggerBackward: false };
    }

    return {
      correct,
      isFlexibilityTrap,
      detail:          correct ? '' : (isFlexibilityTrap ? 'flexibility_trap' : 'wrong_choice'),
      triggerBackward: !correct
    };
  }

  /* Dev skip result recorder */
  function recordResult(taskId, correct, traceData = {}) {
    SessionManager.recordQMatrixResult(taskId, correct, 'dev_skip');
  }

  /* ── Task Completion Handler ── */
  /**
   * Called after student submits an answer for the current task.
   * Records result, fires backward diagnosis if needed, advances task.
   * @param {object} evalResult - result from one of the evaluate* functions
   */
  function handleTaskResult(evalResult) {
    const task = getCurrentTask();
    if (!task) return;

    const { correct, detail, triggerBackward } = evalResult;

    if (phase === 'primary') {
      /* Record in session and radar */
      SessionManager.recordQMatrixResult(task.id, correct, detail, evalResult);
      if (!correct) {
        SilentRadar.recordTaskError(task.id, detail);
      }

      /* In primary phase, we always proceed without immediate backward diagnosis */
      if (onTaskComplete) {
        onTaskComplete(task.id, correct, 'primary_done', null);
      }
    } else {
      /* Phase is 'correction' */
      const results = SessionManager.state.qmatrixResults[task.id] || {};
      if (correctionSubphase === 'subtask') {
        results.subtaskCorrect = correct;
        results.subtaskDetail = detail;
        if (task.id === 'task4_basic_addition_fluency') {
          results.q4_backward_diag = correct ? 'procedural_error' : 'basic_facts_error';
        }
        SessionManager.updateQMatrixResult(task.id, results);

        if (onTaskComplete) {
          onTaskComplete(task.id, correct, 'subtask_done', null);
        }
      } else {
        results.secondAttemptCorrect = correct;
        results.secondAttemptDetail = detail;
        SessionManager.updateQMatrixResult(task.id, results);

        if (onTaskComplete) {
          onTaskComplete(task.id, correct, 'retry_done', null);
        }
      }
    }
  }

  /**
   * Advance to the next task.
   * Called by app.js after the workspace completes feedback display.
   */
  function advanceToNextTask() {
    if (phase === 'primary') {
      currentTaskIdx++;
      representationCount = 0;
      SessionManager.advanceTask();

      if (currentTaskIdx >= TASKS.length) {
        /* Primary round completed! Check for any failed tasks */
        const results = SessionManager.state.qmatrixResults;
        failedTasks = TASKS.filter(t => {
          const res = results[t.id];
          return res && !res.correct;
        }).map(t => t.id);

        if (failedTasks.length > 0) {
          phase = 'correction';
          correctionIdx = 0;
          correctionSubphase = 'subtask';
          const firstFailedId = failedTasks[0];
          currentTaskIdx = TASKS.findIndex(t => t.id === firstFailedId);
          
          if (onTaskComplete) {
            onTaskComplete(firstFailedId, false, 'start_correction', getTaskById(firstFailedId).backwardDiagnosis);
          }
        } else {
          /* No failed tasks! reflection */
          if (onAllComplete) onAllComplete();
        }
      }
    } else {
      /* Phase is 'correction' */
      if (correctionSubphase === 'subtask') {
        correctionSubphase = 'retry';
        if (onTaskComplete) {
          onTaskComplete(getCurrentTask().id, false, 'start_retry', null);
        }
      } else {
        correctionIdx++;
        if (correctionIdx < failedTasks.length) {
          correctionSubphase = 'subtask';
          const nextFailedId = failedTasks[correctionIdx];
          currentTaskIdx = TASKS.findIndex(t => t.id === nextFailedId);
          if (onTaskComplete) {
            onTaskComplete(nextFailedId, false, 'start_correction', getTaskById(nextFailedId).backwardDiagnosis);
          }
        } else {
          /* Corrections completed! */
          if (onAllComplete) onAllComplete();
        }
      }
    }
  }

  /** Check if all tasks are done */
  function isComplete() {
    if (phase === 'primary') {
      return currentTaskIdx >= TASKS.length;
    }
    return correctionIdx >= failedTasks.length;
  }

  /* ── Backward Diagnosis Mode ──────────────────────────────────
     When a student makes an error, the system offers a simplified
     probe task from a lower grade level.
     This is transparent to the student (just another task).
  ─────────────────────────────────────────────────────────── */
  function enterBackwardDiagnosis(taskId) {
    phase = 'correction';
    SilentRadar.recordStudentAction();
    return TASKS.find(t => t.id === taskId)?.backwardDiagnosis ?? null;
  }

  /* ── Representation Counter (for Task q3) ── */
  function incrementRepCount() { representationCount++; }
  function getRepCount()       { return representationCount; }

  /* ── Getters ── */
  function getTaskById(id)    { return TASKS.find(t => t.id === id); }
  function getCurrentPhase()  { return phase; }

  /* ── Public API ── */
  return {
    init,
    TASKS,
    getCurrentTask,
    getTotalTasks,
    getEffectiveNumber,
    getEffectiveRange,
    getEffectiveChoices,
    getExpectedBlocks,
    evaluateQ1,
    evaluateQ2,
    evaluateQ3,
    evaluateQ4,
    evaluateQ5,
    handleTaskResult,
    advanceToNextTask,
    isComplete,
    enterBackwardDiagnosis,
    incrementRepCount,
    getRepCount,
    getTaskById,
    getCurrentPhase,
    recordResult
  };
})();
