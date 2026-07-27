import { useState } from 'react';
import { useAdminStore } from '@/application/useAdminStore';
import { ShieldCheck, Users, Check } from 'lucide-react';
import { useStore, type StudentData } from '@/application/useStore';
import { HeatmapGrid } from './components/HeatmapGrid';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

export function ClassManagement({ allStudents }: { allStudents: StudentData[] }) {
  const classes = useAdminStore(s => s.classes);
  const schools = useAdminStore(s => s.schools);
  const [appliedOverride, setAppliedOverride] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // We're working with a single default school & class based on the strict hierarchy
  const currentClass = classes[0];
  const currentSchool = schools.find(s => s.id === currentClass?.schoolId);

  const handleApplyClassLevelOverride = async () => {
    setIsApplying(true);
    setAppliedOverride(false);
    try {
      const store = useStore.getState();
      const overridePayload = {
        routeStatus: 'ADAPTIVE',
        difficultyRecommendation: 'LEVEL_1',
        isASD: true,
        physicalOverride: true,
        physicalOverrideActive: true,
        overrideUpdatedAt: Date.now(),
      };

      for (const student of allStudents) {
        if (student.studentId) {
          if (store.applyPhysicalOverride) {
            store.applyPhysicalOverride(student.studentId, overridePayload);
          }
          await firebaseSyncService.syncPhysicalOverride(student.studentId, overridePayload).catch(console.error);
        }
      }

      setAppliedOverride(true);
      setTimeout(() => setAppliedOverride(false), 4000);
    } catch (err) {
      console.error('Failed to apply class-level override:', err);
    } finally {
      setIsApplying(false);
    }
  };

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
            {appliedOverride && (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
                <Check className="w-3.5 h-3.5" />
                אפיון כיתתי גורף הוחל בהצלחה!
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleApplyClassLevelOverride}
            disabled={isApplying}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow shrink-0 transition-all active:scale-95 disabled:opacity-50"
          >
            {isApplying ? 'מחיל עקיפה...' : 'החל על כל הכיתה'}
          </button>
        </div>
      </div>

      {/* Heatmap Grid and Live Feed */}
      <HeatmapGrid />
    </div>
  );
}
