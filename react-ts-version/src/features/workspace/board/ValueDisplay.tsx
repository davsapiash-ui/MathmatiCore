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
    <div className="text-center min-h-[2.2rem]" aria-live="polite" aria-label="ערך כולל">
      {value > 0 && (
        <motion.span
          key={value}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="inline-block font-display font-black text-3xl text-ws-accent tabular-nums"
        >
          {value.toLocaleString('he-IL')}
        </motion.span>
      )}
    </div>
  );
}
