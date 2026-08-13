(function soft98AdBlocker() {
  "use strict";

  const VERSION = "__SOFT98_VERSION__";
  const DATA_HREF = "data-soft98-adblocker-href";
  const DATA_STATE = "data-soft98-adblocker-state";
  const DATA_PATCHED = "data-soft98-adblocker-patched-script";
  const UPSTREAM_REQUEST = "data-soft98-pro-upstream-request";
  const UPSTREAM_PAYLOAD_ID = "soft98-pro-upstream-payload";
  const FAVICON_ID = "soft98-pro-favicon";
  const CONTROL_POSITION_KEY = "soft98-ad-blocker.control-position";
  const INTERNAL_MUTATION_ATTRIBUTES = new Set(["class", "style", "aria-expanded", "aria-selected"]);
  const COMPATIBILITY_DISMISS_KEY = "soft98-pro.compatibility-dismissed";
  const CONTROL_MARGIN = 12;
  const enqueueMicrotask = window.queueMicrotask ? window.queueMicrotask.bind(window) : (callback) => Promise.resolve().then(callback);
  const nativeEval = typeof window.eval === "function" ? window.eval : null;
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  const NativeStyleSheet = window.CSSStyleSheet;
  const IS_EXTENSION = "__SOFT98_BUILD_TARGET__" === "extension";
  const STORAGE_KEY = "soft98-ad-blocker.settings";
  const EXTENSION_REPO = "https://github.com/DRSDavidSoft/soft98-pro";
  const COMPATIBILITY_ISSUE = `${EXTENSION_REPO}/issues/new?template=soft98-script-update.yml`;
  const CATALOG = __SOFT98_MESSAGES__;
  const COMPATIBILITY = __SOFT98_COMPATIBILITY__;
  const BRAND_ASSETS = __SOFT98_BRAND_ASSETS__;
  const PatchEngine = globalThis.__Soft98PatchEngine;
  const LOCALE = preferredLocale();
  const RTL = LOCALE === "fa";
  const STRINGS = CATALOG.locales;
  const DEFAULT_SETTINGS = {
    blockAds: true,
    patchScripts: true,
    pro: true,
    darkDesign: true,
    compactLayout: true,
    linkBadges: true,
    pirateLogo: true,
    taunt: false,
    diagnostics: true,
    recommendExtension: __SOFT98_RECOMMEND_EXTENSION__,
    rgbMode: false,
  };
  const savedHref = new WeakMap();
  const trackedLinks = new Set();
  const pendingRoots = new Set();
  const stats = {
    adsRemoved: 0,
    warningsRemoved: 0,
    blockerNoticesRemoved: 0,
    hostileBrandReplacements: 0,
    linksPreserved: 0,
    linksRestored: 0,
    scrollDetectorsBlocked: 0,
    patches: [],
    patchFailures: [],
    scriptCompatibility: null,
  };
  const eventLog = [];
  const persistentStyles = new Map();
  const executedUpstreamScripts = new Set();
  let scheduled = false;
  let recoveryStarted = false;
  let originalTitle = document.title || "";
  let successAnnounced = false;
  let faviconState = "";
  let controlAbortController = null;
  let controlSection = "protection";
  let settings = readSettings();
  let compatibilityState = null;
  let processingDom = false;
  let integrityScheduled = false;

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

  const SOFT98_SCRIPT = /(?:^|\/\/)(?:www\.)?soft98\.ir\/templates\/.*(?:application\.min\.packed|jquery(?:-v[^/?#]+)?(?:\.min\.packed)?)\.js(?:[?#].*)?$/i;
  const BLOCKED_URL = /(?:kaprila\.com|buysellads|\/ads?(?:\/|\.|$)|adservice|advertisement)/i;
  const BAD_HREF = /^(?:\s*|#|javascript:|void\(0\)|about:blank)$/i;
  const WARNING_TEXT =
    /(?:افزونه\s+حذف\s+(?:تبلیغات|ﺗﺒﻠﻴﻐﺎت|تبل\S{0,6}غات)|فیلترشک|Dark Reader|VPN|ریفرش\s+کنید|غیرفعال\s+کنید|disable\s+ad-?block|adblocker?)/i;
  const PERSIAN_BLOCKER_NOTICE =
    /(?:PersianBlocker|Persian\s*Blocker|MasterKia|آزادی\s+کاربران|چه\s+چیزی\s+وارد\s+مرورگر|هشدار\s+از\s+طرف\s+لیست\s+PersianBlocker|برگرداندن\s+آزادی\s+کاربران)/i;
  const HOSTILE_BRAND_MARKER = /s[\W_]*mostafa[\W_]*moosavi/i;
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

  function catalogValue(locale, section, key) {
    let value = STRINGS[locale] && STRINGS[locale][section];
    for (const part of String(key).split(".")) value = value && value[part];
    return value;
  }

  function text(key, variables) {
    const value = catalogValue(LOCALE, "runtime", key) || catalogValue("en", "runtime", key) || key;
    return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
      variables && Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
    );
  }

  function readSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { ...DEFAULT_SETTINGS, ...stored };
    } catch (_error) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function writeSettings(next) {
    settings = { ...DEFAULT_SETTINGS, ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      safeConsole("warn", text("logs.settingsPersistFailed"), error);
    }
    if (IS_EXTENSION) {
      try {
        document.documentElement.setAttribute("data-soft98-pro-settings", encodeURIComponent(JSON.stringify(settings)));
        document.dispatchEvent(new CustomEvent("soft98-pro:settings-changed"));
      } catch (_error) {}
    }
    installProStyle();
    renderControlPanel();
    syncSuccessEnhancements();
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
      `%c${text("product")}%c ${message}`,
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
      safeConsole("warn", text("logs.nativeEvalFailed"), error);
    }
    try {
      return (0, eval)(source);
    } catch (error) {
      recordPatchFailure("indirect-eval", error, source);
      if (typeof fallbackSource === "string" && fallbackSource !== source) {
        safeConsole("warn", text("logs.patchedEvalFailed"), error);
        return safeEval(fallbackSource, thisArg);
      }
      safeConsole("warn", text("logs.invalidEvalSkipped"), error);
      return undefined;
    }
  }

  const syntaxErrorFor = (code) => PatchEngine.syntaxErrorFor(code);

  function recordPatchFailure(stage, error, source) {
    const entry = {
      stage,
      message: error && error.message ? error.message : String(error || text("logs.unknownError")),
      preview: String(source || "").slice(0, 180),
    };
    stats.patchFailures.push(entry);
    log("warn", text("logs.patchStepSkipped"), entry);
  }

  function asElement(node) {
    return node && node.nodeType === Node.ELEMENT_NODE ? node : null;
  }

  function isOwnedInterface(node) {
    const element = asElement(node);
    return Boolean(element && element.closest("#soft98-pro-control,#soft98-pro-compatibility,#soft98-extension-recommendation,#soft98-ad-blocker-taunt"));
  }

  function localizeElement(element) {
    if (!element) return element;
    element.lang = LOCALE;
    element.dir = RTL ? "rtl" : "ltr";
    element.style.setProperty("unicode-bidi", "isolate");
    return element;
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
      log("info", text("logs.adCardRemoved"), { tag: card.tagName, media: card.querySelectorAll("iframe,img,picture,object,embed").length });
    }
  }

  function hasNamedAdMarker(node) {
    const value = adComparableText(node);
    return NAMED_AD_TEXT.test(value);
  }

  function isLikelyNamedAdFrame(node) {
    const element = asElement(node);
    if (!element || element === document.documentElement || element === document.body || isOwnedInterface(element)) return false;
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
    if (!element || isOwnedInterface(element)) return false;
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
    if (previous === href || (trackedLinks.has(link) && link.getAttribute(DATA_HREF) === href)) return false;
    if (previous && previous !== href && !isBadHref(previous)) return false;
    savedHref.set(link, href);
    trackedLinks.add(link);
    link.setAttribute(DATA_HREF, href);
    link.setAttribute(DATA_STATE, "preserved");
    stats.linksPreserved += 1;
    log("info", text("logs.downloadLinkPreserved"), { label: linkLabel(link), href });
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
      log("warn", text("logs.downloadLinkRestored"), { label: linkLabel(link), href });
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
    if (isOwnedInterface(root)) return;
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
        log("info", text("logs.adSurfaceRemoved"), { tag: removable.tagName, id: removable.id || "", className: removable.className || "" });
      }
    }
  }

  function isWarningNode(node) {
    const element = asElement(node);
    if (!element || element === document.documentElement || element === document.body || isOwnedInterface(element)) return false;
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    if (!WARNING_TEXT.test(text)) return false;
    if (isProtectedContentContainer(element)) return false;
    if (element.matches(SELECTORS.warningCandidates)) return true;
    if (element.classList.contains("dbdnone")) return true;
    return isCompactNotice(element) && Boolean(element.querySelector("a[href*='support'], a[href*='SMostafa'], a[href*='telegram']"));
  }

  function isExternalBlockerNotice(node) {
    const element = asElement(node);
    if (!element || element === document.documentElement || element === document.body || isOwnedInterface(element)) return false;
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

  function replaceHostileBranding(root) {
    const scope = asElement(root) || document;
    const branded = new Set();
    const replacement = text("product");
    const replaceValue = (value) => String(value || "").replace(new RegExp(HOSTILE_BRAND_MARKER.source, "gi"), replacement);
    const mark = (element) => {
      if (!element || element.matches("html,body,script,style,noscript,template")) return;
      const surface = element.closest("a,button,aside,section,header,footer,p,span,div") || element;
      if (!surface.matches("html,body")) branded.add(surface);
    };
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,noscript,template,textarea") || !HOSTILE_BRAND_MARKER.test(node.nodeValue || "")) continue;
      node.nodeValue = replaceValue(node.nodeValue);
      mark(parent);
    }
    const candidates = [];
    if (scope.nodeType === Node.ELEMENT_NODE) candidates.push(scope);
    if (scope.querySelectorAll) candidates.push(...scope.querySelectorAll("a[href],[title],[aria-label],[alt]"));
    for (const element of candidates) {
      for (const attribute of ["title", "aria-label", "alt"]) {
        const value = element.getAttribute(attribute);
        if (value && HOSTILE_BRAND_MARKER.test(value)) {
          element.setAttribute(attribute, replaceValue(value));
          mark(element);
        }
      }
      const href = element.getAttribute("href");
      if (href && HOSTILE_BRAND_MARKER.test(href)) {
        element.setAttribute("href", EXTENSION_REPO);
        element.setAttribute("rel", "noopener noreferrer");
        mark(element);
      }
    }
    for (const element of branded) {
      element.setAttribute("data-soft98-pro-brand-replaced", "true");
      localizeElement(element);
    }
    if (branded.size) {
      stats.hostileBrandReplacements += branded.size;
      log("warn", text("logs.hostileBrandReplaced"), { count: branded.size });
    }
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
        log("warn", text("logs.warningRemoved"), { id: candidate.id || "", className: candidate.className || "" });
      } else if (isExternalBlockerNotice(candidate)) {
        candidate.remove();
        stats.blockerNoticesRemoved += 1;
        log("warn", text("logs.blockerNoticeRemoved"), { id: candidate.id || "", className: candidate.className || "" });
      }
    }
    const hash = safeDecode(location.hash || "");
    if (hash && WARNING_TITLE.test(hash)) history.replaceState(null, document.title, `${location.pathname}${location.search}`);
    if (!originalTitle && document.title && !WARNING_TITLE.test(document.title)) originalTitle = document.title;
    if (originalTitle && WARNING_TITLE.test(document.title)) document.title = originalTitle;
  }

  function removeLegacyBanners() {
    const recommendation = document.getElementById("soft98-extension-recommendation");
    if (recommendation && !settings.recommendExtension) recommendation.remove();
    const taunt = document.getElementById("soft98-ad-blocker-taunt");
    if (taunt && (!settings.taunt || !successAnnounced)) taunt.remove();
  }

  function domDepth(element) {
    let depth = 0;
    for (let node = element; node && node.parentElement; node = node.parentElement) depth += 1;
    return depth;
  }

  function processRoot(root) {
    removeLegacyBanners();
    collectLinks(root);
    replaceHostileBranding(root);
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
      processingDom = true;
      try {
        ensureStyleIntegrity();
        for (const item of roots) processRoot(item);
        if (settings.pro && (settings.darkDesign || settings.rgbMode)) {
          applyInteractiveSurfaceHeuristics();
          applyProLayoutHeuristics();
        }
        for (const link of trackedLinks) {
          if (document.contains(link)) restoreLink(link);
          else trackedLinks.delete(link);
        }
        applyLinkBadges();
        announceSuccess();
        refreshControlTelemetry();
      } finally {
        processingDom = false;
      }
    });
  }

  function supportsConstructableStyles() {
    return Boolean(NativeStyleSheet && NativeStyleSheet.prototype && typeof NativeStyleSheet.prototype.replaceSync === "function" && "adoptedStyleSheets" in document);
  }

  function setPersistentStyle(id, cssText, enabled = true) {
    let record = persistentStyles.get(id);
    if (!record) {
      record = { id, cssText: "", enabled: false, sheet: null, node: null };
      persistentStyles.set(id, record);
    }
    record.cssText = String(cssText || "");
    record.enabled = Boolean(enabled);
    if (supportsConstructableStyles()) {
      if (!record.sheet) record.sheet = new NativeStyleSheet();
      record.sheet.replaceSync(record.enabled ? record.cssText : "");
      ensureStyleIntegrity();
      return;
    }
    const existing = document.getElementById(id);
    record.node = existing || record.node;
    if (!record.enabled) {
      if (record.node && record.node.isConnected) record.node.remove();
      record.node = null;
      return;
    }
    if (!record.node || !record.node.isConnected) {
      record.node = document.createElement("style");
      record.node.id = id;
      record.node.setAttribute("data-soft98-pro-owned", "style");
      (document.head || document.documentElement).appendChild(record.node);
    }
    if (record.node.textContent !== record.cssText) record.node.textContent = record.cssText;
  }

  function ensureStyleIntegrity() {
    if (integrityScheduled) return;
    integrityScheduled = true;
    enqueueMicrotask(() => {
      integrityScheduled = false;
      if (supportsConstructableStyles()) {
        const current = document.adoptedStyleSheets || [];
        const required = [...persistentStyles.values()].filter((record) => record.enabled && record.sheet).map((record) => record.sheet);
        const stale = [...persistentStyles.values()].filter((record) => !record.enabled && record.sheet).map((record) => record.sheet);
        const next = [...current.filter((sheet) => !stale.includes(sheet)), ...required.filter((sheet) => !current.includes(sheet))];
        if (next.length !== current.length || next.some((sheet, index) => sheet !== current[index])) document.adoptedStyleSheets = next;
        return;
      }
      for (const record of persistentStyles.values()) {
        if (!record.enabled) continue;
        let node = document.getElementById(record.id);
        if (!node) {
          node = document.createElement("style");
          node.id = record.id;
          node.setAttribute("data-soft98-pro-owned", "style");
          (document.head || document.documentElement).appendChild(node);
        }
        if (node.textContent !== record.cssText) node.textContent = record.cssText;
        record.node = node;
      }
    });
  }

  function installStyle() {
    setPersistentStyle("soft98-ad-blocker-style", `
      #kaprila_soft98_ir_related,[id^="kaprila"],[id*="kaprila"],[class*="kaprila"],
      .download-list-item-buysellads,[class*="buysellads"],#footer-bitcoin,iframe[src*="kaprila.com"],
      .tbd_ibd,.tbdc,.trk_irk,.alert-warning,[role="alert"],
      #soft98-ad-blocker-taunt,#soft98-extension-recommendation{display:none!important}
      :root[data-soft98-runtime-ready] #soft98-ad-blocker-taunt,
      :root[data-soft98-runtime-ready] #soft98-extension-recommendation{display:grid!important}
      [id*="PersianBlocker"],[class*="PersianBlocker"]{display:none!important}
      [data-soft98-pro-brand-replaced]{border:1px solid #b8cbd5!important;border-radius:6px!important;background:#f7fafc!important;color:#1d2a35!important;box-shadow:0 6px 20px rgba(27,45,57,.12)!important;padding:.35em .65em!important;font:600 13px/1.6 system-ui,sans-serif!important;text-decoration:none!important}
      .soft98-pro-theme [data-soft98-pro-brand-replaced]{border-color:var(--s98p-border)!important;background:var(--s98p-surface-2)!important;color:var(--s98p-accent)!important;box-shadow:0 8px 24px rgba(0,0,0,.28)!important}
      a[${DATA_HREF}]{pointer-events:auto}
      [data-soft98-brand-kind=background]{display:block!important;min-height:104px!important;background-size:contain!important;background-repeat:no-repeat!important;background-position:center!important}
      [data-soft98-brand-kind=background]>*{visibility:hidden!important}
      @media(max-width:700px){[data-soft98-brand-kind=background]{min-height:78px!important}}
    `);
  }

  function installProStyle() {
    const active = settings.pro && (settings.darkDesign || settings.rgbMode);
    document.documentElement.classList.toggle("soft98-pro-theme", active);
    document.documentElement.classList.toggle("soft98-pro-rgb", active && settings.rgbMode);
    document.documentElement.classList.toggle("soft98-pro-compact", active && settings.compactLayout);
    const ambient = document.getElementById("soft98-pro-ambient");
    if (ambient) ambient.remove();
    if (!active) {
      setPersistentStyle("soft98-pro-style", "", false);
      document.querySelectorAll("[data-soft98-pro-surface],[data-soft98-pro-tone],[data-soft98-pro-layout],[data-soft98-pro-column],[data-soft98-pro-reading],[data-soft98-pro-list-row],[data-soft98-pro-list-copy]").forEach((node) => {
        node.removeAttribute("data-soft98-pro-surface");
        node.removeAttribute("data-soft98-pro-tone");
        node.removeAttribute("data-soft98-pro-layout");
        node.removeAttribute("data-soft98-pro-column");
        node.removeAttribute("data-soft98-pro-reading");
        node.removeAttribute("data-soft98-pro-list-row");
        node.removeAttribute("data-soft98-pro-list-copy");
      });
      updateFavicon();
      return;
    }
    setPersistentStyle("soft98-pro-style", `
      :root.soft98-pro-theme{color-scheme:dark;--s98p-bg:#070b0f;--s98p-bg-2:#0b1117;--s98p-nav:#0d151b;--s98p-surface:#111a21;--s98p-surface-2:#16222a;--s98p-elevated:#1a2932;--s98p-soft:#223640;--s98p-border:#344852;--s98p-border-soft:#24343c;--s98p-text:#f1f6f7;--s98p-muted:#aabcc1;--s98p-faint:#7f9298;--s98p-accent:#72ddb2;--s98p-accent-2:#e0bd70;--s98p-link:#8fd2f5;--s98p-danger:#ff8896;--s98p-radius:8px}
      .soft98-pro-theme,.soft98-pro-theme body{background:#070b0f!important;color:var(--s98p-text)!important}
      .soft98-pro-theme body{min-height:100vh;background:linear-gradient(180deg,#0e171d 0,#090f14 30rem,#070b0f 100%)!important}
      .soft98-pro-theme body,.soft98-pro-theme p,.soft98-pro-theme li,.soft98-pro-theme dd,.soft98-pro-theme td,.soft98-pro-theme span{color:var(--s98p-text)}
      .soft98-pro-theme small,.soft98-pro-theme time,.soft98-pro-theme [data-soft98-pro-tone=muted]{color:var(--s98p-muted)!important}
      .soft98-pro-theme [data-soft98-pro-tone=body]{color:var(--s98p-text)!important}
      .soft98-pro-theme a{color:var(--s98p-link)!important;text-decoration-color:color-mix(in srgb,var(--s98p-link) 42%,transparent);transition:color .16s ease,text-decoration-color .16s ease,background-color .16s ease,border-color .16s ease,transform .16s ease,box-shadow .2s ease}
      .soft98-pro-theme a:hover{color:#d4efff!important;text-decoration-color:var(--s98p-accent)}
      .soft98-pro-theme a:focus-visible,.soft98-pro-theme button:focus-visible,.soft98-pro-theme input:focus-visible,.soft98-pro-theme select:focus-visible,.soft98-pro-theme textarea:focus-visible{outline:2px solid var(--s98p-accent)!important;outline-offset:3px!important}
      .soft98-pro-theme hr{border-color:var(--s98p-border)!important}
      .soft98-pro-theme nav,.soft98-pro-theme [role=navigation],.soft98-pro-theme [data-soft98-pro-surface=nav]{background:color-mix(in srgb,var(--s98p-nav) 94%,transparent)!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important;box-shadow:0 12px 32px rgba(0,0,0,.3),0 1px 0 rgba(255,255,255,.04) inset;backdrop-filter:blur(14px) saturate(118%)}
      .soft98-pro-theme [data-soft98-pro-surface=nav-shell]{background:rgba(10,17,22,.96)!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important;box-shadow:0 12px 34px rgba(0,0,0,.34)!important;backdrop-filter:blur(18px) saturate(125%)}
      .soft98-pro-theme header{border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme main,.soft98-pro-theme section{background:transparent!important;color:var(--s98p-text)!important}
      .soft98-pro-theme article,.soft98-pro-theme aside,.soft98-pro-theme [role=dialog],.soft98-pro-theme [role=menu],.soft98-pro-theme [role=listbox],.soft98-pro-theme [data-soft98-pro-surface=raised]{background:linear-gradient(180deg,var(--s98p-surface),#0f181e)!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important;box-shadow:0 16px 44px rgba(0,0,0,.26),0 1px 0 rgba(255,255,255,.035) inset}
      .soft98-pro-theme [role=menu],.soft98-pro-theme [role=listbox],.soft98-pro-theme [role=dialog]{box-shadow:0 20px 50px rgba(0,0,0,.44)!important;backdrop-filter:blur(18px) saturate(120%)}
      .soft98-pro-theme [data-soft98-pro-surface=menu],.soft98-pro-theme [data-soft98-pro-surface=megamenu]{background:rgba(12,21,27,.97)!important;background-image:linear-gradient(145deg,rgba(23,39,48,.72),rgba(8,15,20,.7))!important;border:1px solid rgba(117,174,190,.2)!important;color:var(--s98p-text)!important;box-shadow:0 24px 70px rgba(0,0,0,.48),0 1px 0 rgba(255,255,255,.055) inset!important;backdrop-filter:blur(22px) saturate(135%)}
      .soft98-pro-theme [data-soft98-pro-surface=menu] :is(div,ul,ol,li),.soft98-pro-theme [data-soft98-pro-surface=megamenu] :is(div,ul,ol,li){background-color:transparent!important;background-image:none!important;border-color:rgba(122,168,181,.14)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme [data-soft98-pro-surface=menu] :is(a,button),.soft98-pro-theme [data-soft98-pro-surface=megamenu] :is(a,button){background:transparent!important;color:var(--s98p-text)!important;border-color:transparent!important;text-shadow:none!important}
      .soft98-pro-theme [data-soft98-pro-surface=menu] :is(a,button):hover,.soft98-pro-theme [data-soft98-pro-surface=menu] :is(a,button):focus-visible,.soft98-pro-theme [data-soft98-pro-surface=megamenu] :is(a,button):hover,.soft98-pro-theme [data-soft98-pro-surface=megamenu] :is(a,button):focus-visible{background:rgba(113,222,179,.105)!important;color:#fff!important;border-color:rgba(113,222,179,.16)!important}
      .soft98-pro-theme [data-soft98-pro-menu-column]{border-inline-end:1px solid rgba(122,168,181,.13)!important}
      .soft98-pro-theme [data-soft98-pro-menu-column]:last-child{border-inline-end:0!important}
      .soft98-pro-theme [data-soft98-pro-surface=tab-card],.soft98-pro-theme [data-soft98-pro-surface=tab-content],.soft98-pro-theme [data-soft98-pro-surface=tab-pane]{background:linear-gradient(180deg,var(--s98p-surface),#0e171d)!important;background-color:var(--s98p-surface)!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important;box-shadow:none!important}
      .soft98-pro-theme [data-soft98-pro-surface=tab-list]{background:var(--s98p-bg-2)!important;background-image:none!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme [data-soft98-pro-surface=tab-list]>:is(li,div),.soft98-pro-theme [data-soft98-pro-surface=tab-list]>:is(li,div)>:not([role=tab]):not([data-toggle=tab]){background:transparent!important;background-image:none!important;color:inherit!important}
      .soft98-pro-theme [role=tab],.soft98-pro-theme [data-toggle=tab]{background:var(--s98p-bg-2)!important;background-color:var(--s98p-bg-2)!important;background-image:none!important;border-color:var(--s98p-border)!important;color:var(--s98p-text)!important;transition:color .16s ease,border-color .16s ease,box-shadow .18s ease!important}
      .soft98-pro-theme [role=tab][aria-selected=true],.soft98-pro-theme [role=tab].active,.soft98-pro-theme [data-toggle=tab][aria-selected=true],.soft98-pro-theme [data-toggle=tab][aria-expanded=true],.soft98-pro-theme [data-toggle=tab].active,.soft98-pro-theme .active>[data-toggle=tab],.soft98-pro-theme [data-soft98-pro-tab-active=true],.soft98-pro-theme [aria-current=page]{background:linear-gradient(180deg,var(--s98p-soft),var(--s98p-surface))!important;background-color:var(--s98p-surface)!important;border-color:#537695!important;color:#ffffff!important}
      .soft98-pro-theme [role=tab] *,.soft98-pro-theme [data-toggle=tab] *{background:transparent!important;background-color:transparent!important;color:inherit!important}
      .soft98-pro-theme h1,.soft98-pro-theme h2,.soft98-pro-theme h3,.soft98-pro-theme h4,.soft98-pro-theme h5,.soft98-pro-theme h6,.soft98-pro-theme strong{color:#f7fbff!important}
      .soft98-pro-theme dt,.soft98-pro-theme dd{background:rgba(13,20,27,.72)!important;border-color:rgba(124,224,189,.16)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme dd:nth-child(odd){background:rgba(23,38,49,.72)!important}
      .soft98-pro-theme [role=alert]{background:rgba(255,209,102,.12)!important;border-color:rgba(255,209,102,.36)!important;color:#ffe6a3!important}
      .soft98-pro-theme button,.soft98-pro-theme [role=button],.soft98-pro-theme input[type=button],.soft98-pro-theme input[type=submit]{border-color:var(--s98p-border)!important;background:linear-gradient(180deg,var(--s98p-soft),#19272f)!important;color:var(--s98p-text)!important;transition:transform .15s ease,border-color .16s ease,background-color .16s ease,box-shadow .2s ease}
      .soft98-pro-theme button:hover,.soft98-pro-theme [role=button]:hover{background:linear-gradient(180deg,#2a4149,#1d2f37)!important;border-color:rgba(124,224,189,.5)!important;color:#fff!important;transform:translateY(-1px)}
      .soft98-pro-theme button:active,.soft98-pro-theme [role=button]:active{transform:translateY(0) scale(.98)}
      .soft98-pro-theme button *,.soft98-pro-theme [role=button] *,.soft98-pro-theme button:before,.soft98-pro-theme [role=button]:before{background-color:transparent!important;color:inherit!important}
      .soft98-pro-theme input,.soft98-pro-theme textarea,.soft98-pro-theme select{border-color:var(--s98p-border)!important;background:var(--s98p-bg-2)!important;color:var(--s98p-text)!important;transition:border-color .16s ease,box-shadow .16s ease,background-color .16s ease}
      .soft98-pro-theme table,.soft98-pro-theme thead,.soft98-pro-theme tbody,.soft98-pro-theme tr,.soft98-pro-theme th,.soft98-pro-theme td{background-color:transparent!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme img{filter:saturate(.96) contrast(1.02)}
      .soft98-pro-theme pre,.soft98-pro-theme code{background:#071018!important;border-color:var(--s98p-border)!important;color:#d8f8ff!important}
      .soft98-pro-theme ::selection{background:rgba(116,224,176,.32);color:#fff}
      .soft98-pro-link-badge{margin-inline-start:.45em;padding:.12em .45em;border:1px solid rgba(112,225,178,.42);border-radius:999px;color:#baffd8;background:rgba(112,225,178,.12);font-size:.78em;vertical-align:middle}
      .soft98-pro-compact [data-soft98-pro-layout=content-grid]{display:grid!important;grid-template-columns:minmax(0,2fr) minmax(270px,1fr)!important;align-items:start!important;gap:18px!important;direction:ltr!important}
      .soft98-pro-compact [data-soft98-pro-column=primary]{grid-column:1!important;min-width:0!important}
      .soft98-pro-compact [data-soft98-pro-column=secondary]{grid-column:2!important;min-width:0!important}
      .soft98-pro-compact [data-soft98-pro-reading=rtl]{direction:rtl!important}
      .soft98-pro-compact [data-soft98-pro-reading=ltr]{direction:ltr!important}
      .soft98-pro-compact article,.soft98-pro-compact aside{border-radius:var(--s98p-radius)!important}
      .soft98-pro-compact [data-soft98-pro-layout=utility-list]{width:100%!important;min-width:0!important;max-width:none!important}
      .soft98-pro-compact [data-soft98-pro-layout=utility-list] :is(ul,ol){display:grid!important;width:100%!important;min-width:0!important;margin-inline:0!important;padding-inline:0!important}
      .soft98-pro-compact [data-soft98-pro-list-row]{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;align-items:center!important;gap:10px!important;width:100%!important;min-width:0!important;max-width:none!important}
      .soft98-pro-compact [data-soft98-pro-list-copy]{display:grid!important;grid-template-columns:minmax(0,1fr)!important;width:auto!important;min-width:0!important;max-width:none!important;overflow:visible!important}
      .soft98-pro-compact [data-soft98-pro-list-copy] :is(strong,small,span){min-width:0!important;max-width:100%!important;white-space:normal!important;overflow-wrap:break-word!important}
      @property --s98p-neon-hue{syntax:"<angle>";inherits:true;initial-value:155deg}
      .soft98-pro-rgb{--s98p-neon-hue:155deg;--s98p-neon:hsl(var(--s98p-neon-hue) 95% 67%);--s98p-neon-soft:hsl(var(--s98p-neon-hue) 86% 58% / .18);--s98p-bg:#020304;--s98p-bg-2:#050607;--s98p-nav:#060708;--s98p-surface:#080a0b;--s98p-surface-2:#0b0d0f;--s98p-elevated:#101315;--s98p-soft:#15191b;--s98p-border:var(--s98p-neon);--s98p-border-soft:color-mix(in srgb,var(--s98p-neon) 25%,#1b2023);--s98p-text:#d5dadd;--s98p-muted:#858c91;--s98p-faint:#656b70;--s98p-accent:var(--s98p-neon);--s98p-accent-2:color-mix(in srgb,var(--s98p-neon) 72%,#d7dce0);--s98p-link:color-mix(in srgb,var(--s98p-neon) 78%,#dce1e4);animation:soft98-pro-neon 16s linear infinite}
      .soft98-pro-rgb,.soft98-pro-rgb body{background:#020304!important;background-image:none!important}
      .soft98-pro-rgb nav,.soft98-pro-rgb [role=navigation],.soft98-pro-rgb [data-soft98-pro-surface=nav],.soft98-pro-rgb [data-soft98-pro-surface=nav-shell]{background:#060708!important;background-image:none!important;border-color:color-mix(in srgb,var(--s98p-neon) 38%,#202427)!important;box-shadow:0 16px 46px rgba(0,0,0,.62),0 0 18px var(--s98p-neon-soft)!important}
      .soft98-pro-rgb article,.soft98-pro-rgb aside,.soft98-pro-rgb [role=dialog],.soft98-pro-rgb [role=menu],.soft98-pro-rgb [role=listbox],.soft98-pro-rgb [data-soft98-pro-surface=raised],.soft98-pro-rgb [data-soft98-pro-surface=tab-card],.soft98-pro-rgb [data-soft98-pro-surface=tab-content],.soft98-pro-rgb [data-soft98-pro-surface=tab-pane],.soft98-pro-rgb [data-soft98-pro-surface=menu],.soft98-pro-rgb [data-soft98-pro-surface=megamenu]{background:#080a0b!important;background-image:none!important;border-color:color-mix(in srgb,var(--s98p-neon) 28%,#202427)!important;box-shadow:0 20px 52px rgba(0,0,0,.58),0 0 16px color-mix(in srgb,var(--s98p-neon) 10%,transparent)!important;backdrop-filter:blur(18px) saturate(75%)}
      .soft98-pro-rgb article:hover,.soft98-pro-rgb aside:hover,.soft98-pro-rgb [data-soft98-pro-surface=raised]:hover,.soft98-pro-rgb button:hover,.soft98-pro-rgb [role=button]:hover{border-color:color-mix(in srgb,var(--s98p-neon) 72%,#303639)!important;box-shadow:0 22px 58px rgba(0,0,0,.66),0 0 24px var(--s98p-neon-soft)!important}
      .soft98-pro-rgb [role=tab][aria-selected=true],.soft98-pro-rgb [role=tab].active,.soft98-pro-rgb [data-toggle=tab][aria-selected=true],.soft98-pro-rgb [data-toggle=tab][aria-expanded=true],.soft98-pro-rgb [data-toggle=tab].active,.soft98-pro-rgb .active>[data-toggle=tab],.soft98-pro-rgb [data-soft98-pro-tab-active=true],.soft98-pro-rgb [aria-current=page]{background:#111416!important;background-image:none!important;border-color:var(--s98p-neon)!important;color:#f3f6f7!important;box-shadow:0 0 0 1px color-mix(in srgb,var(--s98p-neon) 28%,transparent) inset,0 0 18px var(--s98p-neon-soft)!important}
      .soft98-pro-rgb img:not([data-soft98-brand-kind]){filter:saturate(.18) brightness(.72) contrast(1.08)!important;transition:filter .2s ease}
      .soft98-pro-rgb a:hover img:not([data-soft98-brand-kind]){filter:saturate(.38) brightness(.82) contrast(1.08)!important}
      .soft98-pro-rgb .soft98-pro-link-badge{border-color:var(--s98p-neon);background:#0c0f10;box-shadow:0 0 16px var(--s98p-neon-soft)}
      @keyframes soft98-pro-neon{to{--s98p-neon-hue:515deg}}
      @media(max-width:820px){.soft98-pro-compact [data-soft98-pro-layout=content-grid]{grid-template-columns:minmax(0,1fr)!important}.soft98-pro-compact [data-soft98-pro-column]{grid-column:1!important}.soft98-pro-compact [data-soft98-pro-column=primary]{order:1}.soft98-pro-compact [data-soft98-pro-column=secondary]{order:2}}
      @media(prefers-reduced-motion:reduce){.soft98-pro-theme *{scroll-behavior:auto!important}.soft98-pro-rgb{animation:none!important}.soft98-pro-theme a,.soft98-pro-theme button,.soft98-pro-theme input,.soft98-pro-theme select,.soft98-pro-theme textarea{transition:none!important}}
    `);
    updateFavicon();
  }

  function colorMetrics(value) {
    const match = String(value || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i);
    if (!match) return null;
    const channels = match.slice(1, 4).map((part) => Number(part) / 255).map((part) => (part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4));
    return { luminance: 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2], alpha: match[4] === undefined ? 1 : Number(match[4]) };
  }

  function applyProThemeHeuristics(root) {
    if (!settings.pro || (!settings.darkDesign && !settings.rgbMode)) return;
    const element = asElement(root) || document;
    const surfaces = [];
    if (element.matches && element.matches("header,nav,main,article,aside,section,footer,form,table,[role]")) surfaces.push(element);
    if (element.querySelectorAll) surfaces.push(...element.querySelectorAll("header,nav,main,article,aside,section,footer,form,table,[role],div"));
    for (const node of surfaces) {
      if (node.closest("#soft98-pro-control,#soft98-extension-recommendation,#soft98-ad-blocker-taunt")) continue;
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
      if (node.closest("#soft98-pro-control,#soft98-extension-recommendation,#soft98-ad-blocker-taunt")) continue;
      const foreground = colorMetrics(getComputedStyle(node).color);
      if (!foreground || foreground.alpha < 0.5 || foreground.luminance > 0.42) continue;
      node.setAttribute("data-soft98-pro-tone", node.matches("small,time") ? "muted" : "body");
    }
  }

  function applyInteractiveSurfaceHeuristics() {
    const candidates = new Set();
    for (const navigation of document.querySelectorAll("nav,[role=navigation]")) {
      const shell = navigation.parentElement;
      if (!shell || shell === document.body) continue;
      const box = visibleBox(shell);
      const style = getComputedStyle(shell);
      if (box.width >= window.innerWidth * 0.72 && box.height > 30 && box.height < 120 && /fixed|sticky/.test(style.position)) {
        shell.setAttribute("data-soft98-pro-surface", "nav-shell");
      }
      for (const candidate of (shell || navigation).querySelectorAll("div,ul,ol,section")) candidates.add(candidate);
    }

    const toggles = document.querySelectorAll('[data-toggle="dropdown"],[aria-haspopup="menu"],[aria-haspopup="true"]');
    for (const toggle of toggles) {
      const owner = toggle.parentElement;
      if (!owner) continue;
      for (const candidate of owner.querySelectorAll("div,ul,ol,section")) candidates.add(candidate);
    }
    for (const candidate of candidates) {
      if (candidate.closest("#soft98-pro-control")) continue;
      const style = getComputedStyle(candidate);
      if (!/absolute|fixed/.test(style.position) && !candidate.matches("[role=menu],[role=listbox]")) continue;
      const interactive = candidate.querySelectorAll("a[href],button,[role=menuitem]").length;
      if (interactive < 2) continue;
      const box = candidate.getBoundingClientRect();
      const width = Math.max(box.width, candidate.scrollWidth || 0);
      const height = Math.max(box.height, candidate.scrollHeight || 0);
      if (width < 100 || height < 40) continue;
      const kind = width >= Math.min(620, window.innerWidth * 0.55) || interactive >= 14 ? "megamenu" : "menu";
      candidate.setAttribute("data-soft98-pro-surface", kind);
      candidate.setAttribute("data-soft98-pro-menu", "true");
      for (const column of candidate.querySelectorAll(":scope>div,:scope>ul,:scope>ol,:scope>section")) {
        if (column.querySelectorAll("a[href],button,[role=menuitem]").length >= 2) column.setAttribute("data-soft98-pro-menu-column", "true");
      }
    }
    applyTabSurfaceHeuristics();
  }

  function tabTarget(trigger) {
    const raw = trigger.getAttribute("aria-controls") || trigger.getAttribute("data-target") || trigger.getAttribute("href") || "";
    const hash = raw.includes("#") ? raw.slice(raw.indexOf("#")) : raw ? `#${raw}` : "";
    if (!/^#[A-Za-z][\w:.-]*$/.test(hash)) return null;
    try {
      return document.querySelector(hash);
    } catch (_error) {
      return null;
    }
  }

  function applyTabSurfaceHeuristics() {
    const triggers = [...document.querySelectorAll('[role="tab"],[data-toggle="tab"]')].filter((node) => !node.closest("#soft98-pro-control"));
    const groups = new Map();
    for (const trigger of triggers) {
      const list = trigger.closest('[role="tablist"],ul,ol,nav') || trigger.parentElement;
      if (!list) continue;
      if (!groups.has(list)) groups.set(list, []);
      groups.get(list).push(trigger);
    }
    for (const [list, tabs] of groups) {
      if (tabs.length < 2) continue;
      list.setAttribute("data-soft98-pro-surface", "tab-list");
      const panes = tabs.map(tabTarget).filter(Boolean);
      for (const pane of panes) pane.setAttribute("data-soft98-pro-surface", "tab-pane");
      let content = panes[0] && panes[0].parentElement;
      if (content && panes.some((pane) => pane.parentElement !== content)) content = null;
      if (content) content.setAttribute("data-soft98-pro-surface", "tab-content");
      let card = list.parentElement;
      for (let depth = 0; card && content && !card.contains(content) && depth < 4; depth += 1) card = card.parentElement;
      if (card && card !== document.body) card.setAttribute("data-soft98-pro-surface", "tab-card");
      for (const trigger of tabs) {
        const active = trigger.getAttribute("aria-selected") === "true" || trigger.getAttribute("aria-expanded") === "true" || trigger.matches(".active") || Boolean(trigger.parentElement && trigger.parentElement.matches(".active"));
        trigger.setAttribute("data-soft98-pro-tab-active", active ? "true" : "false");
      }
    }
  }

  function applyProLayoutHeuristics() {
    if (!settings.compactLayout) return;
    for (const main of document.querySelectorAll("main")) {
      if (main.closest("#soft98-pro-control,#soft98-extension-recommendation,#soft98-ad-blocker-taunt")) continue;
      let container = main.parentElement;
      for (let depth = 0; container && depth < 3; depth += 1, container = container.parentElement) {
        const children = [...container.children];
        const primary = children.find((child) => child === main || child.contains(main));
        const secondary = children.find((child) => child !== primary && (child.matches("aside") || child.querySelector("aside")));
        if (!primary || !secondary) continue;
        const box = visibleBox(container);
        const primaryBox = visibleBox(primary);
        const secondaryBox = visibleBox(secondary);
        if (box.width < 620 || primaryBox.width < 300 || secondaryBox.width < 180 || primaryBox.height < 160) continue;
        container.setAttribute("data-soft98-pro-layout", "content-grid");
        primary.setAttribute("data-soft98-pro-column", "primary");
        secondary.setAttribute("data-soft98-pro-column", "secondary");
        primary.setAttribute("data-soft98-pro-reading", getComputedStyle(primary).direction === "rtl" ? "rtl" : "ltr");
        secondary.setAttribute("data-soft98-pro-reading", getComputedStyle(secondary).direction === "rtl" ? "rtl" : "ltr");
        break;
      }
    }
    applyUtilityListHeuristics();
  }

  function isCompactMediaNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.matches("img,picture,svg,canvas,i,[role=img]")) return true;
    const box = visibleBox(node);
    return box.width > 12 && box.height > 12 && box.width <= 96 && box.height <= 96 && Boolean(node.querySelector("img,picture,svg,canvas,i,[role=img]"));
  }

  function applyUtilityListHeuristics() {
    const scopes = [...document.querySelectorAll("aside,[data-soft98-pro-column=secondary]")];
    for (const scope of scopes) {
      for (const list of scope.querySelectorAll("ul,ol")) {
        const items = [...list.children].filter((node) => node.matches("li"));
        if (items.length < 3) continue;
        const rows = [];
        for (const item of items) {
          const link = item.matches("a[href]") ? item : item.querySelector(":scope > a[href]");
          if (!link || link.children.length < 2) continue;
          const children = [...link.children];
          const media = children.find(isCompactMediaNode);
          const copy = children.find((node) => node !== media && node.textContent.trim());
          if (!media || !copy) continue;
          rows.push({ link, copy });
        }
        if (rows.length < 3 || rows.length < Math.ceil(items.length * 0.6)) continue;
        const section = list.closest("section,article,div") || list;
        section.setAttribute("data-soft98-pro-layout", "utility-list");
        for (const row of rows) {
          row.link.setAttribute("data-soft98-pro-list-row", "true");
          row.copy.setAttribute("data-soft98-pro-list-copy", "true");
        }
      }
    }
  }

  function updateFavicon() {
    const state = settings.pro && settings.rgbMode ? "rgb" : settings.pro && settings.darkDesign ? "pro" : successAnnounced ? "success" : "";
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
      const pro = state === "pro" || state === "rgb";
      const rgb = state === "rgb";
      const background = pro ? "#08111a" : "#f7fbff";
      const foreground = pro ? "#70e1b2" : "#1fb36b";
      const shadow = pro ? "rgba(112,225,178,.32)" : "rgba(31,179,107,.28)";
      const ring = pro ? "#253f58" : "#d4e7f4";
      const accent = pro ? "#ffd166" : "#2f80ed";
      ctx.clearRect(0, 0, 64, 64);
      if (rgb) {
        const gradient = ctx.createLinearGradient(5, 5, 59, 59);
        gradient.addColorStop(0, "#52e8b2");
        gradient.addColorStop(0.38, "#70a7ff");
        gradient.addColorStop(0.7, "#dc73ff");
        gradient.addColorStop(1, "#ffd071");
        ctx.fillStyle = gradient;
      } else ctx.fillStyle = background;
      roundRect(ctx, 4, 4, 56, 56, 14);
      ctx.fill();
      ctx.strokeStyle = ring;
      ctx.lineWidth = 4;
      roundRect(ctx, 6, 6, 52, 52, 12);
      ctx.stroke();
      ctx.shadowColor = shadow;
      ctx.shadowBlur = pro ? 8 : 5;
      ctx.fillStyle = rgb ? "#071019" : foreground;
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
      safeConsole("warn", text("logs.faviconFailed"), error);
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
      localizeElement(badge);
      link.appendChild(badge);
    }
  }

  function restoreOriginalLogo() {
    for (const logo of document.querySelectorAll("img[data-soft98-original-logo]")) {
      logo.src = logo.getAttribute("data-soft98-original-logo") || logo.src;
      logo.removeAttribute("data-soft98-original-logo");
      logo.removeAttribute("data-soft98-brand-variant");
    }
    for (const link of document.querySelectorAll("[data-soft98-original-logo]")) {
      const original = link.getAttribute("data-soft98-original-logo");
      if (!original) continue;
      link.style.backgroundImage = original === "__none__" ? "" : original;
      link.style.backgroundSize = "";
      link.style.backgroundRepeat = "";
      link.style.backgroundPosition = "";
      link.removeAttribute("data-soft98-original-logo");
      link.removeAttribute("data-soft98-brand-variant");
      link.removeAttribute("data-soft98-brand-kind");
    }
  }

  function logoCandidate() {
    const candidates = [];
    for (const link of document.querySelectorAll("a[href]")) {
      let url;
      try {
        url = new URL(link.getAttribute("href") || "", location.href);
      } catch (_error) {
        continue;
      }
      if (!/^\/?$/.test(url.pathname) || (url.origin !== location.origin && !/(?:^|\.)soft98\.ir$/i.test(url.hostname))) continue;
      const box = visibleBox(link);
      if (!box.width || !box.height) continue;
      const linkSignals = `${link.textContent || ""} ${link.title || ""} ${link.getAttribute("aria-label") || ""}`;
      const image = link.querySelector("img");
      const imageSignals = image ? `${image.alt || ""} ${image.title || ""}` : "";
      const assetSignals = `${image ? image.currentSrc || image.src || "" : ""} ${getComputedStyle(link).backgroundImage || ""}`;
      const shapeScore = box.width > box.height * 1.5 ? 4 : 0;
      const areaScore = box.width * box.height > 10000 ? 5 : box.width * box.height > 1400 ? 2 : 0;
      const homeScore = /\bhome\b/i.test(link.rel || "") ? 2 : 0;
      const brandScore = /soft\s*98|سافت[\s\u200c]*(?:98|۹۸|٩٨)|logo/i.test(`${linkSignals} ${imageSignals}`) ? 8 : 0;
      const primaryAssetScore = /\/(?:logo|wordmark)[^/)]*\.(?:avif|png|webp|gif|svg)/i.test(assetSignals) ? 10 : 0;
      const imageScore = image ? 3 : 0;
      candidates.push({ node: image || link, kind: image ? "image" : "background", score: shapeScore + areaScore + homeScore + brandScore + primaryAssetScore + imageScore });
    }
    let best = null;
    let score = -1;
    for (const candidate of candidates) {
      if (candidate.score > score) {
        best = candidate;
        score = candidate.score;
      }
    }
    return best;
  }

  function enhanceLogo() {
    if (!successAnnounced || !settings.pirateLogo) return restoreOriginalLogo();
    const candidate = logoCandidate();
    if (!candidate) return;
    const logo = candidate.node;
    const dark = settings.pro && settings.darkDesign;
    const variant = dark ? "pirateDark" : "light";
    const source = BRAND_ASSETS[variant];
    if (!source || logo.getAttribute("data-soft98-brand-variant") === variant) return;
    if (candidate.kind === "image") {
      if (!logo.hasAttribute("data-soft98-original-logo")) logo.setAttribute("data-soft98-original-logo", logo.currentSrc || logo.src || "");
      logo.src = source;
      logo.alt = text("product");
    } else {
      if (!logo.hasAttribute("data-soft98-original-logo")) logo.setAttribute("data-soft98-original-logo", logo.style.backgroundImage || "__none__");
      logo.style.backgroundImage = `url("${source}")`;
    }
    logo.setAttribute("data-soft98-brand-variant", variant);
    logo.setAttribute("data-soft98-brand-kind", candidate.kind);
  }

  function renderTaunt() {
    const previous = document.getElementById("soft98-ad-blocker-taunt");
    if (!successAnnounced || !settings.taunt) {
      if (previous) previous.remove();
      return;
    }
    const note = previous || document.createElement("aside");
    note.id = "soft98-ad-blocker-taunt";
    localizeElement(note);
    note.setAttribute("data-theme", settings.pro && settings.darkDesign ? "dark" : "light");
    note.innerHTML = `<span>${text("tauntText")}</span><a rel="noopener noreferrer" target="_blank" href="${EXTENSION_REPO}">${text("tauntLink")}</a>`;
    const style = document.createElement("style");
    style.textContent = `
      #soft98-ad-blocker-taunt{--taunt-bg:#f7fafc;--taunt-border:#cbd7e1;--taunt-text:#1d2a35;--taunt-link:#0b6f55;grid-template-columns:1fr auto;align-items:center;gap:12px;width:min(780px,calc(100% - 28px));margin:14px auto;padding:10px 14px;border:1px solid var(--taunt-border)!important;border-radius:8px;background:var(--taunt-bg)!important;color:var(--taunt-text)!important;box-shadow:0 8px 24px rgba(20,35,48,.08)!important;font:13px/1.8 system-ui,sans-serif;text-align:start;direction:inherit}
      #soft98-ad-blocker-taunt[data-theme=dark]{--taunt-bg:#101b24;--taunt-border:#344955;--taunt-text:#eef7f8;--taunt-link:#7ce0bd;box-shadow:0 12px 28px rgba(0,0,0,.28)}
      #soft98-ad-blocker-taunt span{color:var(--taunt-text)!important;background:transparent!important;unicode-bidi:plaintext}
      #soft98-ad-blocker-taunt a{color:var(--taunt-link)!important;background:transparent!important;font-weight:750;text-decoration:none;white-space:nowrap}
      @media(max-width:560px){#soft98-ad-blocker-taunt{grid-template-columns:1fr}#soft98-ad-blocker-taunt a{white-space:normal}}
    `;
    note.appendChild(style);
    if (!previous) {
      const footer = [...document.querySelectorAll("footer")].find((node) => visibleBox(node).width > 200) || document.body;
      footer.appendChild(note);
    }
  }

  function syncSuccessEnhancements() {
    if (!document.body) return;
    enhanceLogo();
    renderTaunt();
    if (settings.recommendExtension) renderExtensionRecommendation();
    else {
      const recommendation = document.getElementById("soft98-extension-recommendation");
      if (recommendation) recommendation.remove();
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
      safeConsole("warn", text("logs.controlPositionFailed"), error);
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

  function controlPatchCount() {
    return stats.patches.reduce((total, entry) => total + (Array.isArray(entry && entry.patches) ? entry.patches.length : 0), 0);
  }

  function controlCompatibilityLabel() {
    if (!compatibilityState) return text("controlWaiting");
    return compatibilityState.status === "compatible" ? text("controlCompatible") : text("controlUnknown");
  }

  function refreshControlTelemetry() {
    const wrap = document.getElementById("soft98-pro-control");
    if (!wrap) return;
    const values = {
      ads: stats.adsRemoved,
      links: stats.linksPreserved + stats.linksRestored,
      patches: controlPatchCount(),
    };
    for (const [name, value] of Object.entries(values)) {
      const output = wrap.querySelector(`[data-metric="${name}"]`);
      const next = String(value);
      if (output && output.textContent !== next) output.textContent = next;
    }
    const protection = wrap.querySelector("[data-role='protection-label']");
    const compatibility = wrap.querySelector("[data-role='compatibility-label']");
    const hash = wrap.querySelector("[data-role='compatibility-hash']");
    const active = settings.blockAds && settings.patchScripts;
    wrap.setAttribute("data-protection", active ? "active" : "paused");
    wrap.setAttribute("data-compatibility", compatibilityState ? compatibilityState.status || "unknown" : "waiting");
    const protectionText = active ? text("controlProtectionActive") : text("controlProtectionPaused");
    const compatibilityText = controlCompatibilityLabel();
    if (protection && protection.textContent !== protectionText) protection.textContent = protectionText;
    if (compatibility && compatibility.textContent !== compatibilityText) compatibility.textContent = compatibilityText;
    if (hash) {
      const sha256 = compatibilityState && compatibilityState.sha256;
      const shortHash = sha256 ? sha256.slice(0, 12) : "";
      if (hash.textContent !== shortHash) hash.textContent = shortHash;
      if (hash.title !== (sha256 || "")) hash.title = sha256 || "";
      if (hash.hidden === Boolean(sha256)) hash.hidden = !sha256;
    }
  }

  function controlOptionMarkup(key) {
    return `
      <label class="s98p-option">
        <span class="s98p-option-copy">
          <strong>${escapeHtml(text(`controlOptions.${key}.title`))}</strong>
          <small>${escapeHtml(text(`controlOptions.${key}.detail`))}</small>
        </span>
        <span class="s98p-switch">
          <input type="checkbox" role="switch" name="${key}" ${settings[key] ? "checked" : ""}>
          <span aria-hidden="true"></span>
        </span>
      </label>`;
  }

  function renderControlPanel() {
    if (controlAbortController) controlAbortController.abort();
    controlAbortController = new AbortController();
    const signal = controlAbortController.signal;
    const old = document.getElementById("soft98-pro-control");
    const wasOpen = old && old.getAttribute("data-open") === "true";
    const focusedName = old && old.contains(document.activeElement) ? document.activeElement.getAttribute("name") : "";
    if (old) old.remove();
    if (!document.body) return;
    const wrap = document.createElement("div");
    wrap.id = "soft98-pro-control";
    wrap.dir = "ltr";
    wrap.lang = LOCALE;
    wrap.style.setProperty("unicode-bidi", "isolate");
    wrap.setAttribute("data-open", wasOpen ? "true" : "false");
    wrap.setAttribute("data-theme", settings.rgbMode && settings.pro ? "rgb" : settings.darkDesign && settings.pro ? "dark" : "light");
    const groups = {
      protection: ["blockAds", "patchScripts"],
      experience: ["pro", "darkDesign", "rgbMode", "compactLayout", "linkBadges", "pirateLogo"],
      advanced: ["taunt", "diagnostics", "recommendExtension"],
    };
    const groupLabels = {
      protection: text("controlProtection"),
      experience: text("controlExperience"),
      advanced: text("controlAdvanced"),
    };
    if (!groups[controlSection]) controlSection = "protection";
    wrap.innerHTML = `
      <button type="button" data-role="toggle" aria-controls="soft98-pro-console" aria-expanded="${wasOpen ? "true" : "false"}" aria-label="${escapeHtml(text("product"))}: ${escapeHtml(text("moveControl"))}" title="${escapeHtml(text("moveControl"))}">
        <img src="${escapeHtml(BRAND_ASSETS.pirateDark || BRAND_ASSETS.light || "")}" alt="">
      </button>
      <form id="soft98-pro-console" role="dialog" aria-modal="false" aria-labelledby="soft98-pro-console-title" aria-hidden="${wasOpen ? "false" : "true"}" dir="${RTL ? "rtl" : "ltr"}" lang="${LOCALE}">
        <header class="s98p-console-header">
          <span class="s98p-brand-mark" aria-hidden="true"><img src="${escapeHtml(BRAND_ASSETS.pirateDark || BRAND_ASSETS.light || "")}" alt=""></span>
          <span class="s98p-console-heading">
            <span class="s98p-console-kicker"><b dir="ltr">Soft98 Pro</b><i>${escapeHtml(text("controlLive"))}</i></span>
            <strong id="soft98-pro-console-title">${escapeHtml(text("controlTitle"))}</strong>
            <small>${escapeHtml(text("controlSubtitle"))}</small>
          </span>
          <span class="s98p-version" dir="ltr">${escapeHtml(VERSION)}</span>
          <button type="button" data-role="close" aria-label="${escapeHtml(text("close"))}" title="${escapeHtml(text("close"))}"><span aria-hidden="true"></span></button>
        </header>
        <section class="s98p-status" aria-live="polite">
          <span class="s98p-status-dot" aria-hidden="true"></span>
          <span class="s98p-status-copy">
            <strong data-role="protection-label"></strong>
            <small data-role="compatibility-label"></small>
          </span>
          <code data-role="compatibility-hash" dir="ltr" hidden></code>
        </section>
        <dl class="s98p-metrics">
          <div><dt>${escapeHtml(text("controlAdsRemoved"))}</dt><dd data-metric="ads">0</dd></div>
          <div><dt>${escapeHtml(text("controlLinksSecured"))}</dt><dd data-metric="links">0</dd></div>
          <div><dt>${escapeHtml(text("controlCodePatches"))}</dt><dd data-metric="patches">0</dd></div>
        </dl>
        <div class="s98p-tabs" role="tablist" aria-label="${escapeHtml(text("controlTitle"))}">
          ${[
            ["protection", text("controlProtection")],
            ["experience", text("controlExperience")],
            ["advanced", text("controlAdvanced")],
          ]
            .map(([key, label]) => `<button type="button" role="tab" id="soft98-pro-tab-${key}" aria-controls="soft98-pro-panel-${key}" aria-selected="${controlSection === key}" tabindex="${controlSection === key ? "0" : "-1"}" data-section="${key}">${escapeHtml(label)}</button>`)
            .join("")}
        </div>
        <div class="s98p-panels">
          ${Object.entries(groups)
            .map(([group, keys]) => `<section role="tabpanel" id="soft98-pro-panel-${group}" aria-labelledby="soft98-pro-tab-${group}" data-panel="${group}" ${controlSection === group ? "" : "hidden"}>
              <div class="s98p-panel-intro">
                <span><strong>${escapeHtml(groupLabels[group])}</strong><small>${escapeHtml(text(`controlSectionDescriptions.${group}`))}</small></span>
                <b><span dir="ltr">${keys.length}</span> ${escapeHtml(text("controlModules"))}</b>
              </div>
              ${keys.map(controlOptionMarkup).join("")}
            </section>`)
            .join("")}
        </div>
        <footer>
          <button type="button" data-role="diagnostics"><span class="s98p-command-icon s98p-command-diagnostics" aria-hidden="true"></span>${escapeHtml(text("controlDiagnostics"))}</button>
          <button type="button" data-role="scan"><span class="s98p-command-icon s98p-command-scan" aria-hidden="true"></span>${escapeHtml(text("scanNow"))}</button>
        </footer>
      </form>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #soft98-pro-control{--c-bg:rgba(246,250,251,.985);--c-bg-soft:#e7f0f2;--c-bg-raised:#fff;--c-border:#9ebac2;--c-border-soft:#ccdde1;--c-text:#11232a;--c-muted:#526b74;--c-accent:#087a63;--c-accent-2:#a56b13;--c-accent-soft:rgba(8,122,99,.11);--c-danger:#b84152;position:fixed;z-index:2147483647;width:42px;height:42px;direction:ltr;font-family:inherit!important;font-size:13px;line-height:1.6;font-weight:400;color:var(--c-text);letter-spacing:0;isolation:isolate}
      #soft98-pro-control[data-theme=dark],#soft98-pro-control[data-theme=rgb]{--c-bg:rgba(5,10,14,.985);--c-bg-soft:#0d1a21;--c-bg-raised:#14252d;--c-border:#41616c;--c-border-soft:#203943;--c-text:#f3f8f9;--c-muted:#a6bbc1;--c-accent:#70e1b2;--c-accent-2:#e0bd70;--c-accent-soft:rgba(112,225,178,.12);--c-danger:#ff8796}
      #soft98-pro-control[data-theme=rgb]{--control-neon-hue:155deg;--c-bg:rgba(2,3,4,.99);--c-bg-soft:#07090a;--c-bg-raised:#0c0f10;--c-border:hsl(var(--control-neon-hue) 88% 58%);--c-border-soft:#24292c;--c-text:#d9dee0;--c-muted:#838a8f;--c-accent:hsl(var(--control-neon-hue) 94% 66%);--c-accent-2:color-mix(in srgb,var(--c-accent) 68%,#dce1e3);--c-accent-soft:hsl(var(--control-neon-hue) 90% 58% / .14);animation:soft98-control-neon 16s linear infinite}
      #soft98-pro-control :is(form,button,input,label,strong,small,dt,dd){font-family:inherit!important;letter-spacing:0!important}
      #soft98-pro-control>[data-role=toggle]{position:absolute;inset:0;display:grid;place-items:center;width:42px;height:42px;margin:0;padding:0;float:none;border:1px solid var(--c-border)!important;border-radius:50%;background:var(--c-bg-soft)!important;background-image:none!important;color:var(--c-accent)!important;line-height:1;box-shadow:0 10px 30px rgba(0,0,0,.3);cursor:grab;touch-action:none;user-select:none;transition:transform .18s ease,background-color .18s ease,border-color .18s ease,box-shadow .18s ease}
      #soft98-pro-control>[data-role=toggle] img{display:block;width:30px;height:30px;object-fit:contain;filter:none!important;pointer-events:none}
      #soft98-pro-control[data-dragging=true]>[data-role=toggle]{cursor:grabbing;transform:scale(1.04)}
      #soft98-pro-control>[data-role=toggle]:hover,#soft98-pro-control[data-open=true]>[data-role=toggle]{transform:translateY(-1px) scale(1.04);border-color:var(--c-accent)!important;background:var(--c-bg-raised)!important;box-shadow:0 14px 36px rgba(0,0,0,.38),0 0 0 4px var(--c-accent-soft)}
      #soft98-pro-control[data-theme=rgb]>[data-role=toggle]{box-shadow:0 14px 38px rgba(0,0,0,.55),0 0 0 1px var(--c-accent-soft),0 0 26px var(--c-accent-soft)}
      #soft98-pro-control form{position:absolute;left:0;bottom:52px;display:grid;grid-template-rows:auto auto auto auto minmax(0,1fr) auto;width:min(448px,calc(100vw - 24px));max-height:min(720px,calc(100vh - 76px));overflow:hidden;margin:0;padding:0;border:1px solid color-mix(in srgb,var(--c-accent) 42%,var(--c-border))!important;border-radius:8px;background:var(--c-bg)!important;background-image:linear-gradient(135deg,color-mix(in srgb,var(--c-accent) 4%,transparent),transparent 36%,color-mix(in srgb,var(--c-accent-2) 3%,transparent))!important;color:var(--c-text)!important;box-shadow:0 0 0 1px rgba(255,255,255,.045) inset,0 0 0 4px rgba(7,13,17,.55),0 30px 90px rgba(0,0,0,.58),0 0 36px color-mix(in srgb,var(--c-accent) 9%,transparent)!important;backdrop-filter:blur(28px) saturate(145%);transform-origin:left bottom;transform:translateY(10px) scale(.96);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility 0s linear .22s}
      #soft98-pro-control form:before{content:"";position:absolute;z-index:4;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--c-accent),var(--c-accent-2),var(--c-accent));pointer-events:none}
      #soft98-pro-control form[dir=rtl]{text-align:right}
      #soft98-pro-control form[dir=ltr]{text-align:left}
      #soft98-pro-control[data-horizontal=right] form{right:0;left:auto;transform-origin:right bottom}
      #soft98-pro-control[data-vertical=down] form{top:52px;bottom:auto;transform:translateY(-10px) scale(.96);transform-origin:left top}
      #soft98-pro-control[data-horizontal=right][data-vertical=down] form{transform-origin:right top}
      #soft98-pro-control[data-open=true] form{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(0) scale(1);transition:opacity .18s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility 0s}
      #soft98-pro-control[data-theme=rgb] form{border-color:var(--c-accent)!important;background:#030405!important;background-image:none!important;box-shadow:0 0 0 1px rgba(255,255,255,.035) inset,0 0 0 4px rgba(0,0,0,.72),0 32px 94px rgba(0,0,0,.72),0 0 32px var(--c-accent-soft)!important}
      #soft98-pro-control .s98p-console-header{position:relative;display:grid;grid-template-columns:46px minmax(0,1fr) auto 30px;align-items:center;gap:11px;padding:17px 15px 14px;border-bottom:1px solid var(--c-border-soft);background:linear-gradient(180deg,color-mix(in srgb,var(--c-bg-raised) 88%,transparent),color-mix(in srgb,var(--c-bg) 92%,transparent));color:var(--c-text)}
      #soft98-pro-control .s98p-brand-mark{display:grid;place-items:center;width:44px;height:44px;border:1px solid color-mix(in srgb,var(--c-accent) 45%,var(--c-border));border-radius:8px;background:var(--c-bg-soft);box-shadow:0 0 0 3px var(--c-accent-soft),0 8px 22px rgba(0,0,0,.22)}
      #soft98-pro-control .s98p-brand-mark img{display:block;width:38px;height:38px;object-fit:contain;filter:none!important}
      #soft98-pro-control .s98p-console-heading{display:grid;min-width:0;gap:1px;direction:inherit;unicode-bidi:plaintext;text-align:start}
      #soft98-pro-control .s98p-console-kicker{display:flex;align-items:center;gap:7px;min-width:0;margin-block-end:1px;background:transparent!important;color:var(--c-muted)!important;font-size:9.5px;line-height:1.2;text-transform:uppercase}
      #soft98-pro-control .s98p-console-kicker b{color:var(--c-accent-2)!important;font-size:10px;font-weight:800}
      #soft98-pro-control .s98p-console-kicker i{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border:1px solid color-mix(in srgb,var(--c-accent) 38%,transparent);border-radius:999px;background:var(--c-accent-soft)!important;color:var(--c-accent)!important;font-style:normal;font-weight:750}
      #soft98-pro-control .s98p-console-kicker i:before{content:"";width:5px;height:5px;border-radius:50%;background:var(--c-accent);box-shadow:0 0 0 3px var(--c-accent-soft)}
      #soft98-pro-control .s98p-console-heading>strong{overflow:hidden;color:var(--c-text)!important;font-size:15px;line-height:1.45;text-overflow:ellipsis;white-space:nowrap}
      #soft98-pro-control .s98p-console-heading>small{overflow:hidden;color:var(--c-muted)!important;font-size:11px;line-height:1.55;text-overflow:ellipsis;white-space:nowrap}
      #soft98-pro-control .s98p-version{padding:3px 7px;border:1px solid var(--c-border-soft);border-radius:999px;background:var(--c-bg-soft);color:var(--c-muted);font:600 10px/1.2 ui-monospace,monospace}
      #soft98-pro-control [data-role=close]{position:relative;width:30px;height:30px;margin:0;padding:0;border:0!important;border-radius:50%;background:transparent!important;background-image:none!important;color:var(--c-muted)!important;cursor:pointer}
      #soft98-pro-control [data-role=close]:hover{background:var(--c-accent-soft)!important;color:var(--c-text)!important;transform:none!important}
      #soft98-pro-control [data-role=close] span:before,#soft98-pro-control [data-role=close] span:after{content:"";position:absolute;top:14px;left:8px;width:14px;height:1.5px;border-radius:2px;background:currentColor}
      #soft98-pro-control [data-role=close] span:before{transform:rotate(45deg)}
      #soft98-pro-control [data-role=close] span:after{transform:rotate(-45deg)}
      #soft98-pro-control .s98p-status{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:10px;margin:12px 14px 0;padding:10px 12px;border:1px solid color-mix(in srgb,var(--c-accent) 26%,var(--c-border-soft));border-radius:7px;background:color-mix(in srgb,var(--c-accent-soft) 70%,var(--c-bg-raised))}
      #soft98-pro-control .s98p-status-dot{width:8px;height:8px;border-radius:50%;background:var(--c-accent);box-shadow:0 0 0 4px var(--c-accent-soft)}
      #soft98-pro-control[data-protection=paused] .s98p-status-dot,#soft98-pro-control[data-compatibility=unknown] .s98p-status-dot{background:var(--c-danger);box-shadow:0 0 0 4px color-mix(in srgb,var(--c-danger) 15%,transparent)}
      #soft98-pro-control .s98p-status-copy{display:grid;min-width:0;gap:0;direction:inherit;unicode-bidi:plaintext;text-align:start}
      #soft98-pro-control .s98p-status-copy strong{color:var(--c-text)!important;font-size:12px}
      #soft98-pro-control .s98p-status-copy small{color:var(--c-muted)!important;font-size:10.5px}
      #soft98-pro-control .s98p-status code{padding:3px 6px;border:1px solid var(--c-border-soft);border-radius:4px;background:var(--c-bg);color:var(--c-muted);font:10px/1.2 ui-monospace,monospace}
      #soft98-pro-control .s98p-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:9px 14px 0;padding:0}
      #soft98-pro-control .s98p-metrics div{display:grid;gap:3px;padding:9px 8px;border:1px solid var(--c-border-soft);border-radius:7px;background:color-mix(in srgb,var(--c-bg-raised) 72%,transparent);text-align:center}
      #soft98-pro-control .s98p-metrics div:first-child{border-color:color-mix(in srgb,var(--c-accent) 25%,var(--c-border-soft))}
      #soft98-pro-control .s98p-metrics dt{margin:0;background:transparent!important;color:var(--c-muted)!important;font-size:10px;font-weight:500;white-space:normal}
      #soft98-pro-control .s98p-metrics dd{margin:0;background:transparent!important;color:var(--c-text)!important;font-size:18px;font-weight:750;line-height:1.15;font-variant-numeric:tabular-nums}
      #soft98-pro-control .s98p-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin:11px 14px 0;padding:3px;border:1px solid var(--c-border-soft);border-radius:7px;background:var(--c-bg-soft)}
      #soft98-pro-control .s98p-tabs button{position:relative;min-width:0;margin:0;padding:8px 5px;border:0;border-radius:5px;background:transparent!important;color:var(--c-muted)!important;font-size:11px;font-weight:650;line-height:1.4;cursor:pointer;transition:color .16s ease,box-shadow .16s ease}
      #soft98-pro-control .s98p-tabs button:hover{color:var(--c-text)!important}
      #soft98-pro-control .s98p-tabs button[aria-selected=true]{background:var(--c-bg-raised)!important;color:var(--c-accent)!important;box-shadow:0 1px 7px rgba(0,0,0,.22)}
      #soft98-pro-control .s98p-tabs button[aria-selected=true]:after{content:"";position:absolute;inset:auto 18% 1px;height:2px;border-radius:2px;background:var(--c-accent)}
      #soft98-pro-control .s98p-panels{min-height:0;overflow:auto;padding:10px 14px 12px;scrollbar-color:var(--c-border) transparent;overscroll-behavior:contain}
      #soft98-pro-control .s98p-panels [role=tabpanel]{display:grid;gap:7px}
      #soft98-pro-control .s98p-panels [role=tabpanel][hidden]{display:none!important}
      #soft98-pro-control .s98p-panel-intro{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;margin:0 0 2px;padding:3px 2px 8px;border-bottom:1px solid var(--c-border-soft)}
      #soft98-pro-control .s98p-panel-intro>span{display:grid;min-width:0;gap:1px;background:transparent!important;text-align:start}
      #soft98-pro-control .s98p-panel-intro strong{color:var(--c-text)!important;font-size:12px}
      #soft98-pro-control .s98p-panel-intro small{color:var(--c-muted)!important;font-size:10.5px;line-height:1.5}
      #soft98-pro-control .s98p-panel-intro>b{padding:4px 7px;border:1px solid var(--c-border-soft);border-radius:5px;background:var(--c-bg-soft)!important;color:var(--c-muted)!important;font-size:9.5px;font-weight:650;white-space:nowrap}
      #soft98-pro-control .s98p-option{display:grid;grid-template-columns:minmax(0,1fr) 38px;align-items:center;gap:12px;min-height:56px;margin:0;padding:10px 11px;border:1px solid var(--c-border-soft);border-radius:7px;background:color-mix(in srgb,var(--c-bg-raised) 78%,transparent);box-shadow:0 1px 0 rgba(255,255,255,.025) inset;cursor:pointer;transition:border-color .16s ease,background-color .16s ease,transform .16s ease,box-shadow .18s ease}
      #soft98-pro-control .s98p-option:hover{border-color:color-mix(in srgb,var(--c-accent) 38%,var(--c-border));background:var(--c-bg-raised);box-shadow:0 8px 22px rgba(0,0,0,.14);transform:translateY(-1px)}
      #soft98-pro-control .s98p-option-copy{display:grid;min-width:0;gap:2px;direction:inherit;unicode-bidi:plaintext;text-align:start}
      #soft98-pro-control .s98p-option-copy strong{color:var(--c-text)!important;font-size:12px;line-height:1.35}
      #soft98-pro-control .s98p-option-copy small{color:var(--c-muted)!important;font-size:10.5px;line-height:1.5}
      #soft98-pro-control .s98p-switch{position:relative;display:block;width:36px;height:20px;direction:ltr}
      #soft98-pro-control .s98p-switch input{position:absolute;width:1px;height:1px;opacity:0}
      #soft98-pro-control .s98p-switch span{position:absolute;inset:0;border:1px solid var(--c-border);border-radius:999px;background:var(--c-bg-soft);transition:background-color .18s ease,border-color .18s ease}
      #soft98-pro-control .s98p-switch span:after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--c-muted);box-shadow:0 1px 3px rgba(0,0,0,.28);transition:transform .2s cubic-bezier(.2,.8,.2,1),background-color .18s ease}
      #soft98-pro-control .s98p-switch input:checked+span{border-color:var(--c-accent);background:var(--c-accent-soft)}
      #soft98-pro-control .s98p-switch input:checked+span:after{background:var(--c-accent);transform:translateX(16px)}
      #soft98-pro-control .s98p-switch input:focus-visible+span{outline:2px solid var(--c-accent);outline-offset:3px}
      #soft98-pro-control footer{display:grid;grid-template-columns:1fr auto;gap:8px;padding:11px 14px;border-top:1px solid var(--c-border-soft);background:color-mix(in srgb,var(--c-bg-soft) 88%,var(--c-bg))}
      #soft98-pro-control footer button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;margin:0;padding:7px 12px;border:1px solid var(--c-border);border-radius:7px;background:var(--c-bg-raised)!important;color:var(--c-text)!important;font-size:11px;font-weight:650;line-height:1.4;cursor:pointer;transition:border-color .16s ease,background-color .16s ease,transform .16s ease}
      #soft98-pro-control footer button:hover{border-color:var(--c-accent);color:var(--c-accent)!important;transform:translateY(-1px)}
      #soft98-pro-control .s98p-command-icon{position:relative;display:inline-block;flex:0 0 15px;width:15px;height:15px;color:currentColor}
      #soft98-pro-control .s98p-command-scan{border:1.5px solid currentColor;border-radius:50%}
      #soft98-pro-control .s98p-command-scan:before{content:"";position:absolute;top:-2px;right:-2px;width:5px;height:5px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor;background:var(--c-bg-raised)}
      #soft98-pro-control .s98p-command-diagnostics:before{content:"";position:absolute;inset:2px 1px 1px;border:1.5px solid currentColor;border-radius:3px}
      #soft98-pro-control .s98p-command-diagnostics:after{content:"";position:absolute;left:4px;right:4px;top:6px;height:1.5px;background:currentColor;box-shadow:0 4px 0 currentColor}
      #soft98-pro-control button:focus-visible{outline:2px solid var(--c-accent)!important;outline-offset:2px!important}
      @keyframes soft98-control-neon{to{--control-neon-hue:515deg}}
      @media(max-width:520px){#soft98-pro-control form{width:min(400px,calc(100vw - 16px));max-height:calc(100vh - 66px)}#soft98-pro-control .s98p-console-header{grid-template-columns:42px minmax(0,1fr) 30px}#soft98-pro-control .s98p-version{display:none}#soft98-pro-control .s98p-option-copy small,#soft98-pro-control .s98p-panel-intro small{font-size:10px}}
      @media(prefers-reduced-motion:reduce){#soft98-pro-control{animation:none!important}#soft98-pro-control *,#soft98-pro-control *:before,#soft98-pro-control *:after{transition:none!important}}
    `;
    wrap.appendChild(style);
    const toggle = wrap.querySelector("[data-role='toggle']");
    const form = wrap.querySelector("form");
    let position = placeControl(wrap, readControlPosition() || defaultControlPosition(), false);
    let drag = null;
    let suppressClick = false;
    const setOpen = (open, moveFocus) => {
      wrap.setAttribute("data-open", open ? "true" : "false");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      form.setAttribute("aria-hidden", open ? "false" : "true");
      if (moveFocus) {
        const target = open ? form.querySelector('[role="tab"][aria-selected="true"]') : toggle;
        if (target) target.focus({ preventScroll: true });
      }
      if (open) refreshControlTelemetry();
    };
    const selectSection = (section, focus) => {
      if (!groups[section]) return;
      controlSection = section;
      for (const tab of form.querySelectorAll('[role="tab"]')) {
        const selected = tab.getAttribute("data-section") === section;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) tab.focus({ preventScroll: true });
      }
      for (const panel of form.querySelectorAll('[role="tabpanel"]')) panel.hidden = panel.getAttribute("data-panel") !== section;
    };
    form.addEventListener("submit", (event) => event.preventDefault(), { signal });
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
      const open = wrap.getAttribute("data-open") !== "true";
      setOpen(open, open);
    }, { signal });
    wrap.querySelector("[data-role='close']").addEventListener("click", () => setOpen(false, true), { signal });
    wrap.querySelector("[data-role='scan']").addEventListener("click", () => {
      schedule(document);
      enqueueMicrotask(refreshControlTelemetry);
    }, { signal });
    wrap.querySelector("[data-role='diagnostics']").addEventListener("click", () => diagnosticReport(), { signal });
    form.querySelector("[role='tablist']").addEventListener("click", (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (tab) selectSection(tab.getAttribute("data-section"), true);
    }, { signal });
    form.querySelector("[role='tablist']").addEventListener("keydown", (event) => {
      const tabs = [...form.querySelectorAll('[role="tab"]')];
      const current = tabs.indexOf(event.target.closest('[role="tab"]'));
      if (current < 0) return;
      let next = current;
      const direction = RTL ? -1 : 1;
      if (event.key === "ArrowRight") next = (current + direction + tabs.length) % tabs.length;
      else if (event.key === "ArrowLeft") next = (current - direction + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectSection(tabs[next].getAttribute("data-section"), true);
    }, { signal });
    wrap.addEventListener("change", (event) => {
      const input = event.target;
      if (!input || input.tagName !== "INPUT") return;
      writeSettings({ ...settings, [input.name]: input.checked });
    }, { signal });
    document.addEventListener("pointerdown", (event) => {
      if (wrap.getAttribute("data-open") === "true" && !wrap.contains(event.target)) setOpen(false, false);
    }, { capture: true, signal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && wrap.getAttribute("data-open") === "true") {
        event.preventDefault();
        setOpen(false, true);
      }
    }, { signal });
    window.addEventListener("resize", () => {
      position = placeControl(wrap, position, true);
    }, { signal });
    document.body.appendChild(wrap);
    refreshControlTelemetry();
    if (focusedName) {
      const focused = wrap.querySelector(`input[name="${focusedName}"]`);
      if (focused) focused.focus({ preventScroll: true });
    }
  }

  function announceSuccess() {
    if (successAnnounced) return;
    if (!stats.adsRemoved && !stats.linksPreserved && !stats.patches.length) return;
    successAnnounced = true;
    log("info", text("logs.boarded"), { ...stats });
    safeConsole(
      "info",
      `%c${text("product")}%c ${text("successLog")}`,
      "background:#70e1b2;color:#06120c;padding:4px 8px;border-radius:6px;font-weight:800",
      "color:#9db1c6"
    );
    updateFavicon();
    onReady(() => {
      syncSuccessEnhancements();
    });
  }

  function renderExtensionRecommendation() {
    if (!settings.recommendExtension || document.getElementById("soft98-extension-recommendation")) return;
    const panel = document.createElement("aside");
    panel.id = "soft98-extension-recommendation";
    localizeElement(panel);
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

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function supportedScriptUrl(value) {
    try {
      const url = new URL(value, location.href);
      return /(?:^|\.)soft98\.ir$/i.test(url.hostname) && /^\/templates\/.*\/(?:application\.min\.packed|jquery(?:-v[^/]+)?(?:\.min\.packed)?)\.js$/i.test(url.pathname)
        ? url.href
        : "";
    } catch (_error) {
      return "";
    }
  }

  function compatibleScript(hash) {
    return COMPATIBILITY.entries.find((entry) => entry.sha256 === hash) || null;
  }

  async function digestSource(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function dismissedCompatibilityHashes() {
    try {
      const value = JSON.parse(localStorage.getItem(COMPATIBILITY_DISMISS_KEY) || "[]");
      return Array.isArray(value) ? value.filter((hash) => /^[a-f0-9]{64}$/.test(hash)).slice(-12) : [];
    } catch (_error) {
      return [];
    }
  }

  function dismissCompatibility(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash || "")) return;
    try {
      localStorage.setItem(COMPATIBILITY_DISMISS_KEY, JSON.stringify([...new Set([...dismissedCompatibilityHashes(), hash])].slice(-12)));
    } catch (_error) {}
    const panel = document.getElementById("soft98-pro-compatibility");
    if (panel) {
      panel.removeAttribute("data-open");
      window.setTimeout(() => panel.remove(), 220);
    }
  }

  function compatibilityIssueUrl(report) {
    const title = `compat: review Soft98 script ${report.sha256.slice(0, 12)}`;
    return `${COMPATIBILITY_ISSUE}&title=${encodeURIComponent(title)}`;
  }

  function compatibilityDiagnostic(report) {
    return JSON.stringify({
      product: text("product"),
      extensionVersion: VERSION,
      status: report.status,
      scriptUrl: report.url,
      sha256: report.sha256,
      bytes: report.bytes,
      observedAt: report.observedAt,
      patchScripts: settings.patchScripts,
      page: location.href,
    }, null, 2);
  }

  async function copyCompatibilityDiagnostic(report) {
    const value = compatibilityDiagnostic(report);
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_error) {
      try {
        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "");
        input.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        return copied;
      } catch (__error) {
        return false;
      }
    }
  }

  function renderCompatibilityPrompt(report) {
    if (!document.body || dismissedCompatibilityHashes().includes(report.sha256)) return;
    const previous = document.getElementById("soft98-pro-compatibility");
    if (previous && previous.getAttribute("data-hash") === report.sha256) return;
    if (previous) previous.remove();
    const panel = document.createElement("section");
    panel.id = "soft98-pro-compatibility";
    localizeElement(panel);
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "soft98-pro-compatibility-title");
    panel.setAttribute("data-hash", report.sha256);
    panel.innerHTML = `
      <header>
        <span aria-hidden="true">!</span>
        <div><strong id="soft98-pro-compatibility-title">${escapeHtml(text("compatibilityTitle"))}</strong><small>${escapeHtml(text("compatibilityStatusUnknown"))}</small></div>
      </header>
      <p>${escapeHtml(text("compatibilityBody"))}</p>
      <code dir="ltr" title="SHA-256">${escapeHtml(report.sha256)}</code>
      <div data-role="actions">
        <button type="button" data-action="keep">${escapeHtml(text("compatibilityKeep"))}</button>
        <button type="button" data-action="disable">${escapeHtml(text("compatibilityDisable"))}</button>
        <button type="button" data-action="report">${escapeHtml(text("compatibilityReport"))}</button>
      </div>
      <small data-role="feedback" aria-live="polite"></small>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #soft98-pro-compatibility{--compat-bg:#f8fafc;--compat-surface:#fff;--compat-border:#d09a42;--compat-text:#17212b;--compat-muted:#5e6d79;--compat-action:#eaf0f4;position:fixed;z-index:2147483646;inset-inline-end:16px;bottom:16px;display:grid;gap:11px;width:min(410px,calc(100vw - 32px));padding:16px;border:1px solid var(--compat-border);border-radius:8px;background:color-mix(in srgb,var(--compat-bg) 94%,transparent);color:var(--compat-text);box-shadow:0 22px 64px rgba(10,20,30,.24);backdrop-filter:blur(16px) saturate(125%);font:13px/1.65 system-ui,sans-serif;text-align:start;opacity:0;transform:translateY(14px) scale(.98);transition:opacity .18s ease,transform .24s cubic-bezier(.2,.8,.2,1)}
      #soft98-pro-compatibility[data-open=true]{opacity:1;transform:translateY(0) scale(1)}
      .soft98-pro-theme #soft98-pro-compatibility{--compat-bg:#101820;--compat-surface:#17242e;--compat-border:#d8a94e;--compat-text:#f2f7fa;--compat-muted:#a9bac4;--compat-action:#1d2d38;box-shadow:0 24px 72px rgba(0,0,0,.46)}
      .soft98-pro-rgb #soft98-pro-compatibility{--compat-border:#54e6b1;box-shadow:0 24px 74px rgba(0,0,0,.5),0 0 0 1px rgba(130,125,255,.18),0 0 32px rgba(50,219,193,.12)}
      #soft98-pro-compatibility header{display:flex;align-items:center;gap:10px;background:transparent!important;color:var(--compat-text)!important}
      #soft98-pro-compatibility header>span{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border:1px solid var(--compat-border);border-radius:50%;color:var(--compat-border);font:bold 18px/1 system-ui}
      #soft98-pro-compatibility header>div{display:grid;min-width:0;background:transparent!important}
      #soft98-pro-compatibility strong,#soft98-pro-compatibility p,#soft98-pro-compatibility small{margin:0;background:transparent!important;color:inherit!important}
      #soft98-pro-compatibility header small,#soft98-pro-compatibility [data-role=feedback]{color:var(--compat-muted)!important}
      #soft98-pro-compatibility code{display:block;overflow:hidden;padding:8px 10px;border:1px solid color-mix(in srgb,var(--compat-border) 42%,transparent);border-radius:6px;background:var(--compat-surface)!important;color:var(--compat-muted)!important;font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}
      #soft98-pro-compatibility [data-role=actions]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      #soft98-pro-compatibility button{min-width:0;padding:8px;border:1px solid color-mix(in srgb,var(--compat-border) 34%,transparent);border-radius:6px;background:var(--compat-action)!important;color:var(--compat-text)!important;font:650 12px/1.35 system-ui;cursor:pointer;transition:transform .15s ease,border-color .15s ease,background-color .15s ease}
      #soft98-pro-compatibility button:hover{border-color:var(--compat-border);transform:translateY(-1px)}
      #soft98-pro-compatibility button:active{transform:translateY(0) scale(.98)}
      #soft98-pro-compatibility button:focus-visible{outline:2px solid var(--compat-border);outline-offset:2px}
      @media(max-width:540px){#soft98-pro-compatibility [data-role=actions]{grid-template-columns:1fr}#soft98-pro-compatibility{inset-inline:12px;width:auto;bottom:12px}}
      @media(prefers-reduced-motion:reduce){#soft98-pro-compatibility,#soft98-pro-compatibility button{transition:none!important}}
    `;
    panel.appendChild(style);
    panel.querySelector("[data-action=keep]").addEventListener("click", () => dismissCompatibility(report.sha256));
    panel.querySelector("[data-action=disable]").addEventListener("click", () => {
      dismissCompatibility(report.sha256);
      writeSettings({ ...settings, patchScripts: false });
      log("warn", text("logs.compatibilityEngineDisabled"), report);
      window.setTimeout(() => location.reload(), 160);
    });
    panel.querySelector("[data-action=report]").addEventListener("click", async () => {
      const copied = await copyCompatibilityDiagnostic(report);
      panel.querySelector("[data-role=feedback]").textContent = copied ? text("compatibilityCopied") : text("compatibilityCopyFailed");
      window.open(compatibilityIssueUrl(report), "_blank", "noopener,noreferrer");
    });
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.setAttribute("data-open", "true"));
    panel.querySelector("[data-action=keep]").focus({ preventScroll: true });
  }

  function acceptCompatibilityReport(report) {
    if (!report || typeof report !== "object" || !/^[a-f0-9]{64}$/.test(report.sha256 || "")) return;
    const match = compatibleScript(report.sha256);
    compatibilityState = { ...report, status: match ? match.status : report.status || "unknown", match };
    stats.scriptCompatibility = compatibilityState;
    refreshControlTelemetry();
    if (compatibilityState.status === "compatible") {
      const panel = document.getElementById("soft98-pro-compatibility");
      if (panel) panel.remove();
      log("info", text("logs.scriptCompatible"), compatibilityState);
    } else {
      log("warn", text("logs.scriptUnknown"), compatibilityState);
      onReady(() => renderCompatibilityPrompt(compatibilityState));
    }
  }

  function receiveExtensionCompatibility() {
    try {
      const raw = document.documentElement.getAttribute("data-soft98-pro-compatibility") || "";
      acceptCompatibilityReport(JSON.parse(decodeURIComponent(raw)));
    } catch (_error) {}
  }

  async function inspectPageScripts() {
    if (IS_EXTENSION || !nativeFetch || !crypto || !crypto.subtle) return;
    const urls = [...document.querySelectorAll("script[src]")].map((script) => supportedScriptUrl(script.src)).filter(Boolean);
    for (const url of [...new Set(urls)]) {
      try {
        const response = await nativeFetch(url, { cache: "no-store", credentials: "include" });
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        const sha = await digestSource(buffer);
        acceptCompatibilityReport({
          schemaVersion: 1,
          status: compatibleScript(sha) ? "compatible" : "unknown",
          sha256: sha,
          url: response.url || url,
          bytes: buffer.byteLength,
          observedAt: new Date().toISOString(),
          extensionVersion: VERSION,
        });
      } catch (_error) {}
    }
  }

  function unpackDeanEdwards(source) {
    const result = PatchEngine.unpack(source, (expression) => safeEval(`(${expression})`, window));
    return result.error ? String(source || "") : result.code;
  }

  function patchSoft98Code(source, origin) {
    if (!settings.patchScripts) return source;
    const result = PatchEngine.patch(source, { evaluate: (expression) => safeEval(`(${expression})`, window) });
    if (!result.recognized) return source;
    for (const failure of result.failures) recordPatchFailure(failure.stage, new Error(failure.message), result.code);
    let code = result.code;
    const before = String(source || "");
    const patches = result.patches;
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
      log("info", text("logs.applicationPatched"), { origin, patches });
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
    if (executedUpstreamScripts.has(src)) return;
    executedUpstreamScripts.add(src);
    nativeFetch(src, { credentials: "include", cache: "reload" })
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => {
        if (!text) return;
        safeEval(patchSoft98Code(text, src), window, text);
      })
      .catch(() => executedUpstreamScripts.delete(src));
  }

  function requestExtensionPatchedScript(src) {
    if (!IS_EXTENSION || executedUpstreamScripts.has(src)) return false;
    document.documentElement.setAttribute(UPSTREAM_REQUEST, encodeURIComponent(src));
    document.dispatchEvent(new CustomEvent("soft98-pro:request-upstream-script"));
    return true;
  }

  function receiveExtensionPatchedScript() {
    const payload = document.getElementById(UPSTREAM_PAYLOAD_ID);
    if (!payload) return;
    const src = safeDecode(payload.getAttribute("data-origin") || "");
    const source = payload.textContent || "";
    const error = payload.getAttribute("data-error") || "";
    const report = safeDecode(payload.getAttribute("data-report") || "");
    payload.remove();
    if (report) {
      try {
        acceptCompatibilityReport(JSON.parse(report));
      } catch (_error) {}
    }
    if (!src || executedUpstreamScripts.has(src)) return;
    if (!source || error) {
      if (nativeFetch) runPatchedScript(src);
      return;
    }
    executedUpstreamScripts.add(src);
    const patched = patchSoft98Code(source, `service-worker:${src}`);
    safeEval(patched, window);
    document.documentElement.setAttribute("data-soft98-pro-upstream", "worker-patched");
  }

  function neutralizeScript(script) {
    if (!isSoft98Script(script)) return;
    const src = script.src || script.getAttribute("src") || "";
    if (SOFT98_SCRIPT.test(src) && !settings.patchScripts) return;
    script.setAttribute(DATA_PATCHED, "1");
    script.type = "javascript/blocked-by-soft98-ad-blocker";
    script.removeAttribute("src");
    if (SOFT98_SCRIPT.test(src)) {
      if (!requestExtensionPatchedScript(src)) runPatchedScript(src);
    }
    else script.remove();
  }

  function installScriptHijack() {
    if (window.__soft98ProScriptGateway) return;
    window.__soft98ProScriptGateway = true;
    const originalAppendChild = Node.prototype.appendChild;
    const originalInsertBefore = Node.prototype.insertBefore;
    const originalReplaceChild = Node.prototype.replaceChild;
    const originalElementAppend = Element.prototype.append;
    const originalPrepend = Element.prototype.prepend;
    const originalBefore = Element.prototype.before;
    const originalAfter = Element.prototype.after;
    Node.prototype.appendChild = function patchedAppendChild(node) {
      neutralizeScript(node);
      return originalAppendChild.call(this, node);
    };
    Node.prototype.insertBefore = function patchedInsertBefore(node, child) {
      neutralizeScript(node);
      return originalInsertBefore.call(this, node, child);
    };
    Node.prototype.replaceChild = function patchedReplaceChild(node, child) {
      neutralizeScript(node);
      return originalReplaceChild.call(this, node, child);
    };
    const neutralizeArguments = (nodes) => nodes.forEach((node) => neutralizeScript(node));
    Element.prototype.append = function patchedAppend(...nodes) {
      neutralizeArguments(nodes);
      return originalElementAppend.apply(this, nodes);
    };
    Element.prototype.prepend = function patchedPrepend(...nodes) {
      neutralizeArguments(nodes);
      return originalPrepend.apply(this, nodes);
    };
    Element.prototype.before = function patchedBefore(...nodes) {
      neutralizeArguments(nodes);
      return originalBefore.apply(this, nodes);
    };
    Element.prototype.after = function patchedAfter(...nodes) {
      neutralizeArguments(nodes);
      return originalAfter.apply(this, nodes);
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
        log("warn", text("logs.scrollDetectorBlocked"), { type: String(type) });
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
          if (processingDom && INTERNAL_MUTATION_ATTRIBUTES.has(mutation.attributeName)) continue;
          if (!isOwnedInterface(mutation.target)) schedule(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          neutralizeScript(node);
          const target = asElement(node) || node.parentElement;
          if (target && !isOwnedInterface(target)) schedule(target);
        }
        for (const node of mutation.removedNodes) {
          const element = asElement(node);
          if (!element) continue;
          if (element.matches("[data-soft98-pro-owned=style],#soft98-pro-control") || element.querySelector("[data-soft98-pro-owned=style],#soft98-pro-control")) {
            ensureStyleIntegrity();
            if (!document.getElementById("soft98-pro-control")) onReady(renderControlPanel);
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "src", "class", "style", "onclick", "target", "aria-expanded", "aria-selected"],
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
    log(restored ? "warn" : "info", text("logs.documentHandlesChecked"), { restored });
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
      if (style.display === "none") trips.push(text("logs.trapDisplayNone"));
      if (/hidden|collapse/i.test(style.visibility)) trips.push(text("logs.trapNotVisible"));
      if (Number(style.opacity) < 1) trips.push(text("logs.trapOpacityReduced"));
      if (style.transform && style.transform !== "none") trips.push(text("logs.trapTransformed"));
      if (box.width < 15 || box.height < 15) trips.push(text("logs.trapTooSmall"));
      if (/adguard|adblock/i.test(`${style.content || ""} ${node.getAttribute("style") || ""}`)) trips.push(text("logs.trapBlockerMarker"));
      if (node.tagName === "IMG" && !node.getAttribute("src")) trips.push(text("logs.trapSourceLessImage"));
      if (trips.length) report.push({ node, trips, box });
    }
    safeConsole("groupCollapsed", text("logs.trapSummary", { count: report.length }));
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
    safeConsole("info", text("logs.diagnostics"), report);
    return report;
  }

  function init() {
    window.addEventListener("soft98-pro:compatibility", receiveExtensionCompatibility);
    window.addEventListener("soft98-pro:upstream-payload", receiveExtensionPatchedScript);
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
    receiveExtensionPatchedScript();
    installProStyle();
    installClickRepair();
    schedule(document);
    installObserver();
    document.documentElement.setAttribute("data-soft98-runtime-ready", VERSION);
    onReady(() => {
      renderControlPanel();
      inspectPageScripts();
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
    get compatibility() {
      return compatibilityState ? { ...compatibilityState } : null;
    },
    configure: (next) => writeSettings({ ...settings, ...next }),
    openPanel: () => {
      renderControlPanel();
      const wrap = document.querySelector("#soft98-pro-control");
      const form = document.querySelector("#soft98-pro-control form");
      if (wrap && form) {
        wrap.setAttribute("data-open", "true");
        form.setAttribute("aria-hidden", "false");
        const toggle = wrap.querySelector("[data-role='toggle']");
        if (toggle) toggle.setAttribute("aria-expanded", "true");
        refreshControlTelemetry();
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
