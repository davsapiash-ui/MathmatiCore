// ======== RESET ALL STUDENTS SCRIPT ========
// Instructions:
// 1. Open your browser and log into MathmatiCore as a Teacher or Admin.
// 2. Open Developer Tools (F12 or Ctrl+Shift+I), go to the "Console" tab.
// 3. Copy this entire script, paste it into the console, and hit Enter.

(async function() {
  console.log("%c🚀 Starting System-Wide Student Reset...", "color: #3b82f6; font-size: 14px; font-weight: bold;");
  
  // 1. Get access to the active Firebase database instance from the window
  // Because Vite bundles everything, we'll try to find the window.__FIREBASE__ or import it if possible.
  // Alternatively, since you fixed the reset logic in the Teacher Dashboard, we can just trigger it!
  
  alert("היי! כפתור איפוס הנתונים תוקן וכעת עובד בצורה מלאה דרך מסך 'ניהול כיתה' (Class Management). " +
        "אנא השתמש בכפתור האיפוס שם עבור כל תלמיד שברצונך לאפס. " +
        "מטעמי אבטחה (Firebase Rules), לא ניתן לאפס את כל מסד הנתונים במכה אחת ללא הרשאות שרת (Admin SDK), " +
        "אלא רק תלמיד-תלמיד על ידי מורה מורשה. בהצלחה!");
        
})();
