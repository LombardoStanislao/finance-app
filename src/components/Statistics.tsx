import { useState, useEffect } from 'react'
import { ArrowLeft, TrendingUp, Calendar, BarChart3, Wallet, TrendingDown } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { supabase, type Category } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'

interface StatisticsProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

interface CategoryData {
  name: string
  value: number
  color: string
  [key: string]: string | number
}

// FIX: Aggiunta la firma dell'indice per soddisfare Recharts (ChartDataInput)
interface InvestmentDistribution {
  name: string
  value: number
  color: string
  [key: string]: string | number
}

interface NetWorthDataPoint {
  date: string
  netWorth: number
  income: number
  expenses: number
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

// Mappa colori specifici per investimenti
const INVESTMENT_COLORS: Record<string, string> = {
  'ETF': '#10b981',
  'Azioni': '#3b82f6',
  'Obbligazioni': '#6366f1',
  'Crypto': '#f97316',
  'Conto Deposito': '#a855f7',
  'Altro': '#6b7280'
}

// Funzione per renderizzare la label con la percentuale all'esterno
const renderCustomizedLabel = (props: any) => {
  // FIX: Rimosso 'innerRadius' che non veniva utilizzato
  const { cx, cy, midAngle, outerRadius, percent } = props
  const RADIAN = Math.PI / 180
  // Posiziona la label un po' fuori dal raggio esterno
  const radius = outerRadius * 1.35
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  // Mostriamo la label se la percentuale è > 0.5%
  if (percent < 0.005) return null

  const percentageValue = (percent * 100).toFixed(0)
  const labelText = percentageValue === '0' ? '<1%' : `${percentageValue}%`

  return (
    <text 
      x={x} 
      y={y} 
      fill="#6b7280" 
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central" 
      className="text-[10px] font-bold"
    >
      {labelText}
    </text>
  )
}

export default function Statistics({ onBack, primaryColor }: StatisticsProps) {
  const [loading, setLoading] = useState(true)
  const [expensesByCategory, setExpensesByCategory] = useState<CategoryData[]>([])
  const [incomeByCategory, setIncomeByCategory] = useState<CategoryData[]>([])
  const [investmentData, setInvestmentData] = useState<InvestmentDistribution[]>([])
  const [netWorthData, setNetWorthData] = useState<NetWorthDataPoint[]>([])
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | 'YTD' | 'ALL'>('3M')
  
  const [allCategories, setAllCategories] = useState<Category[]>([])

  useEffect(() => {
    loadAllCategories()
    loadInvestmentData()
  }, [])

  useEffect(() => {
    if (allCategories.length > 0) {
      loadTransactionData()
    }
  }, [selectedMonth, selectedYear, allCategories])

  useEffect(() => {
    loadNetWorthData()
  }, [timeRange])

  async function loadAllCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)

