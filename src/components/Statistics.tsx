import { useState, useEffect } from 'react'
import { ArrowLeft, Settings } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { supabase, type Transaction, type Category } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'

interface StatisticsProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

interface ExpenseByCategory {
  name: string
  value: number
  color: string
}

interface NetWorthDataPoint {
  date: string
  netWorth: number
  income: number
  expenses: number
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export default function Statistics({ onBack, onOpenSettings, primaryColor }: StatisticsProps) {
  const [loading, setLoading] = useState(true)
  const [expensesByCategory, setExpensesByCategory] = useState<ExpenseByCategory[]>([])
  const [netWorthData, setNetWorthData] = useState<NetWorthDataPoint[]>([])
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | 'YTD' | 'ALL'>('3M')
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    loadCategories()
  }, [])

  useEffect(() => {
    if (categories.length > 0) {
      loadExpenseData()
    }
  }, [selectedMonth, selectedYear, categories])

  useEffect(() => {
    loadNetWorthData()
  }, [timeRange])

  async function loadCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('categories')
        .select('id, name, type')
        .eq('user_id', user.id)
        .eq('type', 'expense')

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  async function loadExpenseData() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString()
      const endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString()

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('amount, category_id, type')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('date', startDate)
        .lte('date', endDate)

      if (error) throw error

      // Group by category
      const categoryMap = new Map<string, number>()
      transactions?.forEach((transaction) => {
        if (transaction.category_id) {
          const current = categoryMap.get(transaction.category_id) || 0
          categoryMap.set(transaction.category_id, current + Math.abs(transaction.amount))
        }
      })

      // Convert to array with category names and colors
      const expenseData: ExpenseByCategory[] = Array.from(categoryMap.entries()).map(([categoryId, value], index) => {
        const category = categories.find(c => c.id === categoryId)
        return {
          name: category?.name || 'Sconosciuta',
          value: value,
          color: COLORS[index % COLORS.length]
        }
      }).sort((a, b) => b.value - a.value)

      setExpensesByCategory(expenseData)
    } catch (error) {
      console.error('Error loading expense data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadNetWorthData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Calculate date range based on timeRange
      let startDate: Date
      const now = new Date()
      
      switch (timeRange) {
        case '1M':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
          break
        case '3M':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
          break
        case '6M':
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
          break
        case 'YTD':
          startDate = new Date(now.getFullYear(), 0, 1)
          break
        case 'ALL':
          startDate = new Date(2000, 0, 1) // Very old date to get all
          break
      }

      // Fetch all transactions in range
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('amount, type, date')
        .eq('user_id', user.id)
        .gte('date', startDate.toISOString())
        .order('date', { ascending: true })

      if (error) throw error

      // Fetch investments
      const { data: investments } = await supabase
        .from('investments')
        .select('current_value')
        .eq('user_id', user.id)

      const investmentsTotal = investments?.reduce((sum, inv) => sum + (inv.current_value || 0), 0) || 0

      // Fetch buckets
      const { data: buckets } = await supabase
        .from('buckets')
        .select('current_balance')
        .eq('user_id', user.id)

      const bucketsTotal = buckets?.reduce((sum, bucket) => sum + (bucket.current_balance || 0), 0) || 0

      // Group transactions by date and calculate running balance
      const dateMap = new Map<string, { income: number; expenses: number }>()

      transactions?.forEach((transaction) => {
        const date = transaction.date.split('T')[0]
        const current = dateMap.get(date) || { income: 0, expenses: 0 }
        
        if (transaction.type === 'income') {
          current.income += transaction.amount
        } else if (transaction.type === 'expense') {
          current.expenses += Math.abs(transaction.amount)
        }
        // Transfers are handled separately in liquidity calculation

        dateMap.set(date, current)
      })

      // Convert to array and calculate running balance
      const sortedDates = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      
      let runningBalance = 0
      const netWorthPoints: NetWorthDataPoint[] = []

      sortedDates.forEach(([date, { income, expenses }]) => {
        runningBalance += (income - expenses)
        netWorthPoints.push({
          date: new Date(date).toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }),
          netWorth: runningBalance + bucketsTotal + investmentsTotal,
          income: income,
          expenses: expenses
        })
      })

      // If no transactions, add current state
      if (netWorthPoints.length === 0) {
        netWorthPoints.push({
          date: new Date().toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }),
          netWorth: bucketsTotal + investmentsTotal,
          income: 0,
          expenses: 0
        })
      }

      setNetWorthData(netWorthPoints)
    } catch (error) {
      console.error('Error loading net worth data:', error)
    }
  }

  // Get months for dropdown
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

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

  return (
    <div className="w-full min-h-full bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Indietro"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Analisi Finanziaria</h1>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Impostazioni"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Monthly Expenses Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Spese per Categoria</h2>
            <div className="flex gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="border border-gray-300 px-3 py-1 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {new Date(2000, month - 1).toLocaleDateString('it-IT', { month: 'long' })}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="border border-gray-300 px-3 py-1 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-gray-500">Caricamento...</p>
            </div>
          ) : expensesByCategory.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-gray-500">Nessuna spesa per questo periodo</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={expensesByCategory}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {expensesByCategory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Net Worth Trend Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Andamento Patrimonio</h2>
            <div className="flex gap-2">
              {(['1M', '3M', '6M', 'YTD', 'ALL'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                    timeRange === range
                      ? "text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                  style={timeRange === range ? { backgroundColor: colorHex } : {}}
                >
                  {range === '1M' ? '1 Mese' : range === '3M' ? '3 Mesi' : range === '6M' ? '6 Mesi' : range === 'YTD' ? 'Anno' : 'Tutto'}
                </button>
              ))}
            </div>
          </div>

          {netWorthData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-gray-500">Nessun dato disponibile</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={netWorthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="netWorth" 
                  stroke={colorHex}
                  strokeWidth={2}
                  dot={false}
                  name="Patrimonio"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

