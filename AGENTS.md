# مهامي — نظام إنتاجية شخصي

تطبيق React + Vite + TypeScript: مهام يومية، أفكار (جدار ملوّن وإضافة بثانيتين)، مشاريع (قائمة/لوحة Kanban)، تقويم، وإحصائيات. (العادات انشالت من الواجهة؛ الجداول والـ API والـ store لسا موجودين.)
الهوية «ضباب»: وضع فاتح هادي، خلفية وsidebar رمادي مزرق `#e4eaf1` والصفحة لوحة بيضا عايمة (`.main`، وعالجوال `.page` ورقة بيضا بزوايا مدوّرة من فوق)، نص `#12161b` وأزرق `#2160b5` للتمييز، ووردي الأفكار `#EC4C9A`. كل صفحة إلها لون (`VIEWS` بـ `PageTitle.tsx`) بيلوّن أيقونتها بالـ sidebar وبالعنوان، وباقي الألوان من `--hue-*`. بدون تدرّجات أو توهّجات ملوّنة. في «قائمة جانبية بنفسجية» (`:root[data-theme="dark"]` بآخر `layout.css`): الـ sidebar والإطار حوالين الصفحة بس بيصيروا تدرّج بنفسجي (`#6a35f4` → `#8d68f7`) بكتابة وأيقونات بيضا، والصفحة البيضا بتضل زي ما هي. هاد الاستثناء الوحيد لقاعدة «بدون تدرّجات»، وطلبه المستخدم بصورة مرجعية. بينقلب من زر القمر بأسفل الـ sidebar وبالشريط العلوي عالجوال، وبينحفظ على الحساب (`users.theme`، v5، عبر `PATCH /api/account {theme}` من `toggleTheme` بـ `store.ts`) فبيضل ثابت على كل الأجهزة لحد ما المستخدم يغيّره، واختيار الحساب بيغلب عند كل تحميل. نسخة منه بـ localStorage (`mt:theme`، `src/lib/themeMode.ts`) بس عشان `index.html` يطبّقه قبل أول رسم. عشان يشتغل، الألوان لازم تكون tokens: ما في `#fff` ثابت بالخلفيات (استعمل `var(--surface)`). خط IBM Plex Sans Arabic، RTL كامل. الـ tokens في `src/styles/base.css`.

## الروابط

- الإنتاج: https://my-tasks-nine-nu.vercel.app
- GitHub: https://github.com/yazanaaa/my-tasks (أي push على `main` ينشر تلقائيًا؛ الفروع تأخذ Preview URL)
- قاعدة البيانات: Neon Postgres (مرتبطة عبر تكامل Vercel؛ `DATABASE_URL` في متغيرات بيئة المشروع)

## التشغيل محليًا

```powershell
npm.cmd install
npm.cmd run dev        # http://localhost:5173 — الواجهة + الـ API (api/*.js تعمل داخل Vite) + Neon
npm.cmd run build      # tsc ثم vite build إلى dist/
```

- على هذا الجهاز يجب استخدام `npm.cmd`/`npx.cmd` بدل `npm`/`npx` بسبب سياسة تنفيذ PowerShell.
- Windows Application Control يمنع ملف Rollup الأصلي (`.node`)، لذلك `package.json` فيه `overrides` يستبدل rollup بـ `@rollup/wasm-node`. لا تحذفه.
- متغيرات البيئة من `.env.local` (`npx.cmd vercel env pull`). الأدمن يُنشأ تلقائيًا من `ADMIN_EMAIL` (افتراضيًا yazanaboatieh@gmail.com) و`ADMIN_PASSWORD`.

## البنية

- `api/` — Vercel serverless functions (JS ESM). الملفات اللي تبدأ بـ `_` ليست routes.
  - `_lib/db.js` — اتصال Neon + إنشاء الجداول تلقائيًا في schema اسمه `mt` (منفصل عن جداول النسخة القديمة)
  - `_lib/crud.js` — `resource()` عام: POST/PATCH/DELETE مع تحقق من الحقول وملكية المراجع، ودعم الدفعات `{items:[…]}`
  - `bootstrap.js` (كل البيانات بطلب واحد)، `tasks.js`، `projects.js`، `sections.js`، `habits.js`، `habit-logs.js`، `ideas.js`، `daily-items.js`، `auth.js`، `account.js`، `users.js` (أدمن فقط)
