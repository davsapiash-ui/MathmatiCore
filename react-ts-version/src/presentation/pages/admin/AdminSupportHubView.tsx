import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LifeBuoy, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare,
  Building,
  GraduationCap,
  UserCheck,
  Tag,
  RefreshCw
} from 'lucide-react';
import { AccessibleCard } from '@/presentation/design-system/AccessibleCard';
import { UdlButton } from '@/presentation/design-system/UdlButton';
import { useAdminStore } from '@/application/useAdminStore';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/infrastructure/firebase';
import { toast } from 'sonner';

export interface SupportTicket {
  id: string;
  school_id: string;
  school_name: string;
  class_id: string;
  class_name: string;
  student_id?: string; // Strictly 1-12 or student_X
  teacher_id: string; // Anonymous teacher ID (e.g., teacher_01)
  subject: string;
  /**
   * Module 28 asks for a clean, chronological table of teacher inquiries — no
   * categories, no priorities, no triage workflow. The status here is not a
   * free field either: firestore.rules lets a reader change exactly one key on
   * a message (`read`), which is also what drives the module's silent badge.
   * So the only two states that can be represented truthfully are these.
   */
  status: 'OPEN' | 'RESOLVED';
  description: string;
  created_at: number;
  updated_at: number;
  responses?: Array<{
    author: string;
    message: string;
    timestamp: number;
  }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  OPEN: { label: 'פתוחה', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200', icon: AlertCircle },
  RESOLVED: { label: 'נפתרה', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200', icon: CheckCircle2 },
};

/**
 * מודול 28: מרכז תמיכה וקריאות שירות לאדמין (Admin Support Hub)
 * מוזן מאוסף Firestore /messages — ערוץ השיח מורה↔הנהלה (מודול 22) — עם
 * אנונימיזציה בשכבת התצוגה (Zero PII, תלמידים 1-12 בלבד).
 */
export function AdminSupportHubView() {
  const { schools, teachers } = useAdminStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  // Module 28 §ב: "מרכז הפניות מציג למנהל המערכת הודעות נכנסות מערוצי השיח של
  // המורים (מודול 22)" — the hub's feed IS the teacher chat channel. It used to
  // read a support_tickets collection that nothing in the repo ever wrote to
  // except this file's own "new ticket" button, so it could only ever show
  // inquiries the admin typed on a teacher's behalf. It now listens to the
  // Firestore `messages` collection that sendTeacherAdminMessage writes,
  // already server-side PII-scrubbed (Module 22 Tier 2).
  useEffect(() => {
    const messagesCol = collection(db, 'messages');
    const unsub = onSnapshot(messagesCol, (snapshot) => {
      const teacherLabels = new Map(teachers.map((t, idx) => [t.id, `מורה ${idx + 1}`]));

      const inquiries: SupportTicket[] = snapshot.docs
        .map((docSnap): Record<string, any> => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((m) => m.receiver_id === 'admin')
        .map((m) => {
          const body = String(m.message_body || '');
          const schoolId = m.school_id || 'school_pilot_01';
          return {
            id: m.id,
            school_id: schoolId,
            school_name: schools.find((s) => s.id === schoolId)?.name || 'בית ספר ביקורת',
            class_id: m.class_id || 'class_1',
            class_name: m.class_name || 'המבקרים',
            // Zero-PII display layer: never render the raw sender key, which is
            // derived from the teacher's institutional email address.
            teacher_id: teacherLabels.get(m.sender_id) || 'מורה',
            subject: body.length > 60 ? `${body.slice(0, 60)}…` : body || 'פנייה ללא תוכן',
            status: m.read ? ('RESOLVED' as const) : ('OPEN' as const),
            description: body,
            created_at: Number(m.timestamp) || 0,
            updated_at: Number(m.timestamp) || 0,
          };
        });

      setTickets(inquiries.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
    }, (err) => {
      console.error('Firestore messages listener error:', err);
    });

    return () => unsub();
  }, [schools, teachers]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchesSearch = 
        !searchQuery ||
        t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.student_id && t.student_id.includes(searchQuery));
      
      const matchesSchool = selectedSchool === 'ALL' || t.school_id === selectedSchool;
      const matchesStatus = selectedStatus === 'ALL' || t.status === selectedStatus;
      return matchesSearch && matchesSchool && matchesStatus;
    });
  }, [tickets, searchQuery, selectedSchool, selectedStatus]);

