/**
 * TTSService.ts
 * A robust, production-ready Text-to-Speech service using the native Web Speech API.
 * Handles voice loading asynchronously, queuing, and provides a fallback mechanism.
 */

export class TTSService {
  private static instance: TTSService;
  private voices: SpeechSynthesisVoice[] = [];
  private isLoaded = false;

  private audioUnlocked = false;

  private constructor() {
    this.initVoices();
  }

  public static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  /**
   * PRD V2.0 Section 7 Audio Initialization Entry Gate:
   * Captures initial user click gesture to unlock browser Web Audio API & SpeechSynthesis permissions.
   */
  public initializeAudioGate(): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    try {
      const silentUtterance = new SpeechSynthesisUtterance(' ');
      silentUtterance.volume = 0;
      window.speechSynthesis.speak(silentUtterance);
      this.audioUnlocked = true;
      return true;
    } catch (e) {
      console.warn("Audio gate initialization failed:", e);
      return false;
    }
  }

  public isAudioUnlocked(): boolean {
    return this.audioUnlocked;
  }

  private initVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

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

  private cleanTextForSpeech(text: string): string {
    if (!text) return '';
    // Strip markdown formatting (*, _, #, `, ~)
    let cleaned = text.replace(/[*_#`~]/g, '');
    // Strip emojis
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '');
    // Normalize numbered lists like "1. " and "2. " into natural speech pauses
    cleaned = cleaned.replace(/(?:^|\n)\s*1\.\s*/g, ' שלב ראשון: ');
    cleaned = cleaned.replace(/(?:^|\n)\s*2\.\s*/g, ' שלב שני: ');
    cleaned = cleaned.replace(/(?:^|\n)\s*3\.\s*/g, ' שלב שלישי: ');
    cleaned = cleaned.replace(/(?:^|\n)\s*4\.\s*/g, ' שלב רביעי: ');
    cleaned = cleaned.replace(/(?:^|\n)\s*5\.\s*/g, ' שלב חמישי: ');
    // Replace remaining newlines with natural pauses
    cleaned = cleaned.replace(/\n+/g, '. ');
    // Clean extra spaces
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  public speak(
    text: string, 
    lang: string = 'he-IL', 
    onEnd?: () => void, 
    onError?: (e: Event) => void
  ) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onError) onError(new Event('TTSNotSupported'));
      return;
    }

    this.stop();

    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 0.92; // Slightly slower for better pedagogical clarity
    utterance.pitch = 1.0;

    // Refresh voices dynamically if needed
    if (!this.voices || this.voices.length === 0) {
      try {
        this.voices = window.speechSynthesis.getVoices();
        if (this.voices.length > 0) this.isLoaded = true;
      } catch {}
    }

    // Try to find the best voice for the language
    if (this.voices && this.voices.length > 0) {
      const langPrefix = lang.split('-')[0].toLowerCase();
      const langVoices = this.voices.filter(v => {
        const vl = v.lang.toLowerCase();
        const vn = v.name.toLowerCase();
        return vl.startsWith(langPrefix) || 
               vl.startsWith('iw') || 
               vl.includes('he_il') || 
               vl.includes('heb') ||
               vn.includes('hebrew') ||
               vn.includes('עברית') ||
               vn.includes('asaf') ||
               vn.includes('hila') ||
               vn.includes('carmit');
      });

      // Prefer high quality, natural, or dedicated Hebrew voices
      const bestVoice = 
        langVoices.find(v => {
          const vn = v.name.toLowerCase();
          return vn.includes('google') || vn.includes('online') || vn.includes('natural') || vn.includes('asaf') || vn.includes('hila');
        }) ||
        langVoices[0];
      
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
    }

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      if (onError) onError(e);
    };

    window.speechSynthesis.speak(utterance);
  }

  public stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export const tts = TTSService.getInstance();
