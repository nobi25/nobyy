# نوبي & Noby — منصة نشر وقراءة مستقلة

مشروع Node.js / Express / SQLite بهوية عربية RTL، واجهة عامة متجاوبة، لوحة إدارة، أدوار إشراف، إدارة محتوى وتصنيفات قابلة للتوسع، صندوق بلاغات، فلترة أولية للتعليقات، سوق نقاط، إعدادات، وسجل تدقيق.

## التشغيل المحلي

يتطلب Node.js 20+.

```bash
cp .env.example .env
# عدّل ADMIN_EMAIL و ADMIN_PASSWORD و SESSION_SECRET قبل التشغيل
npm install
npm start
```

- الموقع: `http://localhost:3000`
- لوحة الإدارة: `http://localhost:3000/admin.html`
- فحص الصحة: `http://localhost:3000/api/health`

حساب المالك ينشأ عند أول تشغيل فقط إذا كان `ADMIN_EMAIL` و`ADMIN_PASSWORD` محددين ولم يكن البريد مسجلًا. استخدم كلمة مرور طويلة وفريدة، ثم احذفها من البيئة أو غيّرها بإجراء إدارة آمن قبل نشر الموقع. لا تستخدم بيانات المثال في الإنتاج.

## الفحص والاختبار

```bash
npm run check
npm run test
```

يفحص `check` صحة صياغة ملفات JavaScript، بينما يختبر `test` نقاط الصحة والموقع والمكتبة والسوق بعد تشغيل الخادم.

## Docker

```bash
cp .env.example .env
# اضبط أسرار الإنتاج أولًا
docker compose up -d --build
```

قاعدة البيانات تحفظ في volume `noby_data`. احتفظ بنسخ احتياطية مشفرة واختبر الاستعادة دوريًا.

## صلاحيات المنصة

- `reader`: قارئ عادي.
- `junior-moderator`: مراجعة البلاغات والتعليقات.
- `moderator`: إشراف المستخدمين والنقاط.
- `editor`: إدارة الأعمال والفصول والتصنيفات والسوق.
- `admin`: إعدادات المنصة وسجل التدقيق والإعلانات.
- `owner`: كامل الصلاحيات، وترقية المالك محصورة بالمالك الحالي.

## نشر المحتوى والترخيص

يطلب نموذج العمل رابط ترخيص وتأكيدًا صريحًا بأن الإذن يغطي النشر وأي ترجمة أو تعديل مطلوب. هذه الحقول ليست بديلًا عن التحقق القانوني: احتفظ بنسخة من الاتفاق، والنطاق الجغرافي، والمدة، وحقوق الصور والترجمة، وشروط إعادة النشر. لا تستورد من مصدر لم يمنح إذنًا واضحًا. العامل الآلي يقبل JSON manifest من مضيف HTTPS موجود في `INGEST_ALLOWLIST` فقط، ولا يحاول تجاوز تسجيل الدخول أو paywall أو وسائل مكافحة البوتات، ولا يتبع التحويلات.

### مثال manifest مصرح به

```json
{
  "title": "عمل مرخص تجريبي",
  "kind": "manhwa",
  "synopsis": "وصف معتمد",
  "chapters": [
    {"chapter_no":"1","title":"البداية","pages":["https://licensed-source.example/page-1.jpg","https://licensed-source.example/page-2.jpg"],"text_ar":"نص عربي معتمد اختياري"}
  ]
}
```

شغّل العامل يدويًا فقط بعد التحقق من الإذن:

```bash
node worker/pipeline.js --url https://licensed-source.example/manifest.json --license-confirmed --license-url https://licensed-source.example/license
```

العامل يضيف الأعمال والفصول كمسودات غير منشورة. يجب أن تراجع المحتوى ثم تنشره من لوحة الإدارة. الصفحات روابط HTTPS ولا تُنسخ إلى خادم نوبي. الترجمة الآلية/OCR ليست موصولة افتراضيًا، ولا ينبغي توليد أو نشر ترجمة إلا إذا شمل الإذن ذلك.


## المعالج الآلي للترجمة والتبييض وحقوق نوبي

أضفنا عامل `worker/auto-localizer.js` لمعالجة صور الفصول المصرّح بها: يرسل الصورة إلى مزود رؤية متوافق لاستخراج النص وترجمته، يبيض مناطق فقاعات الحوار المكتشفة، يركّب النص العربي وعلامة `Noby • نوبي`، ثم يحدّث رابط الصفحة في الفصل داخل قاعدة البيانات. يحتاج ImageMagick (موجود في Dockerfile) ومزود رؤية/ترجمة مدفوع أو مستضاف ذاتيًا يدعم واجهة OpenAI-compatible. لا توجد خدمة خارجية أو ترجمة تعمل قبل ضبط مفاتيحك.

ضع في `.env` قيم `OPENAI_API_KEY` و`OPENAI_API_BASE` و`NOBY_VISION_MODEL`، ولا تضع المفتاح في الواجهة الأمامية أو المستودع. يجب أن يكون مضيف الصور ورابط الترخيص ضمن `INGEST_ALLOWLIST` وأن يغطي التصريح صراحةً الترجمة والتعديل والتوزيع. العامل لا يتجاوز تسجيل الدخول أو الحجب أو أنظمة مكافحة البوتات، ولا يقرر قانونية المصدر بنفسه.

مثال `licensed-job.json` (استبدل كل القيم بمصدر حقيقي مصرح به):

```json
{
  "work_slug": "licensed-demo",
  "license_url": "https://licensed-source.example/license",
  "target_language": "Arabic",
  "watermark": "Noby • نوبي",
  "pages": [
    {"chapter_no": "1", "page_index": 0, "url": "https://licensed-source.example/page-1.jpg"}
  ]
}
```

