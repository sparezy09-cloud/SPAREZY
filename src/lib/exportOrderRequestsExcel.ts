import * as XLSX from 'xlsx';
import { OrderRequest, Brand, InventoryItem } from '../types';

export interface ExportExcelOptions {
  brand: Brand;
  requests: OrderRequest[];
  inventoryList?: InventoryItem[];
  title?: string;
  filenameSuffix?: string;
}

/**
 * Exports requested order parts to an Excel (.xlsx) file with:
 * 1. Sheet 1: "Parts Order Summary" - Consolidated summary per part number (ideal for dealer procurement)
 * 2. Sheet 2: "Detailed Request Lines" - Comprehensive line-by-line itemized requests
 */
export function exportOrderRequestsToExcel({
  brand,
  requests,
  inventoryList = [],
  title = 'Requested Order Parts',
  filenameSuffix = 'Requested_Parts'
}: ExportExcelOptions): { fileName: string; totalParts: number; totalQty: number } {
  if (!requests || requests.length === 0) {
    throw new Error('No order requests available to export.');
  }

  // Create lookup map for inventory items by part_no (case-insensitive)
  const inventoryMap = new Map<string, InventoryItem>();
  inventoryList.forEach(item => {
    inventoryMap.set(item.part_no.toLowerCase().trim(), item);
  });

  // 1. Group / Consolidate by Part Number
  const consolidatedMap = new Map<string, {
    part_no: string;
    part_name: string;
    brand: Brand;
    totalQty: number;
    currentStock: number;
    mrp: number;
    urgencies: Set<string>;
    reasons: Set<string>;
    customers: Set<string>;
    requesters: Set<string>;
    count: number;
  }>();

  requests.forEach(req => {
    const key = req.part_no.trim().toUpperCase();
    const existing = consolidatedMap.get(key);
    const inv = inventoryMap.get(req.part_no.toLowerCase().trim());
    const mrp = inv?.mrp || 0;
    const currentStock = inv ? inv.quantity : 0;
    const partName = req.part_name || inv?.part_name || 'N/A';

    if (!existing) {
      consolidatedMap.set(key, {
        part_no: key,
        part_name: partName,
        brand: req.brand || brand,
        totalQty: req.quantity,
        currentStock,
        mrp,
        urgencies: new Set(req.urgency ? [req.urgency] : []),
        reasons: new Set(req.reason ? [req.reason] : []),
        customers: new Set(req.customer_name ? [req.customer_name] : []),
        requesters: new Set(req.requested_by ? [req.requested_by] : []),
        count: 1
      });
    } else {
      existing.totalQty += req.quantity;
      if (req.urgency) existing.urgencies.add(req.urgency);
      if (req.reason) existing.reasons.add(req.reason);
      if (req.customer_name) existing.customers.add(req.customer_name);
      if (req.requested_by) existing.requesters.add(req.requested_by);
      existing.count += 1;
      // If previous partName was empty or shorter, upgrade to better name
      if (!existing.part_name || existing.part_name === 'N/A') {
        existing.part_name = partName;
      }
      if (mrp > 0 && existing.mrp === 0) {
        existing.mrp = mrp;
      }
    }
  });

  const urgencyPriority: Record<string, number> = {
    'Critical': 4,
    'Emergency': 4,
    'High': 3,
    'Medium': 2,
    'Normal': 2,
    'Low': 1
  };

  // Build Sheet 1 rows
  const summaryRows = Array.from(consolidatedMap.values()).map((item, index) => {
    // Sort urgencies by severity
    const sortedUrgencies = Array.from(item.urgencies).sort((a, b) => {
      return (urgencyPriority[b] || 0) - (urgencyPriority[a] || 0);
    });
    const highestUrgency = sortedUrgencies[0] || 'Normal';
    const totalEstValue = item.mrp > 0 ? item.mrp * item.totalQty : 0;

    return {
      'S.No': index + 1,
      'Part Number': item.part_no,
      'Part Name / Description': item.part_name,
      'Brand': item.brand,
      'Order Qty Needed': item.totalQty,
      'Current In-Stock': item.currentStock,
      'Unit MRP (₹)': item.mrp > 0 ? item.mrp : 'N/A',
      'Est. Total MRP (₹)': totalEstValue > 0 ? totalEstValue : 'N/A',
      'Max Urgency': highestUrgency,
      'Reasons': Array.from(item.reasons).join(', ') || 'Out of Stock',
      'Customer(s)': Array.from(item.customers).join(', ') || 'Stock Replenishment',
      'Requested By': Array.from(item.requesters).join(', '),
      'Requests Count': item.count
    };
  });

  // Build Sheet 2 rows (Itemized individual order lines)
  const detailRows = requests.map((req, index) => {
    const d = new Date(req.created_at);
    const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN') : req.created_at;
    const timeStr = !isNaN(d.getTime()) ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
    const inv = inventoryMap.get(req.part_no.toLowerCase().trim());
    const mrp = inv?.mrp || 0;

    return {
      'Line #': index + 1,
      'Request Date': dateStr,
      'Request Time': timeStr,
      'Part Number': req.part_no,
      'Part Name': req.part_name,
      'Brand': req.brand,
      'Requested Qty': req.quantity,
      'Status': req.status,
      'Urgency': req.urgency || 'Medium',
      'Reason': req.reason || 'Out of Stock',
      'Customer Name': req.customer_name || 'N/A',
      'Customer Phone': req.customer_phone || 'N/A',
      'Requested By': req.requested_by,
      'Requester Role': req.requested_by_role || 'Staff',
      'Accepted / Reviewed By': req.accepted_by || req.reviewed_by || 'N/A',
      'Unit MRP (₹)': mrp > 0 ? mrp : 'N/A',
      'Notes': req.notes || '',
      'Action Notes': req.action_notes || ''
    };
  });

  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Create Sheet 1
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [
    { wch: 6 },   // S.No
    { wch: 18 },  // Part Number
    { wch: 32 },  // Part Name
    { wch: 12 },  // Brand
    { wch: 16 },  // Order Qty
    { wch: 16 },  // Current In-Stock
    { wch: 14 },  // Unit MRP
    { wch: 18 },  // Est Total Value
    { wch: 14 },  // Max Urgency
    { wch: 22 },  // Reasons
    { wch: 24 },  // Customers
    { wch: 18 },  // Requested By
    { wch: 14 }   // Requests Count
  ];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Parts Order Summary');

  // Create Sheet 2
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  detailSheet['!cols'] = [
    { wch: 8 },   // Line #
    { wch: 14 },  // Date
    { wch: 12 },  // Time
    { wch: 18 },  // Part Number
    { wch: 30 },  // Part Name
    { wch: 12 },  // Brand
    { wch: 14 },  // Qty
    { wch: 14 },  // Status
    { wch: 12 },  // Urgency
    { wch: 18 },  // Reason
    { wch: 20 },  // Customer Name
    { wch: 16 },  // Customer Phone
    { wch: 16 },  // Requested By
    { wch: 14 },  // Role
    { wch: 18 },  // Accepted By
    { wch: 14 },  // MRP
    { wch: 26 },  // Notes
    { wch: 26 }   // Action Notes
  ];
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detailed Request Lines');

  // Generate file name
  const stamp = new Date().toISOString().split('T')[0];
  const fileName = `Sparezy_${brand}_${filenameSuffix}_${stamp}.xlsx`;

  // Trigger file download
  XLSX.writeFile(workbook, fileName);

  const totalQty = requests.reduce((acc, r) => acc + (r.quantity || 0), 0);
  return {
    fileName,
    totalParts: consolidatedMap.size,
    totalQty
  };
}
