/* ============================================================
   מתמטיקאור — Teacher Override Logic (js/teacher-override.js)

   Handles manual teacher actions: sending hints, stopping sessions,
   and manual cluster reassignment.
   ============================================================ */

'use strict';

/* global App, QMatrix, PlaceValueModel, DragController, SessionManager, StudentLogger, SilentRadar, gsap, Draggable, Swal, rrweb, Chart, bootstrap */

const TeacherOverride = (() => {

  const OVERRIDE_KEY = 'mathematicor_overrides';

  function _logOverride(actionType, studentId, detail) {
    try {
      const logs = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '[]');
      logs.push({
        timestamp: Date.now(),
        action: actionType,
        student: studentId,
        detail: detail
      });
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify(logs));
      console.log(`[Teacher Override] ${actionType} -> ${studentId}`, detail);
    } catch(e) {
      console.error('Failed to log override', e);
    }
  }

  /**
   * Send a silent hint to a specific student.
   * (In a real app, this would use WebSockets. Here we simulate via localStorage polling).
   */
  function sendHint(studentUsername, hintType) {
    _logOverride('SEND_HINT', studentUsername, { hintType });
    
    // Simulate placing a hint in student's inbox
    const key = `inbox_${studentUsername}`;
    try {
      const inbox = JSON.parse(localStorage.getItem(key) || '[]');
      inbox.push({ type: 'hint', hintType: hintType, timestamp: Date.now(), read: false });
      localStorage.setItem(key, JSON.stringify(inbox));
    } catch(e) {}
  }

  /**
   * Force stop a student's session (e.g. they are too frustrated).
   */
  function stopSession(studentUsername) {
    _logOverride('STOP_SESSION', studentUsername, {});
    
    // Simulate placing a stop command
    const key = `inbox_${studentUsername}`;
    try {
      const inbox = JSON.parse(localStorage.getItem(key) || '[]');
      inbox.push({ type: 'stop', timestamp: Date.now(), read: false });
      localStorage.setItem(key, JSON.stringify(inbox));
    } catch(e) {}
  }

  /**
   * Manually move a student to a different cluster (The Teacher's ultimate authority).
   */
  function reassignCluster(studentUsername, newClusterId) {
    _logOverride('REASSIGN_CLUSTER', studentUsername, { newClusterId });
    // In a full implementation, this would modify the stored cluster mapping
    // or set an override flag in localStorage that `TeacherClustering` respects.
    try {
      const overrides = JSON.parse(localStorage.getItem('mathematicor_cluster_overrides') || '{}');
      overrides[studentUsername] = newClusterId;
      localStorage.setItem('mathematicor_cluster_overrides', JSON.stringify(overrides));
    } catch(e) {}
  }

  return {
    sendHint,
    stopSession,
    reassignCluster
  };

})();
