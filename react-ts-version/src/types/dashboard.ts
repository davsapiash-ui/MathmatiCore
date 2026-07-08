export interface RadarAlert {
  id: string;
  firebaseKey?: string;
  type: 'HESITATION' | 'PASSIVE_DRIFTING' | 'HINT_REQUESTED' | 'TASK_ERROR' | 'TAB_ESCAPE';
  studentId: string;
  student: string;
  username: string;
  studentName: string;
  rawStudentId: string;
  taskId?: string;
  sessionNumber?: number;
  timestamp: number;
  unread: boolean;
  idleMs?: number;
  recentDeletions?: number;
  totalDeletionsFromStart?: number;
  detail?: string;
  reason?: string;
}

export interface PendingApproval {
  id: string;
  studentId: string;
  studentName: string;
  timestamp: number;
  clinicalDiagnosisHe: string;
  actionPlanHe: string;
  tasks: any[]; // SessionTask[]
}

export interface ChatMessage {
  id?: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: number;
  read?: boolean;
}
