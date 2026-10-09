import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { DragSource, Place, DropInput } from '@/core/placeValue';
import { useWorkspaceStore, type SessionNumber } from '@/application/useWorkspaceStore';
import { PlaceValueBoard } from '@/features/workspace/board/PlaceValueBoard';
import { DienesBlock } from '@/features/workspace/board/DienesBlock';
import { DemoTaskCard } from '@/features/workspace/tasks/DemoTaskCard';
import { BOARD_ZONE_FLEX, TASK_ZONE_FLEX, TASK_ZONE_CELL_CLASS } from '@/features/workspace/workspaceZones';
import { TEACHER_DEMOS, NO_DEMO_HE, isDemoStation } from '@/data/teacherDemos';
import { useAuthStore } from '@/application/useAuthStore';
import { useNavigate, Navigate } from 'react-router-dom';
import { Logo } from '@/presentation/components/ui/Logo';
import { LogoutButton } from '@/presentation/components/ui/LogoutButton';
import {
  ArrowRight,
  Tv,
  RotateCcw,
  Eraser,
  RefreshCw
} from 'lucide-react';
import { ref, set, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

const STATIONS: SessionNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

const SEGMENT_CLASS = (on: boolean) =>
  `px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
    on
      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
  }`;
const CONTROL_CLASS =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * מודול 15 §ג: מסך ההדגמה של המורה (owner, 9.10.2026), shown on the class's
 * board. The teacher picks a station (1–8):
 *   - station 1: an empty number house and its blocks (the 1,000 range), the
 *     column digits shown, to demonstrate the tools;
 *   - stations 3–7: the station's demonstration exercise (data/teacherDemos.ts)
 *     — the task card as the learners see it, beside the board (the 10,000
 *     range: the thousands column), with the result row, the memory circles,
 *     typing and undo. The teacher does every action herself;
 *   - stations 2 and 8: no demonstration (מסמכים 02 ו-03), and no board.
 * Demo mode (projectorBoard in the workspace store): nothing is checked,
 * locked, coached, advanced, read aloud or recorded. The chosen station is
 * this window's own state: it is not broadcast and not written anywhere.
 * The broadcast to the learners' screens is unchanged (system_control/projector_mode).
 */
export function ProjectorSandboxPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const applyDrop = useWorkspaceStore((s) => s.applyDrop);
  const undo = useWorkspaceStore((s) => s.undo);
  const canUndo = useWorkspaceStore((s) => s.undoStack.length > 0);
  const startProjectorDemo = useWorkspaceStore((s) => s.startProjectorDemo);
  const clearProjectorBoard = useWorkspaceStore((s) => s.clearProjectorBoard);

  const [activeDrag, setActiveDrag] = useState<{ place: Place; source: DragSource; renderPlace?: Place } | null>(null);
  const [station, setStation] = useState<SessionNumber>(1);
  const [partIdx, setPartIdx] = useState(0);
  const parts = isDemoStation(station) ? TEACHER_DEMOS[station] : [];
  const part = parts[partIdx] ?? null;
  const hasBoard = station === 1 || part !== null;
  // Opening this page used to start broadcasting immediately: preparing a demo
  // mid-lesson blanked all twelve screens before the teacher had arranged
  // anything. Broadcasting now starts when she says so.
  //
  // The badge used to show a local flag the button flipped: it stayed green
  // after a write the server refused, and after the connection dropped and the
  // server released the class. It now shows the flag as read back from the
  // database, and says so when this window has lost its connection.
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [broadcastError, setBroadcastError] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  // Demo mode for as long as this page is open (useWorkspaceStore.projectorBoard).
  useEffect(() => {
    useWorkspaceStore.setState({ projectorBoard: true });
    return () => useWorkspaceStore.setState({ projectorBoard: false });
  }, []);

  // Each station and part starts from its beginning: an empty board, nothing typed.
  useEffect(() => {
    startProjectorDemo(station);
  }, [station, partIdx, startProjectorDemo]);

  const chooseStation = (next: SessionNumber) => {
    setStation(next);
    setPartIdx(0);
  };

  // סנכרון מצב שידור מקרן מול Firebase RTDB
  useEffect(() => {
    const projectorRef = ref(database, 'system_control/projector_mode');
    // Learners ignore an update whose timestamp is not newer than the last one
    // they saw (out-of-order guard). The release used to take Date.now() HERE,
    // before the broadcast below took its own — so the release was never newer:
    // closing the projector tab released the flag on the server, every learner
    // discarded it as stale and stayed on "הקשיבו להסבר…" until a page reload.
    // All three writes now carry the server's clock, read at write time.
    const release = {
      projector_mode: false,
      projector_mode_updated_at: serverTimestamp(),
      updated_by_teacher_id: user?.uid || 'teacher',
    };

    // What the database holds is what the badge shows.
    const unsubscribeMode = onValue(
      projectorRef,
      (snap) => {
        const val = snap.val();
        setIsBroadcasting(typeof val === 'object' && val !== null ? Boolean(val.projector_mode) : Boolean(val));
      },
      (err) => console.warn('[Projector] broadcast state listener notice:', err)
    );

    // Closing the tab is the natural way to finish — and a React cleanup does
    // not run for that, nor for a laptop going to sleep or the network
    // dropping. Without this the flag stayed true in the database and all
    // twelve learners sat on a waiting screen that has no button on it, with a
    // refresh reproducing it. The server releases the class on disconnect.
    // A disconnect uses the instruction up, so it is given again on every
    // connection, not once per page.
    let wasConnected = false;
    const unsubscribeConnected = onValue(ref(database, '.info/connected'), (snap) => {
      if (snap.val() === true) {
        wasConnected = true;
        setConnectionLost(false);
        onDisconnect(projectorRef).set(release).catch(() => {});
      } else if (wasConnected) {
        setConnectionLost(true);
      }
    });

    // The page opens with the class released.
    set(projectorRef, release)
      .then(() => setBroadcastError(false))
      .catch((err) => {
        console.error('[Projector] broadcast write rejected:', err);
        setBroadcastError(true);
      });

    return () => {
      unsubscribeMode();
      unsubscribeConnected();
      onDisconnect(projectorRef).cancel().catch(() => {});
      set(projectorRef, release).catch(console.error);
    };
  }, [user?.uid]);

  // One write per press. Turning the broadcast on used to go through the
  // effect above: its cleanup wrote the release and its body wrote the
  // broadcast right after it. Two writes the server stamped with the same
  // millisecond left the learners on the release, because they drop an update
  // that is not newer than the last one they saw.
  const toggleBroadcast = () => {
    set(ref(database, 'system_control/projector_mode'), {
      projector_mode: !isBroadcasting,
      projector_mode_updated_at: serverTimestamp(),
      updated_by_teacher_id: user?.uid || 'teacher',
    })
      .then(() => setBroadcastError(false))
      .catch((err) => {
        // A rejected write used to reach console.error only, while the badge
        // kept announcing "שידור פעיל" — the teacher explained at the board
        // while the children carried on playing.
        console.error('[Projector] broadcast write rejected:', err);
        setBroadcastError(true);
      });
  };

  // שחרור מסכי התלמידים
  const releaseLearnerScreens = () => {
    const projectorRef = ref(database, 'system_control/projector_mode');
    set(projectorRef, {
      projector_mode: false,
      projector_mode_updated_at: serverTimestamp(),
      updated_by_teacher_id: user?.uid || 'teacher',
    }).catch(console.error);
  };

  const handleReturnToDashboard = () => {
    releaseLearnerScreens();
    // The dashboard opens this page in a window of its own (window.open), and
    // that window is the one on the classroom board. Navigating it loaded a
    // second dashboard there, in front of the class, and the two dashboards
    // each armed the teacher's presence and onDisconnect, so each one's reload
    // or close raised a false "החיבור שלכם התנתק לרגע" in the other. The
    // dashboard is still open: bring it forward and close this window. The
    // server releases the class on disconnect (the onDisconnect above) should
    // the write not leave first. Opened any other way, there is no dashboard
    // behind it: go there.
    const opener = typeof window !== 'undefined' ? (window.opener as Window | null) : null;
    if (opener && !opener.closed) {
      try {
        opener.focus();
      } catch {
        // A browser may refuse the focus; closing still returns to the dashboard.
      }
      window.close();
      return;
    }
    navigate('/dashboard');
  };

  // "התחילו מחדש": the demonstration back to its start (board and typing).
  const handleRestart = () => startProjectorDemo(station);

  if (user?.role !== 'teacher') {
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
    const data = e.active.data.current as { place: Place; source: DragSource } | undefined;
    const over = e.over?.data.current as { kind: 'column'; place: Place } | { kind: 'trash' } | { kind: 'board' } | undefined;
    // The same rule as the learners' board (StudentWorkspacePage). Every drop
    // that was not on a column used to count as the trash, so a block let go
    // between two columns, or off the board, was deleted in front of the class.
    // A drop on nothing leaves the block where it was.
    if (!data || !over) return;

    let target: DropInput['target'];
    if (over.kind === 'trash') {
      target = { kind: 'trash' };
    } else if (over.kind === 'board') {
      // Anywhere on בית המספרים: the block goes to its own column.
      target = { kind: 'column', place: data.place };
    } else {
      target = { kind: 'column', place: over.place };
    }
    applyDrop({ source: data.source, sourcePlace: data.place, target });
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
            {/* The line under the title gave the spec's module number and an
                English loan word ("סנדבוקס"), on the class's board. */}
            <h1 className="font-black text-base text-slate-800 dark:text-white leading-tight">
              מקרן כיתתי — מסך ההדגמה
            </h1>
          </div>
        </div>

        {/* מרכז: סטטוס שידור חי */}
        <div className="flex items-center gap-3">
          {/* כפתור שידור חי לכיתה */}
          {connectionLost ? (
            // A press here would wait in the browser and start a broadcast by
            // itself when the connection returns.
            <div
              role="status"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600"
            >
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>אין חיבור לשרת — השידור הופסק</span>
            </div>
          ) : (
            <button
              onClick={toggleBroadcast}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                isBroadcasting
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-xs'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
              }`}
              title={isBroadcasting ? 'לחצו להשהיית השידור למסכי התלמידים' : 'לחצו להפעלת שידור ונעילת מסכי התלמידים'}
            >
              <span className={`w-2 h-2 rounded-full ${isBroadcasting ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{isBroadcasting ? 'שידור פעיל (תלמידים בהמתנה)' : 'שידור מושהה (תלמידים פעילים)'}</span>
            </button>
          )}

          {/* A write the server refused. The badge above already shows what
              the database holds; this says why it did not change. */}
          {broadcastError && (
            <div
              role="alert"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700"
            >
              <span aria-hidden="true">⚠</span>
              <span>השידור לא נשמר בשרת. מסכי התלמידים לא השתנו.</span>
            </div>
          )}
        </div>

        {/* שמאל: חזרה לדשבורד, יציאה */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleReturnToDashboard}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>חזרה לדשבורד המורה</span>
          </button>

          {/* The shared button, with its name ("יציאה"), as on every other
              screen. The class is released first, while this window still
              holds the teacher's permission to write it. */}
          <div onClickCapture={releaseLearnerScreens}>
            <LogoutButton className="min-h-9 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 rounded-xl px-3 py-2 text-xs font-bold transition-all border border-rose-200 dark:border-rose-800/60" />
          </div>
        </div>
      </header>

      {/* ── The demonstration's controls: station, part, undo, clear, restart ── */}
      <div className="shrink-0 px-6 py-2 bg-white/70 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div role="group" aria-label="בחירת תחנה" className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            {STATIONS.map((n) => (
              <button key={n} type="button" aria-pressed={station === n} onClick={() => chooseStation(n)} className={SEGMENT_CLASS(station === n)}>
                תחנה {n}
              </button>
            ))}
          </div>

          {parts.length > 1 && (
            <div role="group" aria-label="בחירת חלק ההדגמה" className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              {parts.map((p, i) => (
                <button key={p.id} type="button" aria-pressed={partIdx === i} onClick={() => setPartIdx(i)} className={SEGMENT_CLASS(partIdx === i)}>
                  {p.partLabelHe}
                </button>
              ))}
            </div>
          )}
        </div>

        {hasBoard && (
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Meeting 1's opening (owner, 1.10.2026): the teacher shows the class
                the undo button — "רשת הביטחון" of doc 03 §3.1 — with the arrow the
                learners see on their own toolbar (WorkspaceTopbar). The clear
                button used that same arrow, so it now has an eraser. */}
            <button type="button" onClick={undo} disabled={!canUndo} className={CONTROL_CLASS} title="ביטול הפעולה האחרונה">
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>ביטול הפעולה האחרונה</span>
            </button>

            <button type="button" onClick={clearProjectorBoard} className={CONTROL_CLASS} title="ניקוי כל הלבנים מבית המספרים">
              <Eraser className="w-3.5 h-3.5 text-slate-500" />
              <span>נקו את בית המספרים</span>
            </button>

            {/* Stations 3–7 only (Module 15 §ג): station 1 has no demonstration to restart. */}
            {part && (
              <button type="button" onClick={handleRestart} className={CONTROL_CLASS} title="ההדגמה חוזרת להתחלה: בית מספרים ריק ושום דבר לא כתוב">
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>התחילו מחדש</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── The projected area ── */}
      <main className="flex-1 min-h-0 flex overflow-hidden p-fl-10-20 gap-fl-10-20 bg-slate-100/70 dark:bg-slate-950">
        {!hasBoard ? (
          <div className="flex-1 flex items-center justify-center" data-testid="no-demo">
            <p role="status" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl px-10 py-8 text-2xl font-bold text-slate-700 dark:text-slate-200 shadow-sm">
              {NO_DEMO_HE}
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDrag(null)}
          >
            {part && isDemoStation(station) ? (
              <>
                {/* The learners' split (workspaceZones.ts): the task zone on the
                    right, the number house on the visual left. */}
                <section aria-label="אגף המשימה" style={{ flex: TASK_ZONE_FLEX }} className="relative min-h-0 min-w-0 flex flex-col">
                  <div className={`flex-1 min-h-0 min-w-0 flex flex-col ${TASK_ZONE_CELL_CLASS}`}>
                    <DemoTaskCard station={station} part={part} />
                  </div>
                </section>
                <section aria-label="אגף הייצוגים" style={{ flex: BOARD_ZONE_FLEX }} className="min-h-0 min-w-0 flex flex-row">
                  <PlaceValueBoard activeDragPlace={activeDrag?.place ?? null} inZone />
                </section>
              </>
            ) : (
              <div className="w-full h-full max-w-7xl mx-auto flex flex-col min-h-0">
                {/* בית המספרים בפריסה מלאה 100% */}
                <PlaceValueBoard fullWidth={true} />
              </div>
            )}

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
        )}
      </main>
    </div>
  );
}
