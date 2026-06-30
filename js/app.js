/* ============================================================
   מתמטיקאור — Application Controller (app.js)
   
   Orchestrates: session init, task rendering, Undo, Support Palette,
   Q-Matrix flow, navigation, and radar integration.
   
   Navigation is STRICTLY LINEAR:
   - Only "הבא" (Proceed) and "בטל" (Undo) buttons.
   - No menus, no back navigation between tasks.
   ============================================================ */

'use strict';

/* global Swal, QMatrix, DragController, PlaceValueModel, SessionManager, StudentLogger, SilentRadar, confetti */

const App = (() => {

  /* ── DOM References ── */
  const dom = {};

  /* ── Security ── */
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag]));
  }

  function safeJSONParse(str, defaultVal) {
    try {
      const parsed = JSON.parse(str);
      return parsed !== null ? parsed : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }

  const SESSION1_TASKS = [
    {
      id:   's1_welcome',
      type: 'session1_intro',
      titleHe:       'ברוכים הבאים לטבלת ערך המקום! 🎉',
      instructionHe: 'קחו מאה אחת והניחו אותה בטור המאות. איזה מספר קיבלנו? עכשיו, "פרטו" את המאה על ידי גרירתה לטור העשרות.',
      thoughtQuestionHe: 'האם הערך של המספר השתנה כשהעברנו את המאה לעשרות?',
      choices: [
        { id: 'א', textHe: 'לא! הערך נשאר 100. המאה עברה פריטה ל-10 עשרות, ולכן הסך הכול לא השתנה.' },
        { id: 'ב', textHe: 'המספר גדל, כי עכשיו יש לנו 10 עשרות במקום מאה אחת.' },
        { id: 'ג', textHe: 'המספר קטן לאפס, כי המאה נעלמה.' }
      ],
      correctAnswer: 'א'
    },
    {
      id:   's1_t1',
      type: 'addition_simple',
      numberA: 12, numberB: 24, correctAnswer: 36,
      titleHe:       'חיבור בטבלת ערך המקום',
      instructionHe: 'בואו נחבר: 12 + 24. תחילה בנו את המספר 12, ואז הוסיפו את המספר 24. כמה קיבלנו סך הכול?'
    },
    {
      id:   's1_t2',
      type: 'place_value_zero',
      titleHe:      'מה תפקידו של האפס?',
      instructionHe: 'בנו את המספר 205 בטבלת ערך המקום, ואז ענו: מדוע אנו כותבים אפס (0) במספר 205?',
      number:       205,
      choices: [
        { id: 'A', textHe: 'האפס שומר על המקום של טור העשרות, ומראה שאין עשרות במספר זה.' },
        { id: 'B', textHe: 'האפס לא באמת משנה, המספר הוא בדיוק כמו 25.' },
        { id: 'C', textHe: 'האפס רק מקשט את המספר, ואפשר למחוק אותו.' }
      ],
      correctAnswer: 'A',
      expectedBlocks: { hundreds: 2, tens: 0, units: 5 }
    },
    {
      id:   's1_t3',
      type: 'flexible_decomp',
      titleHe:      'ייצוגים שונים לאותו המספר',
      instructionHe: 'בנו את המספר 234 בטבלה. האם תצליחו לייצג את אותו המספר בדרך נוספת? (רמז: נסו להיעזר בפריטה של עשרת ליחידות).',
      number:       234
    },
    {
      id:   's1_t4',
      type: 'number_line',
      titleHe:      'היכן אני ממוקם?',
      instructionHe: 'הביטו על ישר המספרים. היכן לדעתכם ממוקם המספר 60? גררו את החץ למקום המתאים.',
      number:       60,
      range:        [0, 100]
    },
    {
      id:   's1_t5',
      type: 'addition_simple',
      numberA: 524, numberB: 322, isSubtraction: true, correctAnswer: 202,
      titleHe:       'חיסור בטבלת ערך המקום',
      instructionHe: 'בואו נפתור: 524 - 322. בנו את המספר 524 בטבלה, ואז הסירו ממנו את המספר 322. מה קיבלנו?'
    }
  ];

  const SESSION3_TASKS = [
    {
      id:   's3_t1',
      type: 'addition_simple',
      numberA: 146, numberB: 235, correctAnswer: 381,
      titleHe:       'חיבור עם המרה - מתחילים!',
      instructionHe: 'בואו נחבר: 146 + 235. זכרו: כאשר נאספים 10 פריטים בטור אחד, אנו מבצעים המרה לטור הבא משמאל!'
    },
    {
      id:   's3_t2',
      type: 'addition_simple',
      numberA: 257, numberB: 124, correctAnswer: 381,
      titleHe:       'חיבור עם המרה - תרגיל 2',
      instructionHe: 'בואו נחבר: 257 + 124. בנו את המספרים בטבלה, ובצעו המרה אם נאספו 10 פריטים או יותר בטור אחד.'
    },
    {
      id:   's3_t3',
      type: 'addition_simple',
      numberA: 138, numberB: 245, correctAnswer: 383,
      titleHe:       'המרה מיחידות לעשרות',
      instructionHe: 'פתרו: 138 + 245. מה קורה כשיש לנו 8 יחידות ועוד 5 יחידות? בצעו המרה של 10 יחידות לעשרת אחת.'
    },
    {
      id:   's3_t4',
      type: 'addition_simple',
      numberA: 356, numberB: 182, correctAnswer: 538,
      titleHe:       'המרה מעשרות למאות',
      instructionHe: 'פתרו: 356 + 182. מה קורה כשמחברים 5 עשרות עם 8 עשרות? בצעו המרה של 10 עשרות למאה אחת.'
    },
    {
      id:   's3_t5',
      type: 'addition_simple',
      numberA: 489, numberB: 175, correctAnswer: 664,
      titleHe:       'המרה כפולה - גם וגם!',
      instructionHe: 'תרגיל אתגר: 489 + 175. כאן תבצעו המרה גם בטור היחידות וגם בטור העשרות. בהצלחה!'
    }
  ];

  const SESSION4_TASKS = [
    {
      id:   's4_t1',
      type: 'addition_simple',
      numberA: 342, numberB: 125, correctAnswer: 217, isSubtraction: true,
      titleHe:       'חיסור עם פריטה - מתחילים!',
      instructionHe: 'בואו נפתור: 342 - 125. מה עושים כשאין מספיק יחידות בטור היחידות כדי לחסר? מבצעים פריטה של עשרת אחת ל-10 יחידות!'
    },
    {
      id:   's4_t2',
      type: 'addition_simple',
      numberA: 524, numberB: 216, correctAnswer: 308, isSubtraction: true,
      titleHe:       'חיסור עם פריטה - תרגיל 2',
      instructionHe: 'פתרו: 524 - 216. זכרו לבצע פריטה במידת הצורך.'
    },
    {
      id:   's4_t3',
      type: 'addition_simple',
      numberA: 425, numberB: 118, correctAnswer: 307, isSubtraction: true,
      titleHe:       'פריטה מעשרת ליחידות',
      instructionHe: 'פתרו: 425 - 118. כדי שנוכל לחסר 8 יחידות מתוך 5 יחידות, נבצע פריטה של עשרת אחת ל-10 יחידות.'
    },
    {
      id:   's4_t4',
      type: 'addition_simple',
      numberA: 632, numberB: 271, correctAnswer: 361, isSubtraction: true,
      titleHe:       'פריטה ממאה לעשרות',
      instructionHe: 'פתרו: 632 - 271. כדי שנוכל לחסר 7 עשרות מתוך 3 עשרות, נבצע פריטה של מאה אחת ל-10 עשרות.'
    },
    {
      id:   's4_t5',
      type: 'addition_simple',
      numberA: 513, numberB: 285, correctAnswer: 228, isSubtraction: true,
      titleHe:       'פריטה כפולה - גם וגם!',
      instructionHe: 'תרגיל אתגר: 513 - 285. כאן תבצעו פריטה גם ממאה לעשרות וגם מעשרת ליחידות. בהצלחה!'
    }
  ];

  /* ── State ── */
  let currentSessionTasks = [];
  let currentTaskIdx      = 0;
  let isSession2       = false;
  let activeSession    = 1;
  let q3Reps           = [];          /* collected representations for task q3 */
  let awaitingNextTask = false;       /* prevent double-advance */
  let hasInteracted    = false;       /* UI restriction: requires interaction to proceed */
  let scaffoldFadeLevel = 0;         /* Scaffold fading: 0=full, 4=mostly invisible */

  /* ── Initialization ── */
  function init() {
    /* Guard: must be logged in */
    if (!SessionManager.requireStudentSession()) return;

    /* Populate DOM references */
    dom.studentNameBadge  = document.getElementById('student-name-badge');
    dom.taskCard          = document.getElementById('task-card');
    dom.sessionLabel      = document.getElementById('task-session-label');
    dom.taskTitle         = document.getElementById('task-title');
    dom.taskInstruction   = document.getElementById('task-instruction');
    dom.numberDisplay     = document.getElementById('task-number-display');
    dom.taskBody          = document.getElementById('task-body');
    dom.pvContainer       = document.getElementById('pv-columns-row');
    dom.paletteEl         = document.getElementById('block-palette');
    dom.valueDisplay      = document.getElementById('pv-value-display');
    dom.progressDots      = document.getElementById('task-progress-dots');
    dom.btnProceed        = document.getElementById('btn-proceed');
    dom.btnUndo           = document.getElementById('btn-undo');
    dom.helpBtn           = document.getElementById('help-request-btn');
    dom.supportPalette    = document.getElementById('support-palette');
    dom.supportClose      = document.getElementById('support-palette-close');
    dom.feedbackOverlay   = document.getElementById('feedback-overlay');
    /* btn-toggle-instructions removed — element does not exist in workspace.html */

    /* Show student name */
    if (dom.studentNameBadge) {
      dom.studentNameBadge.textContent = SessionManager.state.studentName;
    }

    /* Determine active session */
    activeSession = SessionManager.state.sessionNumber;
    isSession2    = (activeSession === 2);
    
    if (activeSession === 1) currentSessionTasks = SESSION1_TASKS;
    else if (activeSession === 3) currentSessionTasks = SESSION3_TASKS;
    else if (activeSession === 4) currentSessionTasks = SESSION4_TASKS;

    /* Initialize manipulatives */
    DragController.init({
      container:    dom.pvContainer,
      palette:      dom.paletteEl,
      valueDisplay: dom.valueDisplay,
      asdMode:      SessionManager.isASDMode(),
      onChange:     onBlocksChanged
    });

    /* Initialize Q-Matrix if session 2 */
    if (isSession2) {
      QMatrix.init({
        asdMode:         SessionManager.isASDMode(),
        onTaskComplete:  onQTaskComplete,
        onAllComplete:   onAllQTasksComplete
      });
      renderProgressDots();
    }

    /* Wire buttons */
    dom.btnProceed?.addEventListener('click', handleProceed);
    dom.btnUndo?.addEventListener('click', handleUndo);
    dom.helpBtn?.addEventListener('click', openSupportPalette);
    dom.supportClose?.addEventListener('click', closeSupportPalette);

    /* Dev Skip Button */
    const devSkipBtn = document.getElementById('btn-dev-skip');
    if (devSkipBtn) {
      devSkipBtn.addEventListener('click', () => {
        if (typeof Swal !== 'undefined') Swal.close(); // Close any active alerts
        
        if (isSession2) {
          const task = QMatrix.getCurrentTask();
          if (task) QMatrix.recordResult(task.id, true, getTaskTraceData());
          QMatrix.advanceToNextTask();
          if (QMatrix.isComplete()) {
            showFeedback(true, 'כל הכבוד! מפגש 2 הושלם בהצלחה! 🎉', 'עוברים כעת אוטומטית למפגש 3...');
            setTimeout(() => {
              hideFeedback();
              const student = safeJSONParse(sessionStorage.getItem('mathematicor_student'), {});
              student.session = 3;
              student.taskIndex = 0;
              sessionStorage.setItem('mathematicor_student', JSON.stringify(student));
              sessionStorage.removeItem('mathematicor_state');
              window.location.reload();
            }, 2500);
          } else {
            renderQTask();
          }
        } else {
          currentTaskIdx++;
          if (currentTaskIdx >= currentSessionTasks.length) {
            let nextSess = activeSession === 1 ? 2 : (activeSession === 3 ? 4 : null);
            if (nextSess) {
              showFeedback(true, `כל הכבוד! מפגש ${activeSession} הושלם בהצלחה! 🎉`, `עוברים כעת אוטומטית למפגש ${nextSess}...`);
              setTimeout(() => {
                hideFeedback();
                const student = safeJSONParse(sessionStorage.getItem('mathematicor_student'), {});
                student.session = nextSess;
                student.taskIndex = 0;
                sessionStorage.setItem('mathematicor_student', JSON.stringify(student));
                sessionStorage.removeItem('mathematicor_state');
                window.location.reload();
              }, 2500);
            } else {
              showFeedback(true, 'כל הכבוד! סיימתם את כל המפגשים! 🎉', '');
              setTimeout(() => { window.location.href = '../index.html'; }, 2500);
            }
          } else {
            renderStandardTask();
          }
        }
      });
    }

    /* Wire drawer toggle */
    dom.btnToggleBoard = document.getElementById('btn-toggle-board');
    if (dom.btnToggleBoard) {
      dom.btnToggleBoard.addEventListener('click', () => {
        const board = document.getElementById('place-value-structure');
        if (board) {
          board.classList.toggle('open');
          const isOpen = board.classList.contains('open');
          dom.btnToggleBoard.innerHTML = isOpen 
            ? '<i class="fa-solid fa-xmark"></i> סגור טבלת ערך מקום' 
            : '<i class="fa-solid fa-table"></i> פתח טבלת ערך מקום';
        }
      });
    }

    /* Wire support options */
    document.querySelectorAll('.support-option[data-support]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-support');
        handleSupportChoice(type);
        closeSupportPalette();
      });
    });

    /* Start silent radar */
    SilentRadar.start(
      SessionManager.state.username,
      activeSession,
      isSession2 ? QMatrix.getCurrentTask()?.id : 's1_t0'
    );

    /* Load first task */
    if (isSession2) {
      renderQTask();
    } else {
      renderStandardTask();
    }

    /* Keyboard: space/enter = proceed, backspace = undo */
    document.addEventListener('keydown', handleKeyboard);
  }

  /* ── Standard Task Rendering (Sessions 1, 3, 4) ── */
  function renderStandardTask() {
    const task = currentSessionTasks[currentTaskIdx];
    if (!task) return;

    let sessionName = 'היכרות ותפעול';
    if (activeSession === 3) sessionName = 'חיבור עם המרה';
    if (activeSession === 4) sessionName = 'חיסור עם פריטה';
    dom.sessionLabel.textContent = `מפגש ${activeSession} — ${sessionName}`;
    
    dom.taskTitle.textContent    = task.titleHe;
    dom.taskInstruction.textContent = task.instructionHe;

    /* Show/hide number display */
    if (task.number !== undefined) {
      dom.numberDisplay.textContent = task.number;
      dom.numberDisplay.classList.remove('hidden', 'd-none');
    } else {
      // Do not show the horizontal formula for addition_simple/vertical_addition as per user request
      dom.numberDisplay.classList.add('hidden', 'd-none');
    }

    /* Render task body */
    if (task.type === 'session1_intro') {
      dom.taskBody.innerHTML = `
        <div style="margin-top:var(--space-4); background:var(--color-surface-2); padding:var(--space-4); border-radius:var(--radius-lg); border:1px solid var(--color-border); direction:rtl; text-align:right;">
          <p style="font-weight:700; font-size:var(--font-size-md); margin-bottom:var(--space-3); color:var(--color-primary-dark); line-height:1.6;">
            🤔 שאלת חשיבה: ${escapeHTML(task.thoughtQuestionHe || '')}
          </p>
          ${renderChoicesHTML(task.choices)}
        </div>
      `;
      setupChoiceListeners();
    } else if (task.type === 'addition_simple') {
      const op = task.isSubtraction ? '-' : '+';
      dom.taskBody.innerHTML = renderVerticalAdditionHTML(task.numberA, task.numberB, op);
      const inputs = Array.from(dom.taskBody.querySelectorAll('.v-add-answer-input'));
      inputs.forEach(input => {
        input.addEventListener('input', () => {
          hasInteracted = true;
          updateProceedButton();
          SilentRadar.recordStudentAction();
        });
      });
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    } else if (task.type === 'place_value_zero') {
      dom.taskBody.innerHTML = renderChoicesHTML(task.choices);
      setupChoiceListeners();
    } else if (task.type === 'number_line') {
      dom.taskBody.innerHTML = renderNumberLineHTML(task);
      setupNumberLine(task);
    } else if (task.type === 'small_change') {
      dom.taskBody.innerHTML = renderSmallChangeHTML(task);
      setupChoiceListeners();
    } else if (task.type === 'flexible_decomp') {
      q3Reps = [];
      dom.taskBody.innerHTML = renderFlexDecompHTML();
    } else {
      dom.taskBody.innerHTML = '';
    }

    /* Reset model and re-render columns */
    PlaceValueModel.reset();
    DragController.refresh();
    SessionManager.clearUndoStack();
    updateUndoButton();

    hasInteracted = false;
    updateProceedButton();

    SilentRadar.setTask(`s${activeSession}_t${currentTaskIdx}`);
    if (typeof StudentLogger !== 'undefined') {
      StudentLogger.logEvent('task_loaded', { taskId: task.id, title: task.titleHe });
    }
    dom.taskCard.classList.remove('fade-in');
    void dom.taskCard.offsetWidth;
    dom.taskCard.classList.add('fade-in');
  }

  /* ── Session 2: Q-Matrix Task Rendering ── */
  function renderQTask() {
    const task = QMatrix.getCurrentTask();
    if (!task) return;

    dom.sessionLabel.textContent = 'מפגש 2 — מיפוי יכולות אישי';
    dom.taskTitle.textContent    = task.titleHe;
    dom.taskInstruction.textContent = task.instructionHe;

    const num = QMatrix.getEffectiveNumber(task);
    if (num !== null && task.type !== 'vertical_addition') {
      dom.numberDisplay.textContent = num;
      dom.numberDisplay.classList.remove('hidden', 'd-none');
    } else {
      dom.numberDisplay.classList.add('hidden', 'd-none');
    }

    /* Render task-specific body */
    switch (task.type) {
      case 'place_value_zero':
        dom.taskBody.innerHTML = renderChoicesHTML(QMatrix.getEffectiveChoices(task));
        setupChoiceListeners();
        break;
      case 'number_line':
        dom.taskBody.innerHTML = renderNumberLineHTML(task);
        setupNumberLine(task);
        break;
      case 'flexible_decomp':
        q3Reps = [];
        dom.taskBody.innerHTML = renderFlexDecompHTML();
        break;
      case 'vertical_addition': {
        const a = SessionManager.isASDMode() ? task.asdNumberA : task.numberA;
        const b = SessionManager.isASDMode() ? task.asdNumberB : task.numberB;
        dom.taskBody.innerHTML = renderVerticalAdditionHTML(a, b);
        const addInputs = Array.from(dom.taskBody.querySelectorAll('.v-add-answer-input'));
        addInputs.forEach((input, idx) => {
          input.addEventListener('input', () => {
            hasInteracted = true;
            updateProceedButton();
            SilentRadar.recordStudentAction();
            // Auto-tab to the left (previous input in LTR DOM order) if a digit is entered
            if (input.value.length >= 1 && idx > 0) {
              addInputs[idx - 1].focus();
            }
          });
        });
        if (addInputs.length > 0) {
          addInputs[addInputs.length - 1].focus();
        }
        break;
      }
      case 'small_change':
        dom.taskBody.innerHTML = renderSmallChangeHTML(task);
        setupChoiceListeners();
        break;
    }

    /* Reset model */
    PlaceValueModel.reset();
    DragController.refresh();
    SessionManager.clearUndoStack();
    updateUndoButton();
    updateProgressDots();

    hasInteracted = false;
    updateProceedButton();

    SilentRadar.setTask(task.id);
    if (typeof StudentLogger !== 'undefined') {
      StudentLogger.logEvent('task_loaded', { taskId: task.id, title: task.titleHe });
    }
    dom.taskCard.classList.remove('fade-in');
    void dom.taskCard.offsetWidth;
    dom.taskCard.classList.add('fade-in');
    awaitingNextTask = false;
  }

  /* ── HTML Renderers ── */

  function renderChoicesHTML(choices) {
    return `<div class="choice-options d-flex flex-column gap-3 mt-4" role="radiogroup">
      ${choices.map(c => `
        <button class="choice-option btn btn-outline-primary text-start fs-4 fw-semibold p-4 rounded-4 shadow-sm d-flex align-items-center transition-all" data-choice="${escapeHTML(c.id)}" role="radio" aria-checked="false" style="border-width: 2px;">
          <span class="choice-option-letter badge bg-primary text-white ms-3 fs-5 rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">${escapeHTML(c.id)}</span>
          <span>${escapeHTML(c.textHe)}</span>
        </button>
      `).join('')}
    </div>`;
  }

  function renderNumberLineHTML(task) {
    return `<div class="number-line-container">
      <p style="text-align:center;font-size:var(--font-size-sm);color:var(--color-text-muted);margin-bottom:var(--space-2);">
        גרור את החץ אל המיקום הנכון
      </p>
      <div class="number-line-track" id="number-line-track">
        <div class="number-line-fill" id="nl-fill"></div>
        <div class="number-line-marker" id="nl-marker" role="slider"
             aria-valuemin="0" aria-valuenow="0" tabindex="0"></div>
      </div>
      <div class="number-line-value-display" id="nl-value">—</div>
    </div>`;
  }

  function renderFlexDecompHTML() {
    return `
      <div class="d-flex flex-column align-items-center gap-4 mt-3">
        <p class="fs-4 text-secondary text-center lh-lg fw-medium">
          הציגו את המספר בדרכים שונות בטבלה ולחצו <strong>הוסף ייצוג</strong> אחרי כל אחת.
        </p>
        <div id="q3-rep-status" class="d-flex flex-wrap gap-2 justify-content-center w-100"></div>
        <button class="btn btn-lg btn-outline-primary fw-bold rounded-pill px-5 py-3 shadow-sm transition-all" id="btn-add-rep" onclick="App.addQ3Representation()">
          <i class="fa-solid fa-plus me-2"></i> הוסף ייצוג (1/2)
        </button>
      </div>`;
  }

  function renderVerticalAdditionHTML(a, b, operator = '+') {
    const aStr = String(a);
    const bStr = String(b);
    const len = Math.max(aStr.length, bStr.length);
    
    const aPadded = aStr.padStart(len, ' ');
    const bPadded = bStr.padStart(len, ' ');
    
    let carriesHTML = '<div class="v-add-grid-row">';
    carriesHTML += '<div class="v-add-grid-cell operator-cell"></div>';
    for (let i = 0; i < len; i++) {
      carriesHTML += `<div class="v-add-grid-cell"><input class="v-add-carry" type="text" maxlength="1" autocomplete="off" aria-label="המרה"></div>`;
    }
    carriesHTML += '</div>';

    let rowAHTML = '<div class="v-add-grid-row" style="position: relative;">';
    rowAHTML += `<div class="v-add-grid-cell operator-cell v-add-operator" style="position: absolute; left: 0; transform: translateY(32px);">${operator}</div>`;
    rowAHTML += '<div class="v-add-grid-cell operator-cell"></div>';
    for (let i = 0; i < len; i++) {
      rowAHTML += `<div class="v-add-grid-cell digit-cell">${aPadded[i]}</div>`;
    }
    rowAHTML += '</div>';

    let rowBHTML = '<div class="v-add-grid-row">';
    rowBHTML += '<div class="v-add-grid-cell operator-cell"></div>';
    for (let i = 0; i < len; i++) {
      rowBHTML += `<div class="v-add-grid-cell digit-cell">${bPadded[i]}</div>`;
    }
    rowBHTML += '</div>';

    let answerHTML = '<div class="v-add-grid-row">';
    answerHTML += '<div class="v-add-grid-cell operator-cell"></div>';
    for (let i = 0; i < len; i++) {
      answerHTML += `<div class="v-add-grid-cell">
        <input class="v-add-answer-input" type="text" pattern="[0-9]*" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="ספרת תשובה">
      </div>`;
    }
    answerHTML += '</div>';

    return `<div class="vertical-addition-grid">
      ${carriesHTML}
      ${rowAHTML}
      ${rowBHTML}
      <div class="v-add-grid-divider"></div>
      ${answerHTML}
    </div>`;
  }

  function renderSmallChangeHTML(task) {
    return `
      <div style="background:var(--color-primary-light);border-radius:var(--radius-lg);
                  padding:var(--space-4) var(--space-6);text-align:center;margin-bottom:var(--space-5);">
        <p style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:4px;">תרגיל נתון:</p>
        <p style="font-size:var(--font-size-2xl);font-weight:900;color:var(--color-primary-dark);">
          ${escapeHTML(task.givenHe)}
        </p>
      </div>
      <p style="font-size:var(--font-size-md);font-weight:700;margin-bottom:var(--space-4);text-align:center;">
        ${escapeHTML(task.questionHe)}
      </p>
      ${renderChoicesHTML(task.choices)}`;
  }

  /* ── Multiple Choice Interaction ── */
  let selectedChoiceId = null;

  function setupChoiceListeners() {
    selectedChoiceId = null;
    document.querySelectorAll('.choice-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.choice-option').forEach(b => {
          b.classList.remove('selected');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-checked', 'true');
        selectedChoiceId = btn.getAttribute('data-choice');
        hasInteracted = true;
        SilentRadar.recordStudentAction();
        updateProceedButton();
      });
    });
    updateProceedButton();
  }

  function updateProceedButton() {
    const task = isSession2 ? QMatrix.getCurrentTask() : currentSessionTasks[currentTaskIdx];
    if (!task || !dom.btnProceed) return;

    const needsChoice = ['place_value_zero', 'small_change'].includes(task.type);
    const hasChoice   = selectedChoiceId !== null;
    const isIntro     = task.type === 'session1_intro';

    /* Technical Annex: Proceed button remains disabled until minimal interaction */
    if (!hasInteracted && !isIntro) {
      dom.btnProceed.disabled = true;
      return;
    }

    dom.btnProceed.disabled = needsChoice && !hasChoice && !isIntro;
  }

  /* ── Number Line Setup ── */
  let numberLineValue = null;

  function setupNumberLine(task) {
    const track  = document.getElementById('number-line-track');
    const marker = document.getElementById('nl-marker');
    const fill   = document.getElementById('nl-fill');
    const display= document.getElementById('nl-value');
    if (!track || !marker) return;

    const range    = QMatrix.getEffectiveRange(task);
    const [min, max] = range;

    /* Add tick marks */
    const rangeSize = max - min;
    let minorStep, mediumStep, majorStep;

    if (rangeSize === 1000) {
      majorStep = 100;
      mediumStep = 50;
      minorStep = 10;
    } else if (rangeSize === 100) {
      majorStep = 10;
      mediumStep = 5;
      minorStep = 1;
    } else {
      majorStep = rangeSize / 10;
      mediumStep = majorStep / 2;
      minorStep = majorStep / 10;
    }

    for (let val = min; val <= max; val += minorStep) {
      const pct   = ((val - min) / rangeSize) * 100;
      const tick  = document.createElement('div');
      tick.className = `number-line-tick`;
      tick.style.left = `${pct}%`;
      
      const mark = document.createElement('div');
      let isMajor = (val % majorStep === 0);
      let isMedium = (!isMajor && val % mediumStep === 0);

      if (isMajor) {
        mark.className = `tick-mark major`;
        
        /* ASD: glowing anchor at every anchor point */
        const asdConfigNL = safeJSONParse(localStorage.getItem('mathematicor_asd_config'), {anchors:true});
        if ((SessionManager.isASDMode() || asdConfigNL.anchors) && task.backwardDiagnosis?.asdAnchors?.includes(val)) {
          mark.classList.add('asd-anchor');
        }

        const label = document.createElement('span');
        label.className = 'tick-label';
        label.textContent = val;
        tick.appendChild(label);
      } else if (isMedium) {
        mark.className = `tick-mark medium`;
      } else {
        mark.className = `tick-mark minor`;
      }

      tick.prepend(mark);
      track.appendChild(tick);
    }

    /* Hide display in Session 2 (Estimation) */
    if (activeSession === 2) {
      display.style.visibility = 'hidden';
    } else {
      display.style.visibility = 'visible';
    }

    /* Drag logic */
    function updateMarkerFromX(clientX) {
      const rect = track.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      // Snap to nearest minor step
      const rawValue = min + pct * rangeSize;
      numberLineValue = Math.round(rawValue / minorStep) * minorStep;
      
      const snappedPct = (numberLineValue - min) / rangeSize;
      marker.style.left = `${snappedPct * 100}%`;
      fill.style.width   = `${snappedPct * 100}%`;
      
      if (activeSession !== 2) {
        display.textContent = numberLineValue;
      }
      marker.setAttribute('aria-valuenow', numberLineValue);
      hasInteracted = true;
      SilentRadar.recordStudentAction();
      updateProceedButton();
    }

    /* Mouse */
    marker.addEventListener('mousedown', () => {
      const onMove = (e) => updateMarkerFromX(e.clientX);
      const onUp   = ()  => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    /* Touch */
    marker.addEventListener('touchstart', (e) => {
      const onMove = (e) => updateMarkerFromX(e.touches[0].clientX);
      const onEnd  = ()  => { document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); };
      document.addEventListener('touchmove', onMove, { passive: true });
      document.addEventListener('touchend', onEnd);
    });

    /* Click on track */
    track.addEventListener('click', (e) => {
      if (e.target === marker) return;
      updateMarkerFromX(e.clientX);
    });
  }

  /* ── Q3 Flexible Decomposition: Add Representation ── */
  function addQ3Representation() {
    const counts = PlaceValueModel.getAllCounts();
    const value  = PlaceValueModel.getValue();
    
    let target = null;
    if (typeof isSession2 !== 'undefined' && isSession2) {
      const qTask = QMatrix.getCurrentTask();
      if (qTask) target = QMatrix.getEffectiveNumber(qTask);
    } else {
      const task = currentSessionTasks[currentTaskIdx];
      if (task) target = task.number;
    }

    if (target !== null && value !== target) {
      if (typeof StudentLogger !== 'undefined') StudentLogger.logEvent('task_incorrect', { detail: 'wrong_sum' });
      showFeedback(false, 'הסכום לא מתאים למספר. נסו שוב!', '');
      return;
    }

    q3Reps.push({ ...counts });
    if (typeof isSession2 !== 'undefined' && isSession2) {
      QMatrix.incrementRepCount();
    }
    
    if (typeof StudentLogger !== 'undefined') {
      StudentLogger.logEvent('q3_representation_added', { representation: counts, totalRepresentations: q3Reps.length });
    }

    /* Update status badges */
    const statusEl = document.getElementById('q3-rep-status');
    if (statusEl) {
      const badge = document.createElement('span');
      badge.className = 'badge bg-success bg-opacity-10 text-success border border-success fs-5 px-3 py-2 rounded-pill shadow-sm';
      badge.innerHTML = `<i class="fa-solid fa-check me-2"></i> ייצוג ${escapeHTML(q3Reps.length)}: ${escapeHTML(value)}`;
      statusEl.appendChild(badge);
    }

    /* Update button */
    const addBtn = document.getElementById('btn-add-rep');
    if (addBtn) {
      if (q3Reps.length >= 2) {
        addBtn.innerHTML = '<i class="fa-solid fa-check-double me-2"></i> שני ייצוגים נרשמו';
        addBtn.className = 'btn btn-lg btn-success fw-bold rounded-pill px-5 py-3 shadow-sm transition-all mt-3';
        addBtn.disabled = true;
      } else {
        const nextNum = q3Reps.length + 1;
        addBtn.innerHTML = `<i class="fa-solid fa-plus me-2"></i> הוסף ייצוג (${nextNum}/2)`;
      }
    }

    /* Reset model for second representation */
    if (q3Reps.length < 2) {
      PlaceValueModel.reset();
      DragController.refresh();
    }

    updateProceedButton();
    SilentRadar.recordStudentAction();
  }

  /* ── Q-Task Completion Callback ── */
  function onQTaskComplete(taskId, correct, detail, backwardDiag) {
    if (typeof StudentLogger !== 'undefined') {
      StudentLogger.logEvent('task_completed_callback', {
        taskId, correct, detail, phase: QMatrix.getCurrentPhase()
      });
      StudentLogger.logEvent(correct ? 'task_correct' : 'task_incorrect', { taskId, detail });
    }

    if (detail === 'primary_done') {
      // Show generic toast "Answer received" and advance
      showFeedback(true, 'התשובה התקבלה! 👍', 'עוברים למשימה הבאה...');
      setTimeout(() => {
        hideFeedback();
        QMatrix.advanceToNextTask();
        if (!QMatrix.isComplete()) renderQTask();
      }, 1500);
    } else if (detail === 'start_correction') {
      // Show screen "Let's review together..." and render backward diagnosis
      showFeedback(false, 'סבב תיקונים 🔍', 'בואו נעבור יחד על כמה דברים...');
      setTimeout(() => {
        hideFeedback();
        renderBackwardDiagnosis(taskId, backwardDiag);
        awaitingNextTask = false;
      }, 1800);
    } else if (detail === 'subtask_done') {
      // Subtask completed. Show feedback and advance to the retry
      showFeedback(correct, correct ? 'מצוין! 🟢' : 'הבנתי, נמשיך... 🟡', '');
      setTimeout(() => {
        hideFeedback();
        QMatrix.advanceToNextTask(); // This will trigger 'start_retry'
      }, 1500);
    } else if (detail === 'start_retry') {
      // Show screen "Try the original task again..." and render the original task
      showFeedback(true, 'מנסים שוב! 🔄', 'הנה המשימה המקורית. נסו לפתור אותה כעת:');
      setTimeout(() => {
        hideFeedback();
        renderQTask();
        awaitingNextTask = false;
      }, 1800);
    } else if (detail === 'retry_done') {
      // Retry completed. Show feedback and advance to the next failed task
      showFeedback(correct, correct ? 'מעולה, הצלחתם! 🎉' : 'התשובה נשמרה. 👍', '');
      setTimeout(() => {
        hideFeedback();
        QMatrix.advanceToNextTask();
        if (!QMatrix.isComplete()) renderQTask();
      }, 1500);
    }
  }

  function onAllQTasksComplete() {
    if (typeof StudentLogger !== 'undefined') {
      StudentLogger.logEvent('session_completed', { timestamp: Date.now() });
    }
    /* All 5 tasks done → redirect to Session Reflection */
    showFeedback(true, 'סיימתם! 🎉', 'כל הכבוד על העבודה הטובה!');
    setTimeout(() => {
      window.location.href = 'reflection.html';
    }, 2200);
  }

  /* ── Backward Diagnosis Rendering ── */
  function renderBackwardDiagnosis(taskId, diagSpec) {
    if (!diagSpec) return;
    dom.taskInstruction.textContent = diagSpec.subtaskInstructionHe ?? dom.taskInstruction.textContent;

    if (diagSpec.subtaskNumber !== undefined) {
      dom.numberDisplay.textContent  = diagSpec.subtaskNumber;
      dom.numberDisplay.style.display = 'inline-block';
    }

    if (diagSpec.subtaskChoices) {
      dom.taskBody.innerHTML = renderChoicesHTML(diagSpec.subtaskChoices);
      setupChoiceListeners();
    }

    if (diagSpec.showAutoUngroup) {
      /* Show animated ungrouping hint for q3 */
      dom.taskBody.innerHTML += `
        <div style="text-align:center;margin-top:var(--space-4);
                    background:var(--color-success-light);border-radius:var(--radius-lg);padding:var(--space-4);">
          <p style="font-size:var(--font-size-sm);color:#065F46;font-weight:600;">
            💡 עשרת אחת = 10 יחידות בודדות
          </p>
          <button class="btn-primary" onclick="App.triggerAutoUngroup()" style="margin-top:8px;">הדגם פריטה</button>
        </div>`;
    }

    const asdConfig = safeJSONParse(localStorage.getItem('mathematicor_asd_config'), {organizer:true});
    if (diagSpec.graphicOrganizerASD && asdConfig.organizer) {
      dom.taskBody.innerHTML = `
        <div class="graphic-organizer" style="background:var(--color-surface);border:2px dashed var(--color-primary);padding:var(--space-4);border-radius:var(--radius-lg);margin-top:var(--space-4);text-align:center;">
           <h3 style="color:var(--color-primary-dark);margin:0 0 var(--space-2) 0;">מארגן חזותי</h3>
           <p style="font-weight:600;">${escapeHTML(diagSpec.probeInstructionHe)}</p>
           <div style="font-size:var(--font-size-2xl);font-weight:900;margin:var(--space-3) 0;color:var(--color-text);">
              ${escapeHTML(diagSpec.probeA)} + ${escapeHTML(diagSpec.probeB)} = ?
           </div>
           <input class="v-add-answer-input" type="text" pattern="[0-9]*" inputmode="numeric" id="add-answer-input" style="width:80px;text-align:center;margin:0 auto;" placeholder="?">
        </div>
      `;
    }

    if (diagSpec.visualHint) {
       dom.taskBody.innerHTML += `
        <div style="text-align:center;margin-top:var(--space-4);background:rgba(239,68,68,0.1);padding:var(--space-4);border-radius:var(--radius-md);">
           <p style="font-size:var(--font-size-md);font-weight:700;color:var(--color-danger);">${escapeHTML(diagSpec.hintHe)}</p>
           <div style="display:flex;gap:4px;justify-content:center;margin-top:var(--space-2);font-size:2rem;line-height:1;">
              🧊🧊🧊🧊🧊🧊🧊🧊🧊<span style="opacity:0.3;">🧊</span>
           </div>
        </div>
       `;
    }

    dom.sessionLabel.textContent = 'בואו ננסה יחד...';
  }

  /** Build trace data for Q-Matrix recording (per Technical Annex §2). */
  function getTaskTraceData() {
    let hesitations = 0;
    try {
      const radarAlerts = JSON.parse(localStorage.getItem('mathematicor_radar_alerts') || '[]');
      const username = SessionManager.state.username;
      hesitations = radarAlerts.filter(a => a.student === username && a.type === 'HESITATION').length;
    } catch(e) {}
    
    return {
      hesitation_events: hesitations,
      undo_clicks: SessionManager.state.persistence.undoCount || 0
    };
  }

  /**
   * Scaffold Fading (Responsive Fading / דעיכת פיגומים)
   * After each correct answer, the visual scaffolding of the place-value
   * structure becomes slightly more transparent. This is UDL-compliant:
   * the structure is still visible in memory but reduces visual load.
   * Levels: 0=full → 4=near-invisible (but never disappears completely).
   */
  function applyScaffoldFade() {
    if (scaffoldFadeLevel >= 4) return;  /* max fade reached */
    scaffoldFadeLevel++;

    const structureEl = dom.pvContainer?.closest('.place-value-structure');
    if (!structureEl) return;

    /* Remove previous level */
    structureEl.classList.remove(
      'scaffold-level-1', 'scaffold-level-2', 'scaffold-level-3', 'scaffold-level-4'
    );
    if (scaffoldFadeLevel > 0) {
      structureEl.classList.add(`scaffold-level-${scaffoldFadeLevel}`);
    }
  }

  function triggerAutoUngroup() {
     const ungroupResult = PlaceValueModel.ungroupBlock('tens');
     if (ungroupResult) {
       DragController.refresh();
       SilentRadar.recordStudentAction();
     } else {
       showFeedback(false, 'אין עשרות לפרוט', '');
       setTimeout(hideFeedback, 1500);
     }
  }

  /* ── Proceed Button ── */
  function handleProceed() {
    if (awaitingNextTask) return;

    if (isSession2) {
      handleQTaskProceed();
    } else {
      handleSession1Proceed();
    }
  }

  function handleSession1Proceed() {
    const task = currentSessionTasks[currentTaskIdx];
    if (task && task.type === 'session1_intro') {
      if (!selectedChoiceId) {
        showFeedback(false, 'ענו על שאלת החשיבה 🤔', 'בחרו אחת מהאפשרויות כדי להמשיך.');
        setTimeout(hideFeedback, 2500);
        return;
      }
      if (selectedChoiceId !== task.correctAnswer) {
        if (typeof StudentLogger !== 'undefined') StudentLogger.logEvent('task_incorrect', { detail: 'wrong_choice' });
        showFeedback(false, 'בואו נחשוב שוב 🤔', 'האם הוספנו או גרענו קוביות כלשהן מבית המספרים?');
        setTimeout(hideFeedback, 2800);
        return;
      }
      // Correct! Show feedback and advance
      if (typeof StudentLogger !== 'undefined') StudentLogger.logEvent('task_correct', { taskId: task.id });
      showFeedback(true, 'נכון מאוד! 🌟', 'הערך נשאר זהה לחלוטין (100) כי לא שינינו את הכמות הכוללת.');
      awaitingNextTask = true;
      setTimeout(() => {
        hideFeedback();
        awaitingNextTask = false;
        currentTaskIdx++;
        renderStandardTask();
      }, 2500);
      return;
    }

    if (task && task.type === 'addition_simple') {
      const value = PlaceValueModel.getValue();
      const inputs = Array.from(dom.taskBody.querySelectorAll('.v-add-answer-input'));
      let ansStr = '';
      inputs.forEach(inp => ansStr += inp.value || '');
      const ansVal = parseInt(ansStr, 10);

      // 1. Force manipulative representation
      if (value !== task.correctAnswer) {
        if (typeof StudentLogger !== 'undefined') StudentLogger.logEvent('task_incorrect', { detail: 'wrong_blocks' });
        showFeedback(false, 'בואו נייצג את התרגיל בבית המספרים! 🧊', `הניחו קוביות בטורים כך שסכומן הכולל יהיה בדיוק ${task.correctAnswer}.`);
        setTimeout(hideFeedback, 2800);
        return;
      }

      // 2. Validate numeric input
      if (ansVal !== task.correctAnswer) {
        if (typeof StudentLogger !== 'undefined') StudentLogger.logEvent('task_incorrect', { detail: 'wrong_numeric' });
        showFeedback(false, 'בדקו את התשובה הכתובה שלכם ✏️', `הקלידו את התוצאה הנכונה בתיבת התשובה.`);
        setTimeout(hideFeedback, 2500);
        return;
      }
    } else if (task && task.type === 'place_value_zero') {
      if (!selectedChoiceId) return;
      if (selectedChoiceId !== task.correctAnswer) {
        if (typeof StudentLogger !== 'undefined') StudentLogger.logEvent('task_incorrect', { detail: 'wrong_choice' });
        showFeedback(false, 'תשובה שגויה 🤔', 'נסו לבדוק שוב את בחירתכם.');
        setTimeout(hideFeedback, 2500);
        return;
      }
    } else if (task && task.type === 'number_line') {
      if (numberLineValue === null) return;
      const target = task.number;
      if (Math.abs(numberLineValue - target) > 5) {
        if (typeof StudentLogger !== 'undefined') StudentLogger.logEvent('task_incorrect', { detail: 'wrong_number_line' });
        showFeedback(false, 'לא מדויק 🤔', 'נסו למקם את החץ קרוב יותר לערך הנכון.');
        setTimeout(hideFeedback, 2500);
        return;
      }
    } else if (task && task.type === 'flexible_decomp') {
      if (q3Reps.length < 2) {
        showFeedback(false, 'נדרשים שני ייצוגים שונים', 'הוסיפו ייצוג שני!');
        setTimeout(hideFeedback, 1800);
        return;
      }
    }

    if (typeof StudentLogger !== 'undefined') StudentLogger.logEvent('task_correct', { taskId: task.id });

    currentTaskIdx++;
    if (currentTaskIdx >= currentSessionTasks.length) {
      /* Session complete */
      if (activeSession === 1) {
        showFeedback(true, 'כל הכבוד! מפגש 1 הושלם בהצלחה! 🎉', 'עוברים כעת אוטומטית למפגש 2...');
        setTimeout(() => {
          hideFeedback();
          const student = safeJSONParse(sessionStorage.getItem('mathematicor_student'), {});
          student.session = 2;
          student.taskIndex = 0;
          sessionStorage.setItem('mathematicor_student', JSON.stringify(student));
          sessionStorage.removeItem('mathematicor_state');
          window.location.reload();
        }, 2500);
      } else if (activeSession === 3) {
        showFeedback(true, 'כל הכבוד! מפגש 3 הושלם בהצלחה! 🎉', 'עוברים כעת אוטומטית למפגש 4...');
        setTimeout(() => {
          hideFeedback();
          const student = safeJSONParse(sessionStorage.getItem('mathematicor_student'), {});
          student.session = 4;
          student.taskIndex = 0;
          sessionStorage.setItem('mathematicor_student', JSON.stringify(student));
          sessionStorage.removeItem('mathematicor_state');
          window.location.reload();
        }, 2500);
      } else {
        showFeedback(true, 'כל הכבוד! 🎉', 'עבודה מצוינת במפגש זה!');
        setTimeout(() => { 
          hideFeedback(); 
          window.location.href = '../index.html';
        }, 2500);
      }
    } else {
      renderStandardTask();
    }
  }

  function handleQTaskProceed() {
    const task = QMatrix.getCurrentTask();
    if (!task || awaitingNextTask) return;

    let evalResult = null;

    switch (task.type) {
      case 'place_value_zero':
        if (!selectedChoiceId) return;
        evalResult = QMatrix.evaluateQ1(selectedChoiceId, PlaceValueModel.getAllCounts());
        break;

      case 'number_line':
        if (numberLineValue === null) return;
        evalResult = QMatrix.evaluateQ2(numberLineValue);
        break;

      case 'flexible_decomp':
        if (q3Reps.length < 2) {
          showFeedback(false, 'נדרשים שני ייצוגים שונים', 'הוסיפו ייצוג שני!');
          setTimeout(hideFeedback, 1800);
          return;
        }
        evalResult = QMatrix.evaluateQ3(q3Reps);
        break;

      case 'vertical_addition':
        if (QMatrix.getCurrentPhase() === 'backward_diagnosis') {
          const inp = document.getElementById('add-answer-input');
          if (!inp || !inp.value) return;
          evalResult = QMatrix.evaluateQ4(parseInt(inp.value, 10));
        } else {
          const inputs = Array.from(dom.taskBody.querySelectorAll('.v-add-answer-input'));
          let ansStr = '';
          inputs.forEach(inp => ansStr += inp.value || '');
          if (!ansStr) return;
          evalResult = QMatrix.evaluateQ4(parseInt(ansStr, 10));
        }
        break;

      case 'small_change':
        if (!selectedChoiceId) return;
        evalResult = QMatrix.evaluateQ5(selectedChoiceId);
        break;
    }

    if (evalResult) {
      awaitingNextTask = true;
      QMatrix.handleTaskResult(evalResult);
    }
  }

  /* ── Undo (בטל) ── */
  function handleUndo() {
    const snapshot = SessionManager.popUndoState();
    if (snapshot) {
      PlaceValueModel.restoreSnapshot(snapshot);
      DragController.refresh();
      SilentRadar.recordStudentAction();
    }
    if (typeof StudentLogger !== 'undefined') {
      StudentLogger.logEvent('undo', { success: !!snapshot, previousSnapshot: snapshot });
    }
    updateUndoButton();
  }

  function updateUndoButton() {
    if (dom.btnUndo) {
      dom.btnUndo.disabled = !SessionManager.canUndo();
    }
  }

  /* ── Support Palette (חלון עזרה) ── */
  /* Socratic Friction: intentional 3-second delay before showing hint.
     This prevents impulsive clicking and encourages self-regulation.
     Per pedagogical spec: "productive metacognitive friction". */
  let hintFrictionTimer = null;

  function openSupportPalette() {
    if (hintFrictionTimer) return;  /* already waiting */

    SilentRadar.recordHintRequest();
    SessionManager.incrementHintCount();
    if (typeof StudentLogger !== 'undefined') {
      StudentLogger.logEvent('hint_requested', { timestamp: Date.now() });
    }

    /* Show "thinking" message in a temporary overlay */
    const frictionEl = document.createElement('div');
    frictionEl.id = 'hint-friction-overlay';
    frictionEl.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.55);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      z-index: 1200;
    `;
    frictionEl.innerHTML = `
      <div style="
        background: var(--color-surface);
        border-radius: var(--radius-xl);
        padding: 40px 48px;
        text-align: center;
        max-width: 380px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      ">
        <div style="font-size: 3.5rem; margin-bottom: 16px;">🤔</div>
        <p style="font-size: 1.25rem; font-weight: 800; color: var(--color-text); margin-bottom: 8px;">
          בוא נחשוב רגע יחד...
        </p>
        <p style="font-size: 0.95rem; color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 20px;">
          לפני שאני עוזר לך — האם ניסית לשים בצד את מה שאתה כבר יודע על המספר הזה?
        </p>
        <div class="hint-loading">⏳ מכין רמז מותאם אישית...</div>
      </div>
    `;
    document.body.appendChild(frictionEl);

    hintFrictionTimer = setTimeout(() => {
      frictionEl.remove();
      hintFrictionTimer = null;
      dom.supportPalette?.classList.add('open');
    }, 3000);
  }

  function closeSupportPalette() {
    dom.supportPalette?.classList.remove('open');
  }

  function handleSupportChoice(type) {
    if (typeof StudentLogger !== 'undefined') {
      StudentLogger.logEvent('hint_choice_selected', { choiceType: type });
    }
    const task = isSession2 ? QMatrix.getCurrentTask() : currentSessionTasks[currentTaskIdx];
    const modal = document.getElementById('socratic-modal');
    const title = document.getElementById('socratic-modal-title');
    const visuals = document.getElementById('socratic-modal-visuals');
    
    if (!modal || !visuals || !title) return;
    
    modal.classList.add('open');
    visuals.innerHTML = ''; // clear previous
    
    if (type === 'metacognitive') {
      title.textContent = 'בואו נחשוב יחד 💡';
      visuals.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:4rem; margin-bottom:10px;">🤔</div>
          <p style="font-size:1.2rem; font-weight:bold; color:var(--color-primary-dark);">נסו לבדוק את עצמכם רגע:</p>
          <ul style="text-align:right; font-size:1.1rem; color:var(--color-text); line-height: 1.8;">
            <li>האם המספר שבנינו בקוביות מתאים למספרים שבתרגיל?</li>
            <li>האם יש לנו טור אחד שיש בו יותר מ-9 קוביות? אם כן, זכרו שאפשר לבצע המרה לטור הבא!</li>
          </ul>
        </div>`;
    } else if (type === 'socratic') {
      title.textContent = 'שאלה למחשבה 💭';
      visuals.innerHTML = `
        <div style="text-align:center; display:flex; flex-direction:column; align-items:center; gap:15px;">
          <div style="display:flex; align-items:center; gap:15px;">
            <div style="width:60px; height:60px; background:var(--color-primary); border-radius:4px; display:flex; align-items:center; justify-content:center; color:white; font-size:2rem; font-weight:bold;">10</div>
            <div style="font-size:3rem; color:var(--color-text-muted);">↔</div>
            <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:2px;">
              ${Array(10).fill('<div style="width:10px; height:10px; background:var(--color-primary);"></div>').join('')}
            </div>
          </div>
          <p style="font-size:1.1rem; color:var(--color-text); font-weight:600; line-height: 1.6;">
            מה קורה לכמות הקוביות כשאנחנו פורטים או ממירים? <br>
            <span style="color:var(--color-primary-dark);">האם הוספנו או הורדנו קוביות מהלוח, או שרק שינינו את הצורה שלהן?</span>
          </p>
        </div>`;
    } else if (type === 'worked_example') {
      title.textContent = 'בואו נראה דוגמה 👀';
      visuals.innerHTML = `
        <div style="text-align:center;">
          <div style="display:flex; justify-content:center; gap:20px; margin-bottom:15px; opacity:0.8;">
            <div style="text-align:center;">
              <div style="font-size:1rem; margin-bottom:5px;">שלב 1</div>
              <div style="width:50px; height:50px; background:var(--color-surface-1); border:2px solid var(--color-border); border-radius:4px; display:flex; align-items:center; justify-content:center; font-weight: bold; font-size: 1.2rem;">12</div>
            </div>
            <div style="font-size:2rem; align-self:center;">→</div>
            <div style="text-align:center;">
              <div style="font-size:1rem; margin-bottom:5px;">שלב 2</div>
              <div style="width:100%; padding:0 10px; height:50px; background:var(--color-primary-light); border:2px solid var(--color-primary); border-radius:4px; display:flex; align-items:center; justify-content:center; font-weight: bold; font-size: 1.2rem;">עשרת 1 + 2 יחידות</div>
            </div>
          </div>
          <p style="font-size:1rem; color:var(--color-text-secondary);">תראו! המספר 12 הוא בדיוק אותו הדבר כמו עשרת אחת (10) ועוד שתי יחידות (2). הכמות תמיד נשארת!</p>
        </div>`;
    }
  }

  function getSocraticHint(taskId) {
    const hints = {
      q1: 'מה קורה כשטור ריק — כמה יחידות יש שם?',
      q2: 'היכן בערך נמצא האמצע של הישר?',
      q3: 'האם אפשר לפרוט מאה לעשרות?',
      q4: 'מה הספרה בטור היחידות בכל מספר?',
      q5: 'אם מחסירים 1 מ-10, מה קורה לתוצאה?'
    };
    return hints[taskId] ?? 'בואו נחשוב יחד — מה אנחנו יודעים על המספר הזה?';
  }

  /* ── Feedback Overlay (Ultra Premium with SweetAlert2 & Confetti) ── */
  function showFeedback(correct, message, sub) {
    if (correct && typeof confetti === 'function') {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10B981', '#3B82F6', '#F59E0B']
      });
    }

    if (typeof Swal !== 'undefined') {
      if (!correct) {
        Swal.fire({
          title: message,
          text: sub || '',
          icon: 'question',
          toast: true,
          position: 'top',
          showConfirmButton: false,
          timer: 3500,
          timerProgressBar: true
        });
      } else {
        Swal.fire({
          title: message,
          text: sub || '',
          icon: 'success',
          toast: true,
          position: 'top',
          timer: 2500,
          timerProgressBar: true,
          showConfirmButton: false,
          customClass: {
            popup: 'swal-premium-popup',
            title: 'swal-premium-title',
          }
        });
      }
    } else {
      /* Fallback just in case */
      if (!dom.feedbackOverlay) return;
      const icon = correct ? '🌟' : '🤔';
      dom.feedbackOverlay.innerHTML = `
        <div class="feedback-bubble">
          <div class="feedback-icon">${icon}</div>
          <div class="feedback-message">${escapeHTML(message)}</div>
          ${sub ? `<div class="feedback-sub">${escapeHTML(sub)}</div>` : ''}
        </div>`;
      dom.feedbackOverlay.classList.add('show');
    }
  }

  function hideFeedback() {
    if (typeof Swal !== 'undefined') {
      Swal.close();
    }
    dom.feedbackOverlay?.classList.remove('show');
  }

  /* ── Progress Dots (Session 2 only, no numbers) ── */
  function renderProgressDots() {
    if (!dom.progressDots) return;
    dom.progressDots.innerHTML = '';
    for (let i = 0; i < QMatrix.getTotalTasks(); i++) {
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      dot.setAttribute('aria-hidden', 'true');
      dom.progressDots.appendChild(dot);
    }
  }

  function updateProgressDots() {
    if (!dom.progressDots) return;
    const dots = dom.progressDots.querySelectorAll('.progress-dot');
    const idx  = QMatrix.getCurrentTask() ? QMatrix.TASKS.indexOf(QMatrix.getCurrentTask()) : -1;
    dots.forEach((dot, i) => {
      dot.classList.remove('done', 'active');
      if (i < idx)  dot.classList.add('done');
      if (i === idx) dot.classList.add('active');
    });
  }

  /* ── Blocks Changed Callback ── */
  function onBlocksChanged(counts, value) {
    hasInteracted = true;
    updateUndoButton();
    updateProceedButton();
    /* For q3: re-enable add-rep button if value matches target */
    if (isSession2 && QMatrix.getCurrentTask()?.type === 'flexible_decomp') {
      const target  = QMatrix.getEffectiveNumber(QMatrix.getCurrentTask());
      const addBtn  = document.getElementById('btn-add-rep');
      if (addBtn && !addBtn.disabled) {
        addBtn.style.opacity = (value === target) ? '1' : '0.4';
      }
    }
  }

  /* ── Keyboard Shortcuts ── */
  function handleKeyboard(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter') handleProceed();
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleUndo(); }
  }

  /* ── Dev Skip ── */
  function devSkipTask() {
    if (typeof Swal !== 'undefined') Swal.close();

    if (isSession2) {
      const task = QMatrix.getCurrentTask();
      if (task) QMatrix.recordResult(task.id, true);
      QMatrix.advanceToNextTask();
      if (QMatrix.isComplete()) {
        showFeedback(true, 'כל הכבוד! מפגש 2 הושלם בהצלחה! 🎉', 'עוברים כעת אוטומטית למפגש 3...');
        setTimeout(() => {
          hideFeedback();
          const student = safeJSONParse(sessionStorage.getItem('mathematicor_student'), {});
          student.session = 3;
          student.taskIndex = 0;
          sessionStorage.setItem('mathematicor_student', JSON.stringify(student));
          sessionStorage.removeItem('mathematicor_state');
          window.location.reload();
        }, 2500);
      } else {
        renderQTask();
      }
    } else {
      currentTaskIdx++;
      if (currentTaskIdx >= currentSessionTasks.length) {
        let nextSess = activeSession === 1 ? 2 : (activeSession === 3 ? 4 : null);
        if (nextSess) {
          showFeedback(true, `כל הכבוד! מפגש ${activeSession} הושלם בהצלחה! 🎉`, `עוברים כעת אוטומטית למפגש ${nextSess}...`);
          setTimeout(() => {
            hideFeedback();
            const student = safeJSONParse(sessionStorage.getItem('mathematicor_student'), {});
            student.session = nextSess;
            student.taskIndex = 0;
            sessionStorage.setItem('mathematicor_student', JSON.stringify(student));
            sessionStorage.removeItem('mathematicor_state');
            window.location.reload();
          }, 2500);
        } else {
          showFeedback(true, 'כל הכבוד! סיימתם את כל המפגשים! 🎉', '');
          setTimeout(() => { window.location.href = '../index.html'; }, 2500);
        }
      } else {
        renderStandardTask();
      }
    }
  }

  /* ── Public API ── */
  return {
    init,
    addQ3Representation,
    handleUndo,
    handleProceed,
    openSupportPalette,
    triggerAutoUngroup,
    devSkipTask
  };

})();

/* Auto-initialize when DOM is ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}
