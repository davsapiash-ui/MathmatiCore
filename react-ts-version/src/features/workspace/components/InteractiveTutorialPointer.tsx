import { useEffect, useState } from 'react';
import { MousePointer2, X, Sparkles } from 'lucide-react';
import { UdlButton } from '@/presentation/design-system/UdlButton';

interface InteractiveTutorialPointerProps {
  isActive: boolean;
  onSkip: () => void;
}

const TUTORIAL_STEPS = [
  { text: "ברוכים הבאים למעבדה! אני המדריך האוטומטי.", x: 50, y: 30 },
  { text: "כאן בצד שמאל נמצא טור העשרות.", x: 30, y: 50 },
  { text: "וכאן בצד ימין נמצא טור היחידות.", x: 70, y: 50 },
  { text: "כדי ליצור מספרים, גררו בלוקים ממחסן הכלים אל הלוח.", x: 50, y: 85 },
  { text: "קיבוץ: כשיש 10 יחידות ומעלה, לחצו על לחצן הקיבוץ בראש הטור כדי לארוז אותן יחד.", x: 50, y: 40 },
  { text: "פריטה: לחצו לחיצה כפולה על אריזה בלוח כדי לפרק אותה חזרה ל-10 יחידות.", x: 50, y: 60 },
  { text: "כדי למחוק בלוק, גררו אותו אל פח המחזור או מחוץ ללוח.", x: 20, y: 80 },
  { text: "זהו! כעת תורכם להתנסות בארגז החול.", x: 50, y: 50 },
];

export function InteractiveTutorialPointer({ isActive, onSkip }: InteractiveTutorialPointerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      setStepIndex(0);
      
      const interval = setInterval(() => {
        setStepIndex(prev => {
          if (prev >= TUTORIAL_STEPS.length - 1) {
            clearInterval(interval);
            setTimeout(() => {
              setIsVisible(false);
              onSkip(); // Auto-skip when done
            }, 3000);
            return prev;
          }
          return prev + 1;
        });
      }, 4000); // 4 seconds per step
      
      return () => clearInterval(interval);
    } else {
      setIsVisible(false);
    }
  }, [isActive, onSkip]);

  if (!isActive || !isVisible) return null;

  const currentStep = TUTORIAL_STEPS[stepIndex];

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
        <div className="relative animate-bounce">
          <MousePointer2 className="w-12 h-12 text-indigo-600 fill-indigo-100 -rotate-12 drop-shadow-lg" />
          <Sparkles className="w-5 h-5 text-amber-400 absolute -top-2 -right-4 animate-pulse" />
        </div>
        
        {/* Tooltip Bubble */}
        <div className="mt-4 bg-white border-2 border-indigo-200 shadow-2xl rounded-2xl p-4 max-w-[280px] text-center relative pointer-events-auto animate-in zoom-in duration-300">
          {/* Arrow pointing up to the cursor */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-t-2 border-l-2 border-indigo-200 rotate-45" />
          <p className="text-indigo-900 font-bold text-lg leading-tight">
            {currentStep.text}
          </p>
        </div>
      </div>
    </div>
  );
}
