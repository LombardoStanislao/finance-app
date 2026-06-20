import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, TrendingUp, Wallet, Settings, Activity, ChevronDown, Calendar, PiggyBank, Flame, ChevronRight, ArrowRight, Layers } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts'
import { supabase, type Category, type Transaction } from '../lib/supabase'
import { formatCurrency, cn, formatDate, calculateLiquidity } from '../lib/utils'
import { useAuth } from '../context/AuthContext'


interface StatisticsProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

// --- INTERFACCE DATI ---
interface ProcessedTransaction extends Transaction {
  subCategoryName?: string | null
}

interface CategoryData {
  id: string
  name: string
  value: number
  color: string
  transactions: ProcessedTransaction[]
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
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-gray-100/50 text-xs ring-1 ring-black/5">
        <p className="font-bold text-gray-500 mb-2 uppercase tracking-wide">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: entry.color || entry.fill }} />
              <span className="text-gray-600 font-medium">{entry.name}:</span>
              <span className="text-gray-900 font-black ml-auto">
                {formatter ? formatter(entry.value) : formatCurrency(entry.value)}
              </span>
            </div>
          ))}
        </div>
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
  const { user } = useAuth()


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

  // Stati Nuove Funzionalità UI Premium
  const [showNetIncome, setShowNetIncome] = useState(false)
  const [activeDrillCategory, setActiveDrillCategory] = useState<CategoryData | null>(null)
  const [activeSubCategory, setActiveSubCategory] = useState<string | null>(null)

  // Init
  useEffect(() => {
    if (user) {
      loadInitialData()
      loadInvestmentData()
    }
  }, [user])

  // Reload Transazioni
  useEffect(() => {
    if (allCategories.length > 0 && user) {
      loadTransactionsInRange()
    }
  }, [pieRange, selectedMonth, selectedYear, customStart, customEnd, allCategories, user])

  // Reload Net Worth
  useEffect(() => {
    if (user) {
      loadNetWorthData()
    }
  }, [lineRange, user])

  async function loadInitialData() {
    try {
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
        const sm = String(selectedMonth).padStart(2, '0')
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
        startDate = `${selectedYear}-${sm}-01T00:00:00.000Z`
        endDate = `${selectedYear}-${sm}-${lastDay}T23:59:59.999Z`
      } else if (pieRange === '6M') {
        const now = new Date()
        const prev = new Date(now.getFullYear(), now.getMonth() - 5, 1)
        const smStart = String(prev.getMonth() + 1).padStart(2, '0')
        const smEnd = String(now.getMonth() + 1).padStart(2, '0')
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        startDate = `${prev.getFullYear()}-${smStart}-01T00:00:00.000Z`
        endDate = `${now.getFullYear()}-${smEnd}-${lastDay}T23:59:59.999Z`
      } else if (pieRange === 'YEAR') {
        startDate = `${selectedYear}-01-01T00:00:00.000Z`
        endDate = `${selectedYear}-12-31T23:59:59.999Z`
      } else {
        if (!customStart || !customEnd) { setLoading(false); return }
        startDate = `${customStart}T00:00:00.000Z`
        endDate = `${customEnd}T23:59:59.999Z`
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
      setActiveSubCategory(null)

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

      const { data: allTransactionsRaw, error } = await supabase
        .from('transactions')
        .select('amount, type, date')
        .in('type', ['income', 'expense', 'initial'])
        .eq('user_id', user.id)
        .order('date', { ascending: true })

      if (error) throw error

      const { data: investments } = await supabase.from('investments').select('current_value').eq('user_id', user.id)
      const investmentsTotal = investments?.reduce((sum, inv) => sum + (inv.current_value || 0), 0) || 0

      const { data: rawForLiq } = await supabase.from('transactions').select('*').eq('user_id', user.id)
      const currentLiquidity = calculateLiquidity(rawForLiq || [])
      // I buckets (salvadanai) sono liquidità accantonata, NON patrimonio aggiuntivo
      const realTargetNetWorthToday = currentLiquidity + investmentsTotal

      let runningBookValue = 0
      const dailyPoints = new Map<string, { nw: number, inc: number, exp: number }>()

      allTransactionsRaw?.forEach(t => {
        const d = t.date.split('T')[0]
        runningBookValue += Number(t.amount)

        if (!dailyPoints.has(d)) {
          dailyPoints.set(d, { nw: runningBookValue, inc: 0, exp: 0 })
        } else {
          dailyPoints.get(d)!.nw = runningBookValue
        }

        if (t.type === 'income') dailyPoints.get(d)!.inc += Number(t.amount)
        else if (t.type === 'expense') dailyPoints.get(d)!.exp += Math.abs(Number(t.amount))
      })

      const bookValueToday = runningBookValue
      const diffToRealNetWorth = realTargetNetWorthToday - bookValueToday

      const netWorthPoints: NetWorthDataPoint[] = []
      const startStr = startDate.toISOString().split('T')[0]

      let previousNWForMissing = 0
      for (const [d, vals] of dailyPoints.entries()) {
        if (d < startStr) previousNWForMissing = vals.nw
      }

      const filteredDates = Array.from(dailyPoints.entries()).filter(([d]) => d >= startStr)

      if (filteredDates.length === 0) {
        netWorthPoints.push({
          date: new Date().toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }),
          netWorth: previousNWForMissing + diffToRealNetWorth,
          income: 0,
          expenses: 0
        })
      } else {
        filteredDates.forEach(([d, vals]) => {
          netWorthPoints.push({
            date: new Date(d).toLocaleDateString('it-IT', { month: 'short', day: 'numeric' }),
            netWorth: vals.nw + diffToRealNetWorth,
            income: vals.inc,
            expenses: vals.exp
          })
        })
      }

      setNetWorthData(netWorthPoints)
    } catch (error) { console.error(error) }
  }

  const { processedIncome, processedExpenses, kpi, cashFlowData } = useMemo(() => {

    // Rimosso il filtro categorie escluse che creava problemi di UX

    const incMap = new Map<string, CategoryData>()
    const expMap = new Map<string, CategoryData>()
    const cfMap = new Map<string, { inc: number, exp: number, tax: number }>()

    let totalIncome = 0
    let totalExpense = 0
    let totalTaxTransfers = 0

    allTransactions.forEach(t => {
      const amount = Number(t.amount)
      const absAmount = Math.abs(amount)

      const dateKey = t.date.substring(0, 7) // "YYYY-MM" dal prefisso ISO

      if (!cfMap.has(dateKey)) cfMap.set(dateKey, { inc: 0, exp: 0, tax: 0 })
      const cfEntry = cfMap.get(dateKey)!

      if (t.type === 'transfer' && t.bucket_id && taxBucketIds.includes(t.bucket_id)) {
        totalTaxTransfers += absAmount
        cfEntry.tax += absAmount
        return
      }

      // Nascondiamo solo i transfer normali puri (da bucket a bucket ecc)
      if (t.type !== 'income' && t.type !== 'expense' && t.type !== 'initial') return;

      // Aggancio Categoria Perfetto e Inclusivo (anche quelle nulle)
      let rootId = 'uncategorized'
      let rootName = 'Generali / Non Categorizzate'
      let subName = null

      if (t.category_id) {
        let root = allCategories.find(c => c.id === t.category_id)
        if (root && root.parent_id) {
          subName = root.name
          const parent = allCategories.find(c => c.id === root?.parent_id)
          if (parent) root = parent
        }

        if (root) {
          rootId = root.id
          rootName = root.name
        }
      }

      if (t.type === 'expense') {
        totalExpense += absAmount
        cfEntry.exp += absAmount

        if (!expMap.has(rootId)) expMap.set(rootId, { id: rootId, name: rootName, value: 0, color: '', transactions: [], subCategories: new Map() })
        const entry = expMap.get(rootId)!
        entry.value += absAmount
        entry.transactions.push({ ...t, subCategoryName: subName })
        if (subName) entry.subCategories.set(subName, (entry.subCategories.get(subName) || 0) + absAmount)

      } else if (t.type === 'income') {
        totalIncome += absAmount
        cfEntry.inc += absAmount

        if (!incMap.has(rootId)) incMap.set(rootId, { id: rootId, name: rootName, value: 0, color: '', transactions: [], subCategories: new Map() })
        const entry = incMap.get(rootId)!
        entry.value += absAmount
        entry.transactions.push({ ...t, subCategoryName: subName })
        if (subName) entry.subCategories.set(subName, (entry.subCategories.get(subName) || 0) + absAmount)
      }
    })

    const finalizeMap = (map: Map<string, CategoryData>) => Array.from(map.values())
      .sort((a, b) => b.value - a.value)
      .map((item, idx) => ({ ...item, color: COLORS[idx % COLORS.length] }))

    const cashFlow = Array.from(cfMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => ({
        date: new Date(d + '-01').toLocaleDateString('it-IT', { month: 'short' }), // O mese/anno
        ...v,
        netIncome: Math.max(0, v.inc - v.tax),
        expense: v.exp
      }))

    const incomeForCalc = (isUserPro && showNetIncome) ? (totalIncome - totalTaxTransfers) : totalIncome
    const netSavings = incomeForCalc - totalExpense
    const savingsRate = incomeForCalc > 0 ? (netSavings / incomeForCalc) * 100 : 0

    const days = Math.max(1, (new Date(pieRange === 'CUSTOM' ? customEnd : new Date().toISOString()).getTime() - new Date(pieRange === 'CUSTOM' ? customStart : pieRange === 'MONTH' ? new Date(selectedYear, selectedMonth - 1, 1).toISOString() : new Date(new Date().getFullYear(), 0, 1).toISOString()).getTime()) / (86400000))
    const burnRate = totalExpense / days

    return {
      processedIncome: finalizeMap(incMap),
      processedExpenses: finalizeMap(expMap),
      kpi: { netSavings, savingsRate, burnRate },
      cashFlowData: cashFlow
    }

  }, [allTransactions, allCategories, showNetIncome, isUserPro, taxBucketIds, pieRange, customStart, customEnd, selectedMonth, selectedYear])

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const years = [2024, 2025, 2026]

  const totalIncomeValue = processedIncome.reduce((sum, item) => sum + item.value, 0)
  const totalExpenseValue = processedExpenses.reduce((sum, item) => sum + item.value, 0)
  const totalInvestments = investmentData.reduce((sum, item) => sum + item.value, 0)

  const singleMonthFlow = pieRange === 'MONTH' && cashFlowData.length === 1 ? cashFlowData[0] : null;

  // RENDER PER IL DRILL DOWN (Sottocategorie Master/Detail View)
  if (activeDrillCategory) {
    const isIncome = processedIncome.find(i => i.id === activeDrillCategory.id)

    let displayValue = activeDrillCategory.value
    let transactionsToDisplay = activeDrillCategory.transactions

    if (activeSubCategory) {
      displayValue = activeDrillCategory.subCategories.get(activeSubCategory) || 0
      transactionsToDisplay = activeDrillCategory.transactions.filter(t => t.subCategoryName === activeSubCategory)
    }

    return (
      <div className="min-h-screen bg-gray-50 pb-24 animate-in slide-in-from-right-10 duration-200 fade-in">
        {/* HEADER DETAIL */}
        <div className="bg-white sticky top-0 z-10 border-b border-gray-100 px-4 py-4 shadow-sm flex items-center justify-between pt-safe">
          <div className="flex items-center gap-3">
            <button onClick={() => {
              if (activeSubCategory) setActiveSubCategory(null)
              else setActiveDrillCategory(null)
            }} className="p-2 -ml-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: activeDrillCategory.color }} />
              <h1 className="text-lg font-black text-gray-900 leading-none truncate max-w-[200px]">
                {activeSubCategory ? `${activeSubCategory}` : activeDrillCategory.name}
              </h1>
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto px-4 py-6 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Totale Periodo</p>
            <p className={cn("text-3xl font-black tracking-tight", isIncome ? "text-emerald-600" : "text-rose-600")}>
              {isIncome ? "+" : "-"}{formatCurrency(displayValue)}
            </p>
          </div>

          {/* Sottocategorie Breakdown */}
          {!activeSubCategory && activeDrillCategory.subCategories.size > 0 && (
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4" /> Ripartizione Esatta
              </h3>
              <div className="space-y-3">
                {Array.from(activeDrillCategory.subCategories.entries()).sort((a, b) => b[1] - a[1]).map(([name, val]) => (
                  <button
                    key={name}
                    onClick={() => setActiveSubCategory(name)}
                    className="w-full flex justify-between items-center group bg-gray-50/50 hover:bg-gray-100 p-3 rounded-xl border border-gray-100/50 transition-all active:scale-[0.98]"
                  >
                    <span className="text-gray-700 font-medium text-sm group-hover:text-gray-900 transition-colors">{name}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(val / activeDrillCategory.value) * 100}%`, backgroundColor: activeDrillCategory.color }} />
                      </div>
                      <span className="font-bold text-gray-900 w-16 text-right whitespace-nowrap">{formatCurrency(val)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Top Transazioni */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-2 flex items-center gap-2">
              Ultime Transazioni Registrate
            </h3>
            <div className="space-y-2">
              {transactionsToDisplay.map(t => (
                <div key={t.id} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm active:scale-[0.98] transition-transform">
                  <div className="overflow-hidden pr-2 flex flex-col justify-center">
                    <p className="text-sm font-bold text-gray-900 truncate">{t.description || 'Nessuna descrizione'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-gray-400 font-medium">{formatDate(t.date)}</p>
                      {!activeSubCategory && t.subCategoryName && (
                        <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">{t.subCategoryName}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-black whitespace-nowrap">{formatCurrency(Math.abs(t.amount))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // RENDER VISTA PRINCIPALE
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER & CONTROLLI */}
      <div className="bg-white/80 backdrop-blur-lg sticky top-0 z-40 border-b border-gray-100/50 px-4 py-4 flex flex-col gap-5 shadow-sm pt-safe">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2.5 -ml-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors active:scale-95">
              <ArrowLeft className="w-5 h-5 text-gray-900" />
            </button>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Analisi</h1>
          </div>
          <button onClick={onOpenSettings} className="p-2.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 transition-colors active:scale-95">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* TIME CONTROLS (Pills iOS Style) */}
        <div className="flex flex-col gap-4">
          {/* Slider Orizzontale Frequenza */}
          <div className="bg-gray-200/50 p-1.5 rounded-2xl flex gap-1 relative">
            {(['MONTH', '6M', 'YEAR', 'CUSTOM'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setPieRange(r)}
                className={cn(
                  "flex-1 py-2 text-[11px] font-bold rounded-xl transition-all duration-300 text-center tracking-wide z-10",
                  pieRange === r ? "bg-white text-gray-900 shadow-sm transform scale-100" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 transform scale-95"
                )}
              >
                {r === 'MONTH' ? 'Mese' : r === '6M' ? '6 Mesi' : r === 'YEAR' ? 'Anno' : 'Periodo'}
              </button>
            ))}
          </div>

          {/* Selettori Interni Eleganti */}
          <div className="flex items-center gap-2">
            {pieRange === 'MONTH' && (
              <>
                <div className="relative group bg-gray-50 border border-gray-200/50 hover:border-gray-300 rounded-xl px-3 py-1.5 flex items-center gap-1 cursor-pointer transition-colors">
                  <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="appearance-none bg-transparent text-sm font-bold text-gray-900 outline-none cursor-pointer w-full z-10">
                    {months.map(m => <option key={m} value={m}>{new Date(2000, m - 1).toLocaleDateString('it-IT', { month: 'long' }).toUpperCase()}</option>)}
                  </select>
                  <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 pointer-events-none" />
                </div>
                <div className="relative group bg-gray-50 border border-gray-200/50 hover:border-gray-300 rounded-xl pl-3 pr-6 py-1.5 flex items-center cursor-pointer transition-colors">
                  <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="appearance-none bg-transparent text-sm font-bold text-gray-900 outline-none cursor-pointer w-full z-10 w-12">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 pointer-events-none" />
                </div>
              </>
            )}
            {pieRange === 'YEAR' && (
              <div className="relative group bg-gray-50 border border-gray-200/50 hover:border-gray-300 rounded-xl pl-4 pr-8 py-2 flex items-center cursor-pointer transition-colors">
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="appearance-none bg-transparent text-sm font-bold text-gray-900 outline-none cursor-pointer w-full z-10">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 pointer-events-none" />
              </div>
            )}
            {pieRange === 'CUSTOM' && (
              <div className="flex items-center gap-2 w-full">
                <div className="relative flex-1"><Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary" /><input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-full bg-gray-50 pl-9 pr-2 py-2 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all border border-gray-100" /></div>
                <ArrowRight className="w-3 h-3 justify-center text-gray-300 flex-none" />
                <div className="relative flex-1"><Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary" /><input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-full bg-gray-50 pl-9 pr-2 py-2 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all border border-gray-100" /></div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">

        {/* 1. KPI CARDS (Nuovo Design Glassmorphism) */}
        {loading ? (
          <div className="h-24 bg-gray-200 rounded-3xl animate-pulse"></div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-gradient-to-br from-gray-50 to-white rounded-3xl shadow-sm border border-gray-200/50 flex flex-col items-center justify-center text-center">
              <div className={cn("p-2 rounded-xl mb-2.5", kpi.netSavings >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600")}>
                <Activity className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 shadow-sm">Cash Flow</p>
              <p className={cn("text-xs font-black truncate max-w-full", kpi.netSavings >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {kpi.netSavings > 0 ? '+' : ''}{formatCurrency(kpi.netSavings)}
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-gray-50 to-white rounded-3xl shadow-sm border border-gray-200/50 flex flex-col items-center justify-center text-center">
              <div className="p-2 rounded-xl mb-2.5 bg-blue-100 text-blue-600">
                <PiggyBank className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 shadow-sm">Risparmio</p>
              <p className="text-sm font-black text-gray-900">{kpi.savingsRate.toFixed(0)}%</p>
            </div>

            <div className="p-4 bg-gradient-to-br from-gray-50 to-white rounded-3xl shadow-sm border border-gray-200/50 flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <div className="p-2 rounded-xl mb-2.5 bg-orange-100 text-orange-600 relative z-10 group-hover:scale-110 transition-transform">
                <Flame className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 shadow-sm relative z-10">Burn Rate</p>
              <p className="text-[11px] font-black text-gray-900 relative z-10">{formatCurrency(kpi.burnRate)}<span className="text-[9px] text-gray-400 font-bold">/gg</span></p>
            </div>
          </div>
        )}

        {/* 2. GRAFICO CASH FLOW MENSILE (Restyling Netto) */}
        {!loading && cashFlowData.length > 0 && (
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-200/50">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-gray-900 rounded-full"></div>
                Flusso Monetario
              </h2>
              {!singleMonthFlow && (
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-sm"></div><span className="text-[11px] font-bold text-gray-400 uppercase">In</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#ef4444] shadow-sm"></div><span className="text-[11px] font-bold text-gray-400 uppercase">Out</span></div>
                </div>
              )}
            </div>

            {singleMonthFlow ? (
              <div className="flex flex-col gap-6">
                <div className="flex justify-between items-end">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Totale Entrate</span>
                    <span className="text-xl font-black text-emerald-500">{formatCurrency(isUserPro && showNetIncome ? singleMonthFlow.netIncome : singleMonthFlow.inc)}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Totale Uscite</span>
                    <span className="text-xl font-black text-rose-500">{formatCurrency(singleMonthFlow.exp)}</span>
                  </div>
                </div>

                <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
                  {(() => {
                    const inc = isUserPro && showNetIncome ? singleMonthFlow.netIncome : singleMonthFlow.inc;
                    const exp = singleMonthFlow.exp;
                    const total = Math.max(inc + exp, 1);
                    return (
                      <>
                        <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${(inc / total) * 100}%` }} />
                        <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${(exp / total) * 100}%` }} />
                      </>
                    )
                  })()}
                </div>
              </div>
            ) : (
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashFlowData} barGap={4} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="date" fontSize={11} axisLine={false} tickLine={false} dy={12} stroke="#9ca3af" fontWeight={600} />
                    <Tooltip cursor={{ fill: '#f9fafb', radius: 8 }} content={<CustomTooltip />} />
                    <Bar dataKey={isUserPro && showNetIncome ? "netIncome" : "inc"} name="Entrate" fill="#10b981" radius={[6, 6, 6, 6]} barSize={12} />
                    <Bar dataKey="exp" name="Uscite" fill="#ef4444" radius={[6, 6, 6, 6]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* 3. USCITE (Donut Visuale + Lista Category Interattiva) */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-200/50">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <div className="w-1.5 h-4 bg-rose-500 rounded-full"></div>
              Ripartizione Uscite <span className="text-[10px] font-medium text-gray-400 capitalize ml-1">({
                pieRange === 'MONTH' ? new Date(2000, selectedMonth - 1).toLocaleDateString('it-IT', { month: 'long' }) :
                  pieRange === '6M' ? 'Ultimi 6 Mesi' : pieRange === 'YEAR' ? selectedYear : 'Periodo'
              })</span>
            </h2>
            <span className="text-sm font-black text-rose-500 bg-rose-50 px-3 py-1 rounded-xl whitespace-nowrap ml-2">
              {formatCurrency(totalExpenseValue)}
            </span>
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center"><div className="w-24 h-24 border-4 border-gray-100 border-t-rose-500 rounded-full animate-spin"></div></div>
          ) : processedExpenses.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-gray-300 font-medium text-xs mt-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50">Nessuna uscita nel periodo</div>
          ) : (
            <>
              <div className="h-[200px] relative mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={processedExpenses}
                      cx="50%" cy="50%"
                      innerRadius={65} outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="white"
                      strokeWidth={2}
                      isAnimationActive={true}
                      onClick={(_, index) => setActiveDrillCategory(processedExpenses[index])}
                      className="cursor-pointer"
                    >
                      {processedExpenses.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity outline-none" />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* LISTA SOTTOCATEGORIE COME PULSANTI */}
              <div className="mt-6 flex flex-col gap-2">
                {processedExpenses.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveDrillCategory(p)}
                    className="flex justify-between items-center bg-gray-50/50 hover:bg-gray-100 p-3 rounded-2xl border border-gray-100/50 transition-all active:scale-[0.98] group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shadow-sm group-hover:scale-125 transition-transform" style={{ backgroundColor: p.color }} />
                      <span className="font-bold text-gray-700 text-sm">{p.name}</span>
                      {p.subCategories.size > 0 && <span className="bg-gray-200 text-gray-500 text-[9px] font-black px-1.5 py-0.5 rounded-full">{p.subCategories.size}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-gray-900 text-sm">{formatCurrency(p.value)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>


        {/* 4. ENTRATE (Donut Visuale + Lista Category Interattiva) */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-200/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
                Origine Entrate <span className="text-[10px] font-medium text-gray-400 capitalize ml-1">({
                  pieRange === 'MONTH' ? new Date(2000, selectedMonth - 1).toLocaleDateString('it-IT', { month: 'long' }) :
                    pieRange === '6M' ? 'Ultimi 6 Mesi' : pieRange === 'YEAR' ? selectedYear : 'Periodo'
                })</span>
              </h2>
              {isUserPro && (
                <button onClick={() => setShowNetIncome(!showNetIncome)} className={cn("text-[9px] font-bold px-2 py-1 rounded-lg border transition-all mt-1 w-max", showNetIncome ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-gray-400 border-gray-200")}>
                  {showNetIncome ? "Mostrando Netto" : "Mostra Netto (P.IVA)"}
                </button>
              )}
            </div>

            <span className="text-sm font-black text-emerald-500 bg-emerald-50 px-3 py-1 rounded-xl shadow-sm border border-emerald-100/50">
              {formatCurrency(totalIncomeValue)}
            </span>
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center"><div className="w-24 h-24 border-4 border-gray-100 border-t-emerald-500 rounded-full animate-spin"></div></div>
          ) : processedIncome.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-gray-300 font-medium text-xs mt-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50">Nessuna entrata nel periodo</div>
          ) : (
            <>
              <div className="h-[200px] relative mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={processedIncome}
                      cx="50%" cy="50%"
                      innerRadius={65} outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="white"
                      strokeWidth={2}
                      isAnimationActive={true}
                      onClick={(_, index) => setActiveDrillCategory(processedIncome[index])}
                      className="cursor-pointer"
                    >
                      {processedIncome.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity outline-none" />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* LISTA SOTTOCATEGORIE COME PULSANTI */}
              <div className="mt-6 flex flex-col gap-2">
                {processedIncome.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveDrillCategory(p)}
                    className="flex justify-between items-center bg-gray-50/50 hover:bg-gray-100 p-3 rounded-2xl border border-gray-100/50 transition-all active:scale-[0.98] group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shadow-sm group-hover:scale-125 transition-transform" style={{ backgroundColor: p.color }} />
                      <span className="font-bold text-gray-700 text-sm">{p.name}</span>
                      {p.subCategories.size > 0 && <span className="bg-gray-200 text-gray-500 text-[9px] font-black px-1.5 py-0.5 rounded-full">{p.subCategories.size}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-gray-900 text-sm">{formatCurrency(p.value)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 5. TRADING P&L (Solo se presente) */}
        {/* 6. ASSET ALLOCATION */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-200/50">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div>
              Asset Allocation
            </h2>
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
              <Wallet className="w-4 h-4" />
            </div>
          </div>

          {investmentData.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50">
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Nessun investimento</p>
            </div>
          ) : (
            <div className="h-[250px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={investmentData}
                    cx="50%" cy="50%"
                    innerRadius={0} // PIE PIENA (Premium Look)
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderCustomizedLabel}
                    labelLine={false}
                    stroke="white"
                    strokeWidth={3}
                    className="cursor-pointer"
                  >
                    {investmentData.map((entry, index) => <Cell key={`cell-inv-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity outline-none" />)}
                  </Pie>
                  <Tooltip
                    content={<CustomTooltip />}
                    formatter={(value: any) => [
                      `${formatCurrency(Number(value || 0))} (${(((Number(value) || 0) / (totalInvestments || 1)) * 100).toFixed(1)}%)`,
                      'Valore'
                    ]}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px', fontWeight: '600', color: '#4b5563' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 7. NET WORTH CHART (Vero Storico Compatto) */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-200/50 mb-8">
          <div className="flex flex-col gap-5 mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div>
                Trend Patrimonio
              </h2>
              <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>

            <div className="flex bg-gray-50 p-1.5 rounded-xl border border-gray-100">
              {(['1M', '3M', '6M', 'YTD', 'ALL'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setLineRange(range)}
                  className={cn(
                    "flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                    lineRange === range ? "bg-white text-indigo-600 shadow-sm border border-gray-200/50" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {netWorthData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-300 text-xs border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50 font-bold uppercase tracking-widest">Nessun dato storico</div>
          ) : (
            <div className="h-[250px] w-full -ml-5">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={netWorthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} dy={12} minTickGap={20} fontWeight={600} />
                  <YAxis stroke="#9ca3af" fontSize={10} tickFormatter={(value) => `€${Math.round(value / 1000)}k`} tickLine={false} axisLine={false} dx={-5} fontWeight={600} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="netWorth" name="Patrimonio Totale" stroke={primaryColor || '#6366f1'} strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0, fill: primaryColor || '#6366f1' }} animationDuration={1000} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}