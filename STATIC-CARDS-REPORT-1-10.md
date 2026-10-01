# Static coaching cards — coverage report (Module 13, 1–2.10.2026)

Branch `claude/static-cards-coverage` (from `claude/gemini-coach-real` cb99d491), local only — not pushed.
Code: `react-ts-version/src/infrastructure/services/staticSocraticCards.ts`, the static-selection parts of
`SocraticEngine.ts` (TASK_HINTS station 1, meeting-1 live cards, `analyzeLiveBoardState`, `resolveStaticHint`,
`enforceIronRule`, `GENERAL_FALLBACK`), tests. Nothing under `functions/`, `useWorkspaceStore.ts`,
`fetchGroundedGeminiSocraticQuery`, `socraticTaskContextFor`, `cardFrameOf` or `מסמכי אפיון/` was touched.
No exercise number changed (pedagogy gate: `Module26_Doc03Banks`, `ExerciseTextMatchesArithmetic` pass; every
skeleton/column computation re-checked by hand — 3▢6+271: tens 7→15; 4▢6+281: "small from large" gives the
answer, withheld; 4,000−1,562: circles 3/9/9/10).

`npm run build` passes. `npm test`: 2,528 passed, 9 failed — the same 9 that fail on the base commit
cb99d491 (Module13_SocraticContract ×8, Module23_ClassReport ×1; WIP of the Gemini branch, not this work).

