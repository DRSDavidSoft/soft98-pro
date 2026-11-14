(function soft98AdBlocker() {
  "use strict";

  const VERSION = "__SOFT98_VERSION__";
  const DATA_HREF = "data-soft98-adblocker-href";
  const DATA_STATE = "data-soft98-adblocker-state";
  const DATA_PATCHED = "data-soft98-adblocker-patched-script";
  const UPSTREAM_REQUEST = "data-soft98-pro-upstream-request";
  const UPSTREAM_PAYLOAD_SELECTOR = "script[data-soft98-pro-upstream-payload]";
  const FAVICON_ID = "soft98-pro-favicon";
  const CONTROL_POSITION_KEY = "soft98-ad-blocker.control-position";
  const DOWNLOAD_METADATA_KEY = "soft98-pro.download-metadata";
  const COMPATIBILITY_DISMISS_KEY = "soft98-pro.compatibility-dismissed";
  const CONTROL_MARGIN = 12;
  const CONTROL_GRAVITY = 76;
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
  const PAGE_ICONS = __SOFT98_PAGE_ICONS__;
  const UTILITY_PATH_ICONS = __SOFT98_UTILITY_PATH_ICONS__;
  const OPTION_PREVIEWS = __SOFT98_OPTION_PREVIEWS__;
  const LISTING_NAVIGATION_CSS = __SOFT98_LISTING_NAVIGATION_CSS__;
  const COMMENTS_CSS = __SOFT98_COMMENTS_CSS__;
  const CHROME_CSS = __SOFT98_CHROME_CSS__;
  const EARLY_ADS_CSS = __SOFT98_EARLY_ADS_CSS__;
  const comments = Soft98Comments.create(document);
  const SUCCESS_NOTICE_MS = 6000;
  const FAVICON_PULSE_MS = 600;
  const FAVICON_NOTICE_MS = 4 * FAVICON_PULSE_MS;
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
    expandMain: false,
    utilityInHeader: true,
    quickNavigation: false,
    soundFeedback: false,
    linkBadges: true,
    pirateLogo: true,
    taunt: false,
    diagnostics: true,
    recommendExtension: __SOFT98_RECOMMEND_EXTENSION__,
    rgbMode: false,
    showLatest: true,
    hideAnnoyances: false,
  };
  const savedHref = new WeakMap();
  const originalLogos = new Map();
  const hiddenPageDisplays = new WeakMap();
  const passwordActions = new WeakMap();
  const downloadFeedbackTimers = new WeakMap();
  const contentGrids = new Map();
  const restoredUtilityCards = new Map();
  const stockFooters = new Map();
  const faqAnimations = new WeakMap();
  const utilityDisclosures = new WeakMap();
  const disclosureAnimations = new WeakMap();
  const proDialogs = new Map();
  const siteReadOnlyDialogs = new Map();
  const dialogState = new WeakMap();
  const articlePreviewCache = new Map();
  const articlePreviewTriggers = new WeakSet();
  const contentTabs = new Map();
  let audioContext;
  let audioAt = 0;
  const legacyToneKinds = ["color", "background-color", "border-block-start-color", "border-inline-start-color"];
  let currentDialogKey = "";
  let dialogRequested = false;
  let dialogHistoryBound = false;
  let updatingSiteTheme = false;
  let nativeThemeChangePending = false;
  let siteThemeReady = false;
  const downloadRows = new WeakMap();
  const downloadHeadings = new WeakMap();
  let downloadRowId = 0;
  let downloadToastTimer;
  const downloadProbes = new Map();
  let downloadCache;
  let downloadObserver;
  const trackedLinks = new Set();
  const unwrappedLinks = new WeakSet();
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
  let scanFrame = 0;
  let recoveryStarted = false;
  let originalTitle = document.title || "";
  let successAnnounced = false;
  let successNoticeTimer = null;
  let successNoticeShown = false;
  const faviconImages = new Map();
  let faviconNotice = null;
  let faviconTimer;
  let controlPanel = null;
  let controlSection = "protection";
  let settings = readSettings();
  let compatibilityState = null;
  let gridFrame = 0;
  let sidebarContentsDirty = true;
  const gridStyles = new WeakMap();
  let integrityScheduled = false;
  let useConstructableStyles = true;

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
  const NAMED_AD_TEXT = /(?:asiatech|iranicard|آسیا[\u0640\s\u200c-]*تک|آ[\u0640\s\u200c-]*س[\u0640\s\u200c-]*ی[\u0640\s\u200c-]*ا[\u0640\s\u200c-]*ت[\u0640\s\u200c-]*ک)/i;

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

  function writeSettings(next, { sync = true } = {}) {
    settings = { ...DEFAULT_SETTINGS, ...next };
    document.documentElement.toggleAttribute("data-soft98-pro-ads-off", !settings.blockAds);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      safeConsole("warn", text("logs.settingsPersistFailed"), error);
    }
    if (IS_EXTENSION && sync) {
      try {
        document.documentElement.setAttribute("data-soft98-pro-settings", encodeURIComponent(JSON.stringify(settings)));
        document.dispatchEvent(new CustomEvent("soft98-pro:settings-changed"));
      } catch (_error) {}
    }
    installProStyle();
    syncNativeNightMode();
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
    return Boolean(element && element.closest("#soft98-pro-control,#soft98-pro-compatibility,#soft98-extension-recommendation,#soft98-ad-blocker-taunt,[data-soft98-pro-download-actions],[data-soft98-pro-password-actions],[data-soft98-pro-copy-toast],[data-soft98-pro-footer]"));
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

  const REFERRER_WRAPPER_LINK = 'a[href*="href.li" i]';

  function unwrapReferrerLink(url) {
    if (url.hostname !== "href.li" || url.pathname !== "/" || url.port || url.username || url.password ||
        !/^https?:$/.test(url.protocol) || !url.search) return null;
    // This service stores the whole destination in the query, not a named parameter.
    let value = url.search.slice(1);
    try {
      if (/^https?%3a%2f%2f/i.test(value)) value = decodeURIComponent(value);
      if (!/^https?:\/\/[^/?#]/i.test(value) || /[\x00-\x20\x7f\\]/.test(value)) return null;
      const destination = new URL(value + url.hash);
      return destination.hostname !== "href.li" && !destination.username && !destination.password ? destination : null;
    } catch (_error) {
      return null;
    }
  }

  function normalizeReferrerLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return;
    let original;
    try { original = new URL(link.href); } catch (_error) { return; }
    const destination = unwrapReferrerLink(original);
    if (!destination || isBadHref(destination.href)) return;
    link.relList.add("noreferrer");
    unwrappedLinks.add(link);
    link.href = destination.href;
  }

  function normalizeReferrerLinks(root) {
    if (!settings.pro) return;
    if (root.matches?.(REFERRER_WRAPPER_LINK)) normalizeReferrerLink(root);
    root.querySelectorAll?.(REFERRER_WRAPPER_LINK).forEach(normalizeReferrerLink);
  }

  function normalizeHref(link, href) {
    const value = href || link.getAttribute("href") || "";
    if (isBadHref(value)) return "";
    try {
      const original = new URL(value, location.href);
      const url = settings.pro ? unwrapReferrerLink(original) || original : original;
      return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : "";
    } catch (_error) {
      return "";
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
    const card = header?.parentElement;
    if (!card || card === document.body || card === document.documentElement || isProtectedContentContainer(card)) return null;
    const title = normalizedPersian(heading.textContent || "");
    if (title === "تبلیغات" && card !== header && !card.matches("main,article") &&
        (card.matches("section,aside") || card.closest("aside") || card.querySelector("iframe,img,object,embed"))) return card;
    const headingLength = title.length;
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

  function isLiveSidebarCard(node, boundary = node?.parentElement) {
    if (!node || node.matches("hr,[hidden],[aria-hidden=true]")) return false;
    for (let parent = node; parent && parent !== boundary; parent = parent.parentElement) {
      if (parent.hidden || getComputedStyle(parent).display === "none") return false;
    }
    return Boolean(node.textContent.trim() || node.matches("a[href],button,form,img,iframe") ||
      node.querySelector("img,iframe,form,button"));
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
      const next = card.nextElementSibling;
      const parent = card.parentElement;
      card.remove();
      if (separator && document.contains(separator)) separator.remove();
      if (next?.matches("hr") && !isLiveSidebarCard(next.previousElementSibling)) next.remove();
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
    const href = link ? link.getAttribute("href") || link.getAttribute("data-href") : element.getAttribute("href");
    if (BLOCKED_URL.test(href || element.getAttribute("src") || "")) return true;
    if (!image) return false;
    const src = image.currentSrc || image.src || image.getAttribute("src") || "";
    const box = visibleBox(image);
    const size = `${box.width}x${box.height}`;
    const firstPartyAdAsset = /img\.soft98\.ir\/(?:ads?|[0-9]+)\//i.test(src);
    const adSized = AD_SIZE.test(size) || (box.width === 728 && Math.abs(box.height - 90) <= 2);
    const backup = image.getAttribute("data-backup") || "";
    const backupMedia = backup && /\.(?:avif|gif|png|webp|jpe?g)(?:[?#]|$)/i.test(backup);
    return (adSized && (firstPartyAdAsset || isExternalAdHref(href) || (backupMedia && Boolean(link)))) || isGeneratedAdFamily(link, image);
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
    const link = element.closest && element.closest("a[href],[data-href]");
    if (link && (isLikelyAdSurface(link) || isDeferredHeaderBanner(link) || isIranicardBanner(link))) {
      const wrapper = link.parentElement;
      return wrapper?.children.length === 1 && wrapper.matches("div") && !isProtectedContentContainer(wrapper) ? wrapper : link;
    }
    if (isLikelyNamedAdFrame(element)) return bestAdFrameRoot(element);
    return element;
  }

  function isDeferredHeaderBanner(node) {
    if (!node.closest("header") || !isExternalAdHref(node.getAttribute("data-href"))) return false;
    const box = visibleBox(node);
    return box.width >= 300 && box.height >= 40 && box.height <= 180 && box.width / box.height >= 4 &&
      node.querySelector("img[data-backup],span > small") !== null && !node.querySelector("p,ul,ol,form");
  }

  function normalizedPersian(value) {
    return value.normalize("NFKC").replace(/[\s\u0640\u200c\u200d]+/gu, "").replace(/ي/g, "ی");
  }

  function isIranicardBanner(node) {
    if (!node.closest("header")) return false;
    const destination = node.getAttribute("data-href") || node.getAttribute("href");
    let host = "";
    try { host = new URL(destination).hostname; } catch (_error) {}
    return /^(?:www\.)?(?:ircd\.me|iranicard\.ir)$/i.test(host) &&
      (Boolean(node.querySelector("img")) || normalizedPersian(node.textContent || "").includes("ایرانیکارت"));
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
    const href = savedHref.get(link);
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
    if (!unwrappedLinks.has(link)) link.removeAttribute("target");
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
      if (trackedLinks.has(link)) restoreLink(link);
      else if (isBadHref(link.getAttribute("href"))) lost += 1;
    }
    if (lost) recoverLinksFromFreshPage();
  }

  function matchRecoveredLink(target, candidates) {
    const label = linkLabel(target);
    if (!label) return null;
    const matches = candidates.filter((candidate) => linkLabel(candidate) === label);
    const destinations = (links) => [...new Set(links.map((link) => normalizeHref(link)).filter(Boolean))];
    const all = destinations(matches);
    if (all.length === 1) return all[0];
    const section = downloadSectionLabel(target);
    if (!section) return null;
    const scoped = destinations(matches.filter((candidate) => downloadSectionLabel(candidate) === section));
    return scoped.length === 1 ? scoped[0] : null;
  }

  function downloadSectionLabel(link) {
    const entry = link.closest("dd,li");
    if (entry?.tagName === "DD") {
      for (let sibling = entry.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        if (sibling.tagName === "DT") {
          return linkLabel(sibling.querySelector(":scope > span:not([data-soft98-pro-download-actions])") || sibling);
        }
      }
    }
    const group = link.closest("section,article");
    const heading = group?.querySelector(":scope > header h1,:scope > header h2,:scope > header h3,:scope > h1,:scope > h2,:scope > h3");
    return heading ? linkLabel(heading) : "";
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
    if (element.matches && (isLikelyNamedAdFrame(element) || isDeferredHeaderBanner(element) || isIranicardBanner(element) || (["A", "IMG", "IFRAME"].includes(element.tagName) && isLikelyAdSurface(element)))) nodes.push(element);
    if (element.querySelectorAll) {
      for (const node of element.querySelectorAll("a[href], img, iframe")) {
        if (isLikelyAdSurface(node)) nodes.push(node);
      }
      for (const node of element.querySelectorAll("header [data-href],header a[href]")) {
        if (isDeferredHeaderBanner(node) || isIranicardBanner(node)) nodes.push(node);
      }
      for (const node of element.querySelectorAll("aside, section, div")) {
        if (isLikelyNamedAdFrame(node)) nodes.push(node);
      }
    }
    for (const node of nodes) {
      const removable = adRemovalRoot(node);
      if (removable?.isConnected && !containsKeyedDownloadList(removable)) {
        const advertiser = isIranicardBanner(node) ? "Iranicard" : undefined;
        removable.remove();
        stats.adsRemoved += 1;
        log("info", text("logs.adSurfaceRemoved"), { tag: removable.tagName, advertiser });
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
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    const inline = [element.id, element.className, element.getAttribute("style"), element.getAttribute("href")].join(" ");
    if (!PERSIAN_BLOCKER_NOTICE.test(`${text} ${inline}`)) return false;
    if (isProtectedContentContainer(element)) return false;
    const box = visibleBox(element);
    const fixed = /(?:^|;)\s*position\s*:\s*(?:fixed|sticky)/i.test(element.getAttribute("style") || "") || getComputedStyle(element).position === "fixed";
    const intrusive = fixed || box.height >= 40 || box.width >= Math.min(320, Math.round(window.innerWidth * 0.45));
    return (intrusive || Boolean(element.querySelector("a[href*='PersianBlocker'], a[href*='MasterKia']"))) && isCompactNotice(element);
  }

  function isProtectedContentContainer(element) {
    if (!element || !element.querySelectorAll) return false;
    if (element.matches("html,body,main,article,#content,#main,.content,.main,.entry,.post,.download-list,.download-list-item")) return true;
    if (element.querySelector("main,article,#content,#main,.content,.main,.entry,.post,.download-list,.download-list-item")) return true;
    if (containsKeyedDownloadList(element)) return true;
    const links = element.querySelectorAll("a[href]");
    if (links.length >= 5) return true;
    return Boolean(element.querySelector(SELECTORS.links));
  }

  function containsKeyedDownloadList(element) {
    return Boolean(element.closest("article [role=tabpanel]") &&
      (element.matches("dl") || element.querySelector("dl")) &&
      element.querySelector("dd a[data-key], dd a[download]"));
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
    const ordered = [...candidates]
      .filter(node => isWarningNode(node) || isExternalBlockerNotice(node))
      .map(node => ({ node, length: (node.textContent || "").length, depth: domDepth(node) }))
      .sort((left, right) => left.length - right.length || right.depth - left.depth);
    for (const { node: candidate } of ordered) {
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
    restorePageIdentity();
  }

  function restorePageIdentity() {
    const hash = safeDecode(location.hash || "");
    if (hash && WARNING_TITLE.test(hash)) history.replaceState(null, document.title, `${location.pathname}${location.search}`);
    if (!originalTitle && document.title && !WARNING_TITLE.test(document.title)) originalTitle = document.title;
    if (originalTitle && WARNING_TITLE.test(document.title)) document.title = originalTitle;
  }

  function removeLegacyBanners() {
    const recommendation = document.getElementById("soft98-extension-recommendation");
    if (recommendation && !settings.recommendExtension) recommendation.remove();
    const taunt = document.getElementById("soft98-ad-blocker-taunt");
    if (taunt && (!settings.taunt || !taunt.hasAttribute("data-soft98-pro-notice"))) taunt.remove();
  }

  function domDepth(element) {
    let depth = 0;
    for (let node = element; node && node.parentElement; node = node.parentElement) depth += 1;
    return depth;
  }

  function processRoot(root) {
    removeLegacyBanners();
    normalizeReferrerLinks(root);
    collectLinks(root);
    replaceHostileBranding(root);
    removeExternalAds(root);
    removeWarnings(root);
    applyProThemeHeuristics(root);
  }

  function schedule(root) {
    if (!root || root === document || pendingRoots.size >= 32) {
      pendingRoots.clear();
      pendingRoots.add(document);
    } else if (!pendingRoots.has(document)) pendingRoots.add(root);
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      const roots = [...pendingRoots].filter((node) => node.isConnected);
      pendingRoots.clear();
      if (!roots.length) return;
      const unique = roots.filter((node) => !roots.some((parent) => parent !== node && parent.contains(node)));
      sidebarContentsDirty = true;
      ensureStyleIntegrity();
      for (const item of unique) processRoot(item);
      comments.sync({ enabled: settings.pro, text });
      if (settings.pro) {
        applyInteractiveSurfaceHeuristics();
        applyProLayoutHeuristics();
      }
      if (settings.pro) {
        applyPagePreferences();
        applySiteChrome();
      } else {
        document.documentElement.removeAttribute("data-soft98-pro-chrome");
        restoreUtilityPlacement();
        for (const [footer, previous] of stockFooters) {
          if (footer.isConnected) footer.style.setProperty("display", ...previous);
          stockFooters.delete(footer);
        }
      }
      for (const link of trackedLinks) {
        if (document.contains(link)) restoreLink(link);
        else trackedLinks.delete(link);
      }
      applyLinkBadges();
      announceSuccess();
      refreshControlTelemetry();
    });
  }

  function supportsConstructableStyles() {
    return Boolean(useConstructableStyles && NativeStyleSheet && NativeStyleSheet.prototype && typeof NativeStyleSheet.prototype.replaceSync === "function" && "adoptedStyleSheets" in document);
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
      try {
        if (!record.sheet) record.sheet = new NativeStyleSheet();
        record.sheet.replaceSync(record.enabled ? record.cssText : "");
        ensureStyleIntegrity();
        return;
      } catch (_error) {
        useConstructableStyles = false;
        ensureStyleIntegrity();
      }
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
        try {
          if (next.length !== current.length || next.some((sheet, index) => sheet !== current[index])) document.adoptedStyleSheets = next;
          return;
        } catch (_error) {
          useConstructableStyles = false;
        }
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
      :root[data-soft98-pro-chrome] [data-soft98-pro-stock-footer]{display:none!important}
      :root:not([data-soft98-pro-chrome]) [data-soft98-pro-footer]{display:none!important}
      :root[data-soft98-pro-chrome]:not(.soft98-pro-theme) [data-soft98-pro-footer]{display:flex;flex-wrap:wrap;gap:14px;margin:24px auto;padding:16px;max-width:1280px}
      :root[data-soft98-runtime-ready] #soft98-ad-blocker-taunt[data-soft98-pro-notice],
      :root[data-soft98-runtime-ready] #soft98-extension-recommendation{display:grid!important}
      #soft98-ad-blocker-taunt[data-soft98-pro-notice]{--taunt-bg:#f7fafc;--taunt-border:#b6cec3;--taunt-text:#21332d;position:fixed;bottom:64px;inset-inline-start:12px;z-index:2147483646;box-sizing:border-box;width:max-content;max-width:min(320px,calc(100vw - 24px));padding:10px 14px;border:1px solid var(--taunt-border)!important;border-radius:8px;background:var(--taunt-bg)!important;color:var(--taunt-text)!important;box-shadow:0 10px 26px #0004!important;font:inherit;text-align:start;pointer-events:none}
      #soft98-ad-blocker-taunt[data-theme=dark]{--taunt-bg:#101b24;--taunt-border:#34765f;--taunt-text:#e4fff4}
      [id*="PersianBlocker"],[class*="PersianBlocker"]{display:none!important}
      [data-soft98-pro-brand-replaced]{border:1px solid #b8cbd5!important;border-radius:6px!important;background:#f7fafc!important;color:#1d2a35!important;box-shadow:0 6px 20px rgba(27,45,57,.12)!important;padding:.35em .65em!important;font:600 13px/1.6 system-ui,sans-serif!important;text-decoration:none!important}
      .soft98-pro-theme [data-soft98-pro-brand-replaced]{border-color:var(--s98p-border)!important;background:var(--s98p-surface-2)!important;color:var(--s98p-accent)!important;box-shadow:0 8px 24px rgba(0,0,0,.28)!important}
      :root:not(.soft98-pro-theme) [data-soft98-pro-page-icon]{display:none!important}
      :root:not(.soft98-pro-theme) [data-soft98-pro-password-actions]{display:none!important}
      :root:not(.soft98-pro-theme) [data-soft98-pro-password-shell]{display:contents}
      :root:not(.soft98-pro-theme) :is([data-soft98-pro-download-actions],[data-soft98-pro-copy-toast]){display:none!important}
      :root:not(.soft98-pro-theme) [data-soft98-pro-download-meta]{display:none!important}
      a[${DATA_HREF}]{pointer-events:auto}
      a[data-soft98-brand-compact]{min-height:36px!important;min-width:86px;background-size:86px auto!important;background-repeat:no-repeat!important;background-position:center!important}
      img[data-soft98-brand-compact]{width:86px!important;max-width:100%!important;height:38px!important;object-fit:cover!important}
      [data-soft98-brand-kind=background]{display:block!important;background-size:contain!important;background-repeat:no-repeat!important;background-position:center!important}
      [data-soft98-brand-kind=background]:not([data-soft98-brand-compact]){min-height:104px!important}
      [data-soft98-brand-kind=background]>*{visibility:hidden!important}
      @media(max-width:700px){[data-soft98-brand-kind=background]:not([data-soft98-brand-compact]){min-height:78px!important}}
    `);
  }

  function installProStyle() {
    const active = settings.pro;
    document.documentElement.classList.toggle("soft98-pro-theme", active);
    document.documentElement.classList.toggle("soft98-pro-light", active && !settings.darkDesign && !settings.rgbMode);
    document.documentElement.classList.toggle("soft98-pro-rgb", active && settings.rgbMode);
    document.documentElement.classList.toggle("soft98-pro-compact", active && settings.compactLayout);
    document.documentElement.classList.toggle("soft98-pro-scroll-width", active && settings.compactLayout && settings.expandMain);
    scheduleContentGridUpdate();
    syncPageVisibility();
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
      :root.soft98-pro-theme{color-scheme:dark;--s98p-bg:#090c10;--s98p-bg-2:#0d1218;--s98p-nav:#10151c;--s98p-surface:#151b23;--s98p-surface-2:#1a222c;--s98p-elevated:#202a36;--s98p-soft:#253341;--s98p-border:#364658;--s98p-border-soft:#28333f;--s98p-text:#edf3fa;--s98p-muted:#aab8c8;--s98p-faint:#8b9aad;--s98p-accent:#49edb3;--s98p-accent-2:#f4bd70;--s98p-link:#9bd4ff;--s98p-danger:#ff8896;--s98p-radius:8px}
      .soft98-pro-theme,.soft98-pro-theme body{background:#070b0f!important;color:var(--s98p-text)!important}
      .soft98-pro-theme body{min-height:100vh;background:linear-gradient(180deg,#0e171d 0,#090f14 30rem,#070b0f 100%)!important}
      .soft98-pro-theme body,.soft98-pro-theme p,.soft98-pro-theme li,.soft98-pro-theme dd,.soft98-pro-theme td,.soft98-pro-theme span{color:var(--s98p-text)}
      .soft98-pro-theme small,.soft98-pro-theme time,.soft98-pro-theme [data-soft98-pro-tone=muted]{color:var(--s98p-muted)!important}
      .soft98-pro-theme [data-soft98-pro-tone=body]{color:var(--s98p-text)!important}
      .soft98-pro-theme a[data-soft98-pro-tone=action]{background:var(--s98p-surface-2)!important;border-color:var(--s98p-border-soft)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme a[data-soft98-pro-tone=action]:hover{background:var(--s98p-soft)!important}
      .soft98-pro-theme [data-soft98-pro-utility-icon]{background-color:var(--s98p-surface-2)!important;border-color:var(--s98p-border-soft)!important;box-shadow:none!important;filter:none!important}
      :root.soft98-pro-theme [data-soft98-pro-utility-icon][data-soft98-pro-icon-host]{display:grid!important;place-items:center;background-image:none!important}
      :root.soft98-pro-theme [data-soft98-pro-utility-icon][data-soft98-pro-icon-host]::before,
      :root.soft98-pro-theme [data-soft98-pro-utility-icon][data-soft98-pro-icon-host]::after{display:none!important;content:none!important}
      :root.soft98-pro-theme [data-soft98-pro-utility-icon] > [data-soft98-pro-page-icon]{width:32px;height:32px;margin:0;background:transparent!important;--icon-color:#b8cee5}
      :root.soft98-pro-theme [data-soft98-pro-utility-icon] svg{width:27px;height:27px}
      :root.soft98-pro-theme [data-soft98-pro-utility-icon] img{display:block;max-width:32px;max-height:32px;object-fit:contain;filter:none!important}
      .soft98-pro-theme [data-soft98-pro-utility-card] > footer{background:var(--s98p-surface-2)!important;color:var(--s98p-text)!important;border-color:var(--s98p-border)!important}
      .soft98-pro-theme [data-soft98-pro-utility-card] > footer:hover{background:var(--s98p-soft)!important}
      .soft98-pro-theme [data-soft98-pro-utility-header],.soft98-pro-theme [data-soft98-pro-utility-header] :is(h1,h2,h3,h4,h5,h6){border-color:var(--s98p-border)!important;text-shadow:none!important}
      .soft98-pro-theme [data-soft98-pro-utility-header] :is(h1,h2,h3,h4,h5,h6)::before,.soft98-pro-theme [data-soft98-pro-utility-header] :is(h1,h2,h3,h4,h5,h6)::after{color:var(--s98p-muted)!important;text-shadow:none!important}
      .soft98-pro-theme [data-soft98-pro-download-group] :is(dt,dd,a,span,i),.soft98-pro-theme [data-soft98-pro-download-group] :is(dt,dd,a,span,i)::before,.soft98-pro-theme [data-soft98-pro-download-group] :is(dt,dd,a,span,i)::after{text-shadow:none!important}
      .soft98-pro-theme [data-soft98-pro-page-icon]{display:inline-grid!important;place-items:center;flex:none;width:28px;height:28px;vertical-align:middle;margin-inline-end:8px;border-radius:6px;background:color-mix(in srgb,var(--icon-color) 11%,var(--s98p-bg-2))!important;color:var(--icon-color)!important;box-shadow:none!important;--icon-color:var(--s98p-muted)}
      .soft98-pro-theme [data-soft98-pro-page-icon] svg{display:block;width:22px;height:22px;filter:none!important}
      .soft98-pro-theme [data-soft98-pro-page-icon]:is([data-soft98-pro-page-icon=windows],[data-soft98-pro-page-icon=apple],[data-soft98-pro-page-icon=android],[data-soft98-pro-page-icon=linux]){--icon-color:#e2eaf6}
      .soft98-pro-theme [data-soft98-pro-page-icon=download]{--icon-color:var(--s98p-accent)}
      .soft98-pro-theme [data-soft98-pro-page-icon=lock]{--icon-color:var(--s98p-accent-2)}
      .soft98-pro-theme [data-soft98-pro-icon-host]::before,.soft98-pro-theme [data-soft98-pro-icon-host]::after,.soft98-pro-theme [data-soft98-pro-faq] summary div::before,.soft98-pro-theme [data-soft98-pro-faq] summary div::after{content:none!important}
      :root.soft98-pro-theme article [role=tabpanel] [data-soft98-pro-download-group] [data-soft98-pro-icon-host]::before,
      :root.soft98-pro-theme article [role=tabpanel] [data-soft98-pro-download-group] [data-soft98-pro-icon-host]::after,
      :root.soft98-pro-theme article [role=tabpanel] [data-soft98-pro-icon-host]:is([data-soft98-pro-password],[data-soft98-pro-annoyance])::before,
      :root.soft98-pro-theme article [role=tabpanel] [data-soft98-pro-icon-host]:is([data-soft98-pro-password],[data-soft98-pro-annoyance])::after{content:none!important;display:none!important}
      .soft98-pro-theme [data-soft98-pro-download-group] > dt{background:var(--s98p-surface)!important;border-color:var(--s98p-border-soft)!important}
      .soft98-pro-theme [data-soft98-pro-download-group] > dt [data-soft98-pro-icon-host]{padding-inline-start:0!important}
      .soft98-pro-theme [data-soft98-pro-download-group] > dd{background:var(--s98p-bg-2)!important;border-color:var(--s98p-border-soft)!important}
      .soft98-pro-theme [data-soft98-pro-download-group] > dd:nth-of-type(even){background:var(--s98p-surface)!important}
      .soft98-pro-theme [data-soft98-pro-download-group] a[data-soft98-pro-icon-host]{color:var(--s98p-muted)!important}
      .soft98-pro-theme [data-soft98-pro-download-group] a[data-soft98-pro-icon-host]:is(:hover,:focus-visible){color:var(--s98p-link)!important}
      .soft98-pro-theme [data-soft98-pro-download-group] a[data-soft98-pro-icon-host=download]{color:var(--s98p-accent)!important;font-weight:700}
      .soft98-pro-theme [data-soft98-pro-download-group] a[data-soft98-pro-icon-host=download]:is(:hover,:focus-visible){background:color-mix(in srgb,var(--s98p-accent) 10%,var(--s98p-bg-2))!important;color:#b2ffe1!important}
      :root.soft98-pro-theme article [data-soft98-pro-download-group] > dd[data-soft98-pro-download-entry]{height:auto!important;max-height:none!important;padding:0!important;overflow:visible!important}
      :root.soft98-pro-theme article [data-soft98-pro-download-group] > dd[data-soft98-pro-download-entry]::before,
      :root.soft98-pro-theme article [data-soft98-pro-download-group] > dd[data-soft98-pro-download-entry]::after{content:none!important;display:none!important;animation:none!important;transition:none!important}
      :root.soft98-pro-theme article [data-soft98-pro-download-group] > dd[data-soft98-pro-download-collapsed]{display:none!important}
      :root.soft98-pro-theme article [data-soft98-pro-download-group] [data-soft98-pro-download-row]{display:grid!important;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:9px;width:100%!important;height:auto!important;min-height:42px;max-height:none!important;margin:0!important;padding:7px 14px!important;box-sizing:border-box;white-space:normal!important;line-height:1.5!important;overflow:visible!important;background-image:none!important;transition:background-color .16s,color .16s}
      :root.soft98-pro-theme article [data-soft98-pro-download-group] [data-soft98-pro-download-row]:is(:hover,:focus-visible){background-color:var(--s98p-soft)!important}
      :root.soft98-pro-theme article [data-soft98-pro-download-group] [data-soft98-pro-download-row]:active{background-color:color-mix(in srgb,var(--s98p-accent) 16%,var(--s98p-surface))!important}
      .soft98-pro-theme [data-soft98-pro-download-row] > *{pointer-events:none}
      .soft98-pro-theme [data-soft98-pro-download-row] > [data-soft98-pro-page-icon]{grid-column:1;grid-row:1;margin:0}
      .soft98-pro-theme [data-soft98-pro-download-row] > .soft98-pro-link-badge{grid-column:2;justify-self:start;margin:0}
      :root.soft98-pro-theme dd:has(> [data-soft98-pro-download-manager=file]){display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px}
      :root.soft98-pro-theme dd[data-soft98-pro-download-collapsed]:has(> [data-soft98-pro-download-manager=file]){display:none!important}
      :root:not(.soft98-pro-theme) [data-soft98-pro-download-manager]{display:none!important}
      :root.soft98-pro-theme [data-soft98-pro-download-manager=file]{display:grid;place-items:center;width:34px;height:32px;padding:0;margin-inline-end:6px;border:1px solid var(--s98p-border);border-radius:6px;background:var(--s98p-surface-2);color:var(--s98p-text);cursor:pointer}
      :root.soft98-pro-theme [data-soft98-pro-download-manager=file]:is(:hover,:focus-visible){border-color:var(--s98p-accent);color:var(--s98p-accent)}
      [data-soft98-pro-download-manager=file] svg{width:17px;height:17px;pointer-events:none}
      [data-soft98-pro-download-check]{display:none!important}
      .soft98-pro-theme [data-soft98-pro-download-activated] > [data-soft98-pro-page-icon]{--icon-color:var(--s98p-accent)}
      .soft98-pro-theme [data-soft98-pro-download-activated] > [data-soft98-pro-page-icon] > :not([data-soft98-pro-download-check]){display:none!important}
      .soft98-pro-theme [data-soft98-pro-download-activated] [data-soft98-pro-download-check]{display:block!important}
      .soft98-pro-theme [data-soft98-pro-download-copy]{display:grid;gap:2px;min-width:0;overflow-wrap:anywhere}
      .soft98-pro-theme [data-soft98-pro-download-title]{min-width:0;color:inherit}
      .soft98-pro-theme [data-soft98-pro-download-meta]{min-width:0;color:var(--s98p-muted)!important;font-size:.82em;font-weight:400}
      .soft98-pro-theme [data-soft98-pro-download-meta]:empty{display:none}
      .soft98-pro-theme [data-soft98-pro-download-heading]{display:flex!important;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 8px;padding:6px 8px!important}
      .soft98-pro-theme [data-soft98-pro-download-actions]{display:inline-flex;align-items:center;gap:4px;margin-inline-start:auto}
      .soft98-pro-theme [data-soft98-pro-download-actions] > button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;min-width:32px;padding:4px 7px;border:1px solid var(--s98p-border);border-radius:6px;background:var(--s98p-control-bg,var(--s98p-surface-2));color:var(--s98p-text);font:inherit;line-height:1.25;cursor:pointer}
      .soft98-pro-theme [data-soft98-pro-download-actions] > button[hidden]{display:none!important}
      .soft98-pro-theme [data-soft98-pro-download-actions] > button:is(:hover,:focus-visible){background:var(--s98p-control-hover,var(--s98p-soft));border-color:var(--s98p-faint)}
      .soft98-pro-theme [data-soft98-pro-download-actions] > button svg{width:16px;height:16px;flex:none;pointer-events:none}
      .soft98-pro-theme [data-soft98-pro-download-actions] [aria-expanded] svg{transform:rotate(-90deg);transition:transform .16s ease}
      .soft98-pro-theme [data-soft98-pro-download-actions] [aria-expanded="false"] svg{transform:none}
      .soft98-pro-theme [data-soft98-pro-password-shell]{display:grid;grid-template-columns:auto minmax(max-content,1fr) auto;align-items:center;gap:6px;padding:8px;background:var(--s98p-surface-2)!important;border:1px solid var(--s98p-border);border-radius:8px}
      :root.soft98-pro-theme article [role=tabpanel] [data-soft98-pro-password-shell]>[data-soft98-pro-password]{display:contents!important;color:var(--s98p-text)!important;text-shadow:none!important}
      .soft98-pro-theme [data-soft98-pro-password] span:not([aria-hidden=true]){color:inherit!important}
      .soft98-pro-theme article [role=tabpanel] [data-soft98-pro-icon-host][data-soft98-pro-annoyance]{padding-inline-start:12px!important}
      .soft98-pro-theme [data-soft98-pro-password]>[data-soft98-pro-page-icon]{margin:0}
      :root.soft98-pro-theme article [role=tabpanel] [data-soft98-pro-password] > input[readonly]{grid-column:1/-1;width:100%!important;max-width:none!important;min-width:0;box-sizing:border-box;min-height:38px;margin:0!important;padding:7px 10px!important;border:1px dashed var(--s98p-faint)!important;border-radius:6px!important;background:var(--s98p-bg-2)!important;color:var(--s98p-text)!important;font:600 13px/1.4 ui-monospace,Consolas,monospace!important;direction:ltr!important;text-align:left!important;cursor:text}
      .soft98-pro-theme [data-soft98-pro-password-actions]{display:flex;gap:4px;grid-column:3;grid-row:1}
      :root.soft98-pro-theme article [role=tabpanel] [data-soft98-pro-password-shell] [data-soft98-pro-password]>span:not([aria-hidden=true]){display:flex!important;align-items:center;width:auto!important;max-width:none!important;min-height:34px;padding:0!important;white-space:nowrap!important;line-height:1.5}
      .soft98-pro-theme [data-soft98-pro-password-shell] :is([data-soft98-pro-password]>[data-soft98-pro-page-icon],[data-soft98-pro-password]>span:not([aria-hidden=true])){grid-row:1}
      .soft98-pro-theme [data-soft98-pro-password-shell] [data-soft98-pro-password]>[data-soft98-pro-page-icon]{grid-column:1}
      .soft98-pro-theme [data-soft98-pro-password-shell] [data-soft98-pro-password]>span:not([aria-hidden=true]){grid-column:2}
      :root.soft98-pro-theme article [role=tabpanel] [data-soft98-pro-password] > input[readonly]{grid-row:2}
      .soft98-pro-theme [data-soft98-pro-password-actions] button{display:grid!important;place-items:center;width:34px;height:34px;flex:none;padding:0!important;cursor:pointer}
      .soft98-pro-theme [data-soft98-pro-password-actions] svg{width:17px;height:17px;pointer-events:none}
      .soft98-pro-theme [data-soft98-pro-copy-toast]{--toast-accent:var(--s98p-link);position:fixed;z-index:2147483000;inset:auto auto max(16px,env(safe-area-inset-bottom)) 50%;translate:-50% 0;display:grid;grid-template-columns:28px minmax(0,1fr) 30px;align-items:center;gap:10px;width:max-content;max-width:min(480px,calc(100vw - 32px));box-sizing:border-box;padding:10px 12px;border:1px solid var(--s98p-border);border-inline-start:3px solid var(--toast-accent);border-radius:8px;background:var(--s98p-elevated);color:var(--s98p-text);box-shadow:0 6px 24px #0005;opacity:0;visibility:hidden;transform:translateY(6px);transition:opacity .16s ease,transform .16s ease,visibility 0s linear .16s;pointer-events:none}
      .soft98-pro-theme [data-soft98-pro-copy-toast][data-visible]{opacity:1;visibility:visible;transform:none;transition-delay:0s;pointer-events:auto}
      .soft98-pro-theme [data-soft98-pro-copy-toast][data-tone=success]{--toast-accent:var(--s98p-accent)}
      .soft98-pro-theme [data-soft98-pro-copy-toast][data-error]{--toast-accent:var(--s98p-danger)}
      .soft98-pro-theme [data-soft98-pro-copy-toast] [data-role=message]{min-inline-size:0;overflow-wrap:anywhere;line-height:1.5;text-align:start}
      .soft98-pro-theme [data-soft98-pro-copy-toast] [data-role=message] a{color:var(--s98p-link)!important;text-decoration:underline}
      .soft98-pro-theme [data-soft98-pro-copy-toast] :is([data-role=icon],button){display:grid;place-items:center;inline-size:28px;block-size:28px;border-radius:6px;color:var(--toast-accent)}
      .soft98-pro-theme [data-soft98-pro-copy-toast] [data-role=icon]{background:color-mix(in srgb,var(--toast-accent) 16%,transparent)}
      :root.soft98-pro-theme [data-soft98-pro-copy-toast] button{padding:0!important;background:transparent!important;border:1px solid transparent!important;color:var(--s98p-muted)!important;cursor:pointer}
      :root.soft98-pro-theme [data-soft98-pro-copy-toast] button:is(:hover,:focus-visible){background:var(--s98p-soft)!important;color:var(--s98p-text)!important}
      .soft98-pro-theme [data-soft98-pro-copy-toast] svg{width:18px;height:18px;pointer-events:none}
      @starting-style{.soft98-pro-theme [data-soft98-pro-copy-toast][data-visible]{opacity:0;transform:translateY(6px)}}
      @media (prefers-reduced-motion:reduce){.soft98-pro-theme :is([data-soft98-pro-download-row],[data-soft98-pro-download-actions] [aria-expanded] svg,[data-soft98-pro-copy-toast]){transition:none!important}}
      .soft98-pro-theme [data-soft98-pro-faq] > summary{display:flex!important;align-items:center;gap:9px;list-style:none!important;padding-inline-start:0!important;color:var(--s98p-text)!important}
      .soft98-pro-theme [data-soft98-pro-faq] > summary::-webkit-details-marker{display:none}
      .soft98-pro-theme [data-soft98-pro-faq]{box-sizing:border-box;overflow:hidden!important;margin-block-end:0!important}
      .soft98-pro-theme [data-soft98-pro-faq-motion]{overflow-anchor:none}
      :is(.soft98-pro-theme [data-soft98-pro-utility-motion],#soft98-pro-control [data-soft98-pro-report-motion]){box-sizing:border-box;overflow:clip!important;overflow-anchor:none}
      :root.soft98-pro-theme [data-soft98-pro-utility-card] [data-soft98-pro-utility-extra]:is([data-soft98-pro-utility-extra=open],[data-soft98-pro-utility-motion]){display:grid!important;grid-auto-rows:max-content;align-content:start;max-height:none!important;flex:none}
      :root.soft98-pro-theme [data-soft98-pro-utility-extra=open]:not([data-soft98-pro-utility-motion]){height:max-content!important}
      :root.soft98-pro-theme [data-soft98-pro-utility-motion]{min-height:0!important}
      :root.soft98-pro-theme [data-soft98-pro-utility-card] [data-soft98-pro-utility-extra=closed]:not([data-soft98-pro-utility-motion]){display:none!important}
      .soft98-pro-theme [data-soft98-pro-faq] [data-soft98-pro-page-icon]{margin-inline-end:0}
      .soft98-pro-theme [data-soft98-pro-faq] summary:is(:hover,:focus-visible) [data-soft98-pro-page-icon],.soft98-pro-theme [data-soft98-pro-faq][open] [data-soft98-pro-page-icon]{--icon-color:var(--s98p-accent)}
      .soft98-pro-theme [data-soft98-pro-faq]:dir(ltr) svg{transform:scaleX(-1)}
      .soft98-pro-theme [data-soft98-pro-faq][open] svg{transform:rotate(-90deg)}
      .soft98-pro-theme [data-soft98-pro-latest] li a:not([role=tab]){color:var(--s98p-muted)!important}
      .soft98-pro-theme [data-soft98-pro-latest] li a:not([role=tab]):is(:hover,:focus-visible){color:var(--s98p-link)!important}
      :root.soft98-pro-theme [data-soft98-pro-latest] li a[data-soft98-pro-news-link]::before{color:var(--s98p-faint)!important;text-shadow:none!important}
      :root.soft98-pro-theme [data-soft98-pro-latest] li a[data-soft98-pro-news-link]:not(:hover,:focus-visible){color:var(--s98p-muted)!important}
      [data-soft98-pro-bidi]{direction:ltr!important;unicode-bidi:isolate!important}
      .soft98-pro-theme a{color:var(--s98p-link)!important;text-decoration-color:color-mix(in srgb,var(--s98p-link) 42%,transparent);transition:color .16s ease,text-decoration-color .16s ease,background-color .16s ease,border-color .16s ease,transform .16s ease,box-shadow .2s ease}
      .soft98-pro-theme a:hover{color:#d4efff!important;text-decoration-color:var(--s98p-accent)}
      .soft98-pro-theme a:focus-visible,.soft98-pro-theme button:focus-visible,.soft98-pro-theme input:focus-visible,.soft98-pro-theme select:focus-visible,.soft98-pro-theme textarea:focus-visible{outline:2px solid var(--s98p-accent)!important;outline-offset:3px!important}
      :root.soft98-pro-theme hr{height:1px!important;min-height:1px!important;border:0!important;background:var(--s98p-border)!important;opacity:1!important;box-shadow:none!important}
      :root.soft98-pro-theme :is(article,aside,section) > :is(header,footer),:root.soft98-pro-theme [data-soft98-pro-utility-header]{border-block-color:var(--s98p-border)!important}
      :root.soft98-pro-theme [data-soft98-pro-card-rule]{background:var(--s98p-border)!important;border-color:var(--s98p-border)!important;box-shadow:none!important}
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
      .soft98-pro-link-badge{display:inline-block;white-space:nowrap;word-break:normal;overflow-wrap:normal;margin-inline-start:.45em;padding:.12em .45em;border:1px solid rgba(112,225,178,.42);border-radius:999px;color:#baffd8;background:rgba(112,225,178,.12);font-size:.78em;vertical-align:middle}
      .soft98-pro-compact [data-soft98-pro-layout=content-grid]{display:grid!important;grid-template-columns:minmax(0,2fr) minmax(270px,1fr)!important;align-items:start!important;gap:18px!important}
      @media(min-width:821px){
        .soft98-pro-compact [data-soft98-pro-layout=content-grid]>[data-soft98-pro-column]{grid-row:1!important}
        .soft98-pro-compact [data-soft98-pro-layout=content-grid][data-soft98-pro-reading=rtl]{grid-template-columns:minmax(270px,1fr) minmax(0,2fr)!important}
        .soft98-pro-compact [data-soft98-pro-reading=rtl]>[data-soft98-pro-column=primary]{grid-column:2!important}
        .soft98-pro-compact [data-soft98-pro-reading=rtl]>[data-soft98-pro-column=secondary]{grid-column:1!important}
      }
      .soft98-pro-compact [data-soft98-pro-column]{width:100%!important;min-width:0!important;max-width:none!important;box-sizing:border-box}
      .soft98-pro-compact [data-soft98-pro-column=primary]{grid-column:1!important}
      .soft98-pro-compact [data-soft98-pro-column=secondary]{grid-column:2!important}
      .soft98-pro-compact [data-soft98-pro-content-frame],.soft98-pro-theme [data-soft98-pro-wide-nav]{max-width:var(--s98p-page-width,1280px)!important}
      .soft98-pro-theme :is([data-soft98-pro-latest-frame],[data-soft98-pro-between-frames]){max-width:var(--s98p-page-width,1280px)!important}
      :root.soft98-pro-theme [data-soft98-pro-page-surface]{background:var(--s98p-surface)!important;border-color:var(--s98p-border-soft)!important}
      :root.soft98-pro-theme [data-soft98-pro-empty-band]{display:none!important;block-size:0!important;min-block-size:0!important;padding:0!important;margin-block:0!important;border:0!important;overflow:hidden!important;visibility:hidden!important;box-shadow:none!important}
      @media(min-width:1600px){
        :root.soft98-pro-theme{--s98p-page-width:min(2200px,calc(100vw - 96px))}
        .soft98-pro-compact [data-soft98-pro-layout=content-grid]{grid-template-columns:minmax(0,1fr) minmax(300px,clamp(320px,25vw,470px))!important}
        .soft98-pro-compact [data-soft98-pro-layout=content-grid][data-soft98-pro-reading=rtl]{grid-template-columns:minmax(300px,clamp(320px,25vw,470px)) minmax(0,1fr)!important}
      }
      .soft98-pro-compact [data-soft98-pro-layout=content-grid][data-soft98-pro-sidebar-empty][data-soft98-pro-reading]{grid-template-columns:minmax(0,1fr)!important}
      .soft98-pro-compact [data-soft98-pro-sidebar-empty][data-soft98-pro-reading]>[data-soft98-pro-column=primary]{grid-column:1!important}
      .soft98-pro-compact [data-soft98-pro-sidebar-empty]>[data-soft98-pro-column=secondary]{position:absolute!important;inline-size:0!important;block-size:0!important;min-block-size:0!important;padding:0!important;margin:0!important;border:0!important;overflow:hidden!important;visibility:hidden!important}
      @media(min-width:821px){
        .soft98-pro-compact [data-soft98-pro-layout=content-grid][data-soft98-pro-main-wide]>[data-soft98-pro-column=primary]{grid-column:1/-1!important;justify-self:start;width:calc(100% - var(--s98p-sidebar-space) + var(--s98p-scroll-width))!important}
        .soft98-pro-compact [data-soft98-pro-reading=rtl][data-soft98-pro-main-wide]>[data-soft98-pro-column=primary]{justify-self:end}
        .soft98-pro-compact [data-soft98-pro-layout=content-grid][data-soft98-pro-main-wide]>[data-soft98-pro-column=secondary]{pointer-events:none;overflow-anchor:none}
      }
      .soft98-pro-compact [data-soft98-pro-reading=rtl]{direction:rtl!important}
      .soft98-pro-compact [data-soft98-pro-reading=ltr]{direction:ltr!important}
      .soft98-pro-compact article,.soft98-pro-compact aside{border-radius:var(--s98p-radius)!important}
      .soft98-pro-compact [data-soft98-pro-layout=utility-list]{width:100%!important;min-width:0!important;max-width:none!important}
      .soft98-pro-compact [data-soft98-pro-layout=utility-list] :is(ul,ol){display:grid!important;width:100%!important;min-width:0!important;margin-inline:0!important;padding-inline:0!important}
      .soft98-pro-compact [data-soft98-pro-list-row]{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;align-items:center!important;gap:10px!important;width:100%!important;min-width:0!important;max-width:none!important}
      .soft98-pro-compact [data-soft98-pro-list-copy]{display:grid!important;grid-template-columns:minmax(0,1fr)!important;width:auto!important;min-width:0!important;max-width:none!important;overflow:visible!important}
      .soft98-pro-compact [data-soft98-pro-list-copy] :is(strong,small,span){min-width:0!important;max-width:100%!important;white-space:normal!important;overflow-wrap:break-word!important}
      @property --s98p-neon-hue{syntax:"<angle>";inherits:true;initial-value:155deg}
      :root.soft98-pro-rgb{
        --s98p-neon-hue:155deg;
        --s98p-neon:hsl(var(--s98p-neon-hue) 95% 67%);
        --s98p-neon-2:hsl(calc(var(--s98p-neon-hue) + 80deg) 95% 73%);
        --s98p-neon-3:hsl(calc(var(--s98p-neon-hue) + 158deg) 93% 70%);
        --s98p-neon-stops:var(--s98p-neon),var(--s98p-neon-2),var(--s98p-neon-3);
        --s98p-neon-line:linear-gradient(90deg,var(--s98p-neon-stops));
        --s98p-neon-edge:linear-gradient(105deg,color-mix(in srgb,var(--s98p-neon) 60%,#111519),color-mix(in srgb,var(--s98p-neon-2) 55%,#111519),color-mix(in srgb,var(--s98p-neon-3) 60%,#111519));
        --s98p-neon-soft:hsl(var(--s98p-neon-hue) 86% 58% / .18);
        --s98p-bg:#020304;--s98p-bg-2:#050607;--s98p-nav:#060708;--s98p-surface:#080a0b;--s98p-surface-2:#0b0d0f;--s98p-elevated:#101315;--s98p-soft:#15191b;--s98p-border:var(--s98p-neon);--s98p-border-soft:color-mix(in srgb,var(--s98p-neon) 25%,#1b2023);--s98p-text:#d5dadd;--s98p-muted:#858c91;--s98p-faint:#656b70;--s98p-accent:var(--s98p-neon);--s98p-accent-2:var(--s98p-neon-2);--s98p-link:color-mix(in srgb,var(--s98p-neon) 78%,#dce1e4);animation:soft98-pro-neon 16s linear infinite
      }
      .soft98-pro-rgb{background-color:var(--s98p-bg)!important}
      .soft98-pro-rgb body{background:linear-gradient(180deg,var(--s98p-nav),var(--s98p-bg) 30rem)!important}
      .soft98-pro-rgb nav,.soft98-pro-rgb [role=navigation],.soft98-pro-rgb [data-soft98-pro-surface=nav],.soft98-pro-rgb [data-soft98-pro-surface=nav-shell]{background:linear-gradient(165deg,var(--s98p-elevated),var(--s98p-nav))!important;border-color:color-mix(in srgb,var(--s98p-neon) 38%,#202427)!important;box-shadow:0 16px 46px rgba(0,0,0,.62),0 0 18px var(--s98p-neon-soft)!important}
      .soft98-pro-rgb article,.soft98-pro-rgb aside,.soft98-pro-rgb [role=dialog],.soft98-pro-rgb [role=menu],.soft98-pro-rgb [role=listbox],.soft98-pro-rgb [data-soft98-pro-surface=raised],.soft98-pro-rgb [data-soft98-pro-surface=tab-card],.soft98-pro-rgb [data-soft98-pro-surface=tab-content],.soft98-pro-rgb [data-soft98-pro-surface=tab-pane],.soft98-pro-rgb [data-soft98-pro-surface=menu],.soft98-pro-rgb [data-soft98-pro-surface=megamenu]{background:linear-gradient(160deg,var(--s98p-surface-2),var(--s98p-bg-2)) var(--s98p-surface)!important;border-color:color-mix(in srgb,var(--s98p-neon) 28%,#202427)!important;box-shadow:0 20px 52px rgba(0,0,0,.58),0 0 16px color-mix(in srgb,var(--s98p-neon) 10%,transparent)!important;backdrop-filter:blur(18px) saturate(75%)}
      .soft98-pro-rgb article:hover,.soft98-pro-rgb aside:hover,.soft98-pro-rgb [data-soft98-pro-surface=raised]:hover,.soft98-pro-rgb button:hover,.soft98-pro-rgb [role=button]:hover{border-color:color-mix(in srgb,var(--s98p-neon) 72%,#303639)!important;box-shadow:0 22px 58px rgba(0,0,0,.66),0 0 24px var(--s98p-neon-soft)!important}
      :root.soft98-pro-rgb :is([role=tab][aria-selected=true],[data-toggle=tab][aria-expanded=true],[data-soft98-pro-tab-active=true],[aria-current=page]){background:linear-gradient(160deg,color-mix(in srgb,var(--s98p-neon) 11%,var(--s98p-elevated)),color-mix(in srgb,var(--s98p-neon-2) 8%,var(--s98p-bg-2)))!important;border-color:var(--s98p-neon)!important;color:#f3f6f7!important;box-shadow:0 0 0 1px color-mix(in srgb,var(--s98p-neon) 28%,transparent) inset,0 0 18px var(--s98p-neon-soft)!important}
      .soft98-pro-rgb img:not([data-soft98-brand-kind]){filter:saturate(.18) brightness(.72) contrast(1.08)!important;transition:filter .2s ease}
      .soft98-pro-rgb a:hover img:not([data-soft98-brand-kind]){filter:saturate(.38) brightness(.82) contrast(1.08)!important}
      .soft98-pro-rgb .soft98-pro-link-badge{border-color:var(--s98p-neon);background:#0c0f10;box-shadow:0 0 16px var(--s98p-neon-soft)}
      :root.soft98-pro-theme{--s98p-control-bg:linear-gradient(180deg,#253341,#1a2430);--s98p-control-hover:linear-gradient(180deg,#344757,#233342);--s98p-control-edge:#415265;--s98p-control-shadow:0 1px 0 #ffffff12 inset,0 2px 4px #0004}
      @media(min-width:821px){:root.soft98-pro-scroll-width{overflow-anchor:none}}
      :root.soft98-pro-rgb{--s98p-control-bg:linear-gradient(180deg,#191d20,#0b0d0e);--s98p-control-hover:linear-gradient(180deg,#21262a,#15191b);--s98p-control-edge:#343c41}
      :root.soft98-pro-theme [data-soft98-pro-tab-header]{padding-block:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
      :root.soft98-pro-theme article [data-soft98-pro-tab-header]{position:static!important;transition:none!important}
      :root.soft98-pro-theme [data-soft98-pro-surface=tab-list]{display:flex!important;flex-wrap:wrap!important;align-items:stretch;gap:5px;margin:0!important;padding:5px!important;background:var(--s98p-bg-2)!important;border:1px solid var(--s98p-border-soft)!important;border-radius:8px!important;box-shadow:0 1px 3px #0006 inset!important}
      :root.soft98-pro-theme [data-soft98-pro-surface=tab-list]>:is(li,div){display:flex!important;flex:1 1 auto!important;min-width:0;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important}
      :root.soft98-pro-theme [data-soft98-pro-surface=tab-list] :is([role=tab],[data-toggle=tab]){display:inline-flex!important;align-items:center;justify-content:center;gap:7px;min-height:42px;max-width:100%;margin:0!important;padding:7px 10px!important;color:var(--s98p-muted)!important;white-space:normal!important;text-align:center;text-decoration:none!important;transform:none!important}
      :root.soft98-pro-theme [data-soft98-pro-surface=tab-list]>:is(li,div)>:is([role=tab],[data-toggle=tab]){width:100%!important}
      :root.soft98-pro-theme :is([data-soft98-pro-surface=tab-list] :is([role=tab],[data-toggle=tab]),[data-soft98-pro-nav-item],[data-soft98-pro-password-actions] button){background:var(--s98p-control-bg)!important;border:1px solid transparent!important;border-radius:6px!important;box-shadow:var(--s98p-control-shadow)!important;text-shadow:none!important}
      :root.soft98-pro-theme :is([data-soft98-pro-surface=tab-list] :is([role=tab],[data-toggle=tab]),[data-soft98-pro-nav-item],[data-soft98-pro-password-actions] button):is(:hover,:focus-visible){background:var(--s98p-control-hover)!important;border-color:var(--s98p-control-edge)!important;color:var(--s98p-text)!important;outline-offset:-3px!important}
      :root.soft98-pro-theme [data-soft98-pro-surface=tab-list] :is([role=tab],[data-toggle=tab]):is([aria-selected=true],[aria-expanded=true],.active,.active>[data-toggle=tab],[data-soft98-pro-tab-active=true]:not([aria-selected=false],[aria-expanded=false])){background:linear-gradient(180deg,color-mix(in srgb,var(--s98p-accent) 18%,var(--s98p-elevated)),color-mix(in srgb,var(--s98p-accent) 6%,var(--s98p-bg-2)))!important;border-color:color-mix(in srgb,var(--s98p-accent) 32%,var(--s98p-border))!important;box-shadow:0 1px 0 #ffffff19 inset,0 -2px var(--s98p-accent) inset!important;color:var(--s98p-text)!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-item]{min-height:38px;display:inline-flex;align-items:center;justify-content:center;margin-inline:2px;color:var(--s98p-text)!important;transform:none!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-item=icon]{width:42px;padding-inline:0!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-item=label]{padding-inline:10px!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-item][aria-expanded=true]{background:var(--s98p-control-hover)!important;border-color:var(--s98p-control-edge)!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-item]::before,:root.soft98-pro-theme [data-soft98-pro-nav-item]::after{color:inherit!important;text-shadow:none!important;box-shadow:none!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-item]::after{border-block-start-color:var(--s98p-faint)!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-group]{gap:0!important;padding:0!important;border:1px solid var(--s98p-border-soft);border-radius:7px;background:var(--s98p-control-bg)}
      :root.soft98-pro-theme [data-soft98-pro-nav-group]>li{margin:0!important;padding:0!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-group]>li>[data-soft98-pro-nav-item]{margin:0!important;border-radius:0!important;box-shadow:none!important;border:0!important;border-inline-end:1px solid var(--s98p-border-soft)!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-group]>li:first-child>[data-soft98-pro-nav-item]{border-start-start-radius:6px!important;border-end-start-radius:6px!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-group]>li:last-child>[data-soft98-pro-nav-item]{border-inline-end:0!important;border-start-end-radius:6px!important;border-end-end-radius:6px!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-dropdown]::after{content:none!important;display:none!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-dropdown]{position:relative;padding-block-end:5px!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-dropdown] > [data-soft98-pro-nav-indicator]{position:absolute;inset-block-end:3px;inset-inline-start:calc(50% - 2px);width:5px;height:2px;border-radius:2px;background:var(--s98p-faint);pointer-events:none}
      :root.soft98-pro-theme [data-soft98-pro-nav-dropdown]:is(:hover,:focus-visible,[aria-expanded=true]) > [data-soft98-pro-nav-indicator]{background:var(--s98p-accent)}
      :root:not(.soft98-pro-theme) [data-soft98-pro-nav-indicator]{display:none!important}
      :root.soft98-pro-theme article > [data-soft98-pro-article-header]{padding:18px 20px 10px!important;background:linear-gradient(155deg,var(--s98p-elevated),var(--s98p-surface))!important;border-block-end:0!important;border-start-start-radius:8px;border-start-end-radius:8px}
      :root.soft98-pro-theme [data-soft98-pro-article-header] :is(h1,h2){margin:0!important;font-size:1.3rem!important;line-height:1.65!important;overflow-wrap:anywhere}
      :root.soft98-pro-theme [data-soft98-pro-article-header] :is(h1,h2) a{color:var(--s98p-text)!important}
      :root.soft98-pro-theme article > [data-soft98-pro-article-meta]{display:flex!important;flex-wrap:wrap;align-items:center;gap:5px 14px;margin:0!important;padding:8px 20px 12px!important;background:var(--s98p-surface)!important;border-block-end:1px solid var(--s98p-border)!important}
      :root.soft98-pro-theme [data-soft98-pro-article-meta] > [data-soft98-pro-icon-host]{display:inline-flex!important;align-items:center;gap:4px;float:none!important;margin:0!important;padding:0!important;color:var(--s98p-muted)!important;font-size:.86em;line-height:1.6;white-space:normal}
      :root.soft98-pro-theme [data-soft98-pro-article-meta] [data-soft98-pro-icon-host]::before,
      :root.soft98-pro-theme [data-soft98-pro-article-meta] [data-soft98-pro-icon-host]::after{content:none!important;display:none!important}
      :root.soft98-pro-theme [data-soft98-pro-article-meta] [data-soft98-pro-page-icon]{width:16px;height:16px;margin-inline:0 3px;background:transparent!important;--icon-color:var(--s98p-faint)}
      :root.soft98-pro-theme [data-soft98-pro-article-meta] svg{width:15px;height:15px}
      :root.soft98-pro-theme [data-soft98-pro-article-meta] a:not(:hover,:focus-visible){color:var(--s98p-link)!important}
      :root.soft98-pro-theme article:has(>[data-soft98-pro-article-header]){--s98p-article-band:linear-gradient(90deg,var(--s98p-elevated),var(--s98p-surface))}
      :root.soft98-pro-theme article > :is([data-soft98-pro-article-header],[data-soft98-pro-article-meta]){background:var(--s98p-article-band)!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-chrome]{background:linear-gradient(165deg,color-mix(in srgb,var(--s98p-elevated) 92%,transparent),color-mix(in srgb,var(--s98p-nav) 85%,transparent))!important;box-shadow:0 1px #ffffff17 inset,0 10px 28px #0006!important;backdrop-filter:blur(18px) saturate(135%)}
      :root.soft98-pro-theme [data-soft98-pro-nav-item]{transition:background .16s ease,box-shadow .16s ease,color .16s ease!important}
      :root.soft98-pro-theme [data-soft98-pro-nav-item]:is(:hover,:focus-visible,[aria-expanded=true]){box-shadow:0 1px #ffffff24 inset,0 -2px color-mix(in srgb,var(--s98p-accent) 64%,transparent) inset!important}
      :root.soft98-pro-theme [data-soft98-pro-header-icon] > :not([data-soft98-pro-page-icon]):not([data-soft98-pro-nav-indicator]){display:none!important}
      :root.soft98-pro-theme [data-soft98-pro-header-icon]::before{content:none!important;display:none!important}
      :root.soft98-pro-theme [data-soft98-pro-header-icon] > [data-soft98-pro-page-icon]{background:transparent!important;margin:0!important;--icon-color:var(--s98p-text);pointer-events:none}
      :root.soft98-pro-theme [data-soft98-pro-header-icon] svg{width:21px;height:21px}
      :root.soft98-pro-theme [data-soft98-pro-surface=megamenu]{max-inline-size:calc(100vw - 28px);max-block-size:calc(100dvh - 80px);overflow:auto;border-radius:8px!important;background:linear-gradient(155deg,color-mix(in srgb,var(--s98p-elevated) 95%,transparent),color-mix(in srgb,var(--s98p-bg-2) 93%,transparent))!important;box-shadow:0 1px #ffffff20 inset,0 24px 70px #000a,0 0 0 1px #0004!important;backdrop-filter:blur(22px) saturate(140%)}
      :root.soft98-pro-rgb [data-soft98-pro-surface=megamenu]{background:linear-gradient(155deg,#14191ef7,#080a0bf5) #080a0b!important}
      :root.soft98-pro-theme [data-soft98-pro-surface=megamenu] a:is(:hover,:focus-visible){padding-inline:6px;border-radius:4px;color:#fff!important;outline-offset:-2px!important;background:color-mix(in srgb,var(--s98p-accent) 16%,var(--s98p-elevated))!important;box-shadow:0 1px #ffffff20 inset,0 3px 6px #0005}
      :root.soft98-pro-theme [data-soft98-pro-surface=megamenu] a{box-sizing:border-box;padding-inline:6px;transition:background .14s ease,color .14s ease}
      :root.soft98-pro-theme [data-soft98-pro-utility-card] [data-soft98-pro-list-row]{border:1px solid transparent!important;border-radius:6px;background:transparent!important;box-shadow:none!important;transform:none!important}
      :root.soft98-pro-theme [data-soft98-pro-utility-card] [data-soft98-pro-list-row]:is(:hover,:focus-visible){background:var(--s98p-elevated)!important;border-color:var(--s98p-border)!important;color:var(--s98p-text)!important}
      :root.soft98-pro-theme [data-soft98-pro-utility-card] [data-soft98-pro-list-row]:is(.active,[aria-current],[aria-selected=true],:active){background:color-mix(in srgb,var(--s98p-accent) 14%,var(--s98p-surface-2))!important;color:var(--s98p-text)!important;border-color:color-mix(in srgb,var(--s98p-accent) 36%,var(--s98p-border))!important}
      :root.soft98-pro-theme [data-soft98-pro-utility-card]>footer,:root.soft98-pro-theme [data-soft98-pro-utility-card]>footer *{transform:none!important}
      :root.soft98-pro-theme [data-soft98-pro-utility-card]>footer{box-sizing:border-box;border-block-start:1px solid var(--s98p-border)!important;min-block-size:48px}
      :root.soft98-pro-theme [data-soft98-pro-latest] li a[data-soft98-pro-news-link] [data-soft98-pro-news-counter]{color:#758497!important;font-size:.83em!important;text-shadow:none!important}
      :root.soft98-pro-theme [data-soft98-pro-latest] [data-soft98-pro-news-counter]::before,
      :root.soft98-pro-theme [data-soft98-pro-latest] [data-soft98-pro-news-counter]::after{display:none!important;content:none!important}
      :root.soft98-pro-theme [data-soft98-pro-latest] [data-soft98-pro-news-counter]>[data-soft98-pro-page-icon=eye]{display:inline-grid!important;width:12px;height:12px;margin-inline:3px;background:transparent!important;color:inherit!important;opacity:.7}
      :root.soft98-pro-theme [data-soft98-pro-news-counter] svg{width:12px;height:12px;color:inherit!important}
      :root.soft98-pro-theme details[data-soft98-pro-faq] > summary{transition:color .18s ease,background .18s ease;border-radius:6px}
      :root.soft98-pro-theme details[data-soft98-pro-faq] > summary:is(:hover,:focus-visible){background:var(--s98p-surface-2)!important}
      :root.soft98-pro-theme details[data-soft98-pro-faq] > summary svg{transition:transform .22s cubic-bezier(.2,.8,.2,1)}
      :root.soft98-pro-theme details[data-soft98-pro-faq][open]:not([data-soft98-pro-closing]) > summary [data-soft98-pro-page-icon=chevron]{rotate:-90deg}
      :root.soft98-pro-theme details[data-soft98-pro-faq]:dir(ltr)[open]:not([data-soft98-pro-closing]) > summary [data-soft98-pro-page-icon=chevron]{rotate:90deg}
      :root.soft98-pro-theme details[data-soft98-pro-faq] > summary [data-soft98-pro-page-icon=chevron]{transition:rotate .24s cubic-bezier(.2,.8,.2,1)}
      :root.soft98-pro-theme [data-soft98-pro-utility-card]>footer [data-soft98-pro-page-icon=chevron]{transition:rotate .24s cubic-bezier(.2,.8,.2,1)}
      :root.soft98-pro-theme [data-soft98-pro-utility-card]>footer[aria-expanded=true] [data-soft98-pro-page-icon=chevron]{rotate:180deg}
      :root.soft98-pro-theme [data-soft98-pro-read-more]{display:inline-flex!important;gap:8px;align-items:center;padding:6px 12px!important;border:1px solid var(--s98p-border)!important;border-radius:6px;background:var(--s98p-control-bg)!important;color:var(--s98p-text)!important;text-decoration:none!important;min-height:36px}
      :root.soft98-pro-theme [data-soft98-pro-read-more] > [data-soft98-pro-page-icon]{order:1;margin:0}
      :root.soft98-pro-theme [data-soft98-pro-read-more]:is(:hover,:focus-visible){background:var(--s98p-control-hover)!important;border-color:var(--s98p-accent)!important}
      :root.soft98-pro-theme [data-soft98-pro-search]{max-inline-size:min(720px,calc(100vw - 20px))!important;max-block-size:calc(100dvh - 66px);overflow:auto!important}
      :root.soft98-pro-theme [data-soft98-pro-search] :is(form,input,div){box-sizing:border-box;max-inline-size:100%}
      :root.soft98-pro-theme [data-soft98-pro-search] img{background:var(--s98p-surface-2)!important;border-radius:5px;mix-blend-mode:normal}
      :root.soft98-pro-theme [data-soft98-pro-search] img[data-soft98-pro-search-art]{object-fit:contain;padding:2px}
      :root.soft98-pro-theme [data-soft98-pro-dialog]{background:rgba(4,8,12,.34)!important;backdrop-filter:blur(7px);overscroll-behavior:contain}
      :root.soft98-pro-theme [data-soft98-pro-dialog-panel]{background:color-mix(in srgb,var(--s98p-surface) 96%,transparent)!important;border:1px solid var(--s98p-border)!important;border-radius:8px!important;box-shadow:0 16px 55px #0008,0 1px #ffffff15 inset!important;max-block-size:calc(100dvh - 32px);max-inline-size:calc(100vw - 26px);overflow:auto}
      :root.soft98-pro-theme [data-soft98-pro-dialog-header]{position:sticky;inset-block-start:0;z-index:1;background:var(--s98p-elevated)!important;color:var(--s98p-text)!important;border-block-end:1px solid var(--s98p-border)!important;padding:12px 16px}
      :root.soft98-pro-theme [data-soft98-pro-dialog="notice"] :is([role=document],[data-soft98-pro-dialog-panel]){transition:opacity .16s ease!important;transform:none!important;animation:none!important}
      :root.soft98-pro-theme [data-soft98-pro-dialog]:not([open])[data-soft98-pro-native-dialog]{display:none!important}
      :root.soft98-pro-theme dialog[data-soft98-pro-native-dialog]::backdrop{background:#060a105e;backdrop-filter:blur(7px)}
      :root.soft98-pro-theme dialog[data-soft98-pro-native-dialog]{margin:auto;padding:0;color:var(--s98p-text);direction:inherit;inset:auto 0;max-inline-size:min(680px,calc(100vw - 24px))}
      :root.soft98-pro-theme dialog[aria-labelledby=soft98-pro-utility-title]{position:fixed;inset:0;inline-size:min(560px,calc(100vw - 24px));max-block-size:calc(100dvh - 32px);overscroll-behavior:contain}
      :root.soft98-pro-theme dialog[aria-labelledby=soft98-pro-utility-title] > header{display:flex;align-items:center;justify-content:space-between;gap:12px;z-index:8;isolation:isolate}
      :root.soft98-pro-theme dialog[aria-labelledby=soft98-pro-utility-title] > [data-soft98-pro-utility-card]{position:relative;z-index:0}
      :root.soft98-pro-theme dialog[aria-labelledby=soft98-pro-utility-title][open] [data-soft98-pro-utility-header]{display:none!important}
      :root.soft98-pro-theme dialog[data-soft98-pro-native-dialog] > :not(header){padding:14px 16px}
      :root.soft98-pro-theme [data-soft98-pro-legacy-accent~="color"]{color:var(--s98p-accent)!important}
      :root.soft98-pro-theme [data-soft98-pro-legacy-accent~="background-color"]{background-color:color-mix(in srgb,var(--s98p-accent) 23%,var(--s98p-surface))!important}
      :root.soft98-pro-theme [data-soft98-pro-legacy-accent~="border-block-start-color"]{border-block-start-color:var(--s98p-accent)!important}
      :root.soft98-pro-theme [data-soft98-pro-legacy-accent~="border-inline-start-color"]{border-inline-start-color:var(--s98p-accent)!important}
      :root.soft98-pro-theme [data-soft98-pro-read-preview]{position:relative;display:inline-block;margin-inline-start:6px}
      :root.soft98-pro-theme [data-soft98-pro-read-preview] > button{min-height:36px;padding-inline:9px}
      :root.soft98-pro-theme [data-soft98-pro-preview-panel]{position:absolute;inset-inline-start:0;inset-block-end:100%;z-index:8;min-width:min(250px,75vw);max-width:min(340px,85vw);display:grid;gap:5px;padding:12px;border:1px solid var(--s98p-border);border-radius:7px;background:var(--s98p-elevated);box-shadow:0 8px 25px #0008}
      :root.soft98-pro-theme [data-soft98-pro-preview-panel][hidden],:root:not(.soft98-pro-theme) [data-soft98-pro-read-preview]{display:none!important}
      @media(prefers-reduced-motion:reduce){:root.soft98-pro-theme :is(details[data-soft98-pro-faq] > summary svg,[data-soft98-pro-page-icon=chevron]){transition:none}}
      :root.soft98-pro-theme [data-soft98-pro-heading-divider]{border-inline-start:0!important;padding-inline-start:14px!important;position:relative!important}
      :root.soft98-pro-theme [data-soft98-pro-heading-divider]::before{content:""!important;position:absolute!important;inset-inline-start:0!important;inset-block-start:50%!important;transform:translateY(-50%)!important;width:4px!important;height:1.15em!important;border:0!important;border-radius:3px!important;background:linear-gradient(180deg,var(--s98p-link),color-mix(in srgb,var(--s98p-link) 40%,var(--s98p-border)))!important;box-shadow:0 0 8px color-mix(in srgb,var(--s98p-link) 15%,transparent)!important;pointer-events:none!important}
      :root.soft98-pro-light{color-scheme:light;--s98p-bg:#e9eff2;--s98p-bg-2:#f2f6f8;--s98p-nav:#f5faf9;--s98p-surface:#fff;--s98p-surface-2:#edf4f5;--s98p-elevated:#e5f0f0;--s98p-soft:#deecee;--s98p-border:#a8bdc6;--s98p-border-soft:#d4e0e5;--s98p-text:#172e39;--s98p-muted:#435e6b;--s98p-faint:#556f7c;--s98p-accent:#087468;--s98p-accent-2:#8a5318;--s98p-link:#205b88;--s98p-danger:#a6294b;--s98p-control-bg:linear-gradient(180deg,#fff,#e9f3f4);--s98p-control-hover:linear-gradient(180deg,#f1faf9,#d7ebeb);--s98p-control-edge:#9cbac0;--s98p-control-shadow:0 1px #fff inset,0 1px 2px #14323f14;--s98p-light-shadow:0 8px 24px #153d4d14,0 1px 3px #153d4d0e}
      :root.soft98-pro-light{background:var(--s98p-bg)!important}
      :root.soft98-pro-light body{background:linear-gradient(180deg,#edf7f6 0,var(--s98p-bg) 32rem)!important}
      :root.soft98-pro-light :is(h1,h2,h3,h4,h5,h6,strong){color:var(--s98p-text)!important}
      :root.soft98-pro-light a:hover{color:#143e62!important}
      :root.soft98-pro-light :is(article,aside,[data-soft98-pro-surface=raised]){background:var(--s98p-surface)!important;box-shadow:var(--s98p-light-shadow)}
      :root.soft98-pro-light :is([data-soft98-pro-surface=tab-card],[data-soft98-pro-surface=tab-content],[data-soft98-pro-surface=tab-pane]){background:var(--s98p-surface)!important;color:var(--s98p-text)!important}
      :root.soft98-pro-light [data-soft98-pro-surface=tab-list]{background:var(--s98p-bg-2)!important}
      :root.soft98-pro-light :is([role=tab][aria-selected=true],[data-toggle=tab][aria-expanded=true],[data-soft98-pro-tab-active=true],[aria-current=page]){background:var(--s98p-surface-2)!important;color:var(--s98p-text)!important;border-color:var(--s98p-control-edge)!important}
      :root.soft98-pro-light [data-soft98-pro-surface=nav-shell]{background:#f1f8f7ed!important;box-shadow:0 7px 22px #153d4d20!important}
      :root.soft98-pro-light [data-soft98-pro-nav-chrome]{box-shadow:0 1px #fffb inset,0 6px 22px #18343e18!important}
      :root.soft98-pro-light :is([data-soft98-pro-surface=menu],[data-soft98-pro-surface=megamenu]){background:linear-gradient(145deg,#fffffff5,#e9f3f3f2)!important;border-color:var(--s98p-border-soft)!important;box-shadow:0 16px 38px #16334229,0 1px #fff inset!important}
      :root.soft98-pro-light :is([data-soft98-pro-surface=menu],[data-soft98-pro-surface=megamenu]) :is(a,button):is(:hover,:focus-visible){background:var(--s98p-soft)!important;color:var(--s98p-text)!important;border-color:var(--s98p-border-soft)!important}
      :root.soft98-pro-light :is(button,[role=button],input[type=button],input[type=submit]):not(#soft98-pro-control *,[data-soft98-pro-footer] *,.list-group-item-light,[data-soft98-pro-help-action]){background:var(--s98p-control-bg)!important;color:var(--s98p-text)!important;border-color:var(--s98p-border)!important}
      :root.soft98-pro-light :is(button,[role=button]):not(#soft98-pro-control *,[data-soft98-pro-footer] *,.list-group-item-light,[data-soft98-pro-help-action]):is(:hover,:focus-visible){background:var(--s98p-control-hover)!important;color:var(--s98p-text)!important;border-color:var(--s98p-control-edge)!important}
      :root.soft98-pro-light :is(dt,dd){background:var(--s98p-bg-2)!important;border-color:var(--s98p-border-soft)!important}
      :root.soft98-pro-light dd:nth-child(odd){background:var(--s98p-surface-2)!important}
      :root.soft98-pro-light [data-soft98-pro-download-group] a[data-soft98-pro-icon-host=download]:is(:hover,:focus-visible){color:#06554e!important}
      :root.soft98-pro-light [data-soft98-pro-page-icon]:is([data-soft98-pro-page-icon=windows],[data-soft98-pro-page-icon=apple],[data-soft98-pro-page-icon=android],[data-soft98-pro-page-icon=linux]){--icon-color:#395665}
      :root.soft98-pro-light [data-soft98-pro-utility-icon] > [data-soft98-pro-page-icon]{--icon-color:#395665}
      :root.soft98-pro-light [data-soft98-pro-latest] li a[data-soft98-pro-news-link] [data-soft98-pro-news-counter]{color:var(--s98p-faint)!important}
      :root.soft98-pro-light [role=alert]{background:#fff4db!important;border-color:#e1bd78!important;color:#664214!important}
      :root.soft98-pro-light :is(pre,code){background:#e8f1f4!important;color:#244958!important}
      :root.soft98-pro-light ::selection{background:#bce6de;color:#123b38}
      :root.soft98-pro-light .soft98-pro-link-badge{background:#e1f5ef;color:#0d574f;border-color:#9acabd}
      :root.soft98-pro-light [data-soft98-pro-dialog],:root.soft98-pro-light [data-soft98-pro-native-dialog]::backdrop{background:#223c5147!important}
      :root.soft98-pro-light [data-soft98-pro-dialog-panel]{box-shadow:0 20px 60px #16283936,0 1px #fff inset!important}
      @media(max-width:560px){:root.soft98-pro-theme [data-soft98-pro-nav-item=icon]{width:clamp(32px,9vw,40px);margin-inline:1px}}
      @media(max-width:560px){:root.soft98-pro-theme [data-soft98-pro-surface=tab-list]{gap:2px 4px;padding-inline:6px!important}:root.soft98-pro-theme [data-soft98-pro-surface=tab-list]>:is(li,div){flex:1 1 calc(50% - 4px)!important}:root.soft98-pro-theme [data-soft98-pro-surface=tab-list] :is([role=tab],[data-toggle=tab]){width:100%!important;padding-inline:7px!important}}
      @keyframes soft98-pro-neon{to{--s98p-neon-hue:515deg}}
      @media(max-width:820px){.soft98-pro-compact [data-soft98-pro-layout=content-grid][data-soft98-pro-reading]{grid-template-columns:minmax(0,1fr)!important}.soft98-pro-compact [data-soft98-pro-layout=content-grid][data-soft98-pro-reading]>[data-soft98-pro-column]{grid-column:1!important}.soft98-pro-compact [data-soft98-pro-column=primary]{order:1}.soft98-pro-compact [data-soft98-pro-column=secondary]{order:2}}
      @media(prefers-reduced-motion:reduce){.soft98-pro-theme *{scroll-behavior:auto!important}:root.soft98-pro-rgb{animation:none!important}.soft98-pro-theme a,.soft98-pro-theme button,.soft98-pro-theme input,.soft98-pro-theme select,.soft98-pro-theme textarea{transition:none!important}}
      ${CHROME_CSS}
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
    if (!settings.pro) return;
    const element = asElement(root) || document;
    const surfaces = [];
    if (element.matches && element.matches("header,nav,main,article,aside,section,footer,form,table,[role]")) surfaces.push(element);
    if (element.querySelectorAll) surfaces.push(...element.querySelectorAll("header,nav,main,article,aside,section,footer,form,table,[role],div"));
    for (const node of surfaces) {
      if (node.closest("#soft98-pro-control,#soft98-extension-recommendation,#soft98-ad-blocker-taunt")) continue;
      const box = visibleBox(node);
      if (box.width < 120 || box.height < 28 || box.width * box.height < 4200) continue;
      const background = colorMetrics(getComputedStyle(node).backgroundColor);
      if (!background || background.alpha < 0.45 || (document.documentElement.classList.contains("soft98-pro-light")
        ? background.luminance > 0.24 : background.luminance < 0.55)) continue;
      node.setAttribute("data-soft98-pro-surface", node.matches("nav,[role=navigation]") ? "nav" : "raised");
    }

    const textNodes = [];
    if (element.matches && element.matches("p,span,li,dt,dd,td,th,label,strong,small,time")) textNodes.push(element);
    if (element.querySelectorAll) textNodes.push(...element.querySelectorAll("p,span,li,dt,dd,td,th,label,strong,small,time"));
    for (const node of textNodes) {
      if (node.closest("#soft98-pro-control,#soft98-extension-recommendation,#soft98-ad-blocker-taunt")) continue;
      const foreground = colorMetrics(getComputedStyle(node).color);
      if (!foreground || foreground.alpha < 0.5 || (document.documentElement.classList.contains("soft98-pro-light")
        ? foreground.luminance < 0.50 : foreground.luminance > 0.42)) continue;
      node.setAttribute("data-soft98-pro-tone", node.matches("small,time") ? "muted" : "body");
    }
    const links = element.matches?.("a[href]") ? [element] : [...element.querySelectorAll("a[href]")];
    for (const link of links) {
      if (!link.closest("[role=tabpanel]") || isOwnedInterface(link)) continue;
      const box = visibleBox(link);
      if (box.width < 90 || box.height < 24) continue;
      const background = colorMetrics(getComputedStyle(link).backgroundColor);
      if (background?.alpha >= 0.8 && background.luminance >= 0.28) link.setAttribute("data-soft98-pro-tone", "action");
    }
  }

  function applyInteractiveSurfaceHeuristics() {
    const candidates = new Set();
    for (const navigation of document.querySelectorAll("nav,[role=navigation]")) {
      const shell = navigation.parentElement;
      if (!shell || shell === document.body) continue;
      const box = visibleBox(shell);
      const style = getComputedStyle(shell);
      if (box.width >= Math.min(1200, window.innerWidth * 0.72) && box.height > 30 && box.height < 120 && /fixed|sticky/.test(style.position)) {
        shell.setAttribute("data-soft98-pro-surface", "nav-shell");
      }
      const navigationBox = visibleBox(navigation);
      if (navigationBox.width >= Math.min(1200, window.innerWidth * 0.72) && navigationBox.height <= 120) {
        for (const item of navigation.querySelectorAll("li > :is(a[href],button), :scope > button")) {
          if (item.closest("[data-soft98-pro-menu]") || item.closest("li")?.parentElement.closest("li")) continue;
          const bounds = visibleBox(item);
          if (!bounds.height || bounds.height > 72) continue;
          item.setAttribute("data-soft98-pro-nav-item", item.textContent.trim() ? "label" : "icon");
          if (item.parentElement.matches("li") && item.parentElement.parentElement.matches("ul,ol")) {
            item.parentElement.parentElement.setAttribute("data-soft98-pro-nav-group", "");
          }
          if (item.matches('[data-toggle="dropdown"],[aria-haspopup="menu"]') ||
              item.nextElementSibling?.querySelector("a[href],button")) {
            item.setAttribute("data-soft98-pro-nav-dropdown", "");
            if (!item.querySelector("[data-soft98-pro-nav-indicator]")) {
              const indicator = document.createElement("span");
              indicator.setAttribute("data-soft98-pro-nav-indicator", "");
              indicator.setAttribute("aria-hidden", "true");
              item.append(indicator);
            }
          }
        }
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
      if (kind === "megamenu") organizeMegamenu(candidate);
      for (const column of candidate.querySelectorAll(":scope>div,:scope>ul,:scope>ol,:scope>section")) {
        if (column.querySelectorAll("a[href],button,[role=menuitem]").length >= 2) column.setAttribute("data-soft98-pro-menu-column", "true");
      }
    }
    applyTabSurfaceHeuristics();
  }

  function organizeMegamenu(menu) {
    const owner = menu.closest("li");
    const trigger = owner?.querySelector(":scope > [data-toggle=dropdown]");
    if (trigger && !trigger.hasAttribute("data-soft98-pro-mega-trigger")) trigger.setAttribute("data-soft98-pro-mega-trigger", "");
    const grids = new Map();
    for (const heading of menu.querySelectorAll("h2,h3,h4,h5,h6,[role=heading]")) {
      const group = heading.parentElement;
      if (group === menu || group.querySelectorAll("a[href]").length < 2) continue;
      if (group.querySelectorAll(":scope > :is(h2,h3,h4,h5,h6,[role=heading])").length !== 1) continue;
      const siblings = grids.get(group.parentElement) || [];
      siblings.push({ group, heading });
      grids.set(group.parentElement, siblings);
    }
    for (const [grid, groups] of grids) {
      if (groups.length < 2) continue;
      if (!menu.hasAttribute("data-soft98-pro-mega-frame")) menu.setAttribute("data-soft98-pro-mega-frame", "");
      if (!grid.hasAttribute("data-soft98-pro-mega-grid")) grid.setAttribute("data-soft98-pro-mega-grid", "");
      for (const { group, heading } of groups) {
        if (!group.hasAttribute("data-soft98-pro-mega-group")) group.setAttribute("data-soft98-pro-mega-group", "");
        if (!heading.hasAttribute("data-soft98-pro-mega-heading")) heading.setAttribute("data-soft98-pro-mega-heading", "");
        for (const row of group.querySelectorAll(":is(span,li,div):has(> a[href]):not([data-soft98-pro-platform-row],[data-soft98-pro-platform-links])")) {
          groupMegamenuPlatformLinks(row);
        }
      }
    }
  }

  function groupMegamenuPlatformLinks(row) {
    const nodes = [...row.childNodes].filter((node) => node.nodeType !== Node.COMMENT_NODE && node.textContent.trim());
    const [label, ...tail] = nodes;
    if (!label || label.nodeType !== Node.TEXT_NODE || !/\S.*\(\s*$/s.test(label.data)) return;
    const end = tail.pop();
    if (tail.length < 3 || tail.length % 2 === 0 || end?.nodeType !== Node.TEXT_NODE || end.data.trim() !== ")") return;
    if (!tail.every((node, i) => i % 2 === 0 ? node.nodeType === Node.ELEMENT_NODE && node.matches("a[href]") :
      node.nodeType === Node.TEXT_NODE && node.data.trim() === "|")) return;
    const links = document.createElement("span");
    links.setAttribute("data-soft98-pro-platform-links", "");
    row.setAttribute("data-soft98-pro-platform-row", "");
    label.data = label.data.replace(/\s*\(\s*$/, " ");
    label.after(links);
    links.append("(", ...tail, end);
    end.data = ")";
  }

  function tabTarget(trigger) {
    const raw = trigger.getAttribute("aria-controls") || trigger.getAttribute("data-target") || trigger.getAttribute("href") || "";
    const hash = raw.includes("#") ? raw.slice(raw.indexOf("#")) : raw ? `#${raw}` : "";
    if (!/^#[A-Za-z][\w:.-]*$/.test(hash)) return null;
    return document.getElementById(hash.slice(1));
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
      if (list.parentElement?.children.length === 1 && !list.parentElement.matches("section,article,main")) {
        list.parentElement.setAttribute("data-soft98-pro-tab-header", "");
      }
      const panes = tabs.map(tabTarget).filter(Boolean);
      for (const pane of panes) pane.setAttribute("data-soft98-pro-surface", "tab-pane");
      let content = panes[0] && panes[0].parentElement;
      if (content && panes.some((pane) => pane.parentElement !== content)) content = null;
      if (content) content.setAttribute("data-soft98-pro-surface", "tab-content");
      let card = list.parentElement;
      for (let depth = 0; card && content && !card.contains(content) && depth < 4; depth += 1) card = card.parentElement;
      if (card && card !== document.body) card.setAttribute("data-soft98-pro-surface", "tab-card");
      for (const trigger of tabs) {
        const selected = trigger.getAttribute("aria-selected");
        const active = selected === "true" || (selected === null && (trigger.getAttribute("aria-expanded") === "true" ||
          trigger.matches(".active") || Boolean(trigger.parentElement?.matches(".active"))));
        trigger.setAttribute("data-soft98-pro-tab-active", active ? "true" : "false");
      }
      const article = list.closest("article");
      const downloadPane = article && panes.find((pane) => pane.querySelector("dl > dd a[data-key],dl > dd a[download]"));
      if (downloadPane && panes.every((pane) => pane.matches('[role="tabpanel"]') && pane.closest("article") === article)) {
        bindContentTabs(list, downloadPane);
      }
    }
  }

  function applyProLayoutHeuristics() {
    applyUtilityListHeuristics();
    for (const header of document.querySelectorAll("article > header:has(> :is(h1,h2))")) {
      const meta = header.nextElementSibling;
      if (!meta || meta.children.length < 2 || meta.children.length > 6 || ![...meta.children].every((item) => item.matches("span,time"))) continue;
      header.setAttribute("data-soft98-pro-article-header", "");
      meta.setAttribute("data-soft98-pro-article-meta", "");
      for (const item of meta.children) {
        const label = item.textContent.trim();
        const kind = item.querySelector("a[href]") ? "folder" :
          item.matches("time") || /\p{Nd}.*\p{L}.*\p{Nd}/u.test(label) ? "date" :
          /^[\p{Nd},،٬.\s]+$/u.test(label) ? "eye" : "author";
        decorateIcon(item, kind);
        normalizeLabel(item, document.documentElement.dir === "rtl" || /^fa\b/i.test(document.documentElement.lang));
      }
    }
    for (const rule of document.querySelectorAll(":is(article,aside,section) [role=separator]")) {
      if (!isOwnedInterface(rule) && !rule.matches('[aria-orientation="vertical"]')) rule.setAttribute("data-soft98-pro-card-rule", "");
    }
    for (const heading of document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")) {
      if (isOwnedInterface(heading) || heading.hasAttribute("data-soft98-pro-heading-divider")) continue;
      const style = getComputedStyle(heading);
      if ((style.borderInlineStartStyle === "double" || Number.parseFloat(style.borderInlineStartWidth) >= 8) &&
          Number.parseFloat(style.borderInlineStartWidth) >= 3) {
        heading.setAttribute("data-soft98-pro-heading-divider", "");
      }
    }
    enhanceDownloadSections();
    for (const details of document.querySelectorAll("article details:has(> summary)")) {
      details.setAttribute("data-soft98-pro-faq", "");
      decorateIcon(details.querySelector(":scope > summary"), "chevron");
      bindFaqMotion(details);
    }
    if (!settings.compactLayout) return;
    for (const main of document.querySelectorAll("main")) {
      if (main.closest("#soft98-pro-control,#soft98-extension-recommendation,#soft98-ad-blocker-taunt")) continue;
      let container = main.parentElement;
      for (let depth = 0; container && depth < 3; depth += 1, container = container.parentElement) {
        const children = [...container.children];
        const primary = children.find((child) => child === main || child.contains(main));
        const secondary = children.find((child) => child !== primary && (child.matches("aside") || child.querySelector("aside")));
        if (children.length !== 2 || !primary || !secondary) continue;
        const box = visibleBox(container);
        const primaryBox = visibleBox(primary);
        const secondaryBox = visibleBox(secondary);
        const empty = secondaryBox.width < 180 && !hasSidebarContent(secondary);
        if (box.width < 620 || primaryBox.width < 300 || (!empty && secondaryBox.width < 180) || primaryBox.height < 160) continue;
        const direction = document.documentElement.dir || getComputedStyle(container).direction;
        container.setAttribute("data-soft98-pro-layout", "content-grid");
        container.setAttribute("data-soft98-pro-reading", direction === "rtl" ? "rtl" : "ltr");
        if (container.parentElement?.matches("div")) container.parentElement.setAttribute("data-soft98-pro-page-surface", "");
        for (let wrapper = container.parentElement, depth = 0; wrapper && wrapper !== document.body && depth < 3; wrapper = wrapper.parentElement, depth += 1) {
          const max = Number.parseFloat(getComputedStyle(wrapper).maxWidth);
          if (wrapper === container.parentElement || (max >= 1100 && max <= 2200)) {
            wrapper.setAttribute("data-soft98-pro-content-frame", "");
          }
        }
        primary.setAttribute("data-soft98-pro-column", "primary");
        secondary.setAttribute("data-soft98-pro-column", "secondary");
        contentGrids.set(container, secondary);
        break;
      }
    }
    scheduleContentGridUpdate();
  }

  function hasSidebarContent(sidebar) {
    return [...sidebar.querySelectorAll("header,a[href],button,form,img,iframe")].some((node) => isLiveSidebarCard(node, sidebar));
  }

  function scheduleContentGridUpdate() {
    if (gridFrame) return;
    gridFrame = requestAnimationFrame(() => {
      gridFrame = 0;
      const enabled = settings.pro && settings.compactLayout && settings.expandMain && innerWidth > 820;
      const checkContents = sidebarContentsDirty;
      sidebarContentsDirty = false;
      for (const [grid, sidebar] of contentGrids) {
        if (!grid.isConnected || sidebar.parentElement !== grid) {
          contentGrids.delete(grid);
          grid.removeAttribute("data-soft98-pro-main-wide");
          continue;
        }
        if (checkContents) grid.toggleAttribute("data-soft98-pro-sidebar-empty", !hasSidebarContent(sidebar));
        const empty = grid.hasAttribute("data-soft98-pro-sidebar-empty");
        if (empty) {
          grid.removeAttribute("data-soft98-pro-main-wide");
          continue;
        }
        if (!enabled && !grid.hasAttribute("data-soft98-pro-main-wide")) continue;
        const box = enabled ? sidebar.getBoundingClientRect() : null;
        const space = enabled ? box.width + (Number.parseFloat(getComputedStyle(grid).columnGap) || 0) : 0;
        const progress = enabled && !sidebar.contains(document.activeElement) && (box.height > 0 || grid.getBoundingClientRect().top < 0)
          ? Math.min(space, Math.max(0, -box.bottom)) : 0;
        if (progress > 0) {
          const apply = (key, value) => {
            const px = `${value.toFixed(3)}px`;
            if (grid.style.getPropertyValue(key) !== px) grid.style.setProperty(key, px);
          };
          apply("--s98p-sidebar-space", space);
          apply("--s98p-scroll-width", progress);
          gridStyles.set(grid, grid.getAttribute("style"));
          grid.toggleAttribute("data-soft98-pro-main-wide", true);
        } else if (grid.hasAttribute("data-soft98-pro-main-wide")) {
          grid.removeAttribute("data-soft98-pro-main-wide");
          grid.style.removeProperty("--s98p-sidebar-space");
          grid.style.removeProperty("--s98p-scroll-width");
          gridStyles.set(grid, grid.getAttribute("style"));
        }
      }
    });
  }

  function bindFaqMotion(details) {
    if (faqAnimations.has(details)) return;
    faqAnimations.set(details, null);
    const summary = details.querySelector(":scope > summary");
    summary.addEventListener("click", (event) => {
      if (!document.documentElement.classList.contains("soft98-pro-theme") || !details.animate ||
          matchMedia("(prefers-reduced-motion: reduce)").matches || event.target.closest("a,button,input")) return;
      event.preventDefault();
      const from = details.getBoundingClientRect().height;
      faqAnimations.get(details)?.cancel();
      details.setAttribute("data-soft98-pro-faq-motion", "");
      const opening = !details.open || details.hasAttribute("data-soft98-pro-closing");
      details.toggleAttribute("data-soft98-pro-closing", !opening);
      if (opening) details.open = true;
      const bounds = details.getBoundingClientRect();
      const style = getComputedStyle(details);
      const to = opening ? bounds.height : summary.getBoundingClientRect().bottom - bounds.top +
        parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
      const animation = details.animate([{ maxHeight: from + "px" }, { maxHeight: to + "px" }],
        { duration: 250, easing: "cubic-bezier(.24,.76,.25,1)", fill: "forwards" });
      faqAnimations.set(details, animation);
      animation.finished.then(() => {
        if (faqAnimations.get(details) !== animation) return;
        details.open = opening;
        details.removeAttribute("data-soft98-pro-closing");
        details.removeAttribute("data-soft98-pro-faq-motion");
        faqAnimations.set(details, null);
        animation.cancel();
      }, () => {});
    });
  }

  function slideDisclosure(panel, opening, attribute, reveal, finish) {
    const from = panel.getBoundingClientRect().height;
    disclosureAnimations.get(panel)?.cancel();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !panel.animate) {
      panel.removeAttribute(attribute);
      finish();
      return;
    }
    panel.setAttribute(attribute, "");
    reveal();
    const to = opening ? Math.max(panel.getBoundingClientRect().height, panel.scrollHeight) : 0;
    if (Math.abs(to - from) < 1) {
      panel.removeAttribute(attribute);
      finish();
      return;
    }
    const animation = panel.animate([{ height: from + "px" }, { height: to + "px" }],
      { duration: 265, easing: "cubic-bezier(.22,.74,.24,1)", fill: "both" });
    disclosureAnimations.set(panel, animation);
    animation.finished.then(() => {
      if (disclosureAnimations.get(panel) !== animation) return;
      finish();
      panel.removeAttribute(attribute);
      disclosureAnimations.delete(panel);
      animation.cancel();
    }, () => {});
  }

  function bindUtilityDisclosure(card) {
    if (utilityDisclosures.has(card)) return;
    const trigger = card.querySelector(':scope > footer[data-toggle="collapse"][aria-controls]');
    const list = trigger && document.getElementById(trigger.getAttribute("aria-controls"));
    const button = trigger?.querySelector("button");
    if (!list?.matches("ul,ol") || !card.contains(list) || !button) return;

    const setExpanded = (open) => {
      trigger.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-expanded", String(open));
      list.setAttribute("data-soft98-pro-utility-extra", open ? "open" : "closed");
    };
    utilityDisclosures.set(card, true);
    button.setAttribute("aria-controls", list.id);
    decorateIcon(button, "chevron");
    setExpanded(trigger.getAttribute("aria-expanded") === "true");
    if (!button.hasAttribute("aria-label") && trigger.hasAttribute("aria-label")) button.setAttribute("aria-label", trigger.getAttribute("aria-label"));
    trigger.addEventListener("click", (event) => {
      if (!settings.pro) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const open = trigger.getAttribute("aria-expanded") !== "true";
      if (!open && list.contains(document.activeElement)) button.focus({ preventScroll: true });
      list.inert = !open;
      slideDisclosure(list, open, "data-soft98-pro-utility-motion", () => {
        list.setAttribute("data-soft98-pro-utility-extra", "open");
      }, () => {
        list.inert = false;
        setExpanded(open);
      });
      trigger.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-expanded", String(open));
    }, true);
  }

  function syncNativeNightMode() {
    if (!settings.pro || !siteThemeReady || !document.body || updatingSiteTheme || nativeThemeChangePending) return;
    const trigger = document.querySelector('nav [data-toggle="night-mode"]');
    if (!trigger) return;
    const desired = Boolean(settings.darkDesign || settings.rgbMode);
    trigger.setAttribute("aria-pressed", String(desired));
    if (document.body.classList.contains("night-mode") === desired) return;
    updatingSiteTheme = true;
    try {
      trigger.click();
      if (document.body.classList.contains("night-mode") !== desired) {
        document.body.classList.toggle("night-mode", desired);
      }
    } finally { updatingSiteTheme = false; }
  }

  function applySiteChrome() {
    for (const heading of document.querySelectorAll("section > header > :is(h2,h3,h4,h5,h6)")) {
      if (normalizedPersian(heading.textContent || "") !== "مطالبمشابه") continue;
      const card = heading.parentElement.parentElement;
      if (card.querySelector(":scope > :is(ul,ol) > li > a[href]")) card.setAttribute("data-soft98-pro-related", "");
    }
    const nav = document.querySelector('nav:has([data-toggle="night-mode"]),header nav');
    if (nav) {
      nav.setAttribute("data-soft98-pro-nav-chrome", "");
      nav.setAttribute("data-soft98-pro-wide-nav", "");
      for (const button of nav.querySelectorAll("button")) {
        const target = (button.getAttribute("data-target") || "").slice(1);
        const targetNode = target ? document.getElementById(target) : null;
        const toggle = button.getAttribute("data-toggle");
        const label = normalizedPersian(button.getAttribute("title") || "");
        const kind = toggle === "night-mode" ? (settings.darkDesign || settings.rgbMode ? "sun" : "moon") :
          toggle === "search" ? "search" : targetNode?.querySelector("input[type=password]") ? "author" :
          button.hasAttribute("data-soft98-pro-download-notice") || (label.includes("اطلاعیه") && label.includes("دانلود")) ? "bell" :
          toggle === "dropdown" && button.closest("li")?.querySelector('a[href*="feedback"]') ? "mail" :
          button.parentElement === nav && button.hasAttribute("aria-controls") ? "menu" : null;
        if (!kind) continue;
        decorateIcon(button, kind);
        button.setAttribute("data-soft98-pro-header-icon", "");
        if (toggle === "night-mode" || !button.hasAttribute("aria-label")) button.setAttribute("aria-label", text("navLabels." + (kind === "sun" ? "moon" : kind)));
        if (kind === "bell") {
          button.setAttribute("data-soft98-pro-download-notice", "");
          button.removeAttribute("title");
          button.removeAttribute("data-html");
          button.removeAttribute("data-placement");
        }
        if (kind === "search" && targetNode) targetNode.setAttribute("data-soft98-pro-search", "");
      }
      for (const link of nav.querySelectorAll('a[href]')) {
        if (normalizedPersian(link.textContent || "") === "تبلیغات") link.remove();
      }
    }
    if (location.pathname === "/feedback.html") {
      for (const image of document.querySelectorAll("img[src]")) {
        const url = new URL(image.src, location.href);
        if (url.origin === location.origin && url.pathname === "/support.png") (image.closest("a") || image).remove();
      }
    }
    for (const item of document.querySelectorAll("main article a[href],main article button")) {
      const label = normalizedPersian((item.textContent || "") + " " + (item.getAttribute("aria-label") || item.title || ""));
      if (label.includes("ادامهمطلب")) {
        item.setAttribute("data-soft98-pro-read-more", "");
        decorateIcon(item, "arrow");
        bindArticlePreview(item);
      }
    }
    for (const list of document.querySelectorAll("aside, [data-soft98-pro-column=secondary]")) {
      for (const card of list.querySelectorAll(":scope > section:has(> header)")) {
        const content = [...card.children].filter((node) => !node.matches("header,hr,script,style"));
        if (content.length && content.every((node) => !isLiveSidebarCard(node))) card.remove();
      }
      for (const rule of list.querySelectorAll(":scope > hr")) {
        if (!isLiveSidebarCard(rule.previousElementSibling) || !isLiveSidebarCard(rule.nextElementSibling)) rule.remove();
      }
    }
    for (const image of document.querySelectorAll("[data-soft98-pro-search] img")) {
      const label = ((image.alt || "") + " " + (image.closest("a")?.pathname || "") + " " + image.src).toLowerCase();
      const kind = /firefox/.test(label) ? "firefox" : /google[- ]?chrome/.test(label) ? "chrome" :
        /microsoft[- ]?edge/.test(label) ? "edge" : /winrar/.test(label) ? "winrar" :
        /revo[- ]?uninstaller/.test(label) ? "revo" : /free[- ]?download[- ]?manager/.test(label) ? "freedownloadmanager" : "";
      if (kind && !image.hasAttribute("data-soft98-pro-search-art")) {
        const template = document.createElement("template");
        template.innerHTML = PAGE_ICONS[kind];
        image.src = template.content.firstElementChild.src;
        image.removeAttribute("srcset");
        image.setAttribute("data-soft98-pro-search-art", "");
      }
    }
    for (const node of document.querySelectorAll("nav a, nav button, nav i, aside a, main :is(a,button,[role=button],mark)")) {
      if (node.hasAttribute("data-soft98-pro-legacy-accent") || isOwnedInterface(node)) continue;
      const style = getComputedStyle(node);
      const roles = legacyToneKinds.filter((kind) => style.getPropertyValue(kind) === "rgb(123, 173, 73)");
      if (roles.length) node.setAttribute("data-soft98-pro-legacy-accent", roles.join(" "));
    }
    styleSiteDialogs();
    syncDownloadManagerEntry(nav);
    syncUtilityPlacement(nav);
    renderSiteFooter();
    document.documentElement.setAttribute("data-soft98-pro-chrome", "");
    if (nav?.querySelector('[data-toggle="night-mode"]')) {
      siteThemeReady = true;
      syncNativeNightMode();
    }
  }

  function inspectedRoles() {
    const roles = ["layout", "column", "surface", "article-header", "article-meta", "search", "download-row", "utility-card", "dialog", "footer"];
    const stable = {};
    for (const role of roles) {
      const attr = "data-soft98-pro-" + role;
      stable[role] = [...document.querySelectorAll("[" + attr + "]")].slice(0, 25).map((node) => ({
        tag: node.localName, role: node.getAttribute(attr) || role, upstreamClasses: [...node.classList].slice(0, 8)
      }));
    }
    return stable;
  }

  function bindArticlePreview(trigger) {
    if (articlePreviewTriggers.has(trigger) || !nativeFetch) return;
    const article = trigger.closest("article");
    const headline = article?.querySelector("header :is(h1,h2,h3) a[href]");
    const candidate = [trigger, headline].find((link) => link?.href && link.origin === location.origin &&
      /\/\d+[^/]*\.html$/i.test(link.pathname) && link.pathname !== location.pathname);
    if (!candidate) return;
    const destination = new URL(candidate.href);
    destination.hash = "";
    let started = false;
    const discover = async () => {
      if (started || !settings.pro) return;
      started = true;
      const links = await readArticleLinks(destination.href);
      if (links === null) started = false;
      if (links?.length && trigger.isConnected) renderArticlePreview(trigger, links);
    };
    articlePreviewTriggers.add(trigger);
    trigger.addEventListener("pointerenter", discover);
    trigger.addEventListener("focus", discover);
  }

  function renderArticlePreview(trigger, links) {
    const wrap = document.createElement("span");
    const button = document.createElement("button");
    const panel = document.createElement("span");
    button.type = "button";
    button.textContent = text("articlePreview");
    button.setAttribute("aria-expanded", "false");
    panel.hidden = true;
    wrap.setAttribute("data-soft98-pro-read-preview", "");
    panel.setAttribute("data-soft98-pro-preview-panel", "");
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", text("articlePreview"));
    for (const { label, href, hideReferrer } of links) {
      const link = document.createElement("a");
      link.textContent = label;
      link.href = href;
      if (hideReferrer) link.rel = "noreferrer";
      panel.append(link);
    }
    wrap.append(button, panel);
    trigger.after(wrap);
    let hover;
    const dismiss = () => {
      clearTimeout(hover);
      button.setAttribute("aria-expanded", "false");
      panel.hidden = true;
    };
    const open = () => {
      button.setAttribute("aria-expanded", "true");
      panel.hidden = false;
    };
    wrap.addEventListener("pointerenter", () => { hover = setTimeout(open, 320); });
    wrap.addEventListener("pointerleave", () => { if (!wrap.contains(document.activeElement)) dismiss(); });
    wrap.addEventListener("focusout", (event) => { if (!wrap.contains(event.relatedTarget)) dismiss(); });
    wrap.addEventListener("keydown", (event) => { if (event.key === "Escape") { dismiss(); button.focus(); } });
    button.addEventListener("click", () => { if (panel.hidden) open(); else dismiss(); });
  }

  function readArticleLinks(destination) {
    const existing = articlePreviewCache.get(destination);
    if (existing && Date.now() - existing.time < 300000) return existing.result;
    const result = nativeFetch(destination, { credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || !response.body) return null;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let html = "";
        let bytes = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 650000) { await reader.cancel(); return null; }
          html += decoder.decode(value, { stream: true });
        }
        const doc = new DOMParser().parseFromString(html + decoder.decode(), "text/html");
        const seen = new Set();
        const article = doc.querySelector("main article, article");
        if (!article) return null;
        return [...article.querySelectorAll("[role=tabpanel] dl > dd a[href], a[download][href]")].flatMap((link) => {
          const url = directDownloadUrl(link.getAttribute("href"), destination);
          if (!url || seen.has(url.href)) return [];
          seen.add(url.href);
          return [{ href: url.href, hideReferrer: new URL(link.getAttribute("href"), destination).hostname === "href.li",
            label: link.textContent.trim().slice(0, 140) || url.pathname.split("/").at(-1) }];
        }).slice(0, 12);
      }).catch(() => null);
    if (articlePreviewCache.size >= 24) articlePreviewCache.delete(articlePreviewCache.keys().next().value);
    articlePreviewCache.set(destination, { time: Date.now(), result });
    result.then(links => {
      if (links === null && articlePreviewCache.get(destination)?.result === result) articlePreviewCache.delete(destination);
    });
    return result;
  }

  function bindSiteChromeEvents() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.('nav [data-toggle="night-mode"]');
      if (!trigger || !settings.pro || updatingSiteTheme) return;
      const before = document.body.classList.contains("night-mode");
      nativeThemeChangePending = true;
      setTimeout(() => {
        const native = document.body.classList.contains("night-mode");
        const next = native === before ? !(settings.darkDesign || settings.rgbMode) : native;
        nativeThemeChangePending = false;
        writeSettings({ ...settings, darkDesign: next, rgbMode: next && settings.rgbMode });
      }, 0);
    }, true);
    document.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-soft98-pro-download-notice]")) dialogRequested = true;
    }, true);
    document.addEventListener("keydown", (event) => {
      if (!settings.pro || event.key !== "F2" || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey ||
          event.target.closest?.("input,textarea,select,[contenteditable=true]")) return;
      const trigger = document.querySelector('nav [data-toggle="search"]');
      if (!trigger) return;
      event.preventDefault();
      const target = trigger.getAttribute("data-target") || "";
      const panel = target.startsWith("#") ? document.getElementById(target.slice(1)) : null;
      const input = panel?.querySelector('input[type="search"]');
      if (input === document.activeElement) return;
      const style = input && getComputedStyle(input);
      if (input?.getClientRects().length && style.visibility === "visible" &&
          !panel.closest('[hidden],[aria-hidden="true"]')) {
        input.focus({ preventScroll: true });
        if (document.activeElement === input) return;
      }
      trigger.click();
      if (!input) return;
      const deadline = performance.now() + 350;
      const focusedBeforeOpen = document.activeElement;
      const focusSearch = () => {
        if (document.activeElement !== focusedBeforeOpen || !input.isConnected) return;
        if (input.getClientRects().length) input.focus({ preventScroll:true });
        if (document.activeElement !== input && performance.now() < deadline) requestAnimationFrame(focusSearch);
      };
      requestAnimationFrame(focusSearch);
    });
    window.addEventListener("popstate", setDialogFromHash);
    window.addEventListener("hashchange", setDialogFromHash);
    window.addEventListener("load", () => {
      siteThemeReady = true;
      syncNativeNightMode();
      schedule(document);
    }, {once:true});
    if (document.readyState === "complete") {
      siteThemeReady = true;
      syncNativeNightMode();
    }
    document.addEventListener("click", (event) => {
      if (!event.isTrusted || !settings.pro || !settings.soundFeedback || !event.target.closest?.(
        "#soft98-pro-control button,#soft98-pro-control label,[data-soft98-pro-nav-item],[data-soft98-pro-read-preview] button")) return;
      playInterfaceCue();
    }, true);
  }

  function playInterfaceCue() {
    if (!window.AudioContext || document.hidden || performance.now() - audioAt < 160) return;
    audioAt = performance.now();
    try {
      audioContext ||= new AudioContext();
      const context = audioContext;
      const play = () => {
        if (!settings.soundFeedback || document.hidden) return;
        const start = context.currentTime;
        const tone = context.createOscillator();
        const gain = context.createGain();
        tone.type = "sine";
        tone.frequency.setValueAtTime(610, start);
        tone.frequency.exponentialRampToValueAtTime(460, start + .075);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.045, start + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .09);
        tone.connect(gain).connect(context.destination);
        tone.start();
        tone.stop(start + .1);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      };
      if (context.state === "running") play();
      else context.resume().then(play).catch(() => {});
    } catch (_error) {}
  }

  function restoreUtilityPlacement() {
    for (const [card, position] of restoredUtilityCards) {
      if (position.dialog.open) position.dialog.close();
      if (position.marker.isConnected) position.marker.replaceWith(card);
      position.dialog.remove();
      position.button.parentElement?.remove();
      proDialogs.delete("utility");
      restoredUtilityCards.delete(card);
    }
  }

  function syncUtilityPlacement(nav) {
    if (!settings.utilityInHeader || !nav || !document.documentElement.classList.contains("soft98-pro-theme")) {
      restoreUtilityPlacement();
      return;
    }
    for (const [card, position] of restoredUtilityCards) {
      if (!card.isConnected || !position.marker.isConnected) {
        position.dialog.remove();
        position.button.parentElement?.remove();
        restoredUtilityCards.delete(card);
        proDialogs.delete("utility");
      } else return;
    }
    const card = document.querySelector("[data-soft98-pro-utility-card]");
    const action = nav.querySelector('[data-toggle="search"]');
    const list = action?.closest("li")?.parentElement;
    if (!card || !list || typeof window.HTMLDialogElement?.prototype.showModal !== "function") return;
    const marker = document.createComment("Soft98 Pro utility sidebar position");
    const dialog = document.createElement("dialog");
    dialog.setAttribute("data-soft98-pro-native-dialog", "");
    dialog.setAttribute("data-soft98-pro-dialog-panel", "");
    dialog.setAttribute("aria-labelledby", "soft98-pro-utility-title");
    const header = document.createElement("header");
    header.setAttribute("data-soft98-pro-dialog-header", "");
    const heading = document.createElement("strong");
    heading.id = "soft98-pro-utility-title";
    heading.textContent = text("utilityTitle");
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = text("close");
    close.addEventListener("click", () => dialog.close());
    header.append(heading, close);
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-soft98-pro-nav-item", "icon");
    button.setAttribute("data-soft98-pro-header-icon", "");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-label", text("utilityTitle"));
    button.title = text("utilityTitle");
    decorateIcon(button, "grid");
    item.append(button);
    list.append(item);
    card.before(marker);
    dialog.append(header, card);
    document.body.append(dialog);
    proDialogs.set("utility", dialog);
    button.addEventListener("click", () => {
      if (!dialog.open) dialog.showModal();
      styleSiteDialogs();
    });
    dialog.addEventListener("click", (event) => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right ||
          event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
    restoredUtilityCards.set(card, { marker, dialog, button });
  }

  function syncDownloadManagerEntry(nav) {
    if (!IS_EXTENSION || !nav || nav.querySelector('[data-soft98-pro-download-manager="open"]')) return;
    const list = nav.querySelector('[data-toggle="search"]')?.closest("li")?.parentElement;
    if (!list) return;
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.soft98ProDownloadManager = "open";
    button.setAttribute("data-soft98-pro-nav-item", "icon");
    button.setAttribute("data-soft98-pro-header-icon", "");
    button.setAttribute("aria-label", text("articlePreview"));
    button.title = text("articlePreview");
    decorateIcon(button, "download");
    item.append(button);
    list.append(item);
  }

  function renderSiteFooter() {
    const footer = [...document.querySelectorAll("footer")].find((node) =>
      !node.closest("article,aside,dialog,#soft98-pro-control") && /(?:کپیبرداری|ترافیکداخلی)/u.test(normalizedPersian(node.textContent || "")));
    if (!footer) return;
    if (!stockFooters.has(footer)) stockFooters.set(footer, [footer.style.getPropertyValue("display"), footer.style.getPropertyPriority("display")]);
    if (footer.style.display !== "none") footer.style.setProperty("display", "none", "important");
    footer.setAttribute("data-soft98-pro-stock-footer", "");
    if (footer.nextElementSibling?.matches("[data-soft98-pro-footer]")) return;
    const replacement = document.createElement("footer");
    replacement.setAttribute("data-soft98-pro-footer", "");
    localizeElement(replacement);
    const node = (tag, className, key) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (key) element.textContent = text("footer." + key);
      return element;
    };
    const action = (key, icon, destination) => {
      const element = node(destination ? "a" : "button");
      const glyph = node("span");
      glyph.innerHTML = PAGE_ICONS[icon] || "";
      glyph.setAttribute("aria-hidden", "true");
      element.append(glyph, node("span", "", key));
      if (destination) {
        element.href = destination;
        element.target = "_blank";
        element.rel = "noopener noreferrer";
      } else {
        element.type = "button";
        element.addEventListener("click", key === "top" ? () => {
          window.scrollTo({ top: 0, behavior: "instant" });
        } : () => renderControlPanel()?.open());
      }
      return element;
    };
    const frame = node("div", "s98p-footer-frame");
    const main = node("div", "s98p-footer-main");
    const brand = node("div", "s98p-footer-brand");
    const mark = node("span", "s98p-footer-mark");
    mark.innerHTML = PAGE_ICONS.anchor;
    mark.setAttribute("aria-hidden", "true");
    const identity = node("div", "s98p-footer-identity");
    identity.append(node("strong", "", "brand"), node("span", "", "tagline"));
    brand.append(mark, identity, action("settings", "settings"));
    const resources = node("div", "s98p-footer-links");
    resources.append(node("strong", "", "resources"), action("source", "github", EXTENSION_REPO),
      action("releases", "history", EXTENSION_REPO + "/releases"));
    const support = node("div", "s98p-footer-links");
    support.append(node("strong", "", "support"), action("report", "external", EXTENSION_REPO + "/issues"));
    main.append(brand, resources, support);
    const end = node("div", "s98p-footer-end");
    const version = node("bdi", "s98p-footer-version");
    version.textContent = "v" + VERSION;
    version.dir = "ltr";
    const imprint = node("span", "s98p-footer-imprint");
    imprint.append(version, node("span", "", "independent"));
    end.append(imprint, action("top", "up"));
    frame.append(main, end);
    replacement.append(frame);
    footer.after(replacement);
  }

  function dialogVisible(node) {
    return Boolean(node?.isConnected && (node.matches("dialog") ? node.open :
      getComputedStyle(node).display !== "none" && node.getAttribute("aria-hidden") !== "true" && node.getClientRects().length));
  }

  function styleSiteDialogs() {
    const active = new Map(proDialogs);
    siteReadOnlyDialogs.clear();
    const triggers = document.querySelectorAll('[data-target^="#"][data-toggle]:not([data-toggle="search"],[data-toggle="tab"],[data-toggle="collapse"])');
    for (const trigger of triggers) {
      const id = trigger.getAttribute("data-target").slice(1);
      const target = document.getElementById(id);
      const frame = target?.querySelector('[role="document"]');
      const panel = frame?.firstElementChild;
      if (!panel) continue;
      target.setAttribute("data-soft98-pro-dialog", "");
      panel.setAttribute("data-soft98-pro-dialog-panel", "");
      const heading = panel.querySelector("h1,h2,h3,h4,h5,h6");
      if (heading && heading.parentElement !== panel) heading.parentElement.setAttribute("data-soft98-pro-dialog-header", "");
      if (trigger.querySelector('[data-soft98-pro-page-icon="bell"]')) {
        target.setAttribute("data-soft98-pro-dialog", "notice");
        active.set("download-notice", target);
      } else if (/^[a-z][a-z\d-]{1,46}$/i.test(id) && !panel.querySelector("form,input,textarea,select") && panel.querySelector("[data-dismiss]")) {
        const key = "help-" + id.toLowerCase();
        active.set(key, target);
        siteReadOnlyDialogs.set(key, { trigger, target });
      }
    }
    for (const panel of document.querySelectorAll('[role="document"]')) {
      const target = panel.parentElement;
      if (!target?.querySelector("[data-dismiss]") || !target.id) continue;
      const content = panel.firstElementChild;
      const heading = content?.querySelector("h1,h2,h3,h4,h5,h6");
      if (!heading) continue;
      if (!target.hasAttribute("data-soft98-pro-dialog")) target.setAttribute("data-soft98-pro-dialog", "");
      content.setAttribute("data-soft98-pro-dialog-panel", "");
      if (heading.parentElement !== content) heading.parentElement.setAttribute("data-soft98-pro-dialog-header", "");
    }
    const hash = /^#s98p-dialog=(utility|download-notice|help-[a-z\d-]{2,47})$/.exec(location.hash)?.[1] || "";
    const open = [...active].find(([key, node]) => (key !== "download-notice" || dialogRequested || hash) && dialogVisible(node))?.[0] || "";
    if (hash && !open && !currentDialogKey && !dialogHistoryBound) {
      const target = active.get(hash);
      if (target) setDialogFromHash();
    } else if (open !== currentDialogKey) {
      if (open && hash !== open) {
        history.pushState({ ...history.state, soft98ProDialog: open, soft98ProReturn: hash ? "" : location.hash }, "", "#s98p-dialog=" + open);
      } else if (!open && hash === currentDialogKey && hash) {
        const {soft98ProDialog: _dialog, soft98ProReturn: returnHash, ...state} = history.state || {};
        history.replaceState(state, "", location.pathname + location.search + (returnHash || ""));
      }
      currentDialogKey = open;
    }
    if (active.size) dialogHistoryBound = true;
    for (const node of active.values()) {
      if (dialogState.has(node)) continue;
      dialogState.set(node, true);
      node.addEventListener("close", () => schedule(document));
      node.addEventListener("toggle", () => schedule(document));
    }
  }

  function setDialogFromHash() {
    if (!settings.pro) return;
    const key = /^#s98p-dialog=(utility|download-notice|help-[a-z\d-]{2,47})$/.exec(location.hash)?.[1] || "";
    const bell = document.querySelector('nav [data-soft98-pro-header-icon]:has([data-soft98-pro-page-icon=bell])');
    const notice = bell && document.getElementById((bell.getAttribute("data-target") || "").slice(1));
    const utility = proDialogs.get("utility");
    if (key !== "utility" && utility?.open) utility.close();
    if (key !== "download-notice" && dialogVisible(notice)) notice.querySelector("[data-dismiss]")?.click();
    for (const [name, {target}] of siteReadOnlyDialogs) {
      if (name !== key && dialogVisible(target)) target.querySelector("[data-dismiss]")?.click();
    }
    currentDialogKey = key;
    if (key === "utility" && utility && !utility.open) utility.showModal();
    if (key === "download-notice" && bell && !dialogVisible(notice)) bell.click();
    const help = siteReadOnlyDialogs.get(key);
    if (help && !dialogVisible(help.target)) help.trigger.click();
  }

  function directDownloadUrl(value, base = location.href) {
    try {
      if (!value || isBadHref(value)) return null;
      const original = new URL(value, base);
      const url = settings.pro ? unwrapReferrerLink(original) || original : original;
      if (url.protocol !== "https:" || url.username || url.password || url.port ||
          !/\.(?:zip|rar|7z|exe|msi|msix|appx|dmg|apk|iso|deb|rpm|tar|gz|xz|bz2|bin|img|pkg|001)$/i.test(url.pathname)) return null;
      if (/^\?\d+$/.test(url.search) && (url.hostname === "soft98.ir" || url.hostname.endsWith(".soft98.ir"))) url.search = "";
      return url;
    } catch (_error) {
      return null;
    }
  }

  function downloadDestination(link, normalize = false) {
    const href = link.getAttribute("href");
    const current = directDownloadUrl(href);
    if (normalize && current && /^\?\d+$/.test(new URL(href, location.href).search) && !current.search) {
      link.setAttribute("href", current.href);
      if (savedHref.has(link)) {
        savedHref.set(link, current.href);
        link.setAttribute(DATA_HREF, current.href);
      }
    }
    return current || directDownloadUrl(savedHref.get(link));
  }

  function enhanceDownloadSections() {
    const panes = new Set();
    for (const list of document.querySelectorAll("article [role=tabpanel] dl:has(> dt):has(> dd > a[href])")) {
      if (!list.hasAttribute("data-soft98-pro-download-group") &&
          ![...list.querySelectorAll(":scope > dd > a[href]")].some((link) => directDownloadUrl(link.getAttribute("href")) ||
            /^(?:دانلود|download)/i.test(normalizedPersian(link.textContent || "")))) continue;
      list.setAttribute("data-soft98-pro-download-group", "");
      const pane = list.closest("[role=tabpanel]");
      panes.add(pane);
      const row = list.parentElement;
      const frame = row?.parentElement;
      // Soft98 wraps its keyed list in a self-referencing gate. Do not touch unrelated hidden content.
      if (list.hasAttribute("data-json") && list.querySelector("dd a[data-key]") && frame?.id &&
          row.getAttribute("data-target") === "#" + frame.id && frame !== pane && pane.contains(frame)) {
        for (const [node, type] of [[frame, "frame"], [row, "row"]]) {
          if (node.hasAttribute("data-soft98-pro-download-recovery")) continue;
          const style = getComputedStyle(node);
          if (style.display === "none" || style.contentVisibility === "hidden" || style.pointerEvents === "none" ||
              style.visibility === "hidden" || Number(style.opacity) === 0) {
            node.setAttribute("data-soft98-pro-download-recovery", type);
          }
        }
      }
      let heading;
      let entries = [];
      const finish = () => { if (heading && entries.length) enhanceDownloadHeading(heading, entries); };
      for (const item of list.children) {
        if (item.tagName === "DT") {
          finish();
          heading = item;
          entries = [];
          const label = item.querySelector(":scope > span:not([data-soft98-pro-download-actions])");
          const icon = label && downloadIcon(label);
          if (icon) decorateIcon(label, icon);
        } else if (item.tagName === "DD") {
          entries.push(item);
          const links = item.querySelectorAll(":scope > a[href]");
          if (links.length !== 1) continue;
          const [link] = links;
          item.setAttribute("data-soft98-pro-download-entry", "");
          prepareDownloadRow(link, downloadIcon(link) || "link", downloadDestination(link, true));
        }
      }
      finish();
    }
    for (const pane of panes) {
      for (const label of pane.querySelectorAll("[data-toggle=copy], :is(div,button):has(> input[readonly])")) {
        if (!/^(?:پسوردفایل|رمزفایل|filepassword)/i.test(normalizedPersian(label.textContent || ""))) continue;
        label.setAttribute("data-soft98-pro-password", "");
        decorateIcon(label, "lock");
        enhancePassword(label);
        const group = label.closest("[data-soft98-pro-password-shell]")?.parentElement;
        if (!group) continue;
        for (const action of group.querySelectorAll(':scope > button[data-target^="#"]:not([data-url],[data-toggle=complaint]), :scope > a[href]:not([href^="#"],[download])')) {
          if (action.matches("button") || (action.origin === location.origin && action.pathname !== location.pathname)) {
            action.setAttribute("data-soft98-pro-help-action", "");
          }
        }
      }
    }
  }

  function directSectionLinks(entries) {
    const urls = new Set();
    for (const item of entries) {
      if (item.hidden || item.style.display === "none") continue;
      for (const link of item.querySelectorAll(":scope > a[href]:not([hidden])")) {
        const url = downloadDestination(link);
        if (url) urls.add(url.href);
      }
    }
    return [...urls];
  }

  function enhanceDownloadHeading(heading, entries) {
    let state = downloadHeadings.get(heading);
    if (!state?.controls.isConnected) {
      heading.querySelectorAll(":scope > [data-soft98-pro-download-actions]").forEach((node) => node.remove());
      const controls = localizeElement(document.createElement("span"));
      controls.setAttribute("data-soft98-pro-download-actions", "");
      const toggle = downloadButton("chevron");
      const copy = downloadButton("copy");
      copy.append(text("downloadCopyAll"));
      controls.append(copy, toggle);
      heading.setAttribute("data-soft98-pro-download-heading", "");
      heading.append(controls);
      state = { controls, toggle, copy, entries: [], collapsed: false };
      downloadHeadings.set(heading, state);
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        state.collapsed = !state.collapsed;
        syncDownloadCollapse(state);
      });
      copy.addEventListener("click", async (event) => {
        event.stopPropagation();
        const links = directSectionLinks(state.entries);
        if (!links.length) return showDownloadToast("downloadNoDirectLinks", true);
        try {
          await navigator.clipboard.writeText(links.join("\n"));
          const count = new Intl.NumberFormat(LOCALE).format(links.length);
          showDownloadToast(links.length === 1 ? "downloadLinkCopied" : "downloadLinksCopied", false, { count });
        } catch (_error) {
          showDownloadToast("downloadCopyFailed", true);
        }
      });
    }
    state.entries = entries;
    const ids = entries.map((row) => {
      if (!row.id) {
        let id;
        do { id = `soft98-pro-download-row-${++downloadRowId}`; } while (document.getElementById(id));
        row.id = id;
      }
      return row.id;
    }).join(" ");
    if (state.toggle.getAttribute("aria-controls") !== ids) state.toggle.setAttribute("aria-controls", ids);
    const noLinks = !directSectionLinks(entries).length;
    if (state.copy.hidden !== noLinks) state.copy.hidden = noLinks;
    syncDownloadCollapse(state);
  }

  function syncDownloadCollapse(state) {
    for (const row of state.entries) row.toggleAttribute("data-soft98-pro-download-collapsed", state.collapsed);
    const expanded = String(!state.collapsed);
    if (state.toggle.getAttribute("aria-expanded") === expanded) return;
    const label = text(state.collapsed ? "downloadExpandGroup" : "downloadCollapseGroup");
    state.toggle.setAttribute("aria-expanded", expanded);
    state.toggle.setAttribute("aria-label", label);
    state.toggle.title = label;
  }

  function downloadButton(icon) {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = PAGE_ICONS[icon];
    button.firstElementChild.setAttribute("aria-hidden", "true");
    return button;
  }

  function prepareDownloadRow(link, icon, url) {
    const previous = downloadRows.get(link);
    if (IS_EXTENSION) {
      const existing = link.nextElementSibling?.matches('[data-soft98-pro-download-manager="file"]') && link.nextElementSibling;
      if (url && !existing) {
        const button = downloadButton("plus");
        button.dataset.soft98ProDownloadManager = "file";
        button.title = text("downloadQueueFile");
        button.setAttribute("aria-label", button.title);
        link.after(button);
      } else if (!url && existing) existing.remove();
    }
    const direct = url || /^(?:دانلود|download)/i.test(normalizedPersian(link.textContent || ""));
    decorateIcon(link, direct && icon === "link" ? "download" : icon);
    const glyph = link.querySelector(":scope > [data-soft98-pro-page-icon]");
    if ((url || (link.hasAttribute("data-key") && link.closest("dl[data-json]"))) &&
        !glyph.querySelector("[data-soft98-pro-download-check]")) {
      const check = document.createElement("span");
      check.setAttribute("data-soft98-pro-download-check", "");
      check.innerHTML = PAGE_ICONS.check;
      glyph.append(check);
    }
    if (previous?.copy.parentNode === link && previous.title.parentNode === previous.copy && previous.url === url?.href) return;
    const originalSize = link.getAttribute("data-soft98-pro-inline-size");
    if (previous) {
      previous.meta.remove();
      if (link.contains(previous.title)) previous.title.replaceWith(...previous.title.childNodes);
      if (link.contains(previous.copy)) previous.copy.replaceWith(...previous.copy.childNodes);
    }
    for (const existing of link.querySelectorAll(":scope > [data-soft98-pro-download-copy]")) existing.replaceWith(...existing.childNodes);
    for (const existing of link.querySelectorAll(":scope > [data-soft98-pro-download-meta]")) existing.remove();
    for (const existing of link.querySelectorAll(":scope > [data-soft98-pro-download-title]")) existing.replaceWith(...existing.childNodes);
    const title = document.createElement("span");
    const meta = document.createElement("span");
    const copy = document.createElement("span");
    title.setAttribute("data-soft98-pro-download-title", "");
    meta.setAttribute("data-soft98-pro-download-meta", "");
    copy.setAttribute("data-soft98-pro-download-copy", "");
    for (const child of [...link.childNodes]) {
      if (child.matches?.("[data-soft98-pro-page-icon],.soft98-pro-link-badge")) continue;
      title.append(child);
    }
    const inlineSize = extractInlineDownloadSize(title) || previous?.inlineSize || originalSize;
    if (inlineSize) {
      meta.textContent = inlineSize;
      link.setAttribute("data-soft98-pro-inline-size", inlineSize);
    }
    link.setAttribute("data-soft98-pro-download-row", "");
    copy.append(title, meta);
    const badge = link.querySelector(":scope > .soft98-pro-link-badge");
    link.insertBefore(copy, badge);
    downloadRows.set(link, { copy, title, meta, url: url?.href, inlineSize });
    if (url && !url.search && (url.origin === location.origin || url.hostname.endsWith(".soft98.ir")) && "IntersectionObserver" in window) {
      downloadObserver ||= new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          downloadObserver.unobserve(entry.target);
          loadDownloadMetadata(entry.target);
        }
      }, { rootMargin: "160px" });
      downloadObserver.observe(link);
    }
  }

  function extractInlineDownloadSize(title) {
    const label = title.textContent;
    const match = label.match(/(^|[\s،,؛;]+)(?:(?:با\s+)?حجم\s*[:：]?\s*|size\s*[:：]?\s*)?(\p{Nd}+(?:[,.٫٬]\p{Nd}+)*\s*(?:کیلوبایت|مگابایت|گیگابایت|ترابایت|[KMGT]i?B))(?!\p{L})/iu);
    if (!match || !label.slice(0, match.index).trim()) return null;
    const start = match.index;
    const end = start + match[0].length;
    // Remove just the size run, including when the site wraps parts of it in inline markup.
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    let offset = 0;
    for (let node = walker.nextNode(); node && offset < end; node = walker.nextNode()) {
      const value = node.data;
      const from = Math.max(0, start - offset);
      const to = Math.min(value.length, end - offset);
      if (to > from) node.deleteData(from, to - from);
      offset += value.length;
    }
    return match[2];
  }

  function loadDownloadMetadata(link) {
    const row = downloadRows.get(link);
    if (!row?.url || !nativeFetch || !settings.pro || !link.isConnected) return;
    if (!downloadCache) {
      try {
        const entries = JSON.parse(localStorage.getItem(DOWNLOAD_METADATA_KEY) || "[]");
        downloadCache = new Map(Array.isArray(entries) ? entries.slice(-100) : []);
      } catch (_error) { downloadCache = new Map(); }
    }
    const show = (data) => {
      if (downloadRows.get(link) !== row || !data) return;
      const locale = RTL ? "fa-IR-u-ca-persian" : "en";
      let size = row.inlineSize;
      if (Number.isSafeInteger(data.bytes) && data.bytes > 0) {
        const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"];
        const index = Math.min(units.length - 1, Math.floor(Math.log10(data.bytes) / 3));
        size = new Intl.NumberFormat(locale, { style: "unit", unit: units[index], maximumFractionDigits: 1 }).format(data.bytes / 1000 ** index);
      }
      const date = Number.isFinite(data.modified) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(data.modified) : null;
      row.meta.replaceChildren();
      for (const item of [size, date].filter(Boolean)) {
        if (row.meta.childNodes.length) row.meta.append(" · ");
        const value = document.createElement("bdi");
        value.textContent = item;
        row.meta.append(value);
      }
    };
    const cached = downloadCache.get(row.url);
    if (cached && Date.now() - cached.checked < (cached.bytes || cached.modified ? 86400000 : 3600000)) return show(cached);
    if (!downloadProbes.has(row.url)) {
      if (downloadProbes.size >= 4) return;
      const task = nativeFetch(row.url, { method: "HEAD", credentials: "omit", referrerPolicy: "no-referrer",
        redirect: "error", signal: AbortSignal.timeout(4500) }).then((response) => {
        if (!response.ok || /^(?:text\/html|application\/json)/i.test(response.headers.get("content-type") || "")) return {};
        const length = response.headers.get("content-length");
        const date = Date.parse(response.headers.get("last-modified") || "");
        return { bytes: length && /^\d+$/.test(length) ? Number(length) : null, modified: Number.isFinite(date) ? date : null };
      }).catch(() => ({})).then((data) => {
        const entry = { ...data, checked: Date.now() };
        downloadCache.delete(row.url);
        downloadCache.set(row.url, entry);
        while (downloadCache.size > 100) downloadCache.delete(downloadCache.keys().next().value);
        try { localStorage.setItem(DOWNLOAD_METADATA_KEY, JSON.stringify([...downloadCache])); } catch (_error) {}
        return entry;
      }).finally(() => downloadProbes.delete(row.url));
      downloadProbes.set(row.url, task);
    }
    downloadProbes.get(row.url).then(show);
  }

  function applyPagePreferences() {
    const rtlPage = document.documentElement.dir === "rtl" || /^fa\b/i.test(document.documentElement.lang);
    const latestCards = new Set();
    for (const list of document.querySelectorAll("ul[role=tablist],ol[role=tablist]")) {
      const tab = [...list.querySelectorAll("[aria-controls]")].find((node) =>
        /^(?:مطالبنرمافزار|اخباروب|اخبارتکنولوژی)$/.test(normalizedPersian(node.textContent || "")));
      if (!tab) continue;
      const card = list.closest("section,article,[data-soft98-pro-surface=tab-card]") || list.parentElement?.parentElement;
      if (!card || card.closest("main,aside,#soft98-pro-control")) continue;
      const header = list.parentElement?.matches("[data-soft98-pro-tab-header]") ? list.parentElement : list;
      header.setAttribute("data-soft98-pro-latest-header", "tabs");
      list.setAttribute("data-soft98-pro-latest-tabs", "");
      bindContentTabs(list);
      latestCards.add(card);
    }
    for (const heading of document.querySelectorAll("h2,h3,h4,h5,h6")) {
      if (heading.closest("main,article,aside,#soft98-pro-control") ||
          !/^(?:خبرهای(?:تکنولوژی|فناوری)|اخبار(?:تکنولوژی|فناوری|وب))$/.test(normalizedPersian(heading.textContent || ""))) continue;
      for (let card = heading.parentElement, depth = 0; card && depth < 4; card = card.parentElement, depth += 1) {
        if (card.querySelector("main,article,[role=tablist]")) break;
        if (card.querySelectorAll("li a[href]").length < 3) continue;
        const parent = card.parentElement;
        const hasNewsOutsideHeading = parent && !parent.querySelector("main,article,[role=tablist]") &&
          [...parent.querySelectorAll("li a[href]")].filter((link) => !card.contains(link)).length >= 3;
        const panel = hasNewsOutsideHeading ? parent : card;
        panel.setAttribute("data-soft98-pro-page-surface", "");
        panel.setAttribute("data-soft98-pro-tech-news", "");
        heading.setAttribute("data-soft98-pro-news-title", "");
        decorateIcon(heading, "news");
        let header = heading;
        while (header.parentElement && header.parentElement !== panel) header = header.parentElement;
        if (header.parentElement === panel) {
          header.setAttribute("data-soft98-pro-latest-header", "news");
          const shortcuts = header.querySelector("ul,ol");
          shortcuts?.setAttribute("data-soft98-pro-news-actions", "");
          for (const link of shortcuts?.querySelectorAll("a[href]") || []) {
            const icon = newsShortcutIcon(link);
            if (!icon) continue;
            link.setAttribute("data-soft98-pro-news-shortcut", "");
            decorateIcon(link, icon);
          }
          for (const section of panel.children) {
            if (section !== header && section.querySelectorAll("li a[href]").length >= 3) {
              section.setAttribute("data-soft98-pro-news-body", "");
            }
          }
        }
        latestCards.add(panel);
        break;
      }
    }
    for (const card of latestCards) {
      card.setAttribute("data-soft98-pro-latest", "");
      for (const row of card.querySelectorAll("li a[href]")) {
        if (row.matches("[role=tab]")) continue;
        row.setAttribute("data-soft98-pro-news-link", "");
        normalizeLabel(row, rtlPage);
        for (const count of row.querySelectorAll(":scope > span,:scope > small")) {
          if (/^[\s\d\u06f0-\u06f9\u0660-\u0669,.،٬]+$/u.test(count.textContent || "")) {
            count.setAttribute("data-soft98-pro-view-count", "");
            count.setAttribute("data-soft98-pro-news-counter", "");
            decorateIcon(count, "eye");
            if (card.hasAttribute("data-soft98-pro-tech-news") && count.parentElement === row) {
              row.setAttribute("data-soft98-pro-news-story", "");
              if (!row.querySelector(":scope > [data-soft98-pro-news-label]")) {
                const title = document.createElement("span");
                title.setAttribute("data-soft98-pro-news-label", "");
                for (const child of [...row.childNodes]) if (child !== count) title.append(child);
                row.append(title);
              }
            }
          }
        }
      }
    }
    if (latestCards.size > 1) {
      const cards = [...latestCards];
      for (let frame = cards[0].parentElement, depth = 0; frame && frame !== document.body && depth < 4; frame = frame.parentElement, depth += 1) {
        if (cards.every((card) => frame.contains(card)) && !frame.querySelector("main")) {
          frame.setAttribute("data-soft98-pro-latest-frame", "");
          if (frame.parentElement?.children.length === 1 && frame.parentElement.matches("div")) {
            frame.parentElement.setAttribute("data-soft98-pro-page-surface", "");
          }
          for (let outer = frame.parentElement, level = 0; outer && outer !== document.body && level < 2 && !outer.querySelector("main"); outer = outer.parentElement, level += 1) {
            outer.setAttribute("data-soft98-pro-latest-frame", "");
          }
          break;
        }
      }
    }
    for (const grid of document.querySelectorAll("[data-soft98-pro-layout=content-grid]")) {
      const frame = grid.parentElement?.closest("[data-soft98-pro-content-frame]");
      const band = frame?.previousElementSibling;
      if (!band?.matches("div") || band.childElementCount !== 1 ||
          !band.previousElementSibling?.hasAttribute("data-soft98-pro-latest-frame")) continue;
      if (!band.hasAttribute("data-soft98-pro-between-frames")) band.setAttribute("data-soft98-pro-between-frames", "");
      const empty = !band.textContent.trim() && !band.querySelector("a,button,form,img,iframe,video,canvas,svg,[role]");
      if (band.hasAttribute("data-soft98-pro-empty-band") !== empty) band.toggleAttribute("data-soft98-pro-empty-band", empty);
    }
    for (const node of document.querySelectorAll("[data-soft98-pro-utility-card] > footer, article [role=tabpanel] a[href]")) {
      const label = normalizedPersian(node.textContent || "");
      if (node.matches("footer") || /نرمافزاررابرای(?:من|م)نصبکن/.test(label)) {
        node.setAttribute("data-soft98-pro-annoyance", "");
        if (node.matches("a")) {
          node.setAttribute("data-soft98-pro-help-action", "install");
          decorateIcon(node, "help");
        }
      }
    }
    for (const node of document.querySelectorAll("article :is(h1,h2,h3,details > summary), article [role=tabpanel] :is(dt span,dd a,[data-soft98-pro-password],[data-soft98-pro-annoyance],a[href]), [data-soft98-pro-list-copy] strong")) {
      normalizeLabel(node, rtlPage);
    }
    syncPageVisibility();
  }

  function newsShortcutIcon(link) {
    const url = URL.parse(link.href);
    if (!url || !/^https?:$/.test(url.protocol)) return null;
    switch (url.hostname.replace(/^www\./, "")) {
      case "linkdoni.soft98.ir": return /(?:^|\/)rss(?:\.xml)?\/?$/i.test(url.pathname) ? "rss" : "external";
      case "twitter.com":
      case "x.com": return "twitter";
      case "facebook.com": return "facebook";
      case "instagram.com": return "instagram";
      default: return null;
    }
  }

  function bindContentTabs(list, downloadPane = null) {
    if (contentTabs.has(list)) return;
    const tabs = [...list.querySelectorAll('[role="tab"],[data-toggle="tab"]')];
    const panes = tabs.map(tabTarget);
    if (tabs.length < 2 || panes.some((pane) => !pane || (!downloadPane && !pane.querySelector("li a[href]"))) ||
        new Set(panes).size !== tabs.length || !panes.every((pane) => pane.parentElement === panes[0].parentElement)) return;

    const listeners = new AbortController();
    const original = tabs.map((tab) => ({
      selected: tab.getAttribute("aria-selected"),
      tabIndex: tab.getAttribute("tabindex"),
      active: tab.classList.contains("active"),
    }));
    const originalPaneHidden = panes.map((pane) => pane.getAttribute("aria-hidden"));
    contentTabs.set(list, { tabs, panes, listeners, original, originalPaneHidden });
    let active = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
    const select = (index, focus = false) => {
      active = index;
      tabs.forEach((tab, i) => {
        const selected = i === index;
        const value = String(selected);
        if (tab.getAttribute("aria-selected") !== value) tab.setAttribute("aria-selected", value);
        tab.classList.toggle("active", selected);
        tab.tabIndex = selected ? 0 : -1;
        panes[i].setAttribute("data-soft98-pro-content-pane", selected ? "active" : "inactive");
        if (originalPaneHidden[i] !== null) panes[i].setAttribute("aria-hidden", String(!selected));
      });
      if (focus) tabs[index].focus();
    };
    const hashIndex = () => panes.findIndex((pane) => "#" + pane.id === safeDecode(location.hash));
    const initial = downloadPane ? hashIndex() : -1;
    select(initial >= 0 ? initial : active >= 0 ? active : Math.max(0, panes.indexOf(downloadPane)));
    if (downloadPane) window.addEventListener("hashchange", () => {
      const index = hashIndex();
      if (index >= 0) select(index);
    }, { signal: listeners.signal });
    list.addEventListener("click", (event) => {
      if (!settings.pro || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const index = tabs.indexOf(event.target.closest?.('[role="tab"],[data-toggle="tab"]'));
      if (index < 0) return;
      event.preventDefault();
      if (downloadPane) {
        // Let the site run any article-tab callbacks before applying the visibility fallback.
        enqueueMicrotask(() => { if (!listeners.signal.aborted) select(index); });
      } else {
        event.stopPropagation();
        select(index);
      }
    }, { capture: true, signal: listeners.signal });
    list.addEventListener("keydown", (event) => {
      if (!settings.pro || !tabs.includes(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const step = getComputedStyle(list).direction === "rtl" ? -1 : 1;
      let index;
      switch (event.key) {
        case "Home": index = 0; break;
        case "End": index = tabs.length - 1; break;
        case "ArrowLeft": index = active - step; break;
        case "ArrowRight": index = active + step; break;
        case "Enter":
        case " ": index = tabs.indexOf(event.target); break;
        default: return;
      }
      event.preventDefault();
      event.stopPropagation();
      select((index + tabs.length) % tabs.length, true);
    }, { signal: listeners.signal });
  }

  function syncPageVisibility() {
    for (const [list, { tabs, panes, listeners, original, originalPaneHidden }] of contentTabs) {
      if (settings.pro && list.isConnected && tabs.every((tab) => list.contains(tab)) &&
          panes.every((pane, i) => tabTarget(tabs[i]) === pane)) continue;
      listeners.abort();
      panes.forEach((pane, i) => {
        pane.removeAttribute("data-soft98-pro-content-pane");
        if (originalPaneHidden[i] !== null) pane.setAttribute("aria-hidden", originalPaneHidden[i]);
      });
      tabs.forEach((tab, i) => {
        const { selected, tabIndex, active } = original[i];
        for (const [attr, value] of [["aria-selected", selected], ["tabindex", tabIndex]]) {
          if (value === null) tab.removeAttribute(attr);
          else tab.setAttribute(attr, value);
        }
        tab.classList.toggle("active", active);
      });
      contentTabs.delete(list);
    }
    for (const node of document.querySelectorAll("[data-soft98-pro-latest],[data-soft98-pro-annoyance]")) {
      const hide = settings.pro && ((!settings.showLatest && node.hasAttribute("data-soft98-pro-latest")) ||
        (settings.hideAnnoyances && node.hasAttribute("data-soft98-pro-annoyance")));
      const original = hiddenPageDisplays.get(node);
      if (hide) {
        if (!original) hiddenPageDisplays.set(node, [node.style.getPropertyValue("display"), node.style.getPropertyPriority("display")]);
        if (node.style.display !== "none" || node.style.getPropertyPriority("display") !== "important") {
          node.style.setProperty("display", "none", "important");
        }
      } else if (original) {
        node.style.setProperty("display", ...original);
        hiddenPageDisplays.delete(node);
      }
    }
  }

  function downloadIcon(node) {
    const label = (node.textContent || "").normalize("NFKC");
    const key = normalizedPersian(label);
    if (/\b(?:windows|win(?:32|64))\b/i.test(label) || key.includes("ویندوز")) return "windows";
    if (/\b(?:mac(?:os)?|ios|ipados)\b/i.test(label) || /مکینتاش/.test(key)) return "apple";
    if (/\b(?:linux|ubuntu|debian)\b/i.test(label) || key.includes("لینوکس")) return "linux";
    if (/\bandroid\b/i.test(label) || key.includes("اندروید")) return "android";
    if (/^(?:سایرپلتفرم|سایرسیستمعامل|otherplatform)/i.test(key)) return "devices";
    if (/^(?:اطلاعاتبیشتر|moreinfo)/i.test(key)) return "info";
    if (/^(?:مطرحکردنسوال|askaquestion)/i.test(key)) return "help";
    if (/^(?:لینک|تغییرات|سایتسازنده|official|changelog|website)/i.test(key)) return "link";
    if (node.matches("a[href]") && /^(?:دانلود|download)/i.test(key)) return "download";
    return null;
  }

  function decorateIcon(host, name) {
    const current = host.querySelector(":scope > [data-soft98-pro-page-icon]");
    if (current?.getAttribute("data-soft98-pro-page-icon") === name) return;
    const icon = current || document.createElement("span");
    icon.setAttribute("data-soft98-pro-page-icon", name);
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = PAGE_ICONS[name];
    host.setAttribute("data-soft98-pro-icon-host", name);
    if (!current) host.prepend(icon);
  }

  function enhancePassword(container) {
    const input = container.querySelector("input[readonly]");
    const previous = passwordActions.get(container);
    if (!input || (previous?.input === input && previous.controls.isConnected)) return;
    previous?.listeners.abort();
    const listeners = new AbortController();
    const existing = container.parentElement?.matches("[data-soft98-pro-password-shell]") ? container.parentElement : null;
    const shell = existing || document.createElement("div");
    const controls = document.createElement("span");
    shell.setAttribute("data-soft98-pro-password-shell", "");
    controls.setAttribute("data-soft98-pro-password-actions", "");
    const select = () => {
      input.focus({ preventScroll: true });
      input.select();
    };
    container.addEventListener("click", (event) => {
      if (!document.documentElement.classList.contains("soft98-pro-theme")) return;
      // The native delegated click copies the password, then blurs the input on a timer.
      event.preventDefault();
      event.stopImmediatePropagation();
      select();
    }, { capture: true, signal: listeners.signal });
    const button = downloadButton("copy");
    button.setAttribute("data-action", "copy");
    button.setAttribute("aria-label", text("passwordCopy"));
    button.title = text("passwordCopy");
    button.addEventListener("mousedown", (event) => {
      if (document.activeElement === input) event.preventDefault();
    });
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      select();
      try {
        if (document.execCommand("copy")) return showPasswordCopied(container);
      } catch (_error) {}
      try {
        await navigator.clipboard.writeText(input.value);
        showPasswordCopied(container);
      } catch (_error) {
        showDownloadToast("passwordCopyFallback", true);
      }
    });
    controls.append(button);
    if (!existing) {
      container.before(shell);
      shell.append(container);
    } else shell.querySelectorAll(":scope > [data-soft98-pro-password-actions]").forEach((node) => node.remove());
    shell.append(controls);
    passwordActions.set(container, { input, controls, listeners });
  }

  function showPasswordCopied(container) {
    const message = (container.getAttribute("data-text-success") || container.getAttribute("data-text_success") || "").trim();
    showProToast(message || text("passwordCopied"), { tone: "success" });
  }

  function showDownloadToast(key, failed = false, variables) {
    showProToast(text(key, variables), { tone: failed ? "error" : "success" });
  }

  function copySiteToastContent(source) {
    const fragment = document.createDocumentFragment();
    let remaining = 200;
    let characters = 2000;
    const copy = (node, parent, depth) => {
      if (remaining-- <= 0 || characters <= 0 || depth > 12) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.data.slice(0, characters);
        characters -= value.length;
        parent.append(value);
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.matches("script,style,template,svg,iframe,object")) {
        const format = node.matches("strong,b,em,i,br,bdi,a") ? document.createElement(node.localName) : null;
        if (format?.localName === "a") {
          const href = normalizeHref(node);
          if (href) {
            format.href = href;
            if (node.target === "_blank") format.target = "_blank";
            format.rel = "noopener noreferrer";
          }
        }
        if (format) parent.append(format);
        for (const child of node.childNodes) {
          if (remaining <= 0 || characters <= 0) break;
          copy(child, format || parent, depth + 1);
        }
      }
    };
    copy(source, fragment, 0);
    return fragment;
  }

  function receiveSiteToast(event) {
    if (!settings.pro || !document.body || !(event.detail?.content instanceof Element)) return;
    const content = copySiteToastContent(event.detail.content);
    if (!content.textContent.trim()) return;
    showProToast(content, { duration: event.detail.duration, tone: "info" });
    event.preventDefault();
  }

  function showProToast(content, { duration = 2600, tone }) {
    if (!settings.pro || !document.body) return;
    let toast = document.querySelector("[data-soft98-pro-copy-toast]");
    if (!toast) {
      toast = localizeElement(document.createElement("div"));
      toast.setAttribute("data-soft98-pro-copy-toast", "");
      toast.innerHTML = '<span data-role="icon" aria-hidden="true"></span><div data-role="message" role="status" aria-atomic="true" dir="auto"></div>';
      const close = downloadButton("close");
      close.setAttribute("aria-label", text("close"));
      close.title = text("close");
      close.addEventListener("mousedown", (event) => event.preventDefault());
      close.addEventListener("click", () => dismissProToast(toast));
      toast.append(close);
      document.body.append(toast);
    }
    clearTimeout(downloadToastTimer);
    toast.dataset.tone = tone;
    toast.toggleAttribute("data-error", tone === "error");
    toast.querySelector('[data-role="icon"]').innerHTML = PAGE_ICONS[tone === "success" ? "check" : tone === "error" ? "help" : "info"];
    toast.querySelector('[data-role="message"]').replaceChildren(content);
    toast.setAttribute("data-visible", "");
    pulseFavicon(toast);
    downloadToastTimer = setTimeout(() => dismissProToast(toast), typeof duration === "number" && Number.isFinite(duration) ?
      Math.min(12000, Math.max(1800, duration)) : 4000);
  }

  function dismissProToast(toast) {
    clearTimeout(downloadToastTimer);
    toast.removeAttribute("data-visible");
    stopFaviconPulse(toast);
    downloadToastTimer = setTimeout(() => toast.querySelector('[data-role="message"]').replaceChildren(), 180);
  }

  function normalizeLabel(node, rtl) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const labels = [];
    for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
      if (!textNode.parentElement?.closest("bdi,svg,[contenteditable],script,style,code,pre")) labels.push(textNode);
    }
    for (const textNode of labels) {
      const original = textNode.nodeValue || "";
      // Keep punctuation inside URLs, email addresses and numeric groups verbatim.
      const tokens = /(?:https?:\/\/|www\.)[^\s<>()]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[\w.+-]+\.(?:zip|rar|7z|exe|msi|dmg|apk|iso|deb|rpm|tar|gz)\b|\p{Nd}+(?:[,.،٬٫/]\p{Nd}+)+/giu;
      let last = 0;
      let value = "";
      const tidy = (part) => part.replace(/\([ \t\u00a0]+/g, "(").replace(/[ \t\u00a0]+\)/g, ")")
        .replace(/[ \t\u00a0]+([,،:])/g, "$1").replace(/([,،])[ \t\u00a0]*(?=[\p{L}\p{Nd}])/gu, "$1 ")
        .replace(/\b(?:windows|linux|android|macos|ios|ipados|official link|anydesk)\b/gi, (word) => ({
          windows: "Windows", linux: "Linux", android: "Android", macos: "macOS", ios: "iOS",
          ipados: "iPadOS", "official link": "Official link", anydesk: "AnyDesk",
        })[word.toLowerCase()]);
      for (const match of original.matchAll(tokens)) {
        value += tidy(original.slice(last, match.index)) + match[0];
        last = match.index + match[0].length;
      }
      value += tidy(original.slice(last));
      const runs = rtl && !textNode.parentElement?.closest("[dir=ltr]") ? [...value.matchAll(
        /\((?=[^()\p{Script=Arabic}]*[A-Za-z])[^()\p{Script=Arabic}]+\)|[A-Za-z][A-Za-z0-9]*(?:(?:[ .+/_-]+|, +)[A-Za-z0-9]+)*/gu
      )] : [];
      if (!runs.length) {
        if (value !== original) textNode.nodeValue = value;
        continue;
      }
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const run of runs) {
        fragment.append(value.slice(cursor, run.index));
        const latin = document.createElement("bdi");
        latin.dir = "ltr";
        latin.setAttribute("data-soft98-pro-bidi", "");
        latin.textContent = run[0];
        fragment.appendChild(latin);
        cursor = run.index + run[0].length;
      }
      fragment.append(value.slice(cursor));
      textNode.replaceWith(fragment);
    }
  }

  function isCompactMediaNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.matches("img,picture,svg,canvas,i,[role=img]")) return true;
    const box = visibleBox(node);
    return box.width > 12 && box.height > 12 && box.width <= 96 && box.height <= 96 && Boolean(node.querySelector("img,picture,svg,canvas,i,[role=img]"));
  }

  function applyUtilityListHeuristics() {
    const scopes = [...document.querySelectorAll("aside,[data-soft98-pro-column=secondary],[data-soft98-pro-utility-card]")];
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
          rows.push({ link, copy, media });
        }
        if (rows.length < 3 || rows.length < Math.ceil(items.length * 0.6)) continue;
        const section = list.closest("section,article,div") || list;
        section.setAttribute("data-soft98-pro-layout", "utility-list");
        const card = list.closest("section,article");
        const heading = card?.querySelector(":scope > header :is(h1,h2,h3,h4,h5,h6)");
        const title = heading && normalizedPersian(heading.textContent || "");
        const utilityCard = title === "لیستنرمافزارهایکاربردی";
        if (utilityCard) {
          card.setAttribute("data-soft98-pro-utility-card", "");
          bindUtilityDisclosure(card);
          heading.closest("header").setAttribute("data-soft98-pro-utility-header", "");
          const clean = (heading.textContent || "").normalize("NFKC").replace(/\u0640/g, "").replace(/\s+/gu, " ").trim();
          if (clean !== heading.textContent) heading.textContent = clean;
        }
        for (const row of rows) {
          row.link.setAttribute("data-soft98-pro-list-row", "true");
          row.copy.setAttribute("data-soft98-pro-list-copy", "true");
          if (utilityCard) {
            row.media.setAttribute("data-soft98-pro-utility-icon", "");
            themeUtilityIcon(row.media, row.link);
          }
        }
      }
    }
  }

  function themeUtilityIcon(icon, link) {
    const path = link.origin === location.origin && /^https?:$/.test(link.protocol)
      ? link.pathname.toLowerCase().replaceAll("%2b", "+") : "";
    const kind = Object.hasOwn(UTILITY_PATH_ICONS, path) ? UTILITY_PATH_ICONS[path] : "desktop";
    decorateIcon(icon, kind);
    icon.setAttribute("data-soft98-pro-utility-art", "ready");
  }


  function pulseFavicon(notice) {
    faviconNotice = { node: notice, started: performance.now() };
    updateFavicon();
  }

  function stopFaviconPulse(notice) {
    if (faviconNotice?.node !== notice) return;
    faviconNotice = null;
    updateFavicon();
  }

  function updateFavicon() {
    clearTimeout(faviconTimer);
    let badge = false;
    if (faviconNotice) {
      const { node, started } = faviconNotice;
      const elapsed = performance.now() - started;
      if (elapsed >= FAVICON_NOTICE_MS || !node.isConnected ||
          (!settings.pro && node.hasAttribute("data-soft98-pro-copy-toast"))) {
        faviconNotice = null;
      } else {
        const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        badge = still || Math.floor(elapsed / FAVICON_PULSE_MS) % 2 === 0;
        faviconTimer = setTimeout(updateFavicon, still ? FAVICON_NOTICE_MS - elapsed : FAVICON_PULSE_MS - elapsed % FAVICON_PULSE_MS);
      }
    }
    const state = settings.pro ? (settings.rgbMode ? "rgb" : settings.darkDesign ? "pro" : "pro-light") :
      successAnnounced || badge ? "success" : "";
    let link = document.getElementById(FAVICON_ID);
    if (!state) {
      link?.remove();
      return;
    }
    const key = badge ? state + "-badge" : state;
    const href = faviconImages.get(key) || drawFavicon(state, badge);
    if (!href) return;
    faviconImages.set(key, href);
    if (!link) {
      link = document.createElement("link");
      link.id = FAVICON_ID;
      link.rel = "icon";
      link.type = "image/png";
      link.href = href;
      (document.head || document.documentElement).appendChild(link);
    } else if (link.href !== href) {
      link.href = href;
    }
  }

  function drawFavicon(state, badge) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext && canvas.getContext("2d");
      if (!ctx) return "";
      const pro = state !== "success";
      const dark = state === "pro" || state === "rgb";
      const rgb = state === "rgb";
      const background = dark ? "#08111a" : "#f7fbff";
      const foreground = dark ? "#70e1b2" : pro ? "#12645a" : "#1fb36b";
      const shadow = dark ? "rgba(112,225,178,.32)" : "rgba(31,179,107,.28)";
      const ring = dark ? "#253f58" : "#d4e7f4";
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
      if (badge) {
        ctx.fillStyle = dark ? "#ffd166" : "#2f80ed";
        ctx.beginPath();
        ctx.arc(49, 16, pro ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
      }
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
    for (const [logo, original] of originalLogos) {
      if (original.attributes) {
        for (const [name, value] of original.attributes) {
          if (value === null) logo.removeAttribute(name);
          else logo.setAttribute(name, value);
        }
      } else {
        logo.style.setProperty("background-image", original.background, original.priority);
      }
      for (const marker of ["data-soft98-brand-variant", "data-soft98-brand-kind", "data-soft98-brand-compact"]) {
        logo.removeAttribute(marker);
      }
    }
    originalLogos.clear();
  }

  function logoCandidates() {
    const candidates = [];
    const compact = [];
    for (const link of document.querySelectorAll("a[href]")) {
      let url;
      try {
        url = new URL(link.getAttribute("href") || "", location.href);
      } catch (_error) {
        continue;
      }
      if (!/^\/?$/.test(url.pathname) || (url.origin !== location.origin && !/(?:^|\.)soft98\.ir$/i.test(url.hostname))) continue;
      const box = visibleBox(link);
      const linkSignals = `${link.textContent || ""} ${link.title || ""} ${link.getAttribute("aria-label") || ""}`;
      const image = link.querySelector("img");
      const imageSignals = image ? `${image.alt || ""} ${image.title || ""}` : "";
      const background = getComputedStyle(link).backgroundImage;
      const assetSignals = `${image ? image.currentSrc || image.src || "" : ""} ${background}`;
      const candidate = { node: image || link, kind: image ? "image" : "background" };
      const inNavigation = Boolean(link.closest("nav,[role=navigation]"));
      const hasGraphic = Boolean(image || background.startsWith("url("));
      const isCompactBrand = candidate.node.hasAttribute("data-soft98-brand-compact") || /\/navbar-brand\.[a-z]+(?:[?"')]|$)/i.test(assetSignals) ||
        (inNavigation && hasGraphic && box.width > 0 && box.height > 0 && box.height <= 64 && (link.rel === "home" || link.children.length > 0));
      if (isCompactBrand) {
        compact.push({ ...candidate, compact: true });
        continue;
      }
      if (!box.width || !box.height) continue;
      if (!hasGraphic && !link.hasAttribute("data-soft98-brand-kind")) continue;
      const shapeScore = box.width > box.height * 1.5 ? 4 : 0;
      const areaScore = box.width * box.height > 10000 ? 5 : box.width * box.height > 1400 ? 2 : 0;
      const homeScore = /\bhome\b/i.test(link.rel || "") ? 2 : 0;
      const brandScore = /soft\s*98|سافت[\s\u200c]*(?:98|۹۸|٩٨)|logo/i.test(`${linkSignals} ${imageSignals}`) ? 8 : 0;
      const primaryAssetScore = /\/(?:logo|wordmark)[^/)]*\.(?:avif|png|webp|gif|svg)/i.test(assetSignals) ? 10 : 0;
      const imageScore = image ? 3 : 0;
      candidates.push({ ...candidate, score: shapeScore + areaScore + homeScore + brandScore + primaryAssetScore + imageScore });
    }
    let best = null;
    let score = -1;
    for (const candidate of candidates) {
      if (candidate.score > score) {
        best = candidate;
        score = candidate.score;
      }
    }
    return best ? [best, ...compact] : compact;
  }

  function enhanceLogo() {
    if ((!successAnnounced && !settings.pro) || !settings.pirateLogo) return restoreOriginalLogo();
    for (const logo of originalLogos.keys()) {
      if (!logo.isConnected) originalLogos.delete(logo);
    }
    for (const candidate of logoCandidates()) applyLogo(candidate);
  }

  function applyLogo(candidate) {
    const logo = candidate.node;
    const dark = settings.pro && (settings.darkDesign || settings.rgbMode);
    const variant = dark ? "pirateDark" : "light";
    const source = BRAND_ASSETS[variant];
    if (!source) return;
    const branded = logo.getAttribute("data-soft98-brand-variant") === variant;
    if (branded && (candidate.kind === "image" ? logo.getAttribute("src") === source : logo.style.backgroundImage.includes(source))) return;
    if (candidate.kind === "image") {
      if (!originalLogos.has(logo)) {
        originalLogos.set(logo, { attributes: ["src", "alt", "srcset", "sizes"].map((name) => [name, logo.getAttribute(name)]) });
      }
      logo.removeAttribute("srcset");
      logo.removeAttribute("sizes");
      logo.setAttribute("src", source);
      logo.setAttribute("alt", text("product"));
    } else {
      if (!originalLogos.has(logo)) {
        originalLogos.set(logo, {
          background: logo.style.getPropertyValue("background-image"),
          priority: logo.style.getPropertyPriority("background-image"),
        });
      }
      logo.style.setProperty("background-image", `url("${source}")`, "important");
    }
    logo.setAttribute("data-soft98-brand-variant", variant);
    logo.setAttribute("data-soft98-brand-kind", candidate.kind);
    if (candidate.compact) logo.setAttribute("data-soft98-brand-compact", "");
  }

  function renderTaunt() {
    const previous = document.getElementById("soft98-ad-blocker-taunt");
    if (!successAnnounced || !settings.taunt) {
      if (previous) previous.remove();
      stopFaviconPulse(previous);
      clearTimeout(successNoticeTimer);
      successNoticeTimer = null;
      return;
    }
    if (previous?.hasAttribute("data-soft98-pro-notice")) {
      previous.setAttribute("data-theme", settings.pro && (settings.darkDesign || settings.rgbMode) ? "dark" : "light");
      return;
    }
    if (successNoticeShown || !document.body) return;
    if (previous) previous.remove();
    successNoticeShown = true;
    const note = document.createElement("aside");
    note.id = "soft98-ad-blocker-taunt";
    localizeElement(note);
    note.setAttribute("role", "status");
    note.setAttribute("data-soft98-pro-notice", "");
    note.setAttribute("data-theme", settings.pro && (settings.darkDesign || settings.rgbMode) ? "dark" : "light");
    document.body.appendChild(note);
    enqueueMicrotask(() => { note.textContent = text("tauntText"); });
    pulseFavicon(note);
    successNoticeTimer = setTimeout(() => {
      note.remove();
      stopFaviconPulse(note);
      successNoticeTimer = null;
    }, SUCCESS_NOTICE_MS);
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
      return {
        x: stored.x, y: stored.y,
        inlineEdge: ["left", "right"].includes(stored.inlineEdge) ? stored.inlineEdge : null,
        blockEdge: ["top", "bottom"].includes(stored.blockEdge) ? stored.blockEdge : null,
        tucked: stored.tucked === true,
        legacy: !Object.hasOwn(stored, "inlineEdge"),
      };
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

  function controlViewport() {
    const viewport = window.visualViewport;
    const layoutWidth = document.documentElement.clientWidth || window.innerWidth;
    const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
    const width = Math.min(viewport?.width || layoutWidth, layoutWidth);
    const height = Math.min(viewport?.height || layoutHeight, layoutHeight);
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  function defaultControlPosition() {
    return { x: 12, y: 0, inlineEdge: "left", blockEdge: "bottom", tucked: false };
  }

  function controlBounds(viewport) {
    const margin = Math.max(0, Math.min(CONTROL_MARGIN, (viewport.width - 42) / 2, (viewport.height - 42) / 2));
    return { left: viewport.left + margin, top: viewport.top + margin, right: viewport.right - margin - 42, bottom: viewport.bottom - margin - 42, margin };
  }

  function placeControl(wrap, requested, viewport) {
    const point = controlPoint(requested, viewport);
    wrap.style.left = `${point.x}px`;
    wrap.style.top = `${point.y}px`;
    wrap.setAttribute("data-inline-edge", requested.inlineEdge || "");
    return point;
  }

  function controlPoint(requested, viewport) {
    const bounds = controlBounds(viewport);
    const { inlineEdge, blockEdge } = requested;
    const x = inlineEdge ? bounds[inlineEdge] : Math.max(bounds.left, Math.min(bounds.right, requested.x));
    const y = blockEdge ? bounds[blockEdge] : Math.max(bounds.top, Math.min(bounds.bottom, requested.y));
    return { x, y };
  }

  function snapControlPosition(point, viewport, tucked, snap = 26) {
    const bounds = controlBounds(viewport);
    const edge = (value, start, end, a, b) => Math.min(value - start, end - value) > snap ? null : value - start < end - value ? a : b;
    const inlineEdge = edge(point.x, bounds.left, bounds.right, "left", "right");
    const blockEdge = edge(point.y, bounds.top, bounds.bottom, "top", "bottom");
    return { ...point, inlineEdge, blockEdge, tucked: Boolean(tucked && inlineEdge) };
  }

  function controlGravity(point, viewport) {
    const bounds = controlBounds(viewport);
    const target = snapControlPosition(point, viewport, false, CONTROL_GRAVITY);
    const pull = (value, edge) => {
      if (!edge) return value;
      const distance = Math.abs(value - bounds[edge]);
      const strength = Math.max(0, 1 - distance / CONTROL_GRAVITY);
      return value + (bounds[edge] - value) * .8 * strength;
    };
    return { target, point: { x: pull(point.x, target.inlineEdge), y: pull(point.y, target.blockEdge) } };
  }

  function placeControlSurface(surface, point, viewport, width, maxHeight, gap = 9) {
    const margin = controlBounds(viewport).margin;
    const above = point.y - viewport.top - margin - gap;
    const below = viewport.bottom - point.y - 42 - margin - gap;
    const up = above > below;
    const alignRight = point.x + 21 > viewport.left + viewport.width / 2;
    const usableWidth = Math.min(width, Math.max(0, viewport.width - 2 * margin));
    const usableHeight = Math.min(maxHeight, Math.max(0, up ? above : below));
    const left = Math.max(viewport.left + margin, Math.min(viewport.right - margin - usableWidth, alignRight ? point.x + 42 - usableWidth : point.x));
    surface.style.width = `${usableWidth}px`;
    surface.style.maxHeight = `${usableHeight}px`;
    surface.style.left = `${left - point.x}px`;
    surface.style.top = up ? "auto" : `${42 + gap}px`;
    surface.style.bottom = up ? `${42 + gap}px` : "auto";
    surface.dataset.short = String(usableHeight < 375);
    surface.dataset.opens = up ? "up" : "down";
    surface.dataset.align = alignRight ? "right" : "left";
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
    const preview = Object.hasOwn(OPTION_PREVIEWS, key) ? key : "";
    return `
      <label class="s98p-option"${preview ? ` data-s98p-preview="${preview}"` : ""}>
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

  function syncControlSettings(wrap) {
    wrap.dataset.theme = settings.rgbMode && settings.pro ? "rgb" : settings.darkDesign && settings.pro ? "dark" : "light";
    const brand = wrap.dataset.theme === "light" ? BRAND_ASSETS.light : BRAND_ASSETS.pirateDark;
    if (brand) {
      for (const image of wrap.querySelectorAll("[data-role=toggle] img,.s98p-brand-mark img")) {
        if (image.getAttribute("src") !== brand) image.src = brand;
      }
    }
    for (const input of wrap.querySelectorAll(".s98p-switch input")) input.checked = Boolean(settings[input.name]);
    refreshControlTelemetry();
  }

  function fillControlReport(panel) {
    const summary = [
      [text("product"), VERSION],
      [text("controlProtection"), settings.blockAds && settings.patchScripts ? text("controlProtectionActive") : text("controlProtectionPaused")],
      [text("controlAdvanced"), [controlCompatibilityLabel(), compatibilityState?.sha256].filter(Boolean).join(" · ")],
      [text("controlAdsRemoved"), stats.adsRemoved],
      [text("controlLinksSecured"), stats.linksPreserved + stats.linksRestored],
      [text("controlCodePatches"), controlPatchCount()],
    ];
    const list = document.createElement("dl");
    for (const [label, value] of summary) {
      const name = document.createElement("dt");
      const detail = document.createElement("dd");
      name.textContent = label;
      detail.dir = "auto";
      detail.textContent = String(value);
      list.append(name, detail);
    }
    const entries = document.createElement("ul");
    for (const event of eventLog.slice(-20).reverse()) {
      const entry = document.createElement("li");
      entry.dir = "auto";
      entry.textContent = event.message;
      entries.appendChild(entry);
    }
    panel.replaceChildren(list, entries);
  }

  function renderControlPanel() {
    if (!document.body) return;
    if (controlPanel?.wrap.isConnected && controlPanel.wrap.contains(controlPanel.form)) {
      syncControlSettings(controlPanel.wrap);
      return controlPanel;
    }
    controlPanel?.abort.abort();
    const abort = new AbortController();
    const { signal } = abort;
    const old = document.getElementById("soft98-pro-control");
    const wasOpen = old && old.getAttribute("data-open") === "true";
    if (old) old.remove();
    const wrap = document.createElement("div");
    wrap.id = "soft98-pro-control";
    wrap.dir = "ltr";
    wrap.lang = LOCALE;
    wrap.style.setProperty("unicode-bidi", "isolate");
    wrap.dataset.open = "false";
    const groups = {
      protection: ["blockAds", "patchScripts"],
      experience: ["pro", "darkDesign", "rgbMode", "compactLayout", "expandMain", "quickNavigation", "showLatest", "hideAnnoyances", "utilityInHeader", "linkBadges", "pirateLogo"],
      advanced: ["taunt", "soundFeedback", "diagnostics", "recommendExtension"],
      ...(IS_EXTENSION ? { downloads: [] } : {}),
    };
    const groupLabels = {
      protection: text("controlProtection"),
      experience: text("controlExperience"),
      advanced: text("controlAdvanced"),
      downloads: text("articlePreview"),
    };
    if (!groups[controlSection]) controlSection = "protection";
    wrap.innerHTML = `
      <button type="button" data-role="toggle" aria-controls="soft98-pro-console" aria-expanded="false" aria-label="${escapeHtml(text("controlTitle"))}" aria-description="${escapeHtml(text("moveControl"))}" title="${escapeHtml(text("moveControl"))}">
        <img src="${escapeHtml(BRAND_ASSETS.pirateDark || BRAND_ASSETS.light || "")}" alt="">
      </button>
      <span class="s98p-dock-target" aria-hidden="true" hidden></span>
      <button type="button" data-role="restore" aria-label="${escapeHtml(text("controlRestore"))}" title="${escapeHtml(text("controlRestore"))}" hidden><span aria-hidden="true"></span></button>
      <form id="soft98-pro-console" role="dialog" aria-modal="false" aria-labelledby="soft98-pro-console-title" aria-hidden="true" hidden inert dir="${RTL ? "rtl" : "ltr"}" lang="${LOCALE}">
        <header class="s98p-console-header">
          <span class="s98p-brand-mark" aria-hidden="true"><img src="${escapeHtml(BRAND_ASSETS.pirateDark || BRAND_ASSETS.light || "")}" alt=""></span>
          <span class="s98p-console-heading">
            <span class="s98p-console-kicker"><b dir="ltr">Soft98 Pro</b><i>${escapeHtml(text("controlLive"))}</i></span>
            <strong id="soft98-pro-console-title">${escapeHtml(text("controlTitle"))}</strong>
            <small>${escapeHtml(text("controlSubtitle"))}</small>
          </span>
          <span class="s98p-version" dir="ltr">${escapeHtml(VERSION)}</span>
          <button type="button" data-role="options" aria-haspopup="menu" aria-expanded="false" aria-controls="soft98-pro-launcher-menu" aria-label="${escapeHtml(text("controlLauncherMenu"))}" title="${escapeHtml(text("controlLauncherMenu"))}"><span aria-hidden="true"></span></button>
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
        <div class="s98p-tabs" role="tablist" aria-label="${escapeHtml(text("controlTitle"))}" style="--tab-count:${Object.keys(groups).length}">
          ${[
            ["protection", text("controlProtection")],
            ["experience", text("controlExperience")],
            ["advanced", text("controlAdvanced")],
            ...(IS_EXTENSION ? [["downloads", text("articlePreview")]] : []),
          ]
            .map(([key, label]) => `<button type="button" role="tab" id="soft98-pro-tab-${key}" aria-controls="soft98-pro-panel-${key}" aria-selected="${controlSection === key}" tabindex="${controlSection === key ? "0" : "-1"}" data-section="${key}">${escapeHtml(label)}</button>`)
            .join("")}
        </div>
        <div class="s98p-panels">
          ${Object.entries(groups)
            .map(([group, keys]) => `<section role="tabpanel" id="soft98-pro-panel-${group}" aria-labelledby="soft98-pro-tab-${group}" data-panel="${group}" ${controlSection === group ? "" : "hidden"}>
              <div class="s98p-panel-intro">
                <span><strong>${escapeHtml(groupLabels[group])}</strong><small>${escapeHtml(text(`controlSectionDescriptions.${group}`))}</small></span>
                ${group === "downloads" ? "" : `<b><span dir="ltr">${keys.length}</span> ${escapeHtml(text("controlModules"))}</b>`}
              </div>
              ${keys.map(controlOptionMarkup).join("")}
              ${group === "downloads" ? `
              <dl class="s98p-download-overview">
                ${["active", "waiting", "finished"].map(key => `<div><dt>${escapeHtml(text("controlDownloadStates." + key))}</dt><dd data-queue-count="${key}">–</dd></div>`).join("")}
              </dl>
              <button class="s98p-download-open" type="button" data-soft98-pro-download-manager="open">${PAGE_ICONS.download}${escapeHtml(text("controlOpenDownloads"))}</button>
              ` : ""}
            </section>`)
            .join("")}
          <section id="soft98-pro-report" class="s98p-report" aria-labelledby="soft98-pro-report-title" hidden>
            <h2 id="soft98-pro-report-title" tabindex="-1">${escapeHtml(text("logs.diagnostics"))}</h2>
            <div data-role="report-content"></div>
          </section>
        </div>
        <footer>
          <button type="button" data-role="diagnostics" aria-expanded="false" aria-controls="soft98-pro-report"><span class="s98p-command-icon s98p-command-diagnostics" aria-hidden="true"></span>${escapeHtml(text("controlDiagnostics"))}</button>
          <button type="button" data-role="scan"><span class="s98p-command-icon s98p-command-scan" aria-hidden="true"></span>${escapeHtml(text("scanNow"))}</button>
        </footer>
      </form>
      <div id="soft98-pro-launcher-menu" class="s98p-launcher-menu" role="menu" aria-label="${escapeHtml(text("controlLauncherMenu"))}" dir="${RTL ? "rtl" : "ltr"}" hidden>
        <button type="button" role="menuitem" data-command="panel" tabindex="-1"><span aria-hidden="true">&#9638;</span>${escapeHtml(text("controlTitle"))}</button>
        <button type="button" role="menuitem" data-command="reset" tabindex="-1"><span aria-hidden="true">&#8634;</span>${escapeHtml(text("controlResetPosition"))}</button>
        <button type="button" role="menuitem" data-command="tuck" tabindex="-1"><span aria-hidden="true">&#8644;</span><span data-role="tuck-label">${escapeHtml(text("controlTuck"))}</span></button>
      </div>
      <div class="s98p-option-preview" aria-hidden="true" dir="${RTL ? "rtl" : "ltr"}" hidden>
        <span>${escapeHtml(text("previewBefore"))}<img alt="" draggable="false"></span>
        <span>${escapeHtml(text("previewAfter"))}<img alt="" draggable="false"></span>
        <small data-preview-kind hidden>${escapeHtml(text("previewIllustration"))}</small>
      </div>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #soft98-pro-control{--c-bg:rgba(246,250,251,.985);--c-bg-soft:#e7f0f2;--c-bg-raised:#fff;--c-border:#9ebac2;--c-border-soft:#ccdde1;--c-text:#11232a;--c-muted:#526b74;--c-accent:#087a63;--c-accent-2:#a56b13;--c-accent-soft:rgba(8,122,99,.11);--c-danger:#b84152;position:fixed;z-index:2147483647;width:42px;height:42px;direction:ltr;font-family:inherit!important;font-size:13px;line-height:1.6;font-weight:400;color:var(--c-text);letter-spacing:0;isolation:isolate}
      #soft98-pro-control[data-theme=dark],#soft98-pro-control[data-theme=rgb]{--c-bg:rgba(5,10,14,.985);--c-bg-soft:#0d1a21;--c-bg-raised:#14252d;--c-border:#41616c;--c-border-soft:#203943;--c-text:#f3f8f9;--c-muted:#a6bbc1;--c-accent:#70e1b2;--c-accent-2:#e0bd70;--c-accent-soft:rgba(112,225,178,.12);--c-danger:#ff8796}
      #soft98-pro-control[data-theme=rgb]{--c-bg:rgba(2,3,4,.99);--c-bg-soft:#07090a;--c-bg-raised:#0c0f10;--c-border:color-mix(in srgb,var(--c-accent) 75%,#24292c);--c-border-soft:#24292c;--c-text:#d9dee0;--c-muted:#a1aab0;--c-accent:var(--s98p-neon,#70e1b2);--c-accent-2:var(--s98p-neon-2,#8c9bff);--c-accent-soft:color-mix(in srgb,var(--c-accent) 17%,transparent)}
      #soft98-pro-control[data-theme=light]{color-scheme:light;--c-bg:#f5f9ff;--c-bg-soft:#e7efff;--c-bg-raised:#fff;--c-border:#9fb9eb;--c-border-soft:#d4e2f7;--c-text:#14284a;--c-muted:#3f587d;--c-accent:#165bd3;--c-accent-2:#087752;--c-accent-soft:#dceaff;--c-danger:#a6294b}
      #soft98-pro-control:is([data-theme=dark],[data-theme=rgb]){color-scheme:dark}
      #soft98-pro-control[data-theme=light] form{box-shadow:0 0 0 1px #fff inset,0 0 0 4px #f8fcfbbf,0 18px 60px #15364740!important}
      #soft98-pro-control[data-theme=light] :is(.s98p-brand-mark,[data-role=toggle],.s98p-option-preview){box-shadow:0 5px 18px #15364722}
      #soft98-pro-control[data-theme=light] .s98p-tabs button[aria-selected=true]{box-shadow:0 1px 4px #15364716!important}
      #soft98-pro-control :is(form,button,input,label,strong,small,dt,dd){font-family:inherit!important;letter-spacing:0!important}
      #soft98-pro-control>[data-role=toggle]{position:absolute;inset:0;display:grid;place-items:center;width:42px;height:42px;margin:0;padding:0;float:none;border:1px solid var(--c-border)!important;border-radius:50%;background:var(--c-bg-soft)!important;background-image:none!important;color:var(--c-accent)!important;line-height:1;box-shadow:0 10px 30px rgba(0,0,0,.3);cursor:grab;touch-action:none;user-select:none;transition:transform .18s ease,background-color .18s ease,border-color .18s ease,box-shadow .18s ease}
      #soft98-pro-control>[data-role=toggle] img{display:block;width:30px;height:30px;object-fit:contain;filter:none!important;pointer-events:none}
      #soft98-pro-control[data-dragging=true]{will-change:translate}
      #soft98-pro-control[data-dragging=true]>[data-role=toggle]{cursor:grabbing;transform:scale(1.04);transition:none;box-shadow:0 4px 12px #0004!important}
      #soft98-pro-control>[data-role=toggle]:hover,#soft98-pro-control[data-open=true]>[data-role=toggle]{transform:translateY(-1px) scale(1.04);border-color:var(--c-accent)!important;background:var(--c-bg-raised)!important;box-shadow:0 14px 36px rgba(0,0,0,.38),0 0 0 4px var(--c-accent-soft)}
      #soft98-pro-control[data-theme=rgb]>[data-role=toggle]{border-color:transparent!important;background:linear-gradient(150deg,var(--c-bg-raised),var(--c-bg-soft)) padding-box,var(--s98p-neon-edge) border-box!important;box-shadow:0 14px 38px rgba(0,0,0,.55),0 0 26px var(--c-accent-soft)}
      #soft98-pro-control .s98p-dock-target{position:absolute;inset:-4px;box-sizing:border-box;border:2px dashed var(--c-accent);border-radius:50%;outline:3px solid var(--c-accent-soft);background:var(--c-accent-soft);pointer-events:none;z-index:-1;will-change:transform,opacity}
      #soft98-pro-control[data-gravity=true]>[data-role=toggle]{transform:none;scale:.9;border-color:var(--c-accent)!important;box-shadow:0 0 0 4px var(--c-accent-soft),0 4px 18px var(--c-accent-soft)!important}
      #soft98-pro-control form{position:absolute;box-sizing:border-box;display:grid;grid-template-rows:auto auto auto auto minmax(0,1fr) auto;overflow:hidden;margin:0;padding:0;border:1px solid color-mix(in srgb,var(--c-accent) 42%,var(--c-border))!important;border-radius:8px;background:var(--c-bg)!important;background-image:linear-gradient(135deg,color-mix(in srgb,var(--c-accent) 4%,transparent),transparent 36%,color-mix(in srgb,var(--c-accent-2) 3%,transparent))!important;color:var(--c-text)!important;box-shadow:0 0 0 1px rgba(255,255,255,.045) inset,0 0 0 4px rgba(7,13,17,.55),0 30px 90px rgba(0,0,0,.58),0 0 36px color-mix(in srgb,var(--c-accent) 9%,transparent)!important;backdrop-filter:blur(28px) saturate(145%);transform-origin:left bottom}
      #soft98-pro-control form:before{content:"";position:absolute;z-index:4;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--c-accent),var(--c-accent-2),var(--c-accent));pointer-events:none}
      #soft98-pro-control form[dir=rtl]{text-align:right}
      #soft98-pro-control form[dir=ltr]{text-align:left}
      #soft98-pro-control form[data-align=right]{transform-origin:right bottom}
      #soft98-pro-control form[data-opens=down]{transform-origin:left top}
      #soft98-pro-control form[data-align=right][data-opens=down]{transform-origin:right top}
      #soft98-pro-control form[inert]{pointer-events:none}
      #soft98-pro-control[data-theme=rgb] form{border-color:transparent!important;background:linear-gradient(135deg,color-mix(in srgb,var(--c-accent) 5%,var(--c-bg-soft)),var(--c-bg-soft) 50%,color-mix(in srgb,var(--c-accent-2) 4%,var(--c-bg-soft))) padding-box,var(--s98p-neon-edge) border-box!important;box-shadow:0 0 0 1px rgba(255,255,255,.035) inset,0 0 0 4px rgba(0,0,0,.72),0 32px 94px rgba(0,0,0,.72),0 0 32px var(--c-accent-soft)!important}
      #soft98-pro-control[data-theme=rgb] form::before,#soft98-pro-control[data-theme=rgb] .s98p-tabs [aria-selected=true]::after{background:var(--s98p-neon-line)}
      #soft98-pro-control .s98p-console-header{position:relative;display:grid;grid-template-columns:46px minmax(0,1fr) auto 30px 30px;align-items:center;gap:8px;padding:17px 15px 14px;border-bottom:1px solid var(--c-border-soft);background:linear-gradient(180deg,color-mix(in srgb,var(--c-bg-raised) 88%,transparent),color-mix(in srgb,var(--c-bg) 92%,transparent));color:var(--c-text)}
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
      #soft98-pro-control :is([data-role=close],[data-role=options]){position:relative;display:grid;place-items:center;width:30px;height:30px;margin:0;padding:0;border:0!important;border-radius:6px;background:transparent!important;background-image:none!important;color:var(--c-muted)!important;cursor:pointer}
      #soft98-pro-control :is([data-role=close],[data-role=options]):hover,#soft98-pro-control [data-role=options][aria-expanded=true]{background:var(--c-accent-soft)!important;color:var(--c-text)!important;transform:none!important}
      #soft98-pro-control [data-role=options] span{width:3px;height:3px;border-radius:50%;background:currentColor;box-shadow:-5px 0 currentColor,5px 0 currentColor}
      #soft98-pro-control [data-role=close] span:before,#soft98-pro-control [data-role=close] span:after{content:"";position:absolute;top:14px;left:8px;width:14px;height:1.5px;border-radius:2px;background:currentColor}
      #soft98-pro-control [data-role=close] span:before{transform:rotate(45deg)}
      #soft98-pro-control [data-role=close] span:after{transform:rotate(-45deg)}
      #soft98-pro-control .s98p-status{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:10px;margin:12px 14px 0;padding:10px 12px;border:1px solid color-mix(in srgb,var(--c-accent) 26%,var(--c-border-soft));border-radius:7px;background:color-mix(in srgb,var(--c-accent-soft) 70%,var(--c-bg-raised))}
      #soft98-pro-control .s98p-status-dot{width:8px;height:8px;border-radius:50%;background:var(--c-accent);box-shadow:0 0 0 4px var(--c-accent-soft)}
      #soft98-pro-control[data-protection=paused] .s98p-status-dot,#soft98-pro-control[data-compatibility=unknown] .s98p-status-dot{background:var(--c-danger);box-shadow:0 0 0 4px color-mix(in srgb,var(--c-danger) 15%,transparent)}
      #soft98-pro-control .s98p-status-copy{display:grid;min-width:0;gap:0;direction:inherit;unicode-bidi:plaintext;text-align:start}
      #soft98-pro-control .s98p-status-copy strong{color:var(--c-text)!important;font-size:12px}
      #soft98-pro-control .s98p-status-copy small{color:var(--c-muted)!important;font-size:10.5px}
      #soft98-pro-control .s98p-status code{padding:3px 6px;border:1px solid var(--c-border-soft);border-radius:4px;background:var(--c-bg)!important;color:var(--c-muted)!important;font:10px/1.2 ui-monospace,monospace}
      #soft98-pro-control .s98p-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:9px 14px 0;padding:0}
      #soft98-pro-control .s98p-metrics div{display:grid;gap:3px;padding:9px 8px;border:1px solid var(--c-border-soft);border-radius:7px;background:color-mix(in srgb,var(--c-bg-raised) 72%,transparent);text-align:center}
      #soft98-pro-control .s98p-metrics div:first-child{border-color:color-mix(in srgb,var(--c-accent) 25%,var(--c-border-soft))}
      #soft98-pro-control .s98p-metrics dt{margin:0;background:transparent!important;color:var(--c-muted)!important;font-size:10px;font-weight:500;white-space:normal}
      #soft98-pro-control .s98p-metrics dd{margin:0;background:transparent!important;color:var(--c-text)!important;font-size:18px;font-weight:750;line-height:1.15;font-variant-numeric:tabular-nums}
      #soft98-pro-control .s98p-tabs{display:grid;grid-template-columns:repeat(var(--tab-count,3),minmax(0,1fr));gap:3px;margin:11px 14px 0;padding:3px;border:1px solid var(--c-border-soft);border-radius:7px;background:var(--c-bg-soft)}
      #soft98-pro-control .s98p-download-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:4px 0}
      #soft98-pro-control .s98p-download-overview>div{display:grid;gap:4px;padding:8px;border:1px solid var(--c-border-soft);border-radius:6px;background:var(--c-bg-soft);text-align:center}
      #soft98-pro-control .s98p-download-overview dt{font-size:11px;color:var(--c-muted)}
      #soft98-pro-control .s98p-download-overview dd{margin:0;font-weight:700;font-size:18px;color:var(--c-accent);font-variant-numeric:tabular-nums}
      #soft98-pro-control .s98p-download-open{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:7px;border:1px solid var(--c-border);border-radius:6px;background:var(--c-bg-raised)!important;color:var(--c-text)!important;cursor:pointer}
      #soft98-pro-control .s98p-download-open svg{width:18px;height:18px;pointer-events:none}
      #soft98-pro-control .s98p-tabs button{position:relative;min-width:0;margin:0;padding:8px 5px;border:0;border-radius:5px;background:transparent!important;color:var(--c-muted)!important;font-size:11px;font-weight:650;line-height:1.4;cursor:pointer;transition:color .16s ease,box-shadow .16s ease}
      #soft98-pro-control .s98p-tabs button:hover{color:var(--c-text)!important}
      #soft98-pro-control .s98p-tabs button[aria-selected=true]{background:var(--c-bg-raised)!important;color:var(--c-accent)!important;border-color:var(--c-accent)!important;box-shadow:0 1px 7px rgba(0,0,0,.22)!important}
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
      #soft98-pro-control[data-theme=rgb] .s98p-switch input:checked+span{border-color:transparent;background:linear-gradient(var(--c-bg-raised),var(--c-bg-soft)) padding-box,var(--s98p-neon-edge) border-box}
      #soft98-pro-control[data-theme=rgb] .s98p-switch input:checked+span:after{background:var(--s98p-neon-line)}
      #soft98-pro-control .s98p-switch input:focus-visible+span{outline:2px solid var(--c-accent);outline-offset:3px}
      #soft98-pro-control .s98p-option-preview{position:fixed;pointer-events:none;z-index:5;box-sizing:border-box;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px;border:1px solid var(--c-border);border-radius:8px;background:var(--c-bg);box-shadow:0 12px 35px #0007;text-align:center;font-size:11px;color:var(--c-text)!important}
      #soft98-pro-control .s98p-option-preview[hidden]{display:none!important}
      #soft98-pro-control .s98p-option-preview [data-preview-kind]{grid-column:1/-1;text-align:start;color:var(--c-muted)}
      #soft98-pro-control .s98p-option-preview [data-preview-kind][hidden]{display:none!important}
      #soft98-pro-control .s98p-option-preview img{display:block;width:100%;aspect-ratio:16/9;max-height:var(--c-preview-height);box-sizing:border-box;object-fit:contain;margin-top:5px;border:1px solid var(--c-border-soft);border-radius:4px;background:var(--c-bg-soft);filter:none!important}
      #soft98-pro-control footer{display:grid;grid-template-columns:1fr auto;gap:8px;padding:11px 14px;border-top:1px solid var(--c-border-soft);background:color-mix(in srgb,var(--c-bg-soft) 88%,var(--c-bg))}
      #soft98-pro-control footer button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;margin:0;padding:7px 12px;border:1px solid var(--c-border);border-radius:7px;background:var(--c-bg-raised)!important;color:var(--c-text)!important;font-size:11px;font-weight:650;line-height:1.4;cursor:pointer;transition:border-color .16s ease,background-color .16s ease,transform .16s ease}
      #soft98-pro-control footer button:hover{border-color:var(--c-accent);color:var(--c-accent)!important;transform:translateY(-1px)}
      #soft98-pro-control[data-theme=rgb] :is(footer button,.s98p-tabs button[aria-selected=true]){border-color:transparent!important;background:linear-gradient(var(--c-bg-raised),var(--c-bg-soft)) padding-box,var(--s98p-neon-edge) border-box!important}
      #soft98-pro-control .s98p-command-icon{position:relative;display:inline-block;flex:0 0 15px;width:15px;height:15px;color:currentColor}
      #soft98-pro-control .s98p-command-scan{border:1.5px solid currentColor;border-radius:50%}
      #soft98-pro-control .s98p-command-scan:before{content:"";position:absolute;top:-2px;right:-2px;width:5px;height:5px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor;background:var(--c-bg-raised)}
      #soft98-pro-control .s98p-command-diagnostics:before{content:"";position:absolute;inset:2px 1px 1px;border:1.5px solid currentColor;border-radius:3px}
      #soft98-pro-control .s98p-command-diagnostics:after{content:"";position:absolute;left:4px;right:4px;top:6px;height:1.5px;background:currentColor;box-shadow:0 4px 0 currentColor}
      #soft98-pro-control button:focus-visible{outline:2px solid var(--c-accent)!important;outline-offset:2px!important}
      #soft98-pro-control [hidden]{display:none!important}
      #soft98-pro-control form[data-short=true]{display:block;overflow:auto;overscroll-behavior:contain;scrollbar-color:var(--c-border) transparent}
      #soft98-pro-control .s98p-report{margin-block-start:10px;padding:10px;border:1px solid var(--c-border-soft);border-radius:7px;background:var(--c-bg-soft);text-align:start;overflow-wrap:anywhere}
      #soft98-pro-control .s98p-report h2{margin:0 0 8px;padding:0;font-size:13px;color:var(--c-text)!important}
      #soft98-pro-control .s98p-report dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:4px 8px;margin:0}
      #soft98-pro-control .s98p-report :is(dt,dd){margin:0;color:var(--c-text)!important}
      #soft98-pro-control .s98p-report dt,#soft98-pro-control .s98p-report li{color:var(--c-muted)!important}
      #soft98-pro-control .s98p-report ul{margin:10px 0 0;padding-inline-start:18px}
      #soft98-pro-control .s98p-report ul:empty{display:none}
      #soft98-pro-control .s98p-launcher-menu{position:absolute;z-index:1;box-sizing:border-box;display:grid;gap:3px;overflow:auto;overscroll-behavior:contain;padding:5px;border:1px solid var(--c-border)!important;border-radius:8px;background:var(--c-bg)!important;backdrop-filter:blur(16px);box-shadow:0 12px 35px #0006!important}
      #soft98-pro-control .s98p-launcher-menu button{display:grid;grid-template-columns:16px minmax(0,1fr);align-items:center;gap:8px;min-height:36px;margin:0;padding:6px 8px;border:1px solid transparent!important;border-radius:5px;background:transparent!important;color:var(--c-text)!important;text-align:start;white-space:normal;cursor:pointer}
      #soft98-pro-control .s98p-launcher-menu button:is(:hover,:focus-visible){background:var(--c-accent-soft)!important;border-color:var(--c-border)!important;outline:none!important;box-shadow:none!important}
      #soft98-pro-control .s98p-launcher-menu button>span:first-child{color:var(--c-accent);text-align:center}
      #soft98-pro-control [data-role=restore]{position:absolute;inset:0 auto 0 0;display:grid;place-items:center;width:27px;height:42px;margin:0;padding:0;border:1px solid var(--c-border)!important;border-radius:7px;background:var(--c-bg-raised)!important;color:var(--c-accent)!important;cursor:pointer;box-shadow:0 5px 15px #0004}
      #soft98-pro-control[data-inline-edge=right] [data-role=restore]{right:0;left:auto}
      #soft98-pro-control [data-role=restore] span{width:8px;height:8px;border:solid currentColor;border-width:1.5px 1.5px 0 0;transform:rotate(45deg)}
      #soft98-pro-control[data-inline-edge=right] [data-role=restore] span{transform:rotate(-135deg)}
      #soft98-pro-control[data-tuck-preview=true]>[data-role=toggle]{border-color:var(--c-accent)!important;opacity:.6}
      @media(max-width:520px){#soft98-pro-control .s98p-console-header{grid-template-columns:42px minmax(0,1fr) 30px 30px}#soft98-pro-control .s98p-version{display:none}#soft98-pro-control .s98p-option-copy small,#soft98-pro-control .s98p-panel-intro small{font-size:10px}}
      @media(prefers-reduced-motion:reduce){#soft98-pro-control{animation:none!important}#soft98-pro-control *,#soft98-pro-control *:before,#soft98-pro-control *:after{transition:none!important}}
    `;
    setPersistentStyle("soft98-pro-control-style", style.textContent);
    const toggle = wrap.querySelector("[data-role='toggle']");
    const restore = wrap.querySelector("[data-role='restore']");
    const options = wrap.querySelector("[data-role='options']");
    const form = wrap.querySelector("form");
    const scroller = form.querySelector(".s98p-panels");
    const preview = wrap.querySelector(".s98p-option-preview");
    const previewImages = [...preview.querySelectorAll("img")];
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let previewTimer = 0;
    let previewOption = null;
    const hidePreview = () => {
      clearTimeout(previewTimer);
      previewOption = null;
      preview.hidden = true;
      for (const image of previewImages) image.removeAttribute("src");
    };
    const showPreview = (option, delay) => {
      hidePreview();
      previewOption = option;
      previewTimer = setTimeout(() => {
        if (previewOption !== option || form.inert || !option.getClientRects().length) return;
        const { files: [before, after, still], illustrated } = OPTION_PREVIEWS[option.dataset.s98pPreview];
        preview.querySelector("[data-preview-kind]").hidden = !illustrated;
        previewImages[0].src = before;
        previewImages[1].src = reduceMotion.matches && still ? still : after;
        const viewport = controlViewport();
        const anchor = option.getBoundingClientRect();
        const panel = form.getBoundingClientRect();
        const width = Math.min(462, viewport.width - 16);
        if (width < 140 || viewport.height < 155) return hidePreview();
        preview.style.width = width + "px";
        preview.style.setProperty("--c-preview-height", Math.max(72, viewport.height - 56) + "px");
        preview.hidden = false;
        const height = preview.getBoundingClientRect().height;
        const right = panel.right + 12;
        const left = panel.left - width - 12;
        const x = right + width <= viewport.left + viewport.width - 8 ? right :
          left >= viewport.left + 8 ? left :
            Math.max(viewport.left + 8, Math.min(anchor.left, viewport.left + viewport.width - width - 8));
        const beside = x === left || x === right;
        const y = beside ? anchor.top : anchor.bottom + height + 8 > viewport.top + viewport.height ? anchor.top - height - 8 : anchor.bottom + 8;
        preview.style.left = x + "px";
        preview.style.top = Math.max(viewport.top + 8, Math.min(y, viewport.top + viewport.height - height - 8)) + "px";
      }, delay);
    };
    for (const option of form.querySelectorAll("[data-s98p-preview]")) {
      option.addEventListener("pointerenter", (event) => { if (event.pointerType !== "touch") showPreview(option, 220); }, { signal });
      option.addEventListener("focusin", (event) => { if (event.target.matches(":focus-visible")) showPreview(option, 0); }, { signal });
      for (const event of ["pointerleave", "focusout", "change"]) option.addEventListener(event, () => {
        if (previewOption === option) hidePreview();
      }, { signal });
    }
    scroller.addEventListener("scroll", hidePreview, { passive: true, signal });
    window.addEventListener("resize", hidePreview, { signal });
    window.visualViewport?.addEventListener("resize", hidePreview, { signal });
    window.visualViewport?.addEventListener("scroll", hidePreview, { signal });
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && previewOption) {
        event.preventDefault();
        hidePreview();
      }
    }, { signal });
    signal.addEventListener("abort", hidePreview, { once: true });
    const diagnostics = wrap.querySelector("[data-role='diagnostics']");
    const report = form.querySelector("#soft98-pro-report");
    const reportTitle = report.querySelector("h2");
    const menu = wrap.querySelector("[role='menu']");
    const menuItems = [...menu.querySelectorAll("[role='menuitem']")];
    const sectionScroll = new Map();
    let viewport = controlViewport();
    const stored = readControlPosition();
    let requested = stored?.legacy ? snapControlPosition({ x: stored.x, y: stored.y }, viewport, false) : stored || defaultControlPosition();
    let position;
    let drag = null;
    const dockTarget = wrap.querySelector(".s98p-dock-target");
    let guide = null;
    let dockAnimation = null;
    let dragFrame = 0;
    let suppressClick = false;
    let menuTrigger = null;
    let panelAnimation = null;
    let panelDeadline = 0;
    const finishClose = () => {
      clearTimeout(panelDeadline);
      panelAnimation?.cancel();
      panelAnimation = null;
      if (wrap.dataset.open !== "true") form.hidden = true;
    };
    signal.addEventListener("abort", () => {
      clearTimeout(panelDeadline);
      panelAnimation?.cancel();
      dockAnimation?.cancel();
      cancelAnimationFrame(dragFrame);
    }, { once: true });
    const layout = () => {
      position = placeControl(wrap, requested, viewport);
      if (drag?.moved) renderDrag();
      else {
        wrap.style.removeProperty("translate");
        dockTarget.hidden = true;
        guide = null;
        delete wrap.dataset.gravity;
      }
      if (!form.hidden) placeControlSurface(form, position, viewport, 448, 720);
      if (!menu.hidden) placeControlSurface(menu, position, viewport, 246, 220);
    };
    const updateLauncher = () => {
      toggle.hidden = requested.tucked;
      restore.hidden = !requested.tucked;
      wrap.querySelector("[data-role='tuck-label']").textContent = text(requested.tucked ? "controlRestore" : "controlTuck");
    };
    const closeMenu = (focus = false) => {
      if (menu.hidden) return;
      menu.hidden = true;
      options.setAttribute("aria-expanded", "false");
      if (focus && menuTrigger && !menuTrigger.hidden) menuTrigger.focus({ preventScroll: true });
      menuTrigger = null;
    };
    const setOpen = (open, moveFocus = false) => {
      if (!open) hidePreview();
      closeMenu();
      const changing = open !== (wrap.dataset.open === "true");
      if (open && requested.tucked) {
        requested = { ...requested, tucked: false };
        saveControlPosition(requested);
        updateLauncher();
      }
      if (!open && (moveFocus || form.contains(document.activeElement))) (requested.tucked ? restore : toggle).focus({ preventScroll: true });
      const current = panelAnimation && getComputedStyle(form);
      const from = current ? { opacity: current.opacity, transform: current.transform } : null;
      clearTimeout(panelDeadline);
      panelAnimation?.cancel();
      panelAnimation = null;
      if (open) {
        form.hidden = false;
        layout();
      }
      wrap.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
      form.setAttribute("aria-hidden", String(!open));
      form.inert = !open;
      if (changing && !reduceMotion.matches) {
        const rest = { opacity: 1, transform: "none" };
        const tucked = { opacity: 0, transform: `translateY(${form.dataset.opens === "up" ? 15 : -15}px) scale(.94)` };
        const animation = form.animate([from || (open ? tucked : rest), open ? rest : tucked],
          { duration: open ? 280 : 220, easing: "cubic-bezier(.22,.74,.24,1)", fill: "both" });
        panelAnimation = animation;
        animation.finished.then(() => { if (panelAnimation === animation) finishClose(); }, () => {});
        panelDeadline = setTimeout(finishClose, open ? 330 : 270);
      } else if (!open) finishClose();
      if (open) {
        if (controlSection === "downloads") document.dispatchEvent(new Event("soft98-pro:download-summary-request"));
        if (moveFocus) form.querySelector('[role="tab"][aria-selected="true"]').focus({ preventScroll: true });
        refreshControlTelemetry();
      }
    };
    const openMenu = (trigger, last = false) => {
      menuTrigger = trigger;
      options.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      layout();
      menuItems[last ? menuItems.length - 1 : 0].focus();
    };
    const storePosition = (next, focus = false) => {
      requested = next;
      saveControlPosition(requested);
      updateLauncher();
      layout();
      if (requested.tucked) setOpen(false, focus);
      else if (focus) toggle.focus({ preventScroll: true });
    };
    const setReport = (open) => {
      if (open) fillControlReport(report.querySelector("[data-role='report-content']"));
      diagnostics.setAttribute("aria-expanded", String(open));
      if (!open && report.contains(document.activeElement)) diagnostics.focus({ preventScroll: true });
      slideDisclosure(report, open, "data-soft98-pro-report-motion", () => { report.hidden = false; },
        () => { report.hidden = !open; });
      report.inert = !open;
      if (open) reportTitle.focus();
    };
    const selectSection = (section, focus) => {
      if (!groups[section]) return;
      if (diagnostics.getAttribute("aria-expanded") === "true") setReport(false);
      if (section !== controlSection) sectionScroll.set(controlSection, scroller.scrollTop);
      const changed = section !== controlSection;
      controlSection = section;
      for (const tab of form.querySelectorAll('[role="tab"]')) {
        const selected = tab.getAttribute("data-section") === section;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) tab.focus({ preventScroll: true });
      }
      for (const panel of form.querySelectorAll('[role="tabpanel"]')) panel.hidden = panel.getAttribute("data-panel") !== section;
      if (changed) scroller.scrollTop = sectionScroll.get(section) || 0;
      if (section === "downloads") document.dispatchEvent(new Event("soft98-pro:download-summary-request"));
    };
    if (IS_EXTENSION) document.addEventListener("soft98-pro:download-summary", () => {
      try {
        const counts = JSON.parse(document.documentElement.getAttribute("data-soft98-pro-download-summary"));
        const number = new Intl.NumberFormat(LOCALE);
        for (const value of form.querySelectorAll("[data-queue-count]")) {
          const count = counts?.[value.dataset.queueCount];
          if (Number.isInteger(count) && count >= 0 && count <= 160) value.textContent = number.format(count);
        }
      } catch (_error) {}
    }, { signal });
    form.addEventListener("submit", (event) => event.preventDefault(), { signal });
    toggle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary || drag) return;
      suppressClick = false;
      dockAnimation?.cancel();
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: position, point: position, moved: false, tuck: false };
      if (event.isTrusted) toggle.setPointerCapture(event.pointerId);
    }, { signal });
    window.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      if (!drag.moved) {
        setOpen(false);
        finishClose();
      }
      drag.moved = true;
      drag.point = { x: drag.origin.x + dx, y: drag.origin.y + dy };
      drag.tuck = event.clientX <= viewport.left + 8 || event.clientX >= viewport.right - 8;
      wrap.dataset.dragging = "true";
      wrap.dataset.tuckPreview = String(drag.tuck);
      queueDragFrame();
    }, { signal });
    function queueDragFrame() {
      if (!dragFrame) dragFrame = requestAnimationFrame((now) => {
        dragFrame = 0;
        if (drag?.moved) renderDrag(now);
      });
    }
    const renderDrag = (now = performance.now(), settleGuide = true) => {
      const gravity = drag.tuck ? null : controlGravity(drag.point, viewport);
      const anchor = controlPoint(requested, viewport);
      position = controlPoint(gravity?.point || drag.point, viewport);
      wrap.style.translate = `${position.x - anchor.x}px ${position.y - anchor.y}px`;
      const { inlineEdge, blockEdge } = gravity?.target || {};
      const active = Boolean(inlineEdge || blockEdge);
      if (!active) delete wrap.dataset.gravity;
      else wrap.dataset.gravity = "true";
      if (!active && !guide) return;
      // Follow in viewport coordinates so movement of the launcher does not drag the guide along with it.
      guide ||= { ...position, opacity: 0, scale: .78, time: now - 16 };
      const target = controlPoint({ ...position, inlineEdge, blockEdge }, viewport);
      const blend = reduceMotion.matches ? 1 : 1 - Math.exp(-Math.max(0, now - guide.time) / 68);
      const approach = (value, goal, epsilon) => Math.abs(goal - value) < epsilon ? goal : value + (goal - value) * blend;
      guide.x = approach(guide.x, target.x, .4);
      guide.y = approach(guide.y, target.y, .4);
      guide.opacity = approach(guide.opacity, active ? 1 : 0, .02);
      guide.scale = approach(guide.scale, active ? 1 : .78, .01);
      guide.time = now;
      dockTarget.hidden = !active && guide.opacity === 0;
      dockTarget.style.opacity = guide.opacity;
      dockTarget.style.transform = `translate(${guide.x - position.x}px,${guide.y - position.y}px) scale(${guide.scale})`;
      if (dockTarget.hidden) guide = null;
      else if (settleGuide && (guide.x !== target.x || guide.y !== target.y || guide.opacity !== Number(active) ||
          guide.scale !== (active ? 1 : .78))) queueDragFrame();
    };
    const finishDrag = (event, cancelled = false) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        dragFrame = 0;
        if (!cancelled) renderDrag(performance.now(), false);
      }
      const current = drag;
      drag = null;
      delete wrap.dataset.dragging;
      delete wrap.dataset.tuckPreview;
      if (current.moved && !cancelled) {
        suppressClick = true;
        const from = position;
        const next = snapControlPosition(current.point, viewport, current.tuck, CONTROL_GRAVITY);
        storePosition(next, current.tuck);
        if (!next.tucked && (next.inlineEdge || next.blockEdge) && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const dx = from.x - position.x, dy = from.y - position.y;
          dockAnimation = toggle.animate([
            { translate: `${dx}px ${dy}px`, scale: ".9" },
            { translate: "0 0", scale: ".86", offset: .63 },
            { translate: "0 0", scale: "1" },
          ], { duration: 235, easing: "cubic-bezier(.22,.8,.24,1)" });
        }
      } else layout();
    };
    window.addEventListener("pointerup", (event) => finishDrag(event), { signal });
    window.addEventListener("pointercancel", (event) => finishDrag(event, true), { signal });
    toggle.addEventListener("lostpointercapture", (event) => finishDrag(event, true), { signal });
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
      const point = { x: position.x + delta.x, y: position.y + delta.y };
      const bounds = controlBounds(viewport);
      const next = {
        ...point, tucked: false,
        inlineEdge: !delta.x ? requested.inlineEdge : point.x <= bounds.left ? "left" : point.x >= bounds.right ? "right" : null,
        blockEdge: !delta.y ? requested.blockEdge : point.y <= bounds.top ? "top" : point.y >= bounds.bottom ? "bottom" : null,
      };
      storePosition(next);
    }, { signal });
    toggle.addEventListener("click", (event) => {
      if (suppressClick && event.detail !== 0) {
        suppressClick = false;
        event.preventDefault();
        return;
      }
      const open = wrap.getAttribute("data-open") !== "true";
      setOpen(open, open);
    }, { signal });
    restore.addEventListener("click", () => storePosition({ ...requested, tucked: false }, true), { signal });
    for (const button of [toggle, restore, options]) {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openMenu(button);
      }, { signal });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10") &&
            !(button === options && (event.key === "ArrowDown" || event.key === "ArrowUp"))) return;
        event.preventDefault();
        openMenu(button, event.key === "ArrowUp");
      }, { signal });
    }
    options.addEventListener("click", () => menu.hidden ? openMenu(options) : closeMenu(true), { signal });
    menu.addEventListener("keydown", (event) => {
      const current = menuItems.indexOf(event.target);
      let next;
      if (event.key === "ArrowDown") next = (current + 1) % menuItems.length;
      else if (event.key === "ArrowUp") next = (current - 1 + menuItems.length) % menuItems.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = menuItems.length - 1;
      else if (event.key === "Tab") {
        closeMenu(true);
        return;
      } else return;
      event.preventDefault();
      menuItems[next].focus();
    }, { signal });
    menu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-command]");
      if (!item) return;
      closeMenu(true);
      if (item.dataset.command === "panel") setOpen(true, true);
      else if (item.dataset.command === "reset") storePosition(defaultControlPosition(), true);
      else if (requested.tucked) storePosition({ ...requested, tucked: false }, true);
      else {
        const inlineEdge = position.x + 21 > viewport.left + viewport.width / 2 ? "right" : "left";
        storePosition({ ...requested, ...position, inlineEdge, tucked: true }, true);
      }
    }, { signal });
    wrap.querySelector("[data-role='close']").addEventListener("click", () => setOpen(false, true), { signal });
    wrap.querySelector("[data-role='scan']").addEventListener("click", () => {
      schedule(document);
      enqueueMicrotask(refreshControlTelemetry);
    }, { signal });
    diagnostics.addEventListener("click", () => setReport(diagnostics.getAttribute("aria-expanded") !== "true"), { signal });
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
      if (!input?.matches(".s98p-switch input")) return;
      const next = { ...settings, [input.name]: input.checked };
      if (input.name === "darkDesign" && !input.checked) next.rgbMode = false;
      writeSettings(next);
    }, { signal });
    document.addEventListener("pointerdown", (event) => {
      if (!menu.contains(event.target) && event.target !== options && !options.contains(event.target)) closeMenu();
      if (wrap.getAttribute("data-open") === "true" && !wrap.contains(event.target)) setOpen(false, false);
    }, { capture: true, signal });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || !wrap.contains(document.activeElement)) return;
      if (!menu.hidden) closeMenu(true);
      else if (wrap.dataset.open === "true") setOpen(false, true);
      else return;
      event.preventDefault();
    }, { signal });
    const refreshViewport = () => {
      viewport = controlViewport();
      layout();
    };
    window.addEventListener("resize", refreshViewport, { signal });
    window.visualViewport?.addEventListener("resize", refreshViewport, { signal });
    window.visualViewport?.addEventListener("scroll", { handleEvent: refreshViewport }, { signal });
    document.body.appendChild(wrap);
    controlPanel = { wrap, form, abort, open: () => setOpen(true) };
    updateLauncher();
    layout();
    if (wasOpen) setOpen(true);
    syncSuccessEnhancements();
    syncControlSettings(wrap);
    return controlPanel;
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
    const advanced = document.getElementById("soft98-pro-panel-advanced");
    if (!advanced) return;
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
      #soft98-extension-recommendation{position:relative;display:grid;gap:7px;padding:12px 28px 12px 12px;border:1px solid var(--c-border);border-radius:7px;background:var(--c-bg-soft);color:var(--c-text);font:inherit}
      #soft98-extension-recommendation span{color:#b8c7d8}
      #soft98-extension-recommendation a{color:#70e1b2;font-weight:800;text-decoration:none}
      #soft98-extension-recommendation button{position:absolute;top:8px;left:8px;border:0;background:transparent;color:#9db1c6;font-size:18px;cursor:pointer}
    `;
    panel.appendChild(style);
    panel.querySelector("button").addEventListener("click", () => {
      writeSettings({ ...settings, recommendExtension: false });
      panel.remove();
    });
    advanced.appendChild(panel);
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
      stopFaviconPulse(panel);
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
    requestAnimationFrame(() => {
      if (!panel.isConnected || dismissedCompatibilityHashes().includes(report.sha256)) return;
      panel.setAttribute("data-open", "true");
      pulseFavicon(panel);
    });
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
      if (panel) {
        panel.remove();
        stopFaviconPulse(panel);
      }
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
    for (const payload of document.querySelectorAll(UPSTREAM_PAYLOAD_SELECTOR)) {
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
      if (!src || executedUpstreamScripts.has(src)) continue;
      if (!source || error) {
        if (nativeFetch) runPatchedScript(src);
        continue;
      }
      executedUpstreamScripts.add(src);
      const patched = patchSoft98Code(source, `service-worker:${src}`);
      safeEval(patched, window);
      document.documentElement.setAttribute("data-soft98-pro-upstream", "worker-patched");
    }
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
      const source = Function.prototype.toString.call(typeof callback === "function" ? callback : callback?.handleEvent);
      return SOFT98_CODE_MARKERS.test(source) || WARNING_TEXT.test(source) || WARNING_TITLE.test(source);
    } catch (_error) {
      return false;
    }
  }

  function installScrollDetectorFirewall() {
    if (window.__soft98ScrollDetectorFirewall) return;
    window.__soft98ScrollDetectorFirewall = true;
    const originalAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function patchedAddEventListener(type, callback, options) {
      if (settings.patchScripts && SCROLL_EVENTS.test(String(type || "")) && callback && isSuspiciousDetector(callback)) {
        stats.scrollDetectorsBlocked += 1;
        log("warn", text("logs.scrollDetectorBlocked"), { type: String(type) });
        return;
      }
      return originalAdd.call(this, type, callback, options);
    };

    for (const target of [window, document]) {
      for (const property of ["onscroll", "onwheel", "onmousewheel", "ontouchmove"]) {
        installScrollPropertyFirewall(target, property);
      }
    }
  }

  function installScrollPropertyFirewall(target, property) {
    try {
      let native;
      for (let node = target; node && !native; node = Object.getPrototypeOf(node)) {
        native = Object.getOwnPropertyDescriptor(node, property);
      }
      if (!native?.get || !native.set) return;
      Object.defineProperty(target, property, {
        configurable: true,
        enumerable: true,
        get() {
          return native.get.call(this);
        },
        set(callback) {
          if (settings.patchScripts && typeof callback === "function" && isSuspiciousDetector(callback)) {
            stats.scrollDetectorsBlocked += 1;
            return native.set.call(this, null);
          }
          return native.set.call(this, callback);
        },
      });
    } catch (error) {
      recordPatchFailure(`scroll-property-${property}`, error, "");
    }
  }

  function installClickRepair() {
    for (const eventName of ["click", "auxclick", "mouseover"]) {
      document.addEventListener(
        eventName,
        (event) => {
          const link = event.target?.closest?.(`a[${DATA_HREF}],${REFERRER_WRAPPER_LINK}`);
          if (!link) return;
          if (settings.pro && link.matches(REFERRER_WRAPPER_LINK)) normalizeReferrerLink(link);
          if (link.hasAttribute(DATA_HREF)) restoreLink(link);
        },
        true
      );
    }
  }

  function showDownloadActivation(event) {
    if (!settings.pro || event.defaultPrevented || event.button !== (event.type === "auxclick" ? 1 : 0)) return;
    const link = event.target?.closest?.("a[data-soft98-pro-download-row]");
    if (!link?.querySelector("[data-soft98-pro-download-check]") || link.closest('[aria-disabled="true"],[inert]')) return;
    clearTimeout(downloadFeedbackTimers.get(link));
    link.setAttribute("data-soft98-pro-download-activated", "");
    downloadFeedbackTimers.set(link, setTimeout(() => {
      link.removeAttribute("data-soft98-pro-download-activated");
      downloadFeedbackTimers.delete(link);
    }, 1600));
  }

  function installObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          if (mutation.attributeName === "style" && gridStyles.has(mutation.target) &&
              gridStyles.get(mutation.target) === mutation.target.getAttribute("style")) continue;
          if (mutation.attributeName === "style") gridStyles.delete(mutation.target);
          if (!isOwnedInterface(mutation.target)) schedule(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          neutralizeScript(node);
          const target = asElement(node) || node.parentElement;
          if (target && !isOwnedInterface(target)) schedule(target);
        }
        if (mutation.removedNodes.length && mutation.target.closest?.("[data-soft98-pro-column=secondary]")) {
          sidebarContentsDirty = true;
          scheduleContentGridUpdate();
        }
        for (const node of mutation.removedNodes) {
          const element = asElement(node);
          if (!element) continue;
          const owned = "[data-soft98-pro-owned=style],#soft98-pro-control";
          if (element.matches(owned) || element.querySelector(owned) || mutation.target.closest?.("#soft98-pro-control")) {
            ensureStyleIntegrity();
            if (!document.querySelector("#soft98-pro-control > form")) onReady(renderControlPanel);
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
    document.documentElement.toggleAttribute("data-soft98-pro-ads-off", !settings.blockAds);
    if (EARLY_ADS_CSS) setPersistentStyle("soft98-pro-early-ads", EARLY_ADS_CSS);
    document.addEventListener("soft98-pro:site-toast", receiveSiteToast);
    document.addEventListener("visibilitychange", updateFavicon);
    window.addEventListener("hashchange", restorePageIdentity);
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
    document.addEventListener("click", showDownloadActivation, true);
    document.addEventListener("auxclick", showDownloadActivation, true);
    setPersistentStyle("soft98-pro-listing-style", LISTING_NAVIGATION_CSS);
    setPersistentStyle("soft98-pro-comments-style", COMMENTS_CSS);
    installSoft98ListingNavigation({
      enabled: () => settings.pro && settings.quickNavigation,
      fetchPage: nativeFetch,
      label: text,
      locale: LOCALE,
      afterRender: (title) => { originalTitle = title; schedule(document); },
    });
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
    configure: (next, options) => writeSettings({ ...settings, ...next }, options),
    openPanel: () => renderControlPanel()?.open(),
    patchSoft98Code,
    unpackDeanEdwards,
    diagnostics: diagnosticReport,
    report: diagnosticReport,
    inspectedRoles,
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
  bindSiteChromeEvents();
  document.addEventListener("scroll", scheduleContentGridUpdate, { passive: true });
  window.addEventListener("resize", () => {
    sidebarContentsDirty = true;
    scheduleContentGridUpdate();
  }, { passive: true });
  document.addEventListener("focusin", scheduleContentGridUpdate);
  window.setTimeout(exposePublicApi, 0);
  window.setTimeout(exposePublicApi, 1000);
})();
