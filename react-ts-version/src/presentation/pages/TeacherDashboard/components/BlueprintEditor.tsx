import { type StudentData } from '@/application/useStore';
import { Sparkles } from 'lucide-react';

interface Props {
  student: StudentData;
}

export function BlueprintEditor({ student }: Props) {
  const blueprintTasks = student.diagnosticReport?.tasks || [];
  const focusConcept = student.conceptMastery?.regrouping_fluency && student.conceptMastery.regrouping_fluency < 0.8 ? 'regrouping_fluency' : 'procedural_fluency';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-indigo-500" />
        <h3 className="font-bold text-slate-800 dark:text-slate-200">תוכנית עבודה מותאמת אישית</h3>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="mb-6">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">מוקד קוגניטיבי לחיזוק:</div>
          <div className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-3 py-2 rounded-lg font-mono text-sm inline-block">
            {focusConcept}
          </div>
        </div>

        <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">תרגילים מתוכננים למפגש הקרוב:</div>
        {blueprintTasks.length > 0 ? (
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm">
                <tr>
                  <th className="py-2 px-4 font-medium w-1/4">תרגיל</th>
                  <th className="py-2 px-4 font-medium">היגיון פדגוגי</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {blueprintTasks.map((ex: any) => (
                  <tr key={ex.id || ex.equation}>
                    <td className="py-3 px-4 font-bold font-mono text-lg text-slate-800 dark:text-slate-200" dir="ltr">{ex.equation}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{ex.rationale || 'הגיון פדגוגי מהמנוע הסוקרטי.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-slate-500">
            אין תרגילים מתוכננים או שהתוכנית לא זמינה כרגע.
          </div>
        )}
      </div>
    </div>
  );
}
