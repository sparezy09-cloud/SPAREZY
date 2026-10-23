import React, { useState, useMemo, useEffect } from 'react';
import { Brand, User, ScanSource, Purchase, PurchaseItem, InventoryItem, isOwnerOrAdmin } from '../types';
import { db } from '../dbStore';
import { optimizeFileForEgress } from '../lib/imageOptimizer';
import { 
  FileText, UploadCloud, Search, Calendar, CheckSquare, Sparkles, 
  Trash2, Plus, X, Eye, FileSpreadsheet, ShieldAlert, BadgeInfo, Zap,
  CheckCircle2, Archive, PlusCircle, ArrowUpRight, ArrowDownRight, 
  TrendingUp, TrendingDown, ToggleLeft, ToggleRight, Check, AlertCircle,
  Sliders, RefreshCw, ArrowRight
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
  update_mrp?: boolean;
}

export type ScanMatchStatus = 'matched' | 'archived' | 'new';

interface ParsedAIScanRow {
  part_no: string;
  part_name: string;
  hsn: string;
  quantity: number;
  mrp: number; // Current scanned/edited invoice MRP
  currentInventoryMrp?: number; // Existing inventory MRP in database
  mrpDiff: number; // Difference: mrp - currentInventoryMrp
  updateMrp: boolean; // Admin toggle: whether to update inventory MRP to this invoice MRP
  matchStatus: ScanMatchStatus;
  isNewPart?: boolean;
}

