import React, { useState, useMemo } from 'react';
import { Brand, User, CustomerCategory, PaymentStatus, InventoryItem, Customer, Sale, SaleItem } from '../types';
import { db } from '../dbStore';
import { 
  ShoppingBag, Search, PlusCircle, Check, Trash2, Printer, 
  ChevronRight, Calendar, UserCheck, CreditCard, Eye, X, Plus
} from 'lucide-react';

interface SalesModuleProps {
  brand: Brand;
  user: User;
}

interface SelectedCheckoutPart {
  part_no: string;
  part_name: string;
  mrp: number;
  available_qty: number;
  qty_to_sell: number;
  discount_percentage: number;
}

export default function SalesModule({ brand, user }: SalesModuleProps) {
  const [activeTab, setActiveTab] = useState<'checkout' | 'history'>('checkout');
  
  // Checkout Wizards
  const [customerCategory, setCustomerCategory] = useState<CustomerCategory>('Walk-in');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  // Selected Parts for Checkout
  const [checkoutParts, setCheckoutParts] = useState<SelectedCheckoutPart[]>([]);
  const [partSearch, setPartSearch] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid');
  const [customPaidAmount, setCustomPaidAmount] = useState<number>(0);

  // History states
  const [historySearch, setHistorySearch] = useState('');
  const [historyCategory, setHistoryCategory] = useState<string>('All');
  const [historyPayment, setHistoryPayment] = useState<string>('All');
  const [selectedInvoiceForSlip, setSelectedInvoiceForSlip] = useState<Sale | null>(null);

  // Refresh references
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>(() => db.getInventory(brand));
  const [customersList, setCustomersList] = useState<Customer[]>(() => db.getCustomers());
  const [salesList, setSalesList] = useState<Sale[]>(() => db.getSales(brand));
  const [toastMessageLocal, setToastMessageLocal] = useState<string | null>(null);

  const refreshComponentData = () => {
    setInventoryList(db.getInventory(brand));
    setCustomersList(db.getCustomers());
    setSalesList(db.getSales(brand));
  };

  React.useEffect(() => {
    refreshComponentData();
    return db.subscribe(refreshComponentData);
  }, [brand]);

  const triggerToast = (msg: string) => {
    setToastMessageLocal(msg);
    setTimeout(() => setToastMessageLocal(null), 3000);
  };

  // 1. Part search matching
  const matchedSearchParts = useMemo(() => {
    if (!partSearch.trim()) return [];
    return inventoryList.filter(item => {
      return item.is_active && 
        (item.part_no.toLowerCase().includes(partSearch.toLowerCase()) || 
         item.part_name.toLowerCase().includes(partSearch.toLowerCase()));
    }).slice(0, 5); // top 5 matches
  }, [inventoryList, partSearch]);

  const handleCreateNewCustomer = () => {
    if (!customerName.trim()) return;
    const existing = customersList.find(c => c.customer_name.trim().toLowerCase() === customerName.trim().toLowerCase());
    if (existing) {
      setSelectedCustomerId(existing.id);
      triggerToast(`Found existing customer: ${existing.customer_name}`);
      return;
    }
    const created = db.addCustomer(customerName, customerCategory, phone);
    refreshComponentData();
    setSelectedCustomerId(created.id);
    triggerToast(`Registered new customer ${created.customer_name}`);
  };

  const handleSelectExistingCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.customer_name);
    setCustomerCategory(c.customer_category);
    setPhone(c.phone || '');
  };

  const handleAddPartToCheckout = (inv: InventoryItem) => {
    // If already in checkout
    if (checkoutParts.some(p => p.part_no === inv.part_no)) {
      triggerToast(`${inv.part_no} already added to card. Update quantity below.`);
      setPartSearch('');
      return;
    }

    if (inv.quantity <= 0) {
      alert("This part has 0 items remaining in stock!");
      return;
    }

    const newItem: SelectedCheckoutPart = {
      part_no: inv.part_no,
      part_name: inv.part_name,
      mrp: inv.mrp,
      available_qty: inv.quantity,
      qty_to_sell: 1,
      discount_percentage: 0
    };

    setCheckoutParts([...checkoutParts, newItem]);
    setPartSearch('');
  };

  const handleRemoveCheckoutPart = (partNo: string) => {
    setCheckoutParts(checkoutParts.filter(p => p.part_no !== partNo));
  };

  const handleUpdateCheckoutQty = (partNo: string, val: number) => {
    setCheckoutParts(checkoutParts.map(p => {
      if (p.part_no === partNo) {
        const capped = Math.min(p.available_qty, Math.max(1, val));
        return { ...p, qty_to_sell: capped };
      }
      return p;
    }));
  };

  const handleUpdateCheckoutDiscount = (partNo: string, pct: number) => {
    setCheckoutParts(checkoutParts.map(p => {
      if (p.part_no === partNo) {
        return { ...p, discount_percentage: Math.min(100, Math.max(0, pct)) };
      }
      return p;
    }));
  };

  // Math Calculations
  const checkoutSubtotal = useMemo(() => {
    return checkoutParts.reduce((acc, p) => {
      const lineCost = p.mrp * p.qty_to_sell;
      const lineDiscount = lineCost * (p.discount_percentage / 100);
      return acc + (lineCost - lineDiscount);
    }, 0);
  }, [checkoutParts]);

  const checkoutTotal = useMemo(() => {
    const dis = checkoutSubtotal * (globalDiscount / 100);
    return Math.max(0, checkoutSubtotal - dis);
  }, [checkoutSubtotal, globalDiscount]);

  const actualCustomPaid = paymentStatus === 'Paid' 
    ? checkoutTotal 
    : paymentStatus === 'Pending' 
      ? 0 
      : customPaidAmount;

  const actualCustomPending = paymentStatus === 'Paid'
    ? 0
    : paymentStatus === 'Pending'
      ? checkoutTotal
      : Math.max(0, checkoutTotal - customPaidAmount);

  // SAVE BILL DISPATCH
  const handleSaveBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkoutParts.length === 0) {
      alert("Please add at least one part to save invoice");
      return;
    }

    if (!customerName.trim()) {
      alert("Customer Name is required.");
      return;
    }

    try {
      // 1. Resolve Customer registration code
      let finalCustId = selectedCustomerId;
      if (!finalCustId) {
        const created = db.addCustomer(customerName, customerCategory, phone);
        finalCustId = created.id;
      }

      // 2. Perform DB transaction
      const payloadItems = checkoutParts.map(p => ({
        part_no: p.part_no,
        quantity: p.qty_to_sell,
        discount_percentage: p.discount_percentage
      }));

      const newSale = db.createSale(
        brand,
        finalCustId,
        customerName,
        customerCategory,
        payloadItems,
        globalDiscount,
        paymentStatus,
        paymentStatus === 'Custom Amount' ? customPaidAmount : 0,
        user
      );

      // Clean checkout page
      setCheckoutParts([]);
      setCustomerName('');
      setSelectedCustomerId('');
      setPhone('');
      setGlobalDiscount(0);
      setCustomPaidAmount(0);

      refreshComponentData();
      triggerToast(`Saved checkout successfully! Invoice: ${newSale.id}`);
      
      // Open print slip popup directly
      setSelectedInvoiceForSlip(newSale);
    } catch (err: any) {
      alert(`Checkout failed: ${err.message}`);
    }
  };

  // History filters
  const filteredSalesHistory = useMemo(() => {
    return salesList.filter(s => {
      const matchesSearch = s.customer_name.toLowerCase().includes(historySearch.toLowerCase()) || 
                            s.id.toLowerCase().includes(historySearch.toLowerCase());
      
      const matchesCategory = historyCategory === 'All' || s.customer_category === historyCategory;
      const matchesPayment = historyPayment === 'All' || s.payment_status === historyPayment;

      return matchesSearch && matchesCategory && matchesPayment;
    });
  }, [salesList, historySearch, historyCategory, historyPayment]);

  const handlePrintSlipAction = () => {
    window.print();
  };

  // Get line items specifically for the print slip modal
  const selectedInvoiceItems = useMemo(() => {
    if (!selectedInvoiceForSlip) return [];
    const allItems = db.getSaleItems(brand);
    return allItems.filter(item => item.sale_id === selectedInvoiceForSlip.id);
  }, [selectedInvoiceForSlip, brand]);

  return (
    <div className="space-y-6">
      
      {/* Toast message wrapper */}
      {toastMessageLocal && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-bounce">
          <CheckCircle2Icon className="w-4.5 h-4.5 text-emerald-400" />
          {toastMessageLocal}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => {
            setActiveTab('checkout');
            refreshComponentData();
          }}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'checkout'
              ? 'border-indigo-600 text-indigo-650'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          New Sale checkout Bill
        </button>
        <button
          onClick={() => {
            setActiveTab('history');
            refreshComponentData();
          }}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-indigo-600 text-indigo-650'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Sales Invoice history ({salesList.length} Invoices)
        </button>
      </div>

      {activeTab === 'checkout' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Checkout Steps Form */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Customer category & Registration */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 inline-flex items-center justify-center font-bold text-xs">
                  1
                </span>
                Customer Profile Information
              </h3>

              <div className="space-y-3 font-semibold text-slate-700 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">Select Customer Category</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['Walk-in', 'Mistri', 'Retailer', 'Garage'] as CustomerCategory[]).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCustomerCategory(cat)}
                        className={`p-2.5 rounded-xl border text-center transition ${
                          customerCategory === cat
                            ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold'
                            : 'border-slate-200 text-slate-600 bg-white hover:border-slate-350'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-500 mb-1">Customer Name</label>
                    <input
                      type="text"
                      className="w-full p-2.5 border border-slate-200 rounded-xl font-medium"
                      placeholder="e.g. Ramesh Chandra Auto Sales"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Phone Number (Optional)</label>
                    <input
                      type="text"
                      className="w-full p-2.5 border border-slate-200 rounded-xl"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                {/* Quick Auto-complete matches */}
                <div className="bg-slate-50 p-3 rounded-xl space-y-2">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Match existing clients list</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customersList.filter(c => c.customer_category === customerCategory).slice(0, 4).map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectExistingCustomer(c)}
                        className={`px-2 py-1.5 rounded-lg border text-[11px] font-normal flex items-center gap-1 ${
                          selectedCustomerId === c.id 
                            ? 'bg-indigo-600 text-white border-transparent' 
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        <UserCheck className="w-3 h-3" />
                        {c.customer_name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Sale Items search and grid */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 inline-flex items-center justify-center font-bold text-xs">
                  2
                </span>
                Add Spare Parts to Sell Bill
              </h3>

              {/* Part searching bar */}
              <div className="relative font-semibold text-slate-700 text-xs">
                <label className="block text-slate-500 mb-1">Search active parts by part no or part name</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                  <input
                    type="text"
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-indigo-600/30"
                    placeholder="Search e.g. brake pads, Air Filters..."
                    value={partSearch}
                    onChange={(e) => setPartSearch(e.target.value)}
                  />
                </div>

                {/* Autocomplete drawer */}
                {matchedSearchParts.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden divide-y divide-slate-100">
                    {matchedSearchParts.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAddPartToCheckout(item)}
                        className="w-full p-2.5 text-left text-xs font-semibold flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                      >
                        <div>
                          <p className="text-slate-900 font-mono font-bold">{item.part_no}</p>
                          <p className="text-slate-500 text-[10px] font-normal">{item.part_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-indigo-600 font-bold">₹{item.mrp}</p>
                          <p className={`text-[9px] ${item.quantity <= 3 ? 'text-red-500' : 'text-slate-400'}`}>
                            Stock Left: {item.quantity} units
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Added items list */}
              <div className="pt-2">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                        <th className="p-3">Matched Spare Part details</th>
                        <th className="p-3 text-center">MRP (INR)</th>
                        <th className="p-3 text-center">Checkout Qty</th>
                        <th className="p-3 text-center">Dis %</th>
                        <th className="p-3 text-right">Final Amount</th>
                        <TH_PRINT />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {checkoutParts.map((item) => {
                        const lineVal = item.mrp * item.qty_to_sell;
                        const finalLineVal = lineVal - (lineVal * (item.discount_percentage / 100));
                        return (
                          <tr key={item.part_no} className="hover:bg-slate-50/50">
                            <td className="p-3 max-w-[200px]">
                              <p className="font-bold font-mono text-slate-900 flex items-center gap-1.5 leading-tight">
                                {item.part_no}
                              </p>
                              <p className="text-[10px] text-slate-400 font-normal leading-tight">{item.part_name}</p>
                            </td>
                            
                            <td className="p-3 text-center">₹{item.mrp}</td>
                            
                            <td className="p-3 text-center">
                              <div className="inline-flex items-center gap-1 justify-center">
                                <input
                                  type="number"
                                  min="1"
                                  max={item.available_qty}
                                  className="w-14 p-1 border border-slate-200 rounded text-center text-xs font-bold"
                                  value={item.qty_to_sell}
                                  onChange={(e) => handleUpdateCheckoutQty(item.part_no, Number(e.target.value))}
                                />
                                <span className="text-[10px] text-slate-400 font-normal">/ {item.available_qty}</span>
                              </div>
                            </td>

                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                className="w-12 p-1 border border-slate-200 rounded text-center text-xs"
                                value={item.discount_percentage || ''}
                                onChange={(e) => handleUpdateCheckoutDiscount(item.part_no, Number(e.target.value))}
                              />
                            </td>

                            <td className="p-3 text-right font-bold text-slate-900">₹{finalLineVal.toFixed(2)}</td>
                            
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveCheckoutPart(item.part_no)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {checkoutParts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 text-xs font-normal">
                            No parts currently loaded in active sale slip.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>

          {/* Right Summary Billing Panel */}
          <div className="space-y-6">
            
            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl space-y-6">
              <h3 className="font-bold text-sm tracking-wide uppercase flex items-center gap-1 text-slate-350">
                <CreditCard className="w-4.5 h-4.5" />
                Receipt Calculations
              </h3>

              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Pre-Discount subtotal</span>
                  <span className="font-mono">₹{checkoutSubtotal.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 font-semibold">Special Order Discount %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="w-16 p-1 border border-slate-700 rounded bg-slate-850 text-white text-center font-bold"
                    value={globalDiscount || ''}
                    onChange={(e) => setGlobalDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                  />
                </div>

                <div className="border-t border-slate-800 pt-3 flex justify-between items-baseline">
                  <span className="text-slate-400 font-extrabold text-sm">Final Payable Invoice Total</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">₹{checkoutTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Step 5: Choose Payment Status */}
              <div className="space-y-3 pt-3 border-t border-slate-850 text-xs">
                <label className="block text-slate-350 uppercase tracking-widest text-[10px] font-bold">Payment Status Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Paid', 'Pending', 'Custom Amount'] as PaymentStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPaymentStatus(st)}
                      className={`py-2 rounded-xl text-[10px] font-bold text-center border transition ${
                        paymentStatus === st
                          ? 'bg-emerald-600 text-white border-transparent'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {st === 'Custom Amount' ? 'Custom' : st}
                    </button>
                  ))}
                </div>

                {paymentStatus === 'Custom Amount' && (
                  <div className="space-y-2 bg-slate-850/80 p-3 rounded-xl border border-slate-800">
                    <label className="block text-slate-400">Enter Cash Received (INR)</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      max={checkoutTotal}
                      className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-900 text-white font-mono font-bold"
                      value={customPaidAmount || ''}
                      onChange={(e) => setCustomPaidAmount(Number(e.target.value))}
                    />
                    <div className="flex justify-between text-[11px] font-normal text-slate-400 pt-1">
                      <span>Calculated Pending:</span>
                      <span className="font-mono text-red-400 font-semibold">₹{(checkoutTotal - customPaidAmount).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dispatch Action */}
              <button
                type="button"
                onClick={handleSaveBill}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-extrabold shadow-lg hover:shadow-indigo-500/10 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Complete Billing Slip</span>
                <ChevronRight className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="border border-slate-200 bg-white p-4 rounded-2xl text-xs text-slate-400">
              <p>On finishing the slip:</p>
              <ul className="list-disc pl-4 mt-2 space-y-1">
                <li>Inventory items are deducted instantly.</li>
                <li>Ledger balances are recorded dynamically.</li>
                <li>Printer ready invoice receipt pops up directly.</li>
              </ul>
            </div>

          </div>

        </div>
      ) : (
        /* History tab */
        <div className="space-y-4">
          
          {/* History Search/Filters */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-3">
            
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
              <input
                type="text"
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-indigo-600/20"
                placeholder="Search history by Customer Name or Sale ID..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {/* Category filter */}
              <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-600">
                <span className="text-[10px] uppercase font-bold text-slate-400">Category:</span>
                <select 
                  className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
                  value={historyCategory}
                  onChange={(e) => setHistoryCategory(e.target.value)}
                >
                  <option value="All">All Categories</option>
                  <option value="Walk-in">Walk-in</option>
                  <option value="Mistri">Mistri</option>
                  <option value="Retailer">Retailer</option>
                  <option value="Garage">Garage</option>
                </select>
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-600">
                <span className="text-[10px] uppercase font-bold text-slate-400">Payment:</span>
                <select 
                  className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
                  value={historyPayment}
                  onChange={(e) => setHistoryPayment(e.target.value)}
                >
                  <option value="All">All Payment States</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Custom Amount">Custom Amount</option>
                </select>
              </div>
            </div>

          </div>

          {/* History list box */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs font-semibold text-slate-600">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-4">Invoice ID</th>
                    <th className="p-4">Sale Date</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Subtotal</th>
                    <th className="p-4">Disc %</th>
                    <th className="p-4">Final Bill</th>
                    <th className="p-4">Collector Status</th>
                    <th className="p-4 text-right">Utility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredSalesHistory.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/50">
                      <td className="p-4 font-mono font-bold text-slate-900">{sale.id}</td>
                      <td className="p-4 font-normal text-slate-450">{new Date(sale.sale_date).toLocaleDateString()}</td>
                      <td className="p-4 font-medium text-slate-800">{sale.customer_name}</td>
                      <td className="p-4">{sale.customer_category}</td>
                      <td className="p-4">₹{sale.subtotal.toFixed(2)}</td>
                      <td className="p-4 text-center">{sale.discount_percentage}%</td>
                      <td className="p-4 font-bold text-slate-900">₹{sale.total_amount.toFixed(2)}</td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          sale.payment_status === 'Paid' 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {sale.payment_status}
                        </span>
                      </td>
                      <td className="p-4 text-right flex justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedInvoiceForSlip(sale)}
                          className="p-1 px-2 text-indigo-650 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View / Print Slip
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredSalesHistory.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-400 font-normal">
                        No invoices returned for active query filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* PRINT SLIP SLIDER MODAL (With direct print function) */}
      {selectedInvoiceForSlip !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden text-xs">
            
            {/* Header */}
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center no-print">
              <h3 className="font-bold text-slate-800">Print Store Reciept Slip</h3>
              <button 
                onClick={() => setSelectedInvoiceForSlip(null)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Print Slip Document Box */}
            <div id="print-receipt-paper" className="p-6 font-mono text-slate-900 space-y-4 max-h-[70vh] overflow-y-auto bg-slate-50">
              
              {/* Slip Layout Template */}
              <div className="text-center pb-2 border-b-2 border-dashed border-slate-350 space-y-1">
                <h4 className="text-sm font-bold tracking-widest text-[#000]">SPAREZY Auto Spares</h4>
                <p className="text-[10px] text-slate-650">Brand Gateway: {brand}</p>
                <p className="text-[10px] text-slate-650">Email: info@sparezy.com</p>
                <div className="text-[10px] text-slate-500 pt-2 text-left space-y-0.5">
                  <p>Invoice ID : {selectedInvoiceForSlip.id}</p>
                  <p>Date       : {new Date(selectedInvoiceForSlip.sale_date).toLocaleString()}</p>
                  <p>Customer   : {selectedInvoiceForSlip.customer_name} ({selectedInvoiceForSlip.customer_category})</p>
                </div>
              </div>

              {/* Items Lines */}
              <div className="space-y-2 py-2 border-b-2 border-dashed border-slate-350">
                <div className="flex justify-between font-bold text-[10px] uppercase text-slate-500">
                  <span>Part Item list details</span>
                  <div className="flex gap-4">
                    <span className="w-10 text-center">Qty * MRP</span>
                    <span className="w-16 text-right">Total</span>
                  </div>
                </div>

                <div className="divide-y divide-dashed divide-slate-200">
                  {selectedInvoiceItems.map((line) => (
                    <div key={line.id} className="py-2 flex justify-between gap-2.5">
                      
                      {/* ONLY SHOW PART NAME, QTY, MRP, DISCOUNT and TOTAL. DO NOT SHOW PART NUMBER! */}
                      <div>
                        <p className="font-bold text-[#000]">{line.part_name}</p>
                        {line.discount_percentage > 0 && (
                          <span className="text-[10px] text-slate-550 italic">Item Discount: -{line.discount_percentage}%</span>
                        )}
                      </div>

                      <div className="flex gap-4 shrink-0 text-[11px] items-baseline">
                        <span className="w-10 text-center text-slate-600">{line.quantity} &times; {line.mrp}</span>
                        <span className="w-16 text-right font-bold">₹{line.final_amount.toFixed(0)}</span>
                      </div>

                    </div>
                  ))}
                </div>
              </div>

              {/* Accumulates Math */}
              <div className="space-y-1.5 text-[11px] text-right font-bold">
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Subtotal:</span>
                  <span>₹{selectedInvoiceForSlip.subtotal.toFixed(2)}</span>
                </div>
                {selectedInvoiceForSlip.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Invoice Discount ({selectedInvoiceForSlip.discount_percentage}%):</span>
                    <span>-₹{selectedInvoiceForSlip.discount_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#000] text-sm pt-2 border-t border-slate-300">
                  <span>Total Amount Paid:</span>
                  <span>₹{selectedInvoiceForSlip.paid_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-600 text-xs">
                  <span>Pending Balance:</span>
                  <span>₹{selectedInvoiceForSlip.pending_amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center pt-4 border-t-2 border-dashed border-slate-350 text-[10px] text-slate-400">
                <p>Thank you for doing business with us!</p>
                <p className="mt-1">Generated by User: {selectedInvoiceForSlip.created_by}</p>
              </div>

            </div>

            {/* Print and Save Options */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2.5 no-print">
              <button
                type="button"
                onClick={() => {
                  const content = document.getElementById('print-receipt-paper')?.innerHTML;
                  const win = window.open('', '', 'height=600,width=400');
                  if (win) {
                    win.document.write('<html><head><title>Sparezy POS Slip</title><style>body { font-family: monospace; padding: 20px; text-transform: uppercase; color: #000; }</style></head><body>');
                    win.document.write(content || '');
                    win.document.write('</body></html>');
                    win.document.close();
                    win.print();
                  }
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Trigger Print
              </button>
              <button
                type="button"
                onClick={() => setSelectedInvoiceForSlip(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-xl font-medium cursor-pointer"
              >
                Close View
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// Subordinate components definitions
function CheckCircle2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  );
}

function TH_PRINT() {
  return <th className="p-3 text-center">Remove</th>;
}
