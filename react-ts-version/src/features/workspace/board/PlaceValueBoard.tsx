import { AnimatePresence, motion } from 'framer-motion';
import { PLACE_ORDER } from '@/core/placeValue';
import { useWorkspaceStore, selectScaffoldLevel } from '@/application/useWorkspaceStore';
import { PlaceColumn } from './PlaceColumn';
import { ValueDisplay } from './ValueDisplay';
import { BlockPalette } from './BlockPalette';

/**
 * טבלת ערך המקום ("בית המספרים") — the mathematical place-value structure.
 * Column order in RTL: units rightmost → thousands leftmost (standard Hebrew notation).
 * 50% of the workspace when open; collapsible via the topbar toggle.
 */
export function PlaceValueBoard({ hideValueDisplay }: { hideValueDisplay?: boolean }) {
  const boardOpen = useWorkspaceStore((s) => s.boardOpen);
  const scaffoldFadeLevel = useWorkspaceStore((s) => s.scaffoldFadeLevel);
  const scaffoldLevel = useWorkspaceStore(selectScaffoldLevel);
  const restoreScaffolds = useWorkspaceStore((s) => s.restoreScaffolds);

  const placesToRender = PLACE_ORDER;

  return (
    <AnimatePresence initial={false}>
      {boardOpen && (
        <motion.section
          initial={{ flexBasis: 0, opacity: 0 }}
          animate={{ flexBasis: '50%', opacity: 1 }}
          exit={{ flexBasis: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="flex flex-col gap-3 overflow-visible h-full"
          style={{ flexGrow: 0, flexShrink: 0 }}
          aria-label="טבלת ערך המקום"
        >
          <div id="tour-place-value-board" className="flex-1 ws-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-2 text-lg font-display font-black text-ws-ink bg-ws-blue-soft/50 rounded-full px-6 py-1.5 border-2 border-ws-blue/20 shadow-sm">
                <span aria-hidden="true" className="text-xl">🏠</span> בית המספרים
              </span>
              {/* "החזרת עזרים" — spec-mandated bidirectional scaffold fading (appears only when faded) */}
              {scaffoldFadeLevel > 0 && (
                <button
                  onClick={restoreScaffolds}
                  className="inline-flex items-center gap-1 text-xs font-bold rounded-full px-3 py-1 border transition-all hover:scale-105 active:scale-95"
                  style={{
                    color: 'hsl(var(--ws-blue))',
                    borderColor: 'hsl(var(--ws-blue) / 0.4)',
                    backgroundColor: 'hsl(var(--ws-blue-soft) / 0.6)',
                  }}
                  aria-label="הדגשת קווי עזר — הצג שוב את הקוביות בבירור"
                >
                  <span aria-hidden="true">👁</span> הדגש קווי עזר
                </button>
              )}
            </div>

            {/* Scaffold fade applies to the columns only — the palette stays crisp */}
            <div dir="rtl" className={`flex-1 flex flex-row gap-2 min-h-0 scaffold-level-${scaffoldFadeLevel}`} role="group" aria-label="טורי ערך המקום">
              {placesToRender.map((place) => (
                <PlaceColumn key={place} place={place} />
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
