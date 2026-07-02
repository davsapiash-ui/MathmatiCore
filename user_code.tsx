import React, { useState, useRef, useEffect } from 'react';

// --- קבועים והגדרות ---
const COLORS = {
  unit: { base: '#FFFDD0', top: '#ffffff', side: '#e6e4bb', grid: 'rgba(0,0,0,0.15)' },
  tenBlock: { base: '#4CAF50', top: '#81c784', side: '#388e3c', grid: 'rgba(0,0,0,0.2)' },
  tenDisk: { base: '#4A148C', top: '#7c43bd', side: '#12005e' },
  hundred: { base: '#000080', top: '#1a1a9e', side: '#00004d', grid: 'rgba(255,255,255,0.25)' },
  thousand: { base: '#FF9800', top: '#ffb74d', side: '#f57c00', grid: 'rgba(0,0,0,0.25)' },
};

const VALUES = { THOUSAND: 1000, HUNDRED: 100, TEN: 10, UNIT: 1 };

// --- אייקונים פנימיים ---
const IconBox = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>;
const IconLego = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="10" width="18" height="10" rx="2" ry="2"></rect><path d="M7 10V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4"></path></svg>;
const IconTrash = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const IconMerge = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>;
const IconColumns = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>;
const IconOpen = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="12" cy="12" r="3"></circle></svg>;
const IconLink = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>;
const IconUnlink = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18.84 12.25 1.72-1.71h-.01a5.001 5.001 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="m5.17 11.75-1.71 1.71a5.001 5.001 0 0 0 7.07 7.07l1.71-1.71"></path><line x1="8" x2="16" y1="12" y2="12"></line></svg>;
const IconCopy = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>;
const IconCheck = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const IconInfo = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>;
const IconX = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconSettings = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
const IconMinus = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>;

