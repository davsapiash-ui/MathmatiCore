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

interface AiStatus {
  checked_at: number;
  today: string;
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
  not_json: "לא JSON",
  invalid_request: "בקשה לא תקינה",
  auth: "כשל אימות מפתח",
  quota: "מכסה",
  network: "רשת",
  safety: "חסימת בטיחות",
  misconfigured: "מפתח חסר",
  unknown: "אחר",
};

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable<Record<string, never>, AiStatus>(functions, "getAiServiceStatus", { timeout: 15_000 });
      const res = await fn({});
      setStatus(res.data);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setError(code.includes("permission") ? "נדרש תפקיד צוות כדי לצפות במצב מנוע ה-AI." : "לא ניתן היה לקרוא את מצב מנוע ה-AI כרגע.");
    } finally {
      setLoading(false);
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
          מנוע החניכה הסוקרטית (Gemini)
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="רענון מצב מנוע ה-AI"
          className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
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
                : key.configured ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
            }`}>
              {keyOk ? <CheckCircle2 className="w-5 h-5" /> : key.configured ? <AlertTriangle className="w-5 h-5" /> : <MinusCircle className="w-5 h-5" />}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {key.configured ? "מפתח Gemini מחובר" : "מפתח Gemini חסר"}
                {key.key_hint ? <span className="font-mono text-xs text-slate-500 ms-2" dir="ltr">…{key.key_hint}</span> : null}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                מקור: {SOURCE_HE[key.source]} · מודל: <span className="font-mono" dir="ltr">{key.model_id}</span>
              </p>
              {key.problem && (
                <p className="text-xs text-amber-700 dark:text-amber-300" dir="ltr">{key.problem}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[{ title: `היום (${status.today})`, s: today }, { title: "מצטבר", s: total }].map(({ title, s }) => (
              <div key={title} className="p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/60 space-y-1.5">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{title}</p>
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  קריאות: <span className="font-black tabular-nums">{s?.calls ?? 0}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  תקינות: <span className="font-black tabular-nums">{s?.okRate ?? "—"}</span>
                  {s?.avg !== null && s?.avg !== undefined && (
                    <>
                      <span className="mx-2 text-slate-300">·</span>
                      זמן ממוצע: <span className="font-black tabular-nums">{(s.avg / 1000).toFixed(1)} שנ׳</span>
                    </>
                  )}
                </p>
                {s && s.fallbacks.length > 0 && (
                  <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                    {s.fallbacks.map((f) => (
                      <li key={f.outcome}>{f.label}: <span className="tabular-nums">{f.count}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {lastFailure && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              כשל אחרון: {OUTCOME_HE[lastFailure.outcome] ?? lastFailure.outcome}
              {lastFailure.detail ? <span dir="ltr" className="font-mono ms-1">({lastFailure.detail})</span> : null}
              {" · "}
              {new Date(lastFailure.at).toLocaleString("he-IL")}
            </p>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3 leading-relaxed">
            כל קריאה שאינה "תקינה" פירושה שהלומד קיבל את הכרטיס הסטטי המובנה (מודול 13 §4). המפתח מוחלף בפקודה
            <span className="font-mono mx-1" dir="ltr">firebase functions:secrets:set GEMINI_API_KEY</span>
            ולעולם אינו נחשף ללקוח.
          </p>
        </div>
      )}
    </AccessibleCard>
  );
}
