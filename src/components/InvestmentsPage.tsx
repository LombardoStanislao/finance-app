import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Trash2, X, TrendingUp, PieChart, Landmark, Bitcoin, Box, ScrollText, PenLine, Settings } from 'lucide-react'
import { supabase, type Investment } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'

interface InvestmentsPageProps {
  onBack: () => void
  onOpenSettings: () => void
  primaryColor: string
}

export default function InvestmentsPage({ onBack, onOpenSettings, primaryColor }: InvestmentsPageProps) {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  
  // States per Add/Edit Form
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<Investment['type']>('ETF')
  const [formValue, setFormValue] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    loadInvestments()
  }, [])

  async function loadInvestments() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('current_value', { ascending: false })

      if (error) throw error
      setInvestments(data || [])
    } catch (error) {
      console.error('Error loading investments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const payload = {
        name: formName,
        type: formType,
        current_value: parseFloat(formValue),
        user_id: user.id,
        last_updated: new Date().toISOString()
      }

      if (editingId) {
        const { error } = await supabase
          .from('investments')
          .update(payload)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('investments')
          .insert(payload)
        if (error) throw error
      }

      closeForm()
      loadInvestments()
    } catch (error) {
      console.error('Error saving investment:', error)
      alert('Errore durante il salvataggio')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminare questo asset?')) return
    try {
      const { error } = await supabase.from('investments').delete().eq('id', id)
      if (error) throw error
      loadInvestments()
    } catch (error) {
      console.error('Error deleting:', error)
    }
  }

  function openAddForm() {
    setEditingId(null)
    setFormName('')
    setFormType('ETF')
    setFormValue('')
    setIsFormOpen(true)
  }

  function openEditForm(inv: Investment) {
    setEditingId(inv.id)
    setFormName(inv.name || '')
    setFormType(inv.type)
    setFormValue(inv.current_value.toString())
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingId(null)
  }

  // Helper per le categorie
  const categories = [
    { type: 'ETF', label: 'ETF', icon: PieChart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { type: 'Azioni', label: 'Azioni Singole', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { type: 'Obbligazioni', label: 'Obbligazioni / BTP', icon: ScrollText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { type: 'Crypto', label: 'Criptovalute', icon: Bitcoin, color: 'text-orange-500', bg: 'bg-orange-50' },
    { type: 'Conto Deposito', label: 'Conti Deposito', icon: Landmark, color: 'text-purple-600', bg: 'bg-purple-50' },
    { type: 'Altro', label: 'Altro', icon: Box, color: 'text-gray-600', bg: 'bg-gray-50' },
  ] as const

  const totalPortfolio = investments.reduce((sum, item) => sum + (item.current_value || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER STICKY */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <button 
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
            <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Portafoglio</h1>
        </div>
        <button
            onClick={onOpenSettings}
            className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors text-gray-600 border border-gray-100 active:scale-95"
            aria-label="Impostazioni"
          >
            <Settings className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-8">
        
        {/* HERO CARD PORTAFOGLIO - CON COLORI DINAMICI */}
        <div 
            className="bg-white p-6 rounded-2xl border border-gray-100 text-center relative overflow-hidden transition-all duration-300"
            style={{ 
                boxShadow: `0 10px 30px -10px ${primaryColor}40` // Ombra colorata
            }}
        >
            {/* Linea superiore colorata */}
            <div 
                className="absolute top-0 left-0 w-full h-1" 
                style={{ backgroundColor: primaryColor }}
            ></div>
            
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Patrimonio Investito</p>
            <p className="text-4xl font-black text-gray-900 tracking-tight">{formatCurrency(totalPortfolio)}</p>
            <div className="mt-4 flex justify-center gap-2">
               <div className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Asset Allocation
               </div>
            </div>
        </div>

        {/* LISTA PER CATEGORIE */}
        <div className="space-y-8">
          {loading ? (
             <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-2xl animate-pulse" />)}
             </div>
          ) : investments.length === 0 ? (
            <div className="text-center py-10">
               <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                 <Box className="w-8 h-8 text-gray-400" />
               </div>
               <p className="text-gray-500 font-medium">Nessun investimento presente</p>
            </div>
          ) : (
            categories.map((cat) => {
              const categoryItems = investments.filter(item => item.type === cat.type)
              if (categoryItems.length === 0) return null

              const categoryTotal = categoryItems.reduce((sum, item) => sum + item.current_value, 0)
              const percentage = (categoryTotal / totalPortfolio) * 100

              return (
                <div key={cat.type} className="animate-in slide-in-from-bottom-4 duration-500">
                  {/* Category Header */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                        <div className={cn("p-2 rounded-lg", cat.bg)}>
                            <cat.icon className={cn("w-5 h-5", cat.color)} />
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-900 text-sm">{cat.label}</h2>
                            <div className="h-1 w-12 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                <div className={cn("h-full rounded-full", cat.color.replace('text-', 'bg-'))} style={{ width: `${percentage}%` }}></div>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-gray-900">{formatCurrency(categoryTotal)}</p>
                        <p className="text-[10px] text-gray-400 font-medium">{percentage.toFixed(1)}% del portafoglio</p>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-2">
                    {categoryItems.map(item => (
                        <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group active:scale-[0.99] transition-transform">
                            <div>
                                <p className="font-bold text-gray-900">{item.name || item.type}</p>
                                <p className="text-xs text-gray-400 mt-0.5">Aggiornato: {new Date(item.last_updated).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-gray-900">{formatCurrency(item.current_value)}</span>
                                <div className="flex gap-1">
                                    <button 
                                        onClick={() => openEditForm(item)}
                                        className="p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                    >
                                        <PenLine className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(item.id)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* FAB (Floating Action Button) - CON COLORE DINAMICO */}
        <button
          onClick={openAddForm}
          className="w-full py-4 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 sticky bottom-6"
          style={{ 
            backgroundColor: primaryColor,
            boxShadow: `0 10px 20px -5px ${primaryColor}40`
          }}
        >
          <Plus className="w-5 h-5" />
          Aggiungi Asset
        </button>
      </div>

      {/* MODALE ADD/EDIT */}
      {isFormOpen && (
        <div 
            className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in"
            onClick={closeForm}
        >
          <div 
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-10"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
               <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Modifica Asset' : 'Nuovo Asset'}</h3>
               <button onClick={closeForm} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Nome Asset</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Es. Apple, BTP 2030, Bitcoin..."
                  className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Tipo</label>
                    <select
                        value={formType}
                        onChange={(e) => setFormType(e.target.value as any)}
                        className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900 appearance-none"
                    >
                        {categories.map(c => <option key={c.type} value={c.type}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-bold uppercase ml-1 block mb-1">Valore (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formValue}
                      onChange={e => setFormValue(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-4 bg-gray-50 rounded-xl outline-none border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all font-medium text-gray-900"
                      required
                    />
                  </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full py-4 text-white font-bold rounded-2xl shadow-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                  style={{ 
                    backgroundColor: primaryColor,
                    boxShadow: `0 10px 20px -5px ${primaryColor}40`
                  }}
                >
                  {formLoading ? 'Salvataggio...' : 'Salva Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}