import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Plus, Trash2, X, Target, PiggyBank, PenLine, Settings, CheckCircle2, AlertTriangle, ArrowUpDown, Lock, Briefcase } from 'lucide-react'
import { supabase, type Bucket } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'

interface BucketsPageProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

type SortOption = 'default' | 'name' | 'progress-desc' | 'progress-asc'

export default function BucketsPage({ onBack, onOpenSettings, primaryColor }: BucketsPageProps) {
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortOption>('default')
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false)
  
  // P.IVA State
  const [isProTax, setIsProTax] = useState(false)
  
  // Error State
  const [error, setError] = useState<string | null>(null)

  // States per Add Form
  const [newBucketName, setNewBucketName] = useState('')
  const [newBucketDistribution, setNewBucketDistribution] = useState<string>('')
  const [newBucketBalance, setNewBucketBalance] = useState<string>('')
  const [newBucketTarget, setNewBucketTarget] = useState<string>('')
  
  // States per Edit Form
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null)
  const [editBucketName, setEditBucketName] = useState('')
  const [editBucketDistribution, setEditBucketDistribution] = useState<string>('')
  const [editBucketBalance, setEditBucketBalance] = useState<string>('')
  const [editBucketTarget, setEditBucketTarget] = useState<string>('')
  
  const [bucketLoading, setBucketLoading] = useState(false)
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)

  useEffect(() => {
    loadProfileAndBuckets()
  }, [])

  async function loadProfileAndBuckets() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 1. Carica Profilo
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_pro_tax')
        .eq('id', user.id)
        .maybeSingle()
      
      const isUserPro = profile?.is_pro_tax || false
      setIsProTax(isUserPro)

      // Funzione helper per scaricare i bucket
      const fetchBuckets = async () => {
          const { data, error } = await supabase
            .from('buckets')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
          if (error) throw error
          return data || []
      }

      // Funzione helper per sanificare (creare mancanti / eliminare doppi)
      const sanitizeTaxBuckets = async (currentList: Bucket[]) => {
          if (!isUserPro) return false
          
          const taxBucketsNeeded = ['Aliquota INPS', 'Aliquota Imposta Sostitutiva']
          let dbModified = false

          for (const name of taxBucketsNeeded) {
              const matches = currentList.filter(b => b.name === name)

              // A. CANCELLA DOPPIONI
              if (matches.length > 1) {
                  matches.sort((a, b) => {
                      const scoreA = (a.distribution_percentage || 0) + (a.current_balance || 0)
                      const scoreB = (b.distribution_percentage || 0) + (b.current_balance || 0)
                      return scoreB - scoreA
                  })
                  const toDelete = matches.slice(1)
                  for (const del of toDelete) {
                      await supabase.from('buckets').delete().eq('id', del.id)
                  }
                  dbModified = true
              }

              // B. CREA MANCANTE
              if (matches.length === 0) {
                  await supabase.from('buckets').insert({
                      user_id: user.id,
                      name: name,
                      distribution_percentage: 0,
                      current_balance: 0,
                      target_amount: 0
                  })
                  dbModified = true
              }
          }
          return dbModified
      }

      // 2. Primo Fetch
      let currentBuckets = await fetchBuckets()

      // 3. Logica di Sanificazione (Double Pass per sicurezza)
      if (isUserPro) {
          const changed = await sanitizeTaxBuckets(currentBuckets)
          
          if (changed) {
              currentBuckets = await fetchBuckets()
              // Secondo passaggio di sicurezza
              const doubleCheckChanged = await sanitizeTaxBuckets(currentBuckets)
              if (doubleCheckChanged) {
                  currentBuckets = await fetchBuckets()
              }
          }
      }

      setBuckets(currentBuckets)
    } catch (error) {
      console.error('Error loading buckets:', error)
    } finally {
      setLoading(false)
    }
  }

  // --- LOGICA ORDINAMENTO E SEPARAZIONE ---
  const { activeBuckets, completedBuckets, taxBuckets } = useMemo(() => {
    let sorted = [...buckets]

    if (sortBy === 'name') {
        sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'progress-desc' || sortBy === 'progress-asc') {
        sorted.sort((a, b) => {
            const getProgress = (bucket: Bucket) => {
                if (!bucket.target_amount || bucket.target_amount <= 0) return 0
                return (bucket.current_balance || 0) / bucket.target_amount
            }
            const progA = getProgress(a)
            const progB = getProgress(b)
            return sortBy === 'progress-desc' ? progB - progA : progA - progB
        })
    }

    const completed: Bucket[] = []
    const active: Bucket[] = []
    const taxes: Bucket[] = []

    const taxNames = ['Aliquota INPS', 'Aliquota Imposta Sostitutiva']

    sorted.forEach(b => {
        if (isProTax && taxNames.includes(b.name)) {
            taxes.push(b)
            return
        }

        const isCompleted = (b.target_amount || 0) > 0 && (b.current_balance || 0) >= (b.target_amount || 0)
        if (isCompleted) completed.push(b)
        else active.push(b)
    })

    return { activeBuckets: active, completedBuckets: completed, taxBuckets: taxes }
  }, [buckets, sortBy, isProTax])


  const totalDistributionPercentage = buckets.reduce((sum, bucket) => {
    return sum + (bucket.distribution_percentage || 0)
  }, 0)

  async function handleAddBucket(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    
    const newPercentage = newBucketDistribution ? parseFloat(newBucketDistribution) : 0
    
    if (totalDistributionPercentage + newPercentage > 100.001) {
        setError(`Errore: Stai superando il 100% (Totale attuale: ${totalDistributionPercentage.toFixed(2)}%)`)
        return
    }

    setBucketLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('buckets')
        .insert({
          name: newBucketName,
          distribution_percentage: newPercentage,
          current_balance: newBucketBalance ? parseFloat(newBucketBalance) : 0,
          target_amount: newBucketTarget ? parseFloat(newBucketTarget) : 0,
          user_id: user.id,
        })

      if (error) throw error

      setNewBucketName('')
      setNewBucketDistribution('')
      setNewBucketBalance('')
      setNewBucketTarget('')
      setIsAddFormOpen(false)
      loadProfileAndBuckets()
    } catch (error) {
      console.error('Errore salvataggio:', error)
      setError('Errore durante il salvataggio')
    } finally {
      setBucketLoading(false)
    }
  }

  async function handleUpdateBucket(e: React.FormEvent) {
    e.preventDefault()
    if (!editingBucket) return
    setError(null)

    // CHECK AGGIUNTIVO SERVER SIDE
    const isSystemBucket = isProTax && ['Aliquota INPS', 'Aliquota Imposta Sostitutiva'].includes(editingBucket.name)
    
    // Se è di sistema, forziamo il nome originale e la percentuale originale
    const finalName = isSystemBucket ? editingBucket.name : editBucketName
    const finalDistribution = isSystemBucket ? editingBucket.distribution_percentage : (editBucketDistribution ? parseFloat(editBucketDistribution) : 0)

    const newPercentage = finalDistribution
    const otherBucketsTotal = buckets
        .filter(b => b.id !== editingBucket.id)
        .reduce((sum, b) => sum + (b.distribution_percentage || 0), 0)

    if (otherBucketsTotal + newPercentage > 100.001) {
        setError(`Errore: Il totale supererebbe il 100% (Disponibile: ${(100 - otherBucketsTotal).toFixed(2)}%)`)
        return
    }

    setBucketLoading(true)

    try {
      const { error } = await supabase
        .from('buckets')
        .update({
          name: finalName,
          distribution_percentage: newPercentage,
          current_balance: editBucketBalance ? parseFloat(editBucketBalance) : 0,
          target_amount: editBucketTarget ? parseFloat(editBucketTarget) : 0,
        })
        .eq('id', editingBucket.id)

      if (error) throw error

      setEditingBucket(null)
      loadProfileAndBuckets()
    } catch (error) {
      console.error('Errore aggiornamento:', error)
      setError('Errore durante l\'aggiornamento')
    } finally {
      setBucketLoading(false)
    }
  }

  async function handleDeleteBucket(bucketId: string) {
    const bucketToDelete = buckets.find(b => b.id === bucketId)
    
    // Protezione extra per i bucket fiscali
    if (isProTax && (bucketToDelete?.name === 'Aliquota INPS' || bucketToDelete?.name === 'Aliquota Imposta Sostitutiva')) {
        alert('Questo salvadanaio è gestito automaticamente dal profilo P.IVA e non può essere eliminato manualmente.')
        return
    }

    if (bucketToDelete && (bucketToDelete.current_balance || 0) > 0) {
      alert('Impossibile eliminare: Il salvadanaio contiene ancora del denaro. Per favore svuotalo prima.')
      return 
    }

    if (!confirm('Sei sicuro di voler eliminare questo salvadanaio?')) return

    try {
      const { error: unlinkError } = await supabase.from('transactions').update({ bucket_id: null }).eq('bucket_id', bucketId)
      if (unlinkError) throw unlinkError
      const { error } = await supabase.from('buckets').delete().eq('id', bucketId)
      if (error) throw error
      loadProfileAndBuckets()
    } catch (error) {
      console.error('Error deleting bucket:', error)
      alert('Impossibile eliminare il salvadanaio. Riprova.')
    }
  }

  // Componente Renderizzato per singolo Bucket
  const BucketCard = ({ bucket, completed = false, isTax = false }: { bucket: Bucket, completed?: boolean, isTax?: boolean }) => {
    const target = bucket.target_amount || 0
    const progress = target > 0 ? Math.min((bucket.current_balance || 0) / target * 100, 100) : 0
    
    const cardBg = isTax ? "bg-purple-50/40 border-purple-100" : completed ? "bg-emerald-50/30 border-emerald-100" : "bg-white border-gray-100"
    
    return (
        <div className={cn("p-4 rounded-xl shadow-sm border transition-transform active:scale-[0.99]", cardBg)}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex-1 min-w-0 pr-4">
                    <h3 className={cn("font-bold text-lg leading-tight break-words flex items-center gap-2", completed ? "text-emerald-800" : isTax ? "text-purple-900" : "text-gray-900")}>
                        {isTax && <Briefcase className="w-4 h-4 text-purple-600 flex-shrink-0" />}
                        {bucket.name}
                        {completed && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5">
                        <p className="text-xs text-gray-400 font-medium">Saldo attuale</p>
                        {/* Mostra % solo se non è un bucket fiscale (che ha sempre 0% visuale) o se ha valore */}
                        {bucket.distribution_percentage > 0 && !completed && !isTax && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded-md font-bold uppercase tracking-wide whitespace-nowrap">
                            {bucket.distribution_percentage}%
                            </span>
                        )}
                        {completed && (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-md font-bold uppercase tracking-wide whitespace-nowrap flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Target Raggiunto
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                        <span className={cn("font-bold text-lg whitespace-nowrap block", completed ? "text-emerald-700" : isTax ? "text-purple-700" : "text-gray-900")}>
                            {formatCurrency(bucket.current_balance || 0)}
                        </span>
                        {target > 0 && (
                            <span className="text-[10px] text-gray-400 font-medium">
                                su {formatCurrency(target)}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-1">
                        <button 
                            onClick={() => {
                                setEditingBucket(bucket)
                                setEditBucketName(bucket.name)
                                setEditBucketDistribution((bucket.distribution_percentage || 0).toString())
                                setEditBucketBalance((bucket.current_balance || 0).toString())
                                setEditBucketTarget((bucket.target_amount || 0).toString())
                                setError(null)
                            }}
                            className="p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                            <PenLine className="w-4 h-4" />
                        </button>
                        {/* Nascondi bottone delete per bucket fiscali */}
                        {!isTax && (
                            <button 
                                onClick={() => handleDeleteBucket(bucket.id)}
                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Progress Bar */}
            {target > 0 && (
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                        className={cn("h-full rounded-full transition-all duration-500", completed ? "bg-emerald-500" : isTax ? "bg-purple-500" : "bg-blue-600")} 
                        style={{ width: `${progress}%` }} 
                    />
                </div>
            )}
        </div>
    )
  }

  // --- CONTROLLO SE TAX BUCKET PER EDITING ---
  const isEditingSystemBucket = editingBucket && isProTax && ['Aliquota INPS', 'Aliquota Imposta Sostitutiva'].includes(editingBucket.name)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER STICKY */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
               <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">I tuoi Salvadanai</h1>
        </div>
        
        <div className="flex gap-2">
            {/* SORT BUTTON */}
            <div className="relative">
                <button
                    onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                    className={cn("p-2 rounded-full transition-colors border active:scale-95", isSortMenuOpen ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100")}
                >
                    <ArrowUpDown className="w-5 h-5" strokeWidth={2} />
                </button>
                
                {isSortMenuOpen && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setIsSortMenuOpen(false)} />
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-40 overflow-hidden animate-in fade-in slide-in-from-top-2">
                            <div className="p-1">
                                <button onClick={() => { setSortBy('default'); setIsSortMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm rounded-lg font-medium hover:bg-gray-50">Standard</button>
                                <button onClick={() => { setSortBy('name'); setIsSortMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm rounded-lg font-medium hover:bg-gray-50">Alfabetico</button>
                                <button onClick={() => { setSortBy('progress-desc'); setIsSortMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm rounded-lg font-medium hover:bg-gray-50">Più vicini</button>
                                <button onClick={() => { setSortBy('progress-asc'); setIsSortMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm rounded-lg font-medium hover:bg-gray-50">Più lontani</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <button onClick={onOpenSettings} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors text-gray-600 border border-gray-100 active:scale-95">
                <Settings className="w-5 h-5" strokeWidth={2} />
            </button>
        </div>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        
        {/* CARD RIEPILOGO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Target className="w-32 h-32 text-blue-600" />
          </div>
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <div className="p-1.5 bg-blue-50 rounded-lg">
              <PiggyBank className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500 font-medium uppercase tracking-wide">Distribuzione Automatica</span>
          </div>
          
          <div className="relative z-10 mt-2">
            <p className="text-3xl font-bold text-gray-900">
              {totalDistributionPercentage.toFixed(1)}%
            </p>
            <p className={cn("text-xs mt-1 font-medium", totalDistributionPercentage > 100 ? "text-red-500 font-bold" : "text-gray-400")}>
              {100 - totalDistributionPercentage >= 0 
                ? `${(100 - totalDistributionPercentage).toFixed(2)}% rimane nella Liquidità`
                : 'Attenzione: Hai superato il 100%!'}
            </p>
          </div>
        </div>

        {/* LISTA BUCKETS */}
        <div className="space-y-6">
          
          {/* SEZIONE ATTIVI */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">In Corso</h2>
                <span className="text-xs text-gray-400 font-medium">{activeBuckets.length} salvadanai</span>
            </div>

            {loading ? (
                <div className="space-y-3">
                {[1,2].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
                </div>
            ) : activeBuckets.length === 0 && completedBuckets.length === 0 && taxBuckets.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
                <div className="bg-gray-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                    <PiggyBank className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">Nessun salvadanaio creato</p>
                </div>
            ) : activeBuckets.length === 0 && completedBuckets.length > 0 ? (
                <div className="text-center py-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-emerald-700 font-medium text-sm">Tutti i tuoi obiettivi sono raggiunti! 🚀</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {activeBuckets.map((bucket) => <BucketCard key={bucket.id} bucket={bucket} />)}
                </div>
            )}
          </div>

          {/* SEZIONE BUCKET FISCALI (P.IVA) */}
          {taxBuckets.length > 0 && (
             <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-bold text-purple-700 uppercase tracking-wider flex items-center gap-2">
                        Accantonamento Tasse <span className="text-lg">💼</span>
                    </h2>
                    <span className="text-xs text-purple-500 font-medium font-mono bg-purple-50 px-2 py-0.5 rounded">P.IVA</span>
                </div>
                <div className="grid gap-3">
                    {taxBuckets.map((bucket) => <BucketCard key={bucket.id} bucket={bucket} isTax={true} />)}
                </div>
             </div>
          )}

          {/* SEZIONE COMPLETATI (VISIBILE SOLO SE CE NE SONO) */}
          {completedBuckets.length > 0 && (
             <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-2">
                        Traguardi Raggiunti <span className="text-lg">🏆</span>
                    </h2>
                    <span className="text-xs text-emerald-500 font-medium">{completedBuckets.length} completati</span>
                </div>
                <div className="grid gap-3 opacity-90">
                    {completedBuckets.map((bucket) => <BucketCard key={bucket.id} bucket={bucket} completed={true} />)}
                </div>
             </div>
          )}

        </div>

        {/* BOTTONE AGGIUNGI */}
        <button
          onClick={() => {
              setIsAddFormOpen(true)
              setError(null)
          }}
          className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: primaryColor }}
        >
          <Plus className="w-5 h-5" />
          Nuovo Salvadanaio
        </button>
      </div>

      {/* MODALE AGGIUNTA */}
      {isAddFormOpen && (
        <div 
            className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" 
            onClick={() => setIsAddFormOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-md rounded-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200" 
            onClick={e => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
               <h3 className="text-lg font-bold text-gray-900">Nuovo Salvadanaio</h3>
               <button onClick={() => setIsAddFormOpen(false)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            
            <div className="overflow-y-auto p-6">
                <form onSubmit={handleAddBucket} className="space-y-5">
                <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Nome Salvadanaio</label>
                    <input
                    type="text"
                    value={newBucketName}
                    onChange={e => setNewBucketName(e.target.value)}
                    placeholder="Es. Fondo Emergenza, Vacanze..."
                    className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900"
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Auto-Distr. (%)</label>
                        <input
                        type="number"
                        step="0.01" // MODIFICATO: Permette 2 decimali
                        min="0"
                        max="100"
                        value={newBucketDistribution}
                        onChange={e => setNewBucketDistribution(e.target.value)}
                        placeholder="0.00"
                        className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Saldo (€)</label>
                        <input
                        type="number"
                        step="0.01"
                        value={newBucketBalance}
                        onChange={e => setNewBucketBalance(e.target.value)}
                        placeholder="0.00"
                        className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Target (€) - Opzionale</label>
                    <input
                    type="number"
                    step="0.01"
                    value={newBucketTarget}
                    onChange={e => setNewBucketTarget(e.target.value)}
                    placeholder="Es. 5000.00"
                    className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 ml-1">Se raggiunto, l'auto-distribuzione si disattiva (0%)</p>
                </div>

                <div className="pt-2">
                    {/* Error Message */}
                    {error && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-xs font-bold animate-in fade-in slide-in-from-top-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    <button
                    type="submit"
                    disabled={bucketLoading}
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                    style={{ backgroundColor: primaryColor }}
                    >
                    {bucketLoading ? 'Salvataggio...' : 'Crea Salvadanaio'}
                    </button>
                </div>
                </form>
            </div>
          </div>
        </div>
      )}

      {/* MODALE MODIFICA */}
      {editingBucket && (
        <div 
            className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" 
            onClick={() => setEditingBucket(null)}
        >
          <div 
            className="bg-white w-full max-w-md rounded-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200" 
            onClick={e => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
               <h3 className="text-lg font-bold text-gray-900">Modifica Salvadanaio</h3>
               <button onClick={() => setEditingBucket(null)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            
            <div className="overflow-y-auto p-6">
                <form onSubmit={handleUpdateBucket} className="space-y-5">
                
                {/* MESSAGGIO INFORMATIVO PER BUCKET DI SISTEMA */}
                {isEditingSystemBucket && (
                    <div className="p-3 bg-purple-50 text-purple-700 text-xs font-medium rounded-xl flex items-center gap-2 mb-2 animate-in fade-in">
                        <Briefcase className="w-4 h-4" /> Nome e % sono gestiti automaticamente dal Profilo P.IVA.
                    </div>
                )}

                <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Nome Salvadanaio</label>
                    <input
                    type="text"
                    disabled={!!isEditingSystemBucket} // DISABILITATO SE DI SISTEMA
                    value={editBucketName}
                    onChange={e => setEditBucketName(e.target.value)}
                    className={cn(
                        "w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900",
                        isEditingSystemBucket && "opacity-50 cursor-not-allowed"
                    )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Auto-Distr. (%)</label>
                        <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        disabled={!!isEditingSystemBucket} // DISABILITATO SE DI SISTEMA
                        value={editBucketDistribution}
                        onChange={e => setEditBucketDistribution(e.target.value)}
                        className={cn(
                            "w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900",
                            isEditingSystemBucket && "opacity-50 cursor-not-allowed"
                        )}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Saldo (€)</label>
                        <input
                        type="number"
                        step="0.01"
                        value={editBucketBalance}
                        onChange={e => setEditBucketBalance(e.target.value)}
                        className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Target (€) - Opzionale</label>
                    <input
                    type="number"
                    step="0.01"
                    value={editBucketTarget}
                    onChange={e => setEditBucketTarget(e.target.value)}
                    placeholder="Es. 5000.00"
                    className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900"
                    />
                </div>

                <div className="pt-2">
                    {/* Error Message */}
                    {error && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-xs font-bold animate-in fade-in slide-in-from-top-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    <button
                    type="submit"
                    disabled={bucketLoading}
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                    style={{ backgroundColor: primaryColor }}
                    >
                    {bucketLoading ? 'Aggiornamento...' : 'Salva Modifiche'}
                    </button>
                </div>
                </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}