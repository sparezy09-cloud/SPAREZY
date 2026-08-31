import { useState, useMemo, useEffect, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { Brand, User, BulkUpdateHistory, MRPHistory } from '../types';
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
  current_mrp?: number;
}

interface ParsedBulkStockRow {
  part_no: string;
  quantity: number;
  matched: boolean;
  current_qty?: number;
}

export default function BulkUpdateModule({ brand, user }: BulkUpdateModuleProps) {
  if (user.role !== 'Admin') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-md mx-auto my-12 font-sans">
        <div className="w-12 h-12 bg-rose-50 border border-rose-200 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Access Denied</h3>
        <p className="text-slate-500 text-xs leading-relaxed">
          The Bulk Updates module is restricted to Admin roles only.
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

        // Get inventory list to match parts
        const currentInventory = db.getInventory(brand);
        const inventoryMap = new Map<string, any>();
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
              part_no: partNoVal,
              part_name: partName || existingItem?.part_name,
              hsn: hsn || existingItem?.hsn,
              mrp: mrpNum,
              matched: !!existingItem,
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
              /^(part[_\-\s]?no|part[_\-\s]?number|sku|item[_\-\s]?code|part_number|partno|part\s*no\.?)$/i.test(k.trim())
            ) || keys.find(k => /part/i.test(k.trim())) || keys[0];

            const qtyKey = keys.find(k => 
              /^(quantity|qty|stock|count|new[_\-\s]?qty|new[_\-\s]?quantity|quantity_to_set|units|pcs|quantity\s*level)$/i.test(k.trim())
            );

            if (!qtyKey) {
              throw new Error("Quantity column not detected. Please make sure your sheet has a 'Quantity' or 'Qty' column with valid header values.");
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

            const existingItem = inventoryMap.get(partNoVal);

            parsed.push({
              part_no: partNoVal,
              quantity: qtyNum,
              matched: !!existingItem,
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
          { 'Part No': 'HY-10023', 'Part Name': 'Hyundai Elite i20 Front Brake Pads', 'HSN': '87089900', 'MRP': 2600 },
          { 'Part No': 'HY-20150', 'Part Name': 'Hyundai Grand i10 Air Filter', 'HSN': '87089900', 'MRP': 480 },
          { 'Part No': 'HY-40992', 'Part Name': 'Hyundai Creta Oil Filter', 'HSN': '87089900', 'MRP': 320 }
        ] : [
          { 'Part No': 'MA-10201', 'Part Name': 'Mahindra Scorpio S11 Front Brake Rotor', 'HSN': '87089900', 'MRP': 3600 },
          { 'Part No': 'MA-20199', 'Part Name': 'Mahindra Thar Diesel Fuel Filter', 'HSN': '87089900', 'MRP': 1950 },
          { 'Part No': 'MA-80024', 'Part Name': 'Mahindra Thar Cabin Air Pollen Filter', 'HSN': '87089900', 'MRP': 550 }
        ];
      } else {
        filename = `${brand.toLowerCase()}_stock_levels_samples.xlsx`;
        data = brand === 'Hyundai' ? [
          { 'Part No': 'HY-10023', 'Quantity': 60 },
          { 'Part No': 'HY-20150', 'Quantity': 150 },
          { 'Part No': 'HY-30440', 'Quantity': 20 }
        ] : [
          { 'Part No': 'MA-10201', 'Quantity': 35 },
          { 'Part No': 'MA-20199', 'Quantity': 65 },
          { 'Part No': 'MA-30310', 'Quantity': 100 }
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
    try {
      if (updateType === 'MRP') {
        if (parsedMRPs.length === 0) return;
        
        const payload = parsedMRPs.map(row => ({
          part_no: row.part_no,
          part_name: row.part_name,
          hsn: row.hsn,
          mrp: row.mrp
        }));

        await db.mrpBulkUpdate(brand, payload, fileName, user);
        setParsedMRPs([]);
      } else {
        if (parsedStocks.length === 0) return;

        const payload = parsedStocks.map(row => ({
          part_no: row.part_no,
          quantity: row.quantity
        }));

        await db.stockBulkUpdate(brand, payload, fileName, user);
        setParsedStocks([]);
      }

      setParsedLoaded(false);
      refreshComponentData();
      triggerToast(`Bulk ${updateType} update committed to database schema successfully!`);
    } catch (err: any) {
      console.error(err);
      alert(`Bulk update failed: ${err.message || 'Check database permissions or schema connectivity.'}`);
    } finally {
      setIsApplying(false);
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
      const failed = 0; // matching code inserts unmatched too
      return { total: parsedMRPs.length, success: succ, failed };
    } else {
      const succ = parsedStocks.filter(r => r.matched).length;
      const failed = parsedStocks.filter(r => !r.matched).length;
      return { total: parsedStocks.length, success: succ, failed };
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
                  Mode: {updateType === 'MRP' ? 'MRP Price Sheet' : 'Stock Levels Overwrite'}
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
                      {updateType === 'MRP' ? 'Part No, Part Name, HSN, MRP' : 'Part No, Quantity'}
                    </span>. You can edit this sample file and drop it here to sync instantly.
                  </p>
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

                <div className="flex gap-2 text-[10px] font-bold">
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                    Rows: {previewSummary.total}
                  </span>
                  <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded">
                    Correct matched: {previewSummary.success}
                  </span>
                  {previewSummary.failed > 0 && (
                    <span className="bg-red-50 text-red-700 px-2 py-1 rounded">
                      Unmatched actions: {previewSummary.failed}
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
                        <th className="p-3">Part No</th>
                        <th className="p-3">Part Name</th>
                        <th className="p-3 text-right">Old MRP</th>
                        <th className="p-3 text-right">New MRP (Overrite)</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="p-3">Status</th>
                        <th className="p-3">Part No</th>
                        <th className="p-3 text-center">Old Qty</th>
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
                              row.matched ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {row.matched ? 'Index Matched' : 'New Spares Part'}
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
                              row.matched ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {row.matched ? 'Part Found' : 'Error/New'}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold">{row.part_no}</td>
                          <td className="p-3 text-center text-slate-400">{row.current_qty ?? '-'} units</td>
                          <td className="p-3 text-center font-bold text-indigo-705">
                            <span className={row.matched ? 'text-indigo-700' : 'text-red-500'}>
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

              {/* Action */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setParsedLoaded(false)}
                  disabled={isApplying}
                  className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl disabled:opacity-50"
                >
                  Clear Sheets
                </button>
                <button
                  onClick={handleApplyBulkUpdates}
                  disabled={isApplying}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-xl shadow cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isApplying && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {isApplying ? 'Applying Overwrites...' : 'Apply & Confirm Overwrites'}
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

    </div>
  );
}
