import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Edit2, Trash2, X, Save, Settings } from 'lucide-react'
import { supabase, type Investment } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'

interface InvestmentsPageProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  'ETF': 'ETF',
  'Obbligazioni': 'Obbligazioni',
  'Azioni': 'Azioni',
  'Conto Deposito': 'Conto Deposito',
  'Crypto': 'Crypto',
  'Altro': 'Altro'
}

export default function InvestmentsPage({ onBack, onOpenSettings, primaryColor }: InvestmentsPageProps) {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [newInvestmentName, setNewInvestmentName] = useState('')
  const [newInvestmentType, setNewInvestmentType] = useState<'ETF' | 'Obbligazioni' | 'Azioni' | 'Conto Deposito' | 'Crypto' | 'Altro'>('ETF')
  const [newInvestmentValue, setNewInvestmentValue] = useState<string>('')
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null)
  const [editInvestmentName, setEditInvestmentName] = useState('')
  const [editInvestmentType, setEditInvestmentType] = useState<'ETF' | 'Obbligazioni' | 'Azioni' | 'Conto Deposito' | 'Crypto' | 'Altro'>('ETF')
  const [editInvestmentValue, setEditInvestmentValue] = useState<string>('')
  const [investmentLoading, setInvestmentLoading] = useState(false)
  const [investmentError, setInvestmentError] = useState<string | null>(null)
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)

  useEffect(() => {
    loadInvestments()
  }, [])

  async function loadInvestments() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.log('InvestmentsPage: No user found')
        return
      }

      console.log('InvestmentsPage: Loading investments for user:', user.id)
      const { data, error } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('InvestmentsPage: Error fetching investments:', error)
        throw error
      }

      console.log('InvestmentsPage: Fetched investments:', data)
      setInvestments(data || [])
    } catch (error) {
      console.error('InvestmentsPage: Error loading investments:', error)
      setInvestmentError(error instanceof Error ? error.message : 'Errore nel caricamento degli investimenti')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddInvestment(e: React.FormEvent) {
    e.preventDefault()
    setInvestmentLoading(true)
    setInvestmentError(null)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Utente non autenticato')

      // IMPORTANT: Update investments table directly, NO transaction record
      const { error } = await supabase
        .from('investments')
        .insert({
          name: newInvestmentName || null,
          type: newInvestmentType,
          current_value: parseFloat(newInvestmentValue) || 0,
          user_id: user.id,
        })

      if (error) throw error

      setNewInvestmentName('')
      setNewInvestmentType('ETF')
      setNewInvestmentValue('')
      setIsAddFormOpen(false)
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
      // IMPORTANT: Update investments table directly, NO transaction record
      const { error } = await supabase
        .from('investments')
        .update({
          name: editInvestmentName || null,
          type: editInvestmentType,
          current_value: parseFloat(editInvestmentValue) || 0,
          last_updated: new Date().toISOString(),
        })
        .eq('id', editingInvestment.id)

      if (error) throw error

      setEditingInvestment(null)
      setEditInvestmentName('')
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

  const totalValue = investments.reduce((sum, inv) => sum + (inv.current_value || 0), 0)

  return (
    <div className="w-full min-h-full bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
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
            <h1 className="text-2xl font-bold text-gray-900">Investimenti</h1>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Impostazioni"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Total Value Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">Valore Totale Investimenti</p>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalValue)}</p>
        </div>

        {/* Investments List */}
        <div>
          {investmentError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-600">{investmentError}</p>
            </div>
          )}
          {loading ? (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
              <p className="text-gray-500">Caricamento...</p>
            </div>
          ) : investments.length === 0 ? (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
              <p className="text-gray-500">Nessun investimento ancora</p>
            </div>
          ) : (
            <div className="space-y-2">
              {investments.map((investment) => (
                <div
                  key={investment.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                        {INVESTMENT_TYPE_LABELS[investment.type] || investment.type}
                      </span>
                      {investment.name && (
                        <p className="font-medium text-gray-900">{investment.name}</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Ultimo aggiornamento: {new Date(investment.last_updated).toLocaleDateString('it-IT')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-lg font-semibold text-gray-900">
                      {formatCurrency(investment.current_value || 0)}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingInvestment(investment)
                          setEditInvestmentName(investment.name || '')
                          setEditInvestmentType(investment.type)
                          setEditInvestmentValue((investment.current_value || 0).toString())
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
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Investment Button */}
        <button
          onClick={() => setIsAddFormOpen(true)}
          className="w-full py-4 px-6 rounded-xl font-semibold text-white transition-colors flex items-center justify-center gap-2"
          style={{ backgroundColor: colorHex }}
        >
          <Plus className="w-5 h-5" />
          Aggiungi Investimento
        </button>
      </div>

      {/* Add Investment Modal */}
      {isAddFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Nuovo Investimento</h2>
              <button
                onClick={() => {
                  setIsAddFormOpen(false)
                  setNewInvestmentName('')
                  setNewInvestmentType('ETF')
                  setNewInvestmentValue('')
                  setInvestmentError(null)
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleAddInvestment} className="p-6 space-y-4">
              {investmentError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{investmentError}</p>
                </div>
              )}

              <div>
                <label htmlFor="investmentName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome (opzionale)
                </label>
                <input
                  id="investmentName"
                  type="text"
                  value={newInvestmentName}
                  onChange={(e) => setNewInvestmentName(e.target.value)}
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Es. VWCE, Apple Stock, Bitcoin"
                />
              </div>

              <div>
                <label htmlFor="investmentType" className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  id="investmentType"
                  value={newInvestmentType}
                  onChange={(e) => setNewInvestmentType(e.target.value as any)}
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
                <label htmlFor="investmentValue" className="block text-sm font-medium text-gray-700 mb-1">
                  Valore Attuale
                </label>
                <input
                  id="investmentValue"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newInvestmentValue}
                  onChange={(e) => setNewInvestmentValue(e.target.value)}
                  required
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">Valore iniziale dell'investimento (non crea una transazione)</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddFormOpen(false)
                    setNewInvestmentName('')
                    setNewInvestmentType('ETF')
                    setNewInvestmentValue('')
                    setInvestmentError(null)
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
                  {investmentLoading ? 'Salvataggio...' : 'Salva'}
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
                  setEditInvestmentName('')
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
                <label htmlFor="editInvestmentName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome (opzionale)
                </label>
                <input
                  id="editInvestmentName"
                  type="text"
                  value={editInvestmentName}
                  onChange={(e) => setEditInvestmentName(e.target.value)}
                  className="w-full border border-gray-300 px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Es. VWCE, Apple Stock, Bitcoin"
                />
              </div>

              <div>
                <label htmlFor="editInvestmentType" className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  id="editInvestmentType"
                  value={editInvestmentType}
                  onChange={(e) => setEditInvestmentType(e.target.value as any)}
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
                  Valore Attuale
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
                    setEditInvestmentName('')
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
    </div>
  )
}

