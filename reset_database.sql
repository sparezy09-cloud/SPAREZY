-- ====================================================================
-- SPAREZY COMPLETE DATABASE RESET SCRIPT (reset_database.sql)
-- Drops all existing tables/schemas and re-builds full structures
-- Includes only ONE Owner account: anmol@sparezy.com (password: 2311@Anmol)
-- ====================================================================

-- ====================================================================
-- 1. DROP ALL EXISTING TABLES, SCHEMAS & DEPENDENCIES
-- ====================================================================

-- Drop brand partitioned schemas (cascading removes all inventory, sales, purchases, etc.)
DROP SCHEMA IF EXISTS hyundai CASCADE;
DROP SCHEMA IF EXISTS mahindra CASCADE;

-- Drop public application tables
DROP TABLE IF EXISTS public.order_requests CASCADE;
DROP TABLE IF EXISTS public.staff_attendance CASCADE;
DROP TABLE IF EXISTS public.customer_ledger CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.transaction_logs CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- ====================================================================
-- 2. CREATE SCHEMAS
-- ====================================================================
CREATE SCHEMA IF NOT EXISTS hyundai;
CREATE SCHEMA IF NOT EXISTS mahindra;

-- ====================================================================
-- 3. CREATE PUBLIC APPLICATION TABLES
-- ====================================================================

-- Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Owner', 'Admin', 'Manager')),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Disabled')),
    per_day_salary NUMERIC(10,2) DEFAULT 1000.00,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Customers Master (Khatabook)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_category TEXT NOT NULL CHECK (customer_category IN ('Mistri', 'Garage', 'Walk-in', 'Retailer')),
    phone TEXT,
    address TEXT,
    starting_balance NUMERIC(12,2) DEFAULT 0.00,
    starting_balance_type TEXT DEFAULT 'To Receive' CHECK (starting_balance_type IN ('To Receive', 'To Give')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Customer Ledger Entries (Running Balance, Debits, Credits)
CREATE TABLE IF NOT EXISTS public.customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    brand TEXT NOT NULL CHECK (brand IN ('Hyundai', 'Mahindra')),
    date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    entry_type TEXT NOT NULL, -- 'Starting Balance', 'Sale Bill', 'Payment Received', 'Item Return Credit', 'Manual Adjustment'
    reference_no TEXT,
    debit NUMERIC(12,2) DEFAULT 0.00,
    credit NUMERIC(12,2) DEFAULT 0.00,
    balance NUMERIC(12,2) DEFAULT 0.00,
    payment_mode TEXT, -- 'UPI', 'Cash', 'Bank Transfer'
    notes TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Order Requests Module
CREATE TABLE IF NOT EXISTS public.order_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand TEXT NOT NULL CHECK (brand IN ('Hyundai', 'Mahindra')),
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    urgency TEXT DEFAULT 'Normal' CHECK (urgency IN ('Low', 'Normal', 'Medium', 'High', 'Emergency', 'Critical')),
    reason TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    notes TEXT,
    requested_by TEXT NOT NULL,
    requested_by_role TEXT,
    manager_id TEXT,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Accepted', 'Rejected', 'Ordered', 'Ordered with Dealer', 'Received')),
    accepted_by TEXT,
    reviewed_by TEXT,
    action_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Staff Attendance & Daily Payroll
CREATE TABLE IF NOT EXISTS public.staff_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Half Day', 'Paid Leave')),
    per_day_salary NUMERIC(10,2) NOT NULL DEFAULT 600.00,
    salary_earned NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    marked_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, date)
);

-- System Transaction & Audit Logs
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
-- 4. HYUNDAI BRAND SCHEMA TABLES
-- ====================================================================

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

