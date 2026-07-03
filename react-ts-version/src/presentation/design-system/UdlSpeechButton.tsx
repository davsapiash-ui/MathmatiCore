import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { UdlButton } from './UdlButton';

interface UdlSpeechButtonProps {
  text: string;
  lang?: string;
  className?: string;
}

export function UdlSpeechButton({ text, lang = 'he-IL', className = '' }: UdlSpeechButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSpeak = () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);

    const shortLang = lang.split('-')[0];
    
    const playFallback = () => {
      if (!('speechSynthesis' in window)) {
        setIsPlaying(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.9;
      
      const voices = window.speechSynthesis.getVoices();
      const hebrewVoices = voices.filter(v => v.lang.startsWith('he') || v.lang.startsWith('iw'));
      const premiumVoice = hebrewVoices.find(v => v.name.includes('Google') || v.name.includes('Online')) ||
                           hebrewVoices.find(v => v.name.includes('Carmit') || v.name.includes('Hila') || v.name.includes('Asaf')) ||
                           hebrewVoices[0];
      if (premiumVoice) {
        utterance.voice = premiumVoice;
      }
      
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      window.speechSynthesis.speak(utterance);
    };

    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${shortLang}&client=tw-ob&q=${encodeURIComponent(text)}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };
      audio.onerror = () => playFallback();
      
      audio.play().catch(() => playFallback());
    } catch (e) {
      playFallback();
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
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
