/* ============================================================
   מתמטיקאור — Virtual Manipulatives Engine
   
   MATHEMATICAL VOCABULARY (not UI terms):
   - "בית המספרים" = the mathematical place-value structure
     (units / tens / hundreds / thousands) — NOT a CSS grid
   - "כרטיסיות כוח עשר" = Power-of-Ten visual teaching aids — NOT UI cards
   - "יחידה" = unit cube (mathematical object, qty = 1)
   - "עשרת" = ten-rod (mathematical object, qty = 10)
   - "מאה" = hundred-flat (mathematical object, qty = 100)
   - "אלף" = thousand-cube (mathematical object, qty = 1000)

   Architecture:
   - PlaceValueModel: pure mathematical data model
   - ManipulativeRenderer: renders model to DOM
   - DragController: handles drag-drop + auto-grouping
   ============================================================ */

'use strict';

/* global gsap, Draggable, StudentLogger, SilentRadar, App */

/* ══════════════════════════════════════════════════════════════
   PlaceValueModel — Mathematical Data Layer
   Represents the decimal place-value structure בית המספרים.
   Pure state — no DOM dependencies.
══════════════════════════════════════════════════════════════ */
const PlaceValueModel = (() => {

  /* Current counts of each type of mathematical block */
  let counts = {
    units:     0,   /* יחידות */
    tens:      0,   /* עשרות  */
    hundreds:  0,   /* מאות   */
    thousands: 0    /* אלפים  */
  };

  /* The place hierarchy for grouping/ungrouping logic */
  const PLACE_ORDER   = ['units', 'tens', 'hundreds', 'thousands'];
  const PLACE_VALUES  = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };
  const PLACE_NAMES_HE = {
    units: 'יחידות', tens: 'עשרות', hundreds: 'מאות', thousands: 'אלפים'
  };

  /** Get total numeric value (mathematical sum) */
  function getValue() {
    return counts.units * 1 + counts.tens * 10 + counts.hundreds * 100 + counts.thousands * 1000;
  }

  /** Get a copy of the current state (for Undo snapshot) */
  function getSnapshot() {
    return { ...counts };
  }

  /** Restore state from an Undo snapshot */
  function restoreSnapshot(snapshot) {
    counts = { ...snapshot };
  }

  /** Reset all counts to zero */
  function reset() {
    counts = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
  }

  /**
   * Set all place values directly (used for "place this number" tasks).
   * @param {object} values - { units, tens, hundreds, thousands }
   */
  function setValues(values) {
    counts = {
      units:     values.units     ?? 0,
      tens:      values.tens      ?? 0,
      hundreds:  values.hundreds  ?? 0,
      thousands: values.thousands ?? 0
    };
  }

  /**
   * Add one block of a given type.
   * Returns: { place, newCount, regroupResult }
   * Note: auto-grouping is triggered AFTER add (see checkAndGroup).
   * @param {string} place - 'units' | 'tens' | 'hundreds' | 'thousands'
   */
  function addBlock(place, autoGroup = false) {
    if (!counts.hasOwnProperty(place)) return null;
    counts[place]++;
    const regroup = autoGroup ? checkAndGroup() : [];
    return { place, newCount: counts[place], regroup };
  }

  /**
   * Remove one block of a given type.
   * Returns false if column is empty (enforces built-in constraint).
   * @param {string} place
   */
  function removeBlock(place) {
    if (!counts.hasOwnProperty(place)) return false;
    if (counts[place] <= 0) return false;  /* CONSTRAINT: cannot take from zero */
    counts[place]--;
    return true;
  }

  /**
   * Auto-grouping (המרה אוטומטית):
   * When a column reaches 10+, merge 10 into the next higher place.
   * Returns array of { from, to } regroup events (may chain).
   */
  function checkAndGroup() {
    const events = [];
    for (let i = 0; i < PLACE_ORDER.length - 1; i++) {
      const from = PLACE_ORDER[i];
      const to   = PLACE_ORDER[i + 1];
      if (counts[from] >= 10) {
        const groups = Math.floor(counts[from] / 10);
        counts[from] -= groups * 10;
        counts[to]   += groups;
        events.push({ from, to, groups });
      }
    }
    return events;
  }

  /**
   * Ungrouping / פריטה (breaking higher block into 10 lower):
   * Called when student drags a ten-rod to the units column, etc.
   * Returns false if column is empty or ungrouping is not possible.
   * @param {string} fromPlace - the place being broken (e.g. 'tens')
   */
  function ungroupBlock(fromPlace) {
    const fromIdx = PLACE_ORDER.indexOf(fromPlace);
    if (fromIdx <= 0) return false;           /* can't ungroup units */
    const toPlace = PLACE_ORDER[fromIdx - 1];
    if (counts[fromPlace] <= 0) return false; /* CONSTRAINT: nothing to break */
    counts[fromPlace]--;
    counts[toPlace] += 10;
    return { from: fromPlace, to: toPlace };
  }

  function addUngroupedFromPalette(fromPlace) {
    const fromIdx = PLACE_ORDER.indexOf(fromPlace);
    if (fromIdx <= 0) return false;
    const toPlace = PLACE_ORDER[fromIdx - 1];
    counts[toPlace] += 10;
    return true;
  }

  /** Get current count for a specific place */
  function getCount(place) {
    return counts[place] ?? 0;
  }

  /** Get all counts */
  function getAllCounts() {
    return { ...counts };
  }

  return {
    getValue, getSnapshot, restoreSnapshot, reset, setValues,
    addBlock, removeBlock, ungroupBlock, addUngroupedFromPalette,
    checkAndGroup, getCount, getAllCounts,
    PLACE_ORDER, PLACE_VALUES, PLACE_NAMES_HE
  };
})();


