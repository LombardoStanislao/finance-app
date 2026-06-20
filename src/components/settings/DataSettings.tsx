import { useState, useRef } from 'react'
import { DatabaseBackup, Download, Upload, AlertOctagon } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

interface DataSettingsProps {
    onProfileUpdate: () => void
}

export function DataSettings({ onProfileUpdate }: DataSettingsProps) {
    const { user } = useAuth()
    const [backupLoading, setBackupLoading] = useState(false)
    const [resetLoading, setResetLoading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    async function handleExportJSON() {
        setBackupLoading(true)
        try {
            if (!user) throw new Error("Utente non trovato")

            const fetchAll = async (table: string) => {
                const { data, error } = await supabase.from(table).select('*').eq('user_id', user.id)
                if (error) throw error;
                return data || [];
            }

            const { data: profile, error: profErr } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
            if (profErr) throw new Error("Profilo Export: " + profErr.message)

            const backupData = {
                version: "1.0",
                export_date: new Date().toISOString(),
                data: {
                    profile,
                    categories: await fetchAll('categories'),
                    buckets: await fetchAll('buckets'),
                    investments: await fetchAll('investments'),
                    transactions: await fetchAll('transactions'),
                    recurring_transactions: await fetchAll('recurring_transactions')
                }
            }

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const dateStr = new Date().toISOString().split('T')[0]
            a.download = `Backup_${dateStr}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)

        } catch (e: any) {
            toast.error("Errore durante l'esportazione: " + e.message)
        } finally {
            setBackupLoading(false)
        }
    }

    async function handleImportFileChanged(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        if (!window.confirm("⚠️ ALLERTA MASSIMA ⚠️\n\nQuesta operazione effettuerà un WIPE TOTALE (Tabula Rasa) dei tuoi dati attuali: Categorie, Transazioni, Salvadanai e Investimenti verranno polverizzati per fare spazio al file di backup.\n\nVuoi davvero sovrascrivere tutto?")) {
            e.target.value = ''
            return
        }

        setBackupLoading(true)
        try {
            const text = await file.text()
            const json = JSON.parse(text)

            if (!json.version || !json.data) {
                throw new Error("Il file JSON non è un pacchetto di backup valido.")
            }

            if (!user) throw new Error("Sessione utente invalida")

            const { profile: bProfile, categories: bCats, buckets: bBuckets, investments: bInvs, transactions: bTrans, recurring_transactions: bRecs } = json.data
            
            if (bProfile) {
                const { id, ...profileDataToUpdate } = bProfile
                const { error: pErr } = await supabase.from('profiles').upsert({ id: user.id, ...profileDataToUpdate })
                if (pErr) throw new Error("Ripristino Profilo Fiscale: " + pErr.message)
            }

            await supabase.from('transactions').delete().eq('user_id', user.id)
            await supabase.from('recurring_transactions').delete().eq('user_id', user.id)
            await supabase.from('investments').delete().eq('user_id', user.id)
            await supabase.from('buckets').delete().eq('user_id', user.id)
            await supabase.from('categories').delete().eq('user_id', user.id)

            const mapId = (oldId: string | null, map: Record<string, string>) => oldId ? (map[oldId] || null) : null
            
            const catMap: Record<string, string> = {}
            const newCategories = (bCats || []).map((c: any) => {
                const newId = crypto.randomUUID()
                catMap[c.id] = newId
                return { ...c, id: newId, user_id: user.id }
            })
            
            newCategories.forEach((c: any) => {
                if (c.parent_id) c.parent_id = catMap[c.parent_id] || null
            })

            const bucketMap: Record<string, string> = {}
            const newBuckets = (bBuckets || []).map((b: any) => {
                const newId = crypto.randomUUID()
                bucketMap[b.id] = newId
                return { ...b, id: newId, user_id: user.id }
            })

            const invMap: Record<string, string> = {}
            const newInvestments = (bInvs || []).map((i: any) => {
                const newId = crypto.randomUUID()
                invMap[i.id] = newId
                return { ...i, id: newId, user_id: user.id }
            })

            const newRecurring = (bRecs || []).map((r: any) => {
                const newId = crypto.randomUUID()
                return { 
                    ...r, 
                    id: newId, 
                    user_id: user.id,
                    category_id: mapId(r.category_id, catMap),
                    bucket_id: mapId(r.bucket_id, bucketMap)
                }
            })

            const newTransactions = (bTrans || []).map((t: any) => {
                const newId = crypto.randomUUID()
                return { 
                    ...t, 
                    id: newId, 
                    user_id: user.id,
                    category_id: mapId(t.category_id, catMap),
                    bucket_id: mapId(t.bucket_id, bucketMap),
                    investment_id: mapId(t.investment_id, invMap)
                }
            })

            const parents = newCategories.filter((c: any) => !c.parent_id)
            const children = newCategories.filter((c: any) => c.parent_id)
            if (parents.length > 0) {
                const { error } = await supabase.from('categories').insert(parents)
                if (error) throw new Error("Padri SC: " + error.message)
            }
            if (children.length > 0) {
                const { error } = await supabase.from('categories').insert(children)
                if (error) throw new Error("Figli SC: " + error.message)
            }

            if (newBuckets.length > 0) {
                const { error } = await supabase.from('buckets').insert(newBuckets)
                if (error) throw new Error("Salvadanai SC: " + error.message)
            }
            if (newInvestments.length > 0) {
                const { error } = await supabase.from('investments').insert(newInvestments)
                if (error) throw new Error("Investimenti SC: " + error.message)
            }
            if (newRecurring.length > 0) {
                const { error } = await supabase.from('recurring_transactions').insert(newRecurring)
                if (error) throw new Error("Ricorrenti SC: " + error.message)
            }

            const chunkSize = 1500;
            for (let i = 0; i < newTransactions.length; i += chunkSize) {
                const chunk = newTransactions.slice(i, i + chunkSize);
                const { error } = await supabase.from('transactions').insert(chunk)
                if (error) throw new Error(`Transazioni batch ${i}: ` + error.message)
            }

            toast.success("✅ Ripristino completato con successo! Dati e impostazioni P.IVA ripristinati.")
            onProfileUpdate()
            
        } catch (e: any) {
            console.error(e)
            toast.error("❌ Ops, l'importazione è crashata: " + e.message)
        } finally {
            setBackupLoading(false)
            e.target.value = ''
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
            if (!user) throw new Error('Utente non autenticato')
  
            const { error: tError } = await supabase.from('transactions').delete().eq('user_id', user.id)
            if (tError) throw tError
  
            const { error: iError } = await supabase.from('investments').delete().eq('user_id', user.id)
            if (iError) throw iError
  
            const { error: bError } = await supabase.from('buckets').delete().eq('user_id', user.id)
            if (bError) throw bError
  
            const { error: cError } = await supabase.from('categories').delete().eq('user_id', user.id)
            if (cError) throw cError
  
            onProfileUpdate()
            toast.success('Reset completato con successo. Benvenuto nel tuo nuovo inizio!')
            
        } catch (error: any) {
            console.error('Factory Reset Error:', error)
            toast.error('Si è verificato un errore durante il ripristino: ' + error.message)
        } finally {
            setResetLoading(false)
        }
    }

    return (
        <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
            <div className="bg-gray-100/50 rounded-2xl shadow-inner border border-gray-200 overflow-hidden mb-6">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
                    <DatabaseBackup className="w-5 h-5 text-gray-500" />
                    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Archivio Dati & Backup</h2>
                </div>
                <div className="p-5 space-y-4">
                    <p className="text-xs text-gray-600 mb-4 px-1">Esporta il tuo intero profilo con tutta la rete di Categorie, Transazioni, Salvadanai e Investimenti in un file JSON.</p>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={handleExportJSON}
                            disabled={backupLoading}
                            className="py-3 px-4 flex items-center justify-center gap-2 bg-white hover:bg-blue-50 border-2 border-transparent hover:border-blue-100 text-blue-600 font-bold rounded-xl active:scale-95 transition-all shadow-sm disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" /> Esporta JSON
                        </button>

                        <input 
                            type="file" 
                            accept=".json" 
                            ref={fileInputRef} 
                            onChange={handleImportFileChanged} 
                            className="hidden" 
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={backupLoading}
                            className="py-3 px-4 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl active:scale-95 transition-all shadow-sm disabled:opacity-50"
                        >
                            <Upload className="w-4 h-4" /> Importa JSON
                        </button>
                    </div>
                </div>
            </div>

            <button 
                onClick={handleFactoryReset} 
                disabled={resetLoading} 
                className="w-full py-4 text-red-600 bg-red-50 border border-red-100 rounded-2xl font-bold text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2 mt-4"
            >
                <AlertOctagon className="w-4 h-4" /> 
                {resetLoading ? 'Cancellazione in corso...' : 'RIPRISTINA DATI DI FABBRICA'}
            </button>
        </div>
    )
}
