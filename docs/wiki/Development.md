<div align="center">

<a href="Development.md"><img src="../assets/badge-en.svg" alt="English" height="22"/></a>&nbsp;
<a href="fa/Development.md"><img src="../assets/badge-fa.svg" alt="فارسی" height="22"/></a>

</div>

---

# Development 🛠️

Install and validate locally:

```bash
npm ci
npm run ci
```

Build outputs:

- `soft98-pro.user.js`
- `dist/userscript/soft98-pro.user.js`
- `dist/chromium`
- `dist/firefox`
- `dist/packages/*.zip`

The main runtime lives in `src/runtime.js`. Keep browser-extension and userscript behavior shared there unless a browser-specific bridge is required.
