import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { UnitSVG, TenSVG, HundredSVG } from '../board/DienesBlock';

/**
 * The task sheet of meeting 1's four tool steps (owner, 7.10.2026; register
 * יח). A step of getting to know a tool is not an exercise: it has no number
 * to build and no answer to write, so the exercise sheet's shape (task,
 * numbered steps, notebook) left half the column empty and turned the welcome
 * sentence into "step 1". A child of eight opening the system for the first
 * time needs one thing on the screen: what to do now.
 *
 * So each step is laid out, not split: a welcome (first step only), one
 * short explanation in plain weight, ONE instruction in the coloured frame,
 * and in the lower half — where the exercise sheet would be — a quiet picture
 * of the action, drawn with the board's own blocks, so the child sees the
 * move before reading it (UDL: a visual beside the words). No numbering when
 * there is one thing to do. The read-aloud reads the document's full
 * instruction, word for word, as before.
 *
 * The words shown are the document's (מסמך 03 §3.1), only placed: the
 * welcome, the explanation and the instruction are the sentences of
 * instructionHe, not new text.
 */
interface IntroContent {
  welcome?: string;
  explain: string;
  instruction: string;
  picture: 'drag' | 'break' | 'build305' | 'undoTrash';
}

const CONTENT: Record<string, IntroContent> = {
  s1_sandbox_controlled: {
    welcome: 'ברוכים הבאים למתמטיקאור!',
    explain: 'בתחנה הראשונה מכירים את הכלים: שחקו וחקרו בחופשיות.',
    instruction: 'גררו לבנים לטורים משמאל וצפו בספרות המשתנות בבית המספרים!',
    picture: 'drag',
  },
  s1_decompose_hundred: {
    explain: 'כל לבנה גדולה עשויה מלבנים קטנות יותר.',
    instruction: 'לחצו על לבנה כדי לפרוט אותה ללבנים קטנות יותר, ועקבו אחר השינוי בבית המספרים.',
    picture: 'break',
  },
  s1_build_305: {
    explain: 'יש מספרים שבהם טור אחד נשאר ריק.',
    instruction: 'נסו לבנות את המספר 305 בלבנים. כשתצליחו, הסתכלו בבית המספרים: איזו ספרה מופיעה ליד שם כל טור?',
    picture: 'build305',
  },
  s1_undo_trash: {
    explain: 'טעות אפשר תמיד לתקן.',
    instruction: 'לחצו על כפתור ביטול הפעולה ↺ כדי לחזור צעד אחד אחורה. אחר כך לחצו על פח האשפה כדי לנקות את בית המספרים.',
    picture: 'undoTrash',
  },
};

export function hasIntroSheet(taskId: string): boolean {
  return taskId in CONTENT;
}

/** A block drawn at its board size, for the pictures. */
function Block({ kind, w, h }: { kind: 'unit' | 'ten' | 'hundred'; w: number; h: number }) {
  const Svg = kind === 'unit' ? UnitSVG : kind === 'ten' ? TenSVG : HundredSVG;
  return <div style={{ width: w, height: h }} className="shrink-0"><Svg /></div>;
}

