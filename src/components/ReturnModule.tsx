import { useState, useMemo, useEffect } from 'react';
import { Brand, User, Sale, SaleItem, ReturnRecord } from '../types';
import { db } from '../dbStore';
import { 
  Search, 
  RotateCcw, 
  CheckCircle, 
  Calendar, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Package, 
  AlertCircle,
  X,
  Clock,
  ArrowRight
} from 'lucide-react';

interface ReturnModuleProps {
  brand: Brand;
  user: User;
}

interface ReturnTarget {
  sale: Sale;
  item: SaleItem;
  qtyToReturn: number;
  refundAmount: number;
}

export default function ReturnModule({ brand, user }: ReturnModuleProps) {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('All');
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [toastMessageLocal, setToastMessageLocal] = useState<string | null>(null);
  const [collapsedBills, setCollapsedBills] = useState<Record<string, boolean>>({});
  
  // Modal for confirming return without window.confirm/alert
  const [confirmModalData, setConfirmModalData] = useState<ReturnTarget | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load state references
  const [salesList, setSalesList] = useState<Sale[]>(() => db.getSales(brand));
  const [saleItemsList, setSaleItemsList] = useState<SaleItem[]>(() => db.getSaleItems(brand));
  const [returnsList, setReturnsList] = useState<ReturnRecord[]>(() => db.getReturns(brand));

  const refreshComponentData = () => {
    setSalesList(db.getSales(brand));
    setSaleItemsList(db.getSaleItems(brand));
    setReturnsList(db.getReturns(brand));
  };

  useEffect(() => {
    refreshComponentData();
    setSelectedCustomer('All');
    return db.subscribe(refreshComponentData);
  }, [brand]);

  const triggerToast = (msg: string) => {
    setToastMessageLocal(msg);
    setTimeout(() => setToastMessageLocal(null), 3500);
  };

  // Helper to normalize date string to YYYY-MM-DD
  const getDateKey = (dateStr?: string) => {
    if (!dateStr) return 'Unknown Date';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr.split('T')[0] || dateStr;
      return d.toISOString().split('T')[0];
    } catch {
      return dateStr.split('T')[0] || dateStr;
    }
  };

  // Helper to format friendly date label
  const formatDateLabel = (dateKey: string) => {
    if (dateKey === 'Unknown Date') return 'Unknown Date';
    try {
      const today = new Date().toISOString().split('T')[0];
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      const yesterday = yDate.toISOString().split('T')[0];

      const d = new Date(dateKey + 'T00:00:00');
      const formatted = !isNaN(d.getTime())
        ? d.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })
        : dateKey;

      if (dateKey === today) return `Today • ${formatted}`;
      if (dateKey === yesterday) return `Yesterday • ${formatted}`;
      return formatted;
    } catch {
      return dateKey;
    }
  };

  // Compile unique customer names for tab filtering
  const customerTabs = useMemo(() => {
    const namesSet = new Set<string>();
    salesList.forEach(sale => {
      if (sale.customer_name) {
        namesSet.add(sale.customer_name);
      }
    });
    return ['All', ...Array.from(namesSet).sort()];
  }, [salesList]);

  // Group parts by date of bill, then by bill no.
  const groupedByDateAndBill = useMemo(() => {
    const query = search.trim().toLowerCase();

    // Map sale items by their sale_id
    const itemsBySaleId: Record<string, SaleItem[]> = {};
    saleItemsList.forEach(item => {
      if (!itemsBySaleId[item.sale_id]) {
        itemsBySaleId[item.sale_id] = [];
      }
      itemsBySaleId[item.sale_id].push(item);
    });

    // Structure: dateKey -> array of bills
    type BillGroup = {
      sale: Sale;
      billNo: string;
      items: Array<{
        item: SaleItem;
        maxReturnable: number;
        unitPrice: number;
      }>;
      totalReturnableCount: number;
    };

    const dateMap: Record<string, BillGroup[]> = {};

    salesList.forEach(sale => {
      // Filter by customer tab
      if (selectedCustomer !== 'All' && sale.customer_name.toLowerCase() !== selectedCustomer.toLowerCase()) {
        return;
      }

      const allItemsForSale = itemsBySaleId[sale.id] || [];
      const billNo = sale.invoice_no || sale.id;

      // Filter items based on search query
      const matchingItems = allItemsForSale.filter(item => {
        const maxReturnable = item.quantity - item.returned_quantity;
        if (maxReturnable <= 0) return false;

        if (!query) return true;

        const matchesItem = 
          item.part_no.toLowerCase().includes(query) ||
          item.part_name.toLowerCase().includes(query);
        const matchesBill = 
          billNo.toLowerCase().includes(query) ||
          sale.customer_name.toLowerCase().includes(query) ||
          sale.sale_date.toLowerCase().includes(query);

        return matchesItem || matchesBill;
      });

      if (matchingItems.length === 0) return;

      const dateKey = getDateKey(sale.sale_date || sale.created_at);
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = [];
      }

      const preparedItems = matchingItems.map(item => {
        const unitPrice = item.mrp * (1 - (item.discount_percentage / 100));
        return {
          item,
          maxReturnable: item.quantity - item.returned_quantity,
          unitPrice
        };
      });

      const totalReturnableCount = preparedItems.reduce((acc, curr) => acc + curr.maxReturnable, 0);

      dateMap[dateKey].push({
        sale,
        billNo,
        items: preparedItems,
        totalReturnableCount
      });
    });

    // Sort dates descending (newest dates first)
    const sortedDateKeys = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));

    return sortedDateKeys.map(dateKey => {
      // Sort bills within each date by created_at or id descending
      const bills = dateMap[dateKey].sort((a, b) => {
        const timeA = new Date(a.sale.created_at || a.sale.sale_date).getTime();
        const timeB = new Date(b.sale.created_at || b.sale.sale_date).getTime();
        return timeB - timeA;
      });

      const totalPartsInDate = bills.reduce((acc, b) => acc + b.items.length, 0);
      const totalUnitsInDate = bills.reduce((acc, b) => acc + b.totalReturnableCount, 0);

      return {
        dateKey,
        dateLabel: formatDateLabel(dateKey),
        bills,
        totalBillsCount: bills.length,
        totalPartsCount: totalPartsInDate,
        totalUnitsCount: totalUnitsInDate
      };
    });
  }, [salesList, saleItemsList, search, selectedCustomer]);

  // Overall counts for stats
  const totalReturnableBills = useMemo(() => {
    return groupedByDateAndBill.reduce((sum, d) => sum + d.totalBillsCount, 0);
  }, [groupedByDateAndBill]);

  const totalReturnableParts = useMemo(() => {
    return groupedByDateAndBill.reduce((sum, d) => sum + d.totalPartsCount, 0);
  }, [groupedByDateAndBill]);

  // Toggle single bill expand/collapse
  const toggleBillCollapse = (billId: string) => {
    setCollapsedBills(prev => ({
      ...prev,
      [billId]: !prev[billId]
    }));
  };

  // Expand or Collapse All
  const handleToggleAll = (collapse: boolean) => {
    const next: Record<string, boolean> = {};
    groupedByDateAndBill.forEach(group => {
      group.bills.forEach(bill => {
        next[bill.sale.id] = collapse;
      });
    });
    setCollapsedBills(next);
  };

  // Open confirmation modal for returning a part
  const handleInitiateReturn = (sale: Sale, item: SaleItem) => {
    const maxReturnable = item.quantity - item.returned_quantity;
    const qty = returnQty[item.id] || 1;

    if (qty <= 0) {
      triggerToast("Please enter a valid return quantity (at least 1)");
      return;
    }

    if (qty > maxReturnable) {
      triggerToast(`Maximum returnable units for this line is ${maxReturnable}`);
      return;
    }

    const unitPrice = item.mrp * (1 - (item.discount_percentage / 100));
    const refundAmount = Number((unitPrice * qty).toFixed(2));

    setConfirmModalData({
      sale,
      item,
      qtyToReturn: qty,
      refundAmount
    });
  };

  // Execute actual return in database
  const handleConfirmReturn = () => {
    if (!confirmModalData || isProcessing) return;

    setIsProcessing(true);
    try {
      const { sale, item, qtyToReturn, refundAmount } = confirmModalData;

      db.processReturn(
        brand,
        sale.id,
        item.id,
        qtyToReturn,
        refundAmount,
        user
      );

      // Clean local field state and refresh DB
      setReturnQty(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });

      refreshComponentData();
      triggerToast(
        `✓ Returned ${qtyToReturn} pcs of ${item.part_name} (Part No: ${item.part_no}). Restocked into shop inventory & refunded ₹${refundAmount.toFixed(2)}.`
      );
      setConfirmModalData(null);
    } catch (err: any) {
      triggerToast(`Return failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Local Toast alerts */}
      {toastMessageLocal && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-bounce mt-10">
          <CheckCircle className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
          <span>{toastMessageLocal}</span>
        </div>
      )}

      {/* Headline */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-indigo-600" />
            Returns &amp; Restock Management ({brand})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Process customer returned parts, add them directly back into shop inventory, and update billing ledgers.
          </p>
        </div>

        {/* Global Expand/Collapse toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleToggleAll(false)}
            className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer"
          >
            Expand All Bills
          </button>
          <button
            onClick={() => handleToggleAll(true)}
            className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Restock & Return Info Banner */}
      <div className="bg-indigo-50/80 border border-indigo-200/80 rounded-2xl p-4 flex items-center gap-3 text-xs text-indigo-900 shadow-2xs">
        <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
          <RotateCcw className="w-4 h-4" />
        </div>
        <div className="leading-relaxed">
          <span className="font-bold">Automatic Stock Restock: </span>
          <span>
            Parts returned are <strong>instantly credited back into shop stock</strong> in real-time. All parts below are grouped by <strong>Date of Bill</strong> and <strong>Bill Number</strong> for effortless tracking.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Column 1 & 2: Search Bills, Date & Bill Number Grouping */}
        <div className="lg:col-span-2 space-y-5">
          
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Bill No. (e.g. HYU-2026-0001), Part No., Part Name, or Customer..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Customer Filter Tabs */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <span>Filter by Customer:</span>
                <span className="text-slate-500 font-normal">
                  Found: <strong>{totalReturnableBills}</strong> bills • <strong>{totalReturnableParts}</strong> returnable part items
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none snap-x">
                {customerTabs.map((customer) => {
                  const isSelected = selectedCustomer.toLowerCase() === customer.toLowerCase();
                  return (
                    <button
                      key={customer}
                      onClick={() => setSelectedCustomer(customer)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 border cursor-pointer snap-start ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-650 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{customer === 'All' ? '📂 All Customers' : customer}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Grouped by Date of Bill, then by Bill No. */}
          <div className="space-y-6">
            {groupedByDateAndBill.map((dateGroup) => (
              <div key={dateGroup.dateKey} className="space-y-3">
                
                {/* Date of Bill Header */}
                <div className="flex items-center justify-between bg-slate-100/90 border border-slate-200/90 px-4 py-2.5 rounded-xl shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span className="font-extrabold text-xs text-slate-900 tracking-tight">
                      Bill Date: {dateGroup.dateLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg font-bold">
                      {dateGroup.totalBillsCount} {dateGroup.totalBillsCount === 1 ? 'Bill' : 'Bills'}
                    </span>
                    <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-lg font-semibold">
                      {dateGroup.totalPartsCount} {dateGroup.totalPartsCount === 1 ? 'part item' : 'part items'}
                    </span>
                  </div>
                </div>

                {/* Bills under this Date */}
                <div className="space-y-3 pl-1">
                  {dateGroup.bills.map((billGroup) => {
                    const isCollapsed = !!collapsedBills[billGroup.sale.id];
                    const billNo = billGroup.billNo;
                    const sale = billGroup.sale;

                    return (
                      <div 
                        key={sale.id}
                        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-slate-300"
                      >
                        {/* Bill No. Header Card */}
                        <div 
                          onClick={() => toggleBillCollapse(sale.id)}
                          className="p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/70 transition flex items-center justify-between cursor-pointer border-b border-slate-100 select-none"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Bill Badge */}
                            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-700 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-black text-sm text-slate-900">
                                  {billNo}
                                </span>
                                <span className="bg-slate-200/80 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  {sale.customer_name}
                                </span>
                                {sale.customer_category && (
                                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-150 text-[9px] font-semibold px-1.5 py-0.5 rounded">
                                    {sale.customer_category}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                <span>Total: <strong>₹{sale.total_amount.toFixed(2)}</strong></span>
                                <span>&bull;</span>
                                <span>Billed by: {sale.created_by || 'Staff'}</span>
                                {sale.created_at && (
                                  <>
                                    <span>&bull;</span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                                      {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">
                              {billGroup.items.length} {billGroup.items.length === 1 ? 'part' : 'parts'} returnable
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 flex items-center justify-center">
                              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            </div>
                          </div>
                        </div>

                        {/* Parts List under this Bill */}
                        {!isCollapsed && (
                          <div className="divide-y divide-slate-100">
                            {billGroup.items.map(({ item, maxReturnable, unitPrice }) => {
                              const lineReturnQty = returnQty[item.id] !== undefined ? returnQty[item.id] : 1;
                              const lineRefundPreview = (unitPrice * (lineReturnQty || 1)).toFixed(2);

                              return (
                                <div 
                                  key={item.id} 
                                  className="p-3.5 sm:p-4 hover:bg-slate-50/50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                                >
                                  {/* Part Info */}
                                  <div className="min-w-0 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs">
                                        {item.part_no}
                                      </span>
                                      <span className="font-semibold text-slate-800 truncate">
                                        {item.part_name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                      <span>Sold: <strong className="text-slate-700">{item.quantity} pcs</strong></span>
                                      <span>&bull;</span>
                                      <span>MRP: <strong>₹{item.mrp}</strong> {item.discount_percentage > 0 && `(-${item.discount_percentage}%)`}</span>
                                      <span>&bull;</span>
                                      <span>Unit Price: <strong>₹{unitPrice.toFixed(2)}</strong></span>
                                      {item.returned_quantity > 0 && (
                                        <>
                                          <span>&bull;</span>
                                          <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                            {item.returned_quantity} already returned
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {/* Return Inputs & Action */}
                                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                    <div className="text-right">
                                      <div className="text-[10px] text-slate-400 font-medium">Return Qty</div>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <input
                                          type="number"
                                          min={1}
                                          max={maxReturnable}
                                          className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-center font-bold text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                          value={lineReturnQty}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            setReturnQty(prev => ({
                                              ...prev,
                                              [item.id]: isNaN(val) ? 1 : Math.min(maxReturnable, Math.max(1, val))
                                            }));
                                          }}
                                        />
                                        <span className="text-[10px] text-slate-400 font-semibold">
                                          / {maxReturnable}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Action Button */}
                                    <button
                                      onClick={() => handleInitiateReturn(sale, item)}
                                      className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition shadow-xs cursor-pointer active:scale-95 shrink-0"
                                      title={`Return part and refund ₹${lineRefundPreview}`}
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>Return Part</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            ))}

            {/* Empty State */}
            {groupedByDateAndBill.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">No returnable parts found</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {search || selectedCustomer !== 'All' 
                      ? 'No bills or parts matched your active search query or customer filter.' 
                      : 'All items on recorded invoices have already been returned or no sales recorded yet.'}
                  </p>
                </div>
                {(search || selectedCustomer !== 'All') && (
                  <button
                    onClick={() => {
                      setSearch('');
                      setSelectedCustomer('All');
                    }}
                    className="px-3.5 py-1.5 bg-indigo-50 text-indigo-650 hover:bg-indigo-100 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Column 3: Return History logs right hand side */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center justify-between">
              <span className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-orange-600" />
                Return History (Logs)
              </span>
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                {returnsList.length} total
              </span>
            </h3>

            <div className="divide-y divide-slate-150 max-h-[70vh] overflow-y-auto pr-1 space-y-3">
              {returnsList.map((ret) => (
                <div key={ret.id} className="pt-3 text-xs space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                      {ret.id}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {new Date(ret.return_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px]">Bill Ref: </span>
                    <span className="font-semibold text-slate-800 font-mono text-[11px]">{ret.sale_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-900 font-mono font-bold text-[11px]">{ret.part_no}: </span>
                    <span className="text-slate-700 font-medium text-[11px]">{ret.part_name}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                      <span>Restocked +{ret.returned_quantity} pcs</span>
                    </span>
                    <span className="font-black text-slate-900 text-xs">
                      ₹{ret.refund_amount.toFixed(2)} refunded
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-0.5">
                    <span>Handled by: <strong className="text-slate-600">{ret.created_by}</strong></span>
                    {ret.return_date && (
                      <span>{new Date(ret.return_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                </div>
              ))}
              {returnsList.length === 0 && (
                <div className="text-center py-10 text-slate-400 font-normal space-y-2">
                  <RotateCcw className="w-6 h-6 mx-auto text-slate-300" />
                  <p className="text-xs">No parts returned in {brand} yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Confirmation Modal (In-app, avoids window.alert / window.confirm) */}
      {confirmModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirm Part Return</h3>
                  <p className="text-[11px] text-slate-500">Restock inventory &amp; deduct from invoice</p>
                </div>
              </div>
              <button 
                onClick={() => setConfirmModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs border border-slate-200/80">
              <div className="flex justify-between">
                <span className="text-slate-500">Bill Number:</span>
                <span className="font-mono font-bold text-slate-900">{confirmModalData.sale.invoice_no || confirmModalData.sale.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{confirmModalData.sale.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Part No:</span>
                <span className="font-mono font-bold text-slate-900">{confirmModalData.item.part_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Part Name:</span>
                <span className="font-semibold text-slate-800 max-w-[200px] truncate text-right">{confirmModalData.item.part_name}</span>
              </div>
              <div className="border-t border-slate-200/80 pt-2 flex justify-between items-center">
                <span className="text-slate-700 font-bold">Quantity to Restock:</span>
                <span className="bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded text-xs">
                  +{confirmModalData.qtyToReturn} units
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-700 font-bold">Refund / Credit Amount:</span>
                <span className="font-black text-sm text-slate-950">
                  ₹{confirmModalData.refundAmount.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 text-[11px] flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong>Automatic Stock Restoration: </strong>
                <span>
                  {confirmModalData.qtyToReturn} units will be immediately added back to shop stock (Inventory) and the customer invoice will be adjusted.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setConfirmModalData(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Processing...' : 'Confirm & Restock Parts'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
