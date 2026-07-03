import { motion } from 'framer-motion';
import { useWorkspaceStore, selectBoardValue } from '@/application/useWorkspaceStore';

/**
 * תצוגת הערך החי — the CRA bridge between the concrete blocks and the abstract number.
 * he-IL formatting + pulse on every change (vanilla updateValueDisplay).
 * Hidden for estimation tasks (session-2 number line) by the parent.
 */
export function ValueDisplay() {
  const value = useWorkspaceStore(selectBoardValue);

  return (
    <div className="text-center min-h-[3rem]" aria-live="polite" aria-label="ערך כולל">
      {value > 0 && (
        <motion.span
          key={value}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="inline-flex items-baseline gap-2 bg-ws-accentSoft border border-ws-accent/30 rounded-full px-6 py-1.5 shadow-[0_4px_12px_-4px_hsl(var(--ws-accent)/0.4)]"
        >
          <span className="text-sm font-bold text-ws-accent/80">בניתי את</span>
          <span className="font-display font-black text-3xl text-ws-accent tabular-nums">{value.toLocaleString('he-IL')}</span>
        </motion.span>
      )}
    </div>
  );
}
