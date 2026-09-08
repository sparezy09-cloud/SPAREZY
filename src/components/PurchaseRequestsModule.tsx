import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../dbStore';
import { User, PurchaseRequest, Brand, PurchaseRequestStatus } from '../types';
import { 
  CheckCircle, Clock, XCircle, Search, PlusCircle, Check, X, ShoppingCart, MessageSquare, AlertCircle
} from 'lucide-react';

interface PurchaseRequestsModuleProps {
  brand: Brand;
  user: User;
  onNavigateToPurchases?: () => void;
}

export default function PurchaseRequestsModule({ brand, user, onNavigateToPurchases }: PurchaseRequestsModuleProps) {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | PurchaseRequestStatus>('All');
  
  // Create Request State
  const [isCreating, setIsCreating] = useState(false);
  const [partNo, setPartNo] = useState('');
  const [partName, setPartName] = useState('');
  const [currentStock, setCurrentStock] = useState(0);
  const [requestedQty, setRequestedQty] = useState(1);
  const [note, setNote] = useState('');
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Conversion Modal for Owner
  const [conversionRequest, setConversionRequest] = useState<PurchaseRequest | null>(null);
  const [dealerName, setDealerName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [discountPercent, setDiscountPercent] = useState(brand === 'Hyundai' ? 12 : 19.36);
  const [convertError, setConvertError] = useState('');

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const data = await db.fetchPurchaseRequests(brand);
      setRequests(data);
    } catch (err) {
      console.error("Failed to load purchase requests:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    return db.subscribe(loadRequests);
  }, [brand]);

  // Handle inventory check during creation
  useEffect(() => {
    if (partNo.trim()) {
      const cleanPart = partNo.trim().toUpperCase();
      const match = db.getInventory(brand, true).find(i => i.part_no.toLowerCase() === cleanPart.toLowerCase());
      if (match) {
        setPartName(match.part_name);
        setCurrentStock(match.quantity);
      } else {
        setPartName('');
        setCurrentStock(0);
      }
    }
  }, [partNo, brand]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');

    if (!partNo.trim() || !partName.trim() || requestedQty <= 0) {
      setCreateError("Please complete all fields correctly.");
      return;
    }

    const otherBrand = brand === 'Hyundai' ? 'Mahindra' : 'Hyundai';
    const existsInOtherBrand = db.getInventory(otherBrand, true).some(inv => inv.part_no.toLowerCase() === partNo.trim().toLowerCase());
    if (existsInOtherBrand) {
      setCreateError(`Error: Part number ${partNo.trim().toUpperCase()} belongs to the other brand (${otherBrand})! Matching or requesting it under ${brand} is disallowed.`);
      return;
    }

    try {
      await db.createPurchaseRequest(
        brand,
        partNo.trim().toUpperCase(),
        partName.trim(),
        currentStock,
        requestedQty,
        note.trim() || null,
        user
      );
      setCreateSuccess("Purchase request submitted successfully!");
      setPartNo('');
      setPartName('');
      setCurrentStock(0);
      setRequestedQty(1);
      setNote('');
      setTimeout(() => {
        setIsCreating(false);
        setCreateSuccess('');
      }, 1500);
    } catch (err: any) {
      setCreateError(err.message || "Failed to submit request.");
    }
  };

  const handleStatusChange = async (requestId: string, status: PurchaseRequestStatus) => {
    if (confirm(`Are you sure you want to change this request status to ${status}?`)) {
      try {
        await db.updatePurchaseRequestStatus(brand, requestId, status, user);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleOpenConversion = (req: PurchaseRequest) => {
    setConversionRequest(req);
    setDealerName('');
    setInvoiceNo(`REQ-AUTO-${Math.floor(1000 + Math.random() * 9000)}`);
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setConvertError('');
  };

  const handleConvertPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setConvertError('');
    if (!conversionRequest) return;

    if (!dealerName.trim() || !invoiceNo.trim() || !invoiceDate) {
      setConvertError("All fields are required to record a purchase.");
      return;
    }

    try {
      // Calculate subtotal from mrp * qty. We need to fetch the mrp of the part from inventory
      const invPart = db.getInventory(brand, true).find(i => i.part_no.toLowerCase() === conversionRequest.part_no.toLowerCase());
      const mrpVal = invPart ? invPart.mrp : 0;

      // 1. Mark request as completed in DB
      await db.updatePurchaseRequestStatus(brand, conversionRequest.id, 'Completed', user);

      // 2. Create actual purchase record
      await db.createPurchase(
        brand,
        dealerName.trim(),
        invoiceNo.trim(),
        invoiceDate,
        mrpVal * conversionRequest.requested_quantity,
        discountPercent,
        [{
          part_no: conversionRequest.part_no,
          part_name: conversionRequest.part_name,
          quantity: conversionRequest.requested_quantity,
          mrp: mrpVal,
          hsn: invPart?.hsn || "87089900"
        }],
        'manual',
        user
      );

      setConversionRequest(null);
      if (onNavigateToPurchases) {
        onNavigateToPurchases();
      }
    } catch (err: any) {
      setConvertError(err.message || "Failed to record purchase.");
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchesSearch = r.part_no.toLowerCase().includes(search.toLowerCase()) || 
                            r.part_name.toLowerCase().includes(search.toLowerCase()) ||
                            r.requester_name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [requests, search, statusFilter]);

  const renderStatusBadge = (status: PurchaseRequestStatus) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3 h-3" />
            Approved
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'Completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-750 border border-slate-300">
            <Check className="w-3 h-3" />
            Completed
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action header card */}
      <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-2xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">Purchase Requests Dashboard</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Manage, review, and request parts procurement for {brand}.</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 transition text-xs shadow-sm cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          Create New Request
        </button>
      </div>

      {/* Filter panel */}
      <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by part number, description, or requester..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {(['All', 'Pending', 'Approved', 'Rejected', 'Completed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                statusFilter === tab 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' 
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider">
              <tr>
                <th className="p-4">Part Details</th>
                <th className="p-4">Current Stock</th>
                <th className="p-4">Requested Qty</th>
                <th className="p-4">Requester</th>
                <th className="p-4">Notes</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRequests.map(req => (
                <tr key={req.id} className="hover:bg-slate-50/50">
                  <td className="p-4">
                    <div className="font-bold text-slate-900 font-mono text-[11px]">{req.part_no}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{req.part_name}</div>
                  </td>
                  <td className="p-4 font-mono">{req.current_stock} pcs</td>
                  <td className="p-4 font-mono font-bold text-slate-950">{req.requested_quantity} pcs</td>
                  <td className="p-4">
                    <p className="font-medium">{req.requester_name}</p>
                    <p className="text-[9px] text-slate-400">{req.requester_email}</p>
                  </td>
                  <td className="p-4 text-[10px] text-slate-500 max-w-xs truncate" title={req.note || ''}>
                    {req.note || <span className="italic text-slate-350">No details</span>}
                  </td>
                  <td className="p-4">{renderStatusBadge(req.status)}</td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end items-center">
                      {/* Owner Operations */}
                      {user.role === 'Owner' && req.status === 'Pending' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(req.id, 'Approved')}
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition"
                            title="Approve Request"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleStatusChange(req.id, 'Rejected')}
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition"
                            title="Reject Request"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {/* Record purchase option if approved */}
                      {user.role === 'Owner' && req.status === 'Approved' && (
                        <button
                          onClick={() => handleOpenConversion(req)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 transition text-[10px]"
                        >
                          <ShoppingCart className="w-3 h-3" />
                          Convert to Purchase
                        </button>
                      )}
                      
                      {req.status === 'Completed' && (
                        <span className="text-[10px] italic text-slate-400 font-normal">Fulfilled successfully</span>
                      )}

                      {req.status === 'Rejected' && (
                        <span className="text-[10px] italic text-rose-400 font-normal">Rejected request</span>
                      )}

                      {user.role === 'Manager' && req.status === 'Pending' && (
                        <span className="text-[10px] italic text-amber-500 font-normal">Awaiting Owner Approval</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 italic">
                    {isLoading ? "Synchronizing purchase requests..." : "No purchase requests match the filter criteria."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE DIALOG MODAL */}
      {isCreating && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Request Stock Procurement</h3>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-[11px] font-bold flex items-start gap-1.5 border border-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <span>{createError}</span>
              </div>
            )}

            {createSuccess && (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-[11px] font-bold border border-emerald-200">
                {createSuccess}
              </div>
            )}

            <form onSubmit={handleCreateRequest} className="space-y-3">
              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Part Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 58101-1RA00"
                  value={partNo}
                  onChange={(e) => setPartNo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono uppercase focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Part Name / Description</label>
                <input
                  type="text"
                  required
                  placeholder="Autodetected description"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Current Stock</label>
                  <input
                    type="text"
                    disabled
                    value={`${currentStock} pcs`}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 font-mono text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Requested Quantity</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={requestedQty}
                    onChange={(e) => setRequestedQty(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">procurement Note</label>
                <textarea
                  placeholder="Provide details about urgency or dealer suggestions..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONVERT TO PURCHASE DIALOG MODAL (OWNER ONLY) */}
      {conversionRequest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Convert Request to Purchase Invoice</h3>
              <button onClick={() => setConversionRequest(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-1 text-xs">
              <p className="flex justify-between">
                <span className="text-slate-500">Part No:</span>
                <span className="font-bold font-mono text-slate-800">{conversionRequest.part_no}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-slate-500">Requested Qty:</span>
                <span className="font-bold text-slate-800">{conversionRequest.requested_quantity} pcs</span>
              </p>
              <p className="flex justify-between">
                <span className="text-slate-500">Requested By:</span>
                <span className="font-bold text-slate-800">{conversionRequest.requester_name}</span>
              </p>
            </div>

            {convertError && (
              <div className="p-3 bg-rose-50 text-rose-750 rounded-xl text-[11px] font-bold border border-rose-200">
                {convertError}
              </div>
            )}

            <form onSubmit={handleConvertPurchase} className="space-y-3">
              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Dealer / Supplier Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Landmark Spares Supplier"
                  value={dealerName}
                  onChange={(e) => setDealerName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Invoice Number</label>
                  <input
                    type="text"
                    required
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Invoice Date</label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Dealer Discount (%)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConversionRequest(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  Confirm Purchase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
