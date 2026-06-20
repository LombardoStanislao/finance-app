-- Esegui questo script nel SQL Editor del tuo pannello Supabase

-- 1. Funzione per eseguire operazioni finanziarie atomiche
-- Questa funzione accetta array JSON per:
-- - p_transactions_insert: transazioni da inserire
-- - p_transactions_update: transazioni da aggiornare (richiede id)
-- - p_transactions_delete: array di ID di transazioni da eliminare
-- - p_bucket_updates: aggiornamenti (incrementi/decrementi) dei saldi salvadanai
-- Entrambi vengono eseguiti in un'unica transazione (BEGIN...COMMIT implicito).
-- Se cade la connessione o fallisce qualcosa, nulla viene salvato, preservando l'integrità.

CREATE OR REPLACE FUNCTION execute_financial_operations(
  p_transactions_insert JSONB DEFAULT '[]'::JSONB,
  p_transactions_update JSONB DEFAULT '[]'::JSONB,
  p_transactions_delete JSONB DEFAULT '[]'::JSONB,
  p_bucket_updates JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB AS $$
DECLARE
  t JSONB;
  b JSONB;
  v_user_id UUID;
  v_inserted_ids JSONB := '[]'::JSONB;
  v_new_id UUID;
BEGIN
  -- Recupera l'ID dell'utente autenticato
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utente non autenticato';
  END IF;

  -- 1. Aggiorna i saldi dei salvadanai
  FOR b IN SELECT * FROM jsonb_array_elements(p_bucket_updates)
  LOOP
    UPDATE buckets
    SET current_balance = current_balance + (b->>'amount_change')::NUMERIC
    WHERE id = (b->>'bucket_id')::UUID AND user_id = v_user_id;
  END LOOP;

  -- 2. Elimina le transazioni
  FOR t IN SELECT * FROM jsonb_array_elements_text(p_transactions_delete)
  LOOP
    DELETE FROM transactions
    WHERE id = t::UUID AND user_id = v_user_id;
  END LOOP;

  -- 3. Aggiorna le transazioni
  FOR t IN SELECT * FROM jsonb_array_elements(p_transactions_update)
  LOOP
    UPDATE transactions SET
      amount = (t->>'amount')::NUMERIC,
      type = t->>'type',
      category_id = NULLIF(t->>'category_id', '')::UUID,
      bucket_id = NULLIF(t->>'bucket_id', '')::UUID,
      description = t->>'description',
      date = (t->>'date')::TIMESTAMP WITH TIME ZONE
    WHERE id = (t->>'id')::UUID AND user_id = v_user_id;
  END LOOP;

  -- 4. Inserisci le transazioni
  FOR t IN SELECT * FROM jsonb_array_elements(p_transactions_insert)
  LOOP
    INSERT INTO transactions (
      user_id, 
      amount, 
      type, 
      category_id, 
      bucket_id, 
      description, 
      date, 
      is_work_related, 
      is_recurring,
      created_at
    ) VALUES (
      v_user_id,
      (t->>'amount')::NUMERIC,
      t->>'type',
      NULLIF(t->>'category_id', '')::UUID,
      NULLIF(t->>'bucket_id', '')::UUID,
      t->>'description',
      (t->>'date')::TIMESTAMP WITH TIME ZONE,
      COALESCE((t->>'is_work_related')::BOOLEAN, false),
      COALESCE((t->>'is_recurring')::BOOLEAN, false),
      COALESCE((t->>'created_at')::TIMESTAMP WITH TIME ZONE, NOW())
    ) RETURNING id INTO v_new_id;
    
    v_inserted_ids := v_inserted_ids || jsonb_build_object('id', v_new_id);
  END LOOP;

  RETURN jsonb_build_object('inserted_transactions', v_inserted_ids);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Assegna i permessi
GRANT EXECUTE ON FUNCTION execute_financial_operations(JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- Commento di documentazione
COMMENT ON FUNCTION execute_financial_operations IS 'Esegue operazioni CRUD finanziarie multiple e aggiornamenti di salvadanai in modo puramente atomico.';
