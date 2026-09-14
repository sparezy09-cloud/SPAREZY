import React, { useState, useMemo, useEffect, Fragment } from 'react';
import { Brand, User, UserRole, TransactionLog, Sale, Purchase, ReturnRecord, SaleItem, PurchaseItem } from '../types';
import { db } from '../dbStore';
import { 
  Terminal, ShieldAlert, Eye, EyeOff, Search, Filter, Download, 
  RefreshCw, ArrowUpRight, ArrowDownRight, ShoppingBag, FileText, 
  RotateCcw, Layers, ShieldCheck, UserCheck, Calendar, X, 
  CheckCircle2, Clock, Printer, Receipt, Users, AlertCircle, FileSpreadsheet
} from 'lucide-react';

interface TransactionsModuleProps {
  brand: Brand;
  user: User;
}

export type UnifiedTransactionType = 'Sale' | 'Purchase' | 'Return' | 'Bulk Update' | 'System Action';

export interface UnifiedTransaction {
  id: string;
  type: UnifiedTransactionType;
  brand: Brand;
  date: string; // ISO string
  operatorName: string;
  operatorRole: UserRole; // 'Owner' | 'Manager'
  reference: string;
  partyName?: string;
  category?: string;
  amount?: number;
  itemCount?: number;
  paymentStatus?: string;
  summary: string;
  details: {
    sale?: Sale;
    saleItems?: SaleItem[];
    purchase?: Purchase;
    purchaseItems?: PurchaseItem[];
    returnRecord?: ReturnRecord;
    log?: TransactionLog;
  };
}

