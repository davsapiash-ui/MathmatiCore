import { useDroppable } from '@dnd-kit/core';
import { MathBlock } from './MathBlock';

interface MathBoardProps {
  ones: Array<{ id: string }>;
  tens: Array<{ id: string }>;
  hundreds: Array<{ id: string }>;
  thousands: Array<{ id: string }>;
}

export function MathBoard({ ones, tens, hundreds, thousands }: MathBoardProps) {
  const { setNodeRef: setOnesRef, isOver: isOverOnes } = useDroppable({
    id: 'droppable-ones',
    data: { type: 'ones-column' }
  });

  const { setNodeRef: setTensRef, isOver: isOverTens } = useDroppable({
    id: 'droppable-tens',
    data: { type: 'tens-column' }
  });

  const { setNodeRef: setHundredsRef, isOver: isOverHundreds } = useDroppable({
    id: 'droppable-hundreds',
    data: { type: 'hundreds-column' }
  });

  const { setNodeRef: setThousandsRef, isOver: isOverThousands } = useDroppable({
    id: 'droppable-thousands',
    data: { type: 'thousands-column' }
  });

  return (
    <div className="flex w-full max-w-6xl h-[600px] gap-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/20 relative" dir="ltr">
      
      {/* Thousands Column */}
      <div 
        ref={setThousandsRef}
        className={`flex-[1.5] rounded-2xl border-2 border-dashed transition-all p-4 flex flex-wrap content-start gap-4 
          ${isOverThousands ? 'bg-rose-50/50 dark:bg-rose-900/20 border-rose-400 scale-[1.02]' : 'border-slate-300 dark:border-slate-700'}`}
      >
        <h2 className="w-full text-center text-2xl font-black text-rose-500/30 select-none mb-2">אלפים</h2>
        {thousands.map((t) => (
          <MathBlock key={t.id} id={t.id} type="thousand" />
        ))}
        {thousands.length === 0 && !isOverThousands && (
          <div className="w-full text-center text-slate-400 mt-20 font-medium text-sm px-2">גרור 10 מאות לכאן כדי לחבר לאלף</div>
        )}
      </div>

      <div className="w-1 rounded-full bg-gradient-to-b from-transparent via-slate-300 dark:via-slate-700 to-transparent"></div>

      {/* Hundreds Column */}
      <div 
        ref={setHundredsRef}
        className={`flex-[1.5] rounded-2xl border-2 border-dashed transition-all p-4 flex flex-wrap content-start gap-4 
          ${isOverHundreds ? 'bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-400 scale-[1.02]' : 'border-slate-300 dark:border-slate-700'}`}
      >
        <h2 className="w-full text-center text-2xl font-black text-emerald-500/30 select-none mb-2">מאות</h2>
        {hundreds.map((h) => (
          <MathBlock key={h.id} id={h.id} type="hundred" />
        ))}
        {hundreds.length === 0 && !isOverHundreds && (
          <div className="w-full text-center text-slate-400 mt-20 font-medium text-sm px-2">גרור 10 עשרות לכאן כדי לחבר למאה</div>
        )}
      </div>

      <div className="w-1 rounded-full bg-gradient-to-b from-transparent via-slate-300 dark:via-slate-700 to-transparent"></div>

      {/* Tens Column */}
      <div 
        ref={setTensRef}
        className={`flex-1 rounded-2xl border-2 border-dashed transition-all p-4 flex flex-wrap content-start gap-2 
          ${isOverTens ? 'bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-400 scale-[1.02]' : 'border-slate-300 dark:border-slate-700'}`}
      >
        <h2 className="w-full text-center text-2xl font-black text-indigo-500/30 select-none mb-2">עשרות</h2>
        {tens.map((t) => (
          <MathBlock key={t.id} id={t.id} type="ten" />
        ))}
        {tens.length === 0 && !isOverTens && (
          <div className="w-full text-center text-slate-400 mt-20 font-medium text-sm px-2">גרור 10 יחידות לכאן כדי לחבר לעשרת</div>
        )}
      </div>

      {/* Visual Separator */}
      <div className="w-1 rounded-full bg-gradient-to-b from-transparent via-slate-300 dark:via-slate-700 to-transparent"></div>

      {/* Ones Column */}
      <div 
        ref={setOnesRef}
        className={`flex-1 rounded-2xl border-2 border-dashed transition-all p-4 flex flex-wrap content-start gap-2 
          ${isOverOnes ? 'bg-amber-50/50 dark:bg-amber-900/20 border-amber-400 scale-[1.02]' : 'border-slate-300 dark:border-slate-700'}`}
      >
        <h2 className="w-full text-center text-2xl font-black text-amber-500/30 select-none mb-2">יחידות</h2>
        {ones.map((o) => (
          <MathBlock key={o.id} id={o.id} type="one" />
        ))}
        {ones.length === 0 && !isOverOnes && (
          <div className="w-full text-center text-slate-400 mt-20 font-medium text-sm px-2">גרור עשרת לכאן כדי לפרוט ליחידות</div>
        )}
        
        {/* Helper visual: Show how close to 10 we are */}
        {ones.length > 0 && (
          <div className="absolute bottom-4 left-1/2 translate-x-1/2 w-full text-center pointer-events-none">
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${ones.length === 10 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {ones.length} / 10
            </span>
          </div>
        )}
      </div>
      
    </div>
  );
}
