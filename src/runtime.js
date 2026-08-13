(function soft98AdBlocker() {
  "use strict";

  const VERSION = "1.1.1";
  const DATA_HREF = "data-soft98-adblocker-href";
  const DATA_STATE = "data-soft98-adblocker-state";
  const DATA_PATCHED = "data-soft98-adblocker-patched-script";
  const FAVICON_ID = "soft98-pro-favicon";
  const CONTROL_POSITION_KEY = "soft98-ad-blocker.control-position";
  const CONTROL_MARGIN = 12;
  const enqueueMicrotask = window.queueMicrotask ? window.queueMicrotask.bind(window) : (callback) => Promise.resolve().then(callback);
  const nativeEval = typeof window.eval === "function" ? window.eval : null;
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  const IS_EXTENSION = "__SOFT98_BUILD_TARGET__" === "extension";
  const STORAGE_KEY = "soft98-ad-blocker.settings";
  const EXTENSION_REPO = "https://github.com/DRSDavidSoft/soft98-pro";
  const LOCALE = preferredLocale();
  const RTL = LOCALE === "fa";
  const STRINGS = {
    en: {
      product: "Soft98 Pro",
      ready: "ready",
      blockAds: "Block ads",
      patchScripts: "Patch Soft98 code",
      pro: "Enable Pro",
      darkDesign: "Modern dark design",
      linkBadges: "Download badges",
      diagnostics: "Console diagnostics",
      recommendExtension: "Recommend extension",
      moveControl: "Drag to move. Alt+Arrow keys also move this control.",
      scanNow: "Scan now",
      close: "Close",
      dismiss: "Dismiss",
      extensionTitle: "Browser extension is ready",
      extensionBody: "Install the extension for more precise control, richer settings, and steadier execution in Chrome, Edge, and Firefox.",
      extensionLink: "Get Soft98 Pro",
      successLog: "Soft98 Pro is active.",
    },
    fa: {
      product: "Soft98 Pro",
      ready: "آماده",
      blockAds: "حذف تبلیغات",
      patchScripts: "اصلاح کد Soft98",
      pro: "فعال‌سازی Pro",
      darkDesign: "طراحی تیره مدرن",
      linkBadges: "نشان لینک دانلود",
      diagnostics: "گزارش کنسول",
      recommendExtension: "پیشنهاد افزونه",
      moveControl: "برای جابه‌جایی بکشید. با Alt و کلیدهای جهت‌دار نیز حرکت می‌کند.",
      scanNow: "بررسی دوباره",
      close: "بستن",
      dismiss: "بستن",
      extensionTitle: "نسخه افزونه مرورگر آماده است",
      extensionBody: "برای کنترل دقیق‌تر، تنظیمات بیشتر، و اجرای مطمئن‌تر در Chrome، Edge و Firefox می‌توانید نسخه افزونه را نصب کنید.",
      extensionLink: "دریافت Soft98 Pro",
      successLog: "Soft98 Pro فعال است.",
    },
  };
  const DEFAULT_SETTINGS = {
    blockAds: true,
    patchScripts: true,
    pro: true,
    darkDesign: true,
    compactLayout: true,
    linkBadges: true,
    pirateLogo: false,
    diagnostics: true,
    recommendExtension: false,
  };
  const savedHref = new WeakMap();
  const trackedLinks = new Set();
  const pendingRoots = new Set();
  const stats = {
    adsRemoved: 0,
    warningsRemoved: 0,
    blockerNoticesRemoved: 0,
    linksPreserved: 0,
    linksRestored: 0,
    scrollDetectorsBlocked: 0,
    patches: [],
    patchFailures: [],
  };
  const eventLog = [];
  let scheduled = false;
  let recoveryStarted = false;
  let originalTitle = document.title || "";
  let successAnnounced = false;
  let faviconState = "";
  let controlAbortController = null;
  let settings = readSettings();

  const SELECTORS = {
    links: [
      "a.download-list-link",
      ".download-list a[href]",
      ".download-list-link",
      ".card-title-link",
      ".card-footer .btn-success",
      ".top-list-link",
      "a[href*='/download/']",
      "a[href*='soft98.ir/download']",
      "a[href*='soft98.ir/dl/']",
      "a[href*='soft98.ir/file/']",
    ].join(","),
    removableAds: [
      "#kaprila_soft98_ir_related",
      "[id^='kaprila']",
      "[id*='kaprila']",
      "[class*='kaprila']",
      ".download-list-item-buysellads",
      "[class*='buysellads']",
      "#footer-bitcoin",
      "iframe[src*='kaprila.com']",
      "script[src*='kaprila.com']",
      "script[src*='buysellads']",
    ].join(","),
    warningCandidates: [
      ".tbd_ibd",
      ".tbdc",
      ".trk_irk",
      ".tooltip",
      ".alert-warning",
      "[role='alert']",
      "[class*='d-darkreader-inline-block']",
      "[class*='dlgbdinline-block']",
      "[class*='dlgrkinline-block']",
      "[id*='PersianBlocker']",
      "[class*='PersianBlocker']",
      "[href*='PersianBlocker']",
    ].join(","),
  };

  const SOFT98_SCRIPT = /(?:^|\/\/)(?:www\.)?soft98\.ir\/templates\/.*(?:application\.min\.packed|jquery\.min\.packed|jquery)\.js(?:[?#].*)?$/i;
  const BLOCKED_URL = /(?:kaprila\.com|buysellads|\/ads?(?:\/|\.|$)|adservice|advertisement)/i;
  const BAD_HREF = /^(?:\s*|#|javascript:|void\(0\)|about:blank)$/i;
  const WARNING_TEXT =
    /(?:افزونه\s+حذف\s+(?:تبلیغات|ﺗﺒﻠﻴﻐﺎت|تبل\S{0,6}غات)|فیلترشک|Dark Reader|VPN|ریفرش\s+کنید|غیرفعال\s+کنید|disable\s+ad-?block|adblocker?)/i;
  const PERSIAN_BLOCKER_NOTICE =
    /(?:PersianBlocker|Persian\s*Blocker|MasterKia|آزادی\s+کاربران|چه\s+چیزی\s+وارد\s+مرورگر|هشدار\s+از\s+طرف\s+لیست\s+PersianBlocker|برگرداندن\s+آزادی\s+کاربران)/i;
  const WARNING_TITLE = /(?:افزونه\s+حذف|ﺗﺒﻠﻴﻐﺎت|VPN|فیلترشک|Dark Reader|ad-?block)/i;
  const SOFT98_CODE_MARKERS =
    /(?:افزونه\s+حذف|ﺗﺒﻠﻴﻐﺎت|Dark Reader|disableDownloadLink|setNullLinkAttributes|checkadBlocker|advertisementrk|text_add_firewall|kaprila|adguard|location\.reload|location\.hash|document\.title|alert-warning|adblock)/i;
  const SCROLL_EVENTS = /^(?:scroll|wheel|mousewheel|touchmove)$/i;
  const AD_SIZE = /^(?:728x90|970x90|468x60|300x250|336x280|240x90|160x600)$/;
  const NAMED_AD_TEXT = /(?:asiatech|آسیا[\u0640\s\u200c-]*تک|آ[\u0640\s\u200c-]*س[\u0640\s\u200c-]*ی[\u0640\s\u200c-]*ا[\u0640\s\u200c-]*ت[\u0640\s\u200c-]*ک)/i;

  function onReady(callback) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", callback, { once: true });
    else callback();
  }

  function preferredLocale() {
    const languages = [navigator.language || "", ...(navigator.languages || [])].filter(Boolean);
    let timeZone = "";
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (_error) {}
    return languages.some((language) => /^fa(?:-|$)/i.test(language)) || timeZone === "Asia/Tehran" ? "fa" : "en";
  }

  function text(key) {
    return (STRINGS[LOCALE] && STRINGS[LOCALE][key]) || STRINGS.en[key] || key;
  }

  function readSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { ...DEFAULT_SETTINGS, ...stored, pirateLogo: false, recommendExtension: false };
    } catch (_error) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function writeSettings(next) {
    settings = { ...DEFAULT_SETTINGS, ...next, pirateLogo: false };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      safeConsole("warn", "Soft98 Pro could not persist settings", error);
    }
    installProStyle();
    renderControlPanel();
    schedule(document);
  }

  function safeConsole(level, ...args) {
    try {
      const target = typeof console === "object" && console ? console : null;
      const method = target && typeof target[level] === "function" ? target[level] : target && typeof target.log === "function" ? target.log : null;
      if (method) Function.prototype.apply.call(method, target, args);
    } catch (_error) {}
  }

  function log(level, message, detail) {
    if (!settings.diagnostics) return;
    eventLog.push({ at: new Date().toISOString(), level, message, detail: detail || null });
    if (eventLog.length > 80) eventLog.shift();
    safeConsole(
      level,
      "%cSoft98 Pro%c " + message,
      "background:#101820;color:#92e6a7;padding:2px 6px;border-radius:5px;font-weight:700",
      "color:#9fb3c8",
      detail || ""
    );
  }

  function safeEval(source, thisArg, fallbackSource) {
    if (typeof source !== "string") return source;
    try {
      if (nativeEval) return Function.prototype.call.call(nativeEval, thisArg || window, source);
    } catch (error) {
      recordPatchFailure("native-eval", error, source);
      safeConsole("warn", "Soft98 Pro native eval failed; retrying indirectly", error);
    }
    try {
      return (0, eval)(source);
    } catch (error) {
      recordPatchFailure("indirect-eval", error, source);
      if (typeof fallbackSource === "string" && fallbackSource !== source) {
        safeConsole("warn", "Soft98 Pro patched script failed; trying original source once", error);
        return safeEval(fallbackSource, thisArg);
      }
      safeConsole("warn", "Soft98 Pro eval skipped invalid script instead of breaking the page", error);
      return undefined;
    }
  }

  function syntaxErrorFor(code) {
    try {
      Function(String(code || ""));
      return null;
    } catch (error) {
      return error;
    }
  }

  function recordPatchFailure(stage, error, source) {
    const entry = {
      stage,
      message: error && error.message ? error.message : String(error || "unknown error"),
      preview: String(source || "").slice(0, 180),
    };
    stats.patchFailures.push(entry);
    log("warn", "patch step skipped", entry);
  }

  function asElement(node) {
    return node && node.nodeType === Node.ELEMENT_NODE ? node : null;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (_error) {
      return value;
    }
  }

  function isBadHref(value) {
    if (!value) return true;
    const trimmed = String(value).trim();
    if (BAD_HREF.test(trimmed)) return true;
    return trimmed === location.href;
  }

  function normalizeHref(link, href) {
    const value = href || link.getAttribute("href") || "";
    if (isBadHref(value)) return "";
    try {
      return new URL(value, location.href).href;
    } catch (_error) {
      return value;
    }
  }

  function linkLabel(link) {
    return (link.textContent || link.getAttribute("title") || link.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
  }

  function visibleBox(node) {
    if (!node || !node.getBoundingClientRect) return { width: 0, height: 0 };
    const rect = node.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  function isExternalAdHref(value) {
    if (!value) return false;
    try {
      const url = new URL(value, location.href);
      const sameSoft98 = /(^|\.)soft98\.ir$/i.test(url.hostname) || /(^|\.)forum\.soft98\.ir$/i.test(url.hostname);
      return !sameSoft98 || /(?:utm_(?:source|medium|campaign)|banner|kaprila|ad)/i.test(url.search + " " + url.pathname);
    } catch (_error) {
      return /(?:utm_|banner|kaprila|ad)/i.test(value);
    }
  }

  function adComparableText(node) {
    if (!node) return "";
    const parts = [
      node.getAttribute && node.getAttribute("title"),
      node.getAttribute && node.getAttribute("aria-label"),
      node.getAttribute && node.getAttribute("alt"),
      node.getAttribute && node.getAttribute("href"),
      node.getAttribute && node.getAttribute("src"),
      node.id || "",
      node.className || "",
    ];
    if (node.childNodes) {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) parts.push(child.textContent || "");
      }
    }
    if (node.children) {
      for (const child of node.children) {
        if (!child.matches || !child.matches("h1,h2,h3,h4,h5,h6,header,[class*='title'],[class*='head'],a,img")) continue;
        parts.push(child.textContent || "", child.getAttribute("title"), child.getAttribute("aria-label"), child.getAttribute("alt"), child.getAttribute("href"), child.getAttribute("src"));
      }
    }
    return parts
      .filter(Boolean)
      .join(" ")
      .replace(/\u0640/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function headingCardFromSignals(heading) {
    if (!heading || !/^H[1-6]$/.test(heading.tagName)) return null;
    const header = heading.closest("header");
    const card = (header && header.closest("section,article,aside")) || (header && header.parentElement);
    if (!card || card === document.body || card === document.documentElement || isProtectedContentContainer(card)) return null;
    const headingLength = String(heading.textContent || "").normalize("NFKC").replace(/[\u0640\u200c\u200d\s]+/g, "").length;
    const cardTextLength = String(card.textContent || "").replace(/\s+/g, " ").trim().length;
    if (!headingLength || headingLength > 40 || cardTextLength > 220) return null;
    if (card.querySelector("p,ul,ol,dl,table,form,pre,code,audio,video")) return null;

    const media = [...card.querySelectorAll("iframe,img,picture,object,embed")];
    const adShapedMedia = media.filter((node) => {
      const box = visibleBox(node);
      const area = box.width * box.height;
      const ratio = box.height ? box.width / box.height : 0;
      return area >= 36000 && area <= 360000 && ratio >= 0.45 && ratio <= 4.5;
    });
    const externalMedia = media.filter((node) => {
      const value = node.currentSrc || node.src || node.data || node.getAttribute("src") || node.getAttribute("data") || "";
      const destination = node.closest("a[href]") || card.querySelector("a[href]");
      const href = destination && (destination.href || destination.getAttribute("href"));
      return isExternalAdHref(value) || isExternalAdHref(href);
    });
    const bodyText = [...card.children]
      .filter((child) => child !== header && child.tagName !== "HR")
      .map((child) => child.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const emptyShell = !bodyText && !card.querySelector("a[href],button,input,textarea,select");
    const compactCardLength = String(card.textContent || "").normalize("NFKC").replace(/[\u0640\u200c\u200d\s]+/g, "").length;
    const orphanedMediaShell = emptyShell && Boolean(precedingCardSeparator(card)) && compactCardLength === headingLength;
    return (adShapedMedia.length > 0 && externalMedia.length > 0) || orphanedMediaShell ? card : null;
  }

  function precedingCardSeparator(card) {
    if (!card) return null;
    if (card.previousElementSibling && card.previousElementSibling.matches("hr")) return card.previousElementSibling;
    const parent = card.parentElement;
    if (parent && card === parent.firstElementChild && parent.previousElementSibling && parent.previousElementSibling.matches("hr")) {
      return parent.previousElementSibling;
    }
    return null;
  }

  function removeHeadingAdCards(root) {
    const element = asElement(root) || document;
    const headings = [];
    if (element.matches && /^H[1-6]$/.test(element.tagName)) headings.push(element);
    if (element.querySelectorAll) headings.push(...element.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    const cards = new Set(headings.map(headingCardFromSignals).filter(Boolean));
    for (const card of cards) {
      if (!document.contains(card)) continue;
      const separator = precedingCardSeparator(card);
      const parent = card.parentElement;
      card.remove();
      if (separator && document.contains(separator)) separator.remove();
      if (parent && parent !== document.body && !parent.textContent.trim() && !parent.querySelector(":scope > :not(hr)")) parent.remove();
      stats.adsRemoved += 1;
      log("info", "removed ad card from structural signals", { tag: card.tagName, media: card.querySelectorAll("iframe,img,picture,object,embed").length });
    }
  }

  function hasNamedAdMarker(node) {
    const value = adComparableText(node);
    return NAMED_AD_TEXT.test(value);
  }

  function isLikelyNamedAdFrame(node) {
    const element = asElement(node);
    if (!element || element === document.documentElement || element === document.body) return false;
    if (!hasNamedAdMarker(element) || isProtectedContentContainer(element)) return false;
    const box = visibleBox(element);
    if (!box.width && !box.height) return false;
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const area = Math.max(1, box.width * box.height);
    const hasAdPayload = Boolean(element.querySelector("a[href], img, iframe, object, embed, picture, source")) || ["A", "IMG", "IFRAME"].includes(element.tagName);
    const compact = (adComparableText(element).length < 260 && area < viewportArea * 0.24) || /(?:side|banner|ads?|adv|tabligh|تبلیغ)/i.test(String(element.className || ""));
    return compact || hasAdPayload;
  }

  function isLikelyAdSurface(node) {
    const element = asElement(node);
    if (!element) return false;
    if (isLikelyNamedAdFrame(element)) return true;
    const image = element.tagName === "IMG" ? element : element.querySelector && element.querySelector("img");
    const link = element.closest && element.closest("a[href]");
    const href = link ? link.href || link.getAttribute("href") : element.getAttribute("href");
    if (BLOCKED_URL.test(href || element.getAttribute("src") || "")) return true;
    if (!image) return false;
    const src = image.currentSrc || image.src || image.getAttribute("src") || "";
    const box = visibleBox(image);
    const size = `${box.width}x${box.height}`;
    const firstPartyAdAsset = /img\.soft98\.ir\/(?:ads?|[0-9]+)\//i.test(src);
    const adSized = AD_SIZE.test(size);
    return (firstPartyAdAsset && adSized) || (adSized && isExternalAdHref(href)) || isGeneratedAdFamily(link, image);
  }

  function tokenList(node) {
    if (!node) return [];
    return [node.id || "", node.className || ""]
      .join(" ")
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function tokenStem(token) {
    const match = token.match(/^(.+?)(?:[-_]*(?:link|url|href|image|img|banner|ad|ads|inner|download|box|item))$/i);
    return match ? match[1] : token;
  }

  function isGeneratedAdFamily(link, image) {
    if (!link || !image || !isExternalAdHref(link.href || link.getAttribute("href"))) return false;
    const linkStems = new Set(tokenList(link).map(tokenStem).filter((token) => token.length >= 3));
    const imageStems = tokenList(image).map(tokenStem).filter((token) => token.length >= 3);
    for (const stem of imageStems) {
      if (linkStems.has(stem) && /[a-z]/i.test(stem) && (/\d/.test(stem) || stem.length >= 5)) return true;
    }
    return false;
  }

  function adRemovalRoot(node) {
    const element = asElement(node);
    if (!element) return null;
    const link = element.closest && element.closest("a[href]");
    if (link && isLikelyAdSurface(link)) return link;
    if (isLikelyNamedAdFrame(element)) return bestAdFrameRoot(element);
    return element;
  }

  function bestAdFrameRoot(element) {
    let best = element;
    for (let parent = element.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
      if (!hasNamedAdMarker(parent) || isProtectedContentContainer(parent)) break;
      const box = visibleBox(parent);
      if (!box.width && !box.height) break;
      const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
      const area = Math.max(1, box.width * box.height);
      const text = adComparableText(parent);
      if (text.length > 360 || area > viewportArea * 0.28) break;
      best = parent;
    }
    return best;
  }

  function rememberLink(link) {
    const href = normalizeHref(link);
    if (!href) return false;
    const previous = savedHref.get(link);
    if (previous && previous !== href && !isBadHref(previous)) return false;
    savedHref.set(link, href);
    trackedLinks.add(link);
    link.setAttribute(DATA_HREF, href);
    link.setAttribute(DATA_STATE, "preserved");
    stats.linksPreserved += 1;
    log("info", "preserved download link", { label: linkLabel(link), href });
    return true;
  }

  function restoreLink(link) {
    const href = savedHref.get(link) || link.getAttribute(DATA_HREF) || "";
    if (!href || isBadHref(href)) return false;
    const current = link.getAttribute("href") || "";
    if (isBadHref(current) || normalizeHref(link, current) !== href) {
      link.setAttribute("href", href);
      link.setAttribute(DATA_STATE, "restored");
      stats.linksRestored += 1;
      log("warn", "restored sabotaged link", { label: linkLabel(link), href });
    }
    link.removeAttribute("onclick");
    link.removeAttribute("data-toggle");
    link.removeAttribute("data-target");
    link.removeAttribute("target");
    return true;
  }

  function collectLinks(root) {
    const element = asElement(root) || document;
    const links = [];
    if (element.matches && element.matches(SELECTORS.links)) links.push(element);
    if (element.querySelectorAll) links.push(...element.querySelectorAll(SELECTORS.links));
    let lost = 0;
    for (const link of links) {
      if (rememberLink(link)) continue;
      if (trackedLinks.has(link) || link.hasAttribute(DATA_HREF)) restoreLink(link);
      else if (isBadHref(link.getAttribute("href"))) lost += 1;
    }
    if (lost) recoverLinksFromFreshPage();
  }

  function matchRecoveredLink(target, candidates) {
    const label = linkLabel(target);
    if (!label) return null;
    const matches = candidates.filter((candidate) => linkLabel(candidate) === label);
    return matches.length === 1 ? normalizeHref(matches[0]) : null;
  }

  function recoverLinksFromFreshPage() {
    if (recoveryStarted || !nativeFetch || !window.DOMParser) return;
    recoveryStarted = true;
    nativeFetch(location.href, { credentials: "same-origin", cache: "reload" })
      .then((response) => (response.ok ? response.text() : ""))
      .then((html) => {
        if (!html) return;
        const doc = new DOMParser().parseFromString(html, "text/html");
        const candidates = [...doc.querySelectorAll(SELECTORS.links)].filter((link) => !isBadHref(link.getAttribute("href")));
        for (const link of document.querySelectorAll(SELECTORS.links)) {
          if (!isBadHref(link.getAttribute("href"))) continue;
          const recovered = matchRecoveredLink(link, candidates);
          if (!recovered) continue;
          savedHref.set(link, recovered);
          trackedLinks.add(link);
          link.setAttribute(DATA_HREF, recovered);
          restoreLink(link);
        }
      })
      .catch(() => {})
      .finally(() => {
        window.setTimeout(() => {
          recoveryStarted = false;
        }, 5000);
      });
  }

  function removeExternalAds(root) {
    if (!settings.blockAds) return;
    removeHeadingAdCards(root);
    const element = asElement(root) || document;
    const nodes = [];
    if (element.matches && element.matches(SELECTORS.removableAds)) nodes.push(element);
    if (element.querySelectorAll) nodes.push(...element.querySelectorAll(SELECTORS.removableAds));
    if (element.matches && (isLikelyNamedAdFrame(element) || (["A", "IMG", "IFRAME"].includes(element.tagName) && isLikelyAdSurface(element)))) nodes.push(element);
    if (element.querySelectorAll) {
      for (const node of element.querySelectorAll("a[href], img, iframe")) {
        if (isLikelyAdSurface(node)) nodes.push(node);
      }
      for (const node of element.querySelectorAll("aside, section, div")) {
        if (isLikelyNamedAdFrame(node)) nodes.push(node);
      }
    }
    for (const node of nodes) {
      const removable = adRemovalRoot(node);
      if (removable) {
        removable.remove();
        stats.adsRemoved += 1;
        log("info", "removed ad surface", { tag: removable.tagName, id: removable.id || "", className: removable.className || "" });
      }
    }
  }

  function isWarningNode(node) {
    const element = asElement(node);
    if (!element || element === document.documentElement || element === document.body) return false;
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    if (!WARNING_TEXT.test(text)) return false;
    if (isProtectedContentContainer(element)) return false;
    if (element.matches(SELECTORS.warningCandidates)) return true;
    if (element.classList.contains("dbdnone")) return true;
    return isCompactNotice(element) && Boolean(element.querySelector("a[href*='support'], a[href*='SMostafa'], a[href*='telegram']"));
  }

  function isExternalBlockerNotice(node) {
    const element = asElement(node);
    if (!element || element === document.documentElement || element === document.body) return false;
    if (isProtectedContentContainer(element)) return false;
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    const inline = [element.id, element.className, element.getAttribute("style"), element.getAttribute("href")].join(" ");
    if (!PERSIAN_BLOCKER_NOTICE.test(`${text} ${inline}`)) return false;
    const box = visibleBox(element);
    const fixed = /(?:^|;)\s*position\s*:\s*(?:fixed|sticky)/i.test(element.getAttribute("style") || "") || getComputedStyle(element).position === "fixed";
    const intrusive = fixed || box.height >= 40 || box.width >= Math.min(320, Math.round(window.innerWidth * 0.45));
    return (intrusive || Boolean(element.querySelector("a[href*='PersianBlocker'], a[href*='MasterKia']"))) && isCompactNotice(element);
  }

  function isProtectedContentContainer(element) {
    if (!element || !element.querySelectorAll) return false;
    if (element.matches("html,body,main,article,#content,#main,.content,.main,.entry,.post,.download-list,.download-list-item")) return true;
    if (element.querySelector("main,article,#content,#main,.content,.main,.entry,.post,.download-list,.download-list-item")) return true;
    const links = element.querySelectorAll("a[href]");
    if (links.length >= 5) return true;
    return Boolean(element.querySelector(SELECTORS.links));
  }

  function isCompactNotice(element) {
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    const box = visibleBox(element);
    const fixed = getComputedStyle(element).position === "fixed" || getComputedStyle(element).position === "sticky";
    if (fixed) return text.length < 1800;
    if (!box.width && !box.height) return text.length < 800;
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const area = Math.max(1, box.width * box.height);
    return text.length < 1000 && area < viewportArea * 0.35;
  }

  function removeWarnings(root) {
    const element = asElement(root) || document;
    const candidates = new Set();
    if (isWarningNode(element)) candidates.add(element);
    if (element.querySelectorAll) element.querySelectorAll(SELECTORS.warningCandidates).forEach((candidate) => candidates.add(candidate));
    if (element.querySelectorAll) {
      element.querySelectorAll("div,section,aside,header,footer,a,p,span").forEach((candidate) => candidates.add(candidate));
    }
    const ordered = [...candidates].sort((left, right) => {
      const leftText = (left.textContent || "").length;
      const rightText = (right.textContent || "").length;
      if (leftText !== rightText) return leftText - rightText;
      return domDepth(right) - domDepth(left);
    });
    for (const candidate of ordered) {
      if (!document.contains(candidate)) continue;
      if (isWarningNode(candidate)) {
        candidate.remove();
        stats.warningsRemoved += 1;
        log("warn", "removed Soft98 warning node", { id: candidate.id || "", className: candidate.className || "" });
      } else if (isExternalBlockerNotice(candidate)) {
        candidate.remove();
        stats.blockerNoticesRemoved += 1;
        log("warn", "removed external blocker notice", { id: candidate.id || "", className: candidate.className || "" });
      }
    }
    const hash = safeDecode(location.hash || "");
    if (hash && WARNING_TITLE.test(hash)) history.replaceState(null, document.title, `${location.pathname}${location.search}`);
    if (!originalTitle && document.title && !WARNING_TITLE.test(document.title)) originalTitle = document.title;
    if (originalTitle && WARNING_TITLE.test(document.title)) document.title = originalTitle;
  }

  function removeLegacyBanners() {
    for (const node of document.querySelectorAll("#soft98-ad-blocker-taunt,#soft98-extension-recommendation")) {
      node.remove();
    }
  }

  function domDepth(element) {
    let depth = 0;
    for (let node = element; node && node.parentElement; node = node.parentElement) depth += 1;
    return depth;
  }

  function processRoot(root) {
    removeLegacyBanners();
    collectLinks(root);
    removeExternalAds(root);
    removeWarnings(root);
    applyProThemeHeuristics(root);
  }

  function schedule(root) {
    if (root) pendingRoots.add(root);
    if (scheduled) return;
    scheduled = true;
    enqueueMicrotask(() => {
      scheduled = false;
      const roots = pendingRoots.size ? [...pendingRoots] : [document];
      pendingRoots.clear();
      for (const item of roots) processRoot(item);
      for (const link of trackedLinks) {
        if (document.contains(link)) restoreLink(link);
        else trackedLinks.delete(link);
      }
      applyLinkBadges();
      announceSuccess();
    });
  }

  function installStyle() {
    const style = document.createElement("style");
    style.id = "soft98-ad-blocker-style";
    style.textContent = `
      #kaprila_soft98_ir_related,[id^="kaprila"],[id*="kaprila"],[class*="kaprila"],
      .download-list-item-buysellads,[class*="buysellads"],#footer-bitcoin,iframe[src*="kaprila.com"],
      .tbd_ibd,.tbdc,.trk_irk,.alert-warning,[role="alert"],
      #soft98-ad-blocker-taunt,#soft98-extension-recommendation{display:none!important}
      [id*="PersianBlocker"],[class*="PersianBlocker"]{display:none!important}
      a[${DATA_HREF}]{pointer-events:auto}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function installProStyle() {
    const previous = document.getElementById("soft98-pro-style");
    if (previous) previous.remove();
    if (!settings.pro || !settings.darkDesign) {
      document.documentElement.classList.remove("soft98-pro-theme");
      document.querySelectorAll("[data-soft98-pro-surface],[data-soft98-pro-tone]").forEach((node) => {
        node.removeAttribute("data-soft98-pro-surface");
        node.removeAttribute("data-soft98-pro-tone");
      });
      updateFavicon();
      return;
    }
    document.documentElement.classList.add("soft98-pro-theme");
    const style = document.createElement("style");
    style.id = "soft98-pro-style";
    style.textContent = `
      :root.soft98-pro-theme{color-scheme:dark;--s98p-bg:#080c10;--s98p-bg-2:#0d141b;--s98p-nav:#0e171e;--s98p-surface:#121d25;--s98p-surface-2:#172631;--s98p-elevated:#1b2b35;--s98p-soft:#243744;--s98p-border:#344955;--s98p-border-soft:#253640;--s98p-text:#eef7f8;--s98p-muted:#aec0c5;--s98p-faint:#7f949b;--s98p-accent:#7ce0bd;--s98p-accent-2:#d5b56f;--s98p-link:#91d6ff;--s98p-danger:#ff8a9a}
      .soft98-pro-theme,.soft98-pro-theme body{background:#080c10!important;color:var(--s98p-text)!important}
      .soft98-pro-theme body{background:linear-gradient(180deg,#101a21 0,#0b1117 26rem,#080c10 100%)!important}
      .soft98-pro-theme body,.soft98-pro-theme p,.soft98-pro-theme li,.soft98-pro-theme dd,.soft98-pro-theme td,.soft98-pro-theme span{color:var(--s98p-text)}
      .soft98-pro-theme small,.soft98-pro-theme time,.soft98-pro-theme [data-soft98-pro-tone=muted]{color:var(--s98p-muted)!important}
      .soft98-pro-theme [data-soft98-pro-tone=body]{color:var(--s98p-text)!important}
      .soft98-pro-theme a{color:var(--s98p-link)!important;text-decoration-color:rgba(141,200,255,.45)}
      .soft98-pro-theme a:hover{color:#c9e7ff!important;text-decoration-color:var(--s98p-accent)}
      .soft98-pro-theme hr{border-color:var(--s98p-border)!important}
      .soft98-pro-theme nav,.soft98-pro-theme [role=navigation],.soft98-pro-theme [data-soft98-pro-surface=nav]{background:linear-gradient(180deg,var(--s98p-nav),#0b1218)!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important;box-shadow:0 12px 30px rgba(0,0,0,.34),0 1px 0 rgba(255,255,255,.04) inset}
      .soft98-pro-theme header{background:linear-gradient(180deg,var(--s98p-surface-2),var(--s98p-surface))!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme main,.soft98-pro-theme article,.soft98-pro-theme aside,.soft98-pro-theme section,.soft98-pro-theme [role=dialog],.soft98-pro-theme [role=menu],.soft98-pro-theme [role=listbox],.soft98-pro-theme [data-soft98-pro-surface=raised]{background:linear-gradient(180deg,var(--s98p-surface),#101920)!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme [role=menu],.soft98-pro-theme [role=listbox],.soft98-pro-theme [role=dialog]{box-shadow:0 18px 40px rgba(0,0,0,.42)!important}
      .soft98-pro-theme [role=tab],.soft98-pro-theme [data-toggle=tab]{background:var(--s98p-bg-2)!important;background-image:none!important;border-color:var(--s98p-border)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme [role=tab][aria-selected=true],.soft98-pro-theme [data-toggle=tab][aria-selected=true],.soft98-pro-theme [aria-current=page]{background:linear-gradient(180deg,var(--s98p-soft),var(--s98p-surface))!important;border-color:#537695!important;color:#ffffff!important}
      .soft98-pro-theme [role=tab] *,.soft98-pro-theme [data-toggle=tab] *{background:transparent!important;color:inherit!important}
      .soft98-pro-theme h1,.soft98-pro-theme h2,.soft98-pro-theme h3,.soft98-pro-theme h4,.soft98-pro-theme h5,.soft98-pro-theme h6,.soft98-pro-theme strong{color:#f7fbff!important}
      .soft98-pro-theme dt,.soft98-pro-theme dd{background:rgba(13,20,27,.74)!important;border-color:rgba(124,224,189,.16)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme dd:nth-child(odd){background:rgba(23,38,49,.72)!important}
      .soft98-pro-theme [role=alert]{background:rgba(255,209,102,.12)!important;border-color:rgba(255,209,102,.36)!important;color:#ffe6a3!important}
      .soft98-pro-theme button,.soft98-pro-theme [role=button],.soft98-pro-theme input[type=button],.soft98-pro-theme input[type=submit]{border-color:var(--s98p-border)!important;background:linear-gradient(180deg,var(--s98p-soft),#192832)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme button:hover,.soft98-pro-theme [role=button]:hover{background:linear-gradient(180deg,#2a414f,#1d303b)!important;border-color:rgba(124,224,189,.46)!important;color:#fff!important}
      .soft98-pro-theme button *,.soft98-pro-theme [role=button] *,.soft98-pro-theme button:before,.soft98-pro-theme [role=button]:before{background-color:transparent!important;color:inherit!important}
      .soft98-pro-theme input,.soft98-pro-theme textarea,.soft98-pro-theme select{border-color:var(--s98p-border)!important;background:var(--s98p-bg-2)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme table,.soft98-pro-theme thead,.soft98-pro-theme tbody,.soft98-pro-theme tr,.soft98-pro-theme th,.soft98-pro-theme td{background-color:transparent!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme img{filter:saturate(.95) contrast(1.02)}
      .soft98-pro-theme pre,.soft98-pro-theme code{background:#071018!important;border-color:var(--s98p-border)!important;color:#d8f8ff!important}
      .soft98-pro-theme ::selection{background:rgba(116,224,176,.32);color:#fff}
      .soft98-pro-link-badge{margin-inline-start:.45em;padding:.12em .45em;border:1px solid rgba(112,225,178,.42);border-radius:999px;color:#baffd8;background:rgba(112,225,178,.12);font-size:.78em;vertical-align:middle}
    `;
    (document.head || document.documentElement).appendChild(style);
    updateFavicon();
  }

  function colorMetrics(value) {
    const match = String(value || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i);
    if (!match) return null;
    const channels = match.slice(1, 4).map((part) => Number(part) / 255).map((part) => (part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4));
    return { luminance: 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2], alpha: match[4] === undefined ? 1 : Number(match[4]) };
  }

  function applyProThemeHeuristics(root) {
    if (!settings.pro || !settings.darkDesign) return;
    const element = asElement(root) || document;
    const surfaces = [];
    if (element.matches && element.matches("header,nav,main,article,aside,section,footer,form,table,[role]")) surfaces.push(element);
    if (element.querySelectorAll) surfaces.push(...element.querySelectorAll("header,nav,main,article,aside,section,footer,form,table,[role],div"));
    for (const node of surfaces) {
      if (node.closest("#soft98-pro-control,#soft98-extension-recommendation")) continue;
      const box = visibleBox(node);
      if (box.width < 120 || box.height < 28 || box.width * box.height < 4200) continue;
      const background = colorMetrics(getComputedStyle(node).backgroundColor);
      if (!background || background.alpha < 0.45 || background.luminance < 0.55) continue;
      node.setAttribute("data-soft98-pro-surface", node.matches("nav,[role=navigation]") ? "nav" : "raised");
    }

    const textNodes = [];
    if (element.matches && element.matches("p,span,li,dt,dd,td,th,label,strong,small,time")) textNodes.push(element);
    if (element.querySelectorAll) textNodes.push(...element.querySelectorAll("p,span,li,dt,dd,td,th,label,strong,small,time"));
    for (const node of textNodes) {
      if (node.closest("#soft98-pro-control,#soft98-extension-recommendation")) continue;
      const foreground = colorMetrics(getComputedStyle(node).color);
      if (!foreground || foreground.alpha < 0.5 || foreground.luminance > 0.42) continue;
      node.setAttribute("data-soft98-pro-tone", node.matches("small,time") ? "muted" : "body");
    }
  }

  function updateFavicon() {
    const state = settings.pro && settings.darkDesign ? "pro" : successAnnounced ? "success" : "";
    if (state === faviconState) return;
    const previous = document.getElementById(FAVICON_ID);
    if (previous) previous.remove();
    if (!state) {
      faviconState = "";
      return;
    }
    const href = drawFavicon(state);
    if (!href) return;
    const link = document.createElement("link");
    link.id = FAVICON_ID;
    link.rel = "icon";
    link.type = "image/png";
    link.href = href;
    (document.head || document.documentElement).appendChild(link);
    faviconState = state;
  }

  function drawFavicon(state) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext && canvas.getContext("2d");
      if (!ctx) return "";
      const pro = state === "pro";
      const background = pro ? "#08111a" : "#f7fbff";
      const foreground = pro ? "#70e1b2" : "#1fb36b";
      const shadow = pro ? "rgba(112,225,178,.32)" : "rgba(31,179,107,.28)";
      const ring = pro ? "#253f58" : "#d4e7f4";
      const accent = pro ? "#ffd166" : "#2f80ed";
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = background;
      roundRect(ctx, 4, 4, 56, 56, 14);
      ctx.fill();
      ctx.strokeStyle = ring;
      ctx.lineWidth = 4;
      roundRect(ctx, 6, 6, 52, 52, 12);
      ctx.stroke();
      ctx.shadowColor = shadow;
      ctx.shadowBlur = pro ? 8 : 5;
      ctx.fillStyle = foreground;
      ctx.font = "800 42px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("S", 32, 34);
      ctx.shadowBlur = 0;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(49, 16, pro ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (pro) {
        ctx.strokeStyle = foreground;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(17, 46);
        ctx.lineTo(47, 46);
        ctx.stroke();
      }
      return canvas.toDataURL("image/png");
    } catch (error) {
      safeConsole("warn", "Soft98 Pro could not render the canvas favicon", error);
      return "";
    }
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const size = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + size, y);
    ctx.lineTo(x + width - size, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + size);
    ctx.lineTo(x + width, y + height - size);
    ctx.quadraticCurveTo(x + width, y + height, x + width - size, y + height);
    ctx.lineTo(x + size, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - size);
    ctx.lineTo(x, y + size);
    ctx.quadraticCurveTo(x, y, x + size, y);
    ctx.closePath();
  }

  function applyLinkBadges() {
    if (!settings.pro || !settings.linkBadges) return;
    for (const link of trackedLinks) {
      if (!document.contains(link) || link.querySelector(".soft98-pro-link-badge")) continue;
      const badge = document.createElement("span");
      badge.className = "soft98-pro-link-badge";
      badge.textContent = text("ready");
      badge.lang = LOCALE;
      badge.dir = RTL ? "rtl" : "ltr";
      link.appendChild(badge);
    }
  }

  function restoreOriginalLogo() {
    const logo = document.querySelector("#logo-link img, a[href='/'] img, a[href='https://soft98.ir/'] img");
    if (logo && logo.getAttribute("data-soft98-original-logo")) {
      logo.src = logo.getAttribute("data-soft98-original-logo") || logo.src;
      logo.removeAttribute("data-soft98-original-logo");
    }
    for (const link of document.querySelectorAll("a[href='/'], a[href='https://soft98.ir/'], a[href='https://soft98.ir']")) {
      const original = link.getAttribute("data-soft98-original-logo");
      if (!original) continue;
      link.style.backgroundImage = original;
      link.style.backgroundSize = "";
      link.style.backgroundRepeat = "";
      link.style.backgroundPosition = "";
      link.removeAttribute("data-soft98-original-logo");
    }
  }

  function readControlPosition() {
    try {
      const stored = JSON.parse(localStorage.getItem(CONTROL_POSITION_KEY) || "null");
      if (!stored || !Number.isFinite(stored.x) || !Number.isFinite(stored.y)) return null;
      return { x: stored.x, y: stored.y };
    } catch (_error) {
      return null;
    }
  }

  function saveControlPosition(position) {
    try {
      localStorage.setItem(CONTROL_POSITION_KEY, JSON.stringify(position));
    } catch (error) {
      safeConsole("warn", "Soft98 Pro could not persist the control position", error);
    }
  }

  function clampControlPosition(position) {
    const size = 42;
    return {
      x: Math.min(Math.max(CONTROL_MARGIN, Math.round(position.x)), Math.max(CONTROL_MARGIN, window.innerWidth - size - CONTROL_MARGIN)),
      y: Math.min(Math.max(CONTROL_MARGIN, Math.round(position.y)), Math.max(CONTROL_MARGIN, window.innerHeight - size - CONTROL_MARGIN)),
    };
  }

  function defaultControlPosition() {
    return clampControlPosition({ x: 16, y: window.innerHeight - 58 });
  }

  function placeControl(wrap, requested, persist) {
    const position = clampControlPosition(requested);
    wrap.style.left = `${position.x}px`;
    wrap.style.top = `${position.y}px`;
    wrap.style.right = "auto";
    wrap.style.bottom = "auto";
    wrap.setAttribute("data-horizontal", position.x + 21 > window.innerWidth / 2 ? "right" : "left");
    wrap.setAttribute("data-vertical", position.y + 21 > window.innerHeight / 2 ? "up" : "down");
    if (persist) saveControlPosition(position);
    return position;
  }

  function renderControlPanel() {
    if (controlAbortController) controlAbortController.abort();
    controlAbortController = new AbortController();
    const signal = controlAbortController.signal;
    const old = document.getElementById("soft98-pro-control");
    if (old) old.remove();
    if (!document.body) return;
    const wrap = document.createElement("div");
    wrap.id = "soft98-pro-control";
    wrap.dir = "ltr";
    wrap.lang = LOCALE;
    wrap.setAttribute("data-open", "false");
    wrap.innerHTML = `
      <button type="button" data-role="toggle" aria-label="${text("product")}: ${text("moveControl")}" title="${text("moveControl")}">☠</button>
      <form aria-hidden="true" dir="${RTL ? "rtl" : "ltr"}" lang="${LOCALE}">
        <header><strong dir="ltr">${text("product")}</strong><small dir="ltr">${VERSION}</small></header>
        ${[
          ["blockAds", text("blockAds")],
          ["patchScripts", text("patchScripts")],
          ["pro", text("pro")],
          ["darkDesign", text("darkDesign")],
          ["linkBadges", text("linkBadges")],
          ["diagnostics", text("diagnostics")],
          ["recommendExtension", text("recommendExtension")],
        ]
          .map(([key, label]) => `<label><input type="checkbox" name="${key}" ${settings[key] ? "checked" : ""}><span dir="${RTL ? "rtl" : "ltr"}">${label}</span></label>`)
          .join("")}
        <footer><button type="button" data-role="scan">${text("scanNow")}</button><button type="button" data-role="close">${text("close")}</button></footer>
      </form>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #soft98-pro-control{position:fixed;z-index:2147483647;width:42px;height:42px;direction:ltr;font:13px/1.4 system-ui,sans-serif;color:#e6f0fa;isolation:isolate}
      #soft98-pro-control>[data-role=toggle]{position:absolute;inset:0;display:grid;place-items:center;width:42px;height:42px;margin:0;padding:0;float:none;border:1px solid #2d4a66;border-radius:50%;background:#101b27;color:#70e1b2;font-size:20px;line-height:1;box-shadow:0 10px 30px rgba(0,0,0,.35);cursor:grab;touch-action:none;user-select:none;transition:transform .18s ease,background-color .18s ease,border-color .18s ease,box-shadow .18s ease}
      #soft98-pro-control[data-dragging=true]>[data-role=toggle]{cursor:grabbing;transform:scale(1.04)}
      #soft98-pro-control>[data-role=toggle]:hover,#soft98-pro-control[data-open=true]>[data-role=toggle]{transform:translateY(-1px) scale(1.04);border-color:#70e1b2;background:#13283a;box-shadow:0 14px 36px rgba(0,0,0,.44),0 0 0 4px rgba(112,225,178,.12)}
      #soft98-pro-control form{position:absolute;left:0;bottom:52px;display:grid;gap:10px;width:min(260px,calc(100vw - 24px));max-height:calc(100vh - 76px);overflow:auto;margin:0;padding:14px;border:1px solid #27405a;border-radius:12px;background:rgba(8,17,26,.96);box-shadow:0 18px 55px rgba(0,0,0,.45);backdrop-filter:blur(14px);transform-origin:left bottom;transform:translateY(10px) scale(.96);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility 0s linear .22s}
      #soft98-pro-control form[dir=rtl]{text-align:right}
      #soft98-pro-control form[dir=ltr]{text-align:left}
      #soft98-pro-control[data-horizontal=right] form{right:0;left:auto;transform-origin:right bottom}
      #soft98-pro-control[data-vertical=down] form{top:52px;bottom:auto;transform:translateY(-10px) scale(.96);transform-origin:left top}
      #soft98-pro-control[data-horizontal=right][data-vertical=down] form{transform-origin:right top}
      #soft98-pro-control[data-open=true] form{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(0) scale(1);transition:opacity .18s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility 0s}
      #soft98-pro-control header{display:flex;justify-content:space-between;align-items:center;color:#f0f7ff}
      #soft98-pro-control small{color:#9db1c6}
      #soft98-pro-control label{display:flex;align-items:center;gap:8px;justify-content:space-between;padding:7px 8px;border:1px solid #1d3145;border-radius:8px;background:#101b27}
      #soft98-pro-control label span{min-width:0;direction:inherit;unicode-bidi:plaintext;text-align:start}
      #soft98-pro-control input{accent-color:#70e1b2}
      #soft98-pro-control footer{display:flex;gap:8px}
      #soft98-pro-control footer button{flex:1;border:1px solid #31506c;border-radius:8px;background:#15283a;color:#e6f0fa;padding:7px;cursor:pointer}
    `;
    wrap.appendChild(style);
    const toggle = wrap.querySelector("[data-role='toggle']");
    let position = placeControl(wrap, readControlPosition() || defaultControlPosition(), false);
    let drag = null;
    let suppressClick = false;
    toggle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false };
      wrap.setAttribute("data-dragging", "true");
      event.preventDefault();
    }, { signal });
    window.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      event.preventDefault();
      position = placeControl(wrap, { x: drag.originX + dx, y: drag.originY + dy }, false);
    }, { signal });
    const finishDrag = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.moved) {
        suppressClick = true;
        position = placeControl(wrap, position, true);
      }
      wrap.setAttribute("data-dragging", "false");
      drag = null;
    };
    window.addEventListener("pointerup", finishDrag, { signal });
    window.addEventListener("pointercancel", finishDrag, { signal });
    toggle.addEventListener("keydown", (event) => {
      if (!event.altKey || !/^Arrow(?:Left|Right|Up|Down)$/.test(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 1 : 12;
      const delta = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      }[event.key];
      position = placeControl(wrap, { x: position.x + delta.x, y: position.y + delta.y }, true);
    }, { signal });
    toggle.addEventListener("click", (event) => {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        return;
      }
      const form = wrap.querySelector("form");
      const open = wrap.getAttribute("data-open") !== "true";
      wrap.setAttribute("data-open", open ? "true" : "false");
      form.setAttribute("aria-hidden", open ? "false" : "true");
    }, { signal });
    wrap.querySelector("[data-role='close']").addEventListener("click", () => {
      const form = wrap.querySelector("form");
      wrap.setAttribute("data-open", "false");
      form.setAttribute("aria-hidden", "true");
    }, { signal });
    wrap.querySelector("[data-role='scan']").addEventListener("click", () => schedule(document));
    wrap.addEventListener("change", (event) => {
      const input = event.target;
      if (!input || input.tagName !== "INPUT") return;
      writeSettings({ ...settings, [input.name]: input.checked });
    }, { signal });
    window.addEventListener("resize", () => {
      position = placeControl(wrap, position, true);
    }, { signal });
    document.body.appendChild(wrap);
  }

  function announceSuccess() {
    if (successAnnounced) return;
    if (!stats.adsRemoved && !stats.linksPreserved && !stats.patches.length) return;
    successAnnounced = true;
    log("info", "boarded successfully", { ...stats });
    safeConsole(
      "info",
      "%cSoft98 Pro%c " + text("successLog"),
      "background:#70e1b2;color:#06120c;padding:4px 8px;border-radius:6px;font-weight:800",
      "color:#9db1c6"
    );
    updateFavicon();
    onReady(() => {
      restoreOriginalLogo();
      removeLegacyBanners();
    });
  }

  function renderExtensionRecommendation() {
    if (!settings.recommendExtension || document.getElementById("soft98-extension-recommendation")) return;
    const panel = document.createElement("aside");
    panel.id = "soft98-extension-recommendation";
    panel.dir = RTL ? "rtl" : "ltr";
    panel.lang = LOCALE;
    panel.innerHTML = `
      <strong>${text("extensionTitle")}</strong>
      <span>${text("extensionBody")}</span>
      <a rel="noopener noreferrer" target="_blank" href="${EXTENSION_REPO}">${text("extensionLink")}</a>
      <button type="button" aria-label="${text("dismiss")}">×</button>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #soft98-extension-recommendation{position:fixed;z-index:2147483646;right:16px;bottom:16px;display:grid;gap:7px;max-width:330px;padding:14px 16px;border:1px solid rgba(112,225,178,.36);border-radius:14px;background:linear-gradient(145deg,rgba(8,17,26,.96),rgba(18,34,48,.96));color:#e6f0fa;box-shadow:0 18px 55px rgba(0,0,0,.42);font:13px/1.7 system-ui,sans-serif}
      #soft98-extension-recommendation span{color:#b8c7d8}
      #soft98-extension-recommendation a{color:#70e1b2;font-weight:800;text-decoration:none}
      #soft98-extension-recommendation button{position:absolute;top:8px;left:8px;border:0;background:transparent;color:#9db1c6;font-size:18px;cursor:pointer}
    `;
    panel.appendChild(style);
    panel.querySelector("button").addEventListener("click", () => {
      writeSettings({ ...settings, recommendExtension: false });
      panel.remove();
    });
    document.body.appendChild(panel);
  }

  function unpackDeanEdwards(source) {
    const trimmed = String(source || "").trim();
    if (!/^eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*r\s*\)/.test(trimmed)) return trimmed;
    const inner = trimmed.replace(/^eval\s*\(/, "").replace(/\)\s*;?\s*$/, "");
    try {
      const unpacked = safeEval(`(${inner})`, window);
      return typeof unpacked === "string" ? unpacked : trimmed;
    } catch (_error) {
      return trimmed;
    }
  }

  function patchSoft98Code(source, origin) {
    if (!settings.patchScripts) return source;
    let code = unpackDeanEdwards(source);
    if (!SOFT98_CODE_MARKERS.test(code)) return source;
    const before = code;
    const patches = [];
    const apply = (name, pattern, replacement) => {
      const next = code.replace(pattern, replacement);
      if (next === code) return;
      const error = syntaxErrorFor(next);
      if (error) {
        recordPatchFailure(name, error, next);
        return;
      }
      patches.push(name);
      code = next;
    };
    apply("anti-adblock-warning-throws", /\bthrow\s+[A-Za-z_$][\w$]*\(\s*\)\s*;?/g, "void 0;");
    apply("anti-adblock-reload-hook", /\blocation\.reload\s*=\s*[A-Za-z_$][\w$]*\s*;?/g, "void 0;");
    apply("anti-adblock-title-hash", /\b(?:location|[A-Za-z_$][\w$]*(?:\.get\(["']location["']\))?)\.hash\s*=\s*[^;]*replace\(\s*\/\\s\+\/g\s*,\s*["_']_["_']\s*\)\s*;?/g, "void 0;");
    apply("legacy-download-null-href", /\.setAttribute\(\s*["']href["']\s*,\s*[^;]*(?:location\.href|["']location\.href["'])[^;]*\)/g, "void 0");
    const withEvent = `${code}\n;try{window.dispatchEvent(new CustomEvent("soft98-ad-blocker:patched",{detail:{origin:${JSON.stringify(
      origin || "eval"
    )},patches:${JSON.stringify(patches)}}}));}catch(_){}`;
    const finalError = syntaxErrorFor(withEvent);
    if (finalError) {
      recordPatchFailure("final-validation", finalError, withEvent);
      return syntaxErrorFor(code) ? source : code;
    }
    code = withEvent;
    if (patches.length) {
      stats.patches.push({ origin: origin || "eval", patches });
      log("info", "patched Soft98 application code", { origin, patches });
    }
    if (code !== before) schedule(document);
    return code;
  }

  function installEvalHijack() {
    if (window.__soft98AdBlockerEvalHijacked) return;
    window.__soft98AdBlockerEvalHijacked = true;
    window.eval = function patchedEval(source) {
      if (typeof source === "string") return safeEval(patchSoft98Code(source, "eval"), this, source);
      if (nativeEval) return Function.prototype.apply.call(nativeEval, this, arguments);
      return source;
    };
  }

  function isSoft98Script(script) {
    if (!script || script.tagName !== "SCRIPT" || script.hasAttribute(DATA_PATCHED)) return false;
    const src = script.src || script.getAttribute("src") || "";
    return SOFT98_SCRIPT.test(src) || BLOCKED_URL.test(src);
  }

  function runPatchedScript(src) {
    if (!nativeFetch) return;
    nativeFetch(src, { credentials: "include", cache: "reload" })
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => {
        if (!text) return;
        safeEval(patchSoft98Code(text, src), window, text);
      })
      .catch(() => {});
  }

  function neutralizeScript(script) {
    if (!isSoft98Script(script)) return;
    const src = script.src || script.getAttribute("src") || "";
    script.setAttribute(DATA_PATCHED, "1");
    script.type = "javascript/blocked-by-soft98-ad-blocker";
    script.removeAttribute("src");
    if (SOFT98_SCRIPT.test(src)) runPatchedScript(src);
    else script.remove();
  }

  function installScriptHijack() {
    const originalAppend = Node.prototype.appendChild;
    const originalInsertBefore = Node.prototype.insertBefore;
    Node.prototype.appendChild = function patchedAppendChild(node) {
      neutralizeScript(node);
      return originalAppend.call(this, node);
    };
    Node.prototype.insertBefore = function patchedInsertBefore(node, child) {
      neutralizeScript(node);
      return originalInsertBefore.call(this, node, child);
    };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
    if (descriptor && descriptor.set && descriptor.get) {
      Object.defineProperty(HTMLScriptElement.prototype, "src", {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          descriptor.set.call(this, value);
          neutralizeScript(this);
        },
      });
    }
  }

  function isSuspiciousDetector(callback) {
    try {
      const source = Function.prototype.toString.call(callback || "");
      return SOFT98_CODE_MARKERS.test(source) || WARNING_TEXT.test(source) || WARNING_TITLE.test(source);
    } catch (_error) {
      return false;
    }
  }

  function installScrollDetectorFirewall() {
    if (window.__soft98ScrollDetectorFirewall) return;
    window.__soft98ScrollDetectorFirewall = true;
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const wrapped = new WeakMap();

    EventTarget.prototype.addEventListener = function patchedAddEventListener(type, callback, options) {
      if (typeof callback !== "function" || !SCROLL_EVENTS.test(String(type || ""))) {
        return originalAdd.call(this, type, callback, options);
      }
      if (isSuspiciousDetector(callback)) {
        stats.scrollDetectorsBlocked += 1;
        log("warn", "blocked scroll-triggered Soft98 detector", { type: String(type) });
        return originalAdd.call(this, type, function noopSoft98ScrollDetector() {
          removeWarnings(document);
        }, options);
      }
      let replacement = wrapped.get(callback);
      if (!replacement) {
        replacement = function guardedScrollListener(event) {
          try {
            return callback.call(this, event);
          } finally {
            removeWarnings(document);
          }
        };
        wrapped.set(callback, replacement);
      }
      return originalAdd.call(this, type, replacement, options);
    };

    EventTarget.prototype.removeEventListener = function patchedRemoveEventListener(type, callback, options) {
      return originalRemove.call(this, type, wrapped.get(callback) || callback, options);
    };

    for (const target of [window, document]) {
      for (const property of ["onscroll", "onwheel", "onmousewheel", "ontouchmove"]) {
        installScrollPropertyFirewall(target, property);
      }
    }
  }

  function installScrollPropertyFirewall(target, property) {
    try {
      let current = null;
      Object.defineProperty(target, property, {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(callback) {
          if (current) target.removeEventListener(property.slice(2), current);
          if (typeof callback !== "function") {
            current = callback || null;
            return;
          }
          if (isSuspiciousDetector(callback)) {
            stats.scrollDetectorsBlocked += 1;
            current = function noopSoft98ScrollPropertyDetector() {
              removeWarnings(document);
            };
          } else {
            current = function guardedScrollPropertyListener(event) {
              try {
                return callback.call(this, event);
              } finally {
                removeWarnings(document);
              }
            };
          }
          target.addEventListener(property.slice(2), current);
        },
      });
    } catch (error) {
      recordPatchFailure(`scroll-property-${property}`, error, "");
    }
  }

  function installClickRepair() {
    for (const eventName of ["click", "mouseover"]) {
      document.addEventListener(
        eventName,
        (event) => {
          const link = event.target && event.target.closest ? event.target.closest(`a[${DATA_HREF}]`) : null;
          if (link) restoreLink(link);
        },
        true
      );
    }
  }

  function installObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          schedule(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          neutralizeScript(node);
          schedule(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "src", "class", "style", "onclick", "target"],
    });
  }

  function resetDocumentHandles() {
    const proto = window.Document && window.Document.prototype;
    if (!proto) return false;
    let restored = 0;
    for (const name of ["querySelector", "querySelectorAll", "getElementsByTagName", "getElementsByClassName", "getElementById"]) {
      try {
        if (typeof proto[name] === "function" && document[name] !== proto[name]) {
          document[name] = proto[name];
          restored += 1;
        }
      } catch (error) {
        recordPatchFailure(`reset-document-${name}`, error, "");
      }
    }
    log(restored ? "warn" : "info", "checked document query handles", { restored });
    return restored > 0;
  }

  function trapCheck(nodes) {
    const list = nodes ? [...nodes] : [...document.querySelectorAll("a[href], img, iframe, [id], [class]")].filter(isLikelyAdSurface);
    const report = [];
    for (const node of list) {
      if (!node || !node.getBoundingClientRect) continue;
      const style = getComputedStyle(node);
      const box = visibleBox(node);
      const trips = [];
      if (style.display === "none") trips.push("display none");
      if (/hidden|collapse/i.test(style.visibility)) trips.push("not visible");
      if (Number(style.opacity) < 1) trips.push("opacity reduced");
      if (style.transform && style.transform !== "none") trips.push("transformed");
      if (box.width < 15 || box.height < 15) trips.push("too small");
      if (/adguard|adblock/i.test(`${style.content || ""} ${node.getAttribute("style") || ""}`)) trips.push("blocker marker");
      if (node.tagName === "IMG" && !node.getAttribute("src")) trips.push("source-less image");
      if (trips.length) report.push({ node, trips, box });
    }
    safeConsole("groupCollapsed", `Soft98 Pro trap check: ${report.length} suspicious node(s)`);
    for (const item of report) safeConsole("warn", item.node, item.trips, item.box);
    safeConsole("groupEnd");
    return report;
  }

  function diagnosticReport() {
    const report = {
      version: VERSION,
      settings: { ...settings },
      stats: { ...stats, patches: [...stats.patches], patchFailures: [...stats.patchFailures] },
      trackedLinks: [...trackedLinks].filter((link) => document.contains(link)).map((link) => ({
        label: linkLabel(link),
        href: link.getAttribute("href") || "",
        preserved: link.getAttribute(DATA_HREF) || "",
        state: link.getAttribute(DATA_STATE) || "",
      })),
      events: [...eventLog],
    };
    safeConsole("info", "Soft98 Pro diagnostics", report);
    return report;
  }

  function init() {
    if (IS_EXTENSION) {
      window.__Soft98AdBlockerExtension = true;
      document.documentElement.setAttribute("data-soft98-ad-blocker", VERSION);
      window.dispatchEvent(new CustomEvent("soft98-ad-blocker:extension-ready", { detail: { version: VERSION } }));
    }
    installStyle();
    installScrollDetectorFirewall();
    resetDocumentHandles();
    installEvalHijack();
    installScriptHijack();
    installProStyle();
    installClickRepair();
    schedule(document);
    installObserver();
    onReady(() => {
      renderControlPanel();
      originalTitle = WARNING_TITLE.test(document.title) ? originalTitle : document.title;
      schedule(document);
      window.setTimeout(() => schedule(document), 750);
      window.setTimeout(() => schedule(document), 2500);
    });
  }

  const publicApi = {
    version: VERSION,
    get settings() {
      return { ...settings };
    },
    get stats() {
      return { ...stats, patches: [...stats.patches], patchFailures: [...stats.patchFailures] };
    },
    get events() {
      return [...eventLog];
    },
    configure: (next) => writeSettings({ ...settings, ...next }),
    openPanel: () => {
      renderControlPanel();
      const wrap = document.querySelector("#soft98-pro-control");
      const form = document.querySelector("#soft98-pro-control form");
      if (wrap && form) {
        wrap.setAttribute("data-open", "true");
        form.setAttribute("aria-hidden", "false");
      }
    },
    patchSoft98Code,
    unpackDeanEdwards,
    diagnostics: diagnosticReport,
    report: diagnosticReport,
    trapCheck,
    resetHandles: resetDocumentHandles,
    scan: () => schedule(document),
    restoreLinks: () => {
      for (const link of trackedLinks) restoreLink(link);
    },
  };

  function exposePublicApi() {
    for (const name of ["Soft98AdBlocker", "Soft98Pro"]) {
      try {
        if (window[name] === publicApi) continue;
        Object.defineProperty(window, name, {
          value: publicApi,
          configurable: true,
          enumerable: false,
          writable: false,
        });
      } catch (_error) {
        try {
          window[name] = publicApi;
        } catch (__error) {}
      }
    }
  }

  exposePublicApi();
  init();
  window.setTimeout(exposePublicApi, 0);
  window.setTimeout(exposePublicApi, 1000);
})();
