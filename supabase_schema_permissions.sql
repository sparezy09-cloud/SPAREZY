-- ====================================================================
-- SUPABASE SQL MIGRATION: SCHEMA PERMISSIONS
-- Target Schemas: hyundai, mahindra
-- ====================================================================

-- 1. Grant Usage on Schemas to Authenticated and Anonymous Roles
GRANT USAGE ON SCHEMA hyundai TO authenticated;
GRANT USAGE ON SCHEMA mahindra TO authenticated;

GRANT USAGE ON SCHEMA hyundai TO anon;
GRANT USAGE ON SCHEMA mahindra TO anon;

-- 2. Grant privileges on existing tables
GRANT ALL ON ALL TABLES IN SCHEMA hyundai TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA mahindra TO authenticated;

-- 3. Grant privileges on existing sequences
GRANT ALL ON ALL SEQUENCES IN SCHEMA hyundai TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA mahindra TO authenticated;

-- 4. Alter Default Privileges for any tables created in the future
ALTER DEFAULT PRIVILEGES IN SCHEMA hyundai
GRANT ALL ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA mahindra
GRANT ALL ON TABLES TO authenticated;

-- ====================================================================
-- 5. DIAGNOSTICS HELPER FUNCTION
-- ====================================================================
-- Create RPC function to allow safe API querying of current schema location.
CREATE OR REPLACE FUNCTION public.current_schema()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN current_schema();
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_schema() TO authenticated, anon;

