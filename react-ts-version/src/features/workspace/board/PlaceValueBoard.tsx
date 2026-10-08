import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PLACE_ORDER, type Place } from '@/core/placeValue';
import { useWorkspaceStore, selectScaffoldLevel, selectBoardOpen } from '@/application/useWorkspaceStore';
import { PlaceColumn } from './PlaceColumn';
import { BlockPalette } from './BlockPalette';
import { RegroupAnimationLayer } from './RegroupAnimationLayer';
import { BOARD_ZONE_FLEX } from '../workspaceZones';

/** Width below which the full tray no longer fits on one row (measured: 708px). */
export const TRAY_FULL_WIDTH_PX = 720;

/**
 * טבלת ערך המקום ("בית המספרים") — the mathematical place-value structure.
 * Column order in RTL: units rightmost → thousands leftmost (standard Hebrew notation).
 *
 * PRD Module 7 §א ("חלוקת מסך הלומד"): the representations zone — this board
 * and its blocks — takes 60% of the width under the top bar, on the visual
 * left; the task-and-response zone takes the other 40% (StudentWorkspacePage).
 * The coaching card's drawer opens inside the task zone (Module 12 §ב), so the
 * board keeps its 60% whether the card is open or not. Collapsible via the
 * topbar toggle; then the task zone takes the row.
 */

export function PlaceValueBoard({
  fullWidth = false,
  activeDragPlace = null,
  inZone = false,
}: {
  fullWidth?: boolean;
  activeDragPlace?: Place | null;
  /** Inside the representations zone (StudentWorkspacePage), which holds the 60%: the board fills what the zone leaves it. */
  inZone?: boolean;
}) {
  // Station 1 keeps the board open whatever the store says (selectBoardOpen).
  const boardOpen = useWorkspaceStore(selectBoardOpen);
  const scaffoldLevel = useWorkspaceStore(selectScaffoldLevel);
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const isBoardLocked = useWorkspaceStore((s) => s.isBoardLocked);
  const [showSession8Priming, setShowSession8Priming] = useState(true);
  const columnsRef = useRef<HTMLDivElement | null>(null);

  // The tray's full form (title, divider, four blocks, trash) needs about 710px.
  // Measured, not assumed: the tray goes compact whenever the board is too
  // narrow for it (its RTL row would cut off its far, left, end — the trash).
  const [narrow, setNarrow] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < TRAY_FULL_WIDTH_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, [boardOpen, sessionNumber]);

  const { setNodeRef: setBoardRef } = useDroppable({
    id: 'place-value-board-dropzone',
    data: { kind: 'board' },
  });

  useEffect(() => {
    if (sessionNumber === 8) {
      const timer = setTimeout(() => setShowSession8Priming(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [sessionNumber]);

  if (sessionNumber === 8 && !showSession8Priming) {
    return null;
  }

  if (sessionNumber === 8 && showSession8Priming) {
    return (
      <AnimatePresence>
        <motion.section
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center h-full w-full bg-ws-surface rounded-3xl border-2 border-ws-accent/30 shadow-xl p-8"
          style={{ flex: fullWidth ? '1 1 100%' : BOARD_ZONE_FLEX }}
        >
          <div className="text-5xl mb-4">📐</div>
          <h2 className="text-2xl font-bold text-ws-ink text-center">
            מעבר לחשיבה מתמטית מופשטת!
          </h2>
        </motion.section>
      </AnimatePresence>
    );
  }

  // Hide thousands in sessions 1 and 2 (pedagogical progression)
  const placesToRender = sessionNumber <= 2 
    ? PLACE_ORDER.filter(p => p !== 'thousands')
    : PLACE_ORDER;

  return (
    <AnimatePresence initial={false}>
      {boardOpen && (
        <motion.section
          key="place-value-board"
          ref={sectionRef}
          initial={{ opacity: 0, flex: '0 0 0%' }}
          animate={{
            opacity: 1,
            flex: fullWidth ? '1 1 100%' : inZone ? '1 1 0%' : BOARD_ZONE_FLEX,
          }}
          exit={{ opacity: 0, flex: '0 0 0%' }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="flex flex-col gap-3 overflow-hidden h-full max-h-full min-w-0 w-full"
          aria-label="בית המספרים"
        >
          <div
            id="tour-place-value-board"
            ref={setBoardRef}
            className="flex-1 ws-card p-4 flex flex-col gap-3 hover:translate-y-0 select-none min-h-0 overflow-hidden"
          >
            <div className="flex items-center justify-center shrink-0">
              <span className="inline-flex items-center gap-2 text-lg font-display font-black text-ws-ink bg-ws-blue-soft/50 rounded-full px-6 py-1.5 border-2 border-ws-blue/20 shadow-sm select-none">
                <span aria-hidden="true" className="text-xl">🏠</span> בית המספרים
              </span>
            </div>

            {/* Board locked indicator */}
            {isBoardLocked && (
              <div 
                role="status"
                aria-live="polite"
                className="bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs shrink-0 animate-in fade-in"
              >
                <span aria-hidden="true">🔒</span>
                <span>בית המספרים נעול זמנית על ידי המורה</span>
              </div>
            )}

            {/* Place-value columns with permanent clear solid borders */}
            <div ref={columnsRef} dir="rtl" className="relative flex-1 flex flex-row gap-2 min-h-0 select-none" role="group" aria-label="טורי ערך המקום">
              {placesToRender.map((place) => (
                <PlaceColumn
                  key={place}
                  place={place}
                  activeDragPlace={activeDragPlace}
                  // Module 8 §א: the ten merge "בטור הסמוך משמאל" — only where
                  // that column is on the board. In stations 1–2 there is no
                  // thousands column, and "קבצו 10 לאלף" made ten hundreds vanish.
                  canGroup={placesToRender.includes(PLACE_ORDER[PLACE_ORDER.indexOf(place) + 1])}
                />
              ))}
              {/* מסמך 03 §3.3–3.5: grouping merges and travels left, decomposition
                  breaks apart and travels right. Drawn over the columns, never in
                  the way of a click or a drop. */}
              <RegroupAnimationLayer containerRef={columnsRef} />
            </div>

            {/* No running sum ("בניתי את X") under the columns, in any meeting:
                it is in no document. The owner removed it in meetings 3, 4
                and 7, then in 5 and 6 (28.9.2026; register, decision ו);
                meeting 1 never showed it. */}
          </div>

          <div className="transition-opacity">
            <BlockPalette scaffoldLevel={scaffoldLevel} compact={narrow} />
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
