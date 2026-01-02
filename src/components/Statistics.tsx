import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, TrendingUp, Wallet, Settings, CandlestickChart, Filter, X, Activity, Banknote, CheckCircle2, ChevronDown, Calendar, PiggyBank, Flame } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts'
import { supabase, type Category, type Transaction } from '../lib/supabase'
import { formatCurrency, cn, formatDate } from '../lib/utils'

interface StatisticsProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

// --- INTERFACCE DATI ---
interface CategoryData {
  id: string
  name: string
  value: number
  color: string
  transactions: Transaction[]
  subCategories: Map<string, number>
  [key: string]: any
}

interface InvestmentDistribution {
  name: string
  value: number
  color: string
  [key: string]: any
}

interface NetWorthDataPoint {
  date: string
  netWorth: number
  income: number
  expenses: number
  [key: string]: any
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#6366f1', '#14b8a6']

const INVESTMENT_COLORS: Record<string, string> = {
  'ETF': '#10b981',
  'Azioni': '#3b82f6',
  'Obbligazioni': '#6366f1',
  'Crypto': '#f97316',
  'Conto Deposito': '#a855f7',
  'Altro': '#6b7280'
}

// Custom Tooltip per i grafici
const CustomTooltip = ({ active, payload, label, formatter }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-2xl shadow-xl border border-gray-100 text-xs">
          <p className="font-bold text-gray-400 mb-1 uppercase tracking-wide">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 mb-0.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                <span className="text-gray-600 font-medium">{entry.name}:</span>
                <span className="text-gray-900 font-bold">
                    {formatter ? formatter(entry.value) : formatCurrency(entry.value)}
                </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
};

// Label personalizzata per le torte
const renderCustomizedLabel = (props: any) => {
  const { cx, cy, midAngle, outerRadius, percent } = props
  const radius = outerRadius * 1.4
  const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180))
  const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180))

  if (percent < 0.001) return null

  return (
    <text x={x} y={y} fill="#9ca3af" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-[10px] font-bold">
      {(percent * 100).toFixed(1)}%
    </text>
  )
}

