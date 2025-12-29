import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, ArrowRightLeft, Calendar, AlignLeft, Wallet, PieChart, Repeat, PiggyBank } from 'lucide-react'
import { supabase, type Category, type Bucket, type Investment, type Transaction } from '../lib/supabase'
import { cn, formatCurrency } from '../lib/utils'

interface TransactionFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  primaryColor?: string
  editingTransaction?: any
}

interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[]
}

interface BucketWithTarget extends Bucket {
  target_amount?: number
}

export default function TransactionForm({ isOpen, onClose, onSuccess, primaryColor = 'blue', editingTransaction }: TransactionFormProps) {
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [bucketId, setBucketId] = useState<string>('')
  const [applyAutoSplit, setApplyAutoSplit] = useState(false)
  const [transferSource, setTransferSource] = useState<string>('')
  const [transferDestinationType, setTransferDestinationType] = useState<'investment' | 'bucket'>('investment')
  const [transferDestination, setTransferDestination] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryTree, setCategoryTree] = useState<CategoryWithChildren[]>([])
  const [filteredCategoryTree, setFilteredCategoryTree] = useState<CategoryWithChildren[]>([])
  const [buckets, setBuckets] = useState<BucketWithTarget[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Nuovo stato per le distribuzioni collegate
  const [relatedDistributions, setRelatedDistributions] = useState<Transaction[]>([])

  useEffect(() => {
    if (isOpen) {
      loadCategories()
      loadBuckets()
      loadInvestments()
      
      if (editingTransaction) {
        setEditingId(editingTransaction.id)
        setAmount(Math.abs(editingTransaction.amount).toString())
        setCategoryId(editingTransaction.category_id)
        setDate(new Date(editingTransaction.date).toISOString().split('T')[0])
        setDescription(editingTransaction.description || '')
        setType(editingTransaction.type)
        
        if (editingTransaction.type === 'transfer') {
          setTransferSource(editingTransaction.bucket_id || 'unassigned')
          if (editingTransaction.investment_id) {
            setTransferDestinationType('investment')
            setTransferDestination(editingTransaction.investment_id)
          } else {
            setTransferDestinationType('bucket')
            setTransferDestination('') 
          }
          setBucketId('')
          setApplyAutoSplit(false)
        } else {
          setBucketId(editingTransaction.bucket_id || '')
          setApplyAutoSplit(false)
          setTransferSource('')
          setTransferDestinationType('investment')
          setTransferDestination('')
        }

        // Se è un'entrata, cerca distribuzioni collegate usando il TIMESTAMP preciso
        if (editingTransaction.type === 'income') {
            loadRelatedDistributions(editingTransaction)
        } else {
            setRelatedDistributions([])
        }

      } else {
        resetForm()
      }
    }
  }, [isOpen, editingTransaction])

  async function loadRelatedDistributions(sourceTx: any) {
    if (!sourceTx?.created_at) return

    const sourceTime = new Date(sourceTx.created_at).getTime()
    const timeStart = new Date(sourceTime - 100).toISOString()
    const timeEnd = new Date(sourceTime + 5000).toISOString()

    const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .eq('type', 'transfer')
        .gte('created_at', timeStart)
        .lte('created_at', timeEnd)
        .ilike('description', 'Distribuzione automatica%')

    if (data) {
        setRelatedDistributions(data)
    }
  }

  function resetForm() {
    setEditingId(null)
    setAmount('')
    setCategoryId('')
    setDate(new Date().toISOString().split('T')[0])
    setDescription('')
    setType('expense')
    setBucketId('')
    setApplyAutoSplit(false)
    setTransferSource('')
    setTransferDestinationType('investment')
    setTransferDestination('')
    setRelatedDistributions([])
  }

  useEffect(() => {
    if (categoryTree.length === 0) return
    const filtered = categoryTree.filter(cat => cat.type === type)
    setFilteredCategoryTree(filtered)
    
    const currentCategory = categories.find(c => c.id === categoryId)
    if (!currentCategory || currentCategory.type !== type) {
      const firstMatch = categories.find(c => c.type === type)
      if (firstMatch) setCategoryId(firstMatch.id)
      else setCategoryId('')
    }
  }, [type, categoryTree, categories])

  function buildCategoryTree(categories: Category[]): CategoryWithChildren[] {
    const categoryMap = new Map<string, CategoryWithChildren>()
    const rootCategories: CategoryWithChildren[] = []
    categories.forEach(cat => categoryMap.set(cat.id, { ...cat, children: [] }))
    categories.forEach(cat => {
      const categoryWithChildren = categoryMap.get(cat.id)!
      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id)
        if (parent) {
          if (!parent.children) parent.children = []
          parent.children.push(categoryWithChildren)
        }
      } else {
        rootCategories.push(categoryWithChildren)
      }
    })
    const sortCategories = (cats: CategoryWithChildren[]) => {
      cats.sort((a, b) => a.name.localeCompare(b.name))
      cats.forEach(cat => { if (cat.children) sortCategories(cat.children) })
    }
    sortCategories(rootCategories)
    return rootCategories
  }

  function flattenCategories(categories: CategoryWithChildren[], level: number = 0): Array<{ id: string; name: string; level: number }> {
    const result: Array<{ id: string; name: string; level: number }> = []
    categories.forEach(category => {
      const indent = '\u00A0\u00A0'.repeat(level)
      const displayName = level > 0 ? `${indent}└ ${category.name}` : category.name
      result.push({ id: category.id, name: displayName, level: level })
      if (category.children && category.children.length > 0) {
        result.push(...flattenCategories(category.children, level + 1))
      }
    })
    return result
  }

  async function loadCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name')
      if (error) throw error
      const categoriesData = data || []
      setCategories(categoriesData)
      const tree = buildCategoryTree(categoriesData)
      setCategoryTree(tree)
    } catch (error) { console.error(error) }
  }

  async function loadBuckets() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('buckets').select('*').eq('user_id', user.id).order('name')
      setBuckets(data || [])
    } catch (error) { console.error(error) }
  }

  async function loadInvestments() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('investments').select('*').eq('user_id', user.id).order('type')
      setInvestments(data || [])
    } catch (error) { console.error(error) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Utente non autenticato')

      const amountNumber = Number(parseFloat(amount))

      if (editingId) {
        const updateData: any = {
          amount: type === 'transfer' ? -amountNumber : (type === 'income' ? amountNumber : -amountNumber),
          category_id: type === 'transfer' ? null : categoryId,
          date: new Date(date).toISOString(),
          description: description || null,
          is_work_related: false,
          type: type,
          bucket_id: type === 'transfer' ? (transferSource === 'unassigned' ? null : transferSource) : (type === 'expense' && bucketId ? bucketId : null),
          investment_id: type === 'transfer' && transferDestinationType === 'investment' ? transferDestination : null,
        }
        const { error } = await supabase.from('transactions').update(updateData).eq('id', editingId)
        if (error) throw error
        resetForm()
        onSuccess()
        onClose()
        return
      }

      // 1. Uscita (Expense)
      if (type === 'expense') {
        const { error: tError } = await supabase.from('transactions').insert({
            amount: -amountNumber,
            category_id: categoryId,
            date: new Date(date).toISOString(),
            description: description || null,
            is_work_related: false,
            type: type,
            bucket_id: bucketId || null,
            user_id: user.id,
          })
        if (tError) throw tError
        
        if (bucketId) {
          const bucket = buckets.find(b => b.id === bucketId)
          if (bucket) {
            await supabase.from('buckets').update({ current_balance: (bucket.current_balance || 0) - amountNumber }).eq('id', bucketId)
          }
        }
      }
      // 2. Entrata (Income)
      else if (type === 'income') {
        const { error: tError } = await supabase.from('transactions').insert({
            amount: amountNumber,
            category_id: categoryId,
            date: new Date(date).toISOString(),
            description: description || null,
            is_work_related: false,
            type: type,
            user_id: user.id,
          })
        if (tError) throw tError

        // Divisione Automatica a CASCATA
        if (applyAutoSplit) {
            const bucketsWithDistribution = buckets.filter(b => (b.distribution_percentage || 0) > 0)
            let allocations = new Map<string, number>()
            let eligibleBuckets = new Set<string>() 
            
            bucketsWithDistribution.forEach(b => {
                const theoretical = (amountNumber * (b.distribution_percentage || 0)) / 100
                allocations.set(b.id, theoretical)
                eligibleBuckets.add(b.id)
            })

            let loop = true
            while (loop && eligibleBuckets.size > 0) {
                loop = false 
                let excessPool = 0

                for (const bucket of bucketsWithDistribution) {
                    if (!eligibleBuckets.has(bucket.id)) continue
                    const currentAlloc = allocations.get(bucket.id) || 0
                    const target = bucket.target_amount || 0
                    const startBalance = bucket.current_balance || 0
                    
                    if (target > 0) {
                        const space = Math.max(0, target - startBalance)
                        if (currentAlloc > space) {
                            excessPool += (currentAlloc - space)
                            allocations.set(bucket.id, space)
                            eligibleBuckets.delete(bucket.id)
                            loop = true
                        }
                    }
                }

                if (excessPool > 0.01 && eligibleBuckets.size > 0) {
                    for (const bucket of bucketsWithDistribution) {
                        if (eligibleBuckets.has(bucket.id)) {
                            const weight = bucket.distribution_percentage || 0
                            const share = (excessPool * weight) / 100
                            allocations.set(bucket.id, (allocations.get(bucket.id) || 0) + share)
                        }
                    }
                    loop = true 
                }
            }

            for (const bucket of bucketsWithDistribution) {
                const finalAmount = allocations.get(bucket.id) || 0
                if (finalAmount > 0) {
                    const newBalance = (bucket.current_balance || 0) + finalAmount
                    let updateData: any = { current_balance: newBalance }
                    if ((bucket.target_amount || 0) > 0 && newBalance >= (bucket.target_amount || 0)) {
                       updateData.distribution_percentage = 0
                    }
                    await supabase.from('transactions').insert({
                        amount: -finalAmount,
                        date: new Date(date).toISOString(),
                        description: `Distribuzione automatica a ${bucket.name}`,
                        type: 'transfer',
                        bucket_id: bucket.id,
                        user_id: user.id,
                      })
                    await supabase.from('buckets').update(updateData).eq('id', bucket.id)
                }
            }
        }
      }
      // 3. Trasferimento (Transfer)
      else if (type === 'transfer') {
        if (!transferDestination) throw new Error('Seleziona una destinazione')
        
        let destName = 'Destinazione'
        if (transferDestinationType === 'investment') {
            const inv = investments.find(i => i.id === transferDestination)
            destName = inv ? inv.type : 'Investimento'
        } else {
            if (transferDestination === 'unassigned') destName = 'Liquidità Principale'
            else {
               const b = buckets.find(b => b.id === transferDestination)
               destName = b ? b.name : 'Bucket'
            }
        }

        let transactionAmount = 0
        if (transferSource === 'unassigned') transactionAmount = -amountNumber
        else if (transferSource !== 'unassigned' && transferDestination === 'unassigned') transactionAmount = amountNumber
        else transactionAmount = 0

        if (transactionAmount !== 0) {
            const { error: tError } = await supabase.from('transactions').insert({
                amount: transactionAmount,
                date: new Date(date).toISOString(),
                description: description || `Trasferimento a ${destName}`,
                type: 'transfer',
                bucket_id: transferSource === 'unassigned' ? null : transferSource,
                investment_id: transferDestinationType === 'investment' ? transferDestination : null,
                user_id: user.id,
              })
            if (tError) throw tError
        }

        if (transferSource !== 'unassigned' && transferSource) {
          const sb = buckets.find(b => b.id === transferSource)
          if (sb) await supabase.from('buckets').update({ current_balance: (sb.current_balance || 0) - amountNumber }).eq('id', transferSource)
        }

        if (transferDestinationType === 'investment') {
          const inv = investments.find(i => i.id === transferDestination)
          if (inv) await supabase.from('investments').update({ current_value: (inv.current_value || 0) + amountNumber }).eq('id', transferDestination)
        } else if (transferDestination !== 'unassigned' && transferDestination) {
          const db = buckets.find(b => b.id === transferDestination)
          if (db) {
             const newBalance = (db.current_balance || 0) + amountNumber
             const target = db.target_amount || 0
             let updateData: any = { current_balance: newBalance }
             if (target > 0 && newBalance >= target) {
                 updateData.distribution_percentage = 0
             }
             await supabase.from('buckets').update(updateData).eq('id', transferDestination)
          }
        }
      }

      resetForm()
      onSuccess()
      onClose()
    } catch (error: any) {
      setError(error.message || 'Errore durante il salvataggio')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const getActiveTabClass = (tabType: string) => {
    if (type !== tabType) return "bg-gray-50 text-gray-500 hover:bg-gray-100 border-transparent"
    if (tabType === 'income') return "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm"
    if (tabType === 'expense') return "bg-rose-50 text-rose-600 border-rose-100 shadow-sm"
    return "bg-blue-50 text-blue-600 border-blue-100 shadow-sm"
  }

  return (
    // FIX: z-index aumentato a z-[100] per coprire la BottomBar
    <div 
        className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
    >
      <div 
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-10 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header - FISSO */}
        <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-3xl z-10">
          <h2 className="text-lg font-bold text-gray-900">
            {editingId ? 'Modifica' : 'Nuova Transazione'}
          </h2>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content - SCROLLABILE INDIPENDENTEMENTE */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <form id="transaction-form" onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}

            {/* Type Selector */}
            <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setType('expense')} className={cn("flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all gap-1", getActiveTabClass('expense'))}>
                <TrendingDown className="w-5 h-5" />
                <span className="text-xs font-bold">Uscita</span>
                </button>
                <button type="button" onClick={() => setType('income')} className={cn("flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all gap-1", getActiveTabClass('income'))}>
                <TrendingUp className="w-5 h-5" />
                <span className="text-xs font-bold">Entrata</span>
                </button>
                <button type="button" onClick={() => setType('transfer')} className={cn("flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all gap-1", getActiveTabClass('transfer'))}>
                <ArrowRightLeft className="w-5 h-5" />
                <span className="text-xs font-bold">Transfer</span>
                </button>
            </div>

            {/* Amount Hero */}
            <div className="relative">
                <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1 block">Importo</label>
                <div className="relative flex items-center">
                    <span className="absolute left-4 text-3xl font-bold text-gray-300">€</span>
                    <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-4 text-4xl font-bold text-gray-900 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all placeholder:text-gray-200"
                    placeholder="0.00"
                    // autoFocus rimosso come richiesto
                    />
                </div>
            </div>

            <div className="space-y-4">
                {/* Category */}
                {type !== 'transfer' && (
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1 block">Categoria</label>
                    <div className="relative">
                        <PieChart className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <select
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            required
                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 text-gray-900 font-medium rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none"
                        >
                            {filteredCategoryTree.length === 0 ? (
                            <option value="">Caricamento...</option>
                            ) : (
                            flattenCategories(filteredCategoryTree).map((cat) => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))
                            )}
                        </select>
                    </div>
                </div>
                )}

                {/* Transfer Fields */}
                {type === 'transfer' && (
                    <div className="p-4 bg-blue-50 rounded-2xl space-y-4 border border-blue-100">
                        <div>
                            <label className="text-xs font-bold text-blue-400 uppercase ml-1 mb-1 block">Da (Sorgente)</label>
                            <select
                                value={transferSource}
                                onChange={(e) => setTransferSource(e.target.value)}
                                className="w-full px-4 py-3 bg-white text-gray-900 font-medium rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Seleziona...</option>
                                <option value="unassigned">Liquidità Principale</option>
                                {buckets.map(b => <option key={b.id} value={b.id}>{b.name} (€{b.current_balance})</option>)}
                            </select>
                        </div>
                        
                        <div className="flex justify-center -my-2 relative z-10">
                            <div className="bg-white p-1.5 rounded-full shadow-sm border border-gray-100">
                                <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                            </div>
                        </div>

                        <div>
                            <div className="flex gap-2 mb-2">
                                <button type="button" onClick={() => setTransferDestinationType('investment')} className={cn("flex-1 text-xs py-1.5 rounded-lg font-bold transition-all", transferDestinationType === 'investment' ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-500")}>Investimento</button>
                                <button type="button" onClick={() => setTransferDestinationType('bucket')} className={cn("flex-1 text-xs py-1.5 rounded-lg font-bold transition-all", transferDestinationType === 'bucket' ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-500")}>Altro Bucket</button>
                            </div>
                            <label className="text-xs font-bold text-blue-400 uppercase ml-1 mb-1 block">Verso (Destinazione)</label>
                            <select
                                value={transferDestination}
                                onChange={(e) => setTransferDestination(e.target.value)}
                                className="w-full px-4 py-3 bg-white text-gray-900 font-medium rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Seleziona...</option>
                                {transferDestinationType === 'investment' ? (
                                    investments.map(i => <option key={i.id} value={i.id}>{i.type} (€{i.current_value})</option>)
                                ) : (
                                    <>
                                        <option value="unassigned">Liquidità Principale</option>
                                        {buckets.filter(b => b.id !== transferSource).map(b => <option key={b.id} value={b.id}>{b.name} (€{b.current_balance})</option>)}
                                    </>
                                )}
                            </select>
                        </div>
                    </div>
                )}

                {/* Date */}
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1 block">Data</label>
                    <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-gray-50 text-gray-900 font-medium rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    </div>
                </div>

                {/* Description */}
                <div>
                <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1 block">Descrizione</label>
                <div className="relative">
                    <AlignLeft className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 bg-gray-50 text-gray-900 font-medium rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        placeholder="Note opzionali..."
                    />
                </div>
                </div>

                {/* EXPENSE: Bucket Selector */}
                {type === 'expense' && (
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1 block">Paga da Salvadanaio (Opzionale)</label>
                    <div className="relative">
                        <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <select
                            value={bucketId}
                            onChange={(e) => setBucketId(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 text-gray-900 font-medium rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none"
                        >
                            <option value="">Liquidità Principale</option>
                            {buckets.map(b => <option key={b.id} value={b.id}>{b.name} (€{b.current_balance})</option>)}
                        </select>
                    </div>
                </div>
                )}

                {/* Auto Split Switch & Related Distributions */}
                {type === 'income' && (
                    <>
                        {/* Selettore Auto Distribuzione (solo se nuova o non ci sono distribuzioni già fatte) */}
                        {buckets.some(b => (b.distribution_percentage || 0) > 0) && relatedDistributions.length === 0 && (
                            <label className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl cursor-pointer border border-transparent hover:border-gray-200 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                        <Repeat className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="font-bold text-gray-700 text-sm block">Divisione Automatica Salvadanai</span>
                                        <span className="text-xs text-gray-400">Distribuisce in base alle % impostate</span>
                                    </div>
                                </div>
                                <input type="checkbox" checked={applyAutoSplit} onChange={(e) => setApplyAutoSplit(e.target.checked)} className="w-6 h-6 rounded-md text-blue-600 focus:ring-blue-500 border-gray-300" />
                            </label>
                        )}

                        {/* Lista Distribuzioni Correlate (VISIBILE SOLO SE ESISTONO) */}
                        {relatedDistributions.length > 0 && (
                            <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-1">
                                    <ArrowRightLeft className="w-3 h-3" /> Distribuzioni Collegate
                                </h4>
                                <div className="space-y-2">
                                    {relatedDistributions.map(dist => (
                                        <div key={dist.id} className="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                                                    <PiggyBank className="w-4 h-4" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase leading-none mb-0.5">Verso</span>
                                                    <span className="text-sm font-bold text-gray-900 leading-snug">
                                                        {dist.description?.replace('Distribuzione automatica a ', '')}
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="font-bold text-gray-900 ml-3 whitespace-nowrap">
                                                {formatCurrency(Math.abs(dist.amount))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
            </form>
        </div>

        {/* Footer Actions - FISSO IN BASSO */}
        <div className="shrink-0 p-6 border-t border-gray-100 bg-white rounded-b-3xl sm:rounded-b-3xl">
            <button
                type="submit"
                form="transaction-form"
                disabled={loading}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-lg shadow-xl shadow-gray-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: primaryColor.startsWith('#') ? primaryColor : undefined }}
            >
                {loading ? 'Salvataggio...' : 'Salva Transazione'}
            </button>
        </div>

      </div>
    </div>
  )
}