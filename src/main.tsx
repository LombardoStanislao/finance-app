import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'
import { PrivacyProvider } from './context/PrivacyContext'
import { ErrorBoundary } from './ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <PrivacyProvider>
          <App />
        </PrivacyProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
