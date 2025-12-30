import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowRightLeft, Calendar, Search, Trash2, TrendingDown, TrendingUp, X, Settings } from 'lucide-react'
import { supabase, type Transaction, type Category } from '../lib/supabase'
import { formatCurrency, formatDate, cn } from '../lib/utils'
import TransactionForm from './TransactionForm'

interface TransactionsProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

export default function Transactions({ onBack, onOpenSettings, primaryColor }: TransactionsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false)

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterSearch, setFilterSearch] = useState<string>('')
  
  // Date Filters
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  useEffect(() => {
    loadCategories()
  }, [])

  useEffect(() => {
    loadTransactions()
    // Reset category filter if type changes and category doesn't match
    if (filterCategory !== 'all') {
      const selectedCategory = categories.find(c => c.id === filterCategory)
      if (selectedCategory && filterType !== 'all' && selectedCategory.type !== filterType) {
        setFilterCategory('all')
      }
    }
  }, [filterType, filterCategory, filterSearch, dateFrom, dateTo])

  async function loadCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .order('name')

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  async function loadTransactions() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let query = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      // Applica filtri
      if (filterType !== 'all') query = query.eq('type', filterType)
      if (filterCategory !== 'all') query = query.eq('category_id', filterCategory)
      if (filterSearch) query = query.ilike('description', `%${filterSearch}%`)
      
      // Filtri Data
      if (dateFrom) query = query.gte('date', dateFrom)
      if (dateTo) query = query.lte('date', `${dateTo}T23:59:59`)

      const { data, error } = await query

      if (error) throw error
      
      // Filtra le distribuzioni automatiche dalla vista principale per pulizia
      const filteredData = (data || []).filter(t => !t.description?.startsWith('Distribuzione automatica'))
      
      setTransactions(filteredData)
    } catch (error) {
      console.error('Error loading transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleEdit(transaction: Transaction) {
    setEditingTransaction(transaction)
    setIsTransactionFormOpen(true)
  }

  function handleCloseForm() {
    setIsTransactionFormOpen(false)
    setEditingTransaction(null)
    loadTransactions()
  }

  // --- LOGICA DI ROLLBACK PER LA CANCELLAZIONE ---
  async function handleDelete(transaction: Transaction, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Eliminare questa transazione? L\'operazione annullerà anche eventuali movimenti collegati.')) return

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if(!user) return

        // 1. GESTIONE INVESTIMENTO (Acquisto o Vendita)
        // Se la transazione ha un investment_id, dobbiamo aggiornare l'asset.
        if (transaction.investment_id) {
             const { data: investment } = await supabase
                .from('investments')
                .select('*')
                .eq('id', transaction.investment_id)
                .single()

            if (investment) {
                // Recuperiamo la quantità di quote movimentata (salvata in asset_quantity)
                const qtyChange = (transaction as any).asset_quantity || 0 
                
                // --- RIPRISTINO QUANTITÀ ---
                // Se era acquisto (+qty), dobbiamo togliere: new = curr - qty
                // Se era vendita (-qty), dobbiamo aggiungere: new = curr - (-qty) = curr + qty
                const newQty = Math.max(0, (investment.quantity || 0) - qtyChange)
                
                // --- RIPRISTINO CAPITALE INVESTITO ---
                // Funziona per i TRANSFER (Capitale).
                // Se era acquisto (amount < 0), invested era aumentato. Ora deve scendere (+ amount negativo)
                // Se era vendita (amount > 0), invested era sceso. Ora deve salire (+ amount positivo)
                let deltaInvested = 0
                if (transaction.type === 'transfer') {
                    deltaInvested = transaction.amount 
                }
                
                const newInvested = Math.max(0, (investment.invested_amount || 0) + deltaInvested)
                
                // --- RICALCOLO VALORE CORRENTE (Stima) ---
                // Manteniamo il prezzo per quota attuale per ricalcolare il totale
                let newCurrentValue = investment.current_value
                if ((investment.quantity || 0) > 0) {
                    const pricePerShare = investment.current_value / investment.quantity
                    newCurrentValue = pricePerShare * newQty
                } else if (newQty === 0) {
                    newCurrentValue = 0
                }

                await supabase.from('investments').update({
                    quantity: newQty,
                    invested_amount: newInvested,
                    current_value: newCurrentValue
                }).eq('id', investment.id)
            }
        }

        // 2. CASO ENTRATA (Distribuzioni automatiche Salvadanai)
        if (transaction.type === 'income') {
            const txTime = new Date(transaction.created_at).getTime()
            const timeStart = new Date(txTime - 2000).toISOString()
            const timeEnd = new Date(txTime + 5000).toISOString()

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
                        const { data: bucket } = await supabase
                            .from('buckets')
                            .select('current_balance')
                            .eq('id', child.bucket_id)
                            .single()
                        
                        if (bucket) {
                            const amountAddedToBucket = Math.abs(child.amount)
                            const newBalance = Math.max(0, (bucket.current_balance || 0) - amountAddedToBucket)
                            await supabase.from('buckets').update({ current_balance: newBalance }).eq('id', child.bucket_id)
                        }
                    }
                    await supabase.from('transactions').delete().eq('id', child.id)
                }
            }
        }

        // 3. CASO USCITA/TRANSFER DA BUCKET (Restituzione fondi)
        else if ((transaction.type === 'expense' || transaction.type === 'transfer') && transaction.bucket_id) {
            const { data: bucket } = await supabase
                .from('buckets')
                .select('current_balance')
                .eq('id', transaction.bucket_id)
                .single()

            if (bucket) {
                const amountSpent = Math.abs(transaction.amount)
                const newBalance = (bucket.current_balance || 0) + amountSpent
                await supabase
                    .from('buckets')
                    .update({ current_balance: newBalance })
                    .eq('id', transaction.bucket_id)
            }
        }

        // Elimina transazione principale
        const { error } = await supabase.from('transactions').delete().eq('id', transaction.id)
        if (error) throw error
        
        loadTransactions()
    } catch (error: any) {
      console.error('Error deleting transaction:', error)
      alert('Errore durante l\'eliminazione')
    }
  }

  function getCategoryName(categoryId: string | null): string {
    if (!categoryId) return 'Sconosciuta'
    return categories.find(c => c.id === categoryId)?.name || 'Sconosciuta'
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER STICKY */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <button 
                onClick={onBack}
                className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                <ArrowLeft className="w-6 h-6 text-gray-700" />
                </button>
                <h1 className="text-xl font-bold text-gray-900">Storico</h1>
            </div>
            <button 
                onClick={onOpenSettings}
                className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors text-gray-600 border border-gray-100 active:scale-95"
            >
                <Settings className="w-5 h-5" strokeWidth={2} />
            </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4">
        
        {/* BARRA DI RICERCA & FILTRI */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="Cerca transazioni..."
                    className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
                {filterSearch && (
                  <button 
                    onClick={() => setFilterSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-gray-100 rounded-full text-gray-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
            </div>

            {/* Date Range Filter */}
            <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold uppercase pointer-events-none">Da</span>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-8 pr-2 text-xs font-medium text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold uppercase pointer-events-none">A</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-6 pr-2 text-xs font-medium text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>
            </div>

            {/* Type Pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 hide-scrollbar pt-1">
                <button
                    onClick={() => setFilterType('all')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all",
                      filterType === 'all' 
                        ? "bg-gray-900 text-white border-transparent shadow-md" 
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    )}
                >
                    Tutti
                </button>
                <button
                    onClick={() => setFilterType('income')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all flex items-center gap-1.5",
                      filterType === 'income' 
                        ? "bg-emerald-500 text-white border-transparent shadow-md shadow-emerald-100" 
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    )}
                >
                    <TrendingUp className="w-3.5 h-3.5" /> Entrate
                </button>
                <button
                    onClick={() => setFilterType('expense')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all flex items-center gap-1.5",
                      filterType === 'expense' 
                        ? "bg-rose-500 text-white border-transparent shadow-md shadow-rose-100" 
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    )}
                >
                    <TrendingDown className="w-3.5 h-3.5" /> Uscite
                </button>
                <button
                    onClick={() => setFilterType('transfer')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all flex items-center gap-1.5",
                      filterType === 'transfer' 
                        ? "bg-blue-500 text-white border-transparent shadow-md shadow-blue-100" 
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    )}
                >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer
                </button>
            </div>
        </div>

        {/* LISTA TRANSAZIONI */}
        <div className="space-y-3">
          {loading ? (
             <div className="space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />)}
             </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-100">
               <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                 <Search className="w-8 h-8 text-gray-300" />
               </div>
              <p className="text-gray-400 font-medium">Nessuna transazione trovata</p>
              {(dateFrom || dateTo) && <p className="text-xs text-gray-400 mt-2">Prova a cambiare l'intervallo date</p>}
            </div>
          ) : (
            transactions.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleEdit(t)}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between active:scale-[0.99] transition-transform cursor-pointer group"
                >
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1",
                        t.type === 'income' ? "bg-emerald-50 text-emerald-600" :
                        t.type === 'transfer' ? "bg-blue-50 text-blue-600" :
                        "bg-rose-50 text-rose-600"
                    )}>
                        {t.type === 'income' ? <TrendingUp className="w-5 h-5" /> :
                         t.type === 'transfer' ? <ArrowRightLeft className="w-5 h-5" /> :
                         <TrendingDown className="w-5 h-5" />}
                    </div>

                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 leading-tight break-words">
                          {t.type === 'transfer' 
                            ? (t.description || 'Trasferimento')
                            : (t.description || getCategoryName(t.category_id))}
                        </h3>
                        {t.is_work_related && t.type !== 'transfer' && (
                          <span className="shrink-0 px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-bold uppercase rounded">
                            Work
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400 font-medium">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span className="whitespace-nowrap">{formatDate(t.date)}</span>
                        {t.category_id && t.type !== 'transfer' && (
                            <>
                                <span className="text-gray-300">•</span>
                                <span className="truncate max-w-[120px]">{getCategoryName(t.category_id)}</span>
                            </>
                        )}
                        {/* TAG PER INVESTIMENTI */}
                        {t.investment_id && (
                            <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold tracking-wide">ASSET</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                    <span className={cn(
                      "font-bold text-base whitespace-nowrap",
                      t.type === 'income' ? "text-emerald-600" :
                      t.type === 'transfer' ? "text-gray-600" :
                      "text-rose-600"
                    )}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
                      {formatCurrency(Math.abs(t.amount))}
                    </span>
                    
                    <button
                      onClick={(e) => handleDelete(t, e)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label="Elimina transazione"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
            ))
          )}
        </div>
      </div>

      <TransactionForm
        isOpen={isTransactionFormOpen}
        onClose={handleCloseForm}
        onSuccess={loadTransactions}
        primaryColor={primaryColor}
        editingTransaction={editingTransaction}
      />
    </div>
  )
}