CREATE TABLE IF NOT EXISTS hyundai.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_no TEXT,
    customer_id UUID REFERENCES public.customers(id),
    customer_name TEXT NOT NULL,
    customer_category TEXT NOT NULL,
    sale_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    discount_amount NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_type TEXT DEFAULT 'Cash',
    payment_status TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Pending', 'Custom Amount')),
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pending_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    has_return BOOLEAN DEFAULT false,
    returned_items_count INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS hyundai.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES hyundai.sales(id) ON DELETE CASCADE,
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    mrp NUMERIC(12,2) NOT NULL,
    is_net_price BOOLEAN DEFAULT false,
    net_price NUMERIC(12,2),
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    final_amount NUMERIC(12,2) NOT NULL,
    returned_quantity INTEGER DEFAULT 0 CHECK (returned_quantity >= 0),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS hyundai.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES hyundai.sales(id),
    sale_item_id UUID REFERENCES hyundai.sale_items(id),
    customer_id UUID REFERENCES public.customers(id),
    customer_name TEXT NOT NULL,
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    returned_quantity INTEGER NOT NULL CHECK (returned_quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_treatment TEXT NOT NULL DEFAULT 'Refund Paid (Cash/UPI)',
    return_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    notes TEXT,
    created_by TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS hyundai.mrp_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_no TEXT NOT NULL,
    old_mrp NUMERIC(12,2) NOT NULL,
    new_mrp NUMERIC(12,2) NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 5. MAHINDRA BRAND SCHEMA TABLES
-- ====================================================================

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

CREATE TABLE IF NOT EXISTS mahindra.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_no TEXT,
    customer_id UUID REFERENCES public.customers(id),
    customer_name TEXT NOT NULL,
    customer_category TEXT NOT NULL,
    sale_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    discount_amount NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_type TEXT DEFAULT 'Cash',
    payment_status TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Pending', 'Custom Amount')),
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pending_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    has_return BOOLEAN DEFAULT false,
    returned_items_count INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS mahindra.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES mahindra.sales(id) ON DELETE CASCADE,
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    mrp NUMERIC(12,2) NOT NULL,
    is_net_price BOOLEAN DEFAULT false,
    net_price NUMERIC(12,2),
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    final_amount NUMERIC(12,2) NOT NULL,
    returned_quantity INTEGER DEFAULT 0 CHECK (returned_quantity >= 0),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS mahindra.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES mahindra.sales(id),
    sale_item_id UUID REFERENCES mahindra.sale_items(id),
    customer_id UUID REFERENCES public.customers(id),
    customer_name TEXT NOT NULL,
    part_no TEXT NOT NULL,
    part_name TEXT NOT NULL,
    returned_quantity INTEGER NOT NULL CHECK (returned_quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_treatment TEXT NOT NULL DEFAULT 'Refund Paid (Cash/UPI)',
    return_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    notes TEXT,
    created_by TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS mahindra.mrp_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_no TEXT NOT NULL,
    old_mrp NUMERIC(12,2) NOT NULL,
    new_mrp NUMERIC(12,2) NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 6. SEED SOLE OWNER ACCOUNT
-- Email: anmol@sparezy.com | Password: 2311@Anmol
-- ====================================================================

-- 6A. Insert into public.users application table
INSERT INTO public.users (id, name, email, role, status, per_day_salary)
VALUES (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'Anmol Mittal',
    'anmol@sparezy.com',
    'Owner',
    'Active',
    1500.00
)
ON CONFLICT (email) DO UPDATE SET
    role = 'Owner',
    status = 'Active';

-- 6B. Create Supabase auth user with password '2311@Anmol'
-- Enables real Supabase Auth login with email/password if enabled on your project
DO $$
DECLARE
    v_user_id UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_encrypted_pw TEXT;
BEGIN
    -- Only run if auth schema exists (standard in Supabase)
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
        -- Clean existing auth record if present
        DELETE FROM auth.users WHERE email = 'anmol@sparezy.com';

        -- Generate bcrypt hash for '2311@Anmol'
        v_encrypted_pw := crypt('2311@Anmol', gen_salt('bf', 10));

        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            recovery_sent_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000'::uuid,
            v_user_id,
            'authenticated',
            'authenticated',
            'anmol@sparezy.com',
            v_encrypted_pw,
            timezone('utc'::text, now()),
            null,
            timezone('utc'::text, now()),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"name":"Anmol Mittal","role":"Owner"}'::jsonb,
            timezone('utc'::text, now()),
            timezone('utc'::text, now()),
            '',
            '',
            '',
            ''
        );

        -- Add identity row if auth.identities exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
            DELETE FROM auth.identities WHERE user_id = v_user_id;
            INSERT INTO auth.identities (
                id,
                user_id,
                identity_data,
                provider,
                provider_id,
                last_sign_in_at,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                v_user_id,
                jsonb_build_object('sub', v_user_id::text, 'email', 'anmol@sparezy.com'),
                'email',
                'anmol@sparezy.com',
                timezone('utc'::text, now()),
                timezone('utc'::text, now()),
                timezone('utc'::text, now())
            );
        END IF;
    END IF;
END $$;
