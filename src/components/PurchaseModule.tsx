import React, { useState, useMemo, useEffect } from 'react';
import { Brand, User, ScanSource, Purchase, PurchaseItem, InventoryItem, PurchaseBill, PurchaseBillItem, PartMatchStatus } from '../types';
import { db } from '../dbStore';
import * as XLSX from 'xlsx';
import { 
  FileText, UploadCloud, Search, Calendar, CheckSquare, Sparkles, 
  Trash2, Plus, X, Eye, FileSpreadsheet, ShieldAlert, BadgeInfo,
  AlertTriangle, ZoomIn, Image as ImageIcon, CheckCircle, RefreshCw, Layers, ArrowRight, Check, Percent
} from 'lucide-react';
import { compressAndCreateThumbnail } from '../utils/imageCompress';

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
  isArchivedMatched?: boolean;
  sellingPrice?: number;
  category?: string;
  action?: 'create' | 'reactivate' | 'match' | 'skip';
}

export default function PurchaseModule({ brand, user }: PurchaseModuleProps) {
  const [activeTab, setActiveTab] = useState<'scan' | 'manual' | 'history'>('scan');
  
  // Local lists
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [toastMessageLocal, setToastMessageLocal] = useState<string | null>(null);

  const refreshComponentData = () => {
    setInventoryList(db.getInventory(brand));
    setV2BillsList(db.getPurchaseBills(brand));
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
  const [scanDiscount, setScanDiscount] = useState<number>(() => db.getBrandDiscount(brand)); // Detected or fixed brand discount
  const [billStatedTotal, setBillStatedTotal] = useState<number>(0);
  const [scannedFilesLoaded, setScannedFilesLoaded] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  
  // Image compression & preview states (Egress optimization)
  const [compressionStats, setCompressionStats] = useState<{ originalKB: number; compressedKB: number; savedPercent: number } | null>(null);
  const [currentThumbnailUrl, setCurrentThumbnailUrl] = useState<string | null>(null);
  const [currentFullImageUrl, setCurrentFullImageUrl] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  
  // Parsed Items lists
  const [scanRows, setScanRows] = useState<ParsedAIScanRow[]>([]);
  
  // Version 2 Purchase Bills state
  const [v2BillsList, setV2BillsList] = useState<PurchaseBill[]>([]);
  const [viewingPurchaseBill, setViewingPurchaseBill] = useState<{ bill: PurchaseBill; items: PurchaseBillItem[] } | null>(null);
  const [historySubTab, setHistorySubTab] = useState<'bills' | 'purchases'>('bills');

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

  // Real scan processor with integrated image compression (Egress optimization) & fallback
  const handleStartMultiAIScan = async () => {
    if (uploadedFiles.length === 0) {
      alert("No bills or pages selected for scanning. Please upload some files first.");
      return;
    }
    setIsScanning(true);
    setScannedFilesLoaded(false);

    try {
      let totalOriginalBytes = 0;
      let totalCompressedBytes = 0;
      let primaryThumb: string | null = null;
      let primaryFull: string | null = null;

      const filesEncryptedPromises = uploadedFiles.map(async (item) => {
        if (item.file.type.startsWith('image/')) {
          const comp = await compressAndCreateThumbnail(item.file, 1600, 400, 0.75);
          totalOriginalBytes += comp.originalSizeBytes;
          totalCompressedBytes += comp.compressedSizeBytes;
          if (!primaryThumb) {
            primaryThumb = comp.thumbnailDataUrl;
            primaryFull = comp.compressedDataUrl;
          }
          return {
            fileBase64: comp.compressedBase64,
            mimeType: comp.mimeType,
            name: item.file.name
          };
        } else {
          // PDF or Spreadsheet
          totalOriginalBytes += item.file.size;
          totalCompressedBytes += item.file.size;
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
              const mimeType = item.file.type || "application/pdf";
              resolve({ fileBase64, mimeType, name: item.file.name });
            };
            reader.onerror = () => reject(new Error(`Error reading file: ${item.file.name}`));
            reader.readAsDataURL(item.file);
          });
        }
      });

      const processedFilesList = await Promise.all(filesEncryptedPromises);

      // Record Egress Savings
      if (totalOriginalBytes > 0 && totalCompressedBytes < totalOriginalBytes) {
        setCompressionStats({
          originalKB: Math.round(totalOriginalBytes / 1024),
          compressedKB: Math.round(totalCompressedBytes / 1024),
          savedPercent: Math.max(1, Math.round((1 - totalCompressedBytes / totalOriginalBytes) * 100))
        });
      } else {
        setCompressionStats(null);
      }
      setCurrentThumbnailUrl(primaryThumb);
      setCurrentFullImageUrl(primaryFull);

      const requestHeaders = {
        "Content-Type": "application/json"
      };
      const requestPayload = { files: processedFilesList };

      console.log(`Posting ${processedFilesList.length} files to server-side scan proxy (Egress optimized)...`);
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

      // Rule: Always apply the fixed brand rate: Hyundai: 12.00%, Mahindra: 19.36%
      const fixedRate = db.getBrandDiscount(brand);
      setScanDiscount(fixedRate);

      // Extracted stated total from supplier bill
      if (typeof scanData.billStatedTotal === 'number' && scanData.billStatedTotal > 0) {
        setBillStatedTotal(scanData.billStatedTotal);
      } else {
        setBillStatedTotal(0);
      }

      const rawItems = scanData.items || [];
      
      // OPTIMIZED: Fetch ONLY the scanned part numbers to minimize database read egress
      const partNos = rawItems.map((it: any) => String(it.partNumber || "").trim().toUpperCase()).filter(Boolean);
      if (partNos.length > 0) {
        await db.ensureLocalInventoryCacheForParts(brand, partNos);
      }
      
      const freshInventory = db.getInventory(brand);
      setInventoryList(freshInventory);

      const parsedRows: ParsedAIScanRow[] = rawItems.map((item: any) => {
        const pNo = String(item.partNumber || "").trim().toUpperCase();
        const pName = String(item.name || "").trim();
        const qty = Number(item.quantity) || 1;
        const priceMrp = Number(item.mrp) || 0;
        const matchPart = freshInventory.find(inv => inv.part_no.toLowerCase() === pNo.toLowerCase());
        const isMatched = !!matchPart;
        const isArchivedMatched = matchPart ? !matchPart.is_active : false;
        
        return {
          part_no: pNo,
          part_name: pName,
          hsn: "87089900", // Automobile parts standard code fallback
          quantity: qty,
          mrp: priceMrp,
          isNewPart: !isMatched,
          isArchivedMatched,
          sellingPrice: priceMrp,
          category: 'General',
          action: !isMatched ? 'create' : isArchivedMatched ? 'reactivate' : 'match'
        };
      });

      setScanRows(parsedRows);
      setScannedFilesLoaded(true);
      triggerToast(`Live AI invoice processed! ${processedFilesList.length} pages scanned with Egress optimization. Model: ${payload.modelUsed}`);

    } catch (err: any) {
      console.error("[DETAILED AI SCAN CLIENT EXCEPTION]", err);
      console.warn("AI Scanning Engine fallback triggered. Root Cause:", err.message || err);
      
      const detailedErrorMessage = err.message || "Unknown Connection/Network Failure";
      alert(`Notice: Live AI process encountered an issue: ${detailedErrorMessage}\n\nFalling back to simulated scan data.`);
      
      const primaryFileName = uploadedFiles[0]?.file.name || 'procurement_bill.pdf';
      triggerSimulationOfScan(primaryFileName);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileUpload = (file: File) => {
    handleSelectFiles([file]);
  };

  const handleAIScanRowChange = async (index: number, field: keyof ParsedAIScanRow, val: any) => {
    const updatedRows = await Promise.all(scanRows.map(async (row, i) => {
      if (i === index) {
        const copy = { ...row, [field]: val };
        // Check dynamically if matches schema inventory
        if (field === 'part_no') {
          const partNoClean = String(val).trim().toUpperCase();
          await db.ensureLocalInventoryCacheForParts(brand, [partNoClean]);
          const freshInventory = db.getInventory(brand);
          const mat = freshInventory.find(inv => inv.part_no.toLowerCase() === partNoClean.toLowerCase());
          copy.isNewPart = !mat;
          copy.isArchivedMatched = mat ? !mat.is_active : false;
          copy.action = !mat ? 'create' : (mat.is_active ? 'match' : 'reactivate');
        }
        return copy;
      }
      return row;
    }));
    setScanRows(updatedRows);
  };

  // Math Calculations for Scanning AI
  const scanSubtotal = useMemo(() => {
    return scanRows.reduce((acc, row) => acc + (row.quantity * row.mrp), 0);
  }, [scanRows]);

  // Fixed Brand Discount (Hyundai: 12%, Mahindra: 19.36%)
  const fixedBrandDiscount = db.getBrandDiscount(brand);
  const discountAmount = scanSubtotal * (fixedBrandDiscount / 100);
  const totalAfterDiscount = scanSubtotal - discountAmount;
  
  // Custom discount final amount for manual override
  const actualScanFinalAmount = scanSubtotal - (scanSubtotal * (scanDiscount / 100));

  // Price Mismatch Check
  const effectiveBillTotal = billStatedTotal > 0 ? billStatedTotal : totalAfterDiscount;
  const isPriceMismatched = billStatedTotal > 0 && Math.abs(totalAfterDiscount - billStatedTotal) > 5;
  const priceDifference = Math.abs(totalAfterDiscount - effectiveBillTotal);

  const handleAIScanCompleteSync = async () => {
    if (scanRows.length === 0) return;
    if (!scanDealer || !scanInvoiceNo || !scanInvoiceDate) {
      alert("Header fields are required before syncing.");
      return;
    }

    const activeRows = scanRows.filter(r => r.action !== 'skip');
    if (activeRows.length === 0) {
      alert("All items have been marked to skip. Nothing to reconcile.");
      return;
    }

    try {
      // 1. Create Version 2 PurchaseBill
      const { bill, items } = await db.createPurchaseBill({
        brand,
        billNumber: scanInvoiceNo,
        billDate: scanInvoiceDate,
        supplierName: scanDealer,
        scannedFileUrl: currentFullImageUrl || undefined,
        scannedThumbnailUrl: currentThumbnailUrl || undefined,
        items: activeRows.map(r => ({
          part_no: r.part_no,
          part_name: r.part_name,
          quantity: r.quantity,
          unit_price: r.mrp,
          hsn: r.hsn
        })),
        billStatedTotal: effectiveBillTotal,
        user
      });

      // 2. Confirm PurchaseBill with line item actions (updates inventory stock, logs stock_movements)
      await db.confirmPurchaseBill(
        bill.id,
        items.map((it, idx) => {
          const row = activeRows[idx];
          return {
            itemId: it.id,
            action: row?.action || (row?.isNewPart ? 'create' : row?.isArchivedMatched ? 'reactivate' : 'match'),
            sellingPrice: row?.sellingPrice || row?.mrp,
            category: row?.category || 'General',
            partNo: row?.part_no,
            partName: row?.part_name,
            qty: row?.quantity,
            unitPrice: row?.mrp
          };
        }),
        user
      );

      // 3. Sync to legacy purchases table for reports / dealer history
      await db.createPurchase(
        brand,
        scanDealer,
        scanInvoiceNo,
        scanInvoiceDate,
        scanSubtotal,
        fixedBrandDiscount,
        activeRows,
        'image',
        user
      );

      // Clean
      setScanRows([]);
      setScannedFilesLoaded(false);
      setCompressionStats(null);
      setCurrentThumbnailUrl(null);
      setCurrentFullImageUrl(null);
      
      refreshComponentData();
      triggerToast(`Confirmed purchase bill ${scanInvoiceNo}! Stock quantities & stock movement logs updated.`);
      setActiveTab('history');
      setHistorySubTab('bills');
    } catch (err: any) {
      alert(err.message);
    }
  };


  // --- DOWNLOAD EXCEL FOR SCANNED INVOICES ---
  const handleDownloadCurrentScanDraft = () => {
    try {
      if (scanRows.length === 0) {
        alert("No scanned items to export.");
        return;
      }
      
      const invoiceRows = [
        { A: "INVOICE DETAILS (DRAFT / STAGING)", B: "", C: "", D: "", E: "", F: "" },
        { A: "Detected Dealer Name", B: scanDealer, C: "", D: "", E: "", F: "" },
        { A: "Detected Invoice Number", B: scanInvoiceNo, C: "", D: "", E: "", F: "" },
        { A: "Detected Invoice Date", B: scanInvoiceDate ? new Date(scanInvoiceDate).toLocaleDateString() : "", C: "", D: "", E: "", F: "" },
        { A: "Detected Discount Percentage", B: `${scanDiscount}%`, C: "", D: "", E: "", F: "" },
        { A: "Pre-Discount Subtotal", B: `₹${scanSubtotal.toFixed(2)}`, C: "", D: "", E: "", F: "" },
        { A: "Calculated Discount Amount", B: `₹${(scanSubtotal * (scanDiscount / 100)).toFixed(2)}`, C: "", D: "", E: "", F: "" },
        { A: "Adjusted Pay Total", B: `₹${actualScanFinalAmount.toFixed(2)}`, C: "", D: "", E: "", F: "" },
        { A: "", B: "", C: "", D: "", E: "", F: "" },
        { A: "LINE ITEMS", B: "", C: "", D: "", E: "", F: "" },
        { A: "Part No", B: "Spare Part Name", C: "HSN Code", D: "Quantity", E: "MRP (INR)", F: "Total Amount (INR)" },
      ];

      scanRows.forEach(row => {
        invoiceRows.push({
          A: row.part_no,
          B: row.part_name,
          C: row.hsn,
          D: String(row.quantity),
          E: `₹${row.mrp.toFixed(2)}`,
          F: `₹${(row.quantity * row.mrp).toFixed(2)}`
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(invoiceRows, { skipHeader: true });
      
      worksheet['!cols'] = [
        { wch: 25 }, // Col A
        { wch: 40 }, // Col B
        { wch: 15 }, // Col C
        { wch: 12 }, // Col D
        { wch: 15 }, // Col E
        { wch: 18 }  // Col F
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Scan Draft");

      const cleanDealerName = scanDealer.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Scan_Draft_${scanInvoiceNo}_${cleanDealerName}`;
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
      triggerToast(`Downloaded scan draft ${scanInvoiceNo} as Excel!`);
    } catch (err: any) {
      alert("Failed to export scan draft to Excel: " + err.message);
    }
  };

  const handleDownloadExcel = async (p: Purchase) => {
    try {
      const items = await db.fetchPurchaseItemsForPurchase(brand, p.id);
      
      const invoiceRows = [
        { A: "INVOICE DETAILS", B: "", C: "", D: "", E: "", F: "" },
        { A: "Dealer Name", B: p.dealer_name, C: "", D: "", E: "", F: "" },
        { A: "Invoice Number", B: p.invoice_no, C: "", D: "", E: "", F: "" },
        { A: "Invoice Date", B: new Date(p.invoice_date).toLocaleDateString(), C: "", D: "", E: "", F: "" },
        { A: "Source Type", B: p.scan_source.toUpperCase(), C: "", D: "", E: "", F: "" },
        { A: "Pre-Discount Subtotal", B: `₹${p.subtotal.toFixed(2)}`, C: "", D: "", E: "", F: "" },
        { A: "Discount Percentage", B: `${p.dealer_discount_percentage}%`, C: "", D: "", E: "", F: "" },
        { A: "Discount Amount", B: `₹${p.discount_amount.toFixed(2)}`, C: "", D: "", E: "", F: "" },
        { A: "Total After Discount", B: `₹${p.total_after_discount.toFixed(2)}`, C: "", D: "", E: "", F: "" },
        { A: "", B: "", C: "", D: "", E: "", F: "" },
        { A: "LINE ITEMS", B: "", C: "", D: "", E: "", F: "" },
        { A: "Part No", B: "Spare Part Name", C: "HSN Code", D: "Quantity", E: "MRP (INR)", F: "Total Amount (INR)" },
      ];

      items.forEach(item => {
        invoiceRows.push({
          A: item.part_no,
          B: item.part_name,
          C: item.hsn,
          D: String(item.quantity),
          E: `₹${item.mrp.toFixed(2)}`,
          F: `₹${(item.quantity * item.mrp).toFixed(2)}`
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(invoiceRows, { skipHeader: true });
      
      worksheet['!cols'] = [
        { wch: 25 }, // Col A
        { wch: 40 }, // Col B
        { wch: 15 }, // Col C
        { wch: 12 }, // Col D
        { wch: 15 }, // Col E
        { wch: 18 }  // Col F
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Scanned Invoice");

      const cleanDealerName = p.dealer_name.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Scanned_Invoice_${p.invoice_no}_${cleanDealerName}`;
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
      triggerToast(`Downloaded invoice ${p.invoice_no} as Excel!`);
    } catch (err: any) {
      alert("Failed to export to Excel: " + err.message);
    }
  };


  // --- HISTORY VIEW MODE ---
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPerPage = 15;

  const [historyPurchases, setHistoryPurchases] = useState<Purchase[]>([]);
  const [totalHistoryPurchasesCount, setTotalHistoryPurchasesCount] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const totalHistoryPages = Math.ceil(totalHistoryPurchasesCount / historyPerPage) || 1;

  useEffect(() => {
    if (activeTab !== 'history') return;
    let active = true;
    setIsLoadingHistory(true);
    db.fetchPurchasesPaginated(brand, '', historyPage, historyPerPage).then(res => {
      if (active) {
        setHistoryPurchases(res.items);
        setTotalHistoryPurchasesCount(res.totalCount);
        setIsLoadingHistory(false);
      }
    }).catch(err => {
      console.error(err);
      if (active) setIsLoadingHistory(false);
    });
    return () => { active = false; };
  }, [brand, activeTab, historyPage]);

  // Handle realtime/subscription sync notification refreshes
  useEffect(() => {
    if (activeTab !== 'history') return;
    const handleNotification = () => {
      db.fetchPurchasesPaginated(brand, '', historyPage, historyPerPage).then(res => {
        setHistoryPurchases(res.items);
        setTotalHistoryPurchasesCount(res.totalCount);
      });
    };
    return db.subscribe(handleNotification);
  }, [brand, activeTab, historyPage, historyPerPage]);

  useEffect(() => {
    setHistoryPage(1);
  }, [brand]);

  const [purchaseItemsAssociated, setPurchaseItemsAssociated] = useState<PurchaseItem[]>([]);

  useEffect(() => {
    if (!viewingPurchase) {
      setPurchaseItemsAssociated([]);
      return;
    }
    let active = true;
    db.fetchPurchaseItemsForPurchase(brand, viewingPurchase.id).then(items => {
      if (active) {
        setPurchaseItemsAssociated(items);
      }
    });
    return () => { active = false; };
  }, [viewingPurchase, brand]);

  const handleDeleteSyncedInvoice = async (pId: string) => {
    const p = historyPurchases.find(x => x.id === pId);
    if (!p) return;
    const confirmed = window.confirm(`WARNING: Deleting purchase invoice ${p.invoice_no} will automatically subtract original parts quantity counts from active stock lists. This cannot be undone. Proceed?`);
    if (!confirmed) return;

    try {
      await db.deletePurchase(brand, pId, user);
      const res = await db.fetchPurchasesPaginated(brand, '', historyPage, historyPerPage);
      setHistoryPurchases(res.items);
      setTotalHistoryPurchasesCount(res.totalCount);
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
              
              {/* Header & Egress Optimization Info */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-200 pb-4 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-slate-900 text-base">
                      Purchase Bill Reconciliation
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                      Version 2
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Match parts against {brand} inventory schema, verify brand discount ({fixedBrandDiscount}%), and reconcile stock movements.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {compressionStats && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Egress Saved: {compressionStats.savedPercent}% ({compressionStats.originalKB}KB → {compressionStats.compressedKB}KB)</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleDownloadCurrentScanDraft}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Export Draft (Excel)
                  </button>
                </div>
              </div>

              {/* Dual-Column Intake Layout: Scanned Bill Image vs Header Metadata */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Column: Bill Scanned Image & Zoom */}
                <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-slate-500" />
                      Original Bill Preview
                    </span>
                    {currentFullImageUrl && (
                      <button
                        type="button"
                        onClick={() => setShowImageModal(true)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 rounded-lg text-[10px] font-black transition cursor-pointer"
                      >
                        <ZoomIn className="w-3 h-3" />
                        Full Screen Zoom
                      </button>
                    )}
                  </div>

                  <div 
                    onClick={() => currentFullImageUrl && setShowImageModal(true)}
                    className="w-full h-48 bg-white border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative group cursor-pointer hover:border-indigo-400 transition"
                  >
                    {currentThumbnailUrl || currentFullImageUrl ? (
                      <img
                        src={currentThumbnailUrl || currentFullImageUrl || ''}
                        alt="Bill Preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-slate-400 text-xs">
                        <FileText className="w-8 h-8 text-slate-300 mb-1" />
                        <span>Document Loaded</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <span className="bg-slate-900/80 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                        <ZoomIn className="w-3.5 h-3.5" />
                        Click to Inspect Bill
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1.5 text-center">
                    Low-egress thumbnail stored with bill for rapid retrieval
                  </span>
                </div>

                {/* Right Column: Editable Headers & Brand Discount */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-semibold text-slate-700">
                    <div>
                      <label className="block text-slate-500 mb-1">Supplier / Dealer Name</label>
                      <input
                        type="text"
                        className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white"
                        value={scanDealer}
                        onChange={(e) => setScanDealer(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1">Bill / Invoice Number</label>
                      <input
                        type="text"
                        className="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold uppercase text-slate-900 bg-white"
                        value={scanInvoiceNo}
                        onChange={(e) => setScanInvoiceNo(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1">Bill Date</label>
                      <input
                        type="date"
                        className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white"
                        value={scanInvoiceDate}
                        onChange={(e) => setScanInvoiceDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Brand Discount Enforcement Banner */}
                  <div className="p-3.5 bg-indigo-50/70 border border-indigo-150 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Percent className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                      <div>
                        <span className="font-extrabold text-indigo-950">Fixed Brand Discount: {fixedBrandDiscount}%</span>
                        <span className="text-indigo-800 text-[11px] block">
                          Applies standard {brand} dealer contract rate. Printed bill discounts are ignored.
                        </span>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-indigo-900">
                      -₹{discountAmount.toFixed(2)}
                    </div>
                  </div>

                  {/* Price Mismatch Alert */}
                  {isPriceMismatched && (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <h4 className="font-extrabold text-amber-900">Price Mismatch Warning</h4>
                        <p className="text-amber-800 mt-0.5 leading-relaxed">
                          Supplier stated bill total of <strong className="font-mono font-bold">₹{billStatedTotal.toFixed(2)}</strong> differs from calculated discount total of <strong className="font-mono font-bold">₹{totalAfterDiscount.toFixed(2)}</strong> by <strong className="font-mono font-bold text-amber-950">₹{priceDifference.toFixed(2)}</strong>. Please review line item quantities and MRPs below before reconciling.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Scanned spare parts reconciliation table */}
              <div className="border-t border-slate-100 pt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Line Item Reconciliation ({scanRows.length} Parts Extracted)
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Set resolution action for each part (matched, reactivate archived, or create new part)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider">
                      <tr>
                        <th className="p-3">Status & Action</th>
                        <th className="p-3">Part No</th>
                        <th className="p-3">Part Name</th>
                        <th className="p-3">HSN Code</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-right">Unit MRP</th>
                        <th className="p-3 text-right">New Part Details</th>
                        <th className="p-3 text-right">Row Total</th>
                        <th className="p-3 text-center">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {scanRows.map((row, idx) => {
                        const totalRow = row.quantity * row.mrp;
                        const isSkipped = row.action === 'skip';

                        return (
                          <tr key={idx} className={`hover:bg-slate-50/70 transition ${isSkipped ? 'opacity-40 bg-slate-50/50' : ''}`}>
                            <td className="p-3">
                              <div className="flex flex-col gap-1.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9.5px] font-extrabold w-fit ${
                                  row.isNewPart 
                                    ? 'bg-purple-100 text-purple-800 border border-purple-250' 
                                    : row.isArchivedMatched
                                      ? 'bg-amber-100 text-amber-850 border border-amber-250'
                                      : 'bg-emerald-100 text-emerald-850 border border-emerald-250'
                                }`}>
                                  {row.isNewPart ? 'New Part' : row.isArchivedMatched ? 'Archived Matched' : 'Matched Part'}
                                </span>

                                <select
                                  value={row.action || (row.isNewPart ? 'create' : row.isArchivedMatched ? 'reactivate' : 'match')}
                                  onChange={(e) => handleAIScanRowChange(idx, 'action', e.target.value)}
                                  className="text-[10px] font-bold py-1 px-1.5 border border-slate-200 rounded-lg bg-white"
                                >
                                  {row.isNewPart ? (
                                    <>
                                      <option value="create">Add to Inventory</option>
                                      <option value="skip">Skip This Item</option>
                                    </>
                                  ) : row.isArchivedMatched ? (
                                    <>
                                      <option value="reactivate">Reactivate & Add Stock</option>
                                      <option value="skip">Skip This Item</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="match">Update Stock (+{row.quantity})</option>
                                      <option value="skip">Skip This Item</option>
                                    </>
                                  )}
                                </select>
                              </div>
                            </td>

                            <td className="p-3 font-mono">
                              <input
                                type="text"
                                className="w-28 p-1.5 border border-slate-200 rounded text-xs uppercase text-slate-900 font-bold bg-white"
                                value={row.part_no}
                                onChange={(e) => handleAIScanRowChange(idx, 'part_no', e.target.value)}
                              />
                            </td>

                            <td className="p-3">
                              <input
                                type="text"
                                className="w-44 p-1.5 border border-slate-200 rounded text-xs text-slate-800 bg-white"
                                value={row.part_name}
                                onChange={(e) => handleAIScanRowChange(idx, 'part_name', e.target.value)}
                              />
                            </td>

                            <td className="p-3 font-mono">
                              <input
                                type="text"
                                className="w-20 p-1.5 border border-slate-200 rounded text-xs text-slate-500 bg-white"
                                value={row.hsn}
                                onChange={(e) => handleAIScanRowChange(idx, 'hsn', e.target.value)}
                              />
                            </td>

                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min="1"
                                className="w-14 p-1.5 border border-slate-200 rounded text-center text-xs font-bold text-slate-900 bg-white"
                                value={row.quantity}
                                onChange={(e) => handleAIScanRowChange(idx, 'quantity', Number(e.target.value))}
                              />
                            </td>

                            <td className="p-3 text-right font-mono">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-20 p-1.5 border border-slate-200 rounded text-right text-xs font-bold text-slate-900 bg-white"
                                value={row.mrp}
                                onChange={(e) => handleAIScanRowChange(idx, 'mrp', Number(e.target.value))}
                              />
                            </td>

                            <td className="p-3 text-right">
                              {row.isNewPart ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 justify-end">
                                    <span className="text-[10px] text-slate-400">Sell Price:</span>
                                    <input
                                      type="number"
                                      className="w-18 p-1 border border-purple-200 rounded text-right text-xs font-bold text-purple-900 bg-white"
                                      value={row.sellingPrice || row.mrp}
                                      onChange={(e) => handleAIScanRowChange(idx, 'sellingPrice', Number(e.target.value))}
                                      title="Selling price for new part"
                                    />
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Category"
                                    className="w-28 p-1 border border-slate-200 rounded text-right text-[10px] text-slate-600 bg-white"
                                    value={row.category || 'General'}
                                    onChange={(e) => handleAIScanRowChange(idx, 'category', e.target.value)}
                                  />
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[10px] italic">Existing part</span>
                              )}
                            </td>

                            <td className="p-3 text-right font-mono font-bold text-slate-900">
                              ₹{totalRow.toFixed(2)}
                            </td>

                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => setScanRows(scanRows.filter((_, i) => i !== idx))}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded cursor-pointer transition"
                                title="Remove line item"
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
              </div>

              {/* Calculations summaries drawer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                <div className="p-4 bg-slate-50 rounded-2xl flex flex-col justify-center space-y-2 text-slate-600 text-xs font-semibold">
                  <div className="flex justify-between">
                    <span>Pre-Discount MRP Subtotal:</span>
                    <span className="font-mono font-bold text-slate-900">₹{scanSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-indigo-700">
                    <span>Fixed Brand Discount ({fixedBrandDiscount}%):</span>
                    <span className="font-mono font-bold">-₹{discountAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-extrabold text-slate-900">
                    <span>Calculated Total After Discount:</span>
                    <span className="font-mono text-indigo-600">₹{totalAfterDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 text-[11px] text-slate-500">
                    <span>Stated Total from Bill:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        className="w-24 p-1 border border-slate-300 rounded font-mono font-bold text-right text-slate-800 bg-white"
                        value={billStatedTotal || ''}
                        placeholder={totalAfterDiscount.toFixed(2)}
                        onChange={(e) => setBillStatedTotal(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-150 p-5 rounded-2xl flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5 text-xs text-indigo-950 font-medium">
                    <div className="flex items-center gap-2 font-bold text-indigo-900">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      Ready to Reconcile &amp; Update Stock
                    </div>
                    <p className="text-[11px] text-indigo-800 leading-relaxed">
                      Confirming will create the official Purchase Bill record, apply stock movements (+QTY) to {brand} schema inventory, and reactivate any archived parts.
                    </p>
                  </div>

                  <button
                    onClick={handleAIScanCompleteSync}
                    disabled={scanRows.length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-3 rounded-xl text-xs font-black shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Confirm &amp; Update Stock ({scanRows.filter(r => r.action !== 'skip').length} Parts)
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* Full Resolution Image Lightbox Modal */}
          {showImageModal && currentFullImageUrl && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-bold text-slate-900 text-sm">
                      Bill Inspector — {scanInvoiceNo || 'Scanned Document'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowImageModal(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-slate-100 flex items-center justify-center min-h-[400px]">
                  <img
                    src={currentFullImageUrl}
                    alt="Original Bill High Resolution"
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-[75vh] object-contain rounded shadow"
                  />
                </div>
                <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <span>Zoom in/out with browser controls or pinch on touch devices</span>
                  <button
                    type="button"
                    onClick={() => setShowImageModal(false)}
                    className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold"
                  >
                    Close Inspector
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
        <div className="space-y-4">
          
          {/* Sub-tab Switcher: Version 2 Bills vs Legacy Purchases */}
          <div className="flex items-center justify-between">
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setHistorySubTab('bills')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  historySubTab === 'bills'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                V2 Purchase Bills ({v2BillsList.length})
              </button>
              <button
                type="button"
                onClick={() => setHistorySubTab('purchases')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  historySubTab === 'purchases'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                All Purchases Ledger ({totalHistoryPurchasesCount})
              </button>
            </div>
            <span className="text-xs text-slate-400">
              Active Schema: <strong className="text-slate-700 font-mono">{brand}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* History Table List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden lg:col-span-2">
              <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs flex justify-between items-center">
                <span>
                  {historySubTab === 'bills' 
                    ? 'Version 2 Reconciled Bills & Document Attachments' 
                    : 'Registered Procurement Invoices List'}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {historySubTab === 'bills' ? `${v2BillsList.length} bills recorded` : `${totalHistoryPurchasesCount} invoices recorded`}
                </span>
              </div>

              {historySubTab === 'bills' ? (
                <div className="overflow-x-auto text-xs font-semibold text-slate-600">
                  <table className="min-w-full divide-y divide-slate-100 text-left">
                    <thead className="bg-slate-100/50 text-slate-500 uppercase text-[9px] tracking-wider">
                      <tr>
                        <th className="p-3">Doc</th>
                        <th className="p-3">Bill No</th>
                        <th className="p-3">Supplier</th>
                        <th className="p-3">Bill Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Stated Total</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {v2BillsList.map((bill) => {
                        const items = db.getPurchaseBillItems(brand, bill.id);
                        return (
                          <tr key={bill.id} className="hover:bg-slate-50/70 transition">
                            <td className="p-3">
                              {bill.scanned_thumbnail_url || bill.scanned_file_url ? (
                                <div 
                                  onClick={() => {
                                    setCurrentFullImageUrl(bill.scanned_file_url || bill.scanned_thumbnail_url || null);
                                    setShowImageModal(true);
                                  }}
                                  className="w-9 h-9 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 cursor-pointer hover:scale-105 transition shrink-0"
                                  title="View bill image"
                                >
                                  <img
                                    src={bill.scanned_thumbnail_url || bill.scanned_file_url}
                                    alt="Bill"
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                                  <FileText className="w-4 h-4" />
                                </div>
                              )}
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-900">
                              {bill.bill_number}
                            </td>
                            <td className="p-3 font-semibold text-slate-800">
                              {bill.supplier_name || 'N/A'}
                            </td>
                            <td className="p-3 text-slate-500">
                              {new Date(bill.bill_date).toLocaleDateString()}
                            </td>
                            <td className="p-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase ${
                                bill.status === 'confirmed'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-250'
                                  : 'bg-amber-100 text-amber-850 border border-amber-250'
                              }`}>
                                {bill.status}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">
                              ₹{(bill.bill_stated_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => setViewingPurchaseBill({ bill, items })}
                                className="p-1.5 text-indigo-650 hover:bg-indigo-50 rounded-lg cursor-pointer"
                                title="Inspect bill line items"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {v2BillsList.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 font-normal">
                            No Version 2 purchase bills recorded in {brand} schema yet. Scan an invoice to begin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
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
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {historyPurchases.map((p) => (
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
                              onClick={() => { setViewingPurchase(p); setViewingPurchaseBill(null); }}
                              className="p-1 text-indigo-650 hover:bg-indigo-50 rounded cursor-pointer"
                              title="View Invoice Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadExcel(p)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                              title="Download Invoice as Excel"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSyncedInvoice(p.id)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                              title="Delete Invoice"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {historyPurchases.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 font-normal">
                            No purchases recorded in {brand} schema yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination Controls for Purchases */}
              {historySubTab === 'purchases' && totalHistoryPages > 1 && (
                <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between">
                  <span className="text-slate-500 text-[11px] font-semibold">
                    Page <strong className="text-slate-800">{historyPage}</strong> of <strong className="text-slate-800">{totalHistoryPages}</strong> ({totalHistoryPurchasesCount} total purchases)
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

            {/* Dynamic Side Viewer: Bills or Purchases */}
            <div>
              {viewingPurchaseBill ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs font-semibold text-slate-700">
                  <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600">V2 Purchase Bill</span>
                      <h4 className="font-black text-slate-900 text-sm leading-tight font-mono">{viewingPurchaseBill.bill.bill_number}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{viewingPurchaseBill.bill.supplier_name}</p>
                    </div>
                    <button 
                      onClick={() => setViewingPurchaseBill(null)}
                      className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Thumbnail / Scan display */}
                  {(viewingPurchaseBill.bill.scanned_thumbnail_url || viewingPurchaseBill.bill.scanned_file_url) && (
                    <div 
                      onClick={() => {
                        setCurrentFullImageUrl(viewingPurchaseBill.bill.scanned_file_url || viewingPurchaseBill.bill.scanned_thumbnail_url || null);
                        setShowImageModal(true);
                      }}
                      className="relative h-28 w-full bg-slate-50 rounded-xl overflow-hidden border border-slate-200 group cursor-pointer"
                    >
                      <img
                        src={viewingPurchaseBill.bill.scanned_thumbnail_url || viewingPurchaseBill.bill.scanned_file_url}
                        alt="Bill Document"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <span className="bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
                          <ZoomIn className="w-3 h-3" /> Inspect Document
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5 text-[11px] leading-relaxed">
                    <p className="flex justify-between">
                      <span className="text-slate-400">Bill Date:</span>
                      <span>{new Date(viewingPurchaseBill.bill.bill_date).toLocaleDateString()}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">Status:</span>
                      <span className="uppercase text-emerald-700 font-extrabold">{viewingPurchaseBill.bill.status}</span>
                    </p>
                    <p className="flex justify-between text-indigo-700 font-bold text-xs pt-1 border-t border-slate-200">
                      <span>Stated Bill Total:</span>
                      <span className="font-mono">₹{(viewingPurchaseBill.bill.bill_stated_total || 0).toFixed(2)}</span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Reconciled Items ({viewingPurchaseBill.items.length})
                    </span>
                    <div className="bg-slate-50 rounded-xl p-2.5 space-y-2 divide-y divide-slate-150 max-h-[30vh] overflow-y-auto">
                      {viewingPurchaseBill.items.map((it) => (
                        <div key={it.id} className="pt-2 flex justify-between gap-1 leading-normal text-[11px]">
                          <div>
                            <p className="font-mono font-bold text-slate-900">{it.part_number_scanned}</p>
                            <p className="text-[10px] text-slate-400 font-normal">{it.part_name_scanned}</p>
                            {it.match_status && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200/70 font-semibold text-slate-700 capitalize">
                                {it.match_status}
                              </span>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-slate-800">{it.qty} units</p>
                            <p className="text-[10px] text-slate-400 font-mono">@ ₹{it.unit_price}</p>
                            <p className="text-[10px] font-bold text-slate-900 font-mono">₹{(it.qty * it.unit_price).toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : viewingPurchase ? (
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
                    onClick={() => handleDownloadExcel(viewingPurchase)}
                    className="w-full bg-emerald-100 hover:bg-emerald-600 hover:text-white text-emerald-800 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Download Invoice (Excel)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteSyncedInvoice(viewingPurchase.id)}
                    className="w-full bg-red-100 hover:bg-rose-600 hover:text-white text-red-700 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Invoice &amp; Restore Stock
                  </button>

                </div>
              ) : (
                <div className="border border-dashed border-slate-200 p-8 rounded-2xl text-center text-slate-400 text-xs font-normal">
                  Click "Eye" icon near any registered bill or invoice to load details &amp; items.
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
