<div align="center">

<a href="../Installation.md"><img src="../../assets/badge-en.svg" alt="English" height="22"/></a>&nbsp;
<a href="Installation.md"><img src="../../assets/badge-fa.svg" alt="فارسی" height="22"/></a>

</div>

---

<div dir="rtl">

# 📦 راهنمای نصب

آخرین نسخه را از https://github.com/DRSDavidSoft/soft98-pro/releases/latest دانلود کنید.

---

## 🧩 افزونه مرورگر

### 🟦 مرورگرهای Chrome و Edge

1. فایل `soft98-pro-chromium-*.zip` را دانلود کنید.
2. آن را استخراج کنید.
3. به صفحه `chrome://extensions` (یا `edge://extensions`) بروید.
4. گزینه **Developer mode** را در گوشه بالا-راست فعال کنید.
5. روی **Load unpacked** کلیک کنید و پوشه استخراج شده را انتخاب کنید.

### 🟠 مرورگر Firefox

1. فایل `soft98-pro-firefox-*.zip` را دانلود کنید.
2. آن را استخراج کنید.
3. به صفحه `about:debugging#/runtime/this-firefox` بروید.
4. روی **Load Temporary Add-on** کلیک کنید.
5. فایل `manifest.json` داخل پوشه استخراج شده را انتخاب کنید.

افزونه هنگام نصب، شروع مرورگر و هر شش ساعت GitHub Releases را بررسی می‌کند. برای نسخه‌های قدیمی فاقد `latest.json` از API انتشارهای GitHub استفاده می‌شود. در صورت وجود نسخه جدید، نشان toolbar و لینک مستقیم بسته مناسب نمایش داده می‌شود. مرورگر اجازه جایگزینی بی‌صدای افزونه unpacked را نمی‌دهد؛ به‌روزرسانی بومی و خودکار به فروشگاه یا کانال امضاشده نیاز دارد.

افزونه قانون سازگاری PersianBlocker را در سطح USER مرورگر تزریق می‌کند. این سطح برای خنثی‌کردن هشدار `html::after` لازم است؛ یوزراسکریپت می‌تواند اعلان‌های DOM را حذف کند اما نمی‌تواند از stylesheet سطح USER افزونه دیگری اولویت بیشتری بگیرد.

---

## ⚡ یوزراسکریپت

**مرحله ۱** — یک مدیر یوزراسکریپت نصب کنید:

| مرورگر | مدیر اسکریپت |
|---------|---------|
| مرورگرهای Chrome یا Edge | [افزونه Tampermonkey](https://tampermonkey.net) |
| مرورگر Firefox | [افزونه Violentmonkey](https://violentmonkey.github.io) |

**مرحله ۲** — اسکریپت را نصب کنید:

👉 [دریافت فایل `soft98-pro.user.js`](https://github.com/DRSDavidSoft/soft98-pro/raw/main/soft98-pro.user.js)

نصب را در مدیر یوزراسکریپت تأیید کنید.

یوزراسکریپت برای نصب و به‌روزرسانی خودکار از `releases/latest/download/soft98-pro.user.js` استفاده می‌کند. بررسی خودکار به‌روزرسانی را در مدیر یوزراسکریپت فعال نگه دارید.

**مرحله ۳** — به [soft98.ir](https://soft98.ir) بروید و لذت ببرید! ✅

---

> 🔙 [بازگشت به ویکی](Home.md)

</div>
