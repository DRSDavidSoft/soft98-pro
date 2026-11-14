"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const catalog = require("../src/utility-artwork.json");

const directory = path.join(__dirname, "../src/assets/utility");
const read = (file) => fs.readFileSync(path.join(directory, file), "utf8").replace(/\r\n/g, "\n");
const pathIcons = new Map(catalog.rows.flatMap(({ paths, icon }) => paths.map((route) => [route, icon])));
const iconKeys = new Set([
  "chrome", "desktop", "download", "edge", "firefox", "music", "play", "revo", "shield", "winrar",
  ...Object.keys(catalog.artwork), ...Object.keys(catalog.genericIcons), ...Object.keys(catalog.tokens),
]);

test("all 23 utility rows have distinct, normalized, exact destination keys", () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.rows.length, 23);
  const seen = new Set();
  for (const { paths, icon } of catalog.rows) {
    assert.ok(paths.length && iconKeys.has(icon), icon);
    for (const route of paths) {
      assert.match(route, /^\/(?:tags\/[a-z+]+\/|(?:software|security|internet)\/[a-z0-9/-]+\.html)$/);
      assert.ok(!seen.has(route), route);
      seen.add(route);
    }
  }
  for (const name of Object.values(catalog.genericIcons)) {
    assert.match(name, /^outline\/[a-z0-9-]+$/);
    assert.doesNotThrow(() => require.resolve(`@tabler/icons/${name}.svg`));
  }
});

test("tag destinations stay descriptive and never borrow an individual product icon", () => {
  assert.deepEqual(Object.fromEntries([...pathIcons].filter(([route]) => route.startsWith("/tags/"))), {
    "/tags/download+manager/": "download",
    "/tags/music+player/": "music",
    "/tags/player/": "play",
    "/tags/burn+cd/": "utility-disc",
    "/tags/virtual+drive/": "utility-virtual-drive",
    "/tags/remote/": "utility-remote",
    "/tags/eset/": "shield",
    "/tags/kaspersky/": "shield",
    "/tags/display+driver/": "utility-display-driver",
  });
  for (const route of ["/software/692-openjdk.html", "/software/farsi/285-leomoon-parsinegar-extra.html",
    "/software/pdf/45-foxit-editor.html", "/software/programming/3134-visual-studio.html"]) {
    assert.equal(pathIcons.has(route), false, route);
  }
});

test("licensed images are pinned to their product rows and have bundled notices", () => {
  const records = [
    ["java-duke", "/software/692-sun-java-se-runtime-environment.html", "BSD-3-Clause",
      "b403847fe202cd824b29272c8f33fb562fc8d6055ab9cc3a52fb4672241afb29", /Sun Microsystems Inc\./],
    ["parsinegar", "/software/farsi/285-leomoon-parsinegar.html", "MIT",
      "c3744625256866e7312dee90557d1ea46688cb25ab5e4b883459a15168541dc0", /LeoMoon Studios/],
  ];
  assert.equal(Object.keys(catalog.artwork).length, records.length);
  for (const [icon, route, license, checksum, owner] of records) {
    const entry = catalog.artwork[icon];
    assert.equal(pathIcons.get(route), icon);
    assert.match(entry.source, /^https:\/\/github\.com\/.+\/blob\/[a-f0-9]{40}\/.+/);
    assert.match(entry.permission, /^https:\/\//);
    assert.equal(entry.license, license);
    assert.equal(entry.file, icon + ".svg");
    assert.match(entry.notice, /^[A-Z-]+\.txt$/);
    const svg = read(entry.file);
    assert.match(svg, /<svg\b[^>]*\bviewBox="[^"]+"/);
    assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY|<(?:script|image|foreignObject)\b|\b(?:href|on\w+)\s*=|url\s*\(/i);
    const pinnedBytes = icon === "parsinegar" ? svg.trimEnd() : svg;
    assert.equal(createHash("sha256").update(pinnedBytes).digest("hex"), checksum);
    assert.match(read(entry.notice), owner);
    assert.match(read(entry.notice), /AS IS/i);
  }
});

function luminance(hex) {
  return hex.slice(1).match(/../g).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
}

test("only exact unmatched products receive distinct, legible non-logo tokens", () => {
  const expected = [
    ["foxit-reader-token", "FPR", "/software/pdf/44-foxit-reader.html"],
    ["firewall-control-token", "WFC", "/security/firewall/14349-windows-firewall-control-a.html"],
    ["visual-c-redistributable-token", "VCR", "/software/programming/3134-visual-c-a.html"],
    ["bluelife-hosts-token", "BHE", "/software/1379-bluelife-hosts-editor-1.html"],
    ["net-disabler-token", "ND", "/internet/17819-net-disabler.html"],
  ];
  assert.equal(Object.keys(catalog.tokens).length, expected.length);
  const tints = new Set();
  for (const [icon, initials, route] of expected) {
    const { text, background, foreground } = catalog.tokens[icon];
    assert.equal(pathIcons.get(route), icon);
    assert.equal(catalog.rows.filter((row) => row.icon === icon).length, 1);
    assert.equal(text, initials);
    assert.match(text, /^[A-Z]{2,3}$/);
    assert.match(background, /^#[a-f0-9]{6}$/);
    assert.match(foreground, /^#[a-f0-9]{6}$/);
    assert.ok(!tints.has(background), background);
    tints.add(background);
    assert.ok((luminance(background) + 0.05) / (luminance(foreground) + 0.05) >= 4.5, initials);
  }
});
