# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: silent-radar.spec.ts >> Silent Radar >> undo counts are recorded correctly in the workspace store
- Location: tests\e2e\silent-radar.spec.ts:4:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e7]: מ
    - generic [ref=e8]:
      - heading "מתמטיקאור ©" [level=1] [ref=e9]
      - paragraph [ref=e10]: סביבת למידה מוגברת טכנולוגיה
  - generic [ref=e12]:
    - heading "שלום! מי נכנס היום?" [level=2] [ref=e13]
    - paragraph [ref=e14]: בחר את סוג הכניסה שלך
    - generic [ref=e15]:
      - button "תלמיד" [ref=e16] [cursor=pointer]:
        - generic [ref=e17]: 🎓
        - generic [ref=e18]: תלמיד
      - button "מורה" [ref=e19] [cursor=pointer]:
        - generic [ref=e20]: 📊
        - generic [ref=e21]: מורה
      - button "מנהל מערכת" [ref=e22] [cursor=pointer]:
        - generic [ref=e23]: ⚙️
        - generic [ref=e24]: מנהל מערכת
```