import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { Archive } from 'lucide-react';
import { functions } from '@/infrastructure/firebase';

/**
 * Module 21: moves screen recordings of earlier versions off the learner
 * records (core/legacyRecordings.ts). Shown only while such recordings exist,
 * so after one successful press it is gone for good. Nothing runs this on
 * deploy: the server backs the recordings up the way a reset does, copies,
 * checks the copy, and only then removes the old place (moveLegacyRecordings).
 */
export function LegacyRecordingsButton({ visible }: { visible: boolean }) {
  const [moving, setMoving] = useState(false);
  if (!visible) return null;

  const move = async () => {
    setMoving(true);
    try {
      const callable = httpsCallable(functions, 'moveLegacyRecordings', { timeout: 540_000 });
      const res: any = await callable({ class_id: 'class_1' });
      if (res?.data?.status === 'NOTHING_TO_MOVE') toast.info('אין הקלטות ישנות להעברה.');
      else if (Number(res?.data?.conflicts) > 0) {
        // Two aliases of one learner held different values for the same entry:
        // one was kept by a fixed rule, and every value is in the backup.
        toast.success('ההקלטות הישנות הועברו, ואפשר לצפות בהן כרגיל. בחלק מההקלטות היו שתי גרסאות שונות. נשמרה גרסה אחת, ושתיהן נמצאות בקובץ הגיבוי.');
      } else toast.success('ההקלטות הישנות הועברו. הגיבוי נשמר, ואפשר לצפות בהן כרגיל.');
    } catch (err: any) {
      console.error('[Module 21] moving the old recordings failed:', err);
      // The server's own sentence says what was saved and what stayed.
      const msg = typeof err?.message === 'string' && /[֐-׿]/.test(err.message) ? err.message : '';
      toast.error(msg || 'העברת ההקלטות נכשלה. לא נמחק דבר. נסו שוב מאוחר יותר.');
    } finally {
      setMoving(false);
    }
  };

  return (
    <button
      onClick={move}
      disabled={moving}
      data-testid="legacy-recordings-move"
      className="px-3 py-2.5 min-h-11 rounded-xl border border-slate-200 hover:border-slate-400 bg-slate-50/60 hover:bg-slate-100 dark:bg-slate-900/40 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
      title="הקלטות מסך מגרסה קודמת מאטות את פתיחת הלוח. הלחיצה מגבה אותן ומעבירה אותן למקום נפרד. אפשר לצפות בהן כרגיל גם אחרי ההעברה."
    >
      <Archive className={`w-3.5 h-3.5 ${moving ? 'animate-pulse' : ''}`} />
      <span>{moving ? 'מעבירים הקלטות...' : 'העברת הקלטות ישנות'}</span>
    </button>
  );
}
