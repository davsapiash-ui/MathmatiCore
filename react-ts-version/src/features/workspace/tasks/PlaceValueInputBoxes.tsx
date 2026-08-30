import React, { useRef, useEffect } from 'react';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import type { Place } from '@/core/placeValue';

interface PlaceValueInputBoxesProps {
  mode: 'three_digits' | 'two_digits' | 'single_value';
  givenText?: string;
  highlightNumber?: string;
  highlightIndex?: number;
  labels?: { hundreds?: string; tens?: string; units?: string };
}

export function PlaceValueInputBoxes({
  mode,
  givenText,
  highlightNumber,
  highlightIndex,
  labels = { hundreds: 'מאות', tens: 'עשרות', units: 'יחידות' },
}: PlaceValueInputBoxesProps) {
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const setAnswerDigit = useWorkspaceStore((s) => s.setAnswerDigit);
  const probeAnswer = useWorkspaceStore((s) => s.probeAnswer);
  const setProbeAnswer = useWorkspaceStore((s) => s.setProbeAnswer);

  const hundredsRef = useRef<HTMLInputElement>(null);
  const tensRef = useRef<HTMLInputElement>(null);
  const unitsRef = useRef<HTMLInputElement>(null);
  const singleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'single_value') {
      singleRef.current?.focus();
    } else if (mode === 'three_digits') {
      hundredsRef.current?.focus();
    } else if (mode === 'two_digits') {
      tensRef.current?.focus();
    }
  }, [mode]);

  const handleDigitChange = (place: Place, val: string, nextRef?: React.RefObject<HTMLInputElement | null>) => {
    const clean = val.replace(/[^0-9]/g, '').slice(-1);
    setAnswerDigit(place, clean);
    if (clean && nextRef?.current) {
      nextRef.current.focus();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-6" dir="rtl">
      {givenText && (
        <div className="bg-ws-accentSoft/60 border border-ws-accent/30 rounded-3xl px-8 py-5 text-center shadow-sm">
          <span className="font-display font-black text-3xl md:text-4xl text-ws-ink">
            {givenText}
          </span>
        </div>
      )}

      {highlightNumber && (
        <div className="bg-white dark:bg-slate-800 border-2 border-indigo-200 dark:border-indigo-800 rounded-3xl px-10 py-6 text-center shadow-md flex items-center justify-center gap-2">
          {highlightNumber.split('').map((char, idx) => {
            const isHighlighted = idx === highlightIndex;
            return (
              <span
                key={idx}
                className={`font-display font-black text-5xl md:text-6xl tabular-nums transition-all ${
                  isHighlighted
                    ? 'text-indigo-600 dark:text-indigo-400 underline decoration-indigo-500 decoration-4 underline-offset-8 scale-110'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {char}
              </span>
            );
          })}
        </div>
      )}

      {mode === 'single_value' ? (
        <div className="flex flex-col items-center gap-2">
          <label className="text-base font-bold text-ws-ink/70">ערך הספרה:</label>
          <input
            ref={singleRef}
            type="text"
            inputMode="numeric"
            value={probeAnswer}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, '');
              setProbeAnswer(val);
              if (val.length <= 4) {
                const padded = val.padStart(2, '0');
                setAnswerDigit('tens', padded[padded.length - 2] ?? '');
                setAnswerDigit('units', padded[padded.length - 1] ?? '');
              }
            }}
            placeholder="?"
            className="w-32 h-16 text-center font-display font-black text-3xl text-indigo-600 bg-white border-2 border-indigo-400 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 rounded-2xl outline-none shadow-sm transition-all"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 md:gap-6">
          {mode === 'three_digits' && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                {labels.hundreds || 'מאות'}
              </span>
              <input
                ref={hundredsRef}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={answerDigits.hundreds ?? ''}
                onChange={(e) => handleDigitChange('hundreds', e.target.value, tensRef)}
                className="w-16 h-16 md:w-20 md:h-20 text-center font-display font-black text-3xl md:text-4xl text-amber-900 bg-amber-50/70 border-2 border-amber-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 rounded-2xl outline-none shadow-sm transition-all"
              />
            </div>
          )}

          <div className="flex flex-col items-center gap-1.5">
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
              {labels.tens || 'עשרות'}
            </span>
            <input
              ref={tensRef}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={answerDigits.tens ?? ''}
              onChange={(e) => handleDigitChange('tens', e.target.value, unitsRef)}
              className="w-16 h-16 md:w-20 md:h-20 text-center font-display font-black text-3xl md:text-4xl text-blue-900 bg-blue-50/70 border-2 border-blue-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 rounded-2xl outline-none shadow-sm transition-all"
            />
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {labels.units || 'יחידות'}
            </span>
            <input
              ref={unitsRef}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={answerDigits.units ?? ''}
              onChange={(e) => handleDigitChange('units', e.target.value)}
              className="w-16 h-16 md:w-20 md:h-20 text-center font-display font-black text-3xl md:text-4xl text-emerald-900 bg-emerald-50/70 border-2 border-emerald-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 rounded-2xl outline-none shadow-sm transition-all"
            />
          </div>
        </div>
      )}
    </div>
  );
}
