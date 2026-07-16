import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Lightbulb, Grid3X3, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SupportPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOption: (optionId: string) => void;
}

export function SupportPaletteModal({ isOpen, onClose, onSelectOption }: SupportPaletteModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Dark overlay to focus attention */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
            className="ws-card relative z-10 w-full max-w-md p-6 flex flex-col gap-6 mx-4"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col items-center text-center gap-3 mt-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-ws-blue mb-2 shadow-inner">
                <Bot size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                זיהיתי עצירה קטנה
              </h2>
              <p className="text-slate-600 dark:text-slate-300">
                לפעמים כדאי להסתכל על התרגיל מזווית אחרת. איך תרצה שאעזור לך עכשיו?
              </p>
            </div>

            <div className="grid gap-3">
              <Button 
                variant="outline" 
                className="ws-chip flex items-center justify-start gap-4 h-14 px-4 w-full"
                onClick={() => onSelectOption('hint')}
              >
                <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full text-amber-600">
                  <Lightbulb size={20} />
                </div>
                <span className="text-lg font-medium">תן לי רמז קטן</span>
              </Button>

              <Button 
                variant="outline" 
                className="ws-chip flex items-center justify-start gap-4 h-14 px-4 w-full"
                onClick={() => onSelectOption('organizer')}
              >
                <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full text-emerald-600">
                  <Grid3X3 size={20} />
                </div>
                <span className="text-lg font-medium">הראה לי מארגן חזותי</span>
              </Button>
            </div>
            
            <p className="text-sm text-center text-slate-400 mt-2">
              אל דאגה, לוקחים את הזמן בקצב שלך.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
