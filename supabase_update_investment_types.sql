-- Migration: Update Investment Types to Italian
-- Run this SQL if you already created the investments table with English types

-- Drop the existing constraint
ALTER TABLE investments DROP CONSTRAINT IF EXISTS investments_type_check;

-- Add new constraint with Italian values
ALTER TABLE investments 
ADD CONSTRAINT investments_type_check 
CHECK (type IN ('ETF', 'Obbligazioni', 'Azioni', 'Conto Deposito', 'Crypto', 'Altro'));

-- Optional: Update existing records if you have any
-- Uncomment and modify these if you need to migrate existing data:
-- UPDATE investments SET type = 'Obbligazioni' WHERE type = 'Bond';
-- UPDATE investments SET type = 'Azioni' WHERE type = 'Stock';
-- UPDATE investments SET type = 'Conto Deposito' WHERE type = 'Deposit';

