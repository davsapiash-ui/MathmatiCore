import { database } from '@/infrastructure/firebase';
import { ref, set, update } from 'firebase/database';
import { offlineSyncEngine } from '@/infrastructure/OfflineSyncEngine';

export interface CanvasRecorderOptions {
  studentId: string;
  sessionId?: string;
  exerciseId: string;
  fps?: number; // default 15
  timesliceMs?: number; // default 2,000 ms (2s chunks per PRD v7.0 Module 21)
  onChunkReady?: (chunk: Blob) => void;
  onError?: (err: Error) => void;
}

export class CanvasRecorderService {
  public static readonly MAX_RECORDING_BYTES = 50 * 1024 * 1024; // 50MB hard cap per student per session (PRD v7.0 Module 21)
  
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private isRecording = false;
  private isTruncated = false;
  private totalBytesRecorded = 0;
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
      this.totalBytesRecorded = 0;
      this.isTruncated = false;
      const fps = options.fps || 15;
      const timeslice = options.timesliceMs || 2000; // PRD v7.0 Module 21: 2000ms chunk interval

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

      this.mediaRecorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          const chunkSize = event.data.size;
          this.totalBytesRecorded += chunkSize;
          this.recordedChunks.push(event.data);

          // PRD v7.0 Module 21: Enforce a hard 50MB cap per student per session
          if (this.totalBytesRecorded >= CanvasRecorderService.MAX_RECORDING_BYTES) {
            // Stop recording silently, set recording_truncated: true, never alter student UI
            await this.stopRecordingSilently(options.studentId, options.sessionId || `session_${options.exerciseId}`);
            return;
          }

          // Write chunk to dedicated RTDB path with exercise_id stamped alongside timestamps
          await this.writeChunkToRTDB(event.data, options);
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

      // Start with 2000ms chunk timeslice
      this.mediaRecorder.start(timeslice);
      this.isRecording = true;
      return true;
    } catch (err: any) {
      this.options?.onError?.(err);
      return false;
    }
  }

  /**
   * Writes a chunk to RTDB path users/students/{studentId}/telemetry_sessions/{sessionId}/chunks/{chunkId}
   * stamping each chunk's metadata with exercise_id alongside timestamps.
   */
  public async writeChunkToRTDB(chunk: Blob, options: CanvasRecorderOptions): Promise<void> {
    const studentId = options.studentId;
    const sessionId = options.sessionId || 'current_session';
    const timestamp = Date.now();
    const chunkId = `chunk_${timestamp}_${Math.random().toString(36).substring(2, 6)}`;
    const chunkPath = `users/students/${studentId}/telemetry_sessions/${sessionId}/chunks/${chunkId}`;

    const chunkPayload = {
      chunk_id: chunkId,
      exercise_id: options.exerciseId, // Stamped on metadata per PRD v7.0 Module 21
      timestamp,
      byte_size: chunk.size,
    };

    try {
      await set(ref(database, chunkPath), chunkPayload);
    } catch (err) {
      // Route failed chunk writes into IndexedDB queue for retry per Module 17
      await offlineSyncEngine.enqueueTelemetry({
        idempotency_key: `chunk_${chunkId}`,
        event_type: 'INTERVENTION_REQUEST' as any,
        session_id: sessionId,
        student_id: Number(studentId.replace(/\D/g, '')) || 1,
        exercise_id: options.exerciseId,
        client_timestamp: timestamp,
        details: chunkPayload as any,
      }).catch(console.error);
    }
  }

  /**
   * Stops recording silently on reaching 50MB cap and marks recording_truncated: true.
   * Student-side experience is never altered (no alerts, no UI interruption).
   */
  public async stopRecordingSilently(studentId: string, sessionId: string): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Silent stop
      }
    }
    this.isRecording = false;
    this.isTruncated = true;

    // Write recording_truncated: true to RTDB session metadata
    const metadataRef = ref(database, `users/students/${studentId}/telemetry_sessions/${sessionId}/metadata`);
    await update(metadataRef, {
      recording_truncated: true,
      truncated_at: Date.now(),
      total_bytes_at_truncation: this.totalBytesRecorded,
    }).catch(console.error);
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
   * Returns total bytes recorded in the current session.
   */
  public getTotalBytesRecorded(): number {
    return this.totalBytesRecorded;
  }

  /**
   * Returns whether recording was truncated due to the 50MB cap.
   */
  public getIsTruncated(): boolean {
    return this.isTruncated;
  }

  /**
   * Gets the canonical storage path for the exercise recording.
   */
  public static getStoragePath(studentId: string, exerciseId: string): string {
    return `recordings/${studentId}/${exerciseId}.webm`;
  }
}

export const canvasRecorder = new CanvasRecorderService();
