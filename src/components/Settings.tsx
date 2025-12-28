import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Save, Plus, Edit2, Trash2, X, LogOut, User, Palette, Layers, CheckCircle2, ArrowUpDown, AlertTriangle, GripVertical } from 'lucide-react'
import { supabase, type Category } from '../lib/supabase'
import { cn } from '../lib/utils'

// DND Kit Imports - CORREZIONE QUI SOTTO
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent // <--- Aggiunto 'type' qui per risolvere il crash
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

interface SettingsProps {
  onBack: () => void
  onProfileUpdate: () => void
  primaryColor: string
  onColorChange: (color: string) => void
}

interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[]
}

// Estensione interfaccia Category per includere il rank
interface CategoryWithRank extends Category {
    rank?: number
}

type SortOption = 'rank' | 'name'

// --- COMPONENTE INTERNO PER GLI ITEM SORTABLE ---
function SortableCategoryItem({ 
    category, 
    level, 
    onEdit, 
    onDelete, 
    renderChildren,
    disabled 
}: { 
    category: CategoryWithChildren, 
    level: number, 
    onEdit: (c: CategoryWithChildren) => void, 
    onDelete: (id: string) => void,
    renderChildren: (c: CategoryWithChildren, l: number) => React.ReactNode,
    disabled: boolean
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: category.id, disabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        marginLeft: `${level * 16}px`,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative' as const,
    };

    return (
        <div ref={setNodeRef} style={style} className={cn("group touch-none", isDragging && "opacity-50")}>
            <div className={cn(
                "flex items-center justify-between py-2.5 px-2 border-b border-gray-50 last:border-0 rounded-lg transition-colors",
                isDragging ? "bg-blue-50 border-blue-100 shadow-sm" : "hover:bg-gray-50 bg-white"
            )}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Drag Handle - Visibile solo se non disabilitato (Manuale) */}
                    {!disabled && (
                         <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-gray-300 hover:text-gray-500 touch-none">
                            <GripVertical className="w-4 h-4" />
                        </div>
                    )}
                   
                    <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{category.name}</p>
                        {category.budget_limit && (
                            <p className="text-[10px] text-gray-400">
                                Budget: €{category.budget_limit.toFixed(0)}
                            </p>
                        )}
                    </div>
                </div>
                
                {/* Actions (Non draggabili) */}
                <div className="flex items-center gap-1">
                    <button onClick={() => onEdit(category)} className="p-1.5 hover:bg-gray-200 rounded transition-colors">
                        <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button onClick={() => onDelete(category.id)} className="p-1.5 hover:bg-red-50 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                </div>
            </div>
            
            {/* Renderizzazione ricorsiva dei figli */}
            {category.children && category.children.length > 0 && (
                <div>{renderChildren(category, level + 1)}</div>
            )}
        </div>
    );
}

