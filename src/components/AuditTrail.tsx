import { useState, useMemo, useEffect } from 'react';
import { Brand, User, TransactionLog, isOwnerOrAdmin } from '../types';
import { db } from '../dbStore';
import * as XLSX from 'xlsx';
import {
  ShieldCheck, Search, Filter, Calendar, Download, RefreshCw,
  PlusCircle, Edit3, Trash2, ArrowUpRight, ArrowDownLeft, RotateCcw,
  UserCheck, Shield, ChevronDown, ChevronRight, X, AlertCircle, Clock,
  FileSpreadsheet, CheckCircle2, History
} from 'lucide-react';

interface AuditTrailProps {
  brand: Brand;
  user: User;
}

type ActionFilter = 'All' | 'Insert' | 'Update' | 'Delete' | 'Return' | 'Status Change';
type ModuleFilter = 'All' | 'Sales' | 'Inventory' | 'Ledger' | 'Returns' | 'Orders' | 'Users';
type RoleFilter = 'All' | 'Owner' | 'Manager' | 'System';

export default function AuditTrail({ brand, user }: AuditTrailProps) {
  const [logs, setLogs] = useState<TransactionLog[]>(() => db.getTransactionLogs());
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState<ModuleFilter>('All');
  const [selectedAction, setSelectedAction] = useState<ActionFilter>('All');
  const [selectedRole, setSelectedRole] = useState<RoleFilter>('All');
  const [selectedUserId, setSelectedUserId] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  // Refresh logs from dbStore subscription
  const refreshLogs = () => {
    setLogs(db.getTransactionLogs());
  };

  useEffect(() => {
    refreshLogs();
    return db.subscribe(refreshLogs);
  }, []);

  // System users for user filter
  const allUsers = useMemo(() => db.getUsers(), []);

  // Classify action types into standardized categories: Insert, Update, Delete, etc.
  const classifyActionCategory = (actionType: string): 'Insert' | 'Update' | 'Delete' | 'Return' | 'Status Change' | 'Other' => {
    const act = actionType.toLowerCase();
    if (act.includes('delete') || act.includes('remove') || act.includes('undo') || act.includes('drop')) return 'Delete';
    if (act.includes('create') || act.includes('add') || act.includes('insert') || act.includes('inward') || act.includes('import')) return 'Insert';
    if (act.includes('return') || act.includes('refund')) return 'Return';
    if (act.includes('status') || act.includes('accept') || act.includes('reject') || act.includes('order')) return 'Status Change';
    if (act.includes('update') || act.includes('edit') || act.includes('archive') || act.includes('unarchive') || act.includes('payment') || act.includes('balance') || act.includes('mrp')) return 'Update';
    return 'Other';
  };

  // Map module name to standard modules
  const normalizeModule = (moduleName: string): 'Sales' | 'Inventory' | 'Ledger' | 'Returns' | 'Orders' | 'Users' | 'Other' => {
    const mod = moduleName.toLowerCase();
    if (mod.includes('sale')) return 'Sales';
    if (mod.includes('inventory') || mod.includes('part') || mod.includes('bulk')) return 'Inventory';
    if (mod.includes('ledger') || mod.includes('customer') || mod.includes('khatabook')) return 'Ledger';
    if (mod.includes('return')) return 'Returns';
    if (mod.includes('order')) return 'Orders';
    if (mod.includes('user') || mod.includes('auth') || mod.includes('staff')) return 'Users';
    return 'Other';
  };

  // Resolve user role
  const getUserRole = (userId?: string, userName?: string): 'Owner' | 'Manager' | 'Admin' | 'Staff' | 'System' => {
    if (!userId && !userName) return 'System';
    if (userId) {
      const match = allUsers.find(u => u.id === userId);
      if (match) return match.role;
    }
    if (userName) {
      const match = allUsers.find(u => u.name.toLowerCase() === userName.toLowerCase());
      if (match) return match.role;
      if (userName.toLowerCase().includes('anmol') || userName.toLowerCase().includes('owner')) return 'Owner';
    }
    return 'Manager';
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOf7Days = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOf30Days = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

    return logs.filter(log => {
      // 1. Action Category filter
      if (selectedAction !== 'All') {
        const cat = classifyActionCategory(log.action_type);
        if (cat !== selectedAction) return false;
      }

      // 2. Module filter
      if (selectedModule !== 'All') {
        const mod = normalizeModule(log.module_name);
        if (mod !== selectedModule) return false;
      }

      // 3. Role filter (Owner, Manager, System)
      if (selectedRole !== 'All') {
        const role = getUserRole(log.user_id, log.user_name);
        if (selectedRole === 'Owner' && role !== 'Owner') return false;
        if (selectedRole === 'Manager' && role !== 'Manager') return false;
        if (selectedRole === 'System' && role !== 'System') return false;
      }

      // 4. User ID filter
      if (selectedUserId !== 'All') {
        if (log.user_id !== selectedUserId && log.user_name !== selectedUserId) return false;
      }

      // 5. Date filter
      const logDate = new Date(log.created_at);
      if (dateFilter === 'today' && logDate < startOfToday) return false;
      if (dateFilter === 'yesterday' && (logDate < startOfYesterday || logDate >= startOfToday)) return false;
      if (dateFilter === '7days' && logDate < startOf7Days) return false;
      if (dateFilter === '30days' && logDate < startOf30Days) return false;
      if (dateFilter === 'custom') {
        if (customStartDate && logDate < new Date(customStartDate)) return false;
        if (customEndDate && logDate > new Date(new Date(customEndDate).getTime() + 24 * 60 * 60 * 1000 - 1)) return false;
      }

      // 6. Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesUser = (log.user_name || '').toLowerCase().includes(q) || (log.user_id || '').toLowerCase().includes(q);
        const matchesAction = (log.action_type || '').toLowerCase().includes(q);
        const matchesModule = (log.module_name || '').toLowerCase().includes(q);
        const matchesDesc = (log.description || '').toLowerCase().includes(q);
        const matchesOld = log.old_data ? JSON.stringify(log.old_data).toLowerCase().includes(q) : false;
        const matchesNew = log.new_data ? JSON.stringify(log.new_data).toLowerCase().includes(q) : false;
        if (!matchesUser && !matchesAction && !matchesModule && !matchesDesc && !matchesOld && !matchesNew) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedAction, selectedModule, selectedRole, selectedUserId, dateFilter, customStartDate, customEndDate, search, allUsers]);

  // Metrics summary
  const summary = useMemo(() => {
    let insertCount = 0;
    let updateCount = 0;
    let deleteCount = 0;
    let ownerActions = 0;
    let managerActions = 0;

    filteredLogs.forEach(l => {
      const cat = classifyActionCategory(l.action_type);
      if (cat === 'Insert') insertCount++;
      else if (cat === 'Update') updateCount++;
      else if (cat === 'Delete') deleteCount++;

      const role = getUserRole(l.user_id, l.user_name);
      if (role === 'Owner') ownerActions++;
      else if (role === 'Manager') managerActions++;
    });

    return {
      total: filteredLogs.length,
      insertCount,
      updateCount,
      deleteCount,
      ownerActions,
      managerActions
    };
  }, [filteredLogs, allUsers]);

  // Paginated logs
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedAction, selectedModule, selectedRole, selectedUserId, dateFilter, customStartDate, customEndDate, search]);

  // Excel Export
  const handleExportExcel = () => {
    const data = filteredLogs.map((l, index) => ({
      "Serial #": index + 1,
      "Log ID": l.id,
      "Timestamp": new Date(l.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      "User Name": l.user_name,
      "User ID": l.user_id,
      "User Role": getUserRole(l.user_id, l.user_name),
      "Action Type": l.action_type,
      "Mutation Category": classifyActionCategory(l.action_type),
      "Module": l.module_name,
      "Description": l.description,
      "Has Pre-Mutation State": l.old_data ? "Yes" : "No",
      "Has Post-Mutation State": l.new_data ? "Yes" : "No"
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Audit Trail");

    const stamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Sparezy_Audit_Trail_${brand}_${stamp}.xlsx`);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await db.refreshAllData(brand);
      refreshLogs();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getActionBadge = (actionType: string) => {
    const cat = classifyActionCategory(actionType);
    switch (cat) {
      case 'Insert':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <PlusCircle className="w-3 h-3 text-emerald-600" />
            INSERT
          </span>
        );
      case 'Update':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Edit3 className="w-3 h-3 text-blue-600" />
            UPDATE
          </span>
        );
      case 'Delete':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <Trash2 className="w-3 h-3 text-rose-600" />
            DELETE
          </span>
        );
      case 'Return':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <RotateCcw className="w-3 h-3 text-amber-600" />
            RETURN
          </span>
        );
      case 'Status Change':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <CheckCircle2 className="w-3 h-3 text-purple-600" />
            STATUS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {actionType}
          </span>
        );
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === 'Owner') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-black bg-indigo-600 text-white tracking-wide">
          <Shield className="w-2.5 h-2.5" />
          OWNER
        </span>
      );
    }
    if (role === 'Manager') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-black bg-amber-500 text-white tracking-wide">
          <UserCheck className="w-2.5 h-2.5" />
          MANAGER
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-semibold bg-slate-200 text-slate-700">
        {role.toUpperCase()}
      </span>
    );
  };

  return (
    <div id="audit-trail-module" className="space-y-6">
      
      {/* HEADER SECTION */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                System Audit Trail &amp; Activity Log
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                  {brand}
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Cryptographically tracked mutations (Insert, Update, Delete) across Sales, Inventory, and Ledger records with Actor User IDs and Timestamps.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync Trail</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit Log</span>
          </button>
        </div>
      </div>

      {/* METRIC HIGHLIGHTS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Logged Mutations</span>
          <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">{summary.total.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Full lifecycle audit history</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Insert (Creates)</span>
          <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block">{summary.insertCount.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Invoices, parts, entries</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Update (Modifications)</span>
          <span className="text-2xl font-black text-blue-600 font-mono mt-1 block">{summary.updateCount.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Prices, stock, payments</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">Delete / Undo</span>
          <span className="text-2xl font-black text-rose-600 font-mono mt-1 block">{summary.deleteCount.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Sales undos &amp; part purges</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 md:col-span-1">
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Staff Accountability</span>
          <div className="text-xs font-bold text-slate-800 mt-1.5 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Owners:</span>
              <span className="font-bold text-indigo-700">{summary.ownerActions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Managers:</span>
              <span className="font-bold text-amber-700">{summary.managerActions}</span>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        
        {/* Top Filter Row: Search & Role Quick Toggles */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by User ID, Name, Action, Module, or Payload details..."
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
              All Actors
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

        {/* Secondary Filter Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1 border-t border-slate-100">
          
          {/* Target System Module Filter */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Subsystem Module
            </label>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-1.5 px-2.5 rounded-xl font-semibold focus:bg-white cursor-pointer"
            >
              <option value="All">All Modules (Sales, Inventory, Ledger)</option>
              <option value="Sales">Sales (Invoices, Undo, Payments)</option>
              <option value="Inventory">Inventory (Stock, MRP, Archive)</option>
              <option value="Ledger">Ledger (Khatabook, Customers)</option>
              <option value="Returns">Returns (Credit &amp; Refunds)</option>
              <option value="Orders">Orders (Requests &amp; Approvals)</option>
              <option value="Users">Users &amp; Permissions</option>
            </select>
          </div>

          {/* Mutation Operation Filter */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Mutation Category
            </label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-1.5 px-2.5 rounded-xl font-semibold focus:bg-white cursor-pointer"
            >
              <option value="All">All Operations</option>
              <option value="Insert">INSERT (Created records)</option>
              <option value="Update">UPDATE (Modified states)</option>
              <option value="Delete">DELETE (Deleted / Undone records)</option>
              <option value="Return">RETURN (Returned merchandise)</option>
              <option value="Status Change">STATUS (Status transitions)</option>
            </select>
          </div>

          {/* Specific User Operator Filter */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Specific Actor
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-1.5 px-2.5 rounded-xl font-semibold focus:bg-white cursor-pointer"
            >
              <option value="All">All Operators &amp; System</option>
              {allUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role}) - ID: {u.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          {/* Timeline Date Filter */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Timeline Filter
            </label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-1.5 px-2.5 rounded-xl font-semibold focus:bg-white cursor-pointer"
            >
              <option value="all">All Historical Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

        </div>

        {/* Custom Date Pickers */}
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-600">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 py-1 px-2.5 rounded-lg text-xs font-semibold"
            />
            <span className="font-bold text-slate-600">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 py-1 px-2.5 rounded-lg text-xs font-semibold"
            />
          </div>
        )}

      </div>

      {/* AUDIT LOG TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="font-bold text-slate-700 flex items-center gap-2">
            <span>Showing {filteredLogs.length} Logged Audit Events</span>
            {filteredLogs.length !== logs.length && (
              <span className="text-slate-400 font-normal"> (filtered from {logs.length} total)</span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            Chronological Order (Latest First)
          </span>
        </div>

        {paginatedLogs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <p className="font-bold text-slate-700 text-sm">No Audit Trail Logs Match Current Filters</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Try adjusting or clearing your date range, search query, or mutation category filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider border-b border-slate-200">
                  <th className="p-3 pl-4 font-black">Timestamp</th>
                  <th className="p-3 font-black">Mutation &amp; Module</th>
                  <th className="p-3 font-black">Operator / User ID</th>
                  <th className="p-3 font-black">Description &amp; Context</th>
                  <th className="p-3 font-black text-center">Payload Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {paginatedLogs.map((log) => {
                  const role = getUserRole(log.user_id, log.user_name);
                  const isExpanded = expandedLogId === log.id;
                  const hasPayload = Boolean(log.old_data || log.new_data);

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors group">
                      
                      {/* 1. Date & Time */}
                      <td className="p-3 pl-4 whitespace-nowrap align-top">
                        <div className="font-bold text-slate-800 font-mono text-[11px]">
                          {new Date(log.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {new Date(log.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                          })}
                        </div>
                      </td>

                      {/* 2. Mutation & Module */}
                      <td className="p-3 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5 mb-1">
                          {getActionBadge(log.action_type)}
                        </div>
                        <div className="text-[10.5px] font-bold text-slate-600">
                          {log.module_name}
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono truncate max-w-[120px]">
                          {log.action_type}
                        </div>
                      </td>

                      {/* 3. Operator / User ID */}
                      <td className="p-3 align-top">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-bold text-slate-900 text-xs">{log.user_name || 'System'}</span>
                          {getRoleBadge(role)}
                        </div>
                        <div className="text-[9.5px] text-slate-400 font-mono flex items-center gap-1">
                          <span className="text-slate-500 font-semibold">User ID:</span>
                          <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">{log.user_id ? log.user_id.slice(0, 8) : 'sys-auto'}</span>
                        </div>
                      </td>

                      {/* 4. Description & Context */}
                      <td className="p-3 align-top">
                        <p className="text-xs text-slate-800 leading-snug font-medium">
                          {log.description}
                        </p>
                        
                        {/* Expanded Payload Preview */}
                        {isExpanded && hasPayload && (
                          <div className="mt-3 p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[10px] space-y-2 max-w-2xl overflow-x-auto shadow-inner">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400">
                              <span>Log ID: {log.id}</span>
                              <span className="text-[9px] text-indigo-400">Detailed State Inspection</span>
                            </div>
                            
                            {log.old_data && (
                              <div>
                                <span className="text-rose-400 font-bold block mb-0.5">Pre-Mutation State (Old):</span>
                                <pre className="text-slate-300 whitespace-pre-wrap break-all bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                                  {JSON.stringify(log.old_data, null, 2)}
                                </pre>
                              </div>
                            )}

                            {log.new_data && (
                              <div>
                                <span className="text-emerald-400 font-bold block mb-0.5">Post-Mutation State (New):</span>
                                <pre className="text-slate-300 whitespace-pre-wrap break-all bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                                  {JSON.stringify(log.new_data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 5. Payload Action */}
                      <td className="p-3 pr-4 text-center align-top whitespace-nowrap">
                        {hasPayload ? (
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold inline-flex items-center gap-1 transition cursor-pointer ${
                              isExpanded 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isExpanded ? (
                              <>
                                <span>Hide Diff</span>
                                <ChevronDown className="w-3 h-3" />
                              </>
                            ) : (
                              <>
                                <span>View Diff</span>
                                <ChevronRight className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-semibold italic">
                            No Payload
                          </span>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION BAR */}
        {totalPages > 1 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600">
            <div>
              Page {page} of {totalPages} ({filteredLogs.length} items)
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded-lg cursor-pointer ${
                      page === p 
                        ? 'bg-indigo-600 text-white font-bold' 
                        : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
