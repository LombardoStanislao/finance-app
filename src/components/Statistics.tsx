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

const INVESTMENT_COLORS: Record<string, string> = {
  'ETF': '#10b981',
  'Azioni': '#3b82f6',
  'Obbligazioni': '#6366f1',
  'Crypto': '#f97316',
  'Conto Deposito': '#a855f7',
  'Altro': '#6b7280'
}

// Renderizza la label esterna
const renderCustomizedLabel = (props: any) => {
  const { cx, cy, midAngle, outerRadius, percent } = props
  const RADIAN = Math.PI / 180
  const radius = outerRadius * 1.35
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

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
  
  // Dati Grafici
  const [expensesByCategory, setExpensesByCategory] = useState<CategoryData[]>([])
  const [incomeByCategory, setIncomeByCategory] = useState<CategoryData[]>([])
  const [investmentData, setInvestmentData] = useState<InvestmentDistribution[]>([])
  const [netWorthData, setNetWorthData] = useState<NetWorthDataPoint[]>([])
  
  // Filtri Temporali per le Torte
  // Aggiunto 'CUSTOM' al tipo
  const [pieRange, setPieRange] = useState<'MONTH' | '6M' | 'YEAR' | 'CUSTOM'>('MONTH')
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  
  // Stati per date personalizzate (Default: inizio mese corrente -> oggi)
  const [customStart, setCustomStart] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  )
  const [customEnd, setCustomEnd] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  
  // Filtro Temporale per il Grafico Lineare (Patrimonio)
  const [lineRange, setLineRange] = useState<'1M' | '3M' | '6M' | 'YTD' | 'ALL'>('3M')
  
  const [allCategories, setAllCategories] = useState<Category[]>([])

  useEffect(() => {
    loadAllCategories()
    loadInvestmentData()
  }, [])

  // Aggiunto customStart e customEnd alle dipendenze
  useEffect(() => {
    if (allCategories.length > 0) {
      loadTransactionData()
    }
  }, [pieRange, selectedMonth, selectedYear, customStart, customEnd, allCategories])

  useEffect(() => {
    loadNetWorthData()
  }, [lineRange])

  async function loadAllCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('categories').select('*').eq('user_id', user.id)
      setAllCategories(data || [])
    } catch (error) { console.error(error) }
  }

  async function loadInvestmentData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: investments } = await supabase.from('investments').select('type, current_value').eq('user_id', user.id)

      const typeMap = new Map<string, number>()
      investments?.forEach((inv) => {
        const current = typeMap.get(inv.type) || 0
        typeMap.set(inv.type, current + (inv.current_value || 0))
      })

      const data = Array.from(typeMap.entries())
        .map(([type, value], index) => ({
          name: type,
          value: value,
          color: INVESTMENT_COLORS[type] || COLORS[index % COLORS.length]
        }))
        .sort((a, b) => b.value - a.value)

      setInvestmentData(data)
    } catch (error) { console.error(error) }
  }

  async function loadTransactionData() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let startDate: string
      let endDate: string

      // Logica intervallo temporale per le Torte
      if (pieRange === 'MONTH') {
        startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString()
        endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString()
      } else if (pieRange === '6M') {
        const now = new Date()
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString()
        endDate = new Date().toISOString()
      } else if (pieRange === 'YEAR') {
        startDate = new Date(selectedYear, 0, 1).toISOString()
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59).toISOString()
      } else {
        // CUSTOM RANGE
        if (!customStart || !customEnd) {
            setLoading(false)
            return
        }
        startDate = new Date(customStart).toISOString()
        // Aggiungiamo l'orario di fine giornata alla data di fine
        endDate = new Date(customEnd + 'T23:59:59').toISOString()
      }

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
      
      switch (lineRange) {
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
    } catch (error) { console.error(error) }
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  // Helper per calcolare totale per tooltip percentuale
  const totalIncome = incomeByCategory.reduce((sum, item) => sum + item.value, 0)
  const totalExpense = expensesByCategory.reduce((sum, item) => sum + item.value, 0)
  const totalInvestments = investmentData.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER STICKY */}
      <div className="bg-white sticky top-0 z-10 border-b border-gray-100 px-4 py-4 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Analisi Finanziaria</h1>
        </div>
        
        {/* CONTROLLI FILTRO TORTE (Month / 6M / Year / Custom) */}
        <div className="flex flex-col gap-3 bg-gray-50 p-2 rounded-xl">
            {/* Tasti Filtro */}
            <div className="flex gap-1 overflow-x-auto hide-scrollbar">
                {(['MONTH', '6M', 'YEAR', 'CUSTOM'] as const).map((r) => (
                    <button
                        key={r}
                        onClick={() => setPieRange(r)}
                        className={cn(
                            "px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex-1",
                            pieRange === r 
                                ? "bg-white text-gray-900 shadow-sm border border-gray-100" 
                                : "text-gray-400 hover:text-gray-600"
                        )}
                    >
                        {r === 'MONTH' ? 'Mese' : r === '6M' ? 'Semestre' : r === 'YEAR' ? 'Anno' : 'Periodo'}
                    </button>
                ))}
            </div>

            {/* Controlli specifici per la selezione attiva */}
            <div className="flex justify-end">
                {pieRange === 'MONTH' && (
                    <div className="flex gap-2 w-full justify-end">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            className="bg-white px-2 py-1 rounded-md text-xs font-bold text-gray-600 outline-none border border-gray-200 cursor-pointer text-right shadow-sm"
                        >
                            {months.map((m) => (
                                <option key={m} value={m}>{new Date(2000, m - 1).toLocaleDateString('it-IT', { month: 'short' }).toUpperCase()}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="bg-white px-2 py-1 rounded-md text-xs font-bold text-gray-600 outline-none border border-gray-200 cursor-pointer shadow-sm"
                        >
                            {years.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                )}

                {pieRange === 'YEAR' && (
                    <div className="flex justify-end w-full">
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="bg-white px-3 py-1 rounded-md text-xs font-bold text-gray-600 outline-none border border-gray-200 cursor-pointer shadow-sm"
                        >
                            {years.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                )}

                {pieRange === 'CUSTOM' && (
                    <div className="flex items-center gap-2 w-full">
                        <input 
                            type="date" 
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="flex-1 bg-white px-2 py-1.5 rounded-lg text-xs font-medium border border-gray-200 shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-gray-300 font-bold">-</span>
                        <input 
                            type="date" 
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="flex-1 bg-white px-2 py-1.5 rounded-lg text-xs font-medium border border-gray-200 shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                )}
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
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Entrate</h2>
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
              <p className="text-gray-400 text-sm font-medium">Nessun dato nel periodo</p>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incomeByCategory}
                    cx="50%"
                    cy="45%"
                    innerRadius={0} // TORTA PIENA
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderCustomizedLabel}
                    labelLine={true}
                  >
                    {incomeByCategory.map((entry, index) => (
                      <Cell key={`cell-inc-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number | undefined) => [
                        `${formatCurrency(value || 0)} (${(((value || 0) / (totalIncome || 1)) * 100).toFixed(1)}%)`,
                        'Importo'
                    ]}
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
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Uscite</h2>
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
              <p className="text-gray-400 text-sm font-medium">Nessun dato nel periodo</p>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="45%"
                    innerRadius={0} // TORTA PIENA
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderCustomizedLabel}
                    labelLine={true}
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-exp-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number | undefined) => [
                        `${formatCurrency(value || 0)} (${(((value || 0) / (totalExpense || 1)) * 100).toFixed(1)}%)`,
                        'Importo'
                    ]}
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
                    innerRadius={0} // TORTA PIENA
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderCustomizedLabel}
                    labelLine={true}
                  >
                    {investmentData.map((entry, index) => (
                      <Cell key={`cell-inv-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number | undefined) => [
                        `${formatCurrency(value || 0)} (${(((value || 0) / (totalInvestments || 1)) * 100).toFixed(1)}%)`,
                        'Valore'
                    ]}
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
            
            {/* Pulsanti Intervallo per Linea */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 hide-scrollbar">
              {(['1M', '3M', '6M', 'YTD', 'ALL'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setLineRange(range)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border",
                    lineRange === range
                      ? "text-white border-transparent shadow-md shadow-blue-100"
                      : "bg-white text-gray-500 border-gray-100 hover:bg-gray-50"
                  )}
                  style={lineRange === range ? { backgroundColor: primaryColor || '#3b82f6' } : {}}
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