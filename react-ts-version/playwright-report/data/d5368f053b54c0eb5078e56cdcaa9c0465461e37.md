# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-sync.spec.ts >> Chat Synchronization >> Admin to Teacher real-time message delivery
- Location: tests\e2e\chat-sync.spec.ts:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('ניהול כיתה').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('ניהול כיתה').first()

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
      - generic [ref=e74]:
        - generic [ref=e76]:
          - heading "סקירה כללית" [level=1] [ref=e77]
          - paragraph [ref=e78]: מצב המערכת, צמיחה, ונתוני ציות בזמן אמת
        - generic [ref=e79]:
          - generic [ref=e81]:
            - generic [ref=e82]:
              - paragraph [ref=e83]: מוסדות פעילים
              - heading "1" [level=3] [ref=e84]
            - img [ref=e85]
          - generic [ref=e89]:
            - generic [ref=e90]:
              - paragraph [ref=e91]: מורים רשומים
              - heading "1" [level=3] [ref=e92]
            - img [ref=e93]
          - generic [ref=e99]:
            - generic [ref=e100]:
              - paragraph [ref=e101]: תלמידים במערכת (הערכה)
              - heading "30" [level=3] [ref=e102]
            - img [ref=e103]
          - generic [ref=e106]:
            - generic [ref=e107]:
              - paragraph [ref=e108]: התראות מערכת
              - heading "0" [level=3] [ref=e109]
            - img [ref=e110]
        - generic [ref=e112]:
          - generic [ref=e113]:
            - heading "צמיחת המערכת (תלמידים מול נפח פעילות)" [level=2] [ref=e114]
            - generic [ref=e117]:
              - generic:
                - status:
                  - paragraph: אפריל
                  - list:
                    - listitem: "נפח פעילות : 0"
                    - listitem: "תלמידים : 0"
              - application [ref=e118]:
                - generic [ref=e127]:
                  - generic [ref=e128]:
                    - generic [ref=e130]: ינואר
                    - generic [ref=e132]: פברואר
                    - generic [ref=e134]: מרץ
                    - generic [ref=e136]: אפריל
                    - generic [ref=e138]: מאי
                    - generic [ref=e140]: יוני
                  - generic [ref=e141]:
                    - generic [ref=e143]: "0"
                    - generic [ref=e145]: "1"
                    - generic [ref=e147]: "2"
                    - generic [ref=e149]: "3"
                    - generic [ref=e151]: "4"
          - generic [ref=e152]:
            - heading "תאימות והגנת פרטיות" [level=2] [ref=e153]
            - generic [ref=e154]:
              - generic [ref=e155]:
                - img [ref=e157]
                - generic [ref=e159]:
                  - heading "הצפנת נתונים (At Rest)" [level=4] [ref=e160]
                  - paragraph [ref=e161]: פעיל ותקין
              - generic [ref=e162]:
                - img [ref=e164]
                - generic [ref=e169]:
                  - heading "הכנה לתקני פרטיות ילדים (COPPA)" [level=4] [ref=e170]
                  - paragraph [ref=e171]: מחיקת נתוני וידאו וקול של קטינים בני יותר מ-30 יום.
                  - button "הרץ ניקוי היסטוריית הקלטות (לשמירת פרטיות)" [ref=e172] [cursor=pointer]
              - generic [ref=e173]:
                - img [ref=e175]
                - generic [ref=e177]:
                  - heading "אנונימיזציה אוטומטית" [level=4] [ref=e178]
                  - paragraph [ref=e179]: המידע מותמם בהצלחה למחקר
        - generic [ref=e181]:
          - heading "יומן אירועים (Audit Log)" [level=2] [ref=e182]
          - table [ref=e184]:
            - rowgroup [ref=e185]:
              - row "זמן פעולה משתמש פרטים" [ref=e186]:
                - columnheader "זמן" [ref=e187]
                - columnheader "פעולה" [ref=e188]
                - columnheader "משתמש" [ref=e189]
                - columnheader "פרטים" [ref=e190]
            - rowgroup [ref=e191]:
              - 'row "6.7.2026, 13:11:42 התחברות teacher משתמש התחבר: Unknown" [ref=e192]':
                - cell "6.7.2026, 13:11:42" [ref=e193]
                - cell "התחברות" [ref=e194]
                - cell "teacher" [ref=e195]
                - 'cell "משתמש התחבר: Unknown" [ref=e196]'
              - 'row "6.7.2026, 13:11:40 התחברות student משתמש התחבר: Unknown" [ref=e197]':
                - cell "6.7.2026, 13:11:40" [ref=e198]
                - cell "התחברות" [ref=e199]
                - cell "student" [ref=e200]
                - 'cell "משתמש התחבר: Unknown" [ref=e201]'
              - 'row "6.7.2026, 13:11:39 התחברות teacher משתמש התחבר: Unknown" [ref=e202]':
                - cell "6.7.2026, 13:11:39" [ref=e203]
                - cell "התחברות" [ref=e204]
                - cell "teacher" [ref=e205]
                - 'cell "משתמש התחבר: Unknown" [ref=e206]'
              - 'row "6.7.2026, 13:11:38 התחברות teacher משתמש התחבר: Unknown" [ref=e207]':
                - cell "6.7.2026, 13:11:38" [ref=e208]
                - cell "התחברות" [ref=e209]
                - cell "teacher" [ref=e210]
                - 'cell "משתמש התחבר: Unknown" [ref=e211]'
              - 'row "6.7.2026, 13:11:38 התחברות admin משתמש התחבר: Unknown" [ref=e212]':
                - cell "6.7.2026, 13:11:38" [ref=e213]
                - cell "התחברות" [ref=e214]
                - cell "admin" [ref=e215]
                - 'cell "משתמש התחבר: Unknown" [ref=e216]'
              - 'row "6.7.2026, 13:11:35 התחברות admin משתמש התחבר: Unknown" [ref=e217]':
                - cell "6.7.2026, 13:11:35" [ref=e218]
                - cell "התחברות" [ref=e219]
                - cell "admin" [ref=e220]
                - 'cell "משתמש התחבר: Unknown" [ref=e221]'
              - 'row "6.7.2026, 13:08:22 התחברות teacher משתמש התחבר: Unknown" [ref=e222]':
                - cell "6.7.2026, 13:08:22" [ref=e223]
                - cell "התחברות" [ref=e224]
                - cell "teacher" [ref=e225]
                - 'cell "משתמש התחבר: Unknown" [ref=e226]'
              - 'row "6.7.2026, 13:08:20 התחברות admin משתמש התחבר: Unknown" [ref=e227]':
                - cell "6.7.2026, 13:08:20" [ref=e228]
                - cell "התחברות" [ref=e229]
                - cell "admin" [ref=e230]
                - 'cell "משתמש התחבר: Unknown" [ref=e231]'
              - 'row "6.7.2026, 13:05:27 התחברות teacher משתמש התחבר: Unknown" [ref=e232]':
                - cell "6.7.2026, 13:05:27" [ref=e233]
                - cell "התחברות" [ref=e234]
                - cell "teacher" [ref=e235]
                - 'cell "משתמש התחבר: Unknown" [ref=e236]'
              - 'row "6.7.2026, 13:05:26 התחברות student משתמש התחבר: Unknown" [ref=e237]':
                - cell "6.7.2026, 13:05:26" [ref=e238]
                - cell "התחברות" [ref=e239]
                - cell "student" [ref=e240]
                - 'cell "משתמש התחבר: Unknown" [ref=e241]'
              - 'row "6.7.2026, 13:05:25 התחברות teacher משתמש התחבר: Unknown" [ref=e242]':
                - cell "6.7.2026, 13:05:25" [ref=e243]
                - cell "התחברות" [ref=e244]
                - cell "teacher" [ref=e245]
                - 'cell "משתמש התחבר: Unknown" [ref=e246]'
              - 'row "6.7.2026, 13:05:24 התחברות teacher משתמש התחבר: Unknown" [ref=e247]':
                - cell "6.7.2026, 13:05:24" [ref=e248]
                - cell "התחברות" [ref=e249]
                - cell "teacher" [ref=e250]
                - 'cell "משתמש התחבר: Unknown" [ref=e251]'
              - 'row "6.7.2026, 13:05:25 התחברות admin משתמש התחבר: Unknown" [ref=e252]':
                - cell "6.7.2026, 13:05:25" [ref=e253]
                - cell "התחברות" [ref=e254]
                - cell "admin" [ref=e255]
                - 'cell "משתמש התחבר: Unknown" [ref=e256]'
              - 'row "6.7.2026, 13:05:23 התחברות admin משתמש התחבר: Unknown" [ref=e257]':
                - cell "6.7.2026, 13:05:23" [ref=e258]
                - cell "התחברות" [ref=e259]
                - cell "admin" [ref=e260]
                - 'cell "משתמש התחבר: Unknown" [ref=e261]'
              - 'row "6.7.2026, 13:03:35 התחברות student משתמש התחבר: Unknown" [ref=e262]':
                - cell "6.7.2026, 13:03:35" [ref=e263]
                - cell "התחברות" [ref=e264]
                - cell "student" [ref=e265]
                - 'cell "משתמש התחבר: Unknown" [ref=e266]'
              - 'row "6.7.2026, 13:03:30 התחברות teacher משתמש התחבר: Unknown" [ref=e267]':
                - cell "6.7.2026, 13:03:30" [ref=e268]
                - cell "התחברות" [ref=e269]
                - cell "teacher" [ref=e270]
                - 'cell "משתמש התחבר: Unknown" [ref=e271]'
              - 'row "6.7.2026, 13:03:27 התחברות admin משתמש התחבר: Unknown" [ref=e272]':
                - cell "6.7.2026, 13:03:27" [ref=e273]
                - cell "התחברות" [ref=e274]
                - cell "admin" [ref=e275]
                - 'cell "משתמש התחבר: Unknown" [ref=e276]'
              - 'row "6.7.2026, 13:03:18 התחברות teacher משתמש התחבר: Unknown" [ref=e277]':
                - cell "6.7.2026, 13:03:18" [ref=e278]
                - cell "התחברות" [ref=e279]
                - cell "teacher" [ref=e280]
                - 'cell "משתמש התחבר: Unknown" [ref=e281]'
              - 'row "6.7.2026, 13:03:17 התחברות student משתמש התחבר: Unknown" [ref=e282]':
                - cell "6.7.2026, 13:03:17" [ref=e283]
                - cell "התחברות" [ref=e284]
                - cell "student" [ref=e285]
                - 'cell "משתמש התחבר: Unknown" [ref=e286]'
              - 'row "6.7.2026, 13:03:15 התחברות teacher משתמש התחבר: Unknown" [ref=e287]':
                - cell "6.7.2026, 13:03:15" [ref=e288]
                - cell "התחברות" [ref=e289]
                - cell "teacher" [ref=e290]
                - 'cell "משתמש התחבר: Unknown" [ref=e291]'
  - generic [ref=e292]: "0"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Chat Synchronization', () => {
  4  |   test('Admin to Teacher real-time message delivery', async ({ browser }) => {
  5  |     // We need two isolated browser contexts to simulate two different users
  6  |     const adminContext = await browser.newContext();
  7  |     const teacherContext = await browser.newContext();
  8  | 
  9  |     // Disable driver.js tours for both contexts
  10 |     await adminContext.addInitScript(() => {
  11 |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  12 |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  13 |     });
  14 |     await teacherContext.addInitScript(() => {
  15 |       window.localStorage.setItem('mathmaticore_has_seen_admin_tour', 'true');
  16 |       window.localStorage.setItem('mathmaticore_has_seen_teacher_tour', 'true');
  17 |     });
  18 | 
  19 |     const adminPage = await adminContext.newPage();
  20 |     const teacherPage = await teacherContext.newPage();
  21 | 
  22 |     // Login Admin
  23 |     await adminPage.goto('/login');
  24 |     await adminPage.getByRole('button', { name: 'מנהל מערכת' }).click();
  25 |     await adminPage.getByPlaceholder('שם משתמש').fill('davsapiash');
  26 |     await adminPage.getByPlaceholder('סיסמה').fill('carlibach');
  27 |     await adminPage.getByRole('button', { name: 'התחבר למערכת' }).click();
  28 | 
  29 |     // Login Teacher
  30 |     await teacherPage.goto('/login');
  31 |     await teacherPage.getByRole('button', { name: 'מורה' }).click();
  32 |     await teacherPage.getByPlaceholder('תעודת זהות').fill('039604483');
  33 |     await teacherPage.getByPlaceholder('תאריך לידה (6 ספרות, במבנה יום-חודש-שנה)').fill('290984');
  34 |     await teacherPage.getByRole('button', { name: 'התחבר למערכת' }).click();
  35 | 
  36 |     // Teacher: Navigate to Class Management to ensure Dashboard is fully loaded
> 37 |     await expect(teacherPage.getByText('ניהול כיתה').first()).toBeVisible();
     |                                                               ^ Error: expect(locator).toBeVisible() failed
  38 | 
  39 |     // Admin: Navigate to chat tab
  40 |     await adminPage.getByText('צ\'אט הודעות').click();
  41 |     
  42 |     // Admin: Select "דוד" (teacher_david)
  43 |     await adminPage.getByText('דוד').first().click();
  44 | 
  45 |     // Admin: Send a message
  46 |     const testMessage = `Test Message ${Date.now()}`;
  47 |     await adminPage.getByPlaceholder('הקלד הודעה...').fill(testMessage);
  48 |     await adminPage.getByPlaceholder('הקלד הודעה...').press('Enter');
  49 | 
  50 |     // Teacher: Verify notification badge or message directly in the UI
  51 |     await teacherPage.getByText('תקשורת וצ\'אט').click();
  52 |     await teacherPage.getByText('צ\'אט הנהלה').click();
  53 | 
  54 |     // Teacher: Look for the message from Admin
  55 |     // Since this is real-time via Firebase, it should appear quickly
  56 |     await expect(teacherPage.getByText(testMessage)).toBeVisible({ timeout: 10000 });
  57 |   });
  58 | });
  59 | 
```