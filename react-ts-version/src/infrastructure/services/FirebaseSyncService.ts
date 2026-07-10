import { ref, set, get, update, serverTimestamp, onValue, onDisconnect, type DataSnapshot } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore, type QMatrix, type TraceData } from '@/application/useStore';

class FirebaseSyncService {
  private static instance: FirebaseSyncService;
  private unsubscribeWorkspace: (() => void) | null = null;
  private unsubscribeFirebase: (() => void) | null = null;
  private currentUserId: string | null = null;
  private isInitialLoad = false;

  private constructor() {
    this.init();
  }

  public static getInstance(): FirebaseSyncService {
    if (!FirebaseSyncService.instance) {
      FirebaseSyncService.instance = new FirebaseSyncService();
    }
    return FirebaseSyncService.instance;
  }

  private init() {
    // Check initial auth state (for page refresh when already logged in)
    const initialAuth = useAuthStore.getState();
    if (initialAuth.isAuthenticated && initialAuth.user && initialAuth.role === 'student') {
      const userId = initialAuth.user.uid || initialAuth.user.id || initialAuth.user.email?.split('@')[0];
      if (userId) {
        this.currentUserId = userId;
        this.startSync(userId, initialAuth.user);
      }
    }

    // Subscribe to auth changes
    useAuthStore.subscribe((authState) => {
      if (authState.isAuthenticated && authState.user && authState.role === 'student') {
        const newUserId = authState.user.uid || authState.user.id || authState.user.email?.split('@')[0];
        if (!newUserId) return;
        if (newUserId !== this.currentUserId) {
          this.currentUserId = newUserId;
          this.startSync(newUserId, authState.user);
        }
      } else {
        this.stopSync();
      }
    });
  }

  private startSync(studentId: string, userData: Record<string, unknown>) {
    this.stopSync();

    const studentRef = ref(database, `users/students/${studentId}`);
    
    // Set online presence
    const statusRef = ref(database, `users/students/${studentId}/isOnline`);
    set(statusRef, true);
    onDisconnect(statusRef).set(false);
    
    this.isInitialLoad = true;

    // Load initial state from Firebase and keep it synced LIVE
    this.unsubscribeFirebase = onValue(studentRef, (snapshot: DataSnapshot) => {
      try {
        if (snapshot.exists()) {
          const rawData = snapshot.val();
          const data = (rawData && typeof rawData === 'object') ? rawData : {};
          // NOTE: We deliberately do NOT restore workspaceState from Firebase here.
          // StudentWorkspacePage.initSession() is the single source of truth for
          // session state. Overwriting it from Firebase mid-session causes race conditions
          // and could reset a live student's work.
          
          if (data.forceReload) {
            // Teacher initiated a deep reset. Reload the browser to clear local memory.
            update(studentRef, { forceReload: null }).then(() => {
              window.location.reload();
            }).catch((err) => {
              console.error("Failed to clear forceReload flag:", err);
              window.location.reload();
            });
            return;
          }

          // Update the top-level useStore so StudentHub knows about route approvals and Q-Matrix
          const currentStudents = useStore.getState().students;
          useStore.setState({
            students: {
              ...currentStudents,
              [studentId]: {
                ...(currentStudents[studentId] || {}),
                // Merge Firebase data: qMatrixResults, traceData, route info
                ...(data.qMatrixResults && { qMatrixResults: data.qMatrixResults }),
                ...(data.traceData && { traceData: data.traceData }),
                ...(data.completedMeeting2 !== undefined && { completedMeeting2: data.completedMeeting2 }),
                ...(data.highestCompletedMeeting !== undefined && { highestCompletedMeeting: data.highestCompletedMeeting }),
                ...(data.routeRecommendation !== undefined && { routeRecommendation: data.routeRecommendation }),
                ...(data.routeStatus !== undefined && { routeStatus: data.routeStatus }),
                ...(data.isOnline !== undefined && { isOnline: data.isOnline }),
                ...(data.workspaceState && { workspaceState: data.workspaceState }),
              }
            },
            firebaseLoaded: true
          });
        } else {
          // Initialize user in Firebase
          set(studentRef, {
            profile: userData,
            workspaceState: this.getSyncableWorkspaceState(),
            lastActive: serverTimestamp(),
            completedMeeting2: false,
            highestCompletedMeeting: 0,
            routeStatus: null
          });
          useStore.setState({ firebaseLoaded: true });
        }
      } catch (e) {
        console.error("Firebase sync error:", e);
      } finally {
        this.isInitialLoad = false;
      }
    });


    // Subscribe to local Workspace changes and push to Firebase
    this.unsubscribeWorkspace = useWorkspaceStore.subscribe((state) => {
      if (this.isInitialLoad) return;
      
      const syncableData = {
        sessionNumber: state.sessionNumber,
        isASD: state.isASD,
        standardTaskIdx: state.standardTaskIdx,
        qflow: state.qflow,
        flowStatus: state.flowStatus,
        counts: state.counts,

        undoCount: state.undoCount,
        hesitationCount: state.hesitationCount,
        hasInteracted: state.hasInteracted,
        aiTasks: state.aiTasks
      };

      update(studentRef, {
        workspaceState: syncableData,
        lastActive: serverTimestamp()
      });
    });
  }

