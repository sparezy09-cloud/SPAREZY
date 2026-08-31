/**
 * Sparezy MIS Dashboard - TypeScript Types and Schemas
 */

export type UserRole = 'Owner' | 'Manager';
export type UserStatus = 'Active' | 'Disabled';
export type Brand = 'Hyundai' | 'Mahindra';
export type CustomerCategory = 'Walk-in' | 'Mistri' | 'Retailer' | 'Garage';
export type PaymentStatus = 'Paid' | 'Pending' | 'Custom Amount';
export type ScanSource = 'manual' | 'image' | 'pdf' | 'excel';
export type BulkUpdateType = 'Stock Update' | 'MRP Update';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  password?: string;
}

export interface InventoryItem {
  id: string;
  part_no: string;
  part_name: string;
  quantity: number;
  hsn: string;
  mrp: number;
  brand: Brand;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  customer_name: string;
  customer_category: CustomerCategory;
  phone?: string;
  created_at: string;
}

export interface Sale {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_category: CustomerCategory;
  sale_date: string;
  subtotal: number;
  discount_percentage: number;
  discount_amount: number;
  total_amount: number;
  payment_status: PaymentStatus;
  paid_amount: number;
  pending_amount: number;
  created_by: string; // User Name
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  part_no: string;
  part_name: string;
  quantity: number;
  mrp: number;
  discount_percentage: number;
  final_amount: number;
  returned_quantity: number;
  created_at: string;
}

export interface ReturnRecord {
  id: string;
  sale_id: string;
  sale_item_id: string;
  customer_id: string;
  part_no: string;
  part_name: string;
  returned_quantity: number;
  refund_amount: number;
  return_date: string;
  created_by: string;
}

export interface Purchase {
  id: string;
  dealer_name: string;
  invoice_no: string;
  invoice_date: string;
  subtotal: number;
  dealer_discount_percentage: number;
  discount_amount: number;
  total_after_discount: number;
  scan_source: ScanSource;
  created_by: string;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  part_no: string;
  part_name: string;
  hsn: string;
  quantity: number;
  mrp: number;
  is_new_part: boolean;
  matched_inventory: boolean;
  created_at: string;
}

export interface BulkUpdateHistory {
  id: string;
  update_type: BulkUpdateType;
  file_name: string;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  created_by: string;
  created_at: string;
  can_undo: boolean;
  backup_data_json?: string; // Stringified array of items prior to update for Undo
}

export interface MRPHistory {
  id: string;
  part_no: string;
  old_mrp: number;
  new_mrp: number;
  changed_by: string;
  changed_at: string;
}

export interface TransactionLog {
  id: string;
  user_id: string;
  user_name: string;
  action_type: string;
  module_name: string;
  description: string;
  old_data: string | null; // JSON String or description
  new_data: string | null; // JSON String or description
  created_at: string;
}

export interface CustomerKhataMeta {
  customer_id: string;
  vehicle_no: string;
  credit_limit: number;
  opening_balance: number;
  payment_due_date: string | null;
  status: string;
}

export interface SupplierKhataMeta {
  id: string;
  supplier_name: string;
  phone: string;
  opening_balance: number;
  payment_due_date: string | null;
  status: string;
  created_at: string;
}

export interface KhataEntry {
  id: string;
  account_type: 'customer' | 'supplier';
  party_id: string;
  entry_date: string;
  description: string;
  debit: number;
  credit: number;
  payment_method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'Other' | null;
  reference_no: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  brand: Brand;
  source_type: 'sale' | 'purchase' | 'return' | 'payment_received' | 'payment_made' | 'manual' | 'opening_balance';
  source_id: string | null;
  is_reversed?: boolean;
  reversed_by?: string | null;
  reversed_at?: string | null;
}
