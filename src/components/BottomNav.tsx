import { Home, History, Plus, PiggyBank, PieChart } from 'lucide-react'
import { cn } from '../lib/utils'

interface BottomNavProps {
  currentView: 'dashboard' | 'transactions' | 'buckets' | 'statistics'
  onNavigate: (view: 'dashboard' | 'transactions' | 'buckets' | 'statistics') => void
  onAddTransaction: () => void
  primaryColor: string
}

export default function BottomNav({ currentView, onNavigate, onAddTransaction, primaryColor }: BottomNavProps) {
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

  const NavItem = ({ 
    view, 
    icon: Icon, 
    label 
  }: { 
    view: 'dashboard' | 'transactions' | 'buckets' | 'statistics', 
    icon: any, 
    label: string 
  }) => {
    const isActive = currentView === view
    return (
      <button
        onClick={() => onNavigate(view)}
        className="flex flex-col items-center justify-center gap-1 flex-1 py-1 active:scale-95 transition-transform duration-200"
      >
        <div className={cn(
            "p-1.5 rounded-xl transition-all duration-300",
            isActive ? "bg-opacity-10" : "bg-transparent"
        )}
        style={isActive ? { backgroundColor: `${colorHex}15` } : {}}
        >
            <Icon
            className={cn(
                "w-6 h-6 transition-colors duration-300",
                isActive ? "" : "text-gray-400"
            )}
            style={isActive ? { color: colorHex, strokeWidth: 2.5 } : { strokeWidth: 2 }}
            />
        </div>
        <span
          className={cn(
            "text-[10px] font-semibold transition-colors duration-300",
            isActive ? "" : "text-gray-400"
          )}
          style={isActive ? { color: colorHex } : {}}
        >
          {label}
        </span>
      </button>
    )
  }

  return (
    <>
      {/* Spacer per evitare che il contenuto venga coperto dalla navbar */}
      <div className="h-24" /> 

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md shadow-[0_-5px_15px_rgba(0,0,0,0.04)] border-t border-gray-100 z-50 pb-safe">
        <div className="max-w-md mx-auto px-4 h-[72px] flex items-center justify-between relative">
          
          {/* Gruppo Sinistra */}
          <div className="flex flex-1 justify-around">
            <NavItem view="dashboard" icon={Home} label="Home" />
            <NavItem view="transactions" icon={History} label="Storico" />
          </div>

          {/* Tasto Centrale (Floating) */}
          <div className="relative -top-6 px-2">
            <button
              onClick={onAddTransaction}
              className="flex items-center justify-center h-14 w-14 rounded-full text-white shadow-xl transition-transform active:scale-90 hover:scale-105"
              style={{ 
                  backgroundColor: colorHex,
                  boxShadow: `0 8px 20px -4px ${colorHex}60` // Ombra colorata
              }}
              aria-label="Nuova Transazione"
            >
              <Plus className="w-8 h-8" strokeWidth={3} />
            </button>
          </div>

          {/* Gruppo Destra */}
          <div className="flex flex-1 justify-around">
            <NavItem view="buckets" icon={PiggyBank} label="Buckets" />
            <NavItem view="statistics" icon={PieChart} label="Analisi" />
          </div>

        </div>
      </nav>
    </>
  )
}