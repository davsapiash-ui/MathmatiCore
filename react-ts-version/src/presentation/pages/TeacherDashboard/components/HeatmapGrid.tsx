import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue } from 'firebase/database';
import { database, functions, serverNow } from '@/infrastructure/firebase';
import { isHeartbeatFresh } from '@/core/presence';
import { httpsCallable } from 'firebase/functions';
import { useAuthStore } from '@/application/useAuthStore';
import { READ_ONLY_TITLE, useIsReadOnlyStaff } from '@/application/useIsReadOnlyStaff';
import { approveTeacherGate } from '@/core/teacherGate';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ShieldAlert,
  Users,
  RotateCcw,
  DoorOpen,
  FileDown,
  BellRing,
  WifiOff,
  Rocket,
  Shield,
  Settings,
  ChevronDown,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/application/useStore';
import { recordLearningPath } from '@/application/useWorkspaceStore';
import { ResetConfirmationModal } from './ResetConfirmationModal';
import { recommendedPathOf } from '@/core/recommendedPath';
import { hasEnhancedSupport } from '@/core/supportProfile';
import { resolveRadarColor, RADAR_BAR_CLASSES, RADAR_CELL_CLASSES, type RadarColor } from '@/core/radarColor';
import { useDismissableOverlay } from '@/hooks/useDismissableOverlay';
import { isClassSessionLive } from '@/core/classSession';
import { meetingLabelHe, meetingShortLabelHe, stationNameHe } from '@/core/stationNames';
import { getHesitationThresholdSeconds, useHesitationThresholdSeconds } from '@/core/hesitationCalibration';
import { CARD_OPEN_HE, ERROR_CATEGORY_HE, RECOMMENDED_MARK_HE, RESET_ACTION_HE, ROUTE_APPROVE_HE, ROUTE_NAME_HE, TEACHER_GATE_HE, radarPathLabelHe, routePairFor, LEARNER_GROUP_HE } from '@/core/routeLabels';
import { ROUTE_COLOR } from '@/core/routeColors';
import type { PedagogicalPath } from '@/types';
import { hasLegacyRecordings } from '@/core/legacyRecordings';
import { LegacyRecordingsButton } from './LegacyRecordingsButton';
import { TILE_HE, elapsedClockHe, stateSinceOf, tileProgressHe, tileProgressOf, type TileProgress } from '@/core/teacherLessonFlow';
import { useRadarColourMapStore, useRadarHighlight } from './RadarColourMap';
import { gateApprovedToastHe } from './TeacherGateApprovalDrawer';
import { MediationLogSection } from './MediationLogSection';
import { useOpenMediationEvents } from '@/application/useTeacherMediationStore';
import { MEDIATION_HE, openCountByLearner } from '@/core/teacherMediation';

// Radar status color resolution lives in core/radarColor.ts (resolveRadarColor)
// — the full BLUE > RED > GREY > YELLOW > GREEN priority actually rendered
// below. An earlier, unused duplicate of this logic here omitted BLUE
// entirely and was tested as if it were the real thing; see
// core/__tests__/RadarColorPrecedence.test.ts for the real coverage.

export function getCognitiveGlyph(errorCategory: 'calculation' | 'procedural' | 'conceptual' | string | null | undefined): { glyph: 'ח' | 'ר' | 'מ'; title: string } | null {
  if (!errorCategory) return null;
  const norm = String(errorCategory).toLowerCase().trim();
  if (norm === 'calculation' || norm === 'computational' || norm === 'facts' || norm === 'basic_facts') {
    return { glyph: 'ח', title: `${ERROR_CATEGORY_HE.calculation} (ח)` };
  }
  if (norm === 'procedural' || norm === 'regrouping' || norm === 'algorithm' || norm === 'steps') {
    return { glyph: 'ר', title: `${ERROR_CATEGORY_HE.procedural} (ר)` };
  }
  if (norm === 'conceptual' || norm === 'place_value' || norm === 'decimal_structure' || norm === 'structure') {
    return { glyph: 'מ', title: `${ERROR_CATEGORY_HE.conceptual} (מ)` };
  }
  return null;
}

/**
 * The radar's colour map, always above the grid (owner, 11.10.2026). The
 * meanings are Module 18 §ב's, unchanged; green and yellow follow the
 * calibrated hesitation threshold (45 seconds by default).
 */
/** What the radar is and what a tile opens — the radar heading's tooltip. */
export const RADAR_EXPLANATION_HE = 'מרכז בקרה אחוד. עדכוני צבע בלבד ללא הפרעה לתלמיד. לחצו על משבצת כדי לראות את פרטי התלמיד: המסלול, המפגש, סיווגי הטעות ושאלות מנחות.';

export function radarLegendItems(thresholdSeconds: number): Array<{ color: 'GREEN' | 'YELLOW' | 'RED' | 'BLUE' | 'GREY'; meaning: string; short: string; dot: string }> {
  // The dot shows the colour; no colour word ("צהוב" is not a word the teacher reads, owner 27.9.2026).
  // `short` fits one line of the colour map at 320px (owner, 11.10.2026); the full sentence is its tooltip.
  return [
    { color: 'GREEN', meaning: `עובד (פעולה ב-${thresholdSeconds} השניות האחרונות)`, short: 'עובד', dot: 'bg-emerald-500' },
    { color: 'YELLOW', meaning: `היסוס: ${thresholdSeconds} שניות בלי פעולה`, short: `היסוס: ${thresholdSeconds} שנ׳ בלי פעולה`, dot: 'bg-amber-400' },
    { color: 'RED', meaning: `${CARD_OPEN_HE} אצלו`, short: CARD_OPEN_HE, dot: 'bg-rose-500' },
    { color: 'BLUE', meaning: 'קרא למורה', short: 'קרא למורה', dot: 'bg-blue-500' },
    { color: 'GREY', meaning: 'לא מחובר או לא התחיל את המפגש', short: 'לא מחובר / לא התחיל', dot: 'bg-slate-300 dark:bg-slate-600' },
  ];
}

/** The tile letters (Module 18), under the names Module 18 gives the three classifications. */
export const RADAR_LEGEND_LETTERS = [
  { glyph: 'מ', meaning: ERROR_CATEGORY_HE.conceptual },
  { glyph: 'ח', meaning: ERROR_CATEGORY_HE.calculation },
  { glyph: 'ר', meaning: ERROR_CATEGORY_HE.procedural },
] as const;

export interface AnonymousStudent {
  id: string; // e.g. "student_1"
  studentNumber: number; // 1-12
  displayName: string; // "תלמיד 1"
  sessionNumber: number; // 1-8
  /** The path the gate approved; null while none is (never green by default). */
  currentPath: 'ירוק' | 'צמצום פערים' | 'מדורג' | 'יסודות' | null;
  status: 'active' | 'locked' | 'completed';
  hesitationSeconds: number;
  errorCount: number;
  /** Shown on the tile apart, so undos (self-correction) and mistakes are not one number called "ביטולים". */
  undoCount?: number;
  mistakeCount?: number;
  enhancedSupport: boolean;
  isStruggling: boolean;
  isSocraticActive: boolean;
  helpRequested: boolean;
  errorCategory?: 'calculation' | 'procedural' | 'conceptual' | null;
  /** Module 18: per-session tally of error_category classifications for this learner */
  errorCategoryDistribution?: { calculation: number; procedural: number; conceptual: number };
  lastAction?: string;
  activeBranch?: 'reinforcement' | 'challenge' | null;
  isOnline?: boolean;
  isWaitingAtGate?: boolean;
  recommendedPath?: 'ירוק' | 'צמצום פערים' | 'מדורג' | 'יסודות' | 'טרם נקבעה';
  /** The teacher marked the learner for the graded path (graded_track): the gate offers the graded pair. */
  gradedTrack?: boolean;
  /** PRD Module 17 §ב: events the server refused 5 times, still kept on the learner's device ("אירועים שנדחו"). */
  refusedEvents?: number;
  /** Owner, 11.10.2026: where the learner is in the open meeting ("סיים", "ברפלקציה", "משימה N/7"). */
  progress?: TileProgress | null;
  /** Server-clock ms since the help call is on (a blue tile's "מחכה M:SS"), else null. */
  helpSince?: number | null;
  /** Server-clock ms since the coaching card is open (a red tile's "כרטיס פתוח M:SS"), else null. */
  cardSince?: number | null;
  /** The exercise on the learner's board (workspaceState.activeTask), for the hover card. */
  exercise?: { a: number; b: number; subtraction: boolean } | null;
}

/**
 * The tile's hover card (owner, 11.10.2026): the state in words and why, the
 * exercise, the last error letter, the level and the mediation events waiting —
 * all from what the radar already holds. The first line is the state.
 */
/** The tile's inline metrics, only those that are not zero ("היסוס", as in the radar's legend, Module 18). */
export function tileInlineMetricsHe(student: Pick<AnonymousStudent, 'hesitationSeconds' | 'undoCount' | 'mistakeCount'>): string[] {
  const out: string[] = [];
  if (student.hesitationSeconds > 0) out.push(`היסוס: ${student.hesitationSeconds} שנ׳`);
  if ((student.undoCount ?? 0) > 0) out.push(`ביטולים: ${student.undoCount}`);
  if ((student.mistakeCount ?? 0) > 0) out.push(`טעויות: ${student.mistakeCount}`);
  return out;
}

