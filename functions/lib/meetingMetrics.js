"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIAGNOSTIC_COMPULSORY_COUNT = void 0;
exports.sessionNumberFromId = sessionNumberFromId;
exports.readAllDocs = readAllDocs;
exports.computeFirstAttemptScore = computeFirstAttemptScore;
exports.summarizeMeeting = summarizeMeeting;
exports.resolveCompulsoryTotal = resolveCompulsoryTotal;
const admin = require("firebase-admin");
/**
 * Per-meeting measurements derived from the learner's own telemetry events.
 * Shared by the per-meeting report (Module 23) and the research export
 * (Module 24) so both describe a meeting with the same numbers.
 */
/** "session_3_student_user4" / "session_03_student_4" → 3; anything else → null. */
function sessionNumberFromId(sessionId) {
    const m = /^session_0?(\d)(?:_|$)/.exec(String(sessionId || ""));
    if (!m)
        return null;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 8 ? n : null;
}
exports.DIAGNOSTIC_COMPULSORY_COUNT = 7;
const PAGE = 500;
const MAX_PAGES = 2000; // one million documents — a hard stop, never reached by a pilot class
/**
 * Every document of a query, page by page, ordered by document id. No cap.
 * Pass a base query without orderBy/limit.
 */
async function readAllDocs(base) {
    const docs = [];
    const query = base.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    let last = null;
    for (let page = 0; page < MAX_PAGES; page++) {
        const pageQuery = last ? query.startAfter(last) : query;
        const snap = await pageQuery.get();
        if (snap.empty)
            break;
        for (const d of snap.docs)
            docs.push({ id: d.id, data: d.data() });
        last = snap.docs[snap.docs.length - 1];
        if (snap.size < PAGE)
            break;
    }
    return docs;
}
/**
 * PRD Module 23 §ב, applied to one meeting's telemetry:
 * "נפתר נכון בניסיון ראשון" = a PROBLEM_COMPLETE for the exercise with no
 * earlier DIGIT_ENTERED whose is_correct === false in the same exercise_id;
 * is_correct === null is ignored entirely. Score = correct ÷ compulsory × 100.
 *
 * `compulsoryTotal` is the meeting's number of compulsory exercises (7 for the
 * diagnostic meeting, the bank's count otherwise). When it is unknown, the
 * exercises the learner actually opened are the denominator.
 */
function computeFirstAttemptScore(telemetryDocs, compulsoryTotal) {
    var _a;
    const wrongBeforeComplete = new Set();
    const completedFirstTry = new Set();
    const attempted = new Set();
    for (const ev of telemetryDocs) {
        const exId = String((ev === null || ev === void 0 ? void 0 : ev.exercise_id) || "");
        if (!exId)
            continue;
        attempted.add(exId);
        if (ev.event_type === "DIGIT_ENTERED" && ((_a = ev.details) === null || _a === void 0 ? void 0 : _a.is_correct) === false) {
            wrongBeforeComplete.add(exId);
        }
        else if (ev.event_type === "PROBLEM_COMPLETE" && !wrongBeforeComplete.has(exId)) {
            completedFirstTry.add(exId);
        }
    }
    const denominator = compulsoryTotal && compulsoryTotal > 0 ? compulsoryTotal : Math.max(1, attempted.size);
    const correct = Math.min(completedFirstTry.size, denominator);
    return {
        scorePercent: Math.round((correct / denominator) * 100),
        correctFirstAttempt: correct,
        attempted: attempted.size,
        denominator,
    };
}
/** Counters of what happened in one meeting, straight from its events. */
function summarizeMeeting(events) {
    var _a, _b;
    const attempted = new Set();
    const completed = new Set();
    let first = null;
    let last = null;
    const s = {
        events: events.length,
        first_event_at: null,
        last_event_at: null,
        active_minutes: 0,
        exercises_attempted: 0,
        exercises_completed: 0,
        wrong_digits: 0,
        digits_entered: 0,
        deletions: 0,
        undos: 0,
        hesitations: 0,
        hesitation_seconds_total: 0,
        regroupings: 0,
        socratic_cards: 0,
        reflection_submitted: false,
    };
    for (const ev of events) {
        const t = typeof ev.client_timestamp === "number" ? ev.client_timestamp : null;
        if (t !== null) {
            first = first === null ? t : Math.min(first, t);
            last = last === null ? t : Math.max(last, t);
        }
        const exId = String(ev.exercise_id || "");
        if (exId)
            attempted.add(exId);
        switch (ev.event_type) {
            case "PROBLEM_COMPLETE":
                if (exId)
                    completed.add(exId);
                break;
            case "DIGIT_ENTERED":
                s.digits_entered++;
                if (((_a = ev.details) === null || _a === void 0 ? void 0 : _a.is_correct) === false)
                    s.wrong_digits++;
                break;
            case "DIGIT_DELETED":
                s.deletions++;
                break;
            case "UNDO_EXECUTED":
                s.undos++;
                break;
            case "HESITATION_DETECTED":
                s.hesitations++;
                if (typeof ((_b = ev.details) === null || _b === void 0 ? void 0 : _b.hesitation_seconds) === "number")
                    s.hesitation_seconds_total += ev.details.hesitation_seconds;
                break;
            case "REGROUPING_SUCCESS":
                s.regroupings++;
                break;
            case "SOCRATIC_CARD_SHOWN":
                s.socratic_cards++;
                break;
            case "REFLECTION_SUBMITTED":
                s.reflection_submitted = true;
                break;
            default: break;
        }
    }
    s.first_event_at = first;
    s.last_event_at = last;
    s.active_minutes = first !== null && last !== null ? Math.round(((last - first) / 60000) * 10) / 10 : 0;
    s.exercises_attempted = attempted.size;
    s.exercises_completed = completed.size;
    return s;
}
/**
 * How many compulsory exercises a meeting has for a given path, from the
 * Module 26 catalog in Firestore; 7 for the diagnostic meeting; null when the
 * bank is not there (the caller then uses what the learner attempted).
 */
async function resolveCompulsoryTotal(db, sessionNumber, path, cache = new Map()) {
    var _a;
    if (sessionNumber === 2)
        return exports.DIAGNOSTIC_COMPULSORY_COUNT;
    const key = `${sessionNumber}:${path}`;
    if (cache.has(key))
        return (_a = cache.get(key)) !== null && _a !== void 0 ? _a : null;
    let total = null;
    const bankIds = sessionNumber >= 3 && sessionNumber <= 8
        ? [`session_${sessionNumber}_${path}`, `session_${sessionNumber}`]
        : [`session_${sessionNumber}`];
    for (const bankId of bankIds) {
        try {
            const bankDoc = await db.collection("curriculum_catalog").doc(bankId).get();
            const tasks = bankDoc.exists ? (bankDoc.data() || {}).tasks : null;
            if (Array.isArray(tasks) && tasks.length > 0) {
                total = tasks.filter((t) => t && t.isOptionalChoiceTask !== true).length || tasks.length;
                break;
            }
        }
        catch (_b) {
            /* catalog unavailable: fall through to null */
        }
    }
    cache.set(key, total);
    return total;
}
//# sourceMappingURL=meetingMetrics.js.map