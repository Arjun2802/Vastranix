from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal

# --- AUTH & BUSINESS ---
class UserLoginSchema(BaseModel):
    email: EmailStr
    password: str

class UserRegisterSchema(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: Optional[str] = None
    business_name: str
    currency: Optional[str] = "INR"
    language: Optional[str] = "en"
    country: Optional[str] = "India"
    city: Optional[str] = None
    state: Optional[str] = None
    gstin: Optional[str] = None

class BusinessUpdateSchema(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    gstin: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    currency: Optional[str] = None
    language: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    upi_id: Optional[str] = None
    default_invoice_theme: Optional[str] = None

class StaffInviteSchema(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str
    branch_id: Optional[int] = None

class StaffSelfRegisterSchema(BaseModel):
    business_id: int
    branch_id: Optional[int] = None
    email: EmailStr
    full_name: str
    password: str
    phone: Optional[str] = None
    role: Optional[str] = "CASHIER" # CASHIER, INVENTORY_MGR, SALES_REP, BRANCH_MANAGER

class BranchCreateSchema(BaseModel):
    name: str
    code: str
    address: Optional[str] = None
    phone: Optional[str] = None
    is_main: Optional[bool] = False

# --- PRODUCTS & VARIANTS ---
class VariantCreateSchema(BaseModel):
    sku: str
    barcode: Optional[str] = None
    size: str
    color: str
    color_hex: Optional[str] = "#25313B"
    purchase_cost: Decimal = Decimal("0.00")
    retail_price: Decimal = Decimal("0.00")
    wholesale_price: Decimal = Decimal("0.00")
    dealer_price: Decimal = Decimal("0.00")
    min_stock_alert: Optional[int] = 5
    initial_stock: Optional[int] = 0

class ProductCreateSchema(BaseModel):
    name: str
    code: Optional[str] = None
    category_id: Optional[int] = None
    brand_id: Optional[int] = None
    description: Optional[str] = None
    fabric: Optional[str] = None
    material: Optional[str] = None
    pattern: Optional[str] = None
    season: Optional[str] = None
    gender: Optional[str] = None
    fit: Optional[str] = None
    hsn_sac: Optional[str] = "6205"
    tax_rate: Decimal = Decimal("5.00")
    unit_of_measure: Optional[str] = "PCS"
    image_url: Optional[str] = None
    variants: List[VariantCreateSchema] = []

# --- INVENTORY ---
class StockAdjustmentSchema(BaseModel):
    variant_id: int
    quantity_change: int
    adjustment_type: str # DAMAGE, LOSS, CORRECTION, CYCLE_COUNT
    reason: str

# --- POS & BILLING ---
class InvoiceItemInputSchema(BaseModel):
    variant_id: Optional[int] = None
    product_name: str
    size: Optional[str] = None
    color: Optional[str] = None
    sku: Optional[str] = None
    hsn_sac: Optional[str] = "6205"
    quantity: int
    unit_price: Decimal
    discount_percent: Decimal = Decimal("0.00")
    tax_rate: Decimal = Decimal("5.00")

class POSSaleCreateSchema(BaseModel):
    idempotency_key: Optional[str] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = "Walk-in Customer"
    customer_phone: Optional[str] = None
    items: List[InvoiceItemInputSchema]
    discount_amount: Decimal = Decimal("0.00")
    payment_mode: str = "CASH" # CASH, UPI, CARD, BANK_TRANSFER, SPLIT, CREDIT
    paid_amount: Optional[Decimal] = None
    invoice_theme: Optional[str] = None
    transaction_reference: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None

class CustomerCreateSchema(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    credit_limit: Decimal = Decimal("0.00")
    price_list_type: str = "RETAIL"

# --- PURCHASES & SUPPLIERS ---
class SupplierCreateSchema(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    payment_terms: Optional[str] = "Net 30 Days"

class PurchaseOrderItemInputSchema(BaseModel):
    variant_id: int
    quantity: int
    unit_cost: Decimal
    tax_rate: Decimal = Decimal("5.00")

class PurchaseOrderCreateSchema(BaseModel):
    supplier_id: int
    branch_id: Optional[int] = None
    po_number: Optional[str] = None
    items: List[PurchaseOrderItemInputSchema]
    notes: Optional[str] = None

class GoodsReceiptCreateSchema(BaseModel):
    purchase_order_id: int
    supplier_invoice_no: Optional[str] = None
    notes: Optional[str] = None

# --- FINANCE & CASH SHIFTS ---
class CashShiftOpenSchema(BaseModel):
    opening_cash: Decimal
    notes: Optional[str] = None

class CashShiftCloseSchema(BaseModel):
    actual_closing_cash: Decimal
    notes: Optional[str] = None

class BusinessExpenseCreateSchema(BaseModel):
    category: str
    amount: Decimal
    payment_mode: str = "CASH"
    description: Optional[str] = None
    receipt_url: Optional[str] = None

# --- DEALER B2B ---
class DealerConnectionRequestSchema(BaseModel):
    target_business_id: int
    price_tier: Optional[str] = "DEALER"

class DealerOrderItemInputSchema(BaseModel):
    seller_variant_id: int
    quantity_ordered: int
    unit_price: Decimal
    tax_rate: Decimal = Decimal("5.00")

class DealerOrderCreateSchema(BaseModel):
    seller_business_id: int
    seller_branch_id: Optional[int] = None
    items: List[DealerOrderItemInputSchema]
    notes: Optional[str] = None

class DealerOrderAcceptSchema(BaseModel):
    accepted_quantities: Dict[int, int] # item_id -> accepted_qty
    assigned_staff_id: Optional[int] = None

class DealerOrderAssignStaffSchema(BaseModel):
    staff_id: int

class DealerOrderDispatchSchema(BaseModel):
    transporter_name: str
    lr_number: str

class DealerOrderRejectSchema(BaseModel):
    reason: str

# --- COMMERCE & ONLINE ---
class OnlineCheckoutSchema(BaseModel):
    storefront_slug: str
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    shipping_address: str
    city: str
    state: str
    pincode: str
    payment_method: str = "COD"
    items: List[Dict[str, Any]] # variant_id, quantity

# --- OFFLINE SYNC ---
class SyncBatchItem(BaseModel):
    operation_id: str
    entity: str # INVOICE, ADJUSTMENT, CUSTOMER
    action: str # CREATE, UPDATE
    payload: Dict[str, Any]
    timestamp: datetime

class SyncBatchRequest(BaseModel):
    client_id: str
    operations: List[SyncBatchItem]