export default function TransactionsModule({ brand, user }: TransactionsModuleProps) {
  const [selectedBrand, setSelectedBrand] = useState<'All' | Brand>('All');
  const [selectedRole, setSelectedRole] = useState<'All' | 'Manager' | 'Owner'>('All');
  const [selectedOperator, setSelectedOperator] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<'All' | UnifiedTransactionType>('All');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [search, setSearch] = useState('');
  
  const [inspectingTx, setInspectingTx] = useState<UnifiedTransaction | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Reactive state from dbStore
  const [usersList, setUsersList] = useState<User[]>(() => db.getUsers());
  const [logsList, setLogsList] = useState<TransactionLog[]>(() => db.getLogs());

  // Load all brands data when owner opens this tab
  useEffect(() => {
    let mounted = true;
    const preload = async () => {
      try {
        await db.ensureAllBrandsLoaded();
      } catch (err) {
        console.warn("Preloading brand data error:", err);
      }
    };
    preload();

    const unsub = db.subscribe(() => {
      if (mounted) {
        setUsersList(db.getUsers());
        setLogsList(db.getLogs());
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        db.loadBrandData('Hyundai'),
        db.loadBrandData('Mahindra'),
        db.fetchUsers()
      ]);
    } catch (err) {
      console.warn("Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // User role mapping dictionary
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    usersList.forEach(u => {
      if (u.name) map.set(u.name.toLowerCase().trim(), u);
      if (u.id) map.set(u.id.toLowerCase().trim(), u);
      if (u.email) map.set(u.email.toLowerCase().trim(), u);
    });
    return map;
  }, [usersList]);

  const resolveOperatorRole = (nameOrId?: string): UserRole => {
    if (!nameOrId) return 'Manager';
    const clean = nameOrId.toLowerCase().trim();
    if (clean.includes('(owner)') || clean.includes('owner')) return 'Owner';
    if (clean.includes('(manager)') || clean.includes('manager')) return 'Manager';

    const match = userMap.get(clean);
    if (match) return match.role;

    if (user && user.name.toLowerCase().trim() === clean) {
      return user.role;
    }
    return 'Manager';
  };

  // Aggregated Unified Transactions List across Hyundai, Mahindra, and Global Logs
  const allTransactions = useMemo<UnifiedTransaction[]>(() => {
    const list: UnifiedTransaction[] = [];
    const brandsToQuery: Brand[] = ['Hyundai', 'Mahindra'];

    // 1. Process Sales across brands
    for (const b of brandsToQuery) {
      const sales = db.getSales(b) || [];
      const saleItems = db.getSaleItems(b) || [];

      for (const s of sales) {
        const matchingItems = saleItems.filter(si => si.sale_id === s.id);
        const opName = s.created_by || 'Unknown Operator';
        const opRole = resolveOperatorRole(opName);

        list.push({
          id: `sale-${s.id}`,
          type: 'Sale',
          brand: b,
          date: s.created_at || s.sale_date,
          operatorName: opName,
          operatorRole: opRole,
          reference: `Bill #${s.id.slice(0, 8).toUpperCase()}`,
          partyName: s.customer_name,
          category: s.customer_category,
          amount: s.total_amount,
          itemCount: matchingItems.length || 1,
          paymentStatus: s.payment_status,
          summary: `Billed ${s.customer_category} ${s.customer_name} • Paid ₹${(s.paid_amount || 0).toLocaleString('en-IN')} (Pending ₹${(s.pending_amount || 0).toLocaleString('en-IN')})`,
          details: {
            sale: s,
            saleItems: matchingItems
          }
        });
      }
    }

    // 2. Process Purchases across brands
    for (const b of brandsToQuery) {
      const purchases = db.getPurchases(b) || [];
      const purchaseItems = db.getPurchaseItems(b) || [];

      for (const p of purchases) {
        const matchingItems = purchaseItems.filter(pi => pi.purchase_id === p.id);
        const opName = p.created_by || 'Unknown Operator';
        const opRole = resolveOperatorRole(opName);

        list.push({
          id: `purchase-${p.id}`,
          type: 'Purchase',
          brand: b,
          date: p.created_at || p.invoice_date,
          operatorName: opName,
          operatorRole: opRole,
          reference: p.invoice_no ? `Inv #${p.invoice_no}` : `Pur #${p.id.slice(0, 8).toUpperCase()}`,
          partyName: p.dealer_name,
          category: p.scan_source ? `Scan: ${p.scan_source}` : undefined,
          amount: p.total_after_discount,
          itemCount: matchingItems.length || 1,
          summary: `Stock inwarded from dealer ${p.dealer_name} • Discount ${p.dealer_discount_percentage}% (Saved ₹${(p.discount_amount || 0).toLocaleString('en-IN')})`,
          details: {
            purchase: p,
            purchaseItems: matchingItems
          }
        });
      }
    }

    // 3. Process Customer Returns across brands
    for (const b of brandsToQuery) {
      const returns = db.getReturns(b) || [];
      for (const r of returns) {
        const opName = r.created_by || 'Unknown Operator';
        const opRole = resolveOperatorRole(opName);

        list.push({
          id: `return-${r.id}`,
          type: 'Return',
          brand: b,
          date: r.return_date,
          operatorName: opName,
          operatorRole: opRole,
          reference: `Return #${r.id.slice(0, 8).toUpperCase()}`,
          partyName: r.part_no,
          amount: -Math.abs(r.refund_amount || 0),
          itemCount: r.returned_quantity,
          summary: `Customer return processed: ${r.returned_quantity}x part ${r.part_no} (${r.part_name || ''}) • Refund ₹${r.refund_amount.toLocaleString('en-IN')}`,
          details: {
            returnRecord: r
          }
        });
      }
    }

    // 4. Process System, Inventory, and Bulk Operation Activity Logs
    for (const log of logsList) {
      // Avoid duplicate display of pure sale/purchase creation if already listed above
      if (log.module_name === 'Sales' && (log.action_type.includes('Create') || log.action_type === 'Sale')) {
        continue;
      }
      if (log.module_name === 'Purchases' && (log.action_type.includes('Create') || log.action_type === 'Purchase')) {
        continue;
      }
      if (log.module_name === 'Returns' && log.action_type.includes('Sale Return')) {
        continue;
      }

      const opName = log.user_name || 'System Operator';
      const opRole = resolveOperatorRole(opName);
      const isBulk = log.module_name === 'Bulk Updates' || log.action_type.toLowerCase().includes('bulk');

      list.push({
        id: `log-${log.id}`,
        type: isBulk ? 'Bulk Update' : 'System Action',
        brand: brand,
        date: log.created_at,
        operatorName: opName,
        operatorRole: opRole,
        reference: log.action_type,
        partyName: log.module_name,
        summary: log.description,
        details: {
          log
        }
      });
    }

    // Sort strictly chronological, newest first
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  }, [brand, logsList, userMap, usersList]);

  // Distinct Operators List for filter dropdown
  const distinctOperators = useMemo(() => {
    const set = new Set<string>();
    allTransactions.forEach(t => {
      if (t.operatorName) set.add(t.operatorName);
    });
    return Array.from(set).sort();
  }, [allTransactions]);

  // Filter application
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOf7Days = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOf30Days = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

    return allTransactions.filter(t => {
      // 1. Brand Filter
      if (selectedBrand !== 'All' && t.brand !== selectedBrand) return false;

      // 2. Role Filter (Manager vs Owner)
      if (selectedRole !== 'All' && t.operatorRole !== selectedRole) return false;

      // 3. Specific Operator Filter
      if (selectedOperator !== 'All' && t.operatorName !== selectedOperator) return false;

      // 4. Transaction Type Filter
      if (selectedType !== 'All' && t.type !== selectedType) return false;

      // 5. Date Filter
      const tDate = new Date(t.date);
      if (dateFilter === 'today' && tDate < startOfToday) return false;
      if (dateFilter === 'yesterday') {
        if (tDate < startOfYesterday || tDate >= startOfToday) return false;
      }
      if (dateFilter === '7days' && tDate < startOf7Days) return false;
      if (dateFilter === '30days' && tDate < startOf30Days) return false;
      if (dateFilter === 'custom' && customDate) {
        const itemDateStr = t.date.slice(0, 10);
        if (itemDateStr !== customDate) return false;
      }

      // 6. Text Search Filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches = 
          t.operatorName.toLowerCase().includes(q) ||
          t.reference.toLowerCase().includes(q) ||
          (t.partyName && t.partyName.toLowerCase().includes(q)) ||
          t.summary.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q) ||
          (t.category && t.category.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [allTransactions, selectedBrand, selectedRole, selectedOperator, selectedType, dateFilter, customDate, search]);

  // Executive KPI summary calculations
  const stats = useMemo(() => {
    let managerCount = 0;
    let ownerCount = 0;
    let totalSalesVal = 0;
    let managerSalesVal = 0;
    let ownerSalesVal = 0;

    let totalPurchaseVal = 0;
    let managerPurchaseVal = 0;
    let ownerPurchaseVal = 0;

    let totalReturnsVal = 0;

    filteredTransactions.forEach(t => {
      if (t.operatorRole === 'Manager') {
        managerCount++;
      } else {
        ownerCount++;
      }

      if (t.type === 'Sale' && t.amount) {
        totalSalesVal += t.amount;
        if (t.operatorRole === 'Manager') managerSalesVal += t.amount;
        else ownerSalesVal += t.amount;
      }

      if (t.type === 'Purchase' && t.amount) {
        totalPurchaseVal += t.amount;
        if (t.operatorRole === 'Manager') managerPurchaseVal += t.amount;
        else ownerPurchaseVal += t.amount;
      }

      if (t.type === 'Return' && t.amount) {
        totalReturnsVal += Math.abs(t.amount);
      }
    });

    const totalCount = filteredTransactions.length;
    const managerRatio = totalCount > 0 ? Math.round((managerCount / totalCount) * 100) : 0;
    const ownerRatio = totalCount > 0 ? 100 - managerRatio : 0;

    return {
      totalCount,
      managerCount,
      ownerCount,
      managerRatio,
      ownerRatio,
      totalSalesVal,
      managerSalesVal,
      ownerSalesVal,
      totalPurchaseVal,
      managerPurchaseVal,
      ownerPurchaseVal,
      totalReturnsVal
    };
  }, [filteredTransactions]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert("No transactions match the selected filter criteria to export.");
      return;
    }

    const headers = [
      'Transaction ID',
      'Date & Time',
      'Brand',
      'Transaction Type',
      'Operator Name',
      'Operator Role',
      'Reference / Invoice #',
      'Party (Customer / Dealer)',
      'Category',
      'Financial Amount (INR)',
      'Payment / Status',
      'Event Description'
    ];

    const rows = filteredTransactions.map(t => [
      t.id,
      `"${new Date(t.date).toLocaleString('en-IN')}"`,
      t.brand,
      t.type,
      `"${t.operatorName.replace(/"/g, '""')}"`,
      t.operatorRole,
      `"${t.reference.replace(/"/g, '""')}"`,
      `"${(t.partyName || '').replace(/"/g, '""')}"`,
      `"${(t.category || '').replace(/"/g, '""')}"`,
      t.amount !== undefined ? t.amount : '',
      `"${(t.paymentStatus || '').replace(/"/g, '""')}"`,
      `"${t.summary.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sparezy_Owner_Transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // STRICT ACCESS DENIED SCREEN FOR NON-OWNER
  if (user.role !== 'Owner') {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-8 rounded-3xl max-w-2xl mx-auto space-y-4 my-10 shadow-lg text-xs font-semibold">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-600">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-rose-950 flex items-center gap-2">
            Access Restricted &mdash; Owner Exclusive Portal
          </h3>
          <p className="font-normal text-slate-600 text-xs mt-1.5 leading-relaxed">
            The <strong>Owner Transactions</strong> tab is strictly guarded. It provides master managerial oversight into every website billing, inward purchase invoice, stock return, and database change performed by staff members across all dealership instances.
          </p>
        </div>

        <div className="bg-white/80 border border-rose-200 p-3.5 rounded-xl text-slate-700 flex items-center justify-between text-[11px]">
          <div>
            <span className="text-slate-400 uppercase font-black tracking-wider text-[9px] block">Current Authenticated Session</span>
            <span className="font-bold text-slate-900">{user.name}</span> &bull; <span className="text-amber-700 font-bold">{user.role}</span>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-black text-[10px] uppercase tracking-wider">
            Permission Blocked
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* TOP HEADER SECTION */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-indigo-600" />
              Owner Exclusive Audit Tab
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-500 bg-slate-100">
              Live Cross-Brand Telemetry
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            Website Transactions Oversight
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Complete audit register of all business transactions (Sales, Purchases, Returns) and system actions executed by <strong>Managers</strong> and <strong>Owners</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Reload latest live records from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Database'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            title="Download CSV report of current filtered transactions"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* EXECUTIVE KPI SUMMARY CARDS FOR OWNER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        
        {/* Total Transactions & Staff Split */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 uppercase font-black text-[10px]">
            <span>Total Transactions</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {stats.totalCount.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-slate-500 font-semibold">actions logged</span>
          </div>

          {/* Visual Ratio Bar */}
          <div className="space-y-1 pt-1">
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
              <div 
                style={{ width: `${stats.managerRatio}%` }} 
                className="bg-amber-500 h-full transition-all" 
                title={`Managers: ${stats.managerCount} (${stats.managerRatio}%)`}
              />
              <div 
                style={{ width: `${stats.ownerRatio}%` }} 
                className="bg-indigo-600 h-full transition-all" 
                title={`Owners: ${stats.ownerCount} (${stats.ownerRatio}%)`}
              />
            </div>
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-amber-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Managers: {stats.managerCount} ({stats.managerRatio}%)
              </span>
              <span className="text-indigo-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                Owners: {stats.ownerCount} ({stats.ownerRatio}%)
              </span>
            </div>
          </div>
        </div>

        {/* Sales Processed */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 uppercase font-black text-[10px]">
            <span>Sales Billing Value</span>
            <ShoppingBag className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 font-mono">
              ₹{stats.totalSalesVal.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-medium space-y-0.5 pt-0.5">
            <div className="flex justify-between">
              <span>By Managers:</span>
              <span className="font-bold text-slate-800">₹{stats.managerSalesVal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between">
              <span>By Owners:</span>
              <span className="font-bold text-slate-800">₹{stats.ownerSalesVal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Purchases Inwarded */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 uppercase font-black text-[10px]">
            <span>Purchases Inwarded</span>
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-blue-600 font-mono">
              ₹{stats.totalPurchaseVal.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-medium space-y-0.5 pt-0.5">
            <div className="flex justify-between">
              <span>By Managers:</span>
              <span className="font-bold text-slate-800">₹{stats.managerPurchaseVal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between">
              <span>By Owners:</span>
              <span className="font-bold text-slate-800">₹{stats.ownerPurchaseVal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Customer Returns */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 uppercase font-black text-[10px]">
            <span>Customer Returns</span>
            <RotateCcw className="w-4 h-4 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600 font-mono">
              ₹{stats.totalReturnsVal.toLocaleString('en-IN')}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium mt-1">
            Refunds issued on returned defective or excess inventory parts.
          </p>
        </div>

      </div>

      {/* MULTI-CRITERIA FILTER BAR */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        
        {/* Top Filter Row: Search & Role Quick Toggles */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by staff name, invoice #, customer, dealer, part number, or description..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-xs font-semibold text-slate-800 transition outline-hidden"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Role Segment: All vs Managers vs Owners */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0 self-start lg:self-auto text-xs font-bold">
            <button
              onClick={() => setSelectedRole('All')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedRole === 'All' 
                  ? 'bg-white text-slate-900 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Roles ({allTransactions.length})
            </button>
            <button
              onClick={() => setSelectedRole('Manager')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                selectedRole === 'Manager' 
                  ? 'bg-amber-500 text-white shadow-xs font-black' 
                  : 'text-amber-800 hover:text-amber-900'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${selectedRole === 'Manager' ? 'bg-white' : 'bg-amber-500'}`} />
              Managers Only
            </button>
            <button
              onClick={() => setSelectedRole('Owner')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                selectedRole === 'Owner' 
                  ? 'bg-indigo-600 text-white shadow-xs font-black' 
                  : 'text-indigo-800 hover:text-indigo-900'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${selectedRole === 'Owner' ? 'bg-white' : 'bg-indigo-600'}`} />
              Owners Only
            </button>
          </div>

        </div>

        {/* Secondary Filter Selectors: Brand, Specific Staff, Type, Date */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1 border-t border-slate-100">
          
          {/* Brand Filter */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Dealership Brand
            </label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-1.5 px-2.5 rounded-xl font-semibold focus:bg-white cursor-pointer"
            >
              <option value="All">All Brands (Hyundai + Mahindra)</option>
              <option value="Hyundai">Hyundai Dealership</option>
              <option value="Mahindra">Mahindra Dealership</option>
            </select>
          </div>

          {/* Specific Operator Dropdown */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Filter by Staff Member
            </label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-1.5 px-2.5 rounded-xl font-semibold focus:bg-white cursor-pointer"
            >
              <option value="All">All Operators ({distinctOperators.length})</option>
              {distinctOperators.map(op => {
                const role = resolveOperatorRole(op);
                return (
                  <option key={op} value={op}>
                    {op} ({role})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Transaction Type Filter */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Transaction Class
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-1.5 px-2.5 rounded-xl font-semibold focus:bg-white cursor-pointer"
            >
              <option value="All">All Activity Classes</option>
              <option value="Sale">Sales (Customer Billing)</option>
              <option value="Purchase">Purchases (Stock Inwards)</option>
              <option value="Return">Returns &amp; Refunds</option>
              <option value="Bulk Update">Bulk Excel Updates</option>
              <option value="System Action">System / Inventory Logs</option>
            </select>
          </div>

          {/* Date Range Selector */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Date Timeline
            </label>
            <div className="flex gap-1.5">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-1.5 px-2.5 rounded-xl font-semibold focus:bg-white cursor-pointer"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="custom">Custom Date</option>
              </select>

              {dateFilter === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-800 py-1 px-2 rounded-xl text-xs font-semibold"
                />
              )}
            </div>
          </div>

        </div>

        {/* Active Filter Chips / Reset */}
        {(selectedBrand !== 'All' || selectedRole !== 'All' || selectedOperator !== 'All' || selectedType !== 'All' || dateFilter !== 'all' || search) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] text-slate-500 font-medium">
            <span>Active Filters:</span>
            {selectedBrand !== 'All' && (
              <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold">
                Brand: {selectedBrand}
                <button onClick={() => setSelectedBrand('All')} className="hover:text-indigo-900 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedRole !== 'All' && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md font-bold">
                Role: {selectedRole}
                <button onClick={() => setSelectedRole('All')} className="hover:text-amber-900 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedOperator !== 'All' && (
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md font-bold">
                Operator: {selectedOperator}
                <button onClick={() => setSelectedOperator('All')} className="hover:text-slate-900 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedType !== 'All' && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-bold">
                Type: {selectedType}
                <button onClick={() => setSelectedType('All')} className="hover:text-blue-900 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {dateFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-bold">
                Timeline: {dateFilter} {customDate && `(${customDate})`}
                <button onClick={() => { setDateFilter('all'); setCustomDate(''); }} className="hover:text-emerald-900 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {search && (
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                Search: &quot;{search}&quot;
                <button onClick={() => setSearch('')} className="hover:text-slate-900 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            <button
              onClick={() => {
                setSelectedBrand('All');
                setSelectedRole('All');
                setSelectedOperator('All');
                setSelectedType('All');
                setDateFilter('all');
                setCustomDate('');
                setSearch('');
              }}
              className="text-rose-600 hover:text-rose-800 font-bold ml-2 underline cursor-pointer"
            >
              Clear All Filters
            </button>
          </div>
        )}

      </div>

      {/* MASTER TRANSACTIONS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="font-bold text-slate-700 flex items-center gap-2">
            <span>Displaying {filteredTransactions.length} of {allTransactions.length} Recorded Transactions</span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
            Sorted Chronologically (Latest First)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider border-b border-slate-200">
                <th className="p-3 pl-4 font-black">Date &amp; Time</th>
                <th className="p-3 font-black">Brand</th>
                <th className="p-3 font-black">Type &amp; Reference</th>
                <th className="p-3 font-black">Staff Operator</th>
                <th className="p-3 font-black">Party / Description</th>
                <th className="p-3 font-black text-right">Financial Valuation</th>
                <th className="p-3 pr-4 font-black text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredTransactions.map((tx) => {
                const isManager = tx.operatorRole === 'Manager';

                return (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    {/* Timestamp */}
                    <td className="p-3 pl-4 whitespace-nowrap">
                      <div className="font-bold text-slate-900 text-xs">
                        {new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-300" />
                        {new Date(tx.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Brand */}
                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                        tx.brand === 'Hyundai' 
                          ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {tx.brand}
                      </span>
                    </td>

                    {/* Type & Reference */}
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {tx.type === 'Sale' && <ShoppingBag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                        {tx.type === 'Purchase' && <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        {tx.type === 'Return' && <RotateCcw className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                        {tx.type === 'Bulk Update' && <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-600 shrink-0" />}
                        {tx.type === 'System Action' && <Terminal className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                        <span className="font-bold text-slate-900">{tx.type}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {tx.reference}
                      </div>
                    </td>

                    {/* Operator (Name + Role Badge) */}
                    <td className="p-3 whitespace-nowrap">
                      <div className="font-bold text-slate-900 text-xs">
                        {tx.operatorName}
                      </div>
                      <div className="mt-0.5">
                        {isManager ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                            <span className="w-1 h-1 rounded-full bg-amber-600"></span>
                            Manager
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-300">
                            <ShieldCheck className="w-2.5 h-2.5 text-purple-700" />
                            Owner
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Party & Description Summary */}
                    <td className="p-3 max-w-[340px]">
                      {tx.partyName && (
                        <div className="font-bold text-slate-800 text-xs truncate">
                          {tx.partyName}
                          {tx.category && (
                            <span className="ml-1.5 text-[9px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                              {tx.category}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-[11px] text-slate-500 font-normal truncate mt-0.5" title={tx.summary}>
                        {tx.summary}
                      </p>
                    </td>

                    {/* Financial Amount */}
                    <td className="p-3 text-right whitespace-nowrap font-mono">
                      {tx.amount !== undefined ? (
                        <div>
                          <span className={`text-xs font-bold ${
                            tx.amount > 0 ? 'text-slate-900' : 'text-rose-600 font-black'
                          }`}>
                            {tx.amount > 0 ? '' : '-'}₹{Math.abs(tx.amount).toLocaleString('en-IN')}
                          </span>
                          {tx.paymentStatus && (
                            <div className="text-[9px] font-sans font-bold">
                              <span className={tx.paymentStatus === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}>
                                {tx.paymentStatus}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-350 text-[11px]">&mdash;</span>
                      )}
                    </td>

                    {/* Drill-down action */}
                    <td className="p-3 pr-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => setInspectingTx(tx)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-600 hover:text-indigo-700 text-[10px] font-bold cursor-pointer transition"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                    </td>

                  </tr>
                );
              })}

              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 font-normal">
                    <div className="max-w-xs mx-auto space-y-2">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                        <Search className="w-5 h-5" />
                      </div>
                      <p className="font-bold text-slate-700 text-xs">No transactions match these filter parameters</p>
                      <p className="text-[11px] text-slate-400">
                        Try resetting role selections, broadening your date window, or clearing the search box.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* DRILL-DOWN INSPECTION MODAL */}
      {inspectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">
                  {inspectingTx.type === 'Sale' && <ShoppingBag className="w-4 h-4" />}
                  {inspectingTx.type === 'Purchase' && <FileText className="w-4 h-4" />}
                  {inspectingTx.type === 'Return' && <RotateCcw className="w-4 h-4" />}
                  {inspectingTx.type === 'Bulk Update' && <FileSpreadsheet className="w-4 h-4" />}
                  {inspectingTx.type === 'System Action' && <Terminal className="w-4 h-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm tracking-tight text-white">
                      Transaction Inspection: {inspectingTx.reference}
                    </h3>
                    <span className="px-2 py-0.2 rounded text-[9px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                      {inspectingTx.brand}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Logged on {new Date(inspectingTx.date).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setInspectingTx(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
              
              {/* Operator Attribution Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block">
                    Executed By Staff Member
                  </span>
                  <p className="text-sm font-black text-slate-900 mt-0.5">
                    {inspectingTx.operatorName}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block mb-1">
                    System Authorization Role
                  </span>
                  {inspectingTx.operatorRole === 'Manager' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                      Dealership Manager
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-300">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                      Business Owner
                    </span>
                  )}
                </div>
              </div>

              {/* SALE INSPECTION VIEW */}
              {inspectingTx.type === 'Sale' && inspectingTx.details.sale && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-200 text-[11px]">
                    <div>
                      <span className="text-emerald-800 font-bold uppercase text-[9px] block">Customer</span>
                      <p className="font-bold text-slate-900">{inspectingTx.details.sale.customer_name}</p>
                      <span className="text-[10px] text-slate-500 font-medium">({inspectingTx.details.sale.customer_category})</span>
                    </div>
                    <div>
                      <span className="text-emerald-800 font-bold uppercase text-[9px] block">Bill Subtotal</span>
                      <p className="font-bold text-slate-900 font-mono">₹{inspectingTx.details.sale.subtotal?.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <span className="text-emerald-800 font-bold uppercase text-[9px] block">Discount</span>
                      <p className="font-bold text-slate-900">{inspectingTx.details.sale.discount_percentage}% (₹{inspectingTx.details.sale.discount_amount?.toLocaleString('en-IN')})</p>
                    </div>
                    <div>
                      <span className="text-emerald-800 font-bold uppercase text-[9px] block">Net Billed</span>
                      <p className="font-black text-emerald-700 text-sm font-mono">₹{inspectingTx.details.sale.total_amount?.toLocaleString('en-IN')}</p>
                    </div>
                  </div>

                  {/* Items list */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs mb-2">Billed Spare Parts:</h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-[9px]">
                          <tr>
                            <th className="p-2.5">Part #</th>
                            <th className="p-2.5">Part Name</th>
                            <th className="p-2.5 text-right">Qty</th>
                            <th className="p-2.5 text-right">Unit MRP</th>
                            <th className="p-2.5 text-right">Net Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {inspectingTx.details.saleItems?.map((item, idx) => (
                            <tr key={item.id || idx}>
                              <td className="p-2.5 font-mono font-bold text-indigo-700">{item.part_no}</td>
                              <td className="p-2.5 text-slate-700">{item.part_name}</td>
                              <td className="p-2.5 text-right font-bold">{item.quantity}</td>
                              <td className="p-2.5 text-right font-mono">₹{item.mrp?.toLocaleString('en-IN')}</td>
                              <td className="p-2.5 text-right font-mono font-bold text-slate-900">₹{item.final_amount?.toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* PURCHASE INSPECTION VIEW */}
              {inspectingTx.type === 'Purchase' && inspectingTx.details.purchase && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-blue-50/50 p-3.5 rounded-2xl border border-blue-200 text-[11px]">
                    <div>
                      <span className="text-blue-800 font-bold uppercase text-[9px] block">Dealer</span>
                      <p className="font-bold text-slate-900">{inspectingTx.details.purchase.dealer_name}</p>
                    </div>
                    <div>
                      <span className="text-blue-800 font-bold uppercase text-[9px] block">Invoice #</span>
                      <p className="font-mono font-bold text-slate-900">{inspectingTx.details.purchase.invoice_no}</p>
                    </div>
                    <div>
                      <span className="text-blue-800 font-bold uppercase text-[9px] block">Dealer Discount</span>
                      <p className="font-bold text-slate-900">{inspectingTx.details.purchase.dealer_discount_percentage}% (₹{inspectingTx.details.purchase.discount_amount?.toLocaleString('en-IN')})</p>
                    </div>
                    <div>
                      <span className="text-blue-800 font-bold uppercase text-[9px] block">Total Inward</span>
                      <p className="font-black text-blue-700 text-sm font-mono">₹{inspectingTx.details.purchase.total_after_discount?.toLocaleString('en-IN')}</p>
                    </div>
                  </div>

                  {/* Purchase Items */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs mb-2">Inward Spare Parts Received:</h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-[9px]">
                          <tr>
                            <th className="p-2.5">Part #</th>
                            <th className="p-2.5">Part Name</th>
                            <th className="p-2.5">HSN</th>
                            <th className="p-2.5 text-right">Inward Qty</th>
                            <th className="p-2.5 text-right">Unit MRP</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {inspectingTx.details.purchaseItems?.map((pItem, idx) => (
                            <tr key={pItem.id || idx}>
                              <td className="p-2.5 font-mono font-bold text-blue-700">{pItem.part_no}</td>
                              <td className="p-2.5 text-slate-700">{pItem.part_name}</td>
                              <td className="p-2.5 font-mono text-slate-500">{pItem.hsn || '&mdash;'}</td>
                              <td className="p-2.5 text-right font-bold text-slate-900">{pItem.quantity}</td>
                              <td className="p-2.5 text-right font-mono">₹{pItem.mrp?.toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* RETURN INSPECTION VIEW */}
              {inspectingTx.type === 'Return' && inspectingTx.details.returnRecord && (
                <div className="space-y-4">
                  <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200 space-y-2">
                    <span className="text-rose-800 font-bold uppercase text-[9px] block">Customer Return Details</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Returned Part:</span>
                        <p className="font-mono font-bold text-rose-700">{inspectingTx.details.returnRecord.part_no}</p>
                        <p className="text-slate-600 text-[10px]">{inspectingTx.details.returnRecord.part_name}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Quantity Returned:</span>
                        <p className="font-bold text-slate-900 text-sm">{inspectingTx.details.returnRecord.returned_quantity} units</p>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Refund Amount:</span>
                        <p className="font-black text-rose-700 font-mono text-base">₹{inspectingTx.details.returnRecord.refund_amount?.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SYSTEM ACTION OR BULK UPDATE DIFF VIEW */}
              {inspectingTx.details.log && (
                <div className="space-y-3">
                  <div className="bg-slate-100 p-3.5 rounded-xl text-slate-800">
                    <span className="text-slate-400 font-black uppercase text-[9px] block">Event Description</span>
                    <p className="font-semibold text-xs mt-0.5">{inspectingTx.details.log.description}</p>
                  </div>

                  {(inspectingTx.details.log.old_data || inspectingTx.details.log.new_data) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {inspectingTx.details.log.old_data && (
                        <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-200">
                          <span className="text-rose-800 font-black uppercase text-[9px] block mb-1">State Prior to Action</span>
                          <pre className="text-[10px] font-mono text-slate-800 whitespace-pre-wrap overflow-x-auto max-h-[160px]">
                            {JSON.stringify(typeof inspectingTx.details.log.old_data === 'string' ? JSON.parse(inspectingTx.details.log.old_data) : inspectingTx.details.log.old_data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {inspectingTx.details.log.new_data && (
                        <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-200">
                          <span className="text-emerald-800 font-black uppercase text-[9px] block mb-1">State After Action</span>
                          <pre className="text-[10px] font-mono text-slate-800 whitespace-pre-wrap overflow-x-auto max-h-[160px]">
                            {JSON.stringify(typeof inspectingTx.details.log.new_data === 'string' ? JSON.parse(inspectingTx.details.log.new_data) : inspectingTx.details.log.new_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Transaction ID: <span className="font-mono font-bold text-slate-600">{inspectingTx.id}</span>
              </span>
              <button
                onClick={() => setInspectingTx(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer transition"
              >
                Close Inspector
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
