# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\telemetry-replay.spec.ts >> Telemetry & Replay Pipeline >> verify student telemetry is recorded and replay loads in Teacher Dashboard
- Location: tests\e2e\telemetry-replay.spec.ts:50:3

# Error details

```
Error: page.evaluate: TypeError: Failed to resolve module specifier 'firebase/database'
    at eval (eval at evaluate (:303:30), <anonymous>:6:9)
    at UtilityScript.evaluate (<anonymous>:305:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - img [ref=e9]
          - link "מתמטיקאור ©" [ref=e11] [cursor=pointer]:
            - /url: /
        - paragraph [ref=e12]: פורטל מנהל מערכת
      - list [ref=e15]:
        - listitem [ref=e16]:
          - button "סקירה כללית" [ref=e17] [cursor=pointer]:
            - link "סקירה כללית" [ref=e18]:
              - /url: /admin
              - img [ref=e19]
              - text: סקירה כללית
        - listitem [ref=e22]:
          - button "מוסדות ומורים" [ref=e23] [cursor=pointer]:
            - link "מוסדות ומורים" [ref=e24]:
              - /url: /admin/schools
              - img [ref=e25]
              - text: מוסדות ומורים
        - listitem [ref=e28]:
          - button "הגדרות פדגוגיה" [ref=e29] [cursor=pointer]:
            - link "הגדרות פדגוגיה" [ref=e30]:
              - /url: /admin/curriculum
              - img [ref=e31]
              - text: הגדרות פדגוגיה
        - listitem [ref=e35]:
          - button "אבטחה והרשאות" [ref=e36] [cursor=pointer]:
            - link "אבטחה והרשאות" [ref=e37]:
              - /url: /admin/security
              - img [ref=e38]
              - text: אבטחה והרשאות
        - listitem [ref=e40]:
          - button "צ'אט הודעות" [ref=e41] [cursor=pointer]:
            - link "צ'אט הודעות" [ref=e42]:
              - /url: /admin/chat
              - img [ref=e43]
              - text: צ'אט הודעות
        - listitem [ref=e48]:
          - button "תצוגת מורה" [ref=e49] [cursor=pointer]:
            - link "תצוגת מורה" [ref=e50]:
              - /url: /admin/teacher-view
              - img [ref=e51]
              - text: תצוגת מורה
        - listitem [ref=e55]:
          - button "מערכת ונגישות (UDL)" [ref=e56] [cursor=pointer]:
            - link "מערכת ונגישות (UDL)" [ref=e57]:
              - /url: /admin/settings
              - img [ref=e58]
              - text: מערכת ונגישות (UDL)
      - generic [ref=e61]:
        - generic [ref=e62]:
          - generic [ref=e63]: מ
          - generic [ref=e64]:
            - generic [ref=e65]: מנהל מערכת ראשי
            - generic [ref=e66]: Root Access
        - button "התנתק" [ref=e67] [cursor=pointer]:
          - img [ref=e68]
          - generic [ref=e71]: התנתק
    - main [ref=e72]:
      - generic [ref=e73]:
        - generic [ref=e74]: 👻
        - generic [ref=e75]: "מצב רפאים (Ghost Mode) פעיל: הפעולות שלך אינן נרשמות ואינן נראות למשתמשים אחרים."
      - generic [ref=e77]:
        - generic [ref=e79]:
          - heading "סקירה כללית" [level=1] [ref=e80]
          - paragraph [ref=e81]: מצב המערכת, צמיחה, ונתוני ציות בזמן אמת
        - generic [ref=e82]:
          - generic [ref=e84]:
            - generic [ref=e85]:
              - paragraph [ref=e86]: מוסדות פעילים
              - heading "1" [level=3] [ref=e87]
            - img [ref=e88]
          - generic [ref=e92]:
            - generic [ref=e93]:
              - paragraph [ref=e94]: מורים רשומים
              - heading "1" [level=3] [ref=e95]
            - img [ref=e96]
          - generic [ref=e102]:
            - generic [ref=e103]:
              - paragraph [ref=e104]: תלמידים במערכת (הערכה)
              - heading "0" [level=3] [ref=e105]
            - img [ref=e106]
          - generic [ref=e109]:
            - generic [ref=e110]:
              - paragraph [ref=e111]: התראות מערכת
              - heading "0" [level=3] [ref=e112]
            - img [ref=e113]
        - generic [ref=e115]:
          - generic [ref=e116]:
            - heading "צמיחת המערכת (תלמידים מול נפח פעילות)" [level=2] [ref=e117]
            - application [ref=e121]:
              - generic [ref=e125]:
                - generic [ref=e126]:
                  - generic [ref=e128]: ינואר
                  - generic [ref=e130]: פברואר
                  - generic [ref=e132]: מרץ
                  - generic [ref=e134]: אפריל
                  - generic [ref=e136]: מאי
                  - generic [ref=e138]: יוני
                - generic [ref=e139]:
                  - generic [ref=e141]: "0"
                  - generic [ref=e143]: "1"
                  - generic [ref=e145]: "2"
                  - generic [ref=e147]: "3"
                  - generic [ref=e149]: "4"
          - generic [ref=e150]:
            - heading "תאימות והגנת פרטיות" [level=2] [ref=e151]
            - generic [ref=e152]:
              - generic [ref=e153]:
                - img [ref=e155]
                - generic [ref=e157]:
                  - heading "הצפנת נתונים (At Rest)" [level=4] [ref=e158]
                  - paragraph [ref=e159]: פעיל ותקין
              - generic [ref=e160]:
                - img [ref=e162]
                - generic [ref=e167]:
                  - heading "הכנה לתקני פרטיות ילדים (COPPA)" [level=4] [ref=e168]
                  - paragraph [ref=e169]: מחיקת נתוני וידאו וקול של קטינים בני יותר מ-30 יום.
                  - button "הרץ ניקוי היסטוריית הקלטות (לשמירת פרטיות)" [ref=e170] [cursor=pointer]
              - generic [ref=e171]:
                - img [ref=e173]
                - generic [ref=e175]:
                  - heading "אנונימיזציה אוטומטית" [level=4] [ref=e176]
                  - paragraph [ref=e177]: המידע מותמם בהצלחה למחקר
        - generic [ref=e179]:
          - heading "יומן אירועים (Audit Log)" [level=2] [ref=e180]
          - table [ref=e182]:
            - rowgroup [ref=e183]:
              - row "זמן פעולה משתמש פרטים" [ref=e184]:
                - columnheader "זמן" [ref=e185]
                - columnheader "פעולה" [ref=e186]
                - columnheader "משתמש" [ref=e187]
                - columnheader "פרטים" [ref=e188]
            - rowgroup [ref=e189]:
              - row "אין אירועים להצגה." [ref=e190]:
                - cell "אין אירועים להצגה." [ref=e191]
  - generic [ref=e192]: "0"
```