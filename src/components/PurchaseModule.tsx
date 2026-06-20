import React, { useState, useMemo } from 'react';
import { Brand, User, ScanSource, Purchase, PurchaseItem, InventoryItem } from '../types';
import { db } from '../dbStore';
import { 
  FileText, UploadCloud, Search, Calendar, CheckSquare, Sparkles, 
  Trash2, Plus, X, Eye, FileSpreadsheet, ShieldAlert, BadgeInfo 
} from 'lucide-react';

interface PurchaseModuleProps {
  brand: Brand;
  user: User;
}

interface NewPurchaseLineItem {
  part_no: string;
  part_name: string;
  hsn: string;
  quantity: number;
  mrp: number;
}

interface ParsedAIScanRow {
  part_no: string;
  part_name: string;
  hsn: string;
  quantity: number;
  mrp: number;
  isNewPart: boolean;
}

export default function PurchaseModule({ brand, user }: PurchaseModuleProps) {
  const [activeTab, setActiveTab] = useState<'scan' | 'manual' | 'history'>('scan');
  
  // Local lists
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>(() => db.getInventory(brand));
  const [purchasesList, setPurchasesList] = useState<Purchase[]>(() => db.getPurchases(brand));
  const [toastMessageLocal, setToastMessageLocal] = useState<string | null>(null);

  const refreshComponentData = () => {
    setInventoryList(db.getInventory(brand));
    setPurchasesList(db.getPurchases(brand));
  };

  React.useEffect(() => {
    refreshComponentData();
    return db.subscribe(refreshComponentData);
  }, [brand]);

  const triggerToast = (msg: string) => {
    setToastMessageLocal(msg);
    setTimeout(() => setToastMessageLocal(null), 3000);
  };

  // --- MANUAL FORM STATE ---
  const [dealerName, setDealerName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [manualLines, setManualLines] = useState<NewPurchaseLineItem[]>([
    { part_no: '', part_name: '', hsn: '', quantity: 1, mrp: 0 }
  ]);

  const handleAddManualLine = () => {
    setManualLines([...manualLines, { part_no: '', part_name: '', hsn: '', quantity: 1, mrp: 0 }]);
  };

  const handleUpdateManualLine = (idx: number, field: keyof NewPurchaseLineItem, val: any) => {
    setManualLines(manualLines.map((l, i) => {
      if (i === idx) {
        return { ...l, [field]: val };
      }
      return l;
    }));
  };

  const handleRemoveManualLine = (idx: number) => {
    if (manualLines.length === 1) return;
    setManualLines(manualLines.filter((_, i) => i !== idx));
  };

  // Calculate manual math
  const manualSubtotal = useMemo(() => {
    return manualLines.reduce((acc, l) => acc + (l.quantity * l.mrp), 0);
  }, [manualLines]);

  const handleSaveManualPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealerName || !invoiceNo || !invoiceDate) {
      alert("Dealer details and Invoice details are mandatory");
      return;
    }

    try {
      db.createPurchase(
        brand,
        dealerName,
        invoiceNo,
        invoiceDate,
        manualSubtotal,
        discountPercentage,
        manualLines,
        'manual',
        user
      );

      // Clean
      setDealerName('');
      setInvoiceNo('');
      setInvoiceDate('');
      setDiscountPercentage(0);
      setManualLines([{ part_no: '', part_name: '', hsn: '', quantity: 1, mrp: 0 }]);

      refreshComponentData();
      triggerToast(`Saved purchase invoice ${invoiceNo} and synced to stock successfully!`);
    } catch (err: any) {
      alert(err.message);
    }
  };


  // --- AI SCANNER STATE ---
  const [isScanning, setIsScanning] = useState(false);
  const [scanDealer, setScanDealer] = useState('Anand Motors Wholesale');
  const [scanInvoiceNo, setScanInvoiceNo] = useState('INV-2026-8971');
  const [scanInvoiceDate, setScanInvoiceDate] = useState('2026-06-05');
  const [scanDiscount, setScanDiscount] = useState<number>(12); // Detected discount percentage from invoice
  const [scannedFilesLoaded, setScannedFilesLoaded] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  
  // Parsed Items lists
  const [scanRows, setScanRows] = useState<ParsedAIScanRow[]>([]);

  // Safe date parsing helper
  const parseSafeDate = (dateStr: string): string => {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const partsSlash = dateStr.split('/');
    if (partsSlash.length === 3) {
      const [d, m, y] = partsSlash;
      if (y?.length === 4 && m?.length <= 2 && d?.length <= 2) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch (e) {}
    return new Date().toISOString().split('T')[0];
  };

  const handleSelectFiles = (filesList: File[] | FileList) => {
    const list = Array.from(filesList);
    setUploadedFiles(prev => {
      const updated = [...prev];
      list.forEach(file => {
        const id = Math.random().toString(36).substring(2, 9);
        let previewUrl = '';
        if (file.type.startsWith('image/')) {
          previewUrl = URL.createObjectURL(file);
        }
        updated.push({ id, file, previewUrl });
      });
      return updated;
    });
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => {
      const found = prev.find(item => item.id === id);
      if (found && found.previewUrl) {
        URL.revokeObjectURL(found.previewUrl);
      }
      return prev.filter(item => item.id !== id);
    });
  };

  const handleClearAllFiles = () => {
    uploadedFiles.forEach(item => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setUploadedFiles([]);
  };

  const handleAddTemplateFile = (fileName: string) => {
    const suffix = fileName.split('.').pop() || 'pdf';
    const mimeType = suffix === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    const f = new File(["mock-content"], fileName, { type: mimeType });
    handleSelectFiles([f]);
    triggerToast(`Added ${fileName} to the scan staging list.`);
  };

  // Simulation templates as secondary / fallback mechanism
  const triggerSimulationOfScan = (fileName: string) => {
    setIsScanning(true);
    setScannedFilesLoaded(false);
    
    setTimeout(() => {
      setIsScanning(false);
      setScannedFilesLoaded(true);

      const isHundai = brand === 'Hyundai';
      
      if (fileName.includes('xlsx') || fileName.includes('excel')) {
        setScanDealer(isHundai ? 'Hyundai India Parts Corp' : 'Mahindra Logistics Spares');
        setScanInvoiceNo(`EX-${isHundai ? 'HY' : 'MA'}-5091`);
        setScanInvoiceDate('2026-06-01');
        setScanDiscount(12); // Exact 12%!
        
        const mParts: ParsedAIScanRow[] = isHundai ? [
          { part_no: 'HY-10023', part_name: 'Hyundai Elite i20 Front Brake Pads', hsn: '87083000', quantity: 20, mrp: 2450, isNewPart: false },
          { part_no: 'HY-20150', part_name: 'Hyundai Grand i10 Air Filter', hsn: '84213100', quantity: 50, mrp: 450, isNewPart: false },
          { part_no: 'HY-99933', part_name: 'Hyundai Alcazar Front Grill Cover', hsn: '87088019', quantity: 5, mrp: 3500, isNewPart: true }
        ] : [
          { part_no: 'MA-10201', part_name: 'Mahindra Scorpio S11 Front Brake Rotor', hsn: '87083000', quantity: 15, mrp: 3400, isNewPart: false },
          { part_no: 'MA-20199', part_name: 'Mahindra Thar Diesel Fuel Filter', hsn: '84212300', quantity: 30, mrp: 1850, isNewPart: false },
          { part_no: 'MA-99110', part_name: 'Mahindra Scorpio Bonnet Support Strut', hsn: '87082910', quantity: 10, mrp: 980, isNewPart: true }
        ];
        
        setScanRows(mParts);
      } else {
        setScanDealer('Kunal Motor Distributors (Wholesale)');
        setScanInvoiceNo(`PDF-S-${Math.floor(1000 + Math.random() * 9000)}`);
        setScanInvoiceDate('2026-06-05');
        setScanDiscount(Math.random() > 0.5 ? 12 : 10);
        
        const mParts: ParsedAIScanRow[] = isHundai ? [
          { part_no: 'HY-30440', part_name: 'Hyundai Verna Clutch Disc Plate', hsn: '87089300', quantity: 10, mrp: 5200, isNewPart: false },
          { part_no: 'HY-40992', part_name: 'Hyundai Creta Oil Filter', hsn: '84212300', quantity: 100, mrp: 320, isNewPart: false }
        ] : [
          { part_no: 'MA-30310', part_name: 'Mahindra Bolero Air Filter Element', hsn: '84213100', quantity: 25, mrp: 620, isNewPart: false },
          { part_no: 'MA-40224', part_name: 'Mahindra XUV500 Clutch Cover Assembly', hsn: '87089300', quantity: 6, mrp: 8900, isNewPart: false }
        ];

        setScanRows(mParts);
      }
      
      triggerToast("Simulated scan completed successfully!");
    }, 1800);
  };

  // Real scan processor with integrated fallback
  const handleStartMultiAIScan = async () => {
    if (uploadedFiles.length === 0) {
      alert("No bills or pages selected for scanning. Please upload some files first.");
      return;
    }
    setIsScanning(true);
    setScannedFilesLoaded(false);

    try {
      const filesEncryptedPromises = uploadedFiles.map(item => {
        return new Promise<{ fileBase64: string; mimeType: string; name: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const resultSrc = e.target?.result as string;
            if (!resultSrc) {
              reject(new Error(`Could not load context of file: ${item.file.name}`));
              return;
            }
            const commaIdx = resultSrc.indexOf(',');
            const fileBase64 = commaIdx > -1 ? resultSrc.substring(commaIdx + 1) : resultSrc;
            const mimeType = item.file.type || "image/jpeg";
            resolve({ fileBase64, mimeType, name: item.file.name });
          };
          reader.onerror = () => reject(new Error(`Error reading file: ${item.file.name}`));
          reader.readAsDataURL(item.file);
        });
      });

      const processedFilesList = await Promise.all(filesEncryptedPromises);

      console.log(`Posting ${processedFilesList.length} files to server-side scan proxy...`);
      const res = await fetch("/api/gemini/scan-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ files: processedFilesList })
      });

      if (!res.ok) {
        const rawText = await res.text().catch(() => "");
        let errorMsg = `Server HTTP Error ${res.status}`;
        try {
          const parsed = JSON.parse(rawText);
          if (parsed && parsed.error) {
            errorMsg = parsed.error;
          }
        } catch {
          const cleanText = rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (cleanText) {
            errorMsg = `Server HTTP Error ${res.status}: ${cleanText.substring(0, 300)}`;
          } else {
            errorMsg = `Server Error status ${res.status}`;
          }
        }
        throw new Error(errorMsg);
      }

      const payload = await res.json();
      if (!payload.success || !payload.data) {
        throw new Error(payload.error || "Structured data extraction parsed empty target.");
      }

      const scanData = payload.data;
      setScanDealer(scanData.dealerName || "Extracted Dealer Name");
      setScanInvoiceNo(scanData.invoiceNumber || `AI-${Math.floor(1000 + Math.random() * 9000)}`);
      setScanInvoiceDate(parseSafeDate(scanData.invoiceDate));

      const rawItems = scanData.items || [];
      const avgDiscount = rawItems.length > 0 
        ? Math.round(rawItems.reduce((acc: number, item: any) => acc + (item.discountPercent || 0), 0) / rawItems.length) 
        : 12;
      setScanDiscount(avgDiscount);

      const parsedRows: ParsedAIScanRow[] = rawItems.map((item: any) => {
        const pNo = String(item.partNumber || "").trim().toUpperCase();
        const pName = String(item.name || "").trim();
        const qty = Number(item.quantity) || 1;
        const priceMrp = Number(item.mrp) || 0;
        const isMatched = inventoryList.some(inv => inv.part_no.toLowerCase() === pNo.toLowerCase());
        
        return {
          part_no: pNo,
          part_name: pName,
          hsn: "87089900", // Automobile parts standard code fallback
          quantity: qty,
          mrp: priceMrp,
          isNewPart: !isMatched
        };
      });

      setScanRows(parsedRows);
      setScannedFilesLoaded(true);
      triggerToast(`Live AI multi-page invoice processed! Scanned ${processedFilesList.length} pages. Powered by ${payload.modelUsed}`);

    } catch (err: any) {
      console.warn("AI Scanning Engine fallback triggered:", err.message);
      alert(`Notice: Live AI process was unresolved: ${err.message || "Unknown error"}. Falling back to simulated scan data.`);
      
      const primaryFileName = uploadedFiles[0]?.file.name || 'procurement_bill.pdf';
      triggerSimulationOfScan(primaryFileName);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileUpload = (file: File) => {
    // Legacy support fallback
    handleSelectFiles([file]);
  };

  const handleAIScanRowChange = (index: number, field: keyof ParsedAIScanRow, val: any) => {
    setScanRows(scanRows.map((row, i) => {
      if (i === index) {
        const copy = { ...row, [field]: val };
        // Check dynamically if matches schema inventory
        if (field === 'part_no') {
          const mat = inventoryList.some(inv => inv.part_no.toLowerCase() === String(val).trim().toLowerCase());
          copy.isNewPart = !mat;
        }
        return copy;
      }
      return row;
    }));
  };

  // Math Calculations for Scanning AI
  const scanSubtotal = useMemo(() => {
    return scanRows.reduce((acc, row) => acc + (row.quantity * row.mrp), 0);
  }, [scanRows]);

  // Total pre-discount
  const totalBeforeDiscount = scanSubtotal;
  // Total after 12% discount
  const totalAfter12Discount = scanSubtotal * 0.88; 
  // Custom discount final amount
  const actualScanFinalAmount = scanSubtotal - (scanSubtotal * (scanDiscount / 100));

  const is12DiscountMatched = Math.abs(scanDiscount - 12) < 0.01;

  const handleAIScanCompleteSync = () => {
    if (scanRows.length === 0) return;
    if (!scanDealer || !scanInvoiceNo || !scanInvoiceDate) {
      alert("Header fields are required before syncing.");
      return;
    }

    try {
      db.createPurchase(
        brand,
        scanDealer,
        scanInvoiceNo,
        scanInvoiceDate,
        scanSubtotal,
        scanDiscount,
        scanRows,
        'image',
        user
      );

      // Clean
      setScanRows([]);
      setScannedFilesLoaded(false);
      
      refreshComponentData();
      triggerToast(`Successfully validated and synced AI scanned invoice ${scanInvoiceNo}!`);
      setActiveTab('history');
    } catch (err: any) {
      alert(err.message);
    }
  };


  // --- HISTORY VIEW MODE ---
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);

  const purchaseItemsAssociated = useMemo(() => {
    if (!viewingPurchase) return [];
    const all = db.getPurchaseItems(brand);
    return all.filter(pi => pi.purchase_id === viewingPurchase.id);
  }, [viewingPurchase, brand]);

  const handleDeleteSyncedInvoice = (pId: string) => {
    const p = purchasesList.find(x => x.id === pId);
    if (!p) return;
    const confirmed = window.confirm(`WARNING: Deleting purchase invoice ${p.invoice_no} will automatically subtract original parts quantity counts from active stock lists. This cannot be undone. Proceed?`);
    if (!confirmed) return;

    try {
      db.deletePurchase(brand, pId, user);
      refreshComponentData();
      setViewingPurchase(null);
      triggerToast(`Deducted quantities from stock and deleted invoice ${p.invoice_no}!`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">

      {/* Global Toast */}
      {toastMessageLocal && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-pulse mt-15">
          <Sparkles className="w-4.5 h-4.5 text-yellow-400" />
          {toastMessageLocal}
        </div>
      )}

      {/* Modular navigation tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('scan')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'scan'
              ? 'border-indigo-600 text-indigo-650'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-indigo-500" />
          AI Scanner Upload
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'manual'
              ? 'border-indigo-600 text-indigo-650'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Plus className="w-4 h-4" />
          Manual Purchase Ledger
        </button>
        <button
          onClick={() => {
            setActiveTab('history');
            refreshComponentData();
          }}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-indigo-600 text-indigo-650'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          Purchase &amp; Dealer History
        </button>
      </div>

      {activeTab === 'scan' && (
        <div className="space-y-6">
          
          {/* File scan uploader board */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Automated AI Multi-Page Invoice processing</h3>
            <p className="text-xs text-slate-500 mb-4">
              Upload multiple invoice images/pages or bills for consolidated AI multi-page extraction. Sparezy AI instantly merges the pages, categorizes parts, quantities, discounts, and runs live stock validations.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Drop area */}
              <div className="border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-2xl p-6 text-center bg-slate-50 hover:bg-slate-100/55 cursor-pointer flex flex-col justify-center items-center transition relative min-h-[140px]">
                <input 
                  type="file" 
                  multiple
                  accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) handleSelectFiles(files);
                  }}
                />
                
                <UploadCloud className="w-9 h-9 text-indigo-500 mb-2" />
                <p className="font-bold text-slate-800 text-xs">Drag &amp; drop invoice pages/images here</p>
                <p className="text-[10px] text-slate-400 mt-1">or click to browse from device (Multiple selection allowed)</p>
              </div>

              {/* Sample Quick Demo Files / Simulation Templates */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 flex flex-col justify-between">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Stage Simulated Multi-Page Parts Bills
                  </h4>
                  <p className="text-[10px] text-slate-450 leading-relaxed font-semibold">
                    Click to load mock parts lists into the queue, demonstrating how the system organizes multi-page uploads.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => handleAddTemplateFile('Hyundai_Main_Parts_Air_Spark.xlsx')}
                    className="p-2 border border-slate-200 hover:border-indigo-400 bg-white rounded-xl text-left font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Page 1: parts_table_A.xlsx</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddTemplateFile('Mahindra_Dealer_Invoices_99.pdf')}
                    className="p-2 border border-slate-200 hover:border-indigo-400 bg-white rounded-xl text-left font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition"
                  >
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    <span>Page 2: invoice_B.pdf</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Display list of added/staged pages */}
            {uploadedFiles.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      {uploadedFiles.length}
                    </span>
                    <h4 className="text-xs font-bold text-slate-705">Staged Bill Pages / Uploaded Images</h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAllFiles}
                    className="text-[10px] text-rose-600 hover:text-rose-800 font-extrabold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Stage Queue
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-1">
                  {uploadedFiles.map((item, idx) => {
                    const isImg = item.file.type.startsWith('image/');
                    return (
                      <div key={item.id} className="relative group rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between">
                        {/* Remove Hover Layer */}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(item.id)}
                          className="absolute top-1 right-1 z-10 bg-rose-500 hover:bg-rose-600 text-white p-1 rounded-full opacity-90 hover:opacity-100 shadow-sm transition cursor-pointer"
                          title="Remove page"
                        >
                          <X className="w-3 h-3" />
                        </button>

                        {/* File Preview */}
                        <div className="bg-slate-50 h-24 flex items-center justify-center border-b border-slate-100 overflow-hidden relative">
                          {isImg ? (
                            <img
                              src={item.previewUrl}
                              alt={item.file.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-slate-400">
                              {item.file.name.endsWith('.xlsx') ? (
                                <FileSpreadsheet className="w-8 h-8 text-emerald-505" />
                              ) : (
                                <FileText className="w-8 h-8 text-indigo-405" />
                              )}
                              <span className="text-[9px] uppercase font-bold text-slate-500">
                                {item.file.name.split('.').pop()}
                              </span>
                            </div>
                          )}

                          {/* Page index indicator badge */}
                          <div className="absolute bottom-1 left-1 bg-slate-900/80 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                            P. {idx + 1}
                          </div>
                        </div>

                        {/* File details footer */}
                        <div className="p-2 bg-white text-center">
                          <p className="text-[10px] font-bold text-slate-700 truncate" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <p className="text-[8px] text-slate-400 font-mono font-bold">
                            {(item.file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Scan Action Controls */}
                <div className="pt-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleStartMultiAIScan}
                    disabled={isScanning || uploadedFiles.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-6 py-3 rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Sparkles className="w-4 h-4 text-amber-305 animate-pulse" />
                    <span>Start AI Scanning of {uploadedFiles.length} {uploadedFiles.length === 1 ? 'Page' : 'Pages'}</span>
                  </button>
                </div>
              </div>
            )}

            {isScanning && (
              <div className="mt-6 p-6 border border-indigo-100 bg-indigo-50/50 rounded-2xl text-center flex flex-col items-center justify-center space-y-2 animate-fade-in">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"></div>
                <p className="font-bold text-indigo-900 text-xs animate-pulse">
                  Sparezy AI is compiling multiple document headers, running text segmentation, and scanning cross-page part tables...
                </p>
                <p className="text-[10px] text-indigo-650 font-semibold">This takes a few seconds to parse all requested pages together using Gemini.</p>
              </div>
            )}
          </div>

          {/* Parsed Pre-Sync Table */}
          {scannedFilesLoaded && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-4 gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                    <CheckSquare className="w-4.5 h-4.5 text-indigo-600" />
                    Editable AI Recognition Invoice Metadata
                  </h3>
                  <p className="text-xs text-slate-400">Review, amend, and check price-matches before syncing to inventory</p>
                </div>

                {/* 12% discount alert */}
                <div className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                  is12DiscountMatched 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-250' 
                    : 'bg-amber-50 text-amber-800 border-amber-250'
                }`}>
                  <ShieldAlert className="w-4.5 h-4.5" />
                  <div>
                    <span className="block font-bold">12% Dealer Discount Status</span>
                    <span className="font-normal text-[10px] block">
                      {is12DiscountMatched 
                        ? 'Passed: Exact 12% Dealer markdown applied.' 
                        : `Attention: Scam discount differs (${scanDiscount}% found).`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Editable Scanned header fields */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-semibold text-slate-700">
                <div>
                  <label className="block text-slate-500 mb-1">Detected Dealer Name</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-slate-200 rounded-xl"
                    value={scanDealer}
                    onChange={(e) => setScanDealer(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Invoice Number ID</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-mono uppercase"
                    value={scanInvoiceNo}
                    onChange={(e) => setScanInvoiceNo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    className="w-full p-2.5 border border-slate-200 rounded-xl"
                    value={scanInvoiceDate}
                    onChange={(e) => setScanInvoiceDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Calculated Invoice Discount (%)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-slate-200 rounded-xl"
                    value={scanDiscount}
                    onChange={(e) => setScanDiscount(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Scanned spare parts table list */}
              <div className="overflow-x-auto pt-2">
                <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold">
                  <thead className="bg-slate-50 text-slate-550 uppercase text-[9px]">
                    <tr>
                      <th className="p-3">Matched Status</th>
                      <th className="p-3">Part No</th>
                      <th className="p-3">Part Name</th>
                      <th className="p-3">HSN Code</th>
                      <th className="p-3 text-center">Qty to Add</th>
                      <th className="p-3 text-center">MRP (INR)</th>
                      <th className="p-3 text-right">Row Total</th>
                      <th className="p-3 text-center">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-705">
                    {scanRows.map((row, idx) => {
                      const totalRow = row.quantity * row.mrp;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-3">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              row.isNewPart 
                                ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                : 'bg-emerald-100 text-emerald-850 border border-emerald-250'
                            }`}>
                              {row.isNewPart ? 'New Part' : 'Matched'}
                            </span>
                          </td>
                          <td className="p-3 font-mono">
                            <input
                              type="text"
                              className="w-24 p-1 border border-slate-200 rounded text-xs uppercase text-slate-900 font-bold"
                              value={row.part_no}
                              onChange={(e) => handleAIScanRowChange(idx, 'part_no', e.target.value)}
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              className="w-48 p-1 border border-slate-200 rounded text-xs"
                              value={row.part_name}
                              onChange={(e) => handleAIScanRowChange(idx, 'part_name', e.target.value)}
                            />
                          </td>
                          <td className="p-3 font-mono">
                            <input
                              type="text"
                              className="w-20 p-1 border border-slate-200 rounded text-xs text-slate-500"
                              value={row.hsn}
                              onChange={(e) => handleAIScanRowChange(idx, 'hsn', e.target.value)}
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              className="w-14 p-1 border border-slate-200 rounded text-center text-xs"
                              value={row.quantity}
                              onChange={(e) => handleAIScanRowChange(idx, 'quantity', Number(e.target.value))}
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              className="w-16 p-1 border border-slate-200 rounded text-center text-xs"
                              value={row.mrp}
                              onChange={(e) => handleAIScanRowChange(idx, 'mrp', Number(e.target.value))}
                            />
                          </td>
                          <td className="p-3 text-right">₹{totalRow.toFixed(2)}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setScanRows(scanRows.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Calculations summaries drawer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                <div className="p-4 bg-slate-50 rounded-2xl flex flex-col justify-center space-y-1 text-slate-500 text-xs">
                  <p className="flex justify-between">
                    <span>Total before Discount:</span>
                    <span className="font-mono font-bold text-slate-800">₹{totalBeforeDiscount.toFixed(2)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Invoice Discount Amount ({scanDiscount}%):</span>
                    <span className="font-mono text-amber-700 font-bold">-₹{(scanSubtotal * (scanDiscount / 100)).toFixed(2)}</span>
                  </p>
                  <p className="flex justify-between border-t border-slate-200 pt-1 text-indigo-700 font-bold text-sm">
                    <span>Adjusted Pay Total:</span>
                    <span className="font-mono">₹{actualScanFinalAmount.toFixed(2)}</span>
                  </p>
                </div>

                <div className="bg-indigo-50 border border-indigo-150 p-4 rounded-2xl space-y-3 flex flex-col justify-between">
                  <div className="flex items-start gap-2 text-xs text-indigo-900 font-medium leading-tight">
                    <BadgeInfo className="w-4.5 h-4.5 text-indigo-650 shrink-0 mt-0.5" />
                    <span>
                      Verifying at standard dealer value: After 12% discount value is <b className="font-black text-indigo-950">₹{totalAfter12Discount.toFixed(2)}</b>.
                    </span>
                  </div>

                  <button
                    onClick={handleAIScanCompleteSync}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-black shadow transition cursor-pointer text-center"
                  >
                    Confirm &amp; Sync Scanned Parts to Inventory
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>
      )}

      {activeTab === 'manual' && (
        <form onSubmit={handleSaveManualPurchase} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <h3 className="text-sm font-bold text-slate-900">Add Purchase Invoice manually</h3>

          {/* Manual header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-semibold text-slate-700">
            <div>
              <label className="block text-slate-500 mb-1">Dealer Name</label>
              <input
                type="text"
                required
                className="w-full p-2.5 border border-slate-200 rounded-xl"
                placeholder="e.g. Paramount wholesale Spares"
                value={dealerName}
                onChange={(e) => setDealerName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Invoice Number</label>
              <input
                type="text"
                required
                className="w-full p-2.5 border border-slate-200 rounded-xl"
                placeholder="e.g. INV-10091"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Invoice Date</label>
              <input
                type="date"
                required
                className="w-full p-2.5 border border-slate-200 rounded-xl"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Dealer discount percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-mono"
                value={discountPercentage || ''}
                onChange={(e) => setDiscountPercentage(Number(e.target.value))}
              />
            </div>
          </div>

          {/* lines edit */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Line Items</h4>
            
            <div className="space-y-3.5 text-xs font-semibold">
              {manualLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  
                  <div className="sm:col-span-2">
                    <label className="block text-slate-450 text-[10px] mb-1">Part No (Identity)</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded-xl uppercase font-mono"
                      placeholder="HY-2391"
                      required
                      value={line.part_no}
                      onChange={(e) => handleUpdateManualLine(idx, 'part_no', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-slate-450 text-[10px] mb-1">Spare Part Name</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded-xl"
                      placeholder="e.g. Rear Spring Bush kit"
                      required
                      value={line.part_name}
                      onChange={(e) => handleUpdateManualLine(idx, 'part_name', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-450 text-[10px] mb-1">HSN Code</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                      placeholder="87083000"
                      value={line.hsn}
                      onChange={(e) => handleUpdateManualLine(idx, 'hsn', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-slate-450 text-[10px] mb-1">Quantity</label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded-xl text-center"
                      min="1"
                      placeholder="10"
                      required
                      value={line.quantity}
                      onChange={(e) => handleUpdateManualLine(idx, 'quantity', Number(e.target.value))}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-450 text-[10px] mb-1">Part MRP (INR)</label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded-xl text-right font-mono"
                      min="0.01"
                      step="0.01"
                      placeholder="950"
                      required
                      value={line.mrp || ''}
                      onChange={(e) => handleUpdateManualLine(idx, 'mrp', Number(e.target.value))}
                    />
                  </div>

                  <div className="sm:col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveManualLine(idx)}
                      className="p-2 text-rose-500 hover:text-rose-700 bg-slate-50 hover:bg-rose-50 rounded-xl border border-transparent"
                    >
                      <X className="w-4 h-4 mx-auto" />
                    </button>
                  </div>

                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddManualLine}
              className="text-xs font-bold text-indigo-650 hover:text-indigo-800 hover:underline flex items-center gap-1 mt-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Another Line Item
            </button>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-600">Calculated Subtotal: ₹{manualSubtotal.toFixed(2)}</span>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadowcursor-pointer"
            >
              Save &amp; Sync Sync Purchase
            </button>
          </div>

        </form>
      )}

      {activeTab === 'history' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* History table list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden lg:col-span-2">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs">
              Registered procurement Invoices List
            </div>

            <div className="overflow-x-auto text-xs font-semibold text-slate-600">
              <table className="min-w-full divide-y divide-slate-100 text-left">
                <thead className="bg-slate-100/50 text-slate-500 uppercase text-[9px] tracking-wider">
                  <tr>
                    <th className="p-3">Invoice No</th>
                    <th className="p-3">Dealer</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Source</th>
                    <th className="p-3 text-right">Sum amount</th>
                    <th className="p-3 text-right">Utility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-705">
                  {purchasesList.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-bold text-slate-900">{p.invoice_no}</td>
                      <td className="p-3 font-semibold text-slate-800">{p.dealer_name}</td>
                      <td className="p-3 text-slate-500">{new Date(p.invoice_date).toLocaleDateString()}</td>
                      <td className="p-3 uppercase text-[9px] mt-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {p.scan_source}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">₹{p.total_after_discount.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right flex justify-end gap-1">
                        <button
                          onClick={() => setViewingPurchase(p)}
                          className="p-1 text-indigo-650 hover:bg-indigo-50 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSyncedInvoice(p.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {purchasesList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-normal">
                        No purchases recorded in {brand} schema yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dynamic Side Viewer */}
          <div>
            {viewingPurchase ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs font-semibold text-slate-700">
                <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Invoice Details</span>
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">{viewingPurchase.invoice_no}</h4>
                    <p className="text-[11px] text-slate-500 mt-1">{viewingPurchase.dealer_name}</p>
                  </div>
                  <button 
                    onClick={() => setViewingPurchase(null)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-450"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1 text-[11px] leading-relaxed">
                  <p className="flex justify-between">
                    <span className="text-slate-400">Invoice Date:</span>
                    <span>{new Date(viewingPurchase.invoice_date).toLocaleDateString()}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-400">Import Source:</span>
                    <span className="uppercase">{viewingPurchase.scan_source}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-400">Pre-Discount total:</span>
                    <span className="font-mono">₹{viewingPurchase.subtotal.toFixed(2)}</span>
                  </p>
                  <p className="flex justify-between text-indigo-700 font-bold text-xs pt-1 border-t border-slate-200">
                    <span>Discounted Total ({viewingPurchase.dealer_discount_percentage}%):</span>
                    <span className="font-mono">₹{viewingPurchase.total_after_discount.toFixed(2)}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Included parts list</span>
                  <div className="bg-slate-50 rounded-xl p-2.5 space-y-2 divide-y divide-slate-150 max-h-[30vh] overflow-y-auto">
                    {purchaseItemsAssociated.map((pi) => (
                      <div key={pi.id} className="pt-2 flex justify-between gap-1 leading-normal text-[11px]">
                        <div>
                          <p className="font-mono font-bold text-slate-900">{pi.part_no}</p>
                          <p className="text-[10px] text-slate-400 font-normal">{pi.part_name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-slate-800">{pi.quantity} units</p>
                          <p className="text-[10px] text-slate-400">@ ₹{pi.mrp}</p>
                        </div>
                      </div>
                    ))}
                    {purchaseItemsAssociated.length === 0 && (
                      <p className="text-center py-4 text-slate-400 text-[11px] font-normal">No items related to this invoice found.</p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteSyncedInvoice(viewingPurchase.id)}
                  className="w-full bg-red-100 hover:bg-rose-600 hover:text-white text-red-700 py-2 rounded-xl text-xs font-bold font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Invoice &amp; Restore Stock
                </button>

              </div>
            ) : (
              <div className="border border-dashed border-slate-200 p-8 rounded-2xl text-center text-slate-400 text-xs font-normal">
                Click "Eye" icon near any registered invoice to load details &amp; items.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
