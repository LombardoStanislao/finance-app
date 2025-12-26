import { useState, useEffect } from 'react'
import { X, ArrowRight } from 'lucide-react'
import { supabase, type Category, type Bucket, type Investment } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'

interface TransactionFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  primaryColor?: string
  editingTransaction?: any // Transaction to edit, if provided
}

interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[]
}

export default function TransactionForm({ isOpen, onClose, onSuccess, primaryColor = 'blue', editingTransaction }: TransactionFormProps) {
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [isWorkRelated, setIsWorkRelated] = useState(false)
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [bucketId, setBucketId] = useState<string>('')
  const [applyAutoSplit, setApplyAutoSplit] = useState(false)
  const [transferSource, setTransferSource] = useState<string>('') // 'unassigned' or bucket ID
  const [transferDestinationType, setTransferDestinationType] = useState<'investment' | 'bucket'>('investment')
  const [transferDestination, setTransferDestination] = useState<string>('') // investment ID or bucket ID or 'unassigned'
  const [editingId, setEditingId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryTree, setCategoryTree] = useState<CategoryWithChildren[]>([])
  const [filteredCategoryTree, setFilteredCategoryTree] = useState<CategoryWithChildren[]>([])
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadCategories()
      loadBuckets()
      loadInvestments()
      
      // If editing, populate form with transaction data
      if (editingTransaction) {
        setEditingId(editingTransaction.id)
        setAmount(Math.abs(editingTransaction.amount).toString())
        setCategoryId(editingTransaction.category_id)
        setDate(new Date(editingTransaction.date).toISOString().split('T')[0])
        setDescription(editingTransaction.description || '')
        setIsWorkRelated(editingTransaction.is_work_related || false)
        setType(editingTransaction.type)
        
        if (editingTransaction.type === 'transfer') {
          // For transfers, set source
          setTransferSource(editingTransaction.bucket_id || 'unassigned')
          
          // Determine destination type and value
          if (editingTransaction.investment_id) {
            // Destination is an investment
            setTransferDestinationType('investment')
            setTransferDestination(editingTransaction.investment_id)
          } else {
            // Destination is a bucket or unassigned
            // Note: We can't determine the exact destination bucket from the transaction alone
            // The user will need to select it, but we'll default to 'bucket' type
            setTransferDestinationType('bucket')
            setTransferDestination('') // User needs to select destination
          }
          setBucketId('') // Not used for transfers
          setApplyAutoSplit(false)
        } else {
          // For income/expense transactions
          setBucketId(editingTransaction.bucket_id || '')
          setApplyAutoSplit(false) // Can't edit auto-split status
          setTransferSource('')
          setTransferDestinationType('investment')
          setTransferDestination('')
        }
      } else {
        // Reset form when opening new transaction
        setEditingId(null)
        setAmount('')
        setCategoryId('')
        setDate(new Date().toISOString().split('T')[0])
        setDescription('')
        setIsWorkRelated(false)
        setType('expense')
        setBucketId('')
        setApplyAutoSplit(false)
        setTransferSource('')
        setTransferDestinationType('investment')
        setTransferDestination('')
      }
    }
  }, [isOpen, editingTransaction])

  // Filter categories when transaction type changes
  useEffect(() => {
    if (categoryTree.length === 0) return
    
    const filtered = categoryTree.filter(cat => cat.type === type)
    setFilteredCategoryTree(filtered)
    
    // Reset category selection if current selection is not valid for new type
    const currentCategory = categories.find(c => c.id === categoryId)
    if (!currentCategory || currentCategory.type !== type) {
      // Find first category of the correct type
      const firstMatch = categories.find(c => c.type === type)
      if (firstMatch) {
        setCategoryId(firstMatch.id)
      } else {
        setCategoryId('')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, categoryTree])

  // Organize categories into tree structure
  function buildCategoryTree(categories: Category[]): CategoryWithChildren[] {
    const categoryMap = new Map<string, CategoryWithChildren>()
    const rootCategories: CategoryWithChildren[] = []

    // First pass: create map of all categories
    categories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] })
    })

    // Second pass: build tree structure (handles multi-level nesting)
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

    // Sort categories and their children recursively
    const sortCategories = (cats: CategoryWithChildren[]) => {
      cats.sort((a, b) => a.name.localeCompare(b.name))
      cats.forEach(cat => {
        if (cat.children) {
          sortCategories(cat.children)
        }
      })
    }
    sortCategories(rootCategories)

    return rootCategories
  }

  // Flatten categories for dropdown display with visual indentation
  function flattenCategories(categories: CategoryWithChildren[], level: number = 0): Array<{ id: string; name: string; level: number }> {
    const result: Array<{ id: string; name: string; level: number }> = []
    
    categories.forEach(category => {
      // Add dashes based on level for visual indentation
      const indent = '-'.repeat(level)
      const displayName = level > 0 ? `${indent} ${category.name}` : category.name
      
      result.push({
        id: category.id,
        name: displayName,
        level: level
      })
      
      // Recursively add children (supports unlimited nesting)
      if (category.children && category.children.length > 0) {
        result.push(...flattenCategories(category.children, level + 1))
      }
    })
    
    return result
  }

  async function loadCategories() {
    try {
      // Get current user to filter categories
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('categories')
        .select('id, name, budget_limit, parent_id, type, created_at')
        .eq('user_id', user.id)
        .order('name')

      if (error) throw error
      
      const categoriesData = data || []
      setCategories(categoriesData)
      const tree = buildCategoryTree(categoriesData)
      setCategoryTree(tree)
      
      // Filter by current transaction type
      const filtered = tree.filter(cat => cat.type === type)
      setFilteredCategoryTree(filtered)
      
      // Set first available category of the correct type as default
      const firstMatch = categoriesData.find(c => c.type === type)
      if (firstMatch) {
        setCategoryId(firstMatch.id)
      }
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  async function loadBuckets() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('buckets')
        .select('*')
        .eq('user_id', user.id)
        .order('name')

      if (error) throw error
      setBuckets(data || [])
    } catch (error) {
      console.error('Error loading buckets:', error)
    }
  }

  async function loadInvestments() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('type')

      if (error) throw error
      setInvestments(data || [])
    } catch (error) {
      console.error('Error loading investments:', error)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) throw userError
      if (!user) {
        throw new Error('Utente non autenticato')
      }

      // Convert amount to Number (float)
      const amountNumber = Number(parseFloat(amount))

      // If editing, update instead of insert
      if (editingId) {
        const updateData: any = {
          amount: type === 'transfer' ? -amountNumber : (type === 'income' ? amountNumber : -amountNumber),
          category_id: type === 'transfer' ? null : categoryId, // Transfers don't have categories
          date: new Date(date).toISOString(),
          description: description || null,
          is_work_related: isWorkRelated,
          type: type,
          bucket_id: type === 'transfer' ? (transferSource === 'unassigned' ? null : transferSource) : (type === 'expense' && bucketId ? bucketId : null),
          investment_id: type === 'transfer' && transferDestinationType === 'investment' ? transferDestination : null,
        }

        const { error } = await supabase
          .from('transactions')
          .update(updateData)
          .eq('id', editingId)

        if (error) throw error

        // Reset form
        setEditingId(null)
        setAmount('')
        setDescription('')
        setIsWorkRelated(false)
        setType('expense')
        setBucketId('')
        setApplyAutoSplit(false)
        setTransferSource('')
        setTransferDestinationType('investment')
        setTransferDestination('')
        setDate(new Date().toISOString().split('T')[0])

        onSuccess()
        onClose()
        return
      }

      // Handle EXPENSE with bucket selection
      if (type === 'expense' && bucketId) {
        // Insert transaction with bucket_id
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            amount: amountNumber,
            category_id: categoryId,
            date: new Date(date).toISOString(),
            description: description || null,
            is_work_related: isWorkRelated,
            is_recurring: false,
            type: type,
            bucket_id: bucketId,
            user_id: user.id,
          })

        if (transactionError) throw transactionError

        // Decrement bucket balance
        const bucket = buckets.find(b => b.id === bucketId)
        if (bucket) {
          const newBalance = (bucket.current_balance || 0) - amountNumber
          const { error: bucketError } = await supabase
            .from('buckets')
            .update({ current_balance: newBalance })
            .eq('id', bucketId)

          if (bucketError) throw bucketError
        }
      }
      // Handle INCOME with auto-split
      else if (type === 'income' && applyAutoSplit) {
        // Insert transaction (bucket_id is NULL for income)
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            amount: amountNumber,
            category_id: categoryId,
            date: new Date(date).toISOString(),
            description: description || null,
            is_work_related: isWorkRelated,
            is_recurring: false,
            type: type,
            bucket_id: null,
            user_id: user.id,
          })

        if (transactionError) throw transactionError

        // Get buckets with distribution_percentage > 0
        const bucketsWithDistribution = buckets.filter(b => (b.distribution_percentage || 0) > 0)

        // Distribute income to buckets
        for (const bucket of bucketsWithDistribution) {
          const distributionAmount = (amountNumber * (bucket.distribution_percentage || 0)) / 100
          const newBalance = (bucket.current_balance || 0) + distributionAmount

          const { error: bucketError } = await supabase
            .from('buckets')
            .update({ current_balance: newBalance })
            .eq('id', bucket.id)

          if (bucketError) throw bucketError
        }
      }
      // Handle TRANSFER
      else if (type === 'transfer') {
        if (!transferDestination) {
          throw new Error('Seleziona una destinazione')
        }

        // Transfers should NOT have a category_id
        // Set it to null explicitly

        // Determine destination name for description
        let destinationName = ''
        if (transferDestinationType === 'investment') {
          const investment = investments.find(inv => inv.id === transferDestination)
          destinationName = investment ? investment.type : 'Investimento'
        } else {
          if (transferDestination === 'unassigned') {
            destinationName = 'Liquidità Non Assegnata'
          } else {
            const bucket = buckets.find(b => b.id === transferDestination)
            destinationName = bucket ? bucket.name : 'Bucket'
          }
        }

        // Insert transaction with negative amount
        const transactionData: any = {
          amount: -amountNumber, // Negative amount for transfer
          category_id: null, // Transfers don't have categories
          date: new Date(date).toISOString(),
          description: description || `Trasferimento a ${destinationName}`,
          is_work_related: false,
          is_recurring: false,
          type: 'transfer',
          bucket_id: transferSource === 'unassigned' ? null : transferSource,
          investment_id: transferDestinationType === 'investment' ? transferDestination : null,
          user_id: user.id,
        }

        const { error: transactionError } = await supabase
          .from('transactions')
          .insert(transactionData)

        if (transactionError) throw transactionError

        // Decrement source (bucket or unassigned liquidity)
        if (transferSource !== 'unassigned' && transferSource) {
          const sourceBucket = buckets.find(b => b.id === transferSource)
          if (sourceBucket) {
            const newBalance = (sourceBucket.current_balance || 0) - amountNumber
            const { error: bucketError } = await supabase
              .from('buckets')
              .update({ current_balance: newBalance })
              .eq('id', transferSource)

            if (bucketError) throw bucketError
          }
        }

        // Handle destination based on type
        if (transferDestinationType === 'investment') {
          // Increment investment value
          const investment = investments.find(inv => inv.id === transferDestination)
          if (investment) {
            const newValue = (investment.current_value || 0) + amountNumber
            const { error: investmentError } = await supabase
              .from('investments')
              .update({ 
                current_value: newValue,
                last_updated: new Date().toISOString()
              })
              .eq('id', transferDestination)

            if (investmentError) throw investmentError
          }
        } else {
          // Increment destination bucket (or handle unassigned liquidity)
          if (transferDestination !== 'unassigned' && transferDestination) {
            const destBucket = buckets.find(b => b.id === transferDestination)
            if (destBucket) {
              const newBalance = (destBucket.current_balance || 0) + amountNumber
              const { error: bucketError } = await supabase
                .from('buckets')
                .update({ current_balance: newBalance })
                .eq('id', transferDestination)

              if (bucketError) throw bucketError
            }
          }
          // If destination is 'unassigned', no action needed (it's handled by transaction logic)
        }
      }
      // Handle normal transaction (no bucket, no auto-split)
      else {
        const { error } = await supabase
          .from('transactions')
          .insert({
            amount: amountNumber,
            category_id: categoryId,
            date: new Date(date).toISOString(),
            description: description || null,
            is_work_related: isWorkRelated,
            is_recurring: false,
            type: type,
            bucket_id: null,
            investment_id: null,
            user_id: user.id,
          })

        if (error) throw error
      }

      // Reset form
      setEditingId(null)
      setAmount('')
      setDescription('')
      setIsWorkRelated(false)
      setType('expense')
      setBucketId('')
      setApplyAutoSplit(false)
      setTransferSource('')
      setTransferDestinationType('investment')
      setTransferDestination('')
      setDate(new Date().toISOString().split('T')[0])

      onSuccess()
      onClose()
    } catch (error: any) {
      setError(error.message || 'Errore durante il salvataggio')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {editingId ? 'Modifica Transazione' : 'Nuova Transazione'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Type Toggle */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={cn(
                "flex-1 py-2 px-4 rounded-md font-medium transition-colors text-sm",
                type === 'expense'
                  ? "bg-white text-rose-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Uscita
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={cn(
                "flex-1 py-2 px-4 rounded-md font-medium transition-colors text-sm",
                type === 'income'
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Entrata
            </button>
            <button
              type="button"
              onClick={() => setType('transfer')}
              className={cn(
                "flex-1 py-2 px-4 rounded-md font-medium transition-colors text-sm",
                type === 'transfer'
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Trasferimento
            </button>
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
              Importo (€)
            </label>
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
              placeholder="0.00"
            />
          </div>

          {/* Category - Hidden for transfers */}
          {type !== 'transfer' && (
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                Categoria
              </label>
              <select
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
              >
                {filteredCategoryTree.length === 0 ? (
                  <option value="">
                    {categoryTree.length === 0 
                      ? 'Caricamento categorie...' 
                      : `Nessuna categoria ${type === 'income' ? 'entrata' : 'uscita'} disponibile`}
                  </option>
                ) : (
                  flattenCategories(filteredCategoryTree).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
          
          {/* Info message for transfers */}
          {type === 'transfer' && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-sm text-indigo-700">
                I trasferimenti non richiedono una categoria
              </p>
            </div>
          )}

          {/* Transfer Source (Da) */}
          {type === 'transfer' && (
            <div>
              <label htmlFor="transferSource" className="block text-sm font-medium text-gray-700 mb-2">
                Da (Sorgente)
              </label>
              <select
                id="transferSource"
                value={transferSource}
                onChange={(e) => setTransferSource(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
              >
                <option value="">Seleziona sorgente</option>
                <option value="unassigned">Liquidità Non Assegnata</option>
                {buckets.map((bucket) => (
                  <option key={bucket.id} value={bucket.id}>
                    {bucket.name} ({formatCurrency(bucket.current_balance || 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Transfer Destination Type Toggle */}
          {type === 'transfer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Verso
              </label>
              <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setTransferDestinationType('investment')
                    setTransferDestination('') // Reset destination when switching
                  }}
                  className={cn(
                    "flex-1 py-2 px-4 rounded-md font-medium transition-colors text-sm",
                    transferDestinationType === 'investment'
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  Investimento
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransferDestinationType('bucket')
                    setTransferDestination('') // Reset destination when switching
                  }}
                  className={cn(
                    "flex-1 py-2 px-4 rounded-md font-medium transition-colors text-sm",
                    transferDestinationType === 'bucket'
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  Altro Salvadanaio
                </button>
              </div>
            </div>
          )}

          {/* Transfer Destination (A) - Investment */}
          {type === 'transfer' && transferDestinationType === 'investment' && (
            <div>
              <label htmlFor="transferDestination" className="block text-sm font-medium text-gray-700 mb-2">
                A (Destinazione)
              </label>
              <select
                id="transferDestination"
                value={transferDestination}
                onChange={(e) => setTransferDestination(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
              >
                <option value="">Seleziona investimento</option>
                {investments.map((investment) => (
                  <option key={investment.id} value={investment.id}>
                    {investment.type} ({formatCurrency(investment.current_value || 0)})
                  </option>
                ))}
              </select>
              {investments.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Nessun investimento disponibile. Aggiungine uno nelle Impostazioni.
                </p>
              )}
            </div>
          )}

          {/* Transfer Destination (A) - Bucket */}
          {type === 'transfer' && transferDestinationType === 'bucket' && (
            <div>
              <label htmlFor="transferDestination" className="block text-sm font-medium text-gray-700 mb-2">
                A (Destinazione)
              </label>
              <select
                id="transferDestination"
                value={transferDestination}
                onChange={(e) => setTransferDestination(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
              >
                <option value="">Seleziona destinazione</option>
                <option value="unassigned">Liquidità Non Assegnata</option>
                {buckets
                  .filter(bucket => bucket.id !== transferSource) // Exclude source bucket
                  .map((bucket) => (
                    <option key={bucket.id} value={bucket.id}>
                      {bucket.name} ({formatCurrency(bucket.current_balance || 0)})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Data
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Descrizione
            </label>
            <input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
              placeholder="Descrizione opzionale"
            />
          </div>

          {/* Bucket Selection (for Expenses) */}
          {type === 'expense' && (
            <div>
              <label htmlFor="bucket" className="block text-sm font-medium text-gray-700 mb-2">
                Paga da Bucket (opzionale)
              </label>
              <select
                id="bucket"
                value={bucketId}
                onChange={(e) => setBucketId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
              >
                <option value="">Liquidità Non Assegnata</option>
                {buckets.map((bucket) => (
                  <option key={bucket.id} value={bucket.id}>
                    {bucket.name} ({formatCurrency(bucket.current_balance || 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Auto-Split Checkbox (for Income) */}
          {type === 'income' && (
            <div className="flex items-center gap-3">
              <input
                id="auto-split"
                type="checkbox"
                checked={applyAutoSplit}
                onChange={(e) => setApplyAutoSplit(e.target.checked)}
                className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="auto-split" className="text-sm font-medium text-gray-700">
                Applica Divisione Automatica
              </label>
            </div>
          )}

          {/* Work Related Checkbox */}
          <div className="flex items-center gap-3">
            <input
              id="work-related"
              type="checkbox"
              checked={isWorkRelated}
              onChange={(e) => setIsWorkRelated(e.target.checked)}
              className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="work-related" className="text-sm font-medium text-gray-700">
              Spesa Lavorativa
            </label>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ 
                backgroundColor: primaryColor.startsWith('#') 
                  ? primaryColor 
                  : primaryColor === 'blue' ? '#3b82f6'
                  : primaryColor === 'emerald' ? '#10b981'
                  : primaryColor === 'violet' ? '#8b5cf6'
                  : primaryColor === 'orange' ? '#f97316'
                  : '#3b82f6'
              }}
            >
              {loading ? 'Salvataggio...' : 'Salva Transazione'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
