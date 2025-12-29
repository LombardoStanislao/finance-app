import { useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, PieChart, TrendingUp, PiggyBank, ArrowRightLeft, Wallet, AlertTriangle, Info, Search, RefreshCw } from 'lucide-react'
import { cn } from '../lib/utils'

interface GuidePageProps {
  onBack: () => void
  primaryColor: string
}

export default function GuidePage({ onBack, primaryColor }: GuidePageProps) {
  const [openSection, setOpenSection] = useState<string | null>(null)

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id)
  }

  const sections = [
    {
      id: 'basics',
      title: 'Concetti Base',
      icon: Wallet,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      content: (
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            Benvenuto! Questa app è progettata per darti una visione completa del tuo <strong>Patrimonio Netto</strong> (Net Worth), calcolato come:
          </p>
          <div className="p-3 bg-gray-100 rounded-xl font-mono text-xs text-center font-bold text-gray-700">
            Liquidità + Salvadanai + Investimenti
          </div>
          <p>
            Ogni sezione gestisce uno di questi compartimenti. L'obiettivo è tracciare non solo le spese, ma la costruzione della tua ricchezza nel tempo.
          </p>
        </div>
      )
    },
    {
      id: 'investments',
      title: 'Investimenti: Ticker e Ricerca',
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      content: (
        <div className="space-y-6 text-sm text-gray-600 leading-relaxed pb-4">
          
          {/* 1. COS'È IL TICKER E COME TROVARLO */}
          <div>
            <h4 className="font-bold text-purple-700 mb-2 flex items-center gap-2 text-sm">
                <Search className="w-4 h-4"/>
                Cos'è il Ticker e dove trovarlo
            </h4>
            <p className="text-xs mb-3">
                Il <strong>Ticker</strong> è il codice univoco che identifica un asset (azione o ETF) in borsa. Per usare il tracciamento automatico, devi inserire questo codice esatto recuperandolo da Yahoo Finance.
            </p>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase">COME FARE:</p>
                <ol className="list-decimal pl-4 space-y-1 text-xs">
                    <li>Vai su <a href="https://finance.yahoo.com" target="_blank" className="underline font-bold text-blue-600">Yahoo Finanza</a>.</li>
                    <li>Cerca il nome dell'azienda o dell'ETF (es. "Apple" o "Vanguard").</li>
                    <li>Copia il codice che trovi <strong>tra parentesi</strong> accanto al nome.</li>
                </ol>

                <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">ESEMPIO REALE SU YAHOO:</p>
                    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
                        <p className="font-serif text-sm text-gray-800 italic mb-1">
                            "Vanguard FTSE All-World UCITS ETF USD Accumulation ( <strong className="text-emerald-600 not-italic font-sans bg-emerald-50 px-1 rounded">VWCE.MI</strong> )"
                        </p>
                    </div>
                    <p className="text-[10px] text-emerald-600 mt-2 font-bold flex items-center gap-1">
                        👆 In questo caso il Ticker da inserire nell'app è <span className="bg-emerald-100 px-1 rounded">VWCE.MI</span>
                    </p>
                </div>
            </div>
          </div>

          <hr className="border-gray-100"/>

           {/* 3. RIQUADRO GIALLO VALUTA */}
           <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 shadow-sm">
            <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4"/>
                Attenzione alla Valuta (USD vs EUR)
            </h4>
            <p className="text-xs text-amber-900 mb-3 leading-relaxed">
                L'app mostra i valori in <strong>Euro (€)</strong>. Se inserisci un ticker americano (es. NASDAQ), il prezzo arriverà in Dollari ma verrà mostrato come Euro, falsando il totale.
            </p>
            <p className="font-bold text-xs text-amber-900 uppercase mb-1">SOLUZIONE:</p>
            <p className="text-xs text-amber-800 mb-2 leading-relaxed">
                Cerca sempre lo strumento quotato su una <strong>Borsa Europea</strong> (Milano, Francoforte, Parigi). Riconosci la borsa dal suffisso del ticker:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-xs text-amber-900 font-mono font-bold">
                <li>.MI <span className="font-sans font-normal text-amber-800">= Milano (Perfetto, €)</span></li>
                <li>.F / .DE <span className="font-sans font-normal text-amber-800">= Francoforte/Xetra (Perfetto, €)</span></li>
                <li>.PA <span className="font-sans font-normal text-amber-800">= Parigi (Perfetto, €)</span></li>
            </ul>
          </div>

          {/* 2. ESEMPI PRATICI (RIPRISTINATI COME DA SCREENSHOT) */}
          <div>
             <h4 className="font-bold text-gray-900 text-xs uppercase mb-3">ESEMPI PRATICI (ATTENZIONE ALLA VALUTA)</h4>
             
             {/* Esempio Apple */}
             <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 mb-3">
                <p className="font-bold text-gray-900 text-sm">Vuoi comprare azioni "Apple"?</p>
                <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center gap-2 opacity-60">
                        <span className="text-red-500 font-bold line-through decoration-2 decoration-red-500 bg-red-50 px-1 rounded">AAPL</span>
                        <span className="text-gray-500">(Nasdaq - $) ❌ No (Dollari)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded">APC.F</span>
                        <span className="text-gray-700">(Francoforte - €) ✅ Sì (Euro)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded">1AA.MI</span>
                        <span className="text-gray-700">(Milano - €) ✅ Sì (Euro)</span>
                    </div>
                </div>
             </div>

             {/* Esempio ETF */}
             <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                <p className="font-bold text-gray-900 text-sm">Vuoi comprare l'ETF "Vanguard All-World"?</p>
                <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                        <span className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded">VWCE.MI</span>
                        <span className="text-gray-700">(Milano - €) ✅ Sì (Perfetto)</span>
                    </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 leading-snug">
                    Cerca sempre suffissi come <strong>.MI</strong> (Milano), <strong>.F</strong> (Francoforte), <strong>.PA</strong> (Parigi).
                </p>
             </div>
          </div>

          <hr className="border-gray-100"/>

          {/* 4. MODALITÀ INSERIMENTO */}
          <div>
            <h4 className="font-bold text-blue-700 mb-3 flex items-center gap-2 text-sm">
                <Info className="w-4 h-4"/>
                Due modi per aggiungere asset
            </h4>
            <ul className="list-disc pl-4 space-y-3 text-xs text-gray-700">
                <li>
                    <strong>Nuovo Acquisto (Scala Liquidità):</strong> Usalo quando compri qualcosa <em>oggi</em>. L'app scalerà i soldi dalla liquidità e creerà una transazione di spesa.
                </li>
                <li>
                    <strong>Già in Portafoglio (Storico):</strong> Usalo per il <em>setup iniziale</em> o per asset vecchi. Ti chiederà il Prezzo Medio (PMC) storico e <strong>non</strong> toccherà la liquidità.
                </li>
            </ul>
          </div>

          {/* 5. GESTIONE PAC */}
          <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
             <h4 className="font-bold text-gray-900 mb-1 text-sm">Gestione PAC (Piano Accumulo)</h4>
             <p className="text-xs text-gray-500 mb-3">
                 Per aggiungere nuove quote a un asset che possiedi già:
             </p>
             <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                 <ol className="list-decimal pl-4 space-y-2 text-xs text-blue-800 font-bold">
                     <li>Clicca sulla scheda dell'asset nella lista.</li>
                     <li>Premi il tasto blu "Compra Ancora".</li>
                     <li>Inserisci le nuove quote e l'importo speso.</li>
                 </ol>
             </div>
             <p className="text-[10px] mt-3 text-gray-400">
                 Il sistema ricalcolerà automaticamente il nuovo Prezzo Medio di Carico (PMC) ponderato.
             </p>
          </div>

          <hr className="border-gray-100"/>

          {/* 6. AGGIORNAMENTO PREZZI (NUOVA SEZIONE) */}
          <div>
             <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2 text-sm">
                <RefreshCw className="w-4 h-4 text-blue-600"/>
                Aggiornamento Prezzi
             </h4>
             <p className="text-xs text-gray-600 leading-relaxed">
                 È possibile forzare l'aggiornamento dei prezzi di mercato di tutti gli asset (con tracking attivo) cliccando l'icona <strong>Refresh</strong> (frecce circolari) situata in alto a destra nella pagina Investimenti.
             </p>
             <p className="text-[10px] mt-2 text-orange-600 font-bold bg-orange-50 p-2 rounded-lg inline-block border border-orange-100">
                 Nota: Questa funzione è disponibile 1 volta ogni ora.
             </p>
          </div>

        </div>
      )
    },
    {
      id: 'buckets',
      title: 'Salvadanai e Logica a Cascata',
      icon: PiggyBank,
      color: 'text-pink-600',
      bg: 'bg-pink-50',
      content: (
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            I <strong>Salvadanai</strong> (Buckets) servono per accantonare denaro per obiettivi specifici (es. "Fondo Emergenza", "Tasse", "Viaggi").
          </p>
          <h4 className="font-bold text-gray-900 mt-2">La "Divisione Automatica"</h4>
          <p>
            Quando inserisci un'<strong>Entrata</strong>, puoi attivare la spunta "Divisione Automatica". Il sistema distribuirà i soldi nei salvadanai in base alle percentuali (%) che hai impostato.
          </p>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
            <p className="font-bold text-gray-500 uppercase mb-1">Logica "Waterfalls" (Cascata):</p>
            <p>Se un salvadanaio ha un <strong>Target</strong> ed è pieno (100%), l'app è intelligente: non mette più soldi lì, ma ridistribuisce l'eccedenza sugli altri salvadanai non ancora pieni, riempiendoli più velocemente.</p>
          </div>
        </div>
      )
    },
    {
      id: 'transactions',
      title: 'Transazioni e Categorie',
      icon: ArrowRightLeft,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      content: (
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            Puoi registrare tre tipi di movimenti:
          </p>
          <ul className="list-disc pl-4 space-y-2">
            <li><span className="text-emerald-600 font-bold">Entrate:</span> Stipendi, fatture incassate. Attivano la cascata dei salvadanai.</li>
            <li><span className="text-rose-600 font-bold">Uscite:</span> Spese quotidiane. Puoi indicare se hai pagato usando la Liquidità principale o attingendo da uno specifico Salvadanaio.</li>
            <li><span className="text-blue-600 font-bold">Transfer:</span> Spostamenti di denaro interni. (Es. Sposti 500€ dalla Liquidità al conto Investimenti).</li>
          </ul>
          <p className="text-xs text-gray-400 mt-2">
              Vai nelle <strong>Impostazioni</strong> per personalizzare le Categorie e creare Sottocategorie.
          </p>
        </div>
      )
    },
    {
      id: 'categories',
      title: 'Categorie e Budget',
      icon: PieChart,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      content: (
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            Nella sezione <strong>Impostazioni</strong> puoi creare la tua struttura di categorie.
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Gerarchia:</strong> Puoi creare categorie principali (es. "Casa") e sottocategorie (es. "Affitto", "Bollette").</li>
            <li><strong>Budget:</strong> Puoi impostare un tetto di spesa mensile. L'app ti avviserà se stai per sforare o se hai superato il limite.</li>
          </ul>
          <p className="text-xs italic bg-yellow-50 p-2 rounded-lg text-yellow-700 border border-yellow-100">
            Suggerimento: Usa il tasto di riordinamento (frecce) nelle Impostazioni per organizzare le categorie trascinandole (Drag & Drop) nell'ordine che preferisci.
          </p>
        </div>
      )
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* HEADER STICKY */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Guida all'Uso</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        
        {/* Intro Card */}
        <div 
            className="p-6 rounded-2xl text-white shadow-lg relative overflow-hidden"
            style={{ backgroundColor: primaryColor }}
        >
            <div className="relative z-10">
                <h2 className="text-lg font-bold mb-2">Hai dubbi?</h2>
                <p className="text-sm opacity-90 leading-relaxed">
                    Ecco una raccolta di guide rapide per sfruttare al massimo le potenzialità dell'app, dall'automazione dei risparmi al tracciamento avanzato degli investimenti.
                </p>
            </div>
            {/* Decorazione */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
        </div>

        {/* Accordion Sections */}
        <div className="space-y-3">
            {sections.map((section) => {
                const isOpen = openSection === section.id
                return (
                    <div 
                        key={section.id} 
                        className={cn(
                            "bg-white rounded-2xl border transition-all duration-300 overflow-hidden",
                            isOpen ? "border-blue-100 shadow-md ring-1 ring-blue-50" : "border-gray-100 shadow-sm"
                        )}
                    >
                        <button 
                            onClick={() => toggleSection(section.id)}
                            className="w-full flex items-center justify-between p-4 text-left active:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn("p-2 rounded-xl", section.bg)}>
                                    <section.icon className={cn("w-5 h-5", section.color)} />
                                </div>
                                <span className="font-bold text-gray-900 text-sm">{section.title}</span>
                            </div>
                            {isOpen ? (
                                <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                                <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                        </button>
                        
                        {/* Contenuto Espandibile */}
                        <div 
                            className={cn(
                                "transition-all duration-300 ease-in-out",
                                // Aumentato a 2000px per evitare troncamenti su mobile
                                isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                            )}
                        >
                            <div className="px-4 pb-5 pt-0 border-t border-gray-50 mt-1">
                                <div className="pt-4">
                                    {section.content}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-gray-400 pt-4">
            v1.1.0 &bull; Developed by Stanislao Lombardo
        </p>

      </div>
    </div>
  )
}