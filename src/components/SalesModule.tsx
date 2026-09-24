import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Brand, User, CustomerCategory, PaymentStatus, InventoryItem, Customer, Sale, SaleItem } from '../types';
import { db } from '../dbStore';
import { 
  ShoppingBag, Search, PlusCircle, Check, Trash2, Printer, 
  ChevronRight, Calendar, UserCheck, CreditCard, Eye, X, Plus,
  Share2, MessageSquare, RotateCcw
} from 'lucide-react';

interface SalesModuleProps {
  brand: Brand;
  user: User;
}

interface SelectedCheckoutPart {
  part_no: string;
  part_name: string;
  mrp: number;
  available_qty: number;
  qty_to_sell: number;
  discount_percentage: number;
  is_net_price?: boolean;
  net_price?: number;
}

export type CheckoutPaymentType = 'UPI' | 'Cash' | 'Payment Pending' | 'Half Payment' | 'Custom Payment';

export default function SalesModule({ brand, user }: SalesModuleProps) {
  const [activeTab, setActiveTab] = useState<'checkout' | 'history'>('checkout');
  
  // Checkout Wizards
  const [customerCategory, setCustomerCategory] = useState<CustomerCategory>('Walk-in');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  
  // Add Customer Modal
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustCategory, setNewCustCategory] = useState<CustomerCategory>('Mistri');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustStartingBalance, setNewCustStartingBalance] = useState<number>(0);
  const [newCustBalanceType, setNewCustBalanceType] = useState<'To Receive' | 'To Give'>('To Receive');

  // Selected Parts for Checkout
  const [checkoutParts, setCheckoutParts] = useState<SelectedCheckoutPart[]>([]);
  const [partSearchInput, setPartSearchInput] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [partSearchError, setPartSearchError] = useState<string | null>(null);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);

  // Staged part for quantity confirmation
  const [stagedPart, setStagedPart] = useState<InventoryItem | null>(null);
  const [stagedQty, setStagedQty] = useState<string | number>(1);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState<number>(0);

  const partSearchInputRef = useRef<HTMLInputElement>(null);
  const stagedQtyInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus staged quantity input when a part is picked
  useEffect(() => {
    if (stagedPart) {
      setTimeout(() => {
        stagedQtyInputRef.current?.focus();
        stagedQtyInputRef.current?.select();
      }, 40);
    }
  }, [stagedPart]);
  
  // Payment Type
  const [checkoutPaymentType, setCheckoutPaymentType] = useState<CheckoutPaymentType>('UPI');
  const [customPaidAmount, setCustomPaidAmount] = useState<number>(0);

  // History states
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyCategory, setHistoryCategory] = useState<string>('All');
  const [historyPayment, setHistoryPayment] = useState<string>('All');
  const [selectedInvoiceForSlip, setSelectedInvoiceForSlip] = useState<Sale | null>(null);
  const [targetWhatsAppPhone, setTargetWhatsAppPhone] = useState('');

  // Pagination state for Sales History Table
  const [salesPage, setSalesPage] = useState(1);
  const salesPerPage = 15;

  useEffect(() => {
    const handler = setTimeout(() => {
      setPartSearch(partSearchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [partSearchInput]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setHistorySearch(historySearchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [historySearchInput]);

  // Reset pagination on filter or brand change
  useEffect(() => {
    setSalesPage(1);
  }, [historySearch, historyCategory, historyPayment, brand]);

  // Global POS keyboard shortcuts for fast checkout
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'checkout') return;

      const activeEl = document.activeElement as HTMLElement | null;
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.tagName === 'SELECT' || 
        activeEl.isContentEditable
      );

      if (e.key === 'Escape') {
        if (stagedPart) {
          e.preventDefault();
          handleCancelStagedPart();
          return;
        }
      }

      if (!isTyping && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) {
        e.preventDefault();
        partSearchInputRef.current?.focus();
        partSearchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, stagedPart]);

  // Pending payment recording states
  const [paymentRecordingSale, setPaymentRecordingSale] = useState<Sale | null>(null);
  const [receivingAmount, setReceivingAmount] = useState<number | string>('');

  const handleSavePaymentRecording = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentRecordingSale) return;
    const amountToReceive = Number(receivingAmount) || 0;
    if (amountToReceive <= 0) {
      alert("Please enter a valid amount greater than 0.");
      return;
    }
    if (amountToReceive > paymentRecordingSale.pending_amount) {
      alert(`Cannot receive more than the pending amount of ₹${paymentRecordingSale.pending_amount.toFixed(2)}`);
      return;
    }

    const nextPaid = paymentRecordingSale.paid_amount + amountToReceive;
    const nextPending = Math.max(0, paymentRecordingSale.total_amount - nextPaid);
    let nextStatus: PaymentStatus = 'Custom Amount';
    if (nextPending === 0) {
      nextStatus = 'Paid';
    }

    try {
      db.updateSalePayment(brand, paymentRecordingSale.id, nextPaid, nextStatus, user);
      triggerToast(`Successfully recorded payment of ₹${amountToReceive.toLocaleString('en-IN')}!`);
      setPaymentRecordingSale(null);
      setReceivingAmount('');
    } catch (err: any) {
      alert(err.message || "Failed to update payment");
    }
  };

  const handleClearFullBalance = () => {
    if (!paymentRecordingSale) return;
    const amountToReceive = paymentRecordingSale.pending_amount;
    const nextPaid = paymentRecordingSale.total_amount;
    try {
      db.updateSalePayment(brand, paymentRecordingSale.id, nextPaid, 'Paid', user);
      triggerToast(`Successfully recorded full outstanding payment of ₹${amountToReceive.toLocaleString('en-IN')}!`);
      setPaymentRecordingSale(null);
      setReceivingAmount('');
    } catch (err: any) {
      alert(err.message || "Failed to update payment");
    }
  };

  // Refresh references
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>(() => db.getInventory(brand));
  const [customersList, setCustomersList] = useState<Customer[]>(() => db.getCustomers());
  const [salesList, setSalesList] = useState<Sale[]>(() => db.getSales(brand));
  const [toastMessageLocal, setToastMessageLocal] = useState<string | null>(null);

  // Undo confirmation states
  const [undoConfirmSale, setUndoConfirmSale] = useState<Sale | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  const itemsToRestore = useMemo(() => {
    if (!undoConfirmSale) return [];
    return db.getSaleItems(brand).filter(item => item.sale_id === undoConfirmSale.id);
  }, [undoConfirmSale, brand, salesList]);

  const handleUndoSale = async () => {
    if (!undoConfirmSale) return;
    setIsUndoing(true);
    setUndoError(null);
    try {
      await db.undoSale(brand, undoConfirmSale.id, user);
      triggerToast(`Successfully undone invoice #${undoConfirmSale.id.substring(0, 8).toUpperCase()}! Stock has been returned to inventory.`);
      setUndoConfirmSale(null);
    } catch (err: any) {
      console.error(err);
      setUndoError(err.message || 'Failed to undo sale. Please try again.');
    } finally {
      setIsUndoing(false);
    }
  };

  const refreshComponentData = () => {
    setInventoryList(db.getInventory(brand));
    setCustomersList(db.getCustomers());
    setSalesList(db.getSales(brand));
  };

  React.useEffect(() => {
    refreshComponentData();
    return db.subscribe(refreshComponentData);
  }, [brand]);

  React.useEffect(() => {
    if (selectedInvoiceForSlip) {
      const parentCustomer = customersList.find(c => c.id === selectedInvoiceForSlip.customer_id);
      setTargetWhatsAppPhone(parentCustomer?.phone || '');
    } else {
      setTargetWhatsAppPhone('');
    }
  }, [selectedInvoiceForSlip, customersList]);

  const triggerToast = (msg: string) => {
    setToastMessageLocal(msg);
    setTimeout(() => setToastMessageLocal(null), 3000);
  };

  // 1. Part search matching
  const matchedSearchParts = useMemo(() => {
    const query = partSearchInput.trim().toLowerCase();
    if (!query) return [];
    return inventoryList.filter(item => {
      return item.is_active && 
        (item.part_no.toLowerCase().includes(query) || 
         item.part_name.toLowerCase().includes(query));
    }).slice(0, 8); // top 8 matches
  }, [inventoryList, partSearchInput]);

  const handleCreateNewCustomer = async () => {
    if (!customerName.trim()) return;
    const existing = customersList.find(c => c.customer_name.trim().toLowerCase() === customerName.trim().toLowerCase());
    if (existing) {
      setSelectedCustomerId(existing.id);
      triggerToast(`Found existing customer: ${existing.customer_name}`);
      return;
    }
    try {
      const created = await db.addCustomer(customerName, customerCategory, phone);
      refreshComponentData();
      setSelectedCustomerId(created.id);
      triggerToast(`Registered new customer ${created.customer_name}`);
    } catch (err: any) {
      alert(`Customer registration failed: ${err.message || err}`);
    }
  };

  const handleSelectExistingCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.customer_name);
    setCustomerCategory(c.customer_category);
    setPhone(c.phone || '');
  };

  // Start the stage & ask quantity process
  const handleInitiatePartAdd = (inv: InventoryItem) => {
    // 1. Get the latest inventory data for this item
    const freshInv = inventoryList.find(i => i.id === inv.id || i.part_no.toLowerCase() === inv.part_no.toLowerCase()) || inv;
    const totalStock = freshInv.quantity;

    // 2. Check if part is out of stock (zero stock)
    if (totalStock <= 0) {
      const msg = `Part ${freshInv.part_no} (${freshInv.part_name}) is not in stock ( zero Stock ). Cannot add to bill.`;
      setPartSearchError(msg);
      triggerToast(`⚠️ Cannot add ${freshInv.part_no} ( zero Stock )!`);
      return;
    }

    // 3. Check if all in-stock units are already in the current bill
    const existingInBill = checkoutParts.find(
      p => p.part_no.toLowerCase() === freshInv.part_no.toLowerCase()
    );
    const inBillQty = existingInBill ? existingInBill.qty_to_sell : 0;
    const remainingStock = totalStock - inBillQty;

    if (remainingStock <= 0) {
      const msg = `Part ${freshInv.part_no} has zero Stock remaining. All ${totalStock} unit(s) are already added to this bill.`;
      setPartSearchError(msg);
      triggerToast(`⚠️ ${freshInv.part_no}: ( zero Stock ) remaining! All ${totalStock} units already in bill.`);
      return;
    }

    // Stock available: clear error and open quantity prompt modal
    setPartSearchError(null);
    setStagedPart(freshInv);
    setStagedQty(1);
    setPartSearchInput('');
    setPartSearch('');
    setHighlightedSearchIndex(0);
  };

  const handleCancelStagedPart = () => {
    setStagedPart(null);
    setStagedQty(1);
    setTimeout(() => {
      partSearchInputRef.current?.focus();
    }, 50);
  };

  // Confirm adding staged part with the requested quantity
  const handleConfirmStagedPart = () => {
    if (!stagedPart) return;

    // Get fresh stock from inventory
    const freshInv = inventoryList.find(i => i.id === stagedPart.id || i.part_no.toLowerCase() === stagedPart.part_no.toLowerCase()) || stagedPart;
    const totalStock = freshInv.quantity;

    if (totalStock <= 0) {
      setPartSearchError(`Part ${freshInv.part_no} is out of stock ( zero Stock ).`);
      triggerToast(`⚠️ Cannot add ${freshInv.part_no} ( zero Stock )!`);
      handleCancelStagedPart();
      return;
    }

    const askingVal = Math.max(1, parseInt(String(stagedQty), 10) || 1);

    // Check if the part already exists in checkoutParts
    const existingIndex = checkoutParts.findIndex(
      p => p.part_no.toLowerCase() === freshInv.part_no.toLowerCase()
    );

    if (existingIndex !== -1) {
      // If same part no. comes again, increase the quantity of that part no. with the asking value
      const existing = checkoutParts[existingIndex];
      const remainingStock = Math.max(0, totalStock - existing.qty_to_sell);

      if (remainingStock <= 0) {
        setPartSearchError(`Part ${freshInv.part_no} has zero Stock remaining (all ${totalStock} units already in bill).`);
        triggerToast(`⚠️ Cannot add ${freshInv.part_no} ( zero Stock ) remaining!`);
        handleCancelStagedPart();
        return;
      }

      // Add the requested quantity up to available remaining stock
      const actualAdd = Math.min(askingVal, remainingStock);
      const newQty = existing.qty_to_sell + actualAdd;

      setCheckoutParts(prev => prev.map((p, idx) => {
        if (idx === existingIndex) {
          return {
            ...p,
            qty_to_sell: newQty,
            available_qty: totalStock
          };
        }
        return p;
      }));

      if (askingVal > remainingStock) {
        triggerToast(`⚠️ Capped at available stock (+${actualAdd}). Total in bill: ${newQty} units.`);
      } else {
        triggerToast(`✓ Added +${actualAdd} to ${freshInv.part_no} in bill (Total in bill: ${newQty} units)`);
      }
    } else {
      // Add new part with the asking quantity up to total stock
      const actualQty = Math.min(askingVal, totalStock);
      const newItem: SelectedCheckoutPart = {
        part_no: freshInv.part_no,
        part_name: freshInv.part_name,
        mrp: freshInv.mrp,
        available_qty: totalStock,
        qty_to_sell: actualQty,
        discount_percentage: 0
      };

      setCheckoutParts(prev => [...prev, newItem]);
      if (askingVal > totalStock) {
        triggerToast(`⚠️ Capped at available stock (${actualQty}). Added to bill.`);
      } else {
        triggerToast(`✓ Added ${actualQty}x ${freshInv.part_no} to bill`);
      }
    }

    setStagedPart(null);
    setStagedQty(1);
    setPartSearchInput('');
    setPartSearch('');
    setHighlightedSearchIndex(0);
    setPartSearchError(null);

    setTimeout(() => {
      partSearchInputRef.current?.focus();
    }, 50);
  };

  const handleAddPartToCheckout = (inv: InventoryItem) => {
    handleInitiatePartAdd(inv);
  };

  const handleRemoveCheckoutPart = (partNo: string) => {
    setCheckoutParts(checkoutParts.filter(p => p.part_no.toLowerCase() !== partNo.toLowerCase()));
  };

  const handleUpdateCheckoutQty = (partNo: string, val: number) => {
    const fresh = inventoryList.find(i => i.part_no.toLowerCase() === partNo.toLowerCase());
    const realStock = fresh ? fresh.quantity : 1;

    setCheckoutParts(checkoutParts.map(p => {
      if (p.part_no.toLowerCase() === partNo.toLowerCase()) {
        const capped = Math.min(realStock, Math.max(1, val));
        if (val > realStock) {
          triggerToast(`⚠️ Max available stock for ${p.part_no} is ${realStock} units.`);
        }
        return { ...p, qty_to_sell: capped, available_qty: realStock };
      }
      return p;
    }));
  };

  const handleUpdateCheckoutDiscount = (partNo: string, pct: number) => {
    setCheckoutParts(checkoutParts.map(p => {
      if (p.part_no === partNo) {
        return { ...p, discount_percentage: Math.min(100, Math.max(0, pct)) };
      }
      return p;
    }));
  };

  const handleUpdateCheckoutMRP = (partNo: string, val: number) => {
    setCheckoutParts(checkoutParts.map(p => {
      if (p.part_no === partNo) {
        return { ...p, mrp: Math.max(0, val) };
      }
      return p;
    }));
  };

  const handleToggleNetPrice = (partNo: string) => {
    setCheckoutParts(checkoutParts.map(p => {
      if (p.part_no === partNo) {
        const nextIsNet = !p.is_net_price;
        const defaultNetPrice = nextIsNet 
          ? Math.round(p.mrp * (1 - (p.discount_percentage / 100))) 
          : p.mrp;
        return { 
          ...p, 
          is_net_price: nextIsNet,
          net_price: defaultNetPrice
        };
      }
      return p;
    }));
  };

  const handleUpdateNetPrice = (partNo: string, val: number) => {
    setCheckoutParts(checkoutParts.map(p => {
      if (p.part_no === partNo) {
        return { ...p, net_price: Math.max(0, val) };
      }
      return p;
    }));
  };

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      alert("Customer name is required.");
      return;
    }
    try {
      const created = await db.addCustomer(
        newCustName.trim(), 
        newCustCategory, 
        newCustPhone.trim() || undefined,
        newCustAddress.trim() || undefined,
        newCustStartingBalance,
        newCustBalanceType,
        user
      );
      refreshComponentData();
      setSelectedCustomerId(created.id);
      setCustomerName(created.customer_name);
      setCustomerCategory(created.customer_category);
      setPhone(created.phone || '');
      setIsAddCustomerModalOpen(false);
      setNewCustName('');
      setNewCustCategory('Mistri');
      setNewCustPhone('');
      setNewCustAddress('');
      setNewCustStartingBalance(0);
      setNewCustBalanceType('To Receive');
      triggerToast(`Customer ${created.customer_name} added & selected!`);
    } catch (err: any) {
      alert(err.message || "Failed to add customer");
    }
  };

  // Math Calculations
  const checkoutSubtotal = useMemo(() => {
    return checkoutParts.reduce((acc, p) => {
      if (p.is_net_price) {
        const net = typeof p.net_price === 'number' ? p.net_price : p.mrp;
        return acc + (net * p.qty_to_sell);
      }
      const lineCost = p.mrp * p.qty_to_sell;
      const lineDiscount = lineCost * (p.discount_percentage / 100);
      return acc + (lineCost - lineDiscount);
    }, 0);
  }, [checkoutParts]);

  const checkoutTotal = useMemo(() => {
    const nonNetSubtotal = checkoutParts.reduce((acc, p) => {
      if (p.is_net_price) return acc;
      const lineCost = p.mrp * p.qty_to_sell;
      const lineDiscount = lineCost * (p.discount_percentage / 100);
      return acc + (lineCost - lineDiscount);
    }, 0);
    const netSubtotal = checkoutParts.reduce((acc, p) => {
      if (!p.is_net_price) return acc;
      const net = typeof p.net_price === 'number' ? p.net_price : p.mrp;
      return acc + (net * p.qty_to_sell);
    }, 0);

    const globalDiscountAmount = nonNetSubtotal * (globalDiscount / 100);
    return Math.max(0, (nonNetSubtotal - globalDiscountAmount) + netSubtotal);
  }, [checkoutParts, globalDiscount]);

  // Payment Calculation
  const { calculatedPaid, calculatedPending, effectivePaymentStatus, effectiveCustomAmount } = useMemo(() => {
    if (checkoutPaymentType === 'UPI' || checkoutPaymentType === 'Cash') {
      return {
        calculatedPaid: checkoutTotal,
        calculatedPending: 0,
        effectivePaymentStatus: 'Paid' as PaymentStatus,
        effectiveCustomAmount: 0
      };
    }
    if (checkoutPaymentType === 'Payment Pending') {
      return {
        calculatedPaid: 0,
        calculatedPending: checkoutTotal,
        effectivePaymentStatus: 'Pending' as PaymentStatus,
        effectiveCustomAmount: 0
      };
    }
    if (checkoutPaymentType === 'Half Payment') {
      const half = Math.round((checkoutTotal / 2) * 100) / 100;
      return {
        calculatedPaid: half,
        calculatedPending: checkoutTotal - half,
        effectivePaymentStatus: 'Custom Amount' as PaymentStatus,
        effectiveCustomAmount: half
      };
    }
    // Custom Payment
    const paid = Math.min(checkoutTotal, Math.max(0, customPaidAmount));
    return {
      calculatedPaid: paid,
      calculatedPending: Math.max(0, checkoutTotal - paid),
      effectivePaymentStatus: (paid >= checkoutTotal ? 'Paid' : paid <= 0 ? 'Pending' : 'Custom Amount') as PaymentStatus,
      effectiveCustomAmount: paid
    };
  }, [checkoutPaymentType, checkoutTotal, customPaidAmount]);

  // SAVE BILL DISPATCH
  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkoutParts.length === 0) {
      alert("Please add at least one part to save invoice");
      return;
    }

    if (!customerName.trim()) {
      alert("Customer Name is required.");
      return;
    }

    try {
      // 1. Resolve Customer registration code
      let finalCustId = selectedCustomerId;
      if (!finalCustId) {
        const created = await db.addCustomer(customerName, customerCategory, phone);
        finalCustId = created.id;
      }

      // 2. Perform DB transaction
      const payloadItems = checkoutParts.map(p => ({
        part_no: p.part_no,
        quantity: p.qty_to_sell,
        discount_percentage: p.is_net_price ? 0 : p.discount_percentage,
        mrp: p.is_net_price && typeof p.net_price === 'number' ? p.net_price : p.mrp
      }));

      const newSale = await db.createSale(
        brand,
        finalCustId,
        customerName,
        customerCategory,
        payloadItems,
        globalDiscount,
        effectivePaymentStatus,
        effectiveCustomAmount,
        user
      );

      // Clean checkout page
      setCheckoutParts([]);
      setCustomerName('');
      setSelectedCustomerId('');
      setPhone('');
      setGlobalDiscount(0);
      setCustomPaidAmount(0);
      setCheckoutPaymentType('UPI');

      refreshComponentData();
      triggerToast(`Saved checkout successfully! Invoice: ${newSale.id}`);
      
      // Open print slip popup directly
      setSelectedInvoiceForSlip(newSale);
    } catch (err: any) {
      alert(`Checkout failed: ${err.message}`);
    }
  };

  // History filters
  const filteredSalesHistory = useMemo(() => {
    return salesList.filter(s => {
      const matchesSearch = s.customer_name.toLowerCase().includes(historySearch.toLowerCase()) || 
                            s.id.toLowerCase().includes(historySearch.toLowerCase());
      
      const matchesCategory = historyCategory === 'All' || s.customer_category === historyCategory;
      const matchesPayment = historyPayment === 'All' || s.payment_status === historyPayment;

      return matchesSearch && matchesCategory && matchesPayment;
    });
  }, [salesList, historySearch, historyCategory, historyPayment]);

  const totalSalesPages = Math.ceil(filteredSalesHistory.length / salesPerPage) || 1;

  const paginatedSalesHistory = useMemo(() => {
    const startIndex = (salesPage - 1) * salesPerPage;
    return filteredSalesHistory.slice(startIndex, startIndex + salesPerPage);
  }, [filteredSalesHistory, salesPage, salesPerPage]);

  const handlePrintSlipAction = () => {
    window.print();
  };

  // Get line items specifically for the print slip modal
  const selectedInvoiceItems = useMemo(() => {
    if (!selectedInvoiceForSlip) return [];
    const allItems = db.getSaleItems(brand);
    return allItems.filter(item => item.sale_id === selectedInvoiceForSlip.id);
  }, [selectedInvoiceForSlip, brand]);

  const handleShareWhatsApp = () => {
    if (!selectedInvoiceForSlip) return;

    // Clean phone number: remove any non-digit/non-plus characters
    const cleanedPhone = targetWhatsAppPhone.replace(/[^\d+]/g, '').trim();
    // Strip leading '+' or non-digits for standard wa.me API format
    const finalPhoneDigits = cleanedPhone.replace(/\D/g, '');

    const dateStr = new Date(selectedInvoiceForSlip.sale_date).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let message = `*SPAREZY Auto Spares - Sale Slip*\n`;
    message += `===============================\n`;
    message += `*Invoice ID:* ${selectedInvoiceForSlip.id.substring(0, 8).toUpperCase()}\n`;
    message += `*Date:* ${dateStr}\n`;
    message += `*Customer:* ${selectedInvoiceForSlip.customer_name} (${selectedInvoiceForSlip.customer_category})\n`;
    message += `===============================\n`;
    message += `*Items:*\n`;

    selectedInvoiceItems.forEach((line) => {
      message += `• *${line.part_name}*\n  ${line.quantity} pcs × ₹${line.mrp.toFixed(0)}`;
      if (line.discount_percentage > 0) {
        message += ` (-${line.discount_percentage}%)`;
      }
      message += ` = *₹${line.final_amount.toFixed(0)}*\n`;
    });

    message += `===============================\n`;
    message += `*Subtotal:* ₹${selectedInvoiceForSlip.subtotal.toFixed(2)}\n`;
    if (selectedInvoiceForSlip.discount_amount > 0) {
      message += `*Discount (${selectedInvoiceForSlip.discount_percentage}%):* -₹${selectedInvoiceForSlip.discount_amount.toFixed(2)}\n`;
    }
    message += `*Total Paid Amount:* *₹${selectedInvoiceForSlip.paid_amount.toFixed(2)}*\n`;
    if (selectedInvoiceForSlip.pending_amount > 0) {
      message += `*Pending Balance:* *₹${selectedInvoiceForSlip.pending_amount.toFixed(2)}*\n`;
    }
    message += `===============================\n`;
    message += `Thank you for doing business with us!\n`;
    message += `_SPAREZY POS system_`;

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${finalPhoneDigits}&text=${encodedText}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    
    triggerToast("Opening WhatsApp Share link...");
  };

  return (
    <div className="space-y-6">
      
      {/* Toast message wrapper */}
      {toastMessageLocal && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-bounce">
          <CheckCircle2Icon className="w-4.5 h-4.5 text-emerald-400" />
          {toastMessageLocal}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => {
            setActiveTab('checkout');
            refreshComponentData();
          }}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'checkout'
              ? 'border-indigo-600 text-indigo-650'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          New Sale checkout Bill
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
          <Calendar className="w-4 h-4" />
          Sales Invoice history ({salesList.length} Invoices)
        </button>
      </div>

      {activeTab === 'checkout' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Checkout Steps Form */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Customer category & Selection */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 inline-flex items-center justify-center font-bold text-xs">
                    1
                  </span>
                  Customer Selection & Profile
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddCustomerModalOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition cursor-pointer border border-indigo-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Add New Customer
                </button>
              </div>

              <div className="space-y-3 font-semibold text-slate-700 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">Customer Category</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['Walk-in', 'Mistri', 'Retailer', 'Garage'] as CustomerCategory[]).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCustomerCategory(cat);
                        }}
                        className={`p-2 rounded-xl border text-center transition ${
                          customerCategory === cat
                            ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold'
                            : 'border-slate-200 text-slate-600 bg-white hover:border-slate-350'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-slate-500">Customer Name *</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full p-2.5 border border-slate-200 rounded-xl font-medium"
                        placeholder="Search or enter customer name..."
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          setCustomerSearchQuery(e.target.value);
                        }}
                      />
                      {selectedCustomerId && (
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Existing
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-500">Phone Number (Optional)</label>
                    <input
                      type="tel"
                      className="w-full p-2.5 border border-slate-200 rounded-xl"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                {/* Quick Auto-complete / Search matches */}
                <div className="bg-slate-50 p-3 rounded-xl space-y-2 border border-slate-150">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Select From Saved Customers ({customersList.length} Total)
                    </p>
                    {selectedCustomerId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomerId('');
                          setCustomerName('');
                          setPhone('');
                        }}
                        className="text-[10px] text-rose-500 hover:underline font-bold"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {customersList
                      .filter(c => {
                        if (!customerSearchQuery) return c.customer_category === customerCategory;
                        return c.customer_name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                               (c.phone && c.phone.includes(customerSearchQuery));
                      })
                      .slice(0, 8)
                      .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectExistingCustomer(c)}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer ${
                            selectedCustomerId === c.id 
                              ? 'bg-indigo-600 text-white border-transparent font-bold shadow-xs' 
                              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                          }`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{c.customer_name}</span>
                          <span className="text-[9px] opacity-75 font-normal">({c.customer_category})</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Sale Items search and grid with Net Price options */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 inline-flex items-center justify-center font-bold text-xs">
                  2
                </span>
                Add Spare Parts to Sell Bill
              </h3>

              {/* Part searching bar */}
              <div className="relative font-semibold text-slate-700 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-500">Search active parts by part no or part name</label>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Press <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px]">/</kbd> to focus, <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px]">Enter</kbd> to set qty
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
                  <input
                    ref={partSearchInputRef}
                    type="text"
                    className="w-full pl-9 pr-16 py-2 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-600/30"
                    placeholder="Search part no, name, or scan barcode... (Press '/' to focus)"
                    value={partSearchInput}
                    onChange={(e) => {
                      setPartSearchInput(e.target.value);
                      setPartSearch(e.target.value);
                      setHighlightedSearchIndex(0);
                      if (partSearchError) setPartSearchError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (matchedSearchParts.length > 0) {
                          setHighlightedSearchIndex(prev => (prev < matchedSearchParts.length - 1 ? prev + 1 : prev));
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (matchedSearchParts.length > 0) {
                          setHighlightedSearchIndex(prev => (prev > 0 ? prev - 1 : 0));
                        }
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const query = partSearchInput.trim().toLowerCase();
                        if (!query) return;

                        // 1. If highlighted suggestion is selected
                        if (highlightedSearchIndex >= 0 && matchedSearchParts[highlightedSearchIndex]) {
                          handleInitiatePartAdd(matchedSearchParts[highlightedSearchIndex]);
                          return;
                        }

                        // 2. Exact match in active inventory
                        const exact = inventoryList.find(i => i.is_active && i.part_no.toLowerCase() === query);
                        if (exact) {
                          handleInitiatePartAdd(exact);
                          return;
                        }

                        // 3. First matched suggestion
                        if (matchedSearchParts.length > 0) {
                          handleInitiatePartAdd(matchedSearchParts[0]);
                          return;
                        }

                        triggerToast(`Part "${partSearchInput.trim()}" not found in active inventory.`);
                      } else if (e.key === 'Escape') {
                        setPartSearchInput('');
                        setPartSearch('');
                        setHighlightedSearchIndex(0);
                        setPartSearchError(null);
                      }
                    }}
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                    <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded">
                      ↵ Enter
                    </kbd>
                  </div>
                </div>

                {/* Explicit Out-Of-Stock (zero Stock) Error Notification Banner */}
                {partSearchError && (
                  <div className="mt-2 p-3 bg-rose-50 border-2 border-rose-300 text-rose-800 rounded-xl text-xs flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">🚫</span>
                      <div>
                        <span className="font-extrabold uppercase tracking-wide text-rose-900 mr-1.5">[zero Stock Error]</span>
                        <span className="font-semibold">{partSearchError}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPartSearchError(null)}
                      className="text-rose-500 hover:text-rose-800 font-black text-base px-2 py-0.5 rounded hover:bg-rose-100 transition cursor-pointer"
                      title="Dismiss error"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Autocomplete drawer */}
                {matchedSearchParts.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    <div className="bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500 font-semibold flex items-center justify-between border-b border-slate-100 select-none">
                      <span>Matches ({matchedSearchParts.length}) &mdash; Use ↑/↓ to navigate, Enter to choose & set quantity</span>
                      <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-mono">↵ Enter</kbd>
                    </div>
                    {matchedSearchParts.map((item, idx) => {
                      const isHighlighted = idx === highlightedSearchIndex;
                      const alreadyInBill = checkoutParts.find(p => p.part_no.toLowerCase() === item.part_no.toLowerCase());
                      const inBillQty = alreadyInBill ? alreadyInBill.qty_to_sell : 0;
                      const remainingStock = Math.max(0, item.quantity - inBillQty);
                      const isZeroStock = item.quantity <= 0;
                      const isZeroRemaining = !isZeroStock && remainingStock <= 0;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseEnter={() => setHighlightedSearchIndex(idx)}
                          onClick={() => handleInitiatePartAdd(item)}
                          className={`w-full p-2.5 text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                            isZeroStock
                              ? 'bg-rose-50/50 hover:bg-rose-100/60 border-l-4 border-l-rose-500'
                              : isZeroRemaining
                              ? 'bg-amber-50/50 hover:bg-amber-100/60 border-l-4 border-l-amber-500'
                              : isHighlighted 
                              ? 'bg-indigo-50/90 ring-1 ring-indigo-500 ring-inset' 
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-slate-900 font-mono font-bold">{item.part_no}</span>
                              {isZeroStock && (
                                <span className="px-2 py-0.5 bg-rose-600 text-white rounded text-[10px] font-black uppercase tracking-wider animate-pulse shadow-2xs">
                                  ( zero Stock )
                                </span>
                              )}
                              {isZeroRemaining && (
                                <span className="px-2 py-0.5 bg-rose-500 text-white rounded text-[10px] font-bold shadow-2xs">
                                  ( zero Stock remaining )
                                </span>
                              )}
                              {alreadyInBill && !isZeroRemaining && (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[9px] font-bold">
                                  In Bill: {alreadyInBill.qty_to_sell} ({remainingStock} left)
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 text-[10px] font-normal">{item.part_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-indigo-600 font-bold">₹{item.mrp}</p>
                            <p className={`text-[10px] font-bold ${
                              isZeroStock || isZeroRemaining
                                ? 'text-rose-600 font-black' 
                                : item.quantity <= 3 
                                ? 'text-amber-600' 
                                : 'text-slate-400 font-normal'
                            }`}>
                              {isZeroStock ? '0 in stock' : isZeroRemaining ? '0 available' : `Stock: ${item.quantity}`}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sold Quantity Prompt Modal */}
              {stagedPart && (() => {
                const freshInv = inventoryList.find(i => i.id === stagedPart.id || i.part_no.toLowerCase() === stagedPart.part_no.toLowerCase()) || stagedPart;
                const totalStock = freshInv.quantity;
                const existingInBill = checkoutParts.find(
                  p => p.part_no.toLowerCase() === freshInv.part_no.toLowerCase()
                );
                const inBillQty = existingInBill ? existingInBill.qty_to_sell : 0;
                const remainingStock = Math.max(0, totalStock - inBillQty);
                const askingNum = Math.max(1, parseInt(String(stagedQty), 10) || 1);
                const calculatedNextTotal = inBillQty + askingNum;
                const lineTotal = freshInv.mrp * askingNum;
                const isOutOfStock = totalStock <= 0;
                const isZeroRemaining = !isOutOfStock && remainingStock <= 0;
                const isOverRemaining = askingNum > remainingStock;

                return (
                  <div 
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) handleCancelStagedPart();
                    }}
                  >
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95">
                      
                      {/* Modal Header */}
                      <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl border ${isOutOfStock || isZeroRemaining ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                            <ShoppingBag className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900">
                              Enter Sold Quantity
                            </h3>
                            <p className="text-xs text-slate-500">
                              Specify quantity (default is 1) then add part to sales bill.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCancelStagedPart}
                          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition text-lg font-bold leading-none cursor-pointer"
                          title="Cancel (Esc)"
                        >
                          &times;
                        </button>
                      </div>

                      {/* Part Details Box */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-mono font-bold text-xs tracking-wide shadow-2xs">
                            {freshInv.part_no}
                          </span>
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                            MRP: ₹{freshInv.mrp}
                          </span>
                        </div>
                        
                        <div>
                          <h4 className="font-bold text-sm text-slate-800 leading-snug">{freshInv.part_name}</h4>
                          {freshInv.hsn && (
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">HSN: {freshInv.hsn}</p>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-1.5 text-xs border-t border-slate-200/60">
                          <span className="text-slate-500 font-medium">Total Inventory Stock:</span>
                          <span className={`font-bold font-mono px-2 py-0.5 rounded ${
                            isOutOfStock 
                              ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                              : totalStock <= 3 
                              ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {totalStock} units
                          </span>
                        </div>

                        {existingInBill && (
                          <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-xs text-amber-900 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Already in current bill:</span>
                              <span className="font-mono font-bold">{existingInBill.qty_to_sell} units</span>
                            </div>
                            <div className="flex items-center justify-between text-indigo-900">
                              <span className="font-semibold">Remaining available to add:</span>
                              <span className="font-mono font-black text-indigo-700">{remainingStock} units</span>
                            </div>
                            <div className="text-[11px] text-slate-600 pt-1 border-t border-amber-200/60">
                              Adding <strong>+{askingNum}</strong> will make total in bill: <strong>{calculatedNextTotal} units</strong>.
                            </div>
                          </div>
                        )}

                        {isOutOfStock && (
                          <div className="bg-rose-50 border-2 border-rose-300 p-2.5 rounded-lg text-xs text-rose-800 font-bold flex items-center gap-2">
                            <span>🚫</span>
                            <span>Error: Part is not in stock ( zero Stock ). Cannot add to bill.</span>
                          </div>
                        )}

                        {isZeroRemaining && (
                          <div className="bg-rose-50 border-2 border-rose-300 p-2.5 rounded-lg text-xs text-rose-800 font-bold flex items-center gap-2">
                            <span>⚠️</span>
                            <span>Error: ( zero Stock ) remaining! All {totalStock} unit(s) are already in the bill.</span>
                          </div>
                        )}

                        {isOverRemaining && !isOutOfStock && !isZeroRemaining && (
                          <div className="bg-rose-50 border border-rose-300 p-2 rounded-lg text-[11px] text-rose-800 font-semibold">
                            ⚠️ Quantity ({askingNum}) exceeds remaining stock ({remainingStock} units). Maximum you can add is {remainingStock}.
                          </div>
                        )}
                      </div>

                      {/* Quantity Input Form */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleConfirmStagedPart();
                        }}
                        className="space-y-4"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label htmlFor="staged-modal-qty-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Sold Quantity (Default: 1)
                            </label>
                            <span className="text-[10px] text-slate-400">
                              {remainingStock > 0 ? `Max available: ${remainingStock}` : 'No stock available'}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isOutOfStock || isZeroRemaining}
                              onClick={() => setStagedQty(prev => Math.max(1, (parseInt(String(prev), 10) || 1) - 1))}
                              className="w-12 h-12 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xl transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Decrease quantity by 1"
                            >
                              -
                            </button>

                            <div className="relative flex-1">
                              <input
                                id="staged-modal-qty-input"
                                ref={stagedQtyInputRef}
                                type="number"
                                min="1"
                                max={remainingStock > 0 ? remainingStock : 1}
                                step="1"
                                disabled={isOutOfStock || isZeroRemaining}
                                value={stagedQty}
                                onChange={(e) => setStagedQty(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleCancelStagedPart();
                                  }
                                }}
                                className={`w-full h-12 border-2 rounded-xl text-center text-2xl font-black font-mono focus:outline-none focus:ring-4 ${
                                  isOutOfStock || isZeroRemaining
                                    ? 'border-rose-300 bg-rose-50 text-rose-700 cursor-not-allowed'
                                    : isOverRemaining
                                    ? 'border-rose-500 bg-rose-50/50 text-rose-900 focus:ring-rose-500/20'
                                    : 'border-indigo-500 bg-indigo-50/20 text-slate-900 focus:ring-indigo-500/20'
                                }`}
                                placeholder="1"
                                autoFocus
                              />
                            </div>

                            <button
                              type="button"
                              disabled={isOutOfStock || isZeroRemaining || askingNum >= remainingStock}
                              onClick={() => setStagedQty(prev => Math.min(remainingStock, (parseInt(String(prev), 10) || 0) + 1))}
                              className="w-12 h-12 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xl transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Increase quantity by 1"
                            >
                              +
                            </button>
                          </div>

                          {/* Quick Preset Buttons */}
                          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Presets:</span>
                            {[1, 2, 3, 5, 10].filter(n => n <= remainingStock).map(n => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setStagedQty(n)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition border cursor-pointer ${
                                  parseInt(String(stagedQty), 10) === n
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                            {remainingStock > 0 && (
                              <button
                                type="button"
                                onClick={() => setStagedQty(remainingStock)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition cursor-pointer ml-auto"
                                title="Set to all remaining available stock"
                              >
                                All Stock ({remainingStock})
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Estimated Line Total Preview */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">Estimated Added Amount:</span>
                          <span className="font-mono font-black text-sm text-slate-900">
                            {askingNum} × ₹{freshInv.mrp} = <span className="text-indigo-600">₹{lineTotal.toLocaleString('en-IN')}</span>
                          </span>
                        </div>

                        {/* Footer Action Buttons */}
                        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-150">
                          <button
                            type="button"
                            onClick={handleCancelStagedPart}
                            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
                          >
                            <span>Cancel</span>
                            <kbd className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-100 text-slate-400 border border-slate-200">Esc</kbd>
                          </button>

                          <button
                            type="submit"
                            disabled={isOutOfStock || isZeroRemaining || remainingStock <= 0}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-md hover:shadow-indigo-500/25 transition cursor-pointer flex items-center gap-2 active:scale-95"
                          >
                            <Plus className="w-4 h-4" />
                            <span>
                              {isOutOfStock || isZeroRemaining 
                                ? '( zero Stock )' 
                                : existingInBill 
                                ? `Add to Bill (+${askingNum})` 
                                : `Add to Bill (${askingNum})`}
                            </span>
                            {!isOutOfStock && !isZeroRemaining && (
                              <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-800 text-indigo-100 border border-indigo-500/60 font-bold">
                                ↵ Enter
                              </kbd>
                            )}
                          </button>
                        </div>
                      </form>

                    </div>
                  </div>
                );
              })()}

              {/* Added items list */}
              <div className="pt-2">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-semibold">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                        <th className="p-3">Spare Part Details</th>
                        <th className="p-3 text-center">MRP (₹)</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-center">Net Price Option</th>
                        <th className="p-3 text-center">Dis %</th>
                        <th className="p-3 text-right">Final Amount</th>
                        <TH_PRINT />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {checkoutParts.map((item) => {
                        const lineVal = item.mrp * item.qty_to_sell;
                        const lineDiscount = lineVal * (item.discount_percentage / 100);
                        const finalLineVal = item.is_net_price 
                          ? (item.net_price || item.mrp) * item.qty_to_sell
                          : lineVal - lineDiscount;

                        return (
                          <tr key={item.part_no} className="hover:bg-slate-50/50">
                            <td className="p-3 max-w-[180px]">
                              <p className="font-bold font-mono text-slate-900 leading-tight">
                                {item.part_no}
                              </p>
                              <p className="text-[10px] text-slate-400 font-normal leading-tight">{item.part_name}</p>
                            </td>
                            
                            <td className="p-3 text-center">
                              <span className="font-mono font-medium">₹{item.mrp}</span>
                            </td>
                            
                            <td className="p-3 text-center">
                              <div className="inline-flex items-center gap-1 justify-center">
                                <input
                                  type="number"
                                  min="1"
                                  max={item.available_qty}
                                  className="w-14 p-1 border border-slate-200 rounded text-center text-xs font-bold"
                                  value={item.qty_to_sell}
                                  onChange={(e) => handleUpdateCheckoutQty(item.part_no, Number(e.target.value))}
                                />
                                <span className="text-[10px] text-slate-400 font-normal">/ {item.available_qty}</span>
                              </div>
                            </td>

                            {/* Net Price Option Column */}
                            <td className="p-3 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <label className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!item.is_net_price}
                                    onChange={() => handleToggleNetPrice(item.part_no)}
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span>Net Price</span>
                                </label>
                                {item.is_net_price && (
                                  <div className="inline-flex items-center gap-0.5">
                                    <span className="text-slate-400 font-bold text-[10px]">₹</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={item.net_price ?? item.mrp}
                                      onChange={(e) => handleUpdateNetPrice(item.part_no, Number(e.target.value))}
                                      className="w-16 p-0.5 border border-indigo-300 rounded text-center text-xs font-bold font-mono bg-indigo-50/50 text-indigo-900"
                                      placeholder="Net ₹"
                                    />
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                disabled={!!item.is_net_price}
                                className={`w-12 p-1 border rounded text-center text-xs ${
                                  item.is_net_price 
                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                    : 'border-slate-200'
                                }`}
                                value={item.is_net_price ? 0 : (item.discount_percentage || '')}
                                onChange={(e) => handleUpdateCheckoutDiscount(item.part_no, Number(e.target.value))}
                              />
                            </td>

                            <td className="p-3 text-right font-bold font-mono text-slate-900">
                              ₹{finalLineVal.toFixed(2)}
                            </td>
                            
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveCheckoutPart(item.part_no)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {checkoutParts.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 text-xs font-normal">
                            No parts currently loaded in active sale slip. Search above to add parts.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>

          {/* Right Summary Billing Panel */}
          <div className="space-y-6">
            
            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl space-y-6">
              <h3 className="font-bold text-sm tracking-wide uppercase flex items-center gap-1 text-slate-350">
                <CreditCard className="w-4.5 h-4.5" />
                Receipt Calculations
              </h3>

              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Pre-Discount Subtotal</span>
                  <span className="font-mono">₹{checkoutSubtotal.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 font-semibold">Bill Discount % (Non-Net Items)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="w-16 p-1 border border-slate-700 rounded bg-slate-850 text-white text-center font-bold"
                    value={globalDiscount || ''}
                    onChange={(e) => setGlobalDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                  />
                </div>

                <div className="border-t border-slate-800 pt-3 flex justify-between items-baseline">
                  <span className="text-slate-400 font-extrabold text-sm">Payable Invoice Total</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">₹{checkoutTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Step 3: Choose Payment Type */}
              <div className="space-y-3 pt-3 border-t border-slate-850 text-xs">
                <label className="block text-slate-350 uppercase tracking-widest text-[10px] font-bold">
                  Select Payment Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(['UPI', 'Cash', 'Payment Pending', 'Half Payment', 'Custom Payment'] as CheckoutPaymentType[]).map((pt) => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setCheckoutPaymentType(pt)}
                      className={`py-2 px-1 rounded-xl text-[10px] font-bold text-center border transition cursor-pointer ${
                        checkoutPaymentType === pt
                          ? 'bg-emerald-600 text-white border-transparent shadow-sm'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {pt}
                    </button>
                  ))}
                </div>

                {checkoutPaymentType === 'Custom Payment' && (
                  <div className="space-y-2 bg-slate-850/80 p-3 rounded-xl border border-slate-800">
                    <label className="block text-slate-400">Enter Cash/UPI Paid (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      max={checkoutTotal}
                      className="w-full p-2 rounded-xl border border-slate-700 bg-slate-900 text-white font-mono font-bold"
                      value={customPaidAmount || ''}
                      onChange={(e) => setCustomPaidAmount(Number(e.target.value))}
                      placeholder="Amount collected now..."
                    />
                  </div>
                )}

                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800 space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between text-emerald-400">
                    <span>Paid Now:</span>
                    <span>₹{calculatedPaid.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-amber-400">
                    <span>Pending Due:</span>
                    <span>₹{calculatedPending.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Dispatch Action */}
              <button
                type="button"
                onClick={handleSaveBill}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-extrabold shadow-lg hover:shadow-indigo-500/10 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Save Invoice &amp; Deduct Stock</span>
                <ChevronRight className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="border border-slate-200 bg-white p-4 rounded-2xl text-xs text-slate-400">
              <p className="font-bold text-slate-600">On completing the bill:</p>
              <ul className="list-disc pl-4 mt-2 space-y-1">
                <li>Inventory items are deducted immediately.</li>
                <li>Customer ledger is updated with transaction entries.</li>
                <li>Invoice receipt slip opens automatically for printing/sharing.</li>
              </ul>
            </div>

          </div>

        </div>
      ) : (
        /* History tab */
        <div className="space-y-4">
          
          {/* History Search/Filters */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-3">
            
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
              <input
                type="text"
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-indigo-600/20"
                placeholder="Search history by Customer Name or Sale ID..."
                value={historySearchInput}
                onChange={(e) => setHistorySearchInput(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {/* Category filter */}
              <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-600">
                <span className="text-[10px] uppercase font-bold text-slate-400">Category:</span>
                <select 
                  className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
                  value={historyCategory}
                  onChange={(e) => setHistoryCategory(e.target.value)}
                >
                  <option value="All">All Categories</option>
                  <option value="Walk-in">Walk-in</option>
                  <option value="Mistri">Mistri</option>
                  <option value="Retailer">Retailer</option>
                  <option value="Garage">Garage</option>
                </select>
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-600">
                <span className="text-[10px] uppercase font-bold text-slate-400">Payment:</span>
                <select 
                  className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
                  value={historyPayment}
                  onChange={(e) => setHistoryPayment(e.target.value)}
                >
                  <option value="All">All Payment States</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Custom Amount">Custom Amount</option>
                </select>
              </div>
            </div>

          </div>

          {/* History list box */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs font-semibold text-slate-600">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-4">Invoice ID</th>
                    <th className="p-4">Sale Date</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Subtotal</th>
                    <th className="p-4">Disc %</th>
                    <th className="p-4">Final Bill</th>
                    <th className="p-4">Collector Status</th>
                    <th className="p-4 text-right">Utility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {paginatedSalesHistory.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/50">
                      <td className="p-4 font-mono font-bold text-slate-900 animate-fade-in" title={sale.id}>
                        {sale.id.length > 10 ? `#${sale.id.substring(0, 8).toUpperCase()}` : sale.id}
                      </td>
                      <td className="p-4 font-normal text-slate-450">{new Date(sale.sale_date).toLocaleDateString()}</td>
                      <td className="p-4 font-medium text-slate-800">{sale.customer_name}</td>
                      <td className="p-4">{sale.customer_category}</td>
                      <td className="p-4">₹{sale.subtotal.toFixed(2)}</td>
                      <td className="p-4 text-center">{sale.discount_percentage}%</td>
                      <td className="p-4 font-bold text-slate-900">₹{sale.total_amount.toFixed(2)}</td>
                      <td className="p-4">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex self-start px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            sale.payment_status === 'Paid' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {sale.payment_status}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">Paid: ₹{(sale.paid_amount || 0).toLocaleString('en-IN')}</span>
                          {(sale.pending_amount || 0) > 0 && (
                            <span className="text-[10px] text-amber-600 font-bold font-mono">Due: ₹{sale.pending_amount.toLocaleString('en-IN')}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right flex justify-end gap-1.5 items-center">
                        {sale.pending_amount > 0 && (
                          <button
                            onClick={() => {
                              setPaymentRecordingSale(sale);
                              setReceivingAmount('');
                            }}
                            className="p-1 px-2 text-emerald-650 hover:bg-emerald-50 border border-emerald-200 hover:border-emerald-300 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition shadow-xs"
                          >
                            <CreditCard className="w-3 h-3 text-emerald-600" />
                            Record Payment
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedInvoiceForSlip(sale)}
                          className="p-1 px-2 text-indigo-650 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View / Print Slip
                        </button>
                        <button
                          onClick={() => {
                            setUndoConfirmSale(sale);
                            setUndoError(null);
                          }}
                          className="p-1 px-2 text-rose-650 hover:bg-rose-50 border border-rose-250 hover:border-rose-400 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition shadow-xs"
                          title="Undo sale & return parts to stock"
                        >
                          <RotateCcw className="w-3 h-3 text-rose-600" />
                          Undo
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paginatedSalesHistory.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-400 font-normal">
                        No invoices returned for active query filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalSalesPages > 1 && (
              <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between">
                <span className="text-slate-500 text-[11px] font-semibold">
                  Page <strong className="text-slate-800">{salesPage}</strong> of <strong className="text-slate-800">{totalSalesPages}</strong> ({filteredSalesHistory.length} total sales)
                </span>
                <div className="inline-flex gap-1.5 text-[11px] font-bold">
                  <button
                    onClick={() => setSalesPage(prev => Math.max(1, prev - 1))}
                    disabled={salesPage === 1}
                    className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xs transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setSalesPage(prev => Math.min(totalSalesPages, prev + 1))}
                    disabled={salesPage === totalSalesPages}
                    className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xs transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* PRINT SLIP SLIDER MODAL (With direct print function) */}
      {selectedInvoiceForSlip !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden text-xs">
            
            {/* Header */}
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center no-print">
              <h3 className="font-bold text-slate-800">Print Store Reciept Slip</h3>
              <button 
                onClick={() => setSelectedInvoiceForSlip(null)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Print Slip Document Box */}
            <div id="print-receipt-paper" className="p-6 font-mono text-slate-900 space-y-4 max-h-[70vh] overflow-y-auto bg-slate-50">
              
              {/* Slip Layout Template */}
              <div className="text-center pb-2 border-b-2 border-dashed border-slate-350 space-y-1">
                <h4 className="text-sm font-bold tracking-widest text-[#000]">SPAREZY Auto Spares</h4>
                <p className="text-[10px] text-slate-650">Brand Gateway: {brand}</p>
                <p className="text-[10px] text-slate-650">Email: info@sparezy.com</p>
                <div className="text-[10px] text-slate-500 pt-2 text-left space-y-0.5">
                  <p title={selectedInvoiceForSlip.id}>Invoice ID : {selectedInvoiceForSlip.id.length > 10 ? selectedInvoiceForSlip.id.substring(0, 8).toUpperCase() : selectedInvoiceForSlip.id}</p>
                  <p>Date       : {new Date(selectedInvoiceForSlip.sale_date).toLocaleString()}</p>
                  <p>Customer   : {selectedInvoiceForSlip.customer_name} ({selectedInvoiceForSlip.customer_category})</p>
                </div>
              </div>

              {/* Items Lines */}
              <div className="space-y-2 py-2 border-b-2 border-dashed border-slate-350">
                <div className="flex justify-between font-bold text-[10px] uppercase text-slate-500">
                  <span>Part Item list details</span>
                  <div className="flex gap-4">
                    <span className="w-10 text-center">Qty * MRP</span>
                    <span className="w-16 text-right">Total</span>
                  </div>
                </div>

                <div className="divide-y divide-dashed divide-slate-200">
                  {selectedInvoiceItems.map((line) => (
                    <div key={line.id} className="py-2 flex justify-between gap-2.5">
                      
                      {/* ONLY SHOW PART NAME, QTY, MRP, DISCOUNT and TOTAL. DO NOT SHOW PART NUMBER! */}
                      <div>
                        <p className="font-bold text-[#000]">{line.part_name}</p>
                        {line.discount_percentage > 0 && (
                          <span className="text-[10px] text-slate-550 italic">Item Discount: -{line.discount_percentage}%</span>
                        )}
                      </div>

                      <div className="flex gap-4 shrink-0 text-[11px] items-baseline">
                        <span className="w-10 text-center text-slate-600">{line.quantity} &times; {line.mrp}</span>
                        <span className="w-16 text-right font-bold">₹{line.final_amount.toFixed(0)}</span>
                      </div>

                    </div>
                  ))}
                </div>
              </div>

              {/* Accumulates Math */}
              <div className="space-y-1.5 text-[11px] text-right font-bold">
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Subtotal:</span>
                  <span>₹{selectedInvoiceForSlip.subtotal.toFixed(2)}</span>
                </div>
                {selectedInvoiceForSlip.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Invoice Discount ({selectedInvoiceForSlip.discount_percentage}%):</span>
                    <span>-₹{selectedInvoiceForSlip.discount_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#000] text-sm pt-2 border-t border-slate-300">
                  <span>Total Amount Paid:</span>
                  <span>₹{selectedInvoiceForSlip.paid_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-600 text-xs">
                  <span>Pending Balance:</span>
                  <span>₹{selectedInvoiceForSlip.pending_amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center pt-4 border-t-2 border-dashed border-slate-350 text-[10px] text-slate-400">
                <p>Thank you for doing business with us!</p>
                <p className="mt-1">Generated by User: {selectedInvoiceForSlip.created_by}</p>
              </div>

            </div>

            {/* Print and Save Options */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex flex-col gap-4 no-print">
              
              {/* WhatsApp Live Sharing Form */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                <div className="flex items-center gap-1.5 text-indigo-700 font-bold uppercase tracking-wider text-[9px] font-sans">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>WhatsApp Sale Slip Share</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-[10px]">+</span>
                    <input
                      id="whatsapp-share-phone"
                      type="tel"
                      placeholder="919876543210 (Country Code + Phone)"
                      value={targetWhatsAppPhone}
                      onChange={(e) => setTargetWhatsAppPhone(e.target.value)}
                      className="w-full pl-5 pr-2.5 py-2 font-mono text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    id="whatsapp-share-submit"
                    onClick={handleShareWhatsApp}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition duration-150 shadow-sm cursor-pointer whitespace-nowrap"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share Slip
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 leading-normal font-sans">
                  Make sure to include the country code (e.g. 91) without '+' or spaces.
                </p>
              </div>

              {/* Print and Close buttons */}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  id="print-trigger-button"
                  onClick={() => {
                    const content = document.getElementById('print-receipt-paper')?.innerHTML;
                    const win = window.open('', '', 'height=600,width=400');
                    if (win) {
                      win.document.write('<html><head><title>Sparezy POS Slip</title><style>body { font-family: monospace; padding: 20px; text-transform: uppercase; color: #000; }</style></head><body>');
                      win.document.write(content || '');
                      win.document.write('</body></html>');
                      win.document.close();
                      win.print();
                    }
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                >
                  <Printer className="w-4 h-4" />
                  Trigger Print
                </button>
                <button
                  type="button"
                  id="close-view-button"
                  onClick={() => setSelectedInvoiceForSlip(null)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-xl font-medium cursor-pointer text-xs"
                >
                  Close View
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentRecordingSale !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden text-xs">
            
            {/* Header */}
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-indigo-600">Register Pending Payment</span>
                <h3 className="font-extrabold text-slate-900 text-sm" title={paymentRecordingSale.id}>
                  Invoice #{paymentRecordingSale.id.length > 10 ? paymentRecordingSale.id.substring(0, 8).toUpperCase() : paymentRecordingSale.id} Summary
                </h3>
              </div>
              <button 
                onClick={() => setPaymentRecordingSale(null)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentRecording} className="p-6 space-y-5 font-sans">
              
              {/* Detailed Breakdown */}
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-2 text-slate-700">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider pb-1.5 border-b border-slate-200">
                  <span>Customer details</span>
                  <span>Invoice info</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-slate-900 font-bold text-sm">{paymentRecordingSale.customer_name}</span>
                  <span className="text-slate-500 font-mono text-[11px]">{new Date(paymentRecordingSale.sale_date).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-xs font-medium text-slate-500">
                  <span>Category: {paymentRecordingSale.customer_category}</span>
                  <span>Total Bill: ₹{paymentRecordingSale.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="h-px bg-slate-200 my-2"></div>
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-emerald-700 font-bold font-sans">Already Cleared:</span>
                  <span className="text-emerald-700 font-bold">₹{paymentRecordingSale.paid_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-amber-800 font-bold font-sans">Current Outstanding:</span>
                  <span className="text-amber-800 font-bold text-amber-700">₹{paymentRecordingSale.pending_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Input section */}
              <div className="space-y-2 text-left">
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider text-left">
                  Receive Additional Payment Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    max={paymentRecordingSale.pending_amount}
                    placeholder="Enter received amount (INR)"
                    required
                    className="w-full pl-7 pr-4 py-2 border border-slate-200 rounded-xl font-bold font-mono text-slate-900 focus:ring-1 focus:ring-indigo-650"
                    value={receivingAmount}
                    onChange={(e) => setReceivingAmount(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-slate-450 leading-relaxed font-normal">
                  Receive a custom partial amount or click "Clear Full Balance" below to wipe the balance off.
                </p>
              </div>

              {/* Dynamic calculations on entry */}
              {Number(receivingAmount) > 0 && Number(receivingAmount) <= paymentRecordingSale.pending_amount && (
                <div className="bg-indigo-50/50 p-3.5 border border-indigo-100 rounded-xl space-y-1 font-semibold text-indigo-950 text-left">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-sans">New Total Paid:</span>
                    <span className="font-mono font-bold">₹{(paymentRecordingSale.paid_amount + Number(receivingAmount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="font-sans">Remaining Outstanding Due:</span>
                    <span className="font-mono font-bold text-amber-700">₹{Math.max(0, paymentRecordingSale.pending_amount - Number(receivingAmount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2 text-xs font-bold font-sans">
                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-black text-white py-2.5 rounded-xl cursor-pointer text-center flex items-center justify-center gap-1 shadow-sm transition"
                >
                  <Check className="w-4 h-4 text-emerald-450" />
                  Save Partial Payment
                </button>
                
                <button
                  type="button"
                  onClick={handleClearFullBalance}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl cursor-pointer text-center flex items-center justify-center gap-1 shadow-sm transition"
                >
                  <Check className="w-4 h-4" />
                  Clear Full Balance (₹{paymentRecordingSale.pending_amount.toLocaleString('en-IN')})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentRecordingSale(null);
                    setReceivingAmount('');
                  }}
                  className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200 py-2.5 rounded-xl cursor-pointer text-center transition"
                >
                  Cancel
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* UNDO CONFIRMATION MODAL */}
      {undoConfirmSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden text-xs">
            
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-rose-650 tracking-wider">CRITICAL INVOICE CONTROL</span>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Undo Sale Invoice #{undoConfirmSale.id.length > 10 ? undoConfirmSale.id.substring(0, 8).toUpperCase() : undoConfirmSale.id}
                </h3>
              </div>
              <button 
                onClick={() => setUndoConfirmSale(null)} 
                className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-600 cursor-pointer"
                disabled={isUndoing}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-slate-500 font-medium">
                  Are you absolutely certain you want to undo this sale? Doing so will:
                </p>
                <ul className="list-disc pl-5 text-slate-600 font-semibold space-y-1 py-1 text-left">
                  <li>Permanently remove this invoice record from history</li>
                  <li>Revert all parts quantities of this sale directly back to the active stock inventory</li>
                  <li>Remove outstanding due balances or processed collections for this sale</li>
                </ul>
              </div>

              {undoError && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl font-semibold text-left">
                  Error: {undoError}
                </div>
              )}

              {/* Items Summary list to restore */}
              {itemsToRestore.length > 0 && (
                <div className="border border-slate-150 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-150 text-[10px] uppercase font-bold tracking-wider text-slate-500 text-left">
                    Part(s) to be restored to stock
                  </div>
                  <div className="max-h-[160px] overflow-y-auto divide-y divide-slate-100">
                    {itemsToRestore.map((item) => (
                      <div key={item.id} className="p-3 flex items-center justify-between font-semibold">
                        <div className="text-left">
                          <p className="text-slate-800 font-bold">{item.part_name}</p>
                          <p className="text-[10px] text-slate-450 font-mono">{item.part_no}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-900 font-bold">Qty: +{item.quantity}</p>
                          <p className="text-[10px] text-slate-400 font-medium">MRP: ₹{item.mrp.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl space-y-1 font-semibold text-rose-950 text-left">
                <div className="flex justify-between text-[11px]">
                  <span>Total Amount Refundable/Reverting:</span>
                  <span className="font-mono font-bold">₹{undoConfirmSale.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-[11px] text-rose-800 font-bold">
                  <span>Customer:</span>
                  <span>{undoConfirmSale.customer_name} ({undoConfirmSale.customer_category})</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2 text-xs font-bold font-sans">
                <button
                  type="button"
                  onClick={handleUndoSale}
                  disabled={isUndoing}
                  className="w-full bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white py-2.5 rounded-xl cursor-pointer text-center flex items-center justify-center gap-1 shadow-sm transition"
                >
                  <RotateCcw className={`w-4 h-4 ${isUndoing ? 'animate-spin' : ''}`} />
                  {isUndoing ? 'Reverting Sale and Restoring Stock...' : 'Confirm Undo Sale & Revert Stock'}
                </button>

                <button
                  type="button"
                  onClick={() => setUndoConfirmSale(null)}
                  disabled={isUndoing}
                  className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200 py-2.5 rounded-xl cursor-pointer text-center transition"
                >
                  Cancel
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ADD CUSTOMER MODAL */}
      {isAddCustomerModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden text-xs">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">New Customer Registration</span>
                <h3 className="font-extrabold text-slate-900 text-sm">Add Customer &amp; Open Khatabook</h3>
              </div>
              <button 
                onClick={() => setIsAddCustomerModalOpen(false)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-slate-500 font-bold mb-1">Customer Category *</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Mistri', 'Garage', 'Walk-in', 'Retailer'] as CustomerCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCustCategory(cat)}
                      className={`p-2 rounded-xl border text-center text-xs font-bold transition cursor-pointer ${
                        newCustCategory === cat
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-xs'
                          : 'border-slate-200 text-slate-600 bg-white hover:border-slate-350'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pappu Garage / Sunil Mistri"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-medium focus:ring-1 focus:ring-indigo-600"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile"
                    className="w-full p-2.5 border border-slate-200 rounded-xl"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Address / Location</label>
                  <input
                    type="text"
                    placeholder="City / Area"
                    className="w-full p-2.5 border border-slate-200 rounded-xl"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-slate-600 font-bold text-[11px]">Opening Balance (₹)</label>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setNewCustBalanceType('To Receive')}
                      className={`px-2 py-1 rounded font-bold transition ${
                        newCustBalanceType === 'To Receive' 
                          ? 'bg-rose-500 text-white' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      To Receive
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCustBalanceType('To Give')}
                      className={`px-2 py-1 rounded font-bold transition ${
                        newCustBalanceType === 'To Give' 
                          ? 'bg-emerald-600 text-white' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      To Give (Advance)
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold bg-white"
                  value={newCustStartingBalance || ''}
                  onChange={(e) => setNewCustStartingBalance(Number(e.target.value))}
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold cursor-pointer transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  Save &amp; Select Customer
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddCustomerModalOpen(false)}
                  className="px-4 bg-slate-100 text-slate-600 hover:bg-slate-200 py-2.5 rounded-xl cursor-pointer transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// Subordinate components definitions
function CheckCircle2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  );
}

function TH_PRINT() {
  return <th className="p-3 text-center">Remove</th>;
}
