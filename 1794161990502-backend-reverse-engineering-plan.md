# POS/ERP Backend Reverse Engineering & New Backend Blueprint

## Executive Summary

This document provides a complete reverse engineering analysis of the Flutter POS/ERP application's backend integration, extracted from the actual Flutter codebase. The goal is to build a new backend from scratch that maintains full API compatibility with the existing Flutter frontend.

**Base URLs:**
- Production: `https://erp.futxtech.com/api/v1/`
- Test/Dev: `https://erp-test.futxtech.com/api/v1/`

---

## 1. Current Backend Integration Map

### Architecture Overview
```
Flutter UI (Cubits/Bloc)
    ↓
Domain Layer (Repositories Interfaces)
    ↓
Data Layer (Repository Implementations)
    ↓
Remote Data Sources (API Calls)
    ↓
ApiServices (Dio HTTP Client)
    ↓
Interceptors: AuthInterceptor + LoggingInterceptor
    ↓
Backend API
```

### Key Components
| Component | Location | Purpose |
|-----------|----------|---------|
| `ApiConfig` | `lib/core/services/api/api_config.dart` | Base URL configuration |
| `EndPoints` | `lib/core/services/api/api_helper.dart` | All API endpoint definitions |
| `ApiServices` | `lib/core/services/api/domain/services/api_service.dart` | HTTP abstraction |
| `ApiServicesImp` | `lib/core/services/api/domain/services/api_services_imp.dart` | Dio implementation |
| `AuthInterceptor` | `lib/core/services/api/interceptors/auth_interceptor.dart` | Bearer token injection |
| `CacheHelper` | `lib/core/services/cache/cache_helper.dart` | Token/user persistence |
| `BaseModel<T>` | `lib/core/utils/models/base_model.dart` | Generic response wrapper |

### Dependency Injection
All services registered in `lib/core/utils/configuration/locator.dart` using GetIt:
- Dio with 30s connect / 1min send/receive timeouts
- AuthInterceptor adds `Authorization: Bearer <token>` and `accept-timezone` header
- LoggingInterceptor in debug mode

---

## 2. Complete API Endpoints Catalog

### 2.1 Authentication Module
| Method | Endpoint | Auth | Request Body | Response | Source |
|--------|----------|------|--------------|----------|--------|
| POST | `/auth/login` | No | `{email, password}` | `BaseModel` with user data + token | `AuthRemoteDataSource.login()` |
| POST | `/auth/logout` | Yes | - | `BaseModel` | `AuthRemoteDataSource.logout()` |
| POST | `/check/company/pin` | Yes | `{pin_code}` | `BaseModel` | `AuthRemoteDataSource.checkCompanyPin()` |

### 2.2 POS/Kashier Module (Core Operations)
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/pos/categories` | Yes | - | `List<KashierCategoryEntitie>` | `KashierRemoteDataSource.getCategories()` |
| GET | `/pos/products/all` | Yes | `page`, `category_id`, `search` | `List<KashierProductEntitie>` | `KashierRemoteDataSource.getProducts()` |
| GET | `/pos/products/{id}/modifiers` | Yes | - | `List<ModifierGroupModel>` | `ModifiersRemoteDataSource.getModifiers()` |
| POST | `/pos/add-customer` | Yes | `{first_name, last_name?, mobile?, note?, customerType?}` | `KashierAddCustomerModel` | `KashierRemoteDataSource.addCustomer()` |
| GET | `/pos/orders` | Yes | - | `List<OrderModel>` | `OrdersRemoteDataSource.getOrders()` |
| POST | `/pos/orders/status` | Yes | `{id, status, pin_code?}` | `dynamic` | `AllChecksRemoteDataSource.updateCheckStatus()` |
| POST | `/pos/send-to-kitchen` | Yes | Order data | `Map<String,dynamic>` | `KashierRemoteDataSource.sendOrderToKitchen()` |
| PUT | `/pos/update-kitchen-order` | Yes | Order data | `Map<String,dynamic>` | `KashierRemoteDataSource.sendOrderToKitchen()` |
| POST | `/pos/checkout` | Yes | Checkout data | `Map<String,dynamic>` | `KashierRemoteDataSource.checkout()` |

### 2.3 Session & Close Day
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/pos/report/close-out` | Yes | `session_id?` | `KashierSessionEntitie` | `ClosedayRemote.getSession()` |
| GET | `/pos/sessions` | Yes | - | `List<KashierAllsessionsEntitie>` | `ClosedayRemote.getAllSessionsId()` |
| POST | `/pos/report/end-day` | Yes | `{opening_cash}` | `BaseModel` | `ClosedayRemote.closeDay()` |

### 2.4 All Checks / Orders History
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/pos/orders` | Yes | Filter params | `List<KashierOrderEntitie>` | `AllChecksRemoteDataSource.getAllChecks()` |
| POST | `/pos/orders/status` | Yes | `{id, status, pin_code}` | `dynamic` | `AllChecksRemoteDataSource.updateCheckStatus()` |

### 2.5 Reports
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/pos/salesReport` | Yes | `period`, `cashier_id`, `date_from`, `date_to` | `KashierAllrepotsEntitie` | `AllreportsRemote.getAllReports()` |
| GET | `/reports/pos-dashboard` | Yes | Filter params | `ReportEntity` | `ReportRemote.getData()` |
| GET | `/reports/z-report/pdf` | Yes | - | `Uint8List` (PDF) | `ReportRemote.getPdf()` |
| GET | `/reports/z-report/print` | Yes | - | `Uint8List` | EndPoints.reportPrint |

