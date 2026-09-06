/**
 * Module 23 — the class report of one meeting (owner decision, 6.9.2026,
 * register item 12): "צריך להיות בכל מפגש גם דו"ח תלמיד וגם דו"ח כיתה".
 *
 * The server (generateClassMeetingReport) measures for every learner what the
 * individual report measures for one, aggregates the class, asks the AI
 * engine for class-level patterns, and stores PDF + CSV + every number in
 * Firestore class_reports/{classId}_session_{N}. This service only reads that
 * document and asks for a (re)generation.
 */
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions, authReady } from '@/infrastructure/firebase';

export type RecommendationTier = 'below_50' | 'between_50_75' | 'above_75';

export const TIER_LABELS_HE: Record<RecommendationTier, string> = {
  below_50: 'קבוצה הומוגנית קטנה, תבניות עשר פיזיות (מתחת ל-50%)',
  between_50_75: 'קבוצה הטרוגנית, שיח עמיתים וחשבונייה (50%–75%)',
  above_75: 'עבודה עצמאית, לוח מחיק וכרטיסיות מספרים (מעל 75%)',
};

export interface ClassLearnerRow {
  studentId: number;
  learningPath: 'green_path' | 'remediation_path';
  scorePercent: number;
  scoreSource: string;
  tier: RecommendationTier;
  compulsoryTotal: number;
  correctFirstAttempt: number;
  exercisesAttempted: number;
  exercisesCompleted: number;
  events: number;
  activeMinutes: number;
  digitsEntered: number;
  wrongDigits: number;
  wrongDigitsByColumn: [number, number, number, number];
  deletions: number;
  undos: number;
  hesitations: number;
  hesitationSecondsTotal: number;
  regroupings: number;
  socraticCards: number;
  reflectionSubmitted: boolean;
  recordingMinutes: number;
  exerciseOutcomes: Record<string, 'first_try' | 'after_correction' | 'incomplete'>;
}

export interface ClassExerciseRow {
  exerciseId: string;
  attempted: number;
  completed: number;
  firstTry: number;
  firstTryPercent: number;
  wrongDigits: number;
  socraticCards: number;
  hesitations: number;
}

export interface ClassMeetingReport {
  reportId: string;
  classId: string;
  sessionNumber: number;
  generatedAt: number | null;
  telemetryEventCount: number;
  learnersWithData: number;
  learnersWithoutData: number[];
  scoreMean: number;
  scoreMedian: number;
  scoreMin: number;
  scoreMax: number;
  tiers: Record<RecommendationTier, number[]>;
  paths: { green_path: number; remediation_path: number };
  activeMinutesMean: number;
  recordingMinutesTotal: number;
  eventsTotal: number;
  digitsEnteredTotal: number;
  wrongDigitsTotal: number;
  wrongDigitsByColumn: { units: number; tens: number; hundreds: number; thousands: number };
  deletionsTotal: number;
  undosTotal: number;
  hesitationsTotal: number;
  hesitationSecondsTotal: number;
  regroupingsTotal: number;
  socraticCardsTotal: number;
  socraticTriggers: Record<string, number>;
  errorCategories: Record<string, number>;
  reflectionsSubmitted: number;
  exercises: ClassExerciseRow[];
  learners: ClassLearnerRow[];
  classPatterns: string[];
  teachingRecommendations: string[];
  aiAnalysisAvailable: boolean;
  pdfUrl: string | null;
  csvUrl: string | null;
  drivePdfUrl: string | null;
  driveCsvUrl: string | null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const numList = (v: unknown): number[] => (Array.isArray(v) ? v.map(num) : []);
const counts = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = num(val);
  return out;
};
const url = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function learnerFromData(d: Record<string, any>): ClassLearnerRow {
  const outcomes: ClassLearnerRow['exerciseOutcomes'] = {};
  if (d.exercise_outcomes && typeof d.exercise_outcomes === 'object') {
    for (const [k, v] of Object.entries(d.exercise_outcomes as Record<string, unknown>)) {
      if (v === 'first_try' || v === 'after_correction' || v === 'incomplete') outcomes[k] = v;
    }
  }
  const tier: RecommendationTier =
    d.recommendation_tier === 'below_50' || d.recommendation_tier === 'above_75' ? d.recommendation_tier : 'between_50_75';
  return {
    studentId: num(d.student_id),
    learningPath: d.learning_path === 'remediation_path' ? 'remediation_path' : 'green_path',
    scorePercent: num(d.score_percent),
    scoreSource: String(d.score_source ?? ''),
    tier,
    compulsoryTotal: num(d.compulsory_total),
    correctFirstAttempt: num(d.correct_first_attempt),
    exercisesAttempted: num(d.exercises_attempted),
    exercisesCompleted: num(d.exercises_completed),
    events: num(d.events),
    activeMinutes: num(d.active_minutes),
    digitsEntered: num(d.digits_entered),
    wrongDigits: num(d.wrong_digits),
    wrongDigitsByColumn: [num(d.wrong_digits_units), num(d.wrong_digits_tens), num(d.wrong_digits_hundreds), num(d.wrong_digits_thousands)],
    deletions: num(d.deletions),
    undos: num(d.undos),
    hesitations: num(d.hesitations),
    hesitationSecondsTotal: num(d.hesitation_seconds_total),
    regroupings: num(d.regroupings),
    socraticCards: num(d.socratic_cards),
    reflectionSubmitted: d.reflection_submitted === true,
    recordingMinutes: num(d.recording_minutes),
    exerciseOutcomes: outcomes,
  };
}

export function classReportFromData(d: Record<string, any>): ClassMeetingReport {
  const a = (d.aggregates && typeof d.aggregates === 'object' ? d.aggregates : {}) as Record<string, any>;
  const tiersRaw = (a.tiers && typeof a.tiers === 'object' ? a.tiers : {}) as Record<string, unknown>;
  const col = (a.wrong_digits_by_column && typeof a.wrong_digits_by_column === 'object' ? a.wrong_digits_by_column : {}) as Record<string, unknown>;
  const pathsRaw = (a.paths && typeof a.paths === 'object' ? a.paths : {}) as Record<string, unknown>;
  return {
    reportId: String(d.report_id ?? ''),
    classId: String(d.class_id ?? 'class_1'),
    sessionNumber: num(d.session_number),
    generatedAt: typeof d.generated_at === 'number' ? d.generated_at : null,
    telemetryEventCount: num(d.telemetry_event_count),
    learnersWithData: num(a.learners_with_data),
    learnersWithoutData: numList(a.learners_without_data),
    scoreMean: num(a.score_mean),
    scoreMedian: num(a.score_median),
    scoreMin: num(a.score_min),
    scoreMax: num(a.score_max),
    tiers: {
      below_50: numList(tiersRaw.below_50),
      between_50_75: numList(tiersRaw.between_50_75),
      above_75: numList(tiersRaw.above_75),
    },
    paths: { green_path: num(pathsRaw.green_path), remediation_path: num(pathsRaw.remediation_path) },
    activeMinutesMean: num(a.active_minutes_mean),
    recordingMinutesTotal: num(a.recording_minutes_total),
    eventsTotal: num(a.events_total),
    digitsEnteredTotal: num(a.digits_entered_total),
    wrongDigitsTotal: num(a.wrong_digits_total),
    wrongDigitsByColumn: { units: num(col.units), tens: num(col.tens), hundreds: num(col.hundreds), thousands: num(col.thousands) },
    deletionsTotal: num(a.deletions_total),
    undosTotal: num(a.undos_total),
    hesitationsTotal: num(a.hesitations_total),
    hesitationSecondsTotal: num(a.hesitation_seconds_total),
    regroupingsTotal: num(a.regroupings_total),
    socraticCardsTotal: num(a.socratic_cards_total),
    socraticTriggers: counts(a.socratic_triggers),
    errorCategories: counts(a.error_categories),
    reflectionsSubmitted: num(a.reflections_submitted),
    exercises: (Array.isArray(a.exercises) ? a.exercises : []).map((e: Record<string, any>) => ({
      exerciseId: String(e.exercise_id ?? ''),
      attempted: num(e.attempted),
      completed: num(e.completed),
      firstTry: num(e.first_try),
      firstTryPercent: num(e.first_try_percent),
      wrongDigits: num(e.wrong_digits),
      socraticCards: num(e.socratic_cards),
      hesitations: num(e.hesitations),
    })),
    learners: (Array.isArray(d.learners) ? d.learners : []).map(learnerFromData),
    classPatterns: strList(d.class_patterns),
    teachingRecommendations: strList(d.teaching_recommendations),
    aiAnalysisAvailable: d.ai_analysis_available === true,
    pdfUrl: url(d.pdf_url),
    csvUrl: url(d.csv_url),
    drivePdfUrl: url(d.drive_pdf_url),
    driveCsvUrl: url(d.drive_csv_url),
  };
}

/** The class report already produced for this meeting, if any. */
export async function fetchClassReport(sessionNumber: number, classId = 'class_1'): Promise<ClassMeetingReport | null> {
  await authReady;
  const snap = await getDoc(doc(firestore, 'class_reports', `${classId}_session_${sessionNumber}`));
  if (!snap.exists()) return null;
  return classReportFromData(snap.data() as Record<string, any>);
}

/** Asks the server to build (or rebuild) the class report of one meeting. Reads every event of the meeting; up to a minute. */
export async function generateClassReport(sessionNumber: number, classId = 'class_1'): Promise<ClassMeetingReport> {
  const call = httpsCallable(functions, 'generateClassMeetingReport', { timeout: 540_000 });
  const res = await call({ classId, sessionNumber });
  const data = (res.data ?? {}) as Record<string, any>;
  if (!data.report) throw new Error('השרת לא החזיר דוח כיתה');
  return classReportFromData(data.report);
}