export default function Statistics({ onBack, onOpenSettings, primaryColor }: StatisticsProps) {
  const [loading, setLoading] = useState(true)
  
  // Dati Grezzi
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [investmentData, setInvestmentData] = useState<InvestmentDistribution[]>([])
  const [netWorthData, setNetWorthData] = useState<NetWorthDataPoint[]>([])
  
  // Dati P.IVA
  const [isUserPro, setIsUserPro] = useState(false)
  const [taxBucketIds, setTaxBucketIds] = useState<string[]>([])

  // Stati Filtri
  const [pieRange, setPieRange] = useState<'MONTH' | '6M' | 'YEAR' | 'CUSTOM'>('MONTH')
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  
  const [customStart, setCustomStart] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  )
  const [customEnd, setCustomEnd] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  
  const [lineRange, setLineRange] = useState<'1M' | '3M' | '6M' | 'YTD' | 'ALL'>('3M')

  // Stati Nuove Funzionalità
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<string[]>([]) 
  const [showNetIncome, setShowNetIncome] = useState(false) 
  const [activeDrillCategory, setActiveDrillCategory] = useState<CategoryData | null>(null) 

  // Init
  useEffect(() => {
    loadInitialData()
    loadInvestmentData()
  }, [])

  // Reload Transazioni
  useEffect(() => {
    if (allCategories.length > 0) {
      loadTransactionsInRange()
    }
  }, [pieRange, selectedMonth, selectedYear, customStart, customEnd, allCategories])

  // Reload Net Worth
  useEffect(() => {
    loadNetWorthData()
  }, [lineRange])

  async function loadInitialData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase.from('profiles').select('is_pro_tax').eq('id', user.id).maybeSingle()
      setIsUserPro(profile?.is_pro_tax || false)

      const { data: cats } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name')
      setAllCategories(cats || [])

      const { data: buckets } = await supabase.from('buckets').select('id, name').eq('user_id', user.id).in('name', ['Aliquota INPS', 'Aliquota Imposta Sostitutiva'])
      if (buckets) setTaxBucketIds(buckets.map(b => b.id))

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

  async function loadTransactionsInRange() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let startDate: string
      let endDate: string

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
        if (!customStart || !customEnd) { setLoading(false); return }
        startDate = new Date(customStart).toISOString()
        endDate = new Date(customEnd + 'T23:59:59').toISOString()
      }

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })

      if (error) throw error
      setAllTransactions(data || [])
      setActiveDrillCategory(null)

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

  const { processedIncome, processedExpenses, kpi, cashFlowData, tradingPL } = useMemo(() => {
      
      const visibleTransactions = allTransactions.filter(t => {
          if (!t.category_id) return true
          let cat = allCategories.find(c => c.id === t.category_id)
          while(cat && cat.parent_id) {
              const parent = allCategories.find(c => c.id === cat?.parent_id)
              if(parent) cat = parent
              else break
          }
          return cat ? !excludedCategoryIds.includes(cat.id) : true
      })

      const incMap = new Map<string, CategoryData>()
      const expMap = new Map<string, CategoryData>()
      const cfMap = new Map<string, { inc: number, exp: number, tax: number }>()
      
      let totalIncome = 0
      let totalExpense = 0
      let totalTaxTransfers = 0
      let totalTradingPL = 0

      visibleTransactions.forEach(t => {
          const amount = Number(t.amount)
          const absAmount = Math.abs(amount)
          const dateKey = t.date.substring(0, 7) 

          if (!cfMap.has(dateKey)) cfMap.set(dateKey, { inc: 0, exp: 0, tax: 0 })
          const cfEntry = cfMap.get(dateKey)!

          if (t.investment_id && t.type !== 'transfer') {
              totalTradingPL += amount
              return
          }

          if (t.type === 'transfer' && t.bucket_id && taxBucketIds.includes(t.bucket_id)) {
              totalTaxTransfers += absAmount
              cfEntry.tax += absAmount
              return
          }

          if (t.category_id && !t.investment_id) {
              let root = allCategories.find(c => c.id === t.category_id)
              let subName = null
              
              if (root && root.parent_id) {
                  subName = root.name
                  const parent = allCategories.find(c => c.id === root?.parent_id)
                  if (parent) root = parent
              }
              
              const rootId = root?.id || 'unknown'
              const rootName = root?.name || 'Altro'

              if (t.type === 'expense') {
                  totalExpense += absAmount
                  cfEntry.exp += absAmount
                  
                  if (!expMap.has(rootId)) expMap.set(rootId, { id: rootId, name: rootName, value: 0, color: '', transactions: [], subCategories: new Map() })
                  const entry = expMap.get(rootId)!
                  entry.value += absAmount
                  entry.transactions.push(t)
                  if (subName) entry.subCategories.set(subName, (entry.subCategories.get(subName) || 0) + absAmount)

              } else if (t.type === 'income') {
                  totalIncome += absAmount
                  cfEntry.inc += absAmount

                  if (!incMap.has(rootId)) incMap.set(rootId, { id: rootId, name: rootName, value: 0, color: '', transactions: [], subCategories: new Map() })
                  const entry = incMap.get(rootId)!
                  entry.value += absAmount
                  entry.transactions.push(t)
                  if (subName) entry.subCategories.set(subName, (entry.subCategories.get(subName) || 0) + absAmount)
              }
          }
      })

      const finalizeMap = (map: Map<string, CategoryData>) => Array.from(map.values())
          .sort((a,b) => b.value - a.value)
          .map((item, idx) => ({ ...item, color: COLORS[idx % COLORS.length] }))

      const cashFlow = Array.from(cfMap.entries())
          .sort((a,b) => a[0].localeCompare(b[0]))
          .map(([d, v]) => ({
              date: new Date(d + '-01').toLocaleDateString('it-IT', { month: 'short' }),
              income: v.inc,
              netIncome: Math.max(0, v.inc - v.tax),
              expense: v.exp
          }))

      const incomeForCalc = (isUserPro && showNetIncome) ? (totalIncome - totalTaxTransfers) : totalIncome
      const netSavings = incomeForCalc - totalExpense
      const savingsRate = incomeForCalc > 0 ? (netSavings / incomeForCalc) * 100 : 0
      
      const days = Math.max(1, (new Date(pieRange === 'CUSTOM' ? customEnd : new Date().toISOString()).getTime() - new Date(pieRange === 'CUSTOM' ? customStart : pieRange === 'MONTH' ? new Date(selectedYear, selectedMonth-1, 1).toISOString() : new Date(new Date().getFullYear(), 0, 1).toISOString()).getTime()) / (86400000))
      const burnRate = totalExpense / days

      return {
          processedIncome: finalizeMap(incMap),
          processedExpenses: finalizeMap(expMap),
          kpi: { netSavings, savingsRate, burnRate },
          cashFlowData: cashFlow,
          tradingPL: totalTradingPL
      }

  }, [allTransactions, allCategories, excludedCategoryIds, showNetIncome, isUserPro, taxBucketIds, pieRange, customStart, customEnd, selectedMonth, selectedYear])


  const toggleCategoryFilter = (id: string) => {
      setExcludedCategoryIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const years = [2024, 2025, 2026]
  const rootCategoriesList = useMemo(() => allCategories.filter(c => !c.parent_id), [allCategories])

  const totalIncomeValue = processedIncome.reduce((sum, item) => sum + item.value, 0)
  const totalExpenseValue = processedExpenses.reduce((sum, item) => sum + item.value, 0)
  
  // Utilizzato nel tooltip del grafico Asset Allocation
  const totalInvestments = investmentData.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      
      {/* HEADER & CONTROLLI */}
      <div className="bg-white sticky top-0 z-10 border-b border-gray-100 px-4 py-4 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6 text-gray-700" />
                </button>
                <h1 className="text-xl font-bold text-gray-900">Analisi</h1>
            </div>
             <button onClick={onOpenSettings} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100 active:scale-95"><Settings className="w-5 h-5" strokeWidth={2} /></button>
        </div>
        
        {/* SEGMENTED CONTROL PERIODI */}
        <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
            {(['MONTH', '6M', 'YEAR', 'CUSTOM'] as const).map((r) => (
                <button 
                    key={r} 
                    onClick={() => setPieRange(r)} 
                    className={cn(
                        "flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all text-center uppercase tracking-wide", 
                        pieRange === r 
                            ? "bg-white text-gray-900 shadow-sm scale-[1.02]" 
                            : "text-gray-400 hover:text-gray-600"
                    )}
                >
                    {r === 'MONTH' ? 'Mese' : r === '6M' ? '6 Mesi' : r === 'YEAR' ? 'Anno' : 'Periodo'}
                </button>
            ))}
        </div>
            
        {/* DATE SELECTORS & FILTER TOGGLE */}
        <div className="flex justify-between items-center px-1">
            <div className="flex items-center gap-3">
                {pieRange === 'MONTH' && (
                    <>
                        <div className="relative group">
                            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="appearance-none bg-transparent pl-0 pr-6 py-1 text-lg font-bold text-gray-900 outline-none cursor-pointer group-hover:text-blue-600 transition-colors">
                                {months.map(m=><option key={m} value={m}>{new Date(2000,m-1).toLocaleDateString('it-IT',{month:'long'})}</option>)}
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-blue-600" />
                        </div>
                        <div className="relative group">
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="appearance-none bg-transparent pl-0 pr-5 py-1 text-lg font-bold text-gray-900 outline-none cursor-pointer group-hover:text-blue-600 transition-colors">
                                {years.map(y=><option key={y} value={y}>{y}</option>)}
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-blue-600" />
                        </div>
                    </>
                )}
                {pieRange === 'YEAR' && (
                    <div className="relative group">
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="appearance-none bg-transparent pl-0 pr-5 py-1 text-lg font-bold text-gray-900 outline-none cursor-pointer group-hover:text-blue-600 transition-colors">
                            {years.map(y=><option key={y} value={y}>{y}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-blue-600" />
                    </div>
                )}
                {pieRange === 'CUSTOM' && (
                    <div className="flex items-center gap-2">
                        <div className="relative"><Calendar className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" /><input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-28 bg-gray-50 pl-7 pr-2 py-1.5 rounded-lg border border-gray-200 text-xs font-medium outline-none focus:border-blue-500" /></div>
                        <span className="text-gray-300">-</span>
                        <div className="relative"><Calendar className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" /><input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-28 bg-gray-50 pl-7 pr-2 py-1.5 rounded-lg border border-gray-200 text-xs font-medium outline-none focus:border-blue-500" /></div>
                    </div>
                )}
            </div>

            {/* Tasto Filtri */}
            <button onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)} className={cn("flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-all active:scale-95", isFilterPanelOpen ? "bg-gray-900 text-white border-gray-900 shadow-md" : "bg-white text-gray-600 border-gray-200 shadow-sm")}>
                <Filter className="w-3 h-3" /> Filtri {excludedCategoryIds.length > 0 && <span className="bg-rose-500 w-1.5 h-1.5 rounded-full block animate-pulse" />}
            </button>
        </div>

        {/* PANNELLO FILTRI (Espandibile) */}
        {isFilterPanelOpen && (
            <div className="bg-gray-50 rounded-2xl p-4 animate-in slide-in-from-top-4 fade-in duration-200 border border-gray-100">
                <div className="flex justify-between items-center mb-3">
                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Mostra / Nascondi Categorie</p>
                    <button onClick={() => setExcludedCategoryIds([])} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:underline">Reset</button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {rootCategoriesList.map(cat => {
                        const isActive = !excludedCategoryIds.includes(cat.id)
                        return (
                            <button key={cat.id} onClick={() => toggleCategoryFilter(cat.id)} className={cn("text-[11px] px-3 py-1.5 rounded-full font-medium border transition-all active:scale-95", isActive ? "bg-white text-gray-900 border-gray-200 shadow-sm" : "bg-transparent text-gray-400 border-transparent line-through decoration-gray-300")}>
                                {cat.name}
                            </button>
                        )
                    })}
                </div>
            </div>
        )}
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        
        {/* 1. KPI CARDS (Minimaliste) */}
        <div className="grid grid-cols-3 gap-3">
            {/* Cash Flow */}
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                <div className={cn("p-2 rounded-full mb-2 bg-opacity-10", kpi.netSavings >= 0 ? "bg-emerald-500 text-emerald-600" : "bg-rose-500 text-rose-600")}>
                    <Activity className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Cash Flow</p>
                <p className={cn("text-sm font-black", kpi.netSavings >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {kpi.netSavings > 0 ? '+' : ''}{formatCurrency(kpi.netSavings)}
                </p>
            </div>
            {/* Risparmio */}
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                <div className="p-2 rounded-full mb-2 bg-blue-50 text-blue-600">
                    <PiggyBank className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Risparmio</p>
                <p className="text-sm font-black text-gray-900">{kpi.savingsRate.toFixed(1)}%</p>
            </div>
            {/* Burn Rate */}
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                <div className="p-2 rounded-full mb-2 bg-orange-50 text-orange-600">
                    <Flame className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Burn Rate</p>
                <p className="text-sm font-black text-gray-900">{formatCurrency(kpi.burnRate)}<span className="text-[9px] text-gray-400 font-medium">/gg</span></p>
            </div>
        </div>

        {/* 2. GRAFICO CASH FLOW (Clean) */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-1 h-4 bg-gray-900 rounded-full"></div>
                    Cash Flow Mensile
                </h2>
                {/* Legenda Custom */}
                <div className="flex gap-3">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span className="text-[10px] font-bold text-gray-500">In</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div><span className="text-[10px] font-bold text-gray-500">Out</span></div>
                </div>
            </div>
            <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashFlowData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} dy={10} stroke="#9ca3af" fontWeight={500} />
                        <Tooltip cursor={{ fill: '#f9fafb', radius: 4 }} content={<CustomTooltip />} />
                        <Bar dataKey={isUserPro && showNetIncome ? "netIncome" : "income"} name="Entrate" fill="#10b981" radius={[4, 4, 4, 4]} barSize={8} />
                        <Bar dataKey="expense" name="Uscite" fill="#ef4444" radius={[4, 4, 4, 4]} barSize={8} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* 3. ENTRATE (PIE CHART + TOGGLE P.IVA) */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 relative">
          <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                    Entrate
                </h2>
                {isUserPro && (
                    <button onClick={() => setShowNetIncome(!showNetIncome)} className={cn("text-[10px] font-bold px-2.5 py-1.5 rounded-full border transition-all flex items-center gap-1.5", showNetIncome ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-white text-gray-400 border-gray-200 hover:border-gray-300")}>
                        {showNetIncome ? <CheckCircle2 className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                        Netto Tasse
                    </button>
                )}
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center"><div className="w-32 h-32 bg-gray-100 rounded-full animate-pulse"></div></div>
          ) : processedIncome.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-xs border-2 border-dashed border-gray-100 rounded-xl bg-gray-50">Nessun dato nel periodo</div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={processedIncome}
                    cx="50%" cy="50%"
                    innerRadius={65} outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    onClick={(data) => setActiveDrillCategory(data)}
                    cursor="pointer"
                    stroke="none"
                  >
                    {processedIncome.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={activeDrillCategory?.id === entry.id ? 4 : 0} stroke={activeDrillCategory?.id === entry.id ? 'rgba(255,255,255,0.5)' : 'none'} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px', fontFamily: 'inherit' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-[50%] left-0 right-0 text-center pointer-events-none -translate-y-8">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Totale</p>
                  <p className="text-xl font-black text-gray-900">{formatCurrency(totalIncomeValue)}</p>
              </div>
            </div>
          )}
        </div>

        {/* 4. USCITE (PIE CHART) */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 relative">
          <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-1 h-4 bg-rose-500 rounded-full"></div>
                    Uscite
                </h2>
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center"><div className="w-32 h-32 bg-gray-100 rounded-full animate-pulse"></div></div>
          ) : processedExpenses.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-xs border-2 border-dashed border-gray-100 rounded-xl bg-gray-50">Nessun dato nel periodo</div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={processedExpenses}
                    cx="50%" cy="50%"
                    innerRadius={65} outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    onClick={(data) => setActiveDrillCategory(data)}
                    cursor="pointer"
                    stroke="none"
                  >
                    {processedExpenses.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={activeDrillCategory?.id === entry.id ? 4 : 0} stroke={activeDrillCategory?.id === entry.id ? 'rgba(255,255,255,0.5)' : 'none'} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-[50%] left-0 right-0 text-center pointer-events-none -translate-y-8">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Totale</p>
                  <p className="text-xl font-black text-gray-900">{formatCurrency(totalExpenseValue)}</p>
              </div>
            </div>
          )}
        </div>

        {/* 5. DRILL DOWN DETAIL (Appare quando clicchi una fetta) */}
        {activeDrillCategory && (
            <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 animate-in slide-in-from-bottom-4 relative z-30 ring-1 ring-black/5">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeDrillCategory.color }} />
                        <h3 className="text-lg font-black text-gray-900">{activeDrillCategory.name}</h3>
                    </div>
                    <button onClick={() => setActiveDrillCategory(null)} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"><X className="w-4 h-4 text-gray-500" /></button>
                </div>

                <div className="space-y-6">
                    {/* Sottocategorie */}
                    {activeDrillCategory.subCategories.size > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Ripartizione</p>
                            <div className="space-y-2">
                                {Array.from(activeDrillCategory.subCategories.entries()).sort((a,b)=>b[1]-a[1]).map(([name, val]) => (
                                    <div key={name} className="flex justify-between items-center text-sm py-1 border-b border-gray-50 last:border-0">
                                        <span className="text-gray-600 font-medium">{name}</span>
                                        <span className="font-bold text-gray-900">{formatCurrency(val)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Top Transactions */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Top 5 Transazioni</p>
                        <div className="space-y-2">
                            {activeDrillCategory.transactions.slice(0, 5).map(t => (
                                <div key={t.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <div className="overflow-hidden pr-2">
                                        <p className="text-xs font-bold text-gray-900 truncate">{t.description || 'Nessuna descrizione'}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(t.date)}</p>
                                    </div>
                                    <span className="text-xs font-black whitespace-nowrap">{formatCurrency(Math.abs(t.amount))}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* 6. TRADING P&L */}
        {Math.abs(tradingPL) > 0.01 && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col items-center text-center">
                <div className={cn("p-2.5 rounded-full mb-3", tradingPL >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                    <CandlestickChart className="w-5 h-5" />
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Trading P&L Realizzato</p>
                <p className={cn("text-3xl font-black tracking-tight", tradingPL >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {tradingPL > 0 ? '+' : ''}{formatCurrency(tradingPL)}
                </p>
            </div>
        )}

        {/* 7. ASSET ALLOCATION */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <div className="w-1 h-4 bg-blue-600 rounded-full"></div>
                  Asset Allocation
              </h2>
              <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
                  <Wallet className="w-4 h-4" />
              </div>
          </div>

          {investmentData.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-100 rounded-xl bg-gray-50">
              <p className="text-gray-400 text-xs font-medium">Nessun investimento</p>
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={investmentData}
                    cx="50%" cy="50%"
                    innerRadius={0} // PIE PIENA
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderCustomizedLabel}
                    labelLine={true}
                    stroke="white"
                    strokeWidth={2}
                  >
                    {investmentData.map((entry, index) => <Cell key={`cell-inv-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip 
                    content={<CustomTooltip />}
                    formatter={(value: any) => [
                        `${formatCurrency(Number(value || 0))} (${(((Number(value) || 0) / (totalInvestments || 1)) * 100).toFixed(1)}%)`,
                        'Valore'
                    ]}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 8. NET WORTH CHART */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-1 h-4 bg-indigo-600 rounded-full"></div>
                    Trend Patrimonio
                </h2>
                <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                    <TrendingUp className="w-4 h-4" />
                </div>
            </div>
            
            <div className="flex bg-gray-50 p-1 rounded-xl">
              {(['1M', '3M', '6M', 'YTD', 'ALL'] as const).map((range) => (
                <button 
                    key={range} 
                    onClick={() => setLineRange(range)} 
                    className={cn(
                        "flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all", 
                        lineRange === range ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                    )}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {netWorthData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-300 text-xs border-2 border-dashed border-gray-100 rounded-xl bg-gray-50">Nessun dato storico</div>
          ) : (
            <div className="h-[250px] w-full -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={netWorthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#9ca3af" fontSize={10} tickFormatter={(value) => `€${value/1000}k`} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="netWorth" stroke={primaryColor || '#3b82f6'} strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0, fill: primaryColor || '#3b82f6' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}