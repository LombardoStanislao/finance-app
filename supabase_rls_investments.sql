-- RLS Policy for Investments Table
-- Run this in Supabase SQL Editor if investments SELECT policy is missing

-- Ensure RLS is enabled
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

-- Create SELECT policy if it doesn't exist
CREATE POLICY IF NOT EXISTS "Users can view own investments" 
ON investments 
FOR SELECT 
USING (auth.uid() = user_id);

-- Verify policies exist
SELECT * FROM pg_policies WHERE tablename = 'investments';

