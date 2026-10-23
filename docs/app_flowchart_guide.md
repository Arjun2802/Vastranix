# VASTRENIX — Complete Application Navigation & User Journey Flowcharts

This document provides a comprehensive visual and structural map of the entire **VASTRENIX** platform. It outlines exactly where users go, role-specific access paths, operational state transitions, and step-by-step business workflows.

---

## 1. Master Entry & Authentication Flowchart

```mermaid
flowchart TD
    Start(["User Opens VASTRENIX (Web / Mac App / Android APK)"]) --> AuthCheck{"Is User Authenticated?"}
    
    AuthCheck -- No --> AuthGate["Authentication Hub (/static/index.html)"]
    AuthGate --> TabSelect{"Select User Intent"}
    
    TabSelect -- "Sign In" --> FormSignIn["Enter Email & Password"]
    FormSignIn --> VerifyCreds{"Validate Credentials"}
    VerifyCreds -- Invalid --> ErrSignIn["Show Error: Incorrect email or password"] --> FormSignIn
    VerifyCreds -- Valid --> CheckApproval{"Is Staff Account Approved?"}
    CheckApproval -- "No (is_approved=False)" --> BlockStaff["Display Notice:<br/>'Your account is pending approval by the Store Administrator.'"]
    CheckApproval -- "Yes (Approved)" --> LoadContext["Fetch Tenant Context & Active Store"] --> MainApp["Enter VASTRENIX Main App Shell"]
    
    TabSelect -- "Store Owner Signup" --> FormOwner["Enter Store Name, City, GSTIN,<br/>Owner Name, Email, Password"]
    FormOwner --> CreateStore["POST /auth/register:<br/>1. Create Business<br/>2. Create Flagship Branch<br/>3. Assign OWNER Role (is_approved=True)<br/>4. Issue JWT Token"]
    CreateStore --> MainApp
    
    TabSelect -- "Staff Signup" --> FormStaff["1. Select Store from Directory<br/>2. Select Role (Cashier / Inventory / Manager)<br/>3. Enter Full Name, Email, Phone, Password"]
    FormStaff --> SubmitStaff["POST /auth/staff-signup:<br/>Membership created with status PENDING_APPROVAL"]
    SubmitStaff --> PendingNotice["Display Message:<br/>'Registration submitted! Awaiting Store Admin approval.'"]
    PendingNotice --> FormSignIn
    
    AuthCheck -- Yes --> LoadContext
```

---

## 2. Store Administrator Staff Approval Journey

```mermaid
flowchart TD
    AdminLogin["Store Admin Logs In"] --> DashView["Dashboard Loaded"]
    DashView --> CheckPending{"Any Pending Staff Signups?"}
    
    CheckPending -- Yes --> BannerVisible["⚠️ Orange Alert Banner Appears:<br/>'Pending Staff Signups Requiring Approval'"]
    BannerVisible --> ReviewCard["Inspect Candidate:<br/>- Full Name & Phone<br/>- Email Address<br/>- Requested Role (e.g. Cashier)"]
    ReviewCard --> AdminDecision{"Admin Decision"}
    
    AdminDecision -- "✓ Approve Staff" --> CallApprove["POST /auth/staff/:id/approve<br/>is_approved = True<br/>approved_by = Admin ID"]
    CallApprove --> StaffEnabled["Staff Account Instantly Activated!"]
    StaffEnabled --> StaffCanLogin["Staff Member can now Sign In immediately<br/>under this specific Store"]
    
    AdminDecision -- "✕ Reject" --> CallReject["POST /auth/staff/:id/reject<br/>Membership deleted"]
    CallReject --> RequestDismissed["Request Removed"]
    
    CheckPending -- No --> StandardDash["Display Standard Action Cards"]
```

---

## 3. Main Application Navigation Map

Once logged in, the application shell divides into persistent navigation zones:

```mermaid
flowchart LR
    subgraph Header["Top App Bar"]
        StoreBrand["Store Name Badge<br/>(e.g. 'Vastrenix Heritage Garments')"]
        StaffIdentity["Staff Identity Pill<br/>(e.g. 'Staff: Pooja Sharma (Cashier)')"]
        LangSwitch["Multilingual Switcher<br/>(English | हिन्दी | ગુજરાતી)"]
    end

    subgraph Sidebar["Main Left Navigation"]
        NavDash["1. 📊 Dashboard"]
        NavInv["2. 👗 Inventory & Catalog"]
        NavPOS["3. 🛒 POS Billing Counter"]
        NavInvoices["4. 🧾 Invoices & Themes"]
        NavDealers["5. 🤝 B2B Dealer Network"]
    end

    subgraph Modules["Operational Modules & Screens"]
        ModDash["Answers 5 Core Business Questions:<br/>- Today's Sales & Transactions<br/>- Low Stock Alerts<br/>- Pending Dealer Orders<br/>- Quick Action Buttons"]
        ModInv["- Garment Size/Color Matrix<br/>- On-Hand / Reserved / Available<br/>- Rack Locations<br/>- Adjust Stock Modal (+/-)"]
        ModPOS["- Barcode & Name Search<br/>- Live Cart Management<br/>- 6 Invoice Themes Selector<br/>- Split / Cash / UPI Payments<br/>- Instant PDF & Print"]
        ModInvoices["- Posted Invoices History<br/>- One-Click PDF Download<br/>- HTML Interactive Preview<br/>- Void / Reversal Workflows"]
        ModDealers["- Connected B2B Partners<br/>- Incoming Dealer Orders<br/>- 1-Click Accept & Reserve<br/>- Dispatch with LR & Transporter<br/>- Mark Delivered"]
    end

    NavDash --> ModDash
    NavInv --> ModInv
    NavPOS --> ModPOS
    NavInvoices --> ModInvoices
    NavDealers --> ModDealers
```

