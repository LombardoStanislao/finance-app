# Personal Finance Tracker PWA - Context Handoff

## Panoramica del Progetto
Questo documento serve come "ponte di contesto" per autorizzare l'agente a riprendere lo sviluppo da un altro account mantenendo il 100% della memoria storica del progetto.
L'applicazione è un gestore di finanza personale avanzato (Personal Finance Tracker) ottimizzato per il web (PWA), con enfasi su UI/UX ultra-moderna (stile Glassmorphism, master-details UI view) e perfetto rigore matematico sui calcoli contabili.

## Stack Tecnologico
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Recharts, Lucide React.
- **Backend/DB:** Supabase (PostgreSQL), Row Level Security (RLS) attive.
- **Hosting/PWA:** Vite PWA Plugin configurato (Workbox, manifest generato).
- **Compilazione:** 100% Zero Type Errors Strict.

## Architettura e Modelli Dati (Supabase DDL)
Il sistema poggia sulle seguenti interfacce principali (`src/lib/supabase.ts`):
- `profiles`: Gestione utente, configurazione tasse P.IVA (INPS, imposta sostitutiva, ecc.) e rate-limiting API.
- `buckets`: Salvadanai virtuali. Possiedono concetti logici di `current_balance` e auto-distribuzione fondi (`distribution_percentage`).
- `categories`: Categorie di spesa/entrata, supportano l'annidamento gerarchico ricorsivo (parent/child) e un field di rank per il drag&drop.
- `transactions`: Singole transazioni. Campi chiave: `type` (income, expense, transfer, initial), `amount`, `category_id`, `bucket_id`, `is_recurring`.
- `investments`: Asset finanziari con query `ticker` symbol e bilanciamento dei profitti virtuali/irreali.
- `recurring_transactions`: Template procedurali per le spese ricorrenti. Regole: `daily`, `weekly`, `monthly`, `yearly`.

## Riepilogo Globale (Le 5 Fasi appena Concluse)

Recentemente è stata intrapresa una refactoring massiva su 5 Fasi per estirpare bug matematici "silenziosi", ridisegnare da zero il modulo Statistiche ed evitare dipendenze cloud backend e costi extra:

1. **Fase 1/2 (Fix Ghost Transfers & Double-Drains):**
  * Risolto il *Double-drain Bug*: spese associate ad un bucket scalavano la Liquidità Totale due volte perché le logiche matematiche della DB sovrapponevano il calcolo. È stata scritta un'utility centralizzata `calculateLiquidity(transactions)` per filtrare/escludere le detrazioni incrociate.
  * Risolto il problema del *Net-Worth storico*: Sostituito con una filosofia di iterazione "True Book Value", partendo da 26 anni fa per garantire che la curva si congiunga chirurgicamente ai possedimenti netti finali odierni.

2. **Fase 3/4 (Dashboard & Statistics UX Overhaul):**
  * Eliminati chart ingombranti a favore del **Recursive Master-Detail pattern**: Toccando una bolla della categoria appare una bottom-sheet list che naviga tra le figlie, cliccabili a loro volta in profondità.
  * Fix bizzarro del calendario di Postgres: Supabase convertiva lo shift di UTC+2 `gte('2026-03-31T22:00:00Z')` troncandolo nel Date Type su giorno 31, inglobando pezzi di un mese precedente come somma nei grafici attuali. Risolto stringendo format su *strict strings YYYY-MM-DD*.
  * Creata l'interfaccia "Smart Horizontal Bar" progressiva che ha rimpiazzato i vuoti BarChart sul check del Mese Singolo.

3. **Fase 5 (Spese Ricorrenti & Lazy Evaluator):**
  * Bypassato `pg_cron`. Tutto avviene Serverless.
  * Iniettato `RecurringEvaluator.tsx` sopra l'App router: uno script silente basato sul layer React. Quando logghi `lte('next_date', today)`, l'Evaluator recupera tutte le rate mensili in scadenza, ri-emette iterativamente decurtando/foraggiando i bucket se configurati, popola lo stream e sposta dinamicamente i `next_date` sul db, proteggendoti anche in caso di 6 mesi di letargo dell'app. Switch d'innesco UI incollato in `TransactionForm.tsx`.

## Prossimi Passi
- Consegnare questo MD al prossimo assistente. L'assistente è pronto per implementare future patch grafiche (estendere Smart bar) su totale serenità backend.
