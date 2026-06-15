// Type Definitions for Sederek Kasir POS System

export interface User {
  id: string
  username: string
  password_hash?: string
  full_name: string
  email?: string
  phone_number?: string
  role: 'admin' | 'manager' | 'kasir'
  status: 'active' | 'inactive'
  avatar_url?: string
  created_at: Date
  updated_at: Date
  last_login_at?: Date
}

export interface Permission {
  id: string
  name: string
  description?: string
  created_at: Date
}

export interface RolePermission {
  id: string
  role: 'admin' | 'manager' | 'kasir'
  permission_id: string
  created_at: Date
}

export interface Category {
  id: string
  name: string
  description?: string
  icon?: string
  sort_order: number
  status: 'active' | 'inactive'
  created_at: Date
  updated_at: Date
}

export interface Product {
  id: string
  category_id?: string
  name: string
  description?: string
  image_url?: string
  hpp: number
  price: number
  member_price?: number
  stock: number
  min_stock: number
  status: 'active' | 'inactive'
  created_at: Date
  updated_at: Date
}

export interface ProductWithCategory extends Product {
  category?: Category
}

export interface Customer {
  id: string
  name: string
  phone_number: string
  email?: string
  avatar_url?: string
  is_member: boolean
  total_spending: number
  total_transactions: number
  created_at: Date
  updated_at: Date
}

export interface Transaction {
  id: string
  transaction_number: string
  customer_id?: string
  cashier_id?: string
  subtotal: number
  discount_items: number
  discount_global: number
  discount_global_type: 'amount' | 'percentage'
  total: number
  payment_method: string
  payment_details?: any
  amount_paid: number
  change_amount: number
  status: 'open' | 'partial_paid' | 'paid' | 'cancelled'
  notes?: string
  created_at: Date
  updated_at: Date
  completed_at?: Date
}

export interface TransactionItem {
  id: string
  transaction_id: string
  product_id?: string
  product_name: string
  product_price: number
  quantity: number
  discount_amount: number
  discount_type: 'amount' | 'percentage'
  subtotal: number
  total: number
  is_member_price: boolean
  notes?: string
  created_at: Date
}

export interface TransactionWithDetails extends Transaction {
  items: TransactionItem[]
  customer?: Customer
  cashier?: User
}

export interface TransactionPayment {
  id: string
  transaction_id: string
  amount_paid: number
  payment_method: string
  payment_method_id?: string
  paid_items_json: Array<{
    item_id: string
    quantity: number
  }>
  created_at: Date
  updated_at: Date
  idempotency_key?: string
}

export interface Promo {
  id: string
  name: string
  description?: string
  discount_value: number
  discount_type: 'amount' | 'percentage'
  start_date: string
  end_date: string
  min_transaction: number
  max_discount?: number
  applicable_products?: string[]
  status: 'active' | 'inactive'
  usage_count: number
  created_at: Date
  updated_at: Date
}

export interface RefreshToken {
  id: string
  user_id: string
  token: string
  expires_at: Date
  created_at: Date
}

// Request/Response Types

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  user: Omit<User, 'password_hash'>
  accessToken: string
  refreshToken: string
}

