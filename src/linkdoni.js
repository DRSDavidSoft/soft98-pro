const Soft98Linkdoni = (() => {
  "use strict";

  const datePattern = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
  const normalizeDate = value => value.trim().replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) & 15));

  function create(doc, { text, icons, locale, changeTheme }) {
    const headerStates = new WeakMap();
    const countFormat = new Intl.NumberFormat(locale, { useGrouping: false });
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

    function markPagination(feed) {
      const numeric = value => /^[\d\u06f0-\u06f9]+$/.test(value.trim());
      const label = link => link.getAttribute("href") === "#" || /^\/page\/\d+\/?$/.test(link.pathname);
      const link = [...feed.querySelectorAll("a[href]")].find(node => numeric(node.textContent) && label(node) &&
        [...node.parentElement.children].filter(child => child.matches("a[href]") && numeric(child.textContent) && label(child)).length > 1);
      if (!link) return;
      const strip = link.parentElement;
      const panel = strip.parentElement;
      panel.setAttribute("data-s98p-ld-pagination", "");
      panel.setAttribute("role", "navigation");
      panel.setAttribute("aria-label", text("linkdoni.pagination"));
      strip.setAttribute("data-s98p-ld-pages", "");
      for (const node of strip.children) {
        if (!numeric(node.textContent) || node.matches("a")) continue;
        node.setAttribute("aria-current", "page");
      }
      for (const node of panel.children) {
        if (node === strip || !node.querySelector("a[href]")) continue;
        node.setAttribute("data-s98p-ld-arrows", "");
        for (const button of node.querySelectorAll("a[href]")) {
          const previous = button.parentElement === node.firstElementChild;
          named(button, previous ? "previous" : "next");
          if (!button.querySelector("[data-s98p-ld-icon]")) button.append(icon(previous ? "chevronRight" : "chevron"));
        }
      }
    }

    function sync({ enabled, dark }) {
      const header = doc.querySelector("header:has(h1 a[href]):has(form)");
      doc.documentElement.toggleAttribute("data-s98p-ld-page", enabled && Boolean(header));
      if (!header) return;
      let state = headerStates.get(header);
      if (!enabled) {
        if (state?.enabled) {
          state.restoreSearch(false);
          state.enabled = false;
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
      const frame = header.parentElement;
      frame.setAttribute("data-s98p-ld-frame", "");
      for (let node = frame.parentElement; node && node !== doc.body; node = node.parentElement) node.setAttribute("data-s98p-ld-wrap", "");
      const feed = [...frame.children].find(node => node !== header && node.querySelector("li > a[href], form input[name=story]"));
      if (!feed) return;
      feed.setAttribute("data-s98p-ld-feed", "");
      const rows = [];
      for (const row of feed.querySelectorAll("li:has(> a[href])")) {
        const link = row.querySelector(":scope > a[href]");
        const time = [...row.children].find(node => node !== link && datePattern.test(normalizeDate(node.textContent)));
        if (!time || link.origin !== doc.location.origin) continue;
        const date = normalizeDate(time.textContent);
        rows.push([row, link, time, date]);
      }
      let toolbar = frame.querySelector(":scope > [data-s98p-ld-feed-heading]");
      if (!toolbar) {
        toolbar = element("div", "feed-heading");
        const title = element("h2", "feed-title", text(query ? "linkdoni.results" : "linkdoni.feed"));
        title.dir = "auto";
        toolbar.append(title, element("span", "count"));
        feed.before(toolbar);
      }
      const count = text("linkdoni.count", { count: countFormat.format(rows.length) });
      const total = toolbar.querySelector("[data-s98p-ld-count]");
      if (total.textContent !== count) total.textContent = count;
      let previous;
      for (const [row, link, time, date] of rows) {
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
        const group = row.querySelector(":scope > [data-s98p-ld-date-group]");
        if (date === previous) group?.remove();
        else if (!group) {
          const divider = element("span", "date-group", formatDate(date));
          divider.dir = "auto";
          row.prepend(divider);
        }
        previous = date;
      }
      for (const form of feed.querySelectorAll("form:has(input[name=story])")) {
        form.setAttribute("data-s98p-ld-details", "");
        const summary = [...form.querySelectorAll("span,div,p")].find(node => !node.children.length &&
          /[\d\u06f0-\u06f9]/u.test(node.textContent) && /(?:نتایج|پیدا شده)/u.test(node.textContent));
        summary?.setAttribute("data-s98p-ld-result-summary", "");
      }
      markPagination(feed);
    }

    return { sync };
  }

  return { create };
})();
