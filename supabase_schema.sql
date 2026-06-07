-- SPAREZY MIS DASHBOARD - SUPABASE DATABASE CONFIGURATION SQL
-- This script contains schemas, tables, indexes, and Row Level Security (RLS) policies 
-- for the public, hyundai, and mahindra private database groups.

-- ====================================================================
-- 1. SCHEMAS INITIALIZATION
-- ====================================================================
CREATE SCHEMA IF NOT EXISTS hyundai;
CREATE SCHEMA IF NOT EXISTS mahindra;

-- ====================================================================
-- 2. PUBLIC SCHEMA TABLES (User Management, Customers, Global Audits)
-- ====================================================================

-- User Management Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Owner', 'Manager')),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Disabled')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Customer ledger registration
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_category TEXT NOT NULL CHECK (customer_category IN ('Walk-in', 'Mistri', 'Retailer', 'Garage')),
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Global Transaction/Activity Audit Logging
CREATE TABLE IF NOT EXISTS public.transaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    user_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    module_name TEXT NOT NULL,
    description TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 3. BRAND SPECIFIC SCHEMA TABLES (Hyundai Schema Example)
-- ====================================================================

-- Hyundai Inventory Table
CREATE TABLE IF NOT EXISTS hyundai.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_no TEXT UNIQUE NOT NULL,
    part_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    hsn TEXT,
    mrp NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (mrp >= 0),
    brand TEXT NOT NULL DEFAULT 'Hyundai',
    is_active BOOLEAN NOT NULL DEFAULT true,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Hyundai Customer Sales Table
CREATE TABLE IF NOT EXISTS hyundai.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id),
    customer_name TEXT NOT NULL,
    customer_category TEXT NOT NULL,
    sale_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    discount_amount NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Pending', 'Custom Amount')),
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pending_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Hyundai Sales Line Items
CREATE TABLE IF NOT EXISTS hyundai.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES hyundai.sales(id) ON DELETE CASCADE,
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    mrp NUMERIC(12,2) NOT NULL,
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    final_amount NUMERIC(12,2) NOT NULL,
    returned_quantity INTEGER DEFAULT 0 CHECK (returned_quantity >= 0),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Hyundai Product Returns Register
CREATE TABLE IF NOT EXISTS hyundai.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES hyundai.sales(id),
    sale_item_id UUID REFERENCES hyundai.sale_items(id),
    customer_id UUID REFERENCES public.customers(id),
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    returned_quantity INTEGER NOT NULL CHECK (returned_quantity > 0),
    refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    return_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT NOT NULL
);

-- Hyundai Purchases Register
CREATE TABLE IF NOT EXISTS hyundai.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_name TEXT NOT NULL,
    invoice_no TEXT NOT NULL,
    invoice_date TIMESTAMPTZ NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    dealer_discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    discount_amount NUMERIC(12,2) DEFAULT 0.00,
    total_after_discount NUMERIC(12,2) NOT NULL,
    scan_source TEXT DEFAULT 'manual',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Hyundai Purchase Line Items
CREATE TABLE IF NOT EXISTS hyundai.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES hyundai.purchases(id) ON DELETE CASCADE,
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    hsn TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    mrp NUMERIC(12,2) NOT NULL,
    is_new_part BOOLEAN DEFAULT false,
    matched_inventory BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Hyundai Bulk Upload History
CREATE TABLE IF NOT EXISTS hyundai.bulk_update_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    update_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL,
    success_rows INTEGER NOT NULL,
    failed_rows INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    can_undo BOOLEAN DEFAULT true,
    backup_data_json JSONB
);

-- Hyundai MRP Price Adjustment History
CREATE TABLE IF NOT EXISTS hyundai.mrp_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_no TEXT NOT NULL,
    old_mrp NUMERIC(12,2) NOT NULL,
    new_mrp NUMERIC(12,2) NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ====================================================================
-- 4. BRAND SPECIFIC SCHEMA TABLES (Mahindra Schema Example)
-- ====================================================================

-- Mahindra Inventory Table
CREATE TABLE IF NOT EXISTS mahindra.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_no TEXT UNIQUE NOT NULL,
    part_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    hsn TEXT,
    mrp NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (mrp >= 0),
    brand TEXT NOT NULL DEFAULT 'Mahindra',
    is_active BOOLEAN NOT NULL DEFAULT true,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Mahindra Customer Sales Table
