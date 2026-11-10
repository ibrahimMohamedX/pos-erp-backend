# مخطط هندسة عكسية للـ Backend وبناء Backend جديد لـ POS/ERP

## الملخص التنفيذي

يقدم هذا المستند تحليلاً شاملاً للهندسة العكسية لتكامل تطبيق Flutter POS/ERP مع الـ Backend، مستخلصاً من كود Flutter الفعلي. الهدف هو بناء Backend جديد من الصفر يحافظ على التوافق الكامل مع واجهة برمجة التطبيقات (API) الحالية لتطبيق Flutter.

**عناوين URL الأساسية:**
- الإنتاج: `https://erp.futxtech.com/api/v1/`
- الاختبار/التطوير: `https://erp-test.futxtech.com/api/v1/`

---

## 1. خريطة تكامل الـ Backend الحالية

### نظرة عامة على البنية المعمارية
```
Flutter UI (Cubits/Bloc)
    ↓
طبقة النطاق (Domain Layer) - واجهات المستودعات (Repository Interfaces)
    ↓
طبقة البيانات (Data Layer) - تنفيذات المستودعات (Repository Implementations)
    ↓
مصادر البيانات البعيدة (Remote Data Sources) - استدعاءات API
    ↓
ApiServices (عميل HTTP Dio)
    ↓
المعترضات (Interceptors): AuthInterceptor + LoggingInterceptor
    ↓
Backend API
```

### المكونات الرئيسية
| المكون | الموقع | الغرض |
|----------|---------|--------|
| `ApiConfig` | `lib/core/services/api/api_config.dart` | إعدادات عنوان URL الأساسي |
| `EndPoints` | `lib/core/services/api/api_helper.dart` | تعريفات جميع نقاط نهاية API |
| `ApiServices` | `lib/core/services/api/domain/services/api_service.dart` | تجريد HTTP |
| `ApiServicesImp` | `lib/core/services/api/domain/services/api_services_imp.dart` | تنفيذ Dio |
| `AuthInterceptor` | `lib/core/services/api/interceptors/auth_interceptor.dart` | حقن رمز Bearer |
| `CacheHelper` | `lib/core/services/cache/cache_helper.dart` | تخزين الرموز/المستخدم |
| `BaseModel<T>` | `lib/core/utils/models/base_model.dart` | غلاف استجابة عام |

### حقن التبعيات
جميع الخدمات مسجلة في `lib/core/utils/configuration/locator.dart` باستخدام GetIt:
- Dio مع مهلة اتصال 30 ثانية / إرسال واستقبال دقيقة واحدة
- AuthInterceptor يضيف رأس `Authorization: Bearer <token>` و `accept-timezone`
- LoggingInterceptor في وضع التصحيح

---

## 2. كتالوج كامل لنقاط نهاية API

### 2.1 وحدة المصادقة
| الطريقة | نقطة النهاية | مصادقة | نص الطلب | الاستجابة | المصدر |
|--------|-------------|---------|-----------|-----------|--------|
| POST | `/auth/login` | لا | `{email, password}` | `BaseModel` مع بيانات المستخدم + الرمز | `AuthRemoteDataSource.login()` |
| POST | `/auth/logout` | نعم | - | `BaseModel` | `AuthRemoteDataSource.logout()` |
| POST | `/check/company/pin` | نعم | `{pin_code}` | `BaseModel` | `AuthRemoteDataSource.checkCompanyPin()` |

### 2.2 وحدة Kashier/POS (العمليات الأساسية)
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/pos/categories` | نعم | - | `List<KashierCategoryEntitie>` | `KashierRemoteDataSource.getCategories()` |
| GET | `/pos/products/all` | نعم | `page`, `category_id`, `search` | `List<KashierProductEntitie>` | `KashierRemoteDataSource.getProducts()` |
| GET | `/pos/products/{id}/modifiers` | نعم | - | `List<ModifierGroupModel>` | `ModifiersRemoteDataSource.getModifiers()` |
| POST | `/pos/add-customer` | نعم | `{first_name, last_name?, mobile?, note?, customerType?}` | `KashierAddCustomerModel` | `KashierRemoteDataSource.addCustomer()` |
| GET | `/pos/orders` | نعم | - | `List<OrderModel>` | `OrdersRemoteDataSource.getOrders()` |
| POST | `/pos/orders/status` | نعم | `{id, status, pin_code?}` | `dynamic` | `AllChecksRemoteDataSource.updateCheckStatus()` |
| POST | `/pos/send-to-kitchen` | نعم | بيانات الطلب | `Map<String,dynamic>` | `KashierRemoteDataSource.sendOrderToKitchen()` |
| PUT | `/pos/update-kitchen-order` | نعم | بيانات الطلب | `Map<String,dynamic>` | `KashierRemoteDataSource.sendOrderToKitchen()` |
| POST | `/pos/checkout` | نعم | بيانات الدفع | `Map<String,dynamic>` | `KashierRemoteDataSource.checkout()` |

### 2.3 الجلسة وإغلاق اليوم
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/pos/report/close-out` | نعم | `session_id?` | `KashierSessionEntitie` | `ClosedayRemote.getSession()` |
| GET | `/pos/sessions` | نعم | - | `List<KashierAllsessionsEntitie>` | `ClosedayRemote.getAllSessionsId()` |
| POST | `/pos/report/end-day` | نعم | `{opening_cash}` | `BaseModel` | `ClosedayRemote.closeDay()` |

### 2.4 جميع الشيكات/سجل الطلبات
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/pos/orders` | نعم | معاملات التصفية | `List<KashierOrderEntitie>` | `AllChecksRemoteDataSource.getAllChecks()` |
| POST | `/pos/orders/status` | نعم | `{id, status, pin_code}` | `dynamic` | `AllChecksRemoteDataSource.updateCheckStatus()` |

### 2.5 التقارير
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/pos/salesReport` | نعم | `period`, `cashier_id`, `date_from`, `date_to` | `KashierAllrepotsEntitie` | `AllreportsRemote.getAllReports()` |
| GET | `/reports/pos-dashboard` | نعم | معاملات التصفية | `ReportEntity` | `ReportRemote.getData()` |
| GET | `/reports/z-report/pdf` | نعم | - | `Uint8List` (PDF) | `ReportRemote.getPdf()` |
| GET | `/reports/z-report/print` | نعم | - | `Uint8List` | EndPoints.reportPrint |

