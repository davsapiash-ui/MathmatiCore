import React, { useRef, useEffect } from 'react';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import type { Place } from '@/core/placeValue';
import { NEUTRAL_BOX_BORDER, PLACE_COLORS } from '../placeColors';
import { useEnhancedSupport } from './useEnhancedSupport';

type BoxPlace = 'hundreds' | 'tens' | 'units';

const PLACE_LABEL_HE: Record<BoxPlace, string> = { hundreds: 'מאות', tens: 'עשרות', units: 'יחידות' };

/** Shape and type of every answer box of meeting 2; the colour comes from the style. */
const NEUTRAL_BOX_CLASS =
  'text-center font-display font-black text-3xl md:text-4xl text-ws-ink bg-white dark:bg-slate-800 border-2 focus:ring-4 focus:ring-slate-200 dark:focus:ring-slate-700 rounded-2xl outline-none shadow-sm transition-all';

interface PlaceValueInputBoxesProps {
  mode: 'three_digits' | 'two_digits' | 'single_value';
  givenText?: string;
  highlightNumber?: string;
  highlightIndex?: number;
  labels?: { hundreds?: string; tens?: string; units?: string };
  /**
   * Place-value headings and colours over the boxes (owner, 27.9.2026): only for
   * a learner with the enhanced cognitive support profile. Everyone else sees
   * the boxes in one neutral colour, without headings. Read from the learner's
   * profile unless given.
   */
  placeCues?: boolean;
  /** Shown between the given text and the boxes (task 5: the picture of the blocks). */
  children?: React.ReactNode;
}

export function PlaceValueInputBoxes({
  mode,
  givenText,
  highlightNumber,
  highlightIndex,
  labels = { hundreds: 'מאות', tens: 'עשרות', units: 'יחידות' },
  placeCues: placeCuesProp,
  children,
}: PlaceValueInputBoxesProps) {
  const enhancedSupport = useEnhancedSupport();
  const placeCues = placeCuesProp ?? enhancedSupport;
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const setAnswerDigit = useWorkspaceStore((s) => s.setAnswerDigit);
  const probeAnswer = useWorkspaceStore((s) => s.probeAnswer);
  const setProbeAnswer = useWorkspaceStore((s) => s.setProbeAnswer);

  const hundredsRef = useRef<HTMLInputElement>(null);
  const tensRef = useRef<HTMLInputElement>(null);
  const unitsRef = useRef<HTMLInputElement>(null);
  const singleRef = useRef<HTMLInputElement>(null);
  const refs: Record<BoxPlace, React.RefObject<HTMLInputElement | null>> = { hundreds: hundredsRef, tens: tensRef, units: unitsRef };
  /** Left to right on the screen: the highest place first. */
  const places: BoxPlace[] = mode === 'three_digits' ? ['hundreds', 'tens', 'units'] : ['tens', 'units'];

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
        /* dir="ltr": each digit is its own flex item, and inside the page's
           dir="rtl" the row ran right to left — 742 was shown as 247. */
        <div
          dir="ltr"
          role="img"
          aria-label={
            highlightIndex !== undefined && highlightNumber[highlightIndex] !== undefined
              ? `${highlightNumber}, הספרה המסומנת: ${highlightNumber[highlightIndex]}`
              : highlightNumber
          }
          data-testid="pv-highlight-number"
          className="bg-white dark:bg-slate-800 border-2 border-indigo-200 dark:border-indigo-800 rounded-3xl px-10 py-6 text-center shadow-md flex items-center justify-center gap-2"
        >
          {highlightNumber.split('').map((char, idx) => {
            const isHighlighted = idx === highlightIndex;
            return (
              <span
                key={idx}
                aria-hidden="true"
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

      {children}

      {mode === 'single_value' ? (
        <div className="flex flex-col items-center gap-2">
          {/* התווית לא הייתה מקושרת לתיבה, ולכן הקראה הכריזה על שדה
              בלי שם. */}
          <label htmlFor="pv-single-value" className="text-base font-bold text-ws-ink/70">ערך הספרה:</label>
          <input
            id="pv-single-value"
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
            dir="ltr"
            className={`w-32 h-16 ${NEUTRAL_BOX_CLASS}`}
            style={{ borderColor: NEUTRAL_BOX_BORDER }}
          />
        </div>
      ) : (
        /* Writing order for every learner (owner, 27.9.2026): hundreds on the
           LEFT, units on the RIGHT, like the vertical exercises and the board.
           The row is dir="ltr" so the DOM order is the visual order, and the
           focus and the auto-advance run hundreds → tens → units. */
        <div
          dir="ltr"
          role="group"
          aria-label="שורת התוצאה"
          data-testid="pv-result-row"
          className="flex items-end justify-center gap-4 md:gap-6"
        >
          {places.map((place, i) => {
            const colors = PLACE_COLORS[place];
            const labelId = `pv-label-${place}`;
            const next = places[i + 1];
            return (
              <div key={place} className="flex flex-col items-center gap-1.5">
                {placeCues && (
                  <span id={labelId} className="text-sm font-bold" style={{ color: colors.header }}>
                    {labels[place] || PLACE_LABEL_HE[place]}
                  </span>
                )}
                <input
                  ref={refs[place]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={answerDigits[place] ?? ''}
                  data-place={place}
                  {...(placeCues
                    ? { 'aria-labelledby': labelId }
                    : { 'aria-label': `ספרה ${i + 1} מתוך ${places.length} בשורת התוצאה` })}
                  onChange={(e) => handleDigitChange(place, e.target.value, next ? refs[next] : undefined)}
                  className={`w-16 h-16 md:w-20 md:h-20 ${NEUTRAL_BOX_CLASS}`}
                  style={
                    placeCues
                      ? { borderColor: colors.border, backgroundColor: colors.tint, color: colors.header }
                      : { borderColor: NEUTRAL_BOX_BORDER }
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
