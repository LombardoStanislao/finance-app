import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Plus, Edit2, Trash2, X, LogOut } from 'lucide-react'
import { supabase, type Category, type Bucket, type Investment } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'

interface SettingsProps {
  onBack: () => void
  onProfileUpdate: () => void
  primaryColor: string
  onColorChange: (color: string) => void
}

interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[]
}

export default function Settings({ onBack, onProfileUpdate, primaryColor, onColorChange }: SettingsProps) {
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  // Categories state
  const [categories, setCategories] = useState<Category[]>([])
  const [incomeTree, setIncomeTree] = useState<CategoryWithChildren[]>([])
  const [expenseTree, setExpenseTree] = useState<CategoryWithChildren[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryBudget, setNewCategoryBudget] = useState('')
  const [newCategoryParent, setNewCategoryParent] = useState<string>('')
  const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('expense')
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  
  // Edit state
  const [editingCategory, setEditingCategory] = useState<CategoryWithChildren | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryBudget, setEditCategoryBudget] = useState<string>('')
  const [editCategoryParent, setEditCategoryParent] = useState<string>('')
  const [editCategoryType, setEditCategoryType] = useState<'income' | 'expense'>('expense')
  const [editCategoryLoading, setEditCategoryLoading] = useState(false)

  // Buckets state
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [newBucketName, setNewBucketName] = useState('')
  const [newBucketDistribution, setNewBucketDistribution] = useState<string>('')
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null)
  const [editBucketName, setEditBucketName] = useState('')
  const [editBucketDistribution, setEditBucketDistribution] = useState<string>('')
  const [bucketLoading, setBucketLoading] = useState(false)
  const [bucketError, setBucketError] = useState<string | null>(null)

  // Investments state
  const [investments, setInvestments] = useState<Investment[]>([])
  const [newInvestmentType, setNewInvestmentType] = useState<'ETF' | 'Obbligazioni' | 'Azioni' | 'Conto Deposito' | 'Crypto' | 'Altro'>('ETF')
  const [newInvestmentValue, setNewInvestmentValue] = useState<string>('')
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null)
  const [editInvestmentType, setEditInvestmentType] = useState<'ETF' | 'Obbligazioni' | 'Azioni' | 'Conto Deposito' | 'Crypto' | 'Altro'>('ETF')
  const [editInvestmentValue, setEditInvestmentValue] = useState<string>('')
  const [investmentLoading, setInvestmentLoading] = useState(false)
  const [investmentError, setInvestmentError] = useState<string | null>(null)

  // Color picker state - convert preset names to HEX if needed
  const [colorHex, setColorHex] = useState<string>(() => {
    // Convert preset names to default HEX values
    const presetMap: Record<string, string> = {
      'blue': '#3b82f6',
      'emerald': '#10b981',
      'violet': '#8b5cf6',
      'orange': '#f97316',
    }
    return presetMap[primaryColor] || primaryColor || '#3b82f6'
  })

  useEffect(() => {
    loadUserProfile()
    loadCategories()
    loadBuckets()
    loadInvestments()
  }, [])

  // Update colorHex when primaryColor prop changes
  useEffect(() => {
    const presetMap: Record<string, string> = {
      'blue': '#3b82f6',
      'emerald': '#10b981',
      'violet': '#8b5cf6',
      'orange': '#f97316',
    }
    if (presetMap[primaryColor]) {
      setColorHex(presetMap[primaryColor])
    } else if (primaryColor.startsWith('#')) {
      setColorHex(primaryColor)
    }
  }, [primaryColor])

  async function loadUserProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.user_metadata?.display_name) {
      setDisplayName(user.user_metadata.display_name)
    }
  }

  // Organize categories into tree structure
  function buildCategoryTree(categories: Category[]): CategoryWithChildren[] {
    const categoryMap = new Map<string, CategoryWithChildren>()
    const rootCategories: CategoryWithChildren[] = []

    // First pass: create map of all categories
    categories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] })
    })

    // Second pass: build tree structure
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

    // Sort categories and their children
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

  async function loadCategories() {
    try {
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
      
      // Split into income and expense categories
      const incomeCategories = categoriesData.filter(cat => cat.type === 'income')
      const expenseCategories = categoriesData.filter(cat => cat.type === 'expense')
      
      setIncomeTree(buildCategoryTree(incomeCategories))
      setExpenseTree(buildCategoryTree(expenseCategories))
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

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setProfileError(null)
    setProfileSuccess(false)

    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName }
      })

      if (error) throw error

      setProfileSuccess(true)
      onProfileUpdate()
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (error: any) {
      setProfileError(error.message || 'Errore durante il salvataggio')
    } finally {
      setLoading(false)
    }
  }

  function handleColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newColor = e.target.value
    setColorHex(newColor)
    onColorChange(newColor)
    localStorage.setItem('primaryColor', newColor)
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    setCategoryLoading(true)
    setCategoryError(null)

    try {
      // Get current user ID
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) throw userError
      if (!user) {
        throw new Error('Utente non autenticato')
      }

      const { error } = await supabase
        .from('categories')
        .insert({
          name: newCategoryName,
          budget_limit: newCategoryBudget ? parseFloat(newCategoryBudget) : null,
          user_id: user.id,
          parent_id: newCategoryParent || null,
          type: newCategoryType,
        })

      if (error) throw error

      setNewCategoryName('')
      setNewCategoryBudget('')
      setNewCategoryParent('')
      setNewCategoryType('expense')
      loadCategories()
    } catch (error: any) {
      setCategoryError(error.message || 'Errore durante il salvataggio')
    } finally {
      setCategoryLoading(false)
    }
  }

  function openEditModal(category: CategoryWithChildren) {
    setEditingCategory(category)
    setEditCategoryName(category.name)
    setEditCategoryBudget(category.budget_limit ? category.budget_limit.toString() : '')
    setEditCategoryParent(category.parent_id || '')
    setEditCategoryType(category.type || 'expense')
    setCategoryError(null)
  }

  function closeEditModal() {
    setEditingCategory(null)
    setEditCategoryName('')
    setEditCategoryBudget('')
    setEditCategoryParent('')
    setEditCategoryType('expense')
    setCategoryError(null)
  }

  async function handleEditCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCategory) return

    setEditCategoryLoading(true)
    setCategoryError(null)

    try {
      const updateData: {
        name: string
        budget_limit: number | null
        parent_id: string | null
        type: 'income' | 'expense'
      } = {
        name: editCategoryName.trim(),
        budget_limit: editCategoryBudget ? parseFloat(editCategoryBudget) : null,
        parent_id: editCategoryParent || null,
        type: editCategoryType,
      }

      const { error } = await supabase
        .from('categories')
        .update(updateData)
        .eq('id', editingCategory.id)

      if (error) throw error

      closeEditModal()
      loadCategories()
    } catch (error: any) {
      console.error('Error updating category:', error)
      setCategoryError(error.message || 'Errore durante l\'aggiornamento')
    } finally {
      setEditCategoryLoading(false)
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!confirm('Sei sicuro di voler eliminare questa categoria? Le sottocategorie verranno eliminate automaticamente.')) {
      return
    }

    try {
      // Delete category and its children (cascade should handle this, but we'll delete explicitly)
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId)

      if (error) throw error

      loadCategories()
    } catch (error: any) {
      console.error('Error deleting category:', error)
      setCategoryError(error.message || 'Errore durante l\'eliminazione')
    }
  }

  // Buckets handlers
  async function handleAddBucket(e: React.FormEvent) {
    e.preventDefault()
    setBucketLoading(true)
    setBucketError(null)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Utente non autenticato')

      const { error } = await supabase
        .from('buckets')
        .insert({
          name: newBucketName,
          distribution_percentage: newBucketDistribution ? parseFloat(newBucketDistribution) : 0,
          current_balance: 0,
          user_id: user.id,
        })

      if (error) throw error

      setNewBucketName('')
      setNewBucketDistribution('')
      loadBuckets()
    } catch (error: any) {
      setBucketError(error.message || 'Errore durante il salvataggio')
    } finally {
      setBucketLoading(false)
    }
  }

  async function handleUpdateBucket(e: React.FormEvent) {
    e.preventDefault()
    if (!editingBucket) return

    setBucketLoading(true)
    setBucketError(null)

    try {
      const { error } = await supabase
        .from('buckets')
        .update({
          name: editBucketName,
          distribution_percentage: editBucketDistribution ? parseFloat(editBucketDistribution) : 0,
        })
        .eq('id', editingBucket.id)

      if (error) throw error

      setEditingBucket(null)
      setEditBucketName('')
      setEditBucketDistribution('')
      loadBuckets()
    } catch (error: any) {
      setBucketError(error.message || 'Errore durante l\'aggiornamento')
    } finally {
      setBucketLoading(false)
    }
  }

  async function handleDeleteBucket(bucketId: string) {
    if (!confirm('Sei sicuro di voler eliminare questo bucket?')) return

    try {
      const { error } = await supabase
        .from('buckets')
        .delete()
        .eq('id', bucketId)

      if (error) throw error
      loadBuckets()
    } catch (error: any) {
      console.error('Error deleting bucket:', error)
      setBucketError(error.message || 'Errore durante l\'eliminazione')
    }
  }

  // Investments handlers
  async function handleAddInvestment(e: React.FormEvent) {
    e.preventDefault()
    setInvestmentLoading(true)
    setInvestmentError(null)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Utente non autenticato')

      const { error } = await supabase
        .from('investments')
        .insert({
          type: newInvestmentType,
          current_value: parseFloat(newInvestmentValue),
          user_id: user.id,
        })

      if (error) throw error

      setNewInvestmentType('ETF')
      setNewInvestmentValue('')
      loadInvestments()
    } catch (error: any) {
      setInvestmentError(error.message || 'Errore durante il salvataggio')
    } finally {
      setInvestmentLoading(false)
    }
  }

  async function handleUpdateInvestment(e: React.FormEvent) {
    e.preventDefault()
    if (!editingInvestment) return

    setInvestmentLoading(true)
    setInvestmentError(null)

    try {
      const { error } = await supabase
        .from('investments')
        .update({
          type: editInvestmentType,
          current_value: parseFloat(editInvestmentValue),
          last_updated: new Date().toISOString(),
        })
        .eq('id', editingInvestment.id)

      if (error) throw error

      setEditingInvestment(null)
      setEditInvestmentType('ETF')
      setEditInvestmentValue('')
      loadInvestments()
    } catch (error: any) {
      setInvestmentError(error.message || 'Errore durante l\'aggiornamento')
    } finally {
      setInvestmentLoading(false)
    }
  }

  async function handleDeleteInvestment(investmentId: string) {
    if (!confirm('Sei sicuro di voler eliminare questo investimento?')) return

    try {
      const { error } = await supabase
        .from('investments')
        .delete()
        .eq('id', investmentId)

      if (error) throw error
      loadInvestments()
    } catch (error: any) {
      console.error('Error deleting investment:', error)
      setInvestmentError(error.message || 'Errore durante l\'eliminazione')
    }
  }

  // Calculate total distribution percentage
  const totalDistributionPercentage = buckets.reduce((sum, bucket) => {
    return sum + (bucket.distribution_percentage || 0)
  }, 0)

  // Flatten categories for dropdown display with visual indentation
  // Excludes a specific category ID (to prevent self-parenting)
  // Filters by type if specified
  function flattenCategories(
    categories: CategoryWithChildren[], 
    level: number = 0, 
    excludeId?: string,
    filterType?: 'income' | 'expense'
  ): Array<{ id: string; name: string; level: number }> {
    const result: Array<{ id: string; name: string; level: number }> = []
    
    categories.forEach(category => {
      // Skip excluded category (the one being edited)
      if (excludeId && category.id === excludeId) {
        return
      }
      
      // Filter by type if specified
      if (filterType && category.type !== filterType) {
        return
      }
      
      // Add dashes based on level for visual indentation
      const indent = '-'.repeat(level)
      const displayName = level > 0 ? `${indent} ${category.name}` : category.name
      
      result.push({
        id: category.id,
        name: displayName,
        level: level
      })
      
      // Recursively add children (also exclude the category being edited and filter by type)
      if (category.children && category.children.length > 0) {
        result.push(...flattenCategories(category.children, level + 1, excludeId, filterType))
      }
    })
    
    return result
  }

  function renderCategory(category: CategoryWithChildren, level: number = 0) {
    // Calculate indentation: level 0 = 0px, level 1 = 20px, level 2 = 40px, etc.
    const indentPx = level * 20

    return (
      <div key={category.id} className="mb-2">
        <div
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          style={{ marginLeft: `${indentPx}px` }}
        >
          <div className="flex-1">
            <p className="font-medium text-gray-900">{category.name}</p>
            {category.budget_limit && (
              <p className="text-xs text-gray-500">
                Budget mensile: €{category.budget_limit.toFixed(2)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openEditModal(category)}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label="Modifica"
            >
              <Edit2 className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => handleDeleteCategory(category.id)}
              className="p-1.5 hover:bg-red-100 rounded transition-colors"
              aria-label="Elimina"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          </div>
        </div>
        {/* Recursively render children */}
        {category.children && category.children.length > 0 && (
          <div>
            {category.children.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full min-h-full bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Indietro"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
        </div>

        {/* Section 1: Profile */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profilo</h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                Il tuo Nome
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Il tuo nome"
              />
            </div>

            {profileError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{profileError}</p>
              </div>
            )}

            {profileSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600">Profilo salvato con successo!</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              {loading ? 'Salvataggio...' : 'Salva Profilo'}
            </button>
          </form>
        </div>

        {/* Section 2: Appearance */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Aspetto</h2>
          <div>
            <label htmlFor="colorPicker" className="block text-sm font-medium text-gray-700 mb-3">
              Colore Primario
            </label>
            <div className="flex items-center gap-4">
              <input
                id="colorPicker"
                type="color"
                value={colorHex}
                onChange={handleColorChange}
                className="w-20 h-20 rounded-lg border-2 border-gray-300 cursor-pointer"
                style={{ backgroundColor: colorHex }}
              />
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-1">Colore selezionato:</p>
                <p className="text-lg font-mono font-semibold text-gray-900">{colorHex.toUpperCase()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Categories */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Gestione Categorie</h2>

          {/* Existing Categories - Split by Type */}
          <div className="mb-6 space-y-6">
            {/* Income Categories */}
            <div>
              <h3 className="text-sm font-medium text-emerald-700 mb-3">Categorie Entrate</h3>
              {incomeTree.length === 0 ? (
                <p className="text-sm text-gray-500">Nessuna categoria entrata</p>
              ) : (
                <div className="space-y-2">
                  {incomeTree.map((category) => renderCategory(category))}
                </div>
              )}
            </div>

            {/* Expense Categories */}
            <div>
              <h3 className="text-sm font-medium text-rose-700 mb-3">Categorie Uscite</h3>
              {expenseTree.length === 0 ? (
                <p className="text-sm text-gray-500">Nessuna categoria uscita</p>
              ) : (
                <div className="space-y-2">
                  {expenseTree.map((category) => renderCategory(category))}
                </div>
              )}
            </div>
          </div>

          {/* Add New Category */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Aggiungi Nuova Categoria</h3>
            <form onSubmit={handleAddCategory} className="space-y-3">
              {/* Type Selection */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Tipo Categoria
                </label>
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setNewCategoryType('expense')
                      setNewCategoryParent('') // Reset parent when changing type
                    }}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-md font-medium transition-colors text-sm",
                      newCategoryType === 'expense'
                        ? "bg-white text-rose-600 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    Uscita
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCategoryType('income')
                      setNewCategoryParent('') // Reset parent when changing type
                    }}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-md font-medium transition-colors text-sm",
                      newCategoryType === 'income'
                        ? "bg-white text-emerald-600 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    Entrata
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="categoryName" className="block text-xs font-medium text-gray-700 mb-1">
                  Nome Categoria
                </label>
                <input
                  id="categoryName"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  required
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Es. Spesa, Intrattenimento"
                />
              </div>

              <div>
                <label htmlFor="parentCategory" className="block text-xs font-medium text-gray-700 mb-1">
                  Categoria Principale (opzionale)
                </label>
                <select
                  id="parentCategory"
                  value={newCategoryParent}
                  onChange={(e) => setNewCategoryParent(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                >
                  <option value="">Nessuna (Categoria Principale)</option>
                  {flattenCategories(
                    newCategoryType === 'income' ? incomeTree : expenseTree,
                    0,
                    undefined,
                    newCategoryType
                  ).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="categoryBudget" className="block text-xs font-medium text-gray-700 mb-1">
                  Budget Mensile (opzionale)
                </label>
                <input
                  id="categoryBudget"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newCategoryBudget}
                  onChange={(e) => setNewCategoryBudget(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="0.00"
                />
              </div>

              {categoryError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{categoryError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={categoryLoading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                {categoryLoading ? 'Salvataggio...' : 'Aggiungi Categoria'}
              </button>
            </form>
          </div>
        </div>

        {/* Section 4: Buckets */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Gestione Buckets</h2>

          {/* Distribution Summary */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900">
              Totale Assegnato: <span className="font-bold">{totalDistributionPercentage.toFixed(1)}%</span>
            </p>
            <p className="text-xs text-blue-700 mt-1">
              {100 - totalDistributionPercentage > 0 
                ? `${(100 - totalDistributionPercentage).toFixed(1)}% andrà alla Liquidità Non Assegnata`
                : 'Attenzione: Hai assegnato il 100% o più!'}
            </p>
          </div>

          {/* Existing Buckets */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Buckets Esistenti</h3>
            {buckets.length === 0 ? (
              <p className="text-sm text-gray-500">Nessun bucket ancora</p>
            ) : (
              <div className="space-y-2">
                {buckets.map((bucket) => (
                  <div key={bucket.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{bucket.name}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-xs text-gray-500">
                          Saldo: <span className="font-semibold text-gray-700">{formatCurrency(bucket.current_balance || 0)}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          Distribuzione: <span className="font-semibold text-gray-700">{bucket.distribution_percentage || 0}%</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingBucket(bucket)
                          setEditBucketName(bucket.name)
                          setEditBucketDistribution((bucket.distribution_percentage || 0).toString())
                        }}
                        className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                        aria-label="Modifica"
                      >
                        <Edit2 className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteBucket(bucket.id)}
                        className="p-1.5 hover:bg-red-100 rounded transition-colors"
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

          {/* Add New Bucket */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Aggiungi Nuovo Bucket</h3>
            <form onSubmit={handleAddBucket} className="space-y-3">
              <div>
                <label htmlFor="bucketName" className="block text-xs font-medium text-gray-700 mb-1">
                  Nome Bucket
                </label>
                <input
                  id="bucketName"
                  type="text"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  required
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Es. Vacanze, Emergenze"
                />
              </div>

              <div>
                <label htmlFor="bucketDistribution" className="block text-xs font-medium text-gray-700 mb-1">
                  Distribuzione Automatica (%)
                </label>
                <input
                  id="bucketDistribution"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={newBucketDistribution}
                  onChange={(e) => setNewBucketDistribution(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="0.0"
                />
                <p className="text-xs text-gray-500 mt-1">Percentuale di entrate da distribuire automaticamente</p>
              </div>

              {bucketError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{bucketError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={bucketLoading}
                className="w-full text-white py-2 rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                style={{ backgroundColor: colorHex }}
              >
                <Plus className="w-4 h-4" />
                {bucketLoading ? 'Salvataggio...' : 'Aggiungi Bucket'}
              </button>
            </form>
          </div>
        </div>

        {/* Section 5: Investments */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Gestione Investimenti</h2>

          {/* Existing Investments */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Investimenti Esistenti</h3>
            {investments.length === 0 ? (
              <p className="text-sm text-gray-500">Nessun investimento ancora</p>
            ) : (
              <div className="space-y-2">
                {investments.map((investment) => (
                  <div key={investment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{investment.type}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Valore: <span className="font-semibold text-gray-700">{formatCurrency(investment.current_value)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingInvestment(investment)
                          setEditInvestmentType(investment.type)
                          setEditInvestmentValue(investment.current_value.toString())
                        }}
                        className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                        aria-label="Modifica"
                      >
                        <Edit2 className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteInvestment(investment.id)}
                        className="p-1.5 hover:bg-red-100 rounded transition-colors"
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

          {/* Add New Investment */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Aggiungi Nuovo Investimento</h3>
            <form onSubmit={handleAddInvestment} className="space-y-3">
              <div>
                <label htmlFor="investmentType" className="block text-xs font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  id="investmentType"
                  value={newInvestmentType}
                  onChange={(e) => setNewInvestmentType(e.target.value as Investment['type'])}
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                >
                  <option value="ETF">ETF</option>
                  <option value="Obbligazioni">Obbligazioni</option>
                  <option value="Azioni">Azioni</option>
                  <option value="Conto Deposito">Conto Deposito</option>
                  <option value="Crypto">Crypto</option>
                  <option value="Altro">Altro</option>
                </select>
              </div>

              <div>
                <label htmlFor="investmentValue" className="block text-xs font-medium text-gray-700 mb-1">
                  Valore Attuale (€)
                </label>
                <input
                  id="investmentValue"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newInvestmentValue}
                  onChange={(e) => setNewInvestmentValue(e.target.value)}
                  required
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="0.00"
                />
              </div>

              {investmentError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{investmentError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={investmentLoading}
                className="w-full text-white py-2 rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                style={{ backgroundColor: colorHex }}
              >
                <Plus className="w-4 h-4" />
                {investmentLoading ? 'Salvataggio...' : 'Aggiungi Investimento'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Edit Bucket Modal */}
      {editingBucket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Modifica Bucket</h2>
              <button
                onClick={() => {
                  setEditingBucket(null)
                  setEditBucketName('')
                  setEditBucketDistribution('')
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleUpdateBucket} className="p-6 space-y-4">
              {bucketError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{bucketError}</p>
                </div>
              )}

              <div>
                <label htmlFor="editBucketName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Bucket
                </label>
                <input
                  id="editBucketName"
                  type="text"
                  value={editBucketName}
                  onChange={(e) => setEditBucketName(e.target.value)}
                  required
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label htmlFor="editBucketDistribution" className="block text-sm font-medium text-gray-700 mb-1">
                  Distribuzione Automatica (%)
                </label>
                <input
                  id="editBucketDistribution"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={editBucketDistribution}
                  onChange={(e) => setEditBucketDistribution(e.target.value)}
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingBucket(null)
                    setEditBucketName('')
                    setEditBucketDistribution('')
                  }}
                  className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={bucketLoading}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {bucketLoading ? 'Salvataggio...' : 'Salva Modifiche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Investment Modal */}
      {editingInvestment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Modifica Investimento</h2>
              <button
                onClick={() => {
                  setEditingInvestment(null)
                  setEditInvestmentType('ETF')
                  setEditInvestmentValue('')
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleUpdateInvestment} className="p-6 space-y-4">
              {investmentError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{investmentError}</p>
                </div>
              )}

              <div>
                <label htmlFor="editInvestmentType" className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  id="editInvestmentType"
                  value={editInvestmentType}
                  onChange={(e) => setEditInvestmentType(e.target.value as Investment['type'])}
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ETF">ETF</option>
                  <option value="Obbligazioni">Obbligazioni</option>
                  <option value="Azioni">Azioni</option>
                  <option value="Conto Deposito">Conto Deposito</option>
                  <option value="Crypto">Crypto</option>
                  <option value="Altro">Altro</option>
                </select>
              </div>

              <div>
                <label htmlFor="editInvestmentValue" className="block text-sm font-medium text-gray-700 mb-1">
                  Valore Attuale (€)
                </label>
                <input
                  id="editInvestmentValue"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editInvestmentValue}
                  onChange={(e) => setEditInvestmentValue(e.target.value)}
                  required
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingInvestment(null)
                    setEditInvestmentType('ETF')
                    setEditInvestmentValue('')
                  }}
                  className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={investmentLoading}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {investmentLoading ? 'Salvataggio...' : 'Salva Modifiche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Modifica Categoria</h2>
              <button
                onClick={closeEditModal}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Chiudi"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEditCategory} className="p-6 space-y-4">
              {categoryError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{categoryError}</p>
                </div>
              )}

              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo Categoria
                </label>
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setEditCategoryType('expense')
                      setEditCategoryParent('') // Reset parent when changing type
                    }}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-md font-medium transition-colors",
                      editCategoryType === 'expense'
                        ? "bg-white text-rose-600 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    Uscita
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditCategoryType('income')
                      setEditCategoryParent('') // Reset parent when changing type
                    }}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-md font-medium transition-colors",
                      editCategoryType === 'income'
                        ? "bg-white text-emerald-600 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    Entrata
                  </button>
                </div>
              </div>

              {/* Name Input */}
              <div>
                <label htmlFor="editCategoryName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Categoria
                </label>
                <input
                  id="editCategoryName"
                  type="text"
                  value={editCategoryName}
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  required
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Nome categoria"
                />
              </div>

              {/* Parent Category Dropdown */}
              <div>
                <label htmlFor="editCategoryParent" className="block text-sm font-medium text-gray-700 mb-1">
                  Categoria Principale
                </label>
                <select
                  id="editCategoryParent"
                  value={editCategoryParent}
                  onChange={(e) => setEditCategoryParent(e.target.value)}
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Nessuna (Categoria Principale)</option>
                  {flattenCategories(
                    editCategoryType === 'income' ? incomeTree : expenseTree,
                    0,
                    editingCategory.id,
                    editCategoryType
                  ).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Budget Input */}
              <div>
                <label htmlFor="editCategoryBudget" className="block text-sm font-medium text-gray-700 mb-1">
                  Budget Mensile (opzionale)
                </label>
                <input
                  id="editCategoryBudget"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editCategoryBudget}
                  onChange={(e) => setEditCategoryBudget(e.target.value)}
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.00"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={editCategoryLoading}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editCategoryLoading ? 'Salvataggio...' : 'Salva Modifiche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logout Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mt-6">
        <button
          onClick={async () => {
            if (window.confirm('Sei sicuro di voler uscire?')) {
              await supabase.auth.signOut()
            }
          }}
          className="w-full py-4 px-6 rounded-xl border-2 border-red-500 text-red-600 font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          Esci dall'Account
        </button>
      </div>
    </div>
  )
}
