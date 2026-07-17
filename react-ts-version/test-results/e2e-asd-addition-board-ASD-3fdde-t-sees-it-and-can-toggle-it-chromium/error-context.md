# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\asd-addition-board.spec.ts >> ASD Addition Board E2E >> Teacher toggles ASD Addition Board, student sees it and can toggle it
- Location: tests\e2e\asd-addition-board.spec.ts:7:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - main [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e8]: מ
        - generic [ref=e9]:
          - heading "מתמטיקאור ©" [level=1] [ref=e10]
          - paragraph [ref=e11]: סביבת למידה מוגברת טכנולוגיה
      - generic [ref=e13]:
        - heading "שלום! מי נכנס היום?" [level=2] [ref=e14]
        - paragraph [ref=e15]: בחר את סוג הכניסה שלך
        - generic [ref=e16]:
          - button "תלמיד" [ref=e17] [cursor=pointer]:
            - generic [ref=e18]: 🎓
            - generic [ref=e19]: תלמיד
          - button "מורה" [ref=e20] [cursor=pointer]:
            - generic [ref=e21]: 📊
            - generic [ref=e22]: מורה
          - button "מנהל מערכת" [ref=e23] [cursor=pointer]:
            - generic [ref=e24]: ⚙️
            - generic [ref=e25]: מנהל מערכת
  - complementary [ref=e26]:
    - generic [ref=e27]:
      - generic [ref=e29]: 🚀
      - generic [ref=e30]:
        - heading "מתמטיקה, בקצב שלך." [level=2] [ref=e31]:
          - text: מתמטיקה,
          - text: בקצב שלך.
        - paragraph [ref=e32]: סביבת הלמידה שמזהה איך אתה חושב, ומתאימה את עצמה בדיוק אליך.
```