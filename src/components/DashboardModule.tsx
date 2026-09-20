import { useState, useEffect, useMemo } from 'react';
import { Brand, User, isOwnerOrAdmin } from '../types';
import { db } from '../dbStore';
import { 
  TrendingUp, Layers, AlertCircle, ShoppingBag, 
  ArrowUpRight, ArrowDownRight, RefreshCw, BarChart3, Users,
  Flame, Archive, Package, Truck, ExternalLink, Calendar,
  Clock, DollarSign, CheckCircle2, ChevronRight
} from 'lucide-react';

interface DashboardModuleProps {
  brand: Brand;
  user: User;
  onNavigateToModule: (moduleName: string) => void;
}

export default function DashboardModule({ brand, user, onNavigateToModule }: DashboardModuleProps) {
  const [, forceUpdate] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [analyticsTab, setAnalyticsTab] = useState<'running' | 'dead' | 'low_stock' | 'revenue'>('running');
  const [deadStockThresholdDays, setDeadStockThresholdDays] = useState<number>(60);
  const [deadStockFilter, setDeadStockFilter] = useState<'all_dormant' | 'never_sold'>('all_dormant');

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 450);

    const unsubscribe = db.subscribe(() => {
      forceUpdate(prev => prev + 1);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [brand]);

  // Query isolated brand schema dataset
  const inventory = db.getInventory(brand);
  const sales = db.getSales(brand);
  const saleItems = db.getSaleItems(brand);
  const returns = db.getReturns(brand);
  const purchases = db.getPurchases(brand);
  const customers = db.getCustomers();
  const orderRequests = db.getOrderRequests(brand);

  // Key performance indicators
  const totalSku = inventory.length;
  const totalQty = inventory.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalValuation = inventory.reduce((acc, curr) => acc + (curr.quantity * curr.mrp), 0);

  const lowStockItems = useMemo(() => {
    return inventory.filter(item => item.quantity <= 3);
  }, [inventory]);

  const totalSalesRevenue = sales.reduce((acc, curr) => acc + curr.total_amount, 0);
  const totalPaidRevenue = sales.reduce((acc, curr) => acc + curr.paid_amount, 0);
  const totalPendingRevenue = sales.reduce((acc, curr) => acc + curr.pending_amount, 0);

  const totalReturnsValuation = returns.reduce((acc, curr) => acc + curr.refund_amount, 0);
  const totalPurchasesValuation = purchases.reduce((acc, curr) => acc + curr.total_after_discount, 0);

  // 1. RUNNING ITEMS (Most Selling Parts)
  const runningItems = useMemo(() => {
    const map = new Map<string, {
      part_no: string;
      part_name: string;
      totalQtySold: number;
      totalRevenue: number;
      salesCount: number;
      currentStock: number;
      mrp: number;
    }>();

    saleItems.forEach(si => {
      const existing = map.get(si.part_no) || {
        part_no: si.part_no,
        part_name: si.part_name,
        totalQtySold: 0,
        totalRevenue: 0,
        salesCount: 0,
        currentStock: 0,
        mrp: si.mrp
      };
      existing.totalQtySold += si.quantity;
      existing.totalRevenue += si.final_amount;
      existing.salesCount += 1;
      map.set(si.part_no, existing);
    });

    inventory.forEach(inv => {
      const r = map.get(inv.part_no);
      if (r) {
        r.currentStock = inv.quantity;
        r.mrp = inv.mrp;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalQtySold - a.totalQtySold);
  }, [saleItems, inventory]);

  // 2. DEAD STOCK (Not selling for so long)
  const deadStockAnalysis = useMemo(() => {
    const nowMs = Date.now();
    const allDead = inventory
      .filter(inv => inv.quantity > 0)
      .map(inv => {
        const itemSales = saleItems.filter(si => si.part_no.toLowerCase().trim() === inv.part_no.toLowerCase().trim());
        let lastSoldDate: string | null = null;
        let daysSinceLastSale = 9999;
        
        if (itemSales.length > 0) {
          const saleDates = itemSales.map(si => {
            const s = sales.find(sale => sale.id === si.sale_id);
            return s ? new Date(s.sale_date).getTime() : 0;
          }).filter(t => t > 0);
          
          if (saleDates.length > 0) {
            const maxTime = Math.max(...saleDates);
            lastSoldDate = new Date(maxTime).toISOString();
            daysSinceLastSale = Math.floor((nowMs - maxTime) / (1000 * 60 * 60 * 24));
          }
        }
        
        return {
          id: inv.id,
          part_no: inv.part_no,
          part_name: inv.part_name,
          quantity: inv.quantity,
          mrp: inv.mrp,
          tiedUpValuation: inv.quantity * inv.mrp,
          lastSoldDate,
          daysSinceLastSale,
          neverSold: itemSales.length === 0
        };
      });

    // Filter by user selection
    const filtered = allDead.filter(item => {
      if (deadStockFilter === 'never_sold') return item.neverSold;
      return item.daysSinceLastSale >= deadStockThresholdDays;
    }).sort((a, b) => b.tiedUpValuation - a.tiedUpValuation);

    const totalDeadValuation = filtered.reduce((acc, curr) => acc + curr.tiedUpValuation, 0);
    const totalDeadUnits = filtered.reduce((acc, curr) => acc + curr.quantity, 0);

    return {
      items: filtered,
      totalCount: filtered.length,
      totalDeadValuation,
      totalDeadUnits
    };
  }, [inventory, saleItems, sales, deadStockThresholdDays, deadStockFilter]);

  // Category sales
  const categorySales = useMemo(() => {
    return sales.reduce((acc, sale) => {
      acc[sale.customer_category] = (acc[sale.customer_category] || 0) + sale.total_amount;
      return acc;
    }, {} as Record<string, number>);
  }, [sales]);

  const categories: ('Walk-in' | 'Mistri' | 'Retailer' | 'Garage')[] = ['Walk-in', 'Mistri', 'Retailer', 'Garage'];
  const colors = {
    'Walk-in': 'bg-blue-500',
    'Mistri': 'bg-emerald-500',
    'Retailer': 'bg-amber-500',
    'Garage': 'bg-indigo-500'
  };

  const recentSales = sales.slice(0, 5);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-white rounded-2xl border border-slate-200 p-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-white rounded-2xl border border-slate-200"></div>
          ))}
        </div>
        <div className="h-96 bg-white rounded-2xl border border-slate-200"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Brand & User Greeting Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 tracking-wider uppercase border border-indigo-100">
              Active Schema: {brand}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
              Role: {user.role}
            </span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight mt-2 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
            Executive Inventory & Sales Analytics
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Real-time insight into running fast-movers, dead dormant stock, replenishment alerts, and customer receivables.
          </p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigateToModule('Sale POS')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Open Sale POS
          </button>
          <button
            onClick={() => onNavigateToModule('Order Requests')}
            className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Orders ({orderRequests.filter(r => r.status === 'Pending').length} Pending)
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* SKUs & Total Valuation */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inventory Stock</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{totalSku.toLocaleString()} SKUs</h3>
            <p className="text-[11px] font-semibold text-slate-600 mt-1">
              {totalQty.toLocaleString()} Total Units in Warehouse
            </p>
            {isOwnerOrAdmin(user.role) && (
              <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
                Valuation: ₹{totalValuation.toLocaleString('en-IN')} MRP
              </p>
            )}
          </div>
        </div>

        {/* Total Sales Booked */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sales Revenue</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">₹{totalSalesRevenue.toLocaleString('en-IN')}</h3>
            <div className="text-[10px] mt-1.5 flex items-center justify-between font-bold">
              <span className="text-emerald-600">₹{totalPaidRevenue.toLocaleString('en-IN')} Recd</span>
              <span className="text-amber-600">₹{totalPendingRevenue.toLocaleString('en-IN')} Pending</span>
            </div>
          </div>
        </div>

        {/* Dead Stock Capital Alert */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dead Stock Alert</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
              <Archive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-rose-600 tracking-tight">{deadStockAnalysis.totalCount} Parts</h3>
            <p className="text-[11px] font-semibold text-slate-600 mt-1">
              ₹{deadStockAnalysis.totalDeadValuation.toLocaleString('en-IN')} tied up capital
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
              {deadStockAnalysis.totalDeadUnits} dormant units in stock
            </p>
          </div>
        </div>

        {/* Low Stock Actions */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Low Stock SKUs</span>
            <div className={`p-2 rounded-xl border ${lowStockItems.length > 0 ? 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{lowStockItems.length} SKUs</h3>
            <p className="text-[11px] font-semibold text-amber-700 mt-1">
              {lowStockItems.length > 0 ? 'Below safety threshold (<=3)' : 'All inventory levels healthy'}
            </p>
            <button
              onClick={() => {
                setAnalyticsTab('low_stock');
              }}
              className="text-[10px] font-bold text-indigo-600 hover:underline mt-1 block"
            >
              View Low Stock Items &rarr;
            </button>
          </div>
        </div>

      </div>

      {/* Analytics Tabs Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setAnalyticsTab('running')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            analyticsTab === 'running' 
              ? 'bg-indigo-600 text-white shadow-sm' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Flame className="w-4 h-4" />
          Running Items (Top Fast-Selling Parts)
        </button>

        <button
          onClick={() => setAnalyticsTab('dead')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            analyticsTab === 'dead' 
              ? 'bg-rose-600 text-white shadow-sm' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Archive className="w-4 h-4" />
          Dead Stock ({deadStockAnalysis.totalCount} Dormant Parts)
        </button>

        <button
          onClick={() => setAnalyticsTab('low_stock')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            analyticsTab === 'low_stock' 
              ? 'bg-amber-600 text-white shadow-sm' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          Low Stock Alerts ({lowStockItems.length})
        </button>

        <button
          onClick={() => setAnalyticsTab('revenue')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            analyticsTab === 'revenue' 
              ? 'bg-emerald-600 text-white shadow-sm' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Customer Category Split & Revenue
        </button>
      </div>

      {/* TAB CONTENT 1: RUNNING ITEMS */}
      {analyticsTab === 'running' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-500" />
                Running Items (Highest Selling Spare Parts)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Parts that generate the highest sales volume and cash velocity. Maintain strong supplier lead times for these parts.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {runningItems.length} unique parts billed
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 px-4">Rank</th>
                  <th className="p-3">Part Number</th>
                  <th className="p-3">Part Description</th>
                  <th className="p-3 text-center">Units Sold</th>
                  <th className="p-3 text-center">In Stock Qty</th>
                  <th className="p-3 text-right">Unit MRP</th>
                  <th className="p-3 text-right pr-4">Total Revenue Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {runningItems.slice(0, 20).map((item, idx) => (
                  <tr key={item.part_no} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 px-4">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-[11px] ${
                        idx === 0 ? 'bg-amber-100 text-amber-800' :
                        idx === 1 ? 'bg-slate-200 text-slate-800' :
                        idx === 2 ? 'bg-orange-100 text-orange-800' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        #{idx + 1}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      {item.part_no}
                    </td>
                    <td className="p-3 font-semibold text-slate-800">
                      {item.part_name}
                    </td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 text-[11px] border border-amber-200">
                        {item.totalQtySold} sold
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`font-mono font-bold ${
                        item.currentStock <= 3 ? 'text-rose-600' : 'text-slate-900'
                      }`}>
                        {item.currentStock} units
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-medium">
                      ₹{item.mrp.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right pr-4 font-mono font-black text-slate-900">
                      ₹{item.totalRevenue.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}

                {runningItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No sales recorded in {brand} schema yet. Start billing via Sale POS to generate velocity statistics.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: DEAD STOCK */}
      {analyticsTab === 'dead' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Archive className="w-5 h-5 text-rose-500" />
                Dead & Slow-Moving Stock Analysis
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Parts that have not sold for an extended period, tying up warehouse capital. Consider discounts or dealer returns.
              </p>
            </div>

            {/* Dead stock duration filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={deadStockThresholdDays}
                onChange={(e) => {
                  setDeadStockThresholdDays(Number(e.target.value));
                  setDeadStockFilter('all_dormant');
                }}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white outline-none"
              >
                <option value={30}>No Sales for 30+ Days</option>
                <option value={60}>No Sales for 60+ Days</option>
                <option value={90}>No Sales for 90+ Days</option>
                <option value={180}>No Sales for 180+ Days</option>
              </select>

              <button
                onClick={() => setDeadStockFilter(prev => prev === 'never_sold' ? 'all_dormant' : 'never_sold')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  deadStockFilter === 'never_sold'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Never Sold Only
              </button>
            </div>
          </div>

          <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-150 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
            <div>
              <span className="font-bold text-rose-900">
                Tied-Up Capital in Selected Dead Stock:
              </span>
              <p className="text-xl font-black text-rose-700 mt-0.5 font-mono">
                ₹{deadStockAnalysis.totalDeadValuation.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="text-slate-600 text-right">
              <p className="font-bold text-slate-900">{deadStockAnalysis.totalCount} distinct SKUs</p>
              <p className="text-[11px] text-slate-500">{deadStockAnalysis.totalDeadUnits} total idle units in storage</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 px-4">Part Number</th>
                  <th className="p-3">Part Description</th>
                  <th className="p-3 text-center">Idle Stock Qty</th>
                  <th className="p-3 text-right">Unit MRP</th>
                  <th className="p-3 text-right">Tied-Up Capital</th>
                  <th className="p-3 text-center">Dormancy Period</th>
                  <th className="p-3 text-right pr-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {deadStockAnalysis.items.slice(0, 30).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 px-4 font-mono font-bold text-slate-900">
                      {item.part_no}
                    </td>
                    <td className="p-3 font-semibold text-slate-800">
                      {item.part_name}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-900">
                      {item.quantity} units
                    </td>
                    <td className="p-3 text-right font-mono font-medium">
                      ₹{item.mrp.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-mono font-black text-rose-600">
                      ₹{item.tiedUpValuation.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center">
                      {item.neverSold ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          Never Sold (0 Sales)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          {item.daysSinceLastSale} days dormant
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right pr-4">
                      <button
                        onClick={() => onNavigateToModule('Inventory')}
                        className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        Inspect SKU &rarr;
                      </button>
                    </td>
                  </tr>
                ))}

                {deadStockAnalysis.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      Congratulations! No parts match the selected dead stock dormancy filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: LOW STOCK ALERTS */}
      {analyticsTab === 'low_stock' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Critical Low Stock Alerts (Stock Level &le; 3)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Items requiring prompt procurement or order requests to prevent lost retail and garage sales.
              </p>
            </div>
            <button
              onClick={() => onNavigateToModule('Order Requests')}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Go to Order Requests &rarr;
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 px-4">Part Number</th>
                  <th className="p-3">Part Description</th>
                  <th className="p-3">HSN Code</th>
                  <th className="p-3">MRP</th>
                  <th className="p-3 text-center">Remaining Stock</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right pr-4">Quick Procurement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {lowStockItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 px-4 font-mono font-bold text-slate-900">
                      {item.part_no}
                    </td>
                    <td className="p-3 font-semibold text-slate-800">
                      {item.part_name}
                    </td>
                    <td className="p-3 font-mono text-slate-500 text-[11px]">
                      {item.hsn}
                    </td>
                    <td className="p-3 font-mono font-medium">
                      ₹{item.mrp.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-sm">
                      <span className={item.quantity === 0 ? 'text-rose-600' : 'text-amber-600'}>
                        {item.quantity} Left
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        item.quantity === 0 
                          ? 'bg-rose-50 text-rose-700 border-rose-200' 
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {item.quantity === 0 ? 'OUT OF STOCK' : 'CRITICAL'}
                      </span>
                    </td>
                    <td className="p-3 text-right pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onNavigateToModule('Order Requests')}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
                        >
                          Request Order
                        </button>
                        <button
                          onClick={() => onNavigateToModule('Purchase POS')}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
                        >
                          Purchase Bill
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {lowStockItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      All stock quantities are above the safety threshold.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: REVENUE & CATEGORY SPLIT */}
      {analyticsTab === 'revenue' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm lg:col-span-1 space-y-4">
            <h3 className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Customer Category Distribution
            </h3>
            
            <div className="space-y-4 my-6">
              {categories.map((cat) => {
                const amount = categorySales[cat] || 0;
                const pct = totalSalesRevenue > 0 ? (amount / totalSalesRevenue) * 100 : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${colors[cat]}`}></span>
                        {cat}
                      </span>
                      <span className="font-mono text-xs font-bold">
                        ₹{amount.toLocaleString('en-IN')} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${colors[cat]} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm lg:col-span-2 space-y-4">
            <h3 className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              Recent Sales Activity ({brand})
            </h3>
            
            <div className="divide-y divide-slate-100">
              {recentSales.map((sale) => (
                <div key={sale.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{sale.customer_name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {sale.invoice_no || sale.id.slice(0, 8)} &bull; {new Date(sale.sale_date).toLocaleDateString()} &bull; {sale.customer_category}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-900 font-mono">₹{sale.total_amount.toLocaleString('en-IN')}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase mt-0.5 ${
                      sale.payment_status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' : 'bg-amber-50 text-amber-700 border border-amber-150'
                    }`}>
                      {sale.payment_status}
                    </span>
                  </div>
                </div>
              ))}
              {recentSales.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  No sales recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
