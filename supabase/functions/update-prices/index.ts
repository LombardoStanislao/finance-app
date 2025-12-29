// supabase/functions/update-prices/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Funzione Helper per scaricare il prezzo da Endpoint Chart (V8) - Più robusto contro errori 401
async function fetchPrice(symbol: string) {
  // Usiamo l'endpoint CHART invece di QUOTE perché richiede meno validazione cookie
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    }
  });

  if (!res.ok) {
    throw new Error(`Yahoo API Error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const result = data.chart?.result?.[0];

  if (!result || !result.meta) {
    return null;
  }

  return {
    price: result.meta.regularMarketPrice,
    name: result.meta.longName || result.meta.shortName || result.meta.symbol,
    symbol: result.meta.symbol
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    const body = await req.json().catch(() => ({}))
    const { symbol } = body

    // --- MODO B: SINGLE LOOKUP (Aggiunta Asset) ---
    if (symbol) {
      console.log(`Checking single ticker (V8): ${symbol}`)
      try {
        const data = await fetchPrice(symbol);

        if (!data) {
          return new Response(JSON.stringify({ error: `Ticker '${symbol}' non trovato` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404
          })
        }

        console.log(`Found: ${data.price} for ${data.symbol}`);

        return new Response(JSON.stringify({
          success: true,
          price: data.price,
          name: data.name
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (err: any) {
        console.error(`Single fetch error: ${err.message}`);
        return new Response(JSON.stringify({ error: 'Errore nel recupero dati da Yahoo' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        })
      }
    }

    // --- MODO A: BATCH UPDATE (Aggiornamento Portafoglio) ---
    // 1. Rate Limiting
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('last_api_call')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.last_api_call) {
      const lastCall = new Date(profile.last_api_call).getTime()
      const now = new Date().getTime()
      const diffMins = (now - lastCall) / 60000
      if (diffMins < 59) {
        return new Response(JSON.stringify({ message: 'Cooldown active', minutes: 60 - diffMins }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 429
        })
      }
    }

    // 2. Recupera Asset
    const { data: investments } = await supabaseClient
      .from('investments')
      .select('id, ticker, quantity')
      .eq('user_id', user.id)
      .eq('is_automated', true)
      .not('ticker', 'is', null)

    if (!investments || investments.length === 0) {
      return new Response(JSON.stringify({ message: 'No automated investments found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Esegui richieste in parallelo (Endpoint V8 non supporta bene il batch con virgola)
    console.log(`Updating ${investments.length} assets...`);

    let updatedCount = 0;

    // Usiamo Promise.all per velocità
    const updatePromises = investments.map(async (inv) => {
      try {
        const data = await fetchPrice(inv.ticker!);
        if (data && data.price !== undefined && inv.quantity) {
          const newValue = data.price * inv.quantity;
          await supabaseClient
            .from('investments')
            .update({ current_value: newValue })
            .eq('id', inv.id);
          return true;
        }
      } catch (err) {
        console.error(`Error updating ${inv.ticker}:`, err);
      }
      return false;
    });

    const results = await Promise.all(updatePromises);
    updatedCount = results.filter(Boolean).length;

    // 4. Update Profile Timestamp
    await supabaseClient.from('profiles').upsert({ id: user.id, last_api_call: new Date().toISOString() })

    return new Response(JSON.stringify({ success: true, updated: updatedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('CRITICAL ERROR:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})