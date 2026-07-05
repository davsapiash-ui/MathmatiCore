import { useState, useEffect } from 'react';
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

  const handleSpeak = () => {
    if (isPlaying) {
      tts.stop();
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    tts.speak(
      text,
      lang,
      () => setIsPlaying(false),
      () => setIsPlaying(false)
    );
  };

  useEffect(() => {
    return () => {
      tts.stop();
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