---

## 4. Cashier Daily Workflow (POS & Shift Reconciliation)

```mermaid
sequenceDiagram
    autonumber
    actor Cashier as Store Cashier
    participant UI as POS Front-End
    participant API as Finance & POS API
    participant DB as Authoritative Database

    Note over Cashier, DB: Morning Shift Opening
    Cashier->>UI: Select "POS Billing"
    UI->>API: GET /finance/shifts/current
    API-->>UI: No Active Shift Found
    UI-->>Cashier: Prompt: "Enter Opening Cash Float"
    Cashier->>UI: Enter Opening Cash (e.g. ₹2,000.00)
    UI->>API: POST /finance/shifts/open
    API->>DB: Record CashShift (status=OPEN, opening_cash=₹2,000)
    API-->>UI: Shift #1 Opened

    Note over Cashier, DB: Operational Retail Sales Billing
    loop Throughout the Business Day
        Cashier->>UI: Search Garment (e.g. "Banarasi Raw Silk Jacket")
        UI->>UI: Select Size "38" & Color "Navy"
        Cashier->>UI: Click "+ Add to Cart"
        Cashier->>UI: Select Theme (e.g. "PREMIUM_BOUTIQUE")
        Cashier->>UI: Select Payment (e.g. "UPI" or "CASH")
        Cashier->>UI: Click "Complete Sale & Generate Invoice"
        UI->>API: POST /pos/sale
        API->>DB: 1. Deduct Stock (on_hand - 1)<br/>2. Post Invoice INV-20261023-XXXX<br/>3. Record Payment
        API->>API: Render PDF via ReportLab + QR Code
        API-->>UI: Return PDF Download URL & Preview URL
        UI-->>Cashier: Opens Printable Authoritative PDF
    end

    Note over Cashier, DB: Evening Shift Close & Cash Count
    Cashier->>UI: Select "Close Shift"
    Cashier->>UI: Enter Actual Counted Cash in Drawer
    UI->>API: POST /finance/shifts/close (actual_cash)
    API->>DB: Sum cash sales + opening cash = expected_cash
    API->>DB: Compute difference (actual - expected)
    API-->>UI: Display Reconciliation Result: EXACT / SHORTAGE / EXCESS
```

---

## 5. B2B Connected Dealer Order Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft : Buyer browses seller catalog & prepares order
    Draft --> Submitted : Buyer submits B2B order to Seller
    
    Submitted --> Accepted : Seller accepts order
    note right of Accepted
        ATOMIC STOCK RESERVATION:
        Seller stock level updates:
        - Reserved quantity increases (+N)
        - Available quantity decreases (-N)
        - On-hand remains constant until dispatch
    end note

    Submitted --> Rejected : Seller rejects (Out of production / terms mismatch)
    
    Accepted --> Processing : Warehouse staff picking & packing garments
    Processing --> Dispatched : Seller enters Transporter Name & LR Number
    note right of Dispatched
        INVENTORY DEDUCTION:
        - Reserved quantity decremented (-N)
        - On-hand quantity decremented (-N)
        - In-transit tracking enabled
    end note

    Dispatched --> Delivered : Buyer confirms delivery arrival
    note right of Delivered
        AUTOMATED BUYER STOCK CREDIT:
        - Generates GRN note
        - Physical stock incremented (+N)
        at Buyer's destination branch
    end note

    Delivered --> Closed : B2B invoice reconciled & settled
    Closed --> [*]
```

---

## 6. Where Different User Roles Go (Permission Matrix)

| Screen / Feature | Business Owner | Branch Manager | Cashier | Inventory Mgr | Connected Dealer |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Dashboard Metrics** | Full Store Performance | Branch Performance | Sales Counter | Stock & Reorder | Own B2B Orders |
| **Staff Approvals** | ✅ Approve / Reject | ❌ Read-Only | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **Add / Edit Garments** | ✅ Full Access | ✅ Branch Catalog | ❌ Hidden | ✅ Full Access | ❌ Read-Only Catalog |
| **POS Billing Terminal** | ✅ Full Access | ✅ Full Access | ✅ Primary Screen | ❌ View Only | ❌ Hidden |
| **Adjust Physical Stock** | ✅ Full Access | ✅ Branch Level | ❌ Blocked (403) | ✅ Full Access | ❌ Blocked (403) |
| **B2B Dealer Fulfillment**| ✅ Full Access | ✅ View / Pick | ❌ Hidden | ✅ Dispatch / LR | ✅ Place Orders |
| **Financial Reconcile** | ✅ Full Access | ✅ Branch Shifts | ✅ Own Shift Only | ❌ Hidden | ❌ Hidden |

---

## 7. How to Test Each Flow

1. **Test Owner Journey:**
   - Go to `http://localhost:8000`, click **"Store Owner Signup"**.
   - Fill in your store details, enter dashboard, add new garment styles, and manage store operations.
2. **Test Staff Registration & Approval Journey:**
   - Log out, click **"Staff Signup"**.
   - Select the store you created, select role as **`Store Cashier`**, and submit.
   - Try logging in immediately: verify the system blocks login with the pending approval notice.
   - Log back in as Store Owner: see the **Pending Staff Approvals** banner, click **`✓ Approve Staff`**.
   - Log in as the staff member: successfully enters the POS terminal with their **Store Name** prominently showcased in the top bar and sidebar!
3. **Test POS Sale & Invoice Themes:**
   - Add items to cart, switch between all **6 Invoice Themes** (`Classic GST`, `Modern Minimal`, `Premium Boutique`, `Wholesale & Dealer`, `Compact Thermal`, `International Commercial`), complete sale, and inspect the generated PDF.
