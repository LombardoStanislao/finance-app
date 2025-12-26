import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types (adjust based on your actual schema)
export interface Transaction {
  id: string
  amount: number
  category_id: string
  date: string
  description: string | null
  is_work_related: boolean
  is_recurring: boolean
  type: 'income' | 'expense' | 'transfer'
  bucket_id: string | null
  investment_id: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  budget_limit: number | null
  parent_id: string | null
  type: 'income' | 'expense'
  created_at: string
}

export interface Bucket {
  id: string
  name: string
  allocation_percentage: number
  current_amount: number
  current_balance: number
  distribution_percentage: number
  created_at: string
  updated_at: string
}

export interface Investment {
  id: string
  user_id: string
  type: 'ETF' | 'Obbligazioni' | 'Azioni' | 'Conto Deposito' | 'Crypto' | 'Altro'
  current_value: number
  last_updated: string
  created_at: string
  updated_at: string
}

export interface Asset {
  id: string
  type: 'liquidity' | 'btp' | 'etf' | 'crypto'
  name: string
  value: number
  updated_at: string
}

