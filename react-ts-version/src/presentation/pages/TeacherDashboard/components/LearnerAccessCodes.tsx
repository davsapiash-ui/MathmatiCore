import { useEffect, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/infrastructure/firebase';
import { toast } from 'sonner';

/**
 * קודי הגישה האישיים — PRD מודול 1 §א ומודול 25 §ב.3: לכל לומד קוד בן 4 ספרות.
 * הרשימה גלויה למורה ולמנהל המערכת, וכל אחד מהם יכול לשנות קוד של לומד.
 * הקודים נשמרים בשרת בלבד ומגיעים מפונקציות הענן; הדפדפן אינו שומר אותם.
 */
type CodesResponse = { classId: string; codes: Record<string, string> };
type RegenerateResponse = { studentId: number; code: string };

export function LearnerAccessCodes() {
  const [codes, setCodes] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    httpsCallable<unknown, CodesResponse>(functions, 'getLearnerAccessCodes')()
      .then((res) => { if (alive) setCodes(res.data.codes); })
      .catch(() => { if (alive) setError('לא ניתן לטעון את קודי הגישה. נסו שוב בעוד רגע.'); });
    return () => { alive = false; };
  }, []);

  const handleNewCode = async (studentId: number) => {
    setBusyId(studentId);
    try {
      const res = await httpsCallable<{ studentId: number }, RegenerateResponse>(functions, 'regenerateLearnerAccessCode')({ studentId });
      setCodes((prev) => ({ ...(prev ?? {}), [String(studentId)]: res.data.code }));
      toast.success(`לתלמיד ${studentId} נוצר קוד גישה חדש. הקוד הקודם אינו פעיל עוד.`);
    } catch {
      toast.error('יצירת הקוד החדש נכשלה. הקוד הקודם נשאר בתוקף.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none">
      <div className="mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-violet-600" />
          קודי גישה
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          לכל תלמיד קוד גישה אישי בן 4 ספרות. מסרו לכל תלמיד את הקוד שלו. אחרי "קוד חדש" הקוד הקודם אינו פעיל עוד.
        </p>
      </div>

      {error && <p role="alert" className="text-rose-700 dark:text-rose-300 font-bold text-sm">{error}</p>}
      {!codes && !error && <p className="text-slate-600 dark:text-slate-300 text-sm">טוען…</p>}

      {codes && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((id) => (
            <li
              key={id}
              data-testid="learner-access-code"
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex flex-col gap-2"
            >
              <span className="font-black text-sm text-slate-900 dark:text-white">תלמיד {id}</span>
              <span className="font-mono text-2xl font-black tracking-widest text-slate-900 dark:text-white" dir="ltr">
                {codes[String(id)] ?? '----'}
              </span>
              <button
                type="button"
                onClick={() => handleNewCode(id)}
                disabled={busyId !== null}
                aria-label={`קוד חדש לתלמיד ${id}`}
                className="w-full py-2 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 bg-white hover:bg-violet-50 text-violet-700 border border-violet-200 dark:bg-slate-800 dark:text-violet-300 dark:border-violet-800 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyId === id ? 'animate-spin' : ''}`} />
                <span>קוד חדש</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
