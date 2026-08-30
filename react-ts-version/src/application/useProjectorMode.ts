import { useEffect, useRef, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

/**
 * PRD v7.1 Module 15: real-time projector mode listener (<1000ms sync) with
 * timestamp ordering protection. Shared by the student lobby and workspace so
 * every student surface reacts to the teacher's projector broadcast.
 */
export function useProjectorMode(): boolean {
  const [isActive, setIsActive] = useState(false);
  const lastTimestampRef = useRef(0);

  useEffect(() => {
    const projectorRef = ref(database, 'system_control/projector_mode');
    const unsub = onValue(
      projectorRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          if (typeof val === 'object' && val !== null) {
            const timestamp = val.projector_mode_updated_at || val.updated_at || 0;
            if (timestamp > 0 && timestamp <= lastTimestampRef.current) {
              return; // Ignore stale / out-of-order updates
            }
            if (timestamp > 0) {
              lastTimestampRef.current = timestamp;
            }
            setIsActive(Boolean(val.projector_mode ?? val.active));
          } else {
            setIsActive(Boolean(val));
          }
        } else {
          setIsActive(false);
        }
      },
      (err) => {
        console.warn('[useProjectorMode] listener notice:', err);
      }
    );
    return () => unsub();
  }, []);

  return isActive;
}