export default function Settings({ onBack, onProfileUpdate, primaryColor, onColorChange }: SettingsProps) {
  // --- STATE: Profilo ---
  const [displayName, setDisplayName] = useState('')
  const [initialLiquidity, setInitialLiquidity] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  // --- STATE: Categorie ---
  const [categories, setCategories] = useState<CategoryWithRank[]>([])
  // 'rank' è il nuovo 'Standard' (Manuale), 'name' è A-Z
  const [sortCategoriesBy, setSortCategoriesBy] = useState<SortOption>('rank')
  
  // Form Aggiunta Categoria
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryBudget, setNewCategoryBudget] = useState('')
  const [newCategoryParent, setNewCategoryParent] = useState<string>('')
  const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('expense')
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  
  // Modale Modifica Categoria
  const [editingCategory, setEditingCategory] = useState<CategoryWithChildren | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryBudget, setEditCategoryBudget] = useState<string>('')
  const [editCategoryParent, setEditCategoryParent] = useState<string>('')
  const [editCategoryType, setEditCategoryType] = useState<'income' | 'expense'>('expense')
  const [editCategoryLoading, setEditCategoryLoading] = useState(false)

  // --- STATE: Colore ---
  const [colorHex, setColorHex] = useState<string>(() => {
    const presetMap: Record<string, string> = { 'blue': '#3b82f6', 'emerald': '#10b981', 'violet': '#8b5cf6', 'orange': '#f97316' }
    return presetMap[primaryColor] || primaryColor || '#3b82f6'
  })

  // --- DND SENSORS ---
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
    useSensor(TouchSensor, {
        // Importante per mobile: delay o tolleranza per distinguere scroll da drag
        activationConstraint: {
            delay: 250, 
            tolerance: 5,
        },
    })
  );

  // --- INIT ---
  useEffect(() => {
    loadUserProfile()
    loadCategories()
  }, [])

  useEffect(() => {
    const presetMap: Record<string, string> = { 'blue': '#3b82f6', 'emerald': '#10b981', 'violet': '#8b5cf6', 'orange': '#f97316' }
    if (presetMap[primaryColor]) {
      setColorHex(presetMap[primaryColor])
    } else if (primaryColor.startsWith('#')) {
      setColorHex(primaryColor)
    }
  }, [primaryColor])

  // --- LOGICA PROFILO ---
  async function loadUserProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (user?.user_metadata?.display_name) {
      setDisplayName(user.user_metadata.display_name)
    }

    const { data: initialTransaction } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('type', 'initial')
      .single()

    if (initialTransaction) {
      setInitialLiquidity(Math.abs(initialTransaction.amount).toString())
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setProfileError(null)
    setProfileSuccess(false)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Utente non autenticato')

      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName }
      })

      if (error) throw error

      const liquidityAmount = parseFloat(initialLiquidity) || 0
      
      const { data: existingInitial } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'initial')
        .single()

      if (existingInitial) {
        await supabase
          .from('transactions')
          .update({
            amount: liquidityAmount,
            date: new Date().toISOString(),
          })
          .eq('id', existingInitial.id)
      } else if (liquidityAmount > 0) {
        await supabase
          .from('transactions')
          .insert({
            amount: liquidityAmount,
            type: 'initial',
            category_id: null,
            date: new Date().toISOString(),
            description: 'Liquidità iniziale',
            is_work_related: false,
            is_recurring: false,
            bucket_id: null,
            investment_id: null,
            user_id: user.id,
          })
      }

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

  // --- LOGICA CATEGORIE ---
  async function loadCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Carichiamo anche il campo 'rank'.
      const { data, error } = await supabase
        .from('categories')
        .select('*') 
        .eq('user_id', user.id)
        
      if (error) throw error
      
      // Ordinamento iniziale in base al rank (se esiste) o created_at
      const sortedData = (data || []).sort((a: any, b: any) => {
         if (a.rank !== null && b.rank !== null && a.rank !== undefined && b.rank !== undefined) {
             return a.rank - b.rank;
         }
         return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      setCategories(sortedData)
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  // Costruzione Albero con Ordinamento Dinamico
  const { incomeTree, expenseTree } = useMemo(() => {
    const buildTree = (cats: CategoryWithRank[]) => {
      const categoryMap = new Map<string, CategoryWithChildren>()
      const rootCategories: CategoryWithChildren[] = []

      // Map initialization
      cats.forEach(cat => categoryMap.set(cat.id, { ...cat, children: [] }))

      // Build hierarchy
      cats.forEach(cat => {
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

      // Recursive Sort
      const sortRecursive = (nodes: CategoryWithChildren[]) => {
        if (sortCategoriesBy === 'name') {
            nodes.sort((a, b) => a.name.localeCompare(b.name))
        } else {
            // Rank sorting (Manual)
            nodes.sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0))
        }

        nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
                sortRecursive(node.children)
            }
        })
      }

      sortRecursive(rootCategories)
      return rootCategories
    }

    return {
        incomeTree: buildTree(categories.filter(c => c.type === 'income')),
        expenseTree: buildTree(categories.filter(c => c.type === 'expense'))
    }
  }, [categories, sortCategoriesBy])

  // --- DND HANDLER ---
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    // Troviamo gli elementi originali
    const activeItem = categories.find(c => c.id === active.id);
    const overItem = categories.find(c => c.id === over.id);

    if (!activeItem || !overItem) return;

    // Solo riordino tra fratelli (stesso parent_id)
    if (activeItem.parent_id !== overItem.parent_id) return;

    // Calcoliamo il nuovo ordine
    const siblings = categories
        .filter(c => c.parent_id === activeItem.parent_id && c.type === activeItem.type)
        .sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0));
    
    const oldIndex = siblings.findIndex(x => x.id === active.id);
    const newIndex = siblings.findIndex(x => x.id === over.id);

    const newOrder = arrayMove(siblings, oldIndex, newIndex);

    // Aggiorniamo lo stato locale e i rank
    const updates: { id: string, rank: number }[] = [];
    
    const updatedCategories = categories.map(cat => {
        const foundIndex = newOrder.findIndex(item => item.id === cat.id);
        if (foundIndex !== -1) {
            updates.push({ id: cat.id, rank: foundIndex });
            return { ...cat, rank: foundIndex };
        }
        return cat;
    });

    setCategories(updatedCategories); // Update Optimistic

    // Aggiorniamo Supabase in background
    try {
        for (const update of updates) {
            await supabase.from('categories').update({ rank: update.rank }).eq('id', update.id);
        }
    } catch (err) {
        console.error("Errore salvataggio ordine", err);
        loadCategories(); // Revert in case of error
    }
  }

  // --- FLATTEN HELPERS ---
  function flattenCategories(
    categories: CategoryWithChildren[], 
    level: number = 0, 
    excludeId?: string,
    filterType?: 'income' | 'expense'
  ): Array<{ id: string; name: string; level: number }> {
    const result: Array<{ id: string; name: string; level: number }> = []
    
    categories.forEach(category => {
      if (excludeId && category.id === excludeId) return
      if (filterType && category.type !== filterType) return
      
      const indent = '-'.repeat(level)
      const displayName = level > 0 ? `${indent} ${category.name}` : category.name
      
      result.push({ id: category.id, name: displayName, level: level })
      
      if (category.children && category.children.length > 0) {
        result.push(...flattenCategories(category.children, level + 1, excludeId, filterType))
      }
    })
    
    return result
  }

  // --- CRUD ACTIONS ---
  function validateBudgetLogic(amount: number, parentId: string | null, currentCategoryId: string | null): string | null {
    if (amount <= 0) return null
    if (parentId) {
        const parent = categories.find(c => c.id === parentId)
        if (parent && parent.budget_limit && parent.budget_limit > 0) {
            if (amount > parent.budget_limit) return `Il budget supera quello del genitore "${parent.name}" (€${parent.budget_limit})`
            const siblings = categories.filter(c => c.parent_id === parentId && c.id !== currentCategoryId)
            const siblingsTotal = siblings.reduce((sum, s) => sum + (s.budget_limit || 0), 0)
            const remaining = parent.budget_limit - siblingsTotal
            if (amount > remaining) return `Budget eccessivo. Disponibile nel genitore "${parent.name}": €${remaining} (su €${parent.budget_limit})`
        }
    }
    if (currentCategoryId) {
        const children = categories.filter(c => c.parent_id === currentCategoryId)
        const childrenTotal = children.reduce((sum, c) => sum + (c.budget_limit || 0), 0)
        if (childrenTotal > 0 && amount < childrenTotal) return `Il budget è troppo basso. Le sottocategorie richiedono almeno €${childrenTotal}`
    }
    return null
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    setCategoryLoading(true)
    setCategoryError(null)

    const budgetVal = newCategoryBudget ? parseFloat(newCategoryBudget) : 0
    if (newCategoryType === 'expense' && budgetVal > 0) {
        const errorMsg = validateBudgetLogic(budgetVal, newCategoryParent || null, null)
        if (errorMsg) { setCategoryError(errorMsg); setCategoryLoading(false); return }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Utente non autenticato')

      // Get Max Rank for new item
      const siblings = categories.filter(c => c.parent_id === (newCategoryParent || null) && c.type === newCategoryType);
      const maxRank = siblings.length > 0 ? Math.max(...siblings.map((s: any) => s.rank || 0)) : 0;

      const { error } = await supabase
        .from('categories')
        .insert({
          name: newCategoryName,
          budget_limit: newCategoryType === 'expense' && newCategoryBudget ? budgetVal : null,
          user_id: user.id,
          parent_id: newCategoryParent || null,
          type: newCategoryType,
          rank: maxRank + 1
        })

      if (error) throw error
      setNewCategoryName(''); setNewCategoryBudget(''); setNewCategoryParent('');
      loadCategories()
    } catch (error: any) {
      setCategoryError(error.message || 'Errore durante il salvataggio')
    } finally {
      setCategoryLoading(false)
    }
  }

  async function handleEditCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCategory) return
    setEditCategoryLoading(true)
    setCategoryError(null)

    const budgetVal = editCategoryBudget ? parseFloat(editCategoryBudget) : 0
    if (editCategoryType === 'expense' && budgetVal > 0) {
        const errorMsg = validateBudgetLogic(budgetVal, editCategoryParent || null, editingCategory.id)
        if (errorMsg) { setCategoryError(errorMsg); setEditCategoryLoading(false); return }
    }

    try {
      const updateData = {
        name: editCategoryName.trim(),
        budget_limit: editCategoryType === 'expense' && editCategoryBudget ? budgetVal : null,
        parent_id: editCategoryParent || null,
        type: editCategoryType,
      }
      const { error } = await supabase.from('categories').update(updateData).eq('id', editingCategory.id)
      if (error) throw error
      closeEditModal(); loadCategories()
    } catch (error: any) {
      setCategoryError(error.message || 'Errore durante l\'aggiornamento')
    } finally {
      setEditCategoryLoading(false)
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!confirm('Sei sicuro di voler eliminare questa categoria?')) return
    try {
      const { error } = await supabase.from('categories').delete().eq('id', categoryId)
      if (error) throw error
      loadCategories()
    } catch (error: any) {
      setCategoryError(error.message || 'Errore durante l\'eliminazione')
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
    setEditingCategory(null); setEditCategoryName(''); setEditCategoryBudget(''); setEditCategoryParent(''); setEditCategoryType('expense'); setCategoryError(null)
  }

  // --- RENDER HELPERS ---
  const renderSortableList = (list: CategoryWithChildren[], level: number = 0) => {
    // Solo se stiamo in modalità rank attiviamo il context sortable
    const sortableIds = list.map(c => c.id);
    
    return (
        <SortableContext 
            items={sortableIds} 
            strategy={verticalListSortingStrategy}
            disabled={sortCategoriesBy === 'name'} // Disabilita DND se in A-Z
        >
            <div className="space-y-1">
                {list.map(cat => (
                    <SortableCategoryItem
                        key={cat.id}
                        category={cat}
                        level={level}
                        onEdit={openEditModal}
                        onDelete={handleDeleteCategory}
                        disabled={sortCategoriesBy === 'name'}
                        renderChildren={(parent, lvl) => (
                           // Qui annidiamo un altro SortableContext per i figli
                           renderSortableList(parent.children || [], lvl)
                        )}
                    />
                ))}
            </div>
        </SortableContext>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER STICKY */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Impostazioni</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        
        {/* PROFILO */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Profilo</h2>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nome</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full mt-1 p-3 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-sm" placeholder="Il tuo nome" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Liquidità Iniziale</label>
              <input type="number" step="0.01" value={initialLiquidity} onChange={(e) => setInitialLiquidity(e.target.value)} className="w-full mt-1 p-3 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-sm" placeholder="0.00" />
            </div>
            {/* Visualizzazione Errore Profilo */}
            {profileError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {profileError}
                </div>
            )}
            {profileSuccess && <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-3 rounded-lg text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Salvato con successo!</div>}
          </div>
        </div>

        {/* ASPETTO */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
            <Palette className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Aspetto</h2>
          </div>
          <div className="p-5 flex items-center gap-4">
              <input type="color" value={colorHex} onChange={handleColorChange} className="w-14 h-14 rounded-xl border-4 border-white shadow-md cursor-pointer" />
              <div><p className="text-sm font-medium text-gray-900">Colore Tema</p><p className="text-xs text-gray-500 font-mono">{colorHex.toUpperCase()}</p></div>
          </div>
        </div>

        {/* CATEGORIE DND SECTION */}
        <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-orange-600" />
                    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Categorie</h2>
                </div>
                {/* Sort Toggle */}
                <button 
                    onClick={() => setSortCategoriesBy(prev => prev === 'rank' ? 'name' : 'rank')}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    {sortCategoriesBy === 'name' ? 'A-Z' : 'Manuale'}
                </button>
            </div>
            <div className="p-5 space-y-6">
                
                {/* Liste Categorie Sortable */}
                <div className="grid grid-cols-1 gap-6">
                    <div>
                        <h3 className="text-xs font-bold text-emerald-600 uppercase mb-2 ml-1">Entrate</h3>
                        <div className="bg-white rounded-xl border border-gray-100 p-2 space-y-1">
                            {renderSortableList(incomeTree)}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-rose-600 uppercase mb-2 ml-1">Uscite</h3>
                        <div className="bg-white rounded-xl border border-gray-100 p-2 space-y-1">
                            {renderSortableList(expenseTree)}
                        </div>
                    </div>
                </div>

                {/* Form Aggiunta */}
                <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-3 text-center">Aggiungi Nuova</p>
                    <form onSubmit={handleAddCategory} className="space-y-3">
                        <div className="flex gap-2 bg-gray-50 p-1 rounded-lg">
                            <button type="button" onClick={() => { setNewCategoryType('expense'); setNewCategoryParent('') }} className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-all", newCategoryType === 'expense' ? "bg-white text-rose-600 shadow-sm" : "text-gray-400")}>Uscita</button>
                            <button type="button" onClick={() => { setNewCategoryType('income'); setNewCategoryParent('') }} className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-all", newCategoryType === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400")}>Entrata</button>
                        </div>
                        <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} required className="w-full p-3 bg-gray-50 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Nome Categoria" />
                        <div className="flex gap-2">
                            <select value={newCategoryParent} onChange={(e) => setNewCategoryParent(e.target.value)} className="flex-1 p-3 bg-gray-50 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all">
                                <option value="">Principale</option>
                                {flattenCategories(newCategoryType === 'income' ? incomeTree : expenseTree, 0, undefined, newCategoryType).map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                            </select>
                            {newCategoryType === 'expense' && (
                                <div className="w-24 relative">
                                    <input type="number" value={newCategoryBudget} onChange={(e) => setNewCategoryBudget(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 transition-all" placeholder="Budget" />
                                </div>
                            )}
                        </div>
                        {categoryError && <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-600 text-xs font-medium animate-in fade-in slide-in-from-top-1"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{categoryError}</span></div>}
                        <button type="submit" disabled={categoryLoading} className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Aggiungi</button>
                    </form>
                </div>
            </div>
            </div>
        </DndContext>
        
        {/* ACTION BUTTONS BOTTOM */}
        <div className="space-y-3">
            <button onClick={handleSaveProfile} disabled={loading} className="w-full py-4 text-white rounded-2xl font-bold text-sm shadow-lg shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2" style={{ backgroundColor: colorHex }}>
              <Save className="w-4 h-4" /> {loading ? 'Salvataggio...' : 'Salva Profilo'}
            </button>
            <button onClick={async () => { if (window.confirm('Uscire?')) await supabase.auth.signOut() }} className="w-full py-4 text-red-500 font-bold text-sm bg-white rounded-2xl border border-gray-100 hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" /> Esci dall'account
            </button>
        </div>

      </div>

      {/* Edit Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center"><h3 className="font-bold text-lg">Modifica Categoria</h3><button onClick={closeEditModal} className="p-1 bg-gray-100 rounded-full hover:bg-gray-200"><X className="w-5 h-5 text-gray-400" /></button></div>
            <form onSubmit={handleEditCategory} className="space-y-4">
               <div className="flex gap-2 bg-gray-50 p-1 rounded-lg">
                  <button type="button" onClick={() => setEditCategoryType('expense')} className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-all", editCategoryType === 'expense' ? "bg-white text-rose-600 shadow-sm" : "text-gray-400")}>Uscita</button>
                  <button type="button" onClick={() => setEditCategoryType('income')} className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-all", editCategoryType === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400")}>Entrata</button>
               </div>
               <input type="text" value={editCategoryName} onChange={e => setEditCategoryName(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl font-medium outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all" placeholder="Nome" />
               <div className="flex gap-2">
                 <select value={editCategoryParent} onChange={(e) => setEditCategoryParent(e.target.value)} className="flex-1 p-3 bg-gray-50 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all">
                    <option value="">Principale</option>
                    {flattenCategories(editCategoryType === 'income' ? incomeTree : expenseTree, 0, editingCategory.id, editCategoryType).map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                 </select>
                 {editCategoryType === 'expense' && (<div className="w-24 relative"><input type="number" value={editCategoryBudget} onChange={e => setEditCategoryBudget(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl font-medium outline-none border-2 border-transparent focus:bg-white transition-all" placeholder="Budget" /></div>)}
               </div>
               {categoryError && <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-600 text-xs font-medium animate-in fade-in slide-in-from-top-1"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{categoryError}</span></div>}
               <button type="submit" disabled={editCategoryLoading} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">{editCategoryLoading ? 'Salvataggio...' : 'Salva Modifiche'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}