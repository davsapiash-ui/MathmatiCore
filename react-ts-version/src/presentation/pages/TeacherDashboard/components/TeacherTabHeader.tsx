/**
 * One heading for every teacher tab (owner decision 11.10.2026): one title line
 * and at most one sentence, the same size, spacing and colours on every tab —
 * no hero banner, so the tab's content starts high on a 1366×768 screen. An
 * optional element (a count, a chip) sits at the end of the title line.
 */
import type { ComponentType, ReactElement, ReactNode } from 'react';

export function TeacherTabHeader({
  title,
  sentence,
  icon: Icon,
  aside,
}: {
  title: string;
  sentence?: string;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  aside?: ReactNode;
}): ReactElement {
  return (
    <header data-testid="teacher-tab-header" className="mb-[clamp(16px,1.5vw,32px)] flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <h1 className="text-xl leading-tight font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-violet-700 dark:text-violet-300 shrink-0" aria-hidden="true" />}
          {title}
        </h1>
        {sentence && <p className="text-sm leading-normal text-slate-600 dark:text-slate-300 mt-1">{sentence}</p>}
      </div>
      {aside}
    </header>
  );
}