CREATE TABLE IF NOT EXISTS mahindra.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id),
    customer_name TEXT NOT NULL,
    customer_category TEXT NOT NULL,
    sale_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    discount_amount NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Pending', 'Custom Amount')),
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pending_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Mahindra Sales Line Items
CREATE TABLE IF NOT EXISTS mahindra.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES mahindra.sales(id) ON DELETE CASCADE,
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    mrp NUMERIC(12,2) NOT NULL,
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    final_amount NUMERIC(12,2) NOT NULL,
    returned_quantity INTEGER DEFAULT 0 CHECK (returned_quantity >= 0),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Mahindra Product Returns Register
CREATE TABLE IF NOT EXISTS mahindra.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES mahindra.sales(id),
    sale_item_id UUID REFERENCES mahindra.sale_items(id),
    customer_id UUID REFERENCES public.customers(id),
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    returned_quantity INTEGER NOT NULL CHECK (returned_quantity > 0),
    refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    return_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT NOT NULL
);

-- Mahindra Purchases Register
CREATE TABLE IF NOT EXISTS mahindra.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_name TEXT NOT NULL,
    invoice_no TEXT NOT NULL,
    invoice_date TIMESTAMPTZ NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    dealer_discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    discount_amount NUMERIC(12,2) DEFAULT 0.00,
    total_after_discount NUMERIC(12,2) NOT NULL,
    scan_source TEXT DEFAULT 'manual',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Mahindra Purchase Line Items
CREATE TABLE IF NOT EXISTS mahindra.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES mahindra.purchases(id) ON DELETE CASCADE,
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    hsn TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    mrp NUMERIC(12,2) NOT NULL,
    is_new_part BOOLEAN DEFAULT false,
    matched_inventory BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Mahindra Bulk Upload History
CREATE TABLE IF NOT EXISTS mahindra.bulk_update_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    update_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL,
    success_rows INTEGER NOT NULL,
    failed_rows INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    can_undo BOOLEAN DEFAULT true,
    backup_data_json JSONB
);

-- Mahindra MRP Price Adjustment History
CREATE TABLE IF NOT EXISTS mahindra.mrp_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_no TEXT NOT NULL,
    old_mrp NUMERIC(12,2) NOT NULL,
    new_mrp NUMERIC(12,2) NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 5. PERFORMANCE TUNING INDEXES (Requested fields for fast searching)
-- ====================================================================

-- Hyundai Performance Indexes
CREATE INDEX IF NOT EXISTS idx_hyundai_inventory_part_no ON hyundai.inventory (part_no);
CREATE INDEX IF NOT EXISTS idx_hyundai_sales_customer_id ON hyundai.sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_hyundai_sales_created_at ON hyundai.sales (created_at);
CREATE INDEX IF NOT EXISTS idx_hyundai_purchases_invoice_no ON hyundai.purchases (invoice_no);
CREATE INDEX IF NOT EXISTS idx_hyundai_purchases_dealer_name ON hyundai.purchases (dealer_name);

-- Mahindra Performance Indexes
CREATE INDEX IF NOT EXISTS idx_mahindra_inventory_part_no ON mahindra.inventory (part_no);
CREATE INDEX IF NOT EXISTS idx_mahindra_sales_customer_id ON mahindra.sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_mahindra_sales_created_at ON mahindra.sales (created_at);
CREATE INDEX IF NOT EXISTS idx_mahindra_purchases_invoice_no ON mahindra.purchases (invoice_no);
CREATE INDEX IF NOT EXISTS idx_mahindra_purchases_dealer_name ON mahindra.purchases (dealer_name);

-- Public Schema Indexes
CREATE INDEX IF NOT EXISTS idx_public_customers_created_at ON public.customers (created_at);
CREATE INDEX IF NOT EXISTS idx_public_logs_created_at ON public.transaction_logs (created_at);

-- ====================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

-- Enable RLS for all tables in all schemas
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_logs ENABLE ROW LEVEL SECURITY;

-- Hyundai Schema Tables
ALTER TABLE hyundai.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyundai.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyundai.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyundai.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyundai.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyundai.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyundai.bulk_update_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyundai.mrp_history ENABLE ROW LEVEL SECURITY;

