import { useMemo } from "react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { DataGrid } from "@/presentation/design-system/DataGrid";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ClusteringTabProps {
  allStudents: any[];
}

export function ClusteringTab({ allStudents }: ClusteringTabProps) {
  const basicAdditionGroup = allStudents.filter(
    (s) => s.qMatrixResults.task4_basic_addition_fluency && s.qMatrixResults.task4_basic_addition_fluency !== 'success',
  );
  const flexibilityGroup = allStudents.filter(
    (s) => s.qMatrixResults.task3_flexible_regrouping && s.qMatrixResults.task3_flexible_regrouping !== 'success',
  );
  const zeroPlaceholderGroup = allStudents.filter(
    (s) => s.qMatrixResults.task1_zero_placeholder && s.qMatrixResults.task1_zero_placeholder !== 'success',
  );
  const estimationGroup = allStudents.filter(
    (s) =>
      s.qMatrixResults.task2_estimation_error_margin &&
      s.qMatrixResults.task2_estimation_error_margin !== 'success',
  );
  const basicSubtractionGroup = allStudents.filter(
    (s) => s.qMatrixResults.task6_subtraction_regrouping && s.qMatrixResults.task6_subtraction_regrouping !== 'success',
  );
  const missingSubtrahendGroup = allStudents.filter(
    (s) => s.qMatrixResults.task7_missing_subtrahend && s.qMatrixResults.task7_missing_subtrahend !== 'success',
  );
  const missingAddendGroup = allStudents.filter(
    (s) => s.qMatrixResults.task8_missing_addend && s.qMatrixResults.task8_missing_addend !== 'success',
  );
  const smallChangeGroup = allStudents.filter(
    (s) => s.qMatrixResults.task5_small_change && s.qMatrixResults.task5_small_change !== 'success',
  );

  const translateRootCause = (tag: string | null | undefined) => {
    if (!tag) return "לא נבדק";
    const map: Record<string, string> = {
      'procedural_error': 'שגיאה באלגוריתם',
      'basic_facts_deficit': 'קושי בעובדות יסוד',
      'canonical_fixation': 'קיבעון קנוני',
      'regrouping_requires_prompting': 'דורש תיווך לפריטה',
      'zero_placeholder_hundreds_error': 'השמטת אפס (מאות)',
      'zero_placeholder_global_error': 'אי-הבנת שומר מקום',
      'estimation_large_numbers_anxiety': 'חשש ממספרים גדולים',
      'spatial_number_sense_deficit': 'קושי בתחושת מרחב/מספר',
      'regrouping_anxiety': 'חשש מפריטה (חוסר הבנה מוחשית)',
      'subtraction_operation_deficit': 'קושי בחיסור בסיסי',
      'flexibility_trap': 'נוקשות מתמטית',
      'algebraic_concept_deficit': 'קושי בהבנת מאזניים (אלגברה)',
      'computational_fluency_deficit': 'חוסר שטף חישובי',
    };
    return map[tag] || tag;
  };

  const qMatrixData = useMemo(() => {
    let t1s = 0, t1f = 0,
        t2s = 0, t2f = 0,
        t3s = 0, t3f = 0,
        t4s = 0, t4f = 0,
        t5s = 0, t5f = 0,
        t6s = 0, t6f = 0,
        t7s = 0, t7f = 0,
        t8s = 0, t8f = 0;
    
    allStudents.forEach((s) => {
      if (s.qMatrixResults.task1_zero_placeholder === 'success') t1s++;
      else if (s.qMatrixResults.task1_zero_placeholder) t1f++;

      if (s.qMatrixResults.task2_estimation_error_margin === 'success') t2s++;
      else if (s.qMatrixResults.task2_estimation_error_margin) t2f++;

      if (s.qMatrixResults.task3_flexible_regrouping === 'success') t3s++;
      else if (s.qMatrixResults.task3_flexible_regrouping) t3f++;

      if (s.qMatrixResults.task4_basic_addition_fluency === 'success') t4s++;
      else if (s.qMatrixResults.task4_basic_addition_fluency) t4f++;

      if (s.qMatrixResults.task5_small_change === 'success') t5s++;
      else if (s.qMatrixResults.task5_small_change) t5f++;

      if (s.qMatrixResults.task6_subtraction_regrouping === 'success') t6s++;
      else if (s.qMatrixResults.task6_subtraction_regrouping) t6f++;

      if (s.qMatrixResults.task7_missing_subtrahend === 'success') t7s++;
      else if (s.qMatrixResults.task7_missing_subtrahend) t7f++;

      if (s.qMatrixResults.task8_missing_addend === 'success') t8s++;
      else if (s.qMatrixResults.task8_missing_addend) t8f++;
    });

    return [
      { name: "חיבור בסיסי", success: t4s, struggle: t4f },
      { name: "תחושת מספר", success: t5s, struggle: t5f },
      { name: "חיסור עם פריטה", success: t6s, struggle: t6f },
      { name: "שומר מקום (אפס)", success: t1s, struggle: t1f },
      { name: "גמישות מחשבתית", success: t3s, struggle: t3f },
      { name: "אומדן", success: t2s, struggle: t2f },
      { name: "מציאת מחסר", success: t7s, struggle: t7f },
      { name: "מציאת מחובר", success: t8s, struggle: t8f },
    ];
  }, [allStudents]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-10">
        <h1 className="text-4xl font-black bg-gradient-to-l from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
          קיבוץ תלמידים לפי פערי למידה
        </h1>
        <p className="text-ws-soft mt-3 text-lg">
          המערכת מקבצת תלמידים באופן אוטומטי על בסיס מודל ה-<span dir="ltr">Q-Matrix</span>.
        </p>
      </header>

      <AccessibleCard className="p-8 bg-ws-surface/80 backdrop-blur-xl mb-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2 rounded-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
          <span className="w-1.5 h-6 bg-ws-accentSoft0 rounded-full"></span>
          התפלגות שליטה במיומנויות (כיתה שלמה)
        </h2>
        <div className="h-[350px] w-full relative z-10" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={qMatrixData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="currentColor"
                className="text-slate-200 opacity-50"
              />
              <XAxis
                dataKey="name"
                fontSize={13}
                tickLine={false}
                axisLine={false}
                tick={{
                  fill: "currentColor",
                  className: "text-ws-soft",
                }}
                dy={10}
              />
              <YAxis
                orientation="right"
                fontSize={13}
                tickLine={false}
                axisLine={false}
                tick={{
                  fill: "currentColor",
                  className: "text-ws-soft",
                }}
                dx={-10}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(15, 23, 42, 0.9)",
                  color: "white",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.2)",
                }}
                cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
              />
              <Legend wrapperStyle={{ paddingTop: "20px" }} />
              <Bar
                dataKey="success"
                name="שליטה במיומנות (%)"
                stackId="a"
                fill="#3b82f6"
                radius={[0, 0, 6, 6]}
              />
              <Bar
                dataKey="struggle"
                name="מאבק / פער (%)"
                stackId="a"
                fill="#f43f5e"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </AccessibleCard>

      <div className="flex gap-6 pb-6 overflow-x-auto snap-x snap-mandatory hide-scrollbar" style={{ scrollbarWidth: 'none' }}>
        <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2 rounded-2xl relative overflow-hidden group flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-rose-500"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink">
            חיבור במאונך של מספרים (משימה 4)
          </h3>
          <p className="text-ws-soft mb-6 text-base leading-relaxed relative z-10">
            תלמידים שהתקשו בפעולות חיבור בסיסיות ללא המרה.
          </p>
          <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2 shadow-inner">
            <DataGrid
              columns={[
                { key: "name", header: "שם תלמיד" },
                { key: "errors", header: "זיהוי כשל" },
              ]}
              data={basicAdditionGroup.map((s) => ({
                id: s.studentId,
                name: s.name,
                errors: translateRootCause(s.qMatrixResults.task4_basic_addition_fluency),
              }))}
            />
          </div>
          <UdlButton
            size="sm"
            semanticColor="primary"
            className="mt-6 w-full shadow-lg shadow-indigo-500/20 relative z-10 font-bold tracking-wide"
          >
            הקצה תרגול מותאם
          </UdlButton>
        </AccessibleCard>

        <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2 rounded-2xl relative overflow-hidden group flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink">
            פירוק והרכבה לפי המבנה העשרוני (משימה 3)
          </h3>
          <p className="text-ws-soft mb-6 text-base leading-relaxed relative z-10">
            תלמידים שהצליחו לפרק רק בצורה הקנונית וזקוקים לתרגול גמישות בהמרה.
          </p>
          <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2 shadow-inner">
            <DataGrid
              columns={[
                { key: "name", header: "שם תלמיד" },
                { key: "reps", header: "זיהוי כשל" },
              ]}
              data={flexibilityGroup.map((s) => ({
                id: s.studentId,
                name: s.name,
                reps: translateRootCause(s.qMatrixResults.task3_flexible_regrouping),
              }))}
            />
          </div>
          <UdlButton
            size="sm"
            semanticColor="primary"
            className="mt-6 w-full shadow-lg shadow-indigo-500/20 relative z-10 font-bold tracking-wide"
          >
            הקצה סדנת חקר
          </UdlButton>
        </AccessibleCard>

        <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2 rounded-2xl relative overflow-hidden group flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink">
            המבנה העשרוני והמושג ספרה (משימה 1)
          </h3>
          <p className="text-ws-soft mb-6 text-base leading-relaxed relative z-10">
            תלמידים שהתקשו בהבנת האפס כשומר מקום במערכת העשרונית.
          </p>
          <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2 shadow-inner">
            <DataGrid
              columns={[
                { key: "name", header: "שם תלמיד" },
                { key: "errors", header: "זיהוי כשל" },
              ]}
              data={zeroPlaceholderGroup.map((s) => ({
                id: s.studentId,
                name: s.name,
                errors: translateRootCause(s.qMatrixResults.task1_zero_placeholder),
              }))}
            />
          </div>
          <UdlButton
            size="sm"
            semanticColor="primary"
            className="mt-6 w-full shadow-lg shadow-blue-500/20 relative z-10 font-bold tracking-wide"
          >
            הקצה תרגול מותאם
          </UdlButton>
        </AccessibleCard>

        <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2 rounded-2xl relative overflow-hidden group flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink">
            רצף וסדר על ישר המספרים (משימה 2)
          </h3>
          <p className="text-ws-soft mb-6 text-base leading-relaxed relative z-10">
            תלמידים שחרגו מטווח הטעות המותר בהערכת הכמויות.
          </p>
          <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2 shadow-inner">
            <DataGrid
              columns={[
                { key: "name", header: "שם תלמיד" },
                { key: "margin", header: "זיהוי כשל" },
              ]}
              data={estimationGroup.map((s) => ({
                id: s.studentId,
                name: s.name,
                margin: translateRootCause(s.qMatrixResults.task2_estimation_error_margin),
              }))}
            />
          </div>
          <UdlButton
            size="sm"
            semanticColor="primary"
            className="mt-6 w-full shadow-lg shadow-emerald-500/20 relative z-10 font-bold tracking-wide"
          >
            הקצה המחשה חזותית
          </UdlButton>
        </AccessibleCard>

        <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2 rounded-2xl relative overflow-hidden group flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-fuchsia-500"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink">
            חיסור עם פריטה מוחשית (משימה 6)
          </h3>
          <p className="text-ws-soft mb-6 text-base leading-relaxed relative z-10">
            תלמידים שהתקשו בתהליך הפריטה (חרדת פריטה) או שחסרות להם עובדות יסוד בחיסור.
          </p>
          <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2 shadow-inner">
            <DataGrid
              columns={[
                { key: "name", header: "שם תלמיד" },
                { key: "errors", header: "זיהוי כשל" },
              ]}
              data={basicSubtractionGroup.map((s) => ({
                id: s.studentId,
                name: s.name,
                errors: translateRootCause(s.qMatrixResults.task6_subtraction_regrouping),
              }))}
            />
          </div>
          <UdlButton
            size="sm"
            semanticColor="primary"
            className="mt-6 w-full shadow-lg shadow-pink-500/20 relative z-10 font-bold tracking-wide"
          >
            הקצה בלוקים ווירטואליים
          </UdlButton>
        </AccessibleCard>

        <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2 rounded-2xl relative overflow-hidden group flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink">
            מציאת מחסר (משימה 7)
          </h3>
          <p className="text-ws-soft mb-6 text-base leading-relaxed relative z-10">
            תלמידים שהתקשו במציאת איבר חסר באמצע המשוואה.
          </p>
          <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2 shadow-inner">
            <DataGrid
              columns={[
                { key: "name", header: "שם תלמיד" },
                { key: "errors", header: "זיהוי כשל" },
              ]}
              data={missingSubtrahendGroup.map((s) => ({
                id: s.studentId,
                name: s.name,
                errors: translateRootCause(s.qMatrixResults.task7_missing_subtrahend),
              }))}
            />
          </div>
          <UdlButton
            size="sm"
            semanticColor="primary"
            className="mt-6 w-full shadow-lg shadow-amber-500/20 relative z-10 font-bold tracking-wide"
          >
            הקצה מודל מאזניים
          </UdlButton>
        </AccessibleCard>

        <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2 rounded-2xl relative overflow-hidden group flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 to-amber-500"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink">
            מציאת מחובר (משימה 8)
          </h3>
          <p className="text-ws-soft mb-6 text-base leading-relaxed relative z-10">
            תלמידים שהתקשו בהבנת חשיבה אלגברית והקשר בין חיבור לחיסור.
          </p>
          <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2 shadow-inner">
            <DataGrid
              columns={[
                { key: "name", header: "שם תלמיד" },
                { key: "errors", header: "זיהוי כשל" },
              ]}
              data={missingAddendGroup.map((s) => ({
                id: s.studentId,
                name: s.name,
                errors: translateRootCause(s.qMatrixResults.task8_missing_addend),
              }))}
            />
          </div>
          <UdlButton
            size="sm"
            semanticColor="primary"
            className="mt-6 w-full shadow-lg shadow-yellow-500/20 relative z-10 font-bold tracking-wide"
          >
            הקצה מודל מאזניים
          </UdlButton>
        </AccessibleCard>

        <AccessibleCard className="min-w-[400px] snap-center p-8 bg-ws-surface/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-ws-surface2 rounded-2xl relative overflow-hidden group flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-500 to-gray-500"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <h3 className="text-2xl font-bold mb-4 relative z-10 text-ws-ink">
            תחושת מספר וגמישות (משימה 5)
          </h3>
          <p className="text-ws-soft mb-6 text-base leading-relaxed relative z-10">
            תלמידים שנפלו במלכודת הגמישות ולא זיהו את השינוי הקטן.
          </p>
          <div className="relative z-10 rounded-xl overflow-hidden border border-ws-surface2 shadow-inner">
            <DataGrid
              columns={[
                { key: "name", header: "שם תלמיד" },
                { key: "errors", header: "זיהוי כשל" },
              ]}
              data={smallChangeGroup.map((s) => ({
                id: s.studentId,
                name: s.name,
                errors: translateRootCause(s.qMatrixResults.task5_small_change),
              }))}
            />
          </div>
          <UdlButton
            size="sm"
            semanticColor="primary"
            className="mt-6 w-full shadow-lg shadow-slate-500/20 relative z-10 font-bold tracking-wide"
          >
            הקצה חקר יחסים
          </UdlButton>
        </AccessibleCard>
      </div>
    </div>
  );
}
