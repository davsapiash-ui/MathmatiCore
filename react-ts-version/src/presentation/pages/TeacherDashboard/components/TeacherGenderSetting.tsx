import { toast } from 'sonner';
import { useTeacherGender, saveTeacherGender } from '@/application/useTeacherGender';
import { teacherSentenceHe, type TeacherGender } from '@/core/teacherGender';

const OPTIONS: ReadonlyArray<{ value: TeacherGender; label: string }> = [
  { value: 'female', label: 'לשון נקבה' },
  { value: 'male', label: 'לשון זכר' },
];

/**
 * Owner, 1.10.2026: the teacher marks once whether the children's screens
 * speak of the teacher in the feminine or in the masculine
 * (core/teacherGender.ts). The example under the choice is a real sentence
 * from the children's lobby, in the chosen form. The teacher's own screens
 * are not affected: they address the teacher in the plural.
 *
 * Native radio buttons: the arrow keys move between the two, as in any radio
 * group. The choice shows at once — the database shows a write before the
 * server confirms it — so nothing waits on the network, offline included; a
 * refused write puts the old choice back and says so.
 */
export function TeacherGenderSetting() {
  const gender = useTeacherGender();

  const choose = (next: TeacherGender) => {
    if (next === gender) return;
    saveTeacherGender(next).catch((err) => {
      console.warn('[TeacherGenderSetting] save refused:', err);
      toast.error('השמירה נכשלה. נסו שוב.');
    });
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
            <label key={option.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="teacher-gender"
                value={option.value}
                checked={checked}
                onChange={() => choose(option.value)}
                className="peer sr-only"
              />
              <span
                className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-bold transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-ws-accent peer-focus-visible:ring-offset-2 ${
                  checked ? 'bg-ws-accentSoft text-ws-accent shadow-sm' : 'bg-ws-bg text-ws-soft hover:text-ws-ink'
                }`}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-ws-soft leading-relaxed px-1">
        לדוגמה: "{teacherSentenceHe('willOpenActivity', gender)}"
      </p>
    </div>
  );
}
