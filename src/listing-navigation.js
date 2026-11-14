function installSoft98ListingNavigation({ enabled, fetchPage, label, locale, afterRender }) {
  const pageOrigin = location.origin;
  const limit = 1024 * 1024;
  const historyKey = "soft98ProListing";
  const tags = new Set("article header footer section div h1 h2 h3 h4 h5 h6 p span small b strong em i u s sup sub bdi bdo time br hr a img figure figcaption picture ul ol li nav blockquote pre code".split(" "));
  const attributes = new Set("class id title alt width height dir lang role datetime rel target aria-label aria-current aria-hidden tabindex".split(" "));
  const scrolls = new Map();
  let renderedLocation = location.pathname + location.search;
  let activeEntry;
  let active;
  let loader;

  function resolveUrl(raw, base) {
    try { return new URL(raw, base); } catch (_error) { return null; }
  }

  function listingUrl(raw, base = location.href) {
    if (!raw) return null;
    const url = resolveUrl(raw, base);
    if (!url || url.origin !== pageOrigin || url.username || url.password || url.search || url.hash ||
        !/^\/(?:[a-z][a-z\d-]*\/)*(?:\d{1,6}\/)?$/i.test(url.pathname) ||
        /(?:^|\/)(?:user|admin|account|logout|login)(?:\/|$)/i.test(url.pathname)) return null;
    return url;
  }

  function listingMain(root) {
    const main = root.querySelector("main");
    if (!main || main.querySelector('form,[role=tabpanel],video,audio,iframe,object,embed') ||
        main.querySelectorAll(":scope > article:has(> header :is(h1,h2,h3))").length < 2) return null;
    return main;
  }

  function showLoading(main) {
    if (!loader) {
      loader = document.createElement("div");
      loader.setAttribute("data-soft98-pro-route-loading", "");
      loader.setAttribute("role", "status");
      loader.lang = locale;
      loader.dir = locale === "fa" ? "rtl" : "ltr";
      const scene = document.createElement("span");
      scene.className = "s98p-route-scene";
      scene.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.textContent = label("routeLoading");
      loader.append(scene, copy);
    }
    active.previousBusy = main.getAttribute("aria-busy");
    main.setAttribute("aria-busy", "true");
    document.body.append(loader);
  }

  function stop() {
    if (!active) return;
    const { controller, timeout, indicator, main, previousBusy } = active;
    active = null;
    controller.abort();
    clearTimeout(timeout);
    clearTimeout(indicator);
    if (previousBusy === null) main.removeAttribute("aria-busy");
    else if (previousBusy !== undefined) main.setAttribute("aria-busy", previousBusy);
    loader?.remove();
  }

  async function boundedHtml(response) {
    const size = Number(response.headers.get("content-length"));
    const type = response.headers.get("content-type") || "";
    const charset = /;\s*charset\s*=\s*"?([a-z\d-]+)/i.exec(type)?.[1].toLowerCase();
    if (!response.ok || !/^text\/html\b/i.test(type) || (charset && charset !== "utf-8") ||
        size > limit || !response.body) throw new Error("Unsupported listing");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return result + decoder.decode();
        received += value.byteLength;
        if (received > limit) throw new Error("Listing exceeds size limit");
        result += decoder.decode(value, { stream: true });
      }
    } finally { reader.releaseLock(); }
  }

  function copyListing(source, destination) {
    // Rebuild only passive listing markup. Never import nodes, handlers, or scripts from the response.
    const fragment = document.createDocumentFragment();
    const currentMain = document.querySelector("main");
    const transfer = (node, parent, depth) => {
      if (depth > 30) return;
      if (node.nodeType === 3) {
        parent.append(document.createTextNode(node.data));
        return;
      }
      if (node.nodeType !== 1 || !tags.has(node.localName)) return;
      const output = document.createElement(node.localName);
      for (const { name, value } of node.attributes) {
        if (attributes.has(name)) {
          const existing = name === "id" ? document.getElementById(value) : null;
          if (name !== "id" || (/^[a-z][a-z\d_-]{0,78}$/i.test(value) && !/^soft98-pro/i.test(value) &&
              (!existing || (existing !== currentMain && currentMain?.contains(existing))))) output.setAttribute(name, value);
        }
        if (name === "href" && node.localName === "a") {
          const url = resolveUrl(value, destination);
          if (url?.protocol === "https:" && !url.username && !url.password) output.href = url.href;
        }
        if (name === "src" && node.localName === "img") {
          const url = resolveUrl(value, destination);
          if (url?.protocol === "https:" && !url.username && !url.password &&
              (url.origin === pageOrigin || /(?:^|\.)soft98\.ir$/i.test(url.hostname))) output.src = url.href;
        }
        if (name === "data-toggle" && value === "fn") output.setAttribute(name, value);
        // Keep existing site-managed links intact; their behavior is not reimplemented here.
        if (node.localName === "a" && ((name === "data-key" && /^[a-z\d/+=_-]{1,320}$/i.test(value)) ||
            (name === "data-prefix" && /^#[a-z][a-z\d_-]* a:last-child$/i.test(value)))) output.setAttribute(name, value);
      }
      if (output.localName === "a" && output.target === "_blank") output.relList.add("noopener");
      for (const child of node.childNodes) transfer(child, output, depth + 1);
      parent.append(output);
    };
    for (const node of source.childNodes) transfer(node, fragment, 0);
    return fragment;
  }

  function rememberScroll() {
    if (!activeEntry) return;
    scrolls.set(activeEntry, [scrollX, scrollY]);
    if (scrolls.size > 60) scrolls.delete(scrolls.keys().next().value);
  }

  function newEntry(url) {
    return { key: Math.random().toString(36).slice(2), path: url.pathname + url.search };
  }

  function syncHead(source, url) {
    for (const selector of ['meta[name="description"]', 'link[rel="canonical"]']) {
      const from = source.querySelector(selector);
      const to = document.head.querySelector(selector);
      if (!from || !to) continue;
      if (to.localName === "meta") to.setAttribute("content", from.getAttribute("content") || "");
      else to.href = url.href;
    }
  }

  async function navigate(url, popEntry) {
    stop();
    const main = listingMain(document);
    if (!enabled() || !main || !fetchPage) {
      if (popEntry) location.reload();
      else location.assign(url.href);
      return;
    }
    const controller = new AbortController();
    const request = { main, controller, timeout: setTimeout(() => controller.abort(), 7000),
      indicator: setTimeout(() => showLoading(main), 140) };
    active = request;
    try {
      const response = await fetchPage(url.href, { signal: controller.signal, mode: "same-origin", credentials: "same-origin",
        redirect: "error", headers: { Accept: "text/html" } });
      const raw = await boundedHtml(response);
      if (active !== request) return;
      const template = document.createElement("template");
      template.innerHTML = raw;
      const incoming = listingMain(template.content);
      const title = template.content.querySelector("title")?.textContent.trim();
      if (!popEntry && document.querySelector("dialog[open]")) return;
      if (!incoming || !title || !main.isConnected || !enabled()) throw new Error("Full navigation required");
      const content = copyListing(incoming, url);
      if (!popEntry) {
        if (!activeEntry) {
          const old = newEntry(location);
          history.replaceState({ ...history.state, [historyKey]: old }, "");
          activeEntry = old.key;
        }
        rememberScroll();
        popEntry = newEntry(url);
        history.pushState({ [historyKey]: popEntry }, "", url.href);
      }
      activeEntry = popEntry.key;
      renderedLocation = popEntry.path;
      main.replaceChildren(content);
      document.title = title;
      syncHead(template.content, url);
      afterRender(title);
      if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
      main.focus({ preventScroll: true });
      const saved = scrolls.get(activeEntry);
      if (saved) scrollTo({ left: saved[0], top: saved[1], behavior: "instant" });
      else {
        const offset = document.querySelector("[data-soft98-pro-nav-chrome]")?.getBoundingClientRect().height || 56;
        scrollTo({ top: Math.max(0, scrollY + main.getBoundingClientRect().top - offset - 12), behavior: "instant" });
      }
    } catch (_error) {
      if (active !== request) return;
      if (popEntry) location.reload();
      else location.assign(url.href);
    } finally {
      if (active === request) stop();
    }
  }

  document.addEventListener("click", (event) => {
    if (!enabled() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.altKey || document.querySelector("dialog[open],[aria-modal=true]:not([hidden])")) return;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor?.closest("main,header nav") || anchor.closest("form,[data-soft98-pro-read-preview]") ||
        anchor.matches('[download],[onclick],[data-key],[data-toggle]') || (anchor.target && anchor.target.toLowerCase() !== "_self")) return;
    const destination = listingUrl(anchor.getAttribute("href"));
    if (!destination || destination.href === location.href || !listingMain(document)) return;
    event.preventDefault();
    navigate(destination, null);
  });

  window.addEventListener("popstate", (event) => {
    stop();
    const path = location.pathname + location.search;
    if (path === renderedLocation) return;
    rememberScroll();
    const entry = event.state?.[historyKey];
    const url = listingUrl(location.href);
    if (!url || entry?.path !== path || !entry.key) location.reload();
    else navigate(url, entry);
  });
  window.addEventListener("pagehide", stop);
}
