import { useDroppable } from '@dnd-kit/core';
import { motion } from 'framer-motion';

/** פח מחיקה — animated trash bin with opening and closing lid on drag hover */
export function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash', data: { kind: 'trash' } });

  return (
    <div className="relative group shrink-0">
      <div
        ref={setNodeRef}
        role="region"
        aria-label="פח אשפה — גרור לכאן לבנה מבית המספרים למחיקה"
        className={`flex flex-col items-center justify-between rounded-2xl px-3 pt-2 pb-1.5 min-w-[80px] transition-all duration-200 select-none ${
          isOver 
            ? 'scale-105 bg-red-50 text-red-600 border-2 border-dashed border-red-500 shadow-md ring-2 ring-red-200' 
            : 'bg-ws-bg/80 text-ws-soft border border-ws-surface2 hover:border-red-300 hover:text-red-500 hover:bg-red-50/40'
        }`}
      >
        <div className="h-12 flex items-center justify-center relative">
          <svg
            viewBox="0 0 36 40"
            className={`w-9 h-10 overflow-visible transition-all duration-200 ${
              isOver ? 'text-red-600 drop-shadow-[0_4px_8px_rgba(220,38,38,0.4)]' : 'text-slate-500 group-hover:text-red-500'
            }`}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Trash interior depth (visible when lid opens) */}
            <ellipse
              cx="18"
              cy="16"
              rx="8.5"
              ry="2.5"
              className={isOver ? 'fill-red-900/60' : 'fill-slate-700/40'}
              stroke="none"
            />

            {/* Trash Body */}
            <path
              d="M9 16.5 L11.2 33.5 C11.5 35.5 13.2 37 15.2 37 L20.8 37 C22.8 37 24.5 35.5 24.8 33.5 L27 16.5 Z"
              strokeWidth="2.2"
              className={isOver ? 'fill-red-100/80 stroke-red-600' : 'fill-slate-100 group-hover:fill-red-50/60 stroke-current'}
            />

            {/* Vertical Flutes on Bin Body */}
            <line x1="15" y1="21" x2="15.5" y2="32.5" strokeWidth="1.8" stroke="currentColor" opacity="0.65" />
            <line x1="18" y1="21" x2="18" y2="32.5" strokeWidth="1.8" stroke="currentColor" opacity="0.65" />
            <line x1="21" y1="21" x2="20.5" y2="32.5" strokeWidth="1.8" stroke="currentColor" opacity="0.65" />

            {/* Rim Collar */}
            <rect
              x="7.5"
              y="14.5"
              width="21"
              height="3"
              rx="1.5"
              strokeWidth="2"
              className={isOver ? 'fill-red-200 stroke-red-600' : 'fill-slate-200 group-hover:fill-red-100 stroke-current'}
            />

            {/* Animated Lid + Handle (Hinged on the right in RTL / left in geometry) */}
            <motion.g
              animate={{
                rotate: isOver ? -48 : 0,
                x: isOver ? -2.5 : 0,
                y: isOver ? -4 : 0,
              }}
              transition={{
                type: 'spring',
                stiffness: 420,
                damping: 18,
                mass: 0.8,
              }}
              style={{
                transformOrigin: '7.5px 15.5px',
              }}
            >
              {/* Handle */}
              <path
                d="M15 11.5 C15 9.5 16.3 8 18 8 C19.7 8 21 9.5 21 11.5"
                strokeWidth="2.2"
                stroke="currentColor"
                fill="none"
              />
              {/* Lid Plate */}
              <path
                d="M6 14.5 C6 13.2 7.2 12.2 8.5 12.2 L27.5 12.2 C28.8 12.2 30 13.2 30 14.5 L30 15.5 L6 15.5 Z"
                strokeWidth="2.2"
                className={isOver ? 'fill-red-200 stroke-red-600' : 'fill-slate-200 group-hover:fill-red-100 stroke-current'}
              />
            </motion.g>
          </svg>
        </div>
        <span className={`text-[11px] font-black transition-colors ${isOver ? 'text-red-600 font-extrabold' : 'text-ws-soft group-hover:text-red-500'}`}>
          פח מחיקה
        </span>
      </div>

      {/* Norman Principle: Explanatory Hover Tooltip */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-36 p-1.5 bg-slate-900/95 text-white text-[10px] text-center font-bold rounded-xl shadow-lg backdrop-blur-md border border-white/10 whitespace-nowrap">
        <span>🗑️ גרור לכאן כדי למחוק</span>
      </div>
    </div>
  );
}
