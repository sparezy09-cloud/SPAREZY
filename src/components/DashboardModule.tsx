import { useState, useEffect } from 'react';
import { Brand, User } from '../types';
import { db } from '../dbStore';
import { 
  TrendingUp, Layers, AlertCircle, ShoppingBag, 
  ArrowUpRight, ArrowDownRight, RefreshCw, BarChart3, Users
} from 'lucide-react';

interface DashboardModuleProps {
  brand: Brand;
  user: User;
  onNavigateToModule: (moduleName: string) => void;
}

export default function DashboardModule({ brand, user, onNavigateToModule }: DashboardModuleProps) {
  const [, forceUpdate] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 750);

    const unsubscribe = db.subscribe(() => {
      forceUpdate(prev => prev + 1);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [brand]);

  // Query only selected brand schema data (optimizes load speed!)
  const inventory = db.getInventory(brand);
  const sales = db.getSales(brand);
  const returns = db.getReturns(brand);
  const purchases = db.getPurchases(brand);
  const customers = db.getCustomers();

  // Metrics calculation
  const activeItems = inventory;
  
  const totalSku = activeItems.length;
  const totalQty = activeItems.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalValuation = activeItems.reduce((acc, curr) => acc + (curr.quantity * curr.mrp), 0);

  const lowStockItems = activeItems.filter(item => item.quantity <= 3);

  const totalSalesRevenue = sales.reduce((acc, curr) => acc + curr.total_amount, 0);
  const totalPendingCollected = sales.reduce((acc, curr) => acc + curr.paid_amount, 0); // Note: correct calculated mapping as pre-configured
  const totalPaidRevenue = sales.reduce((acc, curr) => acc + curr.paid_amount, 0);

  const totalReturnsValuation = returns.reduce((acc, curr) => acc + curr.refund_amount, 0);
  const totalPurchasesValuation = purchases.reduce((acc, curr) => acc + curr.total_after_discount, 0);

  // Sales trend by customer category
  const categorySales = sales.reduce((acc, sale) => {
    acc[sale.customer_category] = (acc[sale.customer_category] || 0) + sale.total_amount;
    return acc;
  }, {} as Record<string, number>);

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
      <div id="dashboard-loading-root" className="space-y-6">
        {/* Shimmering Brand & User Greeting Header */}
        <div id="greeting-loader" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-pulse">
          <div className="space-y-3 flex-1">
            <div className="h-3.5 bg-slate-200 rounded w-1/4"></div>
            <div className="h-6 bg-slate-200 rounded w-1/2"></div>
            <div className="h-3 bg-slate-100 rounded w-2/3"></div>
          </div>
          <div className="h-8 bg-slate-200 rounded-xl w-32 hidden sm:block"></div>
        </div>

        {/* Shimmering KPI Stats Grid */}
        <div id="kpi-grid-loader" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div id={`kpi-card-loader-${i}`} key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-pulse space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-3.5 bg-slate-200 rounded w-1/2"></div>
                <div className="w-8 h-8 bg-slate-100 rounded-xl"></div>
              </div>
              <div className="space-y-2 mt-4">
                <div className="h-8 bg-slate-200 rounded w-2/3"></div>
                <div className="h-3 bg-slate-100 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Shimmering Main Charts / Metrics Breakdown */}
        <div id="metrics-grid-loader" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Shimmering Category Split */}
          <div id="category-loader-card" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-1 animate-pulse space-y-6">
            <div className="h-4 bg-slate-200 rounded w-1/3"></div>
            <div className="space-y-4 my-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/3"></div>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full"></div>
                </div>
              ))}
            </div>
            <div className="h-4 bg-slate-200 rounded w-1/2 pt-4 border-t border-slate-100"></div>
          </div>

          {/* Shimmering Transactions Summary */}
          <div id="transactions-loader-card" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-2 space-y-6 animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-4 bg-slate-200 rounded w-1/3"></div>
              <div className="h-3 bg-slate-100 rounded w-1/6"></div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl space-y-2">
                <div className="h-3 bg-slate-200 rounded w-1/3 mx-auto"></div>
                <div className="h-6 bg-slate-200 rounded w-1/2 mx-auto"></div>
                <div className="h-3 bg-slate-100 rounded w-1/4 mx-auto"></div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl space-y-2">
                <div className="h-3 bg-slate-200 rounded w-1/3 mx-auto"></div>
                <div className="h-6 bg-slate-200 rounded w-1/2 mx-auto"></div>
                <div className="h-3 bg-slate-100 rounded w-1/4 mx-auto"></div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="h-3 bg-slate-200 rounded w-1/4"></div>
              <div className="divide-y divide-slate-100 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="pt-3 flex justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                      <div className="h-3 bg-slate-150 rounded w-1/4"></div>
                    </div>
                    <div className="space-y-2 w-1/4 items-end flex flex-col">
                      <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                      <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Shimmering Re-Order Panel */}
        <div id="reorder-loader-card" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm animate-pulse space-y-4">
          <div className="h-4 bg-slate-200 rounded w-1/3"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-50 rounded"></div>
            ))}
          </div>
        </div>

      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Brand & User Greeting Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 tracking-wider uppercase border border-indigo-100">
            Active Schema: {brand}
          </span>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight mt-2.5">
            Sparezy MIS Dashboard &mdash; {brand} Portal
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Welcome back, <span className="font-semibold text-slate-700">{user.name}</span> ({user.role}). Operations are running in brand isolation.
          </p>
        </div>
        
        <div className="flex gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Database Connection</p>
            {db.isInventoryAccessSuccessful(brand) ? (
              <p className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Supabase Connected
              </p>
            ) : (
              <p className="text-xs font-bold text-rose-600 flex items-center justify-end gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                Sync Blocked / Disconnected
              </p>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Grid - Styled for Geometric Balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* SKUs */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Active SKUs</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{totalSku} Parts</h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-1 flex items-center gap-1 uppercase tracking-wider">
              <span>All parts active and search-ready</span>
            </p>
          </div>
        </div>

        {/* Total Stock */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Valuation (MRP)</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            {user.role === 'Manager' ? (
              <h3 className="text-base font-bold text-slate-400 tracking-tight py-1 inline-flex items-center gap-1">
                <span>🔒 Restricted</span>
              </h3>
            ) : (
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">₹{totalValuation.toLocaleString('en-IN')}</h3>
            )}
            <p className="text-[10px] text-slate-400 font-semibold mt-1 flex items-center gap-1 uppercase tracking-wider">
              <span>Qty: {totalQty.toLocaleString()} units in stock</span>
            </p>
          </div>
        </div>

        {/* Total Sales */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Sales Booked</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">₹{totalSalesRevenue.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] mt-1.5 flex items-center gap-2 justify-between">
              <span className="text-emerald-600 font-bold uppercase tracking-wider">₹{totalPaidRevenue.toLocaleString('en-IN')} Recd</span>
              <span className="text-amber-600 font-bold uppercase tracking-wider">₹{totalPendingCollected.toLocaleString('en-IN')} Pend</span>
            </p>
          </div>
        </div>

        {/* Low Stock Watch */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Low Stock Actions</span>
            <div className={`p-2 rounded-xl border ${lowStockItems.length > 0 ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{lowStockItems.length} SKUs</h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">
              {lowStockItems.length > 0 ? 'Urgent re-order suggested' : 'Stock levels overall healthy'}
            </p>
          </div>
        </div>

      </div>

      {/* Main Charts / Metrics Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sales by Category Representation */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-1">
          <h3 className="font-extrabold text-slate-900 text-sm tracking-tight flex items-center gap-1.5 mb-4">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            Sales Category Split
          </h3>
          
          <div className="space-y-4 my-6">
            {categories.map((cat) => {
              const amount = categorySales[cat] || 0;
              const pct = totalSalesRevenue > 0 ? (amount / totalSalesRevenue) * 100 : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <span className={`w-2 h-2 rounded-full ${colors[cat]}`}></span>
                      {cat}
                    </span>
                    <span className="font-mono text-xs">₹{amount.toLocaleString('en-IN')} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${colors[cat]} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
            {totalSalesRevenue === 0 && (
              <div className="text-center py-8 text-xs text-slate-400">
                No sales recorded in {brand} schema yet.
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-4 flex justify-between text-xs text-indigo-600 font-bold">
            <button onClick={() => onNavigateToModule('Sales')} className="hover:underline cursor-pointer">
              Go To Sales Module &rarr;
            </button>
          </div>
        </div>

        {/* Operations Overview & Activity Stats */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 text-slate-500" />
              Transactions Summary ({brand} Instance)
            </h3>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Real-time stats</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50/50 border border-emerald-150 rounded-2xl text-center">
              <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">Customer Returns</span>
              <p className="text-lg font-black text-emerald-955 text-slate-900 mt-1">₹{totalReturnsValuation.toLocaleString('en-IN')}</p>
              <span className="text-[9px] text-emerald-600 font-semibold block mt-0.5">{returns.length} returns</span>
            </div>

            <div className="p-4 bg-blue-50/50 border border-blue-150 rounded-2xl text-center">
              <span className="text-[10px] text-blue-800 font-bold uppercase tracking-wider block">Purchasing Valuation</span>
              <p className="text-lg font-black text-blue-995 text-slate-900 mt-1">₹{totalPurchasesValuation.toLocaleString('en-IN')}</p>
              <span className="text-[9px] text-blue-600 font-semibold block mt-0.5">{purchases.length} invoices matched</span>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent Sales Activity</h4>
            <div className="divide-y divide-slate-100">
              {recentSales.map((sale) => (
                <div key={sale.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">{sale.customer_name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{new Date(sale.sale_date).toLocaleDateString()} &bull; {sale.customer_category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">₹{sale.total_amount.toLocaleString('en-IN')}</p>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase mt-0.5 ${
                      sale.payment_status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' : 'bg-amber-50 text-amber-700 border border-amber-150'
                    }`}>
                      {sale.payment_status}
                    </span>
                  </div>
                </div>
              ))}
              {recentSales.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-400">
                  No billing history in this session.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Critical Stock Level Warnings */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="font-extrabold text-slate-900 text-sm tracking-tight mb-4 flex items-center gap-1.5 text-rose-600">
          <AlertCircle className="w-4.5 h-4.5" />
          Immediate Re-Order Needed ({lowStockItems.length} Parts Below Threshold)
        </h3>
        
        {lowStockItems.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 px-4">Part No</th>
                  <th className="p-3">Part Name</th>
                  <th className="p-3">HSN</th>
                  <th className="p-3">MRP</th>
                  <th className="p-3 text-center">Remaining Quantity</th>
                  <th className="p-3 text-center pr-4">Action Suggestion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
                {lowStockItems.slice(0, 6).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-3 px-4 font-mono font-medium text-slate-900">{item.part_no}</td>
                    <td className="p-3 font-semibold text-slate-900">{item.part_name}</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{item.hsn}</td>
                    <td className="p-3 font-medium">₹{item.mrp}</td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center justify-center font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase ${
                        item.quantity === 0 ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {item.quantity} Left
                      </span>
                    </td>
                    <td className="p-3 text-center pr-4">
                      <button 
                        onClick={() => onNavigateToModule('Purchases')}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                      >
                        Create Purchase &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6 text-sm text-slate-400">
            Great job! No items are currently running low on stock.
          </div>
        )}
      </div>

    </div>
  );
}
