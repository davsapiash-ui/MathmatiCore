import { FileDown } from 'lucide-react';

/**
 * The teacher's demonstration guide download (PRD Module 15 §ג): a placeholder
 * only. The button exists so the place is fixed; it is disabled, downloads
 * nothing, opens nothing and records nothing, and the guide itself is not
 * published. It is switched on in a later stage, when the owner decides to
 * publish the guide. (Teacher screens have no narration: no speech button.)
 */
export const TEACHER_GUIDE_LABEL_HE = 'הורדת מדריך ההדגמה';
export const TEACHER_GUIDE_SOON_HE = 'יופעל בהמשך';

export function TeacherGuideDownloadButton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      data-testid="teacher-guide-download"
      title={`${TEACHER_GUIDE_LABEL_HE} — ${TEACHER_GUIDE_SOON_HE}`}
      className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-600 border border-slate-300 px-4 py-2.5 min-h-11 rounded-xl text-sm font-bold cursor-not-allowed dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600"
    >
      <FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className={`flex flex-col items-center leading-tight ${collapsed ? 'md:sr-only' : ''}`}>
        <span>{TEACHER_GUIDE_LABEL_HE}</span>
        <span className="text-[11px] font-semibold">{TEACHER_GUIDE_SOON_HE}</span>
      </span>
    </button>
  );
}