### 2.6 Inventory (Admin)
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/inventory/dashboard` | Yes | - | `InventoryBasicEntity` | `InventoryRemote.getSummery()` |
| GET | `/inventory/items` | Yes | `page`, `search`, `status`, `category_id` | `List<InventoryItemEntity>` | `InventoryRemote.getItems()` |
| DELETE | `/inventory/items/{id}` | Yes | - | `BaseModel` | `InventoryRemote.deleteItem()` |
| POST | `/inventory/adjustment` | Yes | Query params | `InventoryItemEntity` | `InventoryRemote.adjustItem()` |
| POST | `/inventory/products` | Yes | Query params | `InventoryItemEntity` | `InventoryRemote.addNewItem()` |
| POST | `/inventory/purchase-orders` | Yes | Query params | `dynamic` | `InventoryRemote.addNewPurchase()` |
| GET | `/inventory/categories` | Yes | - | `List<InventoryCategoryEntity>` | `InventoryRemote.getCategories()` |
| GET | `/inventory/suppliers` | Yes | Query params | `List<InventorySupplierEntity>` | `InventoryRemote.getSuppliers()` |
| GET | `/inventory/units` | Yes | Query params | `List<InventoryUnitEntity>` | `InventoryRemote.getUnits()` |

### 2.7 Menu Products (Admin)
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/pos/products/categories` | Yes | - | `List<MenuProductCategoryEntite>` | `MenuProductCategoryRemote.getAllCategories()` |
| POST | `/pos/categories` | Yes | Category data | `MenuProductCategoryEntite` | `MenuProductCategoryRemote.createNewCategory()` |
| GET | `/pos/products/all` | Yes | `page`, `category_id`, `search` | `List<MenuProductsProductEntitie>` | `MenuProductProductRemote.getAllProducts()` |
| GET | `/pos/products/preparation-stations` | Yes | - | `List<MenuProductPrepStationEntity>` | `MenuProductProductRemote.getAllPrepStations()` |
| POST | `/pos/products` | Yes | FormData (multipart) | `MenuProductsProductEntitie` | `MenuProductProductRemote.addNewProduct()` |
| POST | `/pos/products/{id}` | Yes | FormData (multipart) | `MenuProductsProductEntitie` | `MenuProductProductRemote.editProduct()` |
| DELETE | `/pos/products/{id}` | Yes | - | `BaseModel` | `MenuProductProductRemote.deleteProduct()` |
| PATCH | `/pos/products/{id}/toggle-active` | Yes | - | `BaseModel` | `MenuProductProductRemote.switchProductStatus()` |

### 2.8 Modifier Groups (Admin)
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/pos/modifier-groups` | Yes | `page` | `List<AdminModifierGroupEntitie>` | `ModifierGroupsRemote.getAllModifiers()` |
| POST | `/pos/modifier-groups` | Yes | Modifier group data | `AdminModifierGroupEntitie` | `ModifierGroupsRemote.addNewModifierGroup()` |
| PUT | `/pos/modifier-groups/{id}` | Yes | Modifier group data | `AdminModifierGroupEntitie` | `ModifierGroupsRemote.updateModifierGroup()` |
| DELETE | `/pos/modifier-groups/{id}` | Yes | - | `BaseModel` | `ModifierGroupsRemote.deleteModifierGroup()` |
| PATCH | `/pos/modifier-groups/{id}/toggle-active` | Yes | - | `BaseModel` | `ModifierGroupsRemote.switchModifierGroupStatus()` |

### 2.9 Shift Control (Admin)
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/shifts/control/dashboard` | Yes | - | `ShiftControlEntity` | `ShiftControlRemote.getSummery()` |
| POST | `/shifts/close` | Yes | Query params | `dynamic` | `ShiftControlRemote.closeShift()` |

### 2.10 KDS (Kitchen Display System)
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/kds/dashboard` | Yes | - | `KdsKpisEntity` | `KdsControlRemote.getKpis()` |
| GET | `/kds/tickets` | Yes | Query params | `List<KdsContorlEntity>` | `KdsControlRemote.getOrders()` |
| PATCH | `/kds/tickets/{id}/action` | Yes | Action data | `KdsContorlEntity` | `KdsControlRemote.editAction()` |
| PATCH | `/kds/tickets/bulk-action` | Yes | Bulk action data | `dynamic` | `KdsControlRemote.pauseAll()` |

### 2.11 Close Out Day (Admin)
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/close-out-day` | Yes | Query params | `CloseOutDayEntity` | `CloseOutDayRemote.getSummery()` |
| POST | `/close-out-day/end-day` | Yes | Query params | `dynamic` | `CloseOutDayRemote.closeDay()` |

### 2.12 PIN Code (Admin)
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| POST | `/check/company/pin` | Yes | `{pin_code}` | `BaseModel` | `AdminPinCodeRemote.checkPinCode()` |
| POST | `/add/company/pin` | Yes | `{pin_code}` | `BaseModel` | `AdminPinCodeRemote.setPinCode()` |

### 2.13 Attendance
| Method | Endpoint | Auth | Request/Query | Response | Source |
|--------|----------|------|---------------|----------|--------|
| GET | `/attendance/status` | Yes | `date?` | `AttendanceDataEntity` | `AttendanceRemote.getAttendanceStatus()` |
| POST | `/attendance/clock-in` | Yes | `ClockInRequestEntity` | `ClockInDataEntity` | `AttendanceRemote.clockIn()` |
| POST | `/attendance/clock-out` | Yes | `ClockOutRequestEntity` | `ClockOutDataEntity` | `AttendanceRemote.clockOut()` |

---

## 3. Request/Response Contracts

### 3.1 Standard Response Format
All responses wrap in `BaseModel<T>`:
```json
{
  "data": T,           // Actual response data
  "meta": {},          // Pagination metadata (optional)
  "status": true,      // Boolean success indicator
  "message": "string", // Human-readable message
  "totalCount": 0,     // Total items for paginated lists
  "error": {           // Only present on error
    "message": "string",
    "code": "string"
  }
}
```

**Critical Behavior in `BaseModel.fromJson()`:**
- If `status == false` → throws `ServerException`
- Handles nested `data.data` structure automatically
- Falls back to wrapping entire response if `data` is null but `status == true`

### 3.2 Authentication Headers
```
Accept: application/json
accept-timezone: <IANA timezone name, e.g., "Africa/Cairo">
Authorization: Bearer <access_token>  (added by AuthInterceptor)
```

### 3.3 Error Handling
- **401 Unauthorized**: Triggers `CacheHelper.disposeUser()` and `SessionManager.notifySessionExpired()` → redirects to login
- **Server errors (5xx)**: Caught by `LoggingInterceptor`, wrapped in `Failure`
- **Network errors**: Wrapped in `Failure` with appropriate type

### 3.4 Key Data Models (Request/Response)

#### Login Response
```json
{
  "data": {
    "user": { /* UserModel fields */ },
    "token": "string",
    "refresh_token": "string"
  },
  "status": true,
  "message": "login_successful"
}
```

#### Product (KashierProductEntitie)
```json
{
  "id": 123,
  "name": "Product Name",
  "pro_image_url": "https://...",
  "category_id": 1,
  "sub_category_id": 2,
  "sale_price": "25.50",
  "is_stock": 1,
  "adds": [
    {
      "id": 1,
      "name": "Extra Cheese",
      "price": "2.00",
      "type": "Prep"
    }
  ]
}
```

#### Order (OrderModel)
```json
{
  "id": 456,
  "pos_date": "2024-01-15",
  "created_at": "2024-01-15T14:30:00",
  "status": "open",
  "subtotal": 100.00,
  "total": 108.50,
  "total_tax": 8.50,
  "customer_name": "John Doe",
  "type": "dine_in",
  "items": [
    {
      "id": 1,
      "product_id": 123,
      "product_name": "Burger",
      "quantity": 2,
      "price": "50.00",
      "modifier_items": [
        {"id": 1, "name": "Cheese", "price": "2.00", "quantity": 1}
      ]
    }
  ]
}
```

