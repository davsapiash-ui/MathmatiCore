import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Building, 
  Users, 
  GraduationCap, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  ShieldCheck, 
  AlertCircle, 
  Sparkles,
  UserPlus,
  BookOpen
} from "lucide-react";
import { useAdminStore } from "@/application/useAdminStore";
import { UdlButton } from "@/presentation/design-system/UdlButton";

interface AdminWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTargetSchoolId?: string | null;
  mode?: "full_setup" | "add_teacher" | "add_class";
}

export function AdminWizardModal({
  isOpen,
  onClose,
  initialTargetSchoolId = null,
  mode = "full_setup"
}: AdminWizardModalProps) {
  const { 
    schools, 
    teachers, 
    classes, 
    globalStudentLimit, 
    addSchool, 
    addTeacher, 
    addClassRoom 
  } = useAdminStore();

  const [step, setStep] = useState<number>(mode === "add_teacher" ? 2 : mode === "add_class" ? 3 : 1);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(initialTargetSchoolId || (schools[0]?.id ?? ""));
  
  // Step 1: School Form
  const [schoolName, setSchoolName] = useState("");
  const [schoolError, setSchoolError] = useState("");

  // Step 2: Teacher Form
  const [teacherName, setTeacherName] = useState("");
  const [teacherTaz, setTeacherTaz] = useState("");
  const [teacherDob, setTeacherDob] = useState("");
  const [teacherError, setTeacherError] = useState("");

  // Step 3: Class Form
  const [className, setClassName] = useState("");
  const [studentLimit, setStudentLimit] = useState(globalStudentLimit.toString());
  const [classError, setClassError] = useState("");

  // Provisioning Complete state
  const [isDone, setIsDone] = useState(false);

  if (!isOpen) return null;

  // Validation functions
  const validateStep1 = () => {
    setSchoolError("");
    if (!schoolName.trim()) {
      setSchoolError("נא להזין שם מוסד חינוכי.");
      return false;
    }
    if (schools.length >= 5) {
      setSchoolError("המערכת הגיעה למגבלת הפיילוט המרבית של 5 מוסדות חינוך (סעיף 5.6 באפיון).");
      return false;
    }
    return true;
  };

  const validateStep2 = (targetSchoolId: string) => {
    setTeacherError("");
    if (!teacherName.trim()) {
      setTeacherError("נא להזין שם מורה.");
      return false;
    }
    if (!teacherTaz.trim() || !teacherTaz.includes('@')) {
      setTeacherError("נא להזין כתובת דוא\"ל ארגונית מורשת (Google SSO).");
      return false;
    }
    if (teachers.length >= 5) {
      setTeacherError("המערכת הגיעה למגבלת הפיילוט המרבית של 5 מורים בסך הכל (סעיף 5.6 באפיון).");
      return false;
    }
    const schoolTeachers = teachers.filter(t => t.schoolId === targetSchoolId);
    if (schoolTeachers.length >= 1) {
      setTeacherError("לפי מפרט הפיילוט (סעיף 5.6), מוגדר מורה מוביל אחד בלבד לכל מוסד חינוכי.");
      return false;
    }
    return true;
  };

  const validateStep3 = (targetTeacherId: string) => {
    setClassError("");
    if (!className.trim()) {
      setClassError("נא להזין שם כיתה.");
      return false;
    }
    const teacherClasses = classes.filter(c => c.teacherId === targetTeacherId);
    if (teacherClasses.length >= 5) {
      setClassError("מורה זה הגיע למגבלת הפיילוט המרבית של 5 כיתות (סעיף 5.6 באפיון).");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (validateStep2(selectedSchoolId || "pending_new")) setStep(3);
    } else if (step === 3) {
      if (validateStep3("pending_new")) setStep(4);
    }
  };

  const handlePrev = () => {
    if (step > 1 && mode === "full_setup") {
      setStep(step - 1);
    }
  };

  const handleFinishFullSetup = () => {
    if (!validateStep1() || !validateStep2("pending_new")) return;
    
    // 1. Create School
    const cleanSchoolName = schoolName.trim();
    addSchool(cleanSchoolName);
    
    // Wait for store update or grab freshly created ID
    setTimeout(() => {
      const freshSchools = useAdminStore.getState().schools;
      const createdSchool = freshSchools.find(s => s.name === cleanSchoolName) || freshSchools[freshSchools.length - 1];
      const schoolId = createdSchool ? createdSchool.id : `sch_${Date.now()}`;

      // 2. Create Teacher
      const cleanTeacherName = teacherName.trim();
      const cleanTaz = teacherTaz.trim();
      const cleanDob = teacherDob.trim() || "010190";
      addTeacher(schoolId, cleanTeacherName, cleanTaz, cleanDob);

      setTimeout(() => {
        const freshTeachers = useAdminStore.getState().teachers;
        const createdTeacher = freshTeachers.find(t => t.taz === cleanTaz) || freshTeachers[freshTeachers.length - 1];
        const teacherId = createdTeacher ? createdTeacher.id : `t_${Date.now()}`;

        // 3. Create Class
        const cleanClassName = className.trim() || "כיתה א'";
        addClassRoom(schoolId, teacherId, cleanClassName);

        setIsDone(true);
      }, 50);
    }, 50);
  };

  const handleQuickAddTeacher = () => {
    if (!selectedSchoolId) {
      setTeacherError("יש לבחור מוסד חינוכי.");
      return;
    }
    if (!validateStep2(selectedSchoolId)) return;
    addTeacher(selectedSchoolId, teacherName.trim(), teacherTaz.trim(), teacherDob.trim() || "010190");
    setIsDone(true);
  };

  const handleQuickAddClass = () => {
    if (!selectedSchoolId) {
      setClassError("יש לבחור מוסד חינוכי.");
      return;
    }
    const schoolTeachers = teachers.filter(t => t.schoolId === selectedSchoolId);
    if (schoolTeachers.length === 0) {
      setClassError("יש להגדיר מורה מוביל למוסד לפני הקמת כיתה.");
      return;
    }
    const teacherId = schoolTeachers[0].id;
    if (!validateStep3(teacherId)) return;
    addClassRoom(selectedSchoolId, teacherId, className.trim());
    setIsDone(true);
  };

  const resetAndClose = () => {
    setStep(1);
    setSchoolName("");
    setTeacherName("");
    setTeacherTaz("");
    setTeacherDob("");
    setClassName("");
    setSchoolError("");
    setTeacherError("");
    setClassError("");
    setIsDone(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6" dir="rtl">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={resetAndClose}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.1 }}
            className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-6 pb-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    {mode === "add_teacher" 
                      ? "רישום מורה מוביל למוסד" 
                      : mode === "add_class" 
                      ? "הקמת כיתת לימוד" 
                      : "אשף הקמת מוסד חינוכי חדש"}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    תקני פיילוט ומבנה מוסדי (סעיף 5.6 באפיון)
                  </p>
                </div>
              </div>
              <button 
                onClick={resetAndClose}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Progress Bar (Only in full setup) */}
            {mode === "full_setup" && !isDone && (
              <div className="px-8 pt-6 pb-2 bg-slate-50/30 dark:bg-slate-900/30">
                <div className="flex justify-between items-center relative">
                  {/* Connecting Line */}
                  <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-800 -translate-y-1/2 z-0" />
                  <div 
                    className="absolute top-1/2 right-0 h-1 bg-gradient-to-l from-indigo-500 to-cyan-400 -translate-y-1/2 z-0 transition-all duration-500"
                    style={{ width: `${((step - 1) / 3) * 100}%` }}
                  />

                  {/* Step Indicators */}
                  {[
                    { num: 1, title: "פרטי מוסד", icon: Building },
                    { num: 2, title: "מורה מוביל", icon: UserPlus },
                    { num: 3, title: "כיתה ראשונה", icon: BookOpen },
                    { num: 4, title: "סיכום ואישור", icon: CheckCircle2 },
                  ].map((s) => {
                    const IconComponent = s.icon;
                    const isActive = step === s.num;
                    const isCompleted = step > s.num;

                    return (
                      <div key={s.num} className="relative z-10 flex flex-col items-center gap-1.5">
                        <div 
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                            isCompleted 
                              ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20" 
                              : isActive 
                              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-4 ring-indigo-100 dark:ring-indigo-950" 
                              : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <IconComponent className="w-4 h-4" />}
                        </div>
                        <span className={`text-[11px] font-semibold ${isActive ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-slate-500 dark:text-slate-400"}`}>
                          {s.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
              {isDone ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8 space-y-4"
                >
                  <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20 animate-bounce">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                    {mode === "add_teacher" ? "המורה נרשם בהצלחה!" : mode === "add_class" ? "הכיתה הוקמה בהצלחה!" : "המוסד הוקם בהצלחה!"}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md mx-auto">
                    הנתונים נקלטו במערכת וסונכרנו מול מסד הנתונים. המורה והכיתות מוכנים לעבודה.
                  </p>
                  <div className="pt-4">
                    <UdlButton 
                      semanticColor="primary" 
                      className="px-8 py-3 rounded-2xl shadow-lg shadow-indigo-500/25"
                      onClick={resetAndClose}
                    >
                      סגור חלון
                    </UdlButton>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-6">
                  {/* Step 1: School Info */}
                  {step === 1 && mode === "full_setup" && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 p-4 rounded-2xl flex items-start gap-3">
                        <Building className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm text-indigo-950 dark:text-indigo-200">הגדרת בית ספר / מוסד חינוכי</h4>
                          <p className="text-xs text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
                            בשלב זה מוקם המוסד במערכת. מגבלת הפיילוט מאפשרת עד 5 מוסדות. (נוכחי: {schools.length}/5)
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">
                          שם המוסד החינוכי <span className="text-rose-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          autoFocus
                          placeholder="לדוגמה: בית ספר אלונים תל אביב"
                          value={schoolName}
                          onChange={(e) => { setSchoolName(e.target.value); setSchoolError(""); }}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl p-4 text-base focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                        />
                        {schoolError && (
                          <p className="text-xs text-rose-500 font-semibold flex items-center gap-1 mt-2">
                            <AlertCircle className="w-4 h-4" />
                            {schoolError}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Teacher Credentials */}
                  {(step === 2 || mode === "add_teacher") && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      {mode === "add_teacher" && (
                        <div>
                          <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">
                            בחר מוסד חינוכי <span className="text-rose-500">*</span>
                          </label>
                          <select 
                            value={selectedSchoolId}
                            onChange={(e) => setSelectedSchoolId(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl p-4 text-sm focus:border-indigo-500 outline-none"
                          >
                            {schools.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 p-4 rounded-2xl flex items-start gap-3">
                        <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm text-emerald-950 dark:text-emerald-200">שיוך מורה מוביל (Lead Teacher)</h4>
                          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                            הזדהות המורה תתבצע באופן שקט ומאובטח באמצעות Google SSO והדוא"ל הארגוני המורשה בלבד (סעיף 5.5 באפיון).
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                            שם מלא של המורה <span className="text-rose-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            placeholder="ישראל ישראלי"
                            value={teacherName}
                            onChange={(e) => { setTeacherName(e.target.value); setTeacherError(""); }}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl p-3.5 text-sm focus:border-indigo-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                            כתובת דוא"ל ארגונית (Google SSO) <span className="text-rose-500">*</span>
                          </label>
                          <input 
                            type="email" 
                            placeholder="teacher@edu-haifa.org.il"
                            value={teacherTaz}
                            onChange={(e) => { setTeacherTaz(e.target.value); setTeacherError(""); }}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl p-3.5 text-sm focus:border-indigo-500 outline-none font-mono"
                          />
                        </div>

                        {teacherError && (
                          <p className="text-xs text-rose-500 font-semibold flex items-center gap-1 mt-1">
                            <AlertCircle className="w-4 h-4" />
                            {teacherError}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Class Setup */}
                  {(step === 3 || mode === "add_class") && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      {mode === "add_class" && (
                        <div>
                          <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">
                            בחר מוסד חינוכי <span className="text-rose-500">*</span>
                          </label>
                          <select 
                            value={selectedSchoolId}
                            onChange={(e) => setSelectedSchoolId(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl p-4 text-sm focus:border-indigo-500 outline-none"
                          >
                            {schools.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-900/40 p-4 rounded-2xl flex items-start gap-3">
                        <GraduationCap className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm text-cyan-950 dark:text-cyan-200">הגדרת כיתת לימוד ראשונה</h4>
                          <p className="text-xs text-cyan-800/80 dark:text-cyan-300/80 mt-0.5">
                            הכיתה תשויך למורה המוביל. מורה יחיד יכול לנהל עד 5 כיתות (סעיף 5.6).
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                            שם הכיתה <span className="text-rose-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            placeholder="לדוגמה: ה'3"
                            value={className}
                            onChange={(e) => { setClassName(e.target.value); setClassError(""); }}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl p-3.5 text-sm focus:border-indigo-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                            מגבלת תלמידים מרבית לכיתה זו
                          </label>
                          <input 
                            type="number" 
                            value={studentLimit}
                            onChange={(e) => setStudentLimit(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl p-3.5 text-sm focus:border-indigo-500 outline-none font-bold"
                          />
                        </div>

                        {classError && (
                          <p className="text-xs text-rose-500 font-semibold flex items-center gap-1 mt-1">
                            <AlertCircle className="w-4 h-4" />
                            {classError}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 4: Provisioning Summary (Full setup mode) */}
                  {step === 4 && mode === "full_setup" && (
                    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                      <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4">
                        <h4 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-indigo-500" />
                          אישור תצורת הקמה מוסדית
                        </h4>

                        <div className="space-y-3 divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                          <div className="pt-2 flex justify-between">
                            <span className="text-slate-500">שם המוסד:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-100">{schoolName}</span>
                          </div>
                          <div className="pt-3 flex justify-between">
                            <span className="text-slate-500">מורה מוביל:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-100">{teacherName}</span>
                          </div>
                          <div className="pt-3 flex justify-between">
                            <span className="text-slate-500">שם משתמש (ת"ז):</span>
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{teacherTaz}</span>
                          </div>
                          <div className="pt-3 flex justify-between">
                            <span className="text-slate-500">סיסמא ראשונית (DDMMYY):</span>
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{teacherDob || "010190"}</span>
                          </div>
                          <div className="pt-3 flex justify-between">
                            <span className="text-slate-500">כיתה ראשונה:</span>
                            <span className="font-bold text-cyan-600 dark:text-cyan-400">{className}</span>
                          </div>
                          <div className="pt-3 flex justify-between">
                            <span className="text-slate-500">תפוסה מירבית:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{studentLimit} תלמידים</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Footer / Controls */}
            {!isDone && (
              <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center">
                {mode === "full_setup" && step > 1 ? (
                  <UdlButton 
                    semanticColor="neutral" 
                    onClick={handlePrev}
                    className="gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl"
                  >
                    <ChevronRight className="w-4 h-4" />
                    חזרה
                  </UdlButton>
                ) : (
                  <div />
                )}

                {mode === "full_setup" ? (
                  step < 4 ? (
                    <UdlButton 
                      semanticColor="primary" 
                      onClick={handleNext}
                      className="gap-2 px-6 py-2.5 rounded-xl shadow-md shadow-indigo-500/20"
                    >
                      המשך לשלב הבא
                      <ChevronLeft className="w-4 h-4" />
                    </UdlButton>
                  ) : (
                    <UdlButton 
                      semanticColor="primary" 
                      onClick={handleFinishFullSetup}
                      className="gap-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 font-bold"
                    >
                      הקם מוסד ומורה מוביל
                      <CheckCircle2 className="w-5 h-5" />
                    </UdlButton>
                  )
                ) : mode === "add_teacher" ? (
                  <UdlButton 
                    semanticColor="primary" 
                    onClick={handleQuickAddTeacher}
                    className="gap-2 px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg"
                  >
                    שמור מורה במערכת
                  </UdlButton>
                ) : (
                  <UdlButton 
                    semanticColor="primary" 
                    onClick={handleQuickAddClass}
                    className="gap-2 px-8 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-lg"
                  >
                    הקם כיתה
                  </UdlButton>
                )}
              </div>
            )}
          </motion.div>
        </div>,
        document.body
      )}
    </AnimatePresence>
  );
}