-- Mahindra Schema Tables
ALTER TABLE mahindra.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahindra.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahindra.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahindra.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahindra.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahindra.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahindra.bulk_update_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahindra.mrp_history ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- RLS POLICIES FOR OWNER AND MANAGER ROLES
-- ====================================================================

-- --------------------------------------------------------------------
-- Security Definer Helpers to completely avoid stack overflow recursion on public.users
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE email = auth.jwt()->>'email' AND role = 'Owner' AND status = 'Active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE email = auth.jwt()->>'email' AND role = 'Manager' AND status = 'Active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_active_operator()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE email = auth.jwt()->>'email' AND status = 'Active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------
-- A. PUBLIC SCHEMA POLICIES
-- --------------------------------------------------

-- public.users Policies
DROP POLICY IF EXISTS user_self_read_write ON public.users;
CREATE POLICY user_self_read_write ON public.users
    FOR ALL
    USING (email = auth.jwt()->>'email');

DROP POLICY IF EXISTS owner_full_control_users ON public.users;
CREATE POLICY owner_full_control_users ON public.users 
    FOR ALL 
    USING (public.is_owner());

DROP POLICY IF EXISTS manager_select_users ON public.users;
CREATE POLICY manager_select_users ON public.users 
    FOR SELECT 
    USING (public.is_active_operator());

-- public.customers Policies
DROP POLICY IF EXISTS owner_full_control_customers ON public.customers;
CREATE POLICY owner_full_control_customers ON public.customers 
    FOR ALL 
    USING (public.is_owner());

DROP POLICY IF EXISTS manager_full_control_customers ON public.customers;
CREATE POLICY manager_full_control_customers ON public.customers 
    FOR ALL 
    USING (public.is_manager());

-- public.transaction_logs Policies
DROP POLICY IF EXISTS owner_full_control_logs ON public.transaction_logs;
CREATE POLICY owner_full_control_logs ON public.transaction_logs 
    FOR ALL 
    USING (public.is_owner());

DROP POLICY IF EXISTS manager_insert_logs ON public.transaction_logs;
CREATE POLICY manager_insert_logs ON public.transaction_logs 
    FOR INSERT 
    WITH CHECK (public.is_active_operator());

-- --------------------------------------------------
-- B. HYUNDAI SCHEMA POLICIES
-- --------------------------------------------------

-- hyundai.inventory Policies
DROP POLICY IF EXISTS hyundai_inventory_owner_policy ON hyundai.inventory;
CREATE POLICY hyundai_inventory_owner_policy ON hyundai.inventory 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS hyundai_inventory_manager_policy ON hyundai.inventory;
CREATE POLICY hyundai_inventory_manager_policy ON hyundai.inventory 
    FOR ALL USING (public.is_manager());

-- hyundai.sales Policies
DROP POLICY IF EXISTS hyundai_sales_owner_policy ON hyundai.sales;
CREATE POLICY hyundai_sales_owner_policy ON hyundai.sales 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS hyundai_sales_manager_policy ON hyundai.sales;
CREATE POLICY hyundai_sales_manager_policy ON hyundai.sales 
    FOR ALL USING (public.is_manager());

-- hyundai.sale_items Policies
DROP POLICY IF EXISTS hyundai_sale_items_owner_policy ON hyundai.sale_items;
CREATE POLICY hyundai_sale_items_owner_policy ON hyundai.sale_items 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS hyundai_sale_items_manager_policy ON hyundai.sale_items;
CREATE POLICY hyundai_sale_items_manager_policy ON hyundai.sale_items 
    FOR ALL USING (public.is_manager());

-- hyundai.returns Policies
DROP POLICY IF EXISTS hyundai_returns_owner_policy ON hyundai.returns;
CREATE POLICY hyundai_returns_owner_policy ON hyundai.returns 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS hyundai_returns_manager_policy ON hyundai.returns;
CREATE POLICY hyundai_returns_manager_policy ON hyundai.returns 
    FOR ALL USING (public.is_manager());

-- hyundai.purchases Policies
DROP POLICY IF EXISTS hyundai_purchases_owner_policy ON hyundai.purchases;
CREATE POLICY hyundai_purchases_owner_policy ON hyundai.purchases 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS hyundai_purchases_manager_policy ON hyundai.purchases;
CREATE POLICY hyundai_purchases_manager_policy ON hyundai.purchases 
    FOR ALL USING (public.is_manager());

