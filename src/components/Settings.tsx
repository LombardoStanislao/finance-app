import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Save, Plus, Edit2, Trash2, X, LogOut, User, Palette, Layers, CheckCircle2, ArrowUpDown, AlertTriangle, GripVertical, AlertOctagon, Wallet, ChevronRight, Lock, Briefcase, Calculator } from 'lucide-react'
import { supabase, type Category } from '../lib/supabase'
import { cn } from '../lib/utils'

// DND Kit Imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent
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

    const isSystemCategory = category.name === '📉 Commissioni Investimenti';

    return (
        <div ref={setNodeRef} style={style} className={cn("group touch-none", isDragging && "opacity-50")}>
            <div className={cn(
                "flex items-center justify-between py-2.5 px-2 border-b border-gray-50 last:border-0 rounded-lg transition-colors",
                isDragging ? "bg-blue-50 border-blue-100 shadow-sm" : "hover:bg-gray-50 bg-white"
            )}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Drag Handle */}
                    {!disabled && (
                         <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-gray-300 hover:text-gray-500 touch-none">
                            <GripVertical className="w-4 h-4" />
                        </div>
                    )}
                   
                    <div className="min-w-0 flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm truncate">{category.name}</p>
                        {isSystemCategory && <Lock className="w-3 h-3 text-gray-400" />}
                        {category.budget_limit && (
                            <p className="text-[10px] text-gray-400">
                                Budget: €{category.budget_limit.toFixed(0)}
                            </p>
                        )}
                    </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button 
                        onClick={() => {
                            if (isSystemCategory) {
                                alert('Questa categoria è gestita automaticamente dal sistema e non può essere modificata.');
                                return;
                            }
                            onEdit(category);
                        }} 
                        className={cn("p-1.5 rounded transition-colors", isSystemCategory ? "opacity-30 cursor-not-allowed text-gray-400" : "hover:bg-gray-200 text-gray-500")}
                        title={isSystemCategory ? "Categoria di sistema" : "Modifica"}
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                        onClick={() => {
                            if (isSystemCategory) {
                                alert('Questa categoria è fondamentale per il tracciamento degli investimenti e non può essere eliminata.');
                                return;
                            }
                            onDelete(category.id);
                        }} 
                        className={cn("p-1.5 rounded transition-colors", isSystemCategory ? "opacity-30 cursor-not-allowed text-gray-400" : "hover:bg-red-50 text-red-500")}
                        title={isSystemCategory ? "Categoria di sistema" : "Elimina"}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
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
  
  // --- STATE: Profilo Fiscale (P.IVA) ---
  const [isProTax, setIsProTax] = useState(false)
  const [profitabilityCoeff, setProfitabilityCoeff] = useState<string>('78')
  const [inpsRate, setInpsRate] = useState<string>('26.23')
  const [flatTaxRate, setFlatTaxRate] = useState<string>('5')

  const [loading, setLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // --- STATE: Categorie ---
  const [categories, setCategories] = useState<CategoryWithRank[]>([])
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
  const [colorHex, setColorHex] = useState<string>(primaryColor)

  // --- DND SENSORS ---
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
    useSensor(TouchSensor, {
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
    setColorHex(primaryColor)
  }, [primaryColor])

  // --- LOGICA PROFILO ---
  async function loadUserProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (user?.user_metadata?.display_name) {
      setDisplayName(user.user_metadata.display_name)
    }

    // Carica dati profilo estesi
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro_tax, tax_profitability_coeff, tax_inps_rate, tax_flat_rate')
      .eq('id', user.id)
      .maybeSingle()

    if (profile) {
        setIsProTax(profile.is_pro_tax || false)
        if (profile.tax_profitability_coeff) setProfitabilityCoeff(profile.tax_profitability_coeff.toString())
        if (profile.tax_inps_rate) setInpsRate(profile.tax_inps_rate.toString())
        if (profile.tax_flat_rate) setFlatTaxRate(profile.tax_flat_rate.toString())
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

  function handleLocalColorChange(val: string) {
      setColorHex(val)
      onColorChange(val) 
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

      // 1. Aggiorna Nome
      const { error: authErr } = await supabase.auth.updateUser({
        data: { display_name: displayName }
      })
      if (authErr) throw authErr

      // 2. Aggiorna Colore & Dati Fiscali
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({ 
            id: user.id, 
            theme_color: colorHex,
            is_pro_tax: isProTax,
            tax_profitability_coeff: parseFloat(profitabilityCoeff),
            tax_inps_rate: parseFloat(inpsRate),
            tax_flat_rate: parseFloat(flatTaxRate),
            updated_at: new Date().toISOString()
        })
      if (profileErr) throw profileErr

      // 3. Aggiorna Liquidità Iniziale
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

  async function handleFactoryReset() {
      if (!window.confirm('⚠️ ATTENZIONE: Stai per eliminare TUTTI i tuoi dati (Transazioni, Salvadanai, Investimenti, Categorie).\n\nL\'operazione è IRREVERSIBILE. Vuoi procedere?')) {
          return
      }
      if (!window.confirm('Sei ASSOLUTAMENTE sicuro? Tutti i dati andranno persi per sempre e l\'app tornerà come nuova.')) {
          return
      }

      setResetLoading(true)
      try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) throw new Error('Utente non autenticato')

          const { error: tError } = await supabase.from('transactions').delete().eq('user_id', user.id)
          if (tError) throw tError

          const { error: iError } = await supabase.from('investments').delete().eq('user_id', user.id)
          if (iError) throw iError

          const { error: bError } = await supabase.from('buckets').delete().eq('user_id', user.id)
          if (bError) throw bError

          const { error: cError } = await supabase.from('categories').delete().eq('user_id', user.id)
          if (cError) throw cError

          setCategories([])
          setInitialLiquidity('')
          onProfileUpdate()
          alert('Reset completato con successo. Benvenuto nel tuo nuovo inizio!')
          
      } catch (error: any) {
          console.error('Factory Reset Error:', error)
          alert('Si è verificato un errore durante il ripristino: ' + error.message)
      } finally {
          setResetLoading(false)
      }
  }

  // --- LOGICA CATEGORIE ---
  async function loadCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('categories')
        .select('*') 
        .eq('user_id', user.id)
        
      if (error) throw error
      
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

  const { incomeTree, expenseTree } = useMemo(() => {
    const buildTree = (cats: CategoryWithRank[]) => {
      const categoryMap = new Map<string, CategoryWithChildren>()
      const rootCategories: CategoryWithChildren[] = []

      cats.forEach(cat => categoryMap.set(cat.id, { ...cat, children: [] }))

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

      const sortRecursive = (nodes: CategoryWithChildren[]) => {
        if (sortCategoriesBy === 'name') {
            nodes.sort((a, b) => a.name.localeCompare(b.name))
        } else {
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const activeItem = categories.find(c => c.id === active.id);
    const overItem = categories.find(c => c.id === over.id);

    if (!activeItem || !overItem) return;
    if (activeItem.parent_id !== overItem.parent_id) return;

    const siblings = categories
        .filter(c => c.parent_id === activeItem.parent_id && c.type === activeItem.type)
        .sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0));
    
    const oldIndex = siblings.findIndex(x => x.id === active.id);
    const newIndex = siblings.findIndex(x => x.id === over.id);

    const newOrder = arrayMove(siblings, oldIndex, newIndex);

    const updates: { id: string, rank: number }[] = [];
    
    const updatedCategories = categories.map(cat => {
        const foundIndex = newOrder.findIndex(item => item.id === cat.id);
        if (foundIndex !== -1) {
            updates.push({ id: cat.id, rank: foundIndex });
            return { ...cat, rank: foundIndex };
        }
        return cat;
    });

    setCategories(updatedCategories);

    try {
        for (const update of updates) {
            await supabase.from('categories').update({ rank: update.rank }).eq('id', update.id);
        }
    } catch (err) {
        console.error("Errore salvataggio ordine", err);
        loadCategories();
    }
  }

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
    
    // SAFETY CHECK SERVER-SIDE
    if (editingCategory.name === 'Commissioni Investimenti') {
        alert('Modifica non consentita per categoria di sistema.');
        return;
    }

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
    const cat = categories.find(c => c.id === categoryId)
    
    // BLOCCO ELIMINAZIONE PER CATEGORIA DI SISTEMA
    if (cat?.name === 'Commissioni Investimenti') {
        alert('Questa è una categoria di sistema per le commissioni. Non può essere eliminata.')
        return
    }

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
    const sortableIds = list.map(c => c.id);
    
    return (
        <SortableContext 
            items={sortableIds} 
            strategy={verticalListSortingStrategy}
            disabled={sortCategoriesBy === 'name'}
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
        
        {/* 1. SITUAZIONE DI PARTENZA */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Wallet className="w-5 h-5" />
                </div>
                <h2 className="font-bold text-gray-900">Situazione di Partenza</h2>
            </div>
            
            <div className="space-y-4">
                <p className="text-sm text-gray-500">
                    Imposta qui la liquidità che hai già sui conti correnti al momento dell'installazione dell'app.
                </p>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Liquidità Iniziale (€)</label>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            value={initialLiquidity}
                            onChange={(e) => setInitialLiquidity(e.target.value)}
                            className="flex-1 p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-gray-900"
                            placeholder="0.00"
                        />
                    </div>
                </div>
                
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 mt-2">
                    <p className="text-xs text-gray-600 font-medium mb-2">
                        Hai già degli investimenti?
                    </p>
                    <button 
                        onClick={onBack} 
                        className="w-full text-left text-xs text-blue-600 font-bold flex items-center justify-between group"
                    >
                        Vai alla sezione Investimenti
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <p className="text-[10px] text-gray-400 mt-1">
                        Aggiungili lì selezionando "Già in portafoglio" per non scalare la liquidità.
                    </p>
                </div>
            </div>
        </div>

        {/* 2. PROFILO & ASPETTO */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Profilo & Aspetto</h2>
          </div>
          <div className="p-5 space-y-6">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nome Visualizzato</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full mt-1 p-3 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-sm"
                placeholder="Il tuo nome"
              />
            </div>
            
            {/* COLOR PICKER AGGIORNATO */}
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Colore Tema Principale</label>
                <div className="flex gap-3 items-center">
                    <div className="relative w-14 h-14 rounded-2xl overflow-hidden shadow-sm border border-gray-200">
                        <input 
                            type="color" 
                            value={colorHex} 
                            onChange={(e) => handleLocalColorChange(e.target.value)}
                            className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer" 
                        />
                    </div>
                    <div className="flex-1">
                        <input 
                            type="text" 
                            value={colorHex} 
                            onChange={(e) => handleLocalColorChange(e.target.value)}
                            className="w-full p-3 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 font-mono text-sm uppercase"
                            placeholder="#000000"
                        />
                    </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                    Scegli un colore dallo spettro o inserisci il codice HEX. Verrà salvato nel tuo profilo.
                </p>
            </div>
          </div>
        </div>

        {/* 3. PROFILO FISCALE (NUOVO) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-purple-600" />
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Profilo Fiscale (P.IVA)</h2>
            </div>
            <div className="p-5 space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-gray-900">Regime Forfettario</p>
                        <p className="text-xs text-gray-500">Abilita calcolo automatico tasse</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={isProTax} 
                            onChange={() => setIsProTax(!isProTax)} 
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-purple-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                </div>

                {isProTax && (
                    <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1 block mb-1">Coefficiente di Redditività (%)</label>
                            <div className="relative">
                                <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="number"
                                    step="0.01"
                                    value={profitabilityCoeff}
                                    onChange={(e) => setProfitabilityCoeff(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-purple-500 font-medium text-sm"
                                    placeholder="Es. 78"
                                />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 ml-1">Percentuale del fatturato su cui calcolare le tasse.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase ml-1 block mb-1">Aliquota INPS (%)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={inpsRate}
                                    onChange={(e) => setInpsRate(e.target.value)}
                                    className="w-full p-3 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-purple-500 font-medium text-sm"
                                    placeholder="Es. 26.23"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase ml-1 block mb-1">Imposta Sostitutiva (%)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={flatTaxRate}
                                    onChange={(e) => setFlatTaxRate(e.target.value)}
                                    className="w-full p-3 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-purple-500 font-medium text-sm"
                                    placeholder="Es. 5 o 15"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* FEEDBACK SALVATAGGIO */}
        {profileError && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {profileError}
            </div>
        )}
        {profileSuccess && <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-3 rounded-lg text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Salvato con successo!</div>}

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
        <div className="space-y-3 pt-6 border-t border-gray-100">
            {/* TASTO SALVA PROFILO */}
            <button onClick={handleSaveProfile} disabled={loading} className="w-full py-4 text-white rounded-2xl font-bold text-sm shadow-lg shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2" style={{ backgroundColor: colorHex }}>
              <Save className="w-4 h-4" /> {loading ? 'Salvataggio...' : 'Salva Modifiche'}
            </button>
            
            {/* TASTO FACTORY RESET - PERICOLO */}
            <button 
                onClick={handleFactoryReset} 
                disabled={resetLoading} 
                className="w-full py-4 text-red-600 bg-red-50 border border-red-100 rounded-2xl font-bold text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
              <AlertOctagon className="w-4 h-4" /> 
              {resetLoading ? 'Cancellazione in corso...' : 'RIPRISTINA DATI DI FABBRICA'}
            </button>

            {/* TASTO ESCI ACCOUNT */}
            <button onClick={async () => { if (window.confirm('Uscire?')) await supabase.auth.signOut() }} className="w-full py-4 text-gray-500 font-bold text-sm bg-white rounded-2xl border border-gray-100 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
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