/* ============================================================
   מתמטיקאור — Teacher Clustering Logic (js/teacher-clustering.js)

   Calculates clusters based on the Q-Matrix historical root errors,
   NOT based on numerical scores. Provides Process Feedback recommendations
   for the teacher, creating "The Equalizing Effect".
   ============================================================ */

'use strict';

/* global App, QMatrix, PlaceValueModel, DragController, SessionManager, StudentLogger, SilentRadar, gsap, Draggable, Swal, rrweb, Chart, bootstrap */

const TeacherClustering = (() => {

  /* ── Cluster Definitions & Process Feedback ── */
  const CLUSTERS = {
    zero_placeholder: {
      id: 'zero_placeholder',
      title: 'קושי ב"אפס" כשומר מקום',
      icon: '🟨',
      desc: 'תלמידים המתקשים להבין כי טור ריק מייצג אפס, ואינו משנה את ערך המאות.',
      pfRecommendation: 'הציגו את המספר 70 לצד 7. בקשו מהם להסביר מה קורה כשאין יחידות בודדות, ואיך האפס שומר על העשרות במקומן. (שיח אסטרטגי, לא תוצר)'
    },
    number_line: {
      id: 'number_line',
      title: 'היסוס באומדן ישר המספרים',
      icon: '📏',
      desc: 'תלמידים שסטו באופן משמעותי ממיקום המספר, מעיד על תפיסת גודל יחסי חלשה.',
      pfRecommendation: 'הנחו אותם לחפש עוגנים. "איפה האמצע? איפה יהיה 500?" בקשו מהם להשתמש בכפתור ה-Undo ולנסות שוב לאחר מציאת עוגן. (עידוד מטא-קוגניציה)'
    },
    flexibility: {
      id: 'flexibility',
      title: 'חוסר גמישות ייצוגית',
      icon: '🔄',
      desc: 'תלמידים המתקשים לפרק מספר תלת-ספרתי ביותר מדרך אחת (הכרחי לפריטה).',
      pfRecommendation: 'הדגימו פיזית המרה של עשרת ליחידות. שאלו: "האם הכמות הכללית השתנתה?" עודדו אותם להשתמש ב"בית המספרים" הווירטואלי לפירוק.'
    },
    basic_facts: {
      id: 'basic_facts',
      title: 'חוסר שליטה בעובדות יסוד',
      icon: '🧮',
      desc: 'קושי בשורש ההיסטורי (כיתה א׳) בחיבור/חיסור בסיסי בתחום העשרת הראשונה.',
      pfRecommendation: 'מנעו תרגול רבבה בשלב זה. הפנו למשחקי שליטה בעובדות היסוד, והדגישו כי עצירה לחישוב אצבעות מעידה על צורך בביסוס טכני.'
    },
    estimation: {
      id: 'estimation',
      title: 'אוטומציית יתר (למידה פרוצדורלית)',
      icon: '🤖',
      desc: 'תלמידים שחישבו מחדש במקום להשתמש באומדן במשימת "השינוי הקטן".',
      pfRecommendation: 'חזקו חשיבה ולא מכניות. שאלו: "האם היית צריך לפתור הכל מההתחלה? מה השתנה מהתרגיל הקודם?" (עידוד מאבק פורה)'
    },
    proficient: {
      id: 'proficient',
      title: 'הבנה מושגית יציבה',
      icon: '🌟',
      desc: 'שלטו בכל המיומנויות ללא צורך באבחון לאחור.',
      pfRecommendation: 'אתגרו עם פירוק גמיש עמוק (למשל 14 עשרות ו-20 יחידות). עודדו אותם להסביר את האסטרטגיה שלהם לחבר מתקשה בתוך הקבוצה.'
    }
  };

  /**
   * Group students into clusters based on their Q-Matrix results.
   * Prioritizes foundational errors (Q1 > Q3 > Q2 > Q4 > Q5).
   * @param {Array} qMatrixResults Array of student results objects.
   * @returns {Array} Array of cluster objects containing matching students.
   */
  function calculateClusters(qMatrixResults) {
    if (!qMatrixResults || !Array.isArray(qMatrixResults)) return [];

    const clustersMap = {
      zero_placeholder: [],
      number_line: [],
      flexibility: [],
      basic_facts: [],
      estimation: [],
      proficient: []
    };

    /* Priority logic for clustering based on the lowest foundational gap */
    qMatrixResults.forEach(res => {
      const qm = res.qMatrixResults || {};
      const student = { 
        username: res.studentId, 
        name: res.studentName || res.studentId, 
        task1: qm.task1_zero_placeholder, 
        task2: qm.task2_estimation_error_margin, 
        task3: qm.task3_flexible_regrouping, 
        task4: qm.task4_basic_addition_fluency, 
        q5: qm.q5_small_change,
        traceData: res.traceData || { hesitation_events: 0, undo_clicks: 0 }
      };
      
      // Foundational gap checking in order: task1 -> task3 -> task4 -> task2 -> q5
      if (qm.task1_zero_placeholder === false) {
        clustersMap.zero_placeholder.push(student);
      } else if (qm.task3_flexible_regrouping === false) {
        clustersMap.flexibility.push(student);
      } else if (qm.task4_basic_addition_fluency === false) {
        clustersMap.basic_facts.push(student);
      } else if (qm.task2_estimation_error_margin !== undefined && qm.task2_estimation_error_margin > 0.07) { 
        // 0.07 (7%) is the errorMarginPct defined in qmatrix.js
        clustersMap.number_line.push(student);
      } else if (qm.q5_small_change === false) {
        clustersMap.estimation.push(student);
      } else {
        clustersMap.proficient.push(student);
      }
    });

    /* Format for UI */
    return Object.keys(clustersMap)
      .filter(key => clustersMap[key].length > 0)
      .map(key => ({
        ...CLUSTERS[key],
        students: clustersMap[key]
      }));
  }

  return {
    calculateClusters,
    CLUSTERS
  };

})();
