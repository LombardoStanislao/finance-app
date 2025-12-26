import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Wallet, PiggyBank, TrendingUp as TrendingUpIcon, ArrowRight, Edit2, Trash2, Settings } from 'lucide-react'
import { supabase, type Transaction, type Category, type Bucket, type Investment } from '../lib/supabase'
import { formatCurrency, formatDate, cn } from '../lib/utils'
import TransactionForm from './TransactionForm'

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
}

export default function Dashboard({ primaryColor, profileUpdated, onAddTransaction, onOpenSettings }: DashboardProps) {
  const [netWorth, setNetWorth] = useState<number>(0)
  const [liquidity, setLiquidity] = useState<number>(0)
  const [investmentsTotal, setInvestmentsTotal] = useState<number>(0)
  const [monthIncome, setMonthIncome] = useState<number>(0)
  const [monthExpenses, setMonthExpenses] = useState<number>(0)
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [budgetProgress, setBudgetProgress] = useState<BudgetProgress[]>([])
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState<string>('')
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)

  useEffect(() => {
    loadUser()
    fetchData()
  }, [profileUpdated])

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    
    // Get display name from metadata
    const name = user?.user_metadata?.display_name
    setDisplayName(name || user?.email?.split('@')[0] || 'Utente')
  }

  async function fetchData() {
    try {
      setLoading(true)
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) throw userError
      if (!user) {
        console.error('No user found')
        setLoading(false)
        return
      }

      // Fetch ALL transactions for the current user, ordered by date (newest first) and created_at (newest first)
      const { data: transactions, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (transactionsError) {
        console.error('Error fetching transactions:', transactionsError)
        throw transactionsError
      }

      console.log('Fetched transactions:', transactions)

      // Calculate totals from ALL transactions
      let totalIncome = 0
      let totalExpenses = 0
      let totalTransfersFromUnassigned = 0 // Sum of transfer amounts where bucket_id is NULL (from unassigned liquidity)

      if (transactions && transactions.length > 0) {
        transactions.forEach((transaction) => {
          const amount = Number(transaction.amount) || 0
          if (transaction.type === 'income') {
            totalIncome += amount
          } else if (transaction.type === 'expense') {
            totalExpenses += amount
          } else if (transaction.type === 'transfer' && !transaction.bucket_id) {
            // Only count transfers from unassigned liquidity (bucket_id is NULL)
            // Transfers are negative amounts, so they reduce liquidity
            totalTransfersFromUnassigned += amount
          }
        })
      }

      // Fetch buckets
      const { data: bucketsData, error: bucketsError } = await supabase
        .from('buckets')
        .select('*')
        .eq('user_id', user.id)

      if (bucketsError) {
        console.error('Error fetching buckets:', bucketsError)
      }

      const bucketsList = bucketsData || []
      setBuckets(bucketsList)

      // Calculate buckets total
      const bucketsTotal = bucketsList.reduce((sum, bucket) => {
        return sum + (bucket.current_balance || 0)
      }, 0)

      // Calculate unassigned liquidity
      // Includes: Income - Expenses - Transfers from unassigned (transfers are negative, so adding them reduces liquidity)
      // This represents money that hasn't been assigned to buckets
      const unassignedLiquidity = totalIncome - totalExpenses - bucketsTotal + totalTransfersFromUnassigned

      // Liquidity = Unassigned + Buckets
      const calculatedLiquidity = unassignedLiquidity + bucketsTotal
      setLiquidity(calculatedLiquidity)

      // Fetch investments
      const { data: investmentsData, error: investmentsError } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)

      if (investmentsError) {
        console.error('Error fetching investments:', investmentsError)
      }

      const investmentsList = investmentsData || []
      const investmentsSum = investmentsList.reduce((sum, inv) => {
        return sum + (inv.current_value || 0)
      }, 0)
      setInvestmentsTotal(investmentsSum)

      // Net Worth = Liquidity + Investments
      const calculatedNetWorth = calculatedLiquidity + investmentsSum
      setNetWorth(calculatedNetWorth)

      // Get current month start and end dates
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

      // Calculate current month income and expenses
      let monthIncomeTotal = 0
      let monthExpensesTotal = 0

      if (transactions && transactions.length > 0) {
        transactions.forEach((transaction) => {
          const transactionDate = new Date(transaction.date).toISOString()
          if (transactionDate >= monthStart && transactionDate <= monthEnd) {
            const amount = Number(transaction.amount) || 0
            if (transaction.type === 'income') {
              monthIncomeTotal += amount
            } else if (transaction.type === 'expense') {
              monthExpensesTotal += amount
            }
          }
        })
      }

      setMonthIncome(monthIncomeTotal)
      setMonthExpenses(monthExpensesTotal)

      // Get recent transactions (last 5)
      const recent = transactions ? transactions.slice(0, 5) : []
      setRecentTransactions(recent)

      // Fetch categories with budget limits
      const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name, budget_limit')
        .eq('user_id', user.id)
        .not('budget_limit', 'is', null)
        .gt('budget_limit', 0)

      // Calculate budget progress for each category
      const budgetProgressData: BudgetProgress[] = []

      if (!categoriesError && categories && categories.length > 0) {
        // Filter current month expenses only
        const currentMonthExpenses = transactions?.filter((transaction) => {
          if (transaction.type !== 'expense') return false
          const transactionDate = new Date(transaction.date).toISOString()
          return transactionDate >= monthStart && transactionDate <= monthEnd
        }) || []

        // Group expenses by category_id and sum amounts
        const expensesByCategory = new Map<string, number>()
        currentMonthExpenses.forEach((transaction) => {
          const categoryId = transaction.category_id
          const amount = Number(transaction.amount) || 0
          const currentTotal = expensesByCategory.get(categoryId) || 0
          expensesByCategory.set(categoryId, currentTotal + amount)
        })

        // Calculate progress for each category with budget
        categories.forEach((category) => {
          const budgetLimit = Number(category.budget_limit) || 0
          if (budgetLimit > 0) {
            const spent = expensesByCategory.get(category.id) || 0
            const remaining = Math.max(0, budgetLimit - spent)
            const percentage = budgetLimit > 0 ? (spent / budgetLimit) * 100 : 0

            budgetProgressData.push({
              category,
              spent,
              remaining,
              percentage,
            })
          }
        })

        // Sort by percentage (highest first)
        budgetProgressData.sort((a, b) => b.percentage - a.percentage)
      }

      if (categoriesError) {
        console.error('Error fetching categories:', categoriesError)
      }

      setBudgetProgress(budgetProgressData)

      console.log('Calculated values:', {
        netWorth: calculatedNetWorth,
        monthIncome: monthIncomeTotal,
        monthExpenses: monthExpensesTotal,
        recentCount: recent.length,
        budgetProgressCount: budgetProgressData.length,
      })

    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function handleDeleteTransaction(transaction: Transaction, e: React.MouseEvent) {
    e.stopPropagation() // Prevent triggering edit - MUST be first line
    
    if (!window.confirm('Sei sicuro di voler eliminare questa transazione?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transaction.id)

      if (error) throw error

      // Refresh dashboard data to update totals immediately
      fetchData()
    } catch (error: any) {
      console.error('Error deleting transaction:', error)
      alert('Errore durante l\'eliminazione: ' + (error.message || 'Errore sconosciuto'))
    }
  }

  // Helper function to convert HEX to lighter shade for backgrounds
  function hexToRgba(hex: string, alpha: number = 0.1): string {
    // Handle preset names by converting to default HEX
    const presetMap: Record<string, string> = {
      'blue': '#3b82f6',
      'emerald': '#10b981',
      'violet': '#8b5cf6',
      'orange': '#f97316',
    }
    const colorHex = presetMap[hex] || (hex.startsWith('#') ? hex : '#3b82f6')
    
    const r = parseInt(colorHex.slice(1, 3), 16)
    const g = parseInt(colorHex.slice(3, 5), 16)
    const b = parseInt(colorHex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  // Get the actual HEX color (handle presets)
  function getHexColor(color: string): string {
    const presetMap: Record<string, string> = {
      'blue': '#3b82f6',
      'emerald': '#10b981',
      'violet': '#8b5cf6',
      'orange': '#f97316',
    }
    return presetMap[color] || (color.startsWith('#') ? color : '#3b82f6')
  }

  const colorHex = getHexColor(primaryColor)
  const colorLight = hexToRgba(primaryColor, 0.1)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-full bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Ciao, {displayName}
          </h1>
          <button
            onClick={onOpenSettings}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Impostazioni"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Net Worth Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg" style={{ backgroundColor: colorLight }}>
              <Wallet className="w-5 h-5" style={{ color: colorHex }} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Patrimonio Totale</p>
              <p className="text-3xl font-bold text-gray-900">
                {formatCurrency(netWorth)}
              </p>
            </div>
          </div>
        </div>

        {/* Liquidity and Investments */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="w-4 h-4 text-blue-600" />
              <p className="text-xs text-gray-500">Liquidità</p>
            </div>
            <p className="text-xl font-semibold text-blue-600">
              {formatCurrency(liquidity)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUpIcon className="w-4 h-4 text-indigo-600" />
              <p className="text-xs text-gray-500">Investimenti</p>
            </div>
            <p className="text-xl font-semibold text-indigo-600">
              {formatCurrency(investmentsTotal)}
            </p>
          </div>
        </div>

        {/* Income vs Expenses */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <p className="text-xs text-gray-500">Entrate</p>
            </div>
            <p className="text-xl font-semibold text-emerald-600">
              {formatCurrency(monthIncome)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Questo mese</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-rose-600" />
              <p className="text-xs text-gray-500">Uscite</p>
            </div>
            <p className="text-xl font-semibold text-rose-600">
              {formatCurrency(monthExpenses)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Questo mese</p>
          </div>
        </div>

        {/* Balance */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">Saldo Netto</p>
          <p className={cn(
            "text-2xl font-bold",
            monthIncome - monthExpenses >= 0 ? "text-emerald-600" : "text-rose-600"
          )}>
            {formatCurrency(monthIncome - monthExpenses)}
          </p>
        </div>

        {/* Budget Progress Section */}
        {budgetProgress.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Budget Mensili</h2>
            <div className="space-y-3">
              {budgetProgress.map((budget) => {
                const { category, spent, remaining, percentage } = budget
                const isOverBudget = spent > category.budget_limit!
                const progressColor = isOverBudget || percentage >= 90
                  ? 'bg-red-500'
                  : percentage >= 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
                
                const progressPercentage = Math.min(100, percentage)

                return (
                  <div
                    key={category.id}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-200"
                  >
                    {/* Top Row: Category Name and Remaining */}
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-900">{category.name}</p>
                      <p className={cn(
                        "text-sm font-semibold",
                        remaining >= 0 ? "text-gray-700" : "text-red-600"
                      )}>
                        {remaining >= 0 
                          ? `${formatCurrency(remaining)} rimanenti`
                          : `${formatCurrency(Math.abs(remaining))} oltre il budget`
                        }
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                      <div
                        className={cn("h-2.5 rounded-full transition-all", progressColor)}
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>

                    {/* Bottom Text: Spent vs Total */}
                    <p className="text-xs text-gray-500">
                      Spesi: {formatCurrency(spent)} su {formatCurrency(category.budget_limit!)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Transazioni Recenti</h2>
          <div className="space-y-2">
            {recentTransactions.length === 0 ? (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
                <p className="text-gray-500">Nessuna transazione ancora</p>
              </div>
            ) : (
              recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    setEditingTransaction(transaction)
                    setIsTransactionFormOpen(true)
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {transaction.type === 'transfer' && (
                        <ArrowRight className="w-4 h-4 text-indigo-600" />
                      )}
                      <p className="font-medium text-gray-900">
                        {transaction.type === 'transfer' 
                          ? (transaction.description || 'Trasferimento')
                          : (transaction.description || 'Nessuna descrizione')}
                      </p>
                      {transaction.is_work_related && transaction.type !== 'transfer' && (
                        <span 
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ 
                            backgroundColor: colorLight,
                            color: colorHex
                          }}
                        >
                          Lavoro
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatDate(transaction.date)}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <p className={cn(
                      "font-semibold",
                      transaction.type === 'income' 
                        ? "text-emerald-600" 
                        : transaction.type === 'transfer'
                        ? "text-indigo-600"
                        : "text-rose-600"
                    )}>
                      {transaction.type === 'income' 
                        ? '+' 
                        : transaction.type === 'transfer'
                        ? '→'
                        : '-'}
                      {formatCurrency(Math.abs(transaction.amount))}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingTransaction(transaction)
                        setIsTransactionFormOpen(true)
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      aria-label="Modifica"
                    >
                      <Edit2 className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation() // Prevent event bubbling to parent row
                        handleDeleteTransaction(transaction, e)
                      }}
                      className="p-1.5 hover:bg-red-50 rounded transition-colors"
                      aria-label="Elimina"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Transaction Form Modal */}
      <TransactionForm
        isOpen={isTransactionFormOpen}
        onClose={() => {
          setIsTransactionFormOpen(false)
          setEditingTransaction(null)
        }}
        onSuccess={fetchData}
        primaryColor={primaryColor}
        editingTransaction={editingTransaction}
      />
    </div>
  )
}
