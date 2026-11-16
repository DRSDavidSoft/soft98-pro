"use strict";

const Soft98DownloadView = (() => {
  const $ = id => document.getElementById(id);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  function fileIcon(type, mime = "") {
    if (/^(ZIP|RAR|7Z|TAR|GZ|BZ2|XZ|ZST|PART|TGZ|GZIP|TBZ2|TXZ|LZMA|CAB|001)$/i.test(type) ||
        /^application\/(?:zip|gzip|x-(?:rar(?:-compressed)?|7z-compressed|tar|gzip|bzip2|xz)|vnd\.rar)$/.test(mime)) return "file-zip";
    if (/^(PDF)$/i.test(type) || mime === "application/pdf") return "file-type-pdf";
    if (/^(XLSX?|XLSM|ODS|CSV|TSV)$/i.test(type) || /spreadsheet|excel|^(?:text\/(?:csv|tab-separated-values))$/.test(mime)) return "table";
    if (/^(PPTX?|PPSX?|ODP)$/i.test(type) || /presentation|powerpoint/.test(mime)) return "presentation";
    if (/^(APK|AAB|IPA)$/i.test(type) || mime === "application/vnd.android.package-archive") return "device-mobile";
    if (/^(ISO|IMG|DMG|VHDX?|VMDK|CUE)$/i.test(type) || /diskimage|iso9660/.test(mime)) return "disc";
    if (/^(EXE|COM|BAT|CMD|SH|PS1|APPIMAGE)$/i.test(type) || /^application\/(?:x-msdownload|vnd\.microsoft\.portable-executable)$/.test(mime)) return "terminal-2";
    if (/^(MSI|MSIX|MSIXBUNDLE|DEB|RPM|APPX|APPXBUNDLE|PKG)$/i.test(type) || /debian\.binary-package|x-rpm|x-msi/.test(mime)) return "package";
    if (/^(PNG|JPE?G|GIF|WEBP|AVIF|HEIC|SVG|ICO|BMP|TIFF?|PSD)$/i.test(type) || mime.startsWith("image/")) return "photo";
    if (/^(MP4|MKV|WEBM|MOV|AVI|MPEG|MPG|M4V|WMV)$/i.test(type) || mime.startsWith("video/")) return "video";
    if (/^(MP3|WAV|OGG|OPUS|M4A|FLAC|AAC|WMA)$/i.test(type) || mime.startsWith("audio/")) return "music";
    if (/^(JS|MJS|CSS|HTML?|PY|JSON|XML|YAML|YML|TOML|SQL|DIFF|PATCH)$/i.test(type) || /javascript|[+/]json$|[+/]xml$|text\/css/.test(mime)) return "code";
    if (/^(TXT|MD|DOCX?|RTF|ODT|NFO|LOG|EPUB|MOBI)$/i.test(type) || /wordprocessing|msword|rtf/.test(mime) || mime.startsWith("text/")) return "file-text";
    return "file";
  }

  function create({ text, buttonContent, importToken, highlight, closeSelect }) {
    const menu = $("manager-menu");
    const dialogs = [$("import"), $("guide")];
    const views = ["queue", "settings"];
    const tokens = new Set();
    const scrollPositions = new Map();
    const scroller = document.documentElement.hasAttribute("data-compact-popup") ? document.body : window;
    let current = "queue", section, menuAnchor, sectionMotion;

    function hash(value) {
      history.replaceState(history.state, "", location.pathname + location.search + value);
      route();
    }

    function closeDialog() {
      hash(current === "settings" ? "#settings" : "");
    }

    function route() {
      const value = location.hash;
      const token = /^#import=([a-f0-9-]{36})$/.exec(value)?.[1];
      const job = /^#job=([a-f0-9-]{36})$/.exec(value)?.[1];
      const active = value === "#import" || token ? dialogs[0] : value === "#guide" ? dialogs[1] : null;
      closeMenu(false);
      closeSelect();
      if (!active) current = value === "#settings" ? "settings" : "queue";
      const switched = section && section !== current;
      if (switched) scrollPositions.set(section, scroller === window ? scrollY : scroller.scrollTop);
      for (const view of views) {
        $(view + "-view").hidden = current !== view;
        if (view === current) $(view + "-tab").setAttribute("aria-current", "page");
        else $(view + "-tab").removeAttribute("aria-current");
      }
      if (switched) {
        sectionMotion?.cancel();
        scroller.scrollTo({ top: scrollPositions.get(current) || 0, behavior: "instant" });
        if (!reduced.matches) sectionMotion = $(current + "-view").animate([{ opacity: .65 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
      }
      section = current;
      for (const dialog of dialogs) {
        if (dialog !== active && dialog.open) dialog.close();
      }
      if (active && !active.open) active.showModal();
      $("open-guide").setAttribute("aria-expanded", String(active === dialogs[1]));
      if (job) highlight(job);
      if (token && !tokens.has(token)) {
        tokens.add(token);
        hash("#import");
        void importToken(token);
      }
    }

    function closeMenu(focus = false) {
      if (!menu.hasAttribute("data-open")) return;
      if (menu.hidePopover && menu.matches(":popover-open")) menu.hidePopover();
      menu.removeAttribute("data-open");
      if (menuAnchor?.getAttribute("aria-haspopup") === "menu") menuAnchor.setAttribute("aria-expanded", "false");
      if (focus && menuAnchor?.isConnected) menuAnchor.focus({ preventScroll: true });
      menuAnchor = null;
    }

    function showMenu(event, items, anchor) {
      if (!items.length) return;
      event.preventDefault();
      closeMenu();
      menuAnchor = anchor;
      const dialog = anchor?.closest("dialog");
      { const host = dialog || document.body; if (menu.parentElement !== host) host.append(menu); }
      menu.replaceChildren(...items.filter(Boolean).map(({ label, icon, run, group }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        if (group) button.dataset.group = group;
        buttonContent(button, label, icon);
        button.addEventListener("click", () => { closeMenu(true); run(); });
        return button;
      }));
      if (!menu.children.length) return;
      menu.setAttribute("aria-label", text("actions"));
      menu.style.left = menu.style.top = "0px";
      menu.toggleAttribute("data-open", true);
      if (anchor?.getAttribute("aria-haspopup") === "menu") anchor.setAttribute("aria-expanded", "true");
      menu.showPopover?.();
      const point = anchor?.getBoundingClientRect();
      const pointer = event.type === "contextmenu" && (event.clientX || event.clientY);
      const { width, height } = menu.getBoundingClientRect();
      const rtl = document.documentElement.dir === "rtl";
      const x = pointer ? event.clientX - (rtl ? width : 0) : rtl ? (point?.right || 8) - width : point?.left || 8;
      const y = pointer ? event.clientY : point?.bottom || 8;
      menu.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
      menu.firstElementChild.focus({ preventScroll: true });
    }

    function nav(id, value) {
      $(id).addEventListener("click", event => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        hash(value);
      });
    }
    nav("queue-tab", "#queue");
    nav("settings-tab", "#settings");
    $("open-guide").addEventListener("click", () => hash("#guide"));
    $("close-guide").addEventListener("click", closeDialog);
    for (const dialog of dialogs) {
      let outside = false;
      const isOutside = event => {
        const box = dialog.getBoundingClientRect();
        return event.target === dialog && (event.clientX < box.left || event.clientX >= box.right ||
          event.clientY < box.top || event.clientY >= box.bottom);
      };
      dialog.addEventListener("pointerdown", event => { outside = isOutside(event); });
      dialog.addEventListener("click", event => { if (outside && isOutside(event)) closeDialog(); outside = false; });
      dialog.addEventListener("cancel", event => { event.preventDefault(); closeDialog(); });
    }
    menu.addEventListener("keydown", event => {
      const entries = [...menu.children];
      const index = entries.indexOf(document.activeElement);
      const next = { ArrowDown: (index + 1) % entries.length, ArrowUp: (index + entries.length - 1) % entries.length,
        Home: 0, End: entries.length - 1 }[event.key];
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      } else if (event.key === "Tab") closeMenu(true);
      else if (next !== undefined) {
        event.preventDefault();
        entries[next].focus({ preventScroll: true });
      }
    });
    document.addEventListener("pointerdown", event => { if (!menu.contains(event.target)) closeMenu(); });
    document.addEventListener("scroll", event => { if (!menu.contains(event.target)) closeMenu(); }, true);
    window.addEventListener("resize", () => closeMenu());
    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);
    document.addEventListener("keydown", event => {
      if (event.key !== "F2" || event.altKey || event.metaKey || event.ctrlKey || dialogs[1].open) return;
      event.preventDefault();
      closeMenu(false);
      if (dialogs[0].open) $("import-search").focus();
      else {
        if (current !== "queue") hash("#queue");
        $("search").focus();
        $("search").select();
      }
    });
    return { route, showMenu, closeMenu, openImport: () => hash("#import"), closeDialog };
  }

  function setFiltered(node, hidden) {
    if (node.hasAttribute("data-filtered") === hidden) return;
    if (hidden && node.contains(document.activeElement)) $("search").focus({ preventScroll: true });
    node.toggleAttribute("data-filtered", hidden);
    node.inert = hidden;
  }

  function dates(locale, text) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
    const painted = new WeakMap();
    let short, full;
    function setCalendar(value) {
      const mode = value === "persian" || value === "gregory" ? value : "auto";
      const calendar = mode === "auto" ? (locale === "fa" ? "persian" : "gregory") : mode;
      short = new Intl.DateTimeFormat(locale, { calendar, dateStyle: "medium" });
      full = new Intl.DateTimeFormat(locale, { calendar, dateStyle: "full", timeStyle: "short" });
      return mode;
    }
    setCalendar("auto");

    function display(time, exact) {
      if (!time.matches?.("time[data-date-label]")) return;
      const value = exact ? time.dataset.exactDate : time.dataset.dateLabel;
      if (time.textContent !== value) time.textContent = value;
    }
    document.addEventListener("focusin", ({ target }) => display(target, true));
    document.addEventListener("focusout", ({ target }) => display(target, false));

    function paint(time, stamp, label, now = Date.now()) {
      const valid = Number.isFinite(stamp) && Math.abs(stamp) <= 8.64e15;
      time.hidden = !valid;
      if (!valid) {
        if (painted.delete(time)) {
          for (const attr of ["datetime", "title", "tabindex", "data-date-label", "data-exact-date"]) time.removeAttribute(attr);
          time.textContent = "";
        }
        return false;
      }
      const seconds = (stamp - now) / 1000;
      const age = Math.abs(seconds);
      const [unit, divisor] = age >= 86400 ? ["day", 86400] : age >= 3600 ? ["hour", 3600] : ["minute", 60];
      const recent = age < 7 * 86400;
      const last = painted.get(time);
      if (last?.stamp !== stamp || last.formatter !== short || last.label !== label) {
        time.dateTime = new Date(stamp).toISOString();
        time.title = label + ": " + full.format(stamp);
        time.dataset.exactDate = short.format(stamp);
        painted.set(time, { stamp, formatter: short, label });
      }
      time.dataset.dateLabel = !recent ? time.dataset.exactDate : age < 60 ? text("dateNow") :
        relative.format(Math.trunc(seconds / divisor), unit);
      if (recent) time.tabIndex = 0;
      else time.removeAttribute("tabindex");
      display(time, time === document.activeElement);
      return true;
    }
    return { setCalendar, paint };
  }

  function indicator(text) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const root = document.documentElement;
    const activeStatuses = new Set(["starting", "resuming", "downloading"]);
    let current, previous, notice, timer = 0;

    function paint(phase, ratio = null) {
      if (!ctx) return;
      const key = phase + ":" + (ratio === null ? "-" : Math.round(ratio * 32));
      if (current === key) return;
      current = key;
      const accent = ({ active: "#75e6ff", complete: "#83f2b5", review: "#ffbc71" })[phase] || "#8ce8cf";
      ctx.clearRect(0, 0, 64, 64);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(3, 3, 58, 58, 15);
      else ctx.rect(3, 3, 58, 58);
      const bg = ctx.createLinearGradient(0, 0, 60, 64);
      bg.addColorStop(0, "#172c42");
      bg.addColorStop(1, "#112825");
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = "#446874";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = accent;
      if (phase !== "idle") {
        ctx.beginPath();
        ctx.arc(32, 32, 22, -Math.PI / 2, -Math.PI / 2 + (ratio !== null ? Math.max(.05, ratio) : phase === "active" ? .32 : 1) * 2 * Math.PI);
        ctx.stroke();
      }
      ctx.beginPath();
      if (phase === "complete") { ctx.moveTo(23, 33); ctx.lineTo(29, 39); ctx.lineTo(42, 25); }
      else if (phase === "review") {
        ctx.moveTo(32, 23); ctx.lineTo(32, 33); ctx.moveTo(32, 40); ctx.lineTo(32, 41);
      } else {
        ctx.moveTo(32, 19); ctx.lineTo(32, 36); ctx.moveTo(25, 30); ctx.lineTo(32, 37); ctx.lineTo(39, 30);
        ctx.moveTo(22, 39); ctx.lineTo(22, 44); ctx.lineTo(42, 44); ctx.lineTo(42, 39);
      }
      ctx.stroke();
      const icon = canvas.toDataURL("image/png");
      $("manager-mark").src = icon;
      $("manager-favicon").href = icon;
      root.dataset.downloadIndicator = phase;
    }

    function base() {
      const active = previous ? [...previous.values()].filter(job => activeStatuses.has(job.status)) : [];
      const known = active.filter(job => job.total > 0);
      const total = known.reduce((sum, job) => sum + job.total, 0);
      const bytes = known.reduce((sum, job) => sum + (job.bytes || 0), 0);
      return [active.length ? "active" : "idle", total ? Math.min(1, bytes / total) : null];
    }

    paint("idle");
    return jobs => {
      const changed = previous && jobs.filter(job => previous.get(job.id)?.status !== job.status);
      previous = new Map(jobs.map(job => [job.id, { status: job.status, total: job.total, bytes: job.bytes }]));
      const phase = changed?.some(job => ["review", "interrupted"].includes(job.status)) ? "review" :
        changed?.some(job => job.status === "complete") ? "complete" : null;
      if (phase) {
        clearTimeout(timer);
        notice = phase;
        let frame = 0;
        paint(notice);
        const tick = () => {
          if (++frame === 6) {
            notice = null;
            paint(...base());
            return;
          }
          paint(...(frame % 2 === 0 ? [notice] : base()));
          timer = setTimeout(tick, 330);
        };
        timer = setTimeout(reduced.matches ? () => { notice = null; paint(...base()); } : tick, reduced.matches ? 1500 : 330);
      }
      const [mode, ratio] = base();
      $("manager-mark").title = text(mode === "active" ? "active" : "queue");
      if (!notice) paint(mode, ratio);
    };
  }

  return { create, fileIcon, indicator, setFiltered, dates };
})();
