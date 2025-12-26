-- Migration: Add Buckets and Investments System
-- Run these SQL commands in your Supabase SQL Editor

-- PART 1: Update buckets table
ALTER TABLE buckets 
ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS distribution_percentage NUMERIC DEFAULT 0 NOT NULL;

-- PART 2: Create investments table
CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ETF', 'Obbligazioni', 'Azioni', 'Conto Deposito', 'Crypto', 'Altro')),
  current_value NUMERIC NOT NULL DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on investments
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own investments
CREATE POLICY "Users can view own investments" ON investments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own investments" ON investments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own investments" ON investments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own investments" ON investments
  FOR DELETE USING (auth.uid() = user_id);

-- PART 3: Update transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS bucket_id UUID REFERENCES buckets(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_bucket_id ON transactions(bucket_id);
CREATE INDEX IF NOT EXISTS idx_investments_user_id ON investments(user_id);

-- Add comment for documentation
COMMENT ON COLUMN buckets.current_balance IS 'Current balance in this bucket';
COMMENT ON COLUMN buckets.distribution_percentage IS 'Percentage of income to auto-distribute to this bucket (0-100)';
COMMENT ON COLUMN transactions.bucket_id IS 'If set, this expense was paid from this bucket. NULL means unassigned liquidity.';

