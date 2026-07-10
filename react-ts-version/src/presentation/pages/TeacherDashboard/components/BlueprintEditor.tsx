import { useState } from 'react';
import { type StudentData } from '@/application/useStore';
import { Send, Sparkles } from 'lucide-react';

interface Props {
  student: StudentData;
}

export function BlueprintEditor({ student }: Props) {
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: 'שלום! זוהי תוכנית העבודה המומלצת עבור התלמיד. ניתן לאשר אותה כפי שהיא או לכתוב לי כאן בקשות לשינויים (לדוגמה: "הוסף תרגיל עם אפס בעשרות").' }
  ]);

  // Mock blueprint based on student mastery
  const mockBlueprint = {
    focus_concept: student.conceptMastery?.regrouping_fluency && student.conceptMastery.regrouping_fluency < 0.8 ? 'regrouping_fluency' : 'procedural_fluency',
    exercises: [
      { id: '1', equation: '45-27', rationale: 'תרגיל חימום עם פריטה פשוטה מהעשרות ליחידות.' },
      { id: '2', equation: '130-15', rationale: 'בדיקת התמודדות עם אפס בשומר מקום לפני פריטה.' },
      { id: '3', equation: '405-18', rationale: 'תרגיל אתגר: פריטה כפולה דרך אפס.' },
    ]
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    setChatHistory(prev => [...prev, { role: 'teacher', text: chatInput }]);
    setChatInput('');
    
    // Mock AI response
    setTimeout(() => {
      setChatHistory(prev => [...prev, { role: 'ai', text: 'הבנתי. אני מעדכן את התוכנית מיד. הוספתי תרגיל נוסף לפי בקשתך.' }]);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-indigo-500" />
        <h3 className="font-bold text-slate-800 dark:text-slate-200">תוכנית עבודה מומלצת (AI)</h3>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="mb-6">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">מוקד קוגניטיבי (Focus)</div>
          <div className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-3 py-2 rounded-lg font-mono text-sm inline-block">
            {mockBlueprint.focus_concept}
          </div>
        </div>

        <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">תרגילים מתוכננים למפגש הקרוב:</div>
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-right">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm">
              <tr>
                <th className="py-2 px-4 font-medium w-1/4">תרגיל</th>
                <th className="py-2 px-4 font-medium">הגיון פדגוגי (Rationale)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {mockBlueprint.exercises.map(ex => (
                <tr key={ex.id}>
                  <td className="py-3 px-4 font-bold font-mono text-lg text-slate-800 dark:text-slate-200" dir="ltr">{ex.equation}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{ex.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-4">
        <div className="h-48 overflow-y-auto mb-4 space-y-3 px-2">
          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'teacher' ? 'justify-end' : 'justify-start'}`}>
              <div className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm ${
                msg.role === 'teacher' 
                  ? 'bg-indigo-600 text-white rounded-bl-sm' 
                  : 'bg-white border border-slate-200 text-slate-700 rounded-br-sm shadow-sm'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex gap-2">
          <input 
            type="text" 
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            placeholder="בקש שינוי בתוכנית (למשל: 'הסר תרגילי פריטה כפולה')..."
            className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
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
  );
}
