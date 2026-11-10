# دليل التشغيل — POS/ERP Backend (How It Works)

يشرح هذا الملف خطوات تشغيل النظام بشكل تفصيلي، من المتطلبات المسبقة حتى تشغيل السيرفر واختبار نقاط النهاية.

---

## المتطلبات المسبقة

قبل البدء، تأكد من توفر ما يلي على جهازك:

| المتطلب | الإصدار الموصى به | الغرض |
|----------|------------------|-------|
| Docker | أي إصدار حديث | تشغيل قاعدة بيانات PostgreSQL |
| Docker Compose | أي إصدار حديث | إدارة الحاويات |
| Node.js | 22+ | تشغيل السيرفر في وضع التطوير |
| npm | يأتي مع Node.js | إدارة الحزم |
| Postman (اختياري) | أي إصدار حديث | اختبار نقاط النهاية عبر ملف JSON |

---

## الطريقة الأولى: التشغيل عبر Docker (مستحسن للإنتاج)

هذه الطريقة تشغّل قاعدة البيانات والسيرفر معًا في حاويات Docker.

### الخطوة 1: الدخول إلى مجلد المشروع
```bash
cd D:\Job\pos-erp-backend
```

### الخطوة 2: تشغيل قاعدة البيانات والسيرفر
```bash
docker compose up -d --build
```

هذا الأمر سيقوم بـ:
- تحميل صورة PostgreSQL 16 وتشغيلها على المنفذ `5433`
- بناء صورة السيرفر من Dockerfile وتشغيلها على المنفذ `3000`
- إنشاء وحدة تخزين (volume) لبيانات قاعدة البيانات

### الخطوة 3: تشغيل الهجرات (Migrations)
بعد أن تصبح الحاويات شغالة، قم بتطبيق مخطط قاعدة البيانات:
```bash
npx prisma migrate deploy
```

### الخطوة 4: تشغيل بذرة البيانات (Seed)
لإضافة بيانات تجريبية (شركة، فرع، مستخدم admin، مستخدم cashier، منتج، جلسة):
```bash
npx tsx prisma/seed.ts
```

### الخطوة 5: التحقق من تشغيل السيرفر
افتح المتصفح أو أرسل طلب للتأكد من أن sirver يعمل:
```bash
curl http://localhost:3000/health
```
النتيجة المتوقعة: `{ "status": "ok" }` أو مشابه.

---

## الطريقة الثانية: التشغيل للتطوير المحلي (Local Development)

هذه الطريقة مناسبة للتعديل على الكود واختباره بسرعة مع إعادة تشغيل تلقائية.

### الخطوة 1: تشغيل قاعدة البيانات فقط
```bash
cd D:\Job\pos-erp-backend
docker compose up -d db
```

### الخطوة 2: تثبيت الحزم (إذا لم تكن مثبتة)
```bash
npm install
```

### الخطوة 3: تشغيل السيرفر في وضع التطوير
```bash
npm run dev
```

السيرفر سيعمل على `http://localhost:3000` مع إعادة تشغيل تلقائية عند إجراء أي تعديل على الكود (باستخدام tsx watch).

### الخطوة 4: تطبيق الهجرات والبذر
في نافذة Terminal منفصلة (مع بقاء السيرفر شغال):
```bash
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

---

## أوامر مفيدة

| الأمر | الغرض |
|-------|-------|
| `npm run dev` | تشغيل السيرفر في وضع التطوير (مع إعادة تشغيل تلقائية) |
| `npm run build` | بناء المشروع لإنتاج ملفات JavaScript في مجلد dist |
| `npm start` | تشغيل الإصدار المبني من السيرفر |
| `npm run typecheck` | فحص أنواع TypeScript للتأكد من عدم وجود أخطاء |
| `npm test` | تشغيل جميع اختبارات التكامل (66 اختبار) |
| `npm run db:seed` | تشغيل بذرة البيانات التجريبية |
| `npm run db:studio` | فتح Prisma Studio لمشاهدة وتعديل بيانات قاعدة البيانات بصرياً |
| `docker compose logs -f backend` | عرض سجلات السيرفر بشكل مباشر |
| `docker compose down -v` | إيقاف الحاويات وحذف بيانات قاعدة البيانات (احذر في الإنتاج) |

---

## بيانات الدخول التجريبية

بعد تشغيل البذر (seed)، يمكنك استخدام البيانات التالية لتسجيل الدخول:

| المستخدم | البريد الإلكتروني | كلمة المرور | الدور |
|---------|------------------|------------|-------|
| مدير النظام | `admin@demo.local` | `Admin123!` | owner |
| كاشير تجريبي | `cashier@demo.local` | `Cashier123!` | cashier |

الشركة التجريبية: **Sharqiya Restaurant**  
الفرع التجريبي: **الفرع الرئيسي**

---

## اختبار نقاط النهاية عبر Postman

يوجد ملف مجموعة Postman جاهز للتجربة في المسار التالي:
```
D:\Job\pos-erp-backend\postman\pos-erp.postman_collection.json
```

### خطوات الاستخدام:
1. افتح برنامج Postman
2. اضغط على زر **Import**
3. اختر الملف أعلاه
4. تأكد أن السيرفر يعمل (الطريقة الأولى أو الثانية أعلاه)
5. ابدأ بتنفيذ الطلبات بهذا الترتيب:
   - `POST /auth/login` — للحصول على التوكن (token)
   - استخدم التوكن في رأس `Authorization: Bearer <token>` للطلبات المتبقية
   - نفذ بقية الطلبات حسب الحاجة (منتجات، طلبات، جلسات، مخزون، إلخ)

---

## مثال على استخدام curl لتسجيل الدخول

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.local","password":"Admin123!"}'
```

النتيجة ستحتوي على `token` الذي يجب استخدامه في الطلبات التالية:

```bash
curl -X GET http://localhost:3000/pos/categories \
  -H "Authorization: Bearer <tokenn_hna>"
```

---

## ملفات الإعداد

### `.env`
يحتوي على متغيرات البيئة:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/pos_erp?schema=public"
JWT_SECRET="dev-secret-change-me"
JWT_EXPIRES_IN="30d"
PORT=3000
NODE_ENV=development
```

### `docker-compose.yml`
يحدد حاويتين:
- `db`: قاعدة بيانات PostgreSQL 16 على المنفذ 5433
- `backend`: السيرفر على المنفذ 3000، يعتمد على قاعدة البيانات

---

## ملخص سريع للتشغيل

```bash
# 1. دخول المجلد
cd D:\Job\pos-erp-backend

# 2. تشغيل عبر Docker
docker compose up -d --build

# 3. تطبيق الهجرات
npx prisma migrate deploy

# 4. تشغيل البذر
npx tsx prisma/seed.ts

# 5. التحقق من الصحة
curl http://localhost:3000/health
```

النظام الآن جاهز للاستخدام واختبار جميع نقاط النهاية.