import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Trash2, X, Target, PiggyBank, PenLine, Settings } from 'lucide-react'
import { supabase, type Bucket } from '../lib/supabase'

interface BucketsPageProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

export default function BucketsPage({ onBack, onOpenSettings, primaryColor }: BucketsPageProps) {
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [loading, setLoading] = useState(true)
  
  // States per Add Form
  const [newBucketName, setNewBucketName] = useState('')
  const [newBucketDistribution, setNewBucketDistribution] = useState<string>('')
  const [newBucketBalance, setNewBucketBalance] = useState<string>('')
  
  // States per Edit Form
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null)
  const [editBucketName, setEditBucketName] = useState('')
  const [editBucketDistribution, setEditBucketDistribution] = useState<string>('')
  const [editBucketBalance, setEditBucketBalance] = useState<string>('')
  
  const [bucketLoading, setBucketLoading] = useState(false)
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)

  useEffect(() => {
    loadBuckets()
  }, [])

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
    } finally {
      setLoading(false)
    }
  }

  async function handleAddBucket(e: React.FormEvent) {
    e.preventDefault()
    setBucketLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('buckets')
        .insert({
          name: newBucketName,
          distribution_percentage: newBucketDistribution ? parseFloat(newBucketDistribution) : 0,
          current_balance: newBucketBalance ? parseFloat(newBucketBalance) : 0,
          user_id: user.id,
        })

      if (error) throw error

      setNewBucketName('')
      setNewBucketDistribution('')
      setNewBucketBalance('')
      setIsAddFormOpen(false)
      loadBuckets()
    } catch (error) {
      console.error('Errore salvataggio:', error)
      alert('Errore salvataggio bucket')
    } finally {
      setBucketLoading(false)
    }
  }

  async function handleUpdateBucket(e: React.FormEvent) {
    e.preventDefault()
    if (!editingBucket) return

    setBucketLoading(true)

    try {
      const { error } = await supabase
        .from('buckets')
        .update({
          name: editBucketName,
          distribution_percentage: editBucketDistribution ? parseFloat(editBucketDistribution) : 0,
          current_balance: editBucketBalance ? parseFloat(editBucketBalance) : 0,
        })
        .eq('id', editingBucket.id)

      if (error) throw error

      setEditingBucket(null)
      loadBuckets()
    } catch (error) {
      console.error('Errore aggiornamento:', error)
      alert('Errore aggiornamento bucket')
    } finally {
      setBucketLoading(false)
    }
  }

  async function handleDeleteBucket(bucketId: string) {
    if (!confirm('Sei sicuro di voler eliminare questo bucket?')) return

    try {
      const { error } = await supabase.from('buckets').delete().eq('id', bucketId)
      if (error) throw error
      loadBuckets()
    } catch (error) {
      console.error('Error deleting bucket:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  // Calculate total distribution percentage
  const totalDistributionPercentage = buckets.reduce((sum, bucket) => {
    return sum + (bucket.distribution_percentage || 0)
  }, 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER STICKY CORRETTO */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <button 
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
            <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">I tuoi Buckets</h1>
        </div>
        <button
            onClick={onOpenSettings}
            className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors text-gray-600 border border-gray-100 active:scale-95"
            aria-label="Impostazioni"
          >
            <Settings className="w-5 h-5" strokeWidth={2} />
        </button>
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
            <p className="text-xs text-gray-400 mt-1 font-medium">
              {100 - totalDistributionPercentage >= 0 
                ? `${(100 - totalDistributionPercentage).toFixed(1)}% rimane nella Liquidità`
                : 'Attenzione: Hai superato il 100%!'}
            </p>
          </div>
        </div>

        {/* LISTA BUCKETS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Salvadanai Attivi</h2>
            <span className="text-xs text-gray-400 font-medium">{buckets.length} bucket</span>
          </div>

          {loading ? (
            <div className="space-y-3">
               {[1,2].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
            </div>
          ) : buckets.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
              <div className="bg-gray-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <PiggyBank className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">Nessun bucket creato</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {buckets.map((bucket) => (
                <div key={bucket.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between group active:scale-[0.99] transition-transform">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 text-lg">{bucket.name}</h3>
                      {bucket.distribution_percentage > 0 && (
                         <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded font-bold uppercase tracking-wider">
                           {bucket.distribution_percentage}%
                         </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 font-medium">Saldo attuale</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg text-gray-900">
                      {formatCurrency(bucket.current_balance || 0)}
                    </span>
                    <div className="flex gap-1">
                        <button 
                            onClick={() => {
                                setEditingBucket(bucket)
                                setEditBucketName(bucket.name)
                                setEditBucketDistribution((bucket.distribution_percentage || 0).toString())
                                setEditBucketBalance((bucket.current_balance || 0).toString())
                            }}
                            className="p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                            <PenLine className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => handleDeleteBucket(bucket.id)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BOTTONE AGGIUNGI */}
        <button
          onClick={() => setIsAddFormOpen(true)}
          className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuovo Bucket
        </button>
      </div>

      {/* MODALE AGGIUNTA */}
      {isAddFormOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setIsAddFormOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-10" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-gray-900">Nuovo Bucket</h3>
               <button onClick={() => setIsAddFormOpen(false)} className="p-1 bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            
            <form onSubmit={handleAddBucket} className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase ml-1">Nome Bucket</label>
                <input
                  type="text"
                  value={newBucketName}
                  onChange={e => setNewBucketName(e.target.value)}
                  placeholder="Es. Fondo Emergenza, Vacanze..."
                  className="w-full mt-1 p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium"
                  autoFocus
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1">Auto-Distribuzione (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={newBucketDistribution}
                      onChange={e => setNewBucketDistribution(e.target.value)}
                      placeholder="0.0"
                      className="w-full mt-1 p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1">Saldo Attuale (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newBucketBalance}
                      onChange={e => setNewBucketBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full mt-1 p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium"
                    />
                  </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={bucketLoading}
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {bucketLoading ? 'Salvataggio...' : 'Crea Bucket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODALE MODIFICA */}
      {editingBucket && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setEditingBucket(null)}>
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-10" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-gray-900">Modifica Bucket</h3>
               <button onClick={() => setEditingBucket(null)} className="p-1 bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            
            <form onSubmit={handleUpdateBucket} className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase ml-1">Nome Bucket</label>
                <input
                  type="text"
                  value={editBucketName}
                  onChange={e => setEditBucketName(e.target.value)}
                  className="w-full mt-1 p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1">Auto-Distribuzione (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editBucketDistribution}
                      onChange={e => setEditBucketDistribution(e.target.value)}
                      className="w-full mt-1 p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1">Saldo Attuale (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editBucketBalance}
                      onChange={e => setEditBucketBalance(e.target.value)}
                      className="w-full mt-1 p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium"
                    />
                  </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={bucketLoading}
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {bucketLoading ? 'Aggiornamento...' : 'Salva Modifiche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}