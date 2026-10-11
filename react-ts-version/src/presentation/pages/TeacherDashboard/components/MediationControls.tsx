import { useState } from 'react';
import { READ_ONLY_TITLE } from '@/application/useIsReadOnlyStaff';
import { useTeacherMediationStore } from '@/application/useTeacherMediationStore';
import {
  MEDIATION_ACTIONS,
  MEDIATION_ACTION_HE,
  MEDIATION_HE,
  type MediationAction,
  type MediationEvent,
  type MediationRecord,
} from '@/core/teacherMediation';

/**
 * Measure 5: the two questions for one mediation event, in two taps (owner,
 * 11.10.2026). "מה עשיתי" then "הנתונים הובילו אותי לכך?"; the record is saved
 * the moment both are chosen. For a physical approach without an event
 * (`event` null) the action is "ניגשתי" and only the second question is asked.
 */
export function MediationControls({
  event,
  studentNumber,
  existing,
  readOnly,
  onSaved,
  testIdPrefix = 'mediation',
}: {
  event: MediationEvent | null;
  studentNumber: number;
  existing?: MediationRecord | null;
  readOnly: boolean;
  onSaved?: () => void;
  testIdPrefix?: string;
}) {
  const record = useTeacherMediationStore((s) => s.record);
  const selfApproach = event === null && !existing?.event_ref;
  const [action, setAction] = useState<MediationAction | null>(existing?.action ?? (selfApproach ? 'approached' : null));
  const [dataLed, setDataLed] = useState<boolean | null>(existing ? existing.data_led : null);
  const [saving, setSaving] = useState(false);

  const save = async (a: MediationAction | null, d: boolean | null) => {
    if (readOnly || a === null || d === null || saving) return;
    setSaving(true);
    const ok = await record({ event, studentNumber, action: a, dataLed: d, existing: existing ?? null });
    setSaving(false);
    if (ok) onSaved?.();
  };

  // A segmented control for the action (one of four) and two pills for yes / no (owner, 11.10.2026).
  const segment = (pressed: boolean) =>
    `min-h-9 px-2.5 py-1.5 rounded-lg text-xs font-bold transition duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
      pressed
        ? 'bg-violet-700 text-white shadow-sm'
        : 'text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-700'
    }`;
  const pill = (pressed: boolean) =>
    `min-h-9 px-3.5 py-1.5 rounded-full border text-xs font-bold transition duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
      pressed
        ? 'bg-violet-700 border-violet-700 text-white'
        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`;
  const title = readOnly ? READ_ONLY_TITLE : undefined;

  return (
    <div className="flex flex-col gap-1.5" data-testid={`${testIdPrefix}-controls`}>
      {!selfApproach && (
        <div role="group" aria-label={MEDIATION_HE.whatDidIDo} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 me-1">{MEDIATION_HE.whatDidIDo}</span>
          <span className="inline-flex flex-wrap gap-0.5 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {MEDIATION_ACTIONS.map((a) => (
            <button
              key={a}
              type="button"
              data-testid={`${testIdPrefix}-action-${a}`}
              aria-pressed={action === a}
              disabled={readOnly || saving}
              title={title}
              onClick={() => { setAction(a); void save(a, dataLed); }}
              className={segment(action === a)}
            >
              {MEDIATION_ACTION_HE[a]}
            </button>
          ))}
          </span>
        </div>
      )}
      <div role="group" aria-label={MEDIATION_HE.dataLed} className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 me-1">{MEDIATION_HE.dataLed}</span>
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            data-testid={`${testIdPrefix}-dataled-${v ? 'yes' : 'no'}`}
            aria-pressed={dataLed === v}
            disabled={readOnly || saving}
            title={title}
            onClick={() => { setDataLed(v); void save(action, v); }}
            className={pill(dataLed === v)}
          >
            {v ? MEDIATION_HE.yes : MEDIATION_HE.no}
          </button>
        ))}
      </div>
    </div>
  );
}