### 2.6 المخزون (الإدارة)
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/inventory/dashboard` | نعم | - | `InventoryBasicEntity` | `InventoryRemote.getSummery()` |
| GET | `/inventory/items` | نعم | `page`, `search`, `status`, `category_id` | `List<InventoryItemEntity>` | `InventoryRemote.getItems()` |
| DELETE | `/inventory/items/{id}` | نعم | - | `BaseModel` | `InventoryRemote.deleteItem()` |
| POST | `/inventory/adjustment` | نعم | معاملات الاستعلام | `InventoryItemEntity` | `InventoryRemote.adjustItem()` |
| POST | `/inventory/products` | نعم | معاملات الاستعلام | `InventoryItemEntity` | `InventoryRemote.addNewItem()` |
| POST | `/inventory/purchase-orders` | نعم | معاملات الاستعلام | `dynamic` | `InventoryRemote.addNewPurchase()` |
| GET | `/inventory/categories` | نعم | - | `List<InventoryCategoryEntity>` | `InventoryRemote.getCategories()` |
| GET | `/inventory/suppliers` | نعم | معاملات الاستعلام | `List<InventorySupplierEntity>` | `InventoryRemote.getSuppliers()` |
| GET | `/inventory/units` | نعم | معاملات الاستعلام | `List<InventoryUnitEntity>` | `InventoryRemote.getUnits()` |

### 2.7 منتجات القائمة (الإدارة)
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/pos/products/categories` | نعم | - | `List<MenuProductCategoryEntite>` | `MenuProductCategoryRemote.getAllCategories()` |
| POST | `/pos/categories` | نعم | بيانات الفئة | `MenuProductCategoryEntite` | `MenuProductCategoryRemote.createNewCategory()` |
| GET | `/pos/products/all` | نعم | `page`, `category_id`, `search` | `List<MenuProductsProductEntitie>` | `MenuProductProductRemote.getAllProducts()` |
| GET | `/pos/products/preparation-stations` | نعم | - | `List<MenuProductPrepStationEntity>` | `MenuProductProductRemote.getAllPrepStations()` |
| POST | `/pos/products` | نعم | FormData (متعدد الأجزاء) | `MenuProductsProductEntitie` | `MenuProductProductRemote.addNewProduct()` |
| POST | `/pos/products/{id}` | نعم | FormData (متعدد الأجزاء) | `MenuProductsProductEntitie` | `MenuProductProductRemote.editProduct()` |
| DELETE | `/pos/products/{id}` | نعم | - | `BaseModel` | `MenuProductProductRemote.deleteProduct()` |
| PATCH | `/pos/products/{id}/toggle-active` | نعم | - | `BaseModel` | `MenuProductProductRemote.switchProductStatus()` |

### 2.8 مجموعات المعدلات (الإدارة)
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/pos/modifier-groups` | نعم | `page` | `List<AdminModifierGroupEntitie>` | `ModifierGroupsRemote.getAllModifiers()` |
| POST | `/pos/modifier-groups` | نعم | بيانات مجموعة المعدلات | `AdminModifierGroupEntitie` | `ModifierGroupsRemote.addNewModifierGroup()` |
| PUT | `/pos/modifier-groups/{id}` | نعم | بيانات مجموعة المعدلات | `AdminModifierGroupEntitie` | `ModifierGroupsRemote.updateModifierGroup()` |
| DELETE | `/pos/modifier-groups/{id}` | نعم | - | `BaseModel` | `ModifierGroupsRemote.deleteModifierGroup()` |
| PATCH | `/pos/modifier-groups/{id}/toggle-active` | نعم | - | `BaseModel` | `ModifierGroupsRemote.switchModifierGroupStatus()` |

### 2.9 التحكم في الورديات (الإدارة)
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/shifts/control/dashboard` | نعم | - | `ShiftControlEntity` | `ShiftControlRemote.getSummery()` |
| POST | `/shifts/close` | نعم | معاملات الاستعلام | `dynamic` | `ShiftControlRemote.closeShift()` |

### 2.10 KDS (نظام عرض المطبخ)
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/kds/dashboard` | نعم | - | `KdsKpisEntity` | `KdsControlRemote.getKpis()` |
| GET | `/kds/tickets` | نعم | معاملات الاستعلام | `List<KdsContorlEntity>` | `KdsControlRemote.getOrders()` |
| PATCH | `/kds/tickets/{id}/action` | نعم | بيانات الإجراء | `KdsContorlEntity` | `KdsControlRemote.editAction()` |
| PATCH | `/kds/tickets/bulk-action` | نعم | بيانات الإجراء المجمع | `dynamic` | `KdsControlRemote.pauseAll()` |

### 2.11 إغلاق اليوم (الإدارة)
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/close-out-day` | نعم | معاملات الاستعلام | `CloseOutDayEntity` | `CloseOutDayRemote.getSummery()` |
| POST | `/close-out-day/end-day` | نعم | معاملات الاستعلام | `dynamic` | `CloseOutDayRemote.closeDay()` |

### 2.12 رمز PIN (الإدارة)
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| POST | `/check/company/pin` | نعم | `{pin_code}` | `BaseModel` | `AdminPinCodeRemote.checkPinCode()` |
| POST | `/add/company/pin` | نعم | `{pin_code}` | `BaseModel` | `AdminPinCodeRemote.setPinCode()` |

### 2.13 الحضور
| الطريقة | نقطة النهاية | مصادقة | الطلب/الاستعلام | الاستجابة | المصدر |
|--------|-------------|---------|----------------|-----------|--------|
| GET | `/attendance/status` | نعم | `date?` | `AttendanceDataEntity` | `AttendanceRemote.getAttendanceStatus()` |
| POST | `/attendance/clock-in` | نعم | `ClockInRequestEntity` | `ClockInDataEntity` | `AttendanceRemote.clockIn()` |
| POST | `/attendance/clock-out` | نعم | `ClockOutRequestEntity` | `ClockOutDataEntity` | `AttendanceRemote.clockOut()` |

---

## 3. عقود الطلب/الاستجابة

### 3.1 تنسيق الاستجابة القياسي
جميع الاستجابات مغلفة في `BaseModel<T>`:
```json
{
  "data": T,           // بيانات الاستجابة الفعلية
  "meta": {},          // بيانات وصفية للصفحات (اختياري)
  "status": true,      // مؤشر نجاح منطقي
  "message": "string", // رسالة قابلة للقراءة البشرية
  "totalCount": 0,     // إجمالي العناصر للقوائم المقسمة
  "error": {           // موجود فقط عند الخطأ
    "message": "string",
    "code": "string"
  }
}
```