/* ══════════════════════════════════════════════════════════════
   ManipulativeRenderer — DOM Rendering Layer
   Renders the PlaceValueModel state to the HTML columns.
   Each column is a drop target for the place-value structure.
══════════════════════════════════════════════════════════════ */
const ManipulativeRenderer = (() => {

  const MAX_VISIBLE_BLOCKS = 30;  /* allow flexible decomposition (e.g. 15 tens) */

  /**
   * Render all four place-value columns from model state.
   * @param {object} containerEl - the .pv-columns-row element
   * @param {object} options     - { asdMode, activePlace, onBlockClick }
   */
  function render(containerEl, options = {}) {
    PlaceValueModel.PLACE_ORDER.forEach(place => {
      const colEl = containerEl.querySelector(`[data-place="${place}"]`);
      if (!colEl) return;
      renderColumn(colEl, place, options);
    });
  }

  /**
   * Render a single column.
   * Handles ASD dimming, block display, count badge.
   */
  function renderColumn(colEl, place, options = {}) {
    const dropZone = colEl.querySelector('.pv-drop-zone');
    if (!dropZone) return;

    const count  = PlaceValueModel.getCount(place);
    const isASD  = options.asdMode ?? false;
    const active = options.activePlace ?? null;

    /* ASD: dim inactive columns */
    let asdConfig;
    try {
      asdConfig = JSON.parse(localStorage.getItem('mathematicor_asd_config')) || {dimming:true};
    } catch (e) {
      asdConfig = {dimming:true};
    }
    if ((isASD || asdConfig.dimming) && active) {
      colEl.classList.toggle('asd-dimmed', place !== active);
      colEl.classList.toggle('asd-active',  place === active);
    } else {
      colEl.classList.remove('asd-dimmed', 'asd-active');
    }

    /* Sync existing blocks with new count to prevent flickering */
    const currentBlocks = dropZone.querySelectorAll('.math-block');
    const renderCount = Math.min(count, MAX_VISIBLE_BLOCKS);

    // Remove excess blocks
    if (currentBlocks.length > renderCount) {
      for (let i = renderCount; i < currentBlocks.length; i++) {
        currentBlocks[i].remove();
      }
    }

    // Add missing blocks
    if (currentBlocks.length < renderCount) {
      for (let i = currentBlocks.length; i < renderCount; i++) {
        const blockEl = createBlockElement(place, options.onBlockClick);
        dropZone.appendChild(blockEl);
        
        /* GSAP Entrance Animation (only for newly added blocks) */
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(blockEl, 
            { scale: 0.1, y: -20, opacity: 0 }, 
            { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: "elastic.out(1, 0.5)", delay: (i - currentBlocks.length) * 0.05 }
          );
        }
      }
    }

    /* Count badge (shows overflow or just the count) */
    let badge = colEl.querySelector('.pv-count-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'pv-count-badge';
      colEl.querySelector('.pv-column-header').appendChild(badge);
    }
    if (count > 0) {
      badge.textContent = count;
      badge.classList.add('visible');
    } else {
      badge.textContent = '';
      badge.classList.remove('visible');
    }

    /* Empty-column hint removed to prevent confusing the student */
    const emptyHint = dropZone.querySelector('.empty-hint');
    if (emptyHint) {
      emptyHint.remove();
    }
  }

  /**
   * Create a visual representation of a mathematical block.
   * The visual differs by type (unit=small square, ten=rod, etc.)
   * @param {string}   place       - mathematical place type
   * @param {function} onClickFn   - callback when block is clicked (to remove)
   */
  function createBlockElement(place, onClickFn) {
    const el = document.createElement('div');
    el.className = `math-block math-block--${singularMap[place]}`;
    el.setAttribute('data-place', place);
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `הסר ${PlaceValueModel.PLACE_NAMES_HE[place]}`);
    el.setAttribute('tabindex', '0');

    el.addEventListener('click', () => {
      if (onClickFn) onClickFn(place, el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (onClickFn) onClickFn(place, el);
      }
    });

    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', place);
      e.dataTransfer.setData('source', 'column');
      el.style.opacity = '0.5';
      if (typeof DragController !== 'undefined' && DragController.setDraggedInfo) {
        DragController.setDraggedInfo(place, 'column');
      }
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '';
    });

    if (typeof DragController !== 'undefined' && DragController.bindTouchEvents) {
      DragController.bindTouchEvents(el);
    }

    return el;
  }

  /* Map from plural place name to singular block class name */
  const singularMap = {
    units: 'unit', tens: 'ten', hundreds: 'hundred', thousands: 'thousand'
  };

  /**
   * Animate a grouping event (10 blocks merge into 1).
   */
  function animateGrouping(fromPlace, toPlace, containerEl, onComplete) {
    const fromCol  = containerEl.querySelector(`[data-place="${fromPlace}"] .pv-drop-zone`);
    const toCol    = containerEl.querySelector(`[data-place="${toPlace}"] .pv-drop-zone`);
    const blocks   = fromCol ? fromCol.querySelectorAll('.math-block') : [];

    if (typeof gsap !== 'undefined' && blocks.length > 0) {
      /* GSAP Grouping Animation */
      gsap.to(blocks, {
        scale: 0, opacity: 0, rotation: 180, duration: 0.4, stagger: 0.03, ease: "back.in(1.7)",
        onComplete: () => {
          if (onComplete) onComplete();
          const newBlock = toCol ? toCol.querySelector('.math-block:last-child') : null;
          if (newBlock) {
            gsap.fromTo(newBlock, { scale: 0.2, opacity: 0 }, { scale: 1.2, opacity: 1, duration: 0.3, yoyo: true, repeat: 1, ease: "power2.out" });
          }
        }
      });
    } else {
      /* Fallback if GSAP is missing */
      blocks.forEach(b => b.classList.add('regrouping-out'));
      setTimeout(() => {
        if (onComplete) onComplete();
        const newBlock = toCol ? toCol.querySelector('.math-block:last-child') : null;
        if (newBlock) newBlock.classList.add('regrouping-in');
      }, 420);
    }
  }

  /**
   * Animate ungrouping (1 block explodes into 10).
   */
  function animateUngrouping(fromPlace, toPlace, containerEl, onComplete) {
    const fromCol  = containerEl.querySelector(`[data-place="${fromPlace}"] .pv-drop-zone`);
    const toCol    = containerEl.querySelector(`[data-place="${toPlace}"] .pv-drop-zone`);

    const blocks   = fromCol ? fromCol.querySelectorAll('.math-block') : [];
    const lastBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null;

    if (typeof gsap !== 'undefined' && lastBlock) {
      /* GSAP Ungrouping */
      gsap.to(lastBlock, {
        scale: 1.5, opacity: 0, duration: 0.3, ease: "power3.in",
        onComplete: () => {
          if (onComplete) onComplete();
          const newBlocks = toCol ? toCol.querySelectorAll('.math-block') : [];
          gsap.fromTo(newBlocks, 
            { scale: 0, y: 50, opacity: 0 }, 
            { scale: 1, y: 0, opacity: 1, duration: 0.5, stagger: 0.05, ease: "back.out(1.7)" }
          );
        }
      });
    } else {
      if (lastBlock) lastBlock.classList.add('ungrouping-out');
      setTimeout(() => {
        if (onComplete) onComplete();
        const newBlocks = toCol ? toCol.querySelectorAll('.math-block') : [];
        newBlocks.forEach((b, i) => {
          if (!b.classList.contains('regrouping-in')) {
            setTimeout(() => {
              b.classList.add('ungrouping-in');
              setTimeout(() => b.classList.remove('ungrouping-in'), 400);
            }, i * 30);
          }
        });
      }, 350);
    }
  }

  /**
   * Flash the current value display (the number shown below the structure).
   * @param {Element} displayEl
   * @param {number}  value
   */
  function updateValueDisplay(displayEl, value) {
    if (!displayEl) return;
    displayEl.textContent = value.toLocaleString('he-IL');
    displayEl.classList.remove('pulse');
    void displayEl.offsetWidth; /* force reflow */
    displayEl.classList.add('pulse');
    displayEl.addEventListener('animationend', () => {
      displayEl.classList.remove('pulse');
    }, { once: true });
  }

  return {
    render,
    renderColumn,
    createBlockElement,
    animateGrouping,
    animateUngrouping,
    updateValueDisplay,
    singularMap
  };
})();