- `src/store.ts` — Zustand: كل البيانات + الإجراءات، تحديث متفائل، والكتابات تمر عبر طابور تسلسلي (`lib/api.ts → enqueue`). إنشاء الأفكار يمر عبر outbox محلي (`flushOutbox`) فبيشتغل بدون نت.
- `src/lib/parse.ts` — الإضافة الذكية بالعربي: «بكرا الساعة 5 العصر #عمل @مشروع !!» (تواريخ، أوقات، تكرار، وسوم، مشروع، أولوية). **لا تُستخدم للأفكار.**
- `src/lib/dates.ts` — التواريخ كأيام محلية `YYYY-MM-DD`، أسماء الأشهر الشامية، الأسبوع يبدأ الأحد، حساب التكرار، `timeAgo` و`ideasLabel`
- `src/lib/selectors.ts` — مشتقات (عدّادات، سلاسل العادات، نسب الالتزام، `useIdeaList`، `useIdeaForTask`)
- `src/lib/ideas.ts` — دوال الأفكار البحتة: ألوان `IDEA_COLORS` والتدوير (`pickIdeaColor`)، `extractTags`، `splitIdea` (أول سطر = عنوان)، الفكرة اليومية `sparkFor`، `joinShared` للمشاركة، و`splitImport` للصق الجماعي
- `src/lib/outbox.ts` — localStorage (كله داخل try/catch): مسودات الإضافة `mt:idea-draft:<slot>` (ترجع كأفكار عند الفتح التالي)، وoutbox الأفكار لكل مستخدم `mt:idea-outbox:<userId>`، و`mt:last-user`
- `src/components/` — `Layout` (sidebar + tab bar للجوال)، `TaskRow`، `TaskDetail` (درج التفاصيل)، `QuickAdd`، `CommandPalette` (Ctrl+K)، `SortableGroups` (سحب وإفلات عبر الأقسام/الأعمدة)، `DatePicker`، `Forms`
  - `IdeaCapture` — شيت إضافة الفكرة (textarea فاضي، Enter يحفظ ويضل مفتوح، الإغلاق مع نص يحفظ) + `CaptureModeSwitch` (فكرة/مهمة، مستخدم كمان بـ `QuickAdd`)
  - `IdeaCard` — `IdeaCard` و`IdeaWall` (masonry ثابت: الجديد بأعلى عمود وما في كرت بينط) و`SparkCard` «فاكر هالفكرة؟» (بصفحة الأفكار وعلى Today)
  - `IdeaSheet` — تفاصيل الفكرة: تعديل النص، اللون، تثبيت/أرشفة/حذف، وتحويلها لمهمة أو مشروع
- `src/pages/` — Today، Daily، Upcoming، Inbox، Ideas، Projects، ProjectPage، Calendar، Stats، Settings، Login
- `src/styles/` — `base.css` (Design tokens في `:root`)، `layout.css`، `ui.css`، `tasks.css`، `pages.css`، `ideas.css` (الجدار والصفحة، و`--idea`)، `idea-sheets.css` (شيت الإضافة وشيت الفكرة). ألوان الأفكار ما بتنحط بأي ملف CSS تاني.

## البيانات (schema `mt`)

- `tasks: {id, projectId?, sectionId?, parentId?, title, notes, priority 0-3, dueDate?, dueTime?, recurrence?, tags[], completed, completedAt?, pinned, position}`
  - `pinned` (v4): المهمة المثبّتة بتطلع أول قائمتها (`byPinned`/`byAgenda`)، وعلى «اليوم» بقسم «مثبّتة» إذا ما إلها تاريخ أو تاريخها لقدّام. المهام الفرعية ما بتتثبّت.
