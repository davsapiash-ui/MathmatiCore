import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Brain, Clock, RotateCcw, AlertTriangle, Eye, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { PlaceCounts } from '@/core/placeValue';

export interface DiagnosticStudentSnapshot {
  studentId: string;
  anonymousLabel: string;
  sessionNumber: number;
  currentTaskTitle: string;
  counts: PlaceCounts;
  hesitationSeconds: number;
  undoCount: number;
  errorCount: number;
  guessCount: number;
  persistenceIndex: number;
  recentEvents: Array<{
    id: string;
    timestamp: number;
    description: string;
    type: 'drop' | 'undo' | 'group' | 'ungroup' | 'error' | 'hesitation';
  }>;
}

interface TeacherDiagnosticSplitScreenProps {
  snapshot: DiagnosticStudentSnapshot;
  onClose?: () => void;
}

/**
 * Module 21: Teacher Diagnostic Split Screen (מסך אבחון וטלמטריה מפוצל למורה)
 * Side-by-side view of anonymous student board state, trace history, and hesitation radar.
 * Strict Zero-AV Telemetry: NO audio streams, NO video/camera streams (בלי אודיו/מצלמה).
 * Zero-PII: Strictly anonymous labels.
 */
export function TeacherDiagnosticSplitScreen({
  snapshot,
  onClose,
}: TeacherDiagnosticSplitScreenProps) {
  const totalValue =
    snapshot.counts.thousands * 1000 +
    snapshot.counts.hundreds * 100 +
    snapshot.counts.tens * 10 +
    snapshot.counts.units;

  return (
    <div dir="rtl" className="w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden font-body">
      {/* Top Bar */}
      <div className="p-5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-black text-lg text-slate-900 dark:text-white">
                שידור טלמטריה וקטורי — {snapshot.anonymousLabel}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                מפגש {snapshot.sessionNumber}
              </span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              שידור וקטורי שקט (ללא וידאו / ללא שמע — Zero AV Stream)
            </span>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            סגור תצוגה
          </button>
        )}
      </div>

      {/* Split Content: 50% Vector Board / 50% Trace & SRL Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-200 dark:divide-slate-800">
        {/* Left/Right 1: Live Vector Representation of Student Board */}
        <div className="p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="font-black text-sm text-slate-800 dark:text-slate-200">
              מצב לוח ערך המקום בשידור חי:
            </span>
            <span className="font-display font-black text-base text-indigo-600 dark:text-indigo-400">
              ערך כולל: {totalValue}
            </span>
          </div>

          {/* Place Value Columns Replica */}
          <div className="grid grid-cols-4 gap-2 bg-slate-100 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
            {/* Thousands */}
            <div className="flex flex-col items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm">
              <span className="text-[11px] font-extrabold text-slate-500">אלפים</span>
              <span className="text-2xl font-black text-indigo-600">{snapshot.counts.thousands}</span>
              <span className="text-[10px] text-slate-400">קוביית אלף</span>
            </div>

            {/* Hundreds */}
            <div className="flex flex-col items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm">
              <span className="text-[11px] font-extrabold text-slate-500">מאות</span>
              <span className="text-2xl font-black text-purple-600">{snapshot.counts.hundreds}</span>
              <span className="text-[10px] text-slate-400">משטח 100</span>
            </div>

            {/* Tens */}
            <div className="flex flex-col items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm">
              <span className="text-[11px] font-extrabold text-slate-500">עשרות</span>
              <span className="text-2xl font-black text-teal-600">{snapshot.counts.tens}</span>
              <span className="text-[10px] text-slate-400">פס 10</span>
            </div>

            {/* Units */}
            <div className="flex flex-col items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm">
              <span className="text-[11px] font-extrabold text-slate-500">יחידות</span>
              <span className="text-2xl font-black text-amber-600">{snapshot.counts.units}</span>
              <span className="text-[10px] text-slate-400">יחידה בודדת</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/30 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">משימה נוכחית: </span>
            <span className="text-slate-600 dark:text-slate-400">{snapshot.currentTaskTitle}</span>
          </div>
        </div>

        {/* Left/Right 2: Real-time Trace Events & Cognitive Hesitation Radar */}
        <div className="p-6 flex flex-col gap-5 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center justify-between">
            <span className="font-black text-sm text-slate-800 dark:text-slate-200">
              מדדים פדגוגיים ואירועי למידה (Trace):
            </span>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-bold mb-1">
                <Clock className="w-3 h-3 text-amber-500" />
                <span>היסוס</span>
              </div>
              <span className="text-lg font-black text-slate-900 dark:text-white">
                {snapshot.hesitationSeconds} שנ׳
              </span>
            </div>

            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-bold mb-1">
                <RotateCcw className="w-3 h-3 text-indigo-500" />
                <span>ביטולים (Undo)</span>
              </div>
              <span className="text-lg font-black text-slate-900 dark:text-white">
                {snapshot.undoCount}
              </span>
            </div>

            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-bold mb-1">
                <Brain className="w-3 h-3 text-emerald-500" />
                <span>מדד התמדה SRL</span>
              </div>
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                {snapshot.persistenceIndex}%
              </span>
            </div>
          </div>

          {/* Trace Event Log */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-black text-slate-600 dark:text-slate-400">
              אירועים אחרונים ברצף הפתרון:
            </span>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-2 text-xs">
              {snapshot.recentEvents.length === 0 ? (
                <span className="p-3 text-center text-slate-400 block">אין אירועים אחרונים</span>
              ) : (
                snapshot.recentEvents.map((evt) => (
                  <div key={evt.id} className="p-2 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {evt.description}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(evt.timestamp).toLocaleTimeString('he-IL')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeacherDiagnosticSplitScreen;
