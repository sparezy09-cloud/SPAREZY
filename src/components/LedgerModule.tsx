import { useState, useMemo, useEffect } from 'react';
import { Brand, User, Customer, CustomerCategory, CustomerPayment, CustomerLedgerEntry, Purchase } from '../types';
import { db } from '../dbStore';
import * as XLSX from 'xlsx';
import { 
  Users, Calendar, Download, Printer, ArrowRight, ArrowLeft,
  HelpCircle, CheckCircle, FileSpreadsheet, Building2, Eye, X,
  Plus, Search, MessageSquare, Edit2, TrendingUp, DollarSign,
  PlusCircle, CreditCard, ChevronRight, Share2
} from 'lucide-react';

interface LedgerModuleProps {
  brand: Brand;
  user: User;
}

export default function LedgerModule({ brand, user }: LedgerModuleProps) {
  const [ledgerType, setLedgerType] = useState<'customer' | 'dealer'>('customer');
  
  // Search and Filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCategoryFilter, setCustomerCategoryFilter] = useState<string>('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected customer details
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerLedger, setSelectedCustomerLedger] = useState<CustomerLedgerEntry[]>([]);
  const [selectedCustomerPayments, setSelectedCustomerPayments] = useState<CustomerPayment[]>([]);
  const [ledgerTotalCount, setLedgerTotalCount] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);

  // Selected dealer details
  const [selectedDealerInvoices, setSelectedDealerInvoices] = useState<Purchase[]>([]);
  const [activeDealerName, setActiveDealerName] = useState<string | null>(null);

  // Modals / Actions
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [showReceivePaymentModal, setShowReceivePaymentModal] = useState(false);
  
  // Forms States
  const [newCustName, setNewCustName] = useState('');
  const [newCustCategory, setNewCustCategory] = useState<CustomerCategory>('Walk-in');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustStarting, setNewCustStarting] = useState(0);

  const [editCustName, setEditCustName] = useState('');
  const [editCustCategory, setEditCustCategory] = useState<CustomerCategory>('Walk-in');
  const [editCustPhone, setEditCustPhone] = useState('');
  const [editCustStarting, setEditCustStarting] = useState(0);

  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Bank'>('Cash');
  const [paymentNote, setPaymentNote] = useState('');

  // Main data lists from store
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [purchasesList, setPurchasesList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination states for primary lists
  const [customerPage, setCustomerPage] = useState(1);
  const [dealerPage, setDealerPage] = useState(1);
  const ledgersPerPage = 15;

  const refreshComponentData = async () => {
    setIsLoading(true);
    try {
      // Fetch data for brand
      await db.fetchLedgerData(brand);
      setCustomersList(db.getCustomers());
      setPurchasesList(db.getPurchases(brand));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshComponentData();
    return db.subscribe(refreshComponentData);
  }, [brand]);

  // Handle customer ledger detail query
  useEffect(() => {
    if (selectedCustomerId) {
      setIsLedgerLoading(true);
      db.getCustomerLedger(selectedCustomerId, ledgerPage, 20)
        .then(res => {
          setSelectedCustomerLedger(res.items);
          setLedgerTotalCount(res.totalCount);
        })
        .catch(console.error)
        .finally(() => setIsLedgerLoading(false));

      // Fetch payment list
      const pays = db.getCustomerPayments(selectedCustomerId);
      setSelectedCustomerPayments(pays);
    }
  }, [selectedCustomerId, ledgerPage, customersList]);

  // Selected Customer Object
  const selectedCustomer = useMemo(() => {
    return customersList.find(c => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, customersList]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customersList.filter(cust => {
      const matchesSearch = cust.customer_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (cust.phone && cust.phone.includes(customerSearch));
      const matchesCategory = customerCategoryFilter === 'All' || cust.customer_category === customerCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [customersList, customerSearch, customerCategoryFilter]);

  // Customer Ledger calculations & summaries
  const customerLedgerSummary = useMemo(() => {
    let totalOutstanding = 0;
    let totalStarting = 0;
    let totalSales = 0;
    let totalPayments = 0;

    filteredCustomers.forEach(cust => {
      totalOutstanding += Number(cust.current_outstanding || 0);
      totalStarting += Number(cust.starting_outstanding || 0);
      totalSales += Number(cust.total_sales || 0);
      totalPayments += Number(cust.total_payments || 0);
    });

    return {
      totalOutstanding,
      totalStarting,
      totalSales,
      totalPayments
    };
  }, [filteredCustomers]);

  // Dealer Records Aggregation
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
      mapOfDealers[name].totalPurchasedValuation += Number(p.total_after_discount || 0);
      mapOfDealers[name].totalDiscountAmount += Number(p.discount_amount || 0);
      mapOfDealers[name].invoicesList.push(p);
    });

    return Object.values(mapOfDealers);
  }, [purchasesList, startDate, endDate]);

  const totalCustomerPages = Math.ceil(filteredCustomers.length / ledgersPerPage) || 1;
  const paginatedCustomers = useMemo(() => {
    const startIndex = (customerPage - 1) * ledgersPerPage;
    return filteredCustomers.slice(startIndex, startIndex + ledgersPerPage);
  }, [filteredCustomers, customerPage]);

  const totalDealerPages = Math.ceil(dealerLedgers.length / ledgersPerPage) || 1;
  const paginatedDealerLedgers = useMemo(() => {
    const startIndex = (dealerPage - 1) * ledgersPerPage;
    return dealerLedgers.slice(startIndex, startIndex + ledgersPerPage);
  }, [dealerLedgers, dealerPage]);

  // Reset pagination on filters change
  useEffect(() => {
    setCustomerPage(1);
    setDealerPage(1);
  }, [brand, ledgerType, customerSearch, customerCategoryFilter, startDate, endDate]);

  // --- ACTIONS ---

  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;
    try {
      await db.addCustomer(newCustName.trim(), newCustCategory, newCustPhone.trim(), newCustStarting);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustStarting(0);
      setNewCustCategory('Walk-in');
      setShowAddCustomerModal(false);
    } catch (err) {
      alert("Failed to create customer: " + err);
    }
  };

  const handleEditCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !editCustName.trim()) return;
    try {
      await db.updateCustomer(selectedCustomerId, editCustName.trim(), editCustCategory, editCustPhone.trim(), editCustStarting);
      setShowEditCustomerModal(false);
    } catch (err) {
      alert("Failed to update customer: " + err);
    }
  };

  const handleReceivePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || paymentAmount <= 0) return;
    try {
      await db.createCustomerPayment({
        customer_id: selectedCustomerId,
        amount: paymentAmount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        note: paymentNote.trim(),
        created_by: user.name
      });
      setPaymentAmount(0);
      setPaymentNote('');
      setShowReceivePaymentModal(false);
    } catch (err) {
      alert("Failed to receive payment: " + err);
    }
  };

  const openEditModal = () => {
    if (!selectedCustomer) return;
    setEditCustName(selectedCustomer.customer_name);
    setEditCustCategory(selectedCustomer.customer_category);
    setEditCustPhone(selectedCustomer.phone || '');
    setEditCustStarting(selectedCustomer.starting_outstanding || 0);
    setShowEditCustomerModal(true);
  };

  // WhatsApp Reminder Generator
  const sendWhatsAppReminder = (cust: Customer) => {
    if (!cust.phone) return;
    const formattedPhone = cust.phone.replace(/\D/g, '');
    const cleanPhone = formattedPhone.startsWith('91') && formattedPhone.length === 12 
      ? formattedPhone 
      : formattedPhone.length === 10 
        ? '91' + formattedPhone 
        : formattedPhone;

    const msg = `Dear ${cust.customer_name},\n\nThis is a friendly reminder from Sparezy Auto Spares regarding your outstanding balance for recent spare parts billing.\n\n*Current Outstanding Balance: ₹${Number(cust.current_outstanding || 0).toLocaleString('en-IN')}*\n\nKindly arrange to clear the pending dues using GPay/UPI, Net Banking, or Cash. Thank you for your continued business!`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  };

  // --- EXPORTERS & PRINTERS ---

  const handleExportCustomer = (format: 'xlsx' | 'csv') => {
    const formattedData = filteredCustomers.map(row => ({
      "Customer Name": row.customer_name,
      "Category": row.customer_category,
      "Phone": row.phone || "N/A",
      "Starting Outstanding": row.starting_outstanding || 0,
      "Aggregate Sales (INR)": row.total_sales || 0,
      "Cleared Payments (INR)": row.total_payments || 0,
      "Returns Refund (INR)": row.total_returns || 0,
      "Current Outstanding Due": row.current_outstanding || 0
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customer Ledger Summary");

    const stamp = new Date().toISOString().split('T')[0];
    const fileName = `Sparezy_${brand}_Customer_Khatabook_${stamp}`;

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: 'csv' });
    }
  };

  const handlePrintLedgerPdf = () => {
    const content = document.getElementById('ledger-printable-content')?.innerHTML;
    const printWin = window.open('', '', 'height=600,width=800');
    if (printWin) {
      printWin.document.write(`
        <html>
          <head>
            <title>Sparezy Auto Spares - Customer Balance Sheet</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1e293b; }
              h1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
              th { background: #f1f5f9; padding: 10px; text-align: left; font-weight: bold; }
              td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
              .totals { font-weight: bold; background: #fafafa; }
              .bold { font-weight: bold; }
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

  const handlePrintIndividualLedgerPdf = () => {
    if (!selectedCustomer) return;
    const content = document.getElementById('individual-ledger-printable')?.innerHTML;
    const printWin = window.open('', '', 'height=600,width=800');
    if (printWin) {
      printWin.document.write(`
        <html>
          <head>
            <title>Sparezy Auto Spares - Account Statement: ${selectedCustomer.customer_name}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1e293b; }
              h1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
              th { background: #f1f5f9; padding: 10px; text-align: left; font-weight: bold; }
              td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
              .totals { font-weight: bold; background: #fafafa; }
              .bold { font-weight: bold; }
              .header-table { width: 100%; margin-bottom: 20px; }
              .header-table td { border: none; padding: 5px; }
            </style>
          </head>
          <body>
            <h1>Sparezy Auto Spares - ${brand}</h1>
            <h3>Customer Account Book Statement</h3>
            <table class="header-table">
              <tr>
                <td><strong>Customer:</strong> ${selectedCustomer.customer_name}</td>
                <td><strong>Current Outstanding:</strong> ₹${Number(selectedCustomer.current_outstanding || 0).toLocaleString('en-IN')} Due</td>
              </tr>
              <tr>
                <td><strong>Phone:</strong> ${selectedCustomer.phone || 'N/A'}</td>
                <td><strong>Statement Date:</strong> ${new Date().toLocaleDateString('en-IN')}</td>
              </tr>
            </table>
            ${content || ''}
            <script>window.print();</script>
          </body>
        </html>
      `);
      printWin.document.close();
    }
  };

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

      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
            <Users className="w-5 h-5 text-indigo-650" />
            Customer Accounts Book (Khatabook) &amp; Dealer Invoices
          </h2>
          <p className="text-sm text-slate-500">
            Automated outstanding debit/credit ledgers, customer starting balances, real-time WhatsApp reminders, and secure payments tracking.
          </p>
        </div>

        {/* Brand/Schema switch feedback & ledger toggle */}
        <div className="flex bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => {
              setLedgerType('customer');
              setSelectedDealerInvoices([]);
              setSelectedCustomerId(null);
              refreshComponentData();
            }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              ledgerType === 'customer' 
                ? 'bg-white text-slate-900 shadow' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Customer Khatabook
          </button>
          <button
            onClick={() => {
              setLedgerType('dealer');
              setSelectedDealerInvoices([]);
              setSelectedCustomerId(null);
              refreshComponentData();
            }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              ledgerType === 'dealer' 
                ? 'bg-white text-slate-900 shadow' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dealer Records
          </button>
        </div>
      </div>

      {ledgerType === 'customer' ? (
        <>
          {/* Main List View vs Individual ledger view */}
          {!selectedCustomerId ? (
            <div className="space-y-6">
              
              {/* Core Financial Indicators */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Credit Outstanding</span>
                  <div className="text-2xl font-extrabold text-amber-600">
                    ₹{customerLedgerSummary.totalOutstanding.toLocaleString('en-IN')}
                  </div>
                  <p className="text-[11px] text-slate-400">Net uncollected customer receivables</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Starting Balances</span>
                  <div className="text-2xl font-extrabold text-slate-700">
                    ₹{customerLedgerSummary.totalStarting.toLocaleString('en-IN')}
                  </div>
                  <p className="text-[11px] text-slate-400">Aggregated opening outstanding balances</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Aggregate Sales</span>
                  <div className="text-2xl font-extrabold text-indigo-600">
                    ₹{customerLedgerSummary.totalSales.toLocaleString('en-IN')}
                  </div>
                  <p className="text-[11px] text-slate-400">Total spare part sales billed</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Payments Collected</span>
                  <div className="text-2xl font-extrabold text-emerald-600">
                    ₹{customerLedgerSummary.totalPayments.toLocaleString('en-IN')}
                  </div>
                  <p className="text-[11px] text-slate-400">Khatabook payments cleared by clients</p>
                </div>
              </div>

              {/* Utility Filter Bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-1">
                  
                  {/* Search box */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search customer name or phone number..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-400 transition"
                    />
                  </div>

                  {/* Category Filter */}
                  <select
                    value={customerCategoryFilter}
                    onChange={(e) => setCustomerCategoryFilter(e.target.value)}
                    className="p-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 bg-white"
                  >
                    <option value="All">All Categories</option>
                    <option value="Walk-in">Walk-in</option>
                    <option value="Mistri">Mistri</option>
                    <option value="Retailer">Retailer</option>
                    <option value="Garage">Garage</option>
                    <option value="Direct Customer">Direct Customer</option>
                  </select>
                </div>

                {/* Exporter and Customer Creator Button */}
                <div className="flex gap-2 text-xs font-bold self-end md:self-auto">
                  <button
                    onClick={() => handleExportCustomer('xlsx')}
                    className="bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 px-3 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    Export
                  </button>
                  <button
                    onClick={handlePrintLedgerPdf}
                    className="bg-white border border-slate-200 hover:border-indigo-400 text-indigo-700 px-3 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                  >
                    <Printer className="w-4 h-4" />
                    Print Statement
                  </button>
                  <button
                    onClick={() => setShowAddCustomerModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                  >
                    <Plus className="w-4 h-4" />
                    New Customer
                  </button>
                </div>
              </div>

              {/* Customer Khatabook Ledger Table */}
              <div id="ledger-printable-content" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider">
                      <tr>
                        <th className="p-3">Customer Name</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3 text-right">Starting Outstanding</th>
                        <th className="p-3 text-right">Total Sales</th>
                        <th className="p-3 text-right">Payments Cleared</th>
                        <th className="p-3 text-right">Total Returns</th>
                        <th className="p-3 text-right">Outstanding balance</th>
                        <th className="p-3 text-center pdf-hide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-705">
                      {paginatedCustomers.map((cust) => (
                        <tr key={cust.id} className="hover:bg-slate-50/50 transition duration-150">
                          <td className="p-3 font-bold text-slate-900">{cust.customer_name}</td>
                          <td className="p-3">{cust.customer_category}</td>
                          <td className="p-3 font-mono">{cust.phone || 'N/A'}</td>
                          <td className="p-3 text-right">₹{Number(cust.starting_outstanding || 0).toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right text-indigo-600">₹{Number(cust.total_sales || 0).toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right text-emerald-600">₹{Number(cust.total_payments || 0).toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right text-rose-500">₹{Number(cust.total_returns || 0).toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right">
                            <span className={`inline-flex px-2 py-0.5 rounded font-extrabold ${
                              Number(cust.current_outstanding || 0) > 0 
                                ? 'bg-amber-100 text-amber-800' 
                                : Number(cust.current_outstanding || 0) < 0 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : 'bg-slate-100 text-slate-500'
                            }`}>
                              ₹{Number(cust.current_outstanding || 0).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="p-3 text-center pdf-hide flex justify-center items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedCustomerId(cust.id);
                                setLedgerPage(1);
                              }}
                              className="p-1.5 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-indigo-600 rounded-lg text-[10px] inline-flex items-center gap-1 cursor-pointer font-bold"
                              title="View full chronological account ledger"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Ledger
                            </button>
                            <button
                              onClick={() => {
                                setSelectedCustomerId(cust.id);
                                setPaymentAmount(0);
                                setPaymentNote('');
                                setShowReceivePaymentModal(true);
                              }}
                              className="p-1.5 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-emerald-600 rounded-lg text-[10px] inline-flex items-center gap-1 cursor-pointer font-bold"
                              title="Receive Payment directly"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                              Payment
                            </button>
                            {cust.phone ? (
                              <button
                                onClick={() => sendWhatsAppReminder(cust)}
                                className="p-1.5 hover:bg-green-50 border border-slate-200 hover:border-green-200 text-green-600 rounded-lg text-[10px] inline-flex items-center gap-1 cursor-pointer font-bold"
                                title="Send WhatsApp Reminder"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                WhatsApp
                              </button>
                            ) : (
                              <button
                                disabled
                                className="p-1.5 bg-slate-50 border border-slate-200 text-slate-300 rounded-lg text-[10px] inline-flex items-center gap-1 cursor-not-allowed font-bold"
                                title="No phone number configured"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                No Phone
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {paginatedCustomers.length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-12 text-center text-slate-400 font-normal">
                            No customers found in Sparezy's active database matching search terms.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalCustomerPages > 1 && (
                  <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between">
                    <span className="text-slate-500 text-[11px] font-semibold">
                      Page <strong className="text-slate-800">{customerPage}</strong> of <strong className="text-slate-800">{totalCustomerPages}</strong> ({filteredCustomers.length} total customers)
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
            
            /* INDIVIDUAL ACCOUNT LEDGER DETAIL VIEW */
            <div className="space-y-6">
              
              {/* Back & Title Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedCustomerId(null);
                      setSelectedCustomerLedger([]);
                    }}
                    className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition text-slate-600"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <span className="text-[9px] font-extrabold text-indigo-600 uppercase tracking-widest">{selectedCustomer?.customer_category} Customer Account</span>
                    <h3 className="text-xl font-bold text-slate-900 leading-tight">
                      {selectedCustomer?.customer_name}
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <button
                    onClick={() => {
                      setPaymentAmount(0);
                      setPaymentNote('');
                      setShowReceivePaymentModal(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Record Payment
                  </button>
                  {selectedCustomer && (
                    <button
                      onClick={openEditModal}
                      className="bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                    >
                      <Edit2 className="w-4 h-4 text-indigo-650" />
                      Edit Customer Profile
                    </button>
                  )}
                  {selectedCustomer && selectedCustomer.phone && (
                    <button
                      onClick={() => sendWhatsAppReminder(selectedCustomer)}
                      className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                    >
                      <MessageSquare className="w-4 h-4" />
                      WhatsApp Reminder
                    </button>
                  )}
                  <button
                    onClick={handlePrintIndividualLedgerPdf}
                    className="bg-white border border-slate-200 hover:border-indigo-400 text-indigo-700 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                  >
                    <Printer className="w-4 h-4" />
                    Print Statement
                  </button>
                </div>
              </div>

              {/* Financial Balance Summary Dashboard */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Starting Balance</span>
                  <div className="text-lg font-extrabold text-slate-700">
                    ₹{Number(selectedCustomer?.starting_outstanding || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">(+) Total Sales</span>
                  <div className="text-lg font-extrabold text-indigo-600">
                    ₹{Number(selectedCustomer?.total_sales || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">(-) Payments Received</span>
                  <div className="text-lg font-extrabold text-emerald-600">
                    ₹{Number(selectedCustomer?.total_payments || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">(-) Total Returns</span>
                  <div className="text-lg font-extrabold text-rose-500">
                    ₹{Number(selectedCustomer?.total_returns || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-slate-900 p-4 rounded-xl space-y-1 col-span-2 md:col-span-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Net Outstanding Due</span>
                  <div className="text-lg font-extrabold text-amber-500">
                    ₹{Number(selectedCustomer?.current_outstanding || 0).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Account Book detailed ledger list */}
              <div id="individual-ledger-printable" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h4 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
                  Chronological Transaction Ledger (Khatabook entries)
                </h4>

                {isLedgerLoading ? (
                  <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                    Loading Account Book ledger statement...
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold text-slate-600">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[9px]">
                        <tr>
                          <th className="p-3">Tx Date</th>
                          <th className="p-3">Transaction ID / Ref</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Description</th>
                          <th className="p-3 text-right">Debit (Charge)</th>
                          <th className="p-3 text-right">Credit (Cleared)</th>
                          <th className="p-3 text-right">Running Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-705">
                        {/* Compute running balance sequentially for display */}
                        {selectedCustomerLedger.map((entry, index) => {
                          const amt = Number(entry.amount);
                          const isDebit = amt > 0;
                          
                          return (
                            <tr key={entry.id} className="hover:bg-slate-50/50">
                              <td className="p-3 whitespace-nowrap">{new Date(entry.tx_date).toLocaleDateString('en-IN')}</td>
                              <td className="p-3 font-mono text-[10px] text-slate-400">{entry.reference_no?.substring(0, 8) || 'N/A'}</td>
                              <td className="p-3">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  entry.tx_type === 'Opening Balance'
                                    ? 'bg-slate-100 text-slate-700'
                                    : entry.tx_type === 'Sale'
                                      ? 'bg-indigo-50 text-indigo-700'
                                      : entry.tx_type === 'Payment'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-rose-50 text-rose-700'
                                }`}>
                                  {entry.tx_type}
                                </span>
                              </td>
                              <td className="p-3">{entry.description}</td>
                              <td className="p-3 text-right font-mono text-indigo-600">
                                {isDebit ? `₹${amt.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="p-3 text-right font-mono text-emerald-600">
                                {!isDebit ? `₹${Math.abs(amt).toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-800">
                                ₹{amt.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          );
                        })}
                        {selectedCustomerLedger.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-12 text-center text-slate-400 font-normal">
                              No financial entries recorded in this ledger.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Ledger Pagination */}
                {ledgerTotalCount > 20 && (
                  <div className="flex justify-between items-center bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-500 font-semibold">
                      Showing {(ledgerPage - 1) * 20 + 1} - {Math.min(ledgerPage * 20, ledgerTotalCount)} of {ledgerTotalCount} transactions
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setLedgerPage(prev => Math.max(1, prev - 1))}
                        disabled={ledgerPage === 1}
                        className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 text-[11px] font-bold disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setLedgerPage(prev => Math.min(Math.ceil(ledgerTotalCount / 20), prev + 1))}
                        disabled={ledgerPage === Math.ceil(ledgerTotalCount / 20)}
                        className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 text-[11px] font-bold disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </>
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
                <tbody className="divide-y divide-slate-100 text-slate-705">
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
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs font-semibold text-slate-705">
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
                    className="flex-1 bg-slate-900 hover:bg-black text-white py-2.5 rounded-xl text-xs font-bold text-center cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-450" />
                    XLSX
                  </button>
                  <button
                    onClick={() => {
                      const rec = dealerLedgers.find(dl => dl.dealer_name === activeDealerName);
                      if (rec) handleExportDealer(rec, 'csv');
                    }}
                    className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-200 py-2.5 rounded-xl text-xs font-bold text-center cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-450" />
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

      {/* --- ADD CUSTOMER MODAL --- */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900">Add New Customer Account</h3>
              <button onClick={() => setShowAddCustomerModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleAddCustomerSubmit} className="space-y-4 text-xs font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="block text-slate-500">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajkumar Sharma"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-500">Category Type</label>
                  <select
                    value={newCustCategory}
                    onChange={(e) => setNewCustCategory(e.target.value as CustomerCategory)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="Walk-in">Walk-in</option>
                    <option value="Mistri">Mistri</option>
                    <option value="Retailer">Retailer</option>
                    <option value="Garage">Garage</option>
                    <option value="Direct Customer">Direct Customer</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">WhatsApp Phone No.</label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Starting Outstanding Balance (₹) <span className="text-[10px] text-amber-600 font-bold">(Opening Due)</span></label>
                <input
                  type="number"
                  placeholder="e.g. 4500 (Leave 0 if none)"
                  value={newCustStarting || ''}
                  onChange={(e) => setNewCustStarting(Math.max(0, Number(e.target.value)))}
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer"
              >
                Create Account
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT CUSTOMER MODAL --- */}
      {showEditCustomerModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900">Edit Customer Profile</h3>
              <button onClick={() => setShowEditCustomerModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleEditCustomerSubmit} className="space-y-4 text-xs font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="block text-slate-500">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  value={editCustName}
                  onChange={(e) => setEditCustName(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-500">Category Type</label>
                  <select
                    value={editCustCategory}
                    onChange={(e) => setEditCustCategory(e.target.value as CustomerCategory)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="Walk-in">Walk-in</option>
                    <option value="Mistri">Mistri</option>
                    <option value="Retailer">Retailer</option>
                    <option value="Garage">Garage</option>
                    <option value="Direct Customer">Direct Customer</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">WhatsApp Phone No.</label>
                  <input
                    type="tel"
                    value={editCustPhone}
                    onChange={(e) => setEditCustPhone(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Starting Outstanding Balance (₹) <span className="text-[10px] text-amber-600 font-bold">(Opening Due)</span></label>
                <input
                  type="number"
                  value={editCustStarting || ''}
                  onChange={(e) => setEditCustStarting(Math.max(0, Number(e.target.value)))}
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer"
              >
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- RECEIVE PAYMENT MODAL --- */}
      {showReceivePaymentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Receive Outstanding Clearance</span>
                <h3 className="font-extrabold text-sm text-slate-900">Record Customer Payment</h3>
              </div>
              <button onClick={() => setShowReceivePaymentModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleReceivePaymentSubmit} className="space-y-4 text-xs font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="block text-slate-500">Amount Received (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 5000"
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-500">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">Payment Mode</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="GPay/UPI">GPay/UPI</option>
                    <option value="Bank Transfer">Bank Net Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Credit/Debit Card">Credit/Debit Card</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Internal Reference / Transaction Note</label>
                <input
                  type="text"
                  placeholder="e.g. UPI Ref 34241 or invoice partial clearance"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer"
              >
                Record Payment Received
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
