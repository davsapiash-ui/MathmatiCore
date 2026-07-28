/**
 * STTService.ts
 * Speech-to-Text service using browser native Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * Configured for Hebrew (he-IL) and pedagocial inputs.
 */

export interface STTServiceOptions {
  lang?: string;
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export class STTService {
  private static instance: STTService;
  private recognition: any = null;
  private isListening = false;

  private constructor() {
    this.initRecognition();
  }

  public static getInstance(): STTService {
    if (!STTService.instance) {
      STTService.instance = new STTService();
    }
    return STTService.instance;
  }

  private initRecognition() {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
    }
  }

  public isSupported(): boolean {
    return this.recognition !== null;
  }

  public start({ lang = "he-IL", onResult, onError, onEnd }: STTServiceOptions) {
    if (!this.recognition) {
      if (onError) onError("זיהוי קולי אינו נתמך בדפדפן זה.");
      return;
    }

    if (this.isListening) {
      this.stop();
    }

    this.recognition.lang = lang;

    this.recognition.onresult = (event: any) => {
      let currentTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      if (currentTranscript) {
        onResult(currentTranscript);
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      if (onError) onError(event.error || "שגיאה בזיהוי דיבור");
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (onEnd) onEnd();
    };

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (err: any) {
      this.isListening = false;
      if (onError) onError(err?.message || "נכשל בחיבור למיקרופון");
    }
  }

  public stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (err) {
        console.warn("STT stop note:", err);
      }
      this.isListening = false;
    }
  }
}

export const stt = STTService.getInstance();
