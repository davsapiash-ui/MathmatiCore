/* ============================================================
   מתמטיקאור — Cuisenaire Blocks Engine
   Handles the logic for the 1-10 Lego-like blocks (No Auto-Merging).
   ============================================================ */

'use strict';

const CuisenaireController = (() => {
  let isInitialized = false;

  const RODS = [
    { value: 1, color: '#FFFFFF', text: '#000000' }, 
    { value: 2, color: '#EF4444', text: '#FFFFFF' }, 
    { value: 3, color: '#84CC16', text: '#FFFFFF' }, 
    { value: 4, color: '#A855F7', text: '#FFFFFF' }, 
    { value: 5, color: '#EAB308', text: '#FFFFFF' }, 
    { value: 6, color: '#16A34A', text: '#FFFFFF' }, 
    { value: 7, color: '#1F2937', text: '#FFFFFF' }, 
    { value: 8, color: '#78350F', text: '#FFFFFF' }, 
    { value: 9, color: '#3B82F6', text: '#FFFFFF' }, 
    { value: 10, color: '#F97316', text: '#FFFFFF' }
  ];

  const UNIT_WIDTH = 40; 
  const HEIGHT = 48;

  let draggedBlockId = null;
  let draggedBlockValue = null;

  function init() {
    if (isInitialized) return;
    isInitialized = true;
    renderPalette();
    setupDropZones();

    const btnClear = document.getElementById('btn-clear-cuisenaire');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        document.getElementById('cuisenaire-lane-1').innerHTML = '<span class="empty-lane-text">גררו קוביות לכאן</span>';
        document.getElementById('cuisenaire-lane-2').innerHTML = '<span class="empty-lane-text">גררו קוביות לכאן</span>';
        updateTotals();
      });
    }
  }

  function renderPalette() {
    const container = document.getElementById('cuisenaire-blocks-container');
    if (!container) return;
    container.innerHTML = '';
    
    RODS.forEach(rod => {
      const blockEl = createBlockElement(rod.value, false);
      container.appendChild(blockEl);
    });
  }

  function createBlockElement(value, isInstance = true, id = null) {
    const rodDef = RODS.find(r => r.value === value) || RODS[0];
    const el = document.createElement('div');
    el.className = 'lego-block';
    el.dataset.value = value;
    
    if (isInstance) {
      el.id = id || 'rod-' + Math.random().toString(36).substr(2, 9);
      // Double click removes the block back to the palette
      el.title = 'לחיצה כפולה להחזרה לקופסה';
      el.addEventListener('dblclick', () => {
        el.remove();
        updateTotals();
      });
    }
    
    el.style.width = `${value * UNIT_WIDTH}px`;
    el.style.height = `${HEIGHT}px`;
    el.style.backgroundColor = rodDef.color;
    el.style.color = rodDef.text;
    if (value === 1) el.style.border = '1px solid #ccc';
    
    // Add studs
    for (let i = 0; i < value; i++) {
      const stud = document.createElement('div');
      stud.className = 'lego-stud';
      stud.style.left = `${(i * UNIT_WIDTH) + (UNIT_WIDTH / 2) - 10}px`;
      el.appendChild(stud);
    }

    const span = document.createElement('span');
    span.style.position = 'relative';
    span.style.zIndex = '1';
    span.style.textShadow = '0 1px 2px rgba(0,0,0,0.3)';
    span.textContent = value;
    el.appendChild(span);

    // Drag events
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
      draggedBlockValue = value;
      if (isInstance) {
        draggedBlockId = el.id;
        e.dataTransfer.effectAllowed = 'move';
      } else {
        draggedBlockId = null;
        e.dataTransfer.effectAllowed = 'copy';
      }
      e.dataTransfer.setData('text/plain', value.toString());
      el.style.opacity = '0.5';
    });

    el.addEventListener('dragend', () => {
      el.style.opacity = '1';
      draggedBlockValue = null;
      draggedBlockId = null;
      updateTotals();
    });

    if (isInstance) {
      // Reordering when dropping ON another block in the lane
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Add a slight visual cue on the side we're closest to
        const rect = el.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (e.clientX > midX) {
          el.style.borderRight = '4px solid #3b82f6';
          el.style.borderLeft = '';
        } else {
          el.style.borderLeft = '4px solid #3b82f6';
          el.style.borderRight = '';
        }
      });
      el.addEventListener('dragleave', () => {
        el.style.borderRight = '';
        el.style.borderLeft = '';
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.style.borderRight = '';
        el.style.borderLeft = '';
        
        const droppedVal = draggedBlockValue || parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!isNaN(droppedVal)) {
          const lane = el.closest('.cuisenaire-lane');
          let droppedEl;
          
          if (draggedBlockId) {
            droppedEl = document.getElementById(draggedBlockId);
            if (droppedEl === el) return; // Drop on self
          } else {
            droppedEl = createBlockElement(droppedVal, true);
          }
          
          if (droppedEl) {
            const rect = el.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            if (e.clientX > midX) {
              // Insert after
              lane.insertBefore(droppedEl, el.nextSibling);
            } else {
              // Insert before
              lane.insertBefore(droppedEl, el);
            }
          }
          
          const emptyText = lane.querySelector('.empty-lane-text');
          if (emptyText) emptyText.remove();
          updateTotals();
        }
      });
    }

    return el;
  }

  function setupDropZones() {
    [1, 2].forEach(laneNum => {
      const lane = document.getElementById(`cuisenaire-lane-${laneNum}`);
      if (!lane) return;

      lane.addEventListener('dragover', (e) => {
        e.preventDefault();
        lane.classList.add('active');
        e.dataTransfer.dropEffect = draggedBlockId ? 'move' : 'copy';
      });

      lane.addEventListener('dragleave', () => {
        lane.classList.remove('active');
      });

      lane.addEventListener('drop', (e) => {
        e.preventDefault();
        lane.classList.remove('active');
        
        const droppedVal = draggedBlockValue || parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!isNaN(droppedVal)) {
          if (draggedBlockId) {
            const el = document.getElementById(draggedBlockId);
            if (el && el.parentNode !== lane) {
              lane.appendChild(el);
            }
          } else {
            const newBlock = createBlockElement(droppedVal, true);
            lane.appendChild(newBlock);
          }
          
          const emptyText = lane.querySelector('.empty-lane-text');
          if (emptyText) emptyText.remove();
          updateTotals();
        }
      });
    });
  }

  function updateTotals() {
    let t1 = 0;
    let t2 = 0;
    
    const lane1 = document.getElementById('cuisenaire-lane-1');
    if (lane1) {
      const blocks = Array.from(lane1.querySelectorAll('.lego-block'));
      if (blocks.length === 0) lane1.innerHTML = '<span class="empty-lane-text">גררו קוביות לכאן</span>';
      else blocks.forEach(b => t1 += parseInt(b.dataset.value, 10));
      document.getElementById('cuisenaire-total-1').textContent = `(${t1})`;
    }
    
    const lane2 = document.getElementById('cuisenaire-lane-2');
    if (lane2) {
      const blocks = Array.from(lane2.querySelectorAll('.lego-block'));
      if (blocks.length === 0) lane2.innerHTML = '<span class="empty-lane-text">גררו קוביות לכאן</span>';
      else blocks.forEach(b => t2 += parseInt(b.dataset.value, 10));
      document.getElementById('cuisenaire-total-2').textContent = `(${t2})`;
    }

    const eq = document.getElementById('cuisenaire-equality');
    if (eq) {
      if (t1 > 0 && t2 > 0) {
        eq.style.opacity = '1';
        if (t1 === t2) {
          eq.innerHTML = '<span class="badge rounded-pill bg-success px-4 py-2 fs-5 shadow-sm">שווה בדיוק! =</span>';
        } else {
          eq.innerHTML = '<span class="badge rounded-pill bg-danger px-4 py-2 fs-5 shadow-sm">לא שווה ≠</span>';
        }
      } else {
        eq.style.opacity = '0';
      }
    }
  }

  return {
    init,
    get isInitialized() { return isInitialized; }
  };
})();
