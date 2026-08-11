# مهامي — تطبيق قوائم ومهام شخصي

تطبيق ويب بسيط (Vanilla JS، بدون خطوة بناء) مستوحى من بساطة Apple Reminders: واجهة داكنة، RTL كامل، Accent أصفر `#FFD60A`.

## التشغيل

```powershell
npx.cmd -y serve@14.2.3 -l 3000 .
```

ثم افتح http://localhost:3000 (ملاحظة: على هذا الجهاز يجب استخدام `npx.cmd` وليس `npx` بسبب سياسة تنفيذ PowerShell).

## البنية

- `index.html` — الهيكل، خط IBM Plex Sans Arabic، مكتبة Lucide Icons
- `css/style.css` — كل التصميم (Design tokens في `:root`)
- `js/constants.js` — الألوان، الأيقونات، حالات المهام
- `js/store.js` — طبقة البيانات الوحيدة (LocalStorage). لربط Supabase لاحقًا: استبدل هذا الملف فقط وحافظ على نفس الـ API
- `js/dnd.js` — إعادة ترتيب بالسحب (Pointer Events، يعمل لمسًا وبالفأرة)
- `js/app.js` — العرض والتوجيه (hash routing: `#/list/:id`) والتفاعلات

## البيانات

تُحفظ في LocalStorage تحت المفتاح `mytasks.v1` بالشكل:
`{ lists: [{id,title,icon,color,order,createdAt}], tasks: [{id,listId,title,status,order,createdAt,updatedAt}] }`

حالات المهمة: `not_started` | `in_progress` | `paused` | `completed`

## التحقق

`node --check` لكل ملفات js (يوجد `"type": "module"` في package.json).
اختبار منطق store سريع: شغّل node مع stub بسيط لـ localStorage (انظر تاريخ الجلسة).
