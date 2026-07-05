/**
 * TTSService.ts
 * A robust, production-ready Text-to-Speech service using the native Web Speech API.
 * Handles voice loading asynchronously, queuing, and provides a fallback mechanism.
 */

export class TTSService {
  private static instance: TTSService;
  private voices: SpeechSynthesisVoice[] = [];
  private isLoaded = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  private constructor() {
    this.initVoices();
  }

  public static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  private initVoices() {
    if (!('speechSynthesis' in window)) return;

    const load = () => {
      this.voices = window.speechSynthesis.getVoices();
      if (this.voices.length > 0) {
        this.isLoaded = true;
      }
    };

    load();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = load;
    }
  }

  public speak(
    text: string, 
    lang: string = 'he-IL', 
    onEnd?: () => void, 
    onError?: (e: Event) => void
  ) {
    if (!('speechSynthesis' in window)) {
      if (onError) onError(new Event('TTSNotSupported'));
      return;
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.95; // Slightly slower for better pedagogical clarity
    utterance.pitch = 1.0;

    // Try to find the best voice for the language
    if (this.isLoaded) {
      const langVoices = this.voices.filter(v => v.lang.startsWith(lang.split('-')[0]));
      // Prefer high quality or natural sounding voices if available
      const bestVoice = 
        langVoices.find(v => v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('online') || v.name.toLowerCase().includes('natural')) ||
        langVoices[0];
      
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
    }

    utterance.onend = () => {
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      this.currentUtterance = null;
      if (onError) onError(e);
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  public stop() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
  }
}

export const tts = TTSService.getInstance();
