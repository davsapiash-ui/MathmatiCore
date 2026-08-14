import { useState } from 'react';
import { useAdminStore } from '@/application/useAdminStore';
import { Users, Check, Lock, Sparkles, ChevronRight, Zap } from 'lucide-react';
import { useStore, type StudentData } from '@/application/useStore';
import { HeatmapGrid } from './components/HeatmapGrid';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

export function ClassManagement({ 
  allStudents, 
  onDrillDown 
}: { 
  allStudents: StudentData[]; 
  onDrillDown?: (studentId: string) => void 
}) {
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
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full h-full flex flex-col space-y-8 animate-in fade-in duration-500" dir="rtl">
      
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 p-8 text-white shadow-xl shadow-indigo-500/20 border border-indigo-400/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-100">
              <span className="bg-white/15 border border-white/20 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                {currentSchool?.name || 'מוסד פיילוט מרכזי'}
              </span>
              <ChevronRight className="w-4 h-4 opacity-70 rotate-180" />
              <span className="bg-white/15 border border-white/20 px-3 py-1 rounded-full text-white backdrop-blur-sm">
                {currentClass?.name || 'כיתה א׳ מרכזית'}
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              <Users className="w-9 h-9 text-indigo-200" />
              ניהול פדגוגי וכיתתי
            </h1>
            <p className="text-indigo-100 text-sm md:text-base font-medium max-w-2xl">
              מבט על כיתתי, עקיפה פיזית גורפת, וניטור רדאר קוגניטיבי מותאם לפרטיות תלמידים.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/15 border border-white/25 backdrop-blur-md px-4 py-3 rounded-2xl">
            <div className="text-center">
              <span className="text-[11px] text-indigo-100 block font-semibold">תלמידים משוייכים</span>
              <span className="text-xl font-black text-white">{Math.min(allStudents.length, 12)} / 12</span>
            </div>
          </div>
        </div>
      </header>

      {/* PRD v3.0 Module 19: Dual-Level Override Control Banner */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Zero PII Privacy Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-3xl flex gap-4 items-start shadow-lg shadow-slate-200/50 relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              הנחיית פרטיות ואבטחת מידע (Zero PII Compliance)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              שמות התלמידים מיוצגים באופן אנונימי במזהים 1 עד 12 בלבד. שיוך השמות הממשיים מנוהל חיצונית בלבד על ידי המורה ומנהל המערכת.
            </p>
          </div>
        </div>

        {/* Class-Level Override Card */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 border border-indigo-400/30 p-6 rounded-3xl flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between shadow-xl shadow-indigo-500/15 text-white relative overflow-hidden">
          <div className="space-y-1 flex-1">
            <div className="inline-flex items-center gap-1.5 text-xs text-indigo-100 font-bold mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>הפעלת פרופיל תמיכה קוגניטיבי מוגבר (VRA Bridge)</span>
            </div>
            <h3 className="font-bold text-white text-base">
              אפיון כיתתי סמוי (Class-Level Support Profile)
            </h3>
            <p className="text-xs text-indigo-100 leading-relaxed">
              הפעלת פרופיל תמיכה מוגבר וגשר VRA דיגיטלי סמוי לכלל תלמידי הכיתה ללא סימון חזותי בממשק התלמיד.
            </p>
            {appliedOverride && (
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5 mt-2 bg-emerald-500/25 border border-emerald-400/40 px-3 py-1 rounded-xl w-fit animate-bounce">
                <Check className="w-4 h-4" />
                <span>פרופיל תמיכה קוגניטיבי מוגבר הוחל בהצלחה על כלל הכיתה!</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleApplyClassLevelOverride}
            disabled={isApplying}
            className="px-5 py-3 bg-white text-indigo-700 hover:bg-indigo-50 font-extrabold text-xs rounded-2xl shadow-lg shrink-0 transition-all active:scale-95 border border-white/50 disabled:opacity-50"
          >
            {isApplying ? 'מחיל פרופיל תמיכה...' : 'החל פרופיל תמיכה גורף'}
          </button>
        </div>
      </div>

      {/* Heatmap Grid Component */}
      <HeatmapGrid onDrillDown={onDrillDown} />
    </div>
  );
}