export default function PurchaseModule({ brand, user }: PurchaseModuleProps) {
  const [activeTab, setActiveTab] = useState<'scan' | 'manual' | 'history'>('scan');
  
  // Local lists
  const [allInventoryList, setAllInventoryList] = useState<InventoryItem[]>(() => db.getInventory(brand, true));
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>(() => db.getInventory(brand));
  const [purchasesList, setPurchasesList] = useState<Purchase[]>(() => db.getPurchases(brand));
  const [toastMessageLocal, setToastMessageLocal] = useState<string | null>(null);
  const isAdmin = isOwnerOrAdmin(user?.role);

  const refreshComponentData = () => {
    setAllInventoryList(db.getInventory(brand, true));
    setInventoryList(db.getInventory(brand));
    setPurchasesList(db.getPurchases(brand));
  };

  // Helper to determine scanned part status:
  // - Matched with active part: 'matched'
  // - Found in archived part: 'archived'
  // - Not matched: 'new'
  const getPartMatchStatus = (partNo: string, allInv: InventoryItem[]): ScanMatchStatus => {
    const clean = String(partNo || '').trim().toLowerCase();
    if (!clean) return 'new';
    const found = allInv.find(inv => inv.part_no.trim().toLowerCase() === clean);
    if (!found) return 'new';
    if (found.is_active === false) return 'archived';
    return 'matched';
  };

  // Helper to enrich a scanned or entered part with MRP variance and matching intelligence:
  const enrichParsedRow = (
    row: { part_no: string; part_name?: string; hsn?: string; quantity: number; mrp: number; updateMrp?: boolean },
    allInv: InventoryItem[]
  ): ParsedAIScanRow => {
    const clean = String(row.part_no || '').trim().toLowerCase();
    const found = allInv.find(inv => inv.part_no.trim().toLowerCase() === clean);
    const status: ScanMatchStatus = !found ? 'new' : (found.is_active === false ? 'archived' : 'matched');
    const currentMrp = found ? Number(found.mrp) || 0 : undefined;
    const scannedMrp = Number(row.mrp) || 0;
    const diff = currentMrp !== undefined ? (scannedMrp - currentMrp) : 0;

    return {
      part_no: String(row.part_no || '').trim().toUpperCase(),
      part_name: String(row.part_name || (found ? found.part_name : '')).trim(),
      hsn: String(row.hsn || (found?.hsn ? found.hsn : '87089900')).trim(),
      quantity: Number(row.quantity) || 1,
      mrp: scannedMrp,
      currentInventoryMrp: currentMrp,
      mrpDiff: diff,
      updateMrp: row.updateMrp !== undefined ? row.updateMrp : true,
      matchStatus: status,
      isNewPart: status === 'new'
    };
  };

  React.useEffect(() => {
    refreshComponentData();
    return db.subscribe(refreshComponentData);
  }, [brand]);

  const triggerToast = (msg: string) => {
    setToastMessageLocal(msg);
    setTimeout(() => setToastMessageLocal(null), 3000);
  };

  // MRP Toggle & Filter state for scanned review
  const [globalUpdateMrp, setGlobalUpdateMrp] = useState<boolean>(true);
  const [rowMrpFilter, setRowMrpFilter] = useState<'all' | 'changed' | 'matched' | 'new'>('all');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [updateManualMrp, setUpdateManualMrp] = useState<boolean>(true);

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

  const handleSaveManualPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealerName || !invoiceNo || !invoiceDate) {
      alert("Dealer details and Invoice details are mandatory");
      return;
    }

    try {
      await db.createPurchase(
        brand,
        dealerName,
        invoiceNo,
        invoiceDate,
        manualSubtotal,
        discountPercentage,
        manualLines.map(l => ({
          ...l,
          update_mrp: l.update_mrp !== undefined ? l.update_mrp : updateManualMrp
        })),
        'manual',
        user,
        updateManualMrp
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
      const currentAllInv = db.getInventory(brand, true);
      const activeParts = currentAllInv.filter(i => i.is_active !== false);
      let archivedPart = currentAllInv.find(i => i.is_active === false);

      // If no archived part exists yet in memory, create a realistic archived spare part
      // so testing simulation immediately demonstrates Matched, Archived, and New
      if (!archivedPart) {
        const demoArch: InventoryItem = {
          id: `arch-demo-${isHundai ? 'hy' : 'ma'}-${Date.now()}`,
          part_no: isHundai ? 'HY-ARCH-304' : 'MA-ARCH-508',
          part_name: isHundai ? 'Hyundai Santro Legacy Archived Fuel Pump' : 'Mahindra Bolero Legacy Archived Valve',
          hsn: '84213100',
          quantity: 0,
          mrp: 1450,
          brand,
          is_active: false,
          archived_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        currentAllInv.push(demoArch);
        archivedPart = demoArch;
        setAllInventoryList([...currentAllInv]);
      }

      const activePart1 = activeParts[0];
      const activePart2 = activeParts[1];
      
      if (fileName.includes('xlsx') || fileName.includes('excel')) {
        setScanDealer(isHundai ? 'Hyundai India Parts Corp' : 'Mahindra Logistics Spares');
        setScanInvoiceNo(`EX-${isHundai ? 'HY' : 'MA'}-5091`);
        setScanInvoiceDate('2026-06-01');
        setScanDiscount(12); // Exact 12%!
        
        const rawList = isHundai ? [
          {
            part_no: activePart1 ? activePart1.part_no : 'HY-10023',
            part_name: activePart1 ? activePart1.part_name : 'Hyundai Elite i20 Front Brake Pads',
            hsn: activePart1?.hsn || '87083000',
            quantity: 20,
            mrp: (activePart1?.mrp || 2450) + 300 // Price increased!
          },
          {
            part_no: activePart2 ? activePart2.part_no : 'HY-20150',
            part_name: activePart2 ? activePart2.part_name : 'Hyundai Grand i10 Oil Filter Cartridge',
            hsn: activePart2?.hsn || '84212300',
            quantity: 12,
            mrp: Math.max(100, (activePart2?.mrp || 450) - 50) // Price decreased!
          },
          {
            part_no: archivedPart.part_no,
            part_name: archivedPart.part_name,
            hsn: archivedPart.hsn || '84213100',
            quantity: 15,
            mrp: archivedPart.mrp || 1450 // Same MRP
          },
          {
            part_no: `HY-NEW-${Math.floor(1000 + Math.random() * 9000)}`,
            part_name: 'Hyundai Alcazar Front Grill Cover',
            hsn: '87088019',
            quantity: 5,
            mrp: 3500 // New part
          }
        ] : [
          {
            part_no: activePart1 ? activePart1.part_no : 'MA-10201',
            part_name: activePart1 ? activePart1.part_name : 'Mahindra Scorpio S11 Front Brake Rotor',
            hsn: activePart1?.hsn || '87083000',
            quantity: 15,
            mrp: (activePart1?.mrp || 3400) + 450 // Price increased!
          },
          {
            part_no: activePart2 ? activePart2.part_no : 'MA-20190',
            part_name: activePart2 ? activePart2.part_name : 'Mahindra Thar Wiper Blade Set',
            hsn: activePart2?.hsn || '85129000',
            quantity: 8,
            mrp: Math.max(100, (activePart2?.mrp || 850) - 80) // Price decreased!
          },
          {
            part_no: archivedPart.part_no,
            part_name: archivedPart.part_name,
            hsn: archivedPart.hsn || '84213100',
            quantity: 12,
            mrp: archivedPart.mrp || 1450 // Same MRP
          },
          {
            part_no: `MA-NEW-${Math.floor(1000 + Math.random() * 9000)}`,
            part_name: 'Mahindra Scorpio Bonnet Support Strut',
            hsn: '87082910',
            quantity: 10,
            mrp: 980 // New part
          }
        ];
        
        const mParts: ParsedAIScanRow[] = rawList.map(item => enrichParsedRow(item, currentAllInv));
        setScanRows(mParts);
      } else {
        setScanDealer('Kunal Motor Distributors (Wholesale)');
        setScanInvoiceNo(`PDF-S-${Math.floor(1000 + Math.random() * 9000)}`);
        setScanInvoiceDate('2026-06-05');
        setScanDiscount(Math.random() > 0.5 ? 12 : 10);
        
        const rawList = isHundai ? [
          {
            part_no: activePart1 ? activePart1.part_no : 'HY-30440',
            part_name: activePart1 ? activePart1.part_name : 'Hyundai Verna Clutch Disc Plate',
            hsn: activePart1?.hsn || '87089300',
            quantity: 10,
            mrp: (activePart1?.mrp || 5200) + 350 // Price increased!
          },
          {
            part_no: activePart2 ? activePart2.part_no : 'HY-40210',
            part_name: activePart2 ? activePart2.part_name : 'Hyundai Santro Spark Plug Set',
            hsn: activePart2?.hsn || '85111000',
            quantity: 15,
            mrp: Math.max(100, (activePart2?.mrp || 680) - 60) // Price decreased!
          },
          {
            part_no: archivedPart.part_no,
            part_name: archivedPart.part_name,
            hsn: archivedPart.hsn || '84213100',
            quantity: 8,
            mrp: archivedPart.mrp || 1450 // Same MRP
          },
          {
            part_no: `HY-NEW-${Math.floor(1000 + Math.random() * 9000)}`,
            part_name: 'Hyundai Creta High Flow Air Intake',
            hsn: '84212300',
            quantity: 25,
            mrp: 1320 // New part
          }
        ] : [
          {
            part_no: activePart1 ? activePart1.part_no : 'MA-30310',
            part_name: activePart1 ? activePart1.part_name : 'Mahindra Bolero Air Filter Element',
            hsn: activePart1?.hsn || '84213100',
            quantity: 25,
            mrp: (activePart1?.mrp || 620) + 80 // Price increased!
          },
          {
            part_no: activePart2 ? activePart2.part_no : 'MA-40110',
            part_name: activePart2 ? activePart2.part_name : 'Mahindra XUV500 Cabin AC Filter',
            hsn: activePart2?.hsn || '84213920',
            quantity: 12,
            mrp: Math.max(100, (activePart2?.mrp || 950) - 100) // Price decreased!
          },
          {
            part_no: archivedPart.part_no,
            part_name: archivedPart.part_name,
            hsn: archivedPart.hsn || '84213100',
            quantity: 10,
            mrp: archivedPart.mrp || 1450 // Same MRP
          },
          {
            part_no: `MA-NEW-${Math.floor(1000 + Math.random() * 9000)}`,
            part_name: 'Mahindra XUV700 Radiator Mounting Bracket',
            hsn: '87089300',
            quantity: 6,
            mrp: 2900 // New part
          }
        ];

        const mParts: ParsedAIScanRow[] = rawList.map(item => enrichParsedRow(item, currentAllInv));
        setScanRows(mParts);
      }
      
      triggerToast("Simulated scan completed successfully!");
    }, 1800);
  };

  // Real scan processor with integrated egress optimization & fallback
  const handleStartMultiAIScan = async () => {
    if (uploadedFiles.length === 0) {
      alert("No bills or pages selected for scanning. Please upload some files first.");
      return;
    }
    setIsScanning(true);
    setScannedFilesLoaded(false);

    try {
      console.log(`[Egress Optimizer] Pre-compressing ${uploadedFiles.length} file(s) on client before transmission...`);
      const optimizationResults = await Promise.all(
        uploadedFiles.map(item => optimizeFileForEgress(item.file, 1800, 0.82))
      );

      const totalOriginalBytes = optimizationResults.reduce((acc, r) => acc + r.originalSize, 0);
      const totalOptimizedBytes = optimizationResults.reduce((acc, r) => acc + r.optimizedSize, 0);
      const egressSavedPct = totalOriginalBytes > 0 
        ? Math.round(((totalOriginalBytes - totalOptimizedBytes) / totalOriginalBytes) * 100)
        : 0;

      if (egressSavedPct > 0) {
        console.log(`[Egress Optimizer] Payload compressed: ${(totalOriginalBytes / (1024 * 1024)).toFixed(2)} MB -> ${(totalOptimizedBytes / (1024 * 1024)).toFixed(2)} MB (${egressSavedPct}% network egress saved)`);
        triggerToast(`⚡ Egress Optimized: Reduced upload by ${egressSavedPct}% (~${((totalOriginalBytes - totalOptimizedBytes) / 1024).toFixed(0)} KB saved)`);
      }

      const processedFilesList = optimizationResults.map(r => ({
        fileBase64: r.fileBase64,
        mimeType: r.mimeType,
        name: r.name
      }));

      const requestHeaders = {
        "Content-Type": "application/json"
      };
      const requestPayload = { files: processedFilesList };

      console.log("[DETAILED AI SCAN FRONTEND REQUEST BUILD] Preparing /api/gemini/scan-invoice request:", {
        url: "/api/gemini/scan-invoice",
        headers: requestHeaders,
        payloadFileCount: processedFilesList.length,
        payloadTotalSizeCharacters: JSON.stringify(requestPayload).length,
        filesMetadata: processedFilesList.map(f => ({ name: f.name, size: f.fileBase64.length, mimeType: f.mimeType }))
      });

      console.log(`Posting ${processedFilesList.length} files to server-side scan proxy...`);
      const res = await fetch("/api/gemini/scan-invoice", {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestPayload)
      });

      if (!res.ok) {
        const errorResponseBodyText = await res.text().catch(() => "Could not extract error response body text");
        console.error(`[AI CLIENT SCAN HTTP ERROR] Server returned status ${res.status}. Response Body Text:`, errorResponseBodyText);
        
        let extractedErrorMsg = `Server HTTP Error ${res.status}`;
        try {
          const parsedErr = JSON.parse(errorResponseBodyText);
          if (parsedErr && parsedErr.error) {
            extractedErrorMsg = parsedErr.error;
          }
        } catch (_) {}
        
        throw new Error(`${extractedErrorMsg} | Status: ${res.status} | Body: ${errorResponseBodyText}`);
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

      const allInvCurrent = db.getInventory(brand, true);
      const parsedRows: ParsedAIScanRow[] = rawItems.map((item: any) => {
        const pNo = String(item.partNumber || "").trim().toUpperCase();
        const pName = String(item.name || "").trim();
        const qty = Number(item.quantity) || 1;
        const priceMrp = Number(item.mrp) || 0;
        return enrichParsedRow({
          part_no: pNo,
          part_name: pName,
          hsn: String(item.hsn || "87089900"),
          quantity: qty,
          mrp: priceMrp
        }, allInvCurrent);
      });

      setScanRows(parsedRows);
      setScannedFilesLoaded(true);
      triggerToast(`Live AI multi-page invoice processed! Scanned ${processedFilesList.length} pages. Powered by ${payload.modelUsed}`);

    } catch (err: any) {
      console.error("[DETAILED AI SCAN CLIENT EXCEPTION]", err);
      console.warn("AI Scanning Engine fallback triggered. Root Cause:", err.message || err);
      
      const detailedErrorMessage = err.message || "Unknown Connection/Network Failure";
      alert(`Notice: Live AI process was unresolved because of key structure, endpoint limit, or payload size. \n\nExact Error: ${detailedErrorMessage}\n\nFalling back to simulated scan data.`);
      
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
    const currentInv = db.getInventory(brand, true);
    setScanRows(prevRows => prevRows.map((row, i) => {
      if (i === index) {
        const copy = { ...row, [field]: val };
        if (field === 'part_no') {
          const clean = String(val || '').trim().toLowerCase();
          const found = currentInv.find(inv => inv.part_no.trim().toLowerCase() === clean);
          copy.matchStatus = !found ? 'new' : (found.is_active === false ? 'archived' : 'matched');
          copy.isNewPart = copy.matchStatus === 'new';
          copy.currentInventoryMrp = found ? Number(found.mrp) || 0 : undefined;
          copy.mrpDiff = copy.currentInventoryMrp !== undefined ? (copy.mrp - copy.currentInventoryMrp) : 0;
          if (found && !copy.part_name) copy.part_name = found.part_name;
          if (found?.hsn && !copy.hsn) copy.hsn = found.hsn;
        } else if (field === 'mrp') {
          const numVal = Math.max(0, Number(val) || 0);
          copy.mrp = numVal;
          copy.mrpDiff = copy.currentInventoryMrp !== undefined ? (numVal - copy.currentInventoryMrp) : 0;
        }
        return copy;
      }
      return row;
    }));
  };

  const handleToggleRowMrp = (index: number) => {
    setScanRows(prevRows => prevRows.map((row, i) => {
      if (i === index) {
        return { ...row, updateMrp: !row.updateMrp };
      }
      return row;
    }));
  };

  const handleToggleAllMrp = (val: boolean) => {
    setGlobalUpdateMrp(val);
    setScanRows(prevRows => prevRows.map(row => ({ ...row, updateMrp: val })));
    triggerToast(val ? "Enabled MRP update for all parts." : "Disabled MRP update for all parts (stock MRP kept).");
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

  const mrpStats = useMemo(() => {
    let increased = 0;
    let decreased = 0;
    let unchanged = 0;
    let newParts = 0;
    let totalUpdateToggled = 0;

    scanRows.forEach(r => {
      if (r.updateMrp) totalUpdateToggled++;
      if (r.matchStatus === 'new') {
        newParts++;
      } else if (r.mrpDiff > 0) {
        increased++;
      } else if (r.mrpDiff < 0) {
        decreased++;
      } else {
        unchanged++;
      }
    });

    return {
      total: scanRows.length,
      changed: increased + decreased,
      increased,
      decreased,
      unchanged,
      newParts,
      totalUpdateToggled
    };
  }, [scanRows]);

  const filteredScanRows = useMemo(() => {
    return scanRows.map((row, originalIndex) => ({ row, originalIndex })).filter(({ row }) => {
      if (rowMrpFilter === 'changed') {
        if (row.currentInventoryMrp === undefined || row.mrpDiff === 0) return false;
      } else if (rowMrpFilter === 'matched') {
        if (row.currentInventoryMrp === undefined || row.mrpDiff !== 0) return false;
      } else if (rowMrpFilter === 'new') {
        if (row.matchStatus !== 'new') return false;
      }

      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        const pNo = row.part_no.toLowerCase();
        const pName = row.part_name.toLowerCase();
        return pNo.includes(q) || pName.includes(q);
      }

      return true;
    });
  }, [scanRows, rowMrpFilter, tableSearch]);

  const handleAIScanCompleteSync = async () => {
    if (scanRows.length === 0) return;
    if (!scanDealer || !scanInvoiceNo || !scanInvoiceDate) {
      alert("Header fields are required before syncing.");
      return;
    }

    const mrpUpdatesCount = scanRows.filter(r => r.updateMrp && ((r.currentInventoryMrp !== undefined && r.mrp !== r.currentInventoryMrp) || r.isNewPart)).length;

    try {
      await db.createPurchase(
        brand,
        scanDealer,
        scanInvoiceNo,
        scanInvoiceDate,
        scanSubtotal,
        scanDiscount,
        scanRows.map(r => ({
          part_no: r.part_no,
          part_name: r.part_name,
          quantity: r.quantity,
          mrp: r.mrp,
          hsn: r.hsn,
          is_new_part: r.isNewPart,
          update_mrp: r.updateMrp
        })),
        'image',
        user,
        globalUpdateMrp
      );

      // Clean
      setScanRows([]);
      setScannedFilesLoaded(false);
      
      refreshComponentData();
      triggerToast(`Validated & synced invoice ${scanInvoiceNo}! ${mrpUpdatesCount > 0 ? `Updated ${mrpUpdatesCount} inventory MRPs.` : 'Stock added to inventory.'}`);
      setActiveTab('history');
    } catch (err: any) {
      alert(err.message);
    }
  };


  // --- HISTORY VIEW MODE ---
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPerPage = 15;

  const totalHistoryPages = Math.ceil(purchasesList.length / historyPerPage) || 1;

  const paginatedPurchasesList = useMemo(() => {
    const startIndex = (historyPage - 1) * historyPerPage;
    return purchasesList.slice(startIndex, startIndex + historyPerPage);
  }, [purchasesList, historyPage, historyPerPage]);

  useEffect(() => {
    setHistoryPage(1);
  }, [brand]);

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

              {/* Invoice MRP Intelligence & Admin Update Controls Banner */}
              <div className="bg-gradient-to-r from-indigo-50 via-sky-50 to-emerald-50 border border-indigo-200/80 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950">Invoice MRP Intelligence &amp; Catalog Sync</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full border border-indigo-200">
                          {isAdmin ? 'Admin Mode: Full Edit &amp; Toggle Enabled' : 'View Only Mode'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                        Scanned invoice MRPs are compared against current inventory stock. Differences are highlighted below. 
                        {isAdmin ? ' As an Admin, you can edit invoice MRPs in the table and toggle whether to update the catalog MRP upon sync.' : ' Catalog updates require Admin permission.'}
                      </p>
                    </div>
                  </div>

                  {/* Master Admin Toggle */}
                  {isAdmin && (
                    <div className="flex items-center gap-2.5 bg-white/90 backdrop-blur px-3 py-2 rounded-xl border border-indigo-150 shadow-xs shrink-0">
                      <div className="text-right">
                        <span className="block text-[11px] font-black text-slate-800">Auto-Update Catalog MRPs</span>
                        <span className="block text-[9px] text-slate-500 font-medium">Applies to all matched rows</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleAllMrp(!globalUpdateMrp)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all shadow-xs cursor-pointer ${
                          globalUpdateMrp 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700' 
                            : 'bg-slate-200 hover:bg-slate-300 text-slate-700 border border-slate-300'
                        }`}
                        title="Toggle all rows to update or protect catalog MRP"
                      >
                        {globalUpdateMrp ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-emerald-200" />
                            <span>ALL ON</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-slate-400" />
                            <span>ALL OFF</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* MRP Variance Stats Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-2 border-t border-indigo-100/80 text-[11px]">
                  <div className="bg-white/80 p-2 rounded-xl border border-slate-200/80 flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Total Scanned</span>
                    <span className="text-sm font-black text-slate-900 font-mono">{mrpStats.total} <span className="text-[10px] text-slate-450 font-normal">parts</span></span>
                  </div>
                  <div className="bg-emerald-50/80 p-2 rounded-xl border border-emerald-200/80 flex flex-col">
                    <span className="text-[10px] text-emerald-700 uppercase font-bold flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-600" /> Price Increased
                    </span>
                    <span className="text-sm font-black text-emerald-800 font-mono">{mrpStats.increased} <span className="text-[10px] font-normal">items</span></span>
                  </div>
                  <div className="bg-rose-50/80 p-2 rounded-xl border border-rose-200/80 flex flex-col">
                    <span className="text-[10px] text-rose-700 uppercase font-bold flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-rose-600" /> Price Decreased
                    </span>
                    <span className="text-sm font-black text-rose-800 font-mono">{mrpStats.decreased} <span className="text-[10px] font-normal">items</span></span>
                  </div>
                  <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200/80 flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                      <Check className="w-3 h-3 text-slate-400" /> Same Price
                    </span>
                    <span className="text-sm font-black text-slate-700 font-mono">{mrpStats.unchanged} <span className="text-[10px] font-normal">items</span></span>
                  </div>
                  <div className="bg-blue-50/80 p-2 rounded-xl border border-blue-200/80 flex flex-col">
                    <span className="text-[10px] text-blue-700 uppercase font-bold flex items-center gap-1">
                      <PlusCircle className="w-3 h-3 text-blue-600" /> New Parts
                    </span>
                    <span className="text-sm font-black text-blue-800 font-mono">{mrpStats.newParts} <span className="text-[10px] font-normal">items</span></span>
                  </div>
                  <div className="bg-indigo-50/80 p-2 rounded-xl border border-indigo-200/80 flex flex-col">
                    <span className="text-[10px] text-indigo-700 uppercase font-bold flex items-center gap-1">
                      <Sliders className="w-3 h-3 text-indigo-600" /> Will Update MRP
                    </span>
                    <span className="text-sm font-black text-indigo-900 font-mono">{mrpStats.totalUpdateToggled} / {scanRows.length}</span>
                  </div>
                </div>
              </div>

              {/* Filter Toolbar & Search */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-450 font-bold uppercase text-[10px] mr-1">Filter:</span>
                  <button
                    type="button"
                    onClick={() => setRowMrpFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      rowMrpFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-650 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    All Parts ({scanRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowMrpFilter('changed')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      rowMrpFilter === 'changed'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white text-slate-650 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <TrendingUp className="w-3 h-3" />
                    <span>Price Changed ({mrpStats.changed})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowMrpFilter('matched')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      rowMrpFilter === 'matched'
                        ? 'bg-slate-700 text-white shadow-xs'
                        : 'bg-white text-slate-650 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <Check className="w-3 h-3" />
                    <span>Same Price ({mrpStats.unchanged})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowMrpFilter('new')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      rowMrpFilter === 'new'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-650 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>New ({mrpStats.newParts})</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search part no / name..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="pl-8 pr-2.5 py-1 text-xs border border-slate-200 rounded-lg w-48 focus:outline-none focus:border-indigo-500 bg-white"
                  />
                  {tableSearch && (
                    <button
                      type="button"
                      onClick={() => setTableSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Review Table */}
              <div className="overflow-x-auto pt-1 rounded-xl border border-slate-200 shadow-2xs bg-white">
                <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold">
                  <thead className="bg-slate-50 text-slate-550 uppercase text-[9px] tracking-wider">
                    <tr>
                      <th className="p-3">Status</th>
                      <th className="p-3">Part No</th>
                      <th className="p-3">Part Name</th>
                      <th className="p-3">HSN Code</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">
                        <div>System MRP</div>
                        <div className="text-[8px] font-normal text-slate-400 capitalize">In Database</div>
                      </th>
                      <th className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span>Invoice MRP</span>
                          <span className="text-[8px] px-1 py-0.2 bg-indigo-100 text-indigo-700 rounded font-normal">Editable</span>
                        </div>
                        <div className="text-[8px] font-normal text-slate-400 capitalize">Scanned / Bill</div>
                      </th>
                      <th className="p-3 text-center">MRP Difference</th>
                      <th className="p-3 text-center">
                        <div>Update MRP?</div>
                        <div className="text-[8px] font-normal text-slate-400 capitalize">Admin Toggle</div>
                      </th>
                      <th className="p-3 text-right">Row Total</th>
                      <th className="p-3 text-center">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-705">
                    {filteredScanRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400">
                          No items match the selected filter or search term.
                        </td>
                      </tr>
                    ) : (
                      filteredScanRows.map(({ row, originalIndex }) => {
                        const totalRow = row.quantity * row.mrp;
                        const hasCurrentMrp = row.currentInventoryMrp !== undefined;
                        const diff = row.mrpDiff;
                        const pct = hasCurrentMrp && (row.currentInventoryMrp || 0) > 0 
                          ? ((Math.abs(diff) / (row.currentInventoryMrp || 1)) * 100).toFixed(1) 
                          : '0';

                        return (
                          <tr 
                            key={originalIndex} 
                            className={`hover:bg-slate-50/70 transition-colors ${
                              diff > 0 
                                ? 'bg-emerald-50/20' 
                                : diff < 0 
                                ? 'bg-rose-50/20' 
                                : ''
                            }`}
                          >
                            {/* Match Status */}
                            <td className="p-3">
                              {row.matchStatus === 'matched' && (
                                <span 
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs"
                                  title="Matched with an active inventory part"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>Matched</span>
                                </span>
                              )}
                              {row.matchStatus === 'archived' && (
                                <span 
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300 shadow-xs"
                                  title="Part is in archived parts. Syncing will unarchive it with incoming stock."
                                >
                                  <Archive className="w-3 h-3 text-purple-600 shrink-0" />
                                  <span>Archived</span>
                                </span>
                              )}
                              {row.matchStatus === 'new' && (
                                <span 
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 shadow-xs"
                                  title="Part not found in inventory. Syncing will register it as a new active part."
                                >
                                  <PlusCircle className="w-3 h-3 text-blue-600 shrink-0" />
                                  <span>New</span>
                                </span>
                              )}
                            </td>

                            {/* Part No */}
                            <td className="p-3 font-mono">
                              <input
                                type="text"
                                className="w-24 p-1 border border-slate-200 rounded text-xs uppercase text-slate-900 font-bold focus:border-indigo-500 focus:outline-none"
                                value={row.part_no}
                                onChange={(e) => handleAIScanRowChange(originalIndex, 'part_no', e.target.value)}
                              />
                            </td>

                            {/* Part Name */}
                            <td className="p-3">
                              <input
                                type="text"
                                className="w-44 p-1 border border-slate-200 rounded text-xs focus:border-indigo-500 focus:outline-none"
                                value={row.part_name}
                                onChange={(e) => handleAIScanRowChange(originalIndex, 'part_name', e.target.value)}
                              />
                            </td>

                            {/* HSN */}
                            <td className="p-3 font-mono">
                              <input
                                type="text"
                                className="w-20 p-1 border border-slate-200 rounded text-xs text-slate-500 focus:border-indigo-500 focus:outline-none"
                                value={row.hsn}
                                onChange={(e) => handleAIScanRowChange(originalIndex, 'hsn', e.target.value)}
                              />
                            </td>

                            {/* Qty */}
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min="1"
                                className="w-14 p-1 border border-slate-200 rounded text-center text-xs focus:border-indigo-500 focus:outline-none font-mono"
                                value={row.quantity}
                                onChange={(e) => handleAIScanRowChange(originalIndex, 'quantity', Number(e.target.value))}
                              />
                            </td>

                            {/* Current System MRP in Database */}
                            <td className="p-3 text-right font-mono">
                              {hasCurrentMrp ? (
                                <div className="space-y-0.5">
                                  <span className="font-bold text-slate-700">₹{(row.currentInventoryMrp || 0).toFixed(2)}</span>
                                  <span className="block text-[9px] text-slate-400 font-normal">in catalog</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">— Not in Stock —</span>
                              )}
                            </td>

                            {/* Scanned/Edited Invoice MRP (Editable input) */}
                            <td className="p-3 text-right">
                              <div className="inline-flex items-center gap-1 border border-indigo-200 rounded-lg p-0.5 bg-indigo-50/40 focus-within:border-indigo-500 focus-within:bg-white transition-all">
                                <span className="text-[10px] text-indigo-500 font-mono font-bold pl-1">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="w-20 p-1 bg-transparent text-right text-xs font-mono font-black text-slate-900 focus:outline-none"
                                  value={row.mrp}
                                  onChange={(e) => handleAIScanRowChange(originalIndex, 'mrp', Number(e.target.value))}
                                  title="Editable Invoice MRP: Modifying this will recalculate MRP variance and bill totals immediately"
                                />
                              </div>
                            </td>

                            {/* Highlighted Difference Badge */}
                            <td className="p-3 text-center">
                              {row.matchStatus === 'new' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
                                  <PlusCircle className="w-3 h-3 text-blue-600 shrink-0" />
                                  <span>New Part (₹{row.mrp.toFixed(2)})</span>
                                </span>
                              ) : diff > 0 ? (
                                <span 
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-100 text-emerald-850 border border-emerald-300 shadow-2xs"
                                  title={`Price Increased: Invoice is ₹${diff.toFixed(2)} (+${pct}%) higher than inventory MRP`}
                                >
                                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>+₹{diff.toFixed(2)}</span>
                                  <span className="text-[9px] font-medium opacity-75">(+{pct}%)</span>
                                </span>
                              ) : diff < 0 ? (
                                <span 
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-100 text-rose-850 border border-rose-300 shadow-2xs"
                                  title={`Price Decreased: Invoice is ₹${Math.abs(diff).toFixed(2)} (-${pct}%) lower than inventory MRP`}
                                >
                                  <TrendingDown className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  <span>-₹{Math.abs(diff).toFixed(2)}</span>
                                  <span className="text-[9px] font-medium opacity-75">(-{pct}%)</span>
                                </span>
                              ) : (
                                <span 
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-650 border border-slate-200"
                                  title="Invoice MRP matches current inventory MRP exactly"
                                >
                                  <Check className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>Same Price</span>
                                </span>
                              )}
                            </td>

                            {/* Admin Toggle: Update MRP? */}
                            <td className="p-3 text-center">
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleRowMrp(originalIndex)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all shadow-2xs cursor-pointer ${
                                    row.updateMrp
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300'
                                  }`}
                                  title={row.updateMrp 
                                    ? `Click to toggle OFF: Will keep old MRP (₹${row.currentInventoryMrp?.toFixed(2) || '0.00'}) in catalog` 
                                    : `Click to toggle ON: Will update catalog MRP to invoice MRP (₹${row.mrp.toFixed(2)}) on sync`
                                  }
                                >
                                  {row.updateMrp ? (
                                    <>
                                      <ToggleRight className="w-4 h-4 text-emerald-200" />
                                      <span>UPDATE</span>
                                    </>
                                  ) : (
                                    <>
                                      <ToggleLeft className="w-4 h-4 text-slate-400" />
                                      <span>KEEP OLD</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span 
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                    row.updateMrp ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                  }`}
                                  title="Only Admin can modify MRP sync policy"
                                >
                                  {row.updateMrp ? 'Will Update' : 'Protected'}
                                </span>
                              )}
                            </td>

                            {/* Row Total */}
                            <td className="p-3 text-right font-mono font-bold text-slate-800">
                              ₹{totalRow.toFixed(2)}
                            </td>

                            {/* Remove Row */}
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => setScanRows(scanRows.filter((_, i) => i !== originalIndex))}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                                title="Remove row from this invoice"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Calculations summaries drawer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                <div className="p-4 bg-slate-50 rounded-2xl flex flex-col justify-center space-y-1.5 text-slate-600 text-xs">
                  <p className="flex justify-between">
                    <span>Total before Discount (Sum of Invoice MRPs):</span>
                    <span className="font-mono font-bold text-slate-900">₹{totalBeforeDiscount.toFixed(2)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Invoice Discount ({scanDiscount}%):</span>
                    <span className="font-mono text-amber-700 font-bold">-₹{(scanSubtotal * (scanDiscount / 100)).toFixed(2)}</span>
                  </p>
                  <p className="flex justify-between border-t border-slate-200 pt-1 text-indigo-700 font-bold text-sm">
                    <span>Adjusted Pay Total:</span>
                    <span className="font-mono">₹{actualScanFinalAmount.toFixed(2)}</span>
                  </p>
                  <p className="text-[10px] text-slate-450 pt-0.5">
                    12% standard dealer benchmark: <b className="text-slate-700 font-mono">₹{totalAfter12Discount.toFixed(2)}</b>
                  </p>
                </div>

                <div className="bg-gradient-to-br from-indigo-50 via-white to-sky-50 border border-indigo-200 p-4 rounded-2xl space-y-3 flex flex-col justify-between shadow-xs">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between text-indigo-950 font-black">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        <span>Ready to Sync Stock &amp; Update MRPs</span>
                      </span>
                      <span className="text-[11px] font-mono font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                        +{scanRows.reduce((acc, r) => acc + r.quantity, 0)} units
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-tight">
                      {mrpStats.totalUpdateToggled > 0 ? (
                        <>
                          <b className="text-emerald-700 font-black">{mrpStats.totalUpdateToggled} part(s)</b> will have their retail catalog MRP updated to the invoice MRP and logged into MRP History.
                        </>
                      ) : (
                        <>Catalog MRPs are protected — no inventory retail prices will be modified.</>
                      )}
                    </p>
                  </div>

                  <button
                    onClick={handleAIScanCompleteSync}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all cursor-pointer text-center flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>
                      Confirm &amp; Sync Invoice ({scanRows.length} Parts{mrpStats.totalUpdateToggled > 0 ? ` • ${mrpStats.totalUpdateToggled} MRPs Updated` : ''})
                    </span>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Line Items</h4>
              {isAdmin ? (
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    checked={updateManualMrp}
                    onChange={(e) => setUpdateManualMrp(e.target.checked)}
                  />
                  <span>Auto-Update Catalog MRP to invoice MRP on save</span>
                </label>
              ) : (
                <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                  Invoice MRP is used for purchase totals only • Inventory MRP protected
                </span>
              )}
            </div>
            
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
                    <label className="block text-slate-450 text-[10px] mb-1">Invoice MRP (INR)</label>
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
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow transition cursor-pointer"
            >
              Save &amp; Sync Purchase {updateManualMrp ? '(With MRP Update)' : ''}
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
                  {paginatedPurchasesList.map((p) => (
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
                  {paginatedPurchasesList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-normal">
                        No purchases recorded in {brand} schema yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalHistoryPages > 1 && (
              <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between">
                <span className="text-slate-500 text-[11px] font-semibold">
                  Page <strong className="text-slate-800">{historyPage}</strong> of <strong className="text-slate-800">{totalHistoryPages}</strong> ({purchasesList.length} total purchases)
                </span>
                <div className="inline-flex gap-1.5 text-[11px] font-bold">
                  <button
                    onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                    disabled={historyPage === 1}
                    className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xs transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setHistoryPage(prev => Math.min(totalHistoryPages, prev + 1))}
                    disabled={historyPage === totalHistoryPages}
                    className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xs transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
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