-- hyundai.purchase_items Policies
DROP POLICY IF EXISTS hyundai_purchase_items_owner_policy ON hyundai.purchase_items;
CREATE POLICY hyundai_purchase_items_owner_policy ON hyundai.purchase_items 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS hyundai_purchase_items_manager_policy ON hyundai.purchase_items;
CREATE POLICY hyundai_purchase_items_manager_policy ON hyundai.purchase_items 
    FOR ALL USING (public.is_manager());

-- hyundai.bulk_update_history Policies
DROP POLICY IF EXISTS hyundai_bulk_owner_policy ON hyundai.bulk_update_history;
CREATE POLICY hyundai_bulk_owner_policy ON hyundai.bulk_update_history 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS hyundai_bulk_manager_policy ON hyundai.bulk_update_history;
CREATE POLICY hyundai_bulk_manager_policy ON hyundai.bulk_update_history 
    FOR ALL USING (public.is_manager());

-- hyundai.mrp_history Policies
DROP POLICY IF EXISTS hyundai_mrp_owner_policy ON hyundai.mrp_history;
CREATE POLICY hyundai_mrp_owner_policy ON hyundai.mrp_history 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS hyundai_mrp_manager_policy ON hyundai.mrp_history;
CREATE POLICY hyundai_mrp_manager_policy ON hyundai.mrp_history 
    FOR ALL USING (public.is_manager());


-- --------------------------------------------------
-- C. MAHINDRA SCHEMA POLICIES
-- --------------------------------------------------

-- mahindra.inventory Policies
DROP POLICY IF EXISTS mahindra_inventory_owner_policy ON mahindra.inventory;
CREATE POLICY mahindra_inventory_owner_policy ON mahindra.inventory 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS mahindra_inventory_manager_policy ON mahindra.inventory;
CREATE POLICY mahindra_inventory_manager_policy ON mahindra.inventory 
    FOR ALL USING (public.is_manager());

-- mahindra.sales Policies
DROP POLICY IF EXISTS mahindra_sales_owner_policy ON mahindra.sales;
CREATE POLICY mahindra_sales_owner_policy ON mahindra.sales 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS mahindra_sales_manager_policy ON mahindra.sales;
CREATE POLICY mahindra_sales_manager_policy ON mahindra.sales 
    FOR ALL USING (public.is_manager());

-- mahindra.sale_items Policies
DROP POLICY IF EXISTS mahindra_sale_items_owner_policy ON mahindra.sale_items;
CREATE POLICY mahindra_sale_items_owner_policy ON mahindra.sale_items 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS mahindra_sale_items_manager_policy ON mahindra.sale_items;
CREATE POLICY mahindra_sale_items_manager_policy ON mahindra.sale_items 
    FOR ALL USING (public.is_manager());

-- mahindra.returns Policies
DROP POLICY IF EXISTS mahindra_returns_owner_policy ON mahindra.returns;
CREATE POLICY mahindra_returns_owner_policy ON mahindra.returns 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS mahindra_returns_manager_policy ON mahindra.returns;
CREATE POLICY mahindra_returns_manager_policy ON mahindra.returns 
    FOR ALL USING (public.is_manager());

-- mahindra.purchases Policies
DROP POLICY IF EXISTS mahindra_purchases_owner_policy ON mahindra.purchases;
CREATE POLICY mahindra_purchases_owner_policy ON mahindra.purchases 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS mahindra_purchases_manager_policy ON mahindra.purchases;
CREATE POLICY mahindra_purchases_manager_policy ON mahindra.purchases 
    FOR ALL USING (public.is_manager());

-- mahindra.purchase_items Policies
DROP POLICY IF EXISTS mahindra_purchase_items_owner_policy ON mahindra.purchase_items;
CREATE POLICY mahindra_purchase_items_owner_policy ON mahindra.purchase_items 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS mahindra_purchase_items_manager_policy ON mahindra.purchase_items;
CREATE POLICY mahindra_purchase_items_manager_policy ON mahindra.purchase_items 
    FOR ALL USING (public.is_manager());

