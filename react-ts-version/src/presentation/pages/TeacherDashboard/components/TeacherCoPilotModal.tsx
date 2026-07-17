import { useState } from 'react';
import { type StudentData, useStore } from '@/application/useStore';
import { X, CheckCircle, Sparkles, Send, RotateCcw, PenSquare } from 'lucide-react';
import { ref, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

interface Props {
  student: StudentData;
  onClose: () => void;
  onReset: () => void;
}

export function TeacherCoPilotModal({ student, onClose, onReset }: Props) {
  const isPendingApproval = student.routeStatus === 'PENDING_TEACHER_APPROVAL' || student.routeStatus === 'PENDING';
  const approveRoute = useStore(s => s.approveRoute);

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: 'שלום! זוהי תוכנית העבודה המומלצת עבור התלמיד, כפי שחושבה מהאבחון האחרון. ניתן לאשר אותה כפי שהיא או לכתוב לי כאן בקשות לשינויים (לדוגמה: "הוסף תרגיל עם אפס בעשרות").' }
  ]);
  
  // Extract tasks from diagnosticReport or use mock
  const defaultBlueprint = student.diagnosticReport?.tasks || [
    { id: '1', equation: '45-27', rationale: 'תרגיל חימום עם פריטה פשוטה מהעשרות ליחידות.' },
    { id: '2', equation: '130-15', rationale: 'בדיקת התמודדות עם אפס בשומר מקום לפני פריטה.' },
    { id: '3', equation: '405-18', rationale: 'תרגיל אתגר: פריטה כפולה דרך אפס.' },
  ];
  
  const [blueprintTasks, setBlueprintTasks] = useState<any[]>(defaultBlueprint as any[]);
  const [isApproving, setIsApproving] = useState(false);
  const [additionBoardEnabled, setAdditionBoardEnabled] = useState(student.additionBoardEnabled ?? false);

  const handleToggleAdditionBoard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setAdditionBoardEnabled(checked);
    try {
      await update(ref(database, 'users/students/' + student.studentId), { additionBoardEnabled: checked });
    } catch (err) {
      console.error("Failed to update additionBoardEnabled:", err);
    }
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    setChatHistory(prev => [...prev, { role: 'teacher', text: chatInput }]);
    setChatInput('');
    
    // Mock AI response
    setTimeout(() => {
      setChatHistory(prev => [...prev, { role: 'ai', text: 'הבנתי. אני מעדכן את התוכנית מיד. הוספתי תרגיל נוסף לפי בקשתך.' }]);
      setBlueprintTasks(prev => [...prev, { id: Date.now().toString(), equation: '502-19', rationale: 'נוסף לבקשתך: התמודדות עם אפס ואתגר פריטה.' }]);
    }, 1500);
  };

  const handleApprove = async () => {
    try {
      setIsApproving(true);
      await approveRoute(student.studentId);
      // alert('✅ המשימות אושרו בהצלחה! התלמיד יכול כעת להמשיך למפגש הבא.');
      onClose();
    } catch (err) {
      console.error('Approval error:', err);
      alert('שגיאה באישור המשימות ב-Firebase. אנא ודא שיש לך הרשאות מתאימות וחיבור לרשת.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleTaskEdit = (index: number, field: string, value: string) => {
    const updated = [...blueprintTasks];
    updated[index] = { ...updated[index], [field]: value };
    setBlueprintTasks(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="text-indigo-500 w-5 h-5" />
              Teacher Co-Pilot: תוכנית עבודה ({student.name || student.studentId})
            </h2>
            {isPendingApproval && (
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full border border-amber-200">
                ממתין לאישור מורה
              </span>
            )}
            {student.routeStatus === 'APPROVED' && (
              <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full border border-green-200">
                אושר
              </span>
            )}
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
          
          {/* Main Content (Tasks) */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-slate-200">
              תוכנית המשימות (Agile Blueprint) למפגש הבא
            </h3>
            
            <div className="space-y-4 mb-8">
              {blueprintTasks.map((task, idx) => (
                <div key={task.id || idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm flex flex-col gap-3 group relative">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg flex items-center justify-center font-bold text-lg">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <label className="text-xs text-slate-500 font-bold">תרגיל:</label>
                        <input 
                          type="text" 
                          value={task.equation} 
                          onChange={(e) => handleTaskEdit(idx, 'equation', e.target.value)}
                          className="font-mono text-lg font-bold bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-500 outline-none w-32" dir="ltr"
                        />
                      </div>
                      <div className="flex items-start gap-2">
                        <label className="text-xs text-slate-500 font-bold mt-1">רציונל:</label>
                        <textarea 
                          value={task.rationale || ''} 
                          onChange={(e) => handleTaskEdit(idx, 'rationale', e.target.value)}
                          className="text-sm text-slate-600 dark:text-slate-400 bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-500 outline-none flex-1 resize-none h-12"
                        />
                      </div>
                    </div>
                    <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
                       <PenSquare className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Accessibility Adjustments */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-2xl p-5 mb-6">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 text-base flex items-center gap-2">
                <span className="text-indigo-500">♿</span>
                התאמות נגישות (Accessibility Adjustments)
              </h3>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={additionBoardEnabled}
                  onChange={handleToggleAdditionBoard}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-650 focus:ring-indigo-500"
                />
                <div className="text-sm">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">לוח חיבור דיגיטלי (Addition Helper)</span>
                  <span className="text-slate-500 text-xs">הצג לוח לחיפוש עובדות חיבור (0-9) לתמיכה בתלמיד במהלך העבודה.</span>
                </div>
              </label>
            </div>

            {/* Approval Gate */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 mb-6">
               <h3 className="font-bold text-indigo-900 mb-2">שער אישור מורה (Teacher Approval Gate)</h3>
               <p className="text-sm text-indigo-700 mb-6">
                 לאחר שווידאת שתוכנית העבודה מתאימה, לחץ על הכפתור כדי לשחרר את החסימה ולאפשר לתלמיד להתקדם למפגש הבא.
               </p>
               <button
                  onClick={handleApprove}
                  disabled={isApproving || student.routeStatus === 'APPROVED'}
                  className={`w-full py-4 px-6 font-bold rounded-xl shadow-md transition-all flex justify-center items-center gap-2 text-lg ${
                    student.routeStatus === 'APPROVED' 
                      ? 'bg-green-100 text-green-700 opacity-70 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                  }`}
                >
                  <CheckCircle className="w-6 h-6" />
                  {isApproving ? 'מאשר ומסנכרן...' : student.routeStatus === 'APPROVED' ? 'התוכנית אושרה' : 'Approve Blueprint & Unlock Next Session'}
                </button>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 opacity-70 hover:opacity-100 transition-opacity mt-auto">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-red-900 text-sm">איפוס נתונים</h3>
                  <p className="text-xs text-red-700 mt-1">מחק את התקדמות התלמיד והתחל מחדש.</p>
                </div>
                <button
                  onClick={onReset}
                  className="bg-red-100 hover:bg-red-200 text-red-700 font-bold py-2 px-4 rounded-lg transition-colors text-sm flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  אפס תלמיד
                </button>
              </div>
            </div>

          </div>

          {/* Sidebar Chat Interface */}
          <div className="w-1/3 flex flex-col bg-slate-50/50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50">
               <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                 <Sparkles className="w-4 h-4 text-indigo-500" />
                 צ'אט עם ה-AI הפדגוגי
               </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'teacher' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl max-w-[85%] text-sm leading-relaxed ${
                    msg.role === 'teacher' 
                      ? 'bg-indigo-600 text-white rounded-bl-sm' 
                      : 'bg-white border border-slate-200 text-slate-700 rounded-br-sm shadow-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="הקלד הנחיה ל-AI..."
                  className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-900 dark:text-white"
                />
                <button 
                  onClick={handleSendMessage}
                  className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 p-2 rounded-xl transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
