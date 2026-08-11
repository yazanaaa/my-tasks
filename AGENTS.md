# مهامي — تطبيق قوائم ومهام شخصي

تطبيق ويب بسيط (Vanilla JS، بدون خطوة بناء) مستوحى من بساطة Apple Reminders: واجهة داكنة، RTL كامل، Accent أصفر `#FFD60A`.

## الروابط

- الإنتاج: https://my-tasks-nine-nu.vercel.app
- GitHub: https://github.com/yazanaaa/my-tasks (أي push على `main` ينشر تلقائيًا)
- قاعدة البيانات: Neon Postgres (مرتبطة عبر تكامل Vercel؛ `DATABASE_URL` في متغيرات بيئة المشروع)

## التشغيل محليًا

```powershell
npx.cmd -y serve@14.2.3 -l 3000 .   # واجهة فقط (LocalStorage fallback)
npx.cmd vercel dev                   # مع الـ API + Neon
```

ملاحظة: على هذا الجهاز يجب استخدام `npx.cmd` وليس `npx` بسبب سياسة تنفيذ PowerShell.
لسحب متغيرات البيئة محليًا: `npx.cmd vercel env pull`

## البنية

- `index.html` — الهيكل، خط IBM Plex Sans Arabic، مكتبة Lucide Icons
- `css/style.css` — كل التصميم (Design tokens في `:root`)
- `js/constants.js` — الألوان، الأيقونات، حالات المهام
- `js/store.js` — طبقة البيانات الوحيدة: ترسل لـ `/api/*` وتعمل optimistically، وترجع لـ LocalStorage إذا تعذر الوصول للـ API
- `js/dnd.js` — إعادة ترتيب بالسحب (Pointer Events، يعمل لمسًا وبالفأرة)
- `js/app.js` — العرض والتوجيه (hash routing: `#/list/:id`) والتفاعلات
- `api/_db.js` — اتصال Neon + إنشاء الجداول تلقائيًا عند أول طلب
- `api/lists.js`, `api/tasks.js` — Vercel serverless functions (GET/POST/PATCH/DELETE + reorder/reset)

## البيانات

شكل الكائنات: `lists: {id,title,icon,color,recurring,pinned,order,createdAt}` و `tasks: {id,listId,title,status,order,createdAt,updatedAt}`
حالات المهمة: `not_started` | `in_progress` | `paused` | `completed`
النسخة المحلية الاحتياطية في LocalStorage تحت المفتاح `mytasks.v1`.

## التحقق

`node --check` لكل ملفات js (يوجد `"type": "module"` في package.json).
اختبار الـ API مباشرة: `Invoke-RestMethod` على `https://my-tasks-nine-nu.vercel.app/api/lists`.