-- mahindra.bulk_update_history Policies
DROP POLICY IF EXISTS mahindra_bulk_owner_policy ON mahindra.bulk_update_history;
CREATE POLICY mahindra_bulk_owner_policy ON mahindra.bulk_update_history 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS mahindra_bulk_manager_policy ON mahindra.bulk_update_history;
CREATE POLICY mahindra_bulk_manager_policy ON mahindra.bulk_update_history 
    FOR ALL USING (public.is_manager());

-- mahindra.mrp_history Policies
DROP POLICY IF EXISTS mahindra_mrp_owner_policy ON mahindra.mrp_history;
CREATE POLICY mahindra_mrp_owner_policy ON mahindra.mrp_history 
    FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS mahindra_mrp_manager_policy ON mahindra.mrp_history;
CREATE POLICY mahindra_mrp_manager_policy ON mahindra.mrp_history 
    FOR ALL USING (public.is_manager());


-- ====================================================================
-- 5. BULK ARCHIVE RPC FUNCTIONS
-- ====================================================================

-- For Hyundai:
CREATE OR REPLACE FUNCTION hyundai.archive_inventory_batch(
  p_search TEXT DEFAULT NULL,
  p_batch_size INT DEFAULT 1000
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INT;
BEGIN
  WITH target_rows AS (
    SELECT id
    FROM hyundai.inventory
    WHERE is_active = true
    AND (
      p_search IS NULL
      OR p_search = ''
      OR part_no ILIKE '%' || p_search || '%'
      OR part_name ILIKE '%' || p_search || '%'
    )
    LIMIT p_batch_size
  )
  UPDATE hyundai.inventory i
  SET is_active = false,
      archived_at = NOW(),
      updated_at = NOW()
  FROM target_rows
  WHERE i.id = target_rows.id;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;


CREATE OR REPLACE FUNCTION hyundai.archive_inventory_filtered(
  p_search TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE,
  p_archived_by TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE hyundai.inventory
  SET
    is_active = FALSE,
    archived_at = NOW(),
    updated_at = NOW()
  WHERE is_active = p_is_active
  AND (
    p_search IS NULL
    OR p_search = ''
    OR part_no ILIKE '%' || p_search || '%'
    OR part_name ILIKE '%' || p_search || '%'
  );

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  INSERT INTO public.transaction_logs (
    user_name,
    action_type,
    module_name,
    description,
    new_data
  )
  VALUES (
    COALESCE(p_archived_by, 'Unknown User'),
    'BULK_ARCHIVE',
    'Inventory',
    'Bulk archived ' || affected_count || ' Hyundai inventory parts',
    jsonb_build_object('schema', 'hyundai', 'affected_count', affected_count)
  );

  RETURN affected_count;
END;
$$;


-- For Mahindra:
CREATE OR REPLACE FUNCTION mahindra.archive_inventory_batch(
  p_search TEXT DEFAULT NULL,
  p_batch_size INT DEFAULT 1000
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INT;
BEGIN
  WITH target_rows AS (
    SELECT id
    FROM mahindra.inventory
    WHERE is_active = true
    AND (
      p_search IS NULL
      OR p_search = ''
      OR part_no ILIKE '%' || p_search || '%'
      OR part_name ILIKE '%' || p_search || '%'
    )
    LIMIT p_batch_size
  )
  UPDATE mahindra.inventory i
  SET is_active = false,
      archived_at = NOW(),
      updated_at = NOW()
  FROM target_rows
  WHERE i.id = target_rows.id;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;


CREATE OR REPLACE FUNCTION mahindra.archive_inventory_filtered(
  p_search TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE,
  p_archived_by TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE mahindra.inventory
  SET
    is_active = FALSE,
    archived_at = NOW(),
    updated_at = NOW()
  WHERE is_active = p_is_active
  AND (
    p_search IS NULL
    OR p_search = ''
    OR part_no ILIKE '%' || p_search || '%'
    OR part_name ILIKE '%' || p_search || '%'
  );

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  INSERT INTO public.transaction_logs (
    user_name,
    action_type,
    module_name,
    description,
    new_data
  )
  VALUES (
    COALESCE(p_archived_by, 'Unknown User'),
    'BULK_ARCHIVE',
    'Inventory',
    'Bulk archived ' || affected_count || ' Mahindra inventory parts',
    jsonb_build_object('schema', 'mahindra', 'affected_count', affected_count)
  );

  RETURN affected_count;
END;
$$;

