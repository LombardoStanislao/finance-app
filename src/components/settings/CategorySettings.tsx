import { useState, useEffect, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, ChevronDown, ChevronRight, Lock, Layers, ArrowUpDown, AlertTriangle, GripVertical } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase, type Category } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'

import {
  DndContext,
  closestCorners,
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
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[]
}

interface CategoryWithRank extends Category {
    rank?: number
}

type SortOption = 'rank' | 'name'

function SortableCategoryItem({ 
    category, 
    level, 
    onEdit, 
    onDelete, 
    renderChildren,
    disabled,
    isCollapsed,
    onToggleCollapse
}: { 
    category: CategoryWithChildren, 
    level: number, 
    onEdit: (c: CategoryWithChildren) => void, 
    onDelete: (id: string) => void,
    renderChildren: (c: CategoryWithChildren, l: number) => React.ReactNode,
    disabled: boolean,
    isCollapsed: boolean,
    onToggleCollapse: (id: string) => void
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
        touchAction: 'pan-y',
    };

    const isSystemCategory = category.name === 'Commissioni Investimenti';
    const hasChildren = category.children && category.children.length > 0;

    return (
        <div ref={setNodeRef} style={style} className={cn("group", isDragging && "opacity-50 relative z-50")}>
            <div className={cn(
                "flex items-center justify-between py-2.5 px-2 border-b border-gray-50 last:border-0 rounded-lg transition-colors",
                isDragging ? "bg-blue-50 border-blue-100 shadow-sm" : "hover:bg-gray-50 bg-white"
            )}>
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    {!disabled && (
                         <div 
                            {...attributes} 
                            {...listeners} 
                            className="cursor-grab active:cursor-grabbing p-2 text-gray-300 hover:text-gray-500 touch-none"
                         >
                            <GripVertical className="w-4 h-4" />
                        </div>
                    )}
                    {hasChildren ? (
                        <button 
                            onClick={() => onToggleCollapse(category.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                        >
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    ) : (
                        <div className="w-6" />
                    )}
                    <div className="min-w-0 flex items-center gap-2 ml-1">
                        <p className="font-medium text-gray-900 text-sm truncate select-none">{category.name}</p>
                        {isSystemCategory && <Lock className="w-3 h-3 text-gray-400" />}
                        {category.budget_limit && (
                            <p className="text-[10px] text-gray-400">
                                Budget: €{category.budget_limit.toFixed(0)}
                            </p>
                        )}
                        {hasChildren && isCollapsed && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                                {category.children?.length}
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-1">
                    <button 
                        onClick={() => {
                            if (isSystemCategory) {
                                toast.error('Questa categoria è gestita automaticamente dal sistema e non può essere modificata.', { duration: 5000 });
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
                                toast.error('Questa categoria è fondamentale per il tracciamento degli investimenti e non può essere eliminata.', { duration: 5000 });
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
            
            {!isCollapsed && hasChildren && (
                <div className="animate-in slide-in-from-top-1 fade-in duration-200">
                    {renderChildren(category, level + 1)}
                </div>
            )}
        </div>
    );
}

export function CategorySettings() {
    const { user } = useAuth()
    const [categories, setCategories] = useState<CategoryWithRank[]>([])
    const [sortCategoriesBy, setSortCategoriesBy] = useState<SortOption>('rank')
    const [collapsedIds, setCollapsedIds] = useState<string[]>([])

    const [newCategoryName, setNewCategoryName] = useState('')
    const [newCategoryBudget, setNewCategoryBudget] = useState('')
    const [newCategoryParent, setNewCategoryParent] = useState<string>('')
    const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('expense')
    const [categoryLoading, setCategoryLoading] = useState(false)
    const [categoryError, setCategoryError] = useState<string | null>(null)
    
    const [editingCategory, setEditingCategory] = useState<CategoryWithChildren | null>(null)
    const [editCategoryName, setEditCategoryName] = useState('')
    const [editCategoryBudget, setEditCategoryBudget] = useState<string>('')
    const [editCategoryParent, setEditCategoryParent] = useState<string>('')
    const [editCategoryType, setEditCategoryType] = useState<'income' | 'expense'>('expense')
    const [editCategoryLoading, setEditCategoryLoading] = useState(false)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
        useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
    );

    useEffect(() => {
        if (user) loadCategories()
    }, [user])

    async function loadCategories() {
        try {
            if (!user) return
            const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id)
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
        
        if (editingCategory.name === 'Commissioni Investimenti') {
            toast.error('Modifica non consentita per categoria di sistema.');
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
        
        if (cat?.name === 'Commissioni Investimenti') {
            toast.error('Questa è una categoria di sistema per le commissioni. Non può essere eliminata.')
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

    function toggleCollapse(id: string) {
        setCollapsedIds(prev => prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id])
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
        let overItem = categories.find(c => c.id === over.id);
        if (!activeItem || !overItem) return;

        if (activeItem.parent_id !== overItem.parent_id) {
            if (activeItem.parent_id === null && overItem.parent_id !== null) {
                const parentOfOver = categories.find(c => c.id === overItem?.parent_id);
                if (parentOfOver && parentOfOver.parent_id === null) {
                    overItem = parentOfOver; 
                }
            }
        }
        if (activeItem.parent_id !== overItem.parent_id) return;

        const siblings = categories
            .filter(c => c.parent_id === activeItem.parent_id && c.type === activeItem.type)
            .sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0));
        
        const oldIndex = siblings.findIndex(x => x.id === activeItem.id);
        const newIndex = siblings.findIndex(x => x.id === overItem.id);
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
            toast.error("Errore nel salvataggio. Riprova.")
        }
    }

    const renderSortableList = (list: CategoryWithChildren[], level: number = 0) => {
        const sortableIds = list.map(c => c.id);
        return (
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy} disabled={sortCategoriesBy === 'name'}>
                <div className="space-y-1">
                    {list.map(cat => (
                        <SortableCategoryItem key={cat.id} category={cat} level={level} onEdit={openEditModal} onDelete={handleDeleteCategory} disabled={sortCategoriesBy === 'name'} isCollapsed={collapsedIds.includes(cat.id)} onToggleCollapse={toggleCollapse} renderChildren={(parent, lvl) => renderSortableList(parent.children || [], lvl)} />
                    ))}
                </div>
            </SortableContext>
        );
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-orange-600" />
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Categorie</h2>
                        </div>
                        <button onClick={() => setSortCategoriesBy(prev => prev === 'rank' ? 'name' : 'rank')} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            {sortCategoriesBy === 'name' ? 'A-Z' : 'Manuale'}
                        </button>
                    </div>
                    <div className="p-5 space-y-6">
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