شغّل بعد تثبيت المتطلبات والتأكد من الترخيص: `npm run localize -- --manifest ./licensed-job.json --license-confirmed`. `page_index` يبدأ من صفر ويشير إلى ترتيب الصورة في `pages_json` للفصل الموجود مسبقًا. كل صورة تنجح معالجتها تُحفظ في `public/generated` وتستبدل رابطها برابط محلي. افحص النتيجة بصريًا قبل النشر؛ OCR والتبييض قد يخطئان في النصوص المتداخلة والمؤثرات الصوتية والخلفيات المعقدة، ولا تعتبر العلامة المائية وحدها حماية من إعادة النسخ.

**التشغيل التلقائي:** شغّل `npm run worker:daemon` في عملية منفصلة (أو كخدمة Docker/PM2). يراقب `data/jobs/` ويعالج ملفات JSON بالتتابع، ثم ينقل الناجح إلى `data/jobs/completed/` والفاشل إلى `data/jobs/failed/`. لا تضع ملفات إلا بعد مراجعة الترخيص، واحمِ مجلد الطوابير من الكتابة العامة، وراقب الإنفاق ومخرجات السجل. العامل ذاتي التنفيذ بعد وضع المهمة، لكنه لا يكتشف مصادر عشوائية ولا يقرر وجود الترخيص نيابةً عنك.

## حدود النسخة وما يلزم قبل الإنتاج

هذه قاعدة تشغيل قابلة للتطوير وليست شهادة أمنية أو نسخة إنتاجية مكتملة. قبل فتحها للعامة: أضف تحقق بريد وإعادة تعيين كلمة مرور عبر SMTP، CSRF tokens لجميع عمليات تغيير الحالة، MFA للمشرفين، تخزين صور مدعومًا ومضادًا للبرمجيات الخبيثة، ترقيم صفحات، اختبار صلاحيات شامل، سياسة خصوصية وشروط استخدام وإجراءات بلاغات حقوق النشر، نسخًا احتياطية واختبارات استعادة، ومراقبة مركزية. استخدم HTTPS وWAF/CDN مثل Cloudflare، وتحديات bot management عند الحاجة. لا تحاول حظر كل VPN بشكل أعمى؛ ذلك يسبب حجب مستخدمين شرعيين ولا يمنع الهجمات وحده.

الفلترة اللفظية الحالية مثال أولي يحتاج مراجعة عربية مستمرة؛ لا تعتمد عليها وحدها لحماية المجتمع. علامة الماء مضبوطة في الإعدادات لكنها لا تُركّب تلقائيًا على الصور الخارجية في هذه النسخة. يجب إنشاء خدمة معالجة صور مرخصة (مثل Sharp) تضيف العلامة فعليًا إلى الملفات التي تملك حق تعديلها قبل تقديمها.

## النسخ الاحتياطي

أوقف الكتابة أو خذ نسخة باستخدام SQLite backup API، ولا تنسخ ملف قاعدة بيانات حيًا وحده دون فهم WAL. احتفظ بنسخة خارج الخادم واختبر الاستعادة دوريًا.


## Noby 3.0 hardening notes

- The maintenance switch now returns HTTP 503 from public content APIs while keeping health/site/session and admin APIs reachable. Protect the admin routes with strong credentials and HTTPS.
- Reports and comments have separate rate limits; comment targets must reference a published work or chapter.
- Only the owner can grant or change admin/owner-level roles. A user cannot change their own role.
- Shop purchases now atomically deduct points, create the transaction ledger entry, and record item ownership; duplicate purchases are rejected.
- Added an authenticated password-change endpoint requiring the current password and a 14-character minimum new password.
- The importer validates each page URL against the HTTPS hostname allowlist and DNS public-address checks. The image localizer verifies the job's license URL matches the license recorded for the work and handles PNG/WebP input MIME correctly.
- Docker Compose now persists generated images and runs the optional localization worker as a separate service. Put only reviewed publisher-authorized JSON manifests in `data/jobs/`; set `INGEST_ALLOWLIST` to exact trusted hosts.
- `npm run check` verifies JavaScript syntax. `npm test` launches a temporary local server and runs API smoke tests, but requires `npm ci` to have completed successfully first.

### Important production limits

No software can promise perfect protection against all bots, VPNs, piracy, or account abuse. VPN detection needs a maintained IP reputation provider and creates false positives; this release uses rate limiting and network restrictions rather than claiming to identify every VPN. The translation/white-cleaning pipeline requires a configured compatible vision provider and ImageMagick, and generated pages need human review before publishing. A URL allowlist plus a checkbox is not legal proof by itself: verify the license explicitly permits reproduction, modification, translation, and distribution, and retain the publisher's written authorization.


## ملاحظات التحقق الأخيرة

عامل المعالجة يدعم ImageMagick 7 عبر `magick` وImageMagick 6 عبر `convert`، ويمكن تحديد الأداة صراحة عبر `NOBY_IMAGE_TOOL`. الناتج يضيف الآن شارة حقوق مرئية تتضمن ختم N وشعار `NOBY`، ويمكن تمرير `watermark_url` داخل المهمة أو `NOBY_WATERMARK_URL` لإظهار رابط العلامة مع الحقوق. لا يبدأ OCR والترجمة إلا بعد وجود `OPENAI_API_KEY` و`OPENAI_API_BASE` ومضيف صورة مرخص في `INGEST_ALLOWLIST`، وأي نقص يوقف المهمة بدل إنتاج نتيجة ناقصة أو نشرها.
