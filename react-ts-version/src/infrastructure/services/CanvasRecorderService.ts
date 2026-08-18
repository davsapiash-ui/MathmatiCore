/**
 * Module 21 / WP6: Student Canvas Recorder Service (מקליט קנבס וקטורי שקט)
 * 
 * Captures pure canvas interactions via MediaRecorder + canvas.captureStream()
 * Zero-AV PII: Strictly NO audio tracks, NO camera streams.
 * Chunked recording (10-second timeslices), visibilitychange pause/resume handling,
 * and background upload to Firebase Storage at recordings/{student_id}/{exercise_id}.webm.
 */

export interface CanvasRecorderOptions {
  studentId: string;
  exerciseId: string;
  fps?: number; // default 15
  timesliceMs?: number; // default 10,000 ms (10s chunks)
  onChunkReady?: (chunk: Blob) => void;
  onError?: (err: Error) => void;
}

export class CanvasRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private isRecording = false;
  private visibilityHandler: (() => void) | null = null;
  private options: CanvasRecorderOptions | null = null;

  /**
   * Checks whether the current browser environment supports Canvas captureStream and MediaRecorder.
   */
  public static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      'captureStream' in HTMLCanvasElement.prototype &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  /**
   * Starts recording the provided canvas element.
   */
  public startRecording(canvas: HTMLCanvasElement, options: CanvasRecorderOptions): boolean {
    if (!CanvasRecorderService.isSupported()) {
      options.onError?.(new Error('Canvas recording is not supported on this platform. Falling back to vector telemetry.'));
      return false;
    }

    try {
      this.options = options;
      this.recordedChunks = [];
      const fps = options.fps || 15;
      const timeslice = options.timesliceMs || 10000;

      // Pure canvas video stream (Zero Audio/Camera PII)
      this.stream = canvas.captureStream(fps);

      // WebM preferred container
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 250000, // Lightweight 250kbps for low bandwidth
      });

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
          this.options?.onChunkReady?.(event.data);
        }
      };

      this.mediaRecorder.onerror = (event: any) => {
        this.options?.onError?.(new Error(event?.error?.message || 'MediaRecorder runtime error'));
      };

      // Visibility change handler (Chaos Scenario 7: Tablet Sleep / Background Scaffolding)
      this.visibilityHandler = () => {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
        if (document.hidden) {
          if (this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
          }
        } else {
          if (this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
          }
        }
      };

      document.addEventListener('visibilitychange', this.visibilityHandler);

      // Start with 10s chunk timeslice
      this.mediaRecorder.start(timeslice);
      this.isRecording = true;
      return true;
    } catch (err: any) {
      this.options?.onError?.(err);
      return false;
    }
  }

  /**
   * Pauses the active recording.
   */
  public pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  /**
   * Resumes the paused recording.
   */
  public resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  /**
   * Stops recording and resolves with the final assembled WebM Blob.
   */
  public stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (this.visibilityHandler) {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
        this.visibilityHandler = null;
      }

      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.isRecording = false;
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        const mimeType = this.mediaRecorder?.mimeType || 'video/webm';
        const finalBlob = new Blob(this.recordedChunks, { type: mimeType });
        this.recordedChunks = [];
        resolve(finalBlob);
      };

      this.mediaRecorder.stop();
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
    });
  }

  /**
   * Returns whether a recording session is currently active.
   */
  public getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Gets the canonical storage path for the exercise recording.
   */
  public static getStoragePath(studentId: string, exerciseId: string): string {
    return `recordings/${studentId}/${exerciseId}.webm`;
  }
}

export const canvasRecorder = new CanvasRecorderService();
