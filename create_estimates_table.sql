-- ====================================================================
-- SPAREZY MIS - ESTIMATE MAKER (QUOTATIONS) SUPABASE TABLE SETUP
-- How to apply:
-- 1. Open your Supabase Project Dashboard (https://supabase.com/dashboard)
-- 2. Click on "SQL Editor" in the left sidebar
-- 3. Click "New Query", paste this entire script, and click "Run" (Ctrl+Enter)
-- ====================================================================

-- 1. Create the Estimates Table
CREATE TABLE IF NOT EXISTS public.estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_no TEXT UNIQUE NOT NULL,
    brand TEXT NOT NULL CHECK (brand IN ('Hyundai', 'Mahindra')),
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_category TEXT NOT NULL CHECK (customer_category IN ('Mistri', 'Garage', 'Walk-in', 'Retailer')),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    discount_amount NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Converted to Bill', 'Cancelled')),
    converted_sale_id TEXT,
    converted_invoice_no TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Indexes for instant searching & performance
CREATE INDEX IF NOT EXISTS idx_estimates_brand ON public.estimates (brand);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON public.estimates (status);
CREATE INDEX IF NOT EXISTS idx_estimates_created_at ON public.estimates (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_customer_name ON public.estimates (customer_name);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Allow all operations for authenticated and anonymous users
DROP POLICY IF EXISTS "Allow all on estimates for authenticated and anon" ON public.estimates;
CREATE POLICY "Allow all on estimates for authenticated and anon"
ON public.estimates
FOR ALL
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- 5. Grant access permissions to Supabase roles
GRANT ALL ON TABLE public.estimates TO authenticated, anon, service_role;

-- 6. Enable Realtime Replication for estimates table (Optional but recommended)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.estimates;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Ignore if already added or publication missing
END $$;
