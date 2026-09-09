-- SPAREZY V2 — CUSTOMER KHATABOOK + STARTING OUTSTANDING ADDITIVE MIGRATION

-- 1. ADD COLUMNS TO public.customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS starting_outstanding NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS current_outstanding NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_sales NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_payments NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_returns NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

-- 2. UPDATE CATEGORY CONSTRAINT TO ALLOW 'Direct Customer' AND KEEP BACKWARD COMPATIBILITY
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_customer_category_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_customer_category_check 
    CHECK (customer_category IN ('Walk-in', 'Mistri', 'Retailer', 'Garage', 'Direct Customer'));

-- 3. CREATE CUSTOMER PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'UPI', 'Bank')),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. CREATE CUSTOMER CHRONOLOGICAL LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    brand TEXT CHECK (brand IN ('Hyundai', 'Mahindra')),
    tx_type TEXT NOT NULL CHECK (tx_type IN ('Opening Balance', 'Sale', 'Payment', 'Return')),
    tx_id UUID, -- Points to the sale_id, return_id, or customer_payments.id
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL, -- Positive increases outstanding, Negative decreases outstanding
    payment_method TEXT CHECK (payment_method IN ('Cash', 'UPI', 'Bank')),
    reference_no TEXT,
    tx_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. INDEXES FOR PERFORMANCE AND LOW-EGRESS SEARCHES
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON public.customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON public.customer_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_date ON public.customer_ledger(tx_date DESC);
CREATE INDEX IF NOT EXISTS idx_customers_search_name_phone ON public.customers(customer_name, phone);

-- 6. RLS POLICIES FOR SECURE ROLE-BASED ACCESS (OWNER FULL ACCESS, MANAGER NO ACCESS)
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_full_control_payments ON public.customer_payments;
CREATE POLICY owner_full_control_payments ON public.customer_payments 
    FOR ALL 
    USING (public.is_owner());

DROP POLICY IF EXISTS owner_full_control_ledger ON public.customer_ledger;
CREATE POLICY owner_full_control_ledger ON public.customer_ledger 
    FOR ALL 
    USING (public.is_owner());
