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
    // I trasferimenti da/verso i salvadanai (inclusi quelli orfani senza bucket_id) 
    // NON diminuiscono né aumentano la liquidità, perché i salvadanai FANNO PARTE della liquidità.
    // L'unica eccezione sono gli investimenti (che muovono soldi fuori dalla liquidità).
    if (t.type === 'transfer' && !t.investment_id) return sum;

    // Le spese (anche quelle dai salvadanai) e le entrate normali influiscono sul saldo totale.
    return sum + (Number(t.amount) || 0);
  }, 0);
}

/**
 * Arrotondamento valuta centralizzato — 2 decimali, safe per floating-point.
 * Usa la tecnica EPSILON per evitare errori come 1.255.toFixed(2) === "1.25".
 */
export function roundCurrency(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Parser aritmetico safe — sostituzione di new Function()/eval().
 * Supporta solo: numeri decimali e operatori +, -, *, /
 * Gestisce correttamente numeri negativi in posizione iniziale (es. "-5+3").
 * Restituisce 0 per espressioni malformate o non numeriche.
 *
 * Grammatica (Recursive Descent):
 *   expression = term (('+' | '-') term)*
 *   term       = factor (('*' | '/') factor)*
 *   factor     = NUMBER | '(' expression ')' | ('+' | '-') factor
 */
export function safeEvaluate(input: string): number {
  // Rimuovi spazi e caratteri non ammessi
  const sanitized = input.replace(/\s/g, '')

  // Rifiuta stringa vuota o con caratteri non consentiti
  if (!sanitized || !/^[0-9+\-*/.()]+$/.test(sanitized)) return 0

  let pos = 0

  function peek(): string {
    return sanitized[pos] || ''
  }

  function consume(): string {
    return sanitized[pos++]
  }

  function parseNumber(): number {
    let numStr = ''
    // Gestisci punto decimale iniziale (es. ".5")
    while (pos < sanitized.length && (/[0-9]/.test(peek()) || peek() === '.')) {
      numStr += consume()
    }
    if (numStr === '' || numStr === '.') return NaN
    return parseFloat(numStr)
  }

  function parseFactor(): number {
    // Unary + o -
    if (peek() === '+') {
      consume()
      return parseFactor()
    }
    if (peek() === '-') {
      consume()
      return -parseFactor()
    }
    // Parentesi
    if (peek() === '(') {
      consume() // '('
      const result = parseExpression()
      if (peek() === ')') consume() // ')'
      return result
    }
    // Numero
    return parseNumber()
  }

  function parseTerm(): number {
    let left = parseFactor()
    while (peek() === '*' || peek() === '/') {
      const op = consume()
      const right = parseFactor()
      if (op === '*') left = left * right
      else if (right !== 0) left = left / right
      else return 0 // Divisione per zero → 0
    }
    return left
  }

  function parseExpression(): number {
    let left = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = consume()
      const right = parseTerm()
      if (op === '+') left = left + right
      else left = left - right
    }
    return left
  }

  try {
    const result = parseExpression()
    if (!Number.isFinite(result)) return 0
    return roundCurrency(result)
  } catch {
    return 0
  }
}

