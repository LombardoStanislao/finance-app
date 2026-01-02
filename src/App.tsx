import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import Settings from './components/Settings'
import Transactions from './components/Transactions'
import BucketsPage from './components/BucketsPage'
import Statistics from './components/Statistics'
import InvestmentsPage from './components/InvestmentsPage'
import GuidePage from './components/GuidePage'
import BottomNav from './components/BottomNav'
import TransactionForm from './components/TransactionForm'
import { PrivacyProvider } from './context/PrivacyContext' // Import del Context
import './App.css'

type View = 'dashboard' | 'settings' | 'transactions' | 'buckets' | 'statistics' | 'investments' | 'guide'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState<View>('dashboard')
  
  // Default iniziale (Blu) finché non carichiamo il profilo
  const [primaryColor, setPrimaryColor] = useState<string>('#2563eb')
  
  const [profileUpdated, setProfileUpdated] = useState(0)
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false)

  useEffect(() => {
    // 1. Controlla sessione
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadUserTheme(session.user.id)
      setLoading(false)
    })

    // 2. Ascolta cambi auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadUserTheme(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadUserTheme(userId: string) {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('theme_color')
            .eq('id', userId)
            .maybeSingle()
        
        if (data?.theme_color) {
            setPrimaryColor(data.theme_color)
        }
    } catch (error) {
        console.error("Errore caricamento tema:", error)
    }
  }

  // Questa funzione aggiorna lo stato locale immediatamente per feedback visivo rapido
  // (Il salvataggio vero su DB lo fa Settings.tsx)
  function handleColorChange(color: string) {
    setPrimaryColor(color)
  }

  function handleProfileUpdate() {
    setProfileUpdated(prev => prev + 1)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    )
  }

  if (!session) {
    return <Auth />
  }

  function handleNavigate(view: View) {
    setCurrentView(view)
  }

  function handleAddTransaction() {
    setIsTransactionFormOpen(true)
  }

  return (
    <PrivacyProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <main className="flex-1 pb-20">
          
          {currentView === 'guide' && (
            <GuidePage 
              onBack={() => setCurrentView('dashboard')}
              primaryColor={primaryColor}
            />
          )}

          {currentView === 'settings' && (
            <Settings
              onBack={() => setCurrentView('dashboard')}
              onProfileUpdate={handleProfileUpdate}
              primaryColor={primaryColor}
              onColorChange={handleColorChange}
            />
          )}
          {currentView === 'transactions' && (
            <Transactions
              onBack={() => setCurrentView('dashboard')}
              onOpenSettings={() => setCurrentView('settings')}
              primaryColor={primaryColor}
            />
          )}
          {currentView === 'buckets' && (
            <BucketsPage
              onBack={() => setCurrentView('dashboard')}
              onOpenSettings={() => setCurrentView('settings')}
              primaryColor={primaryColor}
            />
          )}
          {currentView === 'statistics' && (
            <Statistics
              onBack={() => setCurrentView('dashboard')}
              onOpenSettings={() => setCurrentView('settings')}
              primaryColor={primaryColor}
            />
          )}
          {currentView === 'investments' && (
            <InvestmentsPage
              onBack={() => setCurrentView('dashboard')}
              onOpenSettings={() => setCurrentView('settings')}
              onOpenGuide={() => setCurrentView('guide')}
              primaryColor={primaryColor}
            />
          )}
          {currentView === 'dashboard' && (
            <Dashboard
              primaryColor={primaryColor}
              profileUpdated={profileUpdated}
              onOpenSettings={() => setCurrentView('settings')}
              onOpenInvestments={() => setCurrentView('investments')}
              onOpenGuide={() => setCurrentView('guide')}
            />
          )}
        </main>

        {currentView !== 'guide' && (
          <BottomNav
              currentView={currentView === 'settings' ? 'dashboard' : currentView as any} 
              onNavigate={(view) => handleNavigate(view as View)}
              onAddTransaction={handleAddTransaction}
              primaryColor={primaryColor}
          />
        )}
        
        <TransactionForm
          isOpen={isTransactionFormOpen}
          onClose={() => setIsTransactionFormOpen(false)}
          onSuccess={() => {
            setIsTransactionFormOpen(false)
            setProfileUpdated(prev => prev + 1)
          }}
          primaryColor={primaryColor}
        />
      </div>
    </PrivacyProvider>
  )
}

export default App