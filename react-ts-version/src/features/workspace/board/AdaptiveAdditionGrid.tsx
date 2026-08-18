import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { X, Sparkles } from 'lucide-react';

interface AdaptiveAdditionGridProps {
  onSelection?: (sum: number) => void;
  onClose?: () => void;
}

/**
 * AdaptiveAdditionGrid (Module 10: Adaptive Addition Support Grid)
 * Appears dynamically after 30s cognitive hesitation as an intermediate pedagogical scaffold.
 * Features dual-axis (row/column) coordinate illumination and exact intersection sum calculation.
 */
export function AdaptiveAdditionGrid({ onSelection, onClose }: AdaptiveAdditionGridProps) {
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [activeCol, setActiveCol] = useState<number | null>(null);

  const closeAdditionHelper = useWorkspaceStore((s) => s.closeAdditionHelper);

  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  const handleCellClick = (row: number, col: number) => {
    if (activeRow === null) {
      setActiveRow(row);
    } else if (activeRow === row && activeCol === null) {
      setActiveCol(col);
      if (onSelection) onSelection(row + col);
    } else {
      setActiveRow(row);
      setActiveCol(col);
      if (onSelection) onSelection(row + col);
    }
  };

  const handleRowHeaderClick = (row: number) => {
    setActiveRow(row);
    setActiveCol(null);
  };

  const handleColHeaderClick = (col: number) => {
    if (activeRow !== null) {
      setActiveCol(col);
      if (onSelection) onSelection(activeRow + col);
    } else {
      setActiveCol(col);
      setActiveRow(null);
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
    else closeAdditionHelper();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 16 }}
        transition={{ duration: 0.3 }}
        dir="rtl"
        className="bg-white dark:bg-slate-900 border-2 border-amber-300 dark:border-amber-700/60 rounded-3xl p-5 shadow-2xl max-w-md w-full select-none"
        role="dialog"
        aria-label="לוח עזר אדפטיבי לחיבור"
      >
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <h3 className="font-display font-extrabold text-lg text-slate-800 dark:text-slate-100">
              לוח עזר לחיבור (תמיכה אדפטיבית)
            </h3>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
            aria-label="סגור לוח עזר"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {activeRow !== null && activeCol !== null ? (
          <div className="mb-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60 rounded-xl p-2 text-center text-amber-700 dark:text-amber-300 font-display font-black text-lg animate-pulse">
            {activeRow} + {activeCol} = {activeRow + activeCol}
          </div>
        ) : (
          <div className="mb-3 text-xs text-slate-500 dark:text-slate-400 font-medium text-center">
            {activeRow === null ? 'לחצו על מספר שורה כדי להתחיל' : 'כעת בחרו מספר עמודה כדי לראות את החיבור'}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center table-fixed text-xs font-bold select-none">
            <thead>
              <tr>
                <th className="border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 p-1 w-8 h-8 rounded-tr-lg">
                  +
                </th>
                {digits.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleColHeaderClick(col)}
                    className={`border border-slate-200 dark:border-slate-800 p-1 w-8 h-8 transition-colors cursor-pointer ${
                      activeCol === col
                        ? 'bg-amber-500 text-white font-black'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {digits.map((row) => (
                <tr key={row}>
                  <td
                    onClick={() => handleRowHeaderClick(row)}
                    className={`border border-slate-200 dark:border-slate-800 p-1 w-8 h-8 font-extrabold transition-colors cursor-pointer ${
                      activeRow === row
                        ? 'bg-amber-500 text-white font-black'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {row}
                  </td>
                  {digits.map((col) => {
                    const sum = row + col;
                    const isIntersection = activeRow === row && activeCol === col;
                    const isInActiveRow = activeRow === row;
                    const isInActiveCol = activeCol === col;
                    const isInActiveLine = isInActiveRow || isInActiveCol;

                    return (
                      <td
                        key={col}
                        onClick={() => handleCellClick(row, col)}
                        className={`border border-slate-200 dark:border-slate-800 p-1 w-8 h-8 cursor-pointer transition-all duration-200 tabular-nums ${
                          isIntersection
                            ? 'bg-orange-500 text-white font-black scale-110 shadow-lg z-10'
                            : isInActiveLine
                            ? 'bg-amber-100/70 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-extrabold'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 opacity-60 hover:opacity-100'
                        }`}
                      >
                        {sum}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default AdaptiveAdditionGrid;