// --- רכיבי עזר ויזואליים (SVGs) ---
const Base10Block = ({ dx, dy, dz, colors }) => {
  const uX = 7, uY = 3.5, uZ = 8;
  const pad = 2;
  const width = (dx + dy) * uX;
  const height = (dx + dy) * uY + dz * uZ;
  const svgWidth = width + pad * 2;
  const svgHeight = height + pad * 2;
  
  const O = { x: dx * uX + pad, y: pad }; 
  const vX = { x: -uX, y: uY };
  const vY = { x: uX, y: uY };
  const vZ = { x: 0, y: uZ };
  const add = (p, v, scale = 1) => ({ x: p.x + v.x * scale, y: p.y + v.y * scale });

  const P_left = add(O, vX, dx);
  const P_right = add(O, vY, dy);
  const P_front = add(P_left, vY, dy); 
  const P_left_b = add(P_left, vZ, dz);
  const P_right_b = add(P_right, vZ, dz);
  const P_front_b = add(P_front, vZ, dz);
  const pathStr = (points) => `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`;

  return (
    <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ filter: 'drop-shadow(2px 4px 4px rgba(0,0,0,0.3))', overflow: 'visible' }}>
      <path d={pathStr([O, P_left, P_front, P_right])} fill={colors.top} stroke={colors.grid} strokeWidth="1" strokeLinejoin="round"/>
      <path d={pathStr([P_left, P_front, P_front_b, P_left_b])} fill={colors.side} stroke={colors.grid} strokeWidth="1" strokeLinejoin="round"/>
      <path d={pathStr([P_front, P_right, P_right_b, P_front_b])} fill={colors.base} stroke={colors.grid} strokeWidth="1" strokeLinejoin="round"/>
      <g stroke={colors.grid} strokeWidth="0.75" strokeLinecap="round">
        {[...Array(dx - 1)].map((_, i) => { const start = add(O, vX, i+1); const end = add(start, vY, dy); return <line key={`tx-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {[...Array(dy - 1)].map((_, i) => { const start = add(O, vY, i+1); const end = add(start, vX, dx); return <line key={`ty-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {[...Array(dy - 1)].map((_, i) => { const start = add(P_left, vY, i+1); const end = add(start, vZ, dz); return <line key={`lx-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {[...Array(dz - 1)].map((_, i) => { const start = add(P_left, vZ, i+1); const end = add(start, vY, dy); return <line key={`lz-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {[...Array(dx - 1)].map((_, i) => { const start = add(P_right, vX, i+1); const end = add(start, vZ, dz); return <line key={`rx-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {[...Array(dz - 1)].map((_, i) => { const start = add(P_front, vZ, i+1); const end = add(P_right, vZ, i+1); return <line key={`rz-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
      </g>
    </svg>
  );
};

const BlockUnit = () => <Base10Block dx={1} dy={1} dz={1} colors={COLORS.unit} />;
const BlockTen = () => <Base10Block dx={1} dy={1} dz={10} colors={COLORS.tenBlock} />;
const BlockHundred = () => <Base10Block dx={10} dy={10} dz={1} colors={COLORS.hundred} />;
const BlockThousand = () => <Base10Block dx={10} dy={10} dz={10} colors={COLORS.thousand} />;

const LegoBrick = ({ value }) => {
  let color = COLORS.unit.base, shadowColor = '#d4d092', textColor = '#000', cols = 1, rows = 1, width = 44, height = 44;
  if (value === 10) { color = COLORS.tenDisk.base; shadowColor = '#280554'; textColor = '#fff'; cols = 2; rows = 1; width = 54; height = 44; }
  if (value === 100) { color = COLORS.hundred.base; shadowColor = '#00004d'; textColor = '#fff'; cols = 2; rows = 2; width = 64; height = 64; }
  if (value === 1000) { color = COLORS.thousand.base; shadowColor = '#c27300'; textColor = '#fff'; cols = 3; rows = 2; width = 84; height = 64; }

  return (
    <div className="relative flex items-center justify-center font-bold transition-transform hover:scale-105"
      style={{ backgroundColor: color, color: textColor, width: `${width}px`, height: `${height}px`, borderRadius: '4px',
        boxShadow: `inset -2px -4px 6px rgba(0,0,0,0.2), 0 4px 6px rgba(0,0,0,0.3)`, borderBottom: `4px solid ${shadowColor}`, borderRight: `2px solid ${shadowColor}` }}>
      <div className="absolute inset-0 flex flex-col justify-evenly items-center p-1 pointer-events-none">
         {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex justify-evenly w-full">
               {Array.from({ length: cols }).map((_, c) => (
                  <div key={c} style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: color,
                      boxShadow: `inset -2px -2px 4px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.4), 1px 2px 3px rgba(0,0,0,0.4)` }} />
               ))}
            </div>
         ))}
      </div>
      <span className="relative z-10 text-lg" style={{ textShadow: textColor === '#fff' ? '1px 1px 2px rgba(0,0,0,0.8)' : '1px 1px 2px rgba(255,255,255,0.8)' }}>{value}</span>
    </div>
  );
};

const OperatorTile = ({ symbol }) => (
  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-2xl font-black shadow-md border-2 border-slate-200 text-slate-700 select-none">
    {symbol}
  </div>
);

export default function PowerOfTenApp() {
  const [items, setItems] = useState([]);
  const [workspaceType, setWorkspaceType] = useState('pv'); 
  const [mode, setMode] = useState('block'); // block | lego
  
  const [pvMode, setPvMode] = useState('standard'); 
  const [pvOperator, setPvOperator] = useState('+'); 
  const [pvDirection, setPvDirection] = useState('vertical'); 
  const [isPvSettingsOpen, setIsPvSettingsOpen] = useState(true);
  
  const [draggedIds, setDraggedIds] = useState([]);
  const [lasso, setLasso] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeSelection, setActiveSelection] = useState(null); 
  const [pendingMoveId, setPendingMoveId] = useState(null); 
  const [feedback, setFeedback] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  
  const workspaceRef = useRef(null);
  const dragState = useRef({ isDragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, type: null, hasMoved: false });
  const lastTap = useRef({ id: null, time: 0 });

  const genId = () => Math.random().toString(36).substr(2, 9);

  const getRegions = () => {
    if (!workspaceRef.current) return [];
    const w = workspaceRef.current.clientWidth;
    const h = workspaceRef.current.clientHeight;

    if (workspaceType === 'open' || pvMode === 'standard') {
      return [{ id: 'r0', title: '', minX: 0, maxX: w, minY: 0, maxY: h }];
    }

    const isCompare = ['>', '<', '='].includes(pvOperator);
    const count = isCompare ? 2 : 3;
    const titles = isCompare ? ["מספר א'", "מספר ב'"] : ["איבר 1", "איבר 2", "תוצאה"];
    const regions = [];

    for (let i = 0; i < count; i++) {
      if (pvDirection === 'vertical') {
        regions.push({
          id: `r${i}`, title: titles[i],
          minX: 0, maxX: w,
          minY: (h / count) * i, maxY: (h / count) * (i + 1)
        });
      } else {
        const step = w / count;
        regions.push({
          id: `r${i}`, title: titles[i],
          minX: step * i, maxX: step * (i + 1),
          minY: 0, maxY: h
        });
      }
    }
    return regions;
  };

  const getColumns = () => {
    const regions = getRegions();
    const cols = [];
    const isHoriz = pvMode === 'exercise' && pvDirection === 'horizontal';

    regions.forEach(r => {
       const rw = r.maxX - r.minX;
       const step = rw / 4;
       cols.push({ id: `${r.id}_th`, regionId: r.id, val: 1000, title: isHoriz ? "א'" : 'אלפים', minX: r.minX, maxX: r.minX + step, minY: r.minY, maxY: r.maxY });
       cols.push({ id: `${r.id}_h`,  regionId: r.id, val: 100, title: isHoriz ? "מ'" : 'מאות', minX: r.minX + step, maxX: r.minX + step*2, minY: r.minY, maxY: r.maxY });
       cols.push({ id: `${r.id}_t`,  regionId: r.id, val: 10, title: isHoriz ? "ע'" : 'עשרות', minX: r.minX + step*2, maxX: r.minX + step*3, minY: r.minY, maxY: r.maxY });
       cols.push({ id: `${r.id}_u`,  regionId: r.id, val: 1, title: isHoriz ? "י'" : 'יחידות', minX: r.minX + step*3, maxX: r.minX + step*4, minY: r.minY, maxY: r.maxY });
    });
    return cols;
  };

  const getTargetCoords = (value) => {
    let targetX = 100, targetY = 100;
    if (workspaceType === 'pv' && value !== undefined) {
      const cols = getColumns();
      const col = cols.find(c => c.val === value && c.id.startsWith('r0'));
      if (col) {
          targetX = (col.minX + col.maxX) / 2;
          targetY = (col.minY + col.maxY) / 2;
      } else if (cols.length > 0) {
          targetX = (cols[0].minX + cols[0].maxX) / 2;
          targetY = (cols[0].minY + cols[0].maxY) / 2;
      }
    } else {
      targetX = (workspaceRef.current?.clientWidth || 800) / 2;
      targetY = 150;
    }
    return { x: targetX, y: targetY };
  };

  const addItem = (value) => {
    const coords = getTargetCoords(value);
    setItems(prev => [...prev, {
      id: genId(), type: 'block', value, groupId: null,
      x: coords.x + (Math.random() * 40 - 20),
      y: coords.y + (Math.random() * 40 - 20)
    }]);
    setActiveSelection(null);
    setSelectedIds([]);
  };

  const addOperator = (symbol) => {
    const coords = getTargetCoords();
    setItems(prev => [...prev, {
      id: genId(), type: 'operator', symbol, groupId: null,
      x: coords.x + (Math.random() * 40 - 20),
      y: coords.y + (Math.random() * 40 - 20)
    }]);
    setActiveSelection(null);
    setSelectedIds([]);
  };

  const executeBreak = (item, overrideTargetX = null, overrideTargetY = null) => {
    if (item.type !== 'block' || item.value === 1) return;
    
    const lowerValue = item.value / 10;
    const newIds = [];
    const existingGroupId = item.groupId; 
    
    const tempItems = Array.from({ length: 10 }).map((_, i) => {
      const newId = genId();
      newIds.push(newId);
      return {
        id: newId, type: 'block', value: lowerValue, groupId: existingGroupId,
        x: item.x, y: item.y,
        targetX: item.x, targetY: item.y,
        isSpreading: true
      };
    });

    const targetCenterX = overrideTargetX ?? item.x;
    const targetCenterY = overrideTargetY ?? item.y;

    tempItems.forEach((tempItem, i) => {
      let offsetX = 0, offsetY = 0;
      if (item.value === 10) { 
        offsetX = ((i % 5) - 2) * 25; 
        offsetY = (Math.floor(i / 5) - 0.5) * 25; 
      } else if (item.value === 100) { 
        offsetX = (i - 4.5) * 15; 
        offsetY = 0; 
      } else if (item.value === 1000) { 
        offsetX = (i - 4.5) * 10; 
        offsetY = (i - 4.5) * -10; 
      }
      tempItem.targetX = targetCenterX + offsetX;
      tempItem.targetY = targetCenterY + offsetY;
    });

    setItems(prev => [...prev.filter(i => i.id !== item.id), ...tempItems]);
    setSelectedIds([]);
    setActiveSelection(null);
    setPendingMoveId(null);

    setTimeout(() => {
      setItems(current => current.map(currItem => newIds.includes(currItem.id) ? { ...currItem, x: currItem.targetX, y: currItem.targetY } : currItem));
    }, 50);

    setTimeout(() => {
      setItems(current => current.map(currItem => {
        if (newIds.includes(currItem.id)) {
          const { isSpreading, targetX, targetY, ...rest } = currItem;
          return rest;
        }
        return currItem;
      }));
    }, 550);
  };

  const handleDoubleClick = (item) => {
    if (workspaceType === 'open') executeBreak(item);
  };

  const calcSelectionBounds = (ids, currentItems = items) => {
    if (ids.length === 0) return null;
    const selectedItems = currentItems.filter(i => ids.includes(i.id));
    if (selectedItems.length === 0) return null;
    
    const padding = 40;
    const minX = Math.min(...selectedItems.map(i => i.x)) - padding;
    const maxX = Math.max(...selectedItems.map(i => i.x)) + padding;
    const minY = Math.min(...selectedItems.map(i => i.y)) - padding;
    const maxY = Math.max(...selectedItems.map(i => i.y)) + padding;
    
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  const updateActiveSelection = (ids, currentItems = items) => {
    if (ids.length === 0) { setActiveSelection(null); return; }
    setActiveSelection({ ids, bounds: calcSelectionBounds(ids, currentItems) });
  };

  const actionGroup = () => {
    if (!activeSelection) return;
    const newGroupId = genId();
    setItems(prev => prev.map(item => activeSelection.ids.includes(item.id) ? { ...item, groupId: newGroupId } : item));
  };

  const actionUngroup = () => {
    if (!activeSelection) return;
    setItems(prev => prev.map(item => activeSelection.ids.includes(item.id) ? { ...item, groupId: null } : item));
  };

  const actionDuplicate = () => {
    if (!activeSelection) return;
    const itemsToClone = items.filter(i => activeSelection.ids.includes(i.id));
    const newItems = [];
    const newIds = [];
    const groupIdMap = {}; 

    itemsToClone.forEach(item => {
       const cloned = { ...item, id: genId(), x: item.x + 30, y: item.y + 30 };
       newIds.push(cloned.id);
       if (item.groupId) {
          if (!groupIdMap[item.groupId]) groupIdMap[item.groupId] = genId();
          cloned.groupId = groupIdMap[item.groupId];
       }
       newItems.push(cloned);
    });

    setItems(prev => [...prev, ...newItems]);
    setSelectedIds(newIds);
    setTimeout(() => { updateActiveSelection(newIds, [...items, ...newItems]); }, 0);
  };

  const actionMerge = () => {
    if (!activeSelection) return;
    const selectedBlocks = items.filter(i => activeSelection.ids.includes(i.id) && i.type === 'block');
    if (selectedBlocks.length !== 10) return;
    
    const val = selectedBlocks[0].value;
    const centerX = selectedBlocks.reduce((sum, i) => sum + i.x, 0) / 10;
    const centerY = selectedBlocks.reduce((sum, i) => sum + i.y, 0) / 10;
    
    const newItem = { id: genId(), type: 'block', value: val * 10, x: centerX, y: centerY, groupId: null };
    setItems(prev => [...prev.filter(i => !activeSelection.ids.includes(i.id)), newItem]);
    
    setSelectedIds([newItem.id]);
    setTimeout(() => { updateActiveSelection([newItem.id], [...items.filter(i => !activeSelection.ids.includes(i.id)), newItem]); }, 0);
  };

  const showFeedback = (isCorrect, text) => {
    setFeedback({ isCorrect, text });
    setTimeout(() => setFeedback(null), 3500);
  };

  const checkAnswer = () => {
    if (workspaceType === 'pv') {
       if (pvMode === 'standard') return;
       const regions = getRegions();
       const sums = regions.map(r => 
          items.filter(i => i.type === 'block' && i.x >= r.minX && i.x <= r.maxX && i.y >= r.minY && i.y <= r.maxY)
               .reduce((acc, i) => acc + i.value, 0)
       );
       
       const isCompare = ['>', '<', '='].includes(pvOperator);
       let correct = false;

       if (isCompare) {
         const op1 = sums[0];
         const op2 = sums[1];
         if (pvOperator === '>') correct = op1 > op2;
         else if (pvOperator === '<') correct = op1 < op2;
         else if (pvOperator === '=') correct = op1 === op2;
         
         showFeedback(correct, correct ? 'ההשוואה נכונה! 🎉' : 'היחס בין המספרים שגוי 🤔');
       } else {
         const op1 = sums[0];
         const op2 = sums[1];
         const res = sums[2];
         if (pvOperator === '+') correct = op1 + op2 === res;
         else if (pvOperator === '-') correct = op1 - op2 === res;
         else if (pvOperator === '×') correct = op1 * op2 === res;
         else if (pvOperator === '÷') correct = op2 !== 0 && op1 / op2 === res;
         
         showFeedback(correct, correct ? 'חישוב מדויק, כל הכבוד! 🎉' : 'יש כאן טעות, כדאי לבדוק שוב 🤔');
       }
    } 
    else if (workspaceType === 'open') {
       const groups = calculateExplicitGroups();
       const ungroupedBlocks = items.filter(i => i.type === 'block' && !i.groupId).map(i => ({ sum: i.value, x: i.x }));
       const operators = items.filter(i => i.type === 'operator').map(i => ({ symbol: i.symbol, x: i.x }));
       
       const allElements = [
         ...groups.map(g => ({ type: 'num', val: g.sum, x: g.x })),
         ...ungroupedBlocks.map(b => ({ type: 'num', val: b.sum, x: b.x })),
         ...operators.map(o => ({ type: o.symbol, val: o.symbol, x: o.x }))
       ].sort((a, b) => a.x - b.x);

       const isRelation = (op) => ['=', '<', '>'].includes(op);
       let chunks = [];
       let currentChunk = [];
       allElements.forEach(e => {
           if (isRelation(e.type)) {
               chunks.push(currentChunk);
               chunks.push(e.type);
               currentChunk = [];
           } else {
               currentChunk.push(e);
           }
       });
       if (currentChunk.length > 0) chunks.push(currentChunk);

       if (chunks.length < 3) {
           showFeedback(false, 'לא מצאתי סימן השוואה (=, <, >) כדי לבדוק את התרגיל.');
           return;
       }

       const evaluatedChunks = chunks.map(chunk => {
           if (typeof chunk === 'string') return chunk;
           if (chunk.length === 0) return NaN;
           
           const expr = chunk.map(e => {
               if (e.type === 'num') return e.val;
               if (e.type === '×') return '*';
               if (e.type === '÷') return '/';
               return e.type;
           }).join('');
           try { return new Function('return ' + expr)(); } 
           catch(e) { return NaN; }
       });

       if (evaluatedChunks.some(v => typeof v === 'number' && isNaN(v))) {
           showFeedback(false, 'התרגיל לא שלם או לא מסודר נכון.');
           return;
       }

       let isCorrect = true;
       for (let i = 0; i < evaluatedChunks.length - 2; i += 2) {
           const left = evaluatedChunks[i];
           const op = evaluatedChunks[i+1];
           const right = evaluatedChunks[i+2];

           if (op === '=') { if (left !== right) isCorrect = false; }
           else if (op === '<') { if (!(left < right)) isCorrect = false; }
           else if (op === '>') { if (!(left > right)) isCorrect = false; }
       }

       showFeedback(isCorrect, isCorrect ? 'התרגיל פתור נכון! 🎉' : 'יש שגיאה בחישוב 🤔');
    }
  };

  const handlePointerDown = (e) => {
    if (!workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.target.closest('.interactive-item')) return;
    if (e.target.closest('.selection-toolbar')) return; 

    if (workspaceType === 'pv' && pendingMoveId) {
      const item = items.find(i => i.id === pendingMoveId);
      if (item && item.type === 'block') {
        const cols = getColumns();
        const targetCol = cols.find(c => x >= c.minX && x <= c.maxX && y >= c.minY && y <= c.maxY);
        if (targetCol && targetCol.val < item.value) {
           if (item.value / targetCol.val === 10) { executeBreak(item, x, y); return; }
        }
      }
      setPendingMoveId(null);
    }

    setLasso({ x1: x, y1: y, x2: x, y2: y });
    setSelectedIds([]);
    setActiveSelection(null);
    setPendingMoveId(null);
    dragState.current = { isDragging: true, startX: x, startY: y, lastX: x, lastY: y, type: 'lasso', hasMoved: false };
    e.target.setPointerCapture(e.pointerId);
  };

  const handleItemPointerDown = (e, item) => {
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);
    
    const now = Date.now();
    if (lastTap.current.id === item.id && now - lastTap.current.time < 300) {
      handleDoubleClick(item);
      lastTap.current = { id: null, time: 0 };
      return;
    }
    lastTap.current = { id: item.id, time: now };

    const rect = workspaceRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    dragState.current = { isDragging: true, startX: x, startY: y, lastX: x, lastY: y, type: 'drag', hasMoved: false };
    
    let idsToSelect = [item.id];
    if (item.groupId) idsToSelect = items.filter(i => i.groupId === item.groupId).map(i => i.id);

    if (selectedIds.includes(item.id)) { setDraggedIds([...selectedIds]); } 
    else { setDraggedIds(idsToSelect); setSelectedIds(idsToSelect); }
    
    setActiveSelection(null); 
  };

  const handlePointerMove = (e) => {
    if (!dragState.current.isDragging || !workspaceRef.current) return;
    
    const rect = workspaceRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - dragState.current.lastX;
    const dy = y - dragState.current.lastY;

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragState.current.hasMoved = true;

    if (dragState.current.type === 'lasso') {
      setLasso(prev => ({ ...prev, x2: x, y2: y }));
    } else if (dragState.current.type === 'drag') {
      setItems(prev => prev.map(item => draggedIds.includes(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item));
    }

    dragState.current.lastX = x;
    dragState.current.lastY = y;
  };

  const handlePointerUp = (e) => {
    if (!dragState.current.isDragging) return;
    
    if (dragState.current.type === 'lasso' && lasso) {
      const minX = Math.min(lasso.x1, lasso.x2);
      const maxX = Math.max(lasso.x1, lasso.x2);
      const minY = Math.min(lasso.y1, lasso.y2);
      const maxY = Math.max(lasso.y1, lasso.y2);
      
      const selected = items.filter(item => item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY);
      const groupIds = new Set(selected.filter(i => i.groupId).map(i => i.groupId));
      const fullSelectionIds = new Set(selected.map(i => i.id));
      
      items.forEach(item => { if (item.groupId && groupIds.has(item.groupId)) fullSelectionIds.add(item.id); });
      
      const finalIds = Array.from(fullSelectionIds);
      setSelectedIds(finalIds);
      updateActiveSelection(finalIds);
      
    } else if (dragState.current.type === 'drag') {
      if (!dragState.current.hasMoved && draggedIds.length === 1 && workspaceType === 'pv') {
          setPendingMoveId(draggedIds[0]);
          updateActiveSelection(draggedIds);
      } else if (workspaceType === 'pv') {
          const cols = getColumns();
          let updatedItems = [...items];
          let newBrokenIds = [];
          
          draggedIds.forEach(id => {
            const item = updatedItems.find(i => i.id === id);
            if (!item || item.type !== 'block') return;
            const targetCol = cols.find(c => item.x >= c.minX && item.x <= c.maxX && item.y >= c.minY && item.y <= c.maxY);
            
            if (targetCol && targetCol.val < item.value && item.value / 10 === targetCol.val) {
                updatedItems = updatedItems.filter(i => i.id !== item.id);
                const tempItems = Array.from({ length: 10 }).map((_, i) => {
                  const newId = genId();
                  newBrokenIds.push(newId);
                  let offsetX = 0, offsetY = 0;
                  if (item.value === 10) { 
                    offsetX = ((i % 5) - 2) * 25; 
                    offsetY = (Math.floor(i / 5) - 0.5) * 25; 
                  } else if (item.value === 100) { 
                    offsetX = (i - 4.5) * 15; 
                    offsetY = 0; 
                  } else if (item.value === 1000) { 
                    offsetX = (i - 4.5) * 10; 
                    offsetY = (i - 4.5) * -10; 
                  }
                  return {
                    id: newId, type: 'block', value: targetCol.val, groupId: null,
                    x: item.x, y: item.y,
                    targetX: item.x + offsetX, targetY: item.y + offsetY,
                    isSpreading: true
                  };
                });
                updatedItems.push(...tempItems);
            }
          });
          
          cols.forEach(col => {
            if (col.val === VALUES.UNIT) return;
            const lowerValue = col.val / 10;
            const lowerItemsInCol = updatedItems.filter(i => 
                i.type === 'block' && i.value === lowerValue && 
                i.x >= col.minX && i.x <= col.maxX && 
                i.y >= col.minY && i.y <= col.maxY
            );
            
            let group = [...lowerItemsInCol];
            while (group.length >= 10) {
              const toMerge = group.slice(0, 10).map(i => i.id);
              updatedItems = updatedItems.filter(i => !toMerge.includes(i.id));
              updatedItems.push({ 
                  id: genId(), type: 'block', value: col.val, 
                  x: (col.minX + col.maxX) / 2, y: group[0].y, groupId: null 
              });
              group = group.slice(10);
            }
          });
          
          setItems(updatedItems);
          if (selectedIds.length > 0) updateActiveSelection(selectedIds, updatedItems);
          
          if (newBrokenIds.length > 0) {
             setTimeout(() => {
                setItems(current => current.map(currItem => newBrokenIds.includes(currItem.id) ? { ...currItem, x: currItem.targetX, y: currItem.targetY } : currItem));
             }, 50);
             setTimeout(() => {
                setItems(current => current.map(currItem => {
                   if (newBrokenIds.includes(currItem.id)) {
                      const { isSpreading, targetX, targetY, ...rest } = currItem;
                      return rest;
                   }
                   return currItem;
                }));
             }, 550);
          }
      } else if (workspaceType === 'open') {
          if (selectedIds.length > 0) updateActiveSelection(selectedIds);
      }
    }

    setLasso(null);
    setDraggedIds([]);
    dragState.current = { isDragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, type: null, hasMoved: false };
  };

  const calculateExplicitGroups = () => {
      const groupMap = {};
      items.forEach(item => {
          if (item.groupId && item.type === 'block') {
              if (!groupMap[item.groupId]) groupMap[item.groupId] = [];
              groupMap[item.groupId].push(item);
          }
      });
      
      const labels = [];
      Object.values(groupMap).forEach(cluster => {
          if (cluster.length > 0) {
              const sum = cluster.reduce((acc, c) => acc + c.value, 0);
              const cx = cluster.reduce((acc, c) => acc + c.x, 0) / cluster.length;
              const minY = Math.min(...cluster.map(c => c.y));
              labels.push({ sum, x: cx, y: minY - 45 });
          }
      });
      return labels;
  };

  const cyclePvOperator = () => {
      const ops = ['+', '-', '×', '÷', '>', '<', '='];
      setPvOperator(ops[(ops.indexOf(pvOperator) + 1) % ops.length]);
  };

  const groupLabels = calculateExplicitGroups();
  
  const regionsData = getRegions().map(r => {
     const sum = items.filter(i => i.type === 'block' && i.x >= r.minX && i.x <= r.maxX && i.y >= r.minY && i.y <= r.maxY)
                      .reduce((acc, item) => acc + item.value, 0);
     return { ...r, sum };
  });

  const columnsData = getColumns();
  const isCompare = ['>', '<', '='].includes(pvOperator);
  
  let canGroup = false, canUngroup = false, canMerge = false;
  if (activeSelection) {
      const selectedItems = items.filter(i => activeSelection.ids.includes(i.id));
      const uniqueGroups = new Set(selectedItems.map(i => i.groupId));
      if (selectedItems.length > 1 && (uniqueGroups.size > 1 || uniqueGroups.has(null))) canGroup = true;
      if (uniqueGroups.size === 1 && !uniqueGroups.has(null)) canUngroup = true;
      const blocksOnly = selectedItems.filter(i => i.type === 'block');
      if (blocksOnly.length === 10) {
          const val = blocksOnly[0].value;
          if (blocksOnly.every(i => i.value === val) && val < 1000) canMerge = true;
      }
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden" dir="rtl">
      
      {/* סרגל כלים צדדי (מחסן) */}
      <aside className="w-24 md:w-32 bg-white border-l border-slate-200 shadow-[4px_0_15px_rgba(0,0,0,0.05)] flex flex-col z-30 select-none">
        
        {/* לוגו / מצב תצוגה עליון */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col items-center gap-2">
            <div className="text-blue-600 bg-white p-2 rounded-xl shadow-sm"><IconBox /></div>
            <h1 className="text-xs md:text-sm font-black text-slate-700 text-center">כוח עשר</h1>
            <div className="flex bg-slate-200 p-1 rounded-lg mt-2 w-full justify-between relative">
              {/* כפתור פנימי קטן להחלפת מצב תלת ממד / לגו עתידי (כרגע מוגדר רק על תלת ממד בקוד זה) */}
               <button onClick={() => setMode('block')} className={`flex-1 py-1 rounded shadow-sm text-xs font-bold text-center bg-white text-blue-600`}>
                 תלת ממד
               </button>
            </div>
        </div>

        {/* מחסן הקוביות */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-3 flex flex-col gap-4 items-center">
            
            <div className="w-full text-center pb-2 border-b border-slate-100">
               <span className="text-xs font-bold text-slate-400">קוביות</span>
            </div>

            <button onClick={() => addItem(1000)} className="w-full aspect-square bg-orange-50 hover:bg-orange-100 rounded-xl flex flex-col items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 group border border-orange-100">
               <div className="scale-50 pointer-events-none -mt-4"><BlockThousand /></div>
               <span className="text-sm font-black text-orange-600">1000</span>
            </button>

            <button onClick={() => addItem(100)} className="w-full aspect-square bg-blue-50 hover:bg-blue-100 rounded-xl flex flex-col items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 group border border-blue-100">
               <div className="scale-75 pointer-events-none -mt-2"><BlockHundred /></div>
               <span className="text-sm font-black text-blue-600">100</span>
            </button>

            <button onClick={() => addItem(10)} className="w-full aspect-square bg-green-50 hover:bg-green-100 rounded-xl flex flex-col items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 group border border-green-100">
               <div className="scale-[0.6] pointer-events-none h-16"><BlockTen /></div>
               <span className="text-sm font-black text-green-600">10</span>
            </button>

            <button onClick={() => addItem(1)} className="w-full aspect-square bg-yellow-50 hover:bg-yellow-100 rounded-xl flex flex-col items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 group border border-yellow-100">
               <div className="pointer-events-none"><BlockUnit /></div>
               <span className="text-sm font-black text-yellow-600">1</span>
            </button>

            {/* מחסן הסימנים (מוצג רק בשולחן פתוח) */}
            {workspaceType === 'open' && (
               <>
                 <div className="w-full text-center pb-2 border-b border-slate-100 mt-2">
                    <span className="text-xs font-bold text-slate-400">סימנים</span>
                 </div>
                 <div className="grid grid-cols-2 gap-2 w-full" dir="ltr">
                    {['+', '-', '×', '÷', '=', '>', '<'].map(op => (
                       <button key={op} onClick={() => addOperator(op)} className="aspect-square bg-white shadow-sm border border-slate-200 rounded-lg flex items-center justify-center text-xl font-black text-slate-700 hover:bg-slate-50 transition-colors active:scale-95">
                         {op}
                       </button>
                    ))}
                 </div>
               </>
            )}

        </div>
      </aside>

      {/* אזור עבודה ראשי */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* סרגל עליון מינימליסטי */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-3 flex justify-between items-center z-20 shadow-sm">
           
           {/* בורר סביבת העבודה המרכזי */}
           <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-inner">
              <button onClick={() => { setWorkspaceType('pv'); setPvMode('standard'); setActiveSelection(null); setSelectedIds([]); }} 
                      className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all duration-200 ${workspaceType === 'pv' ? 'bg-white shadow text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                <IconColumns /> <span className="hidden sm:block">בית המספרים</span>
              </button>
              <button onClick={() => { setWorkspaceType('open'); setActiveSelection(null); setSelectedIds([]); }} 
                      className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all duration-200 ${workspaceType === 'open' ? 'bg-white shadow text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                <IconOpen /> <span className="hidden sm:block">שולחן חופשי</span>
              </button>
           </div>

           {/* כלים כלליים */}
           <div className="flex items-center gap-3">
              <button onClick={checkAnswer} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md transition-transform active:scale-95">
                 <IconCheck /> <span className="hidden sm:inline">בדוק תשובה</span>
              </button>
              <div className="h-8 w-px bg-slate-300 mx-1"></div>
              <button onClick={() => { setItems([]); setActiveSelection(null); setSelectedIds([]); }} className="text-slate-400 hover:bg-red-50 hover:text-red-500 p-2 rounded-full transition-colors" title="נקה לוח">
                 <IconTrash />
              </button>
              <button onClick={() => setShowAbout(true)} className="text-slate-400 hover:bg-blue-50 hover:text-blue-500 p-2 rounded-full transition-colors" title="אודות">
                 <IconInfo />
              </button>
           </div>
        </header>

        {/* לוח בקרה צף (Contextual Panel) לבית המספרים עם אפשרות מזעור */}
        {workspaceType === 'pv' && (
           <div className="absolute top-4 right-4 z-20">
             {!isPvSettingsOpen ? (
                <button onClick={() => setIsPvSettingsOpen(true)} className="bg-white/95 backdrop-blur-md shadow-md border border-slate-200 p-2.5 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-2 font-bold text-sm">
                   <IconSettings /> הגדרות תבנית
                </button>
             ) : (
                <div className="bg-white/95 backdrop-blur-md shadow-xl border border-slate-200 rounded-xl p-3 flex flex-col gap-3 w-[280px] animate-in fade-in slide-in-from-top-2">
                   <div className="text-sm font-bold text-slate-700 pb-2 border-b border-slate-100 flex justify-between items-center">
                      <span className="flex items-center gap-2"><IconSettings /> הגדרות תבנית</span>
                      <button onClick={() => setIsPvSettingsOpen(false)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1 rounded transition-colors" title="מזער">
                         <IconMinus />
                      </button>
                   </div>
                   
                   <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button onClick={() => setPvMode('standard')} className={`flex-1 py-1.5 rounded transition-colors text-sm font-semibold ${pvMode === 'standard' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>לוח רגיל</button>
                      <button onClick={() => { setPvMode('exercise'); setPvOperator('+'); }} className={`flex-1 py-1.5 rounded transition-colors text-sm font-semibold ${pvMode === 'exercise' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>תרגיל/השוואה</button>
                   </div>

                   {pvMode === 'exercise' && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                         <span className="text-xs font-bold text-slate-400">כיווניות:</span>
                         <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button onClick={() => setPvDirection('horizontal')} className={`flex-1 py-1.5 rounded transition-colors text-sm font-semibold ${pvDirection === 'horizontal' ? 'bg-blue-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>מאוזן (שורות)</button>
                            <button onClick={() => setPvDirection('vertical')} className={`flex-1 py-1.5 rounded transition-colors text-sm font-semibold ${pvDirection === 'vertical' ? 'bg-blue-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>מאונך (טורים)</button>
                         </div>
                      </div>
                   )}
                </div>
             )}
           </div>
        )}

        {/* שכבת המשוב הצפה (Toast) */}
        {feedback && (
          <div className={`absolute top-24 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-2xl font-bold text-xl flex items-center gap-3 animate-bounce ${feedback.isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
             {feedback.text}
          </div>
        )}

        {/* קנבס העבודה עם רקע מחברת חשבון (משבצות) גורף */}
        <main 
          className="flex-1 relative overflow-hidden touch-none select-none bg-white"
          style={{
              backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.15) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
              backgroundPosition: 'center top'
          }}
          ref={workspaceRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {workspaceType === 'pv' && (
            <>
              {pvMode === 'exercise' && (
                 <div className="absolute inset-0 pointer-events-none flex z-0" 
                      style={{ flexDirection: pvDirection === 'vertical' ? 'column' : 'row' }} 
                      dir={pvDirection === 'horizontal' ? 'ltr' : 'rtl'}>
                    {regionsData.map((row, idx) => (
                       <div key={row.id} className={`relative flex-1 ${pvDirection === 'vertical' ? (idx < regionsData.length - 1 ? 'border-b-2' : '') : (idx < regionsData.length - 1 ? 'border-r-2' : '')} border-slate-300`}>
                          <div className={`absolute inset-0 ${idx === 0 ? 'bg-blue-50/30' : idx === 1 ? 'bg-emerald-50/30' : 'bg-slate-100/60'}`}></div>
                          
                          <div className={`absolute bg-white/95 border border-slate-200 px-4 py-2 rounded-xl shadow-md text-center ${pvDirection === 'vertical' ? 'left-6 top-1/2 -translate-y-1/2' : 'bottom-6 left-1/2 -translate-x-1/2'}`}>
                            <div className="text-xs text-slate-500 font-bold">{row.title}</div>
                            <div className="text-2xl font-black text-slate-700">{row.sum}</div>
                          </div>
                       </div>
                    ))}
                 </div>
              )}

              <div className="absolute inset-0 pointer-events-none z-0">
                {columnsData.map((col) => {
                    let isDimmed = false;
                    if (draggedIds.length > 0) {
                      const item = items.find(i => i.id === draggedIds[0]);
                      if (item && item.type === 'block' && !(item.x >= col.minX && item.x <= col.maxX && item.y >= col.minY && item.y <= col.maxY)) isDimmed = true;
                    }
                    
                    return (
                      <div key={col.id} className={`absolute border-l border-dashed border-slate-300 transition-opacity duration-300 ${isDimmed ? 'opacity-40 bg-slate-100/50' : 'opacity-100'} ${pendingMoveId ? 'pointer-events-auto cursor-crosshair hover:bg-blue-50/50' : ''}`}
                           style={{ left: col.minX, top: col.minY, width: col.maxX - col.minX, height: col.maxY - col.minY }}>
                        <div className="absolute top-2 w-full text-center pointer-events-none">
                          <h2 className={`font-bold text-slate-400 ${pvDirection === 'horizontal' ? 'text-sm' : 'text-xl'}`}>{col.title}</h2>
                          {pvMode === 'standard' && <div className="text-3xl font-black text-slate-300">{col.currentSum > 0 ? col.currentSum : ''}</div>}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {pvMode === 'exercise' && (
                <div className="absolute inset-0 pointer-events-none z-10">
                   <button onClick={(e) => { e.stopPropagation(); cyclePvOperator(); }} 
                           className="pv-operator-btn pointer-events-auto absolute bg-white rounded-full shadow-lg border-2 border-purple-200 flex items-center justify-center text-4xl font-black text-purple-600 hover:bg-purple-50 transition-colors"
                           style={{
                              width: '60px', height: '60px',
                              ...(pvDirection === 'vertical'
                                  ? { left: '32px', top: regionsData[0].maxY, transform: 'translateY(-50%)' }
                                  : { top: '32px', left: regionsData[1].minX, transform: 'translateX(-50%)' }
                              )
                           }}>
                      {pvOperator}
                   </button>

                   {!isCompare && regionsData.length > 2 && (
                     <div className="absolute bg-white rounded-full shadow-lg border-2 border-slate-300 flex items-center justify-center text-4xl font-black text-slate-600"
                        style={{
                           width: '60px', height: '60px',
                           ...(pvDirection === 'vertical'
                               ? { left: '32px', top: regionsData[1].maxY, transform: 'translateY(-50%)' }
                               : { top: '32px', left:
<truncated 7322 bytes>

NOTE: The output was truncated because it was too long. Use a more targeted query or a smaller range to get the information you need.