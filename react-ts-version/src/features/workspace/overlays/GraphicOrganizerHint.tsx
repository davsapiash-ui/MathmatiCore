import React, { useState } from 'react';
import type { SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { Bot, X, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';

interface GraphicOrganizerHintProps {
  hint: SocraticHintResponse;
  onClose: () => void;
  onSelectOption?: (choiceId: string) => void;
}

export const GraphicOrganizerHint: React.FC<GraphicOrganizerHintProps> = ({ hint, onClose, onSelectOption }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (onSelectOption) {
      onSelectOption(id);
    }
    // Auto close after a short delay so they can see their selection
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-blue-900/40 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border-4 border-indigo-200 animate-in fade-in zoom-in duration-300">
        
        {/* Header */}
        <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-indigo-700">
            <div className="bg-white p-2 rounded-full shadow-sm">
              <Bot className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">חונך חכם</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-white rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="mb-8 text-center">
            <h3 className="text-2xl font-bold text-gray-800 leading-relaxed">
              {hint.questionHe}
            </h3>
          </div>

          {/* Graphic Organizer Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hint.choices.map((choice) => {
              const isSelected = selectedId === choice.id;
              return (
                <button
                  key={choice.id}
                  onClick={() => handleSelect(choice.id)}
                  disabled={selectedId !== null}
                  className={clsx(
                    "relative p-6 rounded-2xl border-2 text-right transition-all duration-300 flex items-center gap-4 group",
                    isSelected 
                      ? "bg-green-50 border-green-500 shadow-md transform scale-[1.02]"
                      : selectedId !== null 
                        ? "bg-gray-50 border-gray-200 opacity-50"
                        : "bg-white border-indigo-100 hover:border-indigo-400 hover:shadow-lg hover:-translate-y-1"
                  )}
                >
                  <div className={clsx(
                    "flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors",
                    isSelected 
                      ? "border-green-500 bg-green-500 text-white" 
                      : "border-indigo-200 group-hover:border-indigo-400 text-transparent"
                  )}>
                    {isSelected && <CheckCircle2 className="w-5 h-5" />}
                  </div>
                  <span className={clsx(
                    "text-lg font-medium leading-tight",
                    isSelected ? "text-green-800" : "text-gray-700 group-hover:text-indigo-900"
                  )}>
                    {choice.textHe}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};
