// Shared types describing the backend API responses.

export interface Role {
  id: string;
  name: string;
}

// Returned by GET /users/roles (used to populate the "add staff" role select).
export interface RoleOption {
  id: string;
  name: string;
  description?: string | null;
}

// A short branch summary embedded on the auth user / user list rows.
export interface BranchRef {
  id: string;
  name: string;
}

// The full branch object returned by GET /branches and /branches/:id.
export interface Branch {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  staffCount: number;
}

// The user object returned by POST /auth/login.
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleInitial?: string | null;
  role: Role;
  branch?: BranchRef | null;
  avatarUrl?: string | null;
  mustChangePassword?: boolean;
}

// A user row returned by GET /users.
export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: Role;
  branchId: string | null;
  branch: BranchRef | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Every backend response is wrapped in this envelope by the TransformInterceptor.
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
  meta?: {
    timestamp: string;
    requestId: string;
  };
  error?: {
    code: string;
    message: string;
  };
}


// ---------------------------------------------------------------------------
// Catalog, sales, logs (backend feature modules)
// ---------------------------------------------------------------------------

export interface Brand {
  id: string;
  name: string;
  slug: string;
  coverImage: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProductBranchQuantity {
  branchId: string;
  branchName: string | null;
  quantity: number;
  sellingPrice: number | null;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  brand: { id: string; name: string; slug: string } | null;
  sellingPrice: number;
  costPrice?: number; // Owner-only, confidential
  quantityAlert: number;
  sortOrder: number; // manual display order (lower = higher up)
  isActive: boolean;
  quantities: ProductBranchQuantity[];
  totalQuantity: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Cash/Gcash are the primary payment methods. Split means the item's cost
// was divided across Cash and Gcash. Mixed is a Sale-level-only rollup shown
// when its items don't all agree.
export type PaymentMethod = 'Cash' | 'Gcash' | 'Split' | 'Mixed';
export type SaleStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

export interface PaymentSplit {
  cash: number;
  gcash: number;
}

export interface SaleLineItem {
  id: string;
  productId: string | null;
  name: string;
  brandName: string;
  quantity: number;
  unitPrice: number;
  costPrice?: number;
  // Fixed ₱ amount knocked off this line. subTotal already reflects it.
  discount: number;
  subTotal: number;
  paymentMethod: PaymentMethod;
  bankNote: string | null;
  note: string | null;
  paymentSplit: PaymentSplit | null;
}

export interface Sale {
  id: string;
  number: number;
  customerName: string | null;
  branch: { id: string; name: string } | null;
  staff: { id: string; name: string; email: string } | null;
  // Rollup of the items' payment methods — the shared method, or Mixed.
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  total: number;
  items: SaleLineItem[];
  createdAt: string;
  decidedAt: string | null;
}

export interface SalesSummary {
  grossSales: number; // Σ(unitPrice × qty) BEFORE discount; total = grossSales − discount
  cash: number;
  gcash: number;
  discount: number; // total per-item discount (Gross − Discount = Net; subtracted once)
  total: number; // NET total (after discount)
  count: number;
}

export interface DraftSaleItem {
  productId: string;
  name: string;
  brandName: string;
  unitPrice: number;
  quantity: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  bankNote?: string | null;
  note?: string | null;
  paymentSplit?: PaymentSplit | null;
}

export interface DraftDisposalItem {
  productId: string;
  name: string;
  brandName: string;
  quantity: number;
  reason?: string;
}

export interface DraftExpenseItem {
  amount: number;
  note: string;
}

// A staff member's current in-progress (not-yet-submitted) cart, as seen by
// an Admin on the Pending Sales page.
export interface StaffDraft {
  id: string;
  staff: { id: string; name: string; email: string };
  branch: { id: string; name: string } | null;
  items: DraftSaleItem[];
  disposalItems: DraftDisposalItem[];
  expenses: DraftExpenseItem[];
  customerName: string | null;
  total: number;
  discountTotal: number; // total per-item discount staged (display only; already netted out of total)
  expensesTotal: number;
  updatedAt: string;
}

export type ExpenseStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

export interface Expense {
  id: string;
  branch: { id: string; name: string } | null;
  staff: { id: string; name: string } | null;
  amount: number;
  note: string;
  status: ExpenseStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ExpenseSummary {
  totalAmount: number;
  count: number;
}

// Today's approved Total Sales / Total Expenses / Net for a branch.
export interface BranchSummary {
  branchId: string;
  totalGrossSales: number; // before discount (= totalSales + totalDiscount)
  totalSales: number; // NET sales (after discount)
  totalExpenses: number;
  totalDisposals: number;
  totalDiscount: number; // Gross − Discount = Net; subtracted once
  net: number;
}

// Owner-only Profit & Loss (server-computed using confidential cost prices).
export interface ProfitSummary {
  grossSales: number; // before discount (= revenue + totalDiscount)
  revenue: number; // NET revenue (after discount) — profit/margin are based on this
  capital: number; // cost of goods SOLD (COGS)
  grossProfit: number;
  totalDiscount: number;
  expenses: number;
  disposalLosses: number;
  netProfit: number;
  margin: number; // percent
}

export interface ActivityLog {
  id: string;
  userName: string;
  userEmail: string;
  action: string;
  module: string;
  category: string;
  description: string;
  device: string;
  ipAddress: string;
  date: string;
}

export interface DashboardStats {
  shops: number;
  products: number;
  brands: number;
  pendingSales: number;
  approvedSales: number;
  staff: number;
  admins: number;
  approvedSalesTotal: number;
}

// User row including the optional fields added to the schema.
export interface FullUser extends UserListItem {
  middleInitial: string | null;
  avatarUrl: string | null;
  deletedAt?: string | null;
}


// ---------------------------------------------------------------------------
// Disposals + dashboard charts
// ---------------------------------------------------------------------------

export interface Disposal {
  id: string;
  branch: { id: string; name: string } | null;
  productId: string | null;
  name: string;
  brandName: string;
  quantity: number;
  unitPrice: number;
  value: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  createdBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface DisposalSummary {
  totalValue: number;
  totalQuantity: number;
  count: number;
}

export interface SalesOverviewPoint {
  date: string;
  total: number;
  count: number;
}

export interface TopProduct {
  name: string;
  brand: string;
  quantity: number;
  revenue: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  total: number;
  warnings: string[];
}

export interface RestockResult {
  updated: number;
  total: number;
  warnings: string[];
  // IDs of the stock movements this restock created (used to offer a one-tap
  // undo of exactly this batch). Present on the /products/restock response.
  movementIds?: string[];
}


// Stock movement types (per product per branch history)
export type StockMovementType = 'SALE' | 'RESTOCK' | 'DISPOSAL' | 'RETURN' | 'ADJUSTMENT';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  branchId: string;
  branchName: string;
  user: string | null;
  type: StockMovementType;
  quantityChange: number;
  quantityAfter: number;
  description: string | null;
  createdAt: string;
}
