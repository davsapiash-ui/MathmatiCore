import { useState } from 'react';
import { useAdminStore } from '@/application/useAdminStore';
import { ShieldCheck, Users, Check, Lock, Sparkles, ChevronRight, Zap } from 'lucide-react';
import { useStore, type StudentData } from '@/application/useStore';
import { HeatmapGrid } from './components/HeatmapGrid';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { UdlButton } from '@/presentation/design-system/UdlButton';

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
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-2xl border border-indigo-500/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
              <span className="bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 rounded-full flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                {currentSchool?.name || 'מוסד פיילוט מרכזי'}
              </span>
              <ChevronRight className="w-4 h-4 opacity-50 rotate-180" />
              <span className="bg-cyan-500/20 border border-cyan-400/30 px-3 py-1 rounded-full text-cyan-300">
                {currentClass?.name || 'כיתה א׳ מרכזית'}
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              <Users className="w-9 h-9 text-indigo-400" />
              ניהול פדגוגי וכיתתי
            </h1>
            <p className="text-slate-300 text-sm md:text-base font-light max-w-2xl">
              מבט על כיתתי, עקיפה פיזית גורפת, וניטור רדאר קוגניטיבי מותאם לפרטיות תלמידים.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/5 border border-white/10 backdrop-blur-md px-4 py-3 rounded-2xl">
            <div className="text-center">
              <span className="text-[11px] text-slate-400 block font-semibold">תלמידים משוייכים</span>
              <span className="text-xl font-black text-indigo-300">{allStudents.length} / 35</span>
            </div>
          </div>
        </div>
      </header>

      {/* PRD Section 7: Dual-Level Override Control Banner */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Zero PII Privacy Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl flex gap-4 items-start shadow-xl relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              הנחיית פרטיות ואבטחת מידע (Zero PII Compliance)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              שמות התלמידים מיוצגים באופן אנונימי או במזהים פנימיים. שיוך השמות הממשיים מנוהל חיצונית בלבד על ידי המורה ומנהל המערכת.
            </p>
          </div>
        </div>

        {/* Class-Level Override Card */}
        <div className="bg-gradient-to-br from-indigo-900/90 to-purple-950/90 border border-indigo-500/30 p-6 rounded-3xl flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between shadow-xl text-white relative overflow-hidden">
          <div className="space-y-1 flex-1">
            <div className="inline-flex items-center gap-1.5 text-xs text-indigo-300 font-bold mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>עקיפה פיזית כיתתית (Strict CRA Bridge)</span>
            </div>
            <h3 className="font-bold text-white text-base">
              אפיון כיתתי גורף (Class-Level Override)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              הפעלת פרופיל תמיכה מוגבר ו-Strict CRA Bridge גורף לכלל תלמידי הכיתה (סעיף 7 באפיון).
            </p>
            {appliedOverride && (
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mt-2 bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 rounded-xl w-fit animate-bounce">
                <Check className="w-4 h-4" />
                <span>אפיון כיתתי גורף הוחל בהצלחה על כלל הכיתה!</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleApplyClassLevelOverride}
            disabled={isApplying}
            className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-indigo-500/30 shrink-0 transition-all active:scale-95 border border-indigo-400/30 disabled:opacity-50"
          >
            {isApplying ? 'מחיל עקיפה גורפת...' : 'החל עקיפה גורפת'}
          </button>
        </div>
      </div>

      {/* Heatmap Grid Component */}
      <HeatmapGrid onDrillDown={onDrillDown} />
    </div>
  );
}