#### Session (SessionModel)
```json
{
  "session": {
    "id": 1,
    "opened_at": "2024-01-15T08:00:00",
    "closed_at": "2024-01-15T20:00:00"
  },
  "cashiers": [...],
  "summary": {
    "totalOrders": 50,
    "subTotal": 5000.00,
    "discount": 100.00,
    "netSales": 4900.00,
    "taxAmount": 416.50,
    "total": 5316.50
  },
  "payment_details": [
    {"count": 30, "sales": 3189.90},
    {"count": 20, "sales": 2126.60},
    {"count": 50, "sales": 5316.50}
  ],
  "cash_drawer": {
    "openingCash": "500.00",
    "cashPayment": 3189.90,
    "cashRefund": 50.00,
    "cashIn": 100.00,
    "cashOut": 200.00,
    "drawerTotal": 3539.90
  },
  "print_url": "https://..."
}
```

#### Inventory Summary
```json
{
  "summary": {
    "total": 150,
    "available": 120,
    "lowStock": 20,
    "outOfStock": 10
  },
  "alerts": {
    "lowStock": {"data": [...]},
    "outOfStock": {"data": [...]}
  }
}
```

#### Shift Control
```json
{
  "header": {
    "financialShiftId": 1,
    "status": "open",
    "duration": "08:30:00",
    "openedAt": "2024-01-15T08:00:00"
  },
  "kpis": {
    "ordersCount": 25,
    "totalSalesGross": 2500.00,
    "expectedCash": 1500.00
  },
  "employees": [...],
  "todays_shifts": {
    "activeShift": {...},
    "previousShift": {...}
  },
  "side_close_panel": {
    "openingCash": 500.00,
    "netSales": 2500.00,
    "paymentBreakdown": {"visa": 1000.00, "cash": 1500.00},
    "cashOut": 100.00,
    "actualCashCount": 1950.00,
    "variance": 50.00
  }
}
```

---

## 4. Flutter-to-Backend Data Flow

### 4.1 Request Flow
```
UI Widget
    ↓ (User Action)
Cubit/Bloc (e.g., AuthCubit, ChecksCubit, KitchenCubit)
    ↓ (Business Logic)
Repository Interface (e.g., AuthRepository, OrdersRepository)
    ↓ (Interface Call)
Repository Implementation (e.g., AuthRepository, OrdersRepositoryImpl)
    ↓ (Data Access)
Remote Data Source (e.g., AuthRemoteDataSource, OrdersRemoteDataSource)
    ↓ (HTTP Call)
ApiServices (get/post/put/patch/delete)
    ↓ (Dio)
AuthInterceptor (adds token, timezone)
    ↓
Backend API
```

### 4.2 Response Flow
```
Backend API
    ↓ (JSON Response)
Dio Response
    ↓
ApiServicesImp._normalize()  // Handles empty/null responses
    ↓
Remote Data Source
    ↓ (BaseModel.fromJson with type converter)
BaseModel<T> with parsed entity
    ↓
Repository Implementation
    ↓
Repository Interface (returns ApiResponse<T>)
    ↓
Cubit/Bloc
    ↓ (Emits State)
UI Widget (rebuilds with new state)
```

### 4.3 Key Data Transformations
| Layer | Transformation |
|-------|----------------|
| Remote Data Source | JSON → Model (via `fromJson`) → Entity (via `toEntitie()`) |
| Repository | `ApiResponse.success(entity)` or `ApiResponse.failure(failure)` |
| Cubit | Emits `Loading`, `Success(entity)`, `Error(message)` states |

---

## 5. Modules & Business Logic Analysis

### 5.1 Core Modules & Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                        POS/ERP APP                                │
├─────────────────────────────────────────────────────────────────┤
│  Auth Module          │  Kashier (POS) Module                    │
│  ├─ Login/Logout      │  ├─ Categories & Products                │
│  ├─ Company PIN       │  ├─ Modifiers                            │
│  └─ Token Management  │  ├─ Orders/Checks                        │
│                       │  ├─ Kitchen/Orders to Kitchen            │
│                       │  ├─ Checkout/Payment                     │
│                       │  ├─ Sessions & Close Day                 │
│                       │  └─ Reports                              │
├─────────────────────────────────────────────────────────────────┤
│  Admin Module         │  Inventory Module                        │
│  ├─ Menu Products     │  ├─ Items CRUD                           │
│  ├─ Categories        │  ├─ Categories                           │
│  ├─ Modifier Groups   │  ├─ Suppliers                            │
│  ├─ Shift Control     │  ├─ Units                                │
│  ├─ KDS Control       │  ├─ Adjustments                          │
│  ├─ Close Out Day     │  ├─ Purchase Orders                      │
│  ├─ Reports           │  └─ Dashboard Summary                    │
│  └─ PIN Management    │                                          │
├─────────────────────────────────────────────────────────────────┤
│  Attendance Module    │  Printer/Printing (Local)               │
│  ├─ Clock In/Out      │  ├─ Thermal/USB/Network/Bluetooth       │
│  ├─ Status            │  ├─ Print Queue                          │
│  └─ Work Progress     │  └─ Receipt/Kitchen Tickets             │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Critical Business Flows

#### POS Order Flow
```
1. User selects Category → GET /pos/categories
2. User views Products → GET /pos/products/all?category_id=X
3. User selects Product → GET /pos/products/{id}/modifiers
4. User builds Order (with modifiers, quantities)
5. User adds Customer (optional) → POST /pos/add-customer
6. User sends to Kitchen → POST /pos/send-to-kitchen
   OR User checkouts directly → POST /pos/checkout
7. Kitchen receives via KDS → GET /kds/tickets
8. Kitchen updates status → PATCH /kds/tickets/{id}/action
9. Order completes → POST /pos/orders/status (closed)
10. End of day → POST /pos/report/end-day
```

#### Shift Management Flow
```
1. Admin opens Shift Control → GET /shifts/control/dashboard
2. Cashier clocks in → POST /attendance/clock-in
3. During shift: orders processed normally
4. Admin closes shift → POST /shifts/close
5. Close out day → GET /close-out-day → POST /close-out-day/end-day
```

#### Inventory Flow
```
1. View dashboard → GET /inventory/dashboard
2. Manage items → GET/POST/DELETE /inventory/items
3. Stock adjustment → POST /inventory/adjustment
4. New purchase order → POST /inventory/purchase-orders
5. Manage suppliers/categories/units
```

