import { useState } from 'react';
import { UdlButton } from '@/presentation/design-system/UdlButton';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { useSilentRadar } from '@/application/useSilentRadar';
import { useAuthStore } from '@/application/useAuthStore';
import { database } from '@/infrastructure/firebase';
import { ref, update } from 'firebase/database';
import { BlockMath } from 'react-katex';

export function Meeting2Mapping() {
  const [taskIndex, setTaskIndex] = useState(0);
  const { registerInteraction } = useSilentRadar({ taskId: `mapping-task-${taskIndex + 1}` });
  const { user } = useAuthStore();
  
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

  const handleNext = async (isCorrect: boolean) => {
    registerInteraction();
    const newAnswers = { ...answers, [`task${taskIndex + 1}`]: isCorrect };
    setAnswers(newAnswers);

    if (taskIndex < 5) {
      setTaskIndex(taskIndex + 1);
    }

    // Save results to Firebase if this was the last task (or just update as we go)
    if (user) {
      await update(ref(database, `students/${user.uid}/qMatrixResults`), {
        [`task${taskIndex + 1}`]: isCorrect
      });
    }
  };

  if (taskIndex === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
        <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-8 flex items-center gap-4">
          משימה 1: ערך המקום והאפס
          <UdlSpeechButton text="משימה אחת: ערך המקום והאפס. מה מייצג האפס במספר שלוש מאות וארבע?" />
        </h2>
        <div className="text-6xl font-black text-indigo-600 mb-12 tracking-widest bg-white dark:bg-slate-900 px-12 py-6 rounded-3xl shadow-xl">
          304
        </div>
        <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 font-medium">מה מייצג האפס במספר זה?</p>
        <div className="flex flex-col gap-4 w-full max-w-lg">
          <UdlButton variant="outline" onClick={() => handleNext(false)} className="justify-start text-right px-6 py-4 text-lg">
            א. האפס אומר שאין למספר שום ערך.
          </UdlButton>
          <UdlButton variant="outline" onClick={() => handleNext(true)} className="justify-start text-right px-6 py-4 text-lg">
            ב. האפס שומר על המקום של העשרות, ומראה שאין עשרות בודדות.
          </UdlButton>
          <UdlButton variant="outline" onClick={() => handleNext(false)} className="justify-start text-right px-6 py-4 text-lg">
            ג. האפס אומר שהמספר קטן מאפס.
          </UdlButton>
        </div>
      </div>
    );
  }

  if (taskIndex === 1) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in slide-in-from-right-8 duration-500">
        <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-8 flex items-center gap-4">
          משימה 2: ישר המספרים
          <UdlSpeechButton text="משימה שתיים: ישר המספרים. מקם את המספר שבע מאות וחמישים על הישר." />
        </h2>
        <div className="w-full max-w-4xl bg-white dark:bg-slate-900 p-12 rounded-3xl shadow-xl mb-12">
          {/* Mock Number Line */}
          <div className="relative w-full h-4 bg-slate-200 dark:bg-slate-800 rounded-full mb-8">
            <div className="absolute left-0 -bottom-8 font-bold text-slate-500">0</div>
            <div className="absolute right-0 -bottom-8 font-bold text-slate-500">1,000</div>
            
            {/* Interactive draggable arrow would go here. For the prototype we mock the interaction */}
            <div className="absolute top-1/2 left-[75%] -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-indigo-500 rounded-full border-4 border-white shadow-lg cursor-pointer hover:scale-125 transition-transform" />
          </div>
        </div>
        <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 font-medium">גרור את החץ למיקום המקורב של המספר 750 (לצורכי הדגמה: לחץ על סיום)</p>
        <UdlButton semanticColor="primary" onClick={() => handleNext(true)} className="px-12">המשך</UdlButton>
      </div>
    );
  }

  if (taskIndex === 2) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in slide-in-from-right-8 duration-500">
        <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-8 flex items-center gap-4">
          משימה 3: פירוק גמיש
          <UdlSpeechButton text="משימה שלוש: הצג את המספר מאתיים וארבעים בשתי דרכים שונות." />
        </h2>
        <div className="text-6xl font-black text-emerald-600 mb-8 tracking-widest bg-white dark:bg-slate-900 px-12 py-6 rounded-3xl shadow-xl">
          240
        </div>
        <div className="flex gap-8 w-full max-w-4xl">
          <div className="flex-1 bg-white/50 dark:bg-slate-900/50 p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700">
            <h3 className="font-bold text-center mb-4">דרך 1 (רגילה)</h3>
            <div className="flex justify-center gap-2">
              <div className="w-16 h-16 bg-green-500 rounded-lg flex items-center justify-center text-white font-bold text-xl">100</div>
              <div className="w-16 h-16 bg-green-500 rounded-lg flex items-center justify-center text-white font-bold text-xl">100</div>
              <div className="w-4 h-16 bg-blue-500 rounded-sm"></div>
              <div className="w-4 h-16 bg-blue-500 rounded-sm"></div>
              <div className="w-4 h-16 bg-blue-500 rounded-sm"></div>
              <div className="w-4 h-16 bg-blue-500 rounded-sm"></div>
            </div>
          </div>
          <div className="flex-1 bg-white/50 dark:bg-slate-900/50 p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 opacity-50 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => handleNext(true)}>
            <h3 className="font-bold text-center mb-4">דרך 2 (גמישה) - לחץ לבחירה</h3>
            <p className="text-center text-slate-500">לדוגמה: 1 מאה ו-14 עשרות</p>
          </div>
        </div>
      </div>
    );
  }

  if (taskIndex === 3) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in slide-in-from-right-8 duration-500">
        <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-8 flex items-center gap-4">
          משימה 4: אבחון לאחור (חיבור)
          <UdlSpeechButton text="משימה ארבע: פתור את תרגיל החיבור מאה עשרים וארבע ועוד מאתיים שלושים ואחת." />
        </h2>
        <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl shadow-xl mb-8">
          <BlockMath math="124 + 231 = ?" />
        </div>
        <div className="flex gap-4">
          <UdlButton variant="outline" onClick={() => handleNext(false)} className="px-8 text-xl">345</UdlButton>
          <UdlButton semanticColor="primary" onClick={() => handleNext(true)} className="px-8 text-xl">355</UdlButton>
          <UdlButton variant="outline" onClick={() => handleNext(false)} className="px-8 text-xl">455</UdlButton>
        </div>
      </div>
    );
  }

  if (taskIndex === 4) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in slide-in-from-right-8 duration-500">
        <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-8 flex items-center gap-4">
          משימה 5: השינוי הקטן (אומדן)
          <UdlSpeechButton text="משימה חמש: אם ארבעים וחמש ועוד עשר שווה חמישים וחמש, מה התוצאה של ארבעים וחמש ועוד תשע?" />
        </h2>
        
        <div className="bg-slate-100 dark:bg-slate-800 p-8 rounded-2xl mb-8 w-full max-w-lg text-center">
          <p className="text-slate-500 mb-2 font-bold">ידוע ש:</p>
          <BlockMath math="45 + 10 = 55" />
        </div>

        <p className="text-2xl font-bold mb-8">מבלי לפתור בכתב, מה התוצאה של <span className="text-indigo-600" dir="ltr">45 + 9 = ?</span></p>

        <div className="flex gap-4">
          <UdlButton variant="outline" onClick={() => handleNext(false)} className="px-8 text-xl">56</UdlButton>
          <UdlButton semanticColor="primary" onClick={() => handleNext(true)} className="px-8 text-xl">54</UdlButton>
          <UdlButton variant="outline" onClick={() => handleNext(false)} className="px-8 text-xl">64</UdlButton>
        </div>
      </div>
    );
  }

  // Session Reflection (End of Meeting 2)
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-700">
      <div className="w-24 h-24 bg-gradient-to-tr from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-5xl shadow-2xl shadow-orange-500/40 mb-8">
        🎉
      </div>
      <h2 className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-4">
        כל הכבוד! סיימת את משימות המיפוי.
      </h2>
      <p className="text-xl text-slate-600 dark:text-slate-400 mb-12">ההשקעה וההתמדה שלך ראויות להערכה.</p>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-3xl shadow-xl w-full max-w-2xl">
        <h3 className="text-2xl font-bold mb-6 text-center">מה עזר לך להצליח היום? (רפלקציה)</h3>
        <div className="grid grid-cols-3 gap-4">
          <button className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
            <span className="text-4xl">🧊</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">הקוביות</span>
          </button>
          <button className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
            <span className="text-4xl">💡</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">הרמזים</span>
          </button>
          <button className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
            <span className="text-4xl">↩️</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">ביטול פעולה</span>
          </button>
        </div>
        
        <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800 text-center">
           <UdlButton semanticColor="primary" className="px-12 font-bold shadow-lg shadow-indigo-500/20" onClick={() => window.location.href = '/hub'}>
             חזור ללוח הראשי
           </UdlButton>
        </div>
      </div>
    </div>
  );
}
