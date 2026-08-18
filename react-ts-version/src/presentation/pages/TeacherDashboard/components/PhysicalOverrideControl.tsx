import { useState, useEffect } from 'react';
import { type StudentData, useStore } from '@/application/useStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { ShieldAlert, Check, RefreshCw } from 'lucide-react';

interface Props {
  student: StudentData;
}

export function PhysicalOverrideControl({ student }: Props) {
  const [routeStatus, setRouteStatus] = useState<string>(student?.routeStatus || 'SANDBOX');
  const [difficultyRecommendation, setDifficultyRecommendation] = useState<string>(
    String(student?.difficultyRecommendation || 'LEVEL_1')
  );
  const [isASD, setIsASD] = useState<boolean>(student?.isASD || false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (student) {
      setRouteStatus(student.routeStatus || 'SANDBOX');
      setDifficultyRecommendation(String(student.difficultyRecommendation || 'LEVEL_1'));
      setIsASD(Boolean(student.isASD));
    }
  }, [student?.studentId, student?.routeStatus, student?.difficultyRecommendation, student?.isASD]);

  if (!student) return null;

  const handleSaveOverride = async (enableOverrideArg?: boolean | React.SyntheticEvent) => {
    const activeState = typeof enableOverrideArg === 'boolean' ? enableOverrideArg : true;
    const studentId = student?.studentId || (student as any)?.student?.studentId;
    if (!studentId) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const overrideUpdatedAt = Date.now();
      const updates = {
        routeStatus,
        difficultyRecommendation,
        isASD,
        physicalOverride: activeState,
        physicalOverrideActive: activeState,
        overrideUpdatedAt,
      };

      await firebaseSyncService.syncPhysicalOverride(studentId, updates);

      // Zustand store update
      const store = useStore.getState();
      if (store.applyPhysicalOverride) {
        store.applyPhysicalOverride(studentId, updates);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save physical override:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 my-6 shadow-sm">
      <div className="flex items-center gap-2 mb-3 text-amber-800 dark:text-amber-300 font-bold text-base">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        <span>עקיפה פיזית ותיווך מורה (Physical Override)</span>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
        שליטה ידנית בהגדרות המסלול, הרמה והתאמות ה-ASD של התלמיד/ה להחלפת החלטות המערכת האוטומטית.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            סטטוס מסלול לימוד (Route Status):
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[
              { id: 'SANDBOX', label: 'SANDBOX' },
              { id: 'DIAGNOSTIC', label: 'DIAGNOSTIC' },
              { id: 'ADAPTIVE', label: 'ADAPTIVE' },
              { id: 'GATE_LOCKED', label: 'GATE_LOCKED' },
              { id: 'APPROVED', label: 'APPROVED' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRouteStatus(item.id)}
                className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  routeStatus === item.id
                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            המלצת רמת קושי (Difficulty Recommendation):
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'LEVEL_1', label: 'LEVEL_1' },
              { id: 'LEVEL_2', label: 'LEVEL_2' },
              { id: 'LEVEL_3', label: 'LEVEL_3' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDifficultyRecommendation(item.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  difficultyRecommendation === item.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
          <div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">התאמת ASD (isASD)</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">הפעלת עזרי למידה חזותיים מותאמים</span>
          </div>
          <button
            type="button"
            onClick={() => setIsASD(!isASD)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isASD ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isASD ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex justify-end items-center gap-3 pt-2">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check className="w-4 h-4" />
              העקיפה עודכנה בהצלחה!
            </span>
          )}
          {student.physicalOverride && (
            <button
              type="button"
              onClick={() => handleSaveOverride(false)}
              disabled={isSaving}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-lg shadow transition-all active:scale-95 disabled:opacity-50"
            >
              <span>בטל / נקה עקיפה פיזית</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSaveOverride(true)}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow transition-all active:scale-95 disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            <span>{student.physicalOverride ? 'עדכן עקיפה פיזית' : 'הפעל עקיפה פיזית'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