Legend. Triggers: H = hesitation_45s, E4 = consecutive_errors_4, C = conversion_not_performed,
R = repeated_errors (second wrong press), U = consecutive_undos_3 (meeting 8). Levels: L1/L2/L3 = first, second,
third card of that situation in one exercise (store's `shownKinds`). Verdict of today's card (base cb99d491):
fits / partial / misleads / missing. Card ids N1–N46 and R1–R10: see "Texts" below.

## Counts

| | Situations |
|---|---|
| Total (5 analyst matrices + rows found in the code) | **113** |
| Fit today, kept (levels added where the same card repeated) | 32 |
| Misleading/missing today → routed to an existing fitting card | 13 |
| Misleading/missing today → new card or new branch | 48 |
| **Covered** | **93** |
| Still open (store, server or owner — reason per row) | 20 |

Still open, by reason: store machinery/fields not in my scope (11: card suppression on "solved" exercises
S1-19/S5-04/S7-01/S3-17, wrong "הוספת ייצוג" presses S3-15, reflection-board undo S8-09, column passed for C /
repeated_errors X-02, digit-order trigger X-03, per-column "taken so far" S5-08, palette-drop event S5-11,
card machinery X-05); server facts (2: S5-20, X-04); owner decisions (6: memory circles S4-07/S5-12/S7-10,
typed-right-without-blocks S1-20, enhanced/scaffold/quiet S7-12, meeting-8 success text S8-10); by design
(1: S1-24, circles are no trigger).

## Coverage table

Station 1 (station-1 matrix S1–S25, plus rows found in the code)

| # | Situation | Triggers | Today | Verdict | Now: L1 → L2 → L3 |
|---|---|---|---|---|---|
| S1-01 | 347 broken (3,3,17), number not written / wrong | H, E4 | R2 (its ✓ feedback breaks a 2nd ten) | misleads | N2 → N3a → N3a |
| S1-02 | subtraction, the wrong part taken first (805; 60; 41) | H, C | R7 "finished?" | partial | check-before-taking (stations 3–7 card) |
| S1-03 | both numbers built (85; 806+351 = 11 hundreds) | H, R | R7 / no-button card | partial | build-only-first (existing) |
| S1-04 | minuend built, a short column | H, C | deficit card | fits | R9 (D10 hints) → N8 → N8 |
| S1-05 | 713+94 grouped, wrong digit typed | H, E4, R | R6 "10 or more" | misleads | N5a |
| S1-06 | 713+94 with 10 tens | H, E4, R, C | R8 | fits | R8 → N7a |
| S1-07 | ≥10 hundreds (94 built as 9 hundreds) | H, R | R8 "click the button" (none there) | misleads | N1 |
| S1-08 | 713+94 empty board | H, R | R6 grouping card | misleads | build-first → N25 |
| S1-09 | 703 built right, 73 typed | E4, R | R3a | fits | R3a → N5 (0 inside) |
| S1-10 | 703 built 730 / 73; 482 as 284 | R | R3a (feedback writes the wrong board) | misleads | N41 (N9, kind s1_card) → N42 (N15a) → N9 |
| S1-11 | 368: face value 6 | E4, R | R4 | fits | R4 → N10 |
| S1-12 | 26 units (start, after one grouping) | H, R | R8 | fits | R8 → N7a |
| S1-13 | 26 grouped, written 62 | E4, R | R5 | misleads | N5b |
| S1-14 | 26: units deleted (or added) | H, R | R5 (✓ "פחות מ-10" confirms) | misleads | N38 |
| S1-15 | 26: result built by hand, no grouping | R | R5 | misleads | N38 (needs `conversionDone`) |
| S1-16 | 347: a hundred broken (2,14,7) | H, R | R8 group back | partial | N43 (= N4, undo the break) |
| S1-17 | 347: two tens broken (3,2,27) | H, R | R2 "break a ten" | misleads | N4 |
| S1-18 | 347 empty board | H | R2 | partial | build-first |
| S1-19 | representation solved, "ממשיכים" not pressed | H | R2 (undoes the solution) | misleads | N2 (harmless); **open: suppression is the store's** |
| S1-20 | subtraction typed right without taking away | R | suppressed | — | **open: owner/store** (static would be the deficit card) |
| S1-21 | subtraction finished with an extra break (455 as 4,4,15) | R | R7 / contradiction | misleads | R8 → N7a (crowding is no longer "the goal" at a − b) |
| S1-22 | board = result, wrong number typed | E4, R | R7 | fits | R7 → N5c |
| S1-23 | 482 | E4, R | R3b | fits | R3b → N5d; wrong build → N41 |
| S1-24 | memory circles in station 1 | — | no trigger | — | **open: by design** |
| S1-25 | sandbox / enhanced / quiet | — | R1 (no path) | fits | R1 (D10) |
| S1-26 | 61−24 with a palette ten (71) | H, R | R7 | misleads | N11 |
| S1-27 | 61−24 below a−b after the trash | R | R7 | misleads | N12 |
| S1-28 | 713+94 one number only | H | R6 | misleads | N24 |
| S1-29 | 713+94 stray blocks (9 hundreds) | R | R6 | misleads | N6a |
| S1-30 | subtrahend / partial minuend built (24 for 61−24) | H, R | R7 | misleads | N40 (needs `blocksRemoved:false`) |

Station 3 (matrix 3.1–3.14 + code)

| # | Situation | Triggers | Today | Verdict | Now |
|---|---|---|---|---|---|
| S3-01 | compose_break done, column counts written side by side | H, R | C1 (repeats) | fits | C1 → N3b |
| S3-02 | no break / after-state by hand / wrong block | H, R | conversion card | fits | same (place slip first) |
| S3-03 | 45 tens built, 450 written | H, R | C2 | misleads | N16 |
| S3-04 | decompose built standard / mixed | R | C2 | fits | C2 → N18 |
| S3-05 | dropped zero (56, 630, 603) | H, R | C3 | fits | C3 → N19a / N19b (zero at the end) |
| S3-06 | 506 built 5 hundreds 6 tens | R | C3 | misleads | N15a → N15b |
| S3-07 | 340 written 3040 / 34 | R | which-number | partial | which-number → N17a / N19b |
| S3-08 | 34 tens (non-standard) | H, R | live crowded | fits | crowded → N7b |
| S3-09 | one break too many | R | C1 | misleads | N4 |
| S3-10 | miscount of 45/27/36 blocks | R | C2 | partial | C2 → N18 |
| S3-11 | empty board | H | build-first | fits | build-first |
| S3-12 | 160 = 100 + ?; "6" for 60 | H, R | missing-part | partial | missing-part → N39; 6 typed → N39 |
| S3-13 | flexible: a second way | H | flexible | fits | flexible → N20 |
| S3-14 | flexible: another number on the board | H | flexible | misleads | which-number (existing) |
| S3-15 | wrong "הוספת ייצוג" presses never count | — | — | — | **open: store/owner** |
| S3-16 | enhanced profile | H | conversion card | fits | same |
| S3-17 | solved representation, card still opens | H | — | — | **open: store** |
| S3-18 | more blocks than asked (340 as 3,5) | R | which-number | misleads | N6c |
| S3-19 | number house hidden (stations 3–7) | all | any card | misleads | N14 → the exercise card |

Station 4 (matrix 4.1–4.12, audit C13/C14, code)

| # | Situation | Triggers | Today | Verdict | Now |
|---|---|---|---|---|---|
| S4-01 | carry forgotten (typed = expected − 1) | R, E4 | all-in | fits | N28a (needs `answerDigits`) |
| S4-02 | empty board | H, R | carry card ("10 or more" on nothing) | misleads | build-first → N25 |
| S4-03 | one number only | H, R | carry card | misleads | N24 |
| S4-04 | other wrong board, 2nd wrong answer | R | carry card | misleads | N25 |
| S4-05 | crowded column | H, C, R, E4 | live crowded | fits | crowded → N7b |
| S4-06 | wrong digit before grouping, "13" | C | carry card of the first carry column | misleads (chains) | carry card of the trigger column (needs `focusColumn`) |
| S4-07 | memory circle empty / wrong / two digits | — | no trigger | — | **open: owner** |
| S4-08 | digit in another column's box | R | C4 once | fits | same |
| S4-09 | basic-fact error, no carry | E4, R | all-in | fits | all-in; no blocks: N28b |
| S4-10 | 2nd/3rd conversion of a chain | C, E4 | first carry column | misleads | first unconverted / focus column; N26, N27 |
| S4-11 | enhanced, locked carry box | H | crowded / carry | fits | same |
| S4-12 | s4_r_t7 missing tens digit | E4, R, H | generic skeleton card | partial | build-first / carry / N36 / N28a |
| S4-13 | s4_g_t7 choice task with a crowded column | R, H | crowded card first | misleads | small-change card |
| S4-14 | solved, idle | — | no card | fits | — |
| S4-15 | 456+281 with 12 hundreds (C13) | R, H | "group the hundreds" | misleads | N6b |
| S4-16 | 142+23 with 12 hundreds (C14) | R, H | "group into a thousand" | misleads | N6b |
| S4-17 | carry done, digit not written | E4 | carry card again | misleads | N27b (N27c/d where the column leaves 1) |

Stations 5–6 (matrix 1–20)

| # | Situation | Triggers | Today | Verdict | Now |
|---|---|---|---|---|---|
| S5-01 | minuend built, short column | H, R | C5 → borrow | fits | C5 → borrow (focus column) → N13 |
| S5-02 | board = a − b, digits wrong | E4, R | write-after | fits | same; one box (s6_r_t7) |
| S5-03 | typing before breaking, reversed | C | C5 / borrow | fits | same, trigger column |
| S5-04 | right typed, blocks not taken | R | suppressed | — | **open: store/owner** |
| S5-05 | both numbers built | H, R | build-only-first | fits | same |
| S5-06 | empty board | H, R | empty-sub card | fits | same (wording flagged) |
| S5-07 | too much taken away | R | generic check | misleads | N12 |
| S5-08 | too few / wrong column, mid-way | R, H | generic check | partial | check-before-taking — **open: per-column "taken so far" needs a store field** |
| S5-09 | extra break, ≥10 at the end | R | write each column | misleads | N37 |
| S5-10 | palette borrow (a + 10ᵏ) | R, H | "more than X" | misleads | N11 |
| S5-11 | palette borrow at a − b + 10ᵏ | — | generic | partial | **open: needs the store's palette-drop event** |
| S5-12 | memory circles in subtraction | — | no trigger | — | **open: owner** |
| S5-13 | skeleton s5_r_t7 / s6_g_t7 | E4 | generic skeleton | misleads | N34b → N35a/b (suppression: store) |
| S5-14 | s6_r_t7 400 − 156 | all | generic skeleton | misleads | C5 → zero card (doc 03 §3.6) |
| S5-15 | break from the wrong column | H | borrow card | fits | same |
| S5-16 | borrow from an empty column | H | zero card | fits | same |
| S5-17 | partial minuend / subtrahend built | H, R | generic check | misleads | N40 (needs `blocksRemoved:false`) |
| S5-18 | s5_g_t7 choice with a crowded column | R, H | crowded card | misleads | small-change card |
| S5-19 | number house hidden | all | any | misleads | N14 |
| S5-20 | enhanced profile facts | — | — | — | **open: server facts** |

Station 7 (matrix S1–S16)

| # | Situation | Triggers | Today | Verdict | Now |
|---|---|---|---|---|---|
| S7-01 | skeleton: card suppressed once boxes are filled | R, H | no card | — | **open: store** |
| S7-02 | hidden addend (3▢6+271, 2,▢3▢+1,554, ▢▢▢+258) | E4 | generic skeleton | misleads | N32a/b → N33a/b/c |
| S7-03 | hidden minuend (5▢▢−178, 5,▢▢▢−2,847, 4▢7−213) | E4 | generic skeleton | misleads | N34a → N35a/b |
| S7-04 | s7_g_t5: not enough hundreds | H, R | which-number | misleads | N22d |
| S7-05 | s7_g_t5 after the decomposition (3,14) | H | "group the hundreds" | misleads | N22a → N22c (crowding is the goal on the way) |
| S7-06 | two steps: 540 / wrong column / one step (audit C29) | R, H | which-number / "count each column" | misleads | N22a → N22b / N22c |
| S7-07 | s7_r_t7: 150 with even tens | H | flexible | misleads | N21 → N20 |
| S7-08 | error analysis after C6 | R, H, C | addition card (units) | misleads | C6 → N23 (D9) → addition card, focus column |
| S7-09 | forgotten carry/borrow in the receiving column | R, E4 | units card | partial | N28a; meeting 8: N29 / borrow card |
| S7-10 | two-digit memory circle (13) | — | no trigger | — | **open: owner** |
| S7-11 | grouping tasks | H, R | build-first → crowded → C7 | fits | same → N17b |
| S7-12 | finished representation, enhanced, grade-1 scaffold, quiet | — | — | — | **open: store/owner** |

Station 8

| # | Situation | Triggers | Today | Verdict | Now |
|---|---|---|---|---|---|
| S8-01 | first card of an exercise (D8) | H, R, C, E4 | first conversion column (gives the structure away) | misleads | N31 (general) |
| S8-02 | carry column, second card | H, R, C, E4 | first carry column | misleads (chains) | carry card of the focus column; written → N27a/N27c |
| S8-03 | no-conversion column, units done (C30) | H | "מאיזה טור מתחילים" | misleads | N28b / N28a |
| S8-04 | 4,000 − 1,562 circles written, idle on units (C32) | H | zeros-chain card | misleads | N29 |
| S8-05 | subtraction column without a borrow | E4, R | sub-start | partial | N30 |
| S8-06 | borrow column (focus) | E4, C | first borrow column | partial | borrow card of the focus column |
| S8-07 | three undos | U | the exercise card | misleads | s8_card by trigger (doc 03), frame `guessing_loop` |
| S8-08 | skeletons (4▢6+281, 5,▢7▢+2,453, 4,▢▢▢−1,562) | E4, U | generic skeleton | misleads | N32c, N33d, N34c |
| S8-09 | reflection board undo | U | store | — | **open: store guard** |
| S8-10 | success text "וייצגתם זאת מצוין בבית המספרים" | — | — | misleads | **open: store text (flagged)** |

Cross-cutting

| # | Situation | Now |
|---|---|---|
| X-01 | the same card repeats | levels for every family (`shownKinds`; new kinds added to `STATIC_CARD_KINDS`) |
| X-02 | the card names the wrong column (R, C, U) | static cards read `focusColumn`/`answerDigits`; **open: the store must pass them** |
| X-03 | digits typed in the wrong order fire a grouping card | **open: needs the typing order at the trigger (store)** |
| X-04 | Gemini facts (stage, conversions, representation context) | **open: server** |
| X-05 | open card blocks triggers, lockout, hesitation timer, stale card | **open: store/owner** |

## StaticCardContext fields the store must fill (`useWorkspaceStore.staticCardContextFor`)

All optional; without them the cards read the board alone, as before.

| Field | Source |
|---|---|
| `trigger` | `socraticTriggerReason` |
| `focusColumn` | E4: `socraticCardPlace`; C: the column of the wrong digit (today no place is passed to `openSocraticCard`); R: the lowest wrong or empty box; H: the focused box |
| `answerDigits` | `answerDigits` (stations 3/7: the single box, right-aligned by column) |
| `memoryCircles` | `carryDigits` |
| `operandDigits` | `operandDigits` (skeleton hidden digits) |
| `conversionsDone` | `conversionsByColumn` (addition: grouped source columns; subtraction: decomposed receiving columns) |
| `boardHidden` | stations 3–7: `!selectBoardOpen(s)` |
| `blocksRemoved` | `hasDeletedBlock` — explicit `false` too (N40 needs it) |
| `conversionDone` | also meeting 1: 347 → `hasUngrouped`, 26 → `hasGrouped` |
| `shownKinds` | `socraticCardKinds` (already); new kinds are recorded automatically |
| `lastCard` | optional |

## Existing texts that break the spec (flagged, not changed)

1. "להחסיר": `meeting1DeficitCard` question ("…כדי להחסיר?"), the outside-bank deficit cards in
   `analyzeLiveBoardState` ("וצריך להחסיר"), `s5_card` ("מחסירים את המספר הקטן…").
2. No "נסו לחשוב:" opening: the empty-subtraction card ("בית המספרים עדיין ריק. בחיסור…"), the meeting-1 live
   cards R8/R9, the station-1 TASK_HINTS except 347.
3. `s8_card` (doc 03): nominal/formal ("…כדי לנהל את פעולת ההמרה או הפריטה בשלבים").
4. Approved hints with two questions or instructions: C1 ("מאיפה הגיעו…? האם הוספתם לבנים?"), C5 ("…בחיבור או
   בחיסור? ומה בודקים בחיסור?"), C7, C2 ("הניחו… פרטו… כמה…?").
5. R2's option "בית המספרים נשאר בלי שינוי" uses "נשאר" (the analysts' 347 phrase rule, owner's call).
6. `whichNumberIsBuiltCard` hint "האם לבנת מאה ולבנת יחידה שוות אותו דבר?" on boards with no such blocks
   (2,100; 3,400). In the new cards the hint became "האם כל הלבנים בבית המספרים שוות אותו דבר?".
7. C1/C7 "ולכן המספר קטן" may be heard as "the number is small" (N2 now says "קטן יותר").
8. Meeting-8 success text (useWorkspaceStore ~2337) "…וייצגתם זאת מצוין בבית המספרים": no number house there.
9. Undo name: instructions/FLEX_HOWTO "כפתור ביטול פעולה ↺", cards "כפתור ביטול הפעולה".
10. `addStartCard` "חברו את הלבנים/הספרות…": TTS may read חֲבֵרוֹ.
11. "לפח" without "האשפה", and present tense in feedback: `buildOnlyFirstCard` ("אחר כך מוציאים ממנו לפח…"),
    `afterTakeAwayCard`, R6/R8 options.
12. The AI path: the station-1 hint form is checked client-side only from meeting 3
    (`fetchGroundedGeminiSocraticQuery`, not mine).

## For the owner

1. Approve the texts below (A implemented, B alternative), including the station-1 rewrites R1–R10 (D10).
2. The 347 phrase rule (no 347 / נשאר / לא משתנה / נשמר) — applied in the new 347 cards; needs approval.
3. Counting blocks one by one is treated as legitimate (C2's second card no longer marks it wrong).
4. N38, N39, N40 and the 16 fixes of the second review were written after the last independent review and
   have not had one (the coordinator stopped new agents). The skill rules were applied to them.

## Texts — R1–R10 old → new (station 1, D10: the question and options are the owner's; hints and feedback changed)

| Card | Old | New (A) | B |
|---|---|---|---|
| R1 sandbox ✓ | בדיוק! כל לבנה שגוררים משנה את הספרה בטור שלה. (option "לגרור עוד לבנים…") | ✓ "עושים את מה שכתוב בשורה שעוד לא בוצעה" → נכון מאוד! כשתסיימו את כל מה שברשימה, לחצו על הכפתור "ממשיכים". | ✓ "בודקים איזו שורה ברשימה עוד לא בוצעה, ועושים את מה שכתוב בה" → נכון מאוד! אחרי שתסיימו את כל השורות, לחצו על הכפתור "ממשיכים". |
| R1 ✗ | "לקבץ 10 עשרות…" → זה נכון מבחינה מתמטית, אבל… | "לוחצים על הכפתור "ממשיכים" ומדלגים על השלב" → רמז: מה מראה הרשימה ליד כל שורה? | "לוחצים מיד על הכפתור "ממשיכים"" → רמז: האם כל השורות ברשימה כבר בוצעו? |
| R1 ✗ | "לכתוב מספר בשורת התוצאה" → במשימה הזו לא כותבים… | "מחכים, והשלב יסתיים מעצמו" → רמז: מה כתוב בשורה שעוד לא בוצעה? | "מחכים בלי לעשות דבר" → רמז: מה עוד לא עשיתם מהרשימה? |
| R2 ✗ נשאר בלי שינוי | רמז: הפריטה משנה את בית המספרים. בדקו מה קורה… | רמז: מה קורה ללבנת העשרת כשלוחצים עליה? | רמז: כשלוחצים על לבנת עשרת, האם היא נשארת כמו שהיא? |
| R2 ✗ נמחקת | רמז: בפריטה לא מוחקים לבנים. בדקו מה קורה ללבנת העשרת. | רמז: מאיפה מגיעות עשר היחידות החדשות? | רמז: מה מופיע בבית המספרים במקום העשרת? |
| R3 ✗ כמו שהוא | רמז: בכל תיבה בשורת התוצאה כותבים ספרה אחת בלבד. | רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה? | רמז: אם תכתבו כל חלק כמו שהוא, כמה ספרות ייכנסו לכל תיבה? |
| R3a ✗ רק החלקים | רמז: גם טור שאין בו אף לבנה מקבל תיבה משלו. | רמז: מה כותבים בתיבה של טור שאין בו אף לבנה? | רמז: אם בטור אין אף לבנה, האם התיבה שלו נשארת ריקה? |
| R3b ✗ רק החלק הראשון | רמז: כל חלק במספר תופס תיבה משלו. | רמז: כמה חלקים יש במספר שבהנחיה? | רמז: האם כל חלקי המספר שבהנחיה צריכים תיבה? |
| R4 ✗ שווה לספרה | רמז: אותה ספרה שווה יותר ככל שהטור… | רמז: האם כל הלבנים בבית המספרים שוות אותו דבר? | רמז: האם לבנה בטור אחד שווה כמו לבנה בטור אחר? |
| R4 ✗ כל הלבנים | רמז: שואלים רק על ספרה אחת. בדקו את הטור שלה. | רמז: באיזה טור בניתם את הספרה שעליה שואלים? | רמז: איזה טור בבית המספרים מראה את הספרה שעליה שואלים? |
| R5 ✗ כל הלבנים | רמז: כשיש 10 יחידות או יותר בטור, מקבצים… | רמז: מה עושים עם כל 10 יחידות שבטור? | רמז: מה אפשר לעשות עם 10 לבני יחידה? |
| R5 ✗ אף לבנה | רמז: אחרי ההקבצה נשארות בטור היחידות רק… | רמז: אם בטור יש פחות מ-10 יחידות, האם אפשר לקבץ אותן? | רמז: אילו יחידות נשארות בטור כשאין עוד 10 לקבץ? |
| R6/R8 ✗ מוחקים | רמז: מחיקת לבנים לפח משנה את ערך המספר. מקבצים במקום למחוק. (R8: + ↺) | רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר? | רמז: אם תמחקו 10 לבנים, מה יקרה למספר שבניתם? |
| R6 ✗ רושמים 10 | רמז: בכל תיבה… ספרה אחת בלבד, מ-0 עד 9. | רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה? | רמז: האם 10 נכנס בתיבה אחת? |
| R7 ✗ פרטתם עוד | רמז: פורטים רק כשאין בטור מספיק לבנים. | רמז: מתי פורטים לבנה: כשיש בטור מספיק לבנים, או כשאין? | רמז: האם פורטים גם כשבטור יש מספיק לבנים? |
| R7 ✗ הוספתם | רמז: בחיסור מוציאים מבית המספרים ולא מוסיפים. | רמז: האם בחיסור מוסיפים לבנים לבית המספרים או מוציאים ממנו? | רמז: בחיסור, מה עושים עם הלבנים: מוסיפים או מוציאים? |
| R8 ✗ לבנה אחת | רמז: לבנה אחת שווה ל-10 לבנים של הטור שמימינה. ↺ | רמז: כמה לבנים צריך כדי לקבל לבנה אחת בטור שמשמאל? | רמז: לבנה אחת בטור שמשמאל שווה כמה לבנים של הטור הזה? |
| R9 ✗ (short, not first) | רמז: מתחילים מטור היחידות. בדקו טור שנמצא מימין לו. | רמז: מאיזה טור מתחילים לבדוק בחיסור? | רמז: איזה טור בודקים ראשון בחיסור? |
| R9 ✗ (has enough) | רמז: בטור הזה יש מספיק לבנים. בדקו בכל טור… | רמז: האם בטור הזה יש פחות לבנים ממה שצריך להוציא ממנו? | רמז: האם יש בטור הזה מספיק לבנים להוציא? |
| R10 ✓ | נכון! גררו לבנים… | נכון מאוד! גררו לבנים לבית המספרים עד שהוא מראה את המספר הראשון, ורק אז הוציאו ממנו. | נכון מאוד! בנו קודם את המספר הראשון, ורק אחר כך הוציאו ממנו. |
| R10 ✗ שני המספרים | רמז: בחיסור לא בונים את שני המספרים. בונים את הראשון… | רמז: האם בחיסור מוסיפים את המספר השני או מוציאים אותו? | — |
| R10 ✗ מקלידים | רמז: קודם מייצגים את המספר בלבנים, ורק אחר כך… | רמז: בלי לבנים בבית המספרים, איך תמצאו את התוצאה? | — |

## Texts — option B for the new cards (A is in the next section, exactly as implemented)

Wrong options of B are A's unless written.

- N1 Q נסו לחשוב: באחד הטורים יש 10 לבנים או יותר, ואי אפשר לקבץ אותן. מה עושים? ✓ מוציאים את הלבנים שהמספר לא צריך → נכון מאוד! כפתור ביטול הפעולה מחזיר צעד אחד אחורה.
- N2 Q נסו לחשוב: לאן הלכה העשרת שפרטתם? ✓ היא הפכה לעשר יחידות, והן בבית המספרים → נכון מאוד! כתבו בשורת התוצאה איזה מספר מייצגות הלבנים.
- N3 Q נסו לחשוב: איך קוראים מספר מלבנים, כשבטור אחד יש 10 לבנים או יותר? ✓ כל 10 לבנים בטור שוות ללבנה אחת של הטור שמשמאל.
- N4 Q נסו לחשוב: האם פרטתם רק את מה שההנחיה מבקשת? ✓ לא, ולכן מבטלים פריטה אחת בכפתור ביטול הפעולה → נכון מאוד! אחר כך בדקו שוב את בית המספרים.
- N5 Q נסו לחשוב: הלבנים מסודרות. איך כותבים את המספר בשורת התוצאה? ✓ בכל תיבה כותבים כמה לבנים יש בטור שלה → נכון מאוד! כתבו ספרה בכל תיבה.
- N6 (column) Q נסו לחשוב: בטור המאות יש יותר לבנים ממה ששני המספרים צריכים. מה עושים? ✓ מוציאים לפח האשפה את לבני המאה המיותרות → נכון מאוד! בדקו כמה לבני מאה יש בכל מספר בתרגיל.
- N7 Q נסו לחשוב: באיזה כפתור מקבצים 10 לבני יחידה ללבנת עשרת אחת? ✓ בכפתור "קבצו 10 לעשרת" שבראש טור היחידות → נכון מאוד! לחצו עליו.
- N8 Q נסו לחשוב: איזו לבנה פורטים כשבטור אין מספיק לבנים? ✓ לבנה מהטור שמשמאלו → נכון מאוד! לחצו עליה, או גררו אותה אל הטור שחסרות בו לבנים.
- N9 Q נסו לחשוב: מה המילים של המספר אומרות על כל טור? ✓ כמה לבנים לשים בו → נכון מאוד! בנו כל חלק בטור שלו.
- N10 Q נסו לחשוב: איזה טור בבית המספרים מראה את הספרה 6 של 368? ✓ טור העשרות → נכון מאוד! כמה שוות יחד 6 לבני עשרת?
- N11 Q נסו לחשוב: מאיפה הגיעו הלבנים החדשות בבית המספרים? ✓ מארגז הכלים, ולכן מבטלים ופורטים לבנה → נכון מאוד! לחצו על כפתור ביטול הפעולה. אחר כך פרטו לבנה מהטור שמשמאל.
- N12 Q נסו לחשוב: האם הוצאתם מכל טור בדיוק כמה שהמספר השני מבקש? ✓ בודקים כל טור לחוד → נכון מאוד! אם הוצאתם יותר מדי, כפתור ביטול הפעולה יחזיר את הלבנים.
- N13 Q נסו לחשוב: מה עושים עם לבנת העשרת כדי לפרוט אותה? ✓ לוחצים עליה → נכון מאוד! אפשר גם לגרור אותה לטור היחידות.
- N14 Q נסו לחשוב: איך מחזירים את בית המספרים למסך? ✓ בכפתור "הצגת בית המספרים" שבסרגל העליון → נכון מאוד! לחצו עליו, ובדקו בלבנים.
- N15 L1 Q נסו לחשוב: באיזה טור בונים כל חלק של המספר? · L2 Q נסו לחשוב: האם כתוב בהנחיה משהו על עשרות?
- N16 Q נסו לחשוב: האם ההנחיה שואלת איזה מספר בניתם, או בכמה לבנים השתמשתם? ✓ בכמה לבנים השתמשתם → נכון מאוד! ספרו את לבני העשרת, וכתבו כמה הן.
- N17 Q נסו לחשוב: ספרתם את הלבנים בכל טור. איך הופכים את זה למספר? ✓ כל טור נותן ספרה אחת, לפי הסדר של הטורים → נכון מאוד! טור ריק באמצע המספר נותן 0.
- N18 Q נסו לחשוב: מה עוזר לספור הרבה לבנים נכון? ✓ ספירה בקבוצות של 10.
- N19 Q נסו לחשוב: בטור העשרות אין לבנים. באיזה מקום במספר יבוא ה-0? ✓ אחרי ספרת המאות ולפני ספרת היחידות.
- N20 Q נסו לחשוב: מה עושים אחרי שבניתם את הדרך הראשונה? ✓ לוחצים על "הוספת ייצוג", ובונים דרך שונה → נכון מאוד! בסוף לחצו שוב על "הוספת ייצוג".
- N21 Q נסו לחשוב: איך משנים את מספר לבני העשרת בלי לשנות את המספר 150? ✓ פורטים לבנת עשרת לעשר לבני יחידה.
- N22 L1 Q נסו לחשוב: אילו פעולות שבהנחיה כבר עשיתם, ואיזו עוד לא? (two parts) · L2 Q נסו לחשוב: אחרי שבניתם את 340, האם הוספתם את שתי המאות?
- N23 Q נסו לחשוב: איך מוצאים את הטור שבו התלמיד טעה? ✓ פותרים כל טור בעצמכם ומשווים לספרה שהתלמיד כתב בו.
- N24 Q נסו לחשוב: בתרגיל 1,245 + 328, מה עוד חסר בבית המספרים? ✓ הלבנים של 328 → נכון מאוד! בנו אותן, כל ספרה בטור שלה.
- N25 Q נסו לחשוב: אילו לבנים צריכות להיות בבית המספרים בתרגיל 1,245 + 328? ✓ הלבנים של שני המספרים.
- N26 Q נסו לחשוב: אחרי שקיבצתם 10 יחידות לעשרת אחת, מה כותבים בעיגול הזיכרון שמעל טור העשרות?
- N27 Q נסו לחשוב: ה-1 של ההמרה כבר רשום בעיגול הזיכרון. מה נשאר לכתוב בתיבה של טור היחידות?
- N28 Q נסו לחשוב: בתרגיל 1,245 + 328, אילו ספרות מחברים בטור העשרות?
- N29 Q נסו לחשוב: אחרי שרשמתם את הפריטה, איזה מספר בטור היחידות מחסרים ממנו?
- N30 Q נסו לחשוב: בתרגיל 78 − 25, איזו ספרה מחסרים מאיזו בטור העשרות? ✓ את התחתונה מהעליונה.
- N31 Q נסו לחשוב: מה בודקים בכל טור, לפני שכותבים בו ספרה?
- N32 ✓ (blocks) בונים את 271, ומשלימים כל טור עד הספרה של התוצאה → נכון מאוד! כמה לבנים הוספתם בטור של התיבה הריקה?
- N33 Q נסו לחשוב: בטור העשרות, מ-7 עד איזה מספר מוסיפים כדי שספרת התוצאה תהיה 5? ✓ עד 15, וסופרים כמה הוספתם.
- N34 ✓ (blocks) בונים את מה שנשאר, 2,159, ומוסיפים לו את מה שחיסרו.
- N35 Q נסו לחשוב: עשרת אחת עברה מטור העשרות לטור היחידות. איך מחשבים כמה עשרות היו בטור העשרות קודם?
- N36 Q נסו לחשוב: בתרגיל 328 + 145, כל הלבנים כבר בבית המספרים. מה כותבים בתיבה הריקה? ✓ את מספר הלבנים שבטור שלה.
- N37 Q נסו לחשוב: אחרי החיסור יש בטור העשרות 10 לבנים או יותר. מה עושים?
- N38 Q נסו לחשוב: איך מחזירים את הלבנים שהיו בבית המספרים בתחילת התרגיל? ✓ לוחצים על כפתור ביטול הפעולה, עד שהן חוזרות → נכון מאוד! אחר כך קבצו כל 10 לבנים בכפתור "קבצו 10". ✗ גוררים לבנים חדשות מארגז הכלים → רמז: האם ההנחיה מבקשת לבנות לבנים חדשות, או לקבץ את אלה שהיו?
- N39 Q נסו לחשוב: מה כותבים בתיבה: כמה לבנים יש בחלק החסר, או כמה הוא שווה? ✓ כמה הוא שווה → נכון מאוד! ספרו את לבני העשרת בעשרות: עשר, עשרים, שלושים… ✗ כמה לבנים יש בו → רמז: כמה שווה לבנת עשרת אחת?
- N40 Q נסו לחשוב: האם בבית המספרים בנוי כל המספר הראשון, 53? ✓ עוד לא, ולכן משלימים אותו → נכון מאוד! אחר כך הוציאו ממנו לפח האשפה את מה שמחסרים. ✗ כן, ומוציאים ממנו → רמז: איזה מספר מראות הלבנים שבבית המספרים?

## Texts — option A, exactly as implemented (one real example per card; frame = situation · level · intent · kind)

N41–N46 are routings to existing cards, shown for review in their new situations.

### R1 s1 tool steps (TASK_HINTS.s1_sandbox_controlled)
frame: s1_tool_step · level 1 · עושים את השורה ברשימה שעוד לא בוצעה, ורק אז ממשיכים · kind s1_card
Q: הסתכלו ברשימה "מה עושים בשלב הזה". מה עוד נשאר לעשות כדי לעבור לשלב הבא?
✓ עושים את מה שכתוב בשורה שעוד לא בוצעה → נכון מאוד! כשתסיימו את כל מה שברשימה, לחצו על הכפתור "ממשיכים".
✗ לוחצים על הכפתור "ממשיכים" ומדלגים על השלב → רמז: מה מראה הרשימה ליד כל שורה?
✗ מחכים, והשלב יסתיים מעצמו → רמז: מה כתוב בשורה שעוד לא בוצעה?

### R2 s1 347 card
frame: s1_break_a_ten · level 1 · כשפורטים עשרת אחת, היא הופכת לעשר יחידות שנוספות לטור היחידות · kind s1_card
Q: נסו לחשוב: מה קורה בבית המספרים כשפורטים עשרת אחת?
✓ מקבלים עשר יחידות שנוספות לטור היחידות → נכון מאוד! לחצו על לבנת עשרת, וראו את היחידות שנוספות לטור היחידות.
✗ בית המספרים נשאר בלי שינוי → רמז: מה קורה ללבנת העשרת כשלוחצים עליה?
✗ העשרת נמחקת מבית המספרים → רמז: מאיפה מגיעות עשר היחידות החדשות?

### R3a s1 703
frame: s1_number_in_words · level 1 · כל טור מקבל תיבה וספרה משלו, גם טור שאין בו לבנים · kind s1_card
Q: איך כותבים בספרות מספר שכתוב במילים?
✓ כל טור מקבל תיבה משלו → נכון מאוד! בנו את המספר, וכתבו בכל תיבה כמה לבנים יש בטור שלה.
✗ כל חלק כמו שהוא, זה אחרי זה → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ רק את החלקים שנאמרים במילים → רמז: מה כותבים בתיבה של טור שאין בו אף לבנה?

### R3b s1 482
frame: s1_number_in_words · level 1 · כל חלק של המספר בתיבה של הטור שלו, ספרה אחת בכל תיבה · kind s1_card
Q: איך כותבים בספרות מספר שכתוב במילים?
✓ כל חלק בתיבה של הטור שלו → נכון מאוד! בנו כל חלק בטור שלו, וכתבו ספרה אחת בכל תיבה.
✗ כל חלק כמו שהוא, זה אחרי זה → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ רק את החלק הראשון במספר → רמז: כמה חלקים יש במספר שבהנחיה?

### R4 s1 368
frame: s1_digit_value · level 1 · ערך של ספרה תלוי בטור שבו היא בנויה · kind s1_card
Q: איך יודעים מה הערך של ספרה במספר?
✓ בודקים באיזה טור היא נמצאת → נכון מאוד! בדקו בבית המספרים כמה שווה כל לבנה בטור של הספרה.
✗ הערך שלה שווה תמיד לספרה → רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?
✗ סופרים את כל הלבנים יחד → רמז: באיזה טור בניתם את הספרה שעליה שואלים?

### R5 s1 26
frame: s1_group_units · level 1 · מקבצים כל 10 יחידות לעשרת אחת, עד שבטור נשארות פחות מ-10 · kind s1_card
Q: מה צריך להיות בטור היחידות בסוף התרגיל?
✓ פחות מ-10 לבנים → נכון מאוד! כשיש בטור 10 יחידות או יותר, לחצו על הכפתור "קבצו 10 לעשרת" שבראש הטור.
✗ כל הלבנים שהיו בטור → רמז: מה עושים עם כל 10 יחידות שבטור?
✗ אף לבנה, הטור ריק → רמז: אם בטור יש פחות מ-10 יחידות, האם אפשר לקבץ אותן?

### R6 s1 713 + 94
frame: s1_group_in_addition · level 1 · בחיבור, כשבאחד הטורים יש 10 לבנים או יותר, מקבצים אותן ללבנה אחת של הטור שמשמאל · kind s1_card
Q: בתרגיל 713 + 94: מה עושים כשבאחד הטורים יש 10 לבנים או יותר?
✓ מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו → נכון מאוד! לחצו על הכפתור שמופיע בראש אותו טור.
✗ מוחקים 10 לבנים לפח בלי להוסיף לבנה → רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?
✗ רושמים 10 בתיבה אחת בשורת התוצאה → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?

### R7a s1 61 − 24 finished
frame: s1_finished_taking_away · level 1 · מסיימים להוציא כשהוצאתם את כל המספר השני, ואז כותבים את מה שנשאר · kind s1_card
Q: בחיסור 61 − 24: איך יודעים שסיימתם להוציא מבית המספרים?
✓ כשהוצאתם 24 מבית המספרים → נכון מאוד! בדקו כמה כבר הוצאתם, וכתבו בשורת התוצאה את מה שנשאר בבית המספרים.
✗ כשפרטתם עוד עשרת אחת → רמז: מתי פורטים לבנה: כשיש בטור מספיק לבנים, או כשאין?
✗ כשהוספתם 24 לבית המספרים → רמז: האם בחיסור מוסיפים לבנים לבית המספרים או מוציאים ממנו?

### R7b s1 806 − 351 finished
frame: s1_finished_taking_away · level 1 · מסיימים להוציא כשהוצאתם את כל המספר השני, ואז כותבים את מה שנשאר · kind s1_card
Q: בחיסור 806 − 351: איך יודעים שסיימתם להוציא מבית המספרים?
✓ כשהוצאתם 351 מבית המספרים → נכון מאוד! בדקו כמה כבר הוצאתם, וכתבו בשורת התוצאה את מה שנשאר בבית המספרים.
✗ כשפרטתם עוד מאה אחת → רמז: מתי פורטים לבנה: כשיש בטור מספיק לבנים, או כשאין?
✗ כשהוספתם 351 לבית המספרים → רמז: האם בחיסור מוסיפים לבנים לבית המספרים או מוציאים ממנו?

### R8 s1 live 10 or more
frame: s1_crowded · level 1 · באחד הטורים יש 10 לבנים או יותר: מקבצים אותן ללבנה אחת של הטור שמשמאל, בלי לומר באיזה טור · kind s1_crowded
Q: באחד הטורים יש 10 לבנים או יותר. מה עושים?
✓ מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו → נכון מאוד! לחצו על הכפתור שמופיע בראש אותו טור.
✗ מוחקים 10 לבנים לפח בלי להוסיף לבנה → רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?
✗ מעבירים לבנה אחת בלבד לטור שמשמאלו → רמז: כמה לבנים צריך כדי לקבל לבנה אחת בטור שמשמאל?

### R9 s1 live which column is short (61 − 24)
frame: s1_find_short_column · level 1 · מוצאים בעצמכם את הטור שאין בו מספיק לבנים כדי לחסר, מטור היחידות שמאלה · kind s1_deficit
Q: באיזה טור אין מספיק לבנים כדי להחסיר?
✓ בטור היחידות → נכון מאוד! לחצו על לבנה בטור שמשמאל לו כדי לפרוט אותה ל-10 לבנים.
✗ בטור העשרות → רמז: האם בטור הזה יש פחות לבנים ממה שצריך להוציא ממנו?
✗ בטור המאות → רמז: האם בטור הזה יש פחות לבנים ממה שצריך להוציא ממנו?

### R10 s1 live empty subtraction (61 − 24)
frame: sub_board_empty · level 1 · בחיסור בונים קודם רק את המספר הראשון, ואחר כך מוציאים ממנו את השני
Q: בית המספרים עדיין ריק. בחיסור, מה בונים קודם?
✓ בונים רק את המספר הראשון (61) בבית המספרים, ואחר כך מוציאים ממנו 24 לפח האשפה → נכון מאוד! גררו לבנים לבית המספרים עד שהוא מראה את המספר הראשון, ורק אז הוציאו ממנו.
✗ בונים את שני המספרים בבית המספרים ומחברים אותם → רמז: האם בחיסור מוסיפים את המספר השני או מוציאים אותו?
✗ מקלידים את התוצאה בלי לבנות כלום → רמז: בלי לבנים בבית המספרים, איך תמצאו את התוצאה?

### N1 s1 no button (703 with 12 hundreds)
frame: s1_crowded_no_button · level 1 · בטור בלי כפתור הקבצה יש יותר לבנים ממה שהמספר צריך: בודקים כמה צריך ומוציאים את המיותרות
Q: נסו לחשוב: באחד הטורים יש 10 לבנים או יותר, ואין בראשו הכפתור "קבצו 10". מה עושים?
✓ בודקים בהנחיה איזה מספר בונים, ומוציאים את הלבנים המיותרות → נכון מאוד! אפשר גם ללחוץ על כפתור ביטול הפעולה כדי לחזור צעד אחד אחורה.
✗ מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו → רמז: האם בבית המספרים יש טור משמאל לטור הזה?
✗ משאירים את כל הלבנים בטור → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?

### N2 s1 347 after the break
frame: s1_after_break · level 1 · העשרת שפרטתם הפכה לעשר יחידות, וכולן בבית המספרים: מה שוות יחד כל הלבנים · kind s1_after_break
Q: נסו לחשוב: מה קרה לעשרת שפרטתם?
✓ היא הפכה לעשר יחידות, וכולן בבית המספרים → נכון מאוד! עכשיו כתבו בשורת התוצאה איזה מספר מייצגות הלבנים.
✗ היא יצאה מבית המספרים, ולכן המספר קטן יותר → רמז: מאיפה הגיעו עשר היחידות החדשות?
✗ נוספו עשר לבנים חדשות, ולכן המספר גדל → רמז: האם לבנת העשרת שפרטתם עדיין בבית המספרים?

### N3a s1 347 after the break, second card
frame: read_with_ten_or_more · level 1 · כל 10 לבנים בטור שוות ללבנה אחת של הטור שמשמאל: סופרים כך בראש, בלי לשנות את בית המספרים · kind s1_card
Q: נסו לחשוב: באחד הטורים יש 10 לבנים או יותר. איך יודעים איזה מספר מייצגות הלבנים?
✓ סופרים כל 10 לבנים כמו לבנה אחת של הטור שמשמאל → נכון מאוד! ספרו כך בלי ללחוץ על הכפתור "קבצו 10". אחר כך כתבו את המספר.
✗ סופרים את כל הלבנים יחד → רמז: האם לבנת עשרת ולבנת יחידה שוות אותו דבר?
✗ כותבים את מספר הלבנים של כל טור, זה אחרי זה → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?

### N3b s3 C1 second card (s3_r_t2, 2 hundreds 14 tens)
frame: read_with_ten_or_more · level 1 · כל 10 לבנים בטור שוות ללבנה אחת של הטור שמשמאל: סופרים כך בראש, בלי לשנות את בית המספרים · kind compose_break_2
Q: נסו לחשוב: באחד הטורים יש 10 לבנים או יותר. איך יודעים איזה מספר מייצגות הלבנים?
✓ סופרים כל 10 לבנים כמו לבנה אחת של הטור שמשמאל → נכון מאוד! ספרו כך בלי ללחוץ על הכפתור "קבצו 10". אחר כך כתבו את המספר.
✗ סופרים את כל הלבנים יחד → רמז: האם לבנת מאה ולבנת עשרת שוות אותו דבר?
✗ כותבים את מספר הלבנים של כל טור, זה אחרי זה → רמז: כמה ספרות כותבים במספר בשביל כל טור?

### N4 extra break (s3_r_t2, 1 hundred 24 tens)
frame: extra_break · level 1 · נפרטה לבנה שההנחיה לא מבקשת: מבטלים אותה בכפתור ביטול הפעולה
Q: נסו לחשוב: פרטתם לבנה שההנחיה לא מבקשת לפרוט. מה עושים?
✓ מבטלים את הפריטה הזאת בכפתור ביטול הפעולה → נכון מאוד! לחצו על כפתור ביטול הפעולה. אחר כך בדקו שבית המספרים מראה את מה שההנחיה מבקשת.
✗ כותבים את המספר בלי לתקן → רמז: האם בית המספרים מראה עכשיו את מה שההנחיה מבקשת?
✗ פורטים עוד לבנה → רמז: כמה פעמים כתוב בהנחיה "פרטו"?

### N5a s1 boxes, 713 + 94 grouped
frame: write_result_boxes · level 1 · בכל תיבה כותבים את מספר הלבנים שבטור שלה, גם 0
Q: נסו לחשוב: מה כותבים בכל תיבה בשורת התוצאה?
✓ את מספר הלבנים שבטור של אותה תיבה → נכון מאוד! כתבו ספרה בכל תיבה, גם בתיבה של טור שאין בו לבנים.
✗ את מספר כל הלבנים יחד, בתיבה אחת → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ רק בתיבות של טורים שיש בהם לבנים → רמז: מה כותבים בתיבה של טור שאין בו אף לבנה?

### N5b s1 boxes, 26 grouped
frame: write_result_boxes · level 1 · בכל תיבה כותבים את מספר הלבנים שבטור שלה, גם 0
Q: נסו לחשוב: מה כותבים בכל תיבה בשורת התוצאה?
✓ את מספר הלבנים שבטור של אותה תיבה → נכון מאוד! כתבו ספרה אחת בכל תיבה.
✗ את מספר כל הלבנים יחד, בתיבה אחת → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ את מספר הלבנים שהיו בטור לפני ההקבצה → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?

### N5c s1 boxes, 61 − 24 done (second card)
frame: write_result_boxes · level 1 · בכל תיבה כותבים את מספר הלבנים שבטור שלה, גם 0
Q: נסו לחשוב: מה כותבים בכל תיבה בשורת התוצאה?
✓ את מספר הלבנים שבטור של אותה תיבה → נכון מאוד! כתבו ספרה אחת בכל תיבה.
✗ את מספר כל הלבנים יחד, בתיבה אחת → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ את מספר הלבנים שהיו בטור לפני שהוצאתם → רמז: האם כותבים את מה שהיה בטור, או את מה שנשאר?

### N5d s1 boxes, 482 built (second card)
frame: write_result_boxes · level 1 · בכל תיבה כותבים את מספר הלבנים שבטור שלה, גם 0
Q: נסו לחשוב: מה כותבים בכל תיבה בשורת התוצאה?
✓ את מספר הלבנים שבטור של אותה תיבה → נכון מאוד! כתבו ספרה אחת בכל תיבה.
✗ את מספר כל הלבנים יחד, בתיבה אחת → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ את המילים של המספר, מילה בכל תיבה → רמז: מה כותבים בתיבה: מילה או ספרה?

### N6a stray, station 1 (713 + 94 with 9 hundreds)
frame: stray_blocks · level 1 · יש בבית המספרים לבנים מיותרות: בודקים בכל טור כמה לבנים צריך ומוציאים את המיותרות
Q: נסו לחשוב: איך בודקים אם יש בבית המספרים לבנים מיותרות?
✓ בודקים בכל טור כמה לבנים התרגיל צריך → נכון מאוד! הוציאו לפח האשפה את הלבנים המיותרות, או לחצו על כפתור ביטול הפעולה.
✗ סופרים את כל הלבנים יחד → רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?
✗ מקבצים 10 לבנים ללבנה אחת → רמז: האם הקבצה משנה את המספר שבבית המספרים?

### N6b stray, station 4 (142 + 23 with 12 hundreds)
frame: stray_blocks · level 2 · יש בטור המאות לבנים שהתרגיל לא צריך: בודקים כמה צריך ומוציאים את המיותרות
Q: נסו לחשוב: יש בטור המאות לבנים שהתרגיל לא צריך. מה עושים?
✓ בודקים כמה לבני מאה התרגיל צריך, ומוציאים לפח האשפה את המיותרות → נכון מאוד! אפשר גם ללחוץ על כפתור ביטול הפעולה.
✗ מקבצים 10 לבני מאה ללבנת אלף אחת → רמז: האם ההקבצה משנה את המספר שבבית המספרים?
✗ משאירים אותן וכותבים את התוצאה → רמז: האם בית המספרים מראה עכשיו רק את מה שהתרגיל צריך?

### N6c stray, representation (340 with 3 hundreds 5 tens)
frame: stray_blocks · level 1 · יש בבית המספרים לבנים מיותרות: בודקים בכל טור כמה לבנים צריך ומוציאים את המיותרות
Q: נסו לחשוב: איך בודקים אם יש בבית המספרים לבנים מיותרות?
✓ בודקים בכל טור כמה לבנים ההנחיה מבקשת → נכון מאוד! הוציאו לפח האשפה את הלבנים המיותרות, או לחצו על כפתור ביטול הפעולה.
✗ סופרים את כל הלבנים יחד → רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?
✗ מקבצים 10 לבנים ללבנה אחת → רמז: האם הקבצה משנה את המספר שבבית המספרים?

### N7a s1 how to group (second card)
frame: group_action · level 3 · מקבצים 10 לבנים בכפתור "קבצו 10" שבראש הטור · kind s1_crowded_2
Q: נסו לחשוב: איך מקבצים 10 לבנים ללבנה אחת?
✓ לוחצים על הכפתור "קבצו 10" שבראש הטור → נכון מאוד! הכפתור מופיע בראש הטור כשיש בו 10 לבנים או יותר.
✗ גוררים לבנה חדשה מארגז הכלים → רמז: אם תוסיפו לבנה חדשה, האם המספר יישאר אותו מספר?
✗ גוררים 10 לבנים לפח האשפה → רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?

### N7b how to group, station 4 (second card)
frame: group_action · level 3 · מקבצים בכפתור "קבצו 10" שבראש טור היחידות · kind crowded_2
Q: נסו לחשוב: איך מקבצים 10 לבני יחידה ללבנת עשרת אחת?
✓ לוחצים על הכפתור "קבצו 10 לעשרת" שבראש טור היחידות → נכון מאוד! אחר כך רשמו 1 בעיגול הזיכרון שמעל טור העשרות.
✗ גוררים לבנת עשרת חדשה מארגז הכלים → רמז: אם תוסיפו לבנה חדשה, האם המספר יישאר אותו מספר?
✗ גוררים 10 לבני יחידה לפח האשפה → רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?

### N8 s1 where the block comes from (second card)
frame: borrow_source · level 1 · את הלבנה שפורטים לוקחים מהטור שמשמאל לטור שחסרות בו לבנים · kind s1_deficit_2
Q: נסו לחשוב: מאיפה לוקחים לבנה כדי לפרוט אותה?
✓ מהטור שמשמאל לטור שאין בו מספיק לבנים → נכון מאוד! לחצו על לבנה בטור שמשמאל, או גררו אותה אל הטור שחסרות בו לבנים.
✗ מארגז הכלים → רמז: אם תוסיפו לבנה מארגז הכלים, האם המספר יישאר אותו מספר?
✗ מהטור שאין בו מספיק לבנים → רמז: כשפורטים לבנה, לאיזה טור עוברות הלבנים הקטנות?

### N9 s1 703 how many blocks per column (second card)
frame: build_from_words · level 1 · המילים של המספר אומרות כמה לבנים בונים בכל טור
Q: נסו לחשוב: איך יודעים כמה לבנים לשים בכל טור?
✓ לפי המילים: כמה מאות, כמה עשרות וכמה יחידות יש במספר → נכון מאוד! בנו כל חלק של המספר בטור שלו.
✗ שמים בכל טור אותו מספר של לבנים → רמז: האם בכל חלק של המספר יש אותה כמות?
✗ שמים את כל הלבנים בטור אחד → רמז: האם לבנת מאה ולבנת יחידה שוות אותו דבר?

### N10 s1 368 the column of the 6 (second card)
frame: digit_column · level 1 · ערך הספרה לפי הטור שבו היא בנויה: כמה שוות הלבנים של הטור הזה
Q: נסו לחשוב: באיזה טור בניתם את הספרה 6 של המספר 368?
✓ בטור העשרות → נכון מאוד! כמה שוות 6 לבני עשרת?
✗ בטור היחידות → רמז: כמה ספרות באות אחרי הספרה 6 במספר 368?
✗ בטור המאות → רמז: איזו ספרה של 368 בניתם בטור המאות?

### N11 blocks from the tool box (53 − 18 with 5 tens 13 units)
frame: borrow_from_box · level 1 · הלבנים שחסרו בטור הגיעו מארגז הכלים: בחיסור מקבלים עוד לבנים רק מפריטה של לבנה מהטור שמשמאל
Q: נסו לחשוב: בחיסור, כשבטור אין מספיק לבנים, מאיפה מקבלים עוד לבנים?
✓ פורטים לבנה מהטור שמשמאל → נכון מאוד! לחצו על כפתור ביטול הפעולה עד שהלבנים שהוספתם ייצאו. אחר כך פרטו לבנה מהטור שמשמאל.
✗ מוסיפים לבנים מארגז הכלים → רמז: אם תוסיפו לבנים מארגז הכלים, האם המספר יישאר אותו מספר?
✗ מוציאים מהטור רק את מה שיש בו → רמז: האם כך תוציאו את כל המספר השני?

### N12 too much taken away (5,432 − 2,118)
frame: took_too_many · level 1 · משווים בכל טור את מה שהוצא לספרה של המספר השני באותו טור
Q: נסו לחשוב: איך בודקים שהוצאתם בדיוק את המספר שמחסרים?
✓ בודקים בכל טור כמה לבנים הוצאתם, ומשווים לספרה של המספר השני → נכון מאוד! אם הוצאתם יותר מדי, לחצו על כפתור ביטול הפעולה.
✗ סופרים כמה לבנים נשארו בבית המספרים → רמז: איך תדעו כמה הוצאתם מכל טור?
✗ מוציאים עוד לבנים עד שהטור מתרוקן → רמז: כמה לבנים צריך להוציא מכל טור?

### N13 the click (53 − 18, third card)
frame: break_action · level 3 · לוחצים על לבנת עשרת כדי לפרוט אותה לעשר לבני יחידה · kind break_action
Q: נסו לחשוב: איך פורטים לבנת עשרת אחת לעשר לבני יחידה?
✓ לוחצים על לבנת העשרת, או גוררים אותה לטור היחידות → נכון מאוד! עשר לבני יחידה יופיעו בטור היחידות.
✗ גוררים 10 לבני יחידה מארגז הכלים → רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?
✗ גוררים את לבנת העשרת לפח האשפה → רמז: אם תמחקו לבנה, האם המספר יישאר אותו מספר?

### N14 number house hidden
frame: board_hidden · level 3 · בית המספרים מוסתר: מציגים אותו בכפתור שבסרגל העליון ועובדים בלבנים · kind show_board
Q: נסו לחשוב: בית המספרים מוסתר. איך רואים שוב את הלבנים?
✓ לוחצים על הכפתור "הצגת בית המספרים" שבסרגל העליון → נכון מאוד! לחצו עליו, והלבנים יחזרו למסך.
✗ כותבים את התשובה בלי לבנים → רמז: איך תבדקו את התשובה בלי לבנים?
✗ מתחילים את התרגיל מההתחלה → רמז: האם הלבנים שבניתם נמחקו, או שהן רק מוסתרות?

### N15a place slip (506 as 5 hundreds 6 tens)
frame: place_slip · level 1 · חלק מהמספר בנוי בטור הלא נכון: בודקים לפי ההנחיה לאיזה טור שייך כל חלק · kind place_slip
Q: נסו לחשוב: איך יודעים לאיזה טור שייך כל חלק של המספר?
✓ בודקים כמה מאות, כמה עשרות וכמה יחידות יש במספר שבהנחיה → נכון מאוד! הוציאו לפח האשפה את הלבנים שבטור הלא נכון. אחר כך בנו כל חלק בטור שלו.
✗ לפי הסדר שבו בונים → רמז: האם הסדר שבו בונים קובע לאיזה טור שייכת לבנה?
✗ כל חלק לטור הראשון שיש בו מקום → רמז: האם לבנת עשרת ולבנת יחידה שוות אותו דבר?

### N15b place slip, second card
frame: place_slip · level 2 · במספר שבהנחיה אין עשרות: הלבנים שבטור העשרות שייכות לטור היחידות · kind place_slip_2
Q: נסו לחשוב: האם ההנחיה מבקשת לבנים בטור העשרות?
✓ לא, ולכן מוציאים אותן משם → נכון מאוד! בנו בטור היחידות אותו מספר של לבנים.
✗ כן, כי כבר בניתם שם → רמז: האם כתוב בהנחיה משהו על עשרות?
✗ לא משנה באיזה טור בונים → רמז: האם לבנת עשרת ולבנת יחידה שוות אותו דבר?

### N16 450 written for 45 tens
frame: count_not_number · level 1 · ההנחיה שואלת בכמה לבנים השתמשו, לא איזה מספר בנו · kind decompose_2
Q: נסו לחשוב: מה ההנחיה מבקשת לכתוב בשורת התוצאה?
✓ בכמה לבני עשרת השתמשתם → נכון מאוד! ספרו את לבני העשרת שבבית המספרים, וכתבו כמה הן.
✗ איזה מספר בניתם → רמז: מה כתוב בהנחיה אחרי המילה "בכמה"?
✗ כמה לבנים יש בכל טור → רמז: מאילו לבנים בניתם את המספר?

### N17a which number, second card (340)
frame: write_digits · level 1 · כל טור נותן ספרה אחת במספר, וטור ריק אחרי הספרה הראשונה נותן 0 · kind which_number_2
Q: נסו לחשוב: אחרי שסופרים את הלבנים בכל טור, איך כותבים את המספר?
✓ כותבים ספרה אחת לכל טור, מהטור השמאלי שיש בו לבנים ועד טור היחידות → נכון מאוד! אחרי הספרה הראשונה, בשביל כל טור ריק כותבים 0.
✗ כותבים רק את הטורים שיש בהם לבנים → רמז: מה כותבים בשביל טור שאין בו לבנים?
✗ כותבים כמה לבנים יש בבית המספרים כולו → רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?

### N17b C7 second card (125)
frame: number_after_grouping_digits · level 1 · כל טור נותן ספרה אחת במספר, וטור ריק אחרי הספרה הראשונה נותן 0 · kind compose_group_2
Q: נסו לחשוב: אחרי שסופרים את הלבנים בכל טור, איך כותבים את המספר?
✓ כותבים ספרה אחת לכל טור, מהטור השמאלי שיש בו לבנים ועד טור היחידות → נכון מאוד! אחרי הספרה הראשונה, בשביל כל טור ריק כותבים 0.
✗ כותבים קודם את הספרה של טור היחידות → רמז: באיזה טור נמצאת הספרה הראשונה של המספר?
✗ כותבים כמה לבנים יש בבית המספרים כולו → רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?

### N18 C2 second card (450 from tens)
frame: count_in_tens · level 1 · סופרים את לבני העשרת בקבוצות של 10 · kind decompose_2
Q: נסו לחשוב: איך סופרים הרבה לבני עשרת בלי להתבלבל?
✓ סופרים אותן בקבוצות של 10 → נכון מאוד! כמה קבוצות של 10 יש, וכמה לבנים נשארו מחוץ לקבוצות?
✗ סופרים כמה שורות של לבנים יש בטור → רמז: האם בכל שורה יש לבנה אחת בלבד?
✗ מנחשים לפי הגובה של הטור → רמז: מה אפשר לספור בבית המספרים במקום לנחש?

### N19a C3 second card (506)
frame: zero_position · level 2 · ה-0 של טור העשרות נכתב במקום של הטור הזה, בין הספרות של הטורים שמשני צדדיו · kind read_write_zero_2
Q: נסו לחשוב: בטור העשרות אין לבנים. איפה כותבים בשבילו 0 במספר?
✓ בין ספרת המאות לספרת היחידות → נכון מאוד! כך כל ספרה נמצאת במקום של הטור שלה.
✗ לא כותבים 0, כי אין שם לבנים → רמז: אם לא תכתבו 0, כמה ספרות יהיו במספר?
✗ בתחילת המספר → רמז: האם מספר מתחיל בספרה 0?

### N19b zero at the end (6,030 written 603)
frame: zero_position · level 2 · טור היחידות ריק: ה-0 שלו נכתב בסוף המספר · kind read_write_zero_2
Q: נסו לחשוב: בטור היחידות אין לבנים. איפה כותבים בשבילו 0 במספר?
✓ בסוף המספר, אחרי ספרת העשרות → נכון מאוד! כך כל ספרה נמצאת במקום של הטור שלה.
✗ לא כותבים 0, כי אין שם לבנים → רמז: אם לא תכתבו 0, כמה ספרות יהיו במספר?
✗ בתחילת המספר → רמז: האם מספר מתחיל בספרה 0?

### N20 two ways, second card
frame: second_representation · level 3 · שומרים דרך אחת בכפתור "הוספת ייצוג", ובונים דרך שונה בפריטה או בהקבצה · kind flexible_2
Q: נסו לחשוב: איך שומרים דרך אחת ובונים דרך נוספת?
✓ לוחצים על הכפתור "הוספת ייצוג", ואז פורטים לבנה או מקבצים לבנים → נכון מאוד! כשהדרך השנייה מוכנה, לחצו שוב על "הוספת ייצוג".
✗ בונים שוב את אותן לבנים → רמז: האם אותן לבנים הן דרך אחרת?
✗ מוסיפים לבנים חדשות → רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?

### N21 150 with even tens
frame: flexible_even_tens · level 1 · מספר לבני העשרת צריך להיות זוגי: פריטה של עשרת אחת לעשר יחידות משנה אותו · kind flexible
Q: נסו לחשוב: איך מייצגים את המספר 150 כך שמספר לבני העשרת יהיה זוגי?
✓ פורטים לבנת עשרת אחת לעשר לבני יחידה → נכון מאוד! אחרי כל פריטה, בדקו אם מספר לבני העשרת זוגי.
✗ מוסיפים לבנת עשרת חדשה → רמז: אם תוסיפו לבנה חדשה, האם המספר יישאר 150?
✗ בונים את 150 כמו שכותבים אותו → רמז: האם מספר לבני העשרת יהיה אז זוגי?

### N22a two steps, first card (540)
frame: steps_progress · level 1 · בודקים אילו מהפעולות שבהנחיה כבר נעשו, ועל איזה סוג לבנים · kind steps
Q: נסו לחשוב: מה עושים לפני שכותבים את המספר?
✓ בודקים שעשיתם כל פעולה בהנחיה, לפי הסדר → נכון מאוד! עשו עכשיו את הפעולה הראשונה שעוד לא עשיתם.
✗ סופרים את הלבנים וכותבים את המספר → רמז: האם כבר עשיתם את כל הפעולות שבהנחיה?
✗ בונים שוב את המספר שבתחילת ההנחיה → רמז: האם המספר שבתחילת ההנחיה הוא המספר שכותבים?

### N22b two steps, add not done (340)
frame: steps_add · level 2 · הפעולה שעוד לא נעשתה: להוסיף 2 לבני מאה · kind steps
Q: נסו לחשוב: האם כבר הוספתם את שתי המאות שההנחיה מבקשת?
✓ עוד לא. מוסיפים עכשיו 2 לבני מאה → נכון מאוד! גררו 2 לבני מאה מארגז הכלים לבית המספרים.
✗ כן, ועכשיו כותבים את המספר → רמז: אחרי שבניתם את 340, האם הוספתם לבנים?
✗ עוד לא. מוסיפים עכשיו 2 לבני עשרת → רמז: אילו לבנים ההנחיה מבקשת להוסיף?

### N22c two steps, remove not done (540)
frame: steps_remove · level 2 · הפעולה שעוד לא נעשתה: להסיר 3 לבני עשרת · kind steps
Q: נסו לחשוב: האם כבר הסרתם את שלוש העשרות שההנחיה מבקשת?
✓ עוד לא. מוציאים עכשיו 3 לבני עשרת לפח האשפה → נכון מאוד! גררו 3 לבני עשרת לפח האשפה.
✗ כן, ועכשיו כותבים את המספר → רמז: האם הוצאתם לבנים לפח האשפה אחרי שהוספתם?
✗ עוד לא. מוציאים עכשיו 3 לבני יחידה → רמז: אילו לבנים ההנחיה מבקשת להסיר?

### N22d two steps, not enough hundreds (4,400)
frame: steps_not_enough · level 2 · אין מספיק לבני מאה כדי להסיר: פורטים לבנת אלף לעשר לבני מאה · kind steps
Q: נסו לחשוב: ההנחיה מבקשת להסיר שש מאות. מה עושים אם אין מספיק לבני מאה?
✓ פורטים לבנת אלף אחת לעשר לבני מאה → נכון מאוד! לחצו על לבנת אלף כדי לפרוט אותה. אחר כך הוציאו 6 לבני מאה לפח האשפה.
✗ מוציאים את כל לבני המאה שיש → רמז: האם כך תסירו שש מאות?
✗ מוסיפים לבני מאה מארגז הכלים → רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?

### N23 error analysis, second card (D9)
frame: check_student_columns · level 1 · בודקים את התוצאה של התלמיד טור אחר טור, כולל מה שעבר מהטור שמימין · kind error_analysis_2
Q: נסו לחשוב: איך בודקים בכל טור אם התלמיד צדק?
✓ פותרים כל טור בעצמכם, ומשווים לספרה שהתלמיד כתב בטור הזה → נכון מאוד! התחילו בטור היחידות, ובדקו טור אחר טור.
✗ בודקים רק את הספרה הראשונה של התוצאה שלו → רמז: האם טעות יכולה להיות גם בטור אחר?
✗ מחברים רק את שתי הספרות של הטור → רמז: מה קורה לטור כשהטור שמימינו מגיע ל-10 או יותר?

### N24 one number missing (1,245 + 328 with 1,245)
frame: one_number_missing · level 1 · בבית המספרים בנוי רק אחד המספרים: בונים גם את השני
Q: נסו לחשוב: בתרגיל 1,245 + 328, איזה מספר עוד לא בבית המספרים?
✓ המספר 328 → נכון מאוד! בנו את 328: כל ספרה בטור שלה.
✗ המספר 1,245 → רמז: אילו לבנים כבר בניתם?
✗ שני המספרים כבר שם → רמז: איזה מספר מראות הלבנים שבבית המספרים?

### N25 build both numbers (second carry card, building)
frame: build_both_numbers · level 1 · בחיבור בונים את שני המספרים, כל ספרה בטור שלה, ובודקים כל מספר · kind carry_2
Q: נסו לחשוב: מה בונים בבית המספרים בתרגיל 1,245 + 328?
✓ את שני המספרים, כל ספרה בטור שלה → נכון מאוד! בדקו את הלבנים של כל מספר, טור אחר טור.
✗ רק את המספר הראשון → רמז: אילו מספרים מחברים בתרגיל הזה?
✗ רק את התוצאה → רמז: האם כבר יודעים מה התוצאה?

### N26 the memory circle after grouping
frame: carry_record · level 2 · אחרי ההקבצה רושמים 1 בעיגול הזיכרון שמעל טור העשרות · kind carry_2
Q: נסו לחשוב: קיבצתם 10 יחידות לעשרת אחת. מה רושמים בעיגול הזיכרון שמעל טור העשרות?
✓ 1, כי עשרת אחת עברה לטור העשרות → נכון מאוד! כשתחברו את הספרות של טור העשרות, הוסיפו גם את ה-1 שבעיגול הזיכרון.
✗ 10, כי מקבצים 10 יחידות → רמז: כמה לבני עשרת עברו לטור העשרות?
✗ לא רושמים כלום, כי הלבנים כבר בבית המספרים → רמז: איך תזכרו לחבר את העשרת שעברה לטור העשרות?

### N27a carry written, station 8
frame: carry_column_write · level 2 · בטור היחידות כבר הומרו 10 יחידות: בתיבה כותבים רק את מה שנשאר
Q: נסו לחשוב: בתרגיל 1,245 + 328, כבר רשמתם 1 בעיגול הזיכרון שמעל טור העשרות. מה כותבים בתיבה של טור היחידות?
✓ רק את ספרת היחידות של הסכום → נכון מאוד! ה-1 שבעיגול הזיכרון מייצג עשר יחידות.
✗ את כל הסכום, בשתי ספרות → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ את ה-1 שבעיגול הזיכרון → רמז: לאיזה טור שייך ה-1 שבעיגול הזיכרון?

### N27b carry done, with blocks
frame: carry_column_write · level 2 · בטור היחידות כבר הומרו 10 יחידות: בתיבה כותבים רק את מה שנשאר
Q: נסו לחשוב: בתרגיל 5,678 + 2,453, כבר קיבצתם בטור היחידות. מה כותבים בתיבה שלו?
✓ את מספר הלבנים שנשארו בטור היחידות → נכון מאוד! ספרו את הלבנים שבטור, וכתבו את מספרן בתיבה.
✗ את מספר הלבנים שהיו בטור לפני ההקבצה → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ את הספרה העליונה של הטור → רמז: האם מחברים רק את הספרה העליונה?

### N28a column card with a carry in (carry forgotten)
frame: carry_forgotten · level 2 · לטור העשרות עברה עשרת אחת מהטור שמימין, וגם אותה מחברים
Q: נסו לחשוב: בתרגיל 1,245 + 328, מה מחברים בטור העשרות?
✓ את שתי הספרות של הטור, ועוד העשרת שעברה מטור היחידות → נכון מאוד! כתבו את הסכום בתיבה של טור העשרות.
✗ רק את שתי הספרות של הטור → רמז: מה עבר לטור העשרות מטור היחידות?
✗ את כל הספרות של התרגיל → רמז: אילו ספרות כתובות בטור העשרות?

### N28b column card, no carry in (142 + 23, station 8)
frame: add_column · level 2 · בכל טור מחברים את שתי הספרות שלו, ועוד מה שעבר אליו מהטור שמימין
Q: נסו לחשוב: בתרגיל 142 + 23, מה מחברים בטור העשרות?
✓ את שתי הספרות של הטור → נכון מאוד! כתבו את הסכום בתיבה של טור העשרות.
✗ את שתי הספרות של הטור, ועוד 1 → רמז: האם עבר משהו לטור העשרות מטור היחידות?
✗ את כל הספרות של התרגיל → רמז: אילו ספרות כתובות בטור העשרות?

### N29 station 8, after the decomposition is written (C32)
frame: subtract_after_borrow · level 2 · אחרי הפריטה מחסרים בטור היחידות מהמספר שבעיגול הזיכרון
Q: נסו לחשוב: בתרגיל 4,000 − 1,562, כבר רשמתם את הפריטה בעיגולי הזיכרון. ממה מחסרים עכשיו בטור היחידות?
✓ מהמספר שבעיגול הזיכרון שמעל טור היחידות → נכון מאוד! כתבו בתיבה כמה נשאר אחרי שמחסרים ממנו את הספרה התחתונה.
✗ מהספרה העליונה שבתרגיל → רמז: מה רשמתם בעיגול הזיכרון שמעל טור היחידות?
✗ מהספרה התחתונה → רמז: האם מחסרים מהספרה התחתונה, או מחסרים אותה?

### N30 station 8, plain subtraction column (78 − 25)
frame: subtract_column · level 2 · בכל טור מחסרים את הספרה התחתונה מהעליונה
Q: נסו לחשוב: בתרגיל 78 − 25, מה מחסרים בטור העשרות?
✓ את הספרה התחתונה מהספרה העליונה → נכון מאוד! כתבו את התוצאה בתיבה של טור העשרות.
✗ את הספרה העליונה מהספרה התחתונה → רמז: מאיזו ספרה מחסרים: מהספרה העליונה או מהתחתונה?
✗ לא מחסרים, אלא מחברים את שתי הספרות → רמז: איזה סימן כתוב בין המספרים?

### N31a station 8 first card, addition (D8)
frame: check_each_column · level 1 · לפני שכותבים ספרה: בודקים בכל טור אם הסכום מגיע ל-10 או יותר · kind s8_check
Q: נסו לחשוב: לפני שכותבים ספרה בשורת התוצאה, מה בודקים בכל טור?
✓ אם סכום הספרות בטור מגיע ל-10 או יותר → נכון מאוד! אם הוא מגיע ל-10 או יותר, רשמו 1 בעיגול הזיכרון שמעל הטור שמשמאל.
✗ איזו ספרה בטור היא הגדולה → רמז: האם בחיבור כותבים את הספרה הגדולה?
✗ כמה ספרות יש בתרגיל כולו → רמז: האם מחברים את כל הספרות של התרגיל יחד?

### N31b station 8 first card, subtraction (D8)
frame: check_each_column · level 1 · לפני שכותבים ספרה: בודקים בכל טור אם הספרה העליונה מספיקה כדי לחסר · kind s8_check
Q: נסו לחשוב: לפני שכותבים ספרה בשורת התוצאה, מה בודקים בכל טור?
✓ אם הספרה העליונה גדולה מהתחתונה או שווה לה → נכון מאוד! אם היא קטנה מהתחתונה, פרטו מהטור שמשמאל. רשמו את השינוי בעיגולי הזיכרון.
✗ איזו ספרה גדולה יותר, כדי לחסר את הקטנה מהגדולה → רמז: מאיזו ספרה מחסרים: מהספרה העליונה או מהתחתונה?
✗ אם יש בטור 0 → רמז: אם ה-0 הוא הספרה התחתונה, האם צריך לפרוט?

### N32a skeleton hidden addend, blocks (3▢6 + 271 = 657)
frame: skeleton_missing_addend · level 1 · מהמספר הידוע: מוסיפים בכל טור עד הספרה של התוצאה, וכשמגיעים ל-10 או יותר רושמים 1 בעיגול הזיכרון · kind skeleton
Q: נסו לחשוב: בתרגיל 3▢6 + 271 = 657, איך מגלים את הספרה החסרה?
✓ בונים את 271, ובכל טור מוסיפים לבנים עד שמגיעים לספרה של התוצאה → נכון מאוד! כתבו בתיבה הריקה כמה לבנים הוספתם בטור שלה.
✗ כותבים בתיבה הריקה את הספרה של התוצאה → רמז: אם תכתבו בתיבה את הספרה הזאת, האם החיבור ייתן 657?
✗ מנחשים ספרה וכותבים אותה בתיבה → רמז: איך אפשר לבדוק בבית המספרים אם הספרה נכונה?

### N32b skeleton hidden addend, two digits (2,▢3▢ + 1,554)
frame: skeleton_missing_addend · level 1 · מהמספר הידוע: מוסיפים בכל טור עד הספרה של התוצאה, וכשמגיעים ל-10 או יותר רושמים 1 בעיגול הזיכרון · kind skeleton
Q: נסו לחשוב: בתרגיל 2,▢3▢ + 1,554 = 4,191, איך מגלים את הספרות החסרות?
✓ בונים את 1,554, ובכל טור מוסיפים לבנים עד שמגיעים לספרה של התוצאה → נכון מאוד! כתבו בכל תיבה ריקה כמה לבנים הוספתם בטור שלה.
✗ כותבים בכל תיבה ריקה את הספרה של התוצאה → רמז: אם תכתבו בתיבות את הספרות האלה, האם החיבור ייתן 4,191?
✗ מנחשים ספרות וכותבים אותן בתיבות → רמז: איך אפשר לבדוק בבית המספרים אם הספרות נכונות?

### N32c skeleton hidden addend, station 8 (4▢6 + 281)
frame: skeleton_missing_addend · level 1 · מהמספר הידוע: מוסיפים בכל טור עד הספרה של התוצאה, וכשמגיעים ל-10 או יותר רושמים 1 בעיגול הזיכרון · kind skeleton
Q: נסו לחשוב: בתרגיל 4▢6 + 281 = 737, איך מגלים את הספרה החסרה?
✓ בודקים בכל טור כמה צריך להוסיף לספרה של 281 כדי לקבל את הספרה של התוצאה → נכון מאוד! אם מגיעים ל-10 או יותר, רשמו 1 בעיגול הזיכרון שמעל הטור שמשמאל.
✗ כותבים בתיבה הריקה את הספרה של התוצאה → רמז: אם תכתבו בתיבה את הספרה הזאת, האם החיבור ייתן 737?
✗ מנחשים ספרה וכותבים אותה בתיבה → רמז: איך אפשר לבדוק בחישוב אם הספרה נכונה?

### N33a skeleton column, passing 10 (3▢6 + 271 tens)
frame: skeleton_missing_addend_column · level 2 · בטור העשרות: כמה מוסיפים לספרה הידועה כדי להגיע לספרת התוצאה, ומה קורה כשמגיעים ל-10 או יותר · kind skeleton_2
Q: נסו לחשוב: בטור העשרות, כמה צריך להוסיף ל-7 כדי לקבל 5 בספרת התוצאה?
✓ מוסיפים ל-7 עד שמגיעים ל-15, וסופרים כמה הוספתם → נכון מאוד! כתבו בתיבה הריקה כמה לבנים הוספתם. אחר כך לחצו על הכפתור "קבצו 10 למאה". רשמו 1 בעיגול הזיכרון שמעל טור המאות.
✗ כותבים 5, כמו בספרת התוצאה → רמז: האם הספרה של התוצאה היא גם הספרה החסרה?
✗ מחסרים את הספרה הקטנה מהגדולה → רמז: כמה זה 7 ועוד 2?

### N33b skeleton column, no ten passes (31▢ + 254 units)
frame: skeleton_missing_addend_column · level 2 · בטור היחידות: כמה מוסיפים לספרה הידועה כדי להגיע לספרת התוצאה, ומה קורה כשמגיעים ל-10 או יותר · kind skeleton_2
Q: נסו לחשוב: בטור היחידות, כמה צריך להוסיף ל-4 כדי לקבל 8 בספרת התוצאה?
✓ מוסיפים ל-4 עד שמגיעים ל-8, וסופרים כמה הוספתם → נכון מאוד! כתבו בתיבה הריקה כמה לבנים הוספתם.
✗ כותבים 8, כמו בספרת התוצאה → רמז: האם הספרה של התוצאה היא גם הספרה החסרה?
✗ מוסיפים 8 ל-4 → רמז: כמה זה 4 ועוד 8?

### N33c skeleton column, a carry in (▢▢▢ + 258 tens)
frame: skeleton_missing_addend_column · level 2 · בטור העשרות: כמה מוסיפים לספרה הידועה כדי להגיע לספרת התוצאה, ומה קורה כשמגיעים ל-10 או יותר · kind skeleton_2
Q: נסו לחשוב: בטור העשרות, כמה צריך להוסיף ל-5 ועוד 1 כדי לקבל 7 בספרת התוצאה?
✓ מוסיפים ל-5 ועוד 1 עד שמגיעים ל-7, וסופרים כמה הוספתם → נכון מאוד! כתבו בתיבה הריקה כמה לבנים הוספתם.
✗ כותבים 7, כמו בספרת התוצאה → רמז: האם הספרה של התוצאה היא גם הספרה החסרה?
✗ מוסיפים 7 ל-5 ועוד 1 → רמז: כמה זה 6 ועוד 7?

### N33d skeleton column, station 8 (4▢6 + 281 tens)
frame: skeleton_missing_addend_column · level 2 · בטור העשרות: כמה מוסיפים לספרה הידועה כדי להגיע לספרת התוצאה, ומה קורה כשמגיעים ל-10 או יותר · kind skeleton_2
Q: נסו לחשוב: בטור העשרות, כמה צריך להוסיף ל-8 כדי לקבל 3 בספרת התוצאה?
✓ מוסיפים ל-8 עד שמגיעים ל-13, וסופרים כמה הוספתם → נכון מאוד! כתבו בתיבה הריקה כמה הוספתם. אחר כך רשמו 1 בעיגול הזיכרון שמעל הטור שמשמאל.
✗ כותבים 3, כמו בספרת התוצאה → רמז: האם הספרה של התוצאה היא גם הספרה החסרה?
✗ מוסיפים 3 ל-8 → רמז: כמה זה 8 ועוד 3?

### N34a skeleton hidden first number, blocks (5,▢▢▢ − 2,847)
frame: skeleton_hidden_minuend · level 1 · עובדים הפוך: מה שנשאר ועוד מה שחיסרו הוא המספר שממנו חיסרו · kind skeleton
Q: נסו לחשוב: בתרגיל 5,▢▢▢ − 2,847 = 2,159, איך מגלים את הספרות החסרות?
✓ בונים את 2,159, ומחזירים לבית המספרים את 2,847 → נכון מאוד! כך מקבלים את המספר שממנו חיסרו. קבצו כל 10 לבנים בטור. אחר כך כתבו בתיבות הריקות את הספרות החסרות.
✗ מחסרים את 2,847 מ-2,159 → רמז: האם 2,159 הוא המספר שהיה בהתחלה, או מה שנשאר?
✗ מנחשים ספרות וכותבים אותן בתיבות → רמז: איך אפשר לבדוק בבית המספרים אם הספרות נכונות?

### N34b skeleton hidden first number, one digit (4▢2 − 128)
frame: skeleton_hidden_minuend · level 1 · עובדים הפוך: מה שנשאר ועוד מה שחיסרו הוא המספר שממנו חיסרו · kind skeleton
Q: נסו לחשוב: בתרגיל 4▢2 − 128 = 314, איך מגלים את הספרה החסרה?
✓ בונים את 314, ומחזירים לבית המספרים את 128 → נכון מאוד! כך מקבלים את המספר שממנו חיסרו. קבצו כל 10 לבנים בטור. אחר כך כתבו בתיבה הריקה את הספרה החסרה.
✗ מחסרים את 128 מ-314 → רמז: האם 314 הוא המספר שהיה בהתחלה, או מה שנשאר?
✗ מנחשים ספרה וכותבים אותה בתיבה → רמז: איך אפשר לבדוק בבית המספרים אם הספרה נכונה?

### N34c skeleton hidden first number, station 8 (4,▢▢▢ − 1,562)
frame: skeleton_hidden_minuend · level 1 · עובדים הפוך: מה שנשאר ועוד מה שחיסרו הוא המספר שממנו חיסרו · kind skeleton
Q: נסו לחשוב: בתרגיל 4,▢▢▢ − 1,562 = 2,438, איך מגלים את הספרות החסרות?
✓ מחברים את 2,438 ואת 1,562 → נכון מאוד! הסכום הוא המספר שממנו חיסרו. כתבו בתיבות הריקות את הספרות החסרות.
✗ מחסרים את 1,562 מ-2,438 → רמז: האם 2,438 הוא המספר שהיה בהתחלה, או מה שנשאר?
✗ מנחשים ספרות וכותבים אותן בתיבות → רמז: איך אפשר לבדוק בחישוב אם הספרות נכונות?

### N35a skeleton first-number column, a ten given (4▢2 − 128 tens)
frame: skeleton_hidden_minuend_column · level 2 · טור היחידות היה צריך עשרת אחת מטור העשרות: מה שנשאר, ועוד מה שחיסרו, ועוד מה שעבר — זה מה שהיה בטור · kind skeleton_2
Q: נסו לחשוב: טור היחידות היה צריך עשרת אחת. איך מגלים כמה עשרות היו בטור העשרות לפני שהיא עברה?
✓ מחברים את העשרות של התוצאה ואת העשרות שחיסרו, ועוד העשרת שעברה ליחידות → נכון מאוד! כתבו את מה שקיבלתם בתיבה הריקה.
✗ מחברים רק את העשרות של התוצאה ואת העשרות שחיסרו → רמז: לאן עברה העשרת שטור היחידות היה צריך?
✗ מחסרים את העשרות שחיסרו מהעשרות של התוצאה → רמז: האם לפני החיסור היו בטור יותר עשרות או פחות?

### N35b skeleton first-number column, no ten given (4▢7 − 213 tens)
frame: skeleton_hidden_minuend_column · level 2 · מה שנשאר בטור ועוד מה שחיסרו ממנו הוא מה שהיה בו לפני החיסור · kind skeleton_2
Q: נסו לחשוב: איך מגלים כמה עשרות היו בטור העשרות לפני החיסור?
✓ מחברים את הספרה של התוצאה ואת הספרה שחיסרו → נכון מאוד! כתבו את מה שקיבלתם בתיבה הריקה.
✗ מחסרים את הספרה שחיסרו מהספרה של התוצאה → רמז: האם לפני החיסור היה בטור יותר או פחות ממה שנשאר?
✗ כותבים את הספרה של התוצאה → רמז: מה חיסרו בטור הזה?

### N36 all in, one box (328 + 145)
frame: all_blocks_in · level 1 · כל הלבנים בבית המספרים ומקובצות: כותבים בכל תיבה את מספר הלבנים שבטור שלה
Q: נסו לחשוב: בתרגיל 328 + 145, כל הלבנים כבר בבית המספרים. מה עושים עכשיו?
✓ כותבים בתיבה הריקה את מספר הלבנים שבטור שלה → נכון מאוד! ספרו את הלבנים בטור של התיבה הריקה.
✗ מוסיפים עוד לבנים → רמז: האם חסרות עוד לבנים בבית המספרים?
✗ מקבצים את היחידות לעשרת אחת → רמז: האם יש בטור היחידות 10 לבנים או יותר?

### N37 group back after an extra break (5,432 − 2,118)
frame: extra_break_sub · level 2 · בטור יישארו 10 לבנים או יותר גם אחרי החיסור: מקבצים 10 עשרות למאה אחת
Q: נסו לחשוב: בטור העשרות יש 10 לבנים או יותר, גם אחרי החיסור. מה עושים?
✓ מקבצים 10 עשרות למאה אחת, בכפתור "קבצו 10 למאה" → נכון מאוד! בסוף החיסור, בכל טור צריכות להיות פחות מ-10 לבנים.
✗ כותבים בתיבה את כל מה שנשאר בטור → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ מוציאים לפח האשפה עוד לבנים מהטור → רמז: אם תוציאו עוד לבנים, האם תוציאו יותר מהמספר השני?

### N38 s1 26: the blocks it started with changed (8 units left)
frame: s1_restore_start · level 1 · הלבנים שהתרגיל נתן השתנו: מחזירים אותן בכפתור ביטול הפעולה, ורק אז מקבצים
Q: נסו לחשוב: הלבנים שבבית המספרים הן כבר לא הלבנים שהיו בתחילת התרגיל. מה עושים?
✓ מחזירים אותן בכפתור ביטול הפעולה, ואז מקבצים → נכון מאוד! לחצו על כפתור ביטול הפעולה עד שהלבנים יחזרו. אחר כך קבצו כל 10 לבנים בכפתור "קבצו 10".
✗ כותבים את המספר שהלבנים מראות עכשיו → רמז: מה ההנחיה מבקשת לעשות עם הלבנים שהיו בתחילת התרגיל?
✗ לוחצים על פח האשפה → רמז: מה קורה ללבנים כשלוחצים על פח האשפה?

### N39 160 = 100 + ?: 6 written for 60
frame: missing_part_value · level 1 · החלק החסר בנוי מלבני עשרת: סופרים אותן בעשרות, כי כל לבנת עשרת שווה 10 · kind missing_part_2
Q: נסו לחשוב: החלק החסר בנוי מלבני עשרת. איך יודעים כמה הוא שווה?
✓ סופרים את לבני העשרת בעשרות: עשר, עשרים, שלושים… → נכון מאוד! כתבו בתיבה כמה שווה החלק החסר.
✗ סופרים כמה לבנים יש בו → רמז: כמה שווה לבנת עשרת אחת?
✗ מחברים אותו למאה → רמז: האם ההנחיה שואלת על המספר כולו, או רק על החלק החסר?

### N40 subtraction, the first number not complete (53 − 18 with 5 tens)
frame: build_first_number · level 1 · בחיסור בונים בבית המספרים את כל המספר הראשון, ורק אחר כך מוציאים ממנו
Q: נסו לחשוב: בתרגיל 53 − 18, איזה מספר בונים בבית המספרים?
✓ רק את המספר הראשון, 53 → נכון מאוד! בנו את כל המספר הראשון. אחר כך הוציאו ממנו לפח האשפה את מה שמחסרים.
✗ רק את המספר השני, 18 → רמז: מאיזה מספר מחסרים?
✗ את שני המספרים → רמז: האם בחיסור מוסיפים את המספר השני או מוציאים אותו?

### N25b empty addition board, second card (1,245 + 328)
frame: build_both_numbers · level 1 · בחיבור בונים את שני המספרים, כל ספרה בטור שלה, ובודקים כל מספר
Q: נסו לחשוב: מה בונים בבית המספרים בתרגיל 1,245 + 328?
✓ את שני המספרים, כל ספרה בטור שלה → נכון מאוד! בדקו את הלבנים של כל מספר, טור אחר טור.
✗ רק את המספר הראשון → רמז: אילו מספרים מחברים בתרגיל הזה?
✗ רק את התוצאה → רמז: האם כבר יודעים מה התוצאה?

### N27c carry written, the column leaves 1 (5,678 + 2,453 units, station 8)
frame: carry_column_write · level 2 · בטור היחידות כבר הומרו 10 יחידות: בתיבה כותבים רק את מה שנשאר
Q: נסו לחשוב: בתרגיל 5,678 + 2,453, כבר רשמתם 1 בעיגול הזיכרון שמעל טור העשרות. מה כותבים בתיבה של טור היחידות?
✓ רק את ספרת היחידות של הסכום → נכון מאוד! ה-1 שבעיגול הזיכרון מייצג עשר יחידות.
✗ את כל הסכום, בשתי ספרות → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?
✗ את הספרה העליונה של הטור → רמז: האם מחברים רק את הספרה העליונה?

### N27d carry done with blocks, the column leaves 1 (5,678 + 2,453 units)
frame: crowded_column · level 2 · בטור העשרות יש 10 לבנים או יותר: מקבצים 10 מהן למאה אחת · kind crowded
Q: נסו לחשוב: בטור העשרות יש 10 לבנים או יותר. מה עושים?
✓ אוספים 10 עשרות ומקבצים אותן למאה אחת בטור המאות → נכון מאוד! לחצו על הכפתור "קבצו 10" שבראש טור העשרות כדי להמיר למאה אחת.
✗ מוחקים עשרות מיותרות לפח האשפה → רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?
✗ רושמים מספר דו-ספרתי בתיבת העשרות → רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?

### N41 s1 703 built as 730 (first card)
frame: build_from_words · level 1 · המילים של המספר אומרות כמה לבנים בונים בכל טור · kind s1_card
Q: נסו לחשוב: איך יודעים כמה לבנים לשים בכל טור?
✓ לפי המילים: כמה מאות, כמה עשרות וכמה יחידות יש במספר → נכון מאוד! בנו כל חלק של המספר בטור שלו.
✗ שמים בכל טור אותו מספר של לבנים → רמז: האם בכל חלק של המספר יש אותה כמות?
✗ שמים את כל הלבנים בטור אחד → רמז: האם לבנת מאה ולבנת יחידה שוות אותו דבר?

### N42 s1 703 built as 730 (second card)
frame: place_slip · level 1 · חלק מהמספר בנוי בטור הלא נכון: בודקים לפי ההנחיה לאיזה טור שייך כל חלק · kind place_slip
Q: נסו לחשוב: איך יודעים לאיזה טור שייך כל חלק של המספר?
✓ בודקים כמה מאות, כמה עשרות וכמה יחידות יש במספר שבהנחיה → נכון מאוד! הוציאו לפח האשפה את הלבנים שבטור הלא נכון. אחר כך בנו כל חלק בטור שלו.
✗ לפי הסדר שבו בונים → רמז: האם הסדר שבו בונים קובע לאיזה טור שייכת לבנה?
✗ כל חלק לטור הראשון שיש בו מקום → רמז: האם לבנת עשרת ולבנת יחידה שוות אותו דבר?

### N43 s1 347 a hundred broken
frame: extra_break · level 1 · נפרטה לבנה שההנחיה לא מבקשת: מבטלים אותה בכפתור ביטול הפעולה
Q: נסו לחשוב: פרטתם לבנה שההנחיה לא מבקשת לפרוט. מה עושים?
✓ מבטלים את הפריטה הזאת בכפתור ביטול הפעולה → נכון מאוד! לחצו על כפתור ביטול הפעולה. אחר כך בדקו שבית המספרים מראה את מה שההנחיה מבקשת.
✗ כותבים את המספר בלי לתקן → רמז: האם בית המספרים מראה עכשיו את מה שההנחיה מבקשת?
✗ פורטים עוד לבנה → רמז: כמה פעמים כתוב בהנחיה "פרטו"?

### N44 s1 806 − 351 both built
frame: build_only_first · level 1 · בחיסור בונים רק את המספר הראשון ומוציאים ממנו
Q: נסו לחשוב: בתרגיל 806 − 351, בבית המספרים יש יותר מ-806. מה בונים בחיסור?
✓ רק את המספר הראשון, 806 → נכון מאוד! אחר כך מוציאים ממנו לפח את מה שמחסרים.
✗ את שני המספרים → רמז: האם בחיסור מוסיפים את המספר השני או מוציאים אותו?
✗ רק את המספר השני → רמז: מאיזה מספר מחסרים?

### N45 s1 806 − 351 finished with 15 units
frame: s1_crowded · level 1 · באחד הטורים יש 10 לבנים או יותר: מקבצים אותן ללבנה אחת של הטור שמשמאל, בלי לומר באיזה טור · kind s1_crowded
Q: באחד הטורים יש 10 לבנים או יותר. מה עושים?
✓ מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו → נכון מאוד! לחצו על הכפתור שמופיע בראש אותו טור.
✗ מוחקים 10 לבנים לפח בלי להוסיף לבנה → רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?
✗ מעבירים לבנה אחת בלבד לטור שמשמאלו → רמז: כמה לבנים צריך כדי לקבל לבנה אחת בטור שמשמאל?

### N46 two ways of 2,100, another number on the board
frame: which_number_built · level 1 · סופרים את הלבנים בכל טור לחוד כדי לדעת איזה מספר בנוי · kind which_number
Q: נסו לחשוב: איך יודעים איזה מספר בנוי בבית המספרים?
✓ סופרים את הלבנים בכל טור לחוד → נכון מאוד! כמה לבנים יש בכל טור?
✗ סופרים את כל הלבנים יחד → רמז: האם לבנת מאה ולבנת יחידה שוות אותו דבר?
✗ מנחשים מספר → רמז: מה אפשר לספור בבית המספרים כדי לבדוק?
