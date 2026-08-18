import { useDroppable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/**
 * פח מחיקה ואיפוס — אזור השלכה ייעודי (Drop Zone) ואיפוס בלחיצה לפי סעיף 6 ב-PRD.
 * מעוצב ככלי פיזי עם מכסה מונפש הנפתח בעת גרירה מעליו.
 */
export function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash', data: { kind: 'trash' } });

  const handleClick = () => {
    useWorkspaceStore.getState().clearBoard();
  };

  return (
    <div className="relative group shrink-0 flex items-center">
      {/* Drop Zone Receptacle — NO button box, pure organic drop area */}
      <div
        ref={setNodeRef}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        aria-label="פח אשפה — גררו לכאן לבנים למחיקה או לחצו לניקוי הלוח"
        className={`relative flex flex-col items-center justify-center px-3.5 py-1.5 rounded-2xl transition-all duration-200 select-none cursor-pointer active:scale-95 ${
          isOver
            ? 'bg-red-100/90 scale-110 shadow-[0_0_24px_rgba(239,68,68,0.4)] ring-2 ring-red-400 ring-offset-2'
            : 'hover:bg-red-50/60'
        }`}
      >
        {/* Subtle drop target floor ring */}
        <div
          className={`absolute bottom-4 w-10 h-2.5 rounded-full transition-all duration-200 -z-0 ${
            isOver ? 'bg-red-300/70 scale-125 blur-[1px]' : 'bg-slate-200/50 group-hover:bg-red-200/50'
          }`}
        />

        <div className="h-10 w-10 flex items-center justify-center relative z-10">
          <svg
            viewBox="0 0 36 40"
            className={`w-8 h-9 overflow-visible transition-all duration-200 ${
              isOver
                ? 'text-red-600 drop-shadow-[0_6px_12px_rgba(220,38,38,0.45)]'
                : 'text-slate-400 group-hover:text-red-500'
            }`}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Dark inner cavity (revealed when lid opens) */}
            <ellipse
              cx="18"
              cy="16"
              rx="8.5"
              ry="2.5"
              className={isOver ? 'fill-red-950/70' : 'fill-slate-700/30'}
              stroke="none"
            />

            {/* Bin Body */}
            <path
              d="M9 16.5 L11.2 33.5 C11.5 35.5 13.2 37 15.2 37 L20.8 37 C22.8 37 24.5 35.5 24.8 33.5 L27 16.5 Z"
              strokeWidth="2.2"
              className={
                isOver
                  ? 'fill-red-100 stroke-red-600'
                  : 'fill-slate-100/90 group-hover:fill-red-50 stroke-current'
              }
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
              className={
                isOver
                  ? 'fill-red-200 stroke-red-600'
                  : 'fill-slate-200 group-hover:fill-red-100 stroke-current'
              }
            />

            {/* Animated Lid + Handle (Hinged at top-left) */}
            <motion.g
              animate={{
                rotate: isOver ? -52 : 0,
                x: isOver ? -3 : 0,
                y: isOver ? -5 : 0,
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
                className={
                  isOver
                    ? 'fill-red-200 stroke-red-600'
                    : 'fill-slate-200 group-hover:fill-red-100 stroke-current'
                }
              />
            </motion.g>
          </svg>
        </div>

        <span
          className={`text-[10px] font-bold tracking-tight transition-colors duration-200 mt-0.5 ${
            isOver ? 'text-red-600 font-black' : 'text-slate-400 group-hover:text-red-500'
          }`}
        >
          {isOver ? 'שחררו למחיקה' : 'פח אשפה'}
        </span>
      </div>

      {/* Tooltip on Hover */}
      <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 p-1.5 px-3 bg-slate-900/95 text-white text-[10px] text-center font-bold rounded-xl shadow-lg backdrop-blur-md border border-white/10 whitespace-nowrap">
        <span>🗑️ גררו לכאן לבנים למחיקה / לחצו לניקוי הלוח</span>
      </div>
    </div>
  );
}
