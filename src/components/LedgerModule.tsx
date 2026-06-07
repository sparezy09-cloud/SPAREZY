import { useState, useMemo, useEffect } from 'react';
import { Brand, User, Customer, Sale, ReturnRecord, Purchase, PurchaseItem } from '../types';
import { db } from '../dbStore';
import { 
  Users, Calendar, Download, Printer, ArrowRight, 
  HelpCircle, CheckCircle, FileSpreadsheet, Building2, Eye, X 
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

  // Selected details
  const [selectedDealerInvoices, setSelectedDealerInvoices] = useState<Purchase[]>([]);
  const [activeDealerName, setActiveDealerName] = useState<string | null>(null);

  // States
  const [customersList, setCustomersList] = useState<Customer[]>(() => db.getCustomers());
  const [salesList, setSalesList] = useState<Sale[]>(() => db.getSales(brand));
  const [returnsList, setReturnsList] = useState<ReturnRecord[]>(() => db.getReturns(brand));
  const [purchasesList, setPurchasesList] = useState<Purchase[]>(() => db.getPurchases(brand));

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
      const totalPending = clientSales.reduce((acc, s) => acc + s.pending_amount, 0);
      const totalReturnedAmount = clientReturns.reduce((acc, r) => acc + r.refund_amount, 0);

      // Final balance due: (Total Pending left)
      const finalBalance = Math.max(0, totalPending);

      return {
        id: cust.id,
        name: cust.customer_name,
        category: cust.customer_category,
        salesCount: clientSales.length,
        totalSalesBilled,
        totalPaid,
        totalPending,
        totalReturnedAmount,
        finalBalance
      };
    });
  }, [customersList, salesList, returnsList, startDate, endDate]);


  // --- DEALER RECORDS CALCULATIONS ---
  const dealerLedgers = useMemo(() => {
    // Generate aggregate metrics group by dealer_name
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


  // --- EXPORTERS & PRINTERS SIMULATION ---

  // EXPORT CUSTOMER LEDGER TO EXCEL (CSV)
  const handleExportCustomerCSV = () => {
    let rowContent = "Customer Name,Category,Sales Count,Total Sales (INR),Total Paid (INR),Returns Refund (INR),Pending Balance (INR)\n";
    customerLedgers.forEach(row => {
      rowContent += `"${row.name}","${row.category}",${row.salesCount},${row.totalSalesBilled.toFixed(2)},${row.totalPaid.toFixed(2)},${row.totalReturnedAmount.toFixed(2)},${row.finalBalance.toFixed(2)}\n`;
    });

    const blob = new Blob([rowContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Sparezy_${brand}_Customer_Ledger_Export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // EXPORT CUSTOMER LEDGER TO PDF (Trigger Print Layout)
  const handlePrintLedgerPdf = () => {
    const backupHtml = document.body.innerHTML;
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

  // EXPORT DEALER RECORD TO EXCEL (CSV)
  const handleExportDealerCSV = (record: typeof dealerLedgers[0]) => {
    let rowContent = `Dealer Ledger for: ${record.dealer_name}\n`;
    rowContent += "Invoice No,Invoice Date,Pre-Discount Amount (INR),Discount (INR),Total Paid Amount (INR)\n";
    
    record.invoicesList.forEach(inv => {
      rowContent += `"${inv.invoice_no}","${new Date(inv.invoice_date).toLocaleDateString()}",${inv.subtotal.toFixed(2)},${inv.discount_amount.toFixed(2)},${inv.total_after_discount.toFixed(2)}\n`;
    });

    rowContent += `\nSUMMARY,Total Purchases,Total Saved Discount\n`;
    rowContent += `,₹${record.totalPurchasedValuation.toFixed(2)},₹${record.totalDiscountAmount.toFixed(2)}\n`;

    const blob = new Blob([rowContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Ledger_${record.dealer_name.replace(/\s+/g, '_')}_Record.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">

      {/* Head controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-905 flex items-center gap-2 tracking-tight">
            <Users className="w-5 h-5 text-indigo-650" />
            MIS Customer Ledger &amp; Dealer Invoices ({brand})
          </h2>
          <p className="text-sm text-slate-500">
            Export transaction details, print accounting ledger pages, and verify overall credit balances.
          </p>
        </div>

        {/* Change Ledger Category */}
        <div className="flex bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => {
              setLedgerType('customer');
              setSelectedDealerInvoices([]);
              refreshComponentData();
            }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
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

      {/* Date filters control card */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-end gap-3 text-xs font-semibold text-slate-600">
        <div className="space-y-1">
          <label className="block text-slate-400 font-bold uppercase text-[9px]">Filter start date</label>
          <input
            type="date"
            className="p-2 border border-slate-200 rounded-xl"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-slate-400 font-bold uppercase text-[9px]">Filter end date</label>
          <input
            type="date"
            className="p-2 border border-slate-200 rounded-xl"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        
        {(startDate || endDate) && (
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
            }}
            className="bg-slate-100 text-slate-600 py-2.5 px-4 rounded-xl cursor-pointer hover:bg-slate-200"
          >
            Clear Filters
          </button>
        )}
      </div>

      {ledgerType === 'customer' ? (
        <div className="space-y-4">
          
          {/* Action utility bar for exports */}
          <div className="flex gap-2 justify-end text-xs font-bold">
            <button
              onClick={handleExportCustomerCSV}
              className="bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Download Excel (CSV)
            </button>
            <button
              onClick={handlePrintLedgerPdf}
              className="bg-white border border-slate-200 hover:border-indigo-400 text-indigo-700 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Print Balances Sheet PDF
            </button>
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
                    <th className="p-3">Customer Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-center">Invoices Billed</th>
                    <th className="p-3 text-right">Aggregate Sales</th>
                    <th className="p-3 text-right">Cleared payments</th>
                    <th className="p-3 text-right">Returns refund</th>
                    <th className="p-3 text-right">Outstanding balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-705">
                  {customerLedgers.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900">{row.name}</td>
                      <td className="p-3">{row.category}</td>
                      <td className="p-3 text-center font-mono">{row.salesCount} bills</td>
                      <td className="p-3 text-right">₹{row.totalSalesBilled.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-600">₹{row.totalPaid.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-slate-500">₹{row.totalReturnedAmount.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right">
                        <span className={`inline-flex px-2 py-0.5 rounded font-bold ${
                          row.finalBalance > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          ₹{row.finalBalance.toLocaleString('en-IN')} Due
                        </span>
                      </td>
                    </tr>
                  ))}
                  {customerLedgers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400 font-normal">
                        No customer logs stored in the portal database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      ) : (
        /* DEALER LEDGER VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden lg:col-span-2">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-extrabold text-xs uppercase tracking-wide">
              Dealer purchasing metrics Aggregation
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
                  {dealerLedgers.map((row) => (
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
                        <button
                          onClick={() => handleExportDealerCSV(row)}
                          className="p-1 px-1.5 hover:bg-emerald-50 text-emerald-700 rounded-lg text-[10px] border border-transparent"
                        >
                          Export
                        </button>
                      </td>
                    </tr>
                  ))}
                  {dealerLedgers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400 font-normal">
                        No purchases/dealer logs found under active query states.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
                    className="p-1 hover:bg-slate-100 rounded text-slate-450 cursor-pointer"
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

                <button
                  onClick={() => {
                    // Export this group specifically
                    const rec = dealerLedgers.find(dl => dl.dealer_name === activeDealerName);
                    if (rec) handleExportDealerCSV(rec);
                  }}
                  className="w-full bg-slate-950 hover:bg-black text-white py-2.5 rounded-xl font-bold text-center mt-2 cursor-pointer flex items-center justify-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Export All Invoices list
                </button>

              </div>
            ) : (
              <div className="border border-dashed border-slate-200 p-8 rounded-2xl text-slate-400 text-center text-xs font-normal">
                Click "View Invoices" next to any dealer distributor to render associated invoices and items here.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
