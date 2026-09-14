import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { UdlButton } from './UdlButton';
import { tts } from '@/infrastructure/services/TTSService';

interface UdlSpeechButtonProps {
  text: string;
  lang?: string;
  className?: string;
}

export function UdlSpeechButton({ text, lang = 'he-IL', className = '' }: UdlSpeechButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  /** Which read this button owns, so unmounting it cannot silence a different button. */
  const handleRef = useRef(0);

  const handleSpeak = () => {
    if (isPlaying) {
      tts.stop();
      handleRef.current = 0;
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    handleRef.current = tts.speak(
      text,
      lang,
      () => setIsPlaying(false),
      () => setIsPlaying(false)
    );
  };

  useEffect(() => {
    return () => {
      // Only our own read: tts is a singleton shared by every speech button, so an
      // unconditional stop() here cuts off whichever button is actually speaking —
      // under StrictMode that happens on every mount.
      tts.stopIfCurrent(handleRef.current);
    };
  }, []);

  return (
    <UdlButton 
      variant="outline" 
      size="icon"
      semanticColor={isPlaying ? "primary" : "neutral"}
      onClick={handleSpeak}
      className={`rounded-full shadow-sm hover:shadow-md transition-all ${isPlaying ? 'animate-pulse' : ''} ${className}`}
      aria-label="הקרא טקסט בקול"
      title="הקרא טקסט בקול"
    >
      {isPlaying ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
    </UdlButton>
  );
}
