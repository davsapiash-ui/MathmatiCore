import { useEffect, useState } from 'react';
import { MousePointer2, X, Sparkles, ChevronLeft } from 'lucide-react';
import { UdlButton } from '@/presentation/design-system/UdlButton';

interface InteractiveTutorialPointerProps {
  isActive: boolean;
  onSkip: () => void;
}

const TUTORIAL_STEPS = [
  { text: "ברוכים הבאים למעבדת החשיבה! אני סמן ההדרכה.", x: 75, y: 30 },
  { text: "זהו טור היחידות בלוח המחקר שלנו.", x: 42, y: 45 },
  { text: "וכאן ממוקם טור העשרות.", x: 28, y: 45 },
  { text: "כדי להתחיל בניסוי, גררו פריטים מארגז הכלים שלמטה אל הלוח.", x: 40, y: 85 },
  { text: "קיבוץ: אם תאספו 10 יחידות, תוכלו לגרור אותן יחד לטור העשרות כדי לארוז אותן.", x: 28, y: 55 },
  { text: "פריטה: לחצו לחיצה כפולה על עשרת כדי לפרק אותה ל-10 יחידות.", x: 28, y: 55 },
  { text: "כדי למחוק, גררו פריט אל פח המחזור שבצד.", x: 5, y: 85 },
  { text: "זהו! קדימה, גררו פריטים ללוח והתנסו בעצמכם.", x: 40, y: 85 },
];

export function InteractiveTutorialPointer({ isActive, onSkip }: InteractiveTutorialPointerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      setStepIndex(0);
    } else {
      setIsVisible(false);
    }
  }, [isActive]);

  if (!isActive || !isVisible) return null;

  const currentStep = TUTORIAL_STEPS[stepIndex];
  const isLastStep = stepIndex >= TUTORIAL_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      setIsVisible(false);
      onSkip();
    } else {
      setStepIndex(prev => prev + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* Dimmed background overlay that doesn't block skip button */}
      <div className="absolute inset-0 bg-indigo-900/10 backdrop-blur-[1px] transition-opacity duration-1000" />
      
      {/* Skip Button - pointer-events-auto allows clicking */}
      <div className="absolute top-6 left-6 pointer-events-auto animate-in fade-in slide-in-from-top-4">
        <UdlButton 
          variant="secondary" 
          onClick={onSkip}
          className="bg-white/90 hover:bg-white shadow-xl border-2 border-indigo-100 text-indigo-700 rounded-full pl-3 pr-5"
        >
          <X className="w-4 h-4 ml-2" />
          דלג על ההדרכה
        </UdlButton>
      </div>

      {/* The Animated Pointer & Tooltip */}
      <div 
        className="absolute flex flex-col items-center transition-all duration-1000 ease-in-out drop-shadow-2xl"
        style={{
          top: `${currentStep.y}%`,
          left: `${currentStep.x}%`,
          transform: 'translate(-50%, -50%)'
        }}
      >
        <div className="relative animate-bounce pointer-events-none">
          <MousePointer2 className="w-12 h-12 text-indigo-600 fill-indigo-100 -rotate-12 drop-shadow-lg" />
          <Sparkles className="w-5 h-5 text-amber-400 absolute -top-2 -right-4 animate-pulse" />
        </div>
        
        {/* Tooltip Bubble */}
        <div className="mt-4 bg-white border-2 border-indigo-200 shadow-2xl rounded-2xl p-4 min-w-[280px] max-w-[320px] text-center relative pointer-events-auto animate-in zoom-in duration-300 flex flex-col gap-3">
          {/* Arrow pointing up to the cursor */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-t-2 border-l-2 border-indigo-200 rotate-45 pointer-events-none" />
          <p className="text-indigo-900 font-bold text-lg leading-tight">
            {currentStep.text}
          </p>
          
          <button 
            onClick={handleNext}
            className="mt-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold py-2 px-4 rounded-xl flex items-center justify-center transition-colors w-full"
          >
            {isLastStep ? 'התחל' : 'המשך'}
            {!isLastStep && <ChevronLeft className="w-4 h-4 mr-1" />}
          </button>
        </div>
      </div>
    </div>
  );
}

