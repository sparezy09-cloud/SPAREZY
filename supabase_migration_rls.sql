-- ====================================================================
-- SUPABASE SQL MIGRATION: ENABLE RLS AND GENERATE CRUD POLICIES
-- Target Schemas: hyundai, mahindra, public
-- Allowed Role: authenticated (Full SELECT, INSERT, UPDATE, DELETE access)
-- ====================================================================

-- Ensure schemas exist
CREATE SCHEMA IF NOT EXISTS hyundai;
CREATE SCHEMA IF NOT EXISTS mahindra;

-- ====================================================================
-- 1. PUBLIC SCHEMA TABLES (users, customers, transaction_logs)
-- ====================================================================

-- Table: public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON public.users;
DROP POLICY IF EXISTS insert_authenticated_policy ON public.users;
DROP POLICY IF EXISTS update_authenticated_policy ON public.users;
DROP POLICY IF EXISTS delete_authenticated_policy ON public.users;

CREATE POLICY select_authenticated_policy ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON public.users FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON public.users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON public.users FOR DELETE TO authenticated USING (true);

-- Table: public.customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON public.customers;
DROP POLICY IF EXISTS insert_authenticated_policy ON public.customers;
DROP POLICY IF EXISTS update_authenticated_policy ON public.customers;
DROP POLICY IF EXISTS delete_authenticated_policy ON public.customers;

CREATE POLICY select_authenticated_policy ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON public.customers FOR DELETE TO authenticated USING (true);

-- Table: public.transaction_logs
ALTER TABLE public.transaction_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON public.transaction_logs;
DROP POLICY IF EXISTS insert_authenticated_policy ON public.transaction_logs;
DROP POLICY IF EXISTS update_authenticated_policy ON public.transaction_logs;
DROP POLICY IF EXISTS delete_authenticated_policy ON public.transaction_logs;

CREATE POLICY select_authenticated_policy ON public.transaction_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON public.transaction_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON public.transaction_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON public.transaction_logs FOR DELETE TO authenticated USING (true);


-- ====================================================================
-- 2. HYUNDAI SCHEMA TABLES
-- ====================================================================

-- Table: hyundai.inventory
ALTER TABLE hyundai.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON hyundai.inventory;
DROP POLICY IF EXISTS insert_authenticated_policy ON hyundai.inventory;
DROP POLICY IF EXISTS update_authenticated_policy ON hyundai.inventory;
DROP POLICY IF EXISTS delete_authenticated_policy ON hyundai.inventory;

CREATE POLICY select_authenticated_policy ON hyundai.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON hyundai.inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON hyundai.inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON hyundai.inventory FOR DELETE TO authenticated USING (true);

-- Table: hyundai.sales
ALTER TABLE hyundai.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON hyundai.sales;
DROP POLICY IF EXISTS insert_authenticated_policy ON hyundai.sales;
DROP POLICY IF EXISTS update_authenticated_policy ON hyundai.sales;
DROP POLICY IF EXISTS delete_authenticated_policy ON hyundai.sales;

CREATE POLICY select_authenticated_policy ON hyundai.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON hyundai.sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON hyundai.sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON hyundai.sales FOR DELETE TO authenticated USING (true);

-- Table: hyundai.sale_items
ALTER TABLE hyundai.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON hyundai.sale_items;
DROP POLICY IF EXISTS insert_authenticated_policy ON hyundai.sale_items;
DROP POLICY IF EXISTS update_authenticated_policy ON hyundai.sale_items;
DROP POLICY IF EXISTS delete_authenticated_policy ON hyundai.sale_items;

CREATE POLICY select_authenticated_policy ON hyundai.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON hyundai.sale_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON hyundai.sale_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON hyundai.sale_items FOR DELETE TO authenticated USING (true);

-- Table: hyundai.returns
ALTER TABLE hyundai.returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON hyundai.returns;
DROP POLICY IF EXISTS insert_authenticated_policy ON hyundai.returns;
DROP POLICY IF EXISTS update_authenticated_policy ON hyundai.returns;
DROP POLICY IF EXISTS delete_authenticated_policy ON hyundai.returns;

CREATE POLICY select_authenticated_policy ON hyundai.returns FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON hyundai.returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON hyundai.returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON hyundai.returns FOR DELETE TO authenticated USING (true);

