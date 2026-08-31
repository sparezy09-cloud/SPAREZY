import { useState, useMemo, useEffect } from 'react';
import { Brand, User, Customer, Sale, ReturnRecord, Purchase, CustomerKhataMeta, SupplierKhataMeta, KhataEntry } from '../types';
import { db } from '../dbStore';
import * as XLSX from 'xlsx';
import { 
  Users, Calendar, Download, Printer, ArrowRight, ChevronLeft, ChevronRight,
  HelpCircle, CheckCircle, FileSpreadsheet, Building2, Eye, X, Plus, Search,
  AlertTriangle, TrendingUp, TrendingDown, Info, Settings, Trash2, RotateCcw,
  DollarSign, UserPlus, PlusCircle, CreditCard, ShieldAlert, ArrowLeftRight
} from 'lucide-react';

interface LedgerModuleProps {
  brand: Brand;
  user: User;
}

export default function LedgerModule({ brand, user }: LedgerModuleProps) {
  // Navigation tabs: 'dashboard', 'customer', 'supplier'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'customer' | 'supplier'>('dashboard');
  
  // Selected detailed statement views
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilterStart, setDateFilterStart] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');
  const [limitFilterOnly, setLimitFilterOnly] = useState(false);
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  // Form states for manual payments/adjustments
  const [showAddEntryForm, setShowAddEntryForm] = useState(false);
  const [entryType, setEntryType] = useState<'debit' | 'credit'>('credit');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryPaymentMethod, setEntryPaymentMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'Other'>('Cash');
  const [entryReference, setEntryReference] = useState('');
  const [entryNotes, setEntryNotes] = useState('');

  // Form states for profile metadata settings
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [vehicleNo, setVehicleNo] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [accountStatus, setAccountStatus] = useState<'Active' | 'Blocked'>('Active');
  const [supplierPhone, setSupplierPhone] = useState('');

  // Form state for adding new supplier
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierOpening, setNewSupplierOpening] = useState('');

  // Reversal authorization state
  const [entryToReverse, setEntryToReverse] = useState<string | null>(null);
  const [reversalPassword, setReversalPassword] = useState('');
  const [reversalError, setReversalError] = useState('');

  // Real-time synced state collections from local falling store
  const [customers, setCustomers] = useState<Customer[]>(() => db.getCustomers());
  const [customerMetas, setCustomerMetas] = useState<CustomerKhataMeta[]>(() => db.getKhataCustomersMeta());
  const [supplierMetas, setSupplierMetas] = useState<SupplierKhataMeta[]>(() => db.getKhataSuppliers());
  const [khataEntries, setKhataEntries] = useState<KhataEntry[]>(() => db.getKhataEntries());

  const refreshLocalState = () => {
    setCustomers(db.getCustomers());
    setCustomerMetas(db.getKhataCustomersMeta());
    setSupplierMetas(db.getKhataSuppliers());
    setKhataEntries(db.getKhataEntries());
  };

  useEffect(() => {
    refreshLocalState();
    return db.subscribe(refreshLocalState);
  }, [brand]);

  // Sync settings panel inputs with currently active meta
  useEffect(() => {
    if (selectedCustomerId) {
      const meta = customerMetas.find(m => m.customer_id === selectedCustomerId);
      setVehicleNo(meta?.vehicle_no || '');
      setCreditLimit(meta?.credit_limit?.toString() || '0');
      setOpeningBalance(meta?.opening_balance?.toString() || '0');
      setPaymentDueDate(meta?.payment_due_date || '');
      setAccountStatus((meta?.status as 'Active' | 'Blocked') || 'Active');
    }
  }, [selectedCustomerId, customerMetas]);

  useEffect(() => {
    if (selectedSupplierId) {
      const meta = supplierMetas.find(m => m.id === selectedSupplierId);
      setSupplierPhone(meta?.phone || '');
      setOpeningBalance(meta?.opening_balance?.toString() || '0');
      setPaymentDueDate(meta?.payment_due_date || '');
      setAccountStatus((meta?.status as 'Active' | 'Blocked') || 'Active');
    }
  }, [selectedSupplierId, supplierMetas]);

  // ==========================================
  // FINANCIAL METRIC COMPUTATIONS
  // ==========================================

  // Computes active outstanding ledgers for customers
  const customerLedgers = useMemo(() => {
    return customers.map(cust => {
      const meta = customerMetas.find(m => m.customer_id === cust.id);
      
      // Filter entries specifically linked to this customer
      const clientEntries = khataEntries.filter(e => e.account_type === 'customer' && e.party_id === cust.id && !e.is_reversed);
      
      // Debit totals (Invoices or manual debits)
      const debitTotal = clientEntries.reduce((acc, curr) => acc + curr.debit, 0) + (meta?.opening_balance || 0);
      // Credit totals (Payments or returns)
      const creditTotal = clientEntries.reduce((acc, curr) => acc + curr.credit, 0);

      // Current Outstanding Due (Debit minus Credit)
      const outstanding = debitTotal - creditTotal;

      return {
        id: cust.id,
        name: cust.customer_name,
        category: cust.customer_category,
        phone: cust.phone || 'N/A',
        vehicle_no: meta?.vehicle_no || 'N/A',
        credit_limit: meta?.credit_limit || 0,
        opening_balance: meta?.opening_balance || 0,
        payment_due_date: meta?.payment_due_date || null,
        status: meta?.status || 'Active',
        totalDebit: debitTotal,
        totalCredit: creditTotal,
        outstandingBalance: outstanding,
        isOverLimit: meta?.credit_limit ? (outstanding > meta.credit_limit) : false
      };
    });
  }, [customers, customerMetas, khataEntries]);

  // Computes active outstanding ledgers for suppliers
  const supplierLedgers = useMemo(() => {
    return supplierMetas.map(supp => {
      const suppEntries = khataEntries.filter(e => e.account_type === 'supplier' && e.party_id === supp.id && !e.is_reversed);

      // Supplier ledger balances: Credit represents purchase value (Payables) and Debit represents cash paid
      const creditTotal = suppEntries.reduce((acc, curr) => acc + curr.credit, 0) + (supp.opening_balance || 0);
      const debitTotal = suppEntries.reduce((acc, curr) => acc + curr.debit, 0);

      const outstanding = creditTotal - debitTotal;

      return {
        id: supp.id,
        name: supp.supplier_name,
        phone: supp.phone || 'N/A',
        opening_balance: supp.opening_balance || 0,
        payment_due_date: supp.payment_due_date || null,
        status: supp.status || 'Active',
        totalDebit: debitTotal,
        totalCredit: creditTotal,
        outstandingBalance: outstanding
      };
    });
  }, [supplierMetas, khataEntries]);

  // Overall dashboard metrics
  const dashboardStats = useMemo(() => {
    const totalReceivables = customerLedgers.reduce((acc, curr) => acc + (curr.outstandingBalance > 0 ? curr.outstandingBalance : 0), 0);
    const totalPayables = supplierLedgers.reduce((acc, curr) => acc + (curr.outstandingBalance > 0 ? curr.outstandingBalance : 0), 0);
    const overLimitCount = customerLedgers.filter(c => c.isOverLimit).length;
    const dueSoonCustomers = customerLedgers.filter(c => c.outstandingBalance > 0 && c.payment_due_date && new Date(c.payment_due_date) <= new Date(Date.now() + 5*24*60*60*1000)).length;

    return {
      totalReceivables,
      totalPayables,
      overLimitCount,
      dueSoonCustomers
    };
  }, [customerLedgers, supplierLedgers]);

  // Filtered views based on search bar and selectors
  const filteredCustomers = useMemo(() => {
    return customerLedgers.filter(c => {
      const matchText = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        c.vehicle_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        c.phone.includes(searchTerm);
      const matchLimit = limitFilterOnly ? c.isOverLimit : true;
      const matchOutstanding = outstandingOnly ? c.outstandingBalance > 0 : true;
      return matchText && matchLimit && matchOutstanding;
    });
  }, [customerLedgers, searchTerm, limitFilterOnly, outstandingOnly]);

  const filteredSuppliers = useMemo(() => {
    return supplierLedgers.filter(s => {
      const matchText = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        s.phone.includes(searchTerm);
      const matchOutstanding = outstandingOnly ? s.outstandingBalance > 0 : true;
      return matchText && matchOutstanding;
    });
  }, [supplierLedgers, searchTerm, outstandingOnly]);

  // Selected statement ledger listings
  const activeStatementLogs = useMemo(() => {
    if (activeTab === 'customer' && selectedCustomerId) {
      const rawLogs = khataEntries.filter(e => e.account_type === 'customer' && e.party_id === selectedCustomerId);
      
      // Sort Chronologically for running balance calculations
      const sorted = [...rawLogs].sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());
      
      const meta = customerMetas.find(m => m.customer_id === selectedCustomerId);
      let runBal = meta?.opening_balance || 0;

      const items = sorted.map((entry) => {
        if (!entry.is_reversed) {
          runBal += entry.debit - entry.credit;
        }
        return {
          ...entry,
          runningBalance: runBal
        };
      });

      // Apply UI date range filters on the final output view
      let filtered = [...items].reverse(); // Output in reverse chronological order for latest first in table
      if (dateFilterStart) {
        const start = new Date(dateFilterStart).getTime();
        filtered = filtered.filter(e => new Date(e.entry_date).getTime() >= start);
      }
      if (dateFilterEnd) {
        const end = new Date(dateFilterEnd).getTime() + (24*60*60*1000 - 1);
        filtered = filtered.filter(e => new Date(e.entry_date).getTime() <= end);
      }
      return filtered;
    }

    if (activeTab === 'supplier' && selectedSupplierId) {
      const rawLogs = khataEntries.filter(e => e.account_type === 'supplier' && e.party_id === selectedSupplierId);
      const sorted = [...rawLogs].sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());
      
      const meta = supplierMetas.find(m => m.id === selectedSupplierId);
      let runBal = meta?.opening_balance || 0;

      const items = sorted.map((entry) => {
        if (!entry.is_reversed) {
          runBal += entry.credit - entry.debit;
        }
        return {
          ...entry,
          runningBalance: runBal
        };
      });

      let filtered = [...items].reverse();
      if (dateFilterStart) {
        const start = new Date(dateFilterStart).getTime();
        filtered = filtered.filter(e => new Date(e.entry_date).getTime() >= start);
      }
      if (dateFilterEnd) {
        const end = new Date(dateFilterEnd).getTime() + (24*60*60*1000 - 1);
        filtered = filtered.filter(e => new Date(e.entry_date).getTime() <= end);
      }
      return filtered;
    }

    return [];
  }, [activeTab, selectedCustomerId, selectedSupplierId, khataEntries, customerMetas, supplierMetas, dateFilterStart, dateFilterEnd]);

  const activeCustomerRecord = useMemo(() => {
    return customerLedgers.find(c => c.id === selectedCustomerId);
  }, [selectedCustomerId, customerLedgers]);

  const activeSupplierRecord = useMemo(() => {
    return supplierLedgers.find(s => s.id === selectedSupplierId);
  }, [selectedSupplierId, supplierLedgers]);

  // ==========================================
  // WRITE OPERATIONS (PERSISTED SECURELY)
  // ==========================================

  // Add a new supplier profile
  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return;
    try {
      const opening = parseFloat(newSupplierOpening) || 0;
      await db.addKhataSupplier(newSupplierName.trim(), newSupplierPhone.trim(), opening, user);
      setShowAddSupplierModal(false);
      setNewSupplierName('');
      setNewSupplierPhone('');
      setNewSupplierOpening('');
    } catch (e: any) {
      alert("Error adding supplier: " + e.message);
    }
  };

  // Update profile metadata settings
  const handleSaveProfileSettings = async () => {
    try {
      const limitVal = parseFloat(creditLimit) || 0;
      const openingVal = parseFloat(openingBalance) || 0;

      if (activeTab === 'customer' && selectedCustomerId) {
        await db.updateKhataCustomerMeta({
          customer_id: selectedCustomerId,
          vehicle_no: vehicleNo.trim(),
          credit_limit: limitVal,
          opening_balance: openingVal,
          payment_due_date: paymentDueDate || null,
          status: accountStatus
        }, user);
        setShowSettingsPanel(false);
      } else if (activeTab === 'supplier' && selectedSupplierId) {
        await db.updateKhataSupplier({
          id: selectedSupplierId,
          supplier_name: activeSupplierRecord?.name || '',
          phone: supplierPhone.trim(),
          opening_balance: openingVal,
          payment_due_date: paymentDueDate || null,
          status: accountStatus,
          created_at: supplierMetas.find(m => m.id === selectedSupplierId)?.created_at || new Date().toISOString()
        }, user);
        setShowSettingsPanel(false);
      }
    } catch (e: any) {
      alert("Error updating profile settings: " + e.message);
    }
  };

  // Add manual entry (Debit/Credit) to selected ledger
  const handleAddManualEntry = async () => {
    const amount = parseFloat(entryAmount);
    if (isNaN(amount) || amount <= 0 || !entryDescription.trim()) {
      alert("Please provide a valid description and positive numerical amount.");
      return;
    }

    try {
      const isCustomer = activeTab === 'customer';
      const partyId = isCustomer ? selectedCustomerId! : selectedSupplierId!;
      
      const debitVal = entryType === 'debit' ? amount : 0;
      const creditVal = entryType === 'credit' ? amount : 0;

      await db.addKhataEntry({
        account_type: isCustomer ? 'customer' : 'supplier',
        party_id: partyId,
        entry_date: new Date().toISOString(),
        description: entryDescription.trim(),
        debit: debitVal,
        credit: creditVal,
        payment_method: (debitVal > 0 && isCustomer) || (creditVal > 0 && !isCustomer) ? null : entryPaymentMethod,
        reference_no: entryReference.trim() || null,
        notes: entryNotes.trim() || null,
        brand,
        source_type: 'manual',
        source_id: null
      }, user);

      // Clear Form state
      setShowAddEntryForm(false);
      setEntryAmount('');
      setEntryDescription('');
      setEntryReference('');
      setEntryNotes('');
    } catch (e: any) {
      alert("Error saving ledger transaction entry: " + e.message);
    }
  };

  // Reverse Transaction (preserving full chronological audit compliance)
  const handleReverseEntrySubmit = async () => {
    if (!entryToReverse) return;
    if (reversalPassword !== 'sparezyowner' && reversalPassword !== 'sparezyadmin') {
      setReversalError("Unauthorized security override credentials.");
      return;
    }

    try {
      await db.reverseKhataEntry(entryToReverse, user.name, user);
      setEntryToReverse(null);
      setReversalPassword('');
      setReversalError('');
    } catch (e: any) {
      setReversalError(e.message);
    }
  };

  // ==========================================
  // DATA EXPORTERS (XLSX / PRINT)
  // ==========================================

  const handleExportStatementToExcel = () => {
    const title = activeTab === 'customer' 
      ? `Customer_Statement_${activeCustomerRecord?.name.replace(/\s+/g, '_')}`
      : `Supplier_Statement_${activeSupplierRecord?.name.replace(/\s+/g, '_')}`;

    const formattedData = activeStatementLogs.map(entry => ({
      "Date": new Date(entry.entry_date).toLocaleDateString(),
      "Description": entry.description + (entry.is_reversed ? " (REVERSED)" : ""),
      "Debit (Paid/Owed)": entry.debit,
      "Credit (Received)": entry.credit,
      "Outstanding Running Balance": entry.runningBalance,
      "Payment Mode": entry.payment_method || "N/A",
      "Reference / Bill No": entry.reference_no || "N/A",
      "Remarks": entry.notes || "N/A"
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger Account");
    XLSX.writeFile(workbook, `Sparezy_${title}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrintStatement = () => {
    const printable = document.getElementById('ledger-account-printable');
    if (!printable) return;

    const printWin = window.open('', '', 'height=700,width=900');
    if (printWin) {
      printWin.document.write(`
        <html>
          <head>
            <title>Account Ledger - Sparezy</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; }
              .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px; }
              .logo { font-size: 24px; font-weight: 800; color: #1e3a8a; }
              .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
              .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 30px; border: 1px solid #e2e8f0; }
              .meta-title { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
              .meta-value { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; }
              table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; margin-top: 15px; }
              th { background: #f1f5f9; padding: 12px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; border-bottom: 1px solid #cbd5e1; }
              td { padding: 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
              .reversed { text-decoration: line-through; color: #94a3b8; background-color: #f8fafc; }
              .reversed-tag { font-size: 9px; background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 8px; text-decoration: none; display: inline-block; }
              .total-row { font-weight: 700; background: #f1f5f9; }
            </style>
          </head>
          <body>
            ${printable.innerHTML}
            <script>window.print();</script>
          </body>
        </html>
      `);
      printWin.document.close();
    }
  };

  return (
    <div className="space-y-6" id="khata-book-container">
      
      {/* 1. Header Hero section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5 tracking-tight">
            <Users className="w-5 h-5 text-indigo-600" />
            Sparezy Digital Khata Book
          </h2>
          <p className="text-sm text-slate-500">
            Real-time chronological double-entry ledgers for registered Mahindra &amp; Hyundai clients and suppliers.
          </p>
        </div>

        {/* Brand Segment indicator */}
        <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-800 px-4 py-2 rounded-2xl text-xs font-bold">
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Brand Scope: {brand} Inventory
        </div>
      </div>

      {/* 2. Top-Level Module Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => { setActiveTab('dashboard'); setSelectedCustomerId(null); setSelectedSupplierId(null); setSearchTerm(''); }}
          className={`pb-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'dashboard'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Ledger Dashboard
        </button>
        <button
          onClick={() => { setActiveTab('customer'); setSelectedCustomerId(null); setSelectedSupplierId(null); setSearchTerm(''); }}
          className={`pb-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'customer'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Customer Khata (Receivables)
        </button>
        <button
          onClick={() => { setActiveTab('supplier'); setSelectedCustomerId(null); setSelectedSupplierId(null); setSearchTerm(''); }}
          className={`pb-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'supplier'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Supplier Khata (Payables)
        </button>
      </div>

      {/* ====================================================
          TAB 1: LEDGER OVERVIEW DASHBOARD
          ==================================================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* A. KPI Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Receivables</p>
                <p className="text-xl font-black text-slate-900">₹{dashboardStats.totalReceivables.toLocaleString('en-IN')}</p>
                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  Owed by Customers
                </span>
              </div>
              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Payables</p>
                <p className="text-xl font-black text-slate-900">₹{dashboardStats.totalPayables.toLocaleString('en-IN')}</p>
                <span className="text-[10px] text-amber-600 font-bold flex items-center gap-0.5">
                  <TrendingDown className="w-3 h-3" />
                  Owed to Suppliers
                </span>
              </div>
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Over-Limit Alerts</p>
                <p className="text-xl font-black text-rose-600">{dashboardStats.overLimitCount} Accounts</p>
                <span className="text-[10px] text-slate-400 font-semibold">Exceeded Credit Limit</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-sm">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Upcoming Deadlines</p>
                <p className="text-xl font-black text-indigo-600">{dashboardStats.dueSoonCustomers} Accounts</p>
                <span className="text-[10px] text-slate-400 font-semibold">Payments due within 5 days</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shadow-sm">
                <Calendar className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* B. Informational Alert */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-bold text-slate-900">How Automatic Khata Book Integration Works</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Creating a credit invoice under <strong>Sales</strong> automatically posts a debit transaction to the customer's ledger.</li>
                <li>Processing down payments or subsequent collections automatically credit the customer's ledger.</li>
                <li>Standard <strong>Sales Returns</strong> automatically credits the client, decreasing outstanding receivables.</li>
                <li>Uploading stock/billing under <strong>Purchases</strong> automatically posts credit transactions to the supplier's balance.</li>
              </ul>
            </div>
          </div>

          {/* C. Quick Outstanding accounts lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Customer Receivables */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Top Pending Customer Receivables
                </h3>
                <button 
                  onClick={() => setActiveTab('customer')}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                >
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {customerLedgers.filter(c => c.outstandingBalance > 0).sort((a,b) => b.outstandingBalance - a.outstandingBalance).slice(0, 5).map(c => (
                  <div key={c.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50 transition">
                    <div>
                      <p className="font-bold text-slate-900">{c.name}</p>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Vehicle: {c.vehicle_no} | Limit: ₹{c.credit_limit.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-slate-900">₹{c.outstandingBalance.toLocaleString('en-IN')}</p>
                      {c.isOverLimit && <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold">Over limit</span>}
                    </div>
                  </div>
                ))}
                {customerLedgers.filter(c => c.outstandingBalance > 0).length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs font-semibold">No outstanding customer balances.</div>
                )}
              </div>
            </div>

            {/* Top Supplier Payables */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-amber-500" />
                  Top Supplier Payables
                </h3>
                <button 
                  onClick={() => setActiveTab('supplier')}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                >
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {supplierLedgers.filter(s => s.outstandingBalance > 0).sort((a,b) => b.outstandingBalance - a.outstandingBalance).slice(0, 5).map(s => (
                  <div key={s.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50 transition">
                    <div>
                      <p className="font-bold text-slate-900">{s.name}</p>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Contact: {s.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-amber-700">₹{s.outstandingBalance.toLocaleString('en-IN')}</p>
                      <span className="text-[9px] text-slate-400 font-semibold">Payable</span>
                    </div>
                  </div>
                ))}
                {supplierLedgers.filter(s => s.outstandingBalance > 0).length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs font-semibold">No pending payables to suppliers.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          TAB 2: CUSTOMER LEDGER LIST & DETAILED VIEWS
          ==================================================== */}
      {activeTab === 'customer' && (
        <div className="space-y-6">
          {!selectedCustomerId ? (
            /* A. CUSTOMER DIRECTORY LIST VIEW */
            <div className="space-y-4">
              {/* Filter controls */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search customer name, vehicle number, or phone..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 flex-wrap">
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={limitFilterOnly}
                      onChange={(e) => setLimitFilterOnly(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Over-Limit Only
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={outstandingOnly}
                      onChange={(e) => setOutstandingOnly(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Pending Outstanding Only
                  </label>
                </div>
              </div>

              {/* Customers Directory Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider">
                      <tr>
                        <th className="p-4">Customer Name</th>
                        <th className="p-4">Vehicle No</th>
                        <th className="p-4">Contact Phone</th>
                        <th className="p-4 text-right">Credit Limit</th>
                        <th className="p-4 text-right">Outstanding Balance</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredCustomers.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                          <td className="p-4">
                            <div>
                              <p className="font-bold text-slate-900">{c.name}</p>
                              <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{c.category}</span>
                            </div>
                          </td>
                          <td className="p-4 font-mono font-bold text-slate-800">{c.vehicle_no}</td>
                          <td className="p-4 font-mono">{c.phone}</td>
                          <td className="p-4 text-right font-mono">₹{c.credit_limit.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right">
                            <span className={`inline-flex px-2 py-0.5 rounded font-mono font-bold ${
                              c.outstandingBalance > 0
                                ? c.isOverLimit 
                                  ? 'bg-rose-100 text-rose-800' 
                                  : 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              ₹{c.outstandingBalance.toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                              c.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => { setSelectedCustomerId(c.id); setDateFilterStart(''); setDateFilterEnd(''); }}
                              className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition"
                            >
                              Open Ledger
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredCustomers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-12 text-center text-slate-400 font-normal">
                            No matching customer ledger accounts found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* B. DETAILED STATEMENT LEDGER VIEW FOR CUSTOMER */
            <div className="space-y-6">
              {/* Back navigation bar */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-xl cursor-pointer shadow-xs transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Customers Directory
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl cursor-pointer shadow-xs transition"
                  >
                    <Settings className="w-4 h-4" />
                    Configure Profile &amp; Limits
                  </button>
                  <button
                    onClick={() => setShowAddEntryForm(!showAddEntryForm)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 rounded-xl cursor-pointer shadow-xs transition"
                  >
                    <Plus className="w-4 h-4" />
                    Record Ledger Payment
                  </button>
                </div>
              </div>

              {/* Info panel grid */}
              {activeCustomerRecord && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-xs">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Holder</p>
                    <p className="text-sm font-black text-slate-900">{activeCustomerRecord.name}</p>
                    <p className="text-[10px] text-slate-400 font-semibold">{activeCustomerRecord.category} | Vehicle: {activeCustomerRecord.vehicle_no}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Outstanding Balance</p>
                    <p className={`text-base font-black ${activeCustomerRecord.outstandingBalance > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                      ₹{activeCustomerRecord.outstandingBalance.toLocaleString('en-IN')}
                    </p>
                    <span className="text-[9px] text-slate-400 font-semibold">Total Outstanding Receivables</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Credit Limit Status</p>
                    <p className="text-sm font-black text-slate-900">₹{activeCustomerRecord.credit_limit.toLocaleString('en-IN')}</p>
                    <span className={`text-[10px] font-bold ${activeCustomerRecord.isOverLimit ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {activeCustomerRecord.isOverLimit ? "Credit Limit Breached!" : `Available: ₹${Math.max(0, activeCustomerRecord.credit_limit - activeCustomerRecord.outstandingBalance).toLocaleString('en-IN')}`}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Due Date</p>
                    <p className="text-sm font-bold text-slate-800">{activeCustomerRecord.payment_due_date ? new Date(activeCustomerRecord.payment_due_date).toLocaleDateString() : 'No Deadline Configured'}</p>
                    <span className="text-[9px] text-slate-400 font-semibold">Status: {activeCustomerRecord.status}</span>
                  </div>
                </div>
              )}

              {/* C. POPUP: Profile Configuration Settings */}
              {showSettingsPanel && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md space-y-4">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Settings className="w-4 h-4 text-indigo-500" />
                    Configure Account Profile (Customer Meta)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs font-semibold text-slate-600">
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Vehicle Number</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        placeholder="e.g. MH12AB1234"
                        value={vehicleNo}
                        onChange={(e) => setVehicleNo(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Credit Limit (₹)</label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                        placeholder="0"
                        value={creditLimit}
                        onChange={(e) => setCreditLimit(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Opening Balance (₹)</label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                        placeholder="0"
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Payment Due Date</label>
                      <input
                        type="date"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        value={paymentDueDate}
                        onChange={(e) => setPaymentDueDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Account Status</label>
                      <select
                        className="w-full p-2 border border-slate-200 rounded-xl font-bold"
                        value={accountStatus}
                        onChange={(e) => setAccountStatus(e.target.value as 'Active' | 'Blocked')}
                      >
                        <option value="Active">Active</option>
                        <option value="Blocked">Blocked</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 text-xs font-bold pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowSettingsPanel(false)}
                      className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl cursor-pointer hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveProfileSettings}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl cursor-pointer hover:bg-indigo-700"
                    >
                      Save Settings Profile
                    </button>
                  </div>
                </div>
              )}

              {/* D. POPUP: Add Ledger Entry Form */}
              {showAddEntryForm && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md space-y-4">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <PlusCircle className="w-4 h-4 text-emerald-500" />
                    Record Manual Ledger Entry
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-semibold text-slate-600">
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Entry Type</label>
                      <div className="flex border border-slate-200 rounded-xl overflow-hidden p-0.5">
                        <button
                          type="button"
                          onClick={() => setEntryType('debit')}
                          className={`flex-1 py-1.5 text-center rounded-lg ${entryType === 'debit' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          Debit (Outstanding +)
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryType('credit')}
                          className={`flex-1 py-1.5 text-center rounded-lg ${entryType === 'credit' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          Credit (Received -)
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Amount (₹)</label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                        placeholder="0.00"
                        value={entryAmount}
                        onChange={(e) => setEntryAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Transaction Description</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        placeholder="e.g. UPI Payment received, Manual discount adjustment"
                        value={entryDescription}
                        onChange={(e) => setEntryDescription(e.target.value)}
                      />
                    </div>
                    {entryType === 'credit' && (
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase">Payment Method</label>
                        <select
                          className="w-full p-2 border border-slate-200 rounded-xl font-bold"
                          value={entryPaymentMethod}
                          onChange={(e) => setEntryPaymentMethod(e.target.value as any)}
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI (GPay/PhonePe)</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Reference / Cheque / UPI ID</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        placeholder="e.g. TXN123456"
                        value={entryReference}
                        onChange={(e) => setEntryReference(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Audit Notes / Remarks</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        placeholder="Additional audit logging info..."
                        value={entryNotes}
                        onChange={(e) => setEntryNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 text-xs font-bold pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowAddEntryForm(false)}
                      className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl cursor-pointer hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddManualEntry}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl cursor-pointer hover:bg-emerald-700"
                    >
                      Save Transaction Entry
                    </button>
                  </div>
                </div>
              )}

              {/* Statement List section */}
              <div className="space-y-4">
                {/* View/Export Header toolbar */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <div className="space-y-0.5">
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">From date</span>
                      <input type="date" className="p-1 border border-slate-200 rounded-lg text-[11px]" value={dateFilterStart} onChange={(e) => setDateFilterStart(e.target.value)} />
                    </div>
                    <div className="space-y-0.5">
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">To date</span>
                      <input type="date" className="p-1 border border-slate-200 rounded-lg text-[11px]" value={dateFilterEnd} onChange={(e) => setDateFilterEnd(e.target.value)} />
                    </div>
                    {(dateFilterStart || dateFilterEnd) && (
                      <button onClick={() => { setDateFilterStart(''); setDateFilterEnd(''); }} className="mt-4 text-[10px] text-rose-600 font-bold">Clear Date</button>
                    )}
                  </div>

                  <div className="flex gap-2 text-xs font-bold">
                    <button
                      onClick={handleExportStatementToExcel}
                      className="bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Excel Statement
                    </button>
                    <button
                      onClick={handlePrintStatement}
                      className="bg-white border border-slate-200 hover:border-indigo-400 text-indigo-700 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                    >
                      <Printer className="w-4 h-4" />
                      Print Statement Sheet PDF
                    </button>
                  </div>
                </div>

                {/* Printable Ledger Layout wrapper */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-6" id="ledger-account-printable">
                  {/* Ledger print header */}
                  <div className="header pb-4 border-b border-slate-200 mb-6 flex justify-between items-start">
                    <div>
                      <div className="logo font-black text-indigo-900 tracking-tight text-lg">Sparezy Auto Parts ({brand})</div>
                      <div className="subtitle text-xs text-slate-400 mt-0.5">Customer Balance Ledger Account</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-400 space-y-0.5 font-semibold">
                      <p>Date Generated: {new Date().toLocaleDateString()}</p>
                      <p>Date Range: {dateFilterStart || 'Opening'} to {dateFilterEnd || 'Present'}</p>
                    </div>
                  </div>

                  {activeCustomerRecord && (
                    <div className="meta-grid grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 border border-slate-200 p-4 rounded-xl mb-6">
                      <div>
                        <div className="meta-title text-[9px] font-bold text-slate-400 uppercase">Customer Profile</div>
                        <div className="meta-value text-sm font-bold text-slate-800">{activeCustomerRecord.name}</div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{activeCustomerRecord.category} | {activeCustomerRecord.phone}</div>
                      </div>
                      <div>
                        <div className="meta-title text-[9px] font-bold text-slate-400 uppercase">Vehicle Register</div>
                        <div className="meta-value text-sm font-mono font-bold text-slate-800">{activeCustomerRecord.vehicle_no}</div>
                      </div>
                      <div>
                        <div className="meta-title text-[9px] font-bold text-slate-400 uppercase">Outstanding Balance</div>
                        <div className="meta-value text-sm font-black text-indigo-950">₹{activeCustomerRecord.outstandingBalance.toLocaleString('en-IN')}</div>
                      </div>
                      <div>
                        <div className="meta-title text-[9px] font-bold text-slate-400 uppercase">Account Status</div>
                        <div className="meta-value text-sm font-bold">{activeCustomerRecord.status}</div>
                      </div>
                    </div>
                  )}

                  {/* Statements Ledger table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-left text-[11px] font-semibold text-slate-600">
                      <thead className="bg-slate-100 text-slate-500 uppercase text-[9px] tracking-wider">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Description</th>
                          <th className="p-3 text-right">Debit (Amount Owed)</th>
                          <th className="p-3 text-right">Credit (Paid)</th>
                          <th className="p-3 text-right">Outstanding Bal</th>
                          <th className="p-3">Ref/Mode</th>
                          <th className="p-3 text-center no-print">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {/* Show opening balance row if no filters */}
                        {!dateFilterStart && activeCustomerRecord && (
                          <tr className="bg-slate-50/50 font-bold text-slate-500">
                            <td className="p-3 font-mono">--</td>
                            <td className="p-3 uppercase text-[9px]">Opening Balance Adjustment</td>
                            <td className="p-3 text-right font-mono">₹{activeCustomerRecord.opening_balance.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right font-mono">₹0</td>
                            <td className="p-3 text-right font-mono">₹{activeCustomerRecord.opening_balance.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-slate-400 italic">Pre-existing</td>
                            <td className="p-3 text-center no-print">--</td>
                          </tr>
                        )}
                        {activeStatementLogs.map(log => (
                          <tr key={log.id} className={`hover:bg-slate-50/50 ${log.is_reversed ? 'bg-red-50/20 line-through text-slate-400' : ''}`}>
                            <td className="p-3 font-mono whitespace-nowrap">{new Date(log.entry_date).toLocaleDateString()}</td>
                            <td className="p-3">
                              <span className="font-bold text-slate-800">{log.description}</span>
                              {log.notes && <span className="block text-[9px] text-slate-400 font-normal mt-0.5">Notes: {log.notes}</span>}
                              {log.is_reversed && (
                                <span className="reversed-tag bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ml-1 border border-rose-200">Reversed by {log.reversed_by}</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">{log.debit > 0 ? `₹${log.debit.toLocaleString('en-IN')}` : '--'}</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-600">{log.credit > 0 ? `₹${log.credit.toLocaleString('en-IN')}` : '--'}</td>
                            <td className="p-3 text-right font-mono font-bold text-indigo-950">
                              {log.is_reversed ? '--' : `₹${log.runningBalance.toLocaleString('en-IN')}`}
                            </td>
                            <td className="p-3">
                              {log.payment_method && <span className="inline-block bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold text-[9px] mr-1">{log.payment_method}</span>}
                              {log.reference_no && <span className="font-mono text-slate-500 text-[10px]">{log.reference_no}</span>}
                              {!log.payment_method && !log.reference_no && <span className="text-slate-400">-</span>}
                            </td>
                            <td className="p-3 text-center no-print">
                              {!log.is_reversed ? (
                                <button
                                  onClick={() => { setEntryToReverse(log.id); setReversalPassword(''); setReversalError(''); }}
                                  className="text-rose-600 hover:text-rose-800 text-[10px] font-bold border border-rose-200 hover:border-rose-400 bg-rose-50 px-2 py-1 rounded-md transition cursor-pointer"
                                >
                                  Reverse
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic font-semibold">Voided</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {activeStatementLogs.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-12 text-center text-slate-400 font-normal">
                              No statement entries logs recorded for this period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================
          TAB 3: SUPPLIER LEDGER LIST & DETAILED VIEWS
          ==================================================== */}
      {activeTab === 'supplier' && (
        <div className="space-y-6">
          {!selectedSupplierId ? (
            /* A. SUPPLIER DIRECTORY LIST VIEW */
            <div className="space-y-4">
              {/* Directory Toolbar header */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search supplier name or contact phone..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer mr-2">
                    <input
                      type="checkbox"
                      checked={outstandingOnly}
                      onChange={(e) => setOutstandingOnly(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Pending Payables Only
                  </label>
                  <button
                    onClick={() => setShowAddSupplierModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                  >
                    <UserPlus className="w-4 h-4" />
                    Register New Supplier
                  </button>
                </div>
              </div>

              {/* Add Supplier dialog popup modal */}
              {showAddSupplierModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Building2 className="w-4.5 h-4.5 text-indigo-500" />
                        Add New Supplier Ledger Account
                      </h3>
                      <button onClick={() => setShowAddSupplierModal(false)} className="text-slate-400 hover:text-slate-900">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3 text-xs font-semibold text-slate-600">
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase">Supplier / Dealer Name *</label>
                        <input
                          type="text"
                          className="w-full p-2.5 border border-slate-200 rounded-xl font-bold"
                          placeholder="e.g. Hyundai Spares Hub, Mahindra Auto Spares Corp"
                          value={newSupplierName}
                          onChange={(e) => setNewSupplierName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase">Contact Phone</label>
                        <input
                          type="text"
                          className="w-full p-2.5 border border-slate-200 rounded-xl"
                          placeholder="e.g. +91 9876543210"
                          value={newSupplierPhone}
                          onChange={(e) => setNewSupplierPhone(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase">Opening Payable Balance (₹)</label>
                        <input
                          type="number"
                          className="w-full p-2.5 border border-slate-200 rounded-xl font-mono"
                          placeholder="0.00"
                          value={newSupplierOpening}
                          onChange={(e) => setNewSupplierOpening(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 text-xs font-bold border-t border-slate-100 pt-3">
                      <button
                        onClick={() => setShowAddSupplierModal(false)}
                        className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddSupplier}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700"
                      >
                        Register Supplier Profile
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Suppliers Directory Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider">
                      <tr>
                        <th className="p-4">Supplier/Dealer Name</th>
                        <th className="p-4">Phone Number</th>
                        <th className="p-4 text-right">Total Debit (Paid)</th>
                        <th className="p-4 text-right">Total Credit (Owed)</th>
                        <th className="p-4 text-right">Current Payable Balance</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredSuppliers.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50">
                          <td className="p-4 font-bold text-slate-900">{s.name}</td>
                          <td className="p-4 font-mono">{s.phone}</td>
                          <td className="p-4 text-right font-mono">₹{s.totalDebit.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right font-mono">₹{s.totalCredit.toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right">
                            <span className={`inline-flex px-2 py-0.5 rounded font-mono font-bold ${
                              s.outstandingBalance > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                            }`}>
                              ₹{s.outstandingBalance.toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                              s.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => { setSelectedSupplierId(s.id); setDateFilterStart(''); setDateFilterEnd(''); }}
                              className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition"
                            >
                              Open Ledger
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredSuppliers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-12 text-center text-slate-400 font-normal">
                            No matching supplier ledger profiles registered in database.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* B. DETAILED STATEMENT LEDGER VIEW FOR SUPPLIER */
            <div className="space-y-6">
              {/* Back navigation bar */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedSupplierId(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-xl cursor-pointer shadow-xs transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Suppliers Directory
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl cursor-pointer shadow-xs transition"
                  >
                    <Settings className="w-4 h-4" />
                    Configure Profile &amp; Limits
                  </button>
                  <button
                    onClick={() => setShowAddEntryForm(!showAddEntryForm)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 rounded-xl cursor-pointer shadow-xs transition"
                  >
                    <Plus className="w-4 h-4" />
                    Record Ledger Payment Made
                  </button>
                </div>
              </div>

              {/* Info panel grid */}
              {activeSupplierRecord && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-xs">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Supplier Account</p>
                    <p className="text-sm font-black text-slate-900">{activeSupplierRecord.name}</p>
                    <p className="text-[10px] text-slate-400 font-semibold">Contact: {activeSupplierRecord.phone} | Status: {activeSupplierRecord.status}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Current Balance Owed (Payable)</p>
                    <p className={`text-base font-black ${activeSupplierRecord.outstandingBalance > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                      ₹{activeSupplierRecord.outstandingBalance.toLocaleString('en-IN')}
                    </p>
                    <span className="text-[9px] text-slate-400 font-semibold">Our outstanding payables</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aggregate purchases</p>
                    <p className="text-sm font-black text-slate-900">₹{activeSupplierRecord.totalCredit.toLocaleString('en-IN')}</p>
                    <span className="text-[9px] text-slate-400 font-semibold">Total invoice procurement value</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Due Date</p>
                    <p className="text-sm font-bold text-slate-800">{activeSupplierRecord.payment_due_date ? new Date(activeSupplierRecord.payment_due_date).toLocaleDateString() : 'No Due Date Limit'}</p>
                    <span className="text-[9px] text-slate-400 font-semibold">Status: {activeSupplierRecord.status}</span>
                  </div>
                </div>
              )}

              {/* C. POPUP: Profile Configuration Settings */}
              {showSettingsPanel && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md space-y-4">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Settings className="w-4 h-4 text-indigo-500" />
                    Configure Account Profile (Supplier Meta)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-semibold text-slate-600">
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Contact Phone</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        placeholder="e.g. +91 9876543210"
                        value={supplierPhone}
                        onChange={(e) => setSupplierPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Opening Payable Balance (₹)</label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                        placeholder="0"
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Payment Due Date</label>
                      <input
                        type="date"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        value={paymentDueDate}
                        onChange={(e) => setPaymentDueDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Account Status</label>
                      <select
                        className="w-full p-2 border border-slate-200 rounded-xl font-bold"
                        value={accountStatus}
                        onChange={(e) => setAccountStatus(e.target.value as 'Active' | 'Blocked')}
                      >
                        <option value="Active">Active</option>
                        <option value="Blocked">Blocked</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 text-xs font-bold pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowSettingsPanel(false)}
                      className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl cursor-pointer hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveProfileSettings}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl cursor-pointer hover:bg-indigo-700"
                    >
                      Save Supplier Profile
                    </button>
                  </div>
                </div>
              )}

              {/* D. POPUP: Add Ledger Entry Form */}
              {showAddEntryForm && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md space-y-4">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <PlusCircle className="w-4 h-4 text-emerald-500" />
                    Record Supplier Transaction Entry
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-semibold text-slate-600">
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Entry Type</label>
                      <div className="flex border border-slate-200 rounded-xl overflow-hidden p-0.5">
                        <button
                          type="button"
                          onClick={() => setEntryType('debit')}
                          className={`flex-1 py-1.5 text-center rounded-lg ${entryType === 'debit' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          Debit (Paid Payment -)
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryType('credit')}
                          className={`flex-1 py-1.5 text-center rounded-lg ${entryType === 'credit' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          Credit (Owed Invoice +)
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Amount (₹)</label>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                        placeholder="0.00"
                        value={entryAmount}
                        onChange={(e) => setEntryAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Transaction Description</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        placeholder="e.g. UPI payment made to dealer, adjustment on return"
                        value={entryDescription}
                        onChange={(e) => setEntryDescription(e.target.value)}
                      />
                    </div>
                    {entryType === 'debit' && (
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-400 font-bold uppercase">Payment Mode Used</label>
                        <select
                          className="w-full p-2 border border-slate-200 rounded-xl font-bold"
                          value={entryPaymentMethod}
                          onChange={(e) => setEntryPaymentMethod(e.target.value as any)}
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI (GPay/PhonePe)</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Reference / Cheque / Txn ID</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        placeholder="e.g. TXN123456"
                        value={entryReference}
                        onChange={(e) => setEntryReference(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Audit Notes / Remarks</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded-xl"
                        placeholder="Additional audit logging info..."
                        value={entryNotes}
                        onChange={(e) => setEntryNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 text-xs font-bold pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowAddEntryForm(false)}
                      className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl cursor-pointer hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddManualEntry}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl cursor-pointer hover:bg-emerald-700"
                    >
                      Save Transaction Entry
                    </button>
                  </div>
                </div>
              )}

              {/* Statement List section */}
              <div className="space-y-4">
                {/* View/Export Header toolbar */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <div className="space-y-0.5">
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">From date</span>
                      <input type="date" className="p-1 border border-slate-200 rounded-lg text-[11px]" value={dateFilterStart} onChange={(e) => setDateFilterStart(e.target.value)} />
                    </div>
                    <div className="space-y-0.5">
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">To date</span>
                      <input type="date" className="p-1 border border-slate-200 rounded-lg text-[11px]" value={dateFilterEnd} onChange={(e) => setDateFilterEnd(e.target.value)} />
                    </div>
                    {(dateFilterStart || dateFilterEnd) && (
                      <button onClick={() => { setDateFilterStart(''); setDateFilterEnd(''); }} className="mt-4 text-[10px] text-rose-600 font-bold">Clear Date</button>
                    )}
                  </div>

                  <div className="flex gap-2 text-xs font-bold">
                    <button
                      onClick={handleExportStatementToExcel}
                      className="bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Excel Statement
                    </button>
                    <button
                      onClick={handlePrintStatement}
                      className="bg-white border border-slate-200 hover:border-indigo-400 text-indigo-700 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                    >
                      <Printer className="w-4 h-4" />
                      Print Statement Sheet PDF
                    </button>
                  </div>
                </div>

                {/* Printable Ledger Layout wrapper */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-6" id="ledger-account-printable">
                  {/* Ledger print header */}
                  <div className="header pb-4 border-b border-slate-200 mb-6 flex justify-between items-start">
                    <div>
                      <div className="logo font-black text-indigo-900 tracking-tight text-lg">Sparezy Auto Parts ({brand})</div>
                      <div className="subtitle text-xs text-slate-400 mt-0.5">Supplier Ledger Balance Sheet Account</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-400 space-y-0.5 font-semibold">
                      <p>Date Generated: {new Date().toLocaleDateString()}</p>
                      <p>Date Range: {dateFilterStart || 'Opening'} to {dateFilterEnd || 'Present'}</p>
                    </div>
                  </div>

                  {activeSupplierRecord && (
                    <div className="meta-grid grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 border border-slate-200 p-4 rounded-xl mb-6">
                      <div>
                        <div className="meta-title text-[9px] font-bold text-slate-400 uppercase">Supplier Contact</div>
                        <div className="meta-value text-sm font-bold text-slate-800">{activeSupplierRecord.name}</div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{activeSupplierRecord.phone}</div>
                      </div>
                      <div>
                        <div className="meta-title text-[9px] font-bold text-slate-400 uppercase">Payable Balance Owed</div>
                        <div className="meta-value text-sm font-black text-amber-800">₹{activeSupplierRecord.outstandingBalance.toLocaleString('en-IN')}</div>
                      </div>
                      <div>
                        <div className="meta-title text-[9px] font-bold text-slate-400 uppercase">Procurement Valuation</div>
                        <div className="meta-value text-sm font-bold text-slate-700">₹{activeSupplierRecord.totalCredit.toLocaleString('en-IN')}</div>
                      </div>
                      <div>
                        <div className="meta-title text-[9px] font-bold text-slate-400 uppercase">Account Status</div>
                        <div className="meta-value text-sm font-bold">{activeSupplierRecord.status}</div>
                      </div>
                    </div>
                  )}

                  {/* Statements Ledger table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-left text-[11px] font-semibold text-slate-600">
                      <thead className="bg-slate-100 text-slate-500 uppercase text-[9px] tracking-wider">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Description</th>
                          <th className="p-3 text-right">Debit (Payment Made)</th>
                          <th className="p-3 text-right">Credit (Invoice Owed)</th>
                          <th className="p-3 text-right">Payable Bal</th>
                          <th className="p-3">Ref/Mode</th>
                          <th className="p-3 text-center no-print">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {/* Show opening balance row if no filters */}
                        {!dateFilterStart && activeSupplierRecord && (
                          <tr className="bg-slate-50/50 font-bold text-slate-500">
                            <td className="p-3 font-mono">--</td>
                            <td className="p-3 uppercase text-[9px]">Opening Balance Adjustment</td>
                            <td className="p-3 text-right font-mono">₹0</td>
                            <td className="p-3 text-right font-mono">₹{activeSupplierRecord.opening_balance.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right font-mono">₹{activeSupplierRecord.opening_balance.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-slate-400 italic">Pre-existing</td>
                            <td className="p-3 text-center no-print">--</td>
                          </tr>
                        )}
                        {activeStatementLogs.map(log => (
                          <tr key={log.id} className={`hover:bg-slate-50/50 ${log.is_reversed ? 'bg-red-50/20 line-through text-slate-400' : ''}`}>
                            <td className="p-3 font-mono whitespace-nowrap">{new Date(log.entry_date).toLocaleDateString()}</td>
                            <td className="p-3">
                              <span className="font-bold text-slate-800">{log.description}</span>
                              {log.notes && <span className="block text-[9px] text-slate-400 font-normal mt-0.5">Notes: {log.notes}</span>}
                              {log.is_reversed && (
                                <span className="reversed-tag bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ml-1 border border-rose-200">Reversed by {log.reversed_by}</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-600">{log.debit > 0 ? `₹${log.debit.toLocaleString('en-IN')}` : '--'}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">{log.credit > 0 ? `₹${log.credit.toLocaleString('en-IN')}` : '--'}</td>
                            <td className="p-3 text-right font-mono font-bold text-amber-800 font-black">
                              {log.is_reversed ? '--' : `₹${log.runningBalance.toLocaleString('en-IN')}`}
                            </td>
                            <td className="p-3">
                              {log.payment_method && <span className="inline-block bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold text-[9px] mr-1">{log.payment_method}</span>}
                              {log.reference_no && <span className="font-mono text-slate-500 text-[10px]">{log.reference_no}</span>}
                              {!log.payment_method && !log.reference_no && <span className="text-slate-400">-</span>}
                            </td>
                            <td className="p-3 text-center no-print">
                              {!log.is_reversed ? (
                                <button
                                  onClick={() => { setEntryToReverse(log.id); setReversalPassword(''); setReversalError(''); }}
                                  className="text-rose-600 hover:text-rose-800 text-[10px] font-bold border border-rose-200 hover:border-rose-400 bg-rose-50 px-2 py-1 rounded-md transition cursor-pointer"
                                >
                                  Reverse
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic font-semibold">Voided</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {activeStatementLogs.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-12 text-center text-slate-400 font-normal">
                              No statement entries logs recorded for this period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================
          REVERSAL OVERRIDE DIALOG / MODAL
          ==================================================== */}
      {entryToReverse && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 text-rose-600">
                <ShieldAlert className="w-4.5 h-4.5" />
                Security Override: Reverse Entry
              </h3>
              <button onClick={() => setEntryToReverse(null)} className="text-slate-400 hover:text-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-rose-900 space-y-1">
                <p className="font-bold">Important Audit Trail Notice:</p>
                <p className="font-semibold text-slate-600">
                  Transaction records are completely immutable. Reversing this entry will void its balance contributions and append a permanent correctional counter-balancing entry in the audit transaction log.
                </p>
              </div>

              <div className="space-y-1.5 text-slate-600 font-semibold">
                <label className="block text-[10px] text-slate-400 font-bold uppercase">Enter Security Override Password *</label>
                <input
                  type="password"
                  placeholder="Password (e.g. sparezyowner)"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-bold font-mono focus:outline-none focus:border-rose-500"
                  value={reversalPassword}
                  onChange={(e) => setReversalPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleReverseEntrySubmit(); }}
                />
                {reversalError && <p className="text-[10px] text-rose-600 font-bold">{reversalError}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs font-bold border-t border-slate-100 pt-3">
              <button
                onClick={() => setEntryToReverse(null)}
                className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReverseEntrySubmit}
                className="bg-rose-600 text-white px-4 py-2 rounded-xl cursor-pointer hover:bg-rose-700 shadow-xs transition"
              >
                Authorize &amp; Reverse Entry
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
