import React, { useState } from 'react';
import { ShieldAlert, Copy, Check, ExternalLink, RefreshCw, X, Database, Terminal } from 'lucide-react';
import { db } from '../dbStore';

interface SupabasePermissionsFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemaErrors?: Record<string, string>;
  selectedBrand?: string;
}

export const SUPABASE_FIX_SQL = `-- ====================================================================
-- SPAREZY MIS - COMPLETE SUPABASE PERMISSIONS & RLS REPAIR SCRIPT
-- ====================================================================
-- Run this in your Supabase Project -> SQL Editor (https://supabase.com/dashboard)
-- Fixes: "permission denied for table sales/returns/purchases..." and "Database operation error"

-- 1. Ensure schemas exist
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS hyundai;
CREATE SCHEMA IF NOT EXISTS mahindra;

-- 2. Grant USAGE on all schemas to all roles
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA hyundai TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA mahindra TO postgres, anon, authenticated, service_role;

-- 3. Grant ALL privileges on all existing tables across all schemas
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA hyundai TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA mahindra TO postgres, anon, authenticated, service_role;

-- 4. Grant ALL privileges on all existing sequences
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA hyundai TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA mahindra TO postgres, anon, authenticated, service_role;

-- 5. Grant EXECUTE on all functions & routines
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA hyundai TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA mahindra TO postgres, anon, authenticated, service_role;

-- 6. Set DEFAULT PRIVILEGES for future tables & sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA hyundai GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hyundai GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hyundai GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mahindra GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mahindra GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mahindra GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- 7. Reset and configure Row Level Security (RLS) policies for ALL tables in public, hyundai, and mahindra
DO $$
DECLARE
    tbl text;
    sch text;
BEGIN
    FOR sch IN SELECT unnest(ARRAY['public', 'hyundai', 'mahindra']) LOOP
        FOR tbl IN 
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = sch
        LOOP
            EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', sch, tbl);
            EXECUTE format('DROP POLICY IF EXISTS "sparezy_all_access" ON %I.%I;', sch, tbl);
            EXECUTE format('DROP POLICY IF EXISTS "select_authenticated_policy" ON %I.%I;', sch, tbl);
            EXECUTE format('DROP POLICY IF EXISTS "insert_authenticated_policy" ON %I.%I;', sch, tbl);
            EXECUTE format('DROP POLICY IF EXISTS "update_authenticated_policy" ON %I.%I;', sch, tbl);
            EXECUTE format('DROP POLICY IF EXISTS "delete_authenticated_policy" ON %I.%I;', sch, tbl);
            EXECUTE format('CREATE POLICY "sparezy_all_access" ON %I.%I FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);', sch, tbl);
        END LOOP;
    END LOOP;
END $$;

-- 8. Ensure diagnostics RPC function exists
CREATE OR REPLACE FUNCTION public.current_schema()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN current_schema();
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_schema() TO postgres, anon, authenticated, service_role;`;

