
import { type StudentData } from '@/application/useStore';
import { CONCEPT_LABELS_HE } from '@/core/QMatrix';

interface Props {
  students: StudentData[];
  onFilterChange: (filter: string | null) => void;
  activeFilter: string | null;
}

export function ClusteringWidgets({ students, onFilterChange, activeFilter }: Props) {
  const getStrugglingCount = (conceptKey: keyof NonNullable<StudentData['conceptMastery']>) => {
    return students.filter(s => s.conceptMastery && s.conceptMastery[conceptKey] < 0.8).length;
  };

  const widgets = [
    { key: 'decimal_structure', label: CONCEPT_LABELS_HE.decimal_structure, color: 'from-blue-500 to-cyan-500' },
    { key: 'number_magnitude', label: CONCEPT_LABELS_HE.number_magnitude, color: 'from-emerald-500 to-teal-500' },
    { key: 'regrouping_fluency', label: CONCEPT_LABELS_HE.regrouping_fluency, color: 'from-purple-500 to-indigo-500' },
    { key: 'procedural_fluency', label: CONCEPT_LABELS_HE.procedural_fluency, color: 'from-red-500 to-rose-500' },
    { key: 'relational_thinking', label: CONCEPT_LABELS_HE.relational_thinking, color: 'from-orange-500 to-amber-500' },
    { key: 'algebraic_reasoning', label: CONCEPT_LABELS_HE.algebraic_reasoning, color: 'from-pink-500 to-rose-400' },
  ] as const;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
      {widgets.map(widget => {
        const count = getStrugglingCount(widget.key);
        if (count === 0) return null;
        
        const isActive = activeFilter === widget.key;

        return (
          <button
            key={widget.key}
            onClick={() => onFilterChange(isActive ? null : widget.key)}
            className={`flex-shrink-0 relative overflow-hidden rounded-2xl border transition-all duration-300 text-right p-4 min-w-[200px]
              ${isActive 
                ? 'border-indigo-500 shadow-md bg-white dark:bg-slate-800' 
                : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800'
              }`}
          >
            <div className={`absolute top-0 right-0 w-full h-1 bg-gradient-to-l ${widget.color}`} />
            <div className="text-3xl font-black mb-1 text-slate-800 dark:text-slate-100">{count}</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
              מתקשים ב{widget.label.replace('הבנת ', '')}
            </div>
          </button>
        );
      })}
    </div>
  );
}
