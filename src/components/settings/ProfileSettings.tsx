import { useState, useEffect } from 'react'
import { Wallet, ChevronRight, User, Briefcase, Calculator, AlertTriangle, CheckCircle2, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

interface ProfileSettingsProps {
    primaryColor: string
    onColorChange: (color: string) => void
    onProfileUpdate: () => void
    onBack: () => void
}

export function ProfileSettings({ primaryColor, onColorChange, onProfileUpdate, onBack }: ProfileSettingsProps) {
    const { user } = useAuth()
    const [displayName, setDisplayName] = useState('')
    const [initialLiquidity, setInitialLiquidity] = useState<string>('')
    
    const [isProTax, setIsProTax] = useState(false)
    const [profitabilityCoeff, setProfitabilityCoeff] = useState<string>('78')
    const [inpsRate, setInpsRate] = useState<string>('26.23')
    const [flatTaxRate, setFlatTaxRate] = useState<string>('5')
    
    const [loading, setLoading] = useState(false)
    const [profileError, setProfileError] = useState<string | null>(null)
    const [profileSuccess, setProfileSuccess] = useState(false)
    const [colorHex, setColorHex] = useState<string>(primaryColor)

    useEffect(() => {
        if (user) loadUserProfile()
    }, [user])

    useEffect(() => {
        setColorHex(primaryColor)
    }, [primaryColor])

    async function loadUserProfile() {
        if (!user) return
        if (user?.user_metadata?.display_name) {
            setDisplayName(user.user_metadata.display_name)
        }
        
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
            if (!user) throw new Error('Utente non autenticato')

            const { error: authErr } = await supabase.auth.updateUser({
                data: { display_name: displayName }
            })
            if (authErr) throw authErr

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

    return (
        <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
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

            {profileError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {profileError}
                </div>
            )}
            {profileSuccess && <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-3 rounded-lg text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Salvato con successo!</div>}

            <button onClick={handleSaveProfile} disabled={loading} className="w-full py-4 text-white rounded-2xl font-bold text-sm shadow-lg shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2" style={{ backgroundColor: colorHex }}>
                <Save className="w-4 h-4" /> {loading ? 'Salvataggio...' : 'Salva Modifiche Profilo'}
            </button>
        </div>
    )
}