---

## 6. Database Schema Design (Proposed)

Based on the API contracts and entity models, here's the proposed database schema:

### 6.1 Core Tables

```sql
-- Users & Authentication
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified_at TIMESTAMP,
    password_hash VARCHAR(255) NOT NULL,
    avatar VARCHAR(500),
    lang VARCHAR(10) DEFAULT 'ar',
    type VARCHAR(50),           -- 'admin', 'cashier', 'manager'
    active_status SMALLINT DEFAULT 1,
    delete_status SMALLINT DEFAULT 0,
    is_disable SMALLINT DEFAULT 0,
    is_enable_login SMALLINT DEFAULT 1,
    is_active SMALLINT DEFAULT 1,
    dark_mode SMALLINT DEFAULT 0,
    mode VARCHAR(20),
    messenger_color VARCHAR(20),
    referral_code INTEGER,
    used_referral_code INTEGER,
    commission_amount DECIMAL(10,2) DEFAULT 0,
    last_login_at TIMESTAMP,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_email_verified SMALLINT DEFAULT 0,
    profile JSONB,
    plan INTEGER,
    plan_expire_date TIMESTAMP,
    requested_plan INTEGER,
    trial_plan INTEGER,
    trial_expire_date TIMESTAMP,
    storage_limit DECIMAL(10,2),
    default_pipeline INTEGER,
    refresh_token VARCHAR(500),
    refresh_token_expire_at TIMESTAMP
);

-- Companies/Branches (Multi-tenant)
CREATE TABLE companies (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    pin_code VARCHAR(10),       -- For company PIN verification
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User-Company relationship
CREATE TABLE user_companies (
    user_id BIGINT REFERENCES users(id),
    company_id BIGINT REFERENCES companies(id),
    role VARCHAR(50),           -- 'owner', 'admin', 'manager', 'cashier'
    is_default BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, company_id)
);

-- Categories (POS Menu)
CREATE TABLE categories (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    image_url VARCHAR(500),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Products
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    category_id BIGINT REFERENCES categories(id),
    sub_category_id BIGINT REFERENCES categories(id),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    description TEXT,
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),
    sale_price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2),
    pro_image_url VARCHAR(500),
    is_stock BOOLEAN DEFAULT TRUE,
    stock_quantity DECIMAL(10,3) DEFAULT 0,
    low_stock_threshold DECIMAL(10,3) DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    preparation_station_id BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Product Modifiers (Add-ons)
CREATE TABLE modifier_groups (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    is_required BOOLEAN DEFAULT FALSE,
    min_selection INTEGER DEFAULT 0,
    max_selection INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE modifier_items (
    id BIGSERIAL PRIMARY KEY,
    modifier_group_id BIGINT REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    price DECIMAL(10,2) DEFAULT 0,
    type VARCHAR(20) DEFAULT 'Prep',  -- 'Prep', 'Addon', etc.
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Product-Modifier Group Many-to-Many
CREATE TABLE product_modifier_groups (
    product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
    modifier_group_id BIGINT REFERENCES modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, modifier_group_id)
);

-- Customers
CREATE TABLE customers (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255),
    mobile VARCHAR(50),
    email VARCHAR(255),
    customer_type VARCHAR(50),   -- 'walk_in', 'regular', 'vip', 'delivery'
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Orders/Checks
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    session_id BIGINT,           -- Reference to POS session
    pos_id_formatted VARCHAR(50),
    pos_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'open',  -- 'open', 'hand_over', 'closed', 'cancelled'
    type VARCHAR(20),            -- 'dine_in', 'takeaway', 'delivery', 'call_in'
    customer_id BIGINT REFERENCES customers(id),
    customer_name VARCHAR(255),
    customer_mobile VARCHAR(50),
    warehouse_name VARCHAR(255),
    subtotal DECIMAL(10,2) DEFAULT 0,
    total_tax DECIMAL(10,2) DEFAULT 0,
    total_discount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) DEFAULT 0,
    payment JSONB,               -- Payment breakdown
    print_receipt_url VARCHAR(500),
    print_kitchen_url VARCHAR(500),
    kashier_print_url VARCHAR(500),
    closed_at TIMESTAMP,
    created_by BIGINT REFERENCES users(id)
);

-- Order Items
CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,3) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    note TEXT,
    line_number INTEGER,
    status VARCHAR(20) DEFAULT 'pending',  -- For KDS: 'pending', 'preparing', 'ready', 'served'
    pos_product_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Order Item Modifiers
CREATE TABLE order_item_modifiers (
    id BIGSERIAL PRIMARY KEY,
    order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_item_id BIGINT REFERENCES modifier_items(id),
    modifier_name VARCHAR(255) NOT NULL,
    modifier_price DECIMAL(10,2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    type VARCHAR(20) DEFAULT 'Prep'
);

-- POS Sessions (Cashier shifts)
CREATE TABLE pos_sessions (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    cashier_id BIGINT REFERENCES users(id),
    branch_id BIGINT,            -- Reference to branch/warehouse
    opening_cash DECIMAL(10,2) DEFAULT 0,
    opened_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'open',  -- 'open', 'closed'
    shift_code VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Session Cashiers (Multiple cashiers per session)
CREATE TABLE session_cashiers (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES pos_sessions(id) ON DELETE CASCADE,
    cashier_id BIGINT REFERENCES users(id),
    opened_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

-- Session Summary (Aggregated)
CREATE TABLE session_summaries (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES pos_sessions(id) ON DELETE CASCADE,
    total_orders INTEGER DEFAULT 0,
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    net_sales DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Payment Details per Session
CREATE TABLE payment_details (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES pos_sessions(id) ON DELETE CASCADE,
    payment_type VARCHAR(20),    -- 'cash', 'card', 'total'
    count INTEGER DEFAULT 0,
    sales DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Cash Drawer per Session
CREATE TABLE cash_drawers (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES pos_sessions(id) ON DELETE CASCADE,
    opening_cash DECIMAL(10,2) DEFAULT 0,
    cash_payment DECIMAL(10,2) DEFAULT 0,
    cash_refund DECIMAL(10,2) DEFAULT 0,
    cash_in DECIMAL(10,2) DEFAULT 0,
    cash_out DECIMAL(10,2) DEFAULT 0,
    drawer_total DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Shifts (Financial shifts for admin)
CREATE TABLE shifts (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    cashier_id BIGINT REFERENCES users(id),
    branch_id BIGINT,
    opening_cash DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'open',
    opened_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    duration INTERVAL,
    shift_code VARCHAR(50),
    expected_cash DECIMAL(10,2),
    actual_cash_count DECIMAL(10,2),
    variance DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Shift KPIs
CREATE TABLE shift_kpis (
    id BIGSERIAL PRIMARY KEY,
    shift_id BIGINT REFERENCES shifts(id) ON DELETE CASCADE,
    orders_count INTEGER DEFAULT 0,
    total_sales_gross DECIMAL(12,2) DEFAULT 0,
    expected_cash DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Attendance
CREATE TABLE attendance_records (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    company_id BIGINT REFERENCES companies(id),
    date DATE NOT NULL,
    shift_id BIGINT REFERENCES shifts(id),
    shift_code VARCHAR(50),
    clock_in_time TIMESTAMP,
    clock_out_time TIMESTAMP,
    total_work_time INTERVAL,
    work_progress_percentage DECIMAL(5,2),
    is_clocked_in BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Inventory Items
CREATE TABLE inventory_items (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    category_id BIGINT REFERENCES inventory_categories(id),
    supplier_id BIGINT REFERENCES suppliers(id),
    unit_id BIGINT REFERENCES units(id),
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),
    cost_price DECIMAL(10,2),
    sale_price DECIMAL(10,2),
    current_stock DECIMAL(10,3) DEFAULT 0,
    min_stock_level DECIMAL(10,3) DEFAULT 10,
    max_stock_level DECIMAL(10,3),
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'inactive', 'discontinued'
    track_stock BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE inventory_categories (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE suppliers (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE units (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    name VARCHAR(100) NOT NULL,      -- 'kg', 'pcs', 'liter', 'box'
    short_name VARCHAR(20),           -- 'kg', 'pcs', 'L', 'bx'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inventory Adjustments
CREATE TABLE inventory_adjustments (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    item_id BIGINT REFERENCES inventory_items(id),
    adjustment_type VARCHAR(20),     -- 'increase', 'decrease', 'set'
    quantity DECIMAL(10,3) NOT NULL,
    reason VARCHAR(255),
    reference_type VARCHAR(50),      -- 'purchase', 'waste', 'transfer', 'count'
    reference_id BIGINT,
    adjusted_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Purchase Orders
CREATE TABLE purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    supplier_id BIGINT REFERENCES suppliers(id),
    order_number VARCHAR(50) UNIQUE,
    status VARCHAR(20) DEFAULT 'draft',  -- 'draft', 'ordered', 'received', 'cancelled'
    order_date DATE NOT NULL,
    expected_date DATE,
    total_amount DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
    id BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES inventory_items(id),
    quantity_ordered DECIMAL(10,3) NOT NULL,
    quantity_received DECIMAL(10,3) DEFAULT 0,
    unit_cost DECIMAL(10,2) NOT NULL,
    total_cost DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- KDS (Kitchen Display System)
CREATE TABLE kds_stations (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    ip_address VARCHAR(45),
    printer_id BIGINT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE kds_tickets (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    order_id BIGINT REFERENCES orders(id),
    station_id BIGINT REFERENCES kds_stations(id),
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'in_progress', 'ready', 'served', 'paused'
    priority INTEGER DEFAULT 0,
    opened_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    ready_at TIMESTAMP,
    elapsed_seconds INTEGER DEFAULT 0,
    preparation_target_seconds INTEGER,
    is_delayed BOOLEAN DEFAULT FALSE,
    available_actions JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE kds_ticket_items (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT REFERENCES kds_tickets(id) ON DELETE CASCADE,
    order_item_id BIGINT REFERENCES order_items(id),
    pos_product_id INTEGER,
    line_number INTEGER,
    quantity DECIMAL(10,3) NOT NULL,
    name VARCHAR(255) NOT NULL,
    modifiers JSONB,               -- Array of modifier names
    status VARCHAR(20) DEFAULT 'pending',
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Reports (Pre-computed/ cached)
CREATE TABLE daily_reports (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    report_date DATE NOT NULL,
    period VARCHAR(20),            -- 'today', 'week', 'month', 'custom'
    data JSONB NOT NULL,           -- Full report JSON
    generated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(company_id, report_date, period)
);

-- Printers (for reference)
CREATE TABLE printers (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50),              -- 'thermal', 'network', 'bluetooth', 'usb'
    ip_address VARCHAR(45),
    port INTEGER,
    mac_address VARCHAR(17),
    paper_width INTEGER DEFAULT 80,
    is_default_receipt BOOLEAN DEFAULT FALSE,
    is_default_kitchen BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 6.2 Key Relationships
```
users ──┬── user_companies ──┬── companies
        │                    │
        ├────────────────────┤
        │                    │
