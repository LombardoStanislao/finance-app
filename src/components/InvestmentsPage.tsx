import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Trash2, X, TrendingUp, PieChart, Landmark, Bitcoin, Box, ScrollText, Settings, RefreshCw, PenLine, Loader2, BookOpen, ArrowDown, ArrowUp, History, Info, Wallet, Calculator } from 'lucide-react'
import { supabase, type Investment, type Transaction } from '../lib/supabase'
import { formatCurrency, formatDate, cn } from '../lib/utils'

interface InvestmentsPageProps {
  onBack: () => void
  onOpenSettings: () => void
  onOpenGuide: () => void
  primaryColor: string
}

interface InvestmentExtended extends Investment {
    invested_amount?: number
}

export default function InvestmentsPage({ onBack, onOpenSettings, onOpenGuide, primaryColor }: InvestmentsPageProps) {
  const [investments, setInvestments] = useState<InvestmentExtended[]>([])
  const [loading, setLoading] = useState(true)
  const [currentLiquidity, setCurrentLiquidity] = useState(0)
  
  // Rate Limiting
  const [minutesRemaining, setMinutesRemaining] = useState<number>(0)
  const [isUpdating, setIsUpdating] = useState(false)

  // Modals State
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  
  const [selectedInvestment, setSelectedInvestment] = useState<InvestmentExtended | null>(null)
  const [investmentHistory, setInvestmentHistory] = useState<Transaction[]>([])
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<Investment['type']>('ETF')
  
  // Campi Finanziari
  const [isManual, setIsManual] = useState(false)
  const [formTicker, setFormTicker] = useState('')
  const [formQuantity, setFormQuantity] = useState('')
  
  // Logica Switch
  const [isNewPurchase, setIsNewPurchase] = useState(true) 
  const [formTotalSpent, setFormTotalSpent] = useState('') 
  const [formFees, setFormFees] = useState('') 
  const [formPMC, setFormPMC] = useState('') 
  
  const [formLoading, setFormLoading] = useState(false)

  const supportsAutomation = ['ETF', 'Azioni', 'Crypto'].includes(formType)

  const categoriesConfig = [
    { type: 'ETF', label: 'ETF', icon: PieChart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { type: 'Azioni', label: 'Azioni', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { type: 'Obbligazioni', label: 'Obbligazioni / BTP', icon: ScrollText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { type: 'Crypto', label: 'Criptovalute', icon: Bitcoin, color: 'text-orange-500', bg: 'bg-orange-50' },
    { type: 'Conto Deposito', label: 'Conti Deposito', icon: Landmark, color: 'text-purple-600', bg: 'bg-purple-50' },
    { type: 'Altro', label: 'Altro', icon: Box, color: 'text-gray-600', bg: 'bg-gray-50' },
  ] as const

  const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100

  // --- CALCOLI DERIVATI ---
  const spentVal = parseFloat(formTotalSpent) || 0
  const qtyVal = parseFloat(formQuantity) || 0
  const pmcVal = parseFloat(formPMC) || 0

  const calculatedPMC = (qtyVal > 0 && spentVal > 0) ? (spentVal / qtyVal) : 0
  const calculatedTotalInvested = pmcVal * qtyVal

  useEffect(() => {
    loadInvestments()
    fetchLiquidity()
    checkCooldown()
  }, [])

  useEffect(() => {
    if (isNewPurchase && calculatedPMC > 0) {
        setFormPMC(calculatedPMC.toFixed(2))
    }
  }, [calculatedPMC, isNewPurchase])

  async function fetchLiquidity() {
      try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return
          const { data } = await supabase.from('transactions').select('amount').eq('user_id', user.id)
          const total = (data || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
          setCurrentLiquidity(total)
      } catch (error) { console.error("Err liquidity", error) }
  }

  async function loadInvestments() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase.from('investments').select('*').eq('user_id', user.id).order('current_value', { ascending: false })
      if (error) throw error
      setInvestments(data || [])
    } catch (error) { console.error(error) } 
    finally { setLoading(false) }
  }

  async function loadHistory(invId: string) {
      const { data } = await supabase.from('transactions')
        .select('*')
        .eq('investment_id', invId)
        .order('date', { ascending: false })
      setInvestmentHistory(data || [])
  }

  async function checkCooldown() {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase.from('profiles').select('last_api_call').eq('id', user.id).maybeSingle()
        if (profile?.last_api_call) {
            const last = new Date(profile.last_api_call)
            const diffMs = new Date().getTime() - last.getTime()
            const diffMins = Math.floor(diffMs / 60000)
            if (diffMins < 60) setMinutesRemaining(60 - diffMins)
            else setMinutesRemaining(0)
        }
    } catch (error) { console.error(error) }
  }

  async function handleUpdatePrices() {
    if (minutesRemaining > 0) { alert(`Attendi ${minutesRemaining} min.`); return }
    setIsUpdating(true)
    try {
        const { error, data } = await supabase.functions.invoke('update-prices')
        if (error) throw error
        if (data && data.message === 'Cooldown active') {
             alert(`Limite orario attivo.`)
             await checkCooldown()
             return
        }
        const count = data?.updated || 0
        alert(`Aggiornati ${count} asset.`)
        await loadInvestments() 
        await checkCooldown()
    } catch (error: any) { alert('Errore aggiornamento.') } 
    finally { setIsUpdating(false) }
  }

  // --- FUNZIONE HELPER PER CATEGORIA INVESTIMENTI ---
  async function getOrCreateInvestmentCategory(userId: string): Promise<string> {
      // 1. Cerca se esiste già
      const { data: existing } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('name', 'Investimenti')
          .eq('type', 'expense') // Deve essere un'uscita
          .maybeSingle()
      
      if (existing) return existing.id

      // 2. Se non esiste, creala
      const { data: newCat, error } = await supabase
          .from('categories')
          .insert({
              user_id: userId,
              name: 'Investimenti',
              type: 'expense',
              budget_limit: null,
              parent_id: null
          })
          .select('id')
          .single()
      
      if (error) throw error
      return newCat.id
  }

  async function handleSaveAsset(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')

      const isAutomated = supportsAutomation && !isManual
      
      const qty = round2(parseFloat(formQuantity) || 0)
      const fees = round2(Math.max(0, parseFloat(formFees) || 0)) 
      
      let investedAmount = 0
      let currentTotalVal = 0
      let finalTicker = isAutomated ? formTicker.toUpperCase().trim() : null
      
      // Controllo Liquidità
      if (isNewPurchase && !editingId) {
          const totalCost = round2((parseFloat(formTotalSpent) || 0) + fees)
          if (totalCost > 0 && totalCost > currentLiquidity) {
              throw new Error(`Fondi insufficienti! Hai ${formatCurrency(currentLiquidity)}, ma l'operazione richiede ${formatCurrency(totalCost)}.`)
          }
      }

      if (!editingId) {
          if (isNewPurchase) {
              investedAmount = round2(parseFloat(formTotalSpent) || 0)
          } else {
              investedAmount = round2(calculatedTotalInvested)
          }

          if (isAutomated && finalTicker) {
              const { data, error } = await supabase.functions.invoke('update-prices', { body: { symbol: finalTicker } })
              if (error || data?.error) throw new Error('Ticker non trovato o errore API.')
              if (data?.price) {
                  const marketPrice = parseFloat(data.price)
                  currentTotalVal = round2(marketPrice * qty)
                  if (!formName && data.name) setFormName(data.name)
              }
          } else {
              currentTotalVal = investedAmount
          }
      }

      if (editingId) {
          const updateData: any = {
              name: formName,
              type: formType,
              ticker: finalTicker,
              is_automated: isAutomated,
              updated_at: new Date().toISOString()
          }

          if (isAutomated && finalTicker) {
             const { data, error } = await supabase.functions.invoke('update-prices', { body: { symbol: finalTicker } })
             if (!error && !data?.error && data?.price) {
                 const { data: currentAsset } = await supabase.from('investments').select('quantity').eq('id', editingId).single()
                 if (currentAsset) {
                     const marketPrice = parseFloat(data.price)
                     updateData.current_value = round2(marketPrice * (currentAsset.quantity || 0))
                 }
             }
          }

          const { error } = await supabase.from('investments').update(updateData).eq('id', editingId)
          if (error) throw error

      } else {
          // --- NUOVO o COMPRA ANCORA ---
          let targetInvestmentId = selectedInvestment?.id

          if (!targetInvestmentId) {
              // NUOVO ASSET
              if (finalTicker) {
                  const { data: existing } = await supabase.from('investments').select('id').eq('user_id', user.id).eq('ticker', finalTicker).maybeSingle()
                  if (existing) throw new Error('Ticker già presente. Usa "Compra Ancora".')
              }

              const { data: newAsset, error } = await supabase.from('investments').insert({
                  user_id: user.id,
                  name: formName || finalTicker || 'Asset',
                  type: formType,
                  ticker: finalTicker,
                  is_automated: isAutomated,
                  quantity: qty,
                  invested_amount: investedAmount,
                  current_value: currentTotalVal,
                  updated_at: new Date().toISOString()
              }).select().single()
              
              if (error) throw error
              targetInvestmentId = newAsset.id
          } else {
              // AGGIUNTA QUOTE
              const { data: currentAsset } = await supabase.from('investments').select('*').eq('id', targetInvestmentId).single()
              if (!currentAsset) throw new Error('Asset non trovato')

              const newTotalQty = round2((currentAsset.quantity || 0) + qty)
              const newTotalInvested = round2((currentAsset.invested_amount || 0) + investedAmount)
              
              let newCurrentVal = 0
              if (currentAsset.quantity && currentAsset.quantity > 0) {
                  const pricePerShare = currentAsset.current_value / currentAsset.quantity
                  newCurrentVal = round2(pricePerShare * newTotalQty)
              } else {
                  newCurrentVal = investedAmount 
              }

              const { error } = await supabase.from('investments').update({
                  quantity: newTotalQty,
                  invested_amount: newTotalInvested,
                  current_value: newCurrentVal,
                  updated_at: new Date().toISOString()
              }).eq('id', targetInvestmentId)

              if (error) throw error
          }

          // --- CREAZIONE TRANSAZIONE DI SPESA ---
          if (isNewPurchase && targetInvestmentId) {
              const totalDeduction = round2(investedAmount + fees) 
              if (totalDeduction > 0) {
                  
                  // **FIX QUI**: Ottieni o crea la categoria "Investimenti"
                  const investmentCatId = await getOrCreateInvestmentCategory(user.id)

                  const { error: txError } = await supabase.from('transactions').insert({
                      user_id: user.id,
                      amount: -Math.abs(totalDeduction),
                      type: 'expense',
                      description: `Acquisto: ${formName || finalTicker} (${qty} q.)`,
                      date: new Date().toISOString(),
                      investment_id: targetInvestmentId,
                      category_id: investmentCatId, // <--- ORA ASSEGNAMO LA CATEGORIA
                      asset_quantity: qty, 
                      is_work_related: false,
                      is_recurring: false
                  })
                  if (txError) console.error("Errore TX:", txError)
              }
          }
      }

      setIsFormOpen(false)
      loadInvestments()
      fetchLiquidity()
      if (selectedInvestment) loadHistory(selectedInvestment.id) 
      resetForm()

    } catch (error: any) {
      alert(error.message || 'Errore salvataggio')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDeleteTransaction(tx: Transaction) {
      if (!confirm('Annullare questa transazione? Verranno rimossi i fondi e le quote dall\'asset.')) return
      if (!selectedInvestment) return

      try {
          const qtyToRemove = (tx as any).asset_quantity || 0
          const amountToRemove = Math.abs(tx.amount)

          const currentQty = selectedInvestment.quantity || 0
          const currentInvested = selectedInvestment.invested_amount || 0

          const newQty = round2(currentQty - qtyToRemove)
          const newInvested = round2(currentInvested - amountToRemove)
          
          let newCurrentValue = 0
          if (currentQty > 0) {
             const pricePerShare = selectedInvestment.current_value / currentQty
             newCurrentValue = round2(pricePerShare * newQty)
          }

          await supabase.from('investments').update({
              quantity: Math.max(0, newQty),
              invested_amount: Math.max(0, newInvested),
              current_value: Math.max(0, newCurrentValue),
              updated_at: new Date().toISOString()
          }).eq('id', selectedInvestment.id)

          await supabase.from('transactions').delete().eq('id', tx.id)

          loadInvestments()
          fetchLiquidity()
          setIsDetailOpen(false) 
          
      } catch (error) { console.error(error) }
  }

  async function handleDeleteAsset(id: string) {
    if (!confirm('⚠️ ATTENZIONE: Stai per eliminare questo asset e tutto il suo storico. Procedere?')) return
    try {
      const { error: txError } = await supabase.from('transactions').delete().eq('investment_id', id)
      if (txError) throw txError
      const { error: invError } = await supabase.from('investments').delete().eq('id', id)
      if (invError) throw invError
      setIsDetailOpen(false)
      loadInvestments()
      fetchLiquidity()
    } catch (error: any) { alert('Errore: ' + error.message) }
  }

  function openDetail(inv: InvestmentExtended) {
      setSelectedInvestment(inv)
      loadHistory(inv.id)
      setIsDetailOpen(true)
  }

  function handleOpenBuyForm() {
      resetForm()
      if (selectedInvestment) {
          setFormType(selectedInvestment.type)
          setFormName(selectedInvestment.name || '')
          setFormTicker(selectedInvestment.ticker || '')
          setIsManual(!selectedInvestment.is_automated)
          setIsNewPurchase(true)
      }
      setIsDetailOpen(false)
      setIsFormOpen(true)
  }

  function handleManualEdit(inv: InvestmentExtended) {
      setIsDetailOpen(false)
      setSelectedInvestment(null) 
      setEditingId(inv.id) 
      setFormName(inv.name || '')
      setFormType(inv.type)
      setFormTicker(inv.ticker || '')
      setIsManual(!inv.is_automated)
      setFormQuantity('')
      setFormTotalSpent('')
      setFormFees('')
      setIsNewPurchase(false)
      setIsFormOpen(true)
  }

  function resetForm() {
    setEditingId(null)
    setFormName('')
    setFormType('ETF')
    setFormTicker('')
    setFormQuantity('')
    setFormPMC('')
    setFormTotalSpent('')
    setFormFees('')
    setIsNewPurchase(true)
  }

  const totalAssets = investments.reduce((sum, item) => sum + (item.current_value || 0), 0)
  const totalInvested = investments.reduce((sum, item) => sum + (item.invested_amount || 0), 0)
  const totalPL = totalAssets - totalInvested
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"><ArrowLeft className="w-6 h-6 text-gray-700" /></button>
                <h1 className="text-xl font-bold text-gray-900">Investimenti</h1>
            </div>
            <div className="flex gap-2">
                <button onClick={handleUpdatePrices} disabled={minutesRemaining > 0 || isUpdating} className={cn("p-2 rounded-full transition-all flex items-center gap-2 border", minutesRemaining > 0 ? "bg-gray-100 text-gray-400 border-gray-100" : "bg-blue-50 text-blue-600 border-blue-100 active:scale-95")}>
                    <RefreshCw className={cn("w-5 h-5", isUpdating && "animate-spin")} strokeWidth={2} />
                </button>
                <button onClick={onOpenGuide} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-blue-600 border border-gray-100 active:scale-95 transition-transform"><BookOpen className="w-5 h-5" strokeWidth={2} /></button>
                <button onClick={onOpenSettings} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100 active:scale-95 transition-transform"><Settings className="w-5 h-5" strokeWidth={2} /></button>
            </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: primaryColor }}></div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Patrimonio Corrente</p>
            <p className="text-4xl font-black text-gray-900 tracking-tight">{formatCurrency(totalAssets)}</p>
            <div className={cn("mt-3 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border", totalPL >= 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100")}>
                {totalPL >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                <span>{totalPL >= 0 ? '+' : ''}{formatCurrency(totalPL)} ({totalPLPercent.toFixed(2)}%)</span>
            </div>
        </div>

        <div className="space-y-8">
            {loading ? <div className="space-y-4 animate-pulse"><div className="h-32 bg-gray-200 rounded-2xl"/></div> : investments.length === 0 ? <div className="text-center py-10 text-gray-400">Nessun investimento</div> : (
                categoriesConfig.map((cat) => {
                    const categoryItems = investments.filter(item => item.type === cat.type)
                    if (categoryItems.length === 0) return null
                    const categoryTotal = categoryItems.reduce((sum, item) => sum + item.current_value, 0)
                    const percentage = totalAssets > 0 ? (categoryTotal / totalAssets) * 100 : 0

                    return (
                        <div key={cat.type} className="animate-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center justify-between mb-3 px-1">
                                <div className="flex items-center gap-2">
                                    <div className={cn("p-2 rounded-lg", cat.bg)}><cat.icon className={cn("w-5 h-5", cat.color)} /></div>
                                    <div>
                                        <h2 className="font-bold text-gray-900 text-sm">{cat.label}</h2>
                                        <div className="h-1 w-12 bg-gray-100 rounded-full mt-1 overflow-hidden"><div className={cn("h-full rounded-full", cat.color.replace('text-', 'bg-'))} style={{ width: `${percentage}%` }}></div></div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-gray-900">{formatCurrency(categoryTotal)}</p>
                                    <p className="text-[10px] text-gray-400 font-medium">{percentage.toFixed(1)}%</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {categoryItems.map(item => {
                                    const invAmount = item.invested_amount || 0
                                    const pl = item.current_value - invAmount
                                    const plPerc = invAmount > 0 ? (pl / invAmount) * 100 : 0
                                    
                                    return (
                                        <div key={item.id} onClick={() => openDetail(item)} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group active:scale-[0.99] transition-transform cursor-pointer relative hover:border-blue-200">
                                            <div className="min-w-0 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-gray-900 text-base truncate">{item.name || item.type}</p>
                                                    {item.is_automated && <span className="bg-blue-50 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">Auto</span>}
                                                </div>
                                                <div className="flex flex-col mt-1 gap-0.5">
                                                    {item.ticker && <span className="text-[10px] text-gray-400 font-mono">{item.ticker}</span>}
                                                    {invAmount > 0 && (
                                                        <span className={cn("text-[10px] font-bold flex items-center gap-0.5", pl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                            {pl >= 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                                                            {formatCurrency(pl)} ({plPerc.toFixed(1)}%)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                <div className="text-right">
                                                    <span className="font-bold text-gray-900 text-base block">{formatCurrency(item.current_value)}</span>
                                                    {item.quantity && <span className="text-[10px] text-gray-400 font-medium block">{item.quantity} quote</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })
            )}
        </div>

        <button onClick={() => { setSelectedInvestment(null); resetForm(); setIsFormOpen(true) }} className="w-full py-4 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 sticky bottom-6 z-10" style={{ backgroundColor: primaryColor, boxShadow: `0 10px 20px -5px ${primaryColor}40` }}>
          <Plus className="w-5 h-5" /> Aggiungi Asset
        </button>
      </div>

      {isDetailOpen && selectedInvestment && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <div>
                      <h2 className="text-lg font-bold text-gray-900 leading-tight">{selectedInvestment.name}</h2>
                      {selectedInvestment.ticker && <span className="text-xs text-gray-500 font-mono font-bold bg-gray-200 px-1.5 py-0.5 rounded">{selectedInvestment.ticker}</span>}
                  </div>
                  <button onClick={() => setIsDetailOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X className="w-5 h-5 text-gray-500" /></button>
               </div>

               <div className="p-6 overflow-y-auto space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                       <div className="p-4 bg-gray-50 rounded-2xl">
                           <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Valore Attuale</p>
                           <p className="text-2xl font-black text-gray-900">{formatCurrency(selectedInvestment.current_value)}</p>
                       </div>
                       <div className="p-4 bg-gray-50 rounded-2xl">
                           <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Prezzo Medio (PMC)</p>
                           <p className="text-2xl font-black text-gray-900">
                               {(selectedInvestment.quantity || 0) > 0 
                                ? formatCurrency((selectedInvestment.invested_amount || 0) / (selectedInvestment.quantity || 1)) 
                                : '-'}
                           </p>
                       </div>
                   </div>

                   <div className="flex items-center justify-between p-4 border border-gray-100 rounded-2xl">
                       <span className="text-xs font-bold text-gray-500 uppercase">Performance Totale</span>
                       {(() => {
                           const pl = selectedInvestment.current_value - (selectedInvestment.invested_amount || 0)
                           const plPerc = (selectedInvestment.invested_amount || 0) > 0 ? (pl / (selectedInvestment.invested_amount || 0)) * 100 : 0
                           return (
                               <span className={cn("text-sm font-bold flex items-center gap-1", pl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                   {pl >= 0 ? <ArrowUp className="w-4 h-4"/> : <ArrowDown className="w-4 h-4"/>}
                                   {formatCurrency(pl)} ({plPerc.toFixed(2)}%)
                               </span>
                           )
                       })()}
                   </div>

                   <div>
                       <h3 className="text-xs font-bold text-gray-900 uppercase mb-3 flex items-center gap-2"><History className="w-4 h-4"/> Storico Acquisti</h3>
                       <div className="space-y-2">
                           {investmentHistory.length === 0 ? <p className="text-xs text-gray-400 italic">Nessun acquisto recente registrato.</p> : 
                               investmentHistory.map(tx => (
                                   <div key={tx.id} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0 group">
                                       <div>
                                           <p className="text-xs font-bold text-gray-900">{formatDate(tx.date)}</p>
                                           <p className="text-[10px] text-gray-400">{tx.description}</p>
                                       </div>
                                       <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-rose-600">{formatCurrency(tx.amount)}</p>
                                                {(tx as any).asset_quantity && <p className="text-[10px] text-gray-500 font-medium">+{(tx as any).asset_quantity} quote</p>}
                                            </div>
                                            <button onClick={() => handleDeleteTransaction(tx)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                                       </div>
                                   </div>
                               ))
                           }
                       </div>
                   </div>
               </div>

               <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex gap-3">
                   <button onClick={() => handleManualEdit(selectedInvestment)} className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50">
                       <PenLine className="w-4 h-4 inline mr-2"/> Modifica Dati
                   </button>
                   <button onClick={() => handleDeleteAsset(selectedInvestment.id)} className="p-3 bg-white border border-red-100 text-red-500 rounded-xl hover:bg-red-50">
                       <Trash2 className="w-5 h-5"/>
                   </button>
                   <button onClick={handleOpenBuyForm} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-md shadow-blue-200 flex items-center justify-center gap-2">
                       <Plus className="w-4 h-4"/> Compra Ancora
                   </button>
               </div>
            </div>
          </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Modifica Asset' : (selectedInvestment ? 'Aggiungi Quote' : 'Nuovo Asset')}</h2>
              <button onClick={() => setIsFormOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <form onSubmit={handleSaveAsset} className="p-6 pb-24 overflow-y-auto space-y-5">
              
              {(!selectedInvestment || editingId) && (
                  <div>
                      <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1.5">Tipologia</label>
                      <div className="grid grid-cols-2 gap-2">
                          {categoriesConfig.map((cat) => (
                              <button key={cat.type} type="button" onClick={() => { setFormType(cat.type as any); if(!['ETF', 'Azioni', 'Crypto'].includes(cat.type)) setIsManual(true) }} className={cn("py-2.5 px-2 rounded-xl text-xs font-bold transition-all border", formType === cat.type ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm" : "bg-white border-gray-100 text-gray-500 hover:bg-gray-50")}>{cat.label}</button>
                          ))}
                      </div>
                  </div>
              )}

              {((!selectedInvestment && !editingId) || editingId) && supportsAutomation && (
                  <div className="flex items-center justify-between bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                      <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-blue-600" />
                          <div><p className="text-xs font-bold text-gray-900">Tracciamento Prezzo</p><p className="text-[10px] text-gray-500">Aggiorna il valore in automatico</p></div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={!isManual} onChange={() => setIsManual(!isManual)} />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                      </label>
                  </div>
              )}

              <div className="space-y-4">
                  {(!selectedInvestment || editingId) && (
                      <>
                        <div>
                            <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Nome Asset</label>
                            <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Es. Vanguard All-World" className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900 text-sm" />
                        </div>

                        {supportsAutomation && !isManual && (
                            <div className="col-span-2">
                                <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Ticker (Yahoo Finance)</label>
                                <div className="relative">
                                    <input type="text" value={formTicker} onChange={e => setFormTicker(e.target.value.toUpperCase())} placeholder="Es. VWCE.MI" className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-mono font-bold text-gray-900 uppercase tracking-wider" required />
                                </div>
                                {!editingId && (
                                    <p className="text-[10px] text-blue-500 mt-1 flex items-center gap-1">
                                        <Info className="w-3 h-3"/> Se il ticker esiste già, l'acquisto sarà aggiunto alla posizione esistente.
                                    </p>
                                )}
                            </div>
                        )}
                      </>
                  )}

                  {!editingId && (
                      <>
                          {!selectedInvestment && (
                              <div className="flex bg-gray-100 p-1 rounded-xl mt-4">
                                  <button type="button" onClick={() => setIsNewPurchase(true)} className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", isNewPurchase ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}>Nuovo Acquisto</button>
                                  <button type="button" onClick={() => setIsNewPurchase(false)} className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", !isNewPurchase ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}>Già in Portafoglio</button>
                              </div>
                          )}

                          <div className="pt-2 space-y-4">
                              <div>
                                <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Quantità (Quote)</label>
                                <input type="number" step="any" min="0" value={formQuantity} onChange={e => setFormQuantity(e.target.value)} placeholder="Es. 10.5" className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900" required />
                              </div>

                              {isNewPurchase ? (
                                  <div className="grid grid-cols-2 gap-4 animate-in fade-in">
                                      <div className="col-span-2">
                                        <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Totale Pagato (€)</label>
                                        <div className="relative">
                                            <input type="number" step="any" min="0" value={formTotalSpent} onChange={e => setFormTotalSpent(e.target.value)} placeholder="Quanto hai speso?" className="w-full p-4 pl-10 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-bold text-gray-900 text-lg" required />
                                            <Wallet className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                        </div>
                                        <p className="text-[10px] text-orange-500 mt-1 ml-1 font-medium">Verrà scalato dalla liquidità.</p>
                                      </div>
                                      <div>
                                        <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Commissioni (€)</label>
                                        <input type="number" step="any" min="0" value={formFees} onChange={e => setFormFees(e.target.value)} placeholder="0.00" className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900" />
                                      </div>
                                      <div className="flex items-end pb-4">
                                        <div className="bg-gray-50 p-2 rounded-lg w-full">
                                            <p className="text-[10px] text-gray-400 uppercase font-bold">Prezzo di Carico Calc.</p>
                                            <p className="text-sm font-bold text-gray-900">{formatCurrency(calculatedPMC)} / q</p>
                                        </div>
                                      </div>
                                  </div>
                              ) : (
                                  <div className="animate-in fade-in space-y-4">
                                      <div>
                                          <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Prezzo Medio di Carico (PMC)</label>
                                          <div className="relative">
                                              <input type="number" step="any" min="0" value={formPMC} onChange={e => setFormPMC(e.target.value)} placeholder="Prezzo medio acquisto" className="w-full p-4 pl-10 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900" required />
                                              <Calculator className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                          </div>
                                          <p className="text-[10px] text-gray-400 mt-1 ml-1">Serve solo per lo storico. Non tocca la liquidità.</p>
                                      </div>
                                      
                                      <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex justify-between items-center">
                                            <span className="text-xs font-bold text-blue-600">Totale Investito Storico</span>
                                            <span className="font-bold text-lg text-blue-700">{formatCurrency(calculatedTotalInvested)}</span>
                                      </div>
                                  </div>
                              )}
                          </div>
                      </>
                  )}
              </div>

              <div className="pt-4 mt-auto">
                <button type="submit" disabled={formLoading} className="w-full py-4 text-white font-bold rounded-2xl shadow-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2" style={{ backgroundColor: primaryColor, boxShadow: `0 10px 20px -5px ${primaryColor}40` }}>
                  {formLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Salvataggio...</> : (editingId ? 'Salva Modifiche' : (selectedInvestment ? 'Aggiungi al Portafoglio' : 'Crea Asset'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}