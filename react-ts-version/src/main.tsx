import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/presentation/components/ErrorBoundary'
import '@/infrastructure/services/FirebaseSyncService'
import { curriculumCatalog } from '@/infrastructure/services/CurriculumCatalogService'
import { MotionConfig } from 'framer-motion'

// PRD v7.1 Modules 4/26: load the curriculum catalog (IndexedDB cache first,
// Firestore refresh in background; hardcoded banks remain the offline fallback).
curriculumCatalog.init().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/*
        מסמך העיצוב §1.3. כלל ה-CSS ל-prefers-reduced-motion מכסה אנימציות
        CSS בלבד. framer-motion מנפיש דרך סגנון מוטבע ב-JavaScript, ולכן
        מסכי ההמתנה שרצים ב-repeat: Infinity המשיכו לפעום גם למי שביקש
        תנועה מופחתת במערכת ההפעלה. reducedMotion="user" מכבד את ההעדפה
        בכל רכיבי התנועה, ומשאיר מעברי שקיפות שאינם מטלטלים.
      */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