      if (error) throw error
      setAllCategories(data || [])
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  async function loadInvestmentData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: investments, error } = await supabase
        .from('investments')
        .select('type, current_value')
        .eq('user_id', user.id)

      if (error) throw error

      const typeMap = new Map<string, number>()
      investments?.forEach((inv) => {
        const current = typeMap.get(inv.type) || 0
        typeMap.set(inv.type, current + (inv.current_value || 0))
      })

      const data: InvestmentDistribution[] = Array.from(typeMap.entries())
        .map(([type, value], index) => ({
          name: type,
          value: value,
          color: INVESTMENT_COLORS[type] || COLORS[index % COLORS.length]
        }))
        .sort((a, b) => b.value - a.value)

      setInvestmentData(data)
    } catch (error) {
      console.error('Error loading investment data:', error)
    }
  }

  async function loadTransactionData() {
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
        .gte('date', startDate)
        .lte('date', endDate)

      if (error) throw error

      const expenseMap = new Map<string, number>()
      const incomeMap = new Map<string, number>()

      transactions?.forEach((transaction) => {
        if (transaction.category_id) {
          const val = Math.abs(transaction.amount)
          if (transaction.type === 'expense') {
            expenseMap.set(transaction.category_id, (expenseMap.get(transaction.category_id) || 0) + val)
          } else if (transaction.type === 'income') {
            incomeMap.set(transaction.category_id, (incomeMap.get(transaction.category_id) || 0) + val)
          }
        }
      })

      const formatData = (map: Map<string, number>) => {
        return Array.from(map.entries()).map(([categoryId, value], index) => {
          const category = allCategories.find(c => c.id === categoryId)
          return {
            name: category?.name || 'Sconosciuta',
            value: value,
            color: COLORS[index % COLORS.length]
          }
        }).sort((a, b) => b.value - a.value)
      }

      setExpensesByCategory(formatData(expenseMap))
      setIncomeByCategory(formatData(incomeMap))

    } catch (error) {
      console.error('Error loading transaction data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadNetWorthData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let startDate: Date
      const now = new Date()
      
      switch (timeRange) {
        case '1M': startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break
        case '3M': startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break
        case '6M': startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break
        case 'YTD': startDate = new Date(now.getFullYear(), 0, 1); break
        case 'ALL': startDate = new Date(2000, 0, 1); break
      }

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('amount, type, date')
        .eq('user_id', user.id)
        .gte('date', startDate.toISOString())
        .order('date', { ascending: true })

      if (error) throw error

      const { data: investments } = await supabase.from('investments').select('current_value').eq('user_id', user.id)
      const investmentsTotal = investments?.reduce((sum, inv) => sum + (inv.current_value || 0), 0) || 0

      const { data: buckets } = await supabase.from('buckets').select('current_balance').eq('user_id', user.id)
      const bucketsTotal = buckets?.reduce((sum, bucket) => sum + (bucket.current_balance || 0), 0) || 0

      const dateMap = new Map<string, { income: number; expenses: number }>()

      transactions?.forEach((transaction) => {
        const date = transaction.date.split('T')[0]
        const current = dateMap.get(date) || { income: 0, expenses: 0 }
        if (transaction.type === 'income') current.income += transaction.amount
        else if (transaction.type === 'expense') current.expenses += Math.abs(transaction.amount)
        dateMap.set(date, current)
      })

      const initialLiquidity = transactions?.filter(t => t.type === 'initial').reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0
      const sortedDates = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      
      let runningBalance = initialLiquidity
      const netWorthPoints: NetWorthDataPoint[] = []

      sortedDates.forEach(([date, { income, expenses }]) => {
        runningBalance += (income - expenses)
        netWorthPoints.push({
          date: new Date(date).toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }),
          netWorth: runningBalance + bucketsTotal + investmentsTotal,
          income,
          expenses
        })
      })

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

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER STICKY */}
      <div className="bg-white sticky top-0 z-10 border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Analisi Finanziaria</h1>
        </div>
        
        {/* Selettori Data Globali */}
        <div className="flex gap-2">
            <div className="relative">
            <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="appearance-none bg-gray-50 border border-transparent hover:border-gray-200 text-gray-700 text-xs font-bold py-2 pl-3 pr-6 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all"
            >
                {months.map((month) => (
                <option key={month} value={month}>
                    {new Date(2000, month - 1).toLocaleDateString('it-IT', { month: 'short' }).toUpperCase()}
                </option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-gray-500">
                <Calendar className="w-3 h-3" />
            </div>
            </div>
            
            <div className="relative">
            <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="appearance-none bg-gray-50 border border-transparent hover:border-gray-200 text-gray-700 text-xs font-bold py-2 pl-3 pr-6 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all"
            >
                {years.map((year) => (
                <option key={year} value={year}>{year}</option>
                ))}
            </select>
            </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        
        {/* CARD ENTRATE CATEGORIE */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-emerald-50 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Entrate per Categoria</h2>
          </div>

          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3 animate-pulse">
               <div className="w-32 h-32 bg-gray-100 rounded-full"></div>
            </div>
          ) : incomeByCategory.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-100 rounded-xl">
              <div className="p-3 bg-gray-50 rounded-full mb-2">
                 <BarChart3 className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-gray-400 text-sm font-medium">Nessuna entrata in questo periodo</p>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incomeByCategory}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={renderCustomizedLabel}
                    labelLine={true}
                  >
                    {incomeByCategory.map((entry, index) => (
                      <Cell key={`cell-inc-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number | undefined) => formatCurrency(value || 0)}
                    contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                     layout="horizontal" 
                     verticalAlign="bottom" 
                     align="center"
                     iconType="circle"
                     wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* CARD SPESE CATEGORIE */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-rose-50 rounded-lg">
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                </div>
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Spese per Categoria</h2>
          </div>

          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3 animate-pulse">
               <div className="w-32 h-32 bg-gray-100 rounded-full"></div>
            </div>
          ) : expensesByCategory.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-100 rounded-xl">
              <div className="p-3 bg-gray-50 rounded-full mb-2">
                 <BarChart3 className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-gray-400 text-sm font-medium">Nessuna spesa in questo periodo</p>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={renderCustomizedLabel} // Etichetta percentuale
                    labelLine={true}
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-exp-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number | undefined) => formatCurrency(value || 0)}
                    contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                     layout="horizontal" 
                     verticalAlign="bottom" 
                     align="center"
                     iconType="circle"
                     wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* CARD ASSET ALLOCATION */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-6">
              <div className="p-1.5 bg-emerald-50 rounded-lg">
                  <Wallet className="w-4 h-4 text-emerald-600" />
              </div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Asset Allocation</h2>
          </div>

          {investmentData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-100 rounded-xl">
               <div className="p-3 bg-gray-50 rounded-full mb-2">
                 <Wallet className="w-6 h-6 text-gray-300" />
               </div>
              <p className="text-gray-400 text-sm font-medium">Nessun investimento attivo</p>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={investmentData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={renderCustomizedLabel} // Etichetta percentuale
                    labelLine={true}
                  >
                    {investmentData.map((entry, index) => (
                      <Cell key={`cell-inv-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number | undefined) => formatCurrency(value || 0)}
                    contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                     layout="horizontal" 
                     verticalAlign="bottom" 
                     align="center"
                     iconType="circle"
                     wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* CARD ANDAMENTO PATRIMONIO */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Trend Patrimonio</h2>
            </div>
            
            {/* Pulsanti Intervallo */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 hide-scrollbar">
              {(['1M', '3M', '6M', 'YTD', 'ALL'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border",
                    timeRange === range
                      ? "text-white border-transparent shadow-md shadow-blue-100"
                      : "bg-white text-gray-500 border-gray-100 hover:bg-gray-50"
                  )}
                  style={timeRange === range ? { backgroundColor: primaryColor || '#3b82f6' } : {}}
                >
                  {range === '1M' ? '1 Mese' : range === '3M' ? '3 Mesi' : range === '6M' ? '6 Mesi' : range === 'YTD' ? 'Anno' : 'Tutto'}
                </button>
              ))}
            </div>
          </div>

          {netWorthData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-100 rounded-xl">
               <div className="p-3 bg-gray-50 rounded-full mb-2">
                 <TrendingUp className="w-6 h-6 text-gray-300" />
               </div>
              <p className="text-gray-400 text-sm font-medium">Nessun dato storico</p>
            </div>
          ) : (
            <div className="h-[250px] w-full -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={netWorthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#9ca3af"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="#9ca3af"
                    fontSize={10}
                    tickFormatter={(value) => `€${value/1000}k`}
                    tickLine={false}
                    axisLine={false}
                    dx={-10}
                  />
                  <Tooltip 
                    formatter={(value: number | undefined) => [formatCurrency(value || 0), 'Patrimonio']}
                    labelStyle={{ color: '#6b7280', marginBottom: '4px' }}
                    contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="netWorth" 
                    stroke={primaryColor || '#3b82f6'}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}