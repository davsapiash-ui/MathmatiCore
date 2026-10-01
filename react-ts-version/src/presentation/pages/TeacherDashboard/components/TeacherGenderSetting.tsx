import { useState } from 'react';
import { toast } from 'sonner';
import { useTeacherGender, saveTeacherGender } from '@/application/useTeacherGender';
import { teacherSentenceHe, type TeacherGender } from '@/core/teacherGender';

const OPTIONS: ReadonlyArray<{ value: TeacherGender; label: string }> = [
  { value: 'female', label: 'נקבה' },
  { value: 'male', label: 'זכר' },
];

/**
 * Owner, 1.10.2026: the teacher marks once whether the children's screens
 * speak of the teacher in the feminine or in the masculine
 * (core/teacherGender.ts). The example under the choice is a real sentence
 * from the children's lobby, in the chosen form. The teacher's own screens
 * are not affected: they address the teacher in the plural.
 */
export function TeacherGenderSetting() {
  const gender = useTeacherGender();
  const [isSaving, setIsSaving] = useState(false);

  const choose = async (next: TeacherGender) => {
    if (next === gender || isSaving) return;
    setIsSaving(true);
    try {
      await saveTeacherGender(next);
    } catch (err) {
      console.warn('[TeacherGenderSetting] save refused:', err);
      toast.error('השמירה נכשלה. נסו שוב.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="teacher-gender-setting">
      <div id="teacher-gender-label" className="text-xs font-bold text-ws-ink px-1">
        המורה במסכי התלמידים
      </div>
      <div role="radiogroup" aria-labelledby="teacher-gender-label" className="grid grid-cols-2 gap-1.5">
        {OPTIONS.map((option) => {
          const checked = option.value === gender;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={isSaving}
              onClick={() => choose(option.value)}
              className={`min-h-11 rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ws-accent focus-visible:ring-offset-2 disabled:cursor-wait ${
                checked ? 'bg-ws-accentSoft text-ws-accent shadow-sm' : 'bg-ws-bg text-ws-soft hover:text-ws-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ws-soft leading-relaxed px-1">
        לדוגמה: "{teacherSentenceHe('willOpenActivity', gender)}"
      </p>
    </div>
  );
}