export interface RegisterRequest {
  username: string
  password: string
  full_name: string
  email?: string
  phone_number?: string
  role: 'admin' | 'manager' | 'kasir'
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface CreateCategoryRequest {
  name: string
  description?: string
  icon?: string
  sort_order?: number
}

export interface CreateProductRequest {
  category_id?: string
  name: string
  description?: string
  image_url?: string
  hpp: number
  price: number
  member_price?: number
  stock: number
  min_stock?: number
  status?: 'active' | 'inactive'
}

export interface UpdateStockRequest {
  stock: number
  adjustment?: number
  type?: 'set' | 'add' | 'subtract'
}

export interface CreateCustomerRequest {
  name: string
  phone_number: string
  email?: string
  avatar_url?: string
  is_member?: boolean
}

export interface CreateTransactionRequest {
  customer_id?: string
  items: {
    product_id: string
    quantity: number
    discount_amount?: number
    discount_type?: 'amount' | 'percentage'
    notes?: string
  }[]
  discount_global?: number
  discount_global_type?: 'amount' | 'percentage'
  notes?: string
}

export interface PaymentRequest {
  payment_method: 'cash' | 'qris' | 'transfer' | 'split'
  amount_paid: number
  payment_details?: any
}

export interface SplitBillPaymentRequest {
  payment_method: 'cash' | 'qris' | 'transfer'
  payment_method_id?: string
  paid_items: Array<{
    item_id: string
    item_subtotal: number
    quantity: number
  }>
  notes?: string
}

export interface CreatePromoRequest {
  name: string
  description?: string
  discount_value: number
  discount_type: 'amount' | 'percentage'
  start_date: string
  end_date: string
  min_transaction?: number
  max_discount?: number
  applicable_products?: string[]
}

// Report Types

export interface DailySalesReport {
  date: string
  total_transactions: number
  total_revenue: number
  total_discount: number
  total_items_sold: number
  average_transaction: number
}

export interface MonthlySalesReport {
  month: string
  year: number
  total_transactions: number
  total_revenue: number
  total_discount: number
  total_items_sold: number
  daily_breakdown: DailySalesReport[]
}

export interface ProductSalesReport {
  product_id: string
  product_name: string
  category_name?: string
  quantity_sold: number
  total_revenue: number
  total_discount: number
}

export interface CustomerReport {
  customer_id: string
  customer_name: string
  phone_number: string
  total_transactions: number
  total_spending: number
  average_transaction: number
}

export interface CashierReport {
  cashier_id: string
  cashier_name: string
  total_transactions: number
  total_revenue: number
  average_transaction: number
}

export interface DashboardStats {
  today: {
    revenue: number
    transactions: number
    items_sold: number
  }
  week: {
    revenue: number
    transactions: number
    items_sold: number
  }
  month: {
    revenue: number
    transactions: number
    items_sold: number
  }
  low_stock_products: number
  active_promos: number
  draft_transactions: number
}

// Pagination Types

export interface PaginationQuery {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationMeta
}

// Filter Types

export interface ProductFilter extends PaginationQuery {
  category_id?: string
  status?: 'active' | 'inactive'
  search?: string
  low_stock?: boolean
}

export interface TransactionFilter extends PaginationQuery {
  status?: 'open' | 'partial_paid' | 'paid' | 'cancelled'
  cashier_id?: string
  customer_id?: string
  date_from?: string
  date_to?: string
  payment_method?: string
}

export interface CustomerFilter extends PaginationQuery {
  search?: string
}

// Printer Types

export interface Printer {
  id: string
  name: string
  description?: string
  printer_type: 'receipt' | 'barista' | 'label' | 'a4' | 'network'
  connection_type: 'usb' | 'network' | 'bluetooth'
  ip_address?: string
  port_number?: number
  device_path?: string
  paper_width?: number
  paper_height?: number
  dpi: number
  font_size: number
  status: 'active' | 'inactive' | 'offline'
  is_default: boolean
  auto_print: boolean
  created_at: Date
  updated_at: Date
  last_used_at?: Date
}

export interface PrinterConfiguration {
  id: string
  printer_id: string
  key: string
  value?: string
  created_at: Date
  updated_at: Date
}

export interface PrinterTemplate {
  id: string
  name: string
  description?: string
  template_type: 'receipt' | 'barista' | 'report' | 'custom'
  content: PrinterTemplateContent
  is_default: boolean
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface PrinterTemplateContent {
  sections: {
    header?: PrinterTemplateSection
    items?: PrinterTemplateSection
    payment?: PrinterTemplateSection
    footer?: PrinterTemplateSection
  }
}

export interface PrinterTemplateSection {
  [key: string]: boolean | string | PrinterTemplateSection
}

export interface PrinterJob {
  id: string
  printer_id?: string
  transaction_id?: string
  template_id?: string
  job_type: 'receipt' | 'barista' | 'report' | 'test'
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled'
  content: any
  error_message?: string
  retry_count: number
  created_by?: string
  created_at: Date
  completed_at?: Date
}

export interface PrinterRouting {
  id: string
  print_type: 'customer_receipt' | 'barista_ticket' | 'label'
  printer_id: string
  template_id?: string
  is_enabled: boolean
  auto_print: boolean
  print_copies: number
  created_at: Date
  updated_at: Date
}

export interface PrinterAuditLog {
  id: string
  printer_id: string
  action: string
  changes?: any
  changed_by?: string
  created_at: Date
}

// Printer Request Types

export interface CreatePrinterRequest {
  name: string
  description?: string
  printer_type: 'receipt' | 'barista' | 'label' | 'a4' | 'network'
  connection_type: 'usb' | 'network' | 'bluetooth'
  paper_width: number
  font_size?: number
  is_default?: boolean
  auto_print?: boolean
  device_path?: string
}

export interface UpdatePrinterRequest {
  name?: string
  description?: string
  printer_type?: 'receipt' | 'barista'
  connection_type?: 'usb' | 'network' | 'bluetooth'
  paper_width?: number
  font_size?: number
  status?: 'active' | 'inactive' | 'offline'
  is_default?: boolean
  auto_print?: boolean
  device_path?: string
}

export interface CreatePrinterTemplateRequest {
  name: string
  description?: string
  template_type: 'receipt' | 'barista' | 'report' | 'custom'
  content: PrinterTemplateContent
  is_default?: boolean
}

export interface UpdatePrinterTemplateRequest {
  name?: string
  description?: string
  content?: PrinterTemplateContent
  is_active?: boolean
}

export interface CreatePrinterJobRequest {
  printer_id?: string
  transaction_id?: string
  template_id?: string
  job_type: 'receipt' | 'barista' | 'report' | 'test'
  content: any
}

export interface UpdatePrinterRoutingRequest {
  printer_id: string
  template_id?: string
  is_enabled?: boolean
  auto_print?: boolean
  print_copies?: number
}

// Printer Response Types

export interface PrinterStatusResponse {
  printer_id: string
  printer_name: string
  status: 'active' | 'inactive' | 'offline'
  last_used_at?: Date
  last_job_status?: string
}

export interface PrinterJobHistoryResponse extends PaginatedResponse<PrinterJob> {
  summary?: {
    total_jobs: number
    completed: number
    failed: number
    pending: number
  }
}

// Utility Types

export type Role = 'admin' | 'manager' | 'kasir'
export type UserStatus = 'active' | 'inactive'
export type ProductStatus = 'active' | 'inactive'
export type TransactionStatus = 'open' | 'partial_paid' | 'paid' | 'cancelled'
export type DiscountType = 'amount' | 'percentage'
export type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'split'
export type PrinterType = 'receipt' | 'barista' | 'label' | 'a4' | 'network'
export type PrinterConnectionType = 'usb' | 'network' | 'bluetooth'
export type PrinterStatus = 'active' | 'inactive' | 'offline'
export type PrintJobType = 'receipt' | 'barista' | 'report' | 'test'
export type PrintJobStatus = 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled'
export type PrintTemplateType = 'receipt' | 'barista' | 'report' | 'custom'
export type PrintType = 'customer_receipt' | 'barista_ticket' | 'label'
