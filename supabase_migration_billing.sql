-- SPAREZY BILLING UPGRADE
-- Keeps Hyundai and Mahindra in separate schemas.
-- Adds Kacha + GST/Pakka billing fields without merging brand data.

DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['hyundai','mahindra'] LOOP
    EXECUTE format('ALTER TABLE %I.sales ADD COLUMN IF NOT EXISTS invoice_no TEXT', s);
    EXECUTE format('ALTER TABLE %I.sales ADD COLUMN IF NOT EXISTS bill_type TEXT NOT NULL DEFAULT ''KACHA'' CHECK (bill_type IN (''KACHA'',''GST''))', s);
    EXECUTE format('ALTER TABLE %I.sales ADD COLUMN IF NOT EXISTS customer_gstin TEXT', s);
    EXECUTE format('ALTER TABLE %I.sales ADD COLUMN IF NOT EXISTS customer_address TEXT', s);
    EXECUTE format('ALTER TABLE %I.sales ADD COLUMN IF NOT EXISTS place_of_supply TEXT', s);
    EXECUTE format('ALTER TABLE %I.sales ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.sales ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.sales ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.sales ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12,2) NOT NULL DEFAULT 0', s);

    EXECUTE format('ALTER TABLE %I.sale_items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.sale_items ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.sale_items ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.sale_items ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.sale_items ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12,2) NOT NULL DEFAULT 0', s);

    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I.sales(invoice_no) WHERE invoice_no IS NOT NULL', 'sales_invoice_no_unique_'||s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sales(bill_type, sale_date DESC)', 'sales_bill_type_date_'||s, s);
  END LOOP;
END $$;

-- Convert legacy Owner role to the new Admin role. Drop the old check first so the UPDATE can succeed.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('Admin','Manager'));
UPDATE public.users SET role = 'Admin' WHERE role = 'Owner';

COMMENT ON TABLE public.transaction_logs IS 'Immutable business audit trail. Do not delete transaction history.';


-- Manager permissions: read inventory, create/read sales & purchases, but no destructive edits.
DO $$
DECLARE s text;
BEGIN
  -- Public customer directory: managers may read/create customers, not edit/delete.
  DROP POLICY IF EXISTS manager_full_control_customers ON public.customers;
  DROP POLICY IF EXISTS manager_select_customers ON public.customers;
  DROP POLICY IF EXISTS manager_insert_customers ON public.customers;
  CREATE POLICY manager_select_customers ON public.customers FOR SELECT USING (public.is_active_operator());
  CREATE POLICY manager_insert_customers ON public.customers FOR INSERT WITH CHECK (public.is_active_operator());

  FOREACH s IN ARRAY ARRAY['hyundai','mahindra'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.inventory', s||'_inventory_manager_policy', s);
    EXECUTE format('CREATE POLICY %I ON %I.inventory FOR SELECT USING (public.is_active_operator())', s||'_inventory_manager_select', s);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.sales', s||'_sales_manager_policy', s);
    EXECUTE format('CREATE POLICY %I ON %I.sales FOR SELECT USING (public.is_active_operator())', s||'_sales_manager_select', s);
    EXECUTE format('CREATE POLICY %I ON %I.sales FOR INSERT WITH CHECK (public.is_active_operator())', s||'_sales_manager_insert', s);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.sale_items', s||'_sale_items_manager_policy', s);
    EXECUTE format('CREATE POLICY %I ON %I.sale_items FOR SELECT USING (public.is_active_operator())', s||'_sale_items_manager_select', s);
    EXECUTE format('CREATE POLICY %I ON %I.sale_items FOR INSERT WITH CHECK (public.is_active_operator())', s||'_sale_items_manager_insert', s);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.purchases', s||'_purchases_manager_policy', s);
    EXECUTE format('CREATE POLICY %I ON %I.purchases FOR SELECT USING (public.is_active_operator())', s||'_purchases_manager_select', s);
    EXECUTE format('CREATE POLICY %I ON %I.purchases FOR INSERT WITH CHECK (public.is_active_operator())', s||'_purchases_manager_insert', s);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.purchase_items', s||'_purchase_items_manager_policy', s);
    EXECUTE format('CREATE POLICY %I ON %I.purchase_items FOR SELECT USING (public.is_active_operator())', s||'_purchase_items_manager_select', s);
    EXECUTE format('CREATE POLICY %I ON %I.purchase_items FOR INSERT WITH CHECK (public.is_active_operator())', s||'_purchase_items_manager_insert', s);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.returns', s||'_returns_manager_policy', s);
    EXECUTE format('CREATE POLICY %I ON %I.returns FOR SELECT USING (public.is_active_operator())', s||'_returns_manager_select', s);
    EXECUTE format('CREATE POLICY %I ON %I.returns FOR INSERT WITH CHECK (public.is_active_operator())', s||'_returns_manager_insert', s);
  END LOOP;
END $$;
