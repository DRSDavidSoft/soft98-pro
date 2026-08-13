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

## ساختار سورس

runtime اصلی در `src/runtime.js` قرار دارد. رفتار مشترک بین افزونه مرورگر و یوزراسکریپت را در آنجا نگه دارید، مگر اینکه یک bridge اختصاصی مرورگر مورد نیاز باشد.

---

> 🔙 [بازگشت به ویکی](Home.md)

</div>
