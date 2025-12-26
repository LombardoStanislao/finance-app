import { useState, useEffect } from 'react'
import { ArrowLeft, Edit2, ArrowRight, Trash2, Settings } from 'lucide-react'
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
  const [filterStartDate, setFilterStartDate] = useState<string>('')
  const [filterEndDate, setFilterEndDate] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState<string>('')

  useEffect(() => {
    loadCategories()
  }, [])

  useEffect(() => {
    loadTransactions()
    // Reset category filter when type changes
    if (filterCategory !== 'all') {
      const selectedCategory = categories.find(c => c.id === filterCategory)
      if (selectedCategory) {
        // Check if selected category matches current type filter
        if (filterType !== 'all' && selectedCategory.type !== filterType) {
          setFilterCategory('all')
        }
      }
    }
  }, [filterType, filterCategory, filterStartDate, filterEndDate, filterSearch])

  async function loadCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('categories')
        .select('id, name, type')
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

      // Apply filters
      if (filterType !== 'all') {
        query = query.eq('type', filterType)
      }

      if (filterCategory !== 'all') {
        query = query.eq('category_id', filterCategory)
      }

      if (filterStartDate) {
        query = query.gte('date', filterStartDate)
      }

      if (filterEndDate) {
        query = query.lte('date', filterEndDate)
      }

      if (filterSearch) {
        query = query.ilike('description', `%${filterSearch}%`)
      }

      const { data, error } = await query

      if (error) throw error
      setTransactions(data || [])
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

  async function handleDelete(transaction: Transaction, e: React.MouseEvent) {
    e.stopPropagation() // Prevent triggering edit
    
    if (!window.confirm('Sei sicuro di voler eliminare questa transazione?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transaction.id)

      if (error) throw error

      // Refresh the list
      loadTransactions()
    } catch (error: any) {
      console.error('Error deleting transaction:', error)
      alert('Errore durante l\'eliminazione: ' + (error.message || 'Errore sconosciuto'))
    }
  }

  // Get filtered categories based on type filter
  function getFilteredCategories(): Category[] {
    if (filterType === 'all') {
      return categories
    } else if (filterType === 'income') {
      return categories.filter(c => c.type === 'income')
    } else if (filterType === 'expense') {
      return categories.filter(c => c.type === 'expense')
    }
    // For transfers, show all categories (transfers can use any category)
    return categories
  }

  function getCategoryName(categoryId: string): string {
    const category = categories.find(c => c.id === categoryId)
    return category?.name || 'Sconosciuta'
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
            <h1 className="text-2xl font-bold text-gray-900">Storico Transazioni</h1>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Impostazioni"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filtri</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search Filter */}
            <div>
              <label htmlFor="filterSearch" className="block text-sm font-medium text-gray-700 mb-2">
                Cerca Descrizione
              </label>
              <input
                id="filterSearch"
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                placeholder="Es. pizza, caffè..."
              />
            </div>

            {/* Type Filter */}
            <div>
              <label htmlFor="filterType" className="block text-sm font-medium text-gray-700 mb-2">
                Tipo
              </label>
              <select
                id="filterType"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                <option value="all">Tutti</option>
                <option value="income">Entrate</option>
                <option value="expense">Uscite</option>
                <option value="transfer">Trasferimenti</option>
              </select>
            </div>

            {/* Category Filter - Dynamic based on Type */}
            <div>
              <label htmlFor="filterCategory" className="block text-sm font-medium text-gray-700 mb-2">
                Categoria
              </label>
              <select
                id="filterCategory"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                <option value="all">Tutte</option>
                {getFilteredCategories().map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label htmlFor="filterStartDate" className="block text-sm font-medium text-gray-700 mb-2">
                Da Data
              </label>
              <input
                id="filterStartDate"
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>

            {/* End Date */}
            <div>
              <label htmlFor="filterEndDate" className="block text-sm font-medium text-gray-700 mb-2">
                A Data
              </label>
              <input
                id="filterEndDate"
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
          </div>

          {/* Clear Filters */}
          {(filterType !== 'all' || filterCategory !== 'all' || filterStartDate || filterEndDate || filterSearch) && (
            <button
              onClick={() => {
                setFilterType('all')
                setFilterCategory('all')
                setFilterStartDate('')
                setFilterEndDate('')
                setFilterSearch('')
              }}
              className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Rimuovi Filtri
            </button>
          )}
        </div>

        {/* Transactions List */}
        <div>
          {loading ? (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
              <p className="text-gray-500">Caricamento...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
              <p className="text-gray-500">Nessuna transazione trovata</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleEdit(transaction)}
                >
                  <div className="flex-1 flex items-center gap-3">
                    {transaction.type === 'transfer' && (
                      <ArrowRight className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-gray-900">
                          {transaction.type === 'transfer' 
                            ? (transaction.description || 'Trasferimento')
                            : (transaction.description || getCategoryName(transaction.category_id))}
                        </p>
                        {transaction.is_work_related && transaction.type !== 'transfer' && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: `${colorHex}20`,
                              color: colorHex
                            }}
                          >
                            Lavoro
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatDate(transaction.date)}
                        {transaction.type !== 'transfer' && transaction.category_id && (
                          <> • {getCategoryName(transaction.category_id)}</>
                        )}
                        {transaction.type === 'transfer' && (
                          <> • Trasferimento</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className={cn(
                      "font-semibold text-right",
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
                        handleEdit(transaction)
                      }}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Modifica"
                    >
                      <Edit2 className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(transaction, e)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label="Elimina"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Form Modal */}
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

