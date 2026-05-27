import { useEffect, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export default function RecurringEvaluator({ session }: { session: Session | null }) {
    const evaluateComplete = useRef(false) // Previene le doppie chiamate dello Strict Mode di React

    useEffect(() => {
        if (!session || evaluateComplete.current) return

        async function evaluateRecurrences() {
            try {
                // BUG FIX TIMEZONE: Prendi la data locale
                const localD = new Date()
                const today = `${localD.getFullYear()}-${String(localD.getMonth() + 1).padStart(2, '0')}-${String(localD.getDate()).padStart(2, '0')}`

                const { data: recs, error } = await supabase
                    .from('recurring_transactions')
                    .select('*')
                    .eq('user_id', session!.user.id)
                    .eq('is_active', true)
                    .lte('next_date', today)

                if (error) throw error
                if (!recs || recs.length === 0) return

                for (const rec of recs) {
                    let currentDateStr = rec.next_date
                    let iterations = 0
                    let txDatesToInsert: string[] = []

                    // Fase 1: DRY RUN (Raccogliamo i salti e cerchiamo la finalNextDate)
                    while (currentDateStr <= today && iterations < 365) {
                        
                        if (rec.end_date && currentDateStr > rec.end_date) {
                            // Se la prossima esecuzione scavalca la fine, fermiamo il ciclo
                            break;
                        }

                        iterations++
                        txDatesToInsert.push(currentDateStr)

                        // Mantenere i calcoli con data locale usando new Date(year, monthIndex, day)
                        const [y, m, d] = currentDateStr.split('-').map(Number)
                        const dateObj = new Date(y, m - 1, d)

                        if (rec.recurrence_rule === 'daily') {
                            dateObj.setDate(dateObj.getDate() + 1)
                        } else if (rec.recurrence_rule === 'weekly') {
                            dateObj.setDate(dateObj.getDate() + 7)
                        } else if (rec.recurrence_rule === 'monthly') {
                            dateObj.setMonth(dateObj.getMonth() + 1)
                        } else if (rec.recurrence_rule === 'yearly') {
                            dateObj.setFullYear(dateObj.getFullYear() + 1)
                        }

                        currentDateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`
                    }

                    const finalNextDateStr = currentDateStr
                    const isNowExpired = rec.end_date && finalNextDateStr > rec.end_date

                    // Se non ci sono transazioni da inserire e non è neppure scaduta, skippa (caso anomalo)
                    if (txDatesToInsert.length === 0 && !isNowExpired) continue

                    // Fase 2: ATOMIC LOCKING
                    // Aggiorniamo 'next_date' e disattiviamo se abbiamo splafonato 'end_date'
                    const payload: any = { next_date: finalNextDateStr }
                    if (isNowExpired) payload.is_active = false

                    const { data: lockedRec, error: lockErr } = await supabase
                        .from('recurring_transactions')
                        .update(payload)
                        .eq('id', rec.id)
                        .eq('next_date', rec.next_date)
                        .select()
                        .maybeSingle()

                    if (lockErr || !lockedRec) {
                        // Un client parallelo ci ha anticipato
                        continue
                    }

                    // Fase 3: ESECUZIONE (Sicuri di non sdoppiare le tuple)
                    for (const txDateStr of txDatesToInsert) {
                        
                        // Manipolazione Salvadanai
                        if (rec.type === 'expense' && rec.bucket_id) {
                            const { data: buck } = await supabase.from('buckets').select('current_balance').eq('id', rec.bucket_id).single()
                            if (buck) {
                                const newBalance = Number((Math.max(0, (buck.current_balance || 0) - Math.abs(rec.amount))).toFixed(2))
                                await supabase.from('buckets').update({ current_balance: newBalance }).eq('id', rec.bucket_id).eq('user_id', user.id)
                            }
                        }

                        if (rec.type === 'income' && rec.bucket_id) {
                            const { data: buck } = await supabase.from('buckets').select('current_balance').eq('id', rec.bucket_id).single()
                            if (buck) {
                                const newBalance = Number(((buck.current_balance || 0) + Math.abs(rec.amount)).toFixed(2))
                                await supabase.from('buckets').update({ current_balance: newBalance }).eq('id', rec.bucket_id).eq('user_id', user.id)
                            }
                        }

                        const finalAmount = rec.type === 'expense' ? -Math.abs(rec.amount) : Math.abs(rec.amount)

                        // Il txDate (stringa locale YYYY-MM-DD) convertita in ISO preservando orari safe (mezzogiorno) evita disallineamenti db in order by date.
                        const [y, m, d] = txDateStr.split('-').map(Number)
                        const safeIsoDate = new Date(y, m - 1, d, 12, 0, 0).toISOString()

                        await supabase.from('transactions').insert({
                            user_id: session!.user.id,
                            amount: finalAmount,
                            type: rec.type,
                            category_id: rec.category_id,
                            bucket_id: rec.bucket_id,
                            description: rec.description || 'Transazione Ricorrente',
                            date: safeIsoDate, 
                            is_recurring: true
                        })
                    }
                }
            } catch (e) {
                console.error("Errore elaboratore spese ricorrenti:", e)
            }
        }

        evaluateRecurrences()
        evaluateComplete.current = true
    }, [session])

    return null
}
