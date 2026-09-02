import React, { useState, useMemo } from 'react';
import { Brand, User, InventoryItem } from '../types';
import { db } from '../dbStore';
import * as XLSX from 'xlsx';
import { 
  Search, EyeOff, Archive, CheckCircle2, Pencil, 
  Trash2, Plus, ArrowLeft, ArrowRight, X, Layers, Download, FileSpreadsheet,
  AlertTriangle, History, Calendar
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
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportSource, setExportSource] = useState<'filtered' | 'selected' | 'page' | 'full' | 'full_archived'>('filtered');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isInlineEditMode, setIsInlineEditMode] = useState(false);
  const [inlineEdits, setInlineEdits] = useState<Record<string, { part_name: string; quantity: number }>>({});
  const [deletingItemConfirm, setDeletingItemConfirm] = useState<InventoryItem | null>(null);
  const [viewingPartDetails, setViewingPartDetails] = useState<InventoryItem | null>(null);
  const [movementTab, setMovementTab] = useState<'all' | 'sales' | 'purchases' | 'returns'>('all');

  // Form Fields for Manual Create/Edit
  const [formPartNo, setFormPartNo] = useState('');
  const [formPartName, setFormPartName] = useState('');
  const [formHsn, setFormHsn] = useState('');
  const [formMrp, setFormMrp] = useState(0);
  const [formQuantity, setFormQuantity] = useState(0);

  // Fetch Inventory (reactive to changes)
  const [showArchived, setShowArchived] = useState(false);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>(() => db.getInventory(brand, false));
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const refreshList = () => {
    setInventoryList(db.getInventory(brand, showArchived));
  };

  const loadData = () => {
    setIsLoading(true);
    setFetchError(null);
    db.ensureInventoryLoaded(brand)
      .then(() => {
        refreshList();
        setIsLoading(false);
      })
      .catch((err: any) => {
        console.error("Failed to load inventory:", err);
        setFetchError(err.message || "Failed to load database inventory.");
        setIsLoading(false);
      });
  };

  React.useEffect(() => {
    refreshList();
    loadData();
    return db.subscribe(refreshList);
  }, [brand, showArchived]);

  // Clean selections whenever filters/search text updates
  React.useEffect(() => {
    setSelectedIds([]);
    setSelectionMode('current_page');
    setBulkError(null);
  }, [search, brand, showLowStockOnly]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Filtrations
  const filteredList = useMemo(() => {
    return inventoryList.filter(item => {
      const matchesSearch = item.part_no.toLowerCase().includes(search.toLowerCase()) || 
                            item.part_name.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (showLowStockOnly) {
        return item.quantity <= lowStockThreshold;
      }
      return true;
    });
  }, [inventoryList, search, showLowStockOnly, lowStockThreshold]);

  // Fetch part movements asynchronously when viewing details of a specific part
  const [partMovements, setPartMovements] = useState<{ sales: any[], purchases: any[], returns: any[], unified: any[] }>({ sales: [], purchases: [], returns: [], unified: [] });
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);

  React.useEffect(() => {
    if (!viewingPartDetails) {
      setPartMovements({ sales: [], purchases: [], returns: [], unified: [] });
      return;
    }
    let active = true;
    setIsLoadingMovements(true);
    db.fetchPartMovements(brand, viewingPartDetails.part_no)
      .then(res => {
        if (active) {
          setPartMovements(res);
          setIsLoadingMovements(false);
        }
      })
      .catch(err => {
        console.error(err);
        if (active) setIsLoadingMovements(false);
      });
    return () => { active = false; };
  }, [viewingPartDetails, brand]);

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
    if (user.role !== 'Owner') {
      alert("Permission denied. Only Owner can modify parts.");
      return;
    }
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
    if (user.role !== 'Owner') {
      alert("Permission denied. Only Owner can edit parts.");
      return;
    }
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
    if (user.role !== 'Owner') {
      alert("Permission denied. Only Owner can edit parts.");
      return;
    }
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

  const handleInlineChangeName = (id: string, name: string, currentItem: InventoryItem) => {
    setInlineEdits(prev => {
      const existing = prev[id] || { part_name: currentItem.part_name, quantity: currentItem.quantity };
      return {
        ...prev,
        [id]: { ...existing, part_name: name }
      };
    });
  };

  const handleInlineChangeQuantity = (id: string, qty: number, currentItem: InventoryItem) => {
    setInlineEdits(prev => {
      const existing = prev[id] || { part_name: currentItem.part_name, quantity: currentItem.quantity };
      return {
        ...prev,
        [id]: { ...existing, quantity: qty }
      };
    });
  };

  const handleInlineSave = (item: InventoryItem) => {
    if (user.role !== 'Owner') {
      alert("Permission denied. Only Owner can edit parts.");
      return;
    }
    const edit = inlineEdits[item.id];
    if (!edit) return;

    if (!edit.part_name.trim()) {
      alert("Part name cannot be empty.");
      return;
    }

    db.addOrUpdateInventoryPart(brand, {
      part_no: item.part_no,
      part_name: edit.part_name.trim(),
      hsn: item.hsn,
      mrp: item.mrp,
      quantity: Number(edit.quantity),
      is_active: item.is_active
    }, user);

    setInlineEdits(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    refreshList();
    triggerToast(`Successfully saved ${item.part_no} details.`);
  };

  const handleInlineDeleteConfirmed = (item: InventoryItem) => {
    if (user.role !== 'Owner') {
      alert("Permission denied. Only Owner can delete parts.");
      return;
    }
    db.deleteInventoryPart(brand, item.id, user);
    
    setInlineEdits(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    setDeletingItemConfirm(null);
    refreshList();
    triggerToast(`Deleted part ${item.part_no} successfully.`);
  };

  const handleOpenExportModal = () => {
    if (selectedIds.length > 0 || selectionMode === 'all_filtered') {
      setExportSource('selected');
    } else if (search.trim().length > 0) {
      setExportSource('filtered');
    } else {
      setExportSource('full');
    }
    setIsExportModalOpen(true);
  };

  const handleExportInventory = () => {
    let sourceData: InventoryItem[] = [];

    if (exportSource === 'selected') {
      if (selectionMode === 'all_filtered') {
        sourceData = filteredList;
      } else {
        sourceData = inventoryList.filter(item => selectedIds.includes(item.id));
      }
    } else if (exportSource === 'filtered') {
      sourceData = filteredList;
    } else if (exportSource === 'page') {
      sourceData = paginatedList;
    } else if (exportSource === 'full') {
      sourceData = db.getInventory(brand, false); // Active only
    } else if (exportSource === 'full_archived') {
      sourceData = db.getInventory(brand, true); // Active + Archived
    }

    if (sourceData.length === 0) {
      alert("No inventory data found to export matching your selection.");
      return;
    }

    const formatted = sourceData.map(item => ({
      "Part Number": item.part_no,
      "Part Name": item.part_name,
      "Quantity in Stock": item.quantity,
      "HSN Code": item.hsn || '',
      "MRP (INR)": item.mrp,
      "Status": item.is_active ? "Active" : "Archived"
    }));

    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory List");

    const stamp = new Date().toISOString().split('T')[0];
    const fileName = `Sparezy_${brand}_Inventory_${stamp}`;

    if (exportFormat === 'xlsx') {
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: 'csv' });
    }

    setIsExportModalOpen(false);
    triggerToast(`Successfully exported ${sourceData.length.toLocaleString()} parts to ${exportFormat.toUpperCase()}.`);
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

        <div className="flex gap-2 self-start flex-wrap">
          {user.role === 'Owner' && (
            <button
              onClick={() => {
                setIsInlineEditMode(prev => !prev);
                if (isInlineEditMode) {
                  // Clear any unsaved changes when toggling off
                  setInlineEdits({});
                }
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer border ${
                isInlineEditMode
                  ? 'bg-amber-550 hover:bg-amber-600 text-white border-amber-500 shadow-md'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-amber-300'
              }`}
            >
              <Pencil className="w-4 h-4" />
              {isInlineEditMode ? 'Exit Quick Edit' : 'Quick Edit Mode'}
            </button>
          )}

          <button
            onClick={handleOpenExportModal}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition hover:border-emerald-300 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Export to Excel/CSV
          </button>

          <button
            onClick={handleOpenCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md hover:shadow-lg transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create New Part
          </button>
        </div>
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

          {/* Active / Archived & Low Stock Toggles */}
          <div className="flex flex-wrap items-center gap-2">
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

            <button
              id="toggle-low-stock-button"
              onClick={() => {
                setShowLowStockOnly(prev => !prev);
                setCurrentPage(1);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shadow-sm min-w-[150px] justify-center cursor-pointer ${
                showLowStockOnly 
                  ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100' 
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              {showLowStockOnly ? `Low Stock (≤ ${lowStockThreshold} units)` : "Filter Low Stock"}
            </button>

            {showLowStockOnly && (
              <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1.5 font-sans">
                <span className="text-[10px] text-rose-700 font-extrabold uppercase tracking-wider">Limit:</span>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={lowStockThreshold}
                  onChange={(e) => {
                    const val = Math.max(0, parseInt(e.target.value) || 0);
                    setLowStockThreshold(val);
                    setCurrentPage(1);
                  }}
                  className="w-12 text-center font-mono font-bold text-xs bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 p-0.5"
                />
              </div>
            )}
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
                
                {user.role === 'Owner' && (
                  <>
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
                  </>
                )}
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

      {isInlineEditMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs font-semibold text-amber-900 flex items-start gap-2.5 shadow-xs animate-fade-in">
          <Pencil className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-extrabold text-[#b45309]">Interactive Quick Edit Mode Active</span>
            <p className="text-amber-805 font-medium leading-relaxed text-[11px]">
              You can change part names and stock quantities directly inside the inventory table cells. 
              Click the green <strong className="font-extrabold text-emerald-700">"Save"</strong> button on edited parts to commit changes, or click <strong className="font-extrabold text-rose-700">"Delete"</strong> to permanently delete a part. 
              Toggle the "Quick Edit Mode" button again to exit. Unsaved edits will be discarded when exiting.
            </p>
          </div>
        </div>
      )}

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
                  <td 
                    onClick={() => setViewingPartDetails(item)}
                    className="p-4 font-mono font-bold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer group"
                    title="Click to view full movement details"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-indigo-600 group-hover:text-indigo-800 transition duration-150">{item.part_no}</span>
                      {item.is_active === false && (
                        <span className="px-1.5 py-0.5 text-[8px] bg-amber-50 text-amber-700 rounded border border-amber-200/60 font-sans tracking-wide uppercase font-black">
                          Archived
                        </span>
                      )}
                    </div>
                  </td>
                  <td 
                    onClick={() => {
                      if (!isInlineEditMode) {
                        setViewingPartDetails(item);
                      }
                    }}
                    className={`p-4 font-medium transition duration-150 ${!isInlineEditMode ? 'hover:text-indigo-600 hover:underline cursor-pointer' : ''}`}
                    title={!isInlineEditMode ? "Click to view full movement details" : undefined}
                  >
                    {isInlineEditMode ? (
                      <input
                        type="text"
                        value={inlineEdits[item.id]?.part_name ?? item.part_name}
                        onChange={(e) => handleInlineChangeName(item.id, e.target.value, item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleInlineSave(item);
                          }
                        }}
                        className="w-full text-xs font-semibold p-1.5 border border-amber-200 focus:border-indigo-500 rounded-xl bg-amber-50/20 focus:bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                        placeholder="Part Name"
                      />
                    ) : (
                      item.part_name
                    )}
                  </td>
                  <td className="p-4 font-semibold">
                    {isInlineEditMode ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={inlineEdits[item.id]?.quantity ?? item.quantity}
                          onChange={(e) => handleInlineChangeQuantity(item.id, Math.max(0, parseInt(e.target.value) || 0), item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleInlineSave(item);
                            }
                          }}
                          className="w-20 text-xs font-bold p-1.5 border border-amber-200 focus:border-indigo-500 rounded-xl bg-amber-50/20 focus:bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                        <span className="text-[10px] text-slate-400 font-sans">units</span>
                      </div>
                    ) : (
                      <span className={item.quantity <= 3 ? 'text-red-600 font-bold' : ''}>
                        {item.quantity.toLocaleString()} units
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-slate-400 font-mono">{item.hsn || '-'}</td>
                  <td className="p-4 font-bold text-slate-800">₹{item.mrp.toLocaleString('en-IN')}</td>
                  <td className="p-4 text-right">
                    {isInlineEditMode ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleInlineSave(item)}
                          disabled={inlineEdits[item.id]?.part_name === undefined && inlineEdits[item.id]?.quantity === undefined}
                          className={`p-1.5 px-3 rounded-lg border text-[10px] font-bold uppercase transition shadow-xs flex items-center justify-center select-none ${
                            (inlineEdits[item.id]?.part_name !== undefined || inlineEdits[item.id]?.quantity !== undefined)
                              ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700 cursor-pointer'
                              : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                          }`}
                          title="Save inline changes"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setDeletingItemConfirm(item)}
                          className="p-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg inline-flex items-center gap-1 text-[10px] uppercase font-bold border border-rose-200 cursor-pointer"
                          title="Delete part permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    ) : (
                      user.role === 'Owner' ? (
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1 px-2 hover:bg-indigo-50 rounded text-indigo-600 font-bold hover:underline inline-flex items-center gap-1"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[10px] italic pr-2 px-2 py-1 bg-slate-50 rounded-lg border border-slate-200 select-none">
                          🔑 View Only
                        </span>
                      )
                    )}
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-indigo-600 font-bold">
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin inline-block"></span>
                      <span>Downloading real-time inventory from database...</span>
                    </div>
                  </td>
                </tr>
              )}
              {fetchError && !isLoading && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-red-600">
                    <div className="max-w-md mx-auto space-y-3 bg-red-50 border border-red-200 rounded-2xl p-6 text-left">
                      <div className="flex items-center gap-2 text-red-700 font-extrabold text-sm">
                        <AlertTriangle className="w-5 h-5" />
                        <span>Database Connection Error</span>
                      </div>
                      <p className="text-red-650 text-xs font-semibold leading-relaxed">
                        {fetchError}
                      </p>
                      <button
                        onClick={loadData}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded-xl text-xs transition duration-150 cursor-pointer shadow-xs"
                      >
                        Retry Connection
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !fetchError && filteredList.length === 0 && (
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

      {/* Export Modal Popup */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden transform transition duration-200 animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Title */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-600" />
                Export Inventory Sheets
              </h3>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 text-xs font-semibold text-slate-705 font-sans">
              
              {/* Dataset Selection */}
              <div className="space-y-2">
                <label className="block text-slate-500 uppercase text-[10px] tracking-wider font-extrabold">
                  1. Select Dataset / Scope
                </label>
                <div className="space-y-2.5">
                  
                  {/* Option: Current Page */}
                  <label className="flex items-start p-3 border border-slate-100 hover:border-slate-300 rounded-xl cursor-pointer transition bg-slate-50/55 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="exportSource"
                      value="page"
                      checked={exportSource === 'page'}
                      onChange={() => setExportSource('page')}
                      className="mt-0.5 text-indigo-600 focus:ring-0 mr-3 h-4 w-4 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-900">Current Paginated Page</div>
                      <div className="text-[11px] text-slate-400 font-normal">Downloads the 50 items displayed on this active page.</div>
                    </div>
                  </label>

                  {/* Option: Filtered View */}
                  <label className="flex items-start p-3 border border-slate-100 hover:border-slate-300 rounded-xl cursor-pointer transition bg-slate-50/55 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="exportSource"
                      value="filtered"
                      checked={exportSource === 'filtered'}
                      onChange={() => setExportSource('filtered')}
                      className="mt-0.5 text-indigo-600 focus:ring-0 mr-3 h-4 w-4 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-900">Current Search/Filtered Scope</div>
                      <div className="text-[11px] text-slate-400 font-normal">Downloads all {filteredList.length.toLocaleString()} matching parts.</div>
                    </div>
                  </label>

                  {/* Option: Selected Parts */}
                  <label className={`flex items-start p-3 border rounded-xl transition ${
                    (selectedIds.length > 0 || selectionMode === 'all_filtered')
                      ? 'border-slate-100 hover:border-slate-300 bg-slate-50/55 hover:bg-slate-50 cursor-pointer' 
                      : 'border-slate-100 opacity-40 cursor-not-allowed bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="exportSource"
                      value="selected"
                      disabled={!(selectedIds.length > 0 || selectionMode === 'all_filtered')}
                      checked={exportSource === 'selected'}
                      onChange={() => setExportSource('selected')}
                      className="mt-0.5 text-indigo-600 focus:ring-0 mr-3 h-4 w-4 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div>
                      <div className="font-bold text-slate-900">Selected Spare Parts</div>
                      <div className="text-[11px] text-slate-400 font-normal">
                        {(selectedIds.length === 0 && selectionMode !== 'all_filtered')
                          ? "Select parts via checkboxes to enable this option." 
                          : `Downloads the ${selectionMode === 'all_filtered' ? filteredList.length.toLocaleString() : selectedIds.length.toLocaleString()} parts currently selected.`}
                      </div>
                    </div>
                  </label>

                  {/* Option: Full active inventory */}
                  <label className="flex items-start p-3 border border-slate-100 hover:border-slate-300 rounded-xl cursor-pointer transition bg-slate-50/55 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="exportSource"
                      value="full"
                      checked={exportSource === 'full'}
                      onChange={() => setExportSource('full')}
                      className="mt-0.5 text-indigo-600 focus:ring-0 mr-3 h-4 w-4 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-900">Full Active Inventory</div>
                      <div className="text-[11px] text-slate-400 font-normal">Downloads all active parts under the {brand} schema.</div>
                    </div>
                  </label>

                  {/* Option: Full plus archived inventory */}
                  <label className="flex items-start p-3 border border-slate-100 hover:border-slate-300 rounded-xl cursor-pointer transition bg-slate-50/55 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="exportSource"
                      value="full_archived"
                      checked={exportSource === 'full_archived'}
                      onChange={() => setExportSource('full_archived')}
                      className="mt-0.5 text-indigo-600 focus:ring-0 mr-3 h-4 w-4 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-900">Full Inventory (Active + Archived)</div>
                      <div className="text-[11px] text-slate-400 font-normal">Downloads complete brand record entries including hidden/archived parts.</div>
                    </div>
                  </label>

                </div>
              </div>

              {/* Format Selection Choice */}
              <div className="space-y-2">
                <label className="block text-slate-500 uppercase text-[10px] tracking-wider font-extrabold">
                  2. File Export Format
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportFormat('xlsx')}
                    className={`py-3 rounded-xl border font-bold text-center transition cursor-pointer select-none text-xs ${
                      exportFormat === 'xlsx'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-400 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-650 hover:border-slate-350'
                    }`}
                  >
                    Microsoft Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('csv')}
                    className={`py-3 rounded-xl border font-bold text-center transition cursor-pointer select-none text-xs ${
                      exportFormat === 'csv'
                        ? 'bg-teal-50 text-teal-800 border-teal-400 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-650 hover:border-slate-350'
                    }`}
                  >
                    CSV Text Sheet (.csv)
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-205 text-slate-600 px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExportInventory}
                  className="bg-slate-950 hover:bg-black text-white px-5 py-2.5 rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 font-bold"
                >
                  <Download className="w-4 h-4 text-emerald-300" />
                  Generate &amp; Download
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Deletion Confirmation Modal Dialog */}
      {deletingItemConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden transform transition duration-205 animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Title */}
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-rose-700 text-sm flex items-center gap-2">
                <Trash2 className="w-4.5 h-4.5 text-rose-600" />
                Confirm Part Deletion
              </h3>
              <button 
                onClick={() => setDeletingItemConfirm(null)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 text-xs font-semibold text-slate-700 font-sans">
              <p className="text-slate-600 font-normal leading-relaxed">
                Are you absolutely sure you want to permanently delete part <strong className="font-bold text-slate-900 font-mono text-[11px] bg-slate-100 p-1 rounded border border-slate-200">{deletingItemConfirm.part_no}</strong>?
              </p>
              
              <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl text-rose-955 font-medium space-y-1">
                <div className="font-bold text-rose-800">Part Details:</div>
                <div className="text-[11px] truncate"><span className="text-slate-500">Name:</span> {deletingItemConfirm.part_name}</div>
                <div className="text-[11px]"><span className="text-slate-500">Current Stock:</span> {deletingItemConfirm.quantity.toLocaleString()} units</div>
              </div>

              <p className="text-rose-600 text-[10px] uppercase tracking-wider font-extrabold font-sans">
                ⚠️ Danger: This operation is irreversible and will remove this part from all active schemas.
              </p>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeletingItemConfirm(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleInlineDeleteConfirmed(deletingItemConfirm)}
                  className="bg-rose-600 hover:bg-rose-705 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition shadow-md"
                >
                  Confirm Delete
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Part Movement and History Details Modal */}
      {viewingPartDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 overflow-hidden transform transition duration-300 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="bg-slate-50 px-6 py-5 border-b border-slate-200 shrink-0 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  <span className="font-sans text-[10px] uppercase font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full tracking-wider">
                    Movement Ledger
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-lg font-sans flex items-baseline gap-2">
                  <span className="font-mono text-indigo-600 font-extrabold tracking-tight">{viewingPartDetails.part_no}</span>
                  <span className="text-slate-400 font-normal">|</span>
                  <span className="text-slate-700 text-sm font-semibold">{viewingPartDetails.part_name}</span>
                </h3>
              </div>
              <button 
                onClick={() => {
                  setViewingPartDetails(null);
                  setMovementTab('all');
                }}
                className="p-1.5 hover:bg-slate-200 rounded-xl text-slate-500 cursor-pointer transition duration-150"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-0">
              
              {/* Part Quick Meta / KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                
                {/* Available Stock Card */}
                <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl flex flex-col justify-between shadow-xs">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Current Stock</span>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className={`text-xl font-black font-mono ${viewingPartDetails.quantity <= lowStockThreshold ? 'text-rose-600' : 'text-slate-900'}`}>
                      {viewingPartDetails.quantity.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">units</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {viewingPartDetails.quantity <= lowStockThreshold ? (
                      <span className="text-[9px] text-rose-700 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 font-bold uppercase tracking-wide flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span> Low Stock
                      </span>
                    ) : (
                      <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 font-bold uppercase tracking-wide">
                        In Stock &amp; Healthy
                      </span>
                    )}
                  </div>
                </div>

                {/* Total Sales Outward */}
                <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-xl flex flex-col justify-between shadow-xs">
                  <span className="text-[10px] text-rose-700 font-bold uppercase tracking-wider">Total Sales</span>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-xl font-black font-mono text-rose-800">
                      {partMovements.sales.reduce((acc, curr) => acc + curr.quantity, 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-rose-500 font-bold font-sans">units</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Outward Log: {partMovements.sales.length} records</span>
                </div>

                {/* Total Purchases Inward */}
                <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl flex flex-col justify-between shadow-xs">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Total Purchases</span>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-xl font-black font-mono text-emerald-800">
                      {partMovements.purchases.reduce((acc, curr) => acc + curr.quantity, 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-emerald-500 font-bold font-sans">units</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Inward Log: {partMovements.purchases.length} records</span>
                </div>

                {/* Sales Returns */}
                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl flex flex-col justify-between shadow-xs">
                  <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Total Returns</span>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-xl font-black font-mono text-amber-800">
                      {partMovements.returns.reduce((acc, curr) => acc + curr.quantity, 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-amber-600 font-bold font-sans">units</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Returns Log: {partMovements.returns.length} records</span>
                </div>

              </div>

              {/* Movement Sub-Tabs */}
              <div className="border-b border-slate-200">
                <nav className="flex gap-4" aria-label="Tabs">
                  {[
                    { id: 'all', label: `All Movements (${partMovements.unified.length})` },
                    { id: 'sales', label: `Sales (${partMovements.sales.length})` },
                    { id: 'purchases', label: `Purchases (${partMovements.purchases.length})` },
                    { id: 'returns', label: `Returns (${partMovements.returns.length})` }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setMovementTab(tab.id as any)}
                      className={`pb-3 px-1 text-xs font-bold border-b-2 cursor-pointer transition ${
                        movementTab === tab.id
                          ? 'border-indigo-600 text-indigo-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* History Data Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs font-sans">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                      <tr>
                        <th className="p-4">Type</th>
                        <th className="p-4">Date</th>
                        <th className="p-4">Quantity</th>
                        <th className="p-4">Details / Counterparty</th>
                        <th className="p-4">Unit Price (INR)</th>
                        <th className="p-4">Total (INR)</th>
                        <th className="p-4 text-right">Operator</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                      {(() => {
                        const list = 
                          movementTab === 'sales' ? partMovements.sales :
                          movementTab === 'purchases' ? partMovements.purchases :
                          movementTab === 'returns' ? partMovements.returns :
                          partMovements.unified;

                        if (list.length === 0) {
                          return (
                            <tr>
                              <td colSpan={7} className="p-12 text-center text-slate-400 font-medium font-sans">
                                <History className="w-8 h-8 text-slate-300 mx-auto mb-2.5" />
                                No recorded movements matching this filter.
                              </td>
                            </tr>
                          );
                        }

                        return list.map((mv) => (
                          <tr key={mv.id} className="hover:bg-slate-50/50 transition duration-100">
                            <td className="p-4 font-semibold">
                              {mv.type === 'sale' && (
                                <span className="px-2.5 py-0.5 text-[9px] bg-red-50 text-red-700 rounded-full border border-red-100 uppercase font-black tracking-wider shadow-2xs">
                                  Sale
                                </span>
                              )}
                              {mv.type === 'purchase' && (
                                <span className="px-2.5 py-0.5 text-[9px] bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 uppercase font-black tracking-wider shadow-2xs">
                                  Purchase
                                </span>
                              )}
                              {mv.type === 'return' && (
                                <span className="px-2.5 py-0.5 text-[9px] bg-amber-50 text-amber-800 rounded-full border border-amber-100 uppercase font-black tracking-wider shadow-2xs">
                                  Return
                                </span>
                              )}
                            </td>
                            <td className="p-4 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                              {new Date(mv.date).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td className="p-4 font-bold font-mono text-slate-900">
                              {mv.quantity.toLocaleString()}
                            </td>
                            <td className="p-4 font-semibold text-slate-600 max-w-xs truncate" title={mv.info}>
                              {mv.info}
                            </td>
                            <td className="p-4 font-mono text-slate-600">
                              ₹{mv.mrp.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </td>
                            <td className="p-4 font-bold font-mono text-slate-900">
                              ₹{mv.total.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </td>
                            <td className="p-4 text-right text-slate-500 text-[10px] whitespace-nowrap font-bold uppercase tracking-wider">
                              {mv.operator}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 shrink-0 flex justify-between items-center text-slate-500 text-xs font-semibold">
              <div className="font-medium">
                Current Valuation: <span className="font-mono font-bold text-slate-900">₹{(viewingPartDetails.quantity * viewingPartDetails.mrp).toLocaleString()}</span> (Stock × MRP)
              </div>
              <button
                type="button"
                onClick={() => {
                  setViewingPartDetails(null);
                  setMovementTab('all');
                }}
                className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition shadow-xs hover:border-slate-300"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
