import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { 
  Plus, 
  Users, 
  Settings, 
  Trash2, 
  Building, 
  ShieldCheck, 
  Search, 
  Sparkles,
  KeyRound,
  GraduationCap,
  Layers,
  Printer
} from "lucide-react";
import { useAdminStore } from "@/application/useAdminStore";
import { PILOT_CLASS_CAPACITY } from "@/core/pilotInstitution";
import { AdminWizardModal } from "./AdminWizardModal";
import { toast } from "sonner";

export function AdminSchoolsView() {
  const navigate = useNavigate();
  const {
    schools,
    teachers,
    classes,
    deleteSchool,
    deleteTeacher,
    deleteClassRoom,
    resetInstitutionsToOfficialPilot
  } = useAdminStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  
  // Real-time Firebase Sync for Schools, Teachers and Classes
  useEffect(() => {
    return useAdminStore.getState().initAdminSubscriptions();
  }, []);

  // Wizard Modal State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<"full_setup" | "add_teacher" | "add_class">("full_setup");
  const [targetSchoolId, setTargetSchoolId] = useState<string | null>(null);

  // Module 25 §ב.2: the capacity is a hard 12, enforced on the server (learner
  // ids 1–12 in authenticateStudentSession and the rules). An "update the
  // limit" control used to write system_control/globalStudentLimit and report
  // success, but nothing enforced it: with 8 set, all twelve learners still
  // signed in. The spec sets no smaller capacity, so the number is shown, not edited.

  // One click on a trash icon used to wipe a whole school — teachers, the
  // pilot class the twelve learners log in through, and their login rights —
  // with no confirmation and no undo. Deletion is irreversible, so it asks.
  const confirmAction = (message: string) =>
    typeof window === "undefined" || typeof window.confirm !== "function" ? true : window.confirm(message);

  const handleResetPilot = async () => {
    if (!confirmAction("לאפס את כל המוסדות למבנה הפיילוט הרשמי?\nכל המורות שנוספו יימחקו (כולל הרשאות הכניסה שלהן) ויישארו רק \"בית ספר ביקורת\", המורה המובילה וכיתת \"המבקרים\". פעולה זו אינה הפיכה.")) return;
    setIsResetting(true);
    try {
      await resetInstitutionsToOfficialPilot();
      toast.success("המערכת אופסה בהצלחה למבנה הפיילוט הרשמי (בית ספר ביקורת וכיתת המבקרים)");
    } catch (e) {
      console.error("Failed to reset pilot institutions:", e);
      toast.error("שגיאה באיפוס מוסדות הפיילוט");
    } finally {
      setIsResetting(false);
    }
  };

  const filteredSchools = useMemo(() => {
    if (!searchQuery.trim()) return schools;
    const query = searchQuery.toLowerCase().trim();
    return schools.filter(s => {
      const schoolTeachers = teachers.filter(t => t.schoolId === s.id);
      const hasMatchingTeacher = schoolTeachers.some(t => 
        (t.ssoEmail && t.ssoEmail.toLowerCase().includes(query)) ||
        (t.id && t.id.toLowerCase().includes(query))
      );
      return (s.name && s.name.toLowerCase().includes(query)) || hasMatchingTeacher;
    });
  }, [schools, teachers, searchQuery]);

  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const handleDeleteSchool = async (school: { id: string; name: string }) => {
    if (isDeletingId) return;
    const teacherCount = teachers.filter((t) => t.schoolId === school.id).length;
    const classCount = classes.filter((c) => c.schoolId === school.id).length;
    if (!confirmAction(`למחוק את המוסד "${school.name}"?\nיימחקו יחד איתו ${teacherCount} מורות (כולל הרשאת הכניסה שלהן) ו-${classCount} כיתות. פעולה זו אינה הפיכה.`)) return;
    setIsDeletingId(school.id);
    try {
      await deleteSchool(school.id);
      toast.success(`המוסד "${school.name}" נמחק.`);
    } catch {
      toast.error("מחיקת המוסד נכשלה בשרת.");
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleDeleteTeacher = async (teacher: { id: string; ssoEmail: string }) => {
    if (isDeletingId) return;
    if (!confirmAction(`להסיר את המורה ${teacher.ssoEmail}?\nהרשאת הכניסה שלה תבוטל מיד. הכיתות אינן נמחקות.`)) return;
    setIsDeletingId(teacher.id);
    try {
      await deleteTeacher(teacher.id);
      toast.success(`המורה ${teacher.ssoEmail} הוסרה והרשאת הכניסה שלה בוטלה.`);
    } catch {
      toast.error("הסרת המורה נכשלה בשרת. ודא שאתה מחובר כמנהל מערכת.");
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleDeleteClass = async (cls: { id: string; name: string }) => {
    if (isDeletingId) return;
    if (!confirmAction(`למחוק את הכיתה "${cls.name}"?\nהלומדים לא יוכלו להיכנס לכיתה זו. פעולה זו אינה הפיכה.`)) return;
    setIsDeletingId(cls.id);
    try {
      await deleteClassRoom(cls.id);
      toast.success(`הכיתה "${cls.name}" נמחקה.`);
    } catch {
      toast.error("מחיקת הכיתה נכשלה בשרת.");
    } finally {
      setIsDeletingId(null);
    }
  };

  const openWizard = (mode: "full_setup" | "add_teacher" | "add_class", schoolId: string | null = null) => {
    setWizardMode(mode);
    setTargetSchoolId(schoolId);
    setWizardOpen(true);
  };

  return (
    <div className="p-2 sm:p-4 xl:p-10 pb-24 max-w-7xl mx-auto space-y-8" dir="rtl">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-violet-600 via-violet-700 to-purple-700 p-8 text-white shadow-xl border border-violet-400/40">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white text-xs font-semibold backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-stone-300" />
              <span>ניהול מוסדות, סגלי הוראה וכיתות</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              פריסת מוסדות, מורים וכיתות
            </h1>
            <p className="text-violet-100 text-sm md:text-base max-w-2xl font-light leading-relaxed">
              מערכת ניהול להקמה ולליווי של מוסדות לימוד, שיוך מורים והגדרת כיתות בהתאם לתקן הפיילוט.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Module 25 §ד: printable login cards for the 12 learners. */}
            <UdlButton
              semanticColor="neutral"
              className="gap-2 bg-white/15 hover:bg-white/25 text-white font-bold py-3.5 px-5 rounded-2xl shadow-lg border border-white/30 transition-all text-xs cursor-pointer"
              onClick={() => navigate("/admin/login-cards")}
            >
              <Printer className="w-4 h-4 text-white" />
              <span>הדפסת כרטיסי כניסה לתלמידים</span>
            </UdlButton>

            <UdlButton
              semanticColor="neutral"
              className="gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-5 rounded-2xl shadow-lg border border-rose-400/40 transition-all hover:scale-105 active:scale-95 text-xs cursor-pointer"
              onClick={handleResetPilot}
              disabled={isResetting}
            >
              <Trash2 className="w-4 h-4 text-white" />
              <span>{isResetting ? "מאפס נתונים..." : "איפוס נתונים למבנה הפיילוט הרשמי"}</span>
            </UdlButton>

            {/* Module 25 §ב.1: one school. The wizard is offered only while there is none. */}
            {schools.length === 0 && (
            <UdlButton 
              semanticColor="primary" 
              className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-violet-600/30 border border-violet-400/30 transition-all hover:scale-105 active:scale-95"
              onClick={() => openWizard("full_setup")}
            >
              <Plus className="w-5 h-5" />
              <span>הקמת מוסד חדש (אשף מונחה)</span>
            </UdlButton>
            )}
          </div>
        </div>

        {/* Pilot Scale Progress Bar */}
        <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-300 block">מוסדות חינוך פעילים</span>
              <span className="text-2xl font-black text-violet-300">{schools.length} / 1</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-violet-300">
              <Building className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-300 block">סגל מורים רשום</span>
              <span className="text-2xl font-black text-emerald-300">{teachers.length}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-300 block">כיתות לימוד פעילות</span>
              <span className="text-2xl font-black text-cyan-300">{classes.length}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
              <Layers className="w-5 h-5" />
            </div>
          </div>
        </div>
      </header>

      {/* Global Capacity Settings & Search Bar */}
      <div className="grid xl:grid-cols-3 gap-6">
        {/* Capacity Settings Panel */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                מכסת תלמידים מרבית לכיתה
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                מספר התלמידים המרבי המורשה להשתתפות בכל כיתת לימוד
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-0.5 shrink-0">
            <span className="text-2xl font-black text-slate-900 dark:text-white whitespace-nowrap">{PILOT_CLASS_CAPACITY} תלמידים</span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">קבוע לפי תקן הפיילוט</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input 
            type="text" 
            placeholder="חפש לפי שם מוסד או מורה..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-none text-slate-900 dark:text-white text-sm focus:outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Schools Cards Grid */}
      <div className="grid gap-8">
        {filteredSchools.length === 0 ? (
          <div className="col-span-full text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30 space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <Building className="w-8 h-8 opacity-60" />
            </div>
            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">
              {searchQuery ? "לא נמצאו מוסדות התואמים לחיפוש" : "טרם הוקמו מוסדות חינוכיים במערכת"}
            </h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              לחץ על לחצן הקמת מוסד חדש כדי להפעיל את אשף ההקמה המונחה.
            </p>
            {!searchQuery && (
              <UdlButton 
                semanticColor="primary" 
                className="mt-2 px-6 py-2.5 rounded-xl bg-violet-600 text-white font-bold"
                onClick={() => openWizard("full_setup")}
              >
                הפעל אשף הקמה
              </UdlButton>
            )}
          </div>
        ) : (
          filteredSchools.map((school) => {
            const schoolTeachers = teachers.filter((t) => t.schoolId === school.id);
            const schoolClasses = classes.filter((c) => c.schoolId === school.id);

            return (
              <motion.div 
                key={school.id}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col transition-all hover:border-violet-300 dark:hover:border-violet-700/60 hover:shadow-2xl"
              >
                {/* School Card Top Bar */}
                <div className="bg-slate-50 dark:bg-slate-950/60 p-6 flex justify-between items-center border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/20 font-bold">
                      <Building className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {school.name}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        מזהה מוסד: {school.id}
                      </p>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleDeleteSchool(school)}
                    disabled={isDeletingId === school.id}
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-400 transition-colors flex items-center justify-center cursor-pointer"
                    title="מחק מוסד"
                  >
                    {isDeletingId === school.id ? (
                      <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Card Content Body */}
                <div className="p-6 md:p-8 flex-1 flex flex-col space-y-6">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-violet-50/40 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">סגל הוראה רשום</span>
                        <span className="text-3xl font-black text-violet-600 dark:text-violet-400">
                          {schoolTeachers.length}
                        </span>
                      </div>
                      <Users className="w-7 h-7 text-violet-400/60" />
                    </div>

                    <div className="bg-cyan-50/40 dark:bg-cyan-950/30 border border-cyan-100 dark:border-cyan-900/40 p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">כיתות מוגדרות</span>
                        <span className="text-3xl font-black text-cyan-600 dark:text-cyan-400">
                          {schoolClasses.length}
                        </span>
                      </div>
                      <GraduationCap className="w-7 h-7 text-cyan-400/60" />
                    </div>
                  </div>

                  {/* Registered Teachers List */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                        סגל מורים פעיל:
                      </h4>
                      <button 
                        onClick={() => openWizard("add_teacher", school.id)}
                        className="text-xs text-violet-600 dark:text-violet-400 font-bold hover:underline cursor-pointer"
                      >
                        + הוסף מורה
                      </button>
                    </div>

                    {schoolTeachers.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">טרם נרשמו מורים למוסד זה.</p>
                    ) : (
                      <div className="space-y-2">
                        {schoolTeachers.map((teacher) => (
                          <div 
                            key={teacher.id}
                            className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-sm group"
                          >
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-mono break-all min-w-0" dir="ltr">{teacher.ssoEmail}</span>
                                {schoolClasses.some((c) => c.teacherId === teacher.id) ? (
                                  <span className="shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                                    מורה מובילה
                                  </span>
                                ) : (
                                  <span className="shrink-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700">
                                    מורה מורשית
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
                                <span className="flex items-center gap-1 font-mono min-w-0">
                                  <KeyRound className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="break-all">דוא"ל SSO: <bdi dir="ltr">{teacher.ssoEmail}</bdi></span>
                                </span>
                              </div>
                            </div>

                            <button 
                              onClick={() => handleDeleteTeacher(teacher)}
                              disabled={isDeletingId === teacher.id}
                              className="shrink-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-50 disabled:cursor-not-allowed p-2 rounded-xl transition-all cursor-pointer"
                              title="מחק מורה"
                            >
                              {isDeletingId === teacher.id ? (
                                <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Registered Classes List */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                        כיתות לימוד במוסד:
                      </h4>
                      {/* Module 25 §ב.1: the one class can be (re)created only when none exists. */}
                      {classes.length === 0 && (
                        <button
                          onClick={() => openWizard("add_class", school.id)}
                          className="text-xs text-violet-600 dark:text-violet-400 font-bold hover:underline cursor-pointer"
                        >
                          + הקמת כיתת המבקרים
                        </button>
                      )}
                    </div>

                    {schoolClasses.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">טרם הוקמו כיתות במוסד זה.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {schoolClasses.map((cls) => (
                          <div 
                            key={cls.id}
                            className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl flex items-center justify-between text-sm group"
                          >
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="w-4 h-4 text-cyan-500" />
                              <span className="font-bold text-slate-800 dark:text-slate-200">{cls.name}</span>
                            </div>

                            <button 
                              onClick={() => handleDeleteClass(cls)}
                              disabled={isDeletingId === cls.id}
                              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-50 disabled:cursor-not-allowed p-1.5 rounded-lg transition-all cursor-pointer"
                              title="מחק כיתה"
                            >
                              {isDeletingId === cls.id ? (
                                <span className="w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 mt-auto">
                    <UdlButton 
                      semanticColor="neutral" 
                      className="flex-1 justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-950 hover:text-violet-600 dark:hover:text-violet-400 text-xs font-bold py-3 rounded-xl transition-all cursor-pointer"
                      onClick={() => openWizard("add_teacher", school.id)}
                    >
                      <Users className="w-4 h-4" />
                      רישום מורה
                    </UdlButton>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Multi-Tenant Setup Wizard Modal */}
      <AdminWizardModal 
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialTargetSchoolId={targetSchoolId}
        mode={wizardMode}
      />
    </div>
  );
}
