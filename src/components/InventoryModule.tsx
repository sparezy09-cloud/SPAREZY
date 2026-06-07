import React, { useState, useMemo } from 'react';
import { Brand, User, InventoryItem } from '../types';
import { db } from '../dbStore';
import { 
  Search, EyeOff, Archive, CheckCircle2, Pencil, 
  Trash2, Plus, ArrowLeft, ArrowRight, X, Layers
} from 'lucide-react';

interface InventoryModuleProps {
  brand: Brand;
  user: User;
}

export default function InventoryModule({ brand, user }: InventoryModuleProps) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Selected state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<'current_page' | 'all_filtered'>('current_page');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState(0);
  
  // Modals
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form Fields for Manual Create/Edit
  const [formPartNo, setFormPartNo] = useState('');
  const [formPartName, setFormPartName] = useState('');
  const [formHsn, setFormHsn] = useState('');
  const [formMrp, setFormMrp] = useState(0);
  const [formQuantity, setFormQuantity] = useState(0);

  // Fetch Inventory (reactive to changes)
  const [showArchived, setShowArchived] = useState(false);
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>(() => db.getInventory(brand, false));

  const refreshList = () => {
    setInventoryList(db.getInventory(brand, showArchived));
  };

  React.useEffect(() => {
    refreshList();
    return db.subscribe(refreshList);
  }, [brand, showArchived]);

  // Clean selections whenever filters/search text updates
  React.useEffect(() => {
    setSelectedIds([]);
    setSelectionMode('current_page');
    setBulkError(null);
  }, [search, brand]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Filtrations
  const filteredList = useMemo(() => {
    return inventoryList.filter(item => {
      const matchesSearch = item.part_no.toLowerCase().includes(search.toLowerCase()) || 
                            item.part_name.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [inventoryList, search]);

  // 2. Pagination Math
  const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;
  const paginatedList = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredList, currentPage]);

  const currentIdsOnPage = useMemo(() => {
    return paginatedList.map(item => item.id);
  }, [paginatedList]);

  // 3. Selection Handlers
  const handleSelectPageCheckboxChange = (checked: boolean) => {
    setSelectionMode('current_page');
    if (checked) {
      // Add all ids of the current page
      setSelectedIds(prev => {
        const union = new Set([...prev, ...currentIdsOnPage]);
        return Array.from(union);
      });
    } else {
      // Remove all ids of the current page
      setSelectedIds(prev => prev.filter(id => !currentIdsOnPage.includes(id)));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectionMode('all_filtered');
    setSelectedIds([]); // Clear individual arrays to save heap space on large counts
    triggerToast(`Selected all ${filteredList.length} filtered parts in high-capacity bulk mode.`);
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectionMode('current_page');
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  const handleBulkArchive = async (archive: boolean) => {
    setBulkError(null);
    setBulkProgress(0);
    if (selectionMode === 'all_filtered') {
      setIsBulkProcessing(true);
      try {
        // Supreme high-capacity: Call Supabase database function directly in batched dynamic execution
        const affected = await db.archivePartsFiltered(brand, search, user, (count) => {
          setBulkProgress(count);
        });
        setSelectionMode('current_page');
        setSelectedIds([]);
        refreshList();
        triggerToast(`Archived ${affected.toLocaleString()} parts successfully.`);
      } catch (err: any) {
        console.error("RPC Error in bulk archive:", err);
        setBulkError(err?.message || "Internal database connection failed during archive operation.");
      } finally {
        setIsBulkProcessing(false);
        setBulkProgress(0);
      }
    } else {
      if (selectedIds.length === 0) return;
      setIsBulkProcessing(true);
      try {
        // Standard user selection: chunk updates of size 200 for safe processing
        await db.archiveParts(brand, selectedIds, archive, user);
        setSelectedIds([]);
        refreshList();
        triggerToast(`${archive ? 'Archived' : 'Unarchived'} selected parts successfully.`);
      } catch (err: any) {
        console.error("Error archiving selected items:", err);
        setBulkError(err?.message || "An error occurred while updating the selected parts.");
      } finally {
        setIsBulkProcessing(false);
        setBulkProgress(0);
      }
    }
  };

  // Edit / Add Actions
  const handleOpenEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormPartNo(item.part_no);
    setFormPartName(item.part_name);
    setFormHsn(item.hsn);
    setFormMrp(item.mrp);
    setFormQuantity(item.quantity);
  };

  const handleOpenCreate = () => {
    setFormPartNo('');
    setFormPartName('');
    setFormHsn('');
    setFormMrp(0);
    setFormQuantity(0);
    setIsNewModalOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPartNo || !formPartName) {
      alert("Part Number and Name are required.");
      return;
    }
    
    db.addOrUpdateInventoryPart(brand, {
      part_no: formPartNo,
      part_name: formPartName,
      hsn: formHsn,
      mrp: Number(formMrp),
      quantity: Number(formQuantity),
      is_active: editingItem ? editingItem.is_active : true
    }, user);

    setEditingItem(null);
    refreshList();
    triggerToast(`Part ${formPartNo} updated successfully.`);
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPartNo || !formPartName) {
      alert("Part Number and Name are required.");
      return;
    }

    // Check duplicate
    if (inventoryList.some(item => item.part_no.toLowerCase() === formPartNo.toLowerCase())) {
      alert("A part with this Part Number already exists.");
      return;
    }

    db.addOrUpdateInventoryPart(brand, {
      part_no: formPartNo.trim().toUpperCase(),
      part_name: formPartName,
      hsn: formHsn,
      mrp: Number(formMrp),
      quantity: Number(formQuantity)
    }, user);

    setIsNewModalOpen(false);
    refreshList();
    triggerToast(`Created part ${formPartNo.toUpperCase()} successfully.`);
  };

  const pageChecked = selectionMode === 'all_filtered' || (currentIdsOnPage.length > 0 && currentIdsOnPage.every(id => selectedIds.includes(id)));

  return (
    <div className="space-y-6">
      
      {/* Toast Notifications */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-bounce">
          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Inventory Tracking &mdash; {brand} Schema
          </h2>
          <p className="text-sm text-slate-500">
            Audit spare parts stock counts, HSN codes, market prices, and active state listings.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 self-start shadow-md hover:shadow-lg transition"
        >
          <Plus className="w-4 h-4" />
          Create New Part
        </button>
      </div>

      {/* Filter and Search Bar Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search inventory by Part No. or Part Name..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Active / Archived Toggle */}
          <div className="flex items-center gap-2">
            <button
              id="toggle-archive-button"
              onClick={() => {
                setShowArchived(prev => !prev);
                setCurrentPage(1);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shadow-sm min-w-[155px] justify-center cursor-pointer ${
                showArchived 
                  ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' 
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-150'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              {showArchived ? "Showing: All Parts" : "Showing: Active Only"}
            </button>
          </div>
        </div>

        {/* Selected Items Utility Bar */}
        {(selectedIds.length > 0 || selectionMode === 'all_filtered') && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 relative overflow-hidden transition-all">
            {isBulkProcessing && (
              <div className="absolute inset-0 bg-slate-50/95 flex flex-col md:flex-row items-center justify-center gap-2.5 font-bold text-indigo-700 animate-pulse z-10 text-xs text-center">
                <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                <span>
                  {bulkProgress > 0 
                    ? `Archived ${bulkProgress.toLocaleString()} parts so far...`
                    : "Processing high-capacity database request... Please wait."}
                </span>
              </div>
            )}
            
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium">
              <span className="text-slate-700 font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                {selectionMode === 'all_filtered' 
                  ? `All ${filteredList.length.toLocaleString()} filtered parts are selected in high-capacity bulk mode`
                  : `${selectedIds.length.toLocaleString()} parts selected on current filters`
                }
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {selectionMode !== 'all_filtered' && (
                  <>
                    <button
                      onClick={handleSelectAllFiltered}
                      disabled={isBulkProcessing}
                      className="text-indigo-600 hover:text-indigo-800 hover:underline px-2 py-1 cursor-pointer font-semibold disabled:opacity-50"
                    >
                      Select All {filteredList.length.toLocaleString()} Filtered Parts
                    </button>
                    <span className="text-slate-300">|</span>
                  </>
                )}
                
                {selectionMode === 'all_filtered' ? (
                  <button
                    onClick={() => handleBulkArchive(true)}
                    disabled={isBulkProcessing}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl flex items-center gap-1.5 transition text-xs font-bold cursor-pointer shadow-sm hover:shadow active:scale-95 disabled:opacity-50"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archive All {filteredList.length.toLocaleString()} Filtered Parts
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleBulkArchive(true)}
                      disabled={isBulkProcessing}
                      className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Archive Selected
                    </button>
                    <button
                      onClick={() => handleBulkArchive(false)}
                      disabled={isBulkProcessing}
                      className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Unarchive Selected
                    </button>
                  </>
                )}
                <span className="text-slate-300">|</span>
                <button
                  onClick={() => {
                    setSelectedIds([]);
                    setSelectionMode('current_page');
                    setBulkError(null);
                  }}
                  disabled={isBulkProcessing}
                  className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {bulkError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-xl text-xs flex items-start gap-2 animate-fade-in font-medium">
                <span className="font-extrabold text-[#b91c1c]">Database Warning:</span>
                <span className="flex-1">{bulkError}</span>
                <button 
                  onClick={() => setBulkError(null)}
                  className="text-red-500 hover:text-red-700 hover:underline text-[10px] uppercase font-bold"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Parts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-indigo-600 h-4 w-4 focus:ring-0 cursor-pointer"
                    checked={pageChecked}
                    onChange={(e) => handleSelectPageCheckboxChange(e.target.checked)}
                  />
                </th>
                <th className="p-4">Part No</th>
                <th className="p-4">Part Name</th>
                <th className="p-4">Quantity in Stock</th>
                <th className="p-4">HSN Code</th>
                <th className="p-4">MRP (INR)</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {paginatedList.map((item) => (
                <tr 
                  key={item.id} 
                  className={`hover:bg-slate-50/50 transition ${!item.is_active ? 'bg-slate-50/30' : ''}`}
                >
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-600 h-4 w-4 focus:ring-0 cursor-pointer"
                      checked={selectionMode === 'all_filtered' || selectedIds.includes(item.id)}
                      onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                    />
                  </td>
                  <td className="p-4 font-mono font-bold text-slate-900">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{item.part_no}</span>
                      {item.is_active === false && (
                        <span className="px-1.5 py-0.5 text-[8px] bg-amber-50 text-amber-700 rounded border border-amber-200/60 font-sans tracking-wide uppercase font-black">
                          Archived
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 font-medium">{item.part_name}</td>
                  <td className="p-4 font-semibold">
                    <span className={item.quantity <= 3 ? 'text-red-600 font-bold' : ''}>
                      {item.quantity.toLocaleString()} units
                    </span>
                  </td>
                  <td className="p-4 text-slate-400 font-mono">{item.hsn || '-'}</td>
                  <td className="p-4 font-bold text-slate-800">₹{item.mrp.toLocaleString('en-IN')}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="p-1 px-2 hover:bg-indigo-50 rounded text-indigo-600 font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filteredList.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    No results matched your search configurations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Console */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3.5 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>
            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredList.length)} of {filteredList.length} parts
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 border border-slate-200 rounded-xl hover:bg-white bg-slate-50 text-slate-600 disabled:opacity-40 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center px-3 border border-slate-200 rounded-xl bg-white text-slate-800">
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 border border-slate-200 rounded-xl hover:bg-white bg-slate-50 text-slate-600 disabled:opacity-40 transition cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Manual Part Create / Edit Modal Popup */}
      {(editingItem !== null || isNewModalOpen) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden transform transition duration-200">
            
            {/* Modal Title */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingItem ? `Edit Part Details` : 'Create New Stock Item'}
              </h3>
              <button 
                onClick={() => {
                  setEditingItem(null);
                  setIsNewModalOpen(false);
                }}
                className="p-1 hover:bg-slate-200 rounded text-slate-500"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Input Form */}
            <form onSubmit={editingItem ? handleSaveEdit : handleSaveCreate} className="p-6 space-y-4 text-xs font-semibold text-slate-700">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 mb-1">Part Number (Unique identifier)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., HY-19020"
                    disabled={editingItem !== null} // Lock part identity on edit
                    className="w-full p-2.5 border border-slate-200 rounded-xl uppercase font-mono disabled:bg-slate-100 disabled:text-slate-500"
                    value={formPartNo}
                    onChange={(e) => setFormPartNo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">HSN HSN-Code</label>
                  <input
                    type="text"
                    placeholder="e.g., 87083000"
                    className="w-full p-2.5 border border-slate-200 rounded-xl"
                    value={formHsn}
                    onChange={(e) => setFormHsn(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Complete Spare Part Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Hyundai i20 Rear Brake Shoes"
                  className="w-full p-2.5 border border-slate-200 rounded-xl"
                  value={formPartName}
                  onChange={(e) => setFormPartName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 mb-1">Maximum Retail Price (INR)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="2500"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-slate-900"
                    value={formMrp || ''}
                    onChange={(e) => setFormMrp(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Stock Quantity (Units)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="100"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-slate-900"
                    value={formQuantity ?? ''}
                    onChange={(e) => setFormQuantity(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Status control for edit */}
              {editingItem && (
                <div className="bg-red-50/50 p-3 rounded-xl flex items-center justify-between border border-red-100 mt-2">
                  <div>
                    <p className="text-xs font-bold text-red-950">Active / Archive Status</p>
                    <p className="text-[10px] text-red-700 font-normal">Archiving will completely hide this part from the entire application.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updatedActive = !editingItem.is_active;
                      editingItem.is_active = updatedActive;
                      triggerToast(`Switched active state info. Please click Save Changes.`);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer active:scale-95 ${
                      editingItem.is_active 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' 
                        : 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                    }`}
                  >
                    {editingItem.is_active ? '✅ Active' : '📁 Archived (Hidden)'}
                  </button>
                </div>
              )}

              {/* Confirm / Close Options */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setIsNewModalOpen(false);
                  }}
                  className="bg-slate-100 hover:bg-slate-250 text-slate-600 px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl shadow-md cursor-pointer"
                >
                  {editingItem ? 'Save Changes' : 'Create Item'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
