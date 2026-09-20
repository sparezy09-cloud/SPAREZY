import { useState, useMemo, useEffect } from 'react';
import { Brand, User, Customer, Sale, ReturnRecord, Purchase, CustomerCategory } from '../types';
import { db } from '../dbStore';
import * as XLSX from 'xlsx';
import { 
  Users, Calendar, Download, Printer, ArrowRight, 
  HelpCircle, CheckCircle, FileSpreadsheet, Building2, Eye, X,
  UserPlus, Plus, Search, Edit2, CreditCard, ArrowDownLeft, ArrowUpRight,
  Phone, MapPin, Filter, Receipt
} from 'lucide-react';

interface LedgerModuleProps {
  brand: Brand;
  user: User;
}

export default function LedgerModule({ brand, user }: LedgerModuleProps) {
  const [ledgerType, setLedgerType] = useState<'customer' | 'dealer'>('customer');
  
  // Date range filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Search and status filters
  const [searchQuery, setSearchQuery] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'due' | 'advance' | 'settled'>('all');

  // Selected details
  const [selectedDealerInvoices, setSelectedDealerInvoices] = useState<Purchase[]>([]);
  const [activeDealerName, setActiveDealerName] = useState<string | null>(null);

  // States
  const [customersList, setCustomersList] = useState<Customer[]>(() => db.getCustomers());
  const [salesList, setSalesList] = useState<Sale[]>(() => db.getSales(brand));
  const [returnsList, setReturnsList] = useState<ReturnRecord[]>(() => db.getReturns(brand));
  const [purchasesList, setPurchasesList] = useState<Purchase[]>(() => db.getPurchases(brand));

  // --- ADD CUSTOMER MODAL STATE ---
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustCategory, setNewCustCategory] = useState<CustomerCategory>('Mistri');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustOpeningBalance, setNewCustOpeningBalance] = useState<string>('0');
  const [newCustBalanceType, setNewCustBalanceType] = useState<'To Receive' | 'To Give'>('To Receive');
  const [newCustNotes, setNewCustNotes] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // --- EDIT / ADJUST OPENING BALANCE MODAL STATE ---
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editBalanceAmount, setEditBalanceAmount] = useState<string>('0');
  const [editBalanceType, setEditBalanceType] = useState<'To Receive' | 'To Give'>('To Receive');
  const [editBalanceNotes, setEditBalanceNotes] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // --- VIEW CUSTOMER STATEMENT STATE ---
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  // Toast banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Pagination states
  const [customerPage, setCustomerPage] = useState(1);
  const [dealerPage, setDealerPage] = useState(1);
  const ledgersPerPage = 15;

  const refreshComponentData = () => {
    setCustomersList(db.getCustomers());
    setSalesList(db.getSales(brand));
    setReturnsList(db.getReturns(brand));
    setPurchasesList(db.getPurchases(brand));
  };

  useEffect(() => {
    refreshComponentData();
    return db.subscribe(refreshComponentData);
  }, [brand]);

  // --- CUSTOMER LEDGER CALCULATIONS ---
  const customerLedgers = useMemo(() => {
    return customersList.map(cust => {
      // Filter sales related to this client
      let clientSales = salesList.filter(s => s.customer_id === cust.id);
      let clientReturns = returnsList.filter(r => r.customer_id === cust.id);

      // Apply date-range filters if active
      if (startDate) {
        const startMs = new Date(startDate).getTime();
        clientSales = clientSales.filter(s => new Date(s.sale_date).getTime() >= startMs);
        clientReturns = clientReturns.filter(r => new Date(r.return_date).getTime() >= startMs);
      }
      if (endDate) {
        const endMs = new Date(endDate).getTime();
        clientSales = clientSales.filter(s => new Date(s.sale_date).getTime() <= endMs);
        clientReturns = clientReturns.filter(r => new Date(r.return_date).getTime() <= endMs);
      }

      const totalSalesBilled = clientSales.reduce((acc, s) => acc + s.total_amount, 0);
      const totalPaid = clientSales.reduce((acc, s) => acc + s.paid_amount, 0);
      const totalPendingSales = clientSales.reduce((acc, s) => acc + s.pending_amount, 0);
      const totalReturnedAmount = clientReturns.reduce((acc, r) => acc + r.refund_amount, 0);

      // Starting / Opening Balance calculation:
      // 'To Receive' = positive (Customer owes / Debit)
      // 'To Give' = negative (Advance / Credit)
      const rawStarting = Number(cust.starting_balance) || 0;
      const isDebit = cust.starting_balance_type !== 'To Give';
      const signedOpeningBalance = isDebit ? rawStarting : -rawStarting;

      // Net outstanding balance:
      // Signed opening balance + sales pending balance
      const netBalance = signedOpeningBalance + totalPendingSales;

      return {
        id: cust.id,
        name: cust.customer_name,
        category: cust.customer_category,
        phone: cust.phone || '',
        address: cust.address || '',
        startingBalance: rawStarting,
        startingBalanceType: cust.starting_balance_type || 'To Receive',
        signedOpeningBalance,
        salesCount: clientSales.length,
        totalSalesBilled,
        totalPaid,
        totalPendingSales,
        totalReturnedAmount,
        netBalance,
        rawCustomer: cust
      };
    });
  }, [customersList, salesList, returnsList, startDate, endDate]);

  // Filter customer ledgers by search query and balance filter
  const filteredCustomerLedgers = useMemo(() => {
    return customerLedgers.filter(c => {
      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesPhone = c.phone.toLowerCase().includes(q);
        const matchesCategory = c.category.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesCategory) return false;
      }
      // Balance filter
      if (balanceFilter === 'due' && c.netBalance <= 0) return false;
      if (balanceFilter === 'advance' && c.netBalance >= 0) return false;
      if (balanceFilter === 'settled' && c.netBalance !== 0) return false;
      return true;
    });
  }, [customerLedgers, searchQuery, balanceFilter]);

  // --- DEALER RECORDS CALCULATIONS ---
  const dealerLedgers = useMemo(() => {
    const mapOfDealers: Record<string, {
      dealer_name: string;
      invoiceCount: number;
      totalPurchasedValuation: number;
      totalDiscountAmount: number;
      invoicesList: Purchase[];
    }> = {};

    let filteredPurchases = purchasesList;
    if (startDate) {
      const startMs = new Date(startDate).getTime();
      filteredPurchases = filteredPurchases.filter(p => new Date(p.invoice_date).getTime() >= startMs);
    }
    if (endDate) {
      const endMs = new Date(endDate).getTime();
      filteredPurchases = filteredPurchases.filter(p => new Date(p.invoice_date).getTime() <= endMs);
    }

    filteredPurchases.forEach(p => {
      const name = p.dealer_name.trim();
      if (!mapOfDealers[name]) {
        mapOfDealers[name] = {
          dealer_name: p.dealer_name,
          invoiceCount: 0,
          totalPurchasedValuation: 0,
          totalDiscountAmount: 0,
          invoicesList: []
        };
      }

      mapOfDealers[name].invoiceCount++;
      mapOfDealers[name].totalPurchasedValuation += p.total_after_discount;
      mapOfDealers[name].totalDiscountAmount += p.discount_amount;
      mapOfDealers[name].invoicesList.push(p);
    });

    return Object.values(mapOfDealers);
  }, [purchasesList, startDate, endDate]);

  const totalCustomerPages = Math.ceil(filteredCustomerLedgers.length / ledgersPerPage) || 1;
  const paginatedCustomerLedgers = useMemo(() => {
    const startIndex = (customerPage - 1) * ledgersPerPage;
    return filteredCustomerLedgers.slice(startIndex, startIndex + ledgersPerPage);
  }, [filteredCustomerLedgers, customerPage]);

  const totalDealerPages = Math.ceil(dealerLedgers.length / ledgersPerPage) || 1;
  const paginatedDealerLedgers = useMemo(() => {
    const startIndex = (dealerPage - 1) * ledgersPerPage;
    return dealerLedgers.slice(startIndex, startIndex + ledgersPerPage);
  }, [dealerLedgers, dealerPage]);

  // Reset pagination on brand/tab/filters change
  useEffect(() => {
    setCustomerPage(1);
    setDealerPage(1);
  }, [brand, ledgerType, startDate, endDate, searchQuery, balanceFilter]);

  // Handle Quick Add Customer
  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      alert("Please enter customer name.");
      return;
    }

    // Parse opening balance (handles user typing -1500 or +1500)
    let rawBal = parseFloat(newCustOpeningBalance) || 0;
    let finalType = newCustBalanceType;
    if (rawBal < 0) {
      finalType = 'To Give';
      rawBal = Math.abs(rawBal);
    }

    setIsSavingCustomer(true);
    try {
      const created = await db.addCustomer(
        newCustName.trim(),
        newCustCategory,
        newCustPhone.trim() || undefined,
        newCustAddress.trim() || undefined,
        rawBal,
        finalType,
        user,
        newCustNotes.trim() || undefined
      );

      refreshComponentData();
      setIsAddCustomerOpen(false);
      setNewCustName('');
      setNewCustCategory('Mistri');
      setNewCustPhone('');
      setNewCustAddress('');
      setNewCustOpeningBalance('0');
      setNewCustBalanceType('To Receive');
      setNewCustNotes('');
      setCustomerPage(1);

      const balLabel = rawBal > 0 
        ? `${finalType === 'To Receive' ? '+₹' : '-₹'}${rawBal.toLocaleString('en-IN')} (${finalType === 'To Receive' ? 'Due' : 'Advance'})` 
        : '₹0';
      triggerToast(`Customer ${created.customer_name} added with opening balance of ${balLabel}`);
    } catch (err: any) {
      alert(`Failed to add customer: ${err.message || err}`);
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Handle Edit/Adjust Customer Opening Balance
  const handleEditBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    let rawBal = parseFloat(editBalanceAmount) || 0;
    let finalType = editBalanceType;
    if (rawBal < 0) {
      finalType = 'To Give';
      rawBal = Math.abs(rawBal);
    }

    setIsSavingEdit(true);
    try {
      await db.updateCustomerStartingBalance(
        editingCustomer.id,
        rawBal,
        finalType,
        user,
        editBalanceNotes.trim() || undefined
      );

      refreshComponentData();
      const updatedName = editingCustomer.customer_name;
      setEditingCustomer(null);
      setEditBalanceAmount('0');
      setEditBalanceType('To Receive');
      setEditBalanceNotes('');

      const balLabel = rawBal > 0 
        ? `${finalType === 'To Receive' ? '+₹' : '-₹'}${rawBal.toLocaleString('en-IN')} (${finalType === 'To Receive' ? 'Due' : 'Advance'})` 
        : '₹0';
      triggerToast(`Updated opening balance for ${updatedName} to ${balLabel}`);
    } catch (err: any) {
      alert(`Failed to update balance: ${err.message || err}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openEditModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setEditBalanceAmount(String(cust.starting_balance || 0));
    setEditBalanceType(cust.starting_balance_type || 'To Receive');
    setEditBalanceNotes('');
  };

  // --- EXPORTERS & PRINTERS ---

  // EXPORT CUSTOMER LEDGER TO EXCEL or CSV (using SheetJS)
  const handleExportCustomer = (format: 'xlsx' | 'csv') => {
    const formattedData = filteredCustomerLedgers.map(row => ({
      "Customer Name": row.name,
      "Category": row.category,
      "Phone": row.phone || 'N/A',
      "Opening Balance (INR)": row.signedOpeningBalance,
      "Opening Balance Type": row.startingBalanceType,
      "Invoices Billed": row.salesCount,
      "Aggregate Sales (INR)": row.totalSalesBilled,
      "Cleared Payments (INR)": row.totalPaid,
      "Returns Refund (INR)": row.totalReturnedAmount,
      "Outstanding Balance (INR)": row.netBalance,
      "Balance Status": row.netBalance > 0 ? 'Pending Due' : (row.netBalance < 0 ? 'Advance Credit' : 'Settled')
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customer Ledger");

    const stamp = new Date().toISOString().split('T')[0];
    const fileName = `Sparezy_${brand}_Customer_Ledger_${stamp}`;

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: 'csv' });
    }
  };

  // EXPORT ALL DEALERS TO EXCEL or CSV (using SheetJS)
  const handleExportAllDealers = (format: 'xlsx' | 'csv') => {
    const formattedData = dealerLedgers.map(row => ({
      "Dealer Supplier": row.dealer_name,
      "Invoices Count": row.invoiceCount,
      "Total Purchased Valuation (INR)": row.totalPurchasedValuation,
      "Total Discounts Saved (INR)": row.totalDiscountAmount
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dealers Aggregate");

    const stamp = new Date().toISOString().split('T')[0];
    const fileName = `Sparezy_${brand}_Dealers_Ledger_${stamp}`;

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: 'csv' });
    }
  };

  // EXPORT CUSTOMER LEDGER TO PDF (Trigger Print Layout)
  const handlePrintLedgerPdf = () => {
    const content = document.getElementById('ledger-printable-content')?.innerHTML;
    const printWin = window.open('', '', 'height=600,width=800');
    if (printWin) {
      printWin.document.write(`
        <html>
          <head>
            <title>Sparezy Auto Spares - Customer Balance Sheet</title>
            <style>
              body { font-family: sans-serif; padding: 40px; color: #1e293b; }
              h1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
              th { background: #f1f5f9; padding: 10px; text-align: left; font-weight: bold; }
              td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
              .totals { font-weight: bold; background: #fafafa; }
              .bold { font-weight: bold; }
              .badge-due { color: #b45309; font-weight: bold; }
              .badge-adv { color: #047857; font-weight: bold; }
            </style>
          </head>
          <body>
            ${content || ''}
            <script>window.print();</script>
          </body>
        </html>
      `);
      printWin.document.close();
    }
  };

  // EXPORT DEALER RECORD TO EXCEL or CSV (using SheetJS)
  const handleExportDealer = (record: typeof dealerLedgers[0], format: 'xlsx' | 'csv') => {
    const formattedData = record.invoicesList.map(inv => ({
      "Invoice No": inv.invoice_no,
      "Invoice Date": new Date(inv.invoice_date).toLocaleDateString(),
      "Pre-Discount Amount (INR)": inv.subtotal,
      "Discount (INR)": inv.discount_amount,
      "Total Paid Amount (INR)": inv.total_after_discount
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dealer Ledger");

    const safeDealerName = record.dealer_name.replace(/\s+/g, '_');
    const stamp = new Date().toISOString().split('T')[0];
    const fileName = `Ledger_${safeDealerName}_Invoices_${stamp}`;

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: 'csv' });
    }
  };

  return (
    <div className="space-y-6">

      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Head controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
            <Users className="w-5 h-5 text-indigo-600" />
            MIS Customer Ledger &amp; Dealer Invoices ({brand})
          </h2>
          <p className="text-sm text-slate-500">
            Export transaction details, manage customer accounts, set positive/negative opening balances, and audit dealer supplier invoices.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Add Customer Button */}
          <button
            onClick={() => setIsAddCustomerOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm text-xs cursor-pointer transition active:scale-98"
          >
            <UserPlus className="w-4 h-4" />
            Add Customer
          </button>

          {/* Change Ledger Category */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => {
                setLedgerType('customer');
                setSelectedDealerInvoices([]);
                refreshComponentData();
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                ledgerType === 'customer' 
                  ? 'bg-white text-slate-900 shadow' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Customer Ledger
            </button>
            <button
              onClick={() => {
                setLedgerType('dealer');
                setSelectedDealerInvoices([]);
                refreshComponentData();
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                ledgerType === 'dealer' 
                  ? 'bg-white text-slate-900 shadow' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dealer Records
            </button>
          </div>
        </div>
      </div>

      {/* Filter control card */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-end justify-between gap-4 text-xs font-semibold text-slate-600">
        
        {/* Left: Search & Filter Chips (for Customer Ledger) */}
        {ledgerType === 'customer' ? (
          <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search customer name, phone, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Balance Status Filter Pills */}
            <div className="flex bg-slate-100 p-0.5 rounded-xl self-start sm:self-auto text-[11px] font-bold">
              <button
                onClick={() => setBalanceFilter('all')}
                className={`px-2.5 py-1.5 rounded-lg transition ${
                  balanceFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setBalanceFilter('due')}
                className={`px-2.5 py-1.5 rounded-lg transition ${
                  balanceFilter === 'due' ? 'bg-amber-100 text-amber-900 font-extrabold shadow-xs' : 'text-slate-600 hover:text-amber-700'
                }`}
              >
                Due / Pending
              </button>
              <button
                onClick={() => setBalanceFilter('advance')}
                className={`px-2.5 py-1.5 rounded-lg transition ${
                  balanceFilter === 'advance' ? 'bg-emerald-100 text-emerald-900 font-extrabold shadow-xs' : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                Advance (-)
              </button>
              <button
                onClick={() => setBalanceFilter('settled')}
                className={`px-2.5 py-1.5 rounded-lg transition ${
                  balanceFilter === 'settled' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Settled (₹0)
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 font-medium">
            Aggregated supplier purchase invoices &amp; distributor discounts for <strong className="text-slate-800">{brand}</strong>
          </div>
        )}

        {/* Right: Date Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="block text-slate-400 font-bold uppercase text-[9px]">Start Date</label>
            <input
              type="date"
              className="p-2 border border-slate-200 rounded-xl bg-slate-50"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-slate-400 font-bold uppercase text-[9px]">End Date</label>
            <input
              type="date"
              className="p-2 border border-slate-200 rounded-xl bg-slate-50"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          
          {(startDate || endDate || searchQuery || balanceFilter !== 'all') && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
                setBalanceFilter('all');
              }}
              className="bg-slate-100 text-slate-600 py-2 px-3 rounded-xl cursor-pointer hover:bg-slate-200 self-end text-xs"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {ledgerType === 'customer' ? (
        <div className="space-y-4">
          
          {/* Action utility bar for exports */}
          <div className="flex items-center justify-between gap-2 text-xs font-bold flex-wrap">
            <div className="text-slate-500 text-[11px]">
              Showing <strong className="text-slate-900">{filteredCustomerLedgers.length}</strong> customers
              {balanceFilter !== 'all' && ` (Filtered by ${balanceFilter.toUpperCase()})`}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleExportCustomer('xlsx')}
                className="bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Export Excel (.xlsx)
              </button>
              <button
                onClick={() => handleExportCustomer('csv')}
                className="bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" />
                Export CSV (.csv)
              </button>
              <button
                onClick={handlePrintLedgerPdf}
                className="bg-white border border-slate-200 hover:border-indigo-400 text-indigo-700 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Statement PDF
              </button>
            </div>
          </div>

          {/* Main ledger table */}
          <div id="ledger-printable-content" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
            
            {/* Logo/Header shown on printed copy */}
            <div className="hidden pdf-show border-b border-slate-200 pb-3">
              <h1>Sparezy Auto Spares &mdash; {brand} Portal</h1>
              <p style={{ fontSize: '12px', color: '#64748b' }}>
                Customer Accounting Ledger Sheet ({startDate || 'All-Time'} &mdash; {endDate || 'Present'})
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold text-slate-600">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider">
                  <tr>
                    <th className="p-3">Customer Profile</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Opening Balance</th>
                    <th className="p-3 text-center">Invoices Billed</th>
                    <th className="p-3 text-right">Aggregate Sales</th>
                    <th className="p-3 text-right">Cleared payments</th>
                    <th className="p-3 text-right">Net balance</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {paginatedCustomerLedgers.map((row) => {
                    const isPositiveOpening = row.signedOpeningBalance > 0;
                    const isNegativeOpening = row.signedOpeningBalance < 0;

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition">
                        {/* Customer Profile */}
                        <td className="p-3">
                          <div className="font-bold text-slate-900 text-sm">{row.name}</div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-normal">
                            {row.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {row.phone}
                              </span>
                            )}
                            {row.address && (
                              <span className="truncate max-w-[140px] text-slate-400" title={row.address}>
                                • {row.address}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Category */}
                        <td className="p-3">
                          <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            {row.category}
                          </span>
                        </td>

                        {/* Opening Balance (with quick edit trigger) */}
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end group">
                            {isPositiveOpening && (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-[11px] bg-rose-50 text-rose-700 border border-rose-200">
                                <ArrowUpRight className="w-3 h-3 text-rose-500" />
                                +₹{row.startingBalance.toLocaleString('en-IN')} (Due)
                              </span>
                            )}
                            {isNegativeOpening && (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ArrowDownLeft className="w-3 h-3 text-emerald-500" />
                                -₹{row.startingBalance.toLocaleString('en-IN')} (Advance)
                              </span>
                            )}
                            {!isPositiveOpening && !isNegativeOpening && (
                              <span className="text-slate-400 font-mono text-[11px]">₹0</span>
                            )}

                            <button
                              onClick={() => openEditModal(row.rawCustomer)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition cursor-pointer"
                              title="Adjust Opening Balance"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        {/* Invoices Billed */}
                        <td className="p-3 text-center font-mono font-medium">
                          {row.salesCount > 0 ? (
                            <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-800">
                              {row.salesCount} bills
                            </span>
                          ) : (
                            <span className="text-slate-300">0 bills</span>
                          )}
                        </td>

                        {/* Aggregate Sales */}
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          ₹{row.totalSalesBilled.toLocaleString('en-IN')}
                        </td>

                        {/* Cleared Payments */}
                        <td className="p-3 text-right font-mono font-bold text-emerald-600">
                          ₹{row.totalPaid.toLocaleString('en-IN')}
                        </td>

                        {/* Net Balance (combining Opening Balance + Sales Pending) */}
                        <td className="p-3 text-right">
                          {row.netBalance > 0 && (
                            <span className="inline-flex px-2.5 py-1 rounded-lg font-extrabold text-xs bg-amber-100 text-amber-900 border border-amber-200">
                              ₹{row.netBalance.toLocaleString('en-IN')} Due
                            </span>
                          )}
                          {row.netBalance < 0 && (
                            <span className="inline-flex px-2.5 py-1 rounded-lg font-extrabold text-xs bg-emerald-100 text-emerald-900 border border-emerald-200">
                              ₹{Math.abs(row.netBalance).toLocaleString('en-IN')} Advance
                            </span>
                          )}
                          {row.netBalance === 0 && (
                            <span className="inline-flex px-2 py-0.5 rounded-md font-bold text-[11px] bg-slate-100 text-slate-500">
                              Settled
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewingCustomer(row.rawCustomer)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                              title="View Customer Khata Statement"
                            >
                              <Receipt className="w-3 h-3" />
                              Statement
                            </button>
                            <button
                              onClick={() => openEditModal(row.rawCustomer)}
                              className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer transition"
                              title="Edit Opening Balance"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {paginatedCustomerLedgers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400 font-normal">
                        <div className="max-w-xs mx-auto space-y-2">
                          <Users className="w-8 h-8 text-slate-300 mx-auto" />
                          <p className="font-semibold text-slate-600">No customers found</p>
                          <p className="text-xs text-slate-400">
                            {searchQuery ? 'Try adjusting your search query or filters.' : 'Click "Add Customer" to create your first customer profile and enter their opening balance.'}
                          </p>
                          <button
                            onClick={() => setIsAddCustomerOpen(true)}
                            className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer shadow-xs inline-flex items-center gap-1"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Add Customer Now
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalCustomerPages > 1 && (
              <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between rounded-b-xl">
                <span className="text-slate-500 text-[11px] font-semibold">
                  Page <strong className="text-slate-800">{customerPage}</strong> of <strong className="text-slate-800">{totalCustomerPages}</strong> ({filteredCustomerLedgers.length} total customers)
                </span>
                <div className="inline-flex gap-1.5 text-[11px] font-bold">
                  <button
                    onClick={() => setCustomerPage(prev => Math.max(1, prev - 1))}
                    disabled={customerPage === 1}
                    className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xs transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCustomerPage(prev => Math.min(totalCustomerPages, prev + 1))}
                    disabled={customerPage === totalCustomerPages}
                    className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xs transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>
      ) : (
        /* DEALER LEDGER VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden lg:col-span-2">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-extrabold text-xs uppercase tracking-wide flex justify-between items-center flex-wrap gap-2">
              <span>Dealer purchasing metrics Aggregation</span>
              <div className="flex gap-2 text-[10px] font-bold">
                <button
                  onClick={() => handleExportAllDealers('xlsx')}
                  className="bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg hover:border-emerald-400 hover:text-emerald-700 cursor-pointer shadow-xs transition"
                >
                  Export All (XLSX)
                </button>
                <button
                  onClick={() => handleExportAllDealers('csv')}
                  className="bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg hover:border-teal-400 hover:text-teal-700 cursor-pointer shadow-xs transition"
                >
                  Export All (CSV)
                </button>
              </div>
            </div>

            <div className="overflow-x-auto text-xs font-semibold text-slate-650">
              <table className="min-w-full divide-y divide-slate-100 text-left">
                <thead className="bg-slate-100/50 text-slate-500 uppercase text-[9px]">
                  <tr>
                    <th className="p-3">Dealer Supplier</th>
                    <th className="p-3 text-center">Invoices</th>
                    <th className="p-3 text-right">Total purchased</th>
                    <th className="p-3 text-right">Discounts saved</th>
                    <th className="p-3 text-right">Utility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {paginatedDealerLedgers.map((row) => (
                    <tr key={row.dealer_name} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900">{row.dealer_name}</td>
                      <td className="p-3 text-center font-mono">{row.invoiceCount} invoices</td>
                      <td className="p-3 text-right font-bold text-slate-900">₹{row.totalPurchasedValuation.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-600">₹{row.totalDiscountAmount.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right flex justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedDealerInvoices(row.invoicesList);
                            setActiveDealerName(row.dealer_name);
                          }}
                          className="p-1.5 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-indigo-650 rounded-lg text-[10px] inline-flex items-center gap-1 cursor-pointer font-bold"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Invoices
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          onClick={() => handleExportDealer(row, 'xlsx')}
                          className="px-1.5 py-0.5 mt-0.5 text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md font-bold cursor-pointer"
                          title="Export Dealer Invoices to XLSX"
                        >
                          XLSX
                        </button>
                        <button
                          onClick={() => handleExportDealer(row, 'csv')}
                          className="px-1.5 py-0.5 mt-0.5 text-[10px] bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-md font-bold cursor-pointer"
                          title="Export Dealer Invoices to CSV"
                        >
                          CSV
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paginatedDealerLedgers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400 font-normal">
                        No purchases/dealer logs found under active query states.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalDealerPages > 1 && (
              <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between">
                <span className="text-slate-500 text-[11px] font-semibold">
                  Page <strong className="text-slate-800">{dealerPage}</strong> of <strong className="text-slate-800">{totalDealerPages}</strong> ({dealerLedgers.length} total dealers)
                </span>
                <div className="inline-flex gap-1.5 text-[11px] font-bold">
                  <button
                    onClick={() => setDealerPage(prev => Math.max(1, prev - 1))}
                    disabled={dealerPage === 1}
                    className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xs transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setDealerPage(prev => Math.min(totalDealerPages, prev + 1))}
                    disabled={dealerPage === totalDealerPages}
                    className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xs transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Side invoice log details */}
          <div>
            {activeDealerName ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs font-semibold text-slate-700">
                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Aggregate Records for:</span>
                    <h4 className="font-extrabold text-slate-900 leading-tight text-sm">{activeDealerName}</h4>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedDealerInvoices([]);
                      setActiveDealerName(null);
                    }}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                  {selectedDealerInvoices.map((inv) => (
                    <div key={inv.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>Invoice: {inv.invoice_no}</span>
                        <span>₹{inv.total_after_discount.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 font-normal">
                        <span>Date: {new Date(inv.invoice_date).toLocaleDateString()}</span>
                        <span>Saved Discount: ₹{inv.discount_amount.toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      const rec = dealerLedgers.find(dl => dl.dealer_name === activeDealerName);
                      if (rec) handleExportDealer(rec, 'xlsx');
                    }}
                    className="flex-1 bg-slate-900 hover:bg-black text-white py-2.5 rounded-xl text-xs font-bold text-center cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    XLSX
                  </button>
                  <button
                    onClick={() => {
                      const rec = dealerLedgers.find(dl => dl.dealer_name === activeDealerName);
                      if (rec) handleExportDealer(rec, 'csv');
                    }}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl text-xs font-bold text-center cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-400" />
                    CSV
                  </button>
                </div>

              </div>
            ) : (
              <div className="border border-dashed border-slate-200 p-8 rounded-2xl text-slate-400 text-center text-xs font-normal">
                Click "View Invoices" next to any dealer distributor to render associated invoices and items here.
              </div>
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD NEW CUSTOMER WITH POSITIVE OR NEGATIVE OPENING BALANCE */}
      {/* ========================================================================= */}
      {isAddCustomerOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                  <UserPlus className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">Customer &amp; Khata Registration</span>
                  <h3 className="font-extrabold text-white text-base">Add New Customer</h3>
                </div>
              </div>
              <button 
                onClick={() => setIsAddCustomerOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomerSubmit} className="p-6 space-y-4">
              
              {/* Category Selector */}
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Customer Category *</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Mistri', 'Garage', 'Walk-in', 'Retailer'] as CustomerCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCustCategory(cat)}
                      className={`py-2 px-1 rounded-xl border text-center text-xs font-bold transition cursor-pointer ${
                        newCustCategory === cat
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-xs ring-1 ring-indigo-600'
                          : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">Customer / Workshop Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pappu Garage / Sunil Mistri"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-slate-50/50"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                />
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Phone Number (Optional)</label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile"
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50/50"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Address / Location (Optional)</label>
                  <input
                    type="text"
                    placeholder="City / Area"
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50/50"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                  />
                </div>
              </div>

              {/* OPENING BALANCE (POSITIVE OR NEGATIVE) */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-slate-800 font-extrabold text-xs flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                      Opening Balance (Positive or Negative)
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Set previous khata balance or advance credit deposited by this customer.
                    </p>
                  </div>
                </div>

                {/* Positive vs Negative Balance Mode Selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCustBalanceType('To Receive')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      newCustBalanceType === 'To Receive'
                        ? 'border-rose-500 bg-rose-50/80 text-rose-950 shadow-xs ring-1 ring-rose-500'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className="font-extrabold text-xs flex items-center gap-1 text-rose-700">
                      <span className="w-4 h-4 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs">+</span>
                      Positive (Customer Owes)
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Debit / Pending Dues (To Receive)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewCustBalanceType('To Give')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      newCustBalanceType === 'To Give'
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 shadow-xs ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className="font-extrabold text-xs flex items-center gap-1 text-emerald-700">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">-</span>
                      Negative (Advance Paid)
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Credit / Customer Deposit (To Give)
                    </span>
                  </button>
                </div>

                {/* Amount input */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Opening Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-2.5 border border-slate-300 rounded-xl font-mono font-bold text-sm bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                      value={newCustOpeningBalance}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewCustOpeningBalance(val);
                        // Auto-toggle to Negative if user types negative number
                        if (val.trim().startsWith('-')) {
                          setNewCustBalanceType('To Give');
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Dynamic Summary Preview */}
                <div className={`p-2.5 rounded-xl border text-[11px] font-medium flex items-center gap-2 ${
                  parseFloat(newCustOpeningBalance) !== 0 && newCustBalanceType === 'To Receive'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : parseFloat(newCustOpeningBalance) !== 0 && newCustBalanceType === 'To Give'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}>
                  {parseFloat(newCustOpeningBalance) > 0 && newCustBalanceType === 'To Receive' && (
                    <>
                      <ArrowUpRight className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        Starting balance: <strong>+₹{Math.abs(parseFloat(newCustOpeningBalance)).toLocaleString('en-IN')} (Customer Owes / Pending Due)</strong>
                      </span>
                    </>
                  )}
                  {parseFloat(newCustOpeningBalance) > 0 && newCustBalanceType === 'To Give' && (
                    <>
                      <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Starting balance: <strong>-₹{Math.abs(parseFloat(newCustOpeningBalance)).toLocaleString('en-IN')} (Advance Credit / You Owe Customer)</strong>
                      </span>
                    </>
                  )}
                  {(!parseFloat(newCustOpeningBalance) || parseFloat(newCustOpeningBalance) === 0) && (
                    <span>
                      Customer starts with <strong>₹0.00 (Zero initial balance)</strong>.
                    </span>
                  )}
                </div>

                {/* Notes / Reference */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Opening Balance Note (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Previous khata balance, advance deposit token"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                    value={newCustNotes}
                    onChange={(e) => setNewCustNotes(e.target.value)}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer transition text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold shadow-md hover:shadow-lg cursor-pointer transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  {isSavingCustomer ? 'Saving Customer...' : 'Save & Open Khata'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADJUST / EDIT EXISTING CUSTOMER OPENING BALANCE */}
      {/* ========================================================================= */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">Khatabook Adjustment</span>
                <h3 className="font-extrabold text-white text-base">Adjust Opening Balance</h3>
              </div>
              <button 
                onClick={() => setEditingCustomer(null)}
                className="p-1.5 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditBalanceSubmit} className="p-6 space-y-4">
              <div className="bg-indigo-50/70 border border-indigo-100 p-3 rounded-xl">
                <p className="text-[11px] text-slate-500">Customer:</p>
                <h4 className="text-sm font-black text-slate-900">{editingCustomer.customer_name}</h4>
                <p className="text-[10px] text-slate-500">Category: {editingCustomer.customer_category}</p>
              </div>

              {/* Positive vs Negative Selector */}
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Opening Balance Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditBalanceType('To Receive')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      editBalanceType === 'To Receive'
                        ? 'border-rose-500 bg-rose-50 text-rose-950 font-extrabold shadow-xs ring-1 ring-rose-500'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1 text-rose-700 text-xs font-extrabold">
                      <span>+ Positive</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Customer Owes / Due</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditBalanceType('To Give')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      editBalanceType === 'To Give'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-extrabold shadow-xs ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1 text-emerald-700 text-xs font-extrabold">
                      <span>- Negative</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Advance Paid / Credit</div>
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Opening Balance Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    step="any"
                    required
                    className="w-full pl-7 pr-3 py-2.5 border border-slate-300 rounded-xl font-mono font-bold text-sm bg-white"
                    value={editBalanceAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditBalanceAmount(val);
                      if (val.trim().startsWith('-')) {
                        setEditBalanceType('To Give');
                      }
                    }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Reason / Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Audit reconciliation, ledger correction"
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs"
                  value={editBalanceNotes}
                  onChange={(e) => setEditBalanceNotes(e.target.value)}
                />
              </div>

              {/* Action buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-extrabold cursor-pointer transition flex items-center justify-center gap-1"
                >
                  {isSavingEdit ? 'Saving...' : 'Update Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VIEW CUSTOMER STATEMENT / KHATABOOK HISTORY */}
      {/* ========================================================================= */}
      {viewingCustomer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 text-white flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">Khatabook Statement</span>
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  {viewingCustomer.customer_name}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-200 font-normal">
                    {viewingCustomer.customer_category}
                  </span>
                </h3>
                {viewingCustomer.phone && (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {viewingCustomer.phone}
                  </p>
                )}
              </div>
              <button 
                onClick={() => setViewingCustomer(null)}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content: Summary & Ledger Entries */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              
              {/* Top Stats Cards */}
              {(() => {
                const clientSales = salesList.filter(s => s.customer_id === viewingCustomer.id);
                const totalBilled = clientSales.reduce((acc, s) => acc + s.total_amount, 0);
                const totalPaid = clientSales.reduce((acc, s) => acc + s.paid_amount, 0);
                const salesPending = clientSales.reduce((acc, s) => acc + s.pending_amount, 0);
                const rawStarting = Number(viewingCustomer.starting_balance) || 0;
                const isDebit = viewingCustomer.starting_balance_type !== 'To Give';
                const signedStarting = isDebit ? rawStarting : -rawStarting;
                const netBalance = signedStarting + salesPending;

                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Opening Balance</span>
                      <div className="font-mono font-black text-sm mt-0.5">
                        {isDebit && rawStarting > 0 && <span className="text-rose-600">+₹{rawStarting.toLocaleString('en-IN')} (Due)</span>}
                        {!isDebit && rawStarting > 0 && <span className="text-emerald-600">-₹{rawStarting.toLocaleString('en-IN')} (Advance)</span>}
                        {rawStarting === 0 && <span className="text-slate-400">₹0.00</span>}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Total Sales Billed</span>
                      <div className="font-mono font-black text-sm text-slate-900 mt-0.5">
                        ₹{totalBilled.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className={`p-3 rounded-2xl border ${
                      netBalance > 0 
                        ? 'bg-amber-50 border-amber-200' 
                        : netBalance < 0 
                        ? 'bg-emerald-50 border-emerald-200' 
                        : 'bg-slate-50 border-slate-200'
                    }`}>
                      <span className="text-[10px] font-bold uppercase text-slate-500">Net Current Balance</span>
                      <div className="font-mono font-black text-sm mt-0.5">
                        {netBalance > 0 && <span className="text-amber-800">₹{netBalance.toLocaleString('en-IN')} Due</span>}
                        {netBalance < 0 && <span className="text-emerald-800">₹{Math.abs(netBalance).toLocaleString('en-IN')} Advance</span>}
                        {netBalance === 0 && <span className="text-slate-500">₹0 Settled</span>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Transactions List */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 font-extrabold text-slate-700 text-xs flex justify-between items-center">
                  <span>Customer Transaction History</span>
                  <button
                    onClick={() => {
                      const cust = viewingCustomer;
                      setViewingCustomer(null);
                      openEditModal(cust);
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" /> Adjust Opening Balance
                  </button>
                </div>

                {(() => {
                  const ledgerEntries = db.getCustomerLedger(viewingCustomer.id);
                  if (ledgerEntries.length === 0) {
                    return (
                      <div className="p-8 text-center text-slate-400 font-normal">
                        No direct ledger entries found for this customer.
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-slate-100">
                      {ledgerEntries.map((entry) => (
                        <div key={entry.id} className="p-3 hover:bg-slate-50/70 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{entry.entry_type}</span>
                              {entry.reference_no && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                                  {entry.reference_no}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {new Date(entry.date).toLocaleDateString()} &bull; {entry.notes || 'No description'}
                            </div>
                          </div>

                          <div className="text-right font-mono font-bold">
                            {entry.debit > 0 && (
                              <div className="text-rose-600">+₹{entry.debit.toLocaleString('en-IN')} (Debit)</div>
                            )}
                            {entry.credit > 0 && (
                              <div className="text-emerald-600">-₹{entry.credit.toLocaleString('en-IN')} (Credit)</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewingCustomer(null)}
                className="py-2 px-5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black cursor-pointer text-xs"
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