orders ──┤                    ├─ categories ── products ── modifier_groups ── modifier_items
         │                    │         │              │
         │                    │         │              └── product_modifier_groups ── products
         │                    │         │
         │                    │         └── order_items ── order_item_modifiers
         │                    │
         ├────────────────────┤
         │                    │
pos_sessions ────────────────┤
         │                    │
         ├────────────────────┤
         │                    │
attendance_records ──────────┤
         │                    │
         ├────────────────────┤
         │                    │
shifts ──────────────────────┤
         │                    │
         ├────────────────────┤
         │                    │
inventory_items ── inventory_categories
         │                    │
         ├────────────────────┤
         │                    │
purchase_orders ── purchase_order_items
         │                    │
         ├────────────────────┤
         │                    │
kds_stations ── kds_tickets ── kds_ticket_items
```

---

## 7. Authentication & Authorization Architecture

### 7.1 Current Implementation (From Flutter)
- **Token-based**: Bearer token in Authorization header
- **Token Storage**: Access token + Refresh token in SharedPreferences
- **Auto-refresh**: Not implemented in Flutter (handled by backend 401 → logout)
- **Company PIN**: Additional layer for company-level access
- **Session Management**: `SessionManager` notifies on expiry → redirect to login

### 7.2 Required Backend Auth Features
| Feature | Implementation |
|---------|----------------|
| Login | POST `/auth/login` → returns access_token + refresh_token + user |
| Token Refresh | POST `/auth/refresh` (NEW - not in current API but needed) |
| Logout | POST `/auth/logout` → invalidate tokens |
| Company PIN | POST `/check/company/pin` + POST `/add/company/pin` |
| Password Reset | NEW - Forgot/Reset password endpoints |
| Role-based Access | JWT claims or session-based permissions |

### 7.3 Proposed JWT Token Structure
```json
{
  "sub": 123,
  "email": "user@company.com",
  "name": "John Doe",
  "company_id": 1,
  "role": "cashier",
  "permissions": ["pos:read", "pos:write", "orders:read", "orders:write"],
  "iat": 1700000000,
  "exp": 1700086400,
  "jti": "unique-token-id"
}
```

### 7.4 Roles & Permissions Matrix
| Role | POS Access | Admin Access | Reports | Inventory | Settings | Users |
|------|-----------|--------------|---------|-----------|----------|-------|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manager | ✅ | Limited | ✅ | ✅ | Limited | ❌ |
| Cashier | ✅ | ❌ | Own only | ❌ | ❌ | ❌ |
| Kitchen | KDS only | ❌ | ❌ | ❌ | ❌ | ❌ |
| Waiter | Orders only | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 8. Features & Backend Services Required

### 8.1 Core Services
| Service | Responsibility | Priority |
|---------|---------------|----------|
| **Auth Service** | Login, logout, token refresh, company PIN, password reset | P0 |
| **User Service** | User CRUD, roles, permissions, profile | P0 |
| **Company Service** | Multi-tenant company/branch management | P0 |
| **POS Service** | Categories, products, modifiers, orders, checkout | P0 |
| **Session Service** | POS sessions, cash drawers, shift management | P0 |
| **Kitchen Service** | KDS tickets, station management, real-time updates | P0 |
| **Reporting Service** | Sales reports, Z-reports, dashboard analytics | P1 |
| **Inventory Service** | Items, categories, suppliers, units, adjustments, POs | P1 |
| **Attendance Service** | Clock in/out, shifts, work progress | P1 |
| **Print Service** | Receipt generation, kitchen tickets, PDF reports | P1 |
| **Notification Service** | Real-time alerts, low stock, order ready | P2 |

### 8.2 Real-time Requirements
| Feature | Current Implementation | Backend Need |
|---------|----------------------|--------------|
| KDS Ticket Updates | Polling via `GET /kds/tickets` | WebSocket/SSE for push updates |
| Order Status Changes | Polling via `GET /pos/orders` | WebSocket for real-time sync |
| Shift Updates | Manual refresh | WebSocket for live dashboard |
| Printer Status | Local only | Optional backend tracking |

**Recommendation**: Implement WebSocket server for KDS and order status real-time updates. Current Flutter app uses polling but WebSocket would improve UX significantly.

---

## 9. Recommended Backend Technology Stack

### 9.1 Primary Recommendation: **Node.js + TypeScript + Fastify**
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js 20+ LTS | Excellent TypeScript support, large ecosystem |
| Framework | Fastify | High performance, schema validation, plugin system |
| Language | TypeScript | Type safety matching Flutter models |
| ORM | Prisma | Type-safe database access, migrations |
| Database | PostgreSQL 16 | Relational, JSONB support, robust |
| Cache | Redis 7 | Sessions, rate limiting, caching |
| Queue | BullMQ (Redis) | Background jobs, reports, notifications |
| Real-time | Socket.io or native WS | KDS, order updates |
| Auth | JWT + bcrypt | Stateless, secure |
| API Docs | Swagger/OpenAPI | Auto-generated from code |
| Testing | Vitest + Supertest | Fast, TypeScript-native |
| Container | Docker + Docker Compose | Consistent deployment |
| CI/CD | GitHub Actions | Standard |

### 9.2 Alternative: **Go + Fiber/Gin**
- Better performance for high concurrency
- Single binary deployment
- Steeper learning curve if team knows Node.js

### 9.3 Alternative: **Python + FastAPI**
- Excellent for rapid development
- Great OpenAPI integration
- Slightly slower than Node/Go but acceptable

---

## 10. Implementation Plan - Phases & Tasks

### Phase 0: Foundation (Week 1-2)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 0.1 | Project setup: Fastify + TypeScript + Prisma + Docker | - |
| 0.2 | Database schema design & Prisma migration | 0.1 |
| 0.3 | Core config: env, logging, error handling, CORS | 0.1 |
| 0.4 | Health check & readiness endpoints | 0.1 |
| 0.5 | OpenAPI/Swagger setup | 0.1 |

### Phase 1: Authentication & Core (Week 2-3)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 1.1 | User model, password hashing, JWT tokens | 0.2 |
| 1.2 | POST `/auth/login` - returns tokens + user | 1.1 |
| 1.3 | POST `/auth/refresh` - access token refresh | 1.1 |
| 1.4 | POST `/auth/logout` - token invalidation | 1.1 |
| 1.5 | POST `/check/company/pin` + `/add/company/pin` | 1.1 |
| 1.6 | Auth middleware (JWT verification) | 1.1 |
| 1.7 | Role/Permission system | 1.1 |
| 1.8 | Password reset flow (email + token) | 1.1 |

### Phase 2: POS Core - Products & Categories (Week 3-4)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 2.1 | Category CRUD: GET/POST `/pos/categories` | 1.6 |
| 2.2 | Product CRUD: GET/POST/PUT/DELETE `/pos/products` | 2.1 |
| 2.3 | Product modifiers: GET `/pos/products/{id}/modifiers` | 2.2 |
| 2.4 | Modifier Group CRUD (Admin): `/pos/modifier-groups` | 2.1 |
| 2.5 | Product-Modifier group linking | 2.3, 2.4 |
| 2.6 | Product search & pagination | 2.2 |
| 2.7 | Image upload for products | 2.2 |

### Phase 3: POS Operations - Orders & Checkout (Week 4-5)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 3.1 | Customer CRUD: POST `/pos/add-customer` | 1.6 |
| 3.2 | Order creation: POST `/pos/send-to-kitchen` | 2.2, 3.1 |
| 3.3 | Order update: PUT `/pos/update-kitchen-order` | 3.2 |
| 3.4 | Checkout: POST `/pos/checkout` | 3.2 |
| 3.5 | Order status update: POST `/pos/orders/status` | 3.2 |
| 3.6 | Order listing: GET `/pos/orders` (with filters) | 3.2 |
| 3.7 | Order details with items & modifiers | 3.2 |

### Phase 4: Sessions & Close Day (Week 5-6)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 4.1 | Session CRUD: GET/POST `/pos/sessions` | 1.6 |
| 4.2 | Session detail: GET `/pos/report/close-out?session_id=` | 4.1 |
| 4.3 | Close day: POST `/pos/report/end-day` | 4.1 |
| 4.4 | Cash drawer management | 4.1 |
| 4.5 | Payment details tracking | 4.1 |
| 4.6 | Print URL generation for receipts | 4.3 |

### Phase 5: KDS (Kitchen Display System) (Week 6-7)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 5.1 | KDS Stations CRUD | 1.6 |
| 5.2 | KDS Dashboard: GET `/kds/dashboard` | 5.1 |
| 5.3 | KDS Tickets: GET `/kds/tickets` | 3.2, 5.1 |
| 5.4 | Ticket actions: PATCH `/kds/tickets/{id}/action` | 5.3 |
| 5.5 | Bulk actions: PATCH `/kds/tickets/bulk-action` | 5.3 |
| 5.6 | **WebSocket integration for real-time updates** | 5.3 |

### Phase 6: Admin - Inventory (Week 7-8)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 6.1 | Inventory Dashboard: GET `/inventory/dashboard` | 1.6 |
| 6.2 | Items CRUD: GET/POST/DELETE `/inventory/items` | 6.1 |
| 6.3 | Categories CRUD: GET `/inventory/categories` | 6.1 |
| 6.4 | Suppliers CRUD: GET `/inventory/suppliers` | 6.1 |
| 6.5 | Units CRUD: GET `/inventory/units` | 6.1 |
| 6.6 | Stock adjustment: POST `/inventory/adjustment` | 6.2 |
| 6.7 | Purchase orders: POST `/inventory/purchase-orders` | 6.2, 6.4 |

### Phase 7: Admin - Menu Products (Week 8-9)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 7.1 | Menu Categories: GET/POST `/pos/products/categories` | 1.6 |
| 7.2 | Menu Products: GET/POST/PUT/DELETE `/pos/products` (admin) | 7.1 |
| 7.3 | Prep Stations: GET `/pos/products/preparation-stations` | 7.1 |
| 7.4 | Product toggle active: PATCH `/pos/products/{id}/toggle-active` | 7.2 |
| 7.5 | Multipart form data for product images | 7.2 |

### Phase 8: Admin - Reports & Shift Control (Week 9-10)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 8.1 | POS Dashboard: GET `/reports/pos-dashboard` | 3.6, 4.1 |
| 8.2 | Z-Report PDF: GET `/reports/z-report/pdf` | 4.3 |
| 8.3 | Z-Report Print: GET `/reports/z-report/print` | 4.3 |
| 8.4 | Sales Report: GET `/pos/salesReport` | 3.6 |
| 8.5 | Shift Control: GET `/shifts/control/dashboard` | 4.1 |
| 8.6 | Close Shift: POST `/shifts/close` | 8.5 |
| 8.7 | Close Out Day: GET/POST `/close-out-day` | 4.1 |

### Phase 9: Attendance (Week 10-11)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 9.1 | Attendance Status: GET `/attendance/status` | 1.6 |
| 9.2 | Clock In: POST `/attendance/clock-in` | 1.6 |
| 9.3 | Clock Out: POST `/attendance/clock-out` | 1.6 |

### Phase 10: Real-time & Polish (Week 11-12)
| Task | Description | Dependencies |
|------|-------------|--------------|
| 10.1 | WebSocket server for KDS tickets | 5.6 |
| 10.2 | WebSocket for order status updates | 3.6 |
| 10.3 | WebSocket for shift dashboard | 8.5 |
| 10.4 | Rate limiting & security hardening | All |
| 10.5 | Comprehensive integration tests | All |
| 10.6 | API documentation & Postman collection | All |
| 10.7 | Load testing & optimization | All |
| 10.8 | Deployment scripts & monitoring | All |

---

## 11. Migration & Integration Plan

### 11.1 Backward Compatibility Strategy
1. **Maintain exact same API contracts** - URLs, request/response formats, status codes
2. **Run parallel** - New backend on subdomain (`api-new.futxtech.com`) alongside old
3. **Feature flag in Flutter** - Switch base URL via build config or runtime config
4. **Gradual rollout** - Test with staging, then percentage of users, then full

### 11.2 Data Migration
| Data | Strategy |
|------|----------|
| Users | Export from old DB → Transform → Import to new (passwords rehashed) |
| Products/Categories | Direct migration via SQL/scripts |
| Orders/History | **Archive only** - Keep last 90 days active, older in cold storage |
| Sessions | Reset - Start fresh with new backend |
| Inventory | Migrate current stock levels |
| Modifiers | Migrate with product links |

### 11.3 Flutter Integration Changes Required
```dart
// In api_config.dart - Add new backend URL
static const String newApiUrl = 'https://api-new.futxtech.com/api/v1/';

