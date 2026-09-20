/**
 * Sparezy MIS Dashboard - TypeScript Types and Schemas
 */

export type UserRole = 'Owner' | 'Admin' | 'Manager';

export function isOwnerOrAdmin(role?: UserRole | string | null): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  return r === 'owner' || r === 'admin';
}

export type UserStatus = 'Active' | 'Disabled';
export type Brand = 'Hyundai' | 'Mahindra';
export type CustomerCategory = 'Mistri' | 'Garage' | 'Walk-in' | 'Retailer';
export type PaymentType = 'UPI' | 'Cash' | 'Payment Pending' | 'Half Payment' | 'Custom Payment';
export type PaymentStatus = 'Paid' | 'Pending' | 'Custom Amount';
export type ScanSource = 'manual' | 'image' | 'pdf' | 'excel';
export type BulkUpdateType = 'Stock Update' | 'MRP Update';

export const BRAND_PURCHASE_DISCOUNT: Record<Brand, number> = {
  Hyundai: 12.0,      // Fixed 12% dealer discount
  Mahindra: 19.36     // Fixed 19.36% dealer discount
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  per_day_salary?: number;
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
  address?: string;
  starting_balance: number; // Amount they owe (positive = customer has to pay/pending; negative = advance)
  starting_balance_type?: 'To Receive' | 'To Give'; // Khatabook format: To Receive (Customer owes) or To Give (Advance)
  current_balance?: number;
  created_at: string;
}

export interface CustomerLedgerEntry {
  id: string;
  customer_id: string;
  customer_name: string;
  brand: Brand;
  date: string;
  entry_type: 'Starting Balance' | 'Sale Bill' | 'Payment Received' | 'Item Return Refund' | 'Item Return Credit' | 'Manual Adjustment';
  reference_no?: string; // invoice_no or return_id
  debit: number; // Amount customer owes us (increases pending)
  credit: number; // Amount customer paid us or return credit (decreases pending)
  balance: number; // Net running balance after this transaction
  payment_mode?: string; // Cash, UPI, Bank Transfer
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  part_no: string;
  part_name: string;
  quantity: number;
  mrp: number;
  is_net_price?: boolean; // If true, sold at net price directly, overriding discount
  net_price?: number;
  discount_percentage: number;
  final_amount: number;
  returned_quantity: number;
  created_at: string;
}

export interface Sale {
  id: string;
  invoice_no: string;
  customer_id: string;
  customer_name: string;
  customer_category: CustomerCategory;
  sale_date: string;
  subtotal: number;
  discount_percentage: number;
  discount_amount: number;
  total_amount: number;
  payment_type: PaymentType;
  payment_status: PaymentStatus;
  paid_amount: number;
  pending_amount: number;
  has_return?: boolean;
  returned_items_count?: number;
  created_by: string; // User Name
  created_at: string;
  items?: SaleItem[];
}

export interface ReturnRecord {
  id: string;
  sale_id: string;
  sale_item_id: string;
  customer_id: string;
  customer_name: string;
  part_no: string;
  part_name: string;
  returned_quantity: number;
  unit_price: number;
  refund_amount: number;
  payment_treatment: 'Refund Paid (Cash/UPI)' | 'Kept in Customer Ledger (Credit)';
  return_date: string;
  notes?: string;
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
  brand?: Brand;
  created_by: string;
  created_at: string;
  items?: PurchaseItem[];
}

export interface OrderRequest {
  id: string;
  brand: Brand;
  part_no: string;
  part_name: string;
  quantity: number;
  urgency?: 'Low' | 'Normal' | 'Medium' | 'High' | 'Emergency' | 'Critical';
  reason?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  requested_by: string; // User Name
  requested_by_role?: string;
  manager_id?: string;
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Ordered' | 'Ordered with Dealer' | 'Received';
  accepted_by?: string;
  reviewed_by?: string;
  action_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface StaffAttendance {
  id: string;
  user_id: string;
  user_name: string;
  date: string; // YYYY-MM-DD
  status: 'Present' | 'Absent' | 'Half Day' | 'Paid Leave';
  per_day_salary: number;
  salary_earned: number; // e.g. Present: 1x, Half Day: 0.5x, Absent: 0x
  notes?: string;
  marked_by: string;
  created_at: string;
}

export interface StaffSalaryProfile {
  user_id: string;
  user_name: string;
  per_day_salary: number;
  advance_deductions?: number;
  bonuses?: number;
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
  backup_data_json?: string;
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
  old_data: string | null;
  new_data: string | null;
  created_at: string;
}

