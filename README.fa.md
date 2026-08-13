<a id="top"></a>

<div align="center" dir="rtl">

<a href="README.md"><img src="docs/assets/badge-en.svg" alt="English" height="22"/></a>&nbsp;
<a href="README.fa.md"><img src="docs/assets/badge-fa.svg" alt="فارسی" height="22"/></a>

<h1>Soft98 Pro</h1>

[![آخرین نسخه](https://img.shields.io/github/v/release/DRSDavidSoft/soft98-pro?style=for-the-badge&color=3b82f6&labelColor=0f172a&label=آخرین+نسخه)](https://github.com/DRSDavidSoft/soft98-pro/releases/latest)
[![ستاره‌ها](https://img.shields.io/github/stars/DRSDavidSoft/soft98-pro?style=for-the-badge&color=f59e0b&labelColor=0f172a)](https://github.com/DRSDavidSoft/soft98-pro/stargazers)

</div>

<div dir="rtl">

<a id="screenshot"></a>

## تصویر نمونه

![نمای حالت تاریک Soft98 Pro روی وب‌سایت Soft98](docs/assets/soft98-pro-dark.png)

Soft98 Pro با مسدودسازی مقاوم تبلیغات، اصلاح کد ضدادبلاک، بازیابی لینک دانلود، پاک‌سازی هشدارها و یک رابط تاریک مدرن، تجربه کار با Soft98 را بهتر می‌کند. این پروژه به‌صورت یوزراسکریپت و افزونه مرورگر برای Chrome، Edge و Firefox ارائه می‌شود.

هر دو قالب از هسته مشترک [`src/runtime.js`](src/runtime.js) ساخته می‌شوند؛ بنابراین رفتار مسدودسازی، ابزارهای تشخیص، بومی‌سازی، پوسته، فاویکون وضعیت و بازیابی لینک در آن‌ها هماهنگ می‌ماند.

<a id="contents"></a>

## فهرست مطالب

- [تصویر نمونه](#screenshot)
- [قابلیت‌ها](#features)
- [نشان تجاری همراه بسته](#bundled-branding)
- [شروع کار](#getting-started)
  - [راه‌اندازی یوزراسکریپت](#userscript-quick-start)
  - [راه‌اندازی افزونه مرورگر](#extension-quick-start)
- [انتخاب قالب](#choose-a-format)
  - [مشخصات یوزراسکریپت](#userscript-profile)
  - [مشخصات افزونه مرورگر](#extension-profile)
- [به‌روزرسانی‌ها](#updates)
- [بومی‌سازی](#localization)
- [ساخت از سورس](#build-from-source)
- [CI/CD](#cicd)
- [ابزارهای تشخیص](#diagnostics)
- [مستندات](#documentation)

<a id="features"></a>

## قابلیت‌ها

- **مسدودسازی تبلیغات:** شناسایی و حذف سطوح تبلیغاتی با تحلیل منبع، شکل، اندازه، ساختار و رفتار لینک.
- **محافظت در برابر ضدادبلاک:** اصلاح کد فشرده Soft98 پیش از آن‌که منطق تشخیص شکننده به صفحه آسیب بزند.
- **بازیابی لینک دانلود:** حفظ و بازگردانی لینک‌هایی که اسکریپت‌های صفحه تلاش می‌کنند غیرفعال کنند.
- **پاک‌سازی هشدارها:** حذف اعلان‌های مزاحم Soft98 و مسدودکننده‌های شخص ثالث بدون دست‌زدن به متن مقاله.
- **سازگاری با فهرست‌های فیلتر:** افزونه هشدارهای pseudo-element در سطح USER را با قانونی دقیق‌تر در همان سطح خنثی می‌کند و CI قوانین فعلی Soft98 در PersianBlocker را زیر نظر دارد.
- **ترمیم نشان:** انتساب‌های مخرب با نشان محلی‌سازی‌شده Soft98 Pro و ظاهر هماهنگ با پوسته جایگزین می‌شوند؛ تشخیص به classهای تصادفی وابسته نیست.
- **طراحی تاریک:** فعال‌سازی یک تجربه خواندن تاریک و مدرن به‌صورت پیش‌فرض.
- **رابط دوزبانه:** استفاده از فارسی هنگامی که زبان مرورگر `fa` یا منطقه زمانی `Asia/Tehran` باشد و انگلیسی در سایر شرایط.
- **فاویکون وضعیت:** تولید فاویکون با Canvas برای نمایش وضعیت فعلی محافظت.

<a id="bundled-branding"></a>

## نشان تجاری همراه بسته

- [لوگوی صفحات روشن](docs/assets/soft98-pro-logo-light.png)
- [لوگوی دزد دریایی پوسته Pro](docs/assets/soft98-pro-logo-dark.png) با شعار `یکی از تبلیغ‌دار ترین مراجع نرم‌افزاری ایران`

هر دو تصویر هنگام build به Data URL داخلی تبدیل می‌شوند. runtime پس از پاک‌سازی موفق، لوگوی زنده سایت را با روش‌های ابتکاری پیدا می‌کند و بدون وابستگی به selectorهای تصادفی یا دریافت فایل خارجی، نسخه متناسب با پوسته را نمایش می‌دهد.

<a id="getting-started"></a>

## شروع کار

یکی از مسیرهای نصب زیر را انتخاب کنید. یوزراسکریپت کوتاه‌ترین راه‌اندازی را دارد و افزونه، یکپارچگی کامل‌تری با مرورگر فراهم می‌کند.

<a id="userscript-quick-start"></a>

### یوزراسکریپت

1. برای Chrome یا Edge، [Tampermonkey](https://tampermonkey.net) و برای Firefox، [Violentmonkey](https://violentmonkey.github.io) را نصب کنید.
2. فایل [`soft98-pro.user.js`](https://github.com/DRSDavidSoft/soft98-pro/raw/main/soft98-pro.user.js) را نصب کنید.
3. درخواست نصب را در مدیر یوزراسکریپت تأیید کنید.
4. [soft98.ir](https://soft98.ir) را باز کنید.

[![نصب یوزراسکریپت](https://img.shields.io/badge/نصب_یوزراسکریپت-کلیک_کنید-3b82f6?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://github.com/DRSDavidSoft/soft98-pro/raw/main/soft98-pro.user.js)

<a id="extension-quick-start"></a>

### افزونه مرورگر

1. فایل ZIP مناسب را از [آخرین نسخه](https://github.com/DRSDavidSoft/soft98-pro/releases/latest) دریافت کنید.
2. آرشیو را استخراج کنید.
3. مراحل مربوط به مرورگر خود را انجام دهید.

#### Chrome یا Edge

1. `chrome://extensions` یا `edge://extensions` را باز کنید.
2. **Developer mode** را فعال کنید.
3. **Load unpacked** را انتخاب کنید.
4. پوشه Chromium استخراج‌شده را انتخاب کنید.

#### Firefox

1. `about:debugging#/runtime/this-firefox` را باز کنید.
2. **Load Temporary Add-on** را انتخاب کنید.
3. فایل `manifest.json` را از پوشه Firefox استخراج‌شده انتخاب کنید.

برای نام بسته‌ها، جزئیات هر مرورگر و رفع اشکال، [راهنمای کامل نصب](docs/wiki/fa/Installation.md) را ببینید.

<a id="choose-a-format"></a>

## انتخاب قالب

<a id="userscript-profile"></a>

### یوزراسکریپت

- **مناسب برای:** راه‌اندازی سریع، بررسی مستقیم سورس و کاربرانی که از قبل مدیر یوزراسکریپت دارند.
- **نصب:** یک فایل JavaScript که معمولاً در کمتر از یک دقیقه آماده می‌شود.
- **به‌روزرسانی:** توسط مدیر یوزراسکریپت انجام می‌شود.
- **محدودیت:** زمان تزریق و رفتار در محیط صفحه به مدیر اسکریپت و مرورگر وابسته است.

<a id="extension-profile"></a>

### افزونه مرورگر

- **مناسب برای:** استفاده روزانه، تنظیمات بیشتر، ذخیره‌سازی مرورگر و یکپارچگی قابل‌پیش‌بینی‌تر.
- **نصب:** بسته unpacked مخصوص Chromium یا Firefox از آخرین نسخه.
- **به‌روزرسانی:** با نصب بسته نسخه جدید پس از انتشار.
- **مزیت:** رابط اختصاصی، ذخیره‌سازی پایدار مرورگر و مسیرهای تزریق مخصوص هر مرورگر.

هر دو قالب از کد محافظتی یکسان استفاده می‌کنند. پیش از انتخاب، [مقایسه کامل یوزراسکریپت و افزونه](docs/wiki/fa/Userscript-vs-Extension.md) را بخوانید.

<a id="updates"></a>

## به‌روزرسانی‌ها

- مدیر یوزراسکریپت نسخه‌های جدید را از `releases/latest/download/soft98-pro.user.js` و از طریق `@updateURL` و `@downloadURL` دریافت می‌کند.
- افزونه هنگام نصب، شروع مرورگر و هر شش ساعت نسخه جدید را بررسی می‌کند. ابتدا `latest.json` و برای نسخه‌های قدیمی‌تر API انتشارهای GitHub را به‌کار می‌گیرد و سپس به بسته مناسب Chromium یا Firefox پیوند می‌دهد.
- افزونه unpacked میزبانی‌شده در GitHub به‌دلیل سیاست مرورگر نمی‌تواند بی‌صدا خودش را جایگزین کند؛ این قابلیت به فروشگاه یا کانال امضاشده نیاز دارد.

هشدار فعلی PersianBlocker با قانون `html::after` در سطح USER تزریق می‌شود. افزونه می‌تواند آن را در همان سطح CSS به‌طور مطمئن خنثی کند. یوزراسکریپت همچنان اعلان‌های عادی DOM را حذف می‌کند، اما مدیر یوزراسکریپت نمی‌تواند از stylesheet سطح USER یک افزونه دیگر اولویت بالاتری بگیرد؛ هنگام فعال‌بودن این فهرست از افزونه Soft98 Pro استفاده کنید.

<a id="localization"></a>

## بومی‌سازی

تمام متن‌های انگلیسی و فارسی runtime، تنظیمات، ابزارهای تشخیص، taunt و به‌روزرسانی در [`src/messages.json`](src/messages.json) نگهداری می‌شود. build یکسان‌بودن کلیدهای دو زبان را بررسی و کاتالوگ را داخل تمام خروجی‌ها قرار می‌دهد؛ بنابراین ترجمه‌ها هنگام اجرا دریافت نمی‌شوند.

<a id="build-from-source"></a>

## ساخت از سورس

```bash
git clone https://github.com/DRSDavidSoft/soft98-pro.git
cd soft98-pro
npm ci
npm run ci
```

برای ساخت اسکرین‌شات تازه از سایت زنده:

```bash
npm run screenshot
```

### خروجی‌های ساخت

- [`soft98-pro.user.js`](soft98-pro.user.js): یوزراسکریپت اصلی برای نصب مستقیم از GitHub.
- `dist/userscript/soft98-pro.user.js`: نسخه انتشار یوزراسکریپت.
- `dist/chromium/`: ساخت Manifest V3 برای Chrome و Edge.
- `dist/firefox/`: ساخت Firefox با پل runtime صفحه.
- `dist/packages/*.zip`: آرشیوهای آماده نصب و انتشار.
- `dist/release/latest.json`: متادیتای ماشینی به‌روزرسانی و لینک مستقیم بسته‌ها.
- `dist/release/SHA256SUMS.txt`: checksumهای SHA-256 تمام فایل‌های انتشار.
- [`docs/assets/soft98-pro-dark.png`](docs/assets/soft98-pro-dark.png): اسکرین‌شات ساخته‌شده از هارنس زنده Soft98.

<a id="cicd"></a>

## CI/CD

- workflow مربوط به **Soft98 Pro CI** تمام خروجی‌ها را می‌سازد، آزمون مرورگر و تکرارپذیری بسته‌ها را اجرا می‌کند، وابستگی‌ها را بررسی و artifactها را بارگذاری می‌کند.
- workflow مربوط به **Soft98 Pro Release** تطابق tag و نسخه را بررسی، منشأ artifactها را ثبت و فایل‌های انتشار، متادیتا و checksumها را در GitHub Releases منتشر می‌کند.
- هر دو workflow خلاصه مرحله‌ای برندشده همراه با جزئیات artifact و نتیجه اعتبارسنجی می‌سازند.

<a id="diagnostics"></a>

## ابزارهای تشخیص

در یکی از صفحات Soft98، ابزار DevTools را باز کنید و از API عمومی زیر استفاده کنید:

```js
window.Soft98AdBlocker.report()
window.Soft98AdBlocker.trapCheck()
window.Soft98AdBlocker.resetHandles()
window.Soft98AdBlocker.events
window.Soft98AdBlocker.stats
```

نام مستعار `window.Soft98Pro` نیز در دسترس است. برای نمونه‌ها و تفسیر خروجی‌ها، [راهنمای ابزارهای تشخیص](docs/wiki/fa/Diagnostics.md) را ببینید.

<a id="documentation"></a>

## مستندات

- [خانه ویکی](docs/wiki/fa/Home.md): نمای کلی و مسیرهای مستندات.
- [نصب](docs/wiki/fa/Installation.md): نصب در تمام مرورگرهای پشتیبانی‌شده.
- [یوزراسکریپت در برابر افزونه](docs/wiki/fa/Userscript-vs-Extension.md): مقایسه کامل دو قالب.
- [ابزارهای تشخیص](docs/wiki/fa/Diagnostics.md): ابزارهای کنسول و رفع اشکال.
- [توسعه](docs/wiki/fa/Development.md): فرایند ساخت، تست و مشارکت.
- [README انگلیسی](README.md): نسخه کامل انگلیسی این سند.

---

</div>

<div align="center" dir="rtl">

Soft98 Pro · یوزراسکریپت و افزونه مرورگر

[بازگشت به بالا](#top)

</div>
