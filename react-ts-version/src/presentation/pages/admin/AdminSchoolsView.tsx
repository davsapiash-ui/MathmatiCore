import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  AlertCircle,
  BarChart3,
  Layers
} from "lucide-react";
import { useAdminStore } from "@/application/useAdminStore";
import { AdminWizardModal } from "./AdminWizardModal";

export function AdminSchoolsView() {
  const { 
    schools, 
    teachers, 
    classes, 
    globalStudentLimit, 
    setGlobalStudentLimit,
    deleteSchool,
    deleteTeacher,
    deleteClassRoom
  } = useAdminStore();

  const [limitInput, setLimitInput] = useState(globalStudentLimit.toString());
  const [searchQuery, setSearchQuery] = useState("");
  
  // Wizard Modal State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<"full_setup" | "add_teacher" | "add_class">("full_setup");
  const [targetSchoolId, setTargetSchoolId] = useState<string | null>(null);

  const handleSaveLimit = () => {
    const num = parseInt(limitInput, 10);
    if (!isNaN(num) && num > 0) {
      setGlobalStudentLimit(num);
    }
  };

  const filteredSchools = useMemo(() => {
    if (!searchQuery.trim()) return schools;
    const query = searchQuery.toLowerCase().trim();
    return schools.filter(s => {
      const schoolTeachers = teachers.filter(t => t.schoolId === s.id);
      const hasMatchingTeacher = schoolTeachers.some(t => t.name.toLowerCase().includes(query) || t.taz.includes(query));
      return s.name.toLowerCase().includes(query) || hasMatchingTeacher;
    });
  }, [schools, teachers, searchQuery]);

  const openWizard = (mode: "full_setup" | "add_teacher" | "add_class", schoolId: string | null = null) => {
    setWizardMode(mode);
    setTargetSchoolId(schoolId);
    setWizardOpen(true);
  };

  return (
    <div className="p-6 md:p-10 pb-24 max-w-7xl mx-auto space-y-8" dir="rtl">
      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-950 p-8 text-white shadow-2xl border border-indigo-500/20">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ניהול מוסדי מרובה דיירים (Multi-Tenant Management)</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              פריסת מוסדות, מורים וכיתות
            </h1>
            <p className="text-slate-300 text-sm md:text-base max-w-2xl font-light leading-relaxed">
              מערכת אדמיניסטרטיבית להקמה וניהול של מוסדות לימוד, שיוך מורים מובילים והגדרת כיתות לימוד בהתאם לתקני פיילוט.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <UdlButton 
              semanticColor="primary" 
              className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-indigo-600/30 border border-indigo-400/30 transition-all hover:scale-105 active:scale-95"
              onClick={() => openWizard("full_setup")}
            >
              <Plus className="w-5 h-5" />
              <span>הקמת מוסד חדש (אשף מונחה)</span>
            </UdlButton>
          </div>
        </div>

        {/* Pilot Scale Progress Bar */}
        <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-300 block">מוסדות חינוך מוקמים</span>
              <span className="text-2xl font-black text-indigo-300">{schools.length} / 5</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Building className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-300 block">סגל מורים רשום</span>
              <span className="text-2xl font-black text-emerald-300">{teachers.length} / 5</span>
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
      <div className="grid md:grid-cols-3 gap-6">
        {/* Capacity Settings Panel */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                מגבלת תפוסת תלמידים גלובלית
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                מספר התלמידים המרבי המורשה להרשמה לכל כיתת לימוד רגילה
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input 
              type="number" 
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="w-24 text-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-3 font-extrabold text-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none" 
            />
            <UdlButton 
              semanticColor="neutral" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl shadow-md transition-all shrink-0" 
              onClick={handleSaveLimit}
            >
              עדכן מגבלה
            </UdlButton>
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
      <div className="grid lg:grid-cols-2 gap-8">
        {filteredSchools.length === 0 ? (
          <div className="col-span-2 text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30 space-y-4">
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
                className="mt-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold"
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
                className="relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col transition-all hover:border-indigo-300 dark:hover:border-indigo-700/60 hover:shadow-2xl"
              >
                {/* School Card Top Bar */}
                <div className="bg-slate-50 dark:bg-slate-950/60 p-6 flex justify-between items-center border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 font-bold">
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
                    onClick={() => {
                      if (window.confirm(`מחיקת המוסד "${school.name}" תמחק גם את המורים והכיתות המשויכים אליו. האם להמשיך?`)) {
                        deleteSchool(school.id);
                      }
                    }}
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 text-slate-400 transition-colors flex items-center justify-center"
                    title="מחק מוסד"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Card Content Body */}
                <div className="p-6 md:p-8 flex-1 flex flex-col space-y-6">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-indigo-50/40 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">מורים מובילים</span>
                        <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                          {schoolTeachers.length} / 1
                        </span>
                      </div>
                      <Users className="w-7 h-7 text-indigo-400/60" />
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
                      {schoolTeachers.length === 0 && (
                        <button 
                          onClick={() => openWizard("add_teacher", school.id)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                        >
                          + הוסף מורה מוביל
                        </button>
                      )}
                    </div>

                    {schoolTeachers.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">טרם שויך מורה מוביל למוסד זה.</p>
                    ) : (
                      <div className="space-y-2">
                        {schoolTeachers.map((teacher) => (
                          <div 
                            key={teacher.id}
                            className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl flex items-center justify-between text-sm group"
                          >
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>{teacher.name}</span>
                                <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                                  מורה מוביל
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
                                <span className="flex items-center gap-1 font-mono">
                                  <KeyRound className="w-3 h-3 text-slate-400" />
                                  ת"ז: {teacher.taz}
                                </span>
                                <span className="font-mono">סיסמא: {teacher.dob}</span>
                              </div>
                            </div>

                            <button 
                              onClick={() => deleteTeacher(teacher.id)}
                              className="text-slate-400 hover:text-rose-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="מחק מורה"
                            >
                              <Trash2 className="w-4 h-4" />
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
                      <button 
                        onClick={() => openWizard("add_class", school.id)}
                        className="text-xs text-cyan-600 dark:text-cyan-400 font-bold hover:underline"
                      >
                        + הוסף כיתה
                      </button>
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
                              onClick={() => deleteClassRoom(cls.id)}
                              className="text-slate-400 hover:text-rose-500 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="מחק כיתה"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
                      className="flex-1 justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-bold py-3 rounded-xl transition-all"
                      onClick={() => openWizard("add_teacher", school.id)}
                    >
                      <Users className="w-4 h-4" />
                      רישום מורה
                    </UdlButton>

                    <UdlButton 
                      semanticColor="neutral" 
                      className="flex-1 justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-cyan-50 dark:hover:bg-cyan-950 hover:text-cyan-600 dark:hover:text-cyan-400 text-xs font-bold py-3 rounded-xl transition-all"
                      onClick={() => openWizard("add_class", school.id)}
                    >
                      <Plus className="w-4 h-4" />
                      הקמת כיתה
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
