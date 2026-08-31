import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { DragSource, Place, DropInput } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { PlaceValueBoard } from '@/features/workspace/board/PlaceValueBoard';
import { DienesBlock } from '@/features/workspace/board/DienesBlock';
import { useAuthStore } from '@/application/useAuthStore';
import { useNavigate, Navigate } from 'react-router-dom';
import { Logo } from '@/presentation/components/ui/Logo';
import { 
  ArrowRight, 
  Tv, 
  RotateCcw, 
  LogOut 
} from 'lucide-react';
import { ref, set } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

/**
 * מודול 15: מקרן כיתתי וארגז חול למורה (Classroom Projector & Sandbox)
 * מסך הדגמה ייעודי למורה בפריסה מלאה (Full Width) להקרנה על הלוח החכם.
 * כולל שידור חי למסכי התלמידים בזמן אמת (<1000ms), שליטה בטווחים, איפוס לוח וחזרה מהירה לדשבורד.
 */
export function ProjectorSandboxPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const applyDrop = useWorkspaceStore((s) => s.applyDrop);
  const initSession = useWorkspaceStore((s) => s.initSession);
  
  const [activeDrag, setActiveDrag] = useState<{ place: Place; source: DragSource; renderPlace?: Place } | null>(null);
  const [selectedRange, setSelectedRange] = useState<'1000' | '10000'>('1000');
  const [isBroadcasting, setIsBroadcasting] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // אתחול סשן נקי ללוח בהתאם לטווח הנבחר
  useEffect(() => {
    const targetSession = selectedRange === '1000' ? 1 : 3;
    initSession(targetSession, false);
  }, [selectedRange, initSession]);

  // סנכרון מצב שידור מקרן מול Firebase RTDB
  useEffect(() => {
    const projectorRef = ref(database, 'system_control/projector_mode');
    set(projectorRef, {
      projector_mode: isBroadcasting,
      projector_mode_updated_at: Date.now(),
      updated_by_teacher_id: user?.uid || 'teacher',
    }).catch(console.error);

    return () => {
      set(projectorRef, {
        projector_mode: false,
        projector_mode_updated_at: Date.now(),
        updated_by_teacher_id: user?.uid || 'teacher',
      }).catch(console.error);
    };
  }, [isBroadcasting, user?.uid]);

  const handleReturnToDashboard = () => {
    // שחרור מסכי התלמידים וחזרה לדשבורד
    const projectorRef = ref(database, 'system_control/projector_mode');
    set(projectorRef, {
      projector_mode: false,
      projector_mode_updated_at: Date.now(),
      updated_by_teacher_id: user?.uid || 'teacher',
    }).catch(console.error);

    navigate('/teacher');
  };

  const handleResetBoard = () => {
    const targetSession = selectedRange === '1000' ? 1 : 3;
    initSession(targetSession, false);
  };

  if (user?.role !== 'teacher' && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { place: Place; source: DragSource } | undefined;
    if (data) {
      const renderPlace = (data.place === 'units' && (data.source as string) === 'supply_tens') ? 'tens' : data.place;
      setActiveDrag({ ...data, renderPlace });
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    const data = active.data.current as { place: Place; source: DragSource } | undefined;
    
    const targetPlace = over?.data.current?.place as Place | undefined;
    
    if (data) {
      const dropInput: DropInput = {
        source: data.source,
        sourcePlace: data.place,
        target: targetPlace ? { kind: 'column', place: targetPlace } : { kind: 'trash' },
      };
      applyDrop(dropInput);
    }
  };

  return (
    <div dir="rtl" className="h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col overflow-hidden select-none">
      
      {/* ── Teacher Dedicated Projector Topbar ── */}
      <header className="h-16 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between z-30 shrink-0">
        
        {/* ימין: מיתוג וכותרת מקרן */}
        <div className="flex items-center gap-4">
          <Logo className="scale-90" />
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Tv className="w-5 h-5" />
            </span>
            <div>
              <h1 className="font-black text-base text-slate-800 dark:text-white leading-none">
                מקרן כיתתי — לוח הקניה והדגמה
              </h1>
              <p className="text-[11px] font-medium text-slate-400 leading-tight mt-0.5">
                מודול 15 • מצב סנדבוקס פתוח ללוח החכם
              </p>
            </div>
          </div>
        </div>

        {/* מרכז: בורר תחום מספרים + סטטוס שידור חי */}
        <div className="flex items-center gap-3">
          
          {/* בורר טווח 1000 / 10000 */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setSelectedRange('1000')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedRange === '1000'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              תחום ה-1,000 (מפגשים 1–2)
            </button>
            <button
              onClick={() => setSelectedRange('10000')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedRange === '10000'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              תחום ה-10,000 (מפגשים 3–8)
            </button>
          </div>

          {/* כפתור שידור חי לכיתה */}
          <button
            onClick={() => setIsBroadcasting(!isBroadcasting)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              isBroadcasting
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
            }`}
            title={isBroadcasting ? 'לחץ להשהיית השידור למסכי התלמידים' : 'לחץ להפעלת שידור ונעילת מסכי התלמידים'}
          >
            <span className={`w-2 h-2 rounded-full ${isBroadcasting ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>{isBroadcasting ? 'שידור פעיל (תלמידים בהמתנה)' : 'שידור מושהה (תלמידים פעילים)'}</span>
          </button>
        </div>

        {/* שמאל: כפתורי פעולה למורה (נקה לוח, חזרה לדשבורד, יציאה) */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleResetBoard}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all shadow-2xs"
            title="ניקוי כל הלבנים מהלוח"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>נקה לוח</span>
          </button>

          <button
            onClick={handleReturnToDashboard}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>חזרה לדשבורד המורה</span>
          </button>

          <button
            onClick={() => {
              handleReturnToDashboard();
              logout();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
            title="התנתק מהמערכת"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Full Width Projector Canvas Area ── */}
      <main className="flex-1 flex overflow-hidden p-6 bg-slate-100/70 dark:bg-slate-950">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="w-full h-full max-w-7xl mx-auto flex flex-col min-h-0">
            {/* בית המספרים בפריסה מלאה 100% */}
            <PlaceValueBoard fullWidth={true} />
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDrag ? (
              <div style={{ opacity: 0.9, transform: 'scale(1.05)' }}>
                <DienesBlock
                  id="drag-overlay"
                  source={activeDrag.source}
                  place={activeDrag.renderPlace || activeDrag.place}
                  isOverlay
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}
