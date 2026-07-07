import { ref, push } from "firebase/database";
import { database } from "./firebase";

export interface TelemetryEvent {
  timestamp: number;
  type: string;
  payload: any;
  taskId?: string;
  studentId: string;
}

export interface RadarAlert {
  id: string;
  type: "HESITATION" | "PASSIVE_DRIFTING" | "HINT_REQUESTED" | "TASK_ERROR";
  studentId: string;
  timestamp: number;
  unread: boolean;
  [key: string]: any;
}

export class TelemetryTracker {
  private static instance: TelemetryTracker;
  private pendingEvents: TelemetryEvent[] = [];
  
  private hesitationTimer: any = null;
  private isRadarActive: boolean = false;
  private currentStudentId: string = "";
  private currentTaskId: string = "";
  private impersonating: boolean = false;
  
  private recentDeleteTimes: number[] = [];
  private readonly RAPID_DELETE_WINDOW_MS = 3000;
  private readonly RAPID_DELETE_THRESHOLD = 3;

  private constructor() {
    this.startFlusher();
  }

  public static getInstance(): TelemetryTracker {
    if (!TelemetryTracker.instance) {
      TelemetryTracker.instance = new TelemetryTracker();
    }
    return TelemetryTracker.instance;
  }

  public setImpersonating(val: boolean) {
    this.impersonating = val;
  }

  public startSession(studentId: string) {
    if (this.impersonating) return;
    this.currentStudentId = studentId;
    this.isRadarActive = true;
    this.pendingEvents = [];
    this.recentDeleteTimes = [];
    this.resetHesitationTimer();
  }

  public endSession() {
    this.isRadarActive = false;
    clearTimeout(this.hesitationTimer);
    this.flushEvents(); // Final flush
  }

  public setTask(taskId: string) {
    this.currentTaskId = taskId;
    this.resetHesitationTimer();
    this.recentDeleteTimes = [];
  }

  public logEvent(type: string, payload: any = {}) {
    if (!this.isRadarActive || !this.currentStudentId) return;
    
    this.pendingEvents.push({
      timestamp: Date.now(),
      type,
      payload,
      taskId: this.currentTaskId,
      studentId: this.currentStudentId
    });

    this.recordStudentAction(); // Reset radar timer
  }

  // --- Radar Logic ---

  public recordStudentAction() {
    if (!this.isRadarActive) return;
    this.resetHesitationTimer();
  }

  public recordDeleteAction() {
    const now = Date.now();
    this.recentDeleteTimes = this.recentDeleteTimes.filter(t => now - t < this.RAPID_DELETE_WINDOW_MS);
    this.recentDeleteTimes.push(now);

    if (this.recentDeleteTimes.length === this.RAPID_DELETE_THRESHOLD) {
      this.fireAlert("PASSIVE_DRIFTING", { deleteCount: this.recentDeleteTimes.length });
    }
  }

  public recordTaskError(errorDetail: string) {
    this.fireAlert("TASK_ERROR", { detail: errorDetail });
  }

  private resetHesitationTimer() {
    clearTimeout(this.hesitationTimer);
    if (!this.isRadarActive) return;
    // Disabled dual-engine hesitation timer. 
    // The useWorkspaceRadar hook now accurately handles hesitation alerts.
    // this.hesitationTimer = setTimeout(() => {
    //   this.fireAlert("HESITATION", { durationMs: Date.now() - this.lastActionTime });
    // }, this.HESITATION_THRESHOLD_MS);
  }

  private fireAlert(type: RadarAlert["type"], data: any = {}) {
    if (typeof document !== "undefined" && document.hidden && type === "HESITATION") {
      this.resetHesitationTimer();
      return;
    }

    const alert: RadarAlert = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      studentId: this.currentStudentId,
      timestamp: Date.now(),
      unread: true,
      taskId: this.currentTaskId,
      ...data
    };

    // Store in Firebase immediately for alerts
    try {
      push(ref(database, 'radar_alerts'), alert);
    } catch (e) {
      console.warn('Failed to send alert', e);
    }

    // Do not restart hesitation timer until the student acts
    if (type === "HESITATION") {
      this.hesitationTimer = null;
    }
  }

  // --- Background Sync ---

  private startFlusher() {
    // Flush every 10 seconds to prevent OOM
    setInterval(() => {
      this.flushEvents();
    }, 10000);
  }

  private async flushEvents() {
    if (this.pendingEvents.length === 0 || !this.currentStudentId) return;

    const chunk = [...this.pendingEvents];
    this.pendingEvents = []; // Clear local array to save memory immediately

    try {
      // Background flush to Firebase
      // Store under students/{id}/logs
      const logsRef = ref(database, `students/${this.currentStudentId}/telemetry_chunks`);
      await push(logsRef, chunk);
    } catch (error) {
      console.warn("Failed to flush telemetry chunk, re-queueing", error);
      // If offline, push them back to the start of the queue
      this.pendingEvents = [...chunk, ...this.pendingEvents];
    }
  }
}

export const telemetryTracker = TelemetryTracker.getInstance();
