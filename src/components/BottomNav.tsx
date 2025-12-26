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

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 safe-area-bottom">
      <div className="max-w-md mx-auto px-2 py-2">
        <div className="flex items-center justify-evenly">
          {/* Home */}
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors flex-1"
            aria-label="Home"
          >
            <Home
              className={cn(
                "w-6 h-6",
                currentView === 'dashboard' ? "" : "text-gray-400"
              )}
              style={currentView === 'dashboard' ? { color: colorHex } : {}}
            />
            <span
              className={cn(
                "text-xs font-medium",
                currentView === 'dashboard' ? "" : "text-gray-400"
              )}
              style={currentView === 'dashboard' ? { color: colorHex } : {}}
            >
              Home
            </span>
          </button>

          {/* Transactions */}
          <button
            onClick={() => onNavigate('transactions')}
            className="flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors flex-1"
            aria-label="Transazioni"
          >
            <History
              className={cn(
                "w-6 h-6",
                currentView === 'transactions' ? "" : "text-gray-400"
              )}
              style={currentView === 'transactions' ? { color: colorHex } : {}}
            />
            <span
              className={cn(
                "text-xs font-medium",
                currentView === 'transactions' ? "" : "text-gray-400"
              )}
              style={currentView === 'transactions' ? { color: colorHex } : {}}
            >
              Transazioni
            </span>
          </button>

          {/* Add Button (Center) - Perfect Circle */}
          <button
            onClick={onAddTransaction}
            className="flex items-center justify-center h-14 w-14 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 flex-shrink-0"
            style={{ backgroundColor: colorHex }}
            aria-label="Aggiungi Transazione"
          >
            <Plus className="w-7 h-7 text-white" />
          </button>

          {/* Buckets */}
          <button
            onClick={() => onNavigate('buckets')}
            className="flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors flex-1"
            aria-label="Buckets"
          >
            <PiggyBank
              className={cn(
                "w-6 h-6",
                currentView === 'buckets' ? "" : "text-gray-400"
              )}
              style={currentView === 'buckets' ? { color: colorHex } : {}}
            />
            <span
              className={cn(
                "text-xs font-medium",
                currentView === 'buckets' ? "" : "text-gray-400"
              )}
              style={currentView === 'buckets' ? { color: colorHex } : {}}
            >
              Buckets
            </span>
          </button>

          {/* Statistics */}
          <button
            onClick={() => onNavigate('statistics')}
            className="flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors flex-1"
            aria-label="Statistiche"
          >
            <PieChart
              className={cn(
                "w-6 h-6",
                currentView === 'statistics' ? "" : "text-gray-400"
              )}
              style={currentView === 'statistics' ? { color: colorHex } : {}}
            />
            <span
              className={cn(
                "text-xs font-medium",
                currentView === 'statistics' ? "" : "text-gray-400"
              )}
              style={currentView === 'statistics' ? { color: colorHex } : {}}
            >
              Statistiche
            </span>
          </button>
        </div>
      </div>
    </nav>
  )
}

