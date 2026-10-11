import { Eye } from 'lucide-react';
import { READ_ONLY_BANNER_TEXT, useIsReadOnlyStaff } from '@/application/useIsReadOnlyStaff';

/**
 * The calm line at the top of the teacher dashboard and the admin console for
 * a read-only staff sign-in (owner decision 11.10.2026). Nothing for anyone else.
 */
export function ReadOnlyBanner() {
  const readOnly = useIsReadOnlyStaff();
  if (!readOnly) return null;
  return (
    <div
      role="status"
      data-testid="read-only-banner"
      dir="rtl"
      className="w-full bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm font-bold px-4 py-2.5 flex items-center gap-2"
    >
      <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{READ_ONLY_BANNER_TEXT}</span>
    </div>
  );
}

export default ReadOnlyBanner;
