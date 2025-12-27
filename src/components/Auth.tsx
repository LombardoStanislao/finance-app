import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { LogIn, UserPlus, Mail, Lock, Wallet, ArrowRight } from 'lucide-react'

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (isSignUp) {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        
        // Check if email confirmation is required
        if (data.user && !data.session) {
          setMessage('Controlla la tua email per confermare la registrazione!')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      }
    } catch (error: any) {
      setError(error.message || 'Si è verificato un errore')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      
      {/* Logo & Branding Section */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
        <div className="mx-auto h-20 w-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-200 rotate-3 transition-transform hover:rotate-0 mb-6">
          <Wallet className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Le Mie Finanze
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {isSignUp 
            ? 'Crea il tuo spazio finanziario personale' 
            : 'Gestisci il tuo patrimonio con semplicità'}
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-3xl sm:px-10 border border-gray-100 relative overflow-hidden">
          
          {/* Form Header */}
          <div className="mb-6 text-center">
             <h3 className="text-xl font-bold text-gray-900">
                {isSignUp ? 'Nuovo Account' : 'Bentornato'}
             </h3>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
              <div className="text-sm text-red-600 font-medium">{error}</div>
            </div>
          )}

          {message && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
              <div className="text-sm text-emerald-600 font-medium">{message}</div>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-gray-500 uppercase ml-1 mb-1.5">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border-transparent text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl transition-all outline-none font-medium"
                  placeholder="nome@esempio.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-gray-500 uppercase ml-1 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border-transparent text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl transition-all outline-none font-medium"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-2">
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-4 px-4 border border-transparent rounded-2xl shadow-lg shadow-blue-200 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                    {loading ? (
                    'Elaborazione...'
                    ) : isSignUp ? (
                    <span className="flex items-center gap-2">
                        Crea Account <UserPlus className="w-4 h-4" />
                    </span>
                    ) : (
                    <span className="flex items-center gap-2">
                        Accedi <LogIn className="w-4 h-4" />
                    </span>
                    )}
                </button>
            </div>
          </form>

          {/* Toggle View */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-400 text-xs uppercase font-medium">oppure</span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError(null)
                  setMessage(null)
                }}
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-500 transition-colors bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100"
              >
                {isSignUp
                  ? 'Hai già un account? Accedi'
                  : 'Non hai un account? Registrati'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Footer info */}
        <p className="mt-8 text-center text-xs text-gray-400">
            &copy; 2025 Personal Finance Tracker. Sicuro e Privato.
        </p>
      </div>
    </div>
  )
}