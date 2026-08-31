import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { PLACE_ORDER, type Place } from '@/core/placeValue';
import { useWorkspaceStore, selectScaffoldLevel } from '@/application/useWorkspaceStore';
import { PlaceColumn } from './PlaceColumn';
import { ValueDisplay } from './ValueDisplay';
import { BlockPalette } from './BlockPalette';

/**
 * טבלת ערך המקום ("בית המספרים") — the mathematical place-value structure.
 * Column order in RTL: units rightmost → thousands leftmost (standard Hebrew notation).
 * 50% of the workspace when open; collapsible via the topbar toggle.
 */
export function PlaceValueBoard({
  hideValueDisplay,
  fullWidth = false,
  activeDragPlace = null,
}: {
  hideValueDisplay?: boolean;
  fullWidth?: boolean;
  activeDragPlace?: Place | null;
}) {
  const boardOpen = useWorkspaceStore((s) => s.boardOpen);
  const scaffoldFadeLevel = useWorkspaceStore((s) => s.scaffoldFadeLevel);
  const scaffoldLevel = useWorkspaceStore(selectScaffoldLevel);
  const restoreScaffolds = useWorkspaceStore((s) => s.restoreScaffolds);
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const [showSession8Priming, setShowSession8Priming] = useState(true);

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
          style={{ flexBasis: fullWidth ? '100%' : '50%' }}
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
          initial={{ opacity: 0, width: 0, flex: '0 0 0%' }}
          animate={{ 
            opacity: 1, 
            width: fullWidth ? '100%' : '50%', 
            flex: fullWidth ? '1 1 100%' : '0 0 50%' 
          }}
          exit={{ opacity: 0, width: 0, flex: '0 0 0%' }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="flex flex-col gap-3 overflow-hidden h-full max-h-full min-w-0 w-full"
          aria-label="טבלת ערך המקום"
        >
          <div id="tour-place-value-board" className="flex-1 ws-card p-4 flex flex-col gap-3 hover:translate-y-0 select-none min-h-0 overflow-hidden">
            <div className="flex items-center justify-center shrink-0">
              <span className="inline-flex items-center gap-2 text-lg font-display font-black text-ws-ink bg-ws-blue-soft/50 rounded-full px-6 py-1.5 border-2 border-ws-blue/20 shadow-sm select-none">
                <span aria-hidden="true" className="text-xl">🏠</span> בית המספרים
              </span>
            </div>

            {/* Place-value columns with permanent clear solid borders */}
            <div dir="rtl" className="flex-1 flex flex-row gap-2 min-h-0 select-none" role="group" aria-label="טורי ערך המקום">
              {placesToRender.map((place) => (
                <PlaceColumn key={place} place={place} activeDragPlace={activeDragPlace} />
              ))}
            </div>

            {!hideValueDisplay && <ValueDisplay />}
          </div>

          <BlockPalette scaffoldLevel={scaffoldLevel} />
        </motion.section>
      )}
    </AnimatePresence>
  );
}
