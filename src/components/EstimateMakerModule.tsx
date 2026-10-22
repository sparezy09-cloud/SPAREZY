import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Brand, User, InventoryItem, Customer, CustomerCategory, PaymentType, PaymentStatus, Estimate, EstimateItem } from '../types';
import { db } from '../dbStore';
import { 
  Calculator, Plus, Search, Trash2, Printer, Share2, 
  ArrowRight, CheckCircle2, XCircle, Clock, AlertTriangle, 
  FileText, History, Edit3, ShoppingBag, X, RefreshCw, 
  Check, Filter, Download, UserCheck, ShieldAlert
} from 'lucide-react';

interface EstimateMakerModuleProps {
  brand: Brand;
  user: User;
  onNavigateToSales?: () => void;
}

export default function EstimateMakerModule({ brand, user, onNavigateToSales }: EstimateMakerModuleProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [estimates, setEstimates] = useState<Estimate[]>(() => db.getEstimates(brand));
  const [inventory, setInventory] = useState<InventoryItem[]>(() => db.getInventory(brand));
  const [customers, setCustomers] = useState<Customer[]>(() => db.getCustomers());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync with db changes
  useEffect(() => {
    const handleSync = () => {
      setEstimates(db.getEstimates(brand));
      setInventory(db.getInventory(brand));
      setCustomers(db.getCustomers());
    };
    return db.subscribe(handleSync);
  }, [brand]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ----------------------------------------------------
  // ACTIVE ESTIMATE CREATOR STATE
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCategory, setCustomerCategory] = useState<CustomerCategory>('Walk-in');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [estimateItems, setEstimateItems] = useState<EstimateItem[]>([]);

  // Part Search & Staging State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedInventoryPart, setSelectedInventoryPart] = useState<InventoryItem | null>(null);
  const [stagedQty, setStagedQty] = useState<number>(1);
  const [stagedDiscount, setStagedDiscount] = useState<number>(0);
  const [stagedIsNetPrice, setStagedIsNetPrice] = useState(false);
  const [stagedNetPrice, setStagedNetPrice] = useState<number | ''>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filtered inventory for search suggestions
  const filteredInventory = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return inventory
      .filter(item => 
        item.is_active !== false &&
        (item.part_no.toLowerCase().includes(q) || item.part_name.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [inventory, searchQuery]);

  // Handle selecting customer from master list
  const handleSelectCustomer = (cId: string) => {
    setSelectedCustomerId(cId);
    if (!cId) return;
    const cust = customers.find(c => c.id === cId);
    if (cust) {
      setCustomerName(cust.customer_name);
      setCustomerPhone(cust.phone || '');
      setCustomerCategory(cust.customer_category);
    }
  };

  // Stage inventory part into the add-box
  const handleSelectPart = (part: InventoryItem) => {
    setSelectedInventoryPart(part);
    setSearchQuery(part.part_no);
    setIsSearchFocused(false);
    setStagedQty(1);
    setStagedDiscount(0);
    setStagedIsNetPrice(false);
    setStagedNetPrice(part.mrp);
  };

  // Add staged part to estimateItems list
  const handleAddStagedPart = () => {
    if (!selectedInventoryPart) return;
    if (stagedQty <= 0) {
      alert("Please enter a valid quantity greater than 0.");
      return;
    }

    const mrp = selectedInventoryPart.mrp;
    const isNet = stagedIsNetPrice && typeof stagedNetPrice === 'number' && stagedNetPrice > 0;
    const unitPrice = isNet ? (stagedNetPrice as number) : mrp;
    const sub = unitPrice * stagedQty;
    const disc = isNet ? 0 : stagedDiscount;
    const finalAmt = sub - (sub * (disc / 100));

    // Check if already in estimate
    const existingIdx = estimateItems.findIndex(i => i.part_no.toLowerCase() === selectedInventoryPart.part_no.toLowerCase());
    if (existingIdx > -1) {
      // update existing
      const updated = [...estimateItems];
      const existing = updated[existingIdx];
      const newQty = existing.quantity + stagedQty;
      const newSub = unitPrice * newQty;
      const newFinal = newSub - (newSub * (disc / 100));

      updated[existingIdx] = {
        ...existing,
        quantity: newQty,
        mrp,
        is_net_price: isNet,
        net_price: isNet ? unitPrice : undefined,
        discount_percentage: disc,
        final_amount: newFinal
      };
      setEstimateItems(updated);
      triggerToast(`Updated quantity for ${selectedInventoryPart.part_no} to ${newQty}`);
    } else {
      const newItem: EstimateItem = {
        id: 'est-item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        part_no: selectedInventoryPart.part_no,
        part_name: selectedInventoryPart.part_name,
        quantity: stagedQty,
        mrp,
        is_net_price: isNet,
        net_price: isNet ? unitPrice : undefined,
        discount_percentage: disc,
        final_amount: finalAmt,
        hsn: selectedInventoryPart.hsn
      };
      setEstimateItems(prev => [...prev, newItem]);
      triggerToast(`Added ${selectedInventoryPart.part_no} to estimate`);
    }

    // Reset part selection
    setSelectedInventoryPart(null);
    setSearchQuery('');
    setStagedQty(1);
    setStagedDiscount(0);
    setStagedIsNetPrice(false);
  };

  // Remove an item from current draft estimate
  const handleRemoveItem = (id: string) => {
    setEstimateItems(prev => prev.filter(i => i.id !== id));
  };

  // Update item quantity in table
  const handleUpdateItemQty = (id: string, qty: number) => {
    if (qty <= 0) {
      handleRemoveItem(id);
      return;
    }
    setEstimateItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const unitPrice = item.is_net_price && item.net_price ? item.net_price : item.mrp;
      const sub = unitPrice * qty;
      const disc = item.is_net_price ? 0 : item.discount_percentage;
      return {
        ...item,
        quantity: qty,
        final_amount: sub - (sub * (disc / 100))
      };
    }));
  };

  // Update item discount % in table
  const handleUpdateItemDisc = (id: string, disc: number) => {
    const clampedDisc = Math.max(0, Math.min(100, disc));
    setEstimateItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const unitPrice = item.is_net_price && item.net_price ? item.net_price : item.mrp;
      const sub = unitPrice * item.quantity;
      return {
        ...item,
        discount_percentage: clampedDisc,
        final_amount: sub - (sub * (clampedDisc / 100))
      };
    }));
  };

  // Totals calculation
  const subtotal = useMemo(() => {
    return estimateItems.reduce((acc, curr) => acc + curr.final_amount, 0);
  }, [estimateItems]);

  const discountAmount = useMemo(() => {
    return subtotal * (globalDiscount / 100);
  }, [subtotal, globalDiscount]);

  const grandTotal = useMemo(() => {
    return subtotal - discountAmount;
  }, [subtotal, discountAmount]);

  // Save as Estimate
  const handleSaveEstimate = () => {
    if (!customerName.trim()) {
      alert("Please enter the customer name for this estimate.");
      return;
    }
    if (estimateItems.length === 0) {
      alert("Please add at least one part to the estimate.");
      return;
    }

    try {
      const created = db.createEstimate(
        brand,
        customerName,
        customerCategory,
        estimateItems,
        globalDiscount,
        notes,
        user,
        customerPhone,
        selectedCustomerId
      );

      triggerToast(`Estimate ${created.estimate_no} saved successfully!`);
      // Open print/view preview
      setSelectedEstimateForView(created);
      // Reset form
      handleResetForm();
    } catch (e: any) {
      alert("Failed to save estimate: " + e.message);
    }
  };

  const handleResetForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setSelectedCustomerId('');
    setCustomerCategory('Walk-in');
    setGlobalDiscount(0);
    setNotes('');
    setEstimateItems([]);
    setSelectedInventoryPart(null);
    setSearchQuery('');
  };

  // ----------------------------------------------------
  // CONVERT ESTIMATE TO BILL MODAL STATE
  // ----------------------------------------------------
  const [convertingEstimate, setConvertingEstimate] = useState<Estimate | null>(null);
  const [convertItems, setConvertItems] = useState<{
    id: string;
    part_no: string;
    part_name: string;
    quantity: number;
    mrp: number;
    is_net_price?: boolean;
    net_price?: number;
    discount_percentage: number;
    final_amount: number;
    availableStock: number;
    selected: boolean;
  }[]>([]);
  const [convertPaymentType, setConvertPaymentType] = useState<PaymentType>('Cash');
  const [convertPaymentStatus, setConvertPaymentStatus] = useState<PaymentStatus>('Paid');
  const [convertPaidAmount, setConvertPaidAmount] = useState<number>(0);
  const [isConverting, setIsConverting] = useState(false);

  // Open Convert to Bill modal
  const handleOpenConvertToBill = (est: Estimate) => {
    if (est.status === 'Converted to Bill') {
      alert(`This estimate has already been converted to invoice ${est.converted_invoice_no || ''}`);
      return;
    }

    const currentInv = db.getInventory(brand);
    const prepared = est.items.map(item => {
      const invItem = currentInv.find(i => i.part_no.toLowerCase() === item.part_no.toLowerCase());
      const stock = invItem ? invItem.quantity : 0;
      return {
        ...item,
        availableStock: stock,
        selected: true // default select all parts for full conversion
      };
    });

    setConvertingEstimate(est);
    setConvertItems(prepared);
    setConvertPaymentType('Cash');
    setConvertPaymentStatus('Paid');
    // Default paid amount to total with estimate's global discount
    const selSub = prepared.reduce((acc, c) => acc + c.final_amount, 0);
    const selTotal = selSub - (selSub * (est.discount_percentage / 100));
    setConvertPaidAmount(Math.round(selTotal));
  };

  // Selected items subtotal in convert modal
  const convertSelectedItems = useMemo(() => {
    return convertItems.filter(i => i.selected);
  }, [convertItems]);

  const convertSubtotal = useMemo(() => {
    return convertSelectedItems.reduce((acc, curr) => acc + curr.final_amount, 0);
  }, [convertSelectedItems]);

  const convertTotal = useMemo(() => {
    if (!convertingEstimate) return 0;
    const disc = convertSubtotal * (convertingEstimate.discount_percentage / 100);
    return Math.max(0, convertSubtotal - disc);
  }, [convertSubtotal, convertingEstimate]);

  // Execute direct stock cut & convert to bill
  const handleExecuteConversion = async () => {
    if (!convertingEstimate) return;
    if (convertSelectedItems.length === 0) {
      alert("Please select at least one part to convert into the bill.");
      return;
    }

    // Stock sufficiency check
    for (const item of convertSelectedItems) {
      if (item.availableStock < item.quantity) {
        alert(`Cannot convert: Insufficient stock for ${item.part_no}. In stock: ${item.availableStock}, Needed: ${item.quantity}. Please reduce quantity or uncheck this item.`);
        return;
      }
    }

    setIsConverting(true);
    try {
      // 1. Prepare items payload for db.createSale
      const salePayloadItems = convertSelectedItems.map(item => ({
        part_no: item.part_no,
        quantity: item.quantity,
        discount_percentage: item.is_net_price ? 0 : item.discount_percentage,
        mrp: item.is_net_price && item.net_price ? item.net_price : item.mrp,
        is_net_price: item.is_net_price,
        net_price: item.net_price
      }));

      // Customer id or create customer if needed
      let custId = convertingEstimate.customer_id;
      if (!custId) {
        // Auto register or find existing
        const existingCust = customers.find(c => c.customer_name.toLowerCase() === convertingEstimate.customer_name.toLowerCase());
        if (existingCust) {
          custId = existingCust.id;
        } else {
          const newCust = await db.addCustomer(
            convertingEstimate.customer_name,
            convertingEstimate.customer_category,
            convertingEstimate.customer_phone || '',
            '',
            0,
            'To Receive',
            user
          );
          custId = newCust.id;
        }
      }

      // 2. Execute createSale (this cuts stock atomically in Supabase & logs transaction)
      const createdSale = await db.createSale(
        brand,
        custId,
        convertingEstimate.customer_name,
        convertingEstimate.customer_category,
        salePayloadItems,
        convertingEstimate.discount_percentage,
        convertPaymentStatus,
        convertPaidAmount,
        user,
        convertPaymentType
      );

      // 3. Mark estimate as Converted to Bill
      db.updateEstimate(convertingEstimate.id, {
        status: 'Converted to Bill',
        converted_sale_id: createdSale.id,
        converted_invoice_no: createdSale.invoice_no
      }, user);

      triggerToast(`Estimate successfully converted to Bill: ${createdSale.invoice_no}! Stock deducted.`);
      setConvertingEstimate(null);
      // Refresh local estimate list
      setEstimates(db.getEstimates(brand));
    } catch (err: any) {
      alert("Conversion to bill failed: " + err.message);
    } finally {
      setIsConverting(false);
    }
  };

  // ----------------------------------------------------
  // ESTIMATE VIEW / PRINT SLIP MODAL STATE
  // ----------------------------------------------------
  const [selectedEstimateForView, setSelectedEstimateForView] = useState<Estimate | null>(null);

  // WhatsApp share generator
  const handleShareWhatsApp = (est: Estimate) => {
    const phone = (est.customer_phone || '').replace(/\D/g, '');
    let msg = `*ESTIMATE / QUOTATION - SPAREZY*\n`;
    msg += `---------------------------------\n`;
    msg += `*Estimate No:* ${est.estimate_no}\n`;
    msg += `*Date:* ${new Date(est.created_at).toLocaleDateString()}\n`;
    msg += `*Customer:* ${est.customer_name} (${est.customer_category})\n`;
    msg += `*Brand:* ${est.brand}\n`;
    msg += `---------------------------------\n`;
    msg += `*Items:*\n`;

    est.items.forEach((item, idx) => {
      msg += `${idx + 1}. *${item.part_name}*\n`;
      msg += `   Part: ${item.part_no} | Qty: ${item.quantity}\n`;
      msg += `   MRP: ₹${item.mrp}`;
      if (item.discount_percentage > 0) {
        msg += ` (-${item.discount_percentage}%)`;
      }
      msg += ` => *₹${item.final_amount.toFixed(0)}*\n`;
    });

    msg += `---------------------------------\n`;
    msg += `*Subtotal:* ₹${est.subtotal.toFixed(2)}\n`;
    if (est.discount_percentage > 0) {
      msg += `*Extra Discount (${est.discount_percentage}%):* -₹${est.discount_amount.toFixed(2)}\n`;
    }
    msg += `*ESTIMATED TOTAL:* *₹${est.total_amount.toFixed(2)}*\n`;
    msg += `---------------------------------\n`;
    msg += `_Note: This is an estimated price quotation. Rates subject to stock availability._\n`;
    msg += `*Sparezy Genuine Auto Spares*`;

    const encoded = encodeURIComponent(msg);
    const url = phone 
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ----------------------------------------------------
  // HISTORY TAB SEARCH & FILTER STATE
  // ----------------------------------------------------
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('All');

  const filteredHistory = useMemo(() => {
    return estimates.filter(est => {
      if (historyStatusFilter !== 'All' && est.status !== historyStatusFilter) return false;
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase().trim();
      return (
        est.estimate_no.toLowerCase().includes(q) ||
        est.customer_name.toLowerCase().includes(q) ||
        (est.customer_phone && est.customer_phone.includes(q)) ||
        est.items.some(i => i.part_no.toLowerCase().includes(q) || i.part_name.toLowerCase().includes(q))
      );
    });
  }, [estimates, historySearch, historyStatusFilter]);

  return (
    <div className="space-y-6">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-bold font-sans">{toastMessage}</span>
        </div>
      )}

      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-100">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">Estimate Maker &amp; Quotations</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                {brand}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Prepare part cost estimates with discounts for customers and convert directly to billed stock in one click.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'create'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Estimate</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer relative ${
              activeTab === 'history'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Estimate History</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-700 font-mono font-bold">
              {estimates.length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CREATE NEW ESTIMATE */}
      {/* ========================================================================= */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COLUMN: Customer info & Part search (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            
            {/* Customer Details Box */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-600" /> Customer Details
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Select existing or enter new</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Quick Select Saved</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleSelectCustomer(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  >
                    <option value="">-- Manual Entry --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.customer_name} ({c.customer_category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Workshop"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="98XXXXXXXX"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <label className="text-[11px] font-bold text-slate-600 shrink-0">Pricing Category:</label>
                <div className="flex gap-2">
                  {(['Walk-in', 'Mistri', 'Garage', 'Retailer'] as CustomerCategory[]).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCustomerCategory(cat)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                        customerCategory === cat
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Part Search & Stager Box */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-indigo-600" /> Search &amp; Add Parts from Inventory
                </span>
                <span className="text-[11px] text-slate-400 font-mono font-medium">
                  {inventory.filter(i => i.is_active !== false).length} Active Parts
                </span>
              </div>

              {/* Autocomplete Input */}
              <div className="relative">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search by Part Number or Part Name (e.g. 58101, Brake Pads, Filter)..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsSearchFocused(true);
                      if (selectedInventoryPart && e.target.value !== selectedInventoryPart.part_no) {
                        setSelectedInventoryPart(null);
                      }
                    }}
                    onFocus={() => setIsSearchFocused(true)}
                    className="w-full pl-9 pr-8 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 font-medium"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedInventoryPart(null);
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {isSearchFocused && filteredInventory.length > 0 && !selectedInventoryPart && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 max-h-64 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-xl z-30 divide-y divide-slate-100">
                    {filteredInventory.map(part => (
                      <div
                        key={part.id}
                        onMouseDown={() => handleSelectPart(part)}
                        className="p-3 hover:bg-indigo-50/60 cursor-pointer transition flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-indigo-600">{part.part_no}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              part.quantity > 5 
                                ? 'bg-emerald-50 text-emerald-700' 
                                : part.quantity > 0 
                                ? 'bg-amber-50 text-amber-700' 
                                : 'bg-rose-50 text-rose-700'
                            }`}>
                              Stock: {part.quantity}
                            </span>
                          </div>
                          <p className="text-slate-600 font-medium text-[11px] truncate max-w-sm mt-0.5">{part.part_name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-slate-900 block">₹{part.mrp.toLocaleString('en-IN')}</span>
                          <span className="text-[10px] text-slate-400 font-sans">MRP</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Part Configure Stager */}
              {selectedInventoryPart && (
                <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-indigo-700 text-sm">{selectedInventoryPart.part_no}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          selectedInventoryPart.quantity > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          Available Stock: {selectedInventoryPart.quantity} units
                        </span>
                      </div>
                      <p className="text-slate-700 font-semibold text-xs mt-1">{selectedInventoryPart.part_name}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-slate-900 text-base">₹{selectedInventoryPart.mrp}</span>
                      <span className="text-[10px] text-slate-400 block font-medium">Standard MRP</span>
                    </div>
                  </div>

                  {/* Quantity & Discount Inputs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-indigo-100/80">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={stagedQty}
                        onChange={(e) => setStagedQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-xs font-mono font-bold p-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Item Discount %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={stagedIsNetPrice}
                        value={stagedDiscount}
                        onChange={(e) => setStagedDiscount(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                        className="w-full text-xs font-mono font-bold p-2 border border-slate-200 rounded-lg bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Net Price Override?</label>
                      <label className="flex items-center gap-1.5 h-9 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stagedIsNetPrice}
                          onChange={(e) => setStagedIsNetPrice(e.target.checked)}
                          className="rounded text-indigo-600"
                        />
                        <span className="text-xs text-slate-700 font-semibold">Flat Rate</span>
                      </label>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        {stagedIsNetPrice ? 'Flat Unit Rate (₹)' : 'Final Line Total'}
                      </label>
                      {stagedIsNetPrice ? (
                        <input
                          type="number"
                          min="0"
                          value={stagedNetPrice}
                          onChange={(e) => setStagedNetPrice(parseFloat(e.target.value) || '')}
                          placeholder="Net rate"
                          className="w-full text-xs font-mono font-bold p-2 border border-indigo-300 rounded-lg bg-white text-indigo-700"
                        />
                      ) : (
                        <div className="h-9 flex items-center font-mono font-black text-indigo-700 text-sm">
                          ₹{( (selectedInventoryPart.mrp * stagedQty) * (1 - stagedDiscount / 100) ).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInventoryPart(null);
                        setSearchQuery('');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddStagedPart}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Part to Estimate</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN: Estimate items list & calculation summary (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
              
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Estimate Parts Summary ({estimateItems.length})
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">Review customer estimated items</span>
                </div>
                {estimateItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEstimateItems([])}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Items List */}
              <div className="p-4 max-h-96 overflow-y-auto divide-y divide-slate-100">
                {estimateItems.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <Calculator className="w-10 h-10 text-slate-300 mx-auto stroke-[1.5]" />
                    <p className="text-xs font-semibold">No parts added to this estimate yet.</p>
                    <p className="text-[11px] text-slate-400">Search and select parts from the left panel.</p>
                  </div>
                ) : (
                  estimateItems.map((item, idx) => (
                    <div key={item.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-slate-400">#{idx + 1}</span>
                          <span className="font-mono font-black text-indigo-700 truncate">{item.part_no}</span>
                        </div>
                        <p className="text-slate-700 font-medium text-[11px] truncate mt-0.5">{item.part_name}</p>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleUpdateItemQty(item.id, item.quantity - 1)}
                              className="px-2 py-0.5 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
                            >
                              -
                            </button>
                            <span className="px-2 font-mono font-bold text-xs text-slate-800">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateItemQty(item.id, item.quantity + 1)}
                              className="px-2 py-0.5 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-400">× ₹{item.is_net_price && item.net_price ? item.net_price : item.mrp}</span>
                          
                          {!item.is_net_price && (
                            <div className="flex items-center gap-1 ml-auto">
                              <span className="text-[10px] text-slate-400">Disc:</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={item.discount_percentage}
                                onChange={(e) => handleUpdateItemDisc(item.id, parseFloat(e.target.value) || 0)}
                                className="w-12 text-[10px] font-mono font-bold p-1 border border-slate-200 rounded bg-white text-center"
                              />
                              <span className="text-[10px] text-slate-400">%</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono font-black text-slate-900 text-sm">
                          ₹{item.final_amount.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bill Financial Calculation Box */}
              {estimateItems.length > 0 && (
                <div className="p-4 bg-slate-50/70 border-t border-slate-200 space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Parts Subtotal:</span>
                    <span className="font-mono font-bold text-slate-900">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-600 font-medium">Overall Extra Discount (%):</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={globalDiscount}
                        onChange={(e) => setGlobalDiscount(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                        className="w-14 text-xs font-mono font-bold p-1 border border-slate-200 rounded-lg bg-white text-center"
                      />
                    </div>
                    <span className="font-mono font-bold text-rose-600">-₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                    <span className="text-sm font-black text-slate-900">Estimated Total:</span>
                    <span className="text-xl font-black font-mono text-indigo-700">
                      ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Notes */}
                  <div className="pt-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Estimate Notes / Validity</label>
                    <input
                      type="text"
                      placeholder="e.g. Valid for 7 days, includes GST, subject to stock..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetForm}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEstimate}
                      className="flex-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.99]"
                    >
                      <Check className="w-4 h-4" />
                      <span>Save Estimate</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ESTIMATE HISTORY & DIRECT STOCK-CUT CONVERT TO BILL */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
          
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search history by Estimate No, Customer Name, Phone, or Part No..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Filter Status:</span>
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="text-xs p-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 focus:outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Converted to Bill">Converted to Bill</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto min-h-[300px]">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs font-sans">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="p-3.5">Estimate No</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">Items</th>
                  <th className="p-3.5">Total Amount</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-medium">
                      <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      No estimate records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map(est => (
                    <tr key={est.id} className="hover:bg-slate-50/60 transition">
                      
                      {/* Estimate No */}
                      <td className="p-3.5 font-mono font-black text-indigo-700 whitespace-nowrap">
                        {est.estimate_no}
                      </td>

                      {/* Date */}
                      <td className="p-3.5 text-slate-500 whitespace-nowrap text-[11px] font-mono">
                        {new Date(est.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>

                      {/* Customer */}
                      <td className="p-3.5">
                        <span className="font-bold text-slate-900 block">{est.customer_name}</span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className="bg-slate-100 px-1 rounded text-slate-600 font-semibold">{est.customer_category}</span>
                          {est.customer_phone && <span className="font-mono">{est.customer_phone}</span>}
                        </div>
                      </td>

                      {/* Items */}
                      <td className="p-3.5">
                        <span className="font-bold font-mono text-slate-800">{est.items.length} parts</span>
                        <span className="text-[10px] text-slate-400 block truncate max-w-xs">
                          {est.items.map(i => i.part_no).slice(0, 3).join(', ')}{est.items.length > 3 ? '...' : ''}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="p-3.5">
                        <span className="font-mono font-black text-slate-900 text-sm">
                          ₹{est.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {est.discount_percentage > 0 && (
                          <span className="text-[10px] text-emerald-600 block font-semibold">
                            {est.discount_percentage}% Disc Applied
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        {est.status === 'Converted to Bill' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Billed ({est.converted_invoice_no || 'Bill'})</span>
                          </span>
                        ) : est.status === 'Sent' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 w-fit">
                            <Share2 className="w-3 h-3 text-blue-600" /> Sent
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3 text-slate-500" /> Draft
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* View / Print button */}
                          <button
                            type="button"
                            onClick={() => setSelectedEstimateForView(est)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer border border-slate-200"
                            title="View / Print Quotation Slip"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-600" />
                          </button>

                          {/* WhatsApp Share button */}
                          <button
                            type="button"
                            onClick={() => handleShareWhatsApp(est)}
                            className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition cursor-pointer border border-emerald-200"
                            title="Share on WhatsApp"
                          >
                            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                          </button>

                          {/* CONVERT TO BILL BUTTON */}
                          {est.status !== 'Converted to Bill' ? (
                            <button
                              type="button"
                              onClick={() => handleOpenConvertToBill(est)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shadow-xs cursor-pointer flex items-center gap-1 transition active:scale-95"
                              title="Convert estimate directly to invoice & cut inventory stock"
                            >
                              <ShoppingBag className="w-3.5 h-3.5" />
                              <span>Convert to Bill</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-mono font-bold text-emerald-700 px-2 py-1 bg-emerald-50 rounded border border-emerald-200">
                              ✓ {est.converted_invoice_no}
                            </span>
                          )}

                          {/* Delete button */}
                          {est.status !== 'Converted to Bill' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Delete estimate ${est.estimate_no}?`)) {
                                  db.deleteEstimate(est.id, user);
                                  setEstimates(db.getEstimates(brand));
                                  triggerToast(`Deleted ${est.estimate_no}`);
                                }
                              }}
                              className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                              title="Delete Estimate"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CONVERT ESTIMATE TO BILL (DIRECT STOCK CUT WITH SELECTIVE PARTS) */}
      {/* ========================================================================= */}
      {convertingEstimate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 overflow-hidden transform transition duration-200 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    Direct Stock Cut &amp; Bill Generation
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mt-1">
                  Convert Estimate {convertingEstimate.estimate_no} to Sales Invoice
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConvertingEstimate(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              
              {/* Question Banner as requested by user */}
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-black">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Convert Whole Estimate or Select Specific Parts?</span>
                </div>
                <p className="text-amber-800 leading-relaxed font-medium text-[11px]">
                  You can convert the <strong>whole estimate</strong> into the bill, or <strong>uncheck / remove parts</strong> if the customer only wants to purchase a few items today. Stock will only be deducted for the selected parts.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setConvertItems(prev => prev.map(i => ({ ...i, selected: true })));
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 font-bold rounded border border-amber-300 text-[11px] cursor-pointer"
                  >
                    Select All (Convert Whole Estimate)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConvertItems(prev => prev.map(i => ({ ...i, selected: false })));
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 font-bold rounded border border-amber-300 text-[11px] cursor-pointer"
                  >
                    Unselect All
                  </button>
                </div>
              </div>

              {/* Items selection list */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs font-sans">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                    <tr>
                      <th className="p-3 w-10 text-center">Include</th>
                      <th className="p-3">Part Details</th>
                      <th className="p-3">Current Stock</th>
                      <th className="p-3">Billing Qty</th>
                      <th className="p-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {convertItems.map(item => {
                      const isLowStock = item.availableStock < item.quantity;
                      return (
                        <tr 
                          key={item.id} 
                          className={`transition ${item.selected ? 'bg-indigo-50/20' : 'bg-slate-50/50 opacity-60'} ${isLowStock ? 'bg-rose-50/30' : ''}`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setConvertItems(prev => prev.map(i => i.id === item.id ? { ...i, selected: checked } : i));
                              }}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-0 cursor-pointer h-4 w-4"
                            />
                          </td>
                          <td className="p-3">
                            <span className="font-mono font-bold text-slate-900 block">{item.part_no}</span>
                            <span className="text-[11px] text-slate-500 truncate block max-w-xs">{item.part_name}</span>
                          </td>
                          <td className="p-3">
                            <span className={`font-mono font-bold text-xs ${isLowStock ? 'text-rose-600 font-black' : 'text-slate-700'}`}>
                              {item.availableStock} in stock
                            </span>
                            {isLowStock && (
                              <span className="text-[9px] text-rose-600 block font-bold uppercase">Shortage!</span>
                            )}
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="1"
                              disabled={!item.selected}
                              value={item.quantity}
                              onChange={(e) => {
                                const newQ = Math.max(1, parseInt(e.target.value) || 1);
                                setConvertItems(prev => prev.map(i => {
                                  if (i.id !== item.id) return i;
                                  const unitP = i.is_net_price && i.net_price ? i.net_price : i.mrp;
                                  const sub = unitP * newQ;
                                  const disc = i.is_net_price ? 0 : i.discount_percentage;
                                  return {
                                    ...i,
                                    quantity: newQ,
                                    final_amount: sub - (sub * (disc / 100))
                                  };
                                }));
                              }}
                              className="w-16 text-xs font-mono font-bold p-1 border border-slate-300 rounded bg-white text-center"
                            />
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">
                            ₹{item.final_amount.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Billing Payment Config */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Payment Mode</label>
                    <select
                      value={convertPaymentType}
                      onChange={(e) => {
                        const val = e.target.value as PaymentType;
                        setConvertPaymentType(val);
                        if (val === 'Cash' || val === 'UPI') {
                          setConvertPaymentStatus('Paid');
                          setConvertPaidAmount(Math.round(convertTotal));
                        } else if (val === 'Payment Pending') {
                          setConvertPaymentStatus('Pending');
                          setConvertPaidAmount(0);
                        } else if (val === 'Half Payment') {
                          setConvertPaymentStatus('Custom Amount');
                          setConvertPaidAmount(Math.round(convertTotal / 2));
                        } else if (val === 'Custom Payment') {
                          setConvertPaymentStatus('Custom Amount');
                        }
                      }}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="Cash">Cash (Full Payment)</option>
                      <option value="UPI">UPI / Online</option>
                      <option value="Payment Pending">Payment Pending (Udhar)</option>
                      <option value="Half Payment">Half Payment</option>
                      <option value="Custom Payment">Custom Payment</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Payment Status</label>
                    <select
                      value={convertPaymentStatus}
                      onChange={(e) => {
                        const st = e.target.value as PaymentStatus;
                        setConvertPaymentStatus(st);
                        if (st === 'Paid') {
                          setConvertPaidAmount(Math.round(convertTotal));
                        } else if (st === 'Pending') {
                          setConvertPaidAmount(0);
                        }
                      }}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="Paid">Fully Paid</option>
                      <option value="Custom Amount">Custom Amount / Partial</option>
                      <option value="Pending">Pending (Full Credit)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Paid Amount (INR)</label>
                    <input
                      type="number"
                      min="0"
                      value={convertPaidAmount}
                      onChange={(e) => setConvertPaidAmount(parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-mono font-bold p-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-semibold">
                    Billing {convertSelectedItems.length} parts (Estimated total after {convertingEstimate.discount_percentage}% discount):
                  </span>
                  <span className="text-base font-black font-mono text-emerald-700">
                    ₹{convertTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setConvertingEstimate(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isConverting || convertSelectedItems.length === 0}
                onClick={handleExecuteConversion}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-100 flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
              >
                {isConverting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deducting Stock &amp; Generating Bill...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>Confirm &amp; Cut Stock ({convertSelectedItems.length} Parts)</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ESTIMATE PRINT / VIEW SLIP */}
      {/* ========================================================================= */}
      {selectedEstimateForView && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 overflow-hidden transform transition flex flex-col max-h-[90vh]">
            
            {/* Modal Controls Bar */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between no-print">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Estimate Quotation Slip Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(selectedEstimateForView)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEstimateForView(null)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Paper */}
            <div className="p-8 overflow-y-auto space-y-6 text-slate-800 font-sans printable-slip">
              
              {/* Slip Header */}
              <div className="text-center space-y-1 pb-4 border-b-2 border-slate-900">
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">SPAREZY AUTO SPARES</h2>
                <p className="text-xs font-semibold text-slate-600">Genuine Automobile Spare Parts &amp; Accessories</p>
                <p className="text-[11px] text-slate-400 font-mono">Specialist in {selectedEstimateForView.brand} Genuine Spares</p>
                <div className="inline-block mt-1 px-3 py-0.5 rounded-full bg-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-800 border border-slate-300">
                  ESTIMATE / PRICE QUOTATION
                </div>
              </div>

              {/* Estimate Meta */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Quotation For:</span>
                  <span className="font-extrabold text-slate-900 text-sm block">{selectedEstimateForView.customer_name}</span>
                  {selectedEstimateForView.customer_phone && (
                    <span className="font-mono text-slate-600 block">{selectedEstimateForView.customer_phone}</span>
                  )}
                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-semibold text-slate-700 mt-1 inline-block">
                    {selectedEstimateForView.customer_category}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Estimate No:</span>
                  <span className="font-mono font-black text-indigo-700 text-sm block">{selectedEstimateForView.estimate_no}</span>
                  <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                    Date: {new Date(selectedEstimateForView.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-[10px] text-slate-400 block">Operator: {selectedEstimateForView.created_by}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px]">
                    <tr>
                      <th className="p-2.5 text-center w-8">#</th>
                      <th className="p-2.5 text-left">Part Name &amp; No.</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">MRP</th>
                      <th className="p-2.5 text-right">Disc</th>
                      <th className="p-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedEstimateForView.items.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="p-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-900 block">{item.part_name}</span>
                          <span className="font-mono text-[10px] text-indigo-700">{item.part_no}</span>
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold">{item.quantity}</td>
                        <td className="p-2.5 text-right font-mono">₹{item.mrp}</td>
                        <td className="p-2.5 text-right font-mono text-slate-500">
                          {item.discount_percentage > 0 ? `${item.discount_percentage}%` : '-'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          ₹{item.final_amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals */}
              <div className="space-y-1.5 text-xs text-right border-t border-slate-200 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal:</span>
                  <span className="font-mono font-bold">₹{selectedEstimateForView.subtotal.toFixed(2)}</span>
                </div>
                {selectedEstimateForView.discount_percentage > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Overall Discount ({selectedEstimateForView.discount_percentage}%):</span>
                    <span className="font-mono font-bold">-₹{selectedEstimateForView.discount_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black border-t-2 border-slate-900 pt-2 text-slate-900">
                  <span>ESTIMATED TOTAL:</span>
                  <span className="font-mono text-indigo-700">₹{selectedEstimateForView.total_amount.toFixed(2)}</span>
                </div>
              </div>

              {/* Footer Notice */}
              <div className="border-t border-dashed border-slate-300 pt-4 text-[10px] text-slate-500 space-y-1">
                <p className="font-bold text-slate-700">TERMS &amp; CONDITIONS:</p>
                <p>1. This estimate is an indicative quotation and not a tax invoice.</p>
                <p>2. Prices are subject to stock availability and revision at time of billing.</p>
                {selectedEstimateForView.notes && (
                  <p className="font-semibold text-slate-800">Note: {selectedEstimateForView.notes}</p>
                )}
                <p className="text-center text-slate-400 pt-2">Thank you for your inquiry!</p>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