**سلوك حاسم في `BaseModel.fromJson()`:**
- إذا كان `status == false` → يرمي `ServerException`
- يتعامل تلقائياً مع هيكل `data.data` المتداخل
- يرجع للغلاف الكامل للاستجابة إذا كانت `data` معدومة لكن `status == true`

### 3.2 رؤوس المصادقة
```
Accept: application/json
accept-timezone: <اسم المنطقة الزمنية IANA، مثل "Africa/Cairo">
Authorization: Bearer <access_token>  (يضيفه AuthInterceptor)
```

### 3.3 معالجة الأخطاء
- **401 غير مصرح**: يؤدي إلى `CacheHelper.disposeUser()` و `SessionManager.notifySessionExpired()` → إعادة توجيه لتسجيل الدخول
- **أخطاء الخادم (5xx)**: يتم التقاطها بواسطة `LoggingInterceptor`، تُغلّف في `Failure`
- **أخطاء الشبكة**: تُغلّف في `Failure` مع النوع المناسب

### 3.4 نماذج البيانات الرئيسية (طلب/استجابة)

#### استجابة تسجيل الدخول
```json
{
  "data": {
    "user": { /* حقول UserModel */ },
    "token": "string",
    "refresh_token": "string"
  },
  "status": true,
  "message": "login_successful"
}
```

#### المنتج (KashierProductEntitie)
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

#### الطلب (OrderModel)
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

#### الجلسة (SessionModel)
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

#### ملخص المخزون
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

#### التحكم في الورديات
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

## 4. تدفق البيانات من Flutter إلى الـ Backend

### 4.1 تدفق الطلب
```
UI Widget
    ↓ (إجراء المستخدم)
Cubit/Bloc (مثل AuthCubit، ChecksCubit، KitchenCubit)
    ↓ (المنطق التجاري)
واجهة المستودع (مثل AuthRepository، OrdersRepository)
    ↓ (استدعاء الواجهة)
تنفيذ المستودع (مثل AuthRepository، OrdersRepositoryImpl)
    ↓ (الوصول للبيانات)
مصدر البيانات البعيد (مثل AuthRemoteDataSource، OrdersRemoteDataSource)
    ↓ (استدعاء HTTP)
ApiServices (get/post/put/patch/delete)
    ↓ (Dio)
AuthInterceptor (يضيف الرمز، المنطقة الزمنية)
    ↓
Backend API
```

### 4.2 تدفق الاستجابة
```
Backend API
    ↓ (استجابة JSON)
Dio Response
    ↓
ApiServicesImp._normalize()  // يتعامل مع الاستجابات الفارغة/المعدومة
    ↓
مصدر البيانات البعيد
    ↓ (BaseModel.fromJson مع محول النوع)
BaseModel<T> مع الكيان المحلل
    ↓
تنفيذ المستودع
    ↓
واجهة المستودع (تُرجع ApiResponse<T>)
    ↓
Cubit/Bloc
    ↓ (يصدر الحالة)
UI Widget (يعيد البناء مع الحالة الجديدة)
```

### 4.3 تحويلات البيانات الرئيسية
| الطبقة | التحويل |
|-------|-------------|
| مصدر البيانات البعيد | JSON → Model (عبر `fromJson`) → Entity (عبر `toEntitie()`) |
| المستودع | `ApiResponse.success(entity)` أو `ApiResponse.failure(failure)` |
| Cubit | يصدر حالات `Loading`، `Success(entity)`، `Error(message)` |

---

## 5. تحليل الوحدات والمنطق التجاري

### 5.1 الوحدات الأساسية والتبعيات

```
┌─────────────────────────────────────────────────────────────────┐
│                        تطبيق POS/ERP                              │
├─────────────────────────────────────────────────────────────────┤
│  وحدة المصادقة        │  وحدة Kashier (POS)                      │
│  ├─ تسجيل الدخول/الخروج   │  ├─ الفئات والمنتجات                 │
│  ├─ رمز PIN الشركة     │  ├─ المعدلات                            │
│  └─ إدارة الرموز      │  ├─ الطلبات/الشيكات                     │
│                       │  ├─ المطبخ/إرسال للمطبخ                  │
│                       │  ├─ الدفع/إتمام الطلب                   │
│                       │  ├─ الجلسات وإغلاق اليوم                 │
│                       │  └─ التقارير                            │
├─────────────────────────────────────────────────────────────────┤
│  وحدة الإدارة         │  وحدة المخزون                            │
│  ├─ منتجات القائمة    │  ├─ عمليات CRUD للصنف                   │
│  ├─ الفئات            │  ├─ الفئات                               │
│  ├─ مجموعات المعدلات  │  ├─ الموردين                             │
│  ├─ التحكم في الورديات │  ├─ الوحدات                             │
│  ├─ تحكم KDS         │  ├─ التعديلات                           │
│  ├─ إغلاق اليوم       │  ├─ أوامر الشراء                         │
│  ├─ التقارير         │  └─ ملخص لوحة التحكم                     │
│  └─ إدارة PIN        │                                          │
├─────────────────────────────────────────────────────────────────┤
│  وحدة الحضور          │  الطباعة (محلي)                         │
│  ├─ الدخول/الخروج    │  ├─ حراري/USB/شبكة/بلوتوث              │
│  ├─ الحالة           │  ├─ طابور الطباعة                        │
│  └─ تقدم العمل       │  └─ إيصالات/تذاكر المطبخ               │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 تدفقات الأعمال الحرجة

#### تدفق طلب POS
```
1. المستخدم يختار الفئة → GET /pos/categories
2. المستخدم يشاهد المنتجات → GET /pos/products/all?category_id=X
3. المستخدم يختار المنتج → GET /pos/products/{id}/modifiers
4. المستخدم يبني الطلب (مع المعدلات، الكميات)
5. المستخدم يضيف العميل (اختياري) → POST /pos/add-customer
6. المستخدم يرسل للمطبخ → POST /pos/send-to-kitchen
   أو المستخدم يُنهي الطلب مباشرة → POST /pos/checkout
