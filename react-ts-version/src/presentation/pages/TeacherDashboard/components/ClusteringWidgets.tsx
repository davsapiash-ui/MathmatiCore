import { type StudentData } from '@/application/useStore';
import {
  CONCEPT_LABELS_HE,
  computeRegroupingDomain,
  isRegroupingBelow,
  type DiagnosticDomain,
} from '@/core/QMatrix';

interface Props {
  students: StudentData[];
  onFilterChange: (filter: string | null) => void;
  activeFilter: string | null;
}

/**
 * The three domains meeting 2 diagnoses, in document 03's words (§"מפגש
 * שתיים", מטרה פדגוגית): "המבנה העשרוני והאפס, הקבצה ופריטה, וחישוב במאונך".
 * Owner's decision 26.9.2026 — the six-skill list a former agent invented is
 * gone from the teacher screen; three of those six were measured by no task
 * and always read as full mastery. Each domain is a filter, and each must
 * have a group card in TeacherDashboard.tsx — a test holds the two together.
 */
export const CLUSTER_WIDGETS: readonly {
  key: DiagnosticDomain;
  label: string;
  strugglingLabel: string;
  color: string;
}[] = [
  {
    key: 'decimal_structure',
    label: CONCEPT_LABELS_HE.decimal_structure,
    strugglingLabel: 'מתקשים במבנה העשרוני והאפס',
    color: 'bg-violet-600',
  },
  {
    key: 'regrouping_fluency',
    label: CONCEPT_LABELS_HE.regrouping_fluency,
    strugglingLabel: 'מתקשים בהקבצה ובפריטה',
    color: 'bg-violet-600',
  },
  {
    key: 'procedural_fluency',
    label: CONCEPT_LABELS_HE.procedural_fluency,
    strugglingLabel: 'מתקשים בחישוב במאונך',
    color: 'bg-violet-600',
  },
];

/**
 * One rule for the widget, the group card and the class chart: a learner is
 * below `threshold` in a domain when the domain's number is — and, for
 * "הקבצה ופריטה", also when either part alone is (no mixing; owner 26.9.2026).
 * The regrouping number itself comes from the learner's live task results when
 * they exist, so old and new mastery profiles read the same.
 */
export function isStudentBelow(s: StudentData, domain: DiagnosticDomain, threshold: number): boolean {
  if (!s.conceptMastery) return false;
  if (domain === 'regrouping_fluency') {
    const view = computeRegroupingDomain(
      s.qMatrixResults as Record<string, unknown> | undefined,
      s.conceptMastery.regrouping_fluency
    );
    return isRegroupingBelow(view, threshold);
  }
  return s.conceptMastery[domain] < threshold;
}

export function ClusteringWidgets({ students, onFilterChange, activeFilter }: Props) {
  // Threshold unified with the group cards below (they filter at mastery < 0.5);
  // this widget used < 0.8, so its counts disagreed with its own lists.
  const getStrugglingCount = (domain: DiagnosticDomain) => {
    return students.filter((s) => isStudentBelow(s, domain, 0.5)).length;
  };

  const widgets = CLUSTER_WIDGETS;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
      {widgets.map(widget => {
        // A domain nobody struggles in shows 0 (מסמך 04: the number is shown
        // "לכל אחד משלושת תחומי האבחון"). It used to vanish — and with it the
        // only button that clears its own filter.
        const count = getStrugglingCount(widget.key);

        const isActive = activeFilter === widget.key;

        return (
          <button
            key={widget.key}
            onClick={() => onFilterChange(isActive ? null : widget.key)}
            aria-pressed={isActive}
            className={`flex-shrink-0 relative overflow-hidden rounded-2xl border transition-all duration-300 text-right p-4 min-w-[200px]
              ${isActive
                ? 'border-violet-500 shadow-md bg-white dark:bg-slate-800'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800'
              }`}
          >
            <div className={`absolute top-0 right-0 w-full h-1 ${widget.color}`} />
            <div className="text-3xl font-black mb-1 text-slate-800 dark:text-slate-100">{count}</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {widget.strugglingLabel}
            </div>
          </button>
        );
      })}
    </div>
  );
}
