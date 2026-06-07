import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface SupabaseTestResult {
  connected: boolean;
  message: string;
  error?: string;
  details?: {
    hasUrl: boolean;
    hasKey: boolean;
    authOk: boolean;
    authMessage: string;
    inventoryReadOk: boolean;
    inventoryReadMessage: string;
    inventoryInsertOk: boolean;
    inventoryInsertMessage: string;
    logInsertOk: boolean;
    logInsertMessage: string;
  };
}

export async function testSupabaseConnection(selectedBrand: 'Hyundai' | 'Mahindra' = 'Hyundai'): Promise<SupabaseTestResult> {
  const b = selectedBrand.toLowerCase();
  const result: SupabaseTestResult = {
    connected: false,
    message: "Initializing connection test...",
    details: {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      authOk: false,
      authMessage: "Not tested",
      inventoryReadOk: false,
      inventoryReadMessage: "Not tested",
      inventoryInsertOk: false,
      inventoryInsertMessage: "Not tested",
      logInsertOk: false,
      logInsertMessage: "Not tested",
    }
  };

  if (!supabase) {
    result.message = "Supabase client not initialized. Check your credentials.";
    return result;
  }

  // 1. Test Auth
  try {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) {
      result.details!.authOk = false;
      result.details!.authMessage = "Auth connection error: " + authError.message;
    } else {
      result.details!.authOk = true;
      result.details!.authMessage = "Success! Supabase auth session check returned code 200.";
    }
  } catch (err: any) {
    result.details!.authOk = false;
    result.details!.authMessage = "Auth terminal error: " + err.message;
  }

  // 2. Test Inventory Read
  try {
    const { data: invData, error: invError } = await supabase.schema(b).from('inventory').select('*').limit(1);
    if (invError) {
      result.details!.inventoryReadOk = false;
      result.details!.inventoryReadMessage = "Inventory Read Error: " + invError.message;
    } else {
      result.details!.inventoryReadOk = true;
      result.details!.inventoryReadMessage = `Success! Read ${invData?.length} row(s) from schema [${b}].inventory.`;
    }
  } catch (err: any) {
    result.details!.inventoryReadOk = false;
    result.details!.inventoryReadMessage = "Inventory Read Terminal: " + err.message;
  }

  // 3. Test Inventory Insert
  try {
    const tempPartNo = `HEALTHCHECK-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const tempItem = {
      id: "00000000-0000-0000-0000-000000000000",
      part_no: tempPartNo,
      part_name: "Supabase Diagnostic Part",
      quantity: 1,
      hsn: "9999",
      mrp: 100.00,
      brand: selectedBrand,
      is_active: false
    };

    const { error: insError } = await supabase.schema(b).from('inventory').insert(tempItem);
    if (insError) {
      result.details!.inventoryInsertOk = false;
      result.details!.inventoryInsertMessage = "Inventory Insert Error: " + insError.message;
    } else {
      result.details!.inventoryInsertOk = true;
      result.details!.inventoryInsertMessage = `Success! Inserted diagnostic part [${tempPartNo}] into [${b}].inventory.`;
      
      // Cleanup
      await supabase.schema(b).from('inventory').delete().eq('part_no', tempPartNo);
    }
  } catch (err: any) {
    result.details!.inventoryInsertOk = false;
    result.details!.inventoryInsertMessage = "Inventory Insert Terminal: " + err.message;
  }

  // 4. Test Transaction Log Insert
  try {
    const testLog = {
      id: "11111111-1111-1111-1111-111111111111",
      user_id: "diag-runner",
      user_name: "Diagnostic Tests",
      action_type: "Diagnostic Write",
      module_name: "Health Checker",
      description: "Triggered temporary database write ping to confirm RLS bypass rules.",
      created_at: new Date().toISOString()
    };

    const { error: logErr } = await supabase.from('transaction_logs').insert(testLog);
    if (logErr) {
      result.details!.logInsertOk = false;
      result.details!.logInsertMessage = "Log Insert Error: " + logErr.message;
    } else {
      result.details!.logInsertOk = true;
      result.details!.logInsertMessage = "Success! Wrote diagnostic transaction into [public].transaction_logs.";

      // Cleanup
      await supabase.from('transaction_logs').delete().eq('id', testLog.id);
    }
  } catch (err: any) {
    result.details!.logInsertOk = false;
    result.details!.logInsertMessage = "Log Insert Terminal: " + err.message;
  }

  const someSuccess = result.details!.authOk && result.details!.inventoryReadOk;
  if (someSuccess) {
    result.connected = true;
    result.message = "Successfully established a connection to the Supabase endpoint and verified main tables.";
  } else {
    result.connected = false;
    result.message = "Connection established but some CRUD checks failed. Please make sure schemas exists and check RLS policies.";
  }

  return result;
}
