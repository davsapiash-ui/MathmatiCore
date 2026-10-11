/**
 * A live number on a teacher screen (owner, 11.10.2026): when it changes, the
 * new value slides in once (~200ms) — never a loop, and nothing at all for a
 * viewer who asked for reduced motion (framer-motion's MotionConfig "user" on
 * the dashboard, and useReducedMotion here). The old value leaves at once, so
 * the number on screen is always exactly one value.
 */
import type { ReactElement } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export function AnimatedNumber({ value, className, testId }: { value: number; className?: string; testId?: string }): ReactElement {
  const reduce = useReducedMotion();
  if (reduce) return <span data-testid={testId} className={`tabular-nums ${className ?? ''}`}>{value}</span>;
  return (
    <span data-testid={testId} className={`inline-flex overflow-hidden tabular-nums ${className ?? ''}`}>
      <motion.span
        key={value}
        initial={{ y: '60%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {value}
      </motion.span>
    </span>
  );
}