  private getSyncableWorkspaceState() {
    const state = useWorkspaceStore.getState();
    return {
      sessionNumber: state.sessionNumber,
      isASD: state.isASD,
      standardTaskIdx: state.standardTaskIdx,
      qflow: state.qflow,
      flowStatus: state.flowStatus,
      counts: state.counts,

      undoCount: state.undoCount,
      hesitationCount: state.hesitationCount,
      hasInteracted: state.hasInteracted,
      aiTasks: state.aiTasks
    };
  }

  private stopSync() {
    this.currentUserId = null;
    if (this.unsubscribeWorkspace) {
      this.unsubscribeWorkspace();
      this.unsubscribeWorkspace = null;
    }
    if (this.unsubscribeFirebase) {
      this.unsubscribeFirebase();
      this.unsubscribeFirebase = null;
    }
  }

  public async loadTeacher(teacherId: string) {
    const teacherRef = ref(database, `users/teachers/${teacherId}`);
    const snapshot = await get(teacherRef);
    return snapshot.val();
  }

  public async authenticateTeacher(taz: string) {
    const teacherRef = ref(database, `users/teachers/${taz}`);
    const snapshot = await get(teacherRef);
    if (!snapshot.exists()) return null;
    return snapshot.val();
  }

  public async registerTeacher(teacherData: Record<string, unknown>) {
    const teacherRef = ref(database, `users/teachers/${teacherData.id}`);
    await set(teacherRef, teacherData);
  }

  // --- NEW: Sync specific fields to Firebase directly ---
  public async syncQMatrix(studentId: string, qMatrixUpdates: Partial<QMatrix>) {
    if (!studentId) return;
    const qMatrixRef = ref(database, `users/students/${studentId}/qMatrixResults`);
    await update(qMatrixRef, qMatrixUpdates);
  }

  public async syncTraceData(studentId: string, traceDataUpdates: Partial<TraceData>) {
    if (!studentId) return;
    const traceRef = ref(database, `users/students/${studentId}/traceData`);
    await update(traceRef, traceDataUpdates);
  }

  public async syncConceptMastery(studentId: string, masteryUpdates: any) {
    if (!studentId) return;
    const masteryRef = ref(database, `users/students/${studentId}/conceptMastery`);
    await update(masteryRef, masteryUpdates);
  }

  public async syncRouteRecommendation(studentId: string, route: string) {
    if (!studentId) return;
    const routeRef = ref(database, `users/students/${studentId}`);
    await update(routeRef, { routeRecommendation: route, routeStatus: 'PENDING' });
  }

  public async syncMeeting2Complete(studentId: string) {
    if (!studentId) return;
    const refPath = ref(database, `users/students/${studentId}`);
    await update(refPath, { completedMeeting2: true });
  }

  public async syncHighestCompletedMeeting(studentId: string, meeting: number) {
    if (!studentId) return;
    const refPath = ref(database, `users/students/${studentId}`);
    await update(refPath, { highestCompletedMeeting: meeting });
  }

  public async syncApproveRoute(studentId: string) {
    if (!studentId) return;
    const refPath = ref(database, `users/students/${studentId}`);
    await update(refPath, { routeStatus: 'APPROVED' });
  }
}

export const firebaseSyncService = FirebaseSyncService.getInstance();