export function tileHoverLinesHe(
  student: AnonymousStudent,
  ctx: { colour: RadarColor; thresholdSeconds: number; now: number; openMediation: number; inOpenMeeting: boolean }
): string[] {
  const lines: string[] = [];
  if (ctx.colour === 'BLUE') {
    lines.push(student.helpSince != null ? `קרא למורה · ${TILE_HE.waiting(elapsedClockHe(ctx.now - student.helpSince))}` : 'קרא למורה');
  } else if (ctx.colour === 'RED') {
    lines.push(student.cardSince != null ? `${CARD_OPEN_HE} · ${elapsedClockHe(ctx.now - student.cardSince)}` : CARD_OPEN_HE);
  } else if (ctx.colour === 'YELLOW') {
    lines.push(`היסוס: ${student.hesitationSeconds} שניות בלי פעולה`);
  } else if (ctx.colour === 'GREY') {
    lines.push(!student.isOnline ? 'לא מחובר' : 'לא התחיל את המפגש');
  } else {
    lines.push(`עובד (פעולה ב-${ctx.thresholdSeconds} השניות האחרונות)`);
  }
  // Isolated left-to-right (U+2066 … U+2069), so "352 + 61" never reads backwards inside the Hebrew line.
  const exercise = student.exercise ? `\u2066${student.exercise.a} ${student.exercise.subtraction ? '−' : '+'} ${student.exercise.b}\u2069` : null;
  const progress = ctx.inOpenMeeting && student.progress ? tileProgressHe(student.progress) : null;
  // "משימה 4/7 · 352 + 61" while on a task; "סיים" / "ברפלקציה" alone; the exercise alone outside the open meeting.
  const onTask = ctx.inOpenMeeting && student.progress?.kind === 'task';
  const workLine = onTask ? [progress, exercise].filter(Boolean).join(' · ') : progress ?? exercise;
  if (workLine) lines.push(workLine);
  if (student.isOnline) lines.push(`היסוס: ${student.hesitationSeconds} שנ׳ · ביטולים: ${student.undoCount ?? 0} · טעויות: ${student.mistakeCount ?? 0}`);
  const glyph = getCognitiveGlyph(student.errorCategory);
  if (glyph) lines.push(`${glyph.glyph}: ${glyph.title}`);
  lines.push(student.currentPath ? `מסלול: ${radarPathLabelHe(student.currentPath)}` : 'מסלול: עדיין לא נקבע');
  lines.push(ctx.openMediation > 0 ? MEDIATION_HE.pendingCounter(ctx.openMediation) : 'אין אירועים לתיעוד');
  return lines;
}

/**
 * The record's refusedEvents, summed over the learner's devices: each device
 * writes its own count under refusedEvents/{device_id} (PRD Module 1 §א — a
 * previous device keeps sending its queue — and Module 17 §ב). Anything that
 * is not a positive whole number counts 0.
 */
export function refusedEventsOf(data: Record<string, unknown> | null | undefined): number {
  const raw = (data as { refusedEvents?: unknown } | null | undefined)?.refusedEvents;
  const countOf = (v: unknown) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  if (raw && typeof raw === 'object') return Object.values(raw as Record<string, unknown>).reduce<number>((sum, v) => sum + countOf(v), 0);
  return countOf(raw);
}

// Fixed 12-slot pilot structure (1 to 12) strictly without layout shifts
const INITIAL_MOCK_STUDENTS: AnonymousStudent[] = Array.from({ length: 12 }, (_, index) => {
  const studentNum = index + 1;
  return {
    id: `student_${studentNum}`,
    studentNumber: studentNum,
    displayName: `תלמיד ${studentNum}`,
    sessionNumber: 1,
    currentPath: null,
    status: 'active' as const,
    hesitationSeconds: 0,
    errorCount: 0,
    undoCount: 0,
    mistakeCount: 0,
    enhancedSupport: false,
    isStruggling: false,
    isSocraticActive: false,
    helpRequested: false,
    lastAction: '',
    isOnline: false,
  };
});

/**
 * מסמך העיצוב §1.1: מצב שמועבר בצבע חייב להגיע גם כטקסט מפורש.
 * התאים עצמם עומדים בזה חזותית (צבע + אייקון + תגית), אבל לקורא מסך הם
 * הוקראו כרצף תגיות בלי שם ובלי סדר. כאן נבנה משפט אחד שאומר על מי
 * מדובר ומה מצבו, באותו סדר עדיפויות שהתא מצייר.
 */
/**
 * PRD Module 18 §ב: GREY is also "a session not started". A learner who
 * finished meeting 2 and waits for the gate while the class is in meeting 3 or
 * later has not started it — the waiting screen holds them — yet the tile read
 * green "פעיל". The gate itself still never colours the tile (it has its own
 * row); this is only whether the learner's meeting has started.
 */
export function hasLearnerMeetingStarted(
  student: Pick<AnonymousStudent, 'isWaitingAtGate'>,
  isClassSessionActive: boolean,
  activeSessionNumber: number | null
): boolean {
  if (!isClassSessionActive) return false;
  return !(student.isWaitingAtGate && (activeSessionNumber ?? 0) >= 3);
}

export function describeRadarCell(
  student: AnonymousStudent,
  isSessionActive: boolean,
  hesitationThresholdSeconds: number
): string {
  const parts: string[] = [`תלמיד ${student.studentNumber}`];

  if (student.helpRequested) parts.push('קורא לעזרה');
  else if (student.isSocraticActive) parts.push(CARD_OPEN_HE);
  else if (!student.isOnline) parts.push('לא מחובר');
  else if (!isSessionActive) parts.push(student.isWaitingAtGate ? 'מחובר וממתין לאישור המסלול' : 'מחובר וממתין בלובי');
  else if (student.hesitationSeconds >= hesitationThresholdSeconds) {
    parts.push(`מהסס מעל ${hesitationThresholdSeconds} שניות`);
  } else if (student.activeBranch === 'challenge') parts.push('עובד על משימות אתגר');
  else if (student.activeBranch === 'reinforcement') parts.push('עובד על משימות ביסוס');
  else parts.push('פעיל ותקין');

  // PRD Module 18 §ב gives the tile's colour to activity, connection and help
  // alone; the gate is Module 20's, so it is said after the state, not instead.
  if (student.isWaitingAtGate) parts.push(`סיים אבחון וממתין ב${TEACHER_GATE_HE} לפני מפגש 3`);

  if (student.progress && isSessionActive) parts.push(tileProgressHe(student.progress));

  const glyph = getCognitiveGlyph(student.errorCategory);
  if (glyph) parts.push(glyph.title);
  if (student.enhancedSupport) parts.push('תמיכה מוגברת פעילה');
  if ((student.refusedEvents ?? 0) > 0) parts.push(`אירועים שנדחו: ${student.refusedEvents}`);

  parts.push('לחיצה פותחת את פרטי התלמיד');
  return parts.join('. ');
}

/**
 * The tile's "current path": the path the gate approved, read by the same rule
 * the learner's own client opens its bank by (recordLearningPath). The tile
 * used to say "המסלול הירוק" for every learner without the remediation flag —
 * also after a meeting-2 reset, a full learner reset or a system reset, when
 * there is no path at all (owner, 28.9.2026: never green by default).
 */
export function radarCurrentPathOf(record: Record<string, unknown> | null | undefined): 'ירוק' | 'צמצום פערים' | 'מדורג' | 'יסודות' | null {
  return radarPathOf(recordLearningPath(record));
}

/** A stored path as the radar's short value (owner, 11.10.2026: four paths), or null for none. */
function radarPathOf(path: unknown): 'ירוק' | 'צמצום פערים' | 'מדורג' | 'יסודות' | null {
  return path === 'remediation_path' ? 'צמצום פערים'
    : path === 'green_path' ? 'ירוק'
    : path === 'graded_path' ? 'מדורג'
    : path === 'graded_foundation_path' ? 'יסודות'
    : null;
}

/** The radar's short value back as the stored path. */
const STORED_PATH_OF_RADAR = {
  'ירוק': 'green_path',
  'צמצום פערים': 'remediation_path',
  'מדורג': 'graded_path',
  'יסודות': 'graded_foundation_path',
} as const;

type RadarPath = keyof typeof STORED_PATH_OF_RADAR;

/** A stored path as the radar's short value (the approve handler takes the radar's value). */
const RADAR_OF_STORED: Record<PedagogicalPath, RadarPath> = {
  green_path: 'ירוק',
  remediation_path: 'צמצום פערים',
  graded_path: 'מדורג',
  graded_foundation_path: 'יסודות',
};

/** The level's colour on a tile edge, by the radar's value (core/routeColors.ts, one map for every screen). */
function radarLevelColour(path: RadarPath | null | undefined) {
  return path ? ROUTE_COLOR[STORED_PATH_OF_RADAR[path]] : null;
}

/**
 * The learner's own two approve buttons at the gate (owner, 11.10.2026): the regular pair, or the graded pair
 * for a learner marked graded. The one the matrix recommends says "מומלץ" — a word, not a colour alone.
 */
