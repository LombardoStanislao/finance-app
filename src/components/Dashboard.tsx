import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Wallet, PiggyBank, ArrowRight, Edit2, Trash2, Settings, ArrowRightLeft, Calendar } from 'lucide-react'
import { supabase, type Transaction, type Category, type Bucket } from '../lib/supabase'
import { formatCurrency, formatDate, cn } from '../lib/utils'
import TransactionForm from './TransactionForm'

// ... (Interface BudgetProgress resta uguale)
interface BudgetProgress {
  category: Category
  spent: number
  remaining: number
  percentage: number
}

interface DashboardProps {
  primaryColor: string
  profileUpdated: number
  onAddTransaction: () => void
  onOpenSettings: () => void
  onOpenInvestments: () => void
}

export default function Dashboard({ primaryColor, profileUpdated, onOpenSettings, onOpenInvestments }: DashboardProps) {
  const [netWorth, setNetWorth] = useState<number>(0)
  const [liquidity, setLiquidity] = useState<number>(0)
  const [investmentsTotal, setInvestmentsTotal] = useState<number>(0)
  const [monthIncome, setMonthIncome] = useState<number>(0)
  const [monthExpenses, setMonthExpenses] = useState<number>(0)
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [budgetProgress, setBudgetProgress] = useState<BudgetProgress[]>([])
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [categories, setCategories] = useState<Category[]>([]) 
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState<string>('')
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)

  useEffect(() => {
    loadUser()
    fetchData()
  }, [profileUpdated])

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    const name = user?.user_metadata?.display_name
    setDisplayName(name || user?.email?.split('@')[0] || 'Utente')
  }

  async function fetchData() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // 1. Fetch Dati (Categorie, Transazioni, Buckets, Investimenti)
      const [catRes, transRes, buckRes, invRes] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('buckets').select('*').eq('user_id', user.id),
        supabase.from('investments').select('*').eq('user_id', user.id)
      ])

      const categoriesList = catRes.data || []
      const transactions = transRes.data || []
      const bucketsList = buckRes.data || []
      const investmentsList = invRes.data || []

      setCategories(categoriesList)
      setBuckets(bucketsList)
      setRecentTransactions(transactions.slice(0, 5))

      // 2. CALCOLO LIQUIDITÀ (Semplificato e Robusto)
      // La liquidità è semplicemente la somma algebrica di TUTTE le transazioni
      // Perché il form ora gestisce correttamente i segni (+ per entrate/prelievi, - per uscite/versamenti)
      const totalLiquidity = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
      setLiquidity(totalLiquidity)

      // 3. Totali Buckets e Investimenti
      const totalBuckets = bucketsList.reduce((sum, b) => sum + (b.current_balance || 0), 0)
      const totalInvestments = investmentsList.reduce((sum, i) => sum + (i.current_value || 0), 0)
      setInvestmentsTotal(totalInvestments)

      // 4. Patrimonio Totale
      setNetWorth(totalLiquidity + totalBuckets + totalInvestments)

      // 5. Statistiche Mese Corrente
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

      let mIncome = 0
      let mExpenses = 0

      transactions.forEach(t => {
        const d = new Date(t.date).toISOString()
        if (d >= monthStart && d <= monthEnd) {
            const val = Number(t.amount) || 0
            if (t.type === 'income') mIncome += val
            else if (t.type === 'expense') mExpenses += val
        }
      })
      setMonthIncome(mIncome)
      setMonthExpenses(mExpenses)

      // 6. Calcolo Budget
      const categoriesWithBudget = categoriesList.filter(c => c.budget_limit && c.budget_limit > 0)
      const budgetsData: BudgetProgress[] = []

      if (categoriesWithBudget.length > 0) {
        const expensesByCat = new Map<string, number>()
        transactions.forEach(t => {
            const d = new Date(t.date).toISOString()
            if (t.type === 'expense' && t.category_id && d >= monthStart && d <= monthEnd) {
                const current = expensesByCat.get(t.category_id) || 0
                expensesByCat.set(t.category_id, current + Math.abs(Number(t.amount)))
            }
        })

        categoriesWithBudget.forEach(c => {
            const spent = expensesByCat.get(c.id) || 0
            const limit = Number(c.budget_limit) || 0
            budgetsData.push({
                category: c,
                spent,
                remaining: limit - spent,
                percentage: (spent / limit) * 100
            })
        })
        budgetsData.sort((a, b) => b.percentage - a.percentage)
      }
      setBudgetProgress(budgetsData)

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // ... (handleDeleteTransaction, getCategoryName, getHexColor rimangono uguali)
  // ... (Assicurati di includere il resto del componente come return)
  
  // (Per brevità ometto le funzioni helper ripetitive se le hai già, ma nel dubbio copia quelle del messaggio precedente)
  async function handleDeleteTransaction(transaction: Transaction, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Eliminare?')) return
    const { error } = await supabase.from('transactions').delete().eq('id', transaction.id)
    if (!error) fetchData()
  }

  function getCategoryName(id: string) { return categories.find(c => c.id === id)?.name || 'Sconosciuta' }
  function getHexColor(c: string) { return c.startsWith('#') ? c : '#3b82f6' } // Semplificato

  if (loading) return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 px-4 py-4 flex items-center justify-between shadow-sm">
        <div>
           <p className="text-xs text-gray-400 font-medium mb-0.5">Bentornato,</p>
           <h1 className="text-xl font-bold text-gray-900 leading-none">{displayName}</h1>
        </div>
        <button onClick={onOpenSettings} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100">
            <Settings className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        
        {/* HERO CARD PATRIMONIO */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 shadow-lg shadow-blue-200 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2 opacity-90">
                    <Wallet className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Patrimonio Totale</span>
                </div>
                <p className="text-4xl font-bold tracking-tight mb-6">{formatCurrency(netWorth)}</p>
                
                <div className="flex gap-3">
                    <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                        <div className="flex items-center gap-1.5 mb-1 text-blue-100">
                             <PiggyBank className="w-3.5 h-3.5" />
                             <span className="text-[10px] font-bold uppercase">Liquidità</span>
                        </div>
                        <p className="font-semibold text-lg">{formatCurrency(liquidity)}</p>
                    </div>
                    <button onClick={onOpenInvestments} className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-left">
                        <div className="flex items-center gap-1.5 mb-1 text-indigo-100">
                             <TrendingUp className="w-3.5 h-3.5" />
                             <span className="text-[10px] font-bold uppercase">Investimenti</span>
                        </div>
                        <p className="font-semibold text-lg">{formatCurrency(investmentsTotal)}</p>
                    </button>
                </div>
            </div>
        </div>

        {/* FLUSSO DEL MESE */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
               <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase mb-0.5">Entrate Mese</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(monthIncome)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center mb-3">
               <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase mb-0.5">Uscite Mese</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(monthExpenses)}</p>
          </div>
        </div>

        {/* BUDGET PROGRESS */}
        {budgetProgress.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 px-1">Budget Attivi</h2>
            <div className="space-y-3">
              {budgetProgress.map((budget) => {
                const isOver = budget.spent > Number(budget.category.budget_limit)
                const color = isOver ? 'bg-rose-500' : 'bg-emerald-500'
                return (
                  <div key={budget.category.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-end mb-2">
                        <p className="font-bold text-gray-900">{budget.category.name}</p>
                        <p className="text-xs text-gray-400">{formatCurrency(budget.remaining)} rimanenti</p>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(budget.percentage, 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TRANSAZIONI RECENTI (Stile identico a Transactions.tsx) */}
        <div>
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 px-1">Attività Recente</h2>
          <div className="space-y-3">
            {recentTransactions.map((t) => (
                <div key={t.id} onClick={() => { setEditingTransaction(t); setIsTransactionFormOpen(true) }} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between active:scale-[0.99] transition-transform cursor-pointer">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1", t.type === 'income' ? "bg-emerald-50 text-emerald-600" : t.type === 'transfer' ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-600")}>
                        {t.type === 'income' ? <TrendingUp className="w-5 h-5" /> : t.type === 'transfer' ? <ArrowRightLeft className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 leading-tight break-words">{t.description || (t.type === 'transfer' ? 'Trasferimento' : getCategoryName(t.category_id || ''))}</h3>
                      </div>
                      <p className="text-xs text-gray-400">{formatDate(t.date)}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                    <span className={cn("font-bold text-base whitespace-nowrap", t.type === 'income' ? "text-emerald-600" : t.type === 'transfer' ? "text-gray-600" : "text-rose-600")}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''} {formatCurrency(Math.abs(t.amount))}
                    </span>
                    <button onClick={(e) => handleDeleteTransaction(t, e)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
            ))}
          </div>
        </div>
      </div>

      <TransactionForm isOpen={isTransactionFormOpen} onClose={() => { setIsTransactionFormOpen(false); setEditingTransaction(null) }} onSuccess={fetchData} primaryColor={primaryColor} editingTransaction={editingTransaction} />
    </div>
  )
}