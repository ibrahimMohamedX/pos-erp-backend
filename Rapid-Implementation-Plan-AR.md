# خطة التنفيذ السريع — POS/ERP Backend (نسخة Kilo)

> الهدف: Backend متوافق 100% مع تطبيق Flutter الحالي، في **~10 أيام عمل** بدل 12 أسبوع، بدون التضحية بالصحة.
> المبدأ: ننفذ اللي التطبيق بيستخدمه فقط، ونأجل كل حاجة مش ضرورية الآن. الـ Domain core نظيف من جوه عشان يتعاد استخدامها في برامج تانية بعدين.

---

## 1) المكدس التقني (مختار للسرعة)

| المكوّن | الاختيار | ليه |
|---|---|---|
| Runtime | Node.js 22 + TypeScript | سرعة تطوير + أمان أنواع |
| Framework | **Fastify** + Zod | أسرع إعداد validation + routes |
| ORM | **Prisma** | migrations سريعة + type safety |
| DB | PostgreSQL 16 (Docker) | JSONB + علاقات |
| Dev runner | **tsx watch** | restart فوري بدون build |
| Tests | **Vitest** + docker postgres | integration tests حقيقية سريعة |
| Auth | JWT (access token 30 يوم) + bcrypt | التطبيق لا يعمل refresh — 401→logout |
| Uploads | ملفات محلية `/uploads` | S3 بعدين |
| PDF | **Puppeteer** (sidecar مرحلة أخيرة) | العربي/RTL مضمون |
| Logs | pino JSON | كفاية |
| CI | GitHub Actions: lint + test + build | بسيط |

## 2) ما تم حذفه من الخطة القديمة (وليه ده آمن)

| المحذوف | التبرير |
|---|---|
| Redis + BullMQ | لا توجد background jobs ضرورية للإطلاق؛ التقارير تُحسب عند الطلب |
| WebSocket/SSE | **التطبيق الحالي بيعمل polling** — الـ WS لن يستفيد منه أحد الآن (يُضاف لاحقاً لعملاء v2) |
| Pact / Playwright / k6 | استبدلت بـ integration tests لكل endpoint + contract fixtures |
| مراقبة Loki/Grafana/Jaeger/Blue-Green | logs + health endpoint + deploy واحد بـ docker compose، والتشغيل المتوازي على subdomain |
| Email/Password reset | غير موجود في Flutter أصلاً (13.3 بالخطة القديمة) |
| حقول users المهملة (plan, referral_code, messenger_color...) | قصّها — كود ميت |
| جدول daily_reports + session_summaries | تُحسب بـ SQL عند الطلب — لا denormalization مبكر |

## 3) قواعد غير قابلة للتفاوض (عشان "بدون أخطاء")

1. **Envelope متطابق**: `{data, meta?, status, message, totalCount?, error?}` + سلوك `data.data` المتداخل — Helper واحد `sendEnvelope()` يستخدمه الجميع.
2. **كل استعلام عليه `company_id` guard** — middleware يقرأ company من الـ JWT ويفرضها (Scope guard).
3. **الفلوس `DECIMAL(12,2)` والأزمنة `TIMESTAMPTZ` (UTC)**، والتحويل حسب `accept-timezone` عند العرض.
4. **كل عملية كتابة داخل Transaction**، وإنشاء الطلب عليه **Idempotency-Key** (unique على orders) ضد الشبكات الضعيفة.
5. **كل endpoint له integration test قبل إغلاق المرحلة** — المرحلة لا تُعتبر منتهية بدونها.
6. عقد الـ API هو المصدر: نفس الـ URLs والأسماء (حتى الغريبة زي POST بـ query params في الـ inventory).

## 4) مخطط القاعدة (تصحيحات على القديم)

- users: مقصوص + refresh_token في جدول منفصل `sessions` (rotation جاهز).
- إضافة `branches` (كانت مفقودة والمشار إليها في pos_sessions/shifts).
- `tax_rate` كنسبة على مستوى company (بدل hardcoded) — بدون جدول promotions الآن.
- `orders`: إضافة `idempotency_key UNIQUE` + `version INT` (optimistic locking).
- payments تبقى JSONB في v1 (ترقية لاحقة لجدول) — موثّقة كقرار مؤقت.
- indexes: `(company_id, status)`, `(company_id, pos_date)`, `(company_id, category_id)` على الجداول الساخنة.
- ربط المنتجات بالمخزون (BOM) → **خارج نطاق الإطلاق**، الموثّقة كـ backlog.

## 5) خطة الأيام (كل يوم ينتهي بـ tests خضرا + commit)

| يوم | النطاق | النهاية |
|---|---|---|
| **0** | Scaffold: Fastify+TS+Prisma+Docker compose، envelope helper، error handler، health، auth middleware، CI، Prisma schema كامل + migration أولى | `docker compose up` + health 200 + tests template |
| **1** | Auth: login/logout/PIN check+add، roles guard، companies + branches | fixtures envelope متطابقة |
| **2** | الكتالوج: categories CRUD، products CRUD + multipart images، preparation-stations، toggle-active، modifier-groups CRUD + linking | + integration tests |
| **3** | العملاء + بداية الطلبات: add-customer، send-to-kitchen (transaction + idempotency)، update-kitchen-order | |
| **4** | استكمال الطلبات: checkout، orders/status، GET /pos/orders بالفلاتر + pagination، optimistic locking | تدفق POS كامل end-to-end test |
| **5** | الجلسات: sessions، close-out report، end-day، cash drawer، payment breakdown | حسابات الجلسة من SQL مع tested rounding |
| **6** | المخزون: dashboard، items/categories/suppliers/units، adjustment، purchase-orders (بصيغة query params القديمة كما هي) | |
| **7** | KDS (polling): dashboard/tickets/action/bulk-action + ربطها بحالة order_items | |
| **8** | التقارير + الورديات + الحضور: salesReport، pos-dashboard، shifts control/close، close-out-day، attendance | مقارنة أرقام التقارير مع session summaries |
| **9** | PDF (Puppeteer sidecar) للـ z-report وreceipts + seed script + Postman collection | |
| **10** | تسليم: deploy docker، تشغيل متوازي على subdomain، checklist التحويل النهائي، مراجعة أمان (rate limit بسيط in-memory، helmet، CORS) | Flutter متصل بـ backend جديد ويعمل |

> بالتنفيذ المتوازي (subagents على وحدات مستقلة زي المخزون/الحضور/الكتالوج) المدة تنضغط لـ **~6-7 أيام**.

## 6) التوافق مع تطبيقات مستقبلية (بدون تكلفة الآن)

- الـ routes القديمة تعيش في `src/modules/legacy/` — مجرد adapters فوق services نظيفة في `src/modules/<domain>/services`.
- أي برنامج جديد يستخدم الـ services مباشرة أو نضيف `/api/v2` لاحقاً بنفس الـ services — بدون إعادة كتابة.
- multi-tenancy عبر `company_id` guard من اليوم الأول — لا refactor لاحق.

## 7) مخاطر متبقية (مختصرة)

| الخطر | المعالجة |
|---|---|
| شكل الاستجابات الدقيق مستنبط من كود Flutter وليس من backend حي | fixtures من أسماء الحقول في الـ models بالوثيقة + مرحلة تشغيل متوازٍ تكشف أي فرق |
| PDF عربي | Puppeteer يضمن RTL — مؤجل ليوم 9 بلا تأثير على باقي الوحدات |
| حسابات التقارير/التقريب | اختبارات rounding + مطابقة مع session summaries في يوم 8 |
