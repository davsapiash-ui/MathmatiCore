import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/presentation/components/ErrorBoundary'
import '@/infrastructure/services/FirebaseSyncService'
import { curriculumCatalog } from '@/infrastructure/services/CurriculumCatalogService'
import { fetchServerClockOffset } from '@/infrastructure/firebase'
import { deviceCopiesReady } from '@/infrastructure/services/deviceCopyStore'

// PRD v7.1 Modules 4/26: load the curriculum catalog (IndexedDB cache first,
// Firestore refresh in background; hardcoded banks remain the offline fallback).
curriculumCatalog.init().catch(() => {})

// מודול 14 §ד: השרת הוא סמכות הזמן. כל חותמת שמכריעה אם מפגש פתוח נכתבה
// במכשיר אחר, ולכן ההפרש מול שעון השרת נמדד פעם אחת בעליית האפליקציה —
// אצל הלומד, אצל המורה ואצל המנהל כאחד. בלי זה, טאבלט עם שעון שסוטה
// בחצי שעה סוגר לעצמו מפגש שעדיין רץ.
fetchServerClockOffset().catch(() => {})

// This device's copies of the learner's workspace live in IndexedDB (PRD
// Modules 4, 8, 17; deviceCopyStore.ts). The restore reads them at once, so
// they are read into memory before the first render — a moment, and never
// more than 1.5 s, so a storage that does not answer cannot hold the app.
Promise.race([deviceCopiesReady, new Promise<void>((resolve) => setTimeout(resolve, 1500))]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
})
