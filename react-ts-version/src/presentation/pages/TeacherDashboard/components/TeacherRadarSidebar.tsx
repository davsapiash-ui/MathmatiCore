
import type { RadarAlert } from '@/types/dashboard';
import { ShieldAlert, MessageCircle, Lightbulb } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  alerts: RadarAlert[];
  onActionClick: (alert: RadarAlert, action: 'hint' | 'chat') => void;
}

export function TeacherRadarSidebar({ alerts, onActionClick }: Props) {
  return (
    <aside className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-sm z-10 shrink-0">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between sticky top-0">
        <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-500" />
          רדאר חי
        </h2>
        {alerts.length > 0 && (
          <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2 py-1 rounded-full">
            {alerts.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {alerts.length === 0 ? (
          <div className="text-center text-slate-500 mt-10">
            <ShieldAlert className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-sm">אין התראות כרגע.<br/>הכיתה עובדת חלק!</p>
          </div>
        ) : (
          alerts.map(alert => (
            <div 
              key={alert.firebaseKey || alert.timestamp} 
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow group relative"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  {alert.studentId}
                </span>
                <span className="text-[10px] text-slate-400">
                  {formatDistanceToNow(alert.timestamp, { addSuffix: true, locale: he })}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                {alert.type === 'HESITATION' ? 'היסוס ממושך (מעל 30 שניות)' : 
                 alert.type === 'PASSIVE_DRIFTING' ? 'מחיקות מרובות ברצף' : 
                 'חווה מאבק קוגניטיבי'}
              </p>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => onActionClick(alert, 'hint')}
                  className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <Lightbulb className="w-3 h-3" />
                  שלח רמז
                </button>
                <button 
                  onClick={() => onActionClick(alert, 'chat')}
                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <MessageCircle className="w-3 h-3" />
                  צ'אט
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
