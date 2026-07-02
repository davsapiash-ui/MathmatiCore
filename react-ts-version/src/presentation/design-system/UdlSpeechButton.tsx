import { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { UdlButton } from './UdlButton';

interface UdlSpeechButtonProps {
  text: string;
  lang?: string;
  className?: string;
}

export function UdlSpeechButton({ text, lang = 'he-IL', className = '' }: UdlSpeechButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setIsSupported(false);
    }
  }, []);

  const handleSpeak = () => {
    if (!isSupported) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9; // Slightly slower for better comprehension (UDL)
    
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  };

  // Clean up if component unmounts
  useEffect(() => {
    return () => {
      if (isPlaying) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying]);

  if (!isSupported) return null;

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