  // `read` is the only field firestore.rules lets a reader update on a message
  // (messages/{id}: affectedKeys().hasOnly(['read'])), and it is what drives
  // Module 28's silent badge indicator — so "handled" maps onto it directly.
  const handleUpdateStatus = async (ticketId: string, nextStatus: 'OPEN' | 'RESOLVED') => {
    try {
      await updateDoc(doc(db, 'messages', ticketId), {
        read: nextStatus !== 'OPEN',
      });
      toast.success(`סטטוס הפנייה עודכן ל-${STATUS_CONFIG[nextStatus].label}`);
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket(prev => prev ? { ...prev, status: nextStatus } : null);
      }
    } catch (e) {
      console.error(e);
      toast.error('שגיאה בעדכון סטטוס הקריאה');
    }
  };

  return (
    <div className="p-6 md:p-10 pb-24 max-w-7xl mx-auto space-y-8" dir="rtl">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-2xl border border-indigo-500/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
              <LifeBuoy className="w-3.5 h-3.5" />
              <span>מודול 28: מוקד תמיכה טכנו-פדגוגי מרכזי</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              קריאות תמיכה וסיוע בית-ספרי
            </h1>
            <p className="text-slate-300 text-sm md:text-base font-light">
              ניהול ומעקב בזמן אמת אחר פניות מורים, בקשות התאמת מסלול וסיוע טכנולוגי (אנונימי 1-12).
            </p>
          </div>

        </div>
      </header>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="חיפוש קריאה לפי נושא, מזהה תלמיד או תיאור..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
          >
            <option value="ALL">כל הסטטוסים</option>
            <option value="OPEN">פתוחה</option>
            <option value="RESOLVED">נפתרה</option>
          </select>

          {/* A category filter stood here with four options. Teacher inquiries
              arrive through Module 22's chat and carry no category at all, so
              every ticket was stamped 'GENERAL' on arrival and three of the four
              options could never match a single row. Module 28 asks for the
              table to be organised by school and class, which is what the
              remaining filters do. */}
        </div>
      </div>

      {/* Main Content Layout: Table & Detail Drawer */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Tickets List / Table */}
        <div className="lg:col-span-2 space-y-3">
          {filteredTickets.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-400">
              <LifeBuoy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold text-base">לא נמצאו קריאות תמיכה תואמות</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => {
              const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.OPEN;
              const StatusIcon = statusCfg.icon;
              const isSelected = selectedTicket?.id === ticket.id;

              return (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col md:flex-row justify-between gap-4 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-md'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1 ${statusCfg.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        <span>{statusCfg.label}</span>
                      </span>

                      {ticket.student_id && (
                        <span className="text-xs font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                          {ticket.student_id.replace('student_', 'תלמיד ')}
                        </span>
                      )}
                    </div>

                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                      {ticket.subject}
                    </h3>

                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {ticket.description}
                    </p>

                    <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
                      <span>מוסד: {ticket.school_name} ({ticket.class_name})</span>
                      <span>•</span>
                      <span>מזהה מורה: {ticket.teacher_id}</span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between items-end shrink-0 text-left">
                    <span className="text-[11px] text-slate-400">
                      {new Date(ticket.created_at || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    {ticket.responses && ticket.responses.length > 0 && (
                      <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{ticket.responses.length} תגובות</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Ticket Details & Action Panel */}
        <div className="lg:col-span-1">
          {selectedTicket ? (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-6 sticky top-6">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex justify-between items-start gap-2">
                  <h2 className="font-extrabold text-lg text-slate-900 dark:text-white">
                    פרטי קריאה
                  </h2>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleUpdateStatus(selectedTicket.id, 'RESOLVED')}
                      className="px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg cursor-pointer transition-all"
                    >
                      פתור
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">{selectedTicket.subject}</p>
              </div>

              {/* Description */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {selectedTicket.description}
              </div>

              {/* Conversation Log */}
              <div className="space-y-3">
                <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                  היסטוריית תגובות ועדכונים
                </h4>

                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {selectedTicket.responses && selectedTicket.responses.length > 0 ? (
                    selectedTicket.responses.map((resp, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs space-y-1">
                        <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                          <span>{resp.author}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(resp.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">{resp.message}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">טרם נוספו תגובות לקריאה זו.</p>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-100 dark:border-slate-800">
                מענה למורה נשלח בערוץ השיח הניהולי (מודול 22) תחת "צ׳אט מורים" — שם ההודעה
                עוברת את שכבת האנונימיזציה בצד השרת לפני הכתיבה.
              </p>
            </div>
          ) : (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-bold">בחר קריאה מהרשימה לצפייה בפרטים ובמענה</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
