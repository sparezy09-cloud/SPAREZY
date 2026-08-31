import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import { safeLocalStorage, safeSessionStorage } from './storagePolyfill';
import { 
  User, InventoryItem, Customer, Sale, SaleItem, ReturnRecord, 
  Purchase, PurchaseItem, BulkUpdateHistory, MRPHistory, TransactionLog, Brand, CustomerCategory, PaymentStatus, UserRole,
  ScanSource
} from './types';

const localStorage = safeLocalStorage;
const sessionStorage = safeSessionStorage;

// Storage keys for active preferences and local storage fallback
const KEY_USERS = 'sparezy_public_users_fb';
const KEY_CUSTOMERS = 'sparezy_public_customers_fb';
const KEY_LOGS = 'sparezy_public_logs_fb';
const KEY_ACTIVE_USER = 'sparezy_active_user_fb';
const KEY_ACTIVE_BRAND = 'sparezy_active_brand_fb';
const KEY_LOCAL_PASSWORDS = 'sparezy_local_user_passwords_fb';

// Safe LocalStorage wrapper to prevent quota/limit errors when database partitions grow large
try {
  if (typeof window !== 'undefined' && typeof Storage !== 'undefined') {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      try {
        originalSetItem.call(this, key, value);
      } catch (err: any) {
        console.warn(`[Local Storage Cache Quota Exceeded] Could not write key "${key}". Continuing in-memory without persistent local storage caching.`, err);
      }
    };
  }
} catch (e) {
  console.warn("[Local Storage Safe-Guard Error] Failed to override Storage.prototype.setItem:", e);
}


// Helpers
const uuid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
};

const safeParseJSON = (str: any) => {
  if (!str) return null;
  if (typeof str === 'string') {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }
  return str;
};

// Local Caches maintaining near-instant live state updates
let cache = {
  users: [] as User[],
  customers: [] as Customer[],
  transaction_logs: [] as TransactionLog[],
  hyundai: {
    inventory: [] as InventoryItem[],
    sales: [] as Sale[],
    sale_items: [] as SaleItem[],
    returns: [] as ReturnRecord[],
    purchases: [] as Purchase[],
    purchase_items: [] as PurchaseItem[],
    bulk_update_history: [] as BulkUpdateHistory[],
    mrp_history: [] as MRPHistory[],
  },
  mahindra: {
    inventory: [] as InventoryItem[],
    sales: [] as Sale[],
    sale_items: [] as SaleItem[],
    returns: [] as ReturnRecord[],
    purchases: [] as Purchase[],
    purchase_items: [] as PurchaseItem[],
    bulk_update_history: [] as BulkUpdateHistory[],
    mrp_history: [] as MRPHistory[],
  }
};

// DB Subscribers list
type DBListener = () => void;
const listeners = new Set<DBListener>();
let isRealtimeSubscribed = false;
let isSilentUpdating = false;
const subscribedSchemas = new Set<string>();
const loadedBrands = new Set<'hyundai' | 'mahindra'>();
let activeBrandChannel: any = null;
let activeBrandName: 'hyundai' | 'mahindra' | null = null;

// Caching meta-states to prevent excessive network bandwidth consumption
let lastPublicFetchTime = 0;
const lastBrandFetchTime: Record<string, number> = { hyundai: 0, mahindra: 0 };
const CACHE_STALE_MS = 60 * 1000; // 1 minute in-memory stale cache duration

// Global connection state
let connectionStatus: 'checking' | 'connected' | 'failed' = 'checking';
let connectionError: string | null = null;

// Global error reporters
// Global error reporters
let lastError: { table: string; schema: string; operation: string; message: string } | null = null;
const errorListeners = new Set<(err: typeof lastError) => void>();
let activeSchemaErrors: Record<string, string> = {};

export function getErrorCategory(code?: string, message?: string): string {
  const msg = (message || '').toLowerCase();
  
  if (code === '42501' || msg.includes('permission') || msg.includes('row-level security') || msg.includes('rls')) {
    return 'Permission/RLS error';
  }
  if (code === '42703' || msg.includes('column') && msg.includes('does not exist')) {
    return 'Database column mismatch: column does not exist';
  }
  if (code === '42P01' || msg.includes('relation') && msg.includes('does not exist')) {
    return 'Missing table';
  }
  if (code === 'PGRST106' || msg.includes('schema') && msg.includes('not exposed')) {
    return 'Schema not exposed';
  }
  if (code === '23505' || msg.includes('duplicate key') || msg.includes('already exists')) {
    return 'Duplicate value';
  }
  if (code === '23503' || msg.includes('foreign key constraint')) {
    return 'Foreign key error';
  }
  return 'Database operation error';
}

// Diagnostics statistics state
let diagnosticStats = {
  activeUserEmail: null as string | null,
  currentSchemaResult: null as string | null,
  currentSchemaError: null as string | null,
  hyundaiInventoryOk: null as boolean | null,
  hyundaiInventoryError: null as string | null,
  mahindraInventoryOk: null as boolean | null,
  mahindraInventoryError: null as string | null,

  // Detail queries for active brand:
  inventoryTest: { success: null as boolean | null, error: null as string | null },
  salesTest: { success: null as boolean | null, error: null as string | null },
  purchaseTest: { success: null as boolean | null, error: null as string | null },
  mrpHistoryTest: { success: null as boolean | null, error: null as string | null },
  bulkUpdateHistoryTest: { success: null as boolean | null, error: null as string | null },
  returnsTest: { success: null as boolean | null, error: null as string | null },
  realtimeStatus: (isSupabaseConfigured ? 'Checking' : 'Disabled') as 'Checking' | 'Connected' | 'Disabled' | 'Failed',
};

export function reportSupabaseError(schema: string, table: string, operation: string, message: string, code?: string) {
  const category = getErrorCategory(code, message);
  
  let mappedMessage = message;
  if (category === 'Database column mismatch: column does not exist') {
    mappedMessage = `Database column mismatch: column does not exist (Original: ${message})`;
  } else {
    mappedMessage = `${category}: ${message}`;
  }

  const errPayload = { schema, table, operation, message: mappedMessage };
  lastError = errPayload;
  
  const errKey = `${schema}.${table}`;
  const isNew = activeSchemaErrors[errKey] !== mappedMessage;
  activeSchemaErrors[errKey] = mappedMessage;

  if (isNew) {
    console.warn(`[Supabase Service Schema Notice - Schema: ${schema}, Table: ${table}, Op: ${operation}]:`, mappedMessage);
  }
  errorListeners.forEach(l => {
    try { l(errPayload); } catch (e) { console.warn("Error in error listener:", e); }
  });
  db.notify();
}

export function clearSchemaError(schema: string, table: string) {
  const errKey = `${schema}.${table}`;
  if (activeSchemaErrors[errKey]) {
    delete activeSchemaErrors[errKey];
    if (lastError && lastError.schema === schema && lastError.table === table) {
      lastError = null;
    }
  }
}

// Initialize fallback structures in localStorage to protect against missing credentials
function initLocalFallback() {
  if (typeof window === 'undefined') return;
  // If no env variables are configured, set failed state immediately
  if (!isSupabaseConfigured) {
    connectionStatus = 'failed';
    connectionError = 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing. Please add them inside environmental secrets in your workspace configuration settings.';
  }
}

// Convert schema fields to JS numeric variables safely
const scrubRow = (row: any) => {
  if (!row) return row;
  const r = { ...row };
  if (r.mrp !== undefined) r.mrp = Number(r.mrp);
  if (r.quantity !== undefined) r.quantity = Number(r.quantity);
  if (r.subtotal !== undefined) r.subtotal = Number(r.subtotal);
  if (r.discount_percentage !== undefined) r.discount_percentage = Number(r.discount_percentage);
  if (r.discount_amount !== undefined) r.discount_amount = Number(r.discount_amount);
  if (r.total_amount !== undefined) r.total_amount = Number(r.total_amount);
  if (r.total_after_discount !== undefined) r.total_after_discount = Number(r.total_after_discount);
  if (r.paid_amount !== undefined) r.paid_amount = Number(r.paid_amount);
  if (r.pending_amount !== undefined) r.pending_amount = Number(r.pending_amount);
  if (r.returned_quantity !== undefined) r.returned_quantity = Number(r.returned_quantity);
  if (r.refund_amount !== undefined) r.refund_amount = Number(r.refund_amount);
  if (r.old_mrp !== undefined) r.old_mrp = Number(r.old_mrp);
  if (r.new_mrp !== undefined) r.new_mrp = Number(r.new_mrp);
  
  if (r.old_data !== undefined) {
    r.old_data = r.old_data ? (typeof r.old_data === 'string' ? r.old_data : JSON.stringify(r.old_data)) : null;
  }
  if (r.new_data !== undefined) {
    r.new_data = r.new_data ? (typeof r.new_data === 'string' ? r.new_data : JSON.stringify(r.new_data)) : null;
  }
  if (r.backup_data_json !== undefined) {
    r.backup_data_json = r.backup_data_json ? (typeof r.backup_data_json === 'string' ? r.backup_data_json : JSON.stringify(r.backup_data_json)) : undefined;
  }
  return r;
};

// Handle incoming realtime signals to propagate changes instantly across browser ports
function handleRealtimePayload(schema: string, payload: any) {
  isSilentUpdating = true;
  try {
    const { table, eventType, new: newRow, old: oldRow } = payload;
    console.log(`📡 realtime: schema=${schema} table=${table} type=${eventType}`, payload);

    let targetArray: any[] | null = null;
    
    if (schema === 'public') {
      if (table === 'users') targetArray = cache.users;
      else if (table === 'customers') targetArray = cache.customers;
      else if (table === 'transaction_logs') targetArray = cache.transaction_logs;
    } else if (schema === 'hyundai') {
      targetArray = (cache.hyundai as any)[table];
    } else if (schema === 'mahindra') {
      targetArray = (cache.mahindra as any)[table];
    }

    if (!targetArray) return;

    const processedNewRow = scrubRow(newRow);

    if (eventType === 'INSERT') {
      const exists = targetArray.some(x => x.id === processedNewRow.id);
      if (!exists) {
        targetArray.unshift(processedNewRow);
      }
    } else if (eventType === 'UPDATE') {
      const idx = targetArray.findIndex(x => x.id === processedNewRow.id);
      if (idx > -1) {
        targetArray[idx] = { ...targetArray[idx], ...processedNewRow };
      } else {
        targetArray.unshift(processedNewRow);
      }
    } else if (eventType === 'DELETE') {
      const idx = targetArray.findIndex(x => x.id === oldRow.id);
      if (idx > -1) {
        targetArray.splice(idx, 1);
      }
    }

    db.notify();
  } finally {
    isSilentUpdating = false;
  }
}

