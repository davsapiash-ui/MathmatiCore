import { useState } from 'react';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { GRID_FADE_IN_SECONDS } from '@/core/hesitationStages';
import { X, Sparkles, Grid3x3 } from 'lucide-react';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

/** The grid's one name on the child's screen (register decision ט: one name per component). */
export const ADDITION_GRID_HE = 'לוח החיבור';

/** The grid's instruction lines: before a row is chosen, and before a column is. */
export const GRID_PICK_ROW_HE = 'לחצו על מספר שורה כדי להתחיל.';
export const GRID_PICK_COL_HE = 'עכשיו בחרו מספר עמודה כדי לראות את החיבור.';

/**
 * Where the grid lives: a slot of its own in the workspace row, between בית
 * המספרים and the coaching card (the row is RTL: sheet | board | grid | card).
 * The board and the sheet ease aside to make room, as they do for the
 * coaching card, so the grid covers nothing.
 *
 * PRD Module 10 §א–ב: the grid is support during the learner's own work, and
 * that work goes on while it is open — the timer resets on "גרירת לבנים,
 * הקלדה, המרה". So the columns, the block tray, the trash and the result row
 * all stay visible and usable beside it. Until 4.10.2026 it floated over the
 * board's bottom-left corner and, on 585–729px-high screens, covered three
 * columns, the tray and the trash (audit A5-F07 / UX-002).
 */
export const GRID_SLOT_WIDTH = 'w-[clamp(264px,23vw,360px)]';

interface AdaptiveAdditionGridProps {
  onSelection?: (sum: number) => void;
  onClose?: () => void;
  className?: string;
  /** The coaching card is open: the grid waits out of sight, still mounted,
   *  so its chosen row and column — and its finished fade-in — are kept. */
  hidden?: boolean;
}

/**
 * AdaptiveAdditionGrid (Module 10: Adaptive Addition Support Grid)
 * Appears after 30s cognitive hesitation as an intermediate pedagogical scaffold,
 * for enhanced_cognitive_support learners only (the gate is in the radar hook).
 * Features dual-axis (row/column) coordinate illumination and exact intersection sum calculation.
 *
 * Owner decision (7.9.2026, register decision ב): a soft fade-in of 2 seconds,
 * and the board stays until the learner closes it with the X. Nothing closes
 * it automatically. The exit animation runs under the page's AnimatePresence,
 * so this component must be mounted inside one.
 */
export function AdaptiveAdditionGrid({ onSelection, onClose, className = '', hidden = false }: AdaptiveAdditionGridProps) {
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
  // The grid fades in over two seconds. While it is still transparent it
  // must not catch the learner's clicks.
  const [visible, setVisible] = useState(false);
  // PRD Module 7 §א / Module 24: every instruction on the child's screen has
  // its read-aloud button, read on the child's click only.
  const instruction = activeRow === null ? GRID_PICK_ROW_HE : GRID_PICK_COL_HE;
  // Each row follows the screen's height, so the whole grid fits the row
  // down to a 585px-high window, with nothing scrolled or cut.
  const cell = 'border border-slate-200 dark:border-slate-800 p-0 h-[clamp(24px,4.4vh,34px)]';

  return (
    // The slot opens to its width at once, so the board and the sheet ease
    // aside, while the grid itself fades in over two seconds.
    <motion.div
      key="adaptive-grid"
      initial={{ opacity: 0, maxWidth: 0 }}
      animate={{ opacity: 1, maxWidth: 400 }}
      exit={{ opacity: 0, maxWidth: 0, pointerEvents: 'none', transition: { duration: 0.6, ease: 'easeInOut' } }}
      transition={{ duration: GRID_FADE_IN_SECONDS, ease: 'easeInOut', maxWidth: { duration: 0.25, ease: 'easeOut' } }}
      onAnimationComplete={() => setVisible(true)}
      dir="rtl"
      data-hidden={hidden ? 'true' : undefined}
      className={`${hidden ? 'hidden ' : ''}${visible ? 'pointer-events-auto' : 'pointer-events-none'} shrink-0 self-start max-h-full min-h-0 overflow-hidden ${GRID_SLOT_WIDTH} ${className}`}
      role="dialog"
      aria-label={ADDITION_GRID_HE}
      data-testid="adaptive-addition-grid"
    >
      <div className={`${GRID_SLOT_WIDTH} bg-white dark:bg-slate-900 border-2 border-amber-300 dark:border-amber-700/60 rounded-3xl p-3 shadow-lg select-none`}>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </span>
            <h3 className="font-display font-extrabold text-lg text-slate-800 dark:text-slate-100">
              {ADDITION_GRID_HE}
            </h3>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-11 h-11 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
            aria-label={`סגירת ${ADDITION_GRID_HE}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {activeRow !== null && activeCol !== null ? (
          <div className="mb-2 min-h-11 flex items-center justify-center bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60 rounded-xl px-2 text-center text-amber-700 dark:text-amber-300 font-display font-black text-lg animate-pulse" dir="ltr">
            {activeRow} + {activeCol} = {activeRow + activeCol}
          </div>
        ) : (
          <div className="mb-2 min-h-11 flex items-center gap-2" data-testid="addition-grid-instruction">
            {/* Not rendered while the grid is hidden: unmounting the button
                stops its own read-aloud, so nothing is read from a grid the
                learner cannot see. */}
            {!hidden && <UdlSpeechButton text={instruction} className="shrink-0" />}
            <p className="text-sm leading-snug text-slate-600 dark:text-slate-300 font-medium">{instruction}</p>
          </div>
        )}

        <table className="w-full border-collapse text-center table-fixed text-sm font-bold select-none">
          <thead>
            <tr>
              <th className={`${cell} bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-tr-lg`}>
                +
              </th>
              {digits.map((col) => (
                <th
                  key={col}
                  onClick={() => handleColHeaderClick(col)}
                  className={`${cell} transition-colors cursor-pointer ${
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
                  className={`${cell} font-extrabold transition-colors cursor-pointer ${
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
                      className={`${cell} cursor-pointer transition-all duration-200 tabular-nums ${
                        isIntersection
                          ? 'bg-orange-500 text-white font-black shadow-lg'
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
  );
}

/**
 * Register deviation 18 (מסמך 03 §1.3 ב' / 04 §1): a learner may bring back
 * the grid after closing it. The tab sits where the grid itself appears — in
 * the grid's slot of the row, beside the board — never in the topbar (מסמך 04
 * §3א: "כפתורי ניווט בסיסיים ושקטים") and never over the tray or the trash
 * (audit UX-001: pinned to the screen's corner, it sat on the trash).
 */
export function AdditionGridTab() {
  const openAdditionHelper = useWorkspaceStore((s) => s.openAdditionHelper);
  return (
    <div className="shrink-0 self-start w-16" data-testid="addition-grid-tab-slot">
      <button
        type="button"
        onClick={() => openAdditionHelper('learner')}
        className="w-16 min-h-[72px] px-1 py-2 rounded-2xl text-sm font-bold leading-tight transition-all cursor-pointer flex flex-col items-center justify-center gap-1 border shadow-md active:scale-95 bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-700/60 dark:text-amber-200"
        aria-label={`הצגה חוזרת של ${ADDITION_GRID_HE}`}
        title={`החזרת ${ADDITION_GRID_HE} למסך`}
      >
        <Grid3x3 className="w-5 h-5" aria-hidden="true" />
        <span className="text-center">{ADDITION_GRID_HE}</span>
      </button>
    </div>
  );
}

export default AdaptiveAdditionGrid;
