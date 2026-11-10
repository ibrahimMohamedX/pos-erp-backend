# نشر وتشغيل متوازي — POS/ERP Backend

## النشر الأول (Production)
```bash
docker compose up -d --build
npx prisma migrate deploy
npx tsx prisma/seed.ts   # optional: بيانات تجريبية للشركة الأولى
```

## التشغيل المتوازي (Parallel Run)
1. شغّل الـ backend الجديد على نطاق فرعي: `api-new.poserp.local` (أو Docker port مختلف).
2. في Flutter `api_config.dart` أضف علم ميزة:
   ```dart
   static bool get useNewBackend => kReleaseMode
       ? const bool.fromEnvironment('USE_NEW_BACKEND')
       : true;
   ```
3. ابدأ بنسبة صغيرة من المستخدمين على الـ backend الجديد، والباقي على القديم.
4. قارن الاستجابات بين القديم والجديد لكل request (contract test) قبل التحويل الكامل.

## قائمة التحويل إلى الإنتاج (Cutover Checklist)
- [ ] 모든 الـ 40+ endpoint ترجع استجابات متوافقة مع Flutter
- [ ] تسجيل الدخول، PIN، انتهاء الجلسة يعملون دون تعديل في Flutter
- [ ] تدفق POS من الفئة إلى الدفع يكتمل end-to-end
- [ ] closing session / end-day يمنح أرقاماً متطابقة مع القديم
- [ ] تقارير المبيعات (Z-report) تطابق القديم ضمن 0.01%
- [ ] PDF الإيصالات/Z-report يُنشأ بشكل سليم
- [ ] الحضور (clock-in/out) يعمل
- [ ] تعديلات المخزون تنعكس بشكل صحيح
- [ ] عزل الشركات (multi-tenancy) يعمل — شركة لا ترى بيانات شركة أخرى
- [ ] اختبار الحمل: 1000 مستخدم متزامن، p99 < 500ms
- [ ] لا يوجد أخطاء حرجة في الـ staging لمدة أسبوعين
- [ ] خطة التراجع (rollback) مختبرة وموثقة
- [ ] نسخة احتياطية من قاعدة البيانات قبل التحويل للإنتاج

## أوامر مفيدة
```bash
docker compose logs -f backend      # سجلات السيرفر
docker compose exec backend npx prisma studio  # استعراض قاعدة البيانات
docker compose down -v              # إيقاف وحذف البيانات (احذر في الإنتاج)
```
