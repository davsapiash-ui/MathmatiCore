import { createPortal } from 'react-dom';

/**
 * PRD v7.1 Module 14 §ב0 — Session Activation.
 * The dashboard shows a picker listing all eight sessions and the state of each
 * one; clicking a session opens THIS confirmation window, and only after the
 * teacher confirms does the server update active_session_id on the
 * ClassDocument and on every student document in the class, atomically.
 */

export type SessionState = 'active' | 'completed' | 'pending';

export interface SessionRow {
  sessionNumber: number;
  state: SessionState;
}

interface Props {
  isOpen: boolean;
  sessionNumber: number | null;
  sessions: SessionRow[];
  onClose: () => void;
  onConfirm: (sessionNumber: number) => void;
}

export function SessionActivationModal({ isOpen, sessionNumber, sessions, onClose, onConfirm }: Props) {
  if (!isOpen || sessionNumber === null) return null;

  const row = sessions.find((s) => s.sessionNumber === sessionNumber);
  const isReopen = row?.state === 'completed';

  return createPortal(
    <>
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9998]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        dir="rtl"
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xl font-black text-slate-900 dark:text-white">
              פתיחת מפגש {sessionNumber} לכלל הכיתה
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              אישור הפעולה יפתח את המפגש עבור כל 12 הלומדים במקביל.
            </p>
          </div>

          {/* Content is limited to what §ב0 states: the session stays active until
              another is opened, and reopening a completed session is permitted and
              destroys no data. The eight-session state list lives in the picker. */}
          <div className="px-6 py-5">
            <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-2 list-disc pr-5">
              <li>המפגש יישאר פעיל עד שתפתחי מפגש אחר.</li>
              {isReopen && (
                <li className="text-emerald-700 dark:text-emerald-400">
                  מפגש זה כבר הושלם. חזרה אליו אפשרית ומותרת, ואינה מוחקת נתונים קיימים.
                </li>
              )}
            </ul>
          </div>

          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm cursor-pointer"
            >
              ביטול
            </button>
            <button
              onClick={() => onConfirm(sessionNumber)}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm cursor-pointer"
            >
              אישור ופתיחת המפגש
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
