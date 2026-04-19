import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { type Transaction } from './supabase'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function calculateLiquidity(transactions: Transaction[]): number {
  return transactions.reduce((sum, t) => {
    // Le spese fatte DAI SALVADANAI non diminuiscono di nuovo la liquidità del conto
    // Protezione "Ghost": anche se un salvadanaio è stato eliminato e bucket_id è null, guardiamo is_from_bucket
    const isBucketExpense = (t.bucket_id !== null && t.bucket_id !== undefined) || t.is_from_bucket === true;
    
    if (t.type === 'expense' && isBucketExpense) return sum;
    return sum + (Number(t.amount) || 0);
  }, 0);
}
