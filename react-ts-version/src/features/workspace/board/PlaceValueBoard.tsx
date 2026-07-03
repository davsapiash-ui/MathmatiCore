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

  return (
    <AnimatePresence initial={false}>
      {boardOpen && (
        <motion.section
          initial={{ flexBasis: 0, opacity: 0 }}
          animate={{ flexBasis: '50%', opacity: 1 }}
          exit={{ flexBasis: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="flex flex-col gap-3 overflow-hidden"
          style={{ flexGrow: 0, flexShrink: 0 }}
          aria-label="טבלת ערך המקום"
        >
          <div className="flex-1 ws-card p-4 flex flex-col gap-3 overflow-hidden">
            <p className="text-center shrink-0">
              <span className="inline-flex items-center gap-1.5 text-sm font-display font-extrabold text-ws-soft bg-ws-bg rounded-full px-4 py-1 border border-ws-surface2">
                <span aria-hidden="true">🏠</span> בית המספרים
              </span>
            </p>

            {/* Scaffold fade applies to the columns only — the palette stays crisp */}
            <div dir="rtl" className={`flex-1 flex flex-row gap-2 min-h-0 scaffold-level-${scaffoldFadeLevel}`} role="group" aria-label="טורי ערך המקום">
              {PLACE_ORDER.map((place) => (
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
