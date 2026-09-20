import { useState, useMemo, useEffect, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { Brand, User, BulkUpdateHistory, MRPHistory, isOwnerOrAdmin, InventoryItem } from '../types';
import { db } from '../dbStore';
import { 
  FileSpreadsheet, UploadCloud, RefreshCw, CheckCircle, 
  AlertTriangle, History, ArrowLeftRight, HelpCircle 
} from 'lucide-react';

interface BulkUpdateModuleProps {
  brand: Brand;
  user: User;
}

interface ParsedBulkMRPRow {
  part_no: string;
  part_name?: string;
  hsn?: string;
  mrp: number;
  matched: boolean;
  is_archived?: boolean;
  current_mrp?: number;
}

interface ParsedBulkStockRow {
  part_no: string;
  part_name?: string;
  hsn?: string;
  quantity: number;
  matched: boolean;
  is_archived?: boolean;
  current_qty?: number;
}

export default function BulkUpdateModule({ brand, user }: BulkUpdateModuleProps) {
  if (!isOwnerOrAdmin(user.role)) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-md mx-auto my-12 font-sans">
        <div className="w-12 h-12 bg-rose-50 border border-rose-200 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Access Denied</h3>
        <p className="text-slate-500 text-xs leading-relaxed">
          The Bulk Updates module is restricted to Owner and Admin roles only.
        </p>
      </div>
    );
  }

  const [updateType, setUpdateType] = useState<'MRP' | 'Stock'>('MRP');
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedLoaded, setParsedLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number>(0);
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string>('');

  // Lists
  const [bulkHistory, setBulkHistory] = useState<BulkUpdateHistory[]>(() => db.getBulkHistory(brand));
  const [mrpHistory, setMrpHistory] = useState<MRPHistory[]>(() => db.getMRPHistory(brand));
  const [toastMessageLocal, setToastMessageLocal] = useState<string | null>(null);

  // Parsed item previews
  const [parsedMRPs, setParsedMRPs] = useState<ParsedBulkMRPRow[]>([]);
  const [parsedStocks, setParsedStocks] = useState<ParsedBulkStockRow[]>([]);

  const refreshComponentData = () => {
    setBulkHistory(db.getBulkHistory(brand));
    setMrpHistory(db.getMRPHistory(brand));
  };

  useEffect(() => {
    refreshComponentData();
    return db.subscribe(refreshComponentData);
  }, [brand]);

  const triggerToast = (msg: string) => {
    setToastMessageLocal(msg);
    setTimeout(() => setToastMessageLocal(null), 3500);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleFileUpload = (file: File) => {
    setFileName(file.name);
    setIsParsing(true);
    setParsedLoaded(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error("Could not read file details.");
        }

        const arr = new Uint8Array(data as ArrayBuffer);
        const workbook = XLSX.read(arr, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new Error("No sheets found in this Excel workbook.");
        }

        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          throw new Error("The main worksheet is empty or contains no readable rows.");
        }

        // Get complete inventory list to match parts (including archived parts)
        const currentInventory = db.getInventory(brand, true);
        const inventoryMap = new Map<string, InventoryItem>();
        for (const item of currentInventory) {
          inventoryMap.set(item.part_no.toUpperCase(), item);
        }

        if (updateType === 'MRP') {
          const parsed: ParsedBulkMRPRow[] = [];
          
          for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            const keys = Object.keys(row);
            if (keys.length === 0) continue;

            const partKey = keys.find(k => 
              /^(part[_\-\s]?no|part[_\-\s]?number|sku|item[_\-\s]?code|part_number|partno|part\s*no\.?)$/i.test(k.trim())
            ) || keys.find(k => /part/i.test(k.trim())) || keys[0];

            const mrpKey = keys.find(k => 
              /^(mrp|new[_\-\s]?mrp|price|new[_\-\s]?price|mrp_price|value|mrp\s*value|mrp\s*price|maximum\s*retail\s*price)$/i.test(k.trim())
            );

            if (!mrpKey) {
              throw new Error("MRP price column not detected. Please make sure your sheet has an 'MRP' or 'New Price' column with valid header values.");
            }

            const partNoVal = String(row[partKey] || '').trim().toUpperCase();
            if (!partNoVal) {
              continue;
            }

            const mrpValRaw = row[mrpKey];
            const mrpNum = parseFloat(String(mrpValRaw).replace(/[^0-9.]/g, ''));

            if (isNaN(mrpNum) || mrpNum < 0) {
              throw new Error(`Row ${i + 2}: Invalid MRP value "${mrpValRaw}" for part "${partNoVal}". MRP must be a positive number.`);
            }

            // Optional naming and HSN headers
            const nameKey = keys.find(k => 
              /^(part[_\-\s]?name|name|description|desc|item[_\-\s]?name|partname|part\s*name)$/i.test(k.trim())
            );
            const hsnKey = keys.find(k => 
              /^(hsn|hsn[_\-\s]?code|hsncode|hsn_code|hsn\s*code)$/i.test(k.trim())
            );

            const partName = nameKey ? String(row[nameKey] || '').trim() : undefined;
            const hsn = hsnKey ? String(row[hsnKey] || '').trim() : undefined;

            const existingItem = inventoryMap.get(partNoVal);

            parsed.push({
              part_no: existingItem ? existingItem.part_no : partNoVal,
              // For existing parts, preserve part name and HSN (do not overwrite)
              part_name: existingItem ? existingItem.part_name : (partName || 'Bulk Introduced Part'),
              hsn: existingItem ? existingItem.hsn : (hsn || ''),
              mrp: mrpNum,
              matched: !!existingItem,
              is_archived: existingItem ? !existingItem.is_active : false,
              current_mrp: existingItem?.mrp
            });
          }

          if (parsed.length === 0) {
            throw new Error("Could not parse any valid row with part number and MRP columns.");
          }

          setParsedMRPs(parsed);
          setParsedStocks([]);
        } else {
          // Stock Updates
          const parsed: ParsedBulkStockRow[] = [];

          for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            const keys = Object.keys(row);
            if (keys.length === 0) continue;

            const partKey = keys.find(k => 
              /^(part[_\-\s.]?no|part[_\-\s.]?number|sku|item[_\-\s.]?code|part_number|partno|part\s*no\.?)$/i.test(k.trim())
            ) || keys.find(k => /part/i.test(k.trim())) || keys[0];

            const nameKey = keys.find(k => 
              /^(part[_\-\s.]?name|item[_\-\s.]?name|partname|part\s*name|name|description|desc)$/i.test(k.trim())
            );

            const hsnKey = keys.find(k => 
              /^(hsn|hsn[_\-\s.]?code|hsncode|hsn_code|hsn\s*code)$/i.test(k.trim())
            );

            const qtyKey = keys.find(k => 
              /^(quantity|qty|stock|count|new[_\-\s.]?qty|new[_\-\s.]?quantity|quantity_to_set|units|pcs|quantity\s*level)$/i.test(k.trim())
            );

            if (!qtyKey) {
              throw new Error("Quantity column not detected. Please make sure your sheet has a 'QUANTITY' or 'Qty' column with valid header values.");
            }

            const partNoVal = String(row[partKey] || '').trim().toUpperCase();
            if (!partNoVal) {
              continue;
            }

            const qtyValRaw = row[qtyKey];
            const qtyNum = parseInt(String(qtyValRaw).replace(/[^0-9]/g, ''), 10);

            if (isNaN(qtyNum) || qtyNum < 0) {
              throw new Error(`Row ${i + 2}: Invalid Quantity value "${qtyValRaw}" for part "${partNoVal}". Quantity must be a non-negative integer.`);
            }

            const partName = nameKey ? String(row[nameKey] || '').trim() : undefined;
            const hsn = hsnKey ? String(row[hsnKey] || '').trim() : undefined;

            const existingItem = inventoryMap.get(partNoVal);

            parsed.push({
              part_no: existingItem ? existingItem.part_no : partNoVal,
              // For existing parts, strictly overwrite ONLY stock quantity; neither part name nor HSN code
              part_name: existingItem ? existingItem.part_name : (partName || 'New Spares Part'),
              hsn: existingItem ? existingItem.hsn : (hsn || ''),
              quantity: qtyNum,
              matched: !!existingItem,
              is_archived: existingItem ? !existingItem.is_active : false,
              current_qty: existingItem?.quantity
            });
          }

          if (parsed.length === 0) {
            throw new Error("Could not parse any valid row with part number and Quantity columns.");
          }

          setParsedStocks(parsed);
          setParsedMRPs([]);
        }

        setParsedLoaded(true);
        triggerToast(`Excel sheet parsed successfully: found ${rawRows.length} items.`);
      } catch (err: any) {
        console.error(err);
        alert(`Validation Failure: ${err.message || 'The uploaded file does not match the required schema.'}`);
      } finally {
        setIsParsing(false);
      }
    };

    reader.onerror = () => {
      alert("Error reading file.");
      setIsParsing(false);
    };

    reader.readAsArrayBuffer(file);
  };

  // Generate and download a physical Sample Excel Sheet template containing correct headings and sample data
  const handleDownloadSample = () => {
    try {
      let data: any[] = [];
      let filename = '';
      
      if (updateType === 'MRP') {
        filename = `${brand.toLowerCase()}_mrp_price_samples.xlsx`;
        data = brand === 'Hyundai' ? [
          { 'PART NO.': 'HY-10023', 'PART NAME': 'Hyundai Elite i20 Front Brake Pads', 'HSN': '87089900', 'MRP': 2600 },
          { 'PART NO.': 'HY-20150', 'PART NAME': 'Hyundai Grand i10 Air Filter', 'HSN': '87089900', 'MRP': 480 },
          { 'PART NO.': 'HY-40992', 'PART NAME': 'Hyundai Creta Oil Filter', 'HSN': '87089900', 'MRP': 320 }
        ] : [
          { 'PART NO.': 'MA-10201', 'PART NAME': 'Mahindra Scorpio S11 Front Brake Rotor', 'HSN': '87089900', 'MRP': 3600 },
          { 'PART NO.': 'MA-20199', 'PART NAME': 'Mahindra Thar Diesel Fuel Filter', 'HSN': '87089900', 'MRP': 1950 },
          { 'PART NO.': 'MA-80024', 'PART NAME': 'Mahindra Thar Cabin Air Pollen Filter', 'HSN': '87089900', 'MRP': 550 }
        ];
      } else {
        filename = `${brand.toLowerCase()}_inventory_stock_overwrite_samples.xlsx`;
        data = brand === 'Hyundai' ? [
          { 'PART NO.': 'HY-10023', 'PART NAME': 'Hyundai Elite i20 Front Brake Pads', 'HSN': '87089900', 'QUANTITY': 60 },
          { 'PART NO.': 'HY-20150', 'PART NAME': 'Hyundai Grand i10 Air Filter', 'HSN': '87089900', 'QUANTITY': 150 },
          { 'PART NO.': 'HY-40992', 'PART NAME': 'Hyundai Creta Oil Filter', 'HSN': '87089900', 'QUANTITY': 85 },
          { 'PART NO.': 'HY-NEW01', 'PART NAME': 'Hyundai Verna Spark Plug (Sample New Part)', 'HSN': '85111000', 'QUANTITY': 40 }
        ] : [
          { 'PART NO.': 'MA-10201', 'PART NAME': 'Mahindra Scorpio S11 Front Brake Rotor', 'HSN': '87089900', 'QUANTITY': 35 },
          { 'PART NO.': 'MA-20199', 'PART NAME': 'Mahindra Thar Diesel Fuel Filter', 'HSN': '87089900', 'QUANTITY': 65 },
          { 'PART NO.': 'MA-80024', 'PART NAME': 'Mahindra Thar Cabin Air Pollen Filter', 'HSN': '87089900', 'QUANTITY': 50 },
          { 'PART NO.': 'MA-NEW01', 'PART NAME': 'Mahindra Thar Headlamp Bulb (Sample New Part)', 'HSN': '85392120', 'QUANTITY': 30 }
        ];
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Sample');
      
      XLSX.writeFile(workbook, filename);
      triggerToast(`Fitted .xlsx template generated and saved!`);
    } catch (err: any) {
      console.error(err);
      alert(`Could not create client-side sample template: ${err.message}`);
    }
  };

  const handleApplyBulkUpdates = async () => {
    if (isApplying) return;
    setIsApplying(true);
    setUpdateProgress(0);
    setUpdateStatusMessage(`Initiating bulk ${updateType} update...`);
    try {
      if (updateType === 'MRP') {
        if (parsedMRPs.length === 0) return;
        
        const payload = parsedMRPs.map(row => ({
          part_no: row.part_no,
          part_name: row.part_name,
          hsn: row.hsn,
          mrp: row.mrp
        }));

        await db.mrpBulkUpdate(brand, payload, fileName, user, (progress, status) => {
          setUpdateProgress(progress);
          if (status) setUpdateStatusMessage(status);
        });
        setParsedMRPs([]);
      } else {
        if (parsedStocks.length === 0) return;

        const payload = parsedStocks.map(row => ({
          part_no: row.part_no,
          part_name: row.part_name,
          hsn: row.hsn,
          quantity: row.quantity
        }));

        await db.stockBulkUpdate(brand, payload, fileName, user, (progress, status) => {
          setUpdateProgress(progress);
          if (status) setUpdateStatusMessage(status);
        });
        setParsedStocks([]);
      }

      setUpdateProgress(100);
      setUpdateStatusMessage("Bulk update 100% complete! Finalizing schema...");
      // Pause briefly so the user sees the progress bar reach 100%
      await new Promise(res => setTimeout(res, 600));

      setParsedLoaded(false);
      refreshComponentData();
      triggerToast(`Bulk ${updateType} update committed to database schema successfully!`);
    } catch (err: any) {
      console.error(err);
      alert(`Bulk update failed: ${err.message || 'Check database permissions or schema connectivity.'}`);
    } finally {
      setIsApplying(false);
      setUpdateProgress(0);
      setUpdateStatusMessage('');
    }
  };

  const handleUndoAction = async (recId: string) => {
    const record = bulkHistory.find(h => h.id === recId);
    if (!record) return;

    const confirmed = window.confirm(`Restore entire inventory to state prior to bulk update of ${record.file_name}? This action will write a transaction audit log.`);
    if (!confirmed) return;

    if (isApplying) return;
    setIsApplying(true);
    try {
      await db.undoBulkUpdate(brand, recId, user);
      refreshComponentData();
      triggerToast(`Reverted bulk action ${record.file_name} successfully! Stock levels restored.`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsApplying(false);
    }
  };

  // Math counts of previews
  const previewSummary = useMemo(() => {
    if (updateType === 'MRP') {
      const succ = parsedMRPs.length; 
      const matched = parsedMRPs.filter(r => r.matched).length;
      const archivedMatched = parsedMRPs.filter(r => r.matched && r.is_archived).length;
      const newParts = parsedMRPs.filter(r => !r.matched).length;
      return { total: parsedMRPs.length, matched, archivedMatched, unarchiving: 0, newParts, success: succ, failed: 0 };
    } else {
      const matched = parsedStocks.filter(r => r.matched).length;
      const unarchiving = parsedStocks.filter(r => r.matched && r.is_archived).length;
      const newParts = parsedStocks.filter(r => !r.matched).length;
      return { total: parsedStocks.length, matched, archivedMatched: 0, unarchiving, newParts, success: parsedStocks.length, failed: 0 };
    }
  }, [updateType, parsedMRPs, parsedStocks]);

  return (
    <div className="space-y-6">

      {/* Local Toast banner */}
      {toastMessageLocal && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-bounce mt-20">
          <CheckCircle className="w-4.5 h-4.5 text-emerald-450" />
          {toastMessageLocal}
        </div>
      )}

      {/* Headline */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-indigo-650" />
          Bulk Excel Updates &amp; Revert Ledger ({brand})
        </h2>
        <p className="text-sm text-slate-500">
          Upload bulk stock sheets or complete price adjustment templates. All uploads include single-click undo.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Bulk Upload Sandboxes columns */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Select Upload adjustment Mode</h3>
              
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setUpdateType('MRP');
                    setParsedLoaded(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    updateType === 'MRP' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-100 text-slate-650 hover:bg-slate-200'
                  }`}
                >
                  MRP Price Adjustments
                </button>
                <button
                  onClick={() => {
                    setUpdateType('Stock');
                    setParsedLoaded(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    updateType === 'Stock' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-100 text-slate-650 hover:bg-slate-200'
                  }`}
                >
                  Inventory Stock Overwrites
                </button>
              </div>
            </div>

            {/* Sandbox drop panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed p-6 rounded-2xl text-center cursor-pointer flex flex-col items-center justify-center transition relative min-h-[170px] ${
                  isDragging 
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 scale-[1.01]' 
                    : 'border-slate-200 bg-slate-50 hover:border-indigo-500 hover:bg-slate-100/50'
                }`}
              >
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv"
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file);
                    }
                  }}
                />
                <UploadCloud className={`w-8 h-8 mb-2 ${isDragging ? 'text-indigo-650 animate-bounce' : 'text-slate-400'}`} />
                <p className="font-bold text-slate-800 text-xs">
                  {fileName ? `Loaded: ${fileName}` : 'Drop or select spreadsheet file'}
                </p>
                <p className="text-[10px] text-slate-450 mt-1">Supports Excel (.xlsx, .xls) and CSV</p>
                <p className="text-[9px] text-indigo-650 font-bold mt-1.5 bg-indigo-50 px-2 py-0.5 rounded">
                  Mode: {updateType === 'MRP' ? 'MRP Price Sheet (PART NO., PART NAME, HSN, MRP)' : 'Stock Levels Overwrite (PART NO., PART NAME, HSN, QUANTITY)'}
                </p>
              </div>

              {/* Downloadable templates */}
              <div className="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-150 flex flex-col justify-between">
                <div>
                  <h4 className="text-emerald-950 font-bold text-xs flex items-center gap-1">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    Download Sample Excel Workbook
                  </h4>
                  <p className="text-[11px] text-slate-550 leading-relaxed mt-1.5">
                    Download a pre-formatted Excel workbook containing correct headers: <span className="font-bold font-mono text-[9.5px] bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800">
                      {updateType === 'MRP' ? 'PART NO., PART NAME, HSN, MRP' : 'PART NO., PART NAME, HSN, QUANTITY'}
                    </span>. You can edit this sample file and drop it here to sync instantly.
                  </p>
                  {updateType === 'Stock' ? (
                    <p className="text-[10.5px] text-emerald-900 mt-2 font-medium bg-emerald-100/60 px-2.5 py-1.5 rounded-lg leading-relaxed border border-emerald-200/60">
                      ✨ <strong>Inventory Stock Overwrite:</strong> Overwrites ONLY stock quantity for existing items. Part names, part numbers, and HSN codes are preserved untouched. If a part was in archive, it will be unarchived and its stock updated. Any newly detected part is added in active mode.
                    </p>
                  ) : (
                    <p className="text-[10.5px] text-emerald-900 mt-2 font-medium bg-emerald-100/60 px-2.5 py-1.5 rounded-lg leading-relaxed border border-emerald-200/60">
                      ✨ <strong>MRP Price Overwrite:</strong> Overwrites ONLY MRP price for existing items. If a part is archived, its MRP is updated without unarchiving it. Any newly detected part with 0 quantity is archived (not added to the active list).
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2 rounded-xl mt-4 cursor-pointer text-center flex items-center justify-center gap-1.5 transition active:scale-[0.98] shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Download Sample excel Template
                </button>
              </div>

            </div>

            {isParsing && (
              <div className="p-4 bg-slate-100 rounded-xl text-center text-xs text-slate-550 animate-pulse">
                Parsing columns and checking part numbers match...
              </div>
            )}
          </div>

          {/* Parsed Preview lists */}
          {parsedLoaded && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Bulk Sheet matched preview</h3>
                  <p className="text-xs text-slate-400">Please audit calculated columns below before committing.</p>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                    Total Rows: {previewSummary.total}
                  </span>
                  <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded">
                    Existing Parts: {previewSummary.matched}
                  </span>
                  {updateType === 'Stock' && previewSummary.unarchiving > 0 && (
                    <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-200">
                      Unarchiving: {previewSummary.unarchiving}
                    </span>
                  )}
                  {updateType === 'MRP' && previewSummary.archivedMatched > 0 && (
                    <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-200">
                      Archived (Stays Archived): {previewSummary.archivedMatched}
                    </span>
                  )}
                  {previewSummary.newParts > 0 && (
                    <span className={`${updateType === 'MRP' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'} px-2 py-1 rounded`}>
                      + New Parts: {previewSummary.newParts} {updateType === 'MRP' ? '(Archived - 0 Qty)' : '(Active Mode)'}
                    </span>
                  )}
                </div>
              </div>

              {/* Previews lists row details */}
              <div className="overflow-y-auto max-h-[350px] border border-slate-200 rounded-xl">
                <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold">
                  <thead className="bg-slate-50 text-slate-500 text-[9px] uppercase">
                    {updateType === 'MRP' ? (
                      <tr>
                        <th className="p-3">Status</th>
                        <th className="p-3">Part No.</th>
                        <th className="p-3">Part Name</th>
                        <th className="p-3 text-right">Old MRP</th>
                        <th className="p-3 text-right">New MRP (Overwrite)</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="p-3">Status</th>
                        <th className="p-3">Part No.</th>
                        <th className="p-3">Part Name</th>
                        <th className="p-3">HSN</th>
                        <th className="p-3 text-center">Current Qty</th>
                        <th className="p-3 text-center">New Qty (Overwrite)</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-705">
                    {updateType === 'MRP' ? (
                      parsedMRPs.slice(0, 100).map((row) => (
                        <tr key={row.part_no} className="hover:bg-slate-50/50">
                          <td className="p-3">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              row.matched 
                                ? (row.is_archived ? 'bg-slate-100 text-slate-700 border border-slate-300' : 'bg-emerald-100 text-emerald-800') 
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {row.matched 
                                ? (row.is_archived ? 'Existing (Archived - Keeps Archived)' : 'Existing (MRP Only)') 
                                : '+ New Part (Will Archive - 0 Qty)'}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold">{row.part_no}</td>
                          <td className="p-3 text-slate-500 font-normal">{row.part_name || '-'}</td>
                          <td className="p-3 text-right text-slate-400">₹{row.current_mrp || '-'}</td>
                          <td className="p-3 text-right font-bold text-indigo-700">₹{row.mrp}</td>
                        </tr>
                      ))
                    ) : (
                      parsedStocks.slice(0, 100).map((row) => (
                        <tr key={row.part_no} className="hover:bg-slate-50/50">
                          <td className="p-3">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              row.matched 
                                ? (row.is_archived ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-emerald-100 text-emerald-800') 
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {row.matched 
                                ? (row.is_archived ? 'Existing (Unarchive & Set Qty)' : 'Existing (Qty Overwrite Only)') 
                                : '+ New Part (Active Mode)'}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900">{row.part_no}</td>
                          <td className="p-3 text-slate-600">{row.part_name || '-'}</td>
                          <td className="p-3 font-mono text-slate-500 text-[11px]">{row.hsn || '-'}</td>
                          <td className="p-3 text-center text-slate-400">
                            {row.current_qty !== undefined ? `${row.current_qty} units` : '-'}
                          </td>
                          <td className="p-3 text-center font-bold">
                            <span className={row.matched ? 'text-indigo-700' : 'text-blue-700'}>
                              {row.quantity} units
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {((updateType === 'MRP' && parsedMRPs.length > 100) || (updateType === 'Stock' && parsedStocks.length > 100)) && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-center text-[10.5px] text-slate-500">
                  ⚠️ Showing only the first <strong>100 preview rows</strong> out of <strong>{updateType === 'MRP' ? parsedMRPs.length : parsedStocks.length} total rows</strong> to optimize rendering. Rest assured, <strong>all {updateType === 'MRP' ? parsedMRPs.length : parsedStocks.length} records</strong> will be securely committed to Supabase.
                </div>
              )}

              {/* Real-time Progress Bar & Status (Inline) */}
              {isApplying && (
                <div className="bg-slate-50 border border-indigo-100 rounded-2xl p-4 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
                      <span className="text-xs font-bold text-slate-800">
                        {updateStatusMessage || `Applying bulk ${updateType} update...`}
                      </span>
                    </div>
                    <span className="font-mono font-black text-sm text-indigo-600">
                      {Math.round(updateProgress)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200/80 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ease-out ${
                        updateProgress === 100
                          ? 'bg-emerald-500'
                          : updateType === 'MRP'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                            : 'bg-gradient-to-r from-indigo-500 to-blue-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, updateProgress))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                    <span>0% Start</span>
                    <span>Synchronizing with Supabase database</span>
                    <span>100% Complete</span>
                  </div>
                </div>
              )}

              {/* Action */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setParsedLoaded(false)}
                  disabled={isApplying}
                  className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl disabled:opacity-50 hover:bg-slate-200 transition-colors"
                >
                  Clear Sheets
                </button>
                <button
                  onClick={handleApplyBulkUpdates}
                  disabled={isApplying}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-xl shadow cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-all"
                >
                  {isApplying && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {isApplying ? `Applying (${Math.round(updateProgress)}%)...` : 'Apply & Confirm Overwrites'}
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Column 3: Undo Revert history logs stack */}
        <div className="space-y-4">
          
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center justify-between">
              <span>Bulk History Logs</span>
              <span className="text-[10px] text-slate-400">Allows Undo Reverts</span>
            </h3>

            <div className="divide-y divide-slate-100 space-y-3.5 max-h-[70vh] overflow-y-auto">
              {bulkHistory.map((h) => (
                <div key={h.id} className="pt-3 text-xs space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-slate-900">{h.update_type}</span>
                    <span className="text-[10px] text-slate-400 font-normal">{new Date(h.created_at).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="text-[11px] text-slate-500 leading-normal">
                    <p>File: <span className="font-mono text-slate-700 font-semibold">{h.file_name}</span></p>
                    <p>Success rows: {h.success_rows} | Failed: {h.failed_rows}</p>
                  </div>

                  <div className="flex justify-between items-baseline pt-1.5">
                    <span className="text-[10px] text-slate-400">Uploaded by: {h.created_by}</span>
                    
                    {h.can_undo ? (
                      <button
                        onClick={() => handleUndoAction(h.id)}
                        className="bg-red-50 hover:bg-red-650 hover:text-white text-red-600 border border-red-150 rounded px-2 py-0.5 text-[10px] font-bold cursor-pointer transition active:scale-95"
                      >
                        Undo overrite
                      </button>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">Restored / Locked</span>
                    )}
                  </div>

                </div>
              ))}
              {bulkHistory.length === 0 && (
                <div className="text-center py-8 text-slate-400 font-normal">
                  No bulk updates recorded in this schema session.
                </div>
              )}
            </div>
          </div>

          {/* Pricing changes stream */}
          {updateType === 'MRP' && mrpHistory.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-1 text-slate-500">
                <History className="w-4 h-4 text-slate-400" />
                Latest Pricing Stream (MRP logs)
              </h3>

              <div className="divide-y divide-slate-100 max-h-[35vh] overflow-y-auto pr-1 space-y-2.5">
                {mrpHistory.slice(0, 10).map((mrp) => (
                  <div key={mrp.id} className="pt-2 text-xs">
                    <div className="flex justify-between items-baseline leading-none">
                      <span className="font-mono font-bold text-slate-900">{mrp.part_no}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{new Date(mrp.changed_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between pt-1 font-semibold text-slate-750">
                      <span>MRP Altered:</span>
                      <span>
                        <span className="text-slate-400 line-through">₹{mrp.old_mrp}</span>
                        <span className="text-emerald-600 ml-1.5 font-bold">&rarr; ₹{mrp.new_mrp}</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 text-right leading-none mt-1">Changes by: {mrp.changed_by}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Full Modal Progress Bar Dialog (0% to 100%) */}
      {isApplying && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 max-w-md w-full space-y-6 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header with status icon and percentage */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                  updateProgress === 100 
                    ? 'bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50' 
                    : updateType === 'MRP' 
                      ? 'bg-emerald-50 text-emerald-600 ring-4 ring-emerald-50/50' 
                      : 'bg-indigo-50 text-indigo-600 ring-4 ring-indigo-50/50'
                }`}>
                  {updateProgress === 100 ? (
                    <CheckCircle className="w-6 h-6 text-emerald-600 animate-in zoom-in" />
                  ) : (
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {updateProgress === 100 ? 'Update Finalized!' : `Applying Bulk ${updateType} Update`}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium truncate max-w-[180px] sm:max-w-[220px]">
                    {fileName || 'Processing spreadsheet records'}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className={`text-3xl font-black font-mono tracking-tight transition-colors ${
                  updateProgress === 100 ? 'text-emerald-600' : 'text-indigo-600'
                }`}>
                  {Math.round(updateProgress)}%
                </span>
              </div>
            </div>

            {/* 0 to 100% Progress Bar */}
            <div className="space-y-2">
              <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden p-0.5 border border-slate-200 shadow-inner">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ease-out ${
                    updateProgress === 100 
                      ? 'bg-emerald-500' 
                      : updateType === 'MRP' 
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500' 
                        : 'bg-gradient-to-r from-indigo-500 to-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, updateProgress))}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                <span>0% Start</span>
                <span>{updateProgress >= 25 && updateProgress < 90 ? 'Writing Batches' : 'Verifying'}</span>
                <span>100% Complete</span>
              </div>
            </div>

            {/* Dynamic Status Description Box */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3">
              {updateProgress < 100 ? (
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              )}
              <p className="text-xs font-semibold text-slate-700 truncate">
                {updateStatusMessage || 'Synchronizing with live database...'}
              </p>
            </div>

            {/* Safety Notice */}
            <p className="text-[11px] text-slate-400 text-center font-medium leading-relaxed">
              Please do not close or reload this browser tab while updates are in progress.
            </p>

          </div>
        </div>
      )}

    </div>
  );
}
