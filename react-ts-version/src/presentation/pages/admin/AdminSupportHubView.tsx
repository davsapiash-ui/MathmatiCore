import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LifeBuoy, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  MessageSquare, 
  Send, 
  Building, 
  GraduationCap, 
  UserCheck, 
  Tag,
  RefreshCw,
  Plus
} from 'lucide-react';
import { AccessibleCard } from '@/presentation/design-system/AccessibleCard';
import { UdlButton } from '@/presentation/design-system/UdlButton';
import { useAdminStore } from '@/application/useAdminStore';
import { ref, onValue, push, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { containsPII } from '@/core/security/PiiFilter';
import { toast } from 'sonner';

export interface SupportTicket {
  id: string;
  schoolId: string;
  schoolName: string;
  classId: string;
  className: string;
  studentId?: string; // Strictly 1-12
  teacherEmail: string;
  subject: string;
  category: 'PEDAGOGICAL' | 'TECHNICAL' | 'ACCOMMODATION_ASD' | 'GENERAL';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  description: string;
  createdAt: number;
  updatedAt: number;
  responses?: Array<{
    author: string;
    message: string;
    timestamp: number;
  }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  PEDAGOGICAL: 'פדגוגיה והתאמת מסלול',
  TECHNICAL: 'טכני / חוסן סנכרון',
  ACCOMMODATION_ASD: 'התאמות UDL / נגישות',
  GENERAL: 'כללי ובירורים',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
  URGENT: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  OPEN: { label: 'פתוחה', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200', icon: AlertCircle },
  IN_PROGRESS: { label: 'בטיפול', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30 border-blue-200', icon: Clock },
  RESOLVED: { label: 'נפתרה', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200', icon: CheckCircle2 },
};

/**
 * מודול 28: מרכז תמיכה וקריאות שירות לאדמין (Admin Support Hub)
 * ממשק מרכזי לניהול קריאות תמיכה וסיוע טכנו-פדגוגי לבתי הספר ולמורים.
 * האזנה בזמן אמת לקריאות חדשות, סינון לפי מוסד וכיתה, ושימוש אנונימי (1-12) ללא PII.
 */
export function AdminSupportHubView() {
  const { schools, classes } = useAdminStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // New Ticket Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<'PEDAGOGICAL' | 'TECHNICAL' | 'ACCOMMODATION_ASD' | 'GENERAL'>('PEDAGOGICAL');
  const [newPriority, setNewPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [newStudentId, setNewStudentId] = useState<string>('1');

  // Real-time listener for tickets
  useEffect(() => {
    const ticketsRef = ref(database, 'support_tickets');
    const unsub = onValue(ticketsRef, (snapshot) => {
      if (snapshot.exists()) {
        const raw = snapshot.val();
        const loaded: SupportTicket[] = Object.keys(raw).map((k) => ({
          id: k,
          ...raw[k],
        }));
        // Sort newest first
        setTickets(loaded.sort((a, b) => b.createdAt - a.createdAt));
      } else {
        // Mock fallback initial tickets for demonstration if empty
        setTickets([
          {
            id: 'tkt_001',
            schoolId: schools[0]?.id || 'sch_1',
            schoolName: schools[0]?.name || 'בית ספר ביקורת',
            classId: classes[0]?.id || 'cls_1',
            className: classes[0]?.name || 'המבקרים',
            studentId: 'student_3',
            teacherEmail: 'davidsep@edu-haifa.org.il',
            subject: 'התאמת מסלול מופחת עומס (UDL) לתלמיד 3',
            category: 'ACCOMMODATION_ASD',
            priority: 'MEDIUM',
            status: 'OPEN',
            description: 'נצפה היסוס ממושך במפגש 4. האם מומלץ להפעיל פרופיל תמיכה מוגבר?',
            createdAt: Date.now() - 3600000 * 2,
            updatedAt: Date.now() - 3600000 * 2,
            responses: [],
          },
          {
            id: 'tkt_002',
            schoolId: schools[0]?.id || 'sch_1',
            schoolName: schools[0]?.name || 'בית ספר ביקורת',
            classId: classes[0]?.id || 'cls_1',
            className: classes[0]?.name || 'המבקרים',
            studentId: 'student_7',
            teacherEmail: '1002220159@edu-haifa.org.il',
            subject: 'אישור מעבר שער מורה (Teacher Gate) למפגש 3',
            category: 'PEDAGOGICAL',
            priority: 'HIGH',
            status: 'IN_PROGRESS',
            description: 'התלמיד השלים את מפגש 2 בהצלחה וממתין לפתיחת מפגש 3.',
            createdAt: Date.now() - 3600000 * 5,
            updatedAt: Date.now() - 3600000 * 1,
            responses: [
              {
                author: 'מנהל מערכת',
                message: 'השער אושר בדשבורד המורה.',
                timestamp: Date.now() - 3600000 * 1,
              }
            ],
          }
        ]);
      }
    });

    return () => unsub();
  }, [schools, classes]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchesSearch = 
        !searchQuery ||
        t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.studentId && t.studentId.includes(searchQuery));
      
      const matchesSchool = selectedSchool === 'ALL' || t.schoolId === selectedSchool;
      const matchesStatus = selectedStatus === 'ALL' || t.status === selectedStatus;
      const matchesCategory = selectedCategory === 'ALL' || t.category === selectedCategory;

      return matchesSearch && matchesSchool && matchesStatus && matchesCategory;
    });
  }, [tickets, searchQuery, selectedSchool, selectedStatus, selectedCategory]);

  const handleUpdateStatus = async (ticketId: string, nextStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') => {
    try {
      await update(ref(database, `support_tickets/${ticketId}`), {
        status: nextStatus,
        updatedAt: Date.now(),
      });
      toast.success(`סטטוס הקריאה עודכן ל-${STATUS_CONFIG[nextStatus].label}`);
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket(prev => prev ? { ...prev, status: nextStatus } : null);
      }
    } catch (e) {
      console.error(e);
      toast.error('שגיאה בעדכון סטטוס הקריאה');
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;

    if (containsPII(replyMessage)) {
      toast.error('הודעתך כוללת פרטים מזהים (PII). נא להשתמש במזהה תלמיד 1-12 בלבד.');
      return;
    }

    try {
      setIsSubmittingReply(true);
      const newResponses = [
        ...(selectedTicket.responses || []),
        {
          author: 'מנהל מערכת',
          message: replyMessage.trim(),
          timestamp: Date.now(),
        }
      ];

      await update(ref(database, `support_tickets/${selectedTicket.id}`), {
        responses: newResponses,
        updatedAt: Date.now(),
      });

      setReplyMessage('');
      setSelectedTicket(prev => prev ? { ...prev, responses: newResponses } : null);
      toast.success('התגובה נשלחה בהצלחה!');
    } catch (e) {
      console.error(e);
      toast.error('שגיאה בשליחת תגובה');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!newSubject.trim() || !newDescription.trim()) {
      toast.error('נא למלא נושא ותיאור לקריאה');
      return;
    }

    if (containsPII(newSubject) || containsPII(newDescription)) {
      toast.error('הקריאה מכילה מידע מזהה (PII). המערכת שומרת על פרטיות מוחלטת (1-12 בלבד).');
      return;
    }

    try {
      const targetSchool = schools[0];
      const targetClass = classes[0];

      const ticketPayload: Omit<SupportTicket, 'id'> = {
        schoolId: targetSchool?.id || 'sch_1',
        schoolName: targetSchool?.name || 'בית ספר ביקורת',
        classId: targetClass?.id || 'cls_1',
        className: targetClass?.name || 'המבקרים',
        studentId: `student_${newStudentId}`,
        teacherEmail: 'davidsep@edu-haifa.org.il',
        subject: newSubject.trim(),
        category: newCategory,
        priority: newPriority,
        status: 'OPEN',
        description: newDescription.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        responses: [],
      };

      const newRef = push(ref(database, 'support_tickets'));
      await update(newRef, ticketPayload);

      setIsCreateModalOpen(false);
      setNewSubject('');
      setNewDescription('');
      toast.success('קריאת התמיכה נוצרה ונשלחה בהצלחה!');
    } catch (e) {
      console.error(e);
      toast.error('שגיאה ביצירת הקריאה');
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

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>פתיחת קריאה חדשה</span>
          </button>
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
            <option value="IN_PROGRESS">בטיפול</option>
            <option value="RESOLVED">נפתרה</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
          >
            <option value="ALL">כל הקטגוריות</option>
            <option value="PEDAGOGICAL">פדגוגיה</option>
            <option value="ACCOMMODATION_ASD">התאמות UDL</option>
            <option value="TECHNICAL">טכני</option>
            <option value="GENERAL">כללי</option>
          </select>
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

                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${PRIORITY_COLORS[ticket.priority]}`}>
                        עדיפות {ticket.priority}
                      </span>

                      <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">
                        {CATEGORY_LABELS[ticket.category] || ticket.category}
                      </span>

                      {ticket.studentId && (
                        <span className="text-xs font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                          {ticket.studentId.replace('student_', 'תלמיד ')}
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
                      <span>מוסד: {ticket.schoolName} ({ticket.className})</span>
                      <span>•</span>
                      <span>מורה: {ticket.teacherEmail}</span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between items-end shrink-0 text-left">
                    <span className="text-[11px] text-slate-400">
                      {new Date(ticket.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
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
                      onClick={() => handleUpdateStatus(selectedTicket.id, 'IN_PROGRESS')}
                      className="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg cursor-pointer transition-all"
                    >
                      בטיפול
                    </button>
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

              {/* Reply Input */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <textarea
                  rows={3}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="כתוב תגובה למורה / מנהל המוסד (ללא פרטים מזהים)..."
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />

                <button
                  disabled={!replyMessage.trim() || isSubmittingReply}
                  onClick={handleSendReply}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>שלח תגובה</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-bold">בחר קריאה מהרשימה לצפייה בפרטים ובמענה</p>
            </div>
          )}
        </div>
      </div>

      {/* New Ticket Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4" dir="rtl">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-black text-slate-900 dark:text-white">
              פתיחת קריאת תמיכה חדשה
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">נושא הקריאה</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="למשל: בקשת התאמת רמת קושי עבור תלמיד 5"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">קטגוריה</label>
                  <select
                    value={newCategory}
                    onChange={(e: any) => setNewCategory(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="PEDAGOGICAL">פדגוגיה</option>
                    <option value="ACCOMMODATION_ASD">התאמות UDL</option>
                    <option value="TECHNICAL">טכני</option>
                    <option value="GENERAL">כללי</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">מזהה תלמיד (1-12 אנונימי)</label>
                  <select
                    value={newStudentId}
                    onChange={(e) => setNewStudentId(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n.toString()}>תלמיד {n}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">תיאור הפנייה והצורך</label>
                <textarea
                  rows={4}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="פרט את המקרה והסיוע הנדרש..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer"
              >
                ביטול
              </button>
              <button
                onClick={handleCreateTicket}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer shadow-md"
              >
                צור ושגר קריאה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
