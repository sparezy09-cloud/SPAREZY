import { useState, useEffect } from 'react';
import { User, Brand } from './types';
import { db } from './dbStore';
import { supabase } from './lib/supabaseClient';
import { safeLocalStorage, safeSessionStorage } from './storagePolyfill';

// Modules components
import BrandSelector from './components/BrandSelector';
import DashboardModule from './components/DashboardModule';
import InventoryModule from './components/InventoryModule';
import SalesModule from './components/SalesModule';
import ReturnModule from './components/ReturnModule';
import PurchaseModule from './components/PurchaseModule';
import BulkUpdateModule from './components/BulkUpdateModule';
import LedgerModule from './components/LedgerModule';
import TransactionsModule from './components/TransactionsModule';
import SettingsModule from './components/SettingsModule';
import OwnerReportsModule from './components/OwnerReportsModule';

// Menu icons
import { 
  CarFront, LayoutDashboard, Layers, ShoppingBag, RotateCcw, 
  FileText, FileSpreadsheet, Users, Terminal, Shield, LogOut, Menu, X, CheckCircle,
  AlertTriangle, RefreshCw, Download, TrendingUp
} from 'lucide-react';

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'failed'>('checking');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<{ schema: string; table: string; operation: string; message: string } | null>(null);
  const [schemaErrors, setSchemaErrors] = useState<Record<string, string>>({});
  const [realtimeStatus, setRealtimeStatus] = useState<'Checking' | 'Connected' | 'Disabled' | 'Failed'>('Checking');

  // Brand selection
  const [activeBrand, setActiveBrand] = useState<Brand | null>(null);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);

  // Active module routing
  const [activeModule, setActiveModule] = useState<string>('Dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Progressive Web App (PWA) installation state & triggers
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowInstallBtn(false);
      console.log('⚡ [Sparezy PWA] App installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Initial check for standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setShowInstallBtn(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`⚡ [Sparezy PWA] Installation response outcome: ${outcome}`);
    } catch (err) {
      console.warn('⚡ [Sparezy PWA] Prompt confirmation error:', err);
    }
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  useEffect(() => {
    const checkSessionAndInitialize = async () => {
      // If there is no active tab-bound session, clear the previous login to enforce logout-on-close
      const isNewSession = !safeSessionStorage.getItem('sparezy_session_active');
      let otherTabExists = false;

      if (isNewSession) {
        // Broadcast to check if any other tab of this origin is currently active
        try {
          const bc = new BroadcastChannel('sparezy_session_channel');
          const checkPromise = new Promise<boolean>((resolve) => {
            let receivedPong = false;
            bc.onmessage = (event) => {
              if (event.data === 'pong') {
                receivedPong = true;
                resolve(true);
              }
            };
            bc.postMessage('ping');
            setTimeout(() => {
              if (!receivedPong) resolve(false);
            }, 150);
          });
          otherTabExists = await checkPromise;
          bc.close();
        } catch (e) {
          console.warn("BroadcastChannel check failed or not supported:", e);
        }

        // If no other tab is alive, then the entire app has just been launched cold - enforce logout-on-close
        if (!otherTabExists) {
          console.log("App opened cold or no previous active sessions exist. Enforcing logout on fresh launch.");
          db.setActiveBrand(null);
          db.setActiveUser(null);
          if (supabase) {
            try {
              await supabase.auth.signOut();
            } catch (e) {
              console.warn("Failed to sign out from Supabase on session start:", e);
            }
          }
        }
        safeSessionStorage.setItem('sparezy_session_active', 'true');
      }
      
      // Bootstrap db keys and active brand on load
      await db.initialize();
      handleSync();
    };

    const handleSync = () => {
      setConnectionStatus(db.getConnectionStatus());
      setConnectionError(db.getConnectionError());
      setDbError(db.getLastError());
      setSchemaErrors({ ...db.getActiveSchemaErrors() });
      setRealtimeStatus(db.getDiagnostics().realtimeStatus);
      
      const brand = db.getActiveBrand();
      const user = db.getActiveUser();
      if (user && user.status === 'Active') {
        setActiveUser(user);
        if (brand) {
          setActiveBrand(brand);
        } else {
          setActiveBrand(null);
        }
      } else {
        setActiveBrand(null);
        setActiveUser(null);
      }
    };

    // Long-lived BroadcastChannel responder to let other new tabs know of our active session
    let sessionResponder: BroadcastChannel | null = null;
    try {
      sessionResponder = new BroadcastChannel('sparezy_session_channel');
      sessionResponder.onmessage = (event) => {
        if (event.data === 'ping') {
          sessionResponder?.postMessage('pong');
        }
      };
    } catch (e) {
      console.warn("Failed to initialize session BroadcastChannel responder:", e);
    }

    checkSessionAndInitialize();
    
    const unsubscribe = db.subscribe(handleSync);
    
    return () => {
      unsubscribe();
      if (sessionResponder) {
        sessionResponder.close();
      }
    };
  }, []);

  // Automated background real-time synchronization without user disruption
  useEffect(() => {
    if (!activeUser || !activeBrand) return;

    let isSyncingInBackground = false;
    let lastFocusSyncTime = 0;

    const silentSync = async (force: boolean = false) => {
      if (isSyncingInBackground) return;
      isSyncingInBackground = true;
      try {
        await db.refreshAllData(activeBrand, force);
      } catch (err) {
        console.warn("[Background Sync] Silent database refresh notice:", err);
      } finally {
        isSyncingInBackground = false;
      }
    };

    // 1. Periodic silent background sync every 60 seconds (optimized from 8 seconds)
    const intervalId = setInterval(() => {
      // Only sync if tab is currently visible and device is online
      if (document.visibilityState === 'visible' && navigator.onLine) {
        silentSync();
      }
    }, 60000);

    // 2. Tab Visibility Focus Sync: Sync immediately on tab focus with a 30-second throttle
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFocusSyncTime > 30000) {
        lastFocusSyncTime = Date.now();
        silentSync();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // 3. Tab-to-Tab Instant Sync Broadcast Channel
    let syncChannel: BroadcastChannel | null = null;
    try {
      syncChannel = new BroadcastChannel('sparezy_data_sync_channel');
      syncChannel.onmessage = (event) => {
        if (event.data === 'sync_trigger') {
          console.log("⚡ [Data Sync Channel] Mutation signal received from other tab. Syncing silently...");
          silentSync(true); // Force sync if triggered by another tab's mutation
        }
      };
    } catch (e) {
      console.warn("Failed to initialize data sync BroadcastChannel:", e);
    }

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (syncChannel) {
        syncChannel.close();
      }
    };
  }, [activeUser, activeBrand]);

  // 20 minutes inactivity timeout logic (synchronized across tabs/sessions via localStorage)
  useEffect(() => {
    if (!activeUser) return;

    const KEY_LAST_ACTIVITY = 'sparezy_last_activity';

    // Seed the initial activity key if not set
    if (!safeLocalStorage.getItem(KEY_LAST_ACTIVITY)) {
      safeLocalStorage.setItem(KEY_LAST_ACTIVITY, Date.now().toString());
    }

    const resetTimer = () => {
      safeLocalStorage.setItem(KEY_LAST_ACTIVITY, Date.now().toString());
    };

    // Interaction events to monitor for main user activity
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click', 'pointerdown'];
    
    const eventHandler = () => resetTimer();

    activityEvents.forEach(event => {
      window.addEventListener(event, eventHandler, { passive: true });
    });

    // Check every 5 seconds if the last logged activity across ALL system tabs is > 20 minutes
    const checkInterval = setInterval(() => {
      const lastActivity = Number(safeLocalStorage.getItem(KEY_LAST_ACTIVITY) || Date.now());
      const idleTime = Date.now() - lastActivity;
      if (idleTime > 20 * 60 * 1000) {
        console.log("Inactivity logout triggered after 20 minutes of idle time.");
        handleLogout();
      }
    }, 5000);

    // Also check immediately when the user focuses/moves back to this window (since background tabs get suspended)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const lastActivity = Number(safeLocalStorage.getItem(KEY_LAST_ACTIVITY) || Date.now());
        const idleTime = Date.now() - lastActivity;
        if (idleTime > 20 * 60 * 1000) {
          console.log("Inactivity logout triggered on tab focus.");
          handleLogout();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(checkInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      activityEvents.forEach(event => {
        window.removeEventListener(event, eventHandler);
      });
    };
  }, [activeUser]);

  // Lock Manager role to Inventory module exclusively
  useEffect(() => {
    if (activeUser && activeUser.role === 'Manager' && activeModule !== 'Inventory') {
      setActiveModule('Inventory');
    }
  }, [activeUser, activeModule]);

  const handleBrandSelect = async (brand: Brand, user: User) => {
    // Set active brand and user immediately to jump-start navigation instantly
    db.setActiveUser(user);
    db.setActiveBrand(brand);
    setActiveBrand(brand);
    setActiveUser(user);
    setActiveModule(user.role === 'Manager' ? 'Inventory' : 'Dashboard');

    // Lazily load the brand's dataset partitions in the background without blocking the screen
    try {
      await db.loadBrandData(brand);
    } catch (err) {
      console.error("Error loading brand schema dynamic partition in background:", err);
    }
  };

  const handleLogout = async () => {
    db.setActiveBrand(null);
    db.setActiveUser(null);
    if (supabase) {
      await supabase.auth.signOut();
    }
    setActiveBrand(null);
    setActiveUser(null);
    setIsMobileMenuOpen(false);
  };

  const handleGlobalRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await db.refreshAllData(activeBrand);
      // Brief aesthetic timeout for spin feedback
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error("Global refresh failed:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 10 modules routing translation
  const sidebarItems = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Inventory', icon: Layers },
    { name: 'Sales', icon: ShoppingBag },
    { name: 'Returns', icon: RotateCcw },
    { name: 'Purchases', icon: FileText },
    { name: 'Owner Reports', icon: TrendingUp, ownerOnly: true },
    { name: 'Bulk Updates', icon: FileSpreadsheet, ownerOnly: true },
    { name: 'Customer & Dealer Ledgers', icon: Users },
    { name: 'Transaction Records', icon: Terminal, ownerOnly: true },
    { name: 'Settings / User Management', icon: Shield, ownerOnly: true },
  ].filter(item => {
    if (activeUser && activeUser.role === 'Manager') {
      return item.name === 'Inventory';
    }
    return true;
  });

  const renderModuleContent = () => {
    if (!activeBrand || !activeUser) return null;

    switch (activeModule) {
      case 'Dashboard':
        return (
          <DashboardModule 
            brand={activeBrand} 
            user={activeUser} 
            onNavigateToModule={(mod) => {
              if (mod === 'Ledgers' || mod === 'Customer Ledger') {
                setActiveModule('Customer & Dealer Ledgers');
              } else {
                setActiveModule(mod);
              }
            }} 
          />
        );
      case 'Inventory':
        return <InventoryModule brand={activeBrand} user={activeUser} />;
      case 'Sales':
        return <SalesModule brand={activeBrand} user={activeUser} />;
      case 'Returns':
        return <ReturnModule brand={activeBrand} user={activeUser} />;
      case 'Purchases':
        return <PurchaseModule brand={activeBrand} user={activeUser} />;
      case 'Owner Reports':
        if (activeUser.role !== 'Owner') {
          return <DashboardModule brand={activeBrand} user={activeUser} onNavigateToModule={setActiveModule} />;
        }
        return <OwnerReportsModule brand={activeBrand} user={activeUser} />;
      case 'Bulk Updates':
        return <BulkUpdateModule brand={activeBrand} user={activeUser} />;
      case 'Customer & Dealer Ledgers':
        return <LedgerModule brand={activeBrand} user={activeUser} />;
      case 'Transaction Records':
        return <TransactionsModule brand={activeBrand} user={activeUser} />;
      case 'Settings / User Management':
        if (activeUser.role !== 'Owner') {
          return <DashboardModule brand={activeBrand} user={activeUser} onNavigateToModule={setActiveModule} />;
        }
        return <SettingsModule brand={activeBrand} user={activeUser} />;
      default:
        return <DashboardModule brand={activeBrand} user={activeUser} onNavigateToModule={setActiveModule} />;
    }
  };

  // Connection status screen
  if (connectionStatus === 'failed') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-xs">
        <div className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-600"></div>
          
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-base font-bold tracking-tight text-white">Supabase Connection Failed</h2>
              <p className="text-slate-400 text-[11px]">Sparezy is running in strict live-only mode and requires Supabase.</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 font-mono text-[10.5px] text-slate-350">
            <p className="font-bold text-rose-400">Diagnosis Alert:</p>
            <p className="whitespace-pre-wrap select-text leading-relaxed">
              {connectionError || "Could not resolve hostname or initialize standard REST endpoints."}
            </p>
          </div>

          <div className="space-y-3 pt-1 text-slate-400 leading-snug text-xs">
            <p className="font-semibold text-white">How to restore connection:</p>
            <ul className="list-disc leading-relaxed pl-5 space-y-1 text-[11px]">
              <li>Configure <code className="text-indigo-400 bg-slate-900 px-1 py-0.5 rounded font-bold">VITE_SUPABASE_URL</code> &amp; <code className="text-indigo-400 bg-slate-900 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code>.</li>
              <li>Execute the <code className="text-indigo-400 bg-slate-900 px-1 py-0.5 rounded">supabase_schema.sql</code> file migrations for roles and multi-schema structures.</li>
              <li>Wait while your virtual networks restart.</li>
            </ul>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-2xl transition cursor-pointer text-center text-xs flex items-center justify-center gap-2 font-sans"
          >
            <RefreshCw className="w-4 h-4" />
            Re-test Server Connection
          </button>
        </div>
      </div>
    );
  }



  // Loading schema feedback
  if (loadingSchema) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
        <div className="text-center">
          <p className="font-bold text-slate-805 text-sm">Securing Supabase SSL Tunnel...</p>
          <p className="text-xs text-slate-400 mt-1">Lazy-loading brand dataset partitions in isolated schemas.</p>
        </div>
      </div>
    );
  }

  // Gate entrance if mock auth didn't sign in yet
  if (!activeBrand || !activeUser) {
    return (
      <BrandSelector 
        activeUser={activeUser}
        onSelect={handleBrandSelect} 
        onLogout={handleLogout}
      />
    );
  }

  const renderRealtimeBadge = () => {
    let bgClass = "bg-amber-50 text-amber-700 border-amber-200/60";
    let pulseClass = "bg-amber-400";
    let dotClass = "bg-amber-500";
    let statusText = "Realtime Checking";
    let showPulse = true;

    if (realtimeStatus === 'Connected') {
      bgClass = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
      pulseClass = "bg-emerald-400";
      dotClass = "bg-emerald-500";
      statusText = "Realtime Connected";
      showPulse = true;
    } else if (realtimeStatus === 'Failed') {
      bgClass = "bg-rose-50 text-rose-700 border-rose-200/60";
      pulseClass = "bg-rose-400";
      dotClass = "bg-rose-500";
      statusText = "Realtime Failed";
      showPulse = false;
    } else if (realtimeStatus === 'Disabled') {
      bgClass = "bg-slate-100 text-slate-600 border-slate-200";
      pulseClass = "bg-slate-300";
      dotClass = "bg-slate-400";
      statusText = "Realtime Offline";
      showPulse = false;
    }

    return (
      <div 
        id="realtime-status-pill"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all duration-300 shadow-xs ${bgClass}`}
      >
        <span className="relative flex h-2 w-2">
          {showPulse && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pulseClass}`}></span>
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`}></span>
        </span>
        <span className="tracking-wide uppercase text-[9px]">{statusText}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans text-xs flex overflow-hidden h-screen">

      {/* 1. LEFT SIDEBAR (Desktop view) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-slate-900 text-slate-350 border-r border-slate-800 shrink-0">
        
        {/* Brand identity logo matching design html exactly */}
        <div className="p-6 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white text-sm">
            S
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">Sparezy MIS</h1>
        </div>

        {/* Navigation list in slate-900 sidebar */}
        <nav className="flex-1 px-4 space-y-1 text-sm overflow-y-auto">
          {sidebarItems.map((item) => {
            if (item.ownerOnly && activeUser.role !== 'Owner') return null;
            const Icon = item.icon;
            const isSelected = activeModule === item.name;

            return (
              <button
                key={item.name}
                onClick={() => {
                  setActiveModule(item.name);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all cursor-pointer font-medium ${
                  isSelected 
                    ? 'bg-indigo-600/20 text-indigo-450 text-indigo-400 border-indigo-600/30' 
                    : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer info user card block with switch brand logout trigger */}
        <div className="p-4 bg-slate-950/50 m-4 rounded-xl space-y-3 shrink-0">
          {showInstallBtn && (
            <button
              onClick={handleInstallClick}
              className="w-full bg-gradient-to-r from-indigo-500 to-indigo-650 hover:from-indigo-600 hover:to-indigo-700 text-white py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all duration-200 text-[10px] font-bold cursor-pointer border border-indigo-505/30 shadow-lg shadow-indigo-950/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install Sparezy App</span>
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {activeUser.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="min-w-0">
              <div className="text-xs text-white font-semibold uppercase truncate">{activeUser.role}</div>
              <div className="text-[10px] text-slate-500 truncate">{activeUser.name}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition text-[10px] font-bold cursor-pointer border border-slate-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            Switch Brand
          </button>
        </div>

      </aside>

      {/* 2. MAIN LAYOUT AND HEADER CONTROLS */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* TOP HEADER */}
        <header className="h-20 bg-white border-b border-slate-200 px-6 sm:px-8 flex items-center justify-between sticky top-0 z-40 shrink-0">
          
          <div className="flex items-center gap-4 lg:gap-6">
            {/* Hamburger button on mobile */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 border border-slate-200 hover:bg-slate-50 rounded-lg lg:hidden text-slate-650 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Interactive brand switcher matching design html */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => {
                  if (activeBrand !== 'Hyundai') {
                    handleBrandSelect('Hyundai', activeUser);
                  }
                }}
                className={`px-4 sm:px-6 py-2 rounded-md font-semibold text-xs transition duration-150 ${
                  activeBrand === 'Hyundai'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                    : 'text-slate-500 font-medium hover:text-slate-800 cursor-pointer'
                }`}
              >
                Hyundai
              </button>
              <button 
                onClick={() => {
                  if (activeBrand !== 'Mahindra') {
                    handleBrandSelect('Mahindra', activeUser);
                  }
                }}
                className={`px-4 sm:px-6 py-2 rounded-md font-semibold text-xs transition duration-150 ${
                  activeBrand === 'Mahindra'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                    : 'text-slate-500 font-medium hover:text-slate-800 cursor-pointer'
                }`}
              >
                Mahindra
              </button>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mr-1">
                Active Schema Model
              </span>
              {renderRealtimeBadge()}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="md:hidden">
              {renderRealtimeBadge()}
            </div>
            
            {/* Global Refresh Sync Button */}
            <button
              id="global-refresh-button"
              onClick={handleGlobalRefresh}
              disabled={isRefreshing}
              title="Sync & refresh all databases"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs hover:border-slate-300 transition duration-150 cursor-pointer disabled:opacity-60 active:scale-95`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isRefreshing ? 'Syncing...' : 'Sync'}</span>
            </button>

            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
              <span className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse"></span>
              {activeUser.role} Session Active
            </span>
            <div className="text-right shrink-0">
              <p className="font-bold text-slate-900 text-xs leading-tight">{activeUser.name}</p>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">{activeUser.role} Account</p>
            </div>
          </div>

        </header>

        {/* 3. WORKING MODULE BOX BODY WITH HIDDEN OVERFLOW FOR GEOMETRIC DISCIPLINE */}
        <main className="flex-1 w-full overflow-y-auto bg-[#F8FAFC]">
          {Object.entries(schemaErrors).map(([key, errMsg]) => (
            <div key={key} className="bg-rose-50 border-b border-rose-200 px-6 sm:px-8 py-3 flex items-center justify-between text-xs text-rose-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>Configuration Error [{key}]:</strong> {errMsg}
                </span>
              </div>
              {activeUser.role === 'Owner' ? (
                <button
                  onClick={() => {
                    setActiveModule('Settings / User Management');
                  }}
                  className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                >
                  Inspect Diagnostics &amp; Solution
                </button>
              ) : (
                <span className="text-slate-400 italic">Please contact your Owner to configure credentials.</span>
              )}
            </div>
          ))}
          <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            {renderModuleContent()}
          </div>
        </main>

      </div>

      {/* 4. MOBILE HAMBURGER DRAWER */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden no-print">
          
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>

          {/* Sidebar Paper */}
          <div className="relative flex flex-col w-full max-w-xs bg-slate-900 text-slate-350 transform transition duration-300">
            
            {/* Close button inside rail */}
            <div className="p-6 flex items-center justify-between border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-extrabold text-sm">
                  S
                </div>
                <div>
                  <span className="font-extrabold text-slate-50 text-xs">Sparezy MIS</span>
                  <span className="text-[9px] text-slate-500 block leading-none">{activeBrand}</span>
                </div>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-850 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Links list */}
            <nav className="flex-1 px-4 py-4 space-y-1 font-bold text-xs overflow-y-auto">
              {sidebarItems.map((item) => {
                if (item.ownerOnly && activeUser.role !== 'Owner') return null;
                const Icon = item.icon;
                const isSelected = activeModule === item.name;

                return (
                  <button
                    key={item.name}
                    onClick={() => {
                      setActiveModule(item.name);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all cursor-pointer text-sm font-medium ${
                      isSelected 
                        ? 'bg-indigo-600/20 text-indigo-400 border-indigo-600/30' 
                        : 'text-slate-400 border-transparent hover:bg-slate-805 hover:text-slate-105'
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </nav>

            {/* Footer switcher */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-xs text-center space-y-2">
              <p className="text-slate-405 text-[11px]">Role: {activeUser.name} ({activeUser.role})</p>
              {showInstallBtn && (
                <button
                  onClick={handleInstallClick}
                  className="w-full bg-gradient-to-r from-indigo-500 to-indigo-650 hover:from-indigo-600 hover:to-indigo-700 text-white py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all duration-200 text-[11px] font-bold cursor-pointer border border-indigo-505/30 shadow-lg shadow-indigo-950/40 mb-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Install Sparezy App</span>
                </button>
              )}
              <button
                onClick={handleLogout}
                className="w-full bg-slate-800 hover:bg-slate-755 text-white py-2 rounded-xl flex items-center justify-center gap-1"
              >
                <LogOut className="w-4 h-4" />
                Change Brand Database
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
