import { ref, set, get, update, serverTimestamp } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { useAuthStore } from '@/application/useAuthStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

class FirebaseSyncService {
  private static instance: FirebaseSyncService;
  private unsubscribeWorkspace: (() => void) | null = null;
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
    // Subscribe to auth changes
    useAuthStore.subscribe((authState) => {
      if (authState.isAuthenticated && authState.user && authState.role === 'student') {
        const newUserId = authState.user.id || authState.user.email?.split('@')[0];
        if (newUserId !== this.currentUserId) {
          this.currentUserId = newUserId;
          this.startSync(newUserId, authState.user);
        }
      } else {
        this.stopSync();
      }
    });
  }

  private startSync(studentId: string, userData: any) {
    this.stopSync();

    const studentRef = ref(database, `users/students/${studentId}`);
    
    this.isInitialLoad = true;

    // Load initial state from Firebase
    get(studentRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data.workspaceState) {
          useWorkspaceStore.setState(data.workspaceState);
        }
      } else {
        // Initialize user in Firebase
        set(studentRef, {
          profile: userData,
          workspaceState: this.getSyncableWorkspaceState(),
          lastActive: serverTimestamp()
        });
      }
      this.isInitialLoad = false;
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
        packagedBlocks: state.packagedBlocks,
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
      packagedBlocks: state.packagedBlocks,
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
  }

  public async loadTeacher(teacherId: string) {
    const teacherRef = ref(database, `users/teachers/${teacherId}`);
    const snapshot = await get(teacherRef);
    return snapshot.val();
  }

  public async authenticateTeacher(taz: string, dob: string) {
    const teachersRef = ref(database, 'users/teachers');
    const snapshot = await get(teachersRef);
    if (!snapshot.exists()) return null;
    
    const teachers = snapshot.val();
    for (const key in teachers) {
      if (teachers[key].taz === taz && teachers[key].dob === dob) {
        return teachers[key];
      }
    }
    return null;
  }

  public async registerTeacher(teacherData: any) {
    const teacherRef = ref(database, `users/teachers/${teacherData.id}`);
    await set(teacherRef, teacherData);
  }
}

export const firebaseSyncService = FirebaseSyncService.getInstance();