export const db = {
  // Listeners to trigger React updates
  subscribe: (listener: DBListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  notify: () => {
    listeners.forEach(l => {
      try { l(); } catch (e) { console.error("Error invoking listener:", e); }
    });
    if (!isSilentUpdating) {
      try {
        if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('sparezy_data_sync_channel');
          channel.postMessage('sync_trigger');
          channel.close();
        }
      } catch (e) {
        console.warn("[Sync Broadcast Channel] Failed to send update message:", e);
      }
    }
  },

  // Support fetching current health connection indicators React-side
  getConnectionStatus: () => connectionStatus,
  getConnectionError: () => connectionError,
  getLastError: () => lastError,
  clearLastError: () => {
    lastError = null;
    db.notify();
  },
  getActiveSchemaErrors: () => activeSchemaErrors,
  getDiagnostics: () => diagnosticStats,
  isSupabaseConfigured: () => isSupabaseConfigured,
  isInventoryAccessSuccessful: (brand: Brand): boolean => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    return b === 'hyundai' ? !!diagnosticStats.hyundaiInventoryOk : !!diagnosticStats.mahindraInventoryOk;
  },

  refreshAllData: async (brand: Brand | null, force: boolean = false): Promise<void> => {
    isSilentUpdating = true;
    try {
      if (!isSupabaseConfigured || !supabase) {
        db.notify();
        return;
      }
      
      const now = Date.now();
      const shouldRefreshPublic = force || (now - lastPublicFetchTime >= CACHE_STALE_MS);

      if (shouldRefreshPublic) {
        try {
          console.log("[Refresh Engine] Purging stale metadata & reloading public tables...");
          const [usersRes, customersRes, logsRes] = await Promise.all([
            supabase.from('users').select('id, name, email, role, status, created_at'),
            supabase.from('customers').select('id, customer_name, customer_category, phone, created_at'),
            supabase.from('transaction_logs')
              .select('id, user_id, user_name, action_type, module_name, description, created_at, old_data, new_data')
              .order('created_at', { ascending: false })
              .limit(100),
          ]);
          if (usersRes.data) {
            cache.users = usersRes.data.map(scrubRow) as User[];
          }
          if (customersRes.data) {
            cache.customers = customersRes.data.map(scrubRow) as Customer[];
          }
          if (logsRes.data) {
            cache.transaction_logs = logsRes.data.map(scrubRow) as TransactionLog[];
          }
          lastPublicFetchTime = now;
        } catch (err) {
          console.error("[Refresh Engine] Error refreshing public tables:", err);
        }
      } else {
        console.log("[Refresh Engine] Using cached public tables (active within 1m)");
      }

      if (brand) {
        try {
          console.log(`[Refresh Engine] Re-fetching active brand partitions for: ${brand}`);
          await db.loadBrandData(brand, force);
        } catch (err) {
          console.error(`[Refresh Engine] Error refreshing brand data for ${brand}:`, err);
        }
      } else {
        db.notify();
      }
    } finally {
      isSilentUpdating = false;
    }
  },

  // Load and bootstrap Supabase integration async (public tables only)
  initialize: async () => {
    isSilentUpdating = true;
    try {
      initLocalFallback();
      
      if (!isSupabaseConfigured || !supabase) {
        connectionStatus = 'failed';
        connectionError = 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing. Please add them inside environmental secrets in your workspace configuration settings.';
        db.notify();
        return;
      }

      try {
        console.log("Supabase configured! Fast-bootstrapping public tables and diagnostics in parallel...");
        if (connectionStatus !== 'connected') {
          connectionStatus = 'checking';
        }

        // Execute all independent initialization queries in parallel to maximize login & checkout speed
        const [
          usersRes,
          customersRes,
          logsRes,
          sessionRes,
          curSchRes,
          hInvRes,
          mInvRes
        ] = await Promise.all([
          supabase.from('users').select('id, name, email, role, status, created_at'),
          supabase.from('customers').select('id, customer_name, customer_category, phone, created_at'),
          supabase.from('transaction_logs').select('id, user_id, user_name, action_type, module_name, description, created_at, old_data, new_data').order('created_at', { ascending: false }).limit(100),
          supabase.auth.getSession(),
          supabase.rpc('current_schema'),
          supabase.schema('hyundai').from('inventory').select('id').limit(1),
          supabase.schema('mahindra').from('inventory').select('id').limit(1)
        ]);
        
        const usersData = usersRes.data;
        const usersError = usersRes.error;
        if (usersError) {
          if (usersError.message && (usersError.message.includes('fetch') || usersError.message.includes('Network') || usersError.message.includes('network') || usersError.message.includes('Failed to fetch'))) {
            throw usersError;
          }
          reportSupabaseError('public', 'users', 'select', usersError.message);
        }

        const customersData = customersRes.data;
        const customersError = customersRes.error;
        if (customersError) {
          reportSupabaseError('public', 'customers', 'select', customersError.message);
        }

        const logsData = logsRes.data;
        const logsError = logsRes.error;
        if (logsError) {
          reportSupabaseError('public', 'transaction_logs', 'select', logsError.message);
        }

        cache.users = (usersData || []).map(scrubRow) as User[];
        cache.customers = (customersData || []).map(scrubRow) as Customer[];
        cache.transaction_logs = (logsData || []).map(scrubRow) as TransactionLog[];

        // Check live Supabase Auth session from the parallel auth result
        const session = (sessionRes as any).data?.session;
        if (session && session.user) {
          const userEmail = session.user.email;
          diagnosticStats.activeUserEmail = userEmail;
          let profile = cache.users.find(u => u.email.toLowerCase() === userEmail?.toLowerCase());
          
          if (!profile && userEmail) {
            const { data: directProfile } = await supabase
              .from('users')
              .select('id, name, email, role, status, created_at')
              .eq('email', userEmail.toLowerCase())
              .maybeSingle();
            if (directProfile) {
              profile = scrubRow(directProfile) as User;
            }
          }

          if (profile) {
            if (profile.status === 'Disabled') {
              await supabase.auth.signOut();
              sessionStorage.removeItem(KEY_ACTIVE_USER);
            } else {
              sessionStorage.setItem(KEY_ACTIVE_USER, JSON.stringify(profile));
            }
          } else {
            await supabase.auth.signOut();
            sessionStorage.removeItem(KEY_ACTIVE_USER);
          }
        } else {
          sessionStorage.removeItem(KEY_ACTIVE_USER);
        }

        // Handle Current Schema RPC result
        const curSch = curSchRes.data;
        const curSchErr = curSchRes.error;
        if (curSchErr) {
          if (curSchErr.message && (curSchErr.message.toLowerCase().includes('could not find the function') || curSchErr.message.toLowerCase().includes('does not exist'))) {
            console.log("⚠️ SUPABASE INFO - public.current_schema() RPC function not defined in SQL yet. Falling back to default public schema.");
            diagnosticStats.currentSchemaResult = "public (Default)";
            diagnosticStats.currentSchemaError = null;
          } else {
            console.warn("[Diagnostic Notice - SELECT current_schema() failed]:", curSchErr.message);
            diagnosticStats.currentSchemaError = curSchErr.message;
            diagnosticStats.currentSchemaResult = null;
          }
        } else {
          console.log("✅ SUPABASE CONSOLE LOG - SELECT current_schema() succeeded:", curSch);
          diagnosticStats.currentSchemaResult = curSch ? String(curSch) : "public (Default)";
          diagnosticStats.currentSchemaError = null;
        }

        // Handle Hyundai Inventory Diagnostic
        const hInvCheck = hInvRes.data;
        const hInvErr = hInvRes.error;
        if (hInvErr) {
          console.warn("⚠️ SUPABASE DIAGNOSTIC INFO - hyundai.inventory query feedback on startup:", hInvErr.message);
          diagnosticStats.hyundaiInventoryError = hInvErr.message;
          diagnosticStats.hyundaiInventoryOk = false;
        } else {
          console.log("✅ SUPABASE CONSOLE LOG - hyundai.inventory query succeeded. Row count:", hInvCheck?.length);
          diagnosticStats.hyundaiInventoryOk = true;
          diagnosticStats.hyundaiInventoryError = null;
        }

        // Handle Mahindra Inventory Diagnostic
        const mInvCheck = mInvRes.data;
        const mInvErr = mInvRes.error;
        if (mInvErr) {
          console.warn("⚠️ SUPABASE DIAGNOSTIC INFO - mahindra.inventory query feedback on startup:", mInvErr.message);
          diagnosticStats.mahindraInventoryError = mInvErr.message;
          diagnosticStats.mahindraInventoryOk = false;
        } else {
          console.log("✅ SUPABASE CONSOLE LOG - mahindra.inventory query succeeded. Row count:", mInvCheck?.length);
          diagnosticStats.mahindraInventoryOk = true;
          diagnosticStats.mahindraInventoryError = null;
        }
        // -------------------------------------------------

        console.log("Supabase public schema initialization success.");
        connectionStatus = 'connected';
        connectionError = null;
        lastPublicFetchTime = Date.now();

        // Subscribe strictly to public schema channel initially
        try {
          if (!subscribedSchemas.has('public')) {
            subscribedSchemas.add('public');
            diagnosticStats.realtimeStatus = 'Checking';
            const publicChannel = supabase.channel('public-realtime');
            publicChannel
              .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
                handleRealtimePayload('public', payload);
              })
              .subscribe((status) => {
                console.log(`[Supabase Realtime Status] public schema channel update: ${status}`);
                if (status === 'SUBSCRIBED') {
                  diagnosticStats.realtimeStatus = 'Connected';
                } else if (status === 'CLOSED') {
                  diagnosticStats.realtimeStatus = 'Disabled';
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                  diagnosticStats.realtimeStatus = 'Failed';
                }
                db.notify();
              });
          } else {
            diagnosticStats.realtimeStatus = 'Connected';
          }
        } catch (err: any) {
          console.warn("[Realtime Setup Notice] Supabase Realtime subscription optional connection failed:", err);
          diagnosticStats.realtimeStatus = 'Failed';
        }

        // Lazy load saved active brand on mount if it exists
        const savedBrand = db.getActiveBrand();
        if (savedBrand) {
          db.loadBrandData(savedBrand).catch(err => {
            console.error("Delayed load brand data notice:", err);
          });
        }

        db.notify();
      } catch (err: any) {
        console.error("Failed to sync datasets from Supabase:", err);
        connectionStatus = 'failed';
        connectionError = err.message || "Failed to reach your active Supabase endpoint. Check your VITE_SUPABASE_URL network connection, API variables, or firewall guidelines.";
        db.notify();
      }
    } finally {
      isSilentUpdating = false;
    }
  },

  // Lazy-load a selective brand dynamic data schema partition
  loadBrandData: async (brand: Brand, force: boolean = false) => {
    isSilentUpdating = true;
    try {
      const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
      console.log(`[Schema Select Diagnostic] Schema selected: ${brand}`);
      
      const activeUser = db.getActiveUser();
      console.log(`[User Active Diagnostic] User email requested access: ${activeUser?.email || "No session email"}`);
      diagnosticStats.activeUserEmail = activeUser?.email || null;

      const now = Date.now();
      const shouldFetchBrand = force || (now - lastBrandFetchTime[b] >= CACHE_STALE_MS);

      if (!shouldFetchBrand) {
        console.log(`[Cache Engine] Using cached brand data for ${brand} (active within 1m)`);
        
        // Ensure realtime subscription is active for the current brand even if cached
        if (isSupabaseConfigured && supabase) {
          // Unsubscribe from other brand's channel if it exists
          if (activeBrandName && activeBrandName !== b && activeBrandChannel) {
            console.log(`[Realtime Cleanup] Unsubscribing from ${activeBrandName}-realtime channel...`);
            supabase.removeChannel(activeBrandChannel);
            subscribedSchemas.delete(activeBrandName);
            activeBrandChannel = null;
          }
          try {
            if (!subscribedSchemas.has(b)) {
              subscribedSchemas.add(b);
              activeBrandName = b;
              const brandChannel = supabase.channel(`${b}-realtime`);
              activeBrandChannel = brandChannel;
              brandChannel
                .on('postgres_changes', { event: '*', schema: b }, (payload) => {
                  handleRealtimePayload(b, payload);
                })
                .subscribe((status) => {
                  console.log(`[Supabase Realtime Status] Schema ${b} channel update: ${status}`);
                  if (status === 'SUBSCRIBED') {
                    diagnosticStats.realtimeStatus = 'Connected';
                  } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    if (diagnosticStats.realtimeStatus !== 'Connected') {
                      diagnosticStats.realtimeStatus = 'Failed';
                    }
                  }
                  db.notify();
                });
            }
          } catch (subErr) {
            console.warn(`[Realtime Optional Setup] Failed to subscribe to brand ${b} schema channel:`, subErr);
          }
        }
        db.notify();
        return;
      }

      if (isSupabaseConfigured && supabase) {
        try {
          // Unsubscribe from other brand's channel if it exists
          if (activeBrandName && activeBrandName !== b && activeBrandChannel) {
            console.log(`[Realtime Cleanup] Unsubscribing from ${activeBrandName}-realtime channel...`);
            supabase.removeChannel(activeBrandChannel);
            subscribedSchemas.delete(activeBrandName);
            activeBrandChannel = null;
          }

          // 1. INVENTORY ACCESS CHECK - OPTIMIZED PARALLEL RANGE FETCH TO BYPASS POSTGREST 1000 ROW LIMIT
          console.log(`[Query Diagnostic] Running inventory select for schema: ${b}`);
          
          let bInv: any[] = [];
          let errInv: any = null;
          
          try {
            const { count, error: countErr } = await supabase
              .schema(b)
              .from('inventory')
              .select('id', { count: 'exact', head: true });
              
            if (countErr) {
              errInv = countErr;
            } else {
              const totalRows = count || 0;
              console.log(`[Optimized Sync] Found total ${totalRows} parts in '${b}.inventory'. Initiating parallel range downloads...`);
              
              if (totalRows === 0) {
                bInv = [];
              } else {
                const pageSize = 1000;
                const pages = Math.ceil(totalRows / pageSize);
                const rangePromises = [];
                
                for (let i = 0; i < pages; i++) {
                  const from = i * pageSize;
                  const to = (i + 1) * pageSize - 1;
                  rangePromises.push(
                    supabase.schema(b).from('inventory')
                      .select('id, part_no, part_name, quantity, hsn, mrp, brand, is_active, archived_at, created_at, updated_at')
                      .range(from, to)
                  );
                }
                
                const rangeResults = await Promise.all(rangePromises);
                for (const res of rangeResults) {
                  if (res.error) {
                    errInv = res.error;
                    break;
                  }
                  if (res.data) {
                    bInv = bInv.concat(res.data);
                  }
                }
              }
            }
          } catch (fetchExc: any) {
            errInv = fetchExc;
          }

          if (errInv) {
            const category = getErrorCategory(errInv.code, errInv.message);
            console.error(`❌ [${category}] Schema: ${b}, Table: inventory, Error: ${errInv.message}`, errInv);
            reportSupabaseError(b, 'inventory', 'select', errInv.message, errInv.code);
            diagnosticStats.inventoryTest = { success: false, error: errInv.message };
            
            if (b === 'hyundai') {
              diagnosticStats.hyundaiInventoryOk = false;
              diagnosticStats.hyundaiInventoryError = errInv.message;
            } else {
              diagnosticStats.mahindraInventoryOk = false;
              diagnosticStats.mahindraInventoryError = errInv.message;
            }
            // Do not use local fallback data if query fails
            cache[b].inventory = [];
          } else {
            console.log(`✅ [Query Result] Schema: ${b}, Table: inventory, Count: ${bInv?.length || 0}`);
            diagnosticStats.inventoryTest = { success: true, error: null };
            
            if (b === 'hyundai') {
              diagnosticStats.hyundaiInventoryOk = true;
              diagnosticStats.hyundaiInventoryError = null;
            } else {
              diagnosticStats.mahindraInventoryOk = true;
              diagnosticStats.mahindraInventoryError = null;
            }
            clearSchemaError(b, 'inventory');
            cache[b].inventory = (bInv || []).map(scrubRow);
          }

          // 2. SALES ACCESS CHECK
          console.log(`[Query Diagnostic] Running sales select for schema: ${b}`);
          const { data: bSales, error: errSales } = await supabase.schema(b).from('sales')
            .select('id, customer_id, customer_name, customer_category, sale_date, subtotal, discount_percentage, discount_amount, total_amount, payment_status, paid_amount, pending_amount, created_by, created_at')
            .order('created_at', { ascending: false });
          if (errSales) {
            const category = getErrorCategory(errSales.code, errSales.message);
            console.error(`❌ [${category}] Schema: ${b}, Table: sales, Error: ${errSales.message}`, errSales);
            reportSupabaseError(b, 'sales', 'select', errSales.message, errSales.code);
            diagnosticStats.salesTest = { success: false, error: errSales.message };
            cache[b].sales = [];
          } else {
            console.log(`✅ [Query Result] Schema: ${b}, Table: sales, Count: ${bSales?.length || 0}`);
            diagnosticStats.salesTest = { success: true, error: null };
            clearSchemaError(b, 'sales');
            cache[b].sales = (bSales || []).map(scrubRow);
          }

          // 3. SALE ITEMS ACCESS CHECK
          console.log(`[Query Diagnostic] Running sale_items select for schema: ${b}`);
          const { data: bSaleItems, error: errSalesItems } = await supabase.schema(b).from('sale_items')
            .select('id, sale_id, part_no, part_name, quantity, mrp, discount_percentage, final_amount, returned_quantity, created_at');
          if (errSalesItems) {
            const category = getErrorCategory(errSalesItems.code, errSalesItems.message);
            console.error(`❌ [${category}] Schema: ${b}, Table: sale_items, Error: ${errSalesItems.message}`, errSalesItems);
            reportSupabaseError(b, 'sale_items', 'select', errSalesItems.message, errSalesItems.code);
            cache[b].sale_items = [];
          } else {
            console.log(`✅ [Query Result] Schema: ${b}, Table: sale_items, Count: ${bSaleItems?.length || 0}`);
            clearSchemaError(b, 'sale_items');
            cache[b].sale_items = (bSaleItems || []).map(scrubRow);
          }

          // 4. RETURNS ACCESS CHECK
          console.log(`[Query Diagnostic] Running returns select for schema: ${b}`);
          const { data: bReturns, error: errReturns } = await supabase.schema(b).from('returns')
            .select('id, sale_id, sale_item_id, customer_id, part_no, part_name, returned_quantity, refund_amount, return_date, created_by')
            .order('return_date', { ascending: false });
          if (errReturns) {
            const category = getErrorCategory(errReturns.code, errReturns.message);
            console.error(`❌ [${category}] Schema: ${b}, Table: returns, Error: ${errReturns.message}`, errReturns);
            reportSupabaseError(b, 'returns', 'select', errReturns.message, errReturns.code);
            cache[b].returns = [];
          } else {
            console.log(`✅ [Query Result] Schema: ${b}, Table: returns, Count: ${bReturns?.length || 0}`);
            clearSchemaError(b, 'returns');
            cache[b].returns = (bReturns || []).map(scrubRow);
          }

          // 4b. RETURNS DIAGNOCTICS ACCESS CHECK (Requirement 5)
          console.log(`[Query Diagnostic] Running returns diagnostic select for schema: ${b}`);
          const { error: errReturnsDiag } = await supabase
            .schema(b)
            .from('returns')
            .select('id, return_date')
            .order('return_date', { ascending: false })
            .limit(1);
          if (errReturnsDiag) {
            diagnosticStats.returnsTest = { success: false, error: errReturnsDiag.message };
          } else {
            diagnosticStats.returnsTest = { success: true, error: null };
          }

          // 5. PURCHASES ACCESS CHECK
          console.log(`[Query Diagnostic] Running purchases select for schema: ${b}`);
          const { data: bPurchases, error: errPurchases } = await supabase.schema(b).from('purchases')
            .select('id, dealer_name, invoice_no, invoice_date, subtotal, dealer_discount_percentage, discount_amount, total_after_discount, scan_source, created_by, created_at')
            .order('created_at', { ascending: false });
          if (errPurchases) {
            const category = getErrorCategory(errPurchases.code, errPurchases.message);
            console.error(`❌ [${category}] Schema: ${b}, Table: purchases, Error: ${errPurchases.message}`, errPurchases);
            reportSupabaseError(b, 'purchases', 'select', errPurchases.message, errPurchases.code);
            diagnosticStats.purchaseTest = { success: false, error: errPurchases.message };
            cache[b].purchases = [];
          } else {
            console.log(`✅ [Query Result] Schema: ${b}, Table: purchases, Count: ${bPurchases?.length || 0}`);
            diagnosticStats.purchaseTest = { success: true, error: null };
            clearSchemaError(b, 'purchases');
            cache[b].purchases = (bPurchases || []).map(scrubRow);
          }

          // 6. PURCHASE ITEMS ACCESS CHECK
          console.log(`[Query Diagnostic] Running purchase_items select for schema: ${b}`);
          const { data: bPItems, error: errPItems } = await supabase.schema(b).from('purchase_items')
            .select('id, purchase_id, part_no, part_name, hsn, quantity, mrp, is_new_part, matched_inventory, created_at');
          if (errPItems) {
            const category = getErrorCategory(errPItems.code, errPItems.message);
            console.error(`❌ [${category}] Schema: ${b}, Table: purchase_items, Error: ${errPItems.message}`, errPItems);
            reportSupabaseError(b, 'purchase_items', 'select', errPItems.message, errPItems.code);
            cache[b].purchase_items = [];
          } else {
            console.log(`✅ [Query Result] Schema: ${b}, Table: purchase_items, Count: ${bPItems?.length || 0}`);
            clearSchemaError(b, 'purchase_items');
            cache[b].purchase_items = (bPItems || []).map(scrubRow);
          }

          // 7. BULK UPDATE HISTORY ACCESS CHECK
          console.log(`[Query Diagnostic] Running bulk_update_history select for schema: ${b}`);
          const { data: bBulk, error: errBulk } = await supabase.schema(b).from('bulk_update_history')
            .select('id, update_type, file_name, total_rows, success_rows, failed_rows, created_by, created_at, can_undo')
            .order('created_at', { ascending: false });
          if (errBulk) {
            const category = getErrorCategory(errBulk.code, errBulk.message);
            console.error(`❌ [${category}] Schema: ${b}, Table: bulk_update_history, Error: ${errBulk.message}`, errBulk);
            reportSupabaseError(b, 'bulk_update_history', 'select', errBulk.message, errBulk.code);
            diagnosticStats.bulkUpdateHistoryTest = { success: false, error: errBulk.message };
            cache[b].bulk_update_history = [];
          } else {
            console.log(`✅ [Query Result] Schema: ${b}, Table: bulk_update_history, Count: ${bBulk?.length || 0}`);
            diagnosticStats.bulkUpdateHistoryTest = { success: true, error: null };
            clearSchemaError(b, 'bulk_update_history');
            cache[b].bulk_update_history = (bBulk || []).map(scrubRow);
          }

          // 8. MRP HISTORY ACCESS CHECK
          console.log(`[Query Diagnostic] Running mrp_history select for schema: ${b}`);
          const { data: bMrp, error: errMrp } = await supabase.schema(b).from('mrp_history')
            .select('id, part_no, old_mrp, new_mrp, changed_by, changed_at')
            .order('changed_at', { ascending: false });
          if (errMrp) {
            const category = getErrorCategory(errMrp.code, errMrp.message);
            console.error(`❌ [${category}] Schema: ${b}, Table: mrp_history, Error: ${errMrp.message}`, errMrp);
            reportSupabaseError(b, 'mrp_history', 'select', errMrp.message, errMrp.code);
            diagnosticStats.mrpHistoryTest = { success: false, error: errMrp.message };
            cache[b].mrp_history = [];
          } else {
            console.log(`✅ [Query Result] Schema: ${b}, Table: mrp_history, Count: ${bMrp?.length || 0}`);
            diagnosticStats.mrpHistoryTest = { success: true, error: null };
            clearSchemaError(b, 'mrp_history');
            cache[b].mrp_history = (bMrp || []).map(scrubRow);
          }

          // Subscribing specifically to this active brand's schema channels
          try {
            if (!subscribedSchemas.has(b)) {
              subscribedSchemas.add(b);
              activeBrandName = b;
              const brandChannel = supabase.channel(`${b}-realtime`);
              activeBrandChannel = brandChannel;
              brandChannel
                .on('postgres_changes', { event: '*', schema: b }, (payload) => {
                  handleRealtimePayload(b, payload);
                })
                .subscribe((status) => {
                  console.log(`[Supabase Realtime Status] Schema ${b} channel update: ${status}`);
                  if (status === 'SUBSCRIBED') {
                    diagnosticStats.realtimeStatus = 'Connected';
                  } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    if (diagnosticStats.realtimeStatus !== 'Connected') {
                      diagnosticStats.realtimeStatus = 'Failed';
                    }
                  }
                  db.notify();
                });
            }
          } catch (subErr) {
            console.warn(`[Realtime Optional Setup] Failed to subscribe to brand ${b} schema channel:`, subErr);
          }

          console.log(`Lazy-loaded brand schema for ${brand} successfully.`);
          lastBrandFetchTime[b] = now;
          loadedBrands.add(b);
          db.notify();
        } catch (err: any) {
          console.error(`Failed to load dynamic schema partition for ${brand}:`, err);
          throw err;
        }
      } else {
        console.warn(`Offline load brand data invocation blocked for ${brand}.`);
      }
    } finally {
      isSilentUpdating = false;
    }
  },

  // Active Preference Helpers
  getActiveUser: (): User | null => {
    const active = sessionStorage.getItem(KEY_ACTIVE_USER);
    if (active) {
      try {
        return JSON.parse(active);
      } catch {
        return null;
      }
    }
    return null;
  },

  setActiveUser: (user: User | null) => {
    if (user) {
      sessionStorage.setItem(KEY_ACTIVE_USER, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(KEY_ACTIVE_USER);
    }
    db.notify();
  },

  getUsers: (): User[] => {
    try {
      const passwords = safeParseJSON(localStorage.getItem(KEY_LOCAL_PASSWORDS)) || {};
      return cache.users.map(u => ({
        ...u,
        password: passwords[u.id] || passwords[u.email.toLowerCase()] || u.password || ''
      }));
    } catch (e) {
      console.warn("Failed to load local passwords map:", e);
      return cache.users;
    }
  },

  fetchUsers: async (): Promise<User[]> => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('users').select('id, name, email, role, status, created_at');
      if (error) {
        console.error("Failed to fetch users from public.users:", error.message);
        throw error;
      }
      cache.users = (data || []).map(scrubRow) as User[];
      db.notify();
    }
    return cache.users;
  },

  saveUsers: (users: User[]) => {
    cache.users = users;
    if (!isSupabaseConfigured) {
      localStorage.setItem(KEY_USERS, JSON.stringify(users));
    }
    db.notify();
  },

  getActiveBrand: (): Brand | null => {
    const brand = localStorage.getItem(KEY_ACTIVE_BRAND);
    return brand as Brand | null;
  },

  setActiveBrand: (brand: Brand | null) => {
    if (brand) {
      localStorage.setItem(KEY_ACTIVE_BRAND, brand);
    } else {
      localStorage.removeItem(KEY_ACTIVE_BRAND);
    }
    db.notify();
  },

  // Audit Logs
  getLogs: (): TransactionLog[] => {
    return cache.transaction_logs;
  },

  logTransaction: (
    userId: string, userName: string, actionType: string, moduleName: string, 
    description: string, oldData: any = null, newData: any = null
  ) => {
    if (actionType === 'Login') {
      return;
    }
    const newLog: TransactionLog = {
      id: uuid(),
      user_id: userId,
      user_name: userName,
      action_type: actionType,
      module_name: moduleName,
      description,
      old_data: oldData ? (typeof oldData === 'string' ? oldData : JSON.stringify(oldData)) : null,
      new_data: newData ? (typeof newData === 'string' ? newData : JSON.stringify(newData)) : null,
      created_at: new Date().toISOString()
    };
    
    cache.transaction_logs.unshift(newLog);
    if (cache.transaction_logs.length > 500) {
      cache.transaction_logs = cache.transaction_logs.slice(0, 500);
    }

    if (isSupabaseConfigured && supabase) {
      supabase.from('transaction_logs').insert({
        id: newLog.id,
        user_id: newLog.user_id,
        user_name: newLog.user_name,
        action_type: newLog.action_type,
        module_name: newLog.module_name,
        description: newLog.description,
        old_data: oldData ? safeParseJSON(oldData) : null,
        new_data: newData ? safeParseJSON(newData) : null,
        created_at: newLog.created_at
      }).then(({ error }) => {
        if (error) {
          console.error("❌ Failed to insert transaction log in DB:", error.message);
        }
      });
    } else {
      localStorage.setItem(KEY_LOGS, JSON.stringify(cache.transaction_logs));
    }
    db.notify();
  },

  // Operator user settings
  updateUserRole: async (id: string, role: UserRole, currentEditor: User): Promise<void> => {
    const user = cache.users.find(u => u.id === id);
    if (user) {
      const oldVal = { ...user };
      user.role = role;
      
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('users').update({ role }).eq('id', id);
        if (error) {
          throw new Error("Failed to update user role on database: " + error.message);
        }
      } else {
        localStorage.setItem(KEY_USERS, JSON.stringify(cache.users));
      }
      
      db.logTransaction(currentEditor.id, currentEditor.name, 'Update Role', 'User Management', `Updated user ${user.name} role to ${role}`, oldVal, user);
      db.notify();
    }
  },

  updateUserPassword: async (id: string, newPassword: string, currentEditor: User): Promise<void> => {
    const user = cache.users.find(u => u.id === id);
    if (user) {
      const oldVal = { ...user };
      
      // Update locally in passwords store
      try {
        const passwords = safeParseJSON(localStorage.getItem(KEY_LOCAL_PASSWORDS)) || {};
        passwords[user.id] = newPassword.trim();
        passwords[user.email.toLowerCase()] = newPassword.trim();
        localStorage.setItem(KEY_LOCAL_PASSWORDS, JSON.stringify(passwords));
      } catch (e) {
        console.warn("Failed to update user password locally:", e);
      }

      // Also set the in-memory user password property
      user.password = newPassword.trim();

      // If Supabase is configured and the user matches the active session (i.e., changing their own password via auth)
      if (isSupabaseConfigured && supabase) {
        try {
          const sessionRes = await supabase.auth.getSession();
          const session = sessionRes.data?.session;
          if (session && session.user && session.user.id === id) {
            const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
            if (error) {
              console.warn("Failed to update Supabase Auth password:", error.message);
              throw new Error("Supabase Auth password update failed: " + error.message);
            }
          } else {
            console.log("Client-side user is changing another operator's credentials. Password saved locally in local-sync ledger directory.");
          }
        } catch (err: any) {
          console.warn("Supabase Auth password update failed/skipped:", err.message || err);
        }
      }

      // Always save updated cache list locally so that state is persisted 
      localStorage.setItem(KEY_USERS, JSON.stringify(cache.users));

      db.logTransaction(
        currentEditor.id, 
        currentEditor.name, 
        'Change Password', 
        'User Management', 
        `Changed password for user ${user.name} (ID: ${user.id})`, 
        { id: user.id, email: user.email }, 
        { id: user.id, email: user.email }
      );
      db.notify();
    } else {
      throw new Error("User profile not found in MIS database.");
    }
  },

  toggleUserStatus: async (id: string, currentEditor: User): Promise<void> => {
    const user = cache.users.find(u => u.id === id);
    if (user) {
      if (user.id === currentEditor.id) {
        throw new Error("You cannot disable your own account.");
      }
      const oldVal = { ...user };
      user.status = user.status === 'Active' ? 'Disabled' : 'Active';
      
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('users').update({ status: user.status }).eq('id', id);
        if (error) {
          throw new Error("Failed to update user status on database: " + error.message);
        }
      } else {
        localStorage.setItem(KEY_USERS, JSON.stringify(cache.users));
      }
      
      db.logTransaction(currentEditor.id, currentEditor.name, 'Toggle Status', 'User Management', `Toggled user ${user.name} status to ${user.status}`, oldVal, user);
      db.notify();
    }
  },

  addUser: async (name: string, email: string, role: UserRole, currentEditor: User, customId?: string, password?: string): Promise<User> => {
    const newUser: User = {
      id: customId && customId.trim() ? customId.trim() : uuid(),
      name,
      email,
      role,
      status: 'Active',
      created_at: new Date().toISOString(),
      password: password || ''
    };
    
    if (isSupabaseConfigured && supabase) {
      const dbRow = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email.toLowerCase(),
        role: newUser.role,
        status: newUser.status,
        created_at: newUser.created_at
      };

      if (password && password.trim()) {
        try {
          const { data, error } = await supabase.auth.signUp({
            email: newUser.email,
            password: password,
          });

          if (error) {
            console.warn("Auto sign up in Supabase Auth failed/skipped:", error.message);
            // Insert user profile into users table
            const { error: insertErr } = await supabase.from('users').insert(dbRow);
            if (insertErr) {
              throw new Error("Failed to insert user profile: " + insertErr.message);
            }
          } else if (data?.user) {
            console.log("Registered operator auth account successfully in Supabase auth:", data);
            newUser.id = data.user.id;
            const dbRowWithAuthId = {
              ...dbRow,
              id: data.user.id
            };
            
            const { error: insertErr } = await supabase.from('users').insert(dbRowWithAuthId);
            if (insertErr) {
              throw new Error("Failed to insert user profile linked to correct ID: " + insertErr.message);
            }
          } else {
            const { error: insertErr } = await supabase.from('users').insert(dbRow);
            if (insertErr) {
              throw new Error("Failed to insert user profile: " + insertErr.message);
            }
          }
        } catch (authErr: any) {
          console.error("Auth sign up exception occurred:", authErr);
          const { error: insertErr } = await supabase.from('users').insert(dbRow);
          if (insertErr) {
            throw new Error("Failed to insert user profile: " + insertErr.message);
          }
        }
      } else {
        const { error: insertErr } = await supabase.from('users').insert(dbRow);
        if (insertErr) {
          throw new Error("Failed to insert user profile: " + insertErr.message);
        }
      }

      // Re-query users to ensure we have the absolute latest committed entries globally
      const { data: latestUsers, error: fetchErr } = await supabase.from('users').select('id, name, email, role, status, created_at');
      if (!fetchErr && latestUsers) {
        cache.users = latestUsers.map(scrubRow) as User[];
      } else {
        // Fallback: manually push/update current user in state cache
        const existIdx = cache.users.findIndex(u => u.id === newUser.id || u.email.toLowerCase() === newUser.email.toLowerCase());
        if (existIdx > -1) {
          cache.users[existIdx] = newUser;
        } else {
          cache.users.push(newUser);
        }
      }
    } else {
      cache.users.push(newUser);
    }
    
    if (password && password.trim()) {
      try {
        const passwords = safeParseJSON(localStorage.getItem(KEY_LOCAL_PASSWORDS)) || {};
        passwords[newUser.id] = password.trim();
        passwords[newUser.email.toLowerCase()] = password.trim();
        localStorage.setItem(KEY_LOCAL_PASSWORDS, JSON.stringify(passwords));
      } catch (e) {
        console.warn("Failed to save user password locally:", e);
      }
    }

    localStorage.setItem(KEY_USERS, JSON.stringify(cache.users));
    
    db.logTransaction(currentEditor.id, currentEditor.name, 'Create User', 'User Management', `Created new user ${name} with ID ${newUser.id} and role ${role}`, null, newUser);
    db.notify();
    return newUser;
  },

  // Customer Ledger
  getCustomers: (): Customer[] => {
    return cache.customers;
  },

  addCustomer: async (name: string, category: CustomerCategory, phone?: string): Promise<Customer> => {
    const newCust: Customer = {
      id: uuid(),
      customer_name: name,
      customer_category: category,
      phone: phone || '',
      created_at: new Date().toISOString()
    };
    cache.customers.unshift(newCust); // Use unshift to add to top of lists
    
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('customers').insert(newCust);
      if (error) {
        console.error("❌ Error inserting customer into Supabase:", error);
        throw new Error(`Failed to create customer: ${error.message}`);
      }
    } else {
      localStorage.setItem(KEY_CUSTOMERS, JSON.stringify(cache.customers));
    }
    
    const activeUser = db.getActiveUser();
    const userId = activeUser ? activeUser.id : 'system';
    const userName = activeUser ? activeUser.name : 'System';
    db.logTransaction(userId, userName, 'Create Customer', 'Customer Ledger', `Created customer ${name} categorised under ${category}`, null, newCust);
    db.notify();
    return newCust;
  },

  // Inventory lists
  getInventory: (brand: Brand, includeArchived: boolean = false): InventoryItem[] => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    if (includeArchived) {
      return cache[b].inventory;
    }
    return cache[b].inventory.filter(item => item.is_active !== false);
  },

  saveInventory: (brand: Brand, items: InventoryItem[]) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    cache[b].inventory = items;
    if (!isSupabaseConfigured) {
      localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(items));
    }
    db.notify();
  },

  addOrUpdateInventoryPart: (brand: Brand, part: Partial<InventoryItem>, user: User) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const list = cache[b].inventory;
    const existingIdx = list.findIndex(item => item.part_no.trim().toLowerCase() === part.part_no?.trim().toLowerCase());
    
    if (existingIdx > -1) {
      const oldItem = { ...list[existingIdx] };
      const updated: InventoryItem = {
        ...list[existingIdx],
        part_name: part.part_name ?? list[existingIdx].part_name,
        hsn: part.hsn ?? list[existingIdx].hsn,
        mrp: part.mrp ?? list[existingIdx].mrp,
        quantity: part.quantity ?? list[existingIdx].quantity,
        is_active: part.is_active ?? list[existingIdx].is_active,
        archived_at: part.is_active === false ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };
      
      if (part.quantity !== undefined && part.quantity > oldItem.quantity && !oldItem.is_active) {
        updated.is_active = true;
        updated.archived_at = null;
      }
      
      list[existingIdx] = updated;
      
      if (isSupabaseConfigured && supabase) {
        supabase.schema(b).from('inventory').update({
          part_name: updated.part_name,
          hsn: updated.hsn,
          mrp: updated.mrp,
          quantity: updated.quantity,
          is_active: updated.is_active,
          archived_at: updated.archived_at,
          updated_at: updated.updated_at
        }).eq('id', updated.id).then();
      } else {
        localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(list));
      }
      
      db.logTransaction(user.id, user.name, 'Edit Inventory', 'Inventory', `Manual update of part ${part.part_no}`, oldItem, updated);
      
      if (part.mrp !== undefined && part.mrp !== oldItem.mrp) {
        const historyList = cache[b].mrp_history;
        const mrpRec: MRPHistory = {
          id: uuid(),
          part_no: part.part_no || '',
          old_mrp: oldItem.mrp,
          new_mrp: part.mrp,
          changed_by: user.name,
          changed_at: new Date().toISOString()
        };
        historyList.unshift(mrpRec);
        
        if (isSupabaseConfigured && supabase) {
          supabase.schema(b).from('mrp_history').insert(mrpRec).then();
        } else {
          localStorage.setItem(`sparezy_schema_${b}_mrp_history`, JSON.stringify(historyList));
        }
      }
      db.notify();
      return updated;
    } else {
      const newItem: InventoryItem = {
        id: uuid(),
        part_no: part.part_no || '',
        part_name: part.part_name || 'Unnamed Part',
        quantity: part.quantity ?? 0,
        hsn: part.hsn ?? '',
        mrp: part.mrp ?? 0,
        brand,
        is_active: true,
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      list.push(newItem);
      
      if (isSupabaseConfigured && supabase) {
        supabase.schema(b).from('inventory').insert(newItem).then();
      } else {
        localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(list));
      }
      
      db.logTransaction(user.id, user.name, 'Create Inventory', 'Inventory', `Manual creation of part ${part.part_no}`, null, newItem);
      db.notify();
      return newItem;
    }
  },

  archiveParts: (brand: Brand, ids: string[], isArchive: boolean, user: User) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const list = cache[b].inventory;
    const updatedItems: InventoryItem[] = [];
    const oldItems: InventoryItem[] = [];
    
    const idSet = new Set(ids);
    const archivedStr = isArchive ? new Date().toISOString() : null;
    const updatedStr = new Date().toISOString();
    const isActiveVal = !isArchive;

    list.forEach((item, idx) => {
      if (idSet.has(item.id)) {
        oldItems.push({ ...item });
        list[idx].is_active = isActiveVal;
        list[idx].archived_at = archivedStr;
        list[idx].updated_at = updatedStr;
        updatedItems.push(list[idx]);
      }
    });

    if (isSupabaseConfigured && supabase) {
      // Chunk bulk updates of IDs to stay perfectly within PostgreSQL bounds (chunk size of 200 as requested for standard user selection)
      const chunkSize = 200;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        (async () => {
          try {
            const { error } = await supabase.schema(b).from('inventory').update({
              is_active: isActiveVal,
              archived_at: archivedStr,
              updated_at: updatedStr
            }).in('id', chunk);
            if (error) {
              console.error(`Bulk database archive/unarchive notice:`, error.message);
              reportSupabaseError(b, 'inventory', 'update', error.message);
            }
          } catch (err: any) {
            console.error(`Bulk database archive/unarchive network notice:`, err?.message || err);
            reportSupabaseError(b, 'inventory', 'update', err?.message || String(err));
          }
        })();
      }
    } else {
      localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(list));
    }
    
    db.logTransaction(
      user.id, user.name, 
      isArchive ? 'Archive Parts' : 'Unarchive Parts', 
      'Inventory', 
      `${isArchive ? 'Archived' : 'Unarchived'} ${ids.length} parts in ${brand} inventory`, 
      oldItems, 
      updatedItems
    );
    db.notify();
  },

  deleteInventoryPart: (brand: Brand, partId: string, user: User) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const list = cache[b].inventory;
    const existingIdx = list.findIndex(item => item.id === partId);
    
    if (existingIdx > -1) {
      const deletedItem = { ...list[existingIdx] };
      list.splice(existingIdx, 1);
      
      if (isSupabaseConfigured && supabase) {
        supabase.schema(b).from('inventory').delete().eq('id', partId).then(({ error }) => {
          if (error) {
            console.error(`Database deletion notice of part ID ${partId}:`, error.message);
            reportSupabaseError(b, "inventory", "delete", error.message);
          }
        });
      } else {
        localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(list));
      }
      
      db.logTransaction(
        user.id, user.name, 
        'Delete Part', 
        'Inventory', 
        `Deleted part ${deletedItem.part_no} ("${deletedItem.part_name}") from ${brand} inventory`, 
        deletedItem, 
        null
      );
      db.notify();
      return deletedItem;
    }
    return null;
  },

  archivePartsFiltered: async (brand: Brand, searchText: string, user: User, onProgress?: (count: number) => void): Promise<number> => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const archivedStr = new Date().toISOString();
    const updatedStr = new Date().toISOString();
    
    if (isSupabaseConfigured && supabase) {
      try {
        let totalArchived = 0;
        const maxLimit = 1000000; // Protection guardrail
        
        while (true) {
          const { data, error } = await supabase
            .schema(b)
            .rpc('archive_inventory_batch', {
              p_search: searchText || null,
              p_batch_size: 1000
            });
            
          if (error) {
            console.error("Supabase RPC failed for bulk archive batch:", error.message);
            reportSupabaseError(b, 'inventory', 'rpc', error.message, error.code);
            throw new Error(error.message);
          }
          
          const batchCount = typeof data === 'number' ? data : 0;
          totalArchived += batchCount;
          
          if (onProgress) {
            onProgress(totalArchived);
          }
          
          // Break loop if no more items are mutated or batch size wasn't fully consumed
          if (batchCount < 1000 || totalArchived >= maxLimit) {
            break;
          }
          
          // Yield to main thread to prevent blocking
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Create exactly one unified transaction log entry
        db.logTransaction(
          user.id,
          user.name,
          'BULK_ARCHIVE',
          'Inventory',
          `Bulk archived ${totalArchived} ${brand} inventory parts via batched filtered execution`,
          { search: searchText, mode: 'all_filtered' },
          { affected_count: totalArchived }
        );

        // Synchronize our local memory cache in-place without reloading 100,000+ items
        const list = cache[b].inventory;
        const lowerSearch = searchText ? searchText.toLowerCase() : '';
        
        list.forEach((item, idx) => {
          if (item.is_active !== false) {
            const matchesSearch = !lowerSearch ||
              item.part_no.toLowerCase().includes(lowerSearch) ||
              item.part_name.toLowerCase().includes(lowerSearch);

            if (matchesSearch) {
              list[idx].is_active = false;
              list[idx].archived_at = archivedStr;
              list[idx].updated_at = updatedStr;
            }
          }
        });

        db.notify();
        return totalArchived;
      } catch (err: any) {
        console.error("Error executing network bulk filtered archive:", err);
        throw err;
      }
    } else {
      // Local fallback
      const list = cache[b].inventory;
      const lowerSearch = searchText ? searchText.toLowerCase() : '';
      let matchCount = 0;
      const oldItems: InventoryItem[] = [];
      const updatedItems: InventoryItem[] = [];

      list.forEach((item, idx) => {
        if (item.is_active !== false) {
          const matchesSearch = !lowerSearch ||
            item.part_no.toLowerCase().includes(lowerSearch) ||
            item.part_name.toLowerCase().includes(lowerSearch);

          if (matchesSearch) {
            oldItems.push({ ...item });
            list[idx].is_active = false;
            list[idx].archived_at = archivedStr;
            list[idx].updated_at = updatedStr;
            updatedItems.push(list[idx]);
            matchCount++;
          }
        }
      });

      localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(list));

      db.logTransaction(
        user.id, user.name,
        'Archive Parts',
        'Inventory',
        `Bulk archived ${matchCount} parts in ${brand} inventory via offline filter`,
        oldItems,
        updatedItems
      );

      db.notify();
      return matchCount;
    }
  },

  // Sales
  getSales: (brand: Brand): Sale[] => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    return cache[b].sales;
  },

  saveSales: (brand: Brand, sales: Sale[]) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    cache[b].sales = sales;
    if (!isSupabaseConfigured) {
      localStorage.setItem(`sparezy_schema_${b}_sales`, JSON.stringify(sales));
    }
    db.notify();
  },

  getSaleItems: (brand: Brand): SaleItem[] => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    return cache[b].sale_items;
  },

  saveSaleItems: (brand: Brand, items: SaleItem[]) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    cache[b].sale_items = items;
    if (!isSupabaseConfigured) {
      localStorage.setItem(`sparezy_schema_${b}_sale_items`, JSON.stringify(items));
    }
    db.notify();
  },

  createSale: async (
    brand: Brand, 
    customerId: string, 
    customerName: string, 
    customerCategory: CustomerCategory,
    items: { part_no: string; quantity: number; discount_percentage: number; mrp?: number }[],
    discountPercentage: number,
    paymentStatus: PaymentStatus,
    paidAmount: number,
    user: User
  ): Promise<Sale> => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const inventory = cache[b].inventory;
    const saleId = uuid();
    const saleItemsList = cache[b].sale_items;
    
    let subtotal = 0;
    const itemsToSave: SaleItem[] = [];
    
    for (const shopItem of items) {
      const invIdx = inventory.findIndex(inv => inv.part_no === shopItem.part_no);
      if (invIdx === -1) {
        throw new Error(`Part number ${shopItem.part_no} not found in inventory.`);
      }
      
      const invItem = inventory[invIdx];
      
      if (!invItem.is_active) {
        invItem.is_active = true;
        invItem.archived_at = null;
      }
      
      if (invItem.quantity < shopItem.quantity) {
        throw new Error(`Insufficient stock for Part No ${invItem.part_no}. Available: ${invItem.quantity}, Requested: ${shopItem.quantity}`);
      }
      
      invItem.quantity -= shopItem.quantity;
      invItem.updated_at = new Date().toISOString();
      
      if (isSupabaseConfigured && supabase) {
        const { error: invErr } = await supabase.schema(b).from('inventory').update({
          quantity: invItem.quantity,
          is_active: invItem.is_active,
          archived_at: invItem.archived_at,
          updated_at: invItem.updated_at
        }).eq('id', invItem.id);
        if (invErr) {
          throw new Error(`Failed to update inventory stock in database: ${invErr.message}`);
        }
      }
      
      const partMrp = shopItem.mrp !== undefined ? shopItem.mrp : invItem.mrp;
      const itemSubtotal = partMrp * shopItem.quantity;
      const disAmount = itemSubtotal * (shopItem.discount_percentage / 100);
      const finalAmount = itemSubtotal - disAmount;
      
      subtotal += finalAmount;
      
      const saleItem: SaleItem = {
        id: uuid(),
        sale_id: saleId,
        part_no: invItem.part_no,
        part_name: invItem.part_name,
        quantity: shopItem.quantity,
        mrp: partMrp,
        discount_percentage: shopItem.discount_percentage,
        final_amount: finalAmount,
        returned_quantity: 0,
        created_at: new Date().toISOString()
      };
      
      itemsToSave.push(saleItem);
    }
    
    if (!isSupabaseConfigured) {
      localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(inventory));
    }
    
    const discountAmount = subtotal * (discountPercentage / 100);
    const totalAmount = subtotal - discountAmount;
    
    let calculatedPaid = totalAmount;
    let calculatedPending = 0;
    
    if (paymentStatus === 'Pending') {
      calculatedPaid = 0;
      calculatedPending = totalAmount;
    } else if (paymentStatus === 'Custom Amount') {
      calculatedPaid = paidAmount;
      calculatedPending = Math.max(0, totalAmount - paidAmount);
    }
    
    const sale: Sale = {
      id: saleId,
      customer_id: customerId,
      customer_name: customerName,
      customer_category: customerCategory,
      sale_date: new Date().toISOString(),
      subtotal,
      discount_percentage: discountPercentage,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      payment_status: paymentStatus,
      paid_amount: calculatedPaid,
      pending_amount: calculatedPending,
      created_by: user.name,
      created_at: new Date().toISOString()
    };
    
    cache[b].sales.unshift(sale);
    saleItemsList.push(...itemsToSave);
    
    if (isSupabaseConfigured && supabase) {
      const { error: saleErr } = await supabase.schema(b).from('sales').insert(sale);
      if (saleErr) {
        console.error("❌ Error inserting sale into Supabase:", saleErr);
        // Rollback memory cache so list stays in sync with real database
        cache[b].sales.shift();
        throw new Error(`Failed to save invoice in database: ${saleErr.message}`);
      }
      
      const { error: itemsErr } = await supabase.schema(b).from('sale_items').insert(itemsToSave);
      if (itemsErr) {
        console.error("❌ Error inserting sale items into Supabase:", itemsErr);
        throw new Error(`Invoice saved, but item details failed to save in database: ${itemsErr.message}`);
      }
    } else {
      localStorage.setItem(`sparezy_schema_${b}_sales`, JSON.stringify(cache[b].sales));
      localStorage.setItem(`sparezy_schema_${b}_sale_items`, JSON.stringify(saleItemsList));
    }
    
    db.logTransaction(user.id, user.name, 'Create Sale', 'Sales', `Created invoice ${saleId} for ${customerName} (₹${totalAmount.toFixed(2)})`, null, sale);
    lastBrandFetchTime[b] = 0;
    db.notify();
    return sale;
  },

  updateSalePayment: (
    brand: Brand,
    saleId: string,
    paidAmount: number,
    paymentStatus: PaymentStatus,
    user: User
  ): Sale => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const sales = cache[b].sales;
    const saleIdx = sales.findIndex(s => s.id === saleId);
    if (saleIdx === -1) {
      throw new Error(`Sale ID ${saleId} not found.`);
    }
    const sale = sales[saleIdx];
    const oldSale = { ...sale };

    sale.paid_amount = paidAmount;
    sale.pending_amount = Math.max(0, sale.total_amount - paidAmount);
    sale.payment_status = paymentStatus;
    
    if (isSupabaseConfigured && supabase) {
      supabase.schema(b).from('sales').update({
        paid_amount: sale.paid_amount,
        pending_amount: sale.pending_amount,
        payment_status: sale.payment_status
      }).eq('id', sale.id).then();
    } else {
      localStorage.setItem(`sparezy_schema_${b}_sales`, JSON.stringify(sales));
    }

    db.logTransaction(user.id, user.name, 'Receive Payment', 'Sales', `Received payment for invoice ${saleId} (Total: ₹${sale.total_amount}, Paid: ₹${paidAmount}, Pending: ₹${sale.pending_amount})`, oldSale, sale);
    db.notify();
    return sale;
  },

  undoSale: async (
    brand: Brand,
    saleId: string,
    user: User
  ): Promise<void> => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const sales = cache[b].sales;
    const saleIdx = sales.findIndex(s => s.id === saleId);
    if (saleIdx === -1) {
      throw new Error(`Sale ID ${saleId} not found.`);
    }
    const sale = sales[saleIdx];

    // Find all sale items for this sale
    const saleItems = cache[b].sale_items.filter(item => item.sale_id === saleId);

    // Verify inventory items exist and update quantities
    const inventory = cache[b].inventory;
    
    // Perform safety check first
    for (const item of saleItems) {
      const invItem = inventory.find(inv => inv.part_no === item.part_no);
      if (!invItem) {
        throw new Error(`Part number ${item.part_no} from sale not found in inventory. Cannot undo.`);
      }
    }

    // Now restore inventory quantities
    for (const item of saleItems) {
      const invItem = inventory.find(inv => inv.part_no === item.part_no)!;
      invItem.quantity += item.quantity;
      invItem.updated_at = new Date().toISOString();

      if (isSupabaseConfigured && supabase) {
        const { error: invErr } = await supabase.schema(b).from('inventory').update({
          quantity: invItem.quantity,
          updated_at: invItem.updated_at
        }).eq('id', invItem.id);
        if (invErr) {
          throw new Error(`Failed to update inventory stock in database: ${invErr.message}`);
        }
      }
    }

    // Delete Sale Items and Sale from tables/cache
    cache[b].sale_items = cache[b].sale_items.filter(item => item.sale_id !== saleId);
    cache[b].sales = cache[b].sales.filter(s => s.id !== saleId);

    if (isSupabaseConfigured && supabase) {
      // First delete sale_items due to foreign keys if they exist
      const { error: sItemsErr } = await supabase.schema(b).from('sale_items').delete().eq('sale_id', saleId);
      if (sItemsErr) {
        console.error("❌ Error deleting sale items from database:", sItemsErr);
      }

      const { error: saleErr } = await supabase.schema(b).from('sales').delete().eq('id', saleId);
      if (saleErr) {
        throw new Error(`Failed to delete sale invoice from database: ${saleErr.message}`);
      }
    } else {
      localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(inventory));
      localStorage.setItem(`sparezy_schema_${b}_sales`, JSON.stringify(cache[b].sales));
      localStorage.setItem(`sparezy_schema_${b}_sale_items`, JSON.stringify(cache[b].sale_items));
    }

    db.logTransaction(
      user.id,
      user.name,
      'Undo Sale',
      'Sales',
      `Undid sale invoice ${saleId} for ${sale.customer_name}. Returned ${saleItems.length} items (total parts quantity: ${saleItems.reduce((acc, curr) => acc + curr.quantity, 0)}) to inventory.`,
      sale,
      null
    );

    db.notify();
  },

  // Returns
  getReturns: (brand: Brand): ReturnRecord[] => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    return cache[b].returns;
  },

  saveReturns: (brand: Brand, records: ReturnRecord[]) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    cache[b].returns = records;
    if (!isSupabaseConfigured) {
      localStorage.setItem(`sparezy_schema_${b}_returns`, JSON.stringify(records));
    }
    db.notify();
  },

  processReturn: (
    brand: Brand, 
    saleId: string, 
    saleItemId: string, 
    returnedQty: number, 
    refundAmount: number, 
    user: User
  ) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const saleItems = cache[b].sale_items;
    const sales = cache[b].sales;
    const inventory = cache[b].inventory;
    const returns = cache[b].returns;
    
    const sItem = saleItems.find(si => si.id === saleItemId);
    if (!sItem) throw new Error("Sale item not found");
    
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new Error("Parent sale not found");
    
    const maxReturnable = sItem.quantity - sItem.returned_quantity;
    if (returnedQty > maxReturnable) {
      throw new Error(`Cannot return ${returnedQty}. Maximim returnable left is ${maxReturnable}`);
    }
    
    sItem.returned_quantity += returnedQty;
    if (isSupabaseConfigured && supabase) {
      supabase.schema(b).from('sale_items').update({ returned_quantity: sItem.returned_quantity }).eq('id', sItem.id).then();
    }
    
    const invElement = inventory.find(i => i.part_no === sItem.part_no);
    if (invElement) {
      invElement.quantity += returnedQty;
      if (!invElement.is_active) {
        invElement.is_active = true;
        invElement.archived_at = null;
      }
      invElement.updated_at = new Date().toISOString();
      if (isSupabaseConfigured && supabase) {
        supabase.schema(b).from('inventory').update({
          quantity: invElement.quantity,
          is_active: invElement.is_active,
          archived_at: invElement.archived_at,
          updated_at: invElement.updated_at
        }).eq('id', invElement.id).then();
      }
    }
    
    const oldSale = { ...sale };
    if (sale.pending_amount > 0) {
      if (sale.pending_amount >= refundAmount) {
        sale.pending_amount -= refundAmount;
      } else {
        const leftRefund = refundAmount - sale.pending_amount;
        sale.pending_amount = 0;
        sale.paid_amount = Math.max(0, sale.paid_amount - leftRefund);
      }
    } else {
      sale.paid_amount = Math.max(0, sale.paid_amount - refundAmount);
    }
    sale.total_amount = Math.max(0, sale.total_amount - refundAmount);
    if (isSupabaseConfigured && supabase) {
      supabase.schema(b).from('sales').update({
        pending_amount: sale.pending_amount,
        paid_amount: sale.paid_amount,
        total_amount: sale.total_amount
      }).eq('id', sale.id).then();
    }
    
    const returnRec: ReturnRecord = {
      id: uuid(),
      sale_id: saleId,
      sale_item_id: saleItemId,
      customer_id: sale.customer_id,
      part_no: sItem.part_no,
      part_name: sItem.part_name,
      returned_quantity: returnedQty,
      refund_amount: refundAmount,
      return_date: new Date().toISOString(),
      created_by: user.name
    };
    
    returns.unshift(returnRec);
    
    if (isSupabaseConfigured && supabase) {
      supabase.schema(b).from('returns').insert(returnRec).then();
    } else {
      localStorage.setItem(`sparezy_schema_${b}_sale_items`, JSON.stringify(saleItems));
      localStorage.setItem(`sparezy_schema_${b}_sales`, JSON.stringify(sales));
      localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(inventory));
      localStorage.setItem(`sparezy_schema_${b}_returns`, JSON.stringify(returns));
    }
    
    db.logTransaction(user.id, user.name, 'Sale Return', 'Returns', `Processed return for billing ${saleId}: Quantity ${returnedQty} of ${sItem.part_no}`, oldSale, sale);
    db.notify();
    return returnRec;
  },

  // Purchases
  getPurchases: (brand: Brand): Purchase[] => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    return cache[b].purchases;
  },

  savePurchases: (brand: Brand, purchases: Purchase[]) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    cache[b].purchases = purchases;
    if (!isSupabaseConfigured) {
      localStorage.setItem(`sparezy_schema_${b}_purchases`, JSON.stringify(purchases));
    }
    db.notify();
  },

  getPurchaseItems: (brand: Brand): PurchaseItem[] => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    return cache[b].purchase_items;
  },

  savePurchaseItems: (brand: Brand, items: PurchaseItem[]) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    cache[b].purchase_items = items;
    if (!isSupabaseConfigured) {
      localStorage.setItem(`sparezy_schema_${b}_purchase_items`, JSON.stringify(items));
    }
    db.notify();
  },

  createPurchase: async (
    brand: Brand, 
    dealerName: string, 
    invoiceNo: string, 
    invoiceDate: string,
    subtotal: number,
    discountPercentage: number,
    items: { part_no: string; part_name: string; quantity: number; mrp: number; hsn: string; is_new_part?: boolean }[],
    scanSource: ScanSource,
    user: User
  ): Promise<Purchase> => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const listPurchases = cache[b].purchases;
    const purchaseItemsList = cache[b].purchase_items;
    const inventory = cache[b].inventory;
    
    if (listPurchases.some(p => p.invoice_no === invoiceNo && p.dealer_name === dealerName)) {
      throw new Error(`Invoice No ${invoiceNo} already exists for dealer ${dealerName}.`);
    }

    const discountAmount = subtotal * (discountPercentage / 100);
    const totalAfterDiscount = subtotal - discountAmount;
    
    const purchaseId = uuid();
    const pItemsToSave: PurchaseItem[] = [];
    
    for (const pItem of items) {
      const invIdx = inventory.findIndex(i => i.part_no.toLowerCase() === pItem.part_no.toLowerCase());
      const hasMatched = invIdx > -1;
      
      if (hasMatched) {
        const invPart = inventory[invIdx];
        const oldInv = { ...invPart };
        invPart.quantity += pItem.quantity;
        invPart.mrp = pItem.mrp;
        if (!invPart.is_active) {
          invPart.is_active = true;
          invPart.archived_at = null;
        }
        invPart.updated_at = new Date().toISOString();
        
        if (isSupabaseConfigured && supabase) {
          const { error: invErr } = await supabase.schema(b).from('inventory').update({
            quantity: invPart.quantity,
            mrp: invPart.mrp,
            is_active: invPart.is_active,
            archived_at: invPart.archived_at,
            updated_at: invPart.updated_at
          }).eq('id', invPart.id);
          if (invErr) {
            throw new Error(`Failed to update stock quantity for part ${invPart.part_no}: ${invErr.message}`);
          }
        }
        
        if (pItem.mrp !== oldInv.mrp) {
          const mrpHistory = cache[b].mrp_history;
          const mrpRec = {
            id: uuid(),
            part_no: pItem.part_no,
            old_mrp: oldInv.mrp,
            new_mrp: pItem.mrp,
            changed_by: `${user.name} (Via Purchase)`,
            changed_at: new Date().toISOString()
          };
          mrpHistory.unshift(mrpRec);
          if (isSupabaseConfigured && supabase) {
            const { error: mrpErr } = await supabase.schema(b).from('mrp_history').insert(mrpRec);
            if (mrpErr) {
               console.warn("❌ Failed to log MRP change in DB:", mrpErr.message);
            }
          }
        }
      } else {
        const newInv: InventoryItem = {
          id: uuid(),
          part_no: pItem.part_no,
          part_name: pItem.part_name || 'New Spares Part',
          quantity: pItem.quantity,
          hsn: pItem.hsn || '',
          mrp: pItem.mrp,
          brand,
          is_active: true,
          archived_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        inventory.push(newInv);
        if (isSupabaseConfigured && supabase) {
          const { error: invErr } = await supabase.schema(b).from('inventory').insert(newInv);
          if (invErr) {
             throw new Error(`Failed to add new part ${pItem.part_no} to DB: ${invErr.message}`);
          }
        }
        db.logTransaction(user.id, user.name, 'Create Inventory', 'Inventory', `Auto-added new part ${pItem.part_no} from Purchase ${invoiceNo}`, null, newInv);
      }
      
      const purchaseItemRec: PurchaseItem = {
        id: uuid(),
        purchase_id: purchaseId,
        part_no: pItem.part_no,
        part_name: pItem.part_name,
        hsn: pItem.hsn,
        quantity: pItem.quantity,
        mrp: pItem.mrp,
        is_new_part: !hasMatched,
        matched_inventory: hasMatched,
        created_at: new Date().toISOString()
      };
      
      pItemsToSave.push(purchaseItemRec);
    }
    
    const purchase: Purchase = {
      id: purchaseId,
      dealer_name: dealerName,
      invoice_no: invoiceNo,
      invoice_date: new Date(invoiceDate).toISOString(),
      subtotal,
      dealer_discount_percentage: discountPercentage,
      discount_amount: discountAmount,
      total_after_discount: totalAfterDiscount,
      scan_source: scanSource,
      created_by: user.name,
      created_at: new Date().toISOString()
    };
    
    listPurchases.unshift(purchase);
    purchaseItemsList.push(...pItemsToSave);
    
    if (isSupabaseConfigured && supabase) {
      const { error: pErr } = await supabase.schema(b).from('purchases').insert(purchase);
      if (pErr) {
        // Rollback purchases cache
        listPurchases.shift();
        throw new Error(`Failed to save purchase details: ${pErr.message}`);
      }
      const { error: itemsErr } = await supabase.schema(b).from('purchase_items').insert(pItemsToSave);
      if (itemsErr) {
        throw new Error(`Purchase main record saved, but line items failed: ${itemsErr.message}`);
      }
    } else {
      localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(inventory));
      localStorage.setItem(`sparezy_schema_${b}_purchases`, JSON.stringify(listPurchases));
      localStorage.setItem(`sparezy_schema_${b}_purchase_items`, JSON.stringify(purchaseItemsList));
    }
    
    db.logTransaction(user.id, user.name, 'Create Purchase', 'Purchases', `Added brand purchase invoice ${invoiceNo} for dealer ${dealerName}`, null, purchase);
    db.notify();
    return purchase;
  },

  deletePurchase: (brand: Brand, purchaseId: string, user: User) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const listPurchases = cache[b].purchases;
    const purchaseItemsList = cache[b].purchase_items;
    const inventory = cache[b].inventory;
    
    const deletedPurchase = listPurchases.find(p => p.id === purchaseId);
    if (!deletedPurchase) throw new Error("Purchase not found");
    
    const itemsRelated = purchaseItemsList.filter(pi => pi.purchase_id === purchaseId);
    
    itemsRelated.forEach(ri => {
      const invElement = inventory.find(inv => inv.part_no.toLowerCase() === ri.part_no.toLowerCase());
      if (invElement) {
        invElement.quantity = Math.max(0, invElement.quantity - ri.quantity);
        invElement.updated_at = new Date().toISOString();
        if (isSupabaseConfigured && supabase) {
          supabase.schema(b).from('inventory').update({ quantity: invElement.quantity, updated_at: invElement.updated_at }).eq('id', invElement.id).then();
        }
      }
    });
    
    const remainingPurchases = listPurchases.filter(p => p.id !== purchaseId);
    cache[b].purchases = remainingPurchases;
    
    const remainingItems = purchaseItemsList.filter(pi => pi.purchase_id !== purchaseId);
    cache[b].purchase_items = remainingItems;
    
    if (isSupabaseConfigured && supabase) {
      supabase.schema(b).from('purchases').delete().eq('id', purchaseId).then();
    } else {
      localStorage.setItem(`sparezy_schema_${b}_purchases`, JSON.stringify(remainingPurchases));
      localStorage.setItem(`sparezy_schema_${b}_purchase_items`, JSON.stringify(remainingItems));
      localStorage.setItem(`sparezy_schema_${b}_inventory`, JSON.stringify(inventory));
    }
    
    db.logTransaction(user.id, user.name, 'Delete Purchase', 'Purchases', `Deleted purchase invoice ${deletedPurchase.invoice_no} and restored inventory quantities`, deletedPurchase, null);
    db.notify();
  },

  getBulkHistory: (brand: Brand): BulkUpdateHistory[] => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    return cache[b].bulk_update_history;
  },

  saveBulkHistory: (brand: Brand, history: BulkUpdateHistory[]) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    cache[b].bulk_update_history = history;
    if (!isSupabaseConfigured) {
      localStorage.setItem(`sparezy_schema_${b}_bulk_update_history`, JSON.stringify(history));
    }
    db.notify();
  },

  getMRPHistory: (brand: Brand): MRPHistory[] => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    return cache[b].mrp_history;
  },

  saveMRPHistory: (brand: Brand, history: MRPHistory[]) => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    cache[b].mrp_history = history;
    if (!isSupabaseConfigured) {
      localStorage.setItem(`sparezy_schema_${b}_mrp_history`, JSON.stringify(history));
    }
    db.notify();
  },

  // Bulk processings (Excel/CSV sheets uploads)
  mrpBulkUpdate: async (brand: Brand, rows: { part_no: string; part_name?: string; hsn?: string; mrp: number }[], fileName: string, user: User): Promise<BulkUpdateHistory> => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const inventory = cache[b].inventory;
    const mrpHistory = cache[b].mrp_history;
    const bulkHistory = cache[b].bulk_update_history;
    
    let successCount = 0;
    let failedCount = 0;
    
    if (isSupabaseConfigured && supabase) {
      const itemsToUpdateMap = new Map<string, any>();
      const itemsToInsertMap = new Map<string, any>();
      const mrpHistoryToInsert: any[] = [];

      const localUpdatedInventoryItemsMap = new Map<number, { item: any; mrpRec: any }>();
      const updatedOriginals: any[] = [];
      const insertedIds: string[] = [];

      // Build inventory lookup map O(1)
      const inventoryLookupMap = new Map<string, { item: InventoryItem; idx: number }>();
      for (let i = 0; i < inventory.length; i++) {
        inventoryLookupMap.set(inventory[i].part_no.toLowerCase(), { item: inventory[i], idx: i });
      }

      for (const row of rows) {
        if (!row.part_no) {
          failedCount++;
          continue;
        }

        const cleanPartNo = row.part_no.trim();
        const matched = inventoryLookupMap.get(cleanPartNo.toLowerCase());

        if (matched) {
          const matchedItem = matched.item;
          const invIdx = matched.idx;
          
          // Use map to inspect if it was modified within this processing run
          const previousUpdate = itemsToUpdateMap.get(matchedItem.id);
          const oldMrp = previousUpdate ? previousUpdate.mrp : matchedItem.mrp;
          const newMrp = row.mrp;

          if (oldMrp !== newMrp) {
            const updatedItem = {
              ...matchedItem,
              mrp: newMrp,
              updated_at: new Date().toISOString()
            };

            itemsToUpdateMap.set(matchedItem.id, updatedItem);

            const mrpRec = {
              id: uuid(),
              part_no: cleanPartNo,
              old_mrp: oldMrp,
              new_mrp: newMrp,
              changed_by: `${user.name} (Bulk UPDATE)`,
              changed_at: new Date().toISOString()
            };

            mrpHistoryToInsert.push(mrpRec);
            updatedOriginals.push({ ...matchedItem });

            localUpdatedInventoryItemsMap.set(invIdx, { item: updatedItem, mrpRec });
          }
          successCount++;
        } else {
          const previousInsert = itemsToInsertMap.get(cleanPartNo.toLowerCase());
          if (previousInsert) {
            previousInsert.mrp = row.mrp;
            previousInsert.part_name = row.part_name || previousInsert.part_name;
            previousInsert.hsn = row.hsn || previousInsert.hsn;
            previousInsert.updated_at = new Date().toISOString();
          } else {
            const newId = uuid();
            const newPartItem: InventoryItem = {
              id: newId,
              part_no: cleanPartNo,
              part_name: row.part_name || 'Bulk Introduced Part',
              quantity: 0,
              hsn: row.hsn || '',
              mrp: row.mrp,
              brand,
              is_active: true,
              archived_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            itemsToInsertMap.set(cleanPartNo.toLowerCase(), newPartItem);
            insertedIds.push(newId);
          }
          successCount++;
        }
      }

      const itemsToUpdate = Array.from(itemsToUpdateMap.values());
      const itemsToInsert = Array.from(itemsToInsertMap.values());

      const CHUNK_SIZE = 2000;
      const CONCURRENCY_LIMIT = 10;

      const chunkMyArray = <T>(arr: T[], size: number): T[][] => {
        const result: T[][] = [];
        for (let i = 0; i < arr.length; i += size) {
          result.push(arr.slice(i, i + size));
        }
        return result;
      };

      try {
        // 1. Process Updates in chunks
        if (itemsToUpdate.length > 0) {
          const updateChunks = chunkMyArray(itemsToUpdate, CHUNK_SIZE);
          for (let i = 0; i < updateChunks.length; i += CONCURRENCY_LIMIT) {
            const batch = updateChunks.slice(i, i + CONCURRENCY_LIMIT).map(chunk => 
              supabase.schema(b).from('inventory').upsert(chunk, { onConflict: 'id' }).then(({ error }) => {
                if (error) throw new Error("Batch update chunk failed: " + error.message);
              })
            );
            await Promise.all(batch);
          }
        }

        // 2. Process MRP History in chunks
        if (mrpHistoryToInsert.length > 0) {
          const historyChunks = chunkMyArray(mrpHistoryToInsert, CHUNK_SIZE);
          for (let i = 0; i < historyChunks.length; i += CONCURRENCY_LIMIT) {
            const batch = historyChunks.slice(i, i + CONCURRENCY_LIMIT).map(chunk => 
              supabase.schema(b).from('mrp_history').insert(chunk).then(({ error }) => {
                if (error) throw new Error("Batch MRP history chunk failed: " + error.message);
              })
            );
            await Promise.all(batch);
          }
        }

        // 3. Process Inserts in chunks
        if (itemsToInsert.length > 0) {
          const insertChunks = chunkMyArray(itemsToInsert, CHUNK_SIZE);
          for (let i = 0; i < insertChunks.length; i += CONCURRENCY_LIMIT) {
            const batch = insertChunks.slice(i, i + CONCURRENCY_LIMIT).map(chunk => 
              supabase.schema(b).from('inventory').insert(chunk).then(({ error }) => {
                if (error) throw new Error("Batch insert chunk failed: " + error.message);
              })
            );
            await Promise.all(batch);
          }
        }

        // Only update local caches if all database calls committed successfully
        const mrpRecsToPrep: any[] = [];
        for (const [idx, up] of localUpdatedInventoryItemsMap.entries()) {
          inventory[idx] = up.item;
          if (up.mrpRec) {
            mrpRecsToPrep.push(up.mrpRec);
          }
        }

        if (mrpRecsToPrep.length > 0) {
          mrpHistory.unshift(...mrpRecsToPrep);
        }

        for (const ins of itemsToInsert) {
          inventory.push(ins);
        }
      } catch (dbError: any) {
        reportSupabaseError(b, 'inventory_bulk_mrp', 'batch', dbError.message || String(dbError));
        throw new Error("Bulk MRP batch commit failed: " + (dbError.message || dbError));
      }

      const backupData = JSON.stringify({ updatedOriginals, insertedIds });

      const bulkId = uuid();
      const bulkRec: BulkUpdateHistory = {
        id: bulkId,
        update_type: 'MRP Update',
        file_name: fileName,
        total_rows: rows.length,
        success_rows: successCount,
        failed_rows: failedCount,
        created_by: user.name,
        created_at: new Date().toISOString(),
        can_undo: true,
        backup_data_json: backupData
      };
      
      const { error: bulkErr } = await supabase.schema(b).from('bulk_update_history').insert(bulkRec);
      if (bulkErr) {
        reportSupabaseError(b, 'bulk_update_history', 'insert', bulkErr.message);
      } else {
        bulkHistory.unshift(bulkRec);
      }
      
      db.logTransaction(user.id, user.name, 'Bulk Update', 'Bulk Updates', `Completed bulk MRP update using ${fileName}: ${successCount} successful rows, ${failedCount} failing`, null, bulkRec);
      db.notify();
      return bulkRec;
    } else {
      throw new Error("Supabase is not configured. Live database transactions are required.");
    }
  },

  stockBulkUpdate: async (brand: Brand, rows: { part_no: string; quantity: number }[], fileName: string, user: User): Promise<BulkUpdateHistory> => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const inventory = cache[b].inventory;
    const bulkHistory = cache[b].bulk_update_history;
    
    let successCount = 0;
    let failedCount = 0;
    
    if (isSupabaseConfigured && supabase) {
      const itemsToUpdateMap = new Map<string, any>();
      const localUpdatedInventoryItemsMap = new Map<number, { item: any }>();
      const updatedOriginals: any[] = [];
      const insertedIds: string[] = []; // stock action doesn't insert new items, but structured for parity

      // Build inventory lookup map O(1)
      const inventoryLookupMap = new Map<string, { item: InventoryItem; idx: number }>();
      for (let i = 0; i < inventory.length; i++) {
        inventoryLookupMap.set(inventory[i].part_no.toLowerCase(), { item: inventory[i], idx: i });
      }

      for (const row of rows) {
        if (!row.part_no) {
          failedCount++;
          continue;
        }

        const cleanPartNo = row.part_no.trim();
        const matched = inventoryLookupMap.get(cleanPartNo.toLowerCase());

        if (matched) {
          const matchedItem = matched.item;
          const invIdx = matched.idx;
          
          const updatedItem = {
            ...matchedItem,
            quantity: row.quantity,
            is_active: (!matchedItem.is_active && row.quantity > 0) ? true : matchedItem.is_active,
            archived_at: (!matchedItem.is_active && row.quantity > 0) ? null : matchedItem.archived_at,
            updated_at: new Date().toISOString()
          };

          itemsToUpdateMap.set(matchedItem.id, updatedItem);
          updatedOriginals.push({ ...matchedItem });

          localUpdatedInventoryItemsMap.set(invIdx, { item: updatedItem });
          successCount++;
        } else {
          failedCount++;
        }
      }

      const itemsToUpdate = Array.from(itemsToUpdateMap.values());

      const CHUNK_SIZE = 2000;
      const CONCURRENCY_LIMIT = 10;

      const chunkMyArray = <T>(arr: T[], size: number): T[][] => {
        const result: T[][] = [];
        for (let i = 0; i < arr.length; i += size) {
          result.push(arr.slice(i, i + size));
        }
        return result;
      };

      if (itemsToUpdate.length > 0) {
        try {
          const updateChunks = chunkMyArray(itemsToUpdate, CHUNK_SIZE);
          for (let i = 0; i < updateChunks.length; i += CONCURRENCY_LIMIT) {
            const batch = updateChunks.slice(i, i + CONCURRENCY_LIMIT).map(chunk => 
              supabase.schema(b).from('inventory').upsert(chunk, { onConflict: 'id' }).then(({ error }) => {
                if (error) throw new Error("Batch update chunk failed: " + error.message);
              })
            );
            await Promise.all(batch);
          }

          // Apply to local memory only after successful database save
          for (const [idx, up] of localUpdatedInventoryItemsMap.entries()) {
            inventory[idx] = up.item;
          }
        } catch (batchErr: any) {
          reportSupabaseError(b, 'inventory_bulk_stock', 'batch', batchErr.message || String(batchErr));
          throw new Error("Bulk stock update batch commit failed: " + (batchErr.message || batchErr));
        }
      }

      const backupData = JSON.stringify({ updatedOriginals, insertedIds });

      const bulkId = uuid();
      const bulkRec: BulkUpdateHistory = {
        id: bulkId,
        update_type: 'Stock Update',
        file_name: fileName,
        total_rows: rows.length,
        success_rows: successCount,
        failed_rows: failedCount,
        created_by: user.name,
        created_at: new Date().toISOString(),
        can_undo: true,
        backup_data_json: backupData
      };
      
      const { error: bulkErr } = await supabase.schema(b).from('bulk_update_history').insert(bulkRec);
      if (bulkErr) {
        reportSupabaseError(b, 'bulk_update_history', 'insert', bulkErr.message);
      } else {
        bulkHistory.unshift(bulkRec);
      }
      
      db.logTransaction(user.id, user.name, 'Bulk Update', 'Bulk Updates', `Completed bulk Stock update using ${fileName}: ${successCount} successful, ${failedCount} failed`, null, bulkRec);
      db.notify();
      return bulkRec;
    } else {
      throw new Error("Supabase is not configured. Live database transactions are required.");
    }
  },

  undoBulkUpdate: async (brand: Brand, bulkId: string, user: User): Promise<void> => {
    const b = brand.toLowerCase() as 'hyundai' | 'mahindra';
    const bulkHistory = cache[b].bulk_update_history;
    let record = bulkHistory.find(h => h.id === bulkId);
    
    if (!record) throw new Error("Bulk change history not found");
    
    // Fetch backup_data_json on-demand if it isn't loaded in cache yet
    if (!record.backup_data_json && isSupabaseConfigured && supabase) {
      console.log(`[Undo Diagnostic] Fetching backup_data_json on-demand for bulk history ID: ${bulkId}...`);
      const { data, error } = await supabase
        .schema(b)
        .from('bulk_update_history')
        .select('backup_data_json')
        .eq('id', bulkId)
        .single();
      if (error) {
        throw new Error("Failed to load revert metadata: " + error.message);
      }
      record.backup_data_json = data?.backup_data_json || null;
    }
    
    if (!record.can_undo || !record.backup_data_json) {
      throw new Error("This bulk action cannot be reverted or has already been undone.");
    }
    
    if (isSupabaseConfigured && supabase) {
      try {
        let updatedOriginals: InventoryItem[] = [];
        let insertedIds: string[] = [];

        try {
          const backupObj = JSON.parse(record.backup_data_json);
          if (backupObj && Array.isArray(backupObj)) {
            // Legacy full inventory backup compatibility
            updatedOriginals = backupObj;
          } else if (backupObj && typeof backupObj === 'object') {
            updatedOriginals = backupObj.updatedOriginals || [];
            insertedIds = backupObj.insertedIds || [];
          }
        } catch (e) {
          console.error("Failed to parse bulk backup data:", e);
        }

        // Disable undo state in DB first
        const { error: bulkErr } = await supabase.schema(b).from('bulk_update_history').update({ can_undo: false }).eq('id', bulkId);
        if (bulkErr) {
          reportSupabaseError(b, 'bulk_update_history', 'update', bulkErr.message);
          throw bulkErr;
        }

        const CHUNK_SIZE = 2000;
        const CONCURRENCY_LIMIT = 10;
        
        const chunkMyArray = <T>(arr: T[], size: number): T[][] => {
          const result: T[][] = [];
          for (let i = 0; i < arr.length; i += size) {
            result.push(arr.slice(i, i + size));
          }
          return result;
        };

        // 1. Restore/Upsert original items in bulk chunks
        if (updatedOriginals.length > 0) {
          const originalChunks = chunkMyArray(updatedOriginals, CHUNK_SIZE);
          for (let i = 0; i < originalChunks.length; i += CONCURRENCY_LIMIT) {
            const batch = originalChunks.slice(i, i + CONCURRENCY_LIMIT).map(chunk => 
              supabase.schema(b).from('inventory').upsert(chunk, { onConflict: 'id' }).then(({ error }) => {
                if (error) throw new Error("Batch undo upsert chunk failed: " + error.message);
              })
            );
            await Promise.all(batch);
          }
        }

        // 2. Delete newly created parts on undo in bulk chunks
        if (insertedIds.length > 0) {
          const deleteChunks = chunkMyArray(insertedIds, CHUNK_SIZE);
          for (let i = 0; i < deleteChunks.length; i += CONCURRENCY_LIMIT) {
            const batch = deleteChunks.slice(i, i + CONCURRENCY_LIMIT).map(chunk => 
              supabase.schema(b).from('inventory').delete().in('id', chunk).then(({ error }) => {
                if (error) throw new Error("Batch undo delete chunk failed: " + error.message);
              })
            );
            await Promise.all(batch);
          }
        }

        // 3. Sync database state with cache
        await db.loadBrandData(brand);
        record.can_undo = false;
        
        db.logTransaction(user.id, user.name, 'Undo Bulk Update', 'Bulk Updates', `Reverted bulk update ${record.update_type} done via ${record.file_name}`, record, null);
        db.notify();
      } catch (err: any) {
        throw new Error(`Undo failed: ${err.message}`);
      }
    } else {
      throw new Error("Supabase is not configured. Live database transactions are required.");
    }
  }
};
