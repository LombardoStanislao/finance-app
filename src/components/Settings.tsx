import { useState } from 'react'
import { ArrowLeft, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

import { ProfileSettings } from './settings/ProfileSettings'
import { SecuritySettings } from './settings/SecuritySettings'
import { CategorySettings } from './settings/CategorySettings'
import { DataSettings } from './settings/DataSettings'

interface SettingsProps {
  onBack: () => void
  onProfileUpdate: () => void
  primaryColor: string
  onColorChange: (color: string) => void
}

export default function Settings({ onBack, onProfileUpdate, primaryColor, onColorChange }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'categories' | 'data'>('profile')

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER STICKY */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm pt-safe">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Impostazioni</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        
        {/* TABS MENU */}
        <div className="bg-gray-200/50 p-1.5 rounded-2xl flex gap-1 relative overflow-x-auto hide-scrollbar">
            {(['profile', 'security', 'categories', 'data'] as const).map((t) => (
                <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={cn(
                        "flex-1 py-2 px-3 text-[11px] font-bold rounded-xl transition-all duration-300 text-center tracking-wide whitespace-nowrap",
                        activeTab === t ? "bg-white text-gray-900 shadow-sm transform scale-100" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 transform scale-95"
                    )}
                >
                    {t === 'profile' && 'Profilo'}
                    {t === 'security' && 'Sicurezza'}
                    {t === 'categories' && 'Categorie'}
                    {t === 'data' && 'Dati'}
                </button>
            ))}
        </div>

        {activeTab === 'profile' && (
            <ProfileSettings 
                primaryColor={primaryColor} 
                onColorChange={onColorChange} 
                onProfileUpdate={onProfileUpdate} 
                onBack={onBack} 
            />
        )}

        {activeTab === 'security' && <SecuritySettings />}

        {activeTab === 'categories' && <CategorySettings />}
        
        {activeTab === 'data' && <DataSettings onProfileUpdate={onProfileUpdate} />}

        {/* ACTION BUTTONS BOTTOM */}
        <div className="space-y-3 pt-6 border-t border-gray-100 mt-6">
            <button 
                onClick={async () => { if (window.confirm('Uscire?')) await supabase.auth.signOut() }} 
                className="w-full py-4 text-gray-500 font-bold text-sm bg-white rounded-2xl border border-gray-100 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Esci dall'account
            </button>
        </div>

      </div>
    </div>
  )
}