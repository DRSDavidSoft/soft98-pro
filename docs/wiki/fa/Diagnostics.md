<div align="center">

<a href="../Diagnostics.md"><img src="../../assets/badge-en.svg" alt="English" height="22"/></a>&nbsp;
<a href="Diagnostics.md"><img src="../../assets/badge-fa.svg" alt="فارسی" height="22"/></a>

</div>

---

<div dir="rtl">

# 🕵️ ابزارهای تشخیص

بخش Soft98 Pro ابزارهای تشخیصی کنسول را زمانی که شرایط صفحه اجازه دهد، در دسترس قرار می‌دهد.

## دستورات مفید

در هر صفحه‌ای از soft98.ir، کنسول DevTools را باز کنید (با فشار دادن `F12` یا `Ctrl+Shift+J`) و دستورات زیر را اجرا کنید:

```js
// گزارش تشخیصی کامل
window.Soft98AdBlocker.report()

// بررسی وضعیت تله ضد ادبلاک
window.Soft98AdBlocker.trapCheck()

// ریست هندل‌های DOM داخلی
window.Soft98AdBlocker.resetHandles()

// مشاهده لاگ رویدادها
window.Soft98AdBlocker.events

// مشاهده آمار اجرا
window.Soft98AdBlocker.stats
```

نام مستعار `window.Soft98Pro` هم به عنوان یک alias دوستانه در دسترس است.

---

## 🎨 فاویکون وضعیت

فاویکون به صورت canvas تولید می‌شود:

- **آیکون Soft98 Pro تاریک**: وقتی تم تاریک Pro فعال باشد.
- **حرف `S` با رنگ موفقیت**: وقتی پاک‌سازی موفق باشد اما تم Pro فعال نباشد.

---

> 🔙 [بازگشت به ویکی](Home.md)

</div>
