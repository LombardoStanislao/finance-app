import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, ArrowRightLeft, Calendar, AlignLeft, PieChart, PiggyBank, Briefcase, AlertTriangle } from 'lucide-react'
import { supabase, type Category, type Bucket, type Transaction } from '../lib/supabase'
import { cn, formatCurrency } from '../lib/utils'

interface TransactionFormProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    primaryColor?: string
    editingTransaction?: Transaction | null
}

interface CategoryWithChildren extends Category {
    children?: CategoryWithChildren[]
}

interface BucketWithTarget extends Bucket {
    target_amount?: number
}

// Interfaccia per il profilo fiscale
interface TaxProfile {
    is_pro_tax: boolean
    tax_profitability_coeff: number
    tax_inps_rate: number
    tax_flat_rate: number
}

export default function TransactionForm({ isOpen, onClose, onSuccess, primaryColor = 'blue', editingTransaction }: TransactionFormProps) {
    const [amount, setAmount] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [description, setDescription] = useState('')
    const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
    const [bucketId, setBucketId] = useState<string>('')

    const [isRecurring, setIsRecurring] = useState(false)
    const [recurrenceRule, setRecurrenceRule] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')
    const [endDate, setEndDate] = useState<string>('')
    const [showNumpad, setShowNumpad] = useState(false)

    // Stati per Auto-Distribuzione Classica
    const [applyAutoSplit, setApplyAutoSplit] = useState(false)

    // Stati per Transfer
    const [transferSource, setTransferSource] = useState<string>('')
    const [transferDestination, setTransferDestination] = useState<string>('')

    const [editingId, setEditingId] = useState<string | null>(null)

    // Stato per bloccare modifiche rischiose
    const [hasLinkedChildren, setHasLinkedChildren] = useState(false)

    // Dati caricati
    const [categories, setCategories] = useState<CategoryWithChildren[]>([])
    const [buckets, setBuckets] = useState<BucketWithTarget[]>([])

    // Stati P.IVA
    const [taxProfile, setTaxProfile] = useState<TaxProfile | null>(null)
    const [isInvoice, setIsInvoice] = useState(false)
    const [autoSaveTaxes, setAutoSaveTaxes] = useState(true)

    const [loading, setLoading] = useState(false)

    // Caricamento dati e Setup Edit
    useEffect(() => {
        if (isOpen) {
            loadData()
            if (editingTransaction) {
                setEditingId(editingTransaction.id)
                setAmount(Math.abs(editingTransaction.amount).toString())

                // Imposta Data e Descrizione
                setDate(editingTransaction.date.split('T')[0])
                setDescription(editingTransaction.description || '')

                // Gestione Tipo
                const targetType = editingTransaction.type === 'initial' ? 'income' : editingTransaction.type
                setType(targetType)

                // Imposta Categoria (importante farlo qui, non dipendere da useEffect type)
                if (editingTransaction.category_id) {
                    setCategoryId(editingTransaction.category_id)
                }

                setBucketId(editingTransaction.bucket_id || '')

                // Reset special flags on edit
                setIsInvoice(false)
                setApplyAutoSplit(false)

                // Controlla se ha figli collegati (per blocco sicurezza)
                checkLinkedTransactions(editingTransaction)
            } else {
                resetForm()
            }
        }
    }, [isOpen, editingTransaction])

    // Gestione cambio tipo manuale
    const handleTypeChange = (newType: 'income' | 'expense' | 'transfer') => {
        setType(newType)
        if (newType !== 'income') setIsInvoice(false)
        // Se stiamo creando, resetta la categoria. Se stiamo editando, mantieni quella caricata (se compatibile) o resetta.
        // Per semplicità e per evitare bug visivi, resettiamo la categoria al cambio tipo manuale.
        if (!editingId) setCategoryId('')
    }

    async function checkLinkedTransactions(tx: Transaction) {
        try {
            const txTime = new Date(tx.created_at).getTime()
            const timeStart = new Date(txTime - 2000).toISOString() // 2 secondi tolleranza
            const timeEnd = new Date(txTime + 2000).toISOString()

            const { count } = await supabase
                .from('transactions')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', tx.user_id)
                .neq('id', tx.id)
                .gte('created_at', timeStart)
                .lte('created_at', timeEnd)
                .eq('type', 'transfer')

            setHasLinkedChildren((count || 0) > 0)

        } catch (e) {
            console.error("Errore check figli", e)
        }
    }

    async function loadData() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: cats } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name')
            const categoryMap = new Map<string, CategoryWithChildren>()
            const rootCategories: CategoryWithChildren[] = []

            cats?.forEach(cat => categoryMap.set(cat.id, { ...cat, children: [] }))
            cats?.forEach(cat => {
                if (cat.parent_id) {
                    const parent = categoryMap.get(cat.parent_id)
                    if (parent) parent.children?.push(categoryMap.get(cat.id)!)
                } else {
                    rootCategories.push(categoryMap.get(cat.id)!)
                }
            })
            setCategories(rootCategories)

            const { data: bucks } = await supabase.from('buckets').select('*').eq('user_id', user.id).order('created_at')
            setBuckets(bucks || [])

            const { data: profile } = await supabase.from('profiles').select('is_pro_tax, tax_profitability_coeff, tax_inps_rate, tax_flat_rate').eq('id', user.id).maybeSingle()

            if (profile && profile.is_pro_tax) {
                setTaxProfile({
                    is_pro_tax: true,
                    tax_profitability_coeff: Number(profile.tax_profitability_coeff) || 78,
                    tax_inps_rate: Number(profile.tax_inps_rate) || 26.23,
                    tax_flat_rate: Number(profile.tax_flat_rate) || 5
                })
            } else {
                setTaxProfile(null)
            }

        } catch (error) { console.error('Error loading form data:', error) }
    }

    function resetForm() {
        setAmount('')
        setCategoryId('')
        setDate(new Date().toISOString().split('T')[0])
        setDescription('')
        setType('expense')
        setBucketId('')
        setIsRecurring(false)
        setRecurrenceRule('monthly')
        setEditingId(null)
        setApplyAutoSplit(false)
        setTransferSource('')
        setTransferDestination('')
        setIsInvoice(false)
        setAutoSaveTaxes(true)
        setHasLinkedChildren(false)
        setEndDate('')
        setShowNumpad(false)
    }

    // Engine Safe Calculator
    let evaluatedNumber = 0
    let showLiveResult = false
    try {
        const sanitized = amount.replace(/[^0-9+\-*/.]/g, '')
        if (sanitized && /^[0-9+\-*/.]+$/.test(sanitized)) {
             evaluatedNumber = new Function('return ' + sanitized)() || 0
             if (!Number.isFinite(evaluatedNumber)) evaluatedNumber = 0
             evaluatedNumber = Number(evaluatedNumber.toFixed(2)) // <-- FIX FLOATING POINT (es. 0.1+0.2 non fa più 0.30000004)
        }
        if (['+', '-', '*', '/'].some(op => amount.includes(op))) showLiveResult = true
    } catch(e) {}

    const handleNumpad = (key: string) => {
        if (key === 'C') return setAmount('')
        if (key === '⌫') return setAmount(prev => prev.slice(0, -1))
        
        const ops = ['+', '-', '*', '/']
        if (ops.includes(key)) {
            if (amount === '') return
            if (ops.includes(amount.slice(-1))) {
                return setAmount(prev => prev.slice(0, -1) + key) // Swap operatore
            }
        }
        if (key === '.' && amount.split(/[\+\-\*\/]/).pop()?.includes('.')) return // Evita doppio punto nello stesso numero
        setAmount(prev => prev + key)
    }

    // Helper per calcoli fiscali
    const taxCalculations = (() => {
        if (!taxProfile || !amount || type !== 'income' || !isInvoice) return null
        const gross = evaluatedNumber
        const taxable = Math.round((gross * (taxProfile.tax_profitability_coeff / 100)) * 100) / 100
        const inps = Math.round((taxable * (taxProfile.tax_inps_rate / 100)) * 100) / 100
        const tax = Math.round((taxable * (taxProfile.tax_flat_rate / 100)) * 100) / 100
        const net = Math.round((gross - inps - tax) * 100) / 100
        return { gross, taxable, inps, tax, net }
    })()

    async function getOrCreateBucket(userId: string, name: string): Promise<string> {
        const existing = buckets.find(b => b.name === name)
        if (existing) return existing.id
        const { data, error } = await supabase.from('buckets').insert({ user_id: userId, name: name, distribution_percentage: 0, current_balance: 0, target_amount: 0 }).select('id').single()
        if (error) throw error
        return data.id
    }

    async function handleAutoSplitLogic(userId: string, totalAmount: number, transactionDate: string) {
        const taxBucketNames = ['Aliquota INPS', 'Aliquota Imposta Sostitutiva']
        const activeBuckets = buckets.filter(b => b.distribution_percentage > 0 && !taxBucketNames.includes(b.name) && (!b.target_amount || b.target_amount === 0 || (b.current_balance || 0) < b.target_amount))

        if (activeBuckets.length === 0) return

        let remainingToDistribute = totalAmount

        for (const bucket of activeBuckets) {
            if (remainingToDistribute <= 0) break
            let share = totalAmount * (bucket.distribution_percentage / 100)
            if (bucket.target_amount && bucket.target_amount > 0) {
                const spaceLeft = bucket.target_amount - (bucket.current_balance || 0)
                if (share > spaceLeft) share = Math.max(0, spaceLeft)
            }
            share = Math.round((share + Number.EPSILON) * 100) / 100

            if (share > 0) {
                await supabase.from('buckets').update({ current_balance: (bucket.current_balance || 0) + share }).eq('id', bucket.id)
                await supabase.from('transactions').insert({ user_id: userId, amount: -Math.abs(share), type: 'transfer', description: `Distribuzione automatica a ${bucket.name}`, date: transactionDate, bucket_id: bucket.id, created_at: new Date().toISOString() })
                remainingToDistribute -= share
            }
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Utente non autenticato')

            let amountVal = 0
            try {
                const sanitized = amount.replace(/[^0-9+\-*/.]/g, '')
                if (sanitized) amountVal = new Function('return ' + sanitized)() || 0
                if (!Number.isFinite(amountVal)) amountVal = 0
            } catch(e) { throw new Error("Errore nel calcolo dell'importo") }

            if (amountVal <= 0) throw new Error("Inserisci un importo valido")

            let finalAmount = type === 'expense' ? -Math.abs(amountVal) : Math.abs(amountVal)

            if (type === 'transfer') {
                if (!transferSource || !transferDestination) throw new Error('Seleziona origine e destinazione')

                if (transferSource === 'liquidity') {
                    const { data: bucket } = await supabase.from('buckets').select('current_balance').eq('id', transferDestination).single()
                    await supabase.from('buckets').update({ current_balance: (bucket?.current_balance || 0) + amountVal }).eq('id', transferDestination)
                    await supabase.from('transactions').insert({ user_id: user.id, amount: -Math.abs(amountVal), type: 'transfer', description: `Trasferimento a ${buckets.find(b => b.id === transferDestination)?.name}`, date: new Date(date).toISOString(), bucket_id: transferDestination })
                } else {
                    const { data: sourceBucket } = await supabase.from('buckets').select('current_balance').eq('id', transferSource).single()
                    if ((sourceBucket?.current_balance || 0) < amountVal) throw new Error('Saldo insufficiente nel salvadanaio')
                    await supabase.from('buckets').update({ current_balance: (sourceBucket?.current_balance || 0) - amountVal }).eq('id', transferSource)

                    if (transferDestination === 'liquidity') {
                        await supabase.from('transactions').insert({ user_id: user.id, amount: Math.abs(amountVal), type: 'transfer', description: `Prelievo da ${buckets.find(b => b.id === transferSource)?.name}`, date: new Date(date).toISOString(), bucket_id: transferSource })
                    } else {
                        const { data: destBucket } = await supabase.from('buckets').select('current_balance').eq('id', transferDestination).single()
                        await supabase.from('buckets').update({ current_balance: (destBucket?.current_balance || 0) + amountVal }).eq('id', transferDestination)

                        // NEW: INSERT BOTH TRANSACTIONS FOR BUCKET-TO-BUCKET
                        const nowStr = new Date().toISOString()
                        const txDate = new Date(date).toISOString()

                        await supabase.from('transactions').insert([
                            { user_id: user.id, amount: Math.abs(amountVal), type: 'transfer', description: `Giroconto verso ${buckets.find(b => b.id === transferDestination)?.name}`, date: txDate, bucket_id: transferSource, created_at: nowStr },
                            { user_id: user.id, amount: -Math.abs(amountVal), type: 'transfer', description: `Giroconto da ${buckets.find(b => b.id === transferSource)?.name}`, date: txDate, bucket_id: transferDestination, created_at: nowStr }
                        ])
                    }
                }
            } else {
                if (editingId && editingTransaction) {
                    // Edit existing with proper Revert

                    // 1. REVERT old bucket if it was an expense OR income
                    if ((editingTransaction.type === 'expense' || editingTransaction.type === 'income') && editingTransaction.bucket_id) {
                        const { data: oldBucket } = await supabase.from('buckets').select('current_balance').eq('id', editingTransaction.bucket_id).single()
                        if (oldBucket) {
                            const revertAmount = editingTransaction.type === 'expense' ? Math.abs(editingTransaction.amount) : -Math.abs(editingTransaction.amount)
                            await supabase.from('buckets').update({ current_balance: Math.max(0, (oldBucket.current_balance || 0) + revertAmount) }).eq('id', editingTransaction.bucket_id)
                        }
                    }

                    // 2. APPLY new bucket if it is an expense OR income
                    if ((type === 'expense' || type === 'income') && bucketId) {
                        const { data: newBucket } = await supabase.from('buckets').select('current_balance').eq('id', bucketId).single()
                        if (newBucket) {
                            const applyAmount = type === 'expense' ? -Math.abs(amountVal) : Math.abs(amountVal)
                            await supabase.from('buckets').update({ current_balance: Math.max(0, (newBucket.current_balance || 0) + applyAmount) }).eq('id', bucketId)
                        }
                    }

                    await supabase.from('transactions').update({
                        amount: finalAmount,
                        category_id: categoryId || null,
                        date: new Date(date).toISOString(),
                        description,
                        type,
                        bucket_id: bucketId || null
                    }).eq('id', editingId)
                } else {
                    // New Transaction
                    const localD = new Date()
                    const todayStr = `${localD.getFullYear()}-${String(localD.getMonth() + 1).padStart(2, '0')}-${String(localD.getDate()).padStart(2, '0')}`
                    const isFutureRecurring = isRecurring && date > todayStr

                    if (isFutureRecurring) {
                        // Pianificazione Futura Pura
                        await supabase.from('recurring_transactions').insert({
                            user_id: user.id,
                            amount: amountVal,
                            type: type,
                            category_id: categoryId || null,
                            bucket_id: bucketId || null,
                            description: description || 'Transazione Ricorrente',
                            recurrence_rule: recurrenceRule,
                            next_date: date,
                            end_date: endDate || null
                        })
                    } else {
                        // Flusso Attuale/Passato
                        if (type === 'expense' && bucketId) {
                            const { data: buck } = await supabase.from('buckets').select('current_balance').eq('id', bucketId).single()
                            if (buck) await supabase.from('buckets').update({ current_balance: Math.max(0, (buck.current_balance || 0) - amountVal) }).eq('id', bucketId)
                        } else if (type === 'income' && bucketId) {
                            const { data: buck } = await supabase.from('buckets').select('current_balance').eq('id', bucketId).single()
                            if (buck) await supabase.from('buckets').update({ current_balance: (buck.current_balance || 0) + amountVal }).eq('id', bucketId)
                        }

                        const { data: newTx, error: txError } = await supabase.from('transactions').insert({
                            user_id: user.id,
                            amount: finalAmount,
                            category_id: categoryId || null,
                            date: new Date(date).toISOString(),
                            description,
                            type,
                            bucket_id: bucketId || null,
                            is_work_related: false,
                            is_recurring: isRecurring
                        }).select().single()

                        if (txError) throw txError

                        if (isRecurring) {
                            const [y, m, d] = date.split('-').map(Number)
                            let nextDateObj = new Date(y, m - 1, d)
                            if (recurrenceRule === 'daily') nextDateObj.setDate(nextDateObj.getDate() + 1)
                            else if (recurrenceRule === 'weekly') nextDateObj.setDate(nextDateObj.getDate() + 7)
                            else if (recurrenceRule === 'monthly') nextDateObj.setMonth(nextDateObj.getMonth() + 1)
                            else if (recurrenceRule === 'yearly') nextDateObj.setFullYear(nextDateObj.getFullYear() + 1)

                            const advancedNextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`

                            await supabase.from('recurring_transactions').insert({
                                user_id: user.id,
                                amount: amountVal,
                                type: type,
                                category_id: categoryId || null,
                                bucket_id: bucketId || null,
                                description: description || 'Transazione Ricorrente',
                                recurrence_rule: recurrenceRule,
                                next_date: advancedNextDateStr,
                                end_date: endDate || null
                            })
                        }

                        let distributableAmount = amountVal

                        if (type === 'income' && isInvoice && taxCalculations && autoSaveTaxes) {
                            const inpsBucketId = await getOrCreateBucket(user.id, 'Aliquota INPS')
                            const taxBucketId = await getOrCreateBucket(user.id, 'Aliquota Imposta Sostitutiva')
                            const { data: inpsB } = await supabase.from('buckets').select('current_balance').eq('id', inpsBucketId).single()
                            const { data: taxB } = await supabase.from('buckets').select('current_balance').eq('id', taxBucketId).single()

                            await supabase.from('buckets').update({ current_balance: (inpsB?.current_balance || 0) + taxCalculations.inps }).eq('id', inpsBucketId)
                            await supabase.from('buckets').update({ current_balance: (taxB?.current_balance || 0) + taxCalculations.tax }).eq('id', taxBucketId)

                            await supabase.from('transactions').insert([
                                { user_id: user.id, amount: -Math.abs(taxCalculations.inps), type: 'transfer', description: `Accantonamento INPS (Fattura)`, date: new Date(date).toISOString(), bucket_id: inpsBucketId, created_at: newTx.created_at }, // Sync time
                                { user_id: user.id, amount: -Math.abs(taxCalculations.tax), type: 'transfer', description: `Accantonamento Tasse (Fattura)`, date: new Date(date).toISOString(), bucket_id: taxBucketId, created_at: newTx.created_at }
                            ])
                            distributableAmount = taxCalculations.net
                        }

                        if (type === 'income' && applyAutoSplit && newTx) {
                            await handleAutoSplitLogic(user.id, distributableAmount, new Date(date).toISOString())
                        }
                    }
                }
            }
            onSuccess()
            onClose()
        } catch (error: any) { alert(error.message) } finally { setLoading(false) }
    }

    if (!isOpen) return null

    const getActiveTabClass = (tabType: string) => {
        if (type !== tabType) return "bg-gray-50 text-gray-500 hover:bg-gray-100 border-transparent"
        if (tabType === 'income') return "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm"
        if (tabType === 'expense') return "bg-rose-50 text-rose-600 border-rose-100 shadow-sm"
        return "bg-blue-50 text-blue-600 border-blue-100 shadow-sm"
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-10 duration-300" onClick={(e) => e.stopPropagation()}>

                <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-3xl z-10">
                    <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Modifica' : 'Nuova Transazione'}</h2>
                    <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5 text-gray-600" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <form id="transaction-form" onSubmit={handleSubmit} className="space-y-6">

                        {editingId && hasLinkedChildren && (
                            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3 text-xs text-amber-800 animate-in fade-in slide-in-from-top-2">
                                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                                <div>
                                    <p className="font-bold text-amber-900 mb-1">Modifica Limitata</p>
                                    <p className="leading-relaxed opacity-90">
                                        Questa transazione ha generato movimenti automatici (tasse, salvadanai).
                                        Importo, Categoria, Data e Tipo non sono modificabili per non rompere i collegamenti.
                                        <br /><br />
                                        <strong>Per modifiche sostanziali:</strong> Elimina e ricrea.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                            <button type="button" onClick={() => handleTypeChange('expense')} disabled={!!editingId && hasLinkedChildren} className={cn("flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all gap-1", getActiveTabClass('expense'), editingId && hasLinkedChildren && "opacity-50 cursor-not-allowed")}><TrendingDown className="w-5 h-5" /><span className="text-xs font-bold">Uscita</span></button>
                            <button type="button" onClick={() => handleTypeChange('income')} disabled={!!editingId && hasLinkedChildren} className={cn("flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all gap-1", getActiveTabClass('income'), editingId && hasLinkedChildren && "opacity-50 cursor-not-allowed")}><TrendingUp className="w-5 h-5" /><span className="text-xs font-bold">Entrata</span></button>
                            <button type="button" onClick={() => handleTypeChange('transfer')} disabled={!!editingId && hasLinkedChildren} className={cn("flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all gap-1", getActiveTabClass('transfer'), editingId && hasLinkedChildren && "opacity-50 cursor-not-allowed")}><ArrowRightLeft className="w-5 h-5" /><span className="text-xs font-bold">Transfer</span></button>
                        </div>

                        <div className="relative">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1 block">Importo</label>
                            <div 
                                onClick={() => !hasLinkedChildren && setShowNumpad(!showNumpad)}
                                className={cn("relative flex flex-col justify-center min-h-[76px] w-full px-4 py-2 bg-gray-50 rounded-2xl cursor-pointer transition-all border-2", showNumpad ? "border-blue-400 ring-4 ring-blue-50 bg-white" : "border-transparent", editingId && hasLinkedChildren && "opacity-50 cursor-not-allowed bg-gray-100 text-gray-500")}
                            >
                                <div className="flex items-center overflow-x-auto hide-scrollbar whitespace-nowrap">
                                   <span className="text-3xl text-gray-300 mr-2 shrink-0">€</span>
                                   <span className={cn("text-4xl font-bold text-gray-900 tracking-tight", amount === '' && "text-gray-300")}>{amount || '0'}</span>
                                </div>
                                {showLiveResult && (
                                   <div className="text-sm font-black text-blue-600 pl-8 mt-0.5">
                                       = {formatCurrency(evaluatedNumber)}
                                   </div>
                                )}
                            </div>
                        </div>

                        {showNumpad && (
                            <div className="bg-gray-100/80 p-3 rounded-3xl grid grid-cols-4 gap-2 animate-in fade-in slide-in-from-top-1 border border-gray-200 shadow-inner">
                                {['1','2','3','/'].map(k => <button type="button" key={k} onClick={()=>handleNumpad(k)} className="h-14 bg-white rounded-2xl shadow-sm text-xl font-bold text-gray-800 active:scale-95 transition-all hover:bg-gray-50 flex items-center justify-center">{k === '/' ? '÷' : k}</button>)}
                                {['4','5','6','*'].map(k => <button type="button" key={k} onClick={()=>handleNumpad(k)} className="h-14 bg-white rounded-2xl shadow-sm text-xl font-bold text-gray-800 active:scale-95 transition-all hover:bg-gray-50 flex items-center justify-center">{k === '*' ? '×' : k}</button>)}
                                {['7','8','9','-'].map(k => <button type="button" key={k} onClick={()=>handleNumpad(k)} className="h-14 bg-white rounded-2xl shadow-sm text-xl font-bold text-gray-800 active:scale-95 transition-all hover:bg-gray-50 flex items-center justify-center">{k}</button>)}
                                {['.','0','⌫','+'].map(k => <button type="button" key={k} onClick={()=>handleNumpad(k)} className={cn("h-14 bg-white rounded-2xl shadow-sm text-xl font-bold text-gray-800 active:scale-95 transition-all hover:bg-gray-50 flex items-center justify-center", k === '⌫' && "text-rose-500", k === '+' && "bg-blue-50 text-blue-600")}>{k}</button>)}
                                <div className="col-span-4 flex gap-2 mt-1">
                                    <button type="button" onClick={() => {setAmount(''); setShowNumpad(false);}} className="flex-1 py-3 bg-white text-gray-600 rounded-2xl shadow-sm text-sm font-bold active:scale-95 transition-all hover:bg-gray-50 uppercase tracking-wide">Pulisci (C)</button>
                                    <button type="button" onClick={() => {setShowNumpad(false); setAmount(evaluatedNumber.toString())}} className="flex-[2] py-3 bg-blue-600 text-white rounded-2xl shadow-md text-base font-black active:scale-95 transition-all uppercase tracking-wide">Applica Importo</button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            {type !== 'transfer' && (
                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1 block">Categoria</label>
                                    <div className="relative">
                                        <PieChart className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required disabled={!!editingId && hasLinkedChildren} className={cn("w-full pl-12 pr-4 py-3.5 bg-gray-50 text-gray-900 font-medium rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none", editingId && hasLinkedChildren && "opacity-50 cursor-not-allowed bg-gray-100")}>
                                            <option value="">Seleziona...</option>
                                            {categories.filter(cat => cat.type === type).map((cat) => (
                                                <>
                                                    <option key={cat.id} value={cat.id} className="font-bold text-black">{cat.name}</option>
                                                    {cat.children?.map(child => <option key={child.id} value={child.id}>&nbsp;&nbsp;&nbsp;&nbsp;{child.name}</option>)}
                                                </>
                                            ))
                                            }
                                        </select>
                                    </div>
                                </div>
                            )}

                            {type === 'transfer' && (
                                <div className="p-4 bg-blue-50 rounded-2xl space-y-4 border border-blue-100">
                                    <div>
                                        <label className="text-xs font-bold text-blue-400 uppercase ml-1 mb-1 block">Da (Sorgente)</label>
                                        <select value={transferSource} onChange={(e) => setTransferSource(e.target.value)} disabled={!!editingId} className={cn("w-full px-4 py-3 bg-white text-gray-900 font-medium rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500", editingId && "opacity-70 cursor-not-allowed")}>
                                            <option value="">Seleziona...</option>
                                            <option value="liquidity">Liquidità (Conto Corrente)</option>
                                            {buckets.map(b => <option key={b.id} value={b.id}>Salv.: {b.name} (€{b.current_balance})</option>)}
                                        </select>
                                    </div>
                                    <div className="flex justify-center -my-2 relative z-10"><div className="bg-white p-1.5 rounded-full shadow-sm border border-gray-100"><ArrowRightLeft className="w-4 h-4 text-blue-500" /></div></div>
                                    <div>
                                        <label className="text-xs font-bold text-blue-400 uppercase ml-1 mb-1 block">Verso (Destinazione)</label>
                                        <select value={transferDestination} onChange={(e) => setTransferDestination(e.target.value)} disabled={!!editingId} className={cn("w-full px-4 py-3 bg-white text-gray-900 font-medium rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500", editingId && "opacity-70 cursor-not-allowed")}>
                                            <option value="">Seleziona...</option>
                                            {transferSource !== 'liquidity' && <option value="liquidity">Liquidità (Conto Corrente)</option>}
                                            {buckets.filter(b => b.id !== transferSource).map(b => <option key={b.id} value={b.id}>Salv.: {b.name} (€{b.current_balance})</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1 block">Data</label>
                                <div className="relative">
                                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!editingId && hasLinkedChildren} className={cn("w-full pl-12 pr-4 py-3.5 bg-gray-50 text-gray-900 font-medium rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white", editingId && hasLinkedChildren && "opacity-50 cursor-not-allowed bg-gray-100")} required />
                                </div>
                            </div>

                            {!editingId && type !== 'transfer' && (
                                <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-purple-100 p-2 rounded-xl text-purple-600"><Calendar className="w-4 h-4" /></div>
                                            <label className="text-sm font-bold text-gray-900">Rendi Ricorrente</label>
                                        </div>
                                        <button type="button" onClick={() => setIsRecurring(!isRecurring)} className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2", isRecurring ? "bg-purple-600" : "bg-gray-200")}>
                                            <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition-transform", isRecurring ? "translate-x-6" : "translate-x-1")} />
                                        </button>
                                    </div>

                                    {isRecurring && (
                                        <div className="animate-in fade-in slide-in-from-top-2 space-y-3">
                                            <select value={recurrenceRule} onChange={(e) => setRecurrenceRule(e.target.value as any)} className="w-full px-4 py-3 bg-white text-gray-900 font-medium rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-purple-500">
                                                <option value="daily">Ogni Giorno</option>
                                                <option value="weekly">Ogni Settimana</option>
                                                <option value="monthly">Ogni Mese</option>
                                                <option value="yearly">Ogni Anno</option>
                                            </select>
                                            <div>
                                                <label className="text-[10px] font-bold text-purple-400 uppercase ml-1 block mb-1">Data Fine (Opzionale)</label>
                                                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-3 bg-white text-gray-900 font-medium rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-purple-500" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1 block">Descrizione</label>
                                <div className="relative">
                                    <AlignLeft className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-gray-50 text-gray-900 font-medium rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all" placeholder="Note opzionali..." />
                                </div>
                            </div>

                            {type === 'income' && taxProfile && !editingId && (
                                <div className="animate-in fade-in slide-in-from-top-2 space-y-4">
                                    <div className="flex items-center justify-between bg-purple-50 p-3 rounded-xl border border-purple-100">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded-lg text-purple-600 shadow-sm"><Briefcase className="w-4 h-4" /></div>
                                            <div><p className="text-sm font-bold text-purple-900">Fattura P.IVA</p><p className="text-[10px] text-purple-600">Calcola imposte forfettarie</p></div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" checked={isInvoice} onChange={() => setIsInvoice(!isInvoice)} />
                                            <div className="w-11 h-6 bg-purple-200 peer-focus:outline-none rounded-full peer peer-checked:bg-purple-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                                        </label>
                                    </div>

                                    {isInvoice && taxCalculations && (
                                        <div className="bg-white border-2 border-purple-100 rounded-2xl p-4 space-y-3 shadow-sm animate-in zoom-in-95">
                                            <div className="flex justify-between items-center pb-2 border-b border-gray-50"><span className="text-xs text-gray-500">Imponibile ({taxProfile.tax_profitability_coeff}%)</span><span className="font-bold text-gray-700">{formatCurrency(taxCalculations.taxable)}</span></div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div><span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">INPS ({taxProfile.tax_inps_rate}%)</span><span className="text-sm font-bold text-rose-500 block">-{formatCurrency(taxCalculations.inps)}</span></div>
                                                <div><span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Tasse ({taxProfile.tax_flat_rate}%)</span><span className="text-sm font-bold text-rose-500 block">-{formatCurrency(taxCalculations.tax)}</span></div>
                                            </div>
                                            <div className="pt-2 border-t border-purple-50 flex justify-between items-end"><span className="text-xs font-bold text-purple-600 uppercase">Netto Reale</span><span className="text-xl font-black text-purple-700">{formatCurrency(taxCalculations.net)}</span></div>
                                            <div className="flex items-center gap-2 mt-2 pt-2">
                                                <input type="checkbox" id="auto-tax" checked={autoSaveTaxes} onChange={(e) => setAutoSaveTaxes(e.target.checked)} className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-300" />
                                                <label htmlFor="auto-tax" className="text-xs text-gray-600">Accantona automaticamente INPS e Tasse nei salvadanai</label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {type === 'expense' && !editingId && buckets.length > 0 && (
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                                    <PieChart className="w-5 h-5 text-gray-400" />
                                    <div className="flex-1">
                                        <label className="text-xs font-bold text-gray-700 block">Preleva da Salvadanaio</label>
                                        <select value={bucketId} onChange={(e) => setBucketId(e.target.value)} className="w-full mt-1 bg-transparent text-sm text-gray-600 outline-none">
                                            <option value="">Nessuno (Usa Liquidità)</option>
                                            {buckets.map((b) => <option key={b.id} value={b.id}>{b.name} ({formatCurrency(b.current_balance || 0)})</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {type === 'income' && !editingId && buckets.some(b => b.distribution_percentage > 0 && !['Aliquota INPS', 'Aliquota Imposta Sostitutiva'].includes(b.name)) && (
                                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
                                    <div className="flex items-center gap-3">
                                        <PiggyBank className="w-5 h-5 text-blue-600" />
                                        <div><p className="text-xs font-bold text-blue-900">Divisione Automatica</p><p className="text-[10px] text-blue-600">Distribuisci {isInvoice ? 'il netto' : 'il totale'} nei salvadanai</p></div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer" checked={applyAutoSplit} onChange={() => setApplyAutoSplit(!applyAutoSplit)} />
                                        <div className="w-9 h-5 bg-blue-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                    </label>
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                <div className="shrink-0 p-6 border-t border-gray-100 bg-white rounded-b-3xl sm:rounded-b-3xl">
                    <button type="submit" form="transaction-form" disabled={loading} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-lg shadow-xl shadow-gray-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: primaryColor.startsWith('#') ? primaryColor : undefined }}>{loading ? 'Salvataggio...' : editingId ? 'Salva Modifiche' : 'Salva Transazione'}</button>
                </div>
            </div>
        </div>
    )
}