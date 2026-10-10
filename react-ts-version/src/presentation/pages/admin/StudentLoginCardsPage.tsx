import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/infrastructure/firebase";
import { PILOT_CLASS_NAME, PILOT_SCHOOL_NAME } from "@/core/pilotInstitution";
import { toast } from "sonner";

/**
 * כרטיסי כניסה להדפסה — PRD מודול 25 §ד ומסמך 04 ("מחולל כרטיסי כניסה להדפסה").
 * הכרעת בעל המוצר (26.9.2026): כרטיס לכל אחד מ-12 הלומדים, עם המספר בכיתה, קוד
 * הגישה, ושורה ריקה שבה המורה כותבת את שם התלמיד בכתב יד. השם אינו נשמר במערכת
 * ואין בדף הזה שום שדה להקלדתו (Zero-PII, מודול 3).
 *
 * התוויות זהות לאלה שבמסך הכניסה ("המספר שלי בכיתה", "קוד גישה"), כדי שהילד
 * יזהה על המסך את מה שכתוב לו על הכרטיס.
 *
 * לכל לומד קוד הגישה האישי שלו (מודול 1 §א, מודול 25 §ב.3 ו-§ד). מנהל המערכת
 * יכול לשנות כאן קוד של לומד ("קוד חדש"); הכפתור אינו מודפס.
 */
type CardsData = { studentIds: number[]; codes: Record<string, string> };

export function StudentLoginCardsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<CardsData | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleNewCode = async (studentId: number) => {
    setBusyId(studentId);
    try {
      const res = await httpsCallable<{ studentId: number }, { studentId: number; code: string }>(
        functions, "regenerateLearnerAccessCode"
      )({ studentId });
      setData((prev) => (prev ? { ...prev, codes: { ...prev.codes, [String(studentId)]: res.data.code } } : prev));
      toast.success(`לתלמיד ${studentId} נוצר קוד גישה חדש. הקוד הקודם אינו פעיל עוד.`);
    } catch {
      toast.error("יצירת הקוד החדש נכשלה. הקוד הקודם נשאר בתוקף.");
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    let alive = true;
    httpsCallable<unknown, CardsData>(functions, "getStudentLoginCards")()
      .then((res) => { if (alive) setData(res.data); })
      .catch(() => { if (alive) setError("לא ניתן לטעון את הכרטיסים. הדף פתוח למנהל המערכת בלבד."); });
    return () => { alive = false; };
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-white text-slate-900 p-6 print:p-0">
      <style>{`@media print { @page { size: A4; margin: 10mm; } .login-card { break-inside: avoid; } }`}</style>

      <div className="print:hidden flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-black flex-1">כרטיסי כניסה לתלמידים</h1>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data}
          className="h-11 px-6 rounded-full font-bold text-white bg-violet-600 disabled:opacity-50"
        >
          הדפסה
        </button>
        <button
          type="button"
          onClick={() => navigate("/admin/schools")}
          className="h-11 px-6 rounded-full font-bold border border-slate-300"
        >
          חזרה
        </button>
        <p className="w-full text-sm text-slate-600">
          המורה כותבת את שם התלמיד בכתב יד על הכרטיס. השם אינו נשמר במערכת.
        </p>
      </div>

      {error && <p role="alert" className="text-rose-700 font-bold">{error}</p>}
      {!data && !error && <p className="text-slate-600">טוען…</p>}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 print:grid-cols-3 gap-4 print:gap-3">
          {data.studentIds.map((id) => (
            <section
              key={id}
              data-testid="login-card"
              className="login-card border-2 border-dashed border-slate-400 rounded-xl p-4 flex flex-col gap-3"
            >
              <p className="text-sm font-bold text-slate-600">
                מתמטיקאור · {PILOT_SCHOOL_NAME} · כיתת {PILOT_CLASS_NAME}
              </p>
              <p className="text-base">
                שם התלמיד: <span aria-hidden="true" className="inline-block w-40 border-b border-slate-500 align-bottom" />
              </p>
              <p className="text-lg">
                המספר שלי בכיתה: <strong className="text-3xl font-black">{id}</strong>
              </p>
              <p className="text-lg">
                קוד גישה: <strong className="font-mono tracking-widest" dir="ltr">{data.codes[String(id)]}</strong>
              </p>
              <button
                type="button"
                onClick={() => handleNewCode(id)}
                disabled={busyId !== null}
                aria-label={`קוד חדש לתלמיד ${id}`}
                className="print:hidden self-start h-9 px-4 rounded-full text-sm font-bold border border-slate-300 disabled:opacity-50"
              >
                קוד חדש
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
