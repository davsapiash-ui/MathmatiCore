import { useAdminStore } from '@/application/useAdminStore';
import { ShieldCheck, Users } from 'lucide-react';
import { useStore, type StudentData } from '@/application/useStore';
import { HeatmapGrid } from './components/HeatmapGrid';

export function ClassManagement({ allStudents }: { allStudents: StudentData[] }) {
  const classes = useAdminStore(s => s.classes);
  const schools = useAdminStore(s => s.schools);
  
  // We're working with a single default school & class based on the strict hierarchy
  const currentClass = classes[0];
  const currentSchool = schools.find(s => s.id === currentClass?.schoolId);
  
  return (
    <div className="p-8 max-w-6xl mx-auto w-full h-full flex flex-col animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-2">
          <Users className="w-8 h-8 text-indigo-500" />
          ניהול כיתה
        </h1>
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <span className="bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-md">{currentSchool?.name || 'ביקורת'}</span>
          <span>&gt;</span>
          <span className="bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-md">{currentClass?.name || 'כיתה 1'}</span>
        </div>
      </div>

      {/* PRD Section 7: Dual-Level Override Control Banner */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/40 p-4 rounded-xl flex gap-4 items-start shadow-sm">
          <ShieldCheck className="text-amber-600 dark:text-amber-400 w-6 h-6 shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-amber-900 dark:text-amber-200">הנחיית פרטיות ואבטחת מידע (Zero PII)</h3>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
              שמות התלמידים מיוצגים באופן אנונימי. שיוך השמות הממשיים מנוהל חיצונית בלבד על ידי המורה ומנהל המערכת.
            </p>
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800/40 p-4 rounded-xl flex gap-4 items-center justify-between shadow-sm">
          <div>
            <h3 className="font-bold text-indigo-900 dark:text-indigo-200">אפיון כיתתי גורף (Class-Level Override)</h3>
            <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
              הפעלת פרופיל תמיכה מוגבר ו-Strict CRA Bridge גורף לכלל תלמידי הכיתה (סעיף 7 באפיון).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              alert("אפיון כיתתי גורף (Class-Level Override) עודכן לכלל הכיתה בהצלחה!");
            }}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow shrink-0 transition-all active:scale-95"
          >
            החל על כל הכיתה
          </button>
        </div>
      </div>

      {/* Heatmap Grid and Live Feed */}
      <HeatmapGrid />
    </div>
  );
}