// Feature flag for gradual rollout
static bool get useNewBackend => kReleaseMode 
    ? const bool.fromEnvironment('USE_NEW_BACKEND') 
    : true;  // Always use new in dev
```

### 11.4 Testing Checklist Before Cutover
- [ ] All 40+ endpoints return identical response structure
- [ ] Authentication flow works (login, refresh, logout, PIN)
- [ ] POS order flow: category → product → modifier → kitchen → checkout
- [ ] KDS real-time updates work via WebSocket
- [ ] Reports match old backend exactly (within rounding)
- [ ] PDF generation matches format
- [ ] Attendance clock in/out works
- [ ] Inventory adjustments reflect correctly
- [ ] Image uploads work for products
- [ ] Multi-tenant isolation works

---

## 12. Testing & Deployment Strategy

### 12.1 Testing Pyramid
```
                    E2E Tests (5-10)
                   /                  \
          Integration Tests (50-100)  \
                 /                       \
        Unit Tests (500+) ←── Fast, isolated, run on every PR
```

### 12.2 Test Categories
| Type | Tool | Coverage Target |
|------|------|-----------------|
| Unit | Vitest | >90% for services, utils |
| Integration | Vitest + Testcontainers | All API endpoints |
| Contract | Pact or custom | Verify Flutter compatibility |
| E2E | Playwright (optional) | Critical user flows |
| Load | k6 or Artillery | 1000 concurrent users |

### 12.3 Deployment Pipeline
```
Git Push → GitHub Actions
    ├─ Lint & Typecheck
    ├─ Unit Tests
    ├─ Build Docker Image
    ├─ Integration Tests (with Testcontainers)
    ├─ Deploy to Staging
    ├─ Contract Tests vs Flutter
    ├─ Manual QA Sign-off
    └─ Deploy to Production (Blue/Green)