/* ══════════════════════════════════════════════════════════════
   DragController — Drag & Drop Handler
   Connects palette → place-value columns.
   Handles grouping, ungrouping, constraints, undo snapshots.
══════════════════════════════════════════════════════════════ */
const DragController = (() => {

  let draggedPlace    = null;
  let draggedSource   = null;   /* 'palette' | 'column' */
  let containerEl     = null;
  let paletteEl       = null;
  let valueDisplayEl  = null;
  let onChangeCallback = null;
  let asdMode         = false;

  /**
   * Initialize drag-drop system.
   * @param {object} config
   */
  function init(config) {
    containerEl      = config.container;
    paletteEl        = config.palette;
    valueDisplayEl   = config.valueDisplay;
    onChangeCallback = config.onChange;
    asdMode          = config.asdMode ?? false;

    setupPaletteDrags();
    setupColumnDropZones();
    setupTrashZone();
    setupTouchFallback();
  }

  /* ── Palette: draggable block sources ── */
  function setupPaletteDrags() {
    if (!paletteEl) return;
    
    const detachBtn = document.getElementById('btn-detach-palette');
    let paletteDraggable = null;

    if (detachBtn) {
      detachBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isFloating = paletteEl.classList.toggle('floating');
        
        if (isFloating) {
          detachBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
          // Move to body for true fixed positioning
          document.body.appendChild(paletteEl);
          
          // Let CSS apply bottom/right initially
          if (typeof gsap !== 'undefined') {
            gsap.set(paletteEl, { bottom: 80, right: 20, left: "auto", top: "auto", margin: 0 });
          }
          
          // Convert to top/left for Draggable
          requestAnimationFrame(() => {
            const rect = paletteEl.getBoundingClientRect();
            if (typeof gsap !== 'undefined') {
              gsap.set(paletteEl, { bottom: "auto", right: "auto", top: rect.top, left: rect.left });
            }
            if (typeof Draggable !== 'undefined') {
              paletteDraggable = Draggable.create(paletteEl, {
                type: 'top,left',
                edgeResistance: 0.65,
                bounds: document.body,
                trigger: '#palette-drag-handle',
                inertia: true
              })[0];
            }
          });
        } else {
          detachBtn.innerHTML = '<i class="fa-solid fa-clone"></i>';
          
          if (paletteDraggable) {
            paletteDraggable.kill();
            paletteDraggable = null;
          }
          // Move back inside place-value-structure
          if (containerEl) {
            const structure = containerEl.closest('.place-value-structure');
            if (structure) structure.appendChild(paletteEl);
          }
          // Clear GSAP styles
          if (typeof gsap !== 'undefined') {
            gsap.set(paletteEl, { clearProps: "all" });
          }
        }
      });
    }

    // Ensure floating palette hides when board is closed
    if (containerEl) {
      const structure = containerEl.closest('.place-value-structure');
      if (structure) {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach(m => {
            if (m.attributeName === 'class') {
              if (paletteEl.classList.contains('floating')) {
                if (structure.classList.contains('open')) {
                  paletteEl.style.display = '';
                } else {
                  paletteEl.style.display = 'none';
                }
              }
            }
          });
        });
        observer.observe(structure, { attributes: true });
      }
    }

    const paletteBlocks = paletteEl.querySelectorAll('.palette-item [data-place]');
    paletteBlocks.forEach(block => {
      block.setAttribute('draggable', 'true');
      block.addEventListener('dragstart', (e) => {
        draggedPlace  = block.getAttribute('data-place');
        draggedSource = 'palette';
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', draggedPlace);
        block.style.opacity = '0.5';
        SilentRadar.recordStudentAction();
      });
      block.addEventListener('dragend', () => {
        block.style.opacity = '';
      });
    });
  }

  /* ── Column Drop Zones ── */
  function setupColumnDropZones() {
    if (!containerEl) return;
    const dropZones = containerEl.querySelectorAll('.pv-drop-zone');
    dropZones.forEach(zone => {
      const targetPlace = zone.closest('[data-place]').getAttribute('data-place');

      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = (draggedSource === 'column') ? 'move' : 'copy';
        zone.classList.add('drag-over');
      });

      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
      });

      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const sourcePlace = e.dataTransfer.getData('text/plain') || draggedPlace;
        const source = e.dataTransfer.getData('source') || draggedSource;
        handleDrop(sourcePlace, targetPlace, source);
      });
    });
  }

  /* ── Trash Zone ── */
  function setupTrashZone() {
    const trashZone = document.getElementById('trash-zone');
    if (!trashZone) return;

    trashZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      trashZone.classList.add('drag-over');
    });

    trashZone.addEventListener('dragleave', () => {
      trashZone.classList.remove('drag-over');
    });

    trashZone.addEventListener('drop', (e) => {
      e.preventDefault();
      trashZone.classList.remove('drag-over');
      const source = e.dataTransfer.getData('source') || draggedSource;
      if (source === 'column') {
        const sourcePlace = e.dataTransfer.getData('text/plain') || draggedPlace;
        handleBlockRemove(sourcePlace);
      }
    });
  }

  /* ── Touch fallback for tablets ── */
  function setupTouchFallback() {
    if (!paletteEl) return;
    const paletteBlocks = paletteEl.querySelectorAll('.palette-item [data-place]');
    paletteBlocks.forEach(block => {
      block.addEventListener('touchstart', handleTouchStart, { passive: true });
      block.addEventListener('touchend',   handleTouchEnd,   { passive: false });
    });
  }

  let touchDragEl = null;
  let touchPlace  = null;

  function handleTouchStart(e) {
    touchPlace  = this.getAttribute('data-place');
    touchDragEl = this;
    SilentRadar.recordStudentAction();
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    if (!touchPlace) return;
    const touch = e.changedTouches[0];
    const el    = document.elementFromPoint(touch.clientX, touch.clientY);
    const zone  = el ? el.closest('.pv-drop-zone') : null;
    const trash = el ? el.closest('#trash-zone') : null;

    if (trash && touchDragEl && touchDragEl.classList.contains('in-palette') === false) {
      handleBlockRemove(touchPlace);
    } else if (zone) {
      const targetPlace = zone.closest('[data-place]').getAttribute('data-place');
      const source = touchDragEl.classList.contains('in-palette') ? 'palette' : 'column';
      handleDrop(touchPlace, targetPlace, source);
    }
    touchPlace = null;
    touchDragEl = null;
  }

  /**
   * Handle dropping blocks
   */
  function handleDrop(sourcePlace, targetPlace, source) {
    /* Save state for Undo before modification */
    SessionManager.pushUndoState(PlaceValueModel.getSnapshot());
    SilentRadar.recordStudentAction();

    const placeOrder = PlaceValueModel.PLACE_ORDER;
    const srcIdx     = placeOrder.indexOf(sourcePlace);
    const tgtIdx     = placeOrder.indexOf(targetPlace);

    let regroupEvents = [];
    let ungrouped     = false;

    if (source === 'palette') {
      if (sourcePlace === targetPlace) {
        PlaceValueModel.addBlock(targetPlace);
      } else if (srcIdx > tgtIdx && srcIdx - tgtIdx === 1) {
        const result = PlaceValueModel.addUngroupedFromPalette(sourcePlace);
        if (result) {
          ungrouped = true;
        } else {
          SessionManager.popUndoState();
          return;
        }
      } else {
        SessionManager.popUndoState();
        return;
      }

    } else if (source === 'column' && sourcePlace === targetPlace) {
      SessionManager.popUndoState();
      return;

    } else if (source === 'column' && srcIdx > tgtIdx) {
      if (srcIdx - tgtIdx === 1) {
        const ungroupResult = PlaceValueModel.ungroupBlock(sourcePlace);
        if (!ungroupResult) {
          SessionManager.popUndoState();
          return;
        }
        ungrouped = true;
      } else {
        SessionManager.popUndoState();
        return;
      }

    } else if (source === 'column' && srcIdx < tgtIdx) {
      /* UDL: Dragging from smaller to larger place (e.g., Units to Tens) */
      if (tgtIdx - srcIdx === 1) {
        /* Manual Grouping: verify at least 10 blocks exist */
        if (PlaceValueModel.getCount(sourcePlace) >= 10) {
          for (let i = 0; i < 10; i++) {
            PlaceValueModel.removeBlock(sourcePlace);
          }
          PlaceValueModel.addBlock(targetPlace);
          regroupEvents = [{ from: sourcePlace, to: targetPlace, groups: 1 }];
          if (typeof StudentLogger !== 'undefined') {
            StudentLogger.logEvent('block_group_manual', { from: sourcePlace, to: targetPlace });
          }
        } else {
          SessionManager.popUndoState();
          // Flash error on source column
          const colEl = containerEl.querySelector(`[data-place="${sourcePlace}"] .pv-drop-zone`);
          if (colEl) {
            colEl.classList.add('constraint-error');
            setTimeout(() => colEl.classList.remove('constraint-error'), 500);
          }
          return;
        }
      } else {
        SessionManager.popUndoState();
        return;
      }
    } else {
      SessionManager.popUndoState();
      return;
    }

    if (regroupEvents && regroupEvents.length > 0) {
      if (typeof StudentLogger !== 'undefined') {
        StudentLogger.logEvent('block_regroup', { events: regroupEvents });
      }
    }

    if (ungrouped) {
      /* אנימציית פירוק (התפוצצות) */
      ManipulativeRenderer.animateUngrouping(sourcePlace, targetPlace, containerEl, () => {
        rerenderAll();
      });
    } else if (regroupEvents && regroupEvents.length > 0) {
      /* אנימציית המרה (10 בלוקים מתאגדים) */
      regroupEvents.forEach(evt => {
        ManipulativeRenderer.animateGrouping(evt.from, evt.to, containerEl, () => {
          rerenderAll();
        });
      });
    } else {
      rerenderAll();
    }
  }

  /**
   * Handle block removal (click on placed block).
   * Saves undo snapshot → removes block → re-renders.
   */
  function handleBlockRemove(place) {
    SessionManager.pushUndoState(PlaceValueModel.getSnapshot());
    SilentRadar.recordDeleteAction();

    const removed = PlaceValueModel.removeBlock(place);
    if (!removed) {
      /* CONSTRAINT VIOLATION: can't remove from zero — flash the column */
      const colEl = containerEl.querySelector(`[data-place="${place}"] .pv-drop-zone`);
      if (colEl) {
        colEl.classList.add('constraint-error');
        setTimeout(() => colEl.classList.remove('constraint-error'), 500);
      }
      /* Pop the undo we just pushed (no change happened) */
      SessionManager.popUndoState();
      if (typeof StudentLogger !== 'undefined') {
        StudentLogger.logEvent('block_remove_failed', { place: place, reason: 'zero_count' });
      }
    } else {
      if (typeof StudentLogger !== 'undefined') {
        StudentLogger.logEvent('block_remove', { place: place });
      }
      rerenderAll();
    }
  }

  /**
   * Re-render all columns and update the value display.
   */
  function rerenderAll() {
    ManipulativeRenderer.render(containerEl, {
      asdMode,
      onBlockClick: handleBlockRemove
    });
    ManipulativeRenderer.updateValueDisplay(valueDisplayEl, PlaceValueModel.getValue());
    if (onChangeCallback) onChangeCallback(PlaceValueModel.getAllCounts(), PlaceValueModel.getValue());
    SessionManager.saveToStorage();
  }

  /** Trigger a full re-render (called externally after Undo) */
  function refresh() {
    rerenderAll();
  }

  return { 
    init, 
    refresh, 
    handleBlockRemove,
    setDraggedInfo: (place, source) => { draggedPlace = place; draggedSource = source; },
    bindTouchEvents: (el) => {
      el.addEventListener('touchstart', handleTouchStart, { passive: true });
      el.addEventListener('touchend',   handleTouchEnd,   { passive: false });
    }
  };
})();