function RadarApproveButtons({
  student,
  approvingStudentId,
  onApprove,
  inTile,
}: {
  student: AnonymousStudent;
  approvingStudentId: string | null;
  onApprove: (studentId: string, path: RadarPath) => void;
  /** On the tile: a smaller type. */
  inTile?: boolean;
}) {
  const recommended = student.recommendedPath && student.recommendedPath !== 'טרם נקבעה' ? STORED_PATH_OF_RADAR[student.recommendedPath] : null;
  const readOnly = useIsReadOnlyStaff();
  return (
    <>
      {routePairFor(student.gradedTrack === true).map((path) => {
        const isRecommended = recommended === path;
        return (
          <button
            key={path}
            type="button"
            data-testid={`radar-approve-${path}-${student.studentNumber}`}
            onClick={() => onApprove(student.id, RADAR_OF_STORED[path])}
            disabled={readOnly || Boolean(approvingStudentId)}
            aria-label={`${ROUTE_APPROVE_HE[path]}${isRecommended ? ` (${RECOMMENDED_MARK_HE})` : ''} — תלמיד ${student.studentNumber}`}
            title={readOnly ? READ_ONLY_TITLE : ROUTE_APPROVE_HE[path]}
            className={`min-h-11 px-2.5 py-1 rounded-lg ${inTile ? 'text-[11px]' : 'text-xs'} font-bold transition-colors cursor-pointer flex items-center gap-1 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed ${ROUTE_COLOR[path].buttonOn}`}
          >
            {approvingStudentId === student.id && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {/* PRD Module 20: the button says what it does — the approve label, also on the tile. */}
            <span>{ROUTE_APPROVE_HE[path]}</span>
            {isRecommended && (
              <span className="text-[10px] font-black px-1 py-0.5 rounded bg-white text-slate-800 border border-slate-300">{RECOMMENDED_MARK_HE}</span>
            )}
          </button>
        );
      })}
    </>
  );
}

/**
 * The research export's `files` (functions/src/exportDriveReport.ts): per file,
 * its Drive link, "failed: …", or — when Drive refused it and it waits in Cloud
 * Storage — the signed download link, or "נשמר באחסון: <path>" without one.
 */
export function classifyResearchExportFiles(files: unknown): {
  failed: string[];
  parked: { name: string; url: string | null }[];
} {
  const failed: string[] = [];
  const parked: { name: string; url: string | null }[] = [];
  if (!files || typeof files !== 'object') return { failed, parked };
  for (const [name, raw] of Object.entries(files as Record<string, unknown>)) {
    const value = String(raw ?? '');
    if (value.startsWith('failed:')) failed.push(name);
    else if (value.startsWith('https://drive.google.com/')) continue;
    else parked.push({ name, url: /^https:\/\//.test(value) ? value : null });
  }
  return { failed, parked };
}

/** Shown above the radar while the teacher's own computer has no connection. */
export const TEACHER_OFFLINE_RADAR_HE = 'המחשב שלכם לא מחובר לרשת. הרדאר מציג את המצב האחרון שהתקבל, ויתעדכן כשהחיבור יחזור.';

export const RESEARCH_EXPORT_RETRY_HE = 'ייצוא נתוני המחקר נכשל בגלל תקלה זמנית. נסו שוב בעוד כמה דקות.';

/**
 * What the teacher reads when the research export fails. Every failure used to
 * read "נסו שוב מאוחר יותר" unless the message held the Latin word "PII" —
 * which the server's Hebrew refusal never did — so a refusal no retry can fix
 * (the PII gate, audit M-export) sent the teacher to try again, and again.
 * Now: the PII refusal (details.reason "pii") and every other final refusal
 * show the server's own Hebrew sentence; only a transient failure asks for a
 * retry.
 */
export function describeResearchExportError(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  const code = String(e.code ?? '').replace(/^functions\//, '');
  const message = typeof e.message === 'string' ? e.message : '';
  const hebrew = /[א-ת]/.test(message);
  const details = e.details && typeof e.details === 'object' ? (e.details as Record<string, unknown>) : {};
  if (details.reason === 'pii') {
    return hebrew ? message : 'ייצוא נתוני המחקר נעצר: בקבצים נמצא מידע שנראה מזהה. שום קובץ לא נשלח. פנו למנהל המערכת.';
  }
  const finalCodes = new Set(['failed-precondition', 'invalid-argument', 'permission-denied', 'unauthenticated', 'not-found']);
  if (finalCodes.has(code)) {
    return hebrew ? message : code === 'permission-denied' || code === 'unauthenticated'
      ? 'אין לחשבון הזה הרשאה לייצא את נתוני המחקר.'
      : 'ייצוא נתוני המחקר נדחה.';
  }
  return RESEARCH_EXPORT_RETRY_HE;
}

interface HeatmapGridProps {
  /** Called when teacher clicks Drill Down — parent opens the learner drawer */
  onDrillDown?: (studentId: string) => void;
  initialStudents?: AnonymousStudent[];
}

/**
 * מודול 18: רדאר פדגוגי שקט (Silent Radar Module Spec)
 * רשת קבועה 3x4 עבור 12 תלמידי הפיילוט (מזהים 1-12 בלבד, אפס שמות/תמונות/ראשי תיבות).
 * צבעי רקע בזמן אמת עם מסנן 1000ms:
 * - ירוק: הלומד ביצע פעולה ב-45 השניות האחרונות
 * - צהוב: 45 שניות ומעלה ללא פעולה בטור הפעיל (בלי פער ביניהם: הדגל
 *   נכתב בשנייה ה-45 ומשם המשבצת צהובה)
 * - אדום: כרטיס חניכה סוקרטי פעיל
 * - אפור: מנותק / לא החל
 */
export function HeatmapGrid({ onDrillDown, initialStudents }: HeatmapGridProps = {}) {
  const [students, setStudents] = useState<AnonymousStudent[]>(initialStudents || INITIAL_MOCK_STUDENTS);
  const [selectedStudent, setSelectedStudent] = useState<AnonymousStudent | null>(null);
  // The resets' menu: closed on Escape and on a click outside it.
  const [resetMenuOpen, setResetMenuOpen] = useState(false);
  // Owner decision 11.10.2026: the menu opens for a read-only account; its resets do not.
  const readOnly = useIsReadOnlyStaff();
  // Measure 5 (owner, 11.10.2026): unrecorded mediation events per learner, as a number on the tile.
  const openMediationByLearner = openCountByLearner(useOpenMediationEvents());
  const resetMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!resetMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setResetMenuOpen(false); };
    const onDown = (e: MouseEvent) => {
      if (resetMenuRef.current && !resetMenuRef.current.contains(e.target as Node)) setResetMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [resetMenuOpen]);

  // Module 18 & Session Active state: Track active class session state
  const [isClassSessionActive, setIsClassSessionActive] = useState<boolean>(false);
  const [activeSessionNum, setActiveSessionNum] = useState<number | null>(null);

  // Module 26: keeps the shared calibration listener alive while this radar is
  // mounted. The throttled RTDB callback below reads the live value itself via
  // getHesitationThresholdSeconds() rather than this hook's return value,
  // since that callback is defined once inside a mount-only effect and would
  // otherwise close over a stale threshold.
  useHesitationThresholdSeconds();

  useEffect(() => {
    const sessionRef = ref(database, 'active_class_session');
    let lastVal: Record<string, unknown> | null = null;

    // 5-minute teacher-disconnect grace window (core/classSession.ts); the
    // interval re-evaluates expiry since it produces no server event.
    const applySessionState = () => {
      const live = isClassSessionLive(lastVal);
      setIsClassSessionActive(live);
      setActiveSessionNum(live && lastVal?.sessionNumber ? Number(lastVal.sessionNumber) : null);
    };

    const unsub = onValue(sessionRef, (snap) => {
      lastVal = snap.exists() ? snap.val() : null;
      applySessionState();
    });
    const graceTimer = setInterval(applySessionState, 30000);
    return () => {
      unsub();
      clearInterval(graceTimer);
    };
  }, []);

  // The teacher's own connection. With it down no heartbeat arrives, and the
  // server clock moving on alone turned the whole class grey ("מנותק") within
  // 12 seconds while the children worked. Now the radar says the teacher is
  // offline, and the tiles are judged at the time of the last data received.
  const [isTeacherOffline, setIsTeacherOffline] = useState(false);
  const teacherOfflineRef = useRef(false);
  const lastSnapshotClockRef = useRef<number | null>(null);
  useEffect(() => {
    // '.info/connected' is false until the first connection; that is not a drop.
    let connectedOnce = false;
    let rtdbConnected = true;
    const apply = () => {
      const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const offline = browserOffline || !rtdbConnected;
      teacherOfflineRef.current = offline;
      setIsTeacherOffline(offline);
    };
    const unsub = onValue(ref(database, '.info/connected'), (snap) => {
      const connected = snap.val() === true;
      if (connected) connectedOnce = true;
      rtdbConnected = connected || !connectedOnce;
      apply();
    });
    window.addEventListener('online', apply);
    window.addEventListener('offline', apply);
    apply();
    return () => {
      if (typeof unsub === 'function') unsub();
      window.removeEventListener('online', apply);
      window.removeEventListener('offline', apply);
    };
  }, []);

  // Module 21: recordings of earlier versions still on the learner records (see LegacyRecordingsButton).
  const [legacyRecordings, setLegacyRecordings] = useState(false);

  // The tile's clocks (owner, 11.10.2026): when this dashboard first saw each
  // learner's help call and open card. A help call also carries the stamp the
  // learner's client wrote with it (lastHelpTimestamp); the card has none.
  const helpSeenAtRef = useRef<Record<number, number>>({});
  const cardSeenAtRef = useRef<Record<number, number>>({});

  // Subscribe to live Firebase data and merge with 12 pilot student slots (sorted strictly by student ID 1..12)
  useEffect(() => {
    let throttleTimeout: NodeJS.Timeout | null = null;
    let pendingData: any = null;

    const flushThrottledData = () => {
      if (!pendingData) return;
      const rawData = pendingData;

      setStudents((prev) => {
        const updated = [...prev];
        // One clock for every learner: the server's — frozen at the last data
        // received while this computer is offline (see isTeacherOffline).
        const serverClockNow = teacherOfflineRef.current && lastSnapshotClockRef.current !== null
          ? lastSnapshotClockRef.current
          : serverNow();
        
        for (let i = 0; i < 12; i++) {
          const studentNum = i + 1;
          const uid = `student_${studentNum}`;
          
          // Gather all possible alias keys for this student slot (user1, student_user1, student_1, 1, slot_1)
          const userKey = `student_user${studentNum}`;
          const uKey = `user${studentNum}`;
          const numKey = String(studentNum);
          const slotKey = `slot_${studentNum}`;
          const stdKey = `student_${studentNum}`;
          
          const userObj = rawData[userKey] || {};
          const uObj = rawData[uKey] || {};
          const stdObj = rawData[stdKey] || {};
          const numObj = rawData[numKey] || {};
          const slotObj = rawData[slotKey] || {};

          // Prioritize the canonical student_user{num} candidate
          const primary = (userObj && userObj.isOnline !== undefined) ? userObj : (stdObj && stdObj.isOnline !== undefined ? stdObj : (numObj || {}));
          const data = { ...numObj, ...slotObj, ...stdObj, ...uObj, ...userObj, ...primary };
          
          // Strict real-time presence:
          // 1. Must NOT be explicitly offline
          // 2. Must have isOnline === true AND fresh heartbeat within 12 seconds (students ping every 4s)
          // lastPing is the server's stamp, so it is compared with the server
          // clock — never with this laptop's own (Module 18 §ג, core/presence.ts).
          const isExplicitlyOffline = data.isOnline === false || data.onlineStatus === 'offline';
          const isOnline = Boolean(!isExplicitlyOffline && data.isOnline === true && isHeartbeatFresh(data.lastPing, serverClockNow));

          const wsState = data.workspaceState || {};
          const sessionState = data.sessionState || {};
          const hesitationThreshold = getHesitationThresholdSeconds();
          // Module 18 §ב: YELLOW is a learner who is hesitating NOW. This used to
          // multiply a COUNT of past hesitations by the threshold: one pause kept
          // the tile yellow until the next exercise, a pause in the last
          // diagnostic task (traceData, never reset) kept it yellow in every later
          // meeting, and "השהייה: 90ש'" meant two events, not ninety seconds. The
          // learner's client raises the flag at the threshold and clears it on
          // the next cognitive action. The stamp is on the server clock
          // (useCognitiveHesitationRadar), so it is compared with the server
          // clock: a tablet clock off by a minute used to add a minute here.
          const hesitatingSince =
            data.hesitating?.hesitating === true && typeof data.hesitating?.timestamp === 'number'
              ? data.hesitating.timestamp
              : null;
          const hesitationSeconds = isOnline && hesitatingSince !== null
            ? hesitationThreshold + Math.max(0, Math.round((serverClockNow - hesitatingSince) / 1000))
            : 0;
          // The live meeting's own count. traceData.undo_clicks is written once,
          // at the end of the diagnostic, and is never reset: taking the larger
          // of the two kept meeting 2's number on the tile in every later meeting.
          const undoCount = isOnline ? wsState.undoCount || 0 : 0;
          const mistakeCount = isOnline ? sessionState.error_count || 0 : 0;
          // The struggle signal keeps its rule (Module 18): the larger of the two.
          const errorCount = Math.max(undoCount, mistakeCount);
          const isYellowPath = data.routeRecommendation === 'YELLOW' || sessionState.current_path === 'remediation_path';
          // Module 19: the profile is support_profile_id, which the server holds.
          // Quiet mode (isASD, register decision יב: "אינו הפרופיל") and the
          // addition-grid flags were counted as the profile too, so the radar
          // said "תמיכה מוגברת פעילה" of a learner whose screen, card and
          // report all said there was none.
          const enhancedSupport = hasEnhancedSupport(data);

          // PRD v7.1 Module 18: helpRequested (call-teacher) is its own BLUE signal,
          // separate from an active Socratic card (RED).
          const helpRequested = data.helpRequested === true || data.handRaised === true;
          const isSocraticActive = isOnline && (wsState.helpState === 'socratic' || data.isSocraticActive === true);
          const isStruggling = isOnline && (hesitationSeconds >= hesitationThreshold || isYellowPath || errorCount > 2 || enhancedSupport || isSocraticActive || helpRequested);
          // The tile's clock follows its colour: blue (a help call) first, then red (an open card).
          if (helpRequested) helpSeenAtRef.current[studentNum] ??= serverClockNow;
          else delete helpSeenAtRef.current[studentNum];
          if (isSocraticActive) cardSeenAtRef.current[studentNum] ??= serverClockNow;
          else delete cardSeenAtRef.current[studentNum];
          const helpSince = helpRequested ? stateSinceOf(data.lastHelpTimestamp, helpSeenAtRef.current[studentNum]) : null;
          const cardSince = isSocraticActive && !helpRequested ? cardSeenAtRef.current[studentNum] ?? null : null;

          const activeBroadcastSession = isClassSessionActive && activeSessionNum ? activeSessionNum : null;
          const rawSessionNum = wsState.sessionNumber || sessionState.session_number || activeBroadcastSession || (data.highestCompletedMeeting ? Math.min(8, data.highestCompletedMeeting + 1) : 1);
          const sessionNumber = Math.min(8, Math.max(1, Number(rawSessionNum) || 1));

          // A closed window and a dropped network look the same from here, so an
          // offline learner is "לא מחובר" — never "יצא מהחלון".
          let lastAction = 'לא מחובר';
          if (isOnline) {
            lastAction = data.lastAction || (isSocraticActive ? CARD_OPEN_HE : hesitationSeconds >= hesitationThreshold ? `${hesitationThreshold} שניות ומעלה ללא פעולה בטור הפעיל` : 'פעיל בלמידה');
          }

          const isWaitingAtGate = Boolean(
            (data.completedMeeting2 === true || data.highestCompletedMeeting >= 2) &&
            data.teacher_gate_approved !== true
          );
          // A learner with no recommendation on record has no recommendation.
          // This used to read "ירוק" for them — a green light the diagnostic
          // never gave, next to the approve button.
          // core/recommendedPath.ts: the diagnostic's own result. sessionState.current_path
          // is 'green_path' for everyone until the teacher approves, so it read
          // "המלצה: ירוק" for a learner who scored 29%.
          const diagnosticPath = recommendedPathOf(data);
          // A learner marked graded is recommended one of the two graded levels (owner, 11.10.2026).
          const recommendedPath: 'ירוק' | 'צמצום פערים' | 'מדורג' | 'יסודות' | 'טרם נקבעה' =
            radarPathOf(diagnosticPath) ?? 'טרם נקבעה';
          const errorCategory = data.error_category || data.errorCategory || wsState.aiSocraticHint?.error_category || wsState.errorCategory || null;
          // Module 18: classification distribution for the CURRENT session only
          const rawDistribution = data.errorCategoryDistribution?.[`session_${sessionNumber}`] || {};
          const errorCategoryDistribution = {
            calculation: Number(rawDistribution.calculation) || 0,
            procedural: Number(rawDistribution.procedural) || 0,
            conceptual: Number(rawDistribution.conceptual) || 0,
          };
          const activeBranch = data.selectedBranch || wsState.selectedBranch || null;

          const isCurrentlyInWorkspace = Boolean(isOnline && wsState.sessionNumber === sessionNumber);
          const status = (isCurrentlyInWorkspace && wsState.flowStatus === 'sessionDone')
            ? 'completed'
            : (data.isBoardLocked || sessionState.status === 'locked')
            ? 'locked'
            : 'active';

          updated[i] = {
            id: uid,
            studentNumber: studentNum,
            displayName: `תלמיד ${studentNum}`,
            sessionNumber,
            errorCategoryDistribution,
            currentPath: radarCurrentPathOf(data),
            status,
            hesitationSeconds,
            errorCount,
            undoCount,
            mistakeCount,
            enhancedSupport,
            isStruggling,
            isSocraticActive,
            helpRequested,
            errorCategory,
            lastAction,
            activeBranch,
            isOnline,
            isWaitingAtGate,
            recommendedPath,
            gradedTrack: data.graded_track === true,
            refusedEvents: refusedEventsOf(data),
            progress: activeBroadcastSession !== null ? tileProgressOf(data, activeBroadcastSession) : null,
            helpSince,
            cardSince,
            exercise: isOnline && wsState.activeTask && typeof wsState.activeTask.numberA === 'number' && typeof wsState.activeTask.numberB === 'number'
              ? { a: wsState.activeTask.numberA, b: wsState.activeTask.numberB, subtraction: wsState.activeTask.isSubtraction === true }
              : null,
          };
        }
        return updated;
      });
    };

    const studentsRef = ref(database, 'users/students');
    const unsubStudents = onValue(
      studentsRef,
      (snapshot) => {
        pendingData = snapshot.val() || {};
        lastSnapshotClockRef.current = serverNow();
        setLegacyRecordings(hasLegacyRecordings(pendingData));
        flushThrottledData();
      },
      (err) => {
        console.error('[HeatmapGrid] RTDB "users/students" listener error (Permission Denied or Network):', err);
      }
    );

    // Periodic heartbeat check (every 3 seconds) to immediately flag offline students
    const heartbeatTimer = setInterval(() => {
      if (pendingData) {
        flushThrottledData();
      }
    }, 3000);

    return () => {
      unsubStudents();
      clearInterval(heartbeatTimer);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
    // The tiles read activeSessionNum too (a learner whose workspace has no
    // meeting number shows the class's). Depending on isClassSessionActive
    // alone kept the old number after a direct switch from one open meeting to
    // another (3 → 5): the flag never changed, so the tiles said "מפגש 3".
  }, [isClassSessionActive, activeSessionNum]);

  // The hover card of one tile at a time: opens after ~250ms (500ms for a long press), closes at once.
  const [hoverTile, setHoverTile] = useState<number | null>(null);
  // The tiles grow with the free height (owner, 11.10.2026); a tall tile has room for the metrics row inline.
  const tilesRef = useRef<HTMLElement>(null);
  const [roomyTiles, setRoomyTiles] = useState(false);
  useEffect(() => {
    const el = tilesRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const tile = el.querySelector<HTMLElement>('[data-radar-color]');
      setRoomyTiles(tile !== null && tile.offsetHeight >= 120 && tile.offsetWidth >= 170);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openHoverSoon = (n: number, delay = 250) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverTile(n), delay);
  };
  const closeHover = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverTile(null);
  };
  useEffect(() => () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }, []);

  // A one-second clock only while a tile shows one (a blue or a red tile): the
  // digits change, the tile does not move (Module 18: nothing blinks or pulses).
  const anyClock = students.some((s) => s.helpSince != null || s.cardSince != null);
  const [clockNow, setClockNow] = useState(() => serverNow());
  useEffect(() => {
    if (!anyClock) return;
    setClockNow(serverNow());
    const id = setInterval(() => setClockNow(serverNow()), 1000);
    return () => clearInterval(id);
  }, [anyClock]);

  // Each tile's colour by the radar rule (Module 18 §ב), once — for the tile and for the
  // colour map's live counts beside the queue (owner, 11.10.2026).
  const tileColourOf = (student: AnonymousStudent) => resolveRadarColor({
    helpRequested: student.helpRequested,
    socraticActive: student.isSocraticActive,
    isOnline: Boolean(student.isOnline),
    hesitationSeconds: student.hesitationSeconds,
    hesitationThresholdSeconds: getHesitationThresholdSeconds(),
    sessionStarted: hasLearnerMeetingStarted(student, isClassSessionActive, activeSessionNum),
  });
  const colourCounts = { BLUE: 0, RED: 0, GREY: 0, YELLOW: 0, GREEN: 0 };
  for (const s of students) colourCounts[tileColourOf(s)]++;
  const countsKey = `${colourCounts.BLUE},${colourCounts.RED},${colourCounts.GREY},${colourCounts.YELLOW},${colourCounts.GREEN}`;
  useEffect(() => {
    useRadarColourMapStore.getState().setCounts({ ...colourCounts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey]);
  // A row of the colour map pressed: the tiles in that state get an outline (no colour change, no motion).
  const highlightColour = useRadarHighlight();

  const getPedagogicalRecommendations = (student: AnonymousStudent) => {
    if (student.errorCount >= 3 || student.lastAction?.includes('ללא פריטה')) {
      return {
        category: 'קושי בפריטה והמרה עשרונית',
        questions: [
          'איך אפשר לייצג את המספר בצורה נוספת באמצעות עשרות ויחידות?',
          'מה קורה כאשר מגיעים ל-10 יחידות בעמודת היחידות בבית המספרים?',
          'מדוע נדרש לפרוט עשרת אחת לפני שניתן לחסר מתוך עמודת היחידות?'
        ]
      };
    }
    if (student.hesitationSeconds >= getHesitationThresholdSeconds()) {
      return {
        category: `עומס קוגניטיבי / השהייה מעל ${getHesitationThresholdSeconds()} שניות`,
        questions: [
          'איזה צעד ראשון שקלתם לבצע? מה גורם לכם להתלבט בטור הפעיל?',
          'איזה כלי עזר בבית המספרים יכול לעזור לכם להתחיל?',
          'האם תרצו שנבדוק יחד דוגמה פשוטה יותר במספרים קטנים?'
        ]
      };
    }
    if (student.isSocraticActive) {
      return {
        category: CARD_OPEN_HE,
        questions: [
          'התלמיד מתמודד עם שאלת חקר מנחה.',
          'מומלץ לאפשר לו לחשוב עצמאית לפני התערבות פרונטלית.',
          'בדקו האם השאלה בכרטיס החניכה מכוונת אותו למקור השגיאה.'
        ]
      };
    }
    if (student.currentPath === 'צמצום פערים') {
      return {
        category: `${ROUTE_NAME_HE.remediation_path} - חיזוק תפיסת המבנה`,
        questions: [
          'מה מייצגת כל ספרה במספר הזה לפי עמודת הערך המקומי שלה?',
          'מה תפקיד הספרה 0 במספר? מה ישתנה אם נשמיט אותה?',
          'איך ניתן לבדוק את התוצאה שקיבלתם באמצעות חישוב הפוך?'
        ]
      };
    }
    return {
      // The route's name only when the gate approved it (never green by default).
      category: student.currentPath === 'ירוק' ? `שיח פדגוגי מעמיק (${ROUTE_NAME_HE.green_path})` : 'שיח פדגוגי מעמיק',
      questions: [
        'איזו אסטרטגיה בחרתם לפתרון הבעיה ומדוע היא יעילה בעיניכם?',
        'האם קיימת דרך נוספת להגיע לאותה התוצאה?',
        'איך תוכלו להסביר את תהליך הפתרון לחבר בכיתה?'
      ]
    };
  };

  const [isResettingClass, setIsResettingClass] = useState(false);
  const [isExportingDataset, setIsExportingDataset] = useState(false);

  const handleExportResearchDataset = async () => {
    setIsExportingDataset(true);
    try {
      const exportFn = httpsCallable(functions, 'exportResearchDataset', { timeout: 540_000 });
      // Owner decision (5.9.2026): the research is the whole process, so the
      // export covers every meeting of every learner, not just the live one.
      const res: any = await exportFn({ class_id: 'class_1', session_number: 'all' });
      if (res?.data?.status === 'SUCCESS') {
        const counts = res.data.rowCounts && typeof res.data.rowCounts === 'object'
          ? Object.entries(res.data.rowCounts as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(' · ')
          : '';
        // The server answers SUCCESS when at least ONE of the five files reached
        // Drive, and marks the others "failed: …" inside `files`. That list was
        // never read, so a teacher was told the export was saved while four of
        // its files were missing.
        const { failed: failedFiles, parked } = classifyResearchExportFiles(res.data.files);
        if (failedFiles.length > 0) {
          toast.error(`הייצוא נשמר חלקית בדרייב. קבצים שלא נשמרו: ${failedFiles.join(', ')}. הריצו את הייצוא שוב.`, { duration: 12000 });
        }
        // Register gap יב: a file Drive refused waits in Cloud Storage with a
        // week-long download link. It was reported as "saved in Drive", and
        // the links the server returned were never shown.
        if (parked.length > 0) {
          toast.warning('קובצי ייצוא שלא הגיעו לדרייב נשמרו באחסון הגיבוי של המערכת. הקישורים להורדה תקפים לשבוע.', {
            duration: Infinity,
            closeButton: true,
            description: (
              <ul className="mt-1 space-y-0.5">
                {parked.map((p) => (
                  <li key={p.name}>
                    {p.url
                      ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline font-bold">{p.name}</a>
                      : <span>{p.name}: שמור באחסון, בלי קישור להורדה</span>}
                  </li>
                ))}
              </ul>
            ),
          });
        }
        if (failedFiles.length === 0 && parked.length === 0) {
          toast.success(`ייצוא נתוני המחקר (כל המפגשים) נשמר בדרייב, תיקייה "02 נתוני מחקר". ${counts}`);
        }
      } else {
        toast.warning('הייצוא הסתיים אך ללא אישור מפורש מהשרת. בדקו את תיקיית Drive.');
      }
    } catch (err: any) {
      console.error('[Module 24] Research dataset export failed:', err);
      toast.error(describeResearchExportError(err), { duration: 12000 });
    } finally {
      setIsExportingDataset(false);
    }
  };

  const [approvingStudentId, setApprovingStudentId] = useState<string | null>(null);
  const approvingStudentIdRef = useRef<string | null>(null);

  const handleApproveGate = async (studentId: string, path: 'ירוק' | 'צמצום פערים' | 'מדורג' | 'יסודות') => {
    if (approvingStudentId || approvingStudentIdRef.current) return;
    approvingStudentIdRef.current = studentId;
    setApprovingStudentId(studentId);
    const num = studentId.replace(/\D/g, '') || '1';
    const storedPath = STORED_PATH_OF_RADAR[path];

    try {
      // PRD v7.1 Module 20: the session-2 SessionDocument in Firestore is the
      // sole source of truth — this quick-approve button used to write RTDB
      // aliases directly and never touch it, silently diverging from the
      // canonical record every other approval surface relies on. Route
      // through the one shared implementation instead.
      const teacherId = useAuthStore.getState().user?.uid || null;
      const result = await approveTeacherGate(studentId, storedPath, teacherId);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      useStore.getState().approveRoute(`student_user${num}`);
      useStore.getState().approveRoute(`student_${num}`);
      useStore.getState().approveRoute(num);

      toast.success(gateApprovedToastHe(num, storedPath));
    } catch (err) {
      console.error('Failed to approve gate:', err);
      toast.error(`שגיאה ב${TEACHER_GATE_HE}`);
    } finally {
      approvingStudentIdRef.current = null;
      setApprovingStudentId(null);
    }
  };

  const [isClassResetModalOpen, setIsClassResetModalOpen] = useState(false);
  const [isAlertsResetModalOpen, setIsAlertsResetModalOpen] = useState(false);
  const [isSessionResetModalOpen, setIsSessionResetModalOpen] = useState(false);
  const [isResettingSession, setIsResettingSession] = useState(false);
  const [isResettingAlerts, setIsResettingAlerts] = useState(false);

  const handleResetAllClass = () => {
    setIsClassResetModalOpen(true);
  };

  // The learner window reads the live list, not the copy taken when the tile
  // was clicked: the meeting, the path, the classifications and the questions
  // stayed as they were at the click until the window was reopened.
  const liveSelectedStudent = selectedStudent
    ? students.find((s) => s.id === selectedStudent.id) ?? selectedStudent
    : null;
  // מסמך העיצוב §1.2: Escape סוגר, והפוקוס נלכד בחלון וחוזר למשבצת בסגירה.
  const detailDrawerRef = useDismissableOverlay<HTMLDivElement>(Boolean(selectedStudent), () => setSelectedStudent(null));

  // Pending Teacher Gate students
  const pendingGateStudents = useMemo(() => students.filter(s => s.isWaitingAtGate), [students]);

  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0" dir="rtl">
      {/* Module 18: the radar's header — a plain toolbar row aligned to the grid, no card (owner, 11.10.2026: calm). */}
      <section className="shrink-0 flex flex-col">
        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap min-h-8">
            {/* The explanation is the heading's tooltip (owner, 11.10.2026): the tiles fit a 1366×768 screen. */}
            <h2 title={RADAR_EXPLANATION_HE} className="text-sm font-bold text-slate-900 dark:text-white tracking-tight flex items-baseline gap-2">
              <span>הרדאר הפדגוגי השקט</span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">12 תלמידים</span>
            </h2>

            <div className="flex items-center gap-2">
              {/* Module 24 §ב — teacher-triggered raw research dataset export.
                  exportResearchDataset already existed server-side; this was
                  the only UI affordance for it anywhere in the app. */}
              <button
                onClick={handleExportResearchDataset}
                disabled={isExportingDataset}
                className="px-2.5 py-1 min-h-8 rounded-lg border border-slate-200 hover:bg-slate-50 bg-white dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                title="ייצוא נתוני מחקר גולמיים ואנונימיים (טלמטריה, מפגשים, רפלקציות, לוג איפוסים) ל-Drive"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{isExportingDataset ? 'מייצא...' : 'ייצוא נתוני מחקר'}</span>
              </button>

              <LegacyRecordingsButton visible={legacyRecordings} />

              {/* The three resets sit behind one button (owner, 10.10.2026; PRD
                  Module 23א): the row shows only what the teacher uses during the
                  lesson, and the deleting actions are one deliberate click away.
                  Same buttons, same windows, same order (levels 1, 2, 3). */}
              <div ref={resetMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setResetMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={resetMenuOpen}
                  data-testid="reset-menu-button"
                  title="איפוס התראות, איפוס המפגש לכיתה ואיפוס כל נתוני הכיתה"
                  className="px-2.5 py-1 min-h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>הגדרות ואיפוס</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${resetMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {resetMenuOpen && (
                  <div
                    role="menu"
                    data-testid="reset-menu"
                    className="absolute z-30 top-full mt-2 right-0 w-64 flex flex-col gap-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl"
                  >
                    <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 px-1">איפוס נתונים</span>
              {/* Module 23א level 1 — Alerts Reset. Strictly separate from the
                  level-3 system reset; never merged into one action. */}
              <button
                onClick={() => { setResetMenuOpen(false); setIsAlertsResetModalOpen(true); }}
                disabled={readOnly || isResettingAlerts}
                className="w-full px-3 py-2.5 min-h-11 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                title={readOnly ? READ_ONLY_TITLE : "מוחק את הקריאות לעזרה ואת היסטוריית ההתראות. לא נוגע בנתוני הלמידה"}
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResettingAlerts ? 'animate-spin' : ''}`} />
                <span>{RESET_ACTION_HE.alerts}</span>
              </button>

              {/* Module 23א level 2, whole class (register, deviation 20): the
                  lesson that fell apart — restart the open meeting for all 12
                  learners at once. Earlier meetings stay; this is not level 3. */}
              {/* Only while a meeting is open (deviation 20; the server refuses
                  otherwise) — by the same liveness rule as the rest of the app. */}
              <button
                onClick={() => { setResetMenuOpen(false); setIsSessionResetModalOpen(true); }}
                disabled={readOnly || isResettingSession || !isClassSessionActive || !activeSessionNum}
                data-testid="class-session-reset-button"
                className="w-full px-3 py-2.5 min-h-11 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                title={readOnly ? READ_ONLY_TITLE : isClassSessionActive && activeSessionNum
                  ? 'מחזיר את כל 12 התלמידים לתחילת המפגש הפתוח. העבודה במפגשים האחרים נשמרת'
                  : 'אין מפגש פתוח לכיתה. אפשר לאפס את המפגש לכל הכיתה רק כשמפגש פתוח.'}
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResettingSession ? 'animate-spin' : ''}`} />
                <span>{RESET_ACTION_HE.classMeeting}</span>
              </button>

              <button
                onClick={() => { setResetMenuOpen(false); handleResetAllClass(); }}
                disabled={readOnly || isResettingClass}
                className="w-full px-3 py-2.5 min-h-11 rounded-xl border border-rose-300 hover:border-rose-500 bg-white hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                title={readOnly ? READ_ONLY_TITLE : "מוחק את כל נתוני הלמידה של 12 התלמידים, אחרי שנשמר גיבוי"}
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResettingClass ? 'animate-spin' : ''}`} />
                <span>{RESET_ACTION_HE.system}</span>
              </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* The colour key is the "מפת הצבעים" card under the action queue (owner, 11.10.2026): the strip here was crowded. */}
      </section>

      {isTeacherOffline && (
        <div role="status" data-testid="radar-teacher-offline" className="bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-2xl p-4 flex items-center gap-2.5 text-sm font-bold text-slate-800 dark:text-slate-100">
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{TEACHER_OFFLINE_RADAR_HE}</span>
        </div>
      )}

      {/* Progressive Disclosure: Contextual Teacher Gate Banner (Only when students are waiting) */}
      {pendingGateStudents.length > 0 && (
        <section className="bg-violet-50 dark:bg-violet-950/40 border-2 border-violet-300 dark:border-violet-800 rounded-2xl p-4 shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-violet-500" />
              <span className="font-extrabold text-sm text-violet-950 dark:text-violet-100 flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-violet-600" />
                {pendingGateStudents.length === 1 
                  ? `תלמיד ${pendingGateStudents[0].studentNumber} סיים את שלב האבחון וממתין ב${TEACHER_GATE_HE} לפני מפגש 3`
                  : `${pendingGateStudents.length} תלמידים סיימו את שלב האבחון וממתינים ב${TEACHER_GATE_HE} לפני מפגש 3`}
              </span>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {pendingGateStudents.map(st => {
                return (
                  <div key={st.id} className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2.5 min-h-11 rounded-xl border border-violet-200 dark:border-violet-800 shadow-xs">
                    <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">תלמיד {st.studentNumber}</span>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">המלצה: {radarPathLabelHe(st.recommendedPath)}</span>
                    <RadarApproveButtons student={st} approvingStudentId={approvingStudentId} onApprove={handleApproveGate} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Fixed 12-Slot CSS Grid (3x4) Without Layout Reflows.
          PRD Module 18 / מסמך 04 §3ב: the cells carry meaning in colour alone —
          nothing here blinks, moves or resizes. The pulses that used to sit on
          "מחובר" and "פעיל" ran on most of the class at once, so the quiet grid
          the teacher is meant to read at a glance was never quiet.
          PRD Module 18 §ב: "גריד קבוע של 3×4" — three rows of four, at every
          width. A breakpoint used to drop it to three columns (four rows) on a
          narrow screen, moving every tile from 4 on. */}
      <section
        ref={tilesRef}
        data-testid="radar-grid"
        className="grid grid-cols-4 gap-x-[clamp(10px,1.1vw,24px)] gap-y-[clamp(8px,0.9vw,20px)] w-full flex-1 min-h-0"
        style={{ gridTemplateRows: (['regular', 'graded'] as const)
          .map((g) => students.filter((s) => (s.gradedTrack === true) === (g === 'graded')).length)
          .filter((n) => n > 0)
          .map((n) => `auto repeat(${Math.ceil(n / 4)}, minmax(72px, 1fr))`)
          .join(' ') }}
      >
        {/* Owner, 11.10.2026: two groups, regular and special education (the graded mark, set before meeting 1, so a
            tile does not move during the meetings). In each group the tiles keep the number order, four to a row. */}
        {(['regular', 'graded'] as const).map((group) => {
          const members = students.filter((s) => (s.gradedTrack === true) === (group === 'graded'));
          if (members.length === 0) return null;
          return (
            <div key={group} data-testid={`radar-group-${group}`} className="contents">
              <h3 className={`col-span-4 self-end -mb-1 text-xs leading-snug font-semibold text-slate-500 dark:text-slate-400 ${group === 'graded' ? 'pt-1' : ''}`}>{LEARNER_GROUP_HE[group]} ({members.length})</h3>
        {/* Four columns that fill the width; the gap and the tile height follow the screen (owner, 11.10.2026):
            ~12px at 768, ~15px at 1366, ~18px at 1680, ~21px at 1920; the height leaves room for four rows. */}
        {/* One grid for both groups: four columns, equal rows that share the free height (owner, 11.10.2026). */}
        <div className="contents">
          {members.map((student) => {
            const hoverOpen = hoverTile === student.studentNumber;
            return (
              <div
                key={student.id}
                className="relative min-h-0"
                onMouseEnter={() => openHoverSoon(student.studentNumber)}
                onMouseLeave={closeHover}
                onFocus={() => openHoverSoon(student.studentNumber)}
                onBlur={closeHover}
                onTouchStart={() => openHoverSoon(student.studentNumber, 500)}
                onTouchEnd={() => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }}
              >
              <div
                role="button"
                tabIndex={0}
                aria-describedby={hoverOpen ? `tile-hover-${student.studentNumber}` : undefined}
                aria-label={describeRadarCell(student, hasLearnerMeetingStarted(student, isClassSessionActive, activeSessionNum), getHesitationThresholdSeconds())}
                onClick={() => setSelectedStudent(student)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedStudent(student);
                  }
                }}
                data-radar-color={tileColourOf(student)}
                data-highlighted={highlightColour !== null && tileColourOf(student) === highlightColour ? 'true' : undefined}
                // One cross-fade of the colour (300ms) and a 1px lift on hover — never a repeating pulse (Module 18).
                className={`h-full px-3 pb-2.5 pt-3.5 rounded-xl text-right transition-[background-color,border-color] duration-300 ease-out motion-reduce:transition-none flex flex-col justify-start gap-1.5 relative overflow-hidden hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer ${
                  // PRD Module 18 §ב: BLUE > RED > GREY > YELLOW > GREEN, and "the
                  // background colours remain driven strictly by activity timing,
                  // connection state, and help requests". Waiting at the teacher's
                  // gate (Module 20) is none of those, so it never colours the
                  // tile; it is shown in the gate table above and in its own row
                  // below (report 28.9.2026, מ.5).
                  RADAR_CELL_CLASSES[tileColourOf(student)]
                }${student.helpRequested ? ' ring-2 ring-blue-500 dark:ring-blue-400' : ''}${highlightColour !== null && tileColourOf(student) === highlightColour ? ' outline outline-[3px] outline-offset-2 outline-slate-900 dark:outline-slate-100' : ''}`}
              >
                {/* The approved level as a thin stripe on the tile's edge (core/routeColors.ts), next to its name in the
                    path tag below — never the background, which stays the status colour (PRD Module 18 §ב). */}
                {student.isOnline && student.currentPath && (
                  <span
                    aria-hidden="true"
                    data-testid={`tile-stripe-${student.studentNumber}`}
                    className={`absolute inset-y-0 right-0 w-[2px] ${radarLevelColour(student.currentPath)?.stripe ?? ''}`}
                  />
                )}
                {/* The status bar on the top edge (owner, 11.10.2026): 3px, only on the three states that need the teacher
                    (blue, red, yellow). A working tile has its small dot only; a grey tile stays muted. */}
                {(['BLUE', 'RED', 'YELLOW'] as RadarColor[]).includes(tileColourOf(student)) && (
                  <span aria-hidden="true" data-testid={`tile-bar-${student.studentNumber}`} className={`absolute inset-x-0 top-0 h-[3px] transition-colors duration-300 motion-reduce:transition-none ${RADAR_BAR_CLASSES[tileColourOf(student)]}`} />
                )}
                {/* Top Badge Row */}
                {/* The name on its own line and the status tag under it (owner, 11.10.2026): the tag never wraps on a laptop tile. */}
                <div className="flex flex-col items-start gap-1.5 w-full [&>span]:whitespace-nowrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`font-bold text-lg leading-none tabular-nums tracking-tight whitespace-nowrap ${tileColourOf(student) === 'GREY' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                      תלמיד {student.studentNumber}
                    </span>
                    {/* Module 18(e) Cognitive Glyph (ח/ר/מ) - static, unmoving, non-blinking */}
                    {(() => {
                      const glyphInfo = getCognitiveGlyph(student.errorCategory);
                      if (!glyphInfo) return null;
                      return (
                        <span
                          data-testid={`glyph-student-${student.studentNumber}`}
                          className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-black rounded bg-slate-900/10 dark:bg-white/10 text-slate-900 dark:text-slate-100 border border-slate-400/40 select-none"
                          title={glyphInfo.title}
                        >
                          {glyphInfo.glyph}
                        </span>
                      );
                    })()}
                    {/* Measure 5: events waiting to be recorded — a number, never a colour change of the tile. */}
                    {(openMediationByLearner[student.studentNumber] ?? 0) > 0 && (
                      <span
                        data-testid={`mediation-badge-${student.studentNumber}`}
                        title={MEDIATION_HE.pendingCounter(openMediationByLearner[student.studentNumber])}
                        className="inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-black rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 select-none"
                      >
                        {openMediationByLearner[student.studentNumber]}
                      </span>
                    )}
                  </div>
                  
                  {/* Status tag — help, card, connection and hesitation in the colour's order (Module 18): a yellow tile says "היסוס", also in a challenge or reinforcement branch; the gate has its own row below */}
                  {student.helpRequested ? (
                    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-100 text-[11px] leading-tight font-semibold px-1.5 py-0.5 rounded-md" title="קריאה לעזרה">
                      <BellRing className="w-3 h-3" aria-hidden="true" />
                      קריאה לעזרה
                    </span>
                  ) : student.isSocraticActive ? (
                    <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-100 text-[11px] leading-tight font-semibold px-1.5 py-0.5 rounded-md" title={CARD_OPEN_HE}>
                      <ShieldAlert className="w-3 h-3" />
                      {CARD_OPEN_HE}
                    </span>
                  ) : !student.isOnline ? (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[11px] leading-tight font-semibold px-1.5 py-0.5 rounded-md" title="לא מחובר">
                      <WifiOff className="w-3 h-3" aria-hidden="true" />
                      מנותק
                    </span>
                  ) : !isClassSessionActive ? (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[11px] leading-tight font-semibold px-1.5 py-0.5 rounded-md" title="מחובר וממתין בלובי">
                      בלובי
                    </span>
                  ) : !hasLearnerMeetingStarted(student, isClassSessionActive, activeSessionNum) ? (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[11px] leading-tight font-semibold px-1.5 py-0.5 rounded-md" title="מחובר וממתין לאישור המסלול">
                      ממתין לאישור מסלול
                    </span>
                  ) : student.hesitationSeconds >= getHesitationThresholdSeconds() ? (
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100 text-[11px] leading-tight font-semibold px-1.5 py-0.5 rounded-md" title={`היסוס > ${getHesitationThresholdSeconds()} שניות`}>
                      <AlertTriangle className="w-3 h-3" />
                      היסוס
                    </span>
                  ) : student.activeBranch === 'challenge' ? (
                    <span className="inline-flex items-center gap-1 border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200 text-[11px] leading-tight font-semibold px-1.5 py-0.5 rounded-md" title="מבצע משימות אתגר (לומד מהיר)">
                      <Rocket className="w-3 h-3" aria-hidden="true" />
                      משימות אתגר
                    </span>
                  ) : student.activeBranch === 'reinforcement' ? (
                    <span className="inline-flex items-center gap-1 border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200 text-[11px] leading-tight font-semibold px-1.5 py-0.5 rounded-md" title="מבצע משימות ביסוס">
                      <Shield className="w-3 h-3" aria-hidden="true" />
                      משימות ביסוס
                    </span>
                  ) : (
                    // The normal state is quiet (owner, 11.10.2026: management by exception): a small dot; the word for screen readers and the tooltip.
                    <span className="inline-flex items-center h-[18px]" title="פעיל ותקין">
                      <span aria-hidden="true" className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="sr-only">פעיל</span>
                    </span>
                  )}
                </div>

                {!student.isOnline ? (
                  <div className="flex flex-col justify-center items-center py-1 my-auto text-slate-500 dark:text-slate-400">
                    <span className="text-xs font-semibold">
                      {!isClassSessionActive ? 'אין מפגש פתוח' : 'לא מחובר כעת'}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Session & Path Info */}
                    <div className="flex flex-col gap-1 mt-auto">
                      {/* One line: the meeting truncates, its full name is the tooltip (owner, 11.10.2026: twelve tiles in 1366×768). */}
                      <div className="flex flex-nowrap items-center justify-between gap-1 text-[12px] font-medium text-slate-600 dark:text-slate-300 min-w-0">
                        {/* In the open meeting the bar above names it, so the tile says where the learner is in it
                            (owner, 11.10.2026); the meeting stays the tooltip. */}
                        {student.progress && isClassSessionActive && student.sessionNumber === activeSessionNum ? (
                          <span
                            data-testid={`tile-progress-${student.studentNumber}`}
                            title={meetingLabelHe(student.sessionNumber)}
                            className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1 ${student.progress.kind === 'finished' ? 'text-slate-800 dark:text-slate-100' : ''}`}
                          >
                            {student.progress.kind === 'finished' && <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />}
                            {tileProgressHe(student.progress)}
                          </span>
                        ) : (
                          <span className="truncate min-w-0" title={meetingLabelHe(student.sessionNumber)}>{meetingShortLabelHe(student.sessionNumber)}</span>
                        )}
                        {/* The wait since a help call (blue) or the time the card is open (red): digits only, no motion. */}
                        {student.helpSince != null ? (
                          <span data-testid={`tile-clock-${student.studentNumber}`} className="shrink-0 whitespace-nowrap tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                            {TILE_HE.waiting(elapsedClockHe(clockNow - student.helpSince))}
                          </span>
                        ) : student.cardSince != null ? (
                          <span data-testid={`tile-clock-${student.studentNumber}`} className="shrink-0 whitespace-nowrap tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                            {TILE_HE.cardOpen(elapsedClockHe(clockNow - student.cardSince))}
                          </span>
                        ) : null}
                        {/* No approved path, no path tag. */}
                        {student.currentPath && (
                          <span data-testid={`tile-path-${student.studentNumber}`} className="hidden min-[1440px]:inline min-w-0 truncate whitespace-nowrap text-[11px] font-normal text-slate-500 dark:text-slate-400">
                            {radarPathLabelHe(student.currentPath)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Real-Time Trace Metrics: inline when the tile is tall enough (it grows with the screen), and only the
                        ones that are not zero — no row of zeros on every tile (owner, 11.10.2026). The hover card keeps the full set. */}
                    {(() => {
                      const metrics = tileInlineMetricsHe(student);
                      if (metrics.length === 0) return null;
                      return (
                        <div data-testid={`tile-metrics-${student.studentNumber}`} className={`${roomyTiles ? 'flex' : 'hidden'} text-[11px] text-slate-600 dark:text-slate-300 flex-nowrap gap-x-3 items-center pt-1 border-t border-slate-200/70 dark:border-slate-800 font-medium tabular-nums overflow-hidden`}>
                          {metrics.map((m) => <span key={m} className="whitespace-nowrap">{m}</span>)}
                        </div>
                      );
                    })()}

                  </>
                )}

                {/* PRD Module 17 §ב: the teacher sees the count of refused
                    events on the learner card, only when there are any. */}
                {(student.refusedEvents ?? 0) > 0 && (
                  <div
                    data-testid={`refused-events-${student.studentNumber}`}
                    className="mt-1 text-[10px] font-bold text-slate-600 dark:text-slate-300"
                  >
                    אירועים שנדחו: {student.refusedEvents}
                  </div>
                )}

                {/* Module 20 on the tile: a row of its own, in the tile's own
                    colours — never the background (Module 18 §ב; report 28.9.2026,
                    מ.5). Shown whether or not the learner is connected. */}
                {student.isWaitingAtGate && (
                  <div
                    data-testid={`gate-row-student-${student.studentNumber}`}
                    className="mt-2 pt-2 border-t border-slate-300/80 dark:border-slate-600/80 flex flex-col gap-1 z-10"
                    onClick={e => e.stopPropagation()}
                  >
                    <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1" title={`ממתין ב${TEACHER_GATE_HE} לפני מפגש 3`}>
                      <DoorOpen className="w-3 h-3 shrink-0" />
                      <span className="min-w-0">
                        {TEACHER_GATE_HE} · המלצה: <span className="whitespace-nowrap">{radarPathLabelHe(student.recommendedPath)}</span>
                      </span>
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <RadarApproveButtons student={student} approvingStudentId={approvingStudentId} onApprove={handleApproveGate} inTile />
                    </div>
                  </div>
                )}
              </div>
              {/* The hover card (owner, 11.10.2026): after ~250ms of hover or on keyboard focus (a long press on
                  touch), over the tiles below — the tile's own width, so it never reaches the action queue, and
                  absolutely placed, so nothing moves. Data already on this screen only. */}
              {hoverOpen && (
                <div
                  id={`tile-hover-${student.studentNumber}`}
                  role="tooltip"
                  data-testid={`tile-hover-${student.studentNumber}`}
                  className="absolute z-30 top-full inset-x-0 mt-1.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg text-right pointer-events-none"
                >
                  <ul className="flex flex-col gap-1 text-xs leading-normal text-slate-700 dark:text-slate-200">
                    {tileHoverLinesHe(student, {
                      colour: tileColourOf(student),
                      thresholdSeconds: getHesitationThresholdSeconds(),
                      now: clockNow,
                      openMediation: openMediationByLearner[student.studentNumber] ?? 0,
                      inOpenMeeting: isClassSessionActive && student.sessionNumber === activeSessionNum,
                    }).map((line, i) => (
                      <li key={i} className={i === 0 ? 'text-sm font-extrabold text-slate-900 dark:text-slate-100' : ''}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              </div>
            );
          })}
        </div>
            </div>
          );
        })}
      </section>

      {/* Drill-Down View / Student Detail Drawer */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedStudent && liveSelectedStudent && (
            <motion.div
              key="student-detail-drawer-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-end"
            >
              <div
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
                onClick={() => setSelectedStudent(null)}
              />
              <motion.div 
                key="student-detail-drawer-panel"
                ref={detailDrawerRef}
                role="dialog"
                aria-modal="true"
                aria-label={`פרטי תלמיד ${selectedStudent.studentNumber}`}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                // The content scrolls and the actions stay in view: on a laptop
                // screen "פתיחת חלונית הלומד" and "סגירה" were below the fold.
                className="relative z-10 w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-r border-slate-200 dark:border-slate-800"
                dir="rtl"
              >
              <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 pb-4 md:pb-4">
                <div className="flex justify-between items-center pb-4 mb-6 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-violet-700 text-white font-black text-lg flex items-center justify-center shadow-lg shadow-violet-500/25">
                      {selectedStudent.displayName.replace('תלמיד ', '')}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                        {selectedStudent.displayName}
                      </h3>
                      <p className="text-xs text-slate-600 font-mono mt-0.5">
                        מזהה מערכת: {selectedStudent.id}
                      </p>
                    </div>
                  </div>

                  <button 
                    onClick={() => setSelectedStudent(null)}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:hover:text-white font-bold"
                  >
                    ✕ סגירה
                  </button>
                </div>

                {/* The tile is blue for a help call (Module 18 §ב); the window
                    opened from it said nothing of it. */}
                {liveSelectedStudent.helpRequested && (
                  <div role="status" className="mb-6 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex items-center gap-2 text-sm font-bold text-blue-900 dark:text-blue-200">
                    <BellRing className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
                    <span>התלמיד ביקש עזרה</span>
                  </div>
                )}

                {/* Measure 5 (owner, 11.10.2026): what the teacher did about this learner's events, recorded live. */}
                <MediationLogSection studentNumber={liveSelectedStudent.studentNumber} readOnly={readOnly} />

                {/* State Badges */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <span className="text-xs text-slate-600 font-bold block mb-1">מסלול למידה נוכחי</span>
                    <span data-testid="detail-current-path" className={`inline-flex text-base font-extrabold rounded-lg ${liveSelectedStudent.currentPath ? `px-2 py-0.5 ${radarLevelColour(liveSelectedStudent.currentPath)?.chip ?? ''}` : 'text-slate-600 dark:text-slate-400'}`}>
                      {liveSelectedStudent.currentPath ? radarPathLabelHe(liveSelectedStudent.currentPath) : 'עדיין לא נקבע'}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <span className="text-xs text-slate-600 font-bold block mb-1">התקדמות ברצף המפגשים</span>
                    <span className="text-base font-extrabold text-violet-600">
                      מפגש {liveSelectedStudent.sessionNumber} מתוך 8
                    </span>
                    {stationNameHe(liveSelectedStudent.sessionNumber) && (
                      <span className="block text-xs font-bold text-slate-600 mt-1">
                        אצל התלמידים: {stationNameHe(liveSelectedStudent.sessionNumber)}
                      </span>
                    )}
                  </div>
                </div>

                {/* PRD v7.1 Module 18: classification distribution for the current session,
                    so the teacher can tell a calculation slip from a conceptual gap. */}
                {(() => {
                  const dist = liveSelectedStudent.errorCategoryDistribution || { calculation: 0, procedural: 0, conceptual: 0 };
                  const total = dist.calculation + dist.procedural + dist.conceptual;
                  const rows = [
                    { key: 'calculation', glyph: 'ח', label: ERROR_CATEGORY_HE.calculation, count: dist.calculation, bar: 'bg-sky-500' },
                    { key: 'procedural', glyph: 'ר', label: ERROR_CATEGORY_HE.procedural, count: dist.procedural, bar: 'bg-violet-500' },
                    { key: 'conceptual', glyph: 'מ', label: ERROR_CATEGORY_HE.conceptual, count: dist.conceptual, bar: 'bg-rose-500' },
                  ];
                  return (
                    <div className="mb-6 p-4 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-baseline justify-between mb-3">
                        <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                          התפלגות סיווגי הטעות · {meetingShortLabelHe(liveSelectedStudent.sessionNumber)}
                        </span>
                        <span className="text-xs font-bold text-slate-600">{total} סיווגים</span>
                      </div>
                      {total === 0 ? (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          לא נרשמו סיווגי טעות עבור לומד זה במפגש הנוכחי.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {rows.map((row) => (
                            <div key={row.key} className="flex items-center gap-3">
                              <span
                                className="inline-flex items-center justify-center w-6 h-6 shrink-0 text-xs font-black rounded-md bg-slate-900/10 dark:bg-white/10 text-slate-900 dark:text-slate-100 border border-slate-400/40"
                                aria-hidden="true"
                              >
                                {row.glyph}
                              </span>
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex-1">{row.label}</span>
                              <div className="w-28 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                <div
                                  className={`h-full ${row.bar}`}
                                  style={{ width: `${total > 0 ? Math.round((row.count / total) * 100) : 0}%` }}
                                />
                              </div>
                              <span className="text-xs font-black text-slate-800 dark:text-slate-100 w-6 text-left">{row.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Pedagogical Recommendations */}
                {(() => {
                  const rec = getPedagogicalRecommendations(liveSelectedStudent);
                  return (
                    <div className="p-5 rounded-2xl bg-violet-50/70 dark:bg-slate-800/80 border border-violet-100 dark:border-slate-700 mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">💡</span>
                        <h4 className="font-extrabold text-sm text-violet-950 dark:text-violet-200">
                          {rec.category}
                        </h4>
                      </div>
                      <ul className="flex flex-col gap-2">
                        {rec.questions.map((q, i) => (
                          <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                            <span className="text-violet-500 font-bold">•</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>

              {/* Action Buttons */}
              <div className="shrink-0 px-6 md:px-8 py-4 border-t border-slate-200 dark:border-slate-800 flex gap-3">
                {onDrillDown && (
                  <button
                    onClick={() => {
                      const sid = selectedStudent.id;
                      setSelectedStudent(null);
                      onDrillDown(sid);
                    }}
                    className="flex-1 py-3 px-4 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-sm shadow-lg shadow-violet-600/25 active:scale-[0.97] transition-all text-center cursor-pointer"
                  >
                    פתיחת חלונית הלומד
                  </button>
                )}
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="py-3 px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 transition-all active:scale-[0.97] cursor-pointer"
                >
                  סגירה
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
      {/* Module 23א level 1 — alerts only; no backup required, audit still written */}
      <ResetConfirmationModal
        isOpen={isAlertsResetModalOpen}
        onClose={() => setIsAlertsResetModalOpen(false)}
        resetLevel="alerts"
        onConfirm={async (reason, reasonNote) => {
          setIsResettingAlerts(true);
          try {
            await useStore.getState().resetRadarAlerts(reason, reasonNote);
          } catch (err) {
            // The store already told the teacher why, once (the server's reason when it gave one).
            console.error('Alerts reset error:', err);
            throw err; // keep the dialog open — the reset did NOT happen
          } finally {
            setIsResettingAlerts(false);
          }
        }}
      />

      <ResetConfirmationModal
        isOpen={isSessionResetModalOpen}
        onClose={() => setIsSessionResetModalOpen(false)}
        resetLevel="single_student"
        resetTarget="class"
        activeSessionNumber={activeSessionNum}
        onConfirm={async (reason, reasonNote, options) => {
          setIsResettingSession(true);
          try {
            // The store toasts its own outcome, including the server's refusal
            // when no meeting is open.
            await useStore.getState().resetClassActiveSession(reason, reasonNote, options?.sessionNumber ?? 0);
          } catch (err) {
            console.error('Class session reset error:', err);
            throw err; // keep the dialog open — the reset did NOT happen
          } finally {
            setIsResettingSession(false);
          }
        }}
      />

      <ResetConfirmationModal
        isOpen={isClassResetModalOpen}
        onClose={() => setIsClassResetModalOpen(false)}
        resetLevel="system"
        onConfirm={async (reason, reasonNote) => {
          setIsResettingClass(true);
          try {
            // The store toasts its own outcome; the reason note now reaches the
            // immutable audit log for the most destructive reset too.
            await useStore.getState().resetEntireSystemUsageData(reason, reasonNote);
          } catch (err) {
            // The store already told the teacher why, once.
            console.error('Reset all error:', err);
            throw err; // keep the dialog open — the reset did NOT happen
          } finally {
            setIsResettingClass(false);
          }
        }}
      />
    </div>
  );
}