7. المطبخ يستقبل عبر KDS → GET /kds/tickets
8. المطبخ يحدّث الحالة → PATCH /kds/tickets/{id}/action
9. الطلب يكتمل → POST /pos/orders/status (closed)
10. نهاية اليوم → POST /pos/report/end-day
```

#### تدفق إدارة الورديات
```
1. المدير يفتح تحكم الورديات → GET /shifts/control/dashboard
2. الكاشير يسجل الدخول → POST /attendance/clock-in
3. أثناء الوردية: الطلبات تُعالج بشكل طبيعي
4. المدير يغلق الوردية → POST /shifts/close
5. إغلاق اليوم → GET /close-out-day → POST /close-out-day/end-day
```

#### تدفق المخزون
```
1. عرض لوحة التحكم → GET /inventory/dashboard
2. إدارة الأصناف → GET/POST/DELETE /inventory/items
3. تعديل المخزون → POST /inventory/adjustment
4. أمر شراء جديد → POST /inventory/purchase-orders
5. إدارة الموردين/الفئات/الوحدات
```

---

## 6. تصميم مخطط قاعدة البيانات (مقترح)

بناءً على عقود API ونماذج الكيانات، إليك مخطط قاعدة البيانات المقترح:

### 6.1 الجداول الأساسية

```sql
-- المستخدمين والمصادقة
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

-- الشركات/الفروع (متعدد المستأجرين)
CREATE TABLE companies (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    pin_code VARCHAR(10),       -- للتحقق من رمز PIN الشركة
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- علاقة مستخدم-شركة
CREATE TABLE user_companies (
    user_id BIGINT REFERENCES users(id),
    company_id BIGINT REFERENCES companies(id),
    role VARCHAR(50),           -- 'owner', 'admin', 'manager', 'cashier'
    is_default BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, company_id)
);

-- الفئات (قائمة POS)
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

-- المنتجات
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

-- معدلات المنتجات (الإضافات)
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

-- علاقة متعددة-متعددة بين المنتج ومجموعة المعدلات
CREATE TABLE product_modifier_groups (
    product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
    modifier_group_id BIGINT REFERENCES modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, modifier_group_id)
);

-- العملاء
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

-- الطلبات/الشيكات
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    session_id BIGINT,           -- مرجع لجلسة POS
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
    payment JSONB,               -- تفاصيل الدفع
    print_receipt_url VARCHAR(500),
    print_kitchen_url VARCHAR(500),
    kashier_print_url VARCHAR(500),
    closed_at TIMESTAMP,
    created_by BIGINT REFERENCES users(id)
);

-- عناصر الطلب
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
    status VARCHAR(20) DEFAULT 'pending',  -- لـ KDS: 'pending', 'preparing', 'ready', 'served'
    pos_product_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- معدلات عناصر الطلب