const Arrow = () => (
  <svg width="84" height="32" viewBox="0 0 56 24" aria-hidden="true" className="shrink-0 text-ws-accent">
    <path d="M52 12H6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M14 4L5 12l9 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

/** A small column, like the board's, with an optional digit beside its name. */
function MiniColumn({ name, color, digit, children }: { name: string; color: string; digit?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 font-display font-extrabold text-lg" style={{ color }}>
        {digit !== undefined && <span className="rounded-full text-white text-sm w-7 h-7 flex items-center justify-center" style={{ backgroundColor: color }}>{digit}</span>}
        {name}
      </div>
      <div className="w-28 h-36 rounded-2xl border-[3px] flex flex-wrap content-end justify-center gap-1.5 p-2 bg-white" style={{ borderColor: color }}>
        {children}
      </div>
    </div>
  );
}

function Picture({ kind }: { kind: IntroContent['picture'] }) {
  if (kind === 'drag') {
    return (
      <div className="flex items-center justify-center gap-8" dir="rtl">
        <Block kind="ten" w={110} h={68} />
        <Arrow />
        <MiniColumn name="עשרות" color="var(--block-ten-dark)" digit="1"><Block kind="ten" w={82} h={50} /></MiniColumn>
      </div>
    );
  }
  if (kind === 'break') {
    return (
      <div className="flex items-center justify-center gap-8" dir="rtl">
        <Block kind="hundred" w={130} h={76} />
        <Arrow />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, i) => <Block key={i} kind="ten" w={48} h={30} />)}
        </div>
      </div>
    );
  }
  if (kind === 'build305') {
    return (
      // The board's own order: in RTL the first column is the highest place,
      // so hundreds sit on the right and units on the left — the picture
      // must not mirror the board the child is about to use.
      <div className="flex items-end justify-center gap-4" dir="ltr">
        <MiniColumn name="יחידות" color="var(--block-unit-dark)" digit="5">
          {Array.from({ length: 5 }).map((_, i) => <Block key={i} kind="unit" w={20} h={20} />)}
        </MiniColumn>
        <MiniColumn name="עשרות" color="var(--block-ten-dark)" digit="0" />
        <MiniColumn name="מאות" color="var(--block-hundred-dark)" digit="3">
          <Block kind="hundred" w={44} h={26} /><Block kind="hundred" w={44} h={26} /><Block kind="hundred" w={44} h={26} />
        </MiniColumn>
      </div>
    );
  }
  // Undo takes the last block back; the trash empties the column. Shown as
  // what happens to a column, since that is what the child will watch.
  const Col = ({ n, label }: { n: number; label: string }) => (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-24 h-28 rounded-2xl border-[3px] bg-white flex flex-wrap content-end justify-center gap-1.5 p-2" style={{ borderColor: 'var(--block-ten-dark)' }}>
        {Array.from({ length: n }).map((_, i) => <Block key={i} kind="ten" w={40} h={25} />)}
      </div>
      <span className="text-sm font-bold text-ws-soft">{label}</span>
    </div>
  );
  const Btn = ({ icon, label }: { icon: string; label: string }) => (
    <div className="flex flex-col items-center gap-1.5">
      <span className="w-16 h-16 rounded-2xl border-2 border-ws-surface2 bg-white shadow-sm flex items-center justify-center text-3xl">{icon}</span>
      <span className="text-sm font-bold text-ws-ink">{label}</span>
    </div>
  );
  return (
    <div className="flex items-center justify-center gap-6" dir="rtl">
      <Col n={3} label="3 לבנים" />
      <Btn icon="↺" label="ביטול" />
      <Col n={2} label="2 לבנים" />
      <Btn icon="🗑" label="פח" />
      <Col n={0} label="ריק" />
    </div>
  );
}

export function IntroStepSheet({ taskId, instructionHe }: { taskId: string; instructionHe: string }) {
  const c = CONTENT[taskId];
  if (!c) return null;
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-fl-6-16" data-testid="intro-step-sheet">
      {c.welcome && (
        <p className="font-display font-black text-fl-22-34 text-ws-ink leading-tight" data-testid="intro-welcome">
          <span aria-hidden="true">👋 </span>{c.welcome}
        </p>
      )}
      <p className="text-fl-16-20 text-ws-soft font-medium leading-snug" data-testid="intro-explain">{c.explain}</p>
      <div
        className="flex items-start gap-3 rounded-2xl px-fl-12-16 pr-fl-14-20 py-fl-6-16 border-r-4"
        style={{ backgroundColor: 'hsl(var(--ws-blue-soft) / 0.55)', borderColor: 'hsl(var(--ws-blue) / 0.55)' }}
        data-testid="task-instruction"
      >
        <p className="flex-1 min-w-0 text-fl-16-24 text-ws-ink font-bold leading-snug" data-testid="instruction-lead">{c.instruction}</p>
        <UdlSpeechButton text={instructionHe} />
      </div>
      {/* The lower half: the move, drawn, instead of an empty column. */}
      <div className="flex-1 min-h-[7rem] flex items-center justify-center rounded-3xl border border-ws-surface2 bg-ws-surface/70 p-fl-10-24" aria-hidden="true" data-testid="intro-picture">
        <Picture kind={c.picture} />
      </div>
    </div>
  );
}
