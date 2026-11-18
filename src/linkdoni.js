const Soft98Linkdoni = (() => {
  "use strict";

  const datePattern = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
  const normalizeDate = value => value.trim().replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) & 15));
  const pageNumber = value => /^\d+$/.test(normalizeDate(value));
  const entryLimit = 1024 * 1024;
  const historyKey = "soft98ProLinkdoni";

  function create(doc, { text, icons, locale, changeTheme, fetchPage, afterRender }) {
    const win = doc.defaultView;
    const headerStates = new WeakMap();
    const groupStates = new WeakMap();
    const originalPageLabels = new WeakMap();
    const originalSearchLinks = new WeakMap();
    const replacedFeeds = new WeakSet();
    const scrolls = new Map();
    const countFormat = new Intl.NumberFormat(locale, { useGrouping: false });
    const pageFormat = new Intl.NumberFormat("fa-IR", { useGrouping: false });
    let groupId = 0;
    let view, request, renderedUrl = doc.location.href, renderedEntry, previousRestoration;
    let appearance = { enabled: false, dark: false };
    const element = (tag, role, value) => {
      const node = doc.createElement(tag);
      node.setAttribute(`data-s98p-ld-${role}`, "");
      if (value) node.textContent = value;
      return node;
    };
    const icon = (name, role = "icon") => {
      const node = element("span", role);
      node.setAttribute("aria-hidden", "true");
      node.innerHTML = icons[name] || "";
      return node;
    };
    const named = (node, key) => {
      node.setAttribute("aria-label", text(`linkdoni.${key}`));
      node.title = text(`linkdoni.${key}`);
      return node;
    };

    function formatDate(value) {
      const [, year, month, day] = datePattern.exec(value).map(Number);
      if (locale === "fa" && year < 1700 && month >= 1 && month <= 12) {
        return `${countFormat.format(day)} ${text(`linkdoni.months.${month}`)} ${countFormat.format(year)}`;
      }
      if (year >= 1700 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
      }
      return value.replace(/\d+/g, digits => countFormat.format(Number(digits)));
    }

    function setupHeader(header, heading, search, input, submit) {
      const brand = heading.querySelector("a[href]");
      heading.setAttribute("data-s98p-ld-brand", "");
      const original = element("span", "brand-original");
      original.append(...brand.childNodes);
      const label = element("span", "brand-title", text("linkdoni.name"));
      const identity = element("span", "identity");
      const caption = element("span", "brand-caption", text("product"));
      label.dir = "auto";
      caption.dir = "ltr";
      identity.append(label, caption);
      brand.append(original, icon("rss", "mark"), identity);

      header.setAttribute("data-s98p-ld-header", "");
      const searchHost = [...header.children].find(node => node === search || node.contains(search));
      searchHost.setAttribute("data-s98p-ld-search-host", "");
      search.setAttribute("data-s98p-ld-search", "");
      input.setAttribute("data-s98p-ld-query", "");
      submit.setAttribute("data-s98p-ld-submit", "");
      const nativeLabel = input.getAttribute("aria-label");
      const nativeTitle = input.title;
      const nativePlaceholder = input.placeholder;
      const placeholderValue = nativeTitle && input.defaultValue === nativeTitle ? nativeTitle : null;
      const restoreSearch = enabled => {
        if (enabled) {
          input.setAttribute("aria-label", text("linkdoni.search"));
          input.removeAttribute("title");
          input.placeholder = text("linkdoni.search");
          if (placeholderValue && input.value === placeholderValue) input.value = "";
          return;
        }
        if (nativeLabel === null) input.removeAttribute("aria-label"); else input.setAttribute("aria-label", nativeLabel);
        input.title = nativeTitle;
        input.placeholder = nativePlaceholder;
        if (placeholderValue && !input.value) input.value = placeholderValue;
      };
      restoreSearch(true);
      named(submit, "submit");
      submit.after(icon("search", "submit-glyph"));

      const actions = element("div", "actions");
      const home = named(element("a", "action"), "soft98");
      home.href = "https://soft98.ir/";
      home.append(icon("home"));
      const rss = named(element("a", "action"), "rss");
      rss.href = new URL("rss.xml", doc.location.origin).href;
      rss.append(icon("rss"));
      const theme = element("button", "action");
      theme.type = "button";
      theme.addEventListener("click", changeTheme);
      actions.append(home, rss, theme);
      header.append(actions);
      for (const child of header.children) {
        if (![heading, searchHost, actions].includes(child) && !child.textContent.trim() && !child.querySelector("a[href],button,input")) {
          child.setAttribute("data-s98p-ld-empty", "");
        }
      }
      const state = { theme, restoreSearch, enabled: true };
      headerStates.set(header, state);
      return state;
    }

    function destination(value, base = doc.location.href) {
      if (!value) return null;
      try {
        const url = new URL(value, base);
        return url.origin === doc.location.origin && !url.username && !url.password && !url.search && !url.hash &&
          /^\/(?:page\/[1-9]\d{0,6}\/?|)$/.test(url.pathname) ? url : null;
      } catch (_error) {
        return null;
      }
    }

    function route(value, base = doc.location.href) {
      const archive = destination(value, base);
      if (archive) return archive;
      if (!value) return null;
      try {
        const url = new URL(value, base);
        const params = url.searchParams;
        const keys = ["do", "subaction", "story", "search_start", "result_from", "full_search"];
        return url.origin === doc.location.origin && !url.username && !url.password && !url.hash &&
          /^\/(?:index\.php)?$/.test(url.pathname) && params.get("do") === "search" &&
          params.get("subaction") === "search" && Boolean(params.get("story")) &&
          (params.get("full_search") ?? "0") === "0" && [...params.keys()].every(key => keys.includes(key)) ? url : null;
      } catch (_error) {
        return null;
      }
    }

    function pagerUrl(link, base) {
      const href = link.getAttribute("href");
      const handler = link.getAttribute("onclick");
      if (!handler) return route(href, base);
      if (href !== "#") return null;
      const number = /^\s*(?:javascript:\s*)?list_submit\(([1-9]\d{0,6})\);\s*return\(false\);?\s*$/i.exec(handler)?.[1];
      const url = number && route(base);
      if (!url?.search) return null;
      url.searchParams.set("search_start", number);
      url.searchParams.delete("result_from");
      return url;
    }

    function searchSummary(form) {
      return form && [...form.querySelectorAll("span,div,p")].find(node => !node.children.length &&
        /[\d\u06f0-\u06f9]/u.test(node.textContent) && /(?:نتایج|پیدا شده)/u.test(node.textContent));
    }

    function pageShell(root) {
      const header = root.querySelector("header:has(h1 a[href]):has(form)");
      const frame = header?.parentElement;
      const feed = frame && [...frame.children].find(node => node !== header && node.querySelector("li > a[href], form input[name=story]"));
      return { header, frame, feed };
    }

    function storyRows(feed, base = doc.location.href) {
      const rows = [];
      for (const row of feed.querySelectorAll("li:has(> a[href])")) {
        const link = row.querySelector(":scope > a[href]");
        const time = [...row.children].find(node => node !== link && datePattern.test(normalizeDate(node.textContent)));
        if (!time) continue;
        let url;
        try { url = new URL(link.getAttribute("href"), base); } catch (_error) { continue; }
        if (url.origin !== doc.location.origin || url.username || url.password || !/^https?:$/.test(url.protocol)) continue;
        rows.push({ row, link, time, date: normalizeDate(time.textContent), url });
      }
      return rows;
    }

    function paginationParts(feed, base = doc.location.href) {
      const label = link => link.getAttribute("href") === "#" || route(link.getAttribute("href"), base);
      for (const node of feed.querySelectorAll("a[href]")) {
        if (!pageNumber(node.textContent) || !label(node)) continue;
        const strip = node.parentElement;
        const items = [...strip.children];
        if (!items.some(child => child !== node && pageNumber(child.textContent) && (!child.matches("a") || label(child)))) continue;
        const panel = strip.parentElement;
        const arrows = [...panel.children].filter(child => child !== strip && child.querySelector("a[href]"));
        return { strip, panel, arrows };
      }
      return null;
    }

    function markPagination(feed, enabled) {
      const parts = paginationParts(feed);
      if (!parts) return;
      const { strip, panel, arrows } = parts;
      if (!enabled) {
        for (const node of strip.children) {
          if (originalPageLabels.has(node)) node.textContent = originalPageLabels.get(node);
        }
        for (const link of panel.querySelectorAll("a[href]")) {
          const original = originalSearchLinks.get(link);
          if (!original) continue;
          link.setAttribute("href", "#");
          link.setAttribute("onclick", original);
          originalSearchLinks.delete(link);
        }
        return;
      }
      panel.setAttribute("data-s98p-ld-pagination", "");
      panel.setAttribute("role", "navigation");
      panel.setAttribute("aria-label", text("linkdoni.pagination"));
      strip.setAttribute("data-s98p-ld-pages", "");
      for (const link of panel.querySelectorAll('a[href="#"][onclick]')) {
        const url = pagerUrl(link, doc.location.href);
        if (!url) continue;
        originalSearchLinks.set(link, link.getAttribute("onclick"));
        link.href = url.href;
        link.removeAttribute("onclick");
      }
      for (const node of strip.children) {
        if (!pageNumber(node.textContent)) continue;
        if (!originalPageLabels.has(node)) originalPageLabels.set(node, node.textContent);
        const label = pageFormat.format(Number(normalizeDate(node.textContent)));
        if (!node.matches("a")) node.setAttribute("aria-current", "page");
        if (node.textContent !== label) node.textContent = label;
      }
      for (const node of arrows) {
        node.setAttribute("data-s98p-ld-arrows", "");
        for (const button of node.querySelectorAll("a[href]")) {
          const previous = button.parentElement === node.firstElementChild;
          named(button, previous ? "previous" : "next");
          if (!button.querySelector("[data-s98p-ld-icon]")) button.append(icon(previous ? "chevronRight" : "chevron"));
        }
      }
    }

    function markGroup(date, rows) {
      const first = rows[0].row;
      let state = groupStates.get(first);
      if (!state) {
        const button = element("button", "date-group");
        button.type = "button";
        const label = element("span", "date-label", formatDate(date));
        label.dir = "auto";
        button.append(icon("chevronRight", "date-chevron"), label);
        const render = () => {
          if (button.getAttribute("aria-expanded") !== String(state.open)) button.setAttribute("aria-expanded", String(state.open));
          for (const { row } of state.rows) row.toggleAttribute("data-s98p-ld-collapsed", !state.open);
        };
        state = { open: true, rows, button, render };
        groupStates.set(first, state);
        button.addEventListener("click", () => { state.open = !state.open; render(); });
        first.prepend(button);
      }
      state.rows = rows;
      const targets = rows.flatMap(({ link }) => {
        if (!link.id) link.id = `s98p-ld-story-${++groupId}`;
        return link.id;
      }).join(" ");
      if (state.button.getAttribute("aria-controls") !== targets) state.button.setAttribute("aria-controls", targets);
      state.render();
    }

    function sync(options) {
      appearance = options;
      const { enabled, dark } = options;
      const { header, frame, feed } = pageShell(doc);
      doc.documentElement.toggleAttribute("data-s98p-ld-page", enabled && Boolean(header));
      if (!header) return;
      let state = headerStates.get(header);
      if (!enabled) {
        stop();
        restoreNativeScroll();
        if (state?.enabled) {
          state.restoreSearch(false);
          state.enabled = false;
          if (feed) markPagination(feed, false);
          if (feed && replacedFeeds.has(feed)) doc.location.reload();
        }
        return;
      }
      const heading = header.querySelector("h1:has(a[href])");
      const input = header.querySelector('form input:not([type]),form input[type="text"],form input[type="search"]');
      const submit = input?.form?.querySelector('[type="submit"]');
      if (!heading || !submit) return;
      const query = new URLSearchParams(doc.location.search).get("story");
      if (!state) {
        state = setupHeader(header, heading, input.form, input, submit);
        if (query && !input.value) input.value = query;
      }
      if (!state.enabled) {
        state.restoreSearch(true);
        state.enabled = true;
      }
      if (state.dark !== dark) {
        state.theme.replaceChildren(icon(dark ? "sun" : "moon"));
        named(state.theme, dark ? "light" : "dark");
        state.dark = dark;
      }
      frame.setAttribute("data-s98p-ld-frame", "");
      for (let node = frame.parentElement; node && node !== doc.body; node = node.parentElement) node.setAttribute("data-s98p-ld-wrap", "");
      if (!feed) return;
      feed.setAttribute("data-s98p-ld-feed", "");
      const rows = storyRows(feed);
      let toolbar = frame.querySelector(":scope > [data-s98p-ld-feed-heading]");
      if (!toolbar) {
        toolbar = element("div", "feed-heading");
        const title = element("h2", "feed-title", text(query ? "linkdoni.results" : "linkdoni.feed"));
        title.dir = "auto";
        title.tabIndex = -1;
        toolbar.append(title, element("span", "count"));
        feed.before(toolbar);
      }
      const count = text("linkdoni.count", { count: countFormat.format(rows.length) });
      const total = toolbar.querySelector("[data-s98p-ld-count]");
      if (total.textContent !== count) total.textContent = count;
      const groups = [];
      for (const record of rows) {
        const { row, link, time, date } = record;
        for (let parent = row.parentElement; parent && parent !== feed; parent = parent.parentElement) {
          parent.setAttribute("data-s98p-ld-entry-wrap", "");
          for (const child of parent.children) {
            if (child.tagName === "DIV" && !child.childElementCount && !child.textContent.trim()) child.setAttribute("data-s98p-ld-empty", "");
          }
        }
        row.setAttribute("data-s98p-ld-entry", "");
        time.setAttribute("data-s98p-ld-date", "");
        if (!link.hasAttribute("data-s98p-ld-story")) {
          link.setAttribute("data-s98p-ld-story", "");
          const label = element("span", "story-title");
          label.dir = "auto";
          label.append(...link.childNodes);
          link.append(label, icon("external", "story-arrow"));
        }
        let group = groups.at(-1);
        if (group?.date !== date) {
          group = { date, rows: [] };
          groups.push(group);
        } else if (groupStates.has(row)) {
          groupStates.get(row).button.remove();
          groupStates.delete(row);
        }
        group.rows.push(record);
      }
      for (const group of groups) markGroup(group.date, group.rows);
      for (const form of feed.querySelectorAll("form:has(input[name=story])")) {
        form.setAttribute("data-s98p-ld-details", "");
        const summary = searchSummary(form);
        summary?.setAttribute("data-s98p-ld-result-summary", "");
      }
      markPagination(feed, true);
      view = { feed, toolbar };
    }

    async function readPage(response) {
      const type = response.headers.get("content-type") || "";
      const charset = /;\s*charset\s*=\s*"?([a-z\d-]+)/i.exec(type)?.[1];
      if (!response.ok || !/^text\/html\b/i.test(type) || (charset && charset.toLowerCase() !== "utf-8") ||
          Number(response.headers.get("content-length")) > entryLimit || !response.body) throw new Error("Unexpected archive response");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let raw = "", bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return raw + decoder.decode();
          bytes += value.byteLength;
          if (bytes > entryLimit) throw new Error("Archive exceeded size limit");
          raw += decoder.decode(value, { stream: true });
        }
      } finally { reader.releaseLock(); }
    }

    function rebuildArchive(raw, url) {
      // Parse inertly, then rebuild only known archive data. Do not attach upstream scripts, handlers, or forms.
      const template = doc.createElement("template");
      template.innerHTML = raw;
      const { feed } = pageShell(template.content);
      const pagination = feed && paginationParts(feed, url.href);
      const rows = feed && storyRows(feed, url.href);
      const title = template.content.querySelector("title")?.textContent.trim();
      const searchForm = feed?.querySelector("form:has(input[name=story])");
      const searching = url.searchParams.has("story");
      const summary = searchSummary(searchForm)?.textContent;
      const expectedPage = searching ? Number(url.searchParams.get("search_start")) || 1 :
        Number(/^\/page\/(\d+)/.exec(url.pathname)?.[1] || 1);
      if (!title || !rows?.length || !pagination || (searching ? !summary : feed.querySelector("form")) ||
          ![...pagination.strip.children].some(node => !node.matches("a") && pageNumber(node.textContent) &&
            Number(normalizeDate(node.textContent)) === expectedPage)) throw new Error("Unrecognized archive layout");
      const replacement = element("div", "feed");
      const list = doc.createElement("ul");
      for (const record of rows) {
        const row = doc.createElement("li");
        const link = doc.createElement("a");
        link.href = record.url.href;
        link.textContent = record.link.textContent.trim();
        if (record.link.getAttribute("target") === "_blank") {
          link.target = "_blank";
          link.rel = "noopener";
        }
        const date = doc.createElement("span");
        date.textContent = record.date;
        row.append(link, date);
        list.append(row);
      }
      const panel = doc.createElement("div");
      for (const group of pagination.arrows) {
        const arrows = doc.createElement("div");
        for (const child of group.children) {
          const wrap = doc.createElement("span");
          const source = child.matches("a[href]") ? child : child.querySelector("a[href]");
          const link = source && pagerUrl(source, url.href);
          if (link) {
            const anchor = doc.createElement("a");
            anchor.href = link.href;
            wrap.append(anchor);
          }
          arrows.append(wrap);
        }
        panel.append(arrows);
      }
      const pages = doc.createElement("div");
      for (const node of pagination.strip.children) {
        const label = node.textContent.trim();
        const isPage = pageNumber(label);
        if (!isPage && !/^(?:\.{3}|\u2026)$/.test(label)) continue;
        const link = node.matches("a[href]") && pagerUrl(node, url.href);
        if (node.matches("a") && !link) continue;
        const child = doc.createElement(link ? "a" : "span");
        if (link) child.href = link.href;
        child.textContent = label;
        pages.append(child);
      }
      panel.append(pages);
      replacement.append(list, panel);
      if (!paginationParts(replacement, url.href)) throw new Error("Missing archive links");
      return { replacement, title, summary };
    }

    function stop() {
      if (!request) return;
      const active = request;
      request = null;
      win.clearTimeout(active.timeout);
      active.controller.abort();
      active.loader.remove();
      if (active.wasBusy === null) active.feed.removeAttribute("aria-busy");
      else active.feed.setAttribute("aria-busy", active.wasBusy);
    }

    function restoreNativeScroll() {
      if (previousRestoration === undefined) return;
      win.history.scrollRestoration = previousRestoration;
      previousRestoration = undefined;
    }

    function rememberScroll() {
      if (!renderedEntry) return;
      scrolls.set(renderedEntry.key, [win.scrollX, win.scrollY]);
      if (scrolls.size > 60) scrolls.delete(scrolls.keys().next().value);
    }

    function useManualScroll() {
      if (previousRestoration === undefined) previousRestoration = win.history.scrollRestoration;
      win.history.scrollRestoration = "manual";
    }

    async function navigate(url, entry = null) {
      stop();
      const { feed } = view;
      const controller = new AbortController();
      const loader = element("div", "loading");
      loader.setAttribute("role", "status");
      const caption = doc.createElement("span");
      caption.textContent = text("linkdoni.loading");
      caption.dir = "auto";
      loader.append(element("span", "spinner"), caption);
      loader.firstChild.setAttribute("aria-hidden", "true");
      const wasBusy = feed.getAttribute("aria-busy");
      feed.setAttribute("aria-busy", "true");
      doc.body.append(loader);
      const active = { feed, wasBusy, controller, loader, timeout: win.setTimeout(() => controller.abort(), 7000) };
      request = active;
      try {
        const response = await fetchPage(url.href, { signal: controller.signal, mode: "same-origin", credentials: "same-origin",
          redirect: "error", headers: { Accept: "text/html" } });
        const raw = await readPage(response);
        if (request !== active || !appearance.enabled) return;
        const { replacement, title, summary } = rebuildArchive(raw, url);
        const form = summary && feed.querySelector(":scope > form:has(input[name=story])");
        const summaryNode = searchSummary(form);
        if (summary && !summaryNode) throw new Error("Missing existing search form");
        const { history } = win;
        useManualScroll();
        if (!entry) {
          if (!renderedEntry) {
            renderedEntry = { key: win.crypto.randomUUID(), href: renderedUrl };
            history.replaceState({ ...history.state, [historyKey]: renderedEntry }, "");
          }
          rememberScroll();
          entry = { key: win.crypto.randomUUID(), href: url.href };
          history.pushState({ [historyKey]: entry }, "", url.href);
        }
        useManualScroll();
        renderedEntry = entry;
        renderedUrl = url.href;
        replacedFeeds.add(replacement);
        if (summaryNode) {
          summaryNode.textContent = summary;
          replacement.prepend(form);
        }
        feed.replaceWith(replacement);
        doc.title = title;
        const canonical = doc.head.querySelector('link[rel="canonical"]');
        if (canonical) canonical.href = url.href;
        sync(appearance);
        afterRender?.(title);
        const heading = view.toolbar.querySelector("h2");
        heading.focus({ preventScroll: true });
        const saved = scrolls.get(entry.key);
        win.scrollTo({ left: saved?.[0] || 0, top: saved?.[1] || 0, behavior: "instant" });
      } catch (_error) {
        if (request !== active) return;
        if (doc.location.href === url.href) doc.location.reload();
        else doc.location.assign(url.href);
      } finally {
        if (request === active) stop();
      }
    }

    doc.addEventListener("click", event => {
      if (!appearance.enabled || !view?.feed.isConnected || !fetchPage || event.defaultPrevented || event.button !== 0 ||
          event.ctrlKey || event.shiftKey || event.metaKey || event.altKey || !route(renderedUrl)) return;
      const link = event.target.closest?.("[data-s98p-ld-pagination] a[href]");
      if (!link || !view.feed.contains(link) || link.matches("[onclick],[download]") || (link.target && link.target !== "_self")) return;
      const url = route(link.getAttribute("href"));
      if (!url || url.href === doc.location.href) return;
      event.preventDefault();
      navigate(url);
    });
    win.addEventListener("popstate", event => {
      const url = route(doc.location.href);
      if (!renderedEntry || !url) return;
      stop();
      if (url.href === renderedUrl) return;
      const entry = event.state?.[historyKey];
      if (!appearance.enabled || !view?.feed.isConnected || entry?.href !== url.href || !entry.key) {
        doc.location.reload();
        return;
      }
      rememberScroll();
      navigate(url, entry);
    });
    win.addEventListener("pagehide", stop);

    return { sync };
  }

  return { create };
})();