- `projects: {id, name, description, color, icon, view: list|board, archived, position}` و `sections: {id, projectId, name, position}`
- `habits: {id, name, color, icon, days[0-6], archived, position}` و `habit_logs: {habitId, date}`
- `daily_items: {id, title ≤ 300, checkedAt?, position}` (v6) — قائمة «يومية» (`/daily`، `pages/Daily.tsx`): البند مشطوب إذا `checkedAt` بعد آخر 5 الصبح بالتوقيت المحلي (`dailyBoundary` بـ `lib/dates.ts`، بينحسب عند العميل)، فالإعادة اليومية ما بدها أي كتابة بالقاعدة. زر «إعادة» (`resetDaily`) بيمسح `checkedAt` للمشطوبين مع تراجع. لصق كم سطر بيضيف كل سطر كبند.
- `ideas: {id, text ≤ 4000, tags[], color, pinned, archived, source: app|palette|share|link|draft|import, taskId?, projectId?, convertedAt?, surfacedAt?, createdAt, updatedAt}`
  - النص كما انكتب، وأول سطر غير فاضي هو العنوان. الوسوم مشتقة من `#وسم` جوّا النص (ما بتنعدّل لحالها).
  - اللون تلقائي: هاش أول وسم، وإلا اللون التالي بالتدوير. ما في تاريخ أو أولوية أو ترتيب يدوي للأفكار.
  - `taskId`/`projectId` بدون FK عن قصد (التراجع عن حذف المهمة بيرجّع الربط)، بس `t.ref` بيتحقق من الملكية عند الكتابة.
  - الإنشاء idempotent (`ON CONFLICT (id) DO NOTHING`) والعميل يبعت `createdAt`، فإعادة المحاولة من الـ outbox آمنة.
  - `bootstrap` يرجّع الأفكار الحية والمحوّلة والمؤرشفة اللي تعدّلت آخر 400 يوم، الأحدث أولًا.
- التكرار: `daily | weekdays | weekly | monthly | yearly | every:N:day|week|month | days:0,3`. عند إنجاز مهمة متكررة تبقى كسجل وتُنشأ نسخة بالموعد التالي.
- الترتيب بـ `position` كسري (منتصف الجارين عند السحب). السحب شغّال بالوارد والمشاريع والقادم و«لليوم». بالصفحات المرتبطة بتاريخ (`byAgenda`): المثبّتة أول، بعدين اللي إلها وقت حسب الوقت، وبعدين ترتيب السحب. الأولوية ما بتغيّر الترتيب (بتبيّن بلون الدائرة).
- `SCHEMA_VERSION` في `_lib/db.js` هلأ `'6'`. (v3 انكتب بالقاعدة قبل ما تنضاف جملة `pinned`، فـ v4 بيعيدها.) ارفع الرقم وضيف الجمل بنفس التعديل، لأنه `npm run dev` بيشغّل الـ migration على قاعدة الإنتاج أول ما ينحفظ الملف. **أي تغيير بالـ schema لازم يرفعه**، وإلا `migrate()` بيرجع بدري على القواعد الموجودة. المقارنة رقمية (`>=`) فالنشر الأقدم ما بيعيد الـ migration فوق schema أحدث. كل جملة `IF NOT EXISTS`، والجمل الجديدة قبل `INSERT INTO mt.meta`.

## الاختصارات والروابط

- `Q`/`ض`/`N` مهمة جديدة · `I`/`ه` فكرة جديدة (نفس المفتاح، `e.code === 'KeyI'`) · `/` بحث · Ctrl+K بحث وأوامر، ومع نص بيعرض «احفظ «…» كفكرة» · Alt+1…8 التنقل (7 = الأفكار، 8 = المهام اليومية، و5 فاضي بعد ما انشالت العادات) · Esc إغلاق
- سطح المكتب: زر اللمبة بالـ sidebar بين «مهمة جديدة» والبحث. الجوال: `.dock` عايم تحت، فيه كبسولة تبويبات أيقونات بس (`aria-label` لكل وحدة، والمفتوح بلون صفحته) وجنبها الـ FAB الوردي اللي بيفتح فكرة جديدة. تبويب «الأفكار» بالنص («المهام السريعة» و«المهام اليومية» تحت «المزيد»).
- الروابط بتعبّي الشيت بس، **ما بتحفظ شي** لحالها، وبعدين الـ params بتنشال من الـ URL:
  - `/<أي صفحة>?new=1` شيت فكرة فاضي، و`?new=<نص>` (مثلًا `/ideas?new=…`) بيعبّيه
  - `/?add=1` إضافة مهمة
  - `/ideas/share?title&text&url` هدف المشاركة بالـ PWA (`share_target` بـ GET)
- اختصارات الـ manifest: «فكرة جديدة» → `/ideas?new=1`، «مهمة جديدة» → `/?add=1` (أندرويد وتطبيق Chrome/Edge المثبّت؛ iOS بيتجاهلهم).

## التحقق

- `npm.cmd run build` (يشمل `tsc`) و `node --check api/*.js api/_lib/*.js`
- اختبار الـ API: `Invoke-RestMethod` على `https://my-tasks-nine-nu.vercel.app/api/auth`
