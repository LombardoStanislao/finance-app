import { useState, useEffect } from 'react'
import { Lock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'

export function SecuritySettings() {
    const { user } = useAuth()
    const [currentUserEmail, setCurrentUserEmail] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmNewPassword, setConfirmNewPassword] = useState('')
    const [securityLoading, setSecurityLoading] = useState(false)
    const [securityMessage, setSecurityMessage] = useState({ text: '', type: '' })

    useEffect(() => {
        if (user?.email) {
            setCurrentUserEmail(user.email)
        }
    }, [user])

    async function handleUpdateSecurity(type: 'email' | 'password') {
        setSecurityLoading(true)
        setSecurityMessage({ text: '', type: '' })
        try {
            if (type === 'email') {
                if (!newEmail) throw new Error("Inserisci una nuova email.")
                const { error } = await supabase.auth.updateUser({ email: newEmail })
                if (error) throw error
                setSecurityMessage({ text: 'Richiesta inviata. Supabase manderà un link di conferma sia alla vecchia che alla nuova email per sicurezza.', type: 'success' })
                setNewEmail('')
            } 
            
            if (type === 'password') {
                if (!currentPassword || !newPassword || !confirmNewPassword) {
                    throw new Error("Compila tutti i campi della password.")
                }
                if (newPassword !== confirmNewPassword) {
                    throw new Error("Le nuove password non combaciano.")
                }
                
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: currentUserEmail,
                    password: currentPassword
                })

                if (signInError) throw new Error("La password attuale non è corretta.")

                const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
                if (updateError) throw updateError

                setSecurityMessage({ text: 'Password aggiornata con successo.', type: 'success' })
                setCurrentPassword('')
                setNewPassword('')
                setConfirmNewPassword('')
            }
        } catch (err: any) {
            setSecurityMessage({ text: err.message || 'Si è verificato un errore.', type: 'error' })
        } finally {
            setSecurityLoading(false)
        }
    }

    return (
        <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-8">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-rose-600" />
                    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Sicurezza Account</h2>
                </div>
                <div className="p-5 space-y-6">
                    {securityMessage.text && (
                        <div className={cn("p-3 text-sm rounded-lg flex items-center gap-2", securityMessage.type === 'error' ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
                            {securityMessage.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                            {securityMessage.text}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Aggiorna Email</label>
                            <p className="text-xs text-gray-400 mb-3">Email attuale: <span className="font-bold text-gray-600">{currentUserEmail}</span></p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input 
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder="Nuovo indirizzo email"
                                    className="flex-1 p-3 bg-white rounded-xl outline-none border border-gray-200 focus:border-blue-500 font-medium text-sm"
                                />
                                <button 
                                    onClick={() => handleUpdateSecurity('email')}
                                    disabled={securityLoading || !newEmail}
                                    className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                >
                                    Cambia Email
                                </button>
                            </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-3">Aggiorna Password</label>
                            <div className="flex flex-col gap-3">
                                <input 
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Password attuale"
                                    className="w-full p-3 bg-white rounded-xl outline-none border border-gray-200 focus:border-blue-500 font-medium text-sm"
                                />
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <input 
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Nuova password"
                                        minLength={6}
                                        className="flex-1 p-3 bg-white rounded-xl outline-none border border-gray-200 focus:border-blue-500 font-medium text-sm"
                                    />
                                    <input 
                                        type="password"
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        placeholder="Conferma nuova password"
                                        minLength={6}
                                        className="flex-1 p-3 bg-white rounded-xl outline-none border border-gray-200 focus:border-blue-500 font-medium text-sm"
                                    />
                                </div>
                                <button 
                                    onClick={() => handleUpdateSecurity('password')}
                                    disabled={securityLoading || !currentPassword || !newPassword || !confirmNewPassword}
                                    className="w-full py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors mt-2"
                                >
                                    Cambia Password
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
