import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { WifiOff, AlertTriangle, Clock, CheckCircle2, User } from 'lucide-react';
import type { StudentData } from '@/application/useStore';

export type RadarStatusColor = 'RED' | 'GREY' | 'YELLOW' | 'GREEN';

export interface RadarStudentTile {
  studentId: string;
  anonymousLabel: string;
  color: RadarStatusColor;
  statusText: string;
  lastPingMs: number;
  isOnline: boolean;
  currentTaskTitle?: string;
  hesitationSeconds?: number;
  consecutiveErrors?: number;
}

interface SilentRadarMatrixProps {
  students: Record<string, StudentData>;
  onSelectStudent?: (studentId: string) => void;
  selectedStudentId?: string | null;
  presenceTimeoutMs?: number; // default 15000ms
}

/**
 * Module 18: Silent Pedagogical Radar Matrix (מטריצת רדאר פדגוגי שקט)
 * 3x4 grid for 12 anonymous students.
 * Color priority order: RED > GREY > YELLOW > GREEN.
 * Zero-PII: strictly "תלמיד 1" ... "תלמיד 12", zero names/emails.
 * 15s presence timeout, 1000ms update throttle.
 */
export function computeStudentRadarColor(
  student: StudentData | undefined,
  now = Date.now(),
  presenceTimeoutMs = 15000
): { color: RadarStatusColor; statusText: string; isOnline: boolean } {
  if (!student) {
    return { color: 'GREY', statusText: 'טרם החל', isOnline: false };
  }

  const lastActivity = (student as any).lastActivityTimestamp || (student as any).lastPing || 0;
  if (lastActivity === 0) {
    return { color: 'GREY', statusText: 'טרם החל', isOnline: false };
  }

  const isOnline = now - lastActivity <= presenceTimeoutMs;

  const errors = (student as any).consecutiveErrors || (student as any).errorCount || 0;
  const hesitation = (student as any).hesitationSeconds || (student as any).hesitation_seconds || 0;
  const isHelpActive = Boolean((student as any).hasRequestedBasicHelp || (student as any).scaffoldLevel);
  const isPassiveDrifting = Boolean((student as any).isPassiveDrifting || (student as any).passive_drifting);

  // Strict priority order: RED > GREY > YELLOW > GREEN
  // 1. RED: Severe cognitive difficulty, passive drifting, or consecutive errors >= 3
  if (errors >= 3 || isPassiveDrifting || (student as any).hasActiveFriction) {
    return {
      color: 'RED',
      statusText: errors >= 3 ? `${errors} שגיאות רצופות` : 'קושי קוגניטיבי ממושך',
      isOnline,
    };
  }

  // 2. GREY: Offline / disconnected (>15s presence timeout)
  if (!isOnline) {
    return {
      color: 'GREY',
      statusText: 'לא מחובר (מעל 15 שנ׳)',
      isOnline: false,
    };
  }

  // 3. YELLOW: Hesitation (>30s) or active scaffolding/help
  if (hesitation >= 30 || isHelpActive) {
    return {
      color: 'YELLOW',
      statusText: hesitation >= 30 ? `היסוס (${hesitation} שניות)` : 'נעזר בפיגום פדגוגי',
      isOnline: true,
    };
  }

  // 4. GREEN: On track / solving normally
  return {
    color: 'GREEN',
    statusText: 'התקדמות תקינה',
    isOnline: true,
  };
}

export function SilentRadarMatrix({
  students,
  onSelectStudent,
  selectedStudentId,
  presenceTimeoutMs = 15000,
}: SilentRadarMatrixProps) {
  const now = Date.now();

  // Create exactly 12 anonymous student tiles for the 3x4 grid
  const studentTiles: RadarStudentTile[] = useMemo(() => {
    const tiles: RadarStudentTile[] = [];

    for (let i = 1; i <= 12; i++) {
      const studentId = `student_${i}`;
      // Find by studentId or normalized id
      const student = Object.values(students).find(
        (s) => s.studentId === studentId || s.studentId === `03960448${i - 1}` || s.studentId === String(i)
      );

      const { color, statusText, isOnline } = computeStudentRadarColor(
        student,
        now,
        presenceTimeoutMs
      );

      tiles.push({
        studentId,
        anonymousLabel: `תלמיד ${i}`,
        color,
        statusText,
        lastPingMs: (student as any)?.lastActivityTimestamp || 0,
        isOnline,
        currentTaskTitle: (student as any)?.lastAction || (student as any)?.currentTaskTitle,
        hesitationSeconds: (student as any)?.hesitationSeconds,
        consecutiveErrors: (student as any)?.consecutiveErrors,
      });
    }

    return tiles;
  }, [students, now, presenceTimeoutMs]);

  const colorStyles: Record<RadarStatusColor, { bg: string; border: string; text: string; badge: string; icon: any }> = {
    RED: {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      border: 'border-rose-400 dark:border-rose-700',
      text: 'text-rose-900 dark:text-rose-200',
      badge: 'bg-rose-500 text-white',
      icon: AlertTriangle,
    },
    GREY: {
      bg: 'bg-slate-100 dark:bg-slate-900/60',
      border: 'border-slate-300 dark:border-slate-800',
      text: 'text-slate-500 dark:text-slate-400',
      badge: 'bg-slate-400 text-white',
      icon: WifiOff,
    },
    YELLOW: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-400 dark:border-amber-700',
      text: 'text-amber-900 dark:text-amber-200',
      badge: 'bg-amber-500 text-white',
      icon: Clock,
    },
    GREEN: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'border-emerald-400 dark:border-emerald-700',
      text: 'text-emerald-900 dark:text-emerald-200',
      badge: 'bg-emerald-500 text-white',
      icon: CheckCircle2,
    },
  };

  return (
    <div dir="rtl" className="w-full flex flex-col gap-4 font-body">
      {/* Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-display font-black text-slate-900 dark:text-white">
            מטריצת רדאר פדגוגי שקט (Silent Pedagogical Radar) 📡
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            תצוגת 3×4 של 12 תלמידי הכיתה (אנונימיות מלאה — Zero PII). סדר עדיפויות: אדום &gt; אפור &gt; צהוב &gt; ירוק.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> אדום (קושי)
          </span>
          <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <span className="w-3 h-3 rounded-full bg-slate-400 inline-block" /> אפור (מנותק)
          </span>
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> צהוב (היסוס)
          </span>
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> ירוק (תקין)
          </span>
        </div>
      </div>

      {/* 3x4 Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {studentTiles.map((tile) => {
          const style = colorStyles[tile.color];
          const Icon = style.icon;
          const isSelected = selectedStudentId === tile.studentId;

          return (
            <motion.button
              key={tile.studentId}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectStudent?.(tile.studentId)}
              className={`p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-3 shadow-sm cursor-pointer ${
                style.bg
              } ${style.border} ${
                isSelected ? 'ring-4 ring-indigo-500 shadow-md' : ''
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-white/80 dark:bg-slate-800/80 flex items-center justify-center text-slate-700 dark:text-slate-300 font-bold text-xs shadow-inner">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {tile.anonymousLabel}
                  </span>
                </div>

                <div className={`p-1.5 rounded-lg ${style.badge}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="flex flex-col gap-1 text-xs">
                <span className={`font-black ${style.text}`}>
                  {tile.statusText}
                </span>
                {tile.currentTaskTitle && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {tile.currentTaskTitle}
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default SilentRadarMatrix;