CREATE TABLE order_item_modifiers (
    id BIGSERIAL PRIMARY KEY,
    order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_item_id BIGINT REFERENCES modifier_items(id),
    modifier_name VARCHAR(255) NOT NULL,
    modifier_price DECIMAL(10,2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    type VARCHAR(20) DEFAULT 'Prep'
);

-- جلسات POS (ورديات الكاشير)
CREATE TABLE pos_sessions (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    cashier_id BIGINT REFERENCES users(id),
    branch_id BIGINT,            -- مرجع للفرع/المستودع
    opening_cash DECIMAL(10,2) DEFAULT 0,
    opened_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'open',  -- 'open', 'closed'
    shift_code VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- كاشير الجلسة (عدة كاشير لكل جلسة)
CREATE TABLE session_cashiers (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES pos_sessions(id) ON DELETE CASCADE,
    cashier_id BIGINT REFERENCES users(id),
    opened_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

-- ملخص الجلسة (مجمّع)
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

-- تفاصيل الدفع لكل جلسة
CREATE TABLE payment_details (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES pos_sessions(id) ON DELETE CASCADE,
    payment_type VARCHAR(20),    -- 'cash', 'card', 'total'
    count INTEGER DEFAULT 0,
    sales DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- درج النقد لكل جلسة
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

-- الورديات (الورديات المالية للإدارة)
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

-- مؤشرات أداء الورديات
CREATE TABLE shift_kpis (
    id BIGSERIAL PRIMARY KEY,
    shift_id BIGINT REFERENCES shifts(id) ON DELETE CASCADE,
    orders_count INTEGER DEFAULT 0,
    total_sales_gross DECIMAL(12,2) DEFAULT 0,
    expected_cash DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- الحضور
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

-- أصناف المخزون
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

-- تعديلات المخزون
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

-- أوامر الشراء
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

-- KDS (نظام عرض المطبخ)
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
    modifiers JSONB,               -- مصفوفة أسماء المعدلات
    status VARCHAR(20) DEFAULT 'pending',
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- التقارير (محسوبة مسبقاً/مخزنة مؤقتاً)
CREATE TABLE daily_reports (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES companies(id),
    report_date DATE NOT NULL,
    period VARCHAR(20),            -- 'today', 'week', 'month', 'custom'
    data JSONB NOT NULL,           -- JSON التقرير الكامل
    generated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(company_id, report_date, period)
);

-- الطابعات (للمرجع)
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

### 6.2 العلاقات الرئيسية
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

## 7. هندسة المصادقة والتفويض

### 7.1 التنفيذ الحالي (من Flutter)
- **مبني على الرموز**: رمز Bearer في رأس Authorization
- **تخزين الرموز**: رمز الوصول + رمز التحديث في SharedPreferences
- **التحديث التلقائي**: غير مُنفذ في Flutter (يتعامل معه الـ Backend 401 → تسجيل خروج)
- **رمز PIN الشركة**: طبقة إضافية للوصول على مستوى الشركة
- **إدارة الجلسات**: `SessionManager` يُخطر عند الانتهاء → إعادة توجيه لتسجيل الدخول

### 7.2 ميزات المصادقة المطلوبة في الـ Backend
| الميزة | التنفيذ |
|---------|------------|
| تسجيل الدخول | POST `/auth/login` → يُرجع access_token + refresh_token + user |
| تحديث الرمز | POST `/auth/refresh` (جديد - ليس في API الحالي لكن مطلوب) |
| تسجيل الخروج | POST `/auth/logout` → إلغاء الرموز |
| رمز PIN الشركة | POST `/check/company/pin` + POST `/add/company/pin` |
| إعادة تعيين كلمة المرور | جديد - نقاط نهاية نسيان/إعادة تعيين كلمة المرور |
| الوصول القائم على الأدوار | مطالبات JWT أو صلاحيات مبنية على الجلسة |

### 7.3 هيكل رمز JWT المقترح
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

### 7.4 مصفوفة الأدوار والصلاحيات
| الدور | وصول POS | وصول الإدارة | التقارير | المخزون | الإعدادات | المستخدمين |
|------|-----------|--------------|---------|---------|----------|-----------|
| المالك | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| المدير | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| مدير الفرع | ✅ | محدود | ✅ | ✅ | محدود | ❌ |
| الكاشير | ✅ | ❌ | خاص به فقط | ❌ | ❌ | ❌ |
| المطبخ | KDS فقط | ❌ | ❌ | ❌ | ❌ | ❌ |
| النادل | الطلبات فقط | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 8. الميزات والخدمات الخلفية المطلوبة

### 8.1 الخدمات الأساسية
| الخدمة | المسؤولية | الأولوية |
|--------|-------------|----------|
| **خدمة المصادقة** | تسجيل الدخول، الخروج، تحديث الرمز، رمز PIN الشركة، إعادة تعيين كلمة المرور | P0 |
| **خدمة المستخدمين** | CRUD المستخدمين، الأدوار، الصلاحيات، الملف الشخصي | P0 |
| **خدمة الشركات** | إدارة الشركات/الفروع متعددة المستأجرين | P0 |
| **خدمة POS** | الفئات، المنتجات، المعدلات، الطلبات، الدفع | P0 |
| **خدمة الجلسات** | جلسات POS، أدراج النقد، إدارة الورديات | P0 |
| **خدمة المطبخ** | تذاكر KDS، إدارة المحطات، التحديثات الفورية | P0 |
| **خدمة التقارير** | تقارير المبيعات، تقارير Z، تحليلات لوحة التحكم | P1 |
| **خدمة المخزون** | الأصناف، الفئات، الموردين، الوحدات، التعديلات، أوامر الشراء | P1 |
| **خدمة الحضور** | الدخول/الخروج، الورديات، تقدم العمل | P1 |
| **خدمة الطباعة** | إنشاء الإيصالات، تذاكر المطبخ، تقارير PDF | P1 |
| **خدمة الإشعارات** | تنبيهات فورية، مخزون منخفض، طلب جاهز | P2 |

### 8.2 متطلبات الوقت الفعلي
| الميزة | التنفيذ الحالي | حاجة الـ Backend |
|---------|----------------|-----------------|
| تحديثات تذاكر KDS | استقصاء عبر `GET /kds/tickets` | WebSocket/SSE للتحديثات الدفعية |
| تغييرات حالة الطلب | استقصاء عبر `GET /pos/orders` | WebSocket للمزامنة الفورية |
| تحديثات الورديات | تحديث يدوي | WebSocket للوحة تحكم حية |
| حالة الطابعة | محلي فقط | تتبع خلفي اختياري |

**التوصية**: تنفيذ خادم WebSocket لـ KDS وتحديثات حالة الطلب الفورية. التطبيق الحالي يستخدم الاستقصاء لكن WebSocket سيحسن تجربة المستخدم بشكل كبير.

---

## 9. مكدس تقنيات الـ Backend المقترح

### 9.1 التوصية الأساسية: **Node.js + TypeScript + Fastify**
| المكون | التقنية | المبرر |
|----------|---------|---------|
| وقت التشغيل | Node.js 20+ LTS | دعم ممتاز لـ TypeScript، نظام بيئي كبير |
| الإطار | Fastify | أداء عالي، التحقق من المخطط، نظام الإضافات |
| اللغة | TypeScript | أمان الأنواع مطابق لنماذج Flutter |
| ORM | Prisma | وصول قاعدة بيانات آمن من حيث الأنواع، الهجرات |
| قاعدة البيانات | PostgreSQL 16 | علائقية، دعم JSONB، قوية |
| ذاكرة التخزين المؤقت | Redis 7 | الجلسات، تحديد المعدل، التخزين المؤقت |
| الطابور | BullMQ (Redis) | المهام الخلفية، التقارير، الإشعارات |
| الوقت الفعلي | Socket.io أو WS أصلي | KDS، تحديثات الطلبات |
| المصادقة | JWT + bcrypt | بلا حالة، آمن |
| توثيق API | Swagger/OpenAPI | مولد تلقائياً من الكود |
| الاختبار | Vitest + Supertest | سريع، أصلي لـ TypeScript |
| الحاويات | Docker + Docker Compose | نشر متسق |
| CI/CD | GitHub Actions | قياسي |

### 9.2 بديل: **Go + Fiber/Gin**
- أداء أفضل للتزامن العالي
- نشر بملف ثنائي واحد
- منحنى تعلم أصعب إذا كان الفريق يعرف Node.js

### 9.3 بديل: **Python + FastAPI**
- ممتاز للتطوير السريع
- تكامل OpenAPI رائع
- أبطأ قليلاً من Node/Go لكن مقبول

---

## 10. خطة التنفيذ - المراحل والمهام

### المرحلة 0: الأساس (الأسبوع 1-2)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 0.1 | إعداد المشروع: Fastify + TypeScript + Prisma + Docker | - |
| 0.2 | تصميم مخطط قاعدة البيانات وهجرة Prisma | 0.1 |
| 0.3 | إعداد أساسي: env، التسجيل، معالجة الأخطاء، CORS | 0.1 |
| 0.4 | نقاط نهاية فحص الصحة والجاهزية | 0.1 |
| 0.5 | إعداد OpenAPI/Swagger | 0.1 |

### المرحلة 1: المصادقة والأساسيات (الأسبوع 2-3)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 1.1 | نموذج المستخدم، تشفير كلمة المرور، رموز JWT | 0.2 |
| 1.2 | POST `/auth/login` - يُرجع الرموز + المستخدم | 1.1 |
| 1.3 | POST `/auth/refresh` - تحديث رمز الوصول | 1.1 |
| 1.4 | POST `/auth/logout` - إلغاء الرموز | 1.1 |
| 1.5 | POST `/check/company/pin` + `/add/company/pin` | 1.1 |
| 1.6 | وسيط المصادقة (التحقق من JWT) | 1.1 |
| 1.7 | نظام الأدوار/الصلاحيات | 1.1 |
| 1.8 | تدفق إعادة تعيين كلمة المرور (بريد إلكتروني + رمز) | 1.1 |

### المرحلة 2: أساسيات POS - المنتجات والفئات (الأسبوع 3-4)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 2.1 | CRUD الفئات: GET/POST `/pos/categories` | 1.6 |
| 2.2 | CRUD المنتجات: GET/POST/PUT/DELETE `/pos/products` | 2.1 |
| 2.3 | معدّلات المنتج: GET `/pos/products/{id}/modifiers` | 2.2 |
| 2.4 | CRUD مجموعات المعدلات (إدارة): `/pos/modifier-groups` | 2.1 |
| 2.5 | ربط المنتج بمجموعات المعدلات | 2.3, 2.4 |
| 2.6 | البحث في المنتجات والتقسيم للصفحات | 2.2 |
| 2.7 | رفع الصور للمنتجات | 2.2 |

### المرحلة 3: عمليات POS - الطلبات والدفع (الأسبوع 4-5)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 3.1 | CRUD العملاء: POST `/pos/add-customer` | 1.6 |
| 3.2 | إنشاء الطلب: POST `/pos/send-to-kitchen` | 2.2, 3.1 |
| 3.3 | تحديث الطلب: PUT `/pos/update-kitchen-order` | 3.2 |
| 3.4 | الدفع: POST `/pos/checkout` | 3.2 |
| 3.5 | تحديث حالة الطلب: POST `/pos/orders/status` | 3.2 |
| 3.6 | قائمة الطلبات: GET `/pos/orders` (مع التصفية) | 3.2 |
| 3.7 | تفاصيل الطلب مع العناصر والمعدلات | 3.2 |

### المرحلة 4: الجلسات وإغلاق اليوم (الأسبوع 5-6)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 4.1 | CRUD الجلسات: GET/POST `/pos/sessions` | 1.6 |
| 4.2 | تفاصيل الجلسة: GET `/pos/report/close-out?session_id=` | 4.1 |
| 4.3 | إغلاق اليوم: POST `/pos/report/end-day` | 4.1 |
| 4.4 | إدارة درج النقد | 4.1 |
| 4.5 | تتبع تفاصيل الدفع | 4.1 |
| 4.6 | إنشاء رابط الطباعة للإيصالات | 4.3 |

### المرحلة 5: KDS (نظام عرض المطبخ) (الأسبوع 6-7)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 5.1 | CRUD محطات KDS | 1.6 |
| 5.2 | لوحة تحكم KDS: GET `/kds/dashboard` | 5.1 |
| 5.3 | تذاكر KDS: GET `/kds/tickets` | 3.2, 5.1 |
| 5.4 | إجراءات التذكرة: PATCH `/kds/tickets/{id}/action` | 5.3 |
| 5.5 | الإجراءات المجمعة: PATCH `/kds/tickets/bulk-action` | 5.3 |
| 5.6 | **تكامل WebSocket للتحديثات الفورية** | 5.3 |

### المرحلة 6: الإدارة - المخزون (الأسبوع 7-8)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 6.1 | لوحة تحكم المخزون: GET `/inventory/dashboard` | 1.6 |
| 6.2 | CRUD الأصناف: GET/POST/DELETE `/inventory/items` | 6.1 |
| 6.3 | CRUD الفئات: GET `/inventory/categories` | 6.1 |
| 6.4 | CRUD الموردين: GET `/inventory/suppliers` | 6.1 |
| 6.5 | CRUD الوحدات: GET `/inventory/units` | 6.1 |
| 6.6 | تعديل المخزون: POST `/inventory/adjustment` | 6.2 |
| 6.7 | أوامر الشراء: POST `/inventory/purchase-orders` | 6.2, 6.4 |

### المرحلة 7: الإدارة - منتجات القائمة (الأسبوع 8-9)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 7.1 | فئات القائمة: GET/POST `/pos/products/categories` | 1.6 |
| 7.2 | منتجات القائمة: GET/POST/PUT/DELETE `/pos/products` (إدارة) | 7.1 |
| 7.3 | محطات التحضير: GET `/pos/products/preparation-stations` | 7.1 |
| 7.4 | تبديل حالة المنتج: PATCH `/pos/products/{id}/toggle-active` | 7.2 |
| 7.5 | بيانات نموذج متعدد الأجزاء لصور المنتجات | 7.2 |

### المرحلة 8: الإدارة - التقارير والتحكم في الورديات (الأسبوع 9-10)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 8.1 | لوحة تحكم POS: GET `/reports/pos-dashboard` | 3.6, 4.1 |
| 8.2 | تقرير Z PDF: GET `/reports/z-report/pdf` | 4.3 |
| 8.3 | تقرير Z للطباعة: GET `/reports/z-report/print` | 4.3 |
| 8.4 | تقرير المبيعات: GET `/pos/salesReport` | 3.6 |
| 8.5 | تحكم الورديات: GET `/shifts/control/dashboard` | 4.1 |
| 8.6 | إغلاق الوردية: POST `/shifts/close` | 8.5 |
| 8.7 | إغلاق اليوم: GET/POST `/close-out-day` | 4.1 |

### المرحلة 9: الحضور (الأسبوع 10-11)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 9.1 | حالة الحضور: GET `/attendance/status` | 1.6 |
| 9.2 | تسجيل الدخول: POST `/attendance/clock-in` | 1.6 |
| 9.3 | تسجيل الخروج: POST `/attendance/clock-out` | 1.6 |

### المرحلة 10: الوقت الفعلي والتلميع (الأسبوع 11-12)
| المهمة | الوصف | التبعيات |
|------|-------------|------------|
| 10.1 | خادم WebSocket لتذاكر KDS | 5.6 |
| 10.2 | WebSocket لتحديثات حالة الطلبات | 3.6 |
| 10.3 | WebSocket للوحة تحكم الورديات | 8.5 |
| 10.4 | تحديد المعدل وتصلب الأمان | الكل |
| 10.5 | اختبارات تكامل شاملة | الكل |
| 10.6 | توثيق API ومجموعة Postman | الكل |
| 10.7 | اختبار الحمل والتحسين | الكل |
| 10.8 | نصوص النشر والمراقبة | الكل |

---

## 11. خطة الهجرة والتكامل

### 11.1 استراتيجية التوافق الخلفي
1. **الحفاظ على عقود API المتطابقة** - نفس العناوين، تنسيقات الطلب/الاستجابة، رموز الحالة
2. **التشغيل المتوازي** - Backend جديد على نطاق فرعي (`api-new.futxtech.com`) بجانب القديم
3. **علامة ميزة في Flutter** - تبديل عنوان URL الأساسي عبر إعداد البناء أو إعداد وقت التشغيل
4. **الإصدار التدريجي** - اختبار مع staging، ثم نسبة من المستخدمين، ثم بالكامل

### 11.2 هجرة البيانات
| البيانات | الاستراتيجية |
|--------|------------|
| المستخدمين | تصدير من قاعدة البيانات القديمة → تحويل → استيراد للجديد (كلمات المرور مُعاد تشفيرها) |
| المنتجات/الفئات | هجرة مباشرة عبر SQL/scripts |
| الطلبات/السجل | **أرشفة فقط** - الاحتفاظ بـ 90 يوماً الأخيرة نشطة، الأقدم في تخزين بارد |
| الجلسات | إعادة تعيين - البداية من جديد مع Backend الجديد |
| المخزون | هجرة مستويات المخزون الحالية |
| المعدلات | الهجرة مع روابط المنتجات |

### 11.3 تغييرات تكامل Flutter المطلوبة
```dart
// في api_config.dart - إضافة عنوان URL للـ Backend الجديد
static const String newApiUrl = 'https://api-new.futxtech.com/api/v1/';

// علامة ميزة للإصدار التدريجي
static bool get useNewBackend => kReleaseMode 
    ? const bool.fromEnvironment('USE_NEW_BACKEND') 
    : true;  // استخدم الجديد دائماً في التطوير
```

### 11.4 قائمة التحقق من الاختبار قبل التبديل
- [ ] جميع نقاط النهاية الـ 40+ تُرجع بنية استجابة متطابقة
- [ ] تدفق المصادقة يعمل (تسجيل الدخول، التحديث، الخروج، PIN)
- [ ] تدفق طلب POS: الفئة → المنتج → المعدل → المطبخ → الدفع
- [ ] تحديثات KDS الفورية تعمل عبر WebSocket
- [ ] التقارير تطابق الـ Backend القديم تماماً (في حدود التقريب)
- [ ] إنشاء PDF يطابق التنسيق
- [ ] حضور الدخول/الخروج يعمل
- [ ] تعديلات المخزون تنعكس بشكل صحيح
- [ ] رفع الصور يعمل للمنتجات
- [ ] العزل متعدد المستأجرين يعمل

---

## 12. استراتيجية الاختبار والنشر

### 12.1 هرم الاختبار
```
                    اختبارات E2E (5-10)
                   /                  \
          اختبارات التكامل (50-100)  \
                 /                       \
        اختبارات الوحدة (500+) ←── سريعة، معزولة، تعمل في كل PR
```

### 12.2 فئات الاختبار
| النوع | الأداة | هدف التغطية |
|------|------|-------------|
| الوحدة | Vitest | >90% للخدمات، الأدوات |
| التكامل | Vitest + Testcontainers | جميع نقاط نهاية API |
| العقد | Pact أو مخصص | التحقق من التوافق مع Flutter |
| E2E | Playwright (اختياري) | تدفقات المستخدم الحرجة |
| الحمل | k6 أو Artillery | 1000 مستخدم متزامن |

### 12.3 خط أنابيب النشر
```
Git Push → GitHub Actions
    ├─ التدقيق والتحقق من الأنواع
    ├─ اختبارات الوحدة
    ├─ بناء صورة Docker
    ├─ اختبارات التكامل (مع Testcontainers)
    ├─ النشر للـ Staging
    ├─ اختبارات العقد مقابل Flutter
    ├─ موافقة QA يدوية
    └─ النشر للإنتاج (Blue/Green)
```

### 12.4 المراقبة وقابلية الرصد
- **السجلات**: سجلات JSON منظمة → Loki/ELK
- **المقاييس**: Prometheus + Grafana (زمن الاستجابة، الأخطاء، الإنتاجية)
- **التتبع**: OpenTelemetry → Jaeger
- **التنبيهات**: PagerDuty/Slack للأخطاء 5xx، زمن استجابة عالي، مشاكل قاعدة البيانات
- **الصحة**: نقطة نهاية `/health` لفحوصات k8s

---

## 13. الأسئلة المفتوحة والفجوات المعلوماتية

### 13.1 لا يمكن تحديدها من كود Flutter وحده
| السؤال | التأثير | طريقة الحل |
|---------|--------|-------------|
| **مخطط قاعدة البيانات الدقيق للـ Backend الأصلي** | هجرة البيانات | طلب نسخة من قاعدة البيانات أو المخطط من فريق الـ Backend |
| **أوقات انتهاء صلاحية الرموز** | منطق تحديث المصادقة | فحص مطالبة `exp` في JWT الحالي أو السؤال |
| **سياسة تدوير رمز التحديث** | الأمان | تنفيذ تدوير قياسي؛ السؤال إذا كان الـ Backend الحالي يفعل ذلك |
| **نموذج تعدد المستأجرين** | عزل البيانات | الكود الحالي يشير لشركة واحدة لكل مستخدم؛ التأكيد |
| **بروتوكول WebSocket لـ KDS** | تنفيذ الوقت الفعلي | يستخدم حالياً الاستقصاء؛ تصميم بروتوكول WS جديد |
| **مكتبة/تنسيق إنشاء PDF** | طباعة التقارير | يستخدم حالياً PDF من الـ Backend؛ تكرار التنسيق |
| **تخزين الصور (محلي/S3/CDN)** | صور المنتجات | فحص نمط `pro_image_url`؛ السؤال |
| **قواعد تحديد المعدل** | حماية API | تنفيذ قياسي؛ السؤال إذا كان الحالي له حدود |
| **متطلبات سجل التدقيق** | الامتثال | السؤال عن الاحتياجات التنظيمية |
| **استراتيجية النسخ الاحتياطي/DR** | العمليات | تحديد RPO/RTO مع أصحاب المصلحة |

### 13.2 غموض في كود Flutter
| الغموض | الموقع | الافتراض المتخذ |
|-----------|----------|-----------------|
| `EndPoints.getProducts` مستخدم لـ POS والإدارة | `api_helper.dart` الأسطر 7، 47 | نفس نقطة النهاية، معاملات استعلام مختلفة |
| `EndPoints.getAllChecks` = `EndPoints.getOrders` | `api_helper.dart` الأسطر 9، 13 | نفس نقطة النهاية، سياق استخدام مختلف |
| `EndPoints.createCheack` = `EndPoints.checkout` | `api_helper.dart` الأسطر 14، 17 | مكرر؛ checkout مستخدم في الكود |
| `adminGetAllProducts` = `getProducts` | `api_helper.dart` الأسطر 7، 47 | نفس نقطة النهاية |
| نقاط نهاية المخزون تستخدم معاملات استعلام لجسم POST | `inventory_remote.dart` | غير RESTful؛ الـ Backend يتوقع معاملات استعلام |
| تعديل منتج القائمة يستخدم POST لا PUT | `menu_product_product_remote.dart:76` | الـ Backend يتوقع POST للتحديث |
| `kashier_allchecks_model` له اسم فئة مولد ضخم | `kashier_allchecks_model.dart` | مصنف من توليد الكود؛ تجاهل |

### 13.3 نقاط نهاية مفقودة (مطلوبة لكن ليست في Flutter)
| نقطة النهاية | السبب |
|----------|--------|
| `POST /auth/refresh` | تحديث الرمز (حالياً 401→تسجيل خروج) |
| `POST /auth/forgot-password` | إعادة تعيين كلمة المرور |
| `POST /auth/reset-password` | إعادة تعيين كلمة المرور |
| `GET /users/profile` | معلومات المستخدم الحالي |
| `PUT /users/profile` | تحديث الملف الشخصي |
| `GET /companies/{id}` | تفاصيل الشركة |
| `GET /branches` | قائمة الفروع/المستودعات |
| `GET /pos/payment-methods` | أنواع الدفع للدفع |
| `POST /pos/orders/{id}/print` | إعادة طباعة الإيصال |
| `GET /pos/orders/{id}/pdf` | PDF الطلب |
| WebSocket `/ws/kds` | KDS فوري |
| WebSocket `/ws/orders` | طلبات فورية |

---

## 14. تقييم المخاطر والتخفيف

| المخاطر | الاحتمالية | التأثير | التخفيف |
|------|------------|--------|----------|
| عدم تطابق عقد API | متوسط | عالي | اختبارات العقد مقابل Flutter؛ تشغيل متوازي |
| أخطاء هجرة البيانات | متوسط | عالي | نصوص آلية + تحقق؛ تجارب جافة |
| تراجع الأداء | منخفض | متوسط | اختبار الحمل؛ تحسين الاستعلامات |
| تعقيد WebSocket الوقت الفعلي | متوسط | متوسط | البدء بمساواة الاستقصاء؛ إضافة WS تدريجياً |
| تكاملات الطرف الثالث (دفع، SMS) | منخفض | عالي | توثيق جميع الاستدعاءات الخارجية؛ محاكاة في الاختبارات |
| فجوة معرفة الفريق (Node/TS) | متوسط | متوسط | البرمجة الثنائية؛ مراجعات الكود؛ توثيق |
| اتساع النطاق | عالي | متوسط | بوابات مرحلة صارمة؛ الأولوية لـ P0 فقط |

---

## 15. معايير النجاح

يُعتبر الـ Backend الجديد ناجحاً عندما:

1. ✅ **جميع نقاط النهاية الـ 40+ الموجودة** تُرجع استجابات متوافقة بايت ببايت
2. ✅ **تطبيق Flutter يعمل دون تغييرات في الكود** (تبديل عنوان URL الأساسي فقط)
3. ✅ **تدفق المصادقة** متطابق (تسجيل الدخول، PIN، انتهاء الجلسة)
4. ✅ **تدفق طلب POS** يكتمل من البداية للنهاية (الفئة → الدفع)
5. ✅ **KDS الوقت الفعلي** يعمل (WebSocket مفضل، استقصاء احتياطي)
6. ✅ **التقارير تطابق** ضمن 0.01% للبيانات المالية
7. ✅ **إيصالات PDF** متطابقة بصرياً
8. ✅ **اختبار الحمل**: 1000 مستخدم متزامن، p99 < 500ms
9. ✅ **صفر أخطاء حرجة** في الـ staging لأسبوعين
10. ✅ **خطة التراجع مختبرة** وموثقة

---

## الملحق أ: خريطة مراجع الملفات

| ملف Flutter | الغرض | نقاط نهاية API المستخدمة |
|------------|--------|--------------------------|
| `api_helper.dart` | ثوابت نقاط النهاية | الكل |
| `api_config.dart` | إعداد عنوان URL الأساسي | الكل |
| `auth_interceptor.dart` | حقن رأس المصادقة | جميع المصادق عليها |
| `auth_remote_data_source.dart` | استدعاءات API للمصادقة | `/auth/login`، `/auth/logout`، `/check/company/pin` |
| `kashier_remote_data_source.dart` | أساسيات POS | الفئات، المنتجات، المعدلات، العميل، المطبخ، الدفع |
| `orders_remote_datasource.dart` | قائمة الطلبات | `/pos/orders` |
| `modifiers_remote_datasource.dart` | معدّلات المنتج | `/pos/products/{id}/modifiers` |
| `kashier_allchecks_remote_data_source.dart` | سجل الطلبات | `/pos/orders`، `/pos/orders/status` |
| `kashier_allreports_remote.dart` | تقارير المبيعات | `/pos/salesReport` |
| `closeday_remote.dart` | الجلسة/إغلاق اليوم | `/pos/report/close-out`، `/pos/sessions`، `/pos/report/end-day` |
| `attendance_remote.dart` | الحضور | `/attendance/status`، `/attendance/clock-in`، `/attendance/clock-out` |
| `inventory_remote.dart` | مخزون الإدارة | `/inventory/*` |
| `menu_product_product_remote.dart` | منتجات القائمة الإدارة | `/pos/products/*` (إدارة) |
| `menu_product_category_remote.dart` | فئات القائمة الإدارة | `/pos/products/categories`، `/pos/categories` |
| `modifier_group_remote.dart` | مجموعات المعدلات الإدارة | `/pos/modifier-groups/*` |
| `shift_control_remote.dart` | تحكم الورديات | `/shifts/control/dashboard`، `/shifts/close` |
| `kds_control_remote.dart` | KDS | `/kds/dashboard`، `/kds/tickets/*` |
| `close_out_day_remote.dart` | إغلاق اليوم | `/close-out-day`، `/close-out-day/end-day` |
| `report_remote.dart` | التقارير | `/reports/pos-dashboard`، `/reports/z-report/*` |
| `admin_pincode_remote.dart` | PIN الإدارة | `/check/company/pin`، `/add/company/pin` |

---

## الملحق ب: قيم التعداد المشار إليها

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

*مستند تم إنشاؤه من تحليل كود Flutter في 2026-11-08*
*إجمالي نقاط نهاية API المفهرسة: 42*
*إجمالي نماذج البيانات المحللة: 35+*
*الوحدات المغطاة: 6 (المصادقة، POS/Kashier، الإدارة، المخزون، الحضور، KDS)*