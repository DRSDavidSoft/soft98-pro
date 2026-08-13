<div align="center">

<a href="Userscript-vs-Extension.md"><img src="../assets/badge-en.svg" alt="English" height="22"/></a>&nbsp;
<a href="fa/Userscript-vs-Extension.md"><img src="../assets/badge-fa.svg" alt="فارسی" height="22"/></a>

</div>

---

# Userscript vs Extension 🧩

Soft98 Pro supports two install paths and both use the same shared runtime.

## Userscript

The userscript is easiest to install and inspect. It runs at `document-start` through a userscript manager and is ideal when you want a transparent single-file setup.

Tradeoffs:

- Depends on userscript manager injection behavior.
- Has fewer browser-native controls.
- Best for quick updates and easy source review.

## Browser Extension

The extension is the more complete product surface. It includes browser storage, extension UI, content-script bridges, and browser-specific runtime injection.

Tradeoffs:

- Requires unpacked extension installation or release packaging.
- Offers better settings, stronger integration, and more room for future features.
- Recommended for daily use when you want the most durable setup.
