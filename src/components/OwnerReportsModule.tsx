import React, { useState, useMemo, useEffect } from 'react';
import { Brand, User, Sale, SaleItem, Purchase, ReturnRecord, InventoryItem } from '../types';
import { db } from '../dbStore';
import * as XLSX from 'xlsx';
import { 
  TrendingUp, BarChart3, Calendar, FileSpreadsheet, 
  ArrowUpRight, ArrowDownRight, RefreshCw, SlidersHorizontal, 
  Download, Info, HelpCircle, ShieldAlert, ChevronRight, Layers, ShoppingBag, RotateCcw
} from 'lucide-react';

interface OwnerReportsModuleProps {
  brand: Brand;
  user: User;
}

export default function OwnerReportsModule({ brand, user }: OwnerReportsModuleProps) {
  const [reportsPayload, setReportsPayload] = useState<{
    sales: Sale[];
    saleItems: SaleItem[];
    returns: ReturnRecord[];
    purchases: Purchase[];
    purchaseItems: any[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'Daily' | 'Monthly' | 'Yearly'>('Monthly');
  
  // Date filter selections
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0-11
  
  // Custom estimated margin configuration
  const [defaultMarginPercent, setDefaultMarginPercent] = useState<number>(30); // 30% margin default
  const [showConfig, setShowConfig] = useState(false);

  // Fetch reports data on brand or change triggers
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    db.fetchReportsData(brand)
      .then(data => {
        if (active) {
          setReportsPayload(data);
          setIsLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [brand]);

  // Available years in dataset
  const availableYears = useMemo(() => {
    if (!reportsPayload) return [new Date().getFullYear()];
    const sales = reportsPayload.sales;
    const purchases = reportsPayload.purchases;
    const years = new Set<number>([new Date().getFullYear()]);
    
    sales.forEach(s => {
      try {
        const y = new Date(s.sale_date).getFullYear();
        if (!isNaN(y)) years.add(y);
      } catch (e) {}
    });
    
    purchases.forEach(p => {
      try {
        const y = new Date(p.invoice_date).getFullYear();
        if (!isNaN(y)) years.add(y);
      } catch (e) {}
    });
    
    return Array.from(years).sort((a, b) => b - a);
  }, [reportsPayload]);

  // Subscribe to db state updates
  useEffect(() => {
    const unsubscribe = db.subscribe(async () => {
      try {
        const data = await db.fetchReportsData(brand);
        setReportsPayload(data);
      } catch (err) {
        console.error(err);
      }
    });
    return unsubscribe;
  }, [brand]);

  // Check role restriction
  if (user.role !== 'Owner') {
    return (
      <div id="restricted-reports" className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 tracking-tight">Access Restricted</h2>
        <p className="text-slate-500 text-xs mt-2 leading-relaxed">
          The Owner Reports tab contains highly sensitive financial information, margins, and cost records. It is restricted strictly to the Business Owner.
        </p>
      </div>
    );
  }

  // Cost calculation map: part_no -> latest purchase cost
  const partCostMap = useMemo(() => {
    if (!reportsPayload) return new Map<string, number>();
    const purchases = reportsPayload.purchases;
    const purchaseItems = reportsPayload.purchaseItems;

    // Map each purchase ID to its dealer discount percentage
    const purchaseDiscountMap = new Map<string, number>();
    purchases.forEach(p => {
      purchaseDiscountMap.set(p.id, p.dealer_discount_percentage || 0);
    });

    const costMap = new Map<string, number>();
    
    // Sort purchase items by date ascending so that the latest purchase overwrites the cost
    const sortedPurchaseItems = [...purchaseItems].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    sortedPurchaseItems.forEach(item => {
      const discount = purchaseDiscountMap.get(item.purchase_id) || 0;
      // Net cost price = item's purchase MRP * (1 - discount%)
      const unitCost = item.mrp * (1 - discount / 100);
      costMap.set(item.part_no.toLowerCase().trim(), unitCost);
    });

    return costMap;
  }, [reportsPayload]);

  // Compute unit cost helper
  const getUnitCost = (partNo: string, mrp: number): number => {
    const cleanPartNo = partNo.toLowerCase().trim();
    if (partCostMap.has(cleanPartNo)) {
      return partCostMap.get(cleanPartNo)!;
    }
    // Fallback: estimate cost price from sale MRP using custom fallback profit margin setting
    return mrp * (1 - defaultMarginPercent / 100);
  };

  // Get data grouped by the selected timeframe
  const reportData = useMemo(() => {
    if (!reportsPayload) return [];
    const sales = reportsPayload.sales;
    const saleItems = reportsPayload.saleItems;
    const returns = reportsPayload.returns;
    const purchases = reportsPayload.purchases;

    // Group maps
    const groups: Record<string, {
      period: string;
      sales: number;
      qtySold: number;
      salesCount: number;
      returns: number;
      returnsCount: number;
      cogs: number;
      purchases: number;
      purchaseCount: number;
      timestamp: number; // for sorting
    }> = {};

    // Helper to initialize grouping record
    const getGroup = (key: string, periodLabel: string, timestamp: number) => {
      if (!groups[key]) {
        groups[key] = {
          period: periodLabel,
          sales: 0,
          qtySold: 0,
          salesCount: 0,
          returns: 0,
          returnsCount: 0,
          cogs: 0,
          purchases: 0,
          purchaseCount: 0,
          timestamp,
        };
      }
      return groups[key];
    };

    // Helper to extract periods
    const getPeriodKey = (dateStr: string): { key: string; label: string; matchesFilter: boolean; timestamp: number } => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return { key: 'invalid', label: 'Invalid Date', matchesFilter: false, timestamp: 0 };
      }
      
      const yr = date.getFullYear();
      const mo = date.getMonth(); // 0-11
      const dy = date.getDate();

      if (timeframe === 'Yearly') {
        return {
          key: `${yr}`,
          label: `${yr}`,
          matchesFilter: true, // Show all years
          timestamp: new Date(yr, 0, 1).getTime()
        };
      } else if (timeframe === 'Monthly') {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const isMatch = yr === selectedYear;
        return {
          key: `${yr}-${mo.toString().padStart(2, '0')}`,
          label: `${monthNames[mo]} ${yr}`,
          matchesFilter: isMatch,
          timestamp: new Date(yr, mo, 1).getTime()
        };
      } else {
        // Daily
        const isMatch = yr === selectedYear && mo === selectedMonth;
        const formattedDate = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        return {
          key: `${yr}-${mo.toString().padStart(2, '0')}-${dy.toString().padStart(2, '0')}`,
          label: formattedDate,
          matchesFilter: isMatch,
          timestamp: new Date(yr, mo, dy).getTime()
        };
      }
    };

    // 1. Process Sales and Cost of Goods Sold (COGS)
    sales.forEach(sale => {
      const { key, label, matchesFilter, timestamp } = getPeriodKey(sale.sale_date);
      if (!matchesFilter) return;

      const group = getGroup(key, label, timestamp);
      group.sales += sale.total_amount;
      group.salesCount += 1;

      // Calculate cost of items in this sale
      const items = saleItems.filter(item => item.sale_id === sale.id);
      items.forEach(item => {
        group.qtySold += item.quantity;
        const costPrice = getUnitCost(item.part_no, item.mrp);
        group.cogs += (costPrice * item.quantity);
      });
    });

    // 2. Process Returns and refund cost subtraction from COGS
    returns.forEach(ret => {
      const { key, label, matchesFilter, timestamp } = getPeriodKey(ret.return_date);
      if (!matchesFilter) return;

      const group = getGroup(key, label, timestamp);
      group.returns += ret.refund_amount;
      group.returnsCount += 1;

      // Subtract cost of returned item from COGS (since item is added back to stock)
      const saleItem = saleItems.find(si => si.id === ret.sale_item_id);
      const itemMrp = saleItem ? saleItem.mrp : 0;
      const returnedUnitCost = getUnitCost(ret.part_no, itemMrp);
      group.cogs = Math.max(0, group.cogs - (returnedUnitCost * ret.returned_quantity));
    });

    // 3. Process Purchases
    purchases.forEach(purchase => {
      const { key, label, matchesFilter, timestamp } = getPeriodKey(purchase.invoice_date);
      if (!matchesFilter) return;

      const group = getGroup(key, label, timestamp);
      group.purchases += purchase.total_after_discount;
      group.purchaseCount += 1;
    });

    // Convert Record to Array and Sort by Timestamp (descending for lists, but we can reverse for chart)
    const list = Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);

    // If timeframe is Monthly but there are no sales/purchases, pre-populate months for visual completeness
    if (timeframe === 'Monthly' && list.length === 0) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      monthNames.forEach((mName, mIdx) => {
        list.push({
          period: `${mName} ${selectedYear}`,
          sales: 0,
          qtySold: 0,
          salesCount: 0,
          returns: 0,
          returnsCount: 0,
          cogs: 0,
          purchases: 0,
          purchaseCount: 0,
          timestamp: new Date(selectedYear, mIdx, 1).getTime()
        });
      });
      list.sort((a, b) => b.timestamp - a.timestamp);
    }

    return list;
  }, [brand, timeframe, selectedYear, selectedMonth, partCostMap, defaultMarginPercent]);

  // Overall sums and indicators
  const statsSummary = useMemo(() => {
    let totalSales = 0;
    let totalQtySold = 0;
    let totalSalesCount = 0;
    let totalReturns = 0;
    let totalCOGS = 0;
    let totalPurchases = 0;
    let totalPurchaseCount = 0;

    reportData.forEach(row => {
      totalSales += row.sales;
      totalQtySold += row.qtySold;
      totalSalesCount += row.salesCount;
      totalReturns += row.returns;
      totalCOGS += row.cogs;
      totalPurchases += row.purchases;
      totalPurchaseCount += row.purchaseCount;
    });

    // Net Sales = Sales - Refunds
    const netSales = Math.max(0, totalSales - totalReturns);
    // Gross Profit = Net Sales - COGS
    const grossProfit = Math.max(0, netSales - totalCOGS);
    // Profit margin percentage
    const marginPercent = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

    return {
      totalSales,
      totalQtySold,
      totalSalesCount,
      totalReturns,
      netSales,
      totalCOGS,
      grossProfit,
      marginPercent,
      totalPurchases,
      totalPurchaseCount
    };
  }, [reportData]);

  // Export reports data to XLS
  const handleExportXLSX = () => {
    const dateText = timeframe === 'Daily' 
      ? `${new Date(selectedYear, selectedMonth).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`
      : timeframe === 'Monthly' 
        ? `Year_${selectedYear}` 
        : `Yearly_Report`;

    const wsData = reportData.map(row => {
      const rowNetSales = Math.max(0, row.sales - row.returns);
      const rowProfit = Math.max(0, rowNetSales - row.cogs);
      const rowMargin = rowNetSales > 0 ? (rowProfit / rowNetSales) * 100 : 0;

      return {
        "Period": row.period,
        "Gross Sales (₹)": Number(row.sales.toFixed(2)),
        "Items Sold (Qty)": row.qtySold,
        "Sales Count (Invoices)": row.salesCount,
        "Returns Refunds (₹)": Number(row.returns.toFixed(2)),
        "Net Sales Revenue (₹)": Number(rowNetSales.toFixed(2)),
        "Estimated COGS (₹)": Number(row.cogs.toFixed(2)),
        "Net Gross Profit (₹)": Number(rowProfit.toFixed(2)),
        "Profit Margin (%)": Number(rowMargin.toFixed(1)),
        "Dealer Purchases (₹)": Number(row.purchases.toFixed(2)),
        "Purchase Bills Count": row.purchaseCount
      };
    });

    const wsSummary = [{
      "Total Gross Sales (₹)": Number(statsSummary.totalSales.toFixed(2)),
      "Total Items Sold (Qty)": statsSummary.totalQtySold,
      "Total Invoices Booked": statsSummary.totalSalesCount,
      "Total Refunds (₹)": Number(statsSummary.totalReturns.toFixed(2)),
      "Net Sales Revenue (₹)": Number(statsSummary.netSales.toFixed(2)),
      "Total COGS (₹)": Number(statsSummary.totalCOGS.toFixed(2)),
      "Total Net Profit (₹)": Number(statsSummary.grossProfit.toFixed(2)),
      "Average Margin (%)": Number(statsSummary.marginPercent.toFixed(1)),
      "Total Purchases (₹)": Number(statsSummary.totalPurchases.toFixed(2)),
      "Total Purchase Bills": statsSummary.totalPurchaseCount
    }];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(wsData);
    const ws2 = XLSX.utils.json_to_sheet(wsSummary);

    XLSX.utils.book_append_sheet(wb, ws1, "Period Details");
    XLSX.utils.book_append_sheet(wb, ws2, "Financial Summary");

    XLSX.writeFile(wb, `Sparezy_Owner_Report_${brand}_${timeframe}_${dateText}.xlsx`);
  };

  // Generate bar chart scales
  const chartHeight = 160;
  const chartBars = useMemo(() => {
    // We reverse report data to show oldest to newest (left to right) in the chart
    const reversedData = [...reportData].reverse();
    
    // Find max value in any field to scale chart height
    const maxVal = Math.max(
      ...reversedData.map(r => Math.max(r.sales, r.purchases, Math.max(0, r.sales - r.returns - r.cogs))),
      1000 // default minimum divider to prevent infinity/zeros
    );

    return reversedData.map(row => {
      const netSales = Math.max(0, row.sales - row.returns);
      const profit = Math.max(0, netSales - row.cogs);
      const purchases = row.purchases;

      return {
        label: timeframe === 'Daily' ? row.period.split(' ')[0] : row.period.split(' ')[0], // short label
        fullLabel: row.period,
        salesHeight: (row.sales / maxVal) * chartHeight,
        profitHeight: (profit / maxVal) * chartHeight,
        purchaseHeight: (purchases / maxVal) * chartHeight,
        salesVal: row.sales,
        profitVal: profit,
        purchaseVal: purchases
      };
    });
  }, [reportData, timeframe]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  if (isLoading || !reportsPayload) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm max-w-lg mx-auto my-12 space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-600 font-bold text-sm">Aggregating lightweight financial logs...</p>
        <p className="text-slate-400 text-xs">Computing profit margins, COGS, and return metrics safely.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Title & Meta Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 tracking-wider uppercase border border-indigo-100">
            Owner Access Only
          </span>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight mt-2.5 flex items-center gap-2">
            <TrendingUp className="w-5.5 h-5.5 text-indigo-600" />
            Financial Sales &amp; Profit Reports &mdash; {brand}
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Check daily, monthly, or yearly financial margins, net sales revenue, gross profits, and vendor purchasing logs.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleExportXLSX}
            disabled={reportData.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Report (Excel)
          </button>
        </div>
      </div>

      {/* Primary Configuration & Filtering Filters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {(['Daily', 'Monthly', 'Yearly'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition duration-150 ${
                  timeframe === t
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800 cursor-pointer'
                }`}
              >
                {t} Reports
              </button>
            ))}
          </div>

          {/* Contextual Date Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Year selector (only for Daily & Monthly) */}
            {timeframe !== 'Yearly' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400">Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-semibold text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Month selector (only for Daily) */}
            {timeframe === 'Daily' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400">Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-semibold text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {monthNames.map((name, idx) => (
                    <option key={idx} value={idx}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Collapsible settings button */}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showConfig ? 'Hide Profit Settings' : 'Profit Settings'}</span>
            </button>

          </div>
        </div>

        {/* Collapsible profitability cost margin fallback configurator */}
        {showConfig && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-3 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-600" />
              How is profitability calculated?
            </h4>
            <p className="text-slate-500 text-[11px] leading-relaxed max-w-3xl">
              Profit is calculated as: <code className="font-bold text-slate-700">Net Sales (Gross Sales - Refunds) - COGS (Cost of Goods Sold)</code>.<br />
              The system matches each sale item with its purchase price from vendor records. If an item has no recorded vendor purchases, the system estimates its cost based on a fallback markup discount below:
            </p>
            <div className="flex items-center gap-3 pt-1">
              <label className="text-xs font-semibold text-slate-700">
                Fallback Item Profit Margin % (for missing purchase items):
              </label>
              <input
                type="number"
                min="0"
                max="90"
                value={defaultMarginPercent}
                onChange={(e) => setDefaultMarginPercent(Math.min(90, Math.max(0, Number(e.target.value) || 0)))}
                className="w-20 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-xs outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-400 font-medium">
                (Estimated purchase cost of {100 - defaultMarginPercent}% of MRP is used)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* KPI Financial Summary Counters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Gross Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gross Sales booked</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3.5">
            <h3 className="text-xl font-black text-slate-900">₹{statsSummary.totalSales.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-slate-400 mt-1">
              {statsSummary.totalSalesCount} invoice bookings ({statsSummary.totalQtySold} items)
            </p>
          </div>
        </div>

        {/* Refunds block */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Returns &amp; Refunds</span>
            <div className="p-2 bg-red-50 text-red-600 rounded-xl border border-red-100">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3.5">
            <h3 className="text-xl font-black text-rose-700">₹{statsSummary.totalReturns.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-slate-400 mt-1">
              Net Sales Revenue: <span className="font-bold text-slate-700">₹{statsSummary.netSales.toLocaleString('en-IN')}</span>
            </p>
          </div>
        </div>

        {/* Profit margins */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Gross Profit</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3.5">
            <h3 className="text-xl font-black text-emerald-700">₹{statsSummary.grossProfit.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
              <span>Average Margin:</span>
              <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-150">
                {statsSummary.marginPercent.toFixed(1)}%
              </span>
            </p>
          </div>
        </div>

        {/* Vendor Purchases */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Purchases Recorded</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3.5">
            <h3 className="text-xl font-black text-blue-800">₹{statsSummary.totalPurchases.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-slate-400 mt-1">
              Synced from {statsSummary.totalPurchaseCount} dealer invoice imports
            </p>
          </div>
        </div>

      </div>

      {/* Visual Analytics Chart View */}
      {chartBars.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-slate-500" />
                Visual Comparison Trend ({timeframe})
              </h3>
              <p className="text-slate-400 text-[10px] mt-0.5">Left-to-right Chronological Sequence</p>
            </div>
            
            {/* Chart Legends */}
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-indigo-500 block"></span>
                <span className="text-slate-600">Sales</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500 block"></span>
                <span className="text-slate-600">Net Profit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-400 block"></span>
                <span className="text-slate-600">Purchases</span>
              </div>
            </div>
          </div>

          {/* SVG/Div Chart Grid wrapper */}
          <div className="relative pt-6">
            <div className="h-44 flex items-end justify-between gap-1 sm:gap-2 border-b border-slate-200 px-4">
              {chartBars.map((bar, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  
                  {/* Tooltip detail hover popover */}
                  <div className="absolute bottom-full mb-2 bg-slate-900 text-white rounded-lg p-2.5 text-[9px] leading-relaxed hidden group-hover:block z-50 shadow-xl min-w-36 pointer-events-none border border-slate-800">
                    <p className="font-bold border-b border-slate-700 pb-1 mb-1">{bar.fullLabel}</p>
                    <p className="flex justify-between gap-2"><span>Gross Sales:</span> <span>₹{bar.salesVal.toLocaleString('en-IN')}</span></p>
                    <p className="flex justify-between gap-2"><span>Gross Profit:</span> <span className="text-emerald-400 font-semibold">₹{bar.profitVal.toLocaleString('en-IN')}</span></p>
                    <p className="flex justify-between gap-2"><span>Purchases:</span> <span className="text-blue-300">₹{bar.purchaseVal.toLocaleString('en-IN')}</span></p>
                  </div>

                  {/* Multi bar grouped blocks */}
                  <div className="flex items-end justify-center gap-0.5 sm:gap-1 w-full max-w-[48px]">
                    
                    {/* Sales Column */}
                    <div 
                      className="bg-indigo-500 hover:bg-indigo-600 transition-all rounded-t-sm w-1.5 sm:w-2.5 shrink-0"
                      style={{ height: `${Math.max(2, bar.salesHeight)}px` }}
                    ></div>

                    {/* Profit Column */}
                    <div 
                      className="bg-emerald-500 hover:bg-emerald-600 transition-all rounded-t-sm w-1.5 sm:w-2.5 shrink-0"
                      style={{ height: `${Math.max(2, bar.profitHeight)}px` }}
                    ></div>

                    {/* Purchases Column */}
                    <div 
                      className="bg-blue-400 hover:bg-blue-500 transition-all rounded-t-sm w-1.5 sm:w-2.5 shrink-0"
                      style={{ height: `${Math.max(2, bar.purchaseHeight)}px` }}
                    ></div>

                  </div>

                  {/* Axis label */}
                  <span className="text-[8.5px] font-bold text-slate-400 mt-2 truncate w-full text-center tracking-tight">
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Structured report breakdown table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">
            Detailed Statement Records
          </h3>
          <span className="inline-flex px-2 py-0.5 text-[9px] font-bold uppercase bg-slate-50 border border-slate-200 text-slate-500 rounded-md">
            Showing {reportData.length} records
          </span>
        </div>

        {reportData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] tracking-wider uppercase">
                <tr>
                  <th className="p-4 px-6">Period Date</th>
                  <th className="p-4 text-right">Gross Sales (A)</th>
                  <th className="p-4 text-center">Items Sold</th>
                  <th className="p-4 text-right">Refunds (B)</th>
                  <th className="p-4 text-right">Net Revenue (A-B)</th>
                  <th className="p-4 text-right">Estimated Cost (COGS)</th>
                  <th className="p-4 text-right">Net Profit</th>
                  <th className="p-4 text-center">Margin</th>
                  <th className="p-4 text-right pr-6">Purchases (C)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
                {reportData.map((row, idx) => {
                  const netSalesVal = Math.max(0, row.sales - row.returns);
                  const netProfitVal = Math.max(0, netSalesVal - row.cogs);
                  const marginVal = netSalesVal > 0 ? (netProfitVal / netSalesVal) * 100 : 0;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="p-4 px-6 font-semibold text-slate-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{row.period}</span>
                      </td>
                      <td className="p-4 text-right font-medium">₹{row.sales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-4 text-center font-mono text-slate-500">{row.qtySold}</td>
                      <td className="p-4 text-right font-medium text-rose-600">
                        {row.returns > 0 ? `-₹${row.returns.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}
                      </td>
                      <td className="p-4 text-right font-semibold text-slate-900">₹{netSalesVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-right text-slate-500">₹{row.cogs.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-right font-bold text-emerald-700">₹{netProfitVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-[10px] ${
                          marginVal >= 30 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' 
                            : marginVal > 0 
                              ? 'bg-blue-50 text-blue-700 border border-blue-150' 
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {marginVal.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-4 text-right font-semibold text-blue-800 pr-6">₹{row.purchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-sm text-slate-400">
            No transaction records matched this date filter scope.
          </div>
        )}
      </div>

    </div>
  );
}