export const SupabasePermissionsFixModal: React.FC<SupabasePermissionsFixModalProps> = ({
  isOpen,
  onClose,
  schemaErrors = {},
  selectedBrand,
}) => {
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);

  if (!isOpen) return null;

  const errorKeys = Object.keys(schemaErrors);

  const handleCopy = () => {
    navigator.clipboard.writeText(SUPABASE_FIX_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    db.clearAllSchemaErrors();
    try {
      await db.refreshAllData((selectedBrand as any) || null, true);
    } catch (e) {
      console.error(e);
    }
    setSyncing(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-indigo-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Resolve Database Permissions &amp; RLS</h2>
              <p className="text-xs text-rose-100/90 font-medium">
                Fix "permission denied for table" and PostgREST schema errors
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition cursor-pointer text-white"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-slate-700 text-xs">
          
          {/* Active Error Summary */}
          {errorKeys.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-rose-900 text-xs flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-rose-600" />
                  Detected Configuration Errors ({errorKeys.length})
                </span>
                <span className="text-[10px] bg-rose-200/70 text-rose-800 font-mono px-2 py-0.5 rounded-full font-bold">
                  PostgreSQL 42501
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                {Object.entries(schemaErrors).slice(0, 6).map(([key, err]) => (
                  <div key={key} className="bg-white/80 border border-rose-200/60 rounded px-2.5 py-1 text-[11px] font-mono text-slate-800 flex items-center justify-between">
                    <span className="font-semibold text-rose-900">{key}</span>
                    <span className="text-[10px] text-rose-600 truncate max-w-[180px]">{err.split(':')[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Root Cause Explanation */}
          <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h3 className="font-bold text-slate-800 text-xs">Why did this happen?</h3>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              In PostgreSQL / Supabase, custom dynamic brand schemas (<code className="bg-slate-200 text-indigo-700 px-1 py-0.2 rounded font-mono">hyundai</code> and <code className="bg-slate-200 text-indigo-700 px-1 py-0.2 rounded font-mono">mahindra</code>) require explicit grants for the database roles (<code className="font-mono">anon</code> and <code className="font-mono">authenticated</code>). When tables are created or reset, PostgREST denies access until permissions and Row Level Security (RLS) policies are granted.
            </p>
          </div>

          {/* 3-Step Guided Fix */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-500">
              3-Step Solution (Takes 30 Seconds)
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-indigo-600 font-bold text-[11px]">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px]">1</span>
                  Copy SQL Script
                </div>
                <p className="text-[11px] text-slate-600">
                  Click the green <strong>"Copy SQL Fix Script"</strong> button below.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-indigo-600 font-bold text-[11px]">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px]">2</span>
                  Run in Supabase
                </div>
                <p className="text-[11px] text-slate-600">
                  Open your <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold underline inline-flex items-center gap-0.5">Supabase Dashboard <ExternalLink className="w-2.5 h-2.5" /></a>, go to <strong>SQL Editor</strong>, paste and click <strong>Run</strong>.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-[11px]">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px]">3</span>
                  Click "Sync Now"
                </div>
                <p className="text-[11px] text-slate-600">
                  Return here and click <strong>Sync Now</strong>. The database connection will instantly turn green!
                </p>
              </div>
            </div>
          </div>

          {/* SQL Preview Box with Copy Button */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-slate-500" />
                Complete SQL Fix Script
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className={`text-xs px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy SQL Fix Script
                  </>
                )}
              </button>
            </div>

            <div className="bg-slate-950 text-slate-200 p-3.5 rounded-xl border border-slate-800 font-mono text-[10.5px] leading-relaxed max-h-48 overflow-y-auto select-all">
              <pre>{SUPABASE_FIX_SQL}</pre>
            </div>
          </div>

          {/* Exposed Schemas Reminder */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-amber-900">
            <div className="w-5 h-5 rounded-full bg-amber-200/80 shrink-0 flex items-center justify-center text-[11px] font-bold mt-0.5">
              !
            </div>
            <div className="text-[11px] leading-relaxed">
              <strong>Check Exposed Schemas:</strong> In your Supabase Project, go to{' '}
              <strong>Project Settings &rarr; API &rarr; Data API Settings &rarr; Exposed schemas</strong> and confirm that{' '}
              <code className="bg-amber-100 text-amber-900 px-1 py-0.2 rounded font-mono font-bold">hyundai</code> and{' '}
              <code className="bg-amber-100 text-amber-900 px-1 py-0.2 rounded font-mono font-bold">mahindra</code> are included alongside{' '}
              <code className="bg-amber-100 text-amber-900 px-1 py-0.2 rounded font-mono">public</code>.
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              db.clearAllSchemaErrors();
              onClose();
            }}
            className="text-slate-500 hover:text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
          >
            Dismiss All Notices
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className={`text-xs px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                copied
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
              {copied ? 'Copied!' : 'Copy SQL'}
            </button>

            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
