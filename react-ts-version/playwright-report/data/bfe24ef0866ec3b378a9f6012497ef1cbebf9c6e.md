# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\dnd.spec.ts >> Drag and Drop Mechanics >> student can drag a unit block from the palette to the units column
- Location: tests\e2e\dnd.spec.ts:32:3

# Error details

```
Test timeout of 30000ms exceeded.
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
          - generic [ref=e9]: היי user1 👋
      - progressbar "התקדמות במשימות" [ref=e10]
      - generic [ref=e19]:
        - button "התנתק" [ref=e20] [cursor=pointer]: יציאה
        - button "הסתר בית המספרים" [ref=e22] [cursor=pointer]:
          - generic [ref=e23]: 🏠
          - generic [ref=e24]: הסתר
        - button "בטל פעולה אחרונה" [ref=e25] [cursor=pointer]:
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
          - paragraph [ref=e43]: "כדי לקבל את רישיון החוקר שלכם, הראו שאתם שולטים בציוד המעבדה: 1. גררו לפחות 5 פריטים ללוח. 2. מחקו לפחות פריט אחד (גרירה החוצה או פח מחזור). מערכת \"התקדם\" תופעל לאחר מכן."
          - button "הקרא טקסט בקול" [ref=e44] [cursor=pointer]:
            - img
      - region "טבלת ערך המקום" [ref=e45]:
        - generic [ref=e46]:
          - generic [ref=e48]:
            - generic [ref=e49]: 🏠
            - text: בית המספרים
          - group "טורי ערך המקום" [ref=e50]:
            - generic "טור יחידות" [ref=e51]:
              - generic [ref=e52]:
                - generic [ref=e53]: יחידות
                - generic [ref=e54]: "1"
              - group "אזור גרירה — יחידות" [ref=e55]:
                - button "יחידה" [ref=e57]:
                  - img [ref=e59]
            - generic "טור עשרות" [ref=e63]:
              - generic [ref=e65]: עשרות
              - group "אזור גרירה — עשרות" [ref=e67]
            - generic "טור מאות" [ref=e68]:
              - generic [ref=e70]: מאות
              - group "אזור גרירה — מאות" [ref=e72]
          - generic "ערך כולל" [ref=e73]:
            - generic [ref=e74]:
              - generic [ref=e75]: בניתי את
              - generic [ref=e76]: "1"
        - toolbar "מחסן הכלים — גרור לטבלה" [ref=e77]:
          - generic [ref=e78]:
            - text: 🧰
            - text: ארגז כלים
          - generic [ref=e80]:
            - button "יחידה" [active] [ref=e82]:
              - img [ref=e84]
            - generic [ref=e88]: יחידה (1)
            - generic [ref=e89]: גרור יחידות לטבלה — ערך 1
          - generic [ref=e90]:
            - button "עשרת — ניתן לפרוט ליחידות או להמיר למאה" [ref=e92]:
              - img [ref=e94]
            - generic [ref=e107]: עשרת (10)
            - generic [ref=e108]: גרור עשרות לטבלה — ערך 10
          - generic [ref=e109]:
            - button "מאה — ניתן לפרוט לעשרות או להמיר לאלף" [ref=e111]:
              - img [ref=e113]
            - generic [ref=e135]: מאה (100)
            - generic [ref=e136]: גרור מאות לטבלה — ערך 100
          - button "גרור לכאן כדי למחוק" [ref=e138] [cursor=pointer]:
            - img [ref=e139]
  - status [ref=e142]: Draggable item palette-units was dropped over droppable area column-units
```