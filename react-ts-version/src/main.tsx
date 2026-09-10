import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/presentation/components/ErrorBoundary'
import '@/infrastructure/services/FirebaseSyncService'
import { curriculumCatalog } from '@/infrastructure/services/CurriculumCatalogService'

// PRD v7.1 Modules 4/26: load the curriculum catalog (IndexedDB cache first,
// Firestore refresh in background; hardcoded banks remain the offline fallback).
curriculumCatalog.init().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
