(function soft98FirefoxInjector() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const script = document.createElement("script");
  script.src = api.runtime.getURL("assets/runtime.page.js");
  script.async = false;
  script.onload = () => script.remove();
  (document.documentElement || document.head).appendChild(script);
})();
