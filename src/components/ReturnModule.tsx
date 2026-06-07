import { useState, useMemo, useEffect } from 'react';
import { Brand, User, Sale, SaleItem, ReturnRecord } from '../types';
import { db } from '../dbStore';
import { RefreshCw, Search, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';

interface ReturnModuleProps {
  brand: Brand;
  user: User;
}

export default function ReturnModule({ brand, user }: ReturnModuleProps) {
  const [search, setSearch] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [toastMessageLocal, setToastMessageLocal] = useState<string | null>(null);

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
    return db.subscribe(refreshComponentData);
  }, [brand]);

  const triggerToast = (msg: string) => {
    setToastMessageLocal(msg);
    setTimeout(() => setToastMessageLocal(null), 3000);
  };

  // Compile individual lines of sales to make returns easy
  const saleLinesView = useMemo(() => {
    const lines: {
      id: string;
      sale_id: string;
      customer_name: string;
      part_no: string;
      part_name: string;
      quantity: number;
      mrp: number;
      discount_percentage: number;
      final_amount: number;
      returned_quantity: number;
      sale_date: string;
    }[] = [];

    saleItemsList.forEach(item => {
      const parent = salesList.find(s => s.id === item.sale_id);
      if (parent) {
        lines.push({
          id: item.id,
          sale_id: item.sale_id,
          customer_name: parent.customer_name,
          part_no: item.part_no,
          part_name: item.part_name,
          quantity: item.quantity,
          mrp: item.mrp,
          discount_percentage: item.discount_percentage,
          final_amount: item.final_amount,
          returned_quantity: item.returned_quantity,
          sale_date: parent.sale_date
        });
      }
    });

    return lines;
  }, [salesList, saleItemsList]);

  // Filters for available products we can return
  const filteredLines = useMemo(() => {
    return saleLinesView.filter(line => {
      const matchesSearch = line.part_no.toLowerCase().includes(search.toLowerCase()) || 
                            line.part_name.toLowerCase().includes(search.toLowerCase()) ||
                            line.customer_name.toLowerCase().includes(search.toLowerCase()) ||
                            line.sale_id.toLowerCase().includes(search.toLowerCase());
      
      const hasReturnableStock = line.quantity - line.returned_quantity > 0;
      return matchesSearch && hasReturnableStock;
    });
  }, [saleLinesView, search]);

  const handleReturnAmountOfLine = (lineId: string, item: typeof saleLinesView[0]) => {
    const qtyToReturn = returnQty[lineId] || 0;
    const maxReturnable = item.quantity - item.returned_quantity;

    if (qtyToReturn <= 0) {
      alert("Please enter a valid return quantity greater than 0.");
      return;
    }

    if (qtyToReturn > maxReturnable) {
      alert(`Invalid quantity: Maximum returnable is ${maxReturnable}`);
      return;
    }

    // Proportional calculation
    const unitPrice = item.mrp * (1 - (item.discount_percentage / 100));
    const refundAmount = Number((unitPrice * qtyToReturn).toFixed(2));

    const confirmed = window.confirm(`Return ${qtyToReturn} units of ${item.part_name}? ₹${refundAmount} will be deducted from invoice billing records.`);
    if (!confirmed) return;

    try {
      db.processReturn(
        brand,
        item.sale_id,
        item.id,
        qtyToReturn,
        refundAmount,
        user
      );

      // Clean local field state and refresh DB readings
      setReturnQty(prev => {
        const copy = { ...prev };
        delete copy[lineId];
        return copy;
      });

      refreshComponentData();
      triggerToast(`Successfully processed return of ${qtyToReturn} units of Part No ${item.part_no}. Refunded: ₹${refundAmount}`);
    } catch (err: any) {
      alert(`Return processing failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">

      {/* Local Toast alerts */}
      {toastMessageLocal && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-bounce mt-10">
          <CheckCircle className="w-4.5 h-4.5 text-emerald-400" />
          {toastMessageLocal}
        </div>
      )}

      {/* Headline */}
      <div>
        <h2 className="text-xl font-bold text-slate-905 tracking-tight flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-indigo-650" />
          Returns Register &amp; Part Restock Management ({brand})
        </h2>
        <p className="text-sm text-slate-500">
          Unpack product returns, recalculate customer ledger indices, restock active supplies, and log refunds.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Column 1 & 2: Search Bills & Trigger Return Actions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
              Step 1: Search Original sold item line
            </h3>
            
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Part No., Part Name, Customer, or Sale ID..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-700"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="min-w-full divide-y divide-slate-200 text-left font-semibold">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[9px]">
                  <tr>
                    <th className="p-3">Reference (Bill/Customer)</th>
                    <th className="p-3">Part Details</th>
                    <th className="p-3 text-center">Sold (Paid)</th>
                    <th className="p-3 text-center">Returned</th>
                    <th className="p-3 text-center w-28">Qty to Return</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {filteredLines.map((line) => {
                    const maxReturnable = line.quantity - line.returned_quantity;
                    const lineReturnQty = returnQty[line.id] || '';
                    
                    return (
                      <tr key={line.id} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <p className="font-mono font-bold text-slate-900 leading-tight">{line.sale_id}</p>
                          <p className="text-[10px] text-slate-400 font-normal leading-tight">{line.customer_name}</p>
                        </td>
                        <td className="p-3 max-w-[150px]">
                          <p className="font-mono font-bold text-slate-900 leading-tight">{line.part_no}</p>
                          <p className="text-[10px] text-slate-400 font-normal leading-tight">{line.part_name}</p>
                        </td>
                        <td className="p-3 text-center">
                          <p className="font-bold">{line.quantity} pcs</p>
                          <p className="text-[10px] text-slate-400 font-normal">₹{line.mrp} (-{line.discount_percentage}%)</p>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] ${
                            line.returned_quantity > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'
                          }`}>
                            {line.returned_quantity} returned
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max={maxReturnable}
                              placeholder={`${maxReturnable}`}
                              className="w-14 p-1 rounded font-bold border border-slate-200 text-center"
                              value={lineReturnQty}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setReturnQty(prev => ({
                                  ...prev,
                                  [line.id]: Math.min(maxReturnable, Math.max(1, val))
                                }));
                              }}
                            />
                            <span className="text-[10px] text-slate-400 font-normal">/ {maxReturnable}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleReturnAmountOfLine(line.id, line)}
                            className="bg-orange-50 hover:bg-orange-600 hover:text-white border border-orange-200 text-orange-700 px-2 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition active:scale-95"
                          >
                            Return
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-normal">
                        No returnable customer items matched active queries.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>

        {/* Column 3: Return History logs right hand side */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center justify-between">
              <span>Return History (Logs)</span>
              <span className="bg-indigo-50 text-indigo-750 px-2 py-0.5 rounded-full text-[10px]">
                {returnsList.length} total
              </span>
            </h3>

            <div className="divide-y divide-slate-150 max-h-[60vh] overflow-y-auto pr-1 space-y-3">
              {returnsList.map((ret) => (
                <div key={ret.id} className="pt-3 text-xs space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="font-mono font-bold text-slate-900">{ret.id}</span>
                    <span className="text-[10px] text-slate-400 font-normal">{new Date(ret.return_date).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Bill ID: </span>
                    <span className="font-semibold text-slate-800">{ret.sale_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-mono font-bold">{ret.part_no}: </span>
                    <span className="text-slate-700 font-medium">{ret.part_name}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      Returned {ret.returned_quantity} units
                    </span>
                    <span className="font-black text-slate-900">₹{ret.refund_amount.toFixed(2)} refunded</span>
                  </div>
                  <div className="text-[10px] text-slate-400 text-right">By staff: {ret.created_by}</div>
                </div>
              ))}
              {returnsList.length === 0 && (
                <div className="text-center py-8 text-slate-400 font-normal">
                  No parts returned in this brand database schema yet.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
