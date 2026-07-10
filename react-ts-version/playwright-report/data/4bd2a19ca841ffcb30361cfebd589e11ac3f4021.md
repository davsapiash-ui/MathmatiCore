# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\bot-run-struggling.spec.ts >> Generate Struggling Student Telemetry and AI Report
- Location: tests\e2e\bot-run-struggling.spec.ts:3:1

# Error details

```
Test timeout of 120000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - navigation [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]: מ
        - generic [ref=e7]:
          - generic [ref=e8]: מתמטיקאור ©
          - generic [ref=e9]: היי user2 👋
      - progressbar "התקדמות במשימות" [ref=e10]
      - generic [ref=e19]:
        - button "התנתק" [ref=e20] [cursor=pointer]: יציאה
        - button "הסתר בית המספרים" [ref=e22] [cursor=pointer]:
          - generic [ref=e23]: 🏠
          - generic [ref=e24]: הסתר
        - button "בטל פעולה אחרונה" [disabled] [ref=e25]:
          - generic [ref=e26]: ↩
          - generic [ref=e27]: בטל
        - button "צ'אט" [ref=e28] [cursor=pointer]:
          - generic [ref=e29]: 💬
          - generic [ref=e30]: צ'אט
        - button "בקש עזרה" [ref=e31] [cursor=pointer]: 💡
        - button "הפעל הדרכה מחדש" [ref=e32] [cursor=pointer]: 🧭
        - button "עבור למשימה הבאה" [disabled] [ref=e33]:
          - text: התקדם
          - generic [ref=e34]: ←
    - main [ref=e35]:
      - generic [ref=e38]:
        - generic [ref=e39]:
          - generic [ref=e40]: ✦
          - text: מפגש 1
        - 'heading "ארגז חול: אימון טכני" [level=1] [ref=e41]'
        - generic [ref=e42]:
          - paragraph [ref=e43]: "כדי לקבל את רישיון החוקר שלכם, הראו שאתם שולטים בציוד המעבדה: 1. גררו לפחות 5 פריטים ללוח. 2. מחקו לפחות פריט אחד (גרירה החוצה או פח מחזור). לאחר שתסיימו כפתור ''התקדם'' ידלק ותוכלו לעבור אל השלב הבא!"
          - button "הקרא טקסט בקול" [ref=e44] [cursor=pointer]:
            - img
        - generic [ref=e46]:
          - heading "📋 משימות החקר שלך:" [level=3] [ref=e47]
          - generic [ref=e48]:
            - generic [ref=e49]:
              - generic [ref=e50]:
                - generic [ref=e51]: ⏳
                - generic [ref=e52]: גררו לפחות 5 פריטים לבית המספרים
              - generic [ref=e55]: 0/5
            - generic [ref=e56]:
              - generic [ref=e57]:
                - generic [ref=e58]: ⏳
                - generic [ref=e59]: מחקו לפחות פריט אחד (לפח או מחוץ ללוח)
              - generic [ref=e60]: טרם בוצע
      - region "טבלת ערך המקום" [ref=e61]:
        - generic [ref=e62]:
          - generic [ref=e64]:
            - generic [ref=e65]: 🏠
            - text: בית המספרים
          - group "טורי ערך המקום" [ref=e66]:
            - generic "טור יחידות" [ref=e67]:
              - generic [ref=e69]: יחידות
              - group "אזור גרירה — יחידות" [ref=e71]
            - generic "טור עשרות" [ref=e72]:
              - generic [ref=e74]: עשרות
              - group "אזור גרירה — עשרות" [ref=e76]
            - generic "טור מאות" [ref=e77]:
              - generic [ref=e79]: מאות
              - group "אזור גרירה — מאות" [ref=e81]
          - generic "ערך כולל" [ref=e82]
        - toolbar "מחסן הכלים — גרור לטבלה" [ref=e83]:
          - generic [ref=e84]:
            - generic [ref=e85]: 🧰
            - generic [ref=e86]: ארגז כלים
          - generic [ref=e88]:
            - button "יחידה" [ref=e90]:
              - img [ref=e92]
            - generic [ref=e96]: יחידה (1)
            - generic [ref=e97]: גרור יחידות לטבלה — ערך 1
          - generic [ref=e98]:
            - button "עשרת — ניתן לפרוט ליחידות או להמיר למאה" [ref=e100]:
              - img [ref=e102]
            - generic [ref=e115]: עשרת (10)
            - generic [ref=e116]: גרור עשרות לטבלה — ערך 10
          - generic [ref=e117]:
            - button "מאה — ניתן לפרוט לעשרות או להמיר לאלף" [ref=e119]:
              - img [ref=e121]
            - generic [ref=e143]: מאה (100)
            - generic [ref=e144]: גרור מאות לטבלה — ערך 100
          - button "גרור לכאן כדי למחוק" [ref=e146] [cursor=pointer]:
            - img [ref=e147]
  - status [ref=e150]
```