<div align="center">

<a href="../Development.md"><img src="../../assets/badge-en.svg" alt="English" height="22"/></a>&nbsp;
<a href="Development.md"><img src="../../assets/badge-fa.svg" alt="فارسی" height="22"/></a>

</div>

---

<div dir="rtl">

# 🛠️ راهنمای توسعه

## نصب و اعتبارسنجی محلی

```bash
npm ci
npm run ci
```

## خروجی‌های build

| مسیر | توضیح |
|------|-------|
| `soft98-pro.user.js` | یوزراسکریپت اصلی |
| `dist/userscript/soft98-pro.user.js` | نسخه release یوزراسکریپت |
| `dist/chromium/` | ساخت Chrome و Edge |
| `dist/firefox/` | ساخت Firefox |
| `dist/packages/*.zip` | آرشیوهای ZIP |
| `dist/release/latest.json` | متادیتای به‌روزرسانی |
| `dist/release/SHA256SUMS.txt` | checksum فایل‌های انتشار |

## ساختار سورس

runtime اصلی در `src/runtime.js` قرار دارد. رفتار مشترک بین افزونه مرورگر و یوزراسکریپت را در آنجا نگه دارید، مگر اینکه یک bridge اختصاصی مرورگر مورد نیاز باشد.

تمام پیام‌های انگلیسی و فارسی در `src/messages.json` نگهداری می‌شوند. build یکسان‌بودن کلیدهای دو زبان را بررسی و پیام‌ها را داخل همه خروجی‌ها قرار می‌دهد.

بررسی به‌روزرسانی افزونه در `src/release-client.js` مشترک است. این کد ابتدا `latest.json` و برای نسخه‌های قدیمی فاقد این فایل، API انتشارهای GitHub را استفاده می‌کند.

workflow مربوط به CI بسته‌ها و آزمون‌های پذیرش را برای هر pull request اجرا می‌کند. workflow انتشار نیز تطابق tag با `package.json` را بررسی، provenance را ثبت و بسته‌ها، متادیتا و checksumها را در GitHub Releases منتشر می‌کند.

قوانین Soft98 در PersianBlocker به‌صورت snapshot محدود در `test/fixtures/persianblocker-soft98.json` نگهداری می‌شوند. پس از بررسی تغییرات upstream، آن را با `npm run sync:persianblocker` به‌روز کنید. CI زمان‌بندی‌شده با `npm run check:persianblocker-upstream` تغییر قوانین مرتبط را گزارش می‌دهد و آزمون سازگاری، خنثی‌شدن هشدار فعلی را در بسته‌های Chromium و Firefox بررسی می‌کند.

---

> 🔙 [بازگشت به ویکی](Home.md)

</div>
