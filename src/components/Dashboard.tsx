import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Trash2, Settings, ArrowRightLeft, BookOpen, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase, type Transaction, type Category } from '../lib/supabase'
import { formatDate, cn, calculateLiquidity, roundCurrency } from '../lib/utils'
import TransactionForm from './TransactionForm'
import { ErrorBoundary } from '../ErrorBoundary'
import { usePrivacy } from '../context/PrivacyContext'
import { useAuth } from '../context/AuthContext'

// Hook per i contatori animati
function useCountUp(end: number, duration: number = 1200) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let startTimestamp: number | null = null
    let animationFrameId: number
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      const easeProgress = 1 - Math.pow(1 - progress, 4) // easeOutQuart
      setCount(end * easeProgress)
      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step)
      }
    }
    animationFrameId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [end, duration])
  return count
}

interface BudgetProgress {
  category: Category
  spent: number
  remaining: number
  percentage: number
}

interface DashboardProps {
  primaryColor: string
  profileUpdated: number
  onOpenSettings: () => void
  onOpenInvestments: () => void
  onOpenGuide: () => void
}

export default function Dashboard({ primaryColor, profileUpdated, onOpenSettings, onOpenInvestments, onOpenGuide }: DashboardProps) {
  const [netWorth, setNetWorth] = useState<number>(0)
  const [liquidity, setLiquidity] = useState<number>(0)
  const [investmentsTotal, setInvestmentsTotal] = useState<number>(0)
  const [monthIncome, setMonthIncome] = useState<number>(0)
  const [monthExpenses, setMonthExpenses] = useState<number>(0)
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [budgetProgress, setBudgetProgress] = useState<BudgetProgress[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState<string>('')
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)

  // HOOK PRIVACY E AUTH
  const { isPrivacyEnabled, togglePrivacy, hide } = usePrivacy()
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
        const name = user?.user_metadata?.display_name
        setDisplayName(name || user?.email?.split('@')[0] || 'Utente')
        fetchData()
    }
  }, [user, profileUpdated])

  async function fetchData() {
    try {
      setLoading(true)
      if (!user) { setLoading(false); return }

      // 1. Fetch Dati
      const [catRes, transRes, invRes] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('investments').select('*').eq('user_id', user.id)
      ])

      const categoriesList = catRes.data || []
      const transactions = transRes.data || []
      const investmentsList = invRes.data || []

      setCategories(categoriesList)

      // FILTRO LISTA
      const filteredRecent = transactions.filter(t =>
        !t.description?.startsWith('Distribuzione automatica')
      )
      setRecentTransactions(filteredRecent.slice(0, 5))

      // 2. Calcoli Liquidità
      const totalLiquidity = calculateLiquidity(transactions)
      setLiquidity(totalLiquidity)

      // 3. Totali Patrimonio
      // I buckets (salvadanai) sono liquidità accantonata, NON patrimonio aggiuntivo.
      // Non vanno sommati al netWorth per evitare doppio conteggio.
      const totalInvestments = investmentsList.reduce((sum, i) => sum + (i.current_value || 0), 0)
      setInvestmentsTotal(totalInvestments)
      setNetWorth(roundCurrency(totalLiquidity + totalInvestments))

      // 4. Mese Corrente
      const now = new Date()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const y = now.getFullYear()
      const maxDays = new Date(y, now.getMonth() + 1, 0).getDate()
      const monthStart = new Date(`${y}-${m}-01T00:00:00.000Z`).getTime()
      const monthEnd = new Date(`${y}-${m}-${String(maxDays).padStart(2, '0')}T23:59:59.999Z`).getTime()

      let mIncome = 0
      let mExpenses = 0

      transactions.forEach(t => {
        const d = new Date(t.date).getTime()
        if (d >= monthStart && d <= monthEnd) {
          const val = Number(t.amount) || 0
          if (t.type === 'income') mIncome += val
          else if (t.type === 'expense') mExpenses += Math.abs(val)
        }
      })
      setMonthIncome(mIncome)
      setMonthExpenses(mExpenses)

      // 5. Calcolo Budget
      const categoriesWithBudget = categoriesList.filter(c => c.budget_limit && c.budget_limit > 0)
      const budgetsData: BudgetProgress[] = []

      if (categoriesWithBudget.length > 0) {
        const expensesByCat = new Map<string, number>()
        transactions.forEach(t => {
          const d = new Date(t.date).getTime()
          const isTradingPL = t.description?.includes('Trading P&L')

          if (t.type === 'expense' && t.category_id && d >= monthStart && d <= monthEnd && !isTradingPL) {
            const current = expensesByCat.get(t.category_id) || 0
            expensesByCat.set(t.category_id, current + Math.abs(Number(t.amount)))
          }
        })

        categoriesWithBudget.forEach(c => {
          let spent = expensesByCat.get(c.id) || 0
          const children = categoriesList.filter(cat => cat.parent_id === c.id)
          children.forEach(child => {
            spent += (expensesByCat.get(child.id) || 0)
          })

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

  // --- LOGICA DI ROLLBACK & PROTEZIONE ---
  async function handleDeleteTransaction(transaction: Transaction, e: React.MouseEvent) {
    e.stopPropagation()

    // 1. BLOCCO SICUREZZA P.IVA
    if (transaction.type === 'transfer' && transaction.bucket_id) {
      const { data: bucketCheck } = await supabase
        .from('buckets')
        .select('name')
        .eq('id', transaction.bucket_id)
        .single()

      if (bucketCheck && ['Aliquota INPS', 'Aliquota Imposta Sostitutiva'].includes(bucketCheck.name)) {
        toast.error("Non puoi eliminare manualmente un singolo accantonamento fiscale.\n\nPer annullare questa operazione, devi eliminare la transazione di Entrata (Fattura) originale che l'ha generato.", { duration: 6000 })
        return
      }
    }

    if (!window.confirm('Eliminare questa transazione? L\'operazione annullerà anche eventuali movimenti collegati.')) return

    try {
      if (!user) return

      // 2. GESTIONE INVESTIMENTO (Atomic Group Delete)
      if (transaction.investment_id) {
        const { data: investment } = await supabase
          .from('investments')
          .select('*')
          .eq('id', transaction.investment_id)
          .single()

        if (investment) {
          const txTime = new Date(transaction.created_at || transaction.date).getTime()
          const timeStart = new Date(txTime - 2000).toISOString()
          const timeEnd = new Date(txTime + 2000).toISOString()

          const { data: siblings } = await supabase.from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .eq('investment_id', investment.id)
            .gte('created_at', timeStart)
            .lte('created_at', timeEnd)

          if (siblings && siblings.length > 0) {
            let totalQtyToRevert = 0
            let totalInvestedToRevert = 0

            for (const sib of siblings) {
                if (sib.type === 'transfer') totalInvestedToRevert += sib.amount
                if ((sib as any).asset_quantity) totalQtyToRevert += (sib as any).asset_quantity
                await supabase.from('transactions').delete().eq('id', sib.id) 
            }

            const currentQty = investment.quantity || 0
            const currentInvested = investment.invested_amount || 0
            const newQty = Math.max(0, currentQty - totalQtyToRevert)
            const newInvested = Math.max(0, currentInvested + totalInvestedToRevert)
            
            let newCurrentValue = 0
            if (currentQty > 0) {
                const pricePerShare = investment.current_value / currentQty
                newCurrentValue = (Math.round((pricePerShare * newQty) * 100) / 100)
            } else if (newQty > 0) {
                newCurrentValue = newInvested
            }

            await supabase.from('investments').update({
                quantity: newQty,
                invested_amount: newInvested,
                current_value: newCurrentValue
            }).eq('id', investment.id)

            fetchData()
            return
          }
        }
      }

      // 3. CASO ENTRATA (Distribuzioni automatiche & Tasse P.IVA)
      if (transaction.type === 'income') {
        const txTime = new Date(transaction.created_at || transaction.date).getTime()
        const timeStart = new Date(txTime - 5000).toISOString()
        const timeEnd = new Date(txTime + 5000).toISOString()

        // A. Rollback Distribuzioni Automatiche (Risparmi)
        const { data: children } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('type', 'transfer')
          .ilike('description', 'Distribuzione automatica%')
          .gte('created_at', timeStart)
          .lte('created_at', timeEnd)

        if (children && children.length > 0) {
          for (const child of children) {
            if (child.bucket_id) {
              const { data: bucket } = await supabase.from('buckets').select('current_balance').eq('id', child.bucket_id).single()
              if (bucket) {
                const newBalance = roundCurrency(Math.max(0, (bucket.current_balance || 0) - Math.abs(child.amount)))
                await supabase.from('buckets').update({ current_balance: newBalance }).eq('id', child.bucket_id).eq('user_id', user.id)
              }
            }
            await supabase.from('transactions').delete().eq('id', child.id).eq('user_id', user.id)
          }
        }

        // B. Rollback Accantonamenti Tasse (P.IVA)
        const { data: taxChildren } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('type', 'transfer')
          .ilike('description', 'Accantonamento % (Fattura)')
          .gte('created_at', timeStart)
          .lte('created_at', timeEnd)

        if (taxChildren && taxChildren.length > 0) {
          for (const child of taxChildren) {
            if (child.bucket_id) {
              const { data: bucket } = await supabase.from('buckets').select('current_balance').eq('id', child.bucket_id).single()
              if (bucket) {
                const newBalance = roundCurrency(Math.max(0, (bucket.current_balance || 0) - Math.abs(child.amount)))
                await supabase.from('buckets').update({ current_balance: newBalance }).eq('id', child.bucket_id).eq('user_id', user.id)
              }
            }
            await supabase.from('transactions').delete().eq('id', child.id).eq('user_id', user.id)
          }
        }
      }

      // 4. CASO USCITA/TRANSFER (Da e Verso BUCKET: Restituzione o Rimozione fondi)
      else if ((transaction.type === 'expense' || transaction.type === 'transfer') && transaction.bucket_id) {

        // A. Rollback Moti Fratelli (Giroconto)
        if (transaction.type === 'transfer') {
          const txTime = new Date(transaction.created_at || transaction.date).getTime()
          const timeStart = new Date(txTime - 2000).toISOString()
          const timeEnd = new Date(txTime + 2000).toISOString()

          const { data: siblings } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .eq('type', 'transfer')
            .gte('created_at', timeStart)
            .lte('created_at', timeEnd)
            .neq('id', transaction.id)

          if (siblings && siblings.length > 0) {
            for (const sib of siblings) {
              if (sib.bucket_id) {
                const { data: sibB } = await supabase.from('buckets').select('current_balance').eq('id', sib.bucket_id).eq('user_id', user.id).single()
                if (sibB) {
                  const nBalance = roundCurrency((sibB.current_balance || 0) + (sib.amount < 0 ? -Math.abs(sib.amount) : Math.abs(sib.amount)))
                  await supabase.from('buckets').update({ current_balance: Math.max(0, nBalance) }).eq('id', sib.bucket_id).eq('user_id', user.id)
                }
              }
              await supabase.from('transactions').delete().eq('id', sib.id).eq('user_id', user.id)
            }
          }
        }

        // B. Rollback Transazione Principale
        const { data: bucket } = await supabase
          .from('buckets')
          .select('current_balance')
          .eq('id', transaction.bucket_id)
          .eq('user_id', user.id)
          .single()

        if (bucket) {
          const amountAbs = Math.abs(transaction.amount)
          let newBalance = bucket.current_balance || 0

          if (transaction.type === 'expense') {
            newBalance += amountAbs
          } else if (transaction.type === 'transfer') {
            if (transaction.amount < 0) {
              newBalance -= amountAbs
            } else {
              newBalance += amountAbs
            }
          }

          await supabase
            .from('buckets')
            .update({ current_balance: Math.max(0, roundCurrency(newBalance)) })
            .eq('id', transaction.bucket_id)
            .eq('user_id', user.id)
        }
      }

      // Elimina transazione principale
      const { error: mainError } = await supabase.from('transactions').delete().eq('id', transaction.id).eq('user_id', user.id)
      if (mainError) throw mainError

      fetchData()
    } catch (error: any) {
      console.error('Error deleting transaction:', error)
      toast.error('Errore durante l\'eliminazione')
    }
  }

  function getCategoryName(id: string) { return categories.find(c => c.id === id)?.name || 'Sconosciuta' }

  const animatedNetWorth = useCountUp(netWorth)
  const animatedLiquidity = useCountUp(liquidity)
  const animatedInvestments = useCountUp(investmentsTotal)
  const animatedIncome = useCountUp(monthIncome, 1000)
  const animatedExpenses = useCountUp(monthExpenses, 1000)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-4 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="space-y-1">
          <div className="w-20 h-3 bg-gray-100 rounded-full animate-pulse" />
          <div className="w-32 h-6 bg-gray-200 rounded-full animate-pulse" />
        </div>
        <div className="w-10 h-10 bg-gray-100 rounded-full animate-pulse" />
      </div>
      <div className="max-w-md mx-auto p-4 space-y-6">
        <div className="w-full h-48 bg-gray-100 rounded-3xl animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 px-4 py-4 flex items-center justify-between shadow-sm pt-safe">
        <div>
          <p className="text-xs text-gray-400 font-medium mb-0.5">Bentornato,</p>
          <h1 className="text-xl font-bold text-gray-900 leading-none">{displayName}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={togglePrivacy} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100 transition-transform active:scale-95">
            {isPrivacyEnabled ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
          <button onClick={onOpenGuide} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-blue-600 border border-gray-100 transition-transform active:scale-95"><BookOpen className="w-5 h-5" /></button>
          <button onClick={onOpenSettings} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100 transition-transform active:scale-95"><Settings className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        <div
          className="rounded-3xl p-6 shadow-lg text-white relative overflow-hidden transition-colors duration-300"
          style={{ backgroundColor: primaryColor, boxShadow: `0 20px 25px -5px ${primaryColor}40` }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/10 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2 opacity-90">
              <Wallet className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Patrimonio Totale</span>
            </div>
            <p className="text-4xl font-black tracking-tight mb-6">{hide(animatedNetWorth)}</p>
            <div className="flex gap-3">
              <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <div className="flex items-center gap-1.5 mb-1 text-white/90">
                  <PiggyBank className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase">Liquidità</span>
                </div>
                <p className="font-semibold text-lg">{hide(animatedLiquidity)}</p>
              </div>
              <button onClick={onOpenInvestments} className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-left hover:bg-white/20 transition-colors">
                <div className="flex items-center gap-1.5 mb-1 text-white/90">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase">Investimenti</span>
                </div>
                <p className="font-semibold text-lg">{hide(animatedInvestments)}</p>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase mb-0.5">Entrate Mese</p>
            <p className="text-lg font-black text-gray-900">{hide(animatedIncome)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center mb-3">
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase mb-0.5">Uscite Mese</p>
            <p className="text-lg font-black text-gray-900">{hide(animatedExpenses)}</p>
          </div>
        </div>

        {budgetProgress.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Stato Budget</h2>
              <button onClick={onOpenSettings} className="text-xs font-bold text-blue-600">Gestisci</button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 hide-scrollbar snap-x">
              {budgetProgress.map((budget) => {
                const isOver = budget.spent > Number(budget.category.budget_limit)
                const isWarning = !isOver && budget.percentage > 80
                const barColor = isOver ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-blue-500'
                
                return (
                  <div key={budget.category.id} className="min-w-[200px] bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col snap-start">
                    <div className="flex justify-between items-start mb-3">
                      <p className="font-bold text-gray-900 text-sm truncate pr-2">{budget.category.name}</p>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", isOver ? "bg-rose-100 text-rose-600" : "bg-gray-100 text-gray-500")}>
                        {Math.round(budget.percentage)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-1000", barColor)} style={{ width: `${Math.min(budget.percentage, 100)}%` }} />
                    </div>
                    <div className="flex justify-between items-end mt-auto">
                      <span className={cn("font-bold text-sm", isOver ? "text-rose-600" : "text-gray-900")}>{hide(budget.spent)}</span>
                      <span className="text-[10px] text-gray-400 font-bold uppercase">/ {hide(Number(budget.category.budget_limit))}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 px-1">Attività Recente</h2>
          <div className="space-y-3">
            {recentTransactions.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-2xl border border-dashed border-gray-100">
                Nessuna attività recente
              </div>
            ) : (
              recentTransactions.map((t) => (
                <div key={t.id} onClick={() => { setEditingTransaction(t); setIsTransactionFormOpen(true) }} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between active:scale-[0.99] transition-transform cursor-pointer">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1", t.type === 'income' ? "bg-emerald-50 text-emerald-600" : t.type === 'transfer' ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-600")}>
                      {t.type === 'income' ? <TrendingUp className="w-5 h-5" /> : t.type === 'transfer' ? <ArrowRightLeft className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 leading-tight break-words">{t.description || (t.type === 'transfer' ? 'Trasferimento' : getCategoryName(t.category_id || ''))}</h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400 font-medium">
                        <span>{formatDate(t.date)}</span>
                        {t.category_id && t.type !== 'transfer' && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="truncate max-w-[150px] text-gray-500">{getCategoryName(t.category_id)}</span>
                          </>
                        )}
                        {t.investment_id && (
                          <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold">INV</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                    <span className={cn("font-bold text-base whitespace-nowrap", t.type === 'income' ? "text-emerald-600" : t.type === 'transfer' ? "text-gray-600" : "text-rose-600")}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''} {hide(Math.abs(t.amount))}
                    </span>
                    <button onClick={(e) => handleDeleteTransaction(t, e)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ErrorBoundary>
        <TransactionForm isOpen={isTransactionFormOpen} onClose={() => { setIsTransactionFormOpen(false); setEditingTransaction(null) }} onSuccess={fetchData} primaryColor={primaryColor} editingTransaction={editingTransaction} />
      </ErrorBoundary>
    </div>
  )
}