-- Table: hyundai.purchases
ALTER TABLE hyundai.purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON hyundai.purchases;
DROP POLICY IF EXISTS insert_authenticated_policy ON hyundai.purchases;
DROP POLICY IF EXISTS update_authenticated_policy ON hyundai.purchases;
DROP POLICY IF EXISTS delete_authenticated_policy ON hyundai.purchases;

CREATE POLICY select_authenticated_policy ON hyundai.purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON hyundai.purchases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON hyundai.purchases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON hyundai.purchases FOR DELETE TO authenticated USING (true);

-- Table: hyundai.purchase_items
ALTER TABLE hyundai.purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON hyundai.purchase_items;
DROP POLICY IF EXISTS insert_authenticated_policy ON hyundai.purchase_items;
DROP POLICY IF EXISTS update_authenticated_policy ON hyundai.purchase_items;
DROP POLICY IF EXISTS delete_authenticated_policy ON hyundai.purchase_items;

CREATE POLICY select_authenticated_policy ON hyundai.purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON hyundai.purchase_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON hyundai.purchase_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON hyundai.purchase_items FOR DELETE TO authenticated USING (true);

-- Table: hyundai.bulk_update_history
ALTER TABLE hyundai.bulk_update_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON hyundai.bulk_update_history;
DROP POLICY IF EXISTS insert_authenticated_policy ON hyundai.bulk_update_history;
DROP POLICY IF EXISTS update_authenticated_policy ON hyundai.bulk_update_history;
DROP POLICY IF EXISTS delete_authenticated_policy ON hyundai.bulk_update_history;

CREATE POLICY select_authenticated_policy ON hyundai.bulk_update_history FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON hyundai.bulk_update_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON hyundai.bulk_update_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON hyundai.bulk_update_history FOR DELETE TO authenticated USING (true);

-- Table: hyundai.mrp_history
ALTER TABLE hyundai.mrp_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON hyundai.mrp_history;
DROP POLICY IF EXISTS insert_authenticated_policy ON hyundai.mrp_history;
DROP POLICY IF EXISTS update_authenticated_policy ON hyundai.mrp_history;
DROP POLICY IF EXISTS delete_authenticated_policy ON hyundai.mrp_history;

CREATE POLICY select_authenticated_policy ON hyundai.mrp_history FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON hyundai.mrp_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON hyundai.mrp_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON hyundai.mrp_history FOR DELETE TO authenticated USING (true);


-- ====================================================================
-- 3. MAHINDRA SCHEMA TABLES
-- ====================================================================

-- Table: mahindra.inventory
ALTER TABLE mahindra.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON mahindra.inventory;
DROP POLICY IF EXISTS insert_authenticated_policy ON mahindra.inventory;
DROP POLICY IF EXISTS update_authenticated_policy ON mahindra.inventory;
DROP POLICY IF EXISTS delete_authenticated_policy ON mahindra.inventory;

CREATE POLICY select_authenticated_policy ON mahindra.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON mahindra.inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON mahindra.inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON mahindra.inventory FOR DELETE TO authenticated USING (true);

-- Table: mahindra.sales
ALTER TABLE mahindra.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON mahindra.sales;
DROP POLICY IF EXISTS insert_authenticated_policy ON mahindra.sales;
DROP POLICY IF EXISTS update_authenticated_policy ON mahindra.sales;
DROP POLICY IF EXISTS delete_authenticated_policy ON mahindra.sales;

CREATE POLICY select_authenticated_policy ON mahindra.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON mahindra.sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON mahindra.sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON mahindra.sales FOR DELETE TO authenticated USING (true);

-- Table: mahindra.sale_items
ALTER TABLE mahindra.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON mahindra.sale_items;
DROP POLICY IF EXISTS insert_authenticated_policy ON mahindra.sale_items;
DROP POLICY IF EXISTS update_authenticated_policy ON mahindra.sale_items;
DROP POLICY IF EXISTS delete_authenticated_policy ON mahindra.sale_items;

CREATE POLICY select_authenticated_policy ON mahindra.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON mahindra.sale_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON mahindra.sale_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON mahindra.sale_items FOR DELETE TO authenticated USING (true);

-- Table: mahindra.returns
ALTER TABLE mahindra.returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON mahindra.returns;
DROP POLICY IF EXISTS insert_authenticated_policy ON mahindra.returns;
DROP POLICY IF EXISTS update_authenticated_policy ON mahindra.returns;
DROP POLICY IF EXISTS delete_authenticated_policy ON mahindra.returns;

CREATE POLICY select_authenticated_policy ON mahindra.returns FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON mahindra.returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON mahindra.returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON mahindra.returns FOR DELETE TO authenticated USING (true);

-- Table: mahindra.purchases
ALTER TABLE mahindra.purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON mahindra.purchases;
DROP POLICY IF EXISTS insert_authenticated_policy ON mahindra.purchases;
DROP POLICY IF EXISTS update_authenticated_policy ON mahindra.purchases;
DROP POLICY IF EXISTS delete_authenticated_policy ON mahindra.purchases;

CREATE POLICY select_authenticated_policy ON mahindra.purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON mahindra.purchases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON mahindra.purchases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON mahindra.purchases FOR DELETE TO authenticated USING (true);

-- Table: mahindra.purchase_items
ALTER TABLE mahindra.purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON mahindra.purchase_items;
DROP POLICY IF EXISTS insert_authenticated_policy ON mahindra.purchase_items;
DROP POLICY IF EXISTS update_authenticated_policy ON mahindra.purchase_items;
DROP POLICY IF EXISTS delete_authenticated_policy ON mahindra.purchase_items;

CREATE POLICY select_authenticated_policy ON mahindra.purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON mahindra.purchase_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON mahindra.purchase_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON mahindra.purchase_items FOR DELETE TO authenticated USING (true);

-- Table: mahindra.bulk_update_history
ALTER TABLE mahindra.bulk_update_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON mahindra.bulk_update_history;
DROP POLICY IF EXISTS insert_authenticated_policy ON mahindra.bulk_update_history;
DROP POLICY IF EXISTS update_authenticated_policy ON mahindra.bulk_update_history;
DROP POLICY IF EXISTS delete_authenticated_policy ON mahindra.bulk_update_history;

CREATE POLICY select_authenticated_policy ON mahindra.bulk_update_history FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON mahindra.bulk_update_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON mahindra.bulk_update_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON mahindra.bulk_update_history FOR DELETE TO authenticated USING (true);

-- Table: mahindra.mrp_history
ALTER TABLE mahindra.mrp_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_authenticated_policy ON mahindra.mrp_history;
DROP POLICY IF EXISTS insert_authenticated_policy ON mahindra.mrp_history;
DROP POLICY IF EXISTS update_authenticated_policy ON mahindra.mrp_history;
DROP POLICY IF EXISTS delete_authenticated_policy ON mahindra.mrp_history;

CREATE POLICY select_authenticated_policy ON mahindra.mrp_history FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_authenticated_policy ON mahindra.mrp_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_authenticated_policy ON mahindra.mrp_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_authenticated_policy ON mahindra.mrp_history FOR DELETE TO authenticated USING (true);


-- ====================================================================
-- 3. BULK ARCHIVE RPC FUNCTIONS
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


-- ====================================================================
-- RLS POLICIES FOR KHATA BOOK MODULE
-- ====================================================================

-- Enable RLS for Khata Book tables
ALTER TABLE public.khata_customers_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata_suppliers_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata_entries ENABLE ROW LEVEL SECURITY;

-- khata_customers_meta policies
DROP POLICY IF EXISTS owner_full_control_khata_cust ON public.khata_customers_meta;
CREATE POLICY owner_full_control_khata_cust ON public.khata_customers_meta FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS manager_full_control_khata_cust ON public.khata_customers_meta;
CREATE POLICY manager_full_control_khata_cust ON public.khata_customers_meta FOR ALL USING (public.is_manager());

-- khata_suppliers_meta policies
DROP POLICY IF EXISTS owner_full_control_khata_supp ON public.khata_suppliers_meta;
CREATE POLICY owner_full_control_khata_supp ON public.khata_suppliers_meta FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS manager_full_control_khata_supp ON public.khata_suppliers_meta;
CREATE POLICY manager_full_control_khata_supp ON public.khata_suppliers_meta FOR ALL USING (public.is_manager());

-- khata_entries policies
DROP POLICY IF EXISTS owner_full_control_khata_entries ON public.khata_entries;
CREATE POLICY owner_full_control_khata_entries ON public.khata_entries FOR ALL USING (public.is_owner());

DROP POLICY IF EXISTS manager_full_control_khata_entries ON public.khata_entries;
CREATE POLICY manager_full_control_khata_entries ON public.khata_entries FOR ALL USING (public.is_manager());

