import { useState, useEffect } from "react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { X, PlayCircle, CheckSquare, Square } from "lucide-react";

interface VideoIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "hide_sandbox_intro_video";

export function VideoIntroModal({ isOpen, onClose }: VideoIntroModalProps) {
  const [hideNextTime, setHideNextTime] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const handleClose = () => {
    if (hideNextTime) {
      localStorage.setItem(STORAGE_KEY, "true");
    }
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      dir="rtl"
    >
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div
        className={`relative w-full max-w-3xl bg-ws-bg rounded-3xl shadow-2xl overflow-hidden border border-ws-surface2 transition-transform duration-300 ${
          isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-8"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-ws-surface2 bg-white/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600">
              <PlayCircle className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black text-ws-ink">
              ברוכים הבאים למערכת! (סרטון הנחיה)
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-slate-200 text-ws-soft transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Video Embed */}
        <div className="p-6 bg-slate-50">
          <div className="aspect-video w-full bg-slate-800 rounded-2xl flex items-center justify-center relative overflow-hidden shadow-inner group">
            <iframe 
              width="100%" 
              height="100%" 
              src="https://www.youtube.com/embed/a4FXd4nlqQA?rel=0" 
              title="סרטון הכרות לארגז החול - MathmatiCore" 
              frameBorder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen
            ></iframe>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-white flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-ws-surface2">
          <button
            onClick={() => setHideNextTime(!hideNextTime)}
            className="flex items-center gap-2 text-ws-soft hover:text-ws-ink font-medium transition-colors group"
          >
            {hideNextTime ? (
              <CheckSquare className="w-5 h-5 text-cyan-500" />
            ) : (
              <Square className="w-5 h-5 group-hover:text-cyan-400 transition-colors" />
            )}
            <span>אל תציג סרטון זה שוב</span>
          </button>
          
          <UdlButton
            onClick={handleClose}
            semanticColor="primary"
            className="w-full sm:w-auto px-8 font-bold text-lg shadow-lg shadow-cyan-500/20"
          >
            המשך לפעילות
          </UdlButton>
        </div>
      </div>
    </div>
  );
}
