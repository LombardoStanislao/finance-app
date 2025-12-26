import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Trash2, TrendingUp, Wallet, PieChart, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Interfaccia per i dati dal DB
interface Investment {
  id: string
  name: string
  type: string
  current_value: number
  created_at?: string
}

// Manteniamo le props originali per non rompere la navigazione
interface InvestmentsPageProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

export default function InvestmentsPage({ onBack }: InvestmentsPageProps) {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  
  // Form states
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('ETF')
  const [newValue, setNewValue] = useState('')

  // 1. LOGICA DI CARICAMENTO SEMPLIFICATA
  const fetchInvestments = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('investments')
        .select('*')
        
      if (error) throw error
      
      const sortedData = (data || []).sort((a, b) => {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })

      setInvestments(sortedData)
    } catch (error) {
      console.error('Errore caricamento:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvestments()
  }, [])

  // 2. Calcolo Totale
  const totalValue = investments.reduce((sum, item) => sum + (item.current_value || 0), 0)

  // 3. Aggiunta Investimento
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName && !newValue) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase.from('investments').insert([
        {
          name: newName || 'Investimento',
          type: newType,
          current_value: parseFloat(newValue.replace(',', '.')) || 0,
          user_id: user.id
        }
      ])

      if (error) throw error
      
      setNewName('')
      setNewValue('')
      setShowAddForm(false)
      fetchInvestments()
    } catch (error) {
      console.error('Errore salvataggio:', error)
      alert('Errore nel salvataggio')
    }
  }

  // 4. Cancellazione
  const handleDelete = async (id: string) => {
    if (!window.confirm('Eliminare questo investimento?')) return
    try {
      const { error } = await supabase.from('investments').delete().eq('id', id)
      if (error) throw error
      fetchInvestments()
    } catch (error) {
      console.error('Errore cancellazione:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* CONTENITORE PRINCIPALE CENTRATO */}
      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        
        {/* HEADER: Ora è dentro il contenitore, allineato con tutto il resto */}
        <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors -ml-2"
              aria-label="Indietro"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Portafoglio</h1>
        </div>
        
        {/* Card Totale */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <TrendingUp className="w-32 h-32 text-blue-600" />
          </div>
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <div className="p-1.5 bg-blue-50 rounded-lg">
              <PieChart className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500 font-medium uppercase tracking-wide">Patrimonio Investito</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 relative z-10">{formatCurrency(totalValue)}</p>
        </div>

        {/* Lista Investimenti */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">I tuoi Asset</h2>
            <span className="text-xs text-gray-400 font-medium">{investments.length} posizioni</span>
          </div>
          
          {loading ? (
            <div className="space-y-3">
               {[1,2].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
            </div>
          ) : investments.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
              <div className="bg-gray-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Wallet className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">Portafoglio vuoto</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {investments.map((inv) => (
                <div key={inv.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900">{inv.name}</h3>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded font-bold uppercase">
                        {inv.type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Valore attuale</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg text-blue-600">
                      {formatCurrency(inv.current_value)}
                    </span>
                    <button 
                      onClick={() => handleDelete(inv.id)}
                      className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottone Aggiungi */}
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Aggiungi Asset
        </button>
      </div>

      {/* Modale Aggiunta */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setShowAddForm(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-10" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-gray-900">Nuovo Investimento</h3>
               <button onClick={() => setShowAddForm(false)} className="p-1 bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase ml-1">Nome Asset</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Es. VWCE, Bitcoin..."
                  className="w-full mt-1 p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 font-bold uppercase ml-1">Tipo</label>
                  <select 
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                    className="w-full mt-1 p-4 bg-gray-50 rounded-xl outline-none border-r-[16px] border-r-transparent"
                  >
                    <option value="ETF">ETF</option>
                    <option value="Azioni">Azioni</option>
                    <option value="Crypto">Crypto</option>
                    <option value="Obbligazioni">Obbligazioni</option>
                    <option value="Liquidità">Cash</option>
                    <option value="Altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-bold uppercase ml-1">Valore (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    placeholder="0.00"
                    className="w-full mt-1 p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium"
                  />
                </div>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all"
                >
                  Salva
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}