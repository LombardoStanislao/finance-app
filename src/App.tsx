/// <reference types="vite-plugin-pwa/client" />
import { useEffect, useState } from 'react'
import { KeyRound, Lock, Eye, EyeOff } from 'lucide-react'
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
import RecurringEvaluator from './components/RecurringEvaluator'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './context/AuthContext'
import { useRegisterSW } from 'virtual:pwa-register/react'
import './App.css'

type View = 'dashboard' | 'settings' | 'transactions' | 'buckets' | 'statistics' | 'investments' | 'guide'

function App() {
  const { session, loading } = useAuth()
  const [currentView, setCurrentView] = useState<View>('dashboard')

  // Default iniziale (Blu) finché non carichiamo il profilo
  const [primaryColor, setPrimaryColor] = useState<string>('#2563eb')

  const [profileUpdated, setProfileUpdated] = useState(0)
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(_r: any) { console.log('SW Registered') },
    onRegisterError(error: any) { console.log('SW registration error', error) },
  })

  useEffect(() => {
    if (session?.user?.id) {
      loadUserTheme(session.user.id)
    }
  }, [session?.user?.id])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true)
      }
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

  async function handleUpdateRecoveryPassword(e: React.FormEvent) {
    e.preventDefault()
    setRecoveryLoading(true)
    setRecoveryError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setIsRecoveryMode(false)
      alert("Password aggiornata con successo! Ora puoi navigare in sicurezza.")
    } catch (err: any) {
      setRecoveryError(err.message || 'Errore durante l\'aggiornamento della password.')
    } finally {
      setRecoveryLoading(false)
    }
  }

  return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Toaster position="top-center" toastOptions={{ duration: 4000, style: { background: '#333', color: '#fff', borderRadius: '12px' } }} />
        <RecurringEvaluator session={session} />
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

        {/* RECOVERY MODAL */}
        {isRecoveryMode && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-100 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
              
              <div className="mx-auto w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <KeyRound className="w-6 h-6 text-blue-600" />
              </div>
              
              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Reimposta Password</h2>
              <p className="text-xs text-gray-500 text-center mb-6">Scegli una nuova password sicura per il tuo account.</p>

              {recoveryError && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs font-medium rounded-xl border border-red-100">
                  {recoveryError}
                </div>
              )}

              <form onSubmit={handleUpdateRecoveryPassword} className="space-y-4">
                <div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="block w-full pl-10 pr-10 py-3 bg-gray-50 border-transparent text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl transition-all outline-none text-sm font-medium"
                      placeholder="Nuova password..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {recoveryLoading ? 'Aggiornamento...' : 'Salva Nuova Password'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* PWA UPDATE PROMPT */}
        {needRefresh && (
          <div className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-[200] bg-white border border-gray-100 p-4 rounded-2xl shadow-xl flex items-center justify-between animate-in slide-in-from-bottom-5">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-900">Aggiornamento app</span>
              <span className="text-xs text-gray-500">Nuova versione disponibile.</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setNeedRefresh(false)} className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200">Ignora</button>
              <button onClick={() => updateServiceWorker(true)} className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700">Ricarica</button>
            </div>
          </div>
        )}
      </div>
  )
}

export default App