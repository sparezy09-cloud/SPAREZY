import React, { useState, useEffect, useMemo } from 'react';
import { Brand, User, OrderRequest, isOwnerOrAdmin } from '../types';
import { db } from '../dbStore';
import { 
  ClipboardList, Plus, Search, CheckCircle2, XCircle, 
  Clock, AlertTriangle, Truck, Eye, RefreshCw, Filter, 
  ChevronRight, ArrowRight, UserCheck, PackageCheck
} from 'lucide-react';

interface OrderRequestsModuleProps {
  brand: Brand;
  user: User;
}

export default function OrderRequestsModule({ brand, user }: OrderRequestsModuleProps) {
  const [requests, setRequests] = useState<OrderRequest[]>(() => db.getOrderRequests(brand));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('All');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal for new request
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [formPartNo, setFormPartNo] = useState('');
  const [formPartName, setFormPartName] = useState('');
  const [formQuantity, setFormQuantity] = useState(1);
  const [formReason, setFormReason] = useState<'Out of Stock' | 'Customer Demand' | 'Regular Reorder' | 'Emergency'>('Out of Stock');
  const [formUrgency, setFormUrgency] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerPhone, setFormCustomerPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Rejection modal
  const [rejectingRequest, setRejectingRequest] = useState<OrderRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const isOwner = isOwnerOrAdmin(user.role);

  const refreshData = () => {
    setRequests(db.getOrderRequests(brand));
  };

  useEffect(() => {
    refreshData();
    return db.subscribe(refreshData);
  }, [brand]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Pre-fill part name from inventory if user types a known part_no
  const handlePartNoChange = (partNo: string) => {
    setFormPartNo(partNo);
    const existing = db.getInventory(brand).find(
      i => i.part_no.toLowerCase().trim() === partNo.toLowerCase().trim()
    );
    if (existing && !formPartName) {
      setFormPartName(existing.part_name);
    }
  };

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPartNo.trim() || !formPartName.trim()) {
      alert("Please enter both Part Number and Part Name.");
      return;
    }
    if (formQuantity <= 0) {
      alert("Please enter a valid quantity of 1 or more.");
      return;
    }

    try {
      db.createOrderRequest({
        brand,
        part_no: formPartNo.trim().toUpperCase(),
        part_name: formPartName.trim(),
        quantity: formQuantity,
        reason: formReason,
        urgency: formUrgency,
        customer_name: formCustomerName.trim() || undefined,
        customer_phone: formCustomerPhone.trim() || undefined,
        notes: formNotes.trim() || undefined
      }, user);

      triggerToast(`Order request for ${formPartNo.toUpperCase()} (${formQuantity} units) submitted successfully!`);
      setIsNewModalOpen(false);

      // Reset form
      setFormPartNo('');
      setFormPartName('');
      setFormQuantity(1);
      setFormReason('Out of Stock');
      setFormUrgency('Medium');
      setFormCustomerName('');
      setFormCustomerPhone('');
      setFormNotes('');
    } catch (err: any) {
      alert(err.message || "Failed to submit order request");
    }
  };

  const handleStatusChange = (requestId: string, newStatus: OrderRequest['status'], notes?: string) => {
    try {
      db.updateOrderRequestStatus(requestId, newStatus, user, notes);
      triggerToast(`Order status updated to: ${newStatus}`);
      if (rejectingRequest) {
        setRejectingRequest(null);
        setRejectionReason('');
      }
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      if (statusFilter !== 'All' && req.status !== statusFilter) return false;
      if (urgencyFilter !== 'All' && req.urgency !== urgencyFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchesNo = req.part_no.toLowerCase().includes(q);
        const matchesName = req.part_name.toLowerCase().includes(q);
        const matchesCustomer = req.customer_name?.toLowerCase().includes(q);
        const matchesRequester = req.requested_by.toLowerCase().includes(q);
        if (!matchesNo && !matchesName && !matchesCustomer && !matchesRequester) return false;
      }
      return true;
    });
  }, [requests, search, statusFilter, urgencyFilter]);

  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter(r => r.status === 'Pending').length;
    const accepted = requests.filter(r => r.status === 'Accepted' || r.status === 'Ordered with Dealer').length;
    const rejected = requests.filter(r => r.status === 'Rejected').length;
    return { total, pending, accepted, rejected };
  }, [requests]);

  const urgencyColors = {
    'Low': 'bg-slate-100 text-slate-700 border-slate-200',
    'Medium': 'bg-blue-50 text-blue-700 border-blue-200',
    'High': 'bg-amber-50 text-amber-700 border-amber-200',
    'Critical': 'bg-rose-50 text-rose-700 border-rose-200 font-bold animate-pulse'
  };

  const statusColors: Record<OrderRequest['status'], string> = {
    'Pending': 'bg-amber-50 text-amber-800 border-amber-200',
    'Accepted': 'bg-blue-50 text-blue-800 border-blue-200',
    'Ordered': 'bg-purple-50 text-purple-800 border-purple-200',
    'Ordered with Dealer': 'bg-purple-50 text-purple-800 border-purple-200',
    'Received': 'bg-emerald-50 text-emerald-800 border-emerald-200',
    'Rejected': 'bg-rose-50 text-rose-800 border-rose-200'
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl border border-slate-800 flex items-center gap-3 text-xs font-medium animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 tracking-wider uppercase border border-indigo-100">
              {brand} Orders
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
              Role: {user.role}
            </span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight mt-2 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            Stock & Customer Order Requests
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            {isOwner 
              ? "Review parts requested by your managers for out-of-stock items, urgent customer orders, or regular stock reorders."
              : "Submit part order requests to the owner when items are out of stock or requested by customers."}
          </p>
        </div>

        <button
          onClick={() => setIsNewModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          Request New Part Order
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Requests</span>
          <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
          <span className="text-[10px] text-slate-400">All-time brand log</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Pending Approval
          </span>
          <p className="text-2xl font-black text-amber-900 mt-1">{stats.pending}</p>
          <span className="text-[10px] text-amber-700">Awaiting owner review</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-blue-200 bg-blue-50/20 shadow-sm">
          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
            <PackageCheck className="w-3.5 h-3.5" /> Accepted / Ordered
          </span>
          <p className="text-2xl font-black text-blue-900 mt-1">{stats.accepted}</p>
          <span className="text-[10px] text-blue-700">In order pipeline</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
          <p className="text-2xl font-black text-slate-900 mt-1">{stats.rejected}</p>
          <span className="text-[10px] text-slate-400">Not approved</span>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by part number, part name, customer, or requester..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending Only</option>
              <option value="Accepted">Accepted</option>
              <option value="Ordered with Dealer">Ordered with Dealer</option>
              <option value="Received">Received</option>
              <option value="Rejected">Rejected</option>
            </select>

            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">All Urgencies</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5 px-4">Date & Urgency</th>
                <th className="p-3.5">Part Details</th>
                <th className="p-3.5 text-center">Req. Qty</th>
                <th className="p-3.5">Reason & Customer</th>
                <th className="p-3.5">Requested By</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50/70 transition">
                  <td className="p-3.5 px-4 align-top">
                    <p className="font-mono text-[11px] text-slate-900 font-semibold">
                      {new Date(req.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border mt-1.5 ${urgencyColors[req.urgency]}`}>
                      {req.urgency} Urgency
                    </span>
                  </td>

                  <td className="p-3.5 align-top">
                    <p className="font-mono font-bold text-slate-900">{req.part_no}</p>
                    <p className="font-medium text-slate-600 text-[11px] mt-0.5">{req.part_name}</p>
                    {req.notes && (
                      <p className="text-[10px] text-slate-400 italic mt-1 bg-slate-50 p-1.5 rounded border border-slate-150">
                        "{req.notes}"
                      </p>
                    )}
                  </td>

                  <td className="p-3.5 text-center align-top">
                    <span className="inline-flex items-center justify-center font-bold px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-sm border border-indigo-100">
                      {req.quantity}
                    </span>
                  </td>

                  <td className="p-3.5 align-top">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                      {req.reason}
                    </span>
                    {req.customer_name && (
                      <div className="mt-1 text-[11px]">
                        <span className="font-semibold text-slate-800">{req.customer_name}</span>
                        {req.customer_phone && (
                          <span className="text-slate-400 ml-1">({req.customer_phone})</span>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="p-3.5 align-top">
                    <p className="font-semibold text-slate-800 text-[11px]">{req.requested_by}</p>
                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
                      {req.requested_by_role}
                    </span>
                    {req.reviewed_by && (
                      <p className="text-[9px] text-emerald-600 mt-1">
                        Reviewed by {req.reviewed_by}
                      </p>
                    )}
                  </td>

                  <td className="p-3.5 text-center align-top">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusColors[req.status]}`}>
                      {req.status}
                    </span>
                  </td>

                  <td className="p-3.5 text-right pr-4 align-top">
                    {isOwner ? (
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {req.status === 'Pending' && (
                          <>
                            <button
                              onClick={() => handleStatusChange(req.id, 'Accepted')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                              title="Accept request"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Accept
                            </button>
                            <button
                              onClick={() => setRejectingRequest(req)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                              title="Reject request"
                            >
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          </>
                        )}
                        {req.status === 'Accepted' && (
                          <button
                            onClick={() => handleStatusChange(req.id, 'Ordered with Dealer')}
                            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                          >
                            <Truck className="w-3 h-3" /> Order Placed
                          </button>
                        )}
                        {req.status === 'Ordered with Dealer' && (
                          <button
                            onClick={() => handleStatusChange(req.id, 'Received')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                          >
                            <PackageCheck className="w-3 h-3" /> Mark Received
                          </button>
                        )}
                        {(req.status === 'Received' || req.status === 'Rejected') && (
                          <span className="text-[10px] text-slate-400 italic">Archived</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-right">
                        {req.status === 'Pending' ? (
                          <span className="text-[10px] text-amber-600 font-semibold flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3" /> Awaiting Owner
                          </span>
                        ) : req.status === 'Accepted' || req.status === 'Ordered with Dealer' ? (
                          <span className="text-[10px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Approved by Owner
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">{req.status}</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No order requests found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Order Request Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Submit Part Order Request ({brand})
              </h3>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Part Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 58101-1RA00"
                    value={formPartNo}
                    onChange={(e) => handlePartNoChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Quantity Needed *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Part Description / Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Front Brake Pad Kit"
                  value={formPartName}
                  onChange={(e) => setFormPartName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Order Reason</label>
                  <select
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="Out of Stock">Out of Stock</option>
                    <option value="Customer Demand">Customer Demand</option>
                    <option value="Regular Reorder">Regular Reorder</option>
                    <option value="Emergency">Emergency</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Urgency Level</label>
                  <select
                    value={formUrgency}
                    onChange={(e) => setFormUrgency(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="Low">Low (Stock Replenish)</option>
                    <option value="Medium">Medium (Regular)</option>
                    <option value="High">High (Customer Waiting)</option>
                    <option value="Critical">Critical (Vehicle Grounded)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-700 text-[11px] block">Customer Details (Optional)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={formCustomerName}
                    onChange={(e) => setFormCustomerName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg outline-none text-xs bg-white"
                  />
                  <input
                    type="tel"
                    placeholder="Customer Phone"
                    value={formCustomerPhone}
                    onChange={(e) => setFormCustomerPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg outline-none text-xs bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Special Notes for Owner (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Mistri needs it by Friday morning for a major engine overhaul."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition cursor-pointer shadow-sm"
                >
                  Submit Order Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-black text-rose-600 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Reject Order Request
            </h3>
            <p className="text-xs text-slate-600">
              Rejecting request for <span className="font-bold font-mono">{rejectingRequest.part_no}</span> ({rejectingRequest.quantity} units) requested by {rejectingRequest.requested_by}.
            </p>

            <div className="space-y-1 text-xs">
              <label className="font-bold text-slate-700">Rejection Note</label>
              <textarea
                rows={3}
                placeholder="e.g. Discontinued part, or dealer has no stock currently."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectingRequest(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusChange(rejectingRequest.id, 'Rejected', rejectionReason)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
