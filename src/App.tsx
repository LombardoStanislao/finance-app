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
import BottomNav from './components/BottomNav'
import TransactionForm from './components/TransactionForm'
import './App.css'

type View = 'dashboard' | 'settings' | 'transactions' | 'buckets' | 'statistics' | 'investments'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [primaryColor, setPrimaryColor] = useState<string>('blue')
  const [profileUpdated, setProfileUpdated] = useState(0)
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false)

  useEffect(() => {
    // Load primary color from localStorage
    const savedColor = localStorage.getItem('primaryColor')
    if (savedColor) {
      // Accept both HEX colors and preset names
      setPrimaryColor(savedColor)
    } else {
      // Default to blue if nothing is saved
      setPrimaryColor('blue')
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Main Content Area */}
      <main className="flex-1 pb-20">
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
            primaryColor={primaryColor}
          />
        )}
        {currentView === 'dashboard' && (
          <Dashboard
            primaryColor={primaryColor}
            profileUpdated={profileUpdated}
            onAddTransaction={handleAddTransaction}
            onOpenSettings={() => setCurrentView('settings')}
            onOpenInvestments={() => setCurrentView('investments')}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        currentView={currentView}
        onNavigate={handleNavigate}
        onAddTransaction={handleAddTransaction}
        primaryColor={primaryColor}
      />
      
      {/* Global Transaction Form Modal - Shared across all pages */}
      <TransactionForm
        isOpen={isTransactionFormOpen}
        onClose={() => setIsTransactionFormOpen(false)}
        onSuccess={() => {
          setIsTransactionFormOpen(false)
          // Force re-render to refresh data
          setProfileUpdated(prev => prev + 1)
        }}
        primaryColor={primaryColor}
      />
    </div>
  )
}

export default App
