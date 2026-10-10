import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { BrainCircuit, RefreshCw, CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { functions } from "@/infrastructure/firebase";

/**
 * Module 13 / Module 27 §ב.6 — the admin console's read-only view of the
 * Socratic AI engine, served by the getAiServiceStatus Cloud Function:
 * whether the Gemini key is bound (and where), whether it looks well-formed,
 * which model answers, and today's call counters. The key itself never
 * leaves Secret Manager; the server returns at most its last four characters.
 */
interface FeatureCounters {
  calls?: number;
  ok?: number;
  latency_sum_ms?: number;
  [outcome: string]: number | undefined;
}

interface AiTestResult {
  at: number;
  model_id: string;
  ok: boolean;
  latency_ms: number;
  error_code: string | null;
  error_detail: string | null;
  rate_limited?: boolean;
  /** The previous live test has not finished yet (the server's in-progress slot). */
  in_progress?: boolean;
}

/** What the children saw, from their own SOCRATIC_CARD_SHOWN events (7.10.2026). */
interface ShownCards {
  shown: number;
  ai: number;
  static: number;
  unknown: number;
  static_reasons: Record<string, number>;
}

interface AiStatus {
  checked_at: number;
  today: string;
  /** Absent when the server could not read the events. */
  shown?: { total: ShownCards; today: ShownCards; truncated: boolean };
  /** Present when the call asked for a live test (test_call: true). */
  test?: AiTestResult;
  key: {
    configured: boolean;
    source: "secret_manager" | "environment" | "none";
    well_formed: boolean;
    key_hint: string | null;
    model_id: string;
    problem: string | null;
  };
  counters: {
    updated_at?: number;
    totals?: Record<string, FeatureCounters>;
    daily?: Record<string, Record<string, FeatureCounters>>;
    last_failure?: Record<string, { at: number; outcome: string; detail: string | null }>;
    by_model?: Record<string, Record<string, FeatureCounters>>;
    last_test?: AiTestResult;
  } | null;
}

const SOURCE_HE: Record<AiStatus["key"]["source"], string> = {
  secret_manager: "Google Cloud Secret Manager",
  environment: "משתנה סביבה (אמולטור מקומי)",
  none: "לא מוגדר",
};

const OUTCOME_HE: Record<string, string> = {
  ok: "תשובות תקינות",
  timeout: "פסק זמן",
  schema_reject: "נדחו בסכימה",
  answer_leak: "נדחו — הדליפו תשובה",
  forbidden_term: "נדחו — מונח אסור",
  language_reject: "נדחו — ניסוח או מבנה שגויים, או מונח או פעולה שלא מופיעים במסך",
  frame_reject: "נדחו — חרגו מרמת הכרטיס",
  empty: "הניתוח הסתיים בלי ממצאים",
  not_json: "לא JSON",
  invalid_request: "בקשה לא תקינה",
  auth: "כשל אימות מפתח",
  quota: "מכסה",
  network: "רשת",
  safety: "חסימת בטיחות",
  misconfigured: "הגדרה שגויה (בדקו את מפתח ה-API ואת שם המודל)",
  unknown: "אחר",
};

/** Why a child saw the static card (SOCRATIC_CARD_SHOWN.card_fallback_reason). */
const FALLBACK_REASON_HE: Record<string, string> = {
  offline: "אין חיבור לאינטרנט",
  timeout: "המנוע לא ענה בזמן (8 שניות)",
  server_failed: "המנוע לא הצליח לכתוב כרטיס תקין",
  schema_rejected: "התשובה לא הייתה כרטיס שלם",
  rule_rejected: "הכרטיס נפסל בבדיקת הכללים במחשב הלומד",
  board_changed: "הלומד שינה את הלוח בזמן ההמתנה",
  not_coached: "תרגיל שהמנוע אינו מלווה",
  error: "תקלה אחרת במחשב הלומד",
  unrecorded: "הסיבה לא נרשמה (לפני 7.10.2026)",
};

/** Shown when "בדיקת חיבור למודל" is clicked while the previous live test still runs. */
const AI_TEST_IN_PROGRESS_HE = "הבדיקה הקודמת עוד לא הסתיימה. נסו שוב בעוד כמה שניות.";

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function summarizeFeature(c: FeatureCounters | undefined) {
  const calls = c?.calls ?? 0;
  const ok = c?.ok ?? 0;
  const avg = calls > 0 && c?.latency_sum_ms ? Math.round(c.latency_sum_ms / calls) : null;
  const fallbacks = Object.entries(c ?? {})
    .filter(([k, v]) => !["calls", "ok", "latency_sum_ms"].includes(k) && typeof v === "number" && v > 0)
    .map(([k, v]) => ({ outcome: k, label: OUTCOME_HE[k] ?? k, count: v as number }))
    .sort((a, b) => b.count - a.count);
  return { calls, ok, avg, fallbacks, okRate: pct(ok, calls) };
}

export function AiEngineStatusCard() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [testing, setTesting] = useState(false);
  const load = useCallback(async (testCall = false) => {
    if (testCall) setTesting(true);
    else setLoading(true);
    setError(null);
    try {
      // A live test makes one real, short model call on the server (staff only,
      // at most once per 30 seconds for the whole project).
      const fn = httpsCallable<{ test_call?: boolean }, AiStatus>(functions, "getAiServiceStatus", { timeout: testCall ? 25_000 : 15_000 });
      const res = await fn(testCall ? { test_call: true } : {});
      setStatus(res.data);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setError(code.includes("permission") ? "נדרש תפקיד צוות כדי לצפות במצב מנוע ה-AI." : "לא ניתן היה לקרוא את מצב מנוע ה-AI כרגע.");
    } finally {
      setLoading(false);
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const key = status?.key;
  const keyOk = Boolean(key?.configured && key?.well_formed);
  const today = status ? summarizeFeature(status.counters?.daily?.[status.today]?.socratic) : null;
  const total = status ? summarizeFeature(status.counters?.totals?.socratic) : null;
  const lastFailure = status?.counters?.last_failure?.socratic;

  return (
    <AccessibleCard className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-violet-500" />
          מנוע כרטיס החניכה (Gemini)
        </h2>
        <button
          type="button"
          onClick={() => load(false)}
          disabled={loading}
          aria-label="רענון מצב מנוע ה-AI"
          className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{error}</p>
      )}

      {status && key && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/60">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              keyOk ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : key.configured ? "bg-stone-500/10 text-stone-600 dark:text-stone-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
            }`}>
              {keyOk ? <CheckCircle2 className="w-5 h-5" /> : key.configured ? <AlertTriangle className="w-5 h-5" /> : <MinusCircle className="w-5 h-5" />}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {key.configured ? "מפתח Gemini מחובר" : "מפתח Gemini חסר"}
                {key.key_hint ? <span className="font-mono text-xs text-slate-600 ms-2" dir="ltr">…{key.key_hint}</span> : null}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                מקור: {SOURCE_HE[key.source]} · מודל: <span className="font-mono" dir="ltr">{key.model_id}</span>
              </p>
              {key.problem && (
                <p className="text-xs text-stone-700 dark:text-stone-300" dir="ltr">{key.problem}</p>
              )}
            </div>
          </div>

          {status.shown && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">מה הלומדים ראו בפועל (לפי הרישום אצל הלומדים)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[{ title: `היום (${status.today})`, c: status.shown.today }, { title: "מצטבר", c: status.shown.total }].map(({ title, c }) => (
                  <div key={title} className="p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950/60 space-y-1.5">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{title}</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200">
                      כרטיסים שהוצגו: <span className="font-black tabular-nums">{c.shown}</span>
                    </p>
                    {c.shown > 0 && (
                      <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                        <li>נכתבו על ידי הבינה: <span className="font-black tabular-nums">{c.ai}</span> ({pct(c.ai, c.shown)})</li>
                        <li>כרטיס גיבוי: <span className="font-black tabular-nums">{c.static}</span> ({pct(c.static, c.shown)})</li>
                        {c.unknown > 0 && <li>לא ידוע מי כתב (לפני 1.10.2026): <span className="tabular-nums">{c.unknown}</span></li>}
                      </ul>
                    )}
                    {c.static > 0 && (
                      <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5 border-t border-slate-100 dark:border-slate-800 pt-1.5">
                        {Object.entries(c.static_reasons).sort((a, b) => b[1] - a[1]).map(([reason, n]) => (
                          <li key={reason}>{FALLBACK_REASON_HE[reason] ?? reason}: <span className="tabular-nums">{n}</span></li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              {status.shown.truncated && (
                <p className="text-[11px] text-stone-700 dark:text-stone-300">נספרו 5,000 הכרטיסים הראשונים בלבד.</p>
              )}
            </div>
          )}

          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">קריאות למנוע (לפי השרת)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[{ title: `היום (${status.today})`, s: today }, { title: "מצטבר", s: total }].map(({ title, s }) => (
              <div key={title} className="p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/60 space-y-1.5">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{title}</p>
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  קריאות: <span className="font-black tabular-nums">{s?.calls ?? 0}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  תקינות: <span className="font-black tabular-nums">{s?.okRate ?? "—"}</span>
                  {s?.avg !== null && s?.avg !== undefined && (
                    <>
                      <span className="mx-2 text-slate-300">·</span>
                      זמן ממוצע: <span className="font-black tabular-nums">{(s.avg / 1000).toFixed(1)} שניות</span>
                    </>
                  )}
                </p>
                {s && s.fallbacks.length > 0 && (
                  <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                    {s.fallbacks.map((f) => (
                      <li key={f.outcome}>{f.label}: <span className="tabular-nums">{f.count}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/60">
            <button
              type="button"
              onClick={() => load(true)}
              disabled={testing || loading}
              className="px-3 py-1.5 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {testing ? "בבדיקה…" : "בדיקת חיבור למודל"}
            </button>
            {(() => {
              const t = status.test ?? status.counters?.last_test;
              if (!t) return <span className="text-xs text-slate-600 dark:text-slate-400">הבדיקה שולחת למודל בקשה אמיתית אחת ומראה אם הוא עונה עכשיו.</span>;
              // A click while the previous test still runs is not a failure of the engine.
              if (t.in_progress || t.error_code === "in_progress") {
                return <span role="status" className="text-sm text-slate-600 dark:text-slate-300">{AI_TEST_IN_PROGRESS_HE}</span>;
              }
              return (
                <span className={`text-sm ${t.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                  {t.ok ? "המנוע ענה" : `המנוע לא ענה: ${OUTCOME_HE[t.error_code ?? ""] ?? t.error_code ?? ""}`}
                  {" · "}
                  <span className="tabular-nums">{(t.latency_ms / 1000).toFixed(1)} שניות</span>
                  {" · "}
                  <span className="font-mono text-xs" dir="ltr">{t.model_id}</span>
                  {" · "}
                  {new Date(t.at).toLocaleString("he-IL")}
                  {t.rate_limited ? " (תוצאת הבדיקה האחרונה. אפשר לבדוק שוב 30 שניות אחרי הבדיקה הקודמת)" : ""}
                  {!t.ok && t.error_detail ? <span className="block text-[11px] font-mono" dir="ltr">{t.error_detail}</span> : null}
                </span>
              );
            })()}
          </div>

          {lastFailure && (
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              כשל אחרון: {OUTCOME_HE[lastFailure.outcome] ?? lastFailure.outcome}
              {lastFailure.detail ? <span dir="ltr" className="font-mono ms-1">({lastFailure.detail})</span> : null}
              {" · "}
              {new Date(lastFailure.at).toLocaleString("he-IL")}
            </p>
          )}

          <p className="text-[11px] text-slate-600 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3 leading-relaxed">
            קריאה שאינה "תקינה" פירושה שהלומד קיבל את כרטיס הגיבוי. גם קריאה תקינה יכולה להסתיים בכרטיס גיבוי: אם התשובה הגיעה אחרי 8 שניות, נפסלה בבדיקה במחשב הלומד, או שהלומד שינה את הלוח בזמן ההמתנה. לכן המספר המדויק של מה שהלומדים ראו הוא זה שלמעלה. המפתח מוחלף בפקודה
            <span className="font-mono mx-1" dir="ltr">firebase functions:secrets:set GEMINI_API_KEY</span>
            ולעולם אינו נחשף ללקוח.
          </p>
        </div>
      )}
    </AccessibleCard>
  );
}
