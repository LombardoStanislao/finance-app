import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Edit2, Trash2, X, Save, Settings } from 'lucide-react'
import { supabase, type Bucket } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'

interface BucketsPageProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

export default function BucketsPage({ onBack, onOpenSettings, primaryColor }: BucketsPageProps) {
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [loading, setLoading] = useState(true)
  const [newBucketName, setNewBucketName] = useState('')
  const [newBucketDistribution, setNewBucketDistribution] = useState<string>('')
  const [newBucketBalance, setNewBucketBalance] = useState<string>('')
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null)
  const [editBucketName, setEditBucketName] = useState('')
  const [editBucketDistribution, setEditBucketDistribution] = useState<string>('')
  const [editBucketBalance, setEditBucketBalance] = useState<string>('')
  const [bucketLoading, setBucketLoading] = useState(false)
  const [bucketError, setBucketError] = useState<string | null>(null)
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
          current_balance: newBucketBalance ? parseFloat(newBucketBalance) : 0,
          user_id: user.id,
        })

      if (error) throw error

      setNewBucketName('')
      setNewBucketDistribution('')
      setNewBucketBalance('')
      setIsAddFormOpen(false)
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
          current_balance: editBucketBalance ? parseFloat(editBucketBalance) : 0,
        })
        .eq('id', editingBucket.id)

      if (error) throw error

      setEditingBucket(null)
      setEditBucketName('')
      setEditBucketDistribution('')
      setEditBucketBalance('')
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

  // Calculate total distribution percentage
  const totalDistributionPercentage = buckets.reduce((sum, bucket) => {
    return sum + (bucket.distribution_percentage || 0)
  }, 0)

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
            <h1 className="text-2xl font-bold text-gray-900">Buckets</h1>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Impostazioni"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>

        {/* Distribution Summary */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
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
        </div>

        {/* Buckets List */}
        <div>
          {loading ? (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
              <p className="text-gray-500">Caricamento...</p>
            </div>
          ) : buckets.length === 0 ? (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
              <p className="text-gray-500">Nessun bucket ancora</p>
            </div>
          ) : (
            <div className="space-y-2">
              {buckets.map((bucket) => (
                <div
                  key={bucket.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{bucket.name}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <p className="text-xs text-gray-500">
                        Saldo: <span className="font-semibold text-gray-700">{formatCurrency(bucket.current_balance || 0)}</span>
                      </p>
                      {bucket.distribution_percentage > 0 && (
                        <p className="text-xs text-gray-500">
                          Distribuzione: <span className="font-semibold text-gray-700">{bucket.distribution_percentage}%</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingBucket(bucket)
                        setEditBucketName(bucket.name)
                        setEditBucketDistribution((bucket.distribution_percentage || 0).toString())
                        setEditBucketBalance((bucket.current_balance || 0).toString())
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

        {/* Add Bucket Button */}
        <button
          onClick={() => setIsAddFormOpen(true)}
          className="w-full py-4 px-6 rounded-xl font-semibold text-white transition-colors flex items-center justify-center gap-2"
          style={{ backgroundColor: colorHex }}
        >
          <Plus className="w-5 h-5" />
          Aggiungi Bucket
        </button>
      </div>

      {/* Add Bucket Modal */}
      {isAddFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Nuovo Bucket</h2>
              <button
                onClick={() => {
                  setIsAddFormOpen(false)
                  setNewBucketName('')
                  setNewBucketDistribution('')
                  setBucketError(null)
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleAddBucket} className="p-6 space-y-4">
              {bucketError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{bucketError}</p>
                </div>
              )}

              <div>
                <label htmlFor="bucketName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Bucket
                </label>
                <input
                  id="bucketName"
                  type="text"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  required
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label htmlFor="bucketDistribution" className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.0"
                />
                <p className="text-xs text-gray-500 mt-1">Percentuale di entrate da distribuire automaticamente</p>
              </div>

              <div>
                <label htmlFor="bucketBalance" className="block text-sm font-medium text-gray-700 mb-1">
                  Saldo Attuale
                </label>
                <input
                  id="bucketBalance"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newBucketBalance}
                  onChange={(e) => setNewBucketBalance(e.target.value)}
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">Saldo iniziale del bucket (non crea una transazione)</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddFormOpen(false)
                    setNewBucketName('')
                    setNewBucketDistribution('')
                    setNewBucketBalance('')
                    setBucketError(null)
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
                  {bucketLoading ? 'Salvataggio...' : 'Salva'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  setEditBucketBalance('')
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

              <div>
                <label htmlFor="editBucketBalance" className="block text-sm font-medium text-gray-700 mb-1">
                  Saldo Attuale
                </label>
                <input
                  id="editBucketBalance"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editBucketBalance}
                  onChange={(e) => setEditBucketBalance(e.target.value)}
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Saldo attuale del bucket (non crea una transazione)</p>
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
    </div>
  )
}

