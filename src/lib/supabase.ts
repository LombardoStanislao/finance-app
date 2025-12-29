import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface Transaction {
  id: string
  user_id: string
  amount: number
  category_id: string | null
  date: string
  description: string | null
  is_work_related: boolean
  is_recurring: boolean
  type: 'income' | 'expense' | 'transfer' | 'initial'
  bucket_id: string | null
  investment_id: string | null
  created_at: string
  updated_at?: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  budget_limit: number | null
  parent_id: string | null
  type: 'income' | 'expense'
  rank?: number // Aggiunto per il Drag & Drop
  created_at: string
}

export interface Bucket {
  id: string
  user_id: string
  name: string
  allocation_percentage?: number
  current_amount?: number
  current_balance: number
  distribution_percentage: number
  target_amount?: number
  created_at: string
  updated_at?: string
}

export interface Investment {
  id: string
  user_id: string
  name: string | null
  type: 'ETF' | 'Obbligazioni' | 'Azioni' | 'Conto Deposito' | 'Crypto' | 'Altro'
  current_value: number
  created_at: string
  updated_at?: string
  // NUOVI CAMPI per automazione
  ticker?: string | null
  quantity?: number | null
  is_automated?: boolean
}

// NUOVA INTERFACCIA PROFILO (Per il Rate Limiting delle API)
export interface Profile {
  id: string
  last_api_call: string | null
  updated_at: string
}