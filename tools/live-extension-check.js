#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ENDPOINT = process.env.SOFT98_CDP_URL || "http://127.0.0.1:9226";
const SCREENSHOT = process.env.SOFT98_LIVE_SCREENSHOT || "";
const LIVE_URL = process.env.SOFT98_LIVE_URL || "https://soft98.ir/internet/remote-control/15737-anydesk-download.html";

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
      else resolve(message.result || {});
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error(`Could not connect to ${url}`)), { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (this.socket.readyState >= WebSocket.CLOSING) return;
    const closed = new Promise((resolve) => this.socket.addEventListener("close", resolve, { once: true }));
    this.socket.close();
    await Promise.race([closed, delay(1000)]);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Page evaluation failed");
  return result.result && result.result.value;
}

async function waitForRuntime(client) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await evaluate(client, "Boolean(window.Soft98Pro && document.querySelector('#soft98-pro-control'))")) return;
    await delay(250);
  }
  throw new Error("Soft98 Pro did not become ready on the live page");
}

async function main() {
  const targets = await fetch(`${ENDPOINT}/json`).then((response) => {
    if (!response.ok) throw new Error(`CDP endpoint returned HTTP ${response.status}`);
    return response.json();
  });
  const target = targets.find((item) => item.type === "page" && /^https:\/\/(?:www\.)?soft98\.ir\//i.test(item.url || "")) ||
    targets.find((item) => item.type === "page");
  if (!target || !target.webSocketDebuggerUrl) throw new Error("No browser page is available at the CDP endpoint");
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    if (!/^https:\/\/(?:www\.)?soft98\.ir\//i.test(target.url || "")) {
      await client.send("Page.navigate", { url: LIVE_URL });
    }
    await waitForRuntime(client);

    const baseline = await evaluate(client, `(() => ({
      title: document.title,
      url: location.href,
      version: window.Soft98Pro.version,
      settings: window.Soft98Pro.settings,
      stats: window.Soft98Pro.stats,
      compatibility: window.Soft98Pro.compatibility,
      theme: document.documentElement.classList.contains("soft98-pro-theme"),
      control: Boolean(document.querySelector("#soft98-pro-control")),
      warnings: document.querySelectorAll("[role=alert]").length,
      visibleIframes: [...document.querySelectorAll("iframe")].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 80 && box.height > 40;
      }).length
    }))()`);

    const menuDiscovery = await evaluate(client, `(() => {
      const toggles = [...document.querySelectorAll('[data-toggle="dropdown"],[aria-haspopup="menu"],[aria-haspopup="true"]')];
      for (const toggle of toggles) {
        const owner = toggle.parentElement;
        if (!owner) continue;
        const candidate = [...owner.querySelectorAll("div,ul,ol,section")].find((node) =>
          node.querySelectorAll("a[href],button,[role=menuitem]").length >= 14
        );
        if (!candidate) continue;
        const before = location.href;
        if (toggle.getAttribute("aria-expanded") !== "true") {
          toggle.addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
          toggle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        }
        return { found: true, links: candidate.querySelectorAll("a[href]").length, tag: toggle.tagName, href: toggle.getAttribute("href"), url: before };
      }
      return { found: false, links: 0 };
    })()`);
    await delay(650);

    const megamenu = await evaluate(client, `(() => {
      const candidate = [...document.querySelectorAll('[data-soft98-pro-surface="megamenu"]')].find((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 300 && box.height > 80;
      });
      if (!candidate) return null;
      const style = getComputedStyle(candidate);
      const box = candidate.getBoundingClientRect();
      return {
        surface: candidate.getAttribute("data-soft98-pro-surface"),
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        color: style.color,
        width: Math.round(box.width),
        height: Math.round(box.height),
        links: candidate.querySelectorAll("a[href]").length,
        columns: candidate.querySelectorAll("[data-soft98-pro-menu-column]").length
      };
    })()`);

    const tabbedCard = await evaluate(client, `(async () => {
      const triggers = [...document.querySelectorAll('[role="tab"],[data-toggle="tab"]')].filter((node) => !node.closest("#soft98-pro-control"));
      const grouped = new Map();
      for (const trigger of triggers) {
        const list = trigger.closest('[role="tablist"],ul,ol,nav') || trigger.parentElement;
        if (!list) continue;
        if (!grouped.has(list)) grouped.set(list, []);
        grouped.get(list).push(trigger);
      }
      const pair = [...grouped.entries()].find((entry) => entry[1].length >= 2);
      if (!pair) return null;
      const [list, tabs] = pair;
      const outgoing = tabs.find((tab) => tab.getAttribute("aria-selected") === "true" || tab.matches(".active") || tab.parentElement?.matches(".active")) || tabs[0];
      const incoming = tabs.find((tab) => tab !== outgoing) || tabs[1];
      const surface = (node) => node && node.getAttribute("data-soft98-pro-surface");
      const color = (node) => node && getComputedStyle(node).backgroundColor;
      const target = (trigger) => {
        const raw = trigger.getAttribute("aria-controls") || trigger.getAttribute("data-target") || trigger.getAttribute("href") || "";
        const hash = raw.includes("#") ? raw.slice(raw.indexOf("#")) : raw ? "#" + raw : "";
        try { return /^#[A-Za-z][\\w:.-]*$/.test(hash) ? document.querySelector(hash) : null; } catch (_error) { return null; }
      };
      const panes = tabs.map(target).filter(Boolean);
      const content = panes[0] && panes.every((pane) => pane.parentElement === panes[0].parentElement) ? panes[0].parentElement : null;
      let card = list.parentElement;
      for (let depth = 0; card && content && !card.contains(content) && depth < 4; depth += 1) card = card.parentElement;
      const before = {
        list: surface(list),
        card: surface(card),
        content: surface(content),
        panes: panes.map(surface),
        outgoing: color(outgoing),
        incoming: color(incoming),
        cardBackground: color(card),
        contentBackground: color(content)
      };
      incoming.addEventListener("click", (event) => {
        if (incoming.tagName === "A" && !String(incoming.getAttribute("href") || "").startsWith("#")) event.preventDefault();
      }, { capture: true, once: true });
      incoming.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      const immediate = { outgoing: color(outgoing), incoming: color(incoming) };
      await new Promise((resolve) => setTimeout(resolve, 260));
      return {
        count: tabs.length,
        labels: [outgoing, incoming].map((node) => String(node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80)),
        before,
        immediate,
        settled: { outgoing: color(outgoing), incoming: color(incoming), card: color(card), content: color(content) }
      };
    })()`);

    const visualAudit = await evaluate(client, `(() => {
      const colorMetrics = (value) => {
        const match = String(value || "").match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.]+))?/i);
        if (!match) return null;
        const channels = match.slice(1, 4).map((part) => Number(part) / 255).map((part) =>
          part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
        );
        return { luminance: 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2], alpha: match[4] === undefined ? 1 : Number(match[4]) };
      };
      const brightSurfaces = [...document.querySelectorAll("body *")].filter((node) => {
        if (node.closest("#soft98-pro-control,#soft98-pro-compatibility,#soft98-extension-recommendation,#soft98-ad-blocker-taunt")) return false;
        const box = node.getBoundingClientRect();
        if (box.width < 120 || box.height < 28 || box.width * box.height < 4200) return false;
        const color = colorMetrics(getComputedStyle(node).backgroundColor);
        return color && color.alpha >= 0.45 && color.luminance >= 0.55;
      }).map((node) => {
        const box = node.getBoundingClientRect();
        return {
          tag: node.tagName,
          surface: node.getAttribute("data-soft98-pro-surface"),
          background: getComputedStyle(node).backgroundColor,
          width: Math.round(box.width),
          height: Math.round(box.height)
        };
      });
      const bodyFont = getComputedStyle(document.body).fontFamily;
      const controlFont = getComputedStyle(document.querySelector("#soft98-pro-control")).fontFamily;
      return { brightSurfaces, bodyFont, controlFont };
    })()`);

    await evaluate(client, "window.Soft98Pro.openPanel(); true");
    await delay(350);
    const controlOpen = await evaluate(client, `(() => {
      const control = document.querySelector("#soft98-pro-control");
      const panel = control.querySelector("form");
      const box = panel.getBoundingClientRect();
      return {
        open: control.getAttribute("data-open"),
        expanded: control.querySelector("[data-role=toggle]").getAttribute("aria-expanded"),
        ariaHidden: panel.getAttribute("aria-hidden"),
        theme: control.getAttribute("data-theme"),
        width: Math.round(box.width),
        height: Math.round(box.height),
        tabs: panel.querySelectorAll('[role="tab"]').length,
        panels: panel.querySelectorAll('[role="tabpanel"]').length,
        sectionSummaries: panel.querySelectorAll(".s98p-panel-intro").length,
        liveBadge: Boolean(panel.querySelector(".s98p-console-kicker i")),
        switches: panel.querySelectorAll('[role="switch"]').length,
        metrics: [...panel.querySelectorAll("[data-metric]")].map((node) => Number(node.textContent || 0))
      };
    })()`);

    if (SCREENSHOT) {
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const destination = path.resolve(SCREENSHOT);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, Buffer.from(capture.data, "base64"));
    }

    const outsideCollapsed = await evaluate(client, `(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      const control = document.querySelector("#soft98-pro-control");
      return control.getAttribute("data-open") === "false" &&
        control.querySelector("form").getAttribute("aria-hidden") === "true" &&
        control.querySelector("[data-role=toggle]").getAttribute("aria-expanded") === "false";
    })()`);

    const report = { baseline, menuDiscovery, megamenu, tabbedCard, visualAudit, controlOpen, outsideCollapsed, screenshot: SCREENSHOT || null };
    if (!baseline.theme || !baseline.control) throw new Error("Pro theme or control is missing from the live page");
    if (!menuDiscovery.found || !megamenu || megamenu.surface !== "megamenu") throw new Error("Live megamenu was not discovered and themed");
    if (megamenu.links < 14 || (!/gradient/i.test(megamenu.backgroundImage || "") && !/^rgba?\((?:[0-3]?\d),\s*(?:[0-3]?\d),\s*(?:[0-3]?\d)/.test(megamenu.backgroundColor || ""))) {
      throw new Error(`Live megamenu did not receive the dark Pro surface: ${JSON.stringify(megamenu)}`);
    }
    if (!tabbedCard || tabbedCard.count < 2 || tabbedCard.before.list !== "tab-list" || tabbedCard.before.content !== "tab-content") {
      throw new Error("Live tabbed card was not discovered and themed");
    }
    const tabColors = [
      tabbedCard.before.outgoing,
      tabbedCard.before.incoming,
      tabbedCard.before.cardBackground,
      tabbedCard.before.contentBackground,
      tabbedCard.immediate.outgoing,
      tabbedCard.immediate.incoming,
      tabbedCard.settled.outgoing,
      tabbedCard.settled.incoming,
      tabbedCard.settled.card,
      tabbedCard.settled.content,
    ];
    if (tabColors.some((color) => /rgba?\(255,\s*255,\s*255(?:,\s*1)?\)/.test(color || ""))) {
      throw new Error("Live tabbed card exposed a white background during its transition");
    }
    if (visualAudit.brightSurfaces.length) throw new Error(`Pro theme left opaque bright surfaces: ${JSON.stringify(visualAudit.brightSurfaces)}`);
    if (visualAudit.bodyFont !== visualAudit.controlFont) throw new Error(`Expert control font does not match the site: ${visualAudit.controlFont} != ${visualAudit.bodyFont}`);
    if (controlOpen.open !== "true" || controlOpen.width < 430 || controlOpen.tabs !== 3 || controlOpen.sectionSummaries !== 3 || !controlOpen.liveBadge || controlOpen.switches < 10) {
      throw new Error("Expert control did not open with its complete distinct UI");
    }
    if (!outsideCollapsed) throw new Error("Outside pointer interaction did not collapse the expert control");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