```

### 12.4 Monitoring & Observability
- **Logs**: Structured JSON logs → Loki/ELK
- **Metrics**: Prometheus + Grafana (latency, errors, throughput)
- **Traces**: OpenTelemetry → Jaeger
- **Alerts**: PagerDuty/Slack for 5xx, high latency, DB issues
- **Health**: `/health` endpoint for k8s probes

---

## 13. Open Questions & Information Gaps

### 13.1 Cannot Determine from Flutter Code Alone
| Question | Impact | Resolution Approach |
|----------|--------|---------------------|
| **Exact DB schema of original backend** | Data migration | Request DB dump or schema from backend team |
| **Token expiration times** | Auth refresh logic | Check current token JWT `exp` claim or ask |
| **Refresh token rotation policy** | Security | Implement standard rotation; ask if current backend does |
| **Multi-tenancy model** | Data isolation | Current code suggests single company per user; confirm |
| **WebSocket protocol for KDS** | Real-time impl | Current uses polling; design new WS protocol |
| **PDF generation library/format** | Report printing | Current uses backend-generated PDF; replicate format |
| **Image storage (local/S3/CDN)** | Product images | Check `pro_image_url` pattern; ask |
| **Rate limiting rules** | API protection | Implement standard; ask if current has limits |
| **Audit logging requirements** | Compliance | Ask about regulatory needs |
| **Backup/DR strategy** | Operations | Define RPO/RTO with stakeholders |

### 13.2 Flutter Code Ambiguities
| Ambiguity | Location | Assumption Made |
|-----------|----------|-----------------|
| `EndPoints.getProducts` used for both POS and Admin | `api_helper.dart` lines 7, 47 | Same endpoint, different query params |
| `EndPoints.getAllChecks` = `EndPoints.getOrders` | `api_helper.dart` lines 9, 13 | Same endpoint, different usage context |
| `EndPoints.createCheack` = `EndPoints.checkout` | `api_helper.dart` lines 14, 17 | Duplicate; checkout used in code |
| `adminGetAllProducts` = `getProducts` | `api_helper.dart` lines 7, 47 | Same endpoint |
| Inventory endpoints use query params for POST body | `inventory_remote.dart` | Non-RESTful; backend expects query params |
| Menu product edit uses POST not PUT | `menu_product_product_remote.dart:76` | Backend expects POST for update |
| `kashier_allchecks_model` has massive generated class name | `kashier_allchecks_model.dart` | Code-gen artifact; ignore |

### 13.3 Missing Endpoints (Needed but Not in Flutter)
| Endpoint | Reason |
|----------|--------|
| `POST /auth/refresh` | Token refresh (currently 401→logout) |
| `POST /auth/forgot-password` | Password reset |
| `POST /auth/reset-password` | Password reset |
| `GET /users/profile` | Current user info |
| `PUT /users/profile` | Update profile |
| `GET /companies/{id}` | Company details |
| `GET /branches` | Branch/warehouse list |
| `GET /pos/payment-methods` | Payment types for checkout |
| `POST /pos/orders/{id}/print` | Reprint receipt |
| `GET /pos/orders/{id}/pdf` | Order PDF |
| WebSocket `/ws/kds` | Real-time KDS |
| WebSocket `/ws/orders` | Real-time orders |

---

## 14. Risk Assessment & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| API contract mismatch | Medium | High | Contract tests against Flutter; parallel run |
| Data migration errors | Medium | High | Automated scripts + validation; dry runs |
| Performance regression | Low | Medium | Load testing; query optimization |
| Real-time WebSocket complexity | Medium | Medium | Start with polling parity; add WS incrementally |
| Third-party integrations (payment, SMS) | Low | High | Document all external calls; mock in tests |
| Team knowledge gap (Node/TS) | Medium | Medium | Pair programming; code reviews; docs |
| Scope creep | High | Medium | Strict phase gates; prioritize P0 only |

---

## 15. Success Criteria

The new backend is considered successful when:

1. ✅ **All 40+ existing endpoints** return byte-for-byte compatible responses
2. ✅ **Flutter app works without code changes** (only base URL switch)
3. ✅ **Authentication flow** identical (login, PIN, session expiry)
4. ✅ **POS order flow** completes end-to-end (category → checkout)
5. ✅ **KDS real-time** works (WebSocket preferred, polling fallback)
6. ✅ **Reports match** within 0.01% for financial data
7. ✅ **PDF receipts** visually identical
8. ✅ **Load test**: 1000 concurrent users, p99 < 500ms
9. ✅ **Zero critical bugs** in staging for 2 weeks
10. ✅ **Rollback plan tested** and documented

---

## Appendix A: File Reference Map

| Flutter File | Purpose | API Endpoints Used |
|--------------|---------|-------------------|
| `api_helper.dart` | Endpoint constants | All |
| `api_config.dart` | Base URL config | All |
| `auth_interceptor.dart` | Auth header injection | All authenticated |
| `auth_remote_data_source.dart` | Auth API calls | `/auth/login`, `/auth/logout`, `/check/company/pin` |
| `kashier_remote_data_source.dart` | POS core | Categories, products, modifiers, customer, kitchen, checkout |
| `orders_remote_datasource.dart` | Orders list | `/pos/orders` |
| `modifiers_remote_datasource.dart` | Product modifiers | `/pos/products/{id}/modifiers` |
| `kashier_allchecks_remote_data_source.dart` | Order history | `/pos/orders`, `/pos/orders/status` |
| `kashier_allreports_remote.dart` | Sales reports | `/pos/salesReport` |
| `closeday_remote.dart` | Session/close day | `/pos/report/close-out`, `/pos/sessions`, `/pos/report/end-day` |
| `attendance_remote.dart` | Attendance | `/attendance/status`, `/attendance/clock-in`, `/attendance/clock-out` |
| `inventory_remote.dart` | Inventory admin | `/inventory/*` |
| `menu_product_product_remote.dart` | Menu products admin | `/pos/products/*` (admin) |
| `menu_product_category_remote.dart` | Menu categories admin | `/pos/products/categories`, `/pos/categories` |
| `modifier_group_remote.dart` | Modifier groups admin | `/pos/modifier-groups/*` |
| `shift_control_remote.dart` | Shift control | `/shifts/control/dashboard`, `/shifts/close` |
| `kds_control_remote.dart` | KDS | `/kds/dashboard`, `/kds/tickets/*` |
| `close_out_day_remote.dart` | Close out day | `/close-out-day`, `/close-out-day/end-day` |
| `report_remote.dart` | Reports | `/reports/pos-dashboard`, `/reports/z-report/*` |
| `admin_pincode_remote.dart` | Admin PIN | `/check/company/pin`, `/add/company/pin` |

---

## Appendix B: Enum Values Referenced

```dart
// kashier_order_state_enum.dart
enum KashierOrderStateEnum { Open, HandOver, Closed, Cancelled }

// kashier_productadds_type_enum.dart
enum KashierProductaddsTypeEnum { Prep, Addon }

// user_role.dart
enum UserRole { admin, cashier, manager, kitchen, waiter }

// purchase_status_enum.dart
enum PurchaseStatusEnum { draft, ordered, received, cancelled }

// device_type_enum.dart
enum DeviceTypeEnum { mobile, tablet, desktop, kds }
```

---

*Document generated from Flutter codebase analysis on 2026-11-08*
*Total API Endpoints Cataloged: 42*
*Total Data Models Analyzed: 35+*
*Modules Covered: 6 (Auth, POS/Kashier, Admin, Inventory, Attendance, KDS)*