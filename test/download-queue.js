"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");
const { once } = require("node:events");
const { setTimeout: sleep } = require("node:timers/promises");
const { test } = require("node:test");
const { create, directUrl, articleFileUrl, relativeFilename, trustedSender, trustedHeaderSender, pageSnapshot, headerSnapshot } = require("../src/download-queue");
const links = require("../src/download-links");
const probe = require("../src/download-probe");
const audio = require("../src/download-audio");
const { downloadSounds } = require("../tools/download-sounds");

const EXTENSION_ID = "soft98-test";
const PREFIX = "https://example.test/";
const DIST = path.resolve(__dirname, "../dist");

test("an article confirmation accepts only checked indices from the original batch", () => {
  const urls = [PREFIX + "one.zip", PREFIX + "two.msi", PREFIX + "three.exe"];
  assert.deepEqual(links.confirmedUrls(urls, [1]), [urls[1]]);
  assert.deepEqual(links.confirmedUrls(urls, [2, 0]), [urls[0], urls[2]]);
  for (const invalid of [[], [1, 1], [0, 3], [-1], [1.2], ["1"], [urls[0]], null]) {
    assert.equal(links.confirmedUrls(urls, invalid), null);
  }
});

test("platform detection is conservative about generic and mixed download headings", () => {
  assert.equal(links.deviceOS({ platform: "Linux x86_64", userAgent: "Linux Android 15" }), "android");
  assert.equal(links.deviceOS({ platform: "MacIntel", maxTouchPoints: 5 }), "ios");
  assert.equal(links.deviceOS({ userAgentData: { platform: "Chrome OS" }, userAgent: "CrOS x86_64" }), "chromeos");
  assert.equal(links.deviceOS({ userAgentData: { platform: "Windows" } }), "windows");
  assert.equal(links.deviceOS({}), "");
  assert.deepEqual(links.headingOS("نسـخه Windows 11 (x64)"), ["windows"]);
  assert.deepEqual(links.headingOS("macOS / لینوکـس"), ["mac", "linux"]);
  assert.deepEqual(links.headingOS("نسخه ویندوز و مکینتاش"), ["windows", "mac"]);
  for (const title of ["Other platforms", "Windows / All others", "راهنمای نصب ویندوز", "دانلود Windows with updates", "سایر پلتفرم‌ها"]) {
    assert.deepEqual(links.headingOS(title), []);
  }
  const platformLinks = ["دانلود نسخه Mac", "دانلود نسخه Linux", "دانلود نسخه iOS", "دانلود نسخه Android"];
  assert.deepEqual(links.groupedPlatformOS("سایر پلتـفرم ها", platformLinks), ["mac", "linux", "ios", "android"]);
  assert.deepEqual(links.groupedPlatformOS("Other platforms", ["Linux", "Windows"]), ["linux", "windows"]);
  assert.deepEqual(links.groupedPlatformOS("سایر پلتفرم‌ها", ["Linux", "Installer"]), []);
  assert.deepEqual(links.groupedPlatformOS("More information", ["Linux"]), []);
});

test("file probes are permission-scoped and preserve exact links without credentials", async () => {
  const url = PREFIX + "file?token=abcd";
  let attempts = 0;
  const inspect = allowed => probe.inspect(url, { links, allowed, fetchFile: async (requested, options) => {
    attempts++;
    assert.equal(requested, url);
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    const response = new Response(null, { headers: { "Content-Type": "application/octet-stream", "Content-Length": "500",
      "Last-Modified": "Wed, 21 Oct 2026 07:28:00 GMT", "Content-Disposition": "attachment; filename*=UTF-8''Notes%20v2.pdf" } });
    Object.defineProperty(response, "url", { value: "https://cdn.example.test/get" });
    return response;
  } });
  assert.deepEqual(await inspect(() => false), { status: "permission", origin: PREFIX + "*" });
  assert.equal(attempts, 0);
  assert.deepEqual(await inspect(origin => origin === PREFIX + "*"), { status: "permission", origin: "https://cdn.example.test/*" });
  assert.deepEqual(await inspect(() => true), { status: "ok", size: 500, date: Date.UTC(2026, 9, 21, 7, 28), mime: "application/octet-stream", type: "PDF" });
});

test("file probes fall back to one byte, cancel bodies, and reject web pages", async () => {
  let canceled = false;
  const inspected = await probe.inspect(PREFIX + "archive", { links, allowed: () => true, fetchFile: async (_url, options) => {
    if (options.method === "HEAD") return new Response(null, { status: 405 });
    assert.equal(options.headers.Range, "bytes=0-0");
    return new Response(new ReadableStream({ cancel() { canceled = true; } }), { status: 206,
      headers: { "Content-Length": "1", "Content-Range": "bytes 0-0/12345", "Content-Type": "application/zip" } });
  } });
  assert.deepEqual(inspected, { status: "ok", size: 12345, date: null, mime: "application/zip", type: "" });
  assert.equal(canceled, true);
  assert.deepEqual(await probe.inspect(PREFIX + "archive.zip", { links, allowed: () => true,
    fetchFile: async () => new Response(null, { headers: { "Content-Type": "text/html", "Content-Length": "14" } }) }), { status: "unavailable" });
});

test("article downloads require review at the file or group limit and for unknown sizes", async () => {
  const files = [PREFIX + "archive.part01.rar", PREFIX + "archive.part02.rar"];
  const check = (sizes, maxMB, urls = files) => probe.planArticleDownloads(urls, maxMB, async url => {
    const size = sizes[files.indexOf(url)];
    return { status: size === undefined ? "permission" : "ok", size };
  }, 100, links);
  assert.equal((await check([49000000, 50000000]))[files[0]].size, 49000000);
  assert.equal(await check([50000000, 50000000]), null);
  assert.equal(await check([60000000, 60000000]), null);
  assert.equal(await check([110000000], undefined, files.slice(0, 1)), null);
  assert.equal(await check([50000000], 40, files.slice(0, 1)), null);
  assert.equal(await check([8000000], 40), null);
  assert.equal(await check([null, 100]), null);
  assert.equal(await probe.planArticleDownloads(files, 100, () => new Promise(() => {}), 5, links), null);
});

test("article download fallback accepts explicit, encoded, and ordered numbered row mappings", () => {
  const direct = { proto: "https", pathname: "/file.zip", domain: "files.example.test" };
  const wrapped = { host: "href.li", a: "/", b: "https://example.test/linux?edition=desktop", c: "https" };
  const records = { link1: direct, link9: wrapped };
  const parse = (value, keys = ["rotating-id-a", "rotating-id-b"]) => links.declaredArticleLinks(JSON.stringify(value), keys);
  assert.deepEqual(parse(records), ["https://files.example.test/file.zip", "https://href.li/?https://example.test/linux?edition=desktop"]);
  assert.deepEqual(parse(records, ["link9", "link1"]), ["https://href.li/?https://example.test/linux?edition=desktop", "https://files.example.test/file.zip"]);
  const key = (name, prefix = "rotated_") => prefix + [...btoa(name)].reverse().join("");
  const mixedRecords = { link1: direct, portable: wrapped };
  assert.deepEqual(parse(mixedRecords, [key("portable"), key("link1")]),
    ["https://href.li/?https://example.test/linux?edition=desktop", "https://files.example.test/file.zip"]);
  assert.equal(parse(mixedRecords, [key("portable"), key("link1", "different_")]), null);
  assert.equal(parse(mixedRecords, [key("portable"), key("unmatched")]), null);
  assert.equal(parse({ link9: wrapped, link1: direct }), null);
  assert.equal(parse({ ...records, link10: wrapped }), null);
  assert.equal(parse(records, ["same-key", "same-key"]), null);
  assert.equal(parse({ link1: { ...direct, domain: "files.example.test@evil.test" }, link9: wrapped }), null);
  assert.equal(parse({ link1: { ...direct, pathname: "//other.test/file.zip" }, link9: wrapped }), null);
  assert.equal(parse({ link1: { ...direct, extra: "unknown" }, link9: wrapped }), null);
});

test("both built extensions package the internal manager without exposing it to web pages", { skip: !fs.existsSync(DIST) }, () => {
  for (const target of ["chromium", "firefox"]) {
    const read = (file) => fs.readFileSync(path.join(DIST, target, file), "utf8");
    const manifest = JSON.parse(read("manifest.json"));
    assert.ok(manifest.permissions.includes("downloads"));
    assert.ok(manifest.permissions.includes("downloads.open"));
    assert.ok(manifest.permissions.includes("notifications"));
    assert.ok((manifest.optional_host_permissions || manifest.optional_permissions).includes("https://*/*"));
    assert.ok(!JSON.stringify(manifest.web_accessible_resources || []).includes("downloads"));
    assert.match(read("popup.html"), /href="downloads\.html"/);
    assert.match(read("popup.html"), /data-compact-popup[\s\S]+src="downloads\.js"/);
    assert.match(read("options.html"), /href="downloads\.html"/);
    assert.match(read("downloads.html"), /src="downloads\.js"/);
    assert.doesNotMatch(read("downloads.html"), /<textarea/i);
    assert.match(read("header-queue.html"), /src="header-queue\.js"/);
    if (target === "chromium") assert.deepEqual(manifest.web_accessible_resources,
      [{ resources: ["header-queue.html"], matches: ["*://*.soft98.ir/*"] }]);
    else assert.ok(manifest.web_accessible_resources.includes("header-queue.html"));
    for (const file of ["downloads.js", "download-links.js", "download-import.js", "download-view.js", "download-select.js", "download-ui-catalog.js", "header-queue.js"])
      new Script(read(file), { filename: file });
    assert.doesNotMatch(read("downloads.js"), /__SOFT98_DOWNLOAD_(MESSAGES|ICONS)__/);
    assert.match(read("assets/background.js"), /soft98:downloads/);
    assert.doesNotMatch(read("assets/bridge.js"), /["']soft98:downloads["']/);
    assert.match(read("assets/bridge.js"), /soft98:download-snapshot/);
    assert.match(read("assets/bridge.js"), /soft98:open-downloads/);
    assert.match(read("assets/bridge.js"), /soft98:download-file/);
    assert.match(read("downloads.js"), /soft98:download-prefill/);
    assert.ok(read("downloads.css"));
    assert.ok(read("downloads-link.css"));
    assert.ok(fs.statSync(path.join(DIST, target, "assets", "vazirmatn-arabic-wght-normal.woff2")).size > 0);
    assert.match(read("VAZIRMATN-LICENSE.txt"), /SIL OPEN FONT LICENSE/i);
  }
});

function fixture(notify, sound) {
  let record;
  let next = 0;
  let browserId = 0;
  let tick = Date.now();
  const items = new Map();
  const starts = [];
  const waits = new Map();
  let writeFailure = false;

  function native(options) {
    const item = { id: ++browserId, url: options.url, filename: options.filename || "download.zip", state: "in_progress", bytesReceived: 0, totalBytes: -1, startTime: new Date(tick).toISOString(), byExtensionId: EXTENSION_ID };
    items.set(item.id, item);
    return item.id;
  }

  const storage = {
    read: async () => structuredClone(record),
    write: async (value) => {
      if (writeFailure) throw new Error("Storage unavailable");
      record = structuredClone(value);
    },
  };
  const downloads = {
    search: async ({ id, url, startedAfter }) => [...items.values()].filter((item) =>
      (id === undefined || item.id === id) && (!url || item.url === url) && (!startedAfter || item.startTime > startedAfter)),
    download: async (options) => {
      starts.push(options);
      if (options.saveAs) await new Promise((resolve) => waits.set(options.url, resolve));
      return native(options);
    },
    pause: async (id) => Object.assign(items.get(id), { state: "interrupted", error: "USER_CANCELED", paused: true, canResume: true }),
    resume: async (id) => Object.assign(items.get(id), { paused: false, canResume: false, state: "in_progress", error: "" }),
    cancel: async (id) => Object.assign(items.get(id), { state: "interrupted", error: "USER_CANCELED" }),
  };
  const restart = () => create({ storage, downloads, notify, sound, extensionId: EXTENSION_ID, now: () => ++tick, makeId: () => `job-${++next}` });
  return { q: restart(), restart, storage, downloads, items, starts, waits, native, blockWrites: (block) => { writeFailure = block; } };
}

const listing = (q) => q.request({ action: "list" });
const action = (q, name, job) => q.request({ action: name, id: job.id });
const add = (q, files, extra) => q.request({ action: "add", urls: files.map((file) => PREFIX + file), ...extra });
const configure = (q, settings) => q.request({ action: "configure", ...settings });

async function eventually(q, predicate) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await listing(q);
    if (predicate(state.jobs)) return state;
    await sleep(5);
  }
  assert.fail(`Queue did not settle: ${JSON.stringify(await listing(q))}`);
}

test("accepts explicit HTTP(S) URLs, preserves signed queries, and rejects unsafe URL and path inputs", () => {
  assert.equal(directUrl(`${PREFIX}file.zip?sig=A%2Fb&time=123#local`), `${PREFIX}file.zip?sig=A%2Fb&time=123`);
  assert.equal(directUrl("http://example.test/file.zip"), "http://example.test/file.zip");
  assert.equal(articleFileUrl("https://example.test/AnyDesk.zip?sig=A%2Fb"), "https://example.test/AnyDesk.zip?sig=A%2Fb");
  for (const url of ["https://example.test/download.html", "http://example.test/file.zip", "https://example.test:8443/file.zip"]) {
    assert.throws(() => articleFileUrl(url), { queueCode: "invalid-url" }, url);
  }
  for (const url of ["//example.test/f.zip", "file:///a.zip", "data:text/plain,a", "blob:https://example.test/1", "javascript:alert(1)", "https:///f.zip", "https://@example.test/", "https://a:b@example.test/", "https://example.test/\\evil", "https://example.test/a\nb"]) {
    assert.throws(() => directUrl(url), { queueCode: "invalid-url" }, url);
  }
  assert.equal(relativeFilename("Tools/Official archive.zip"), "Tools/Official archive.zip");
  for (const path of ["../a", "a/../b", "/a", "C:/a", "a\\b", "a//b", "a/", "a/.env", "a/CON.zip", "a/a.zip."]) {
    assert.throws(() => relativeFilename(path), { queueCode: "invalid-path" }, path);
  }
});

test("import deduplicates and preserves signed URLs; multipart identity keeps mirrors and folders separate", () => {
  const part1 = "https://files.example.test/releases/tool.part01.rar?sig=A%2Fb";
  const part2 = "https://files.example.test/releases/tool.part02.rar?sig=B";
  assert.deepEqual(links.parse(`[Part one](${part1})\n${part2}\n${part1}\nhttps://user:secret@example.test/file`),
    { urls: [part1, part2], ignored: 2 });
  assert.equal(links.describe(part1).group.key, links.describe(part2).group.key);
  assert.equal(links.describe(part2).group.part, 2);
  assert.notEqual(links.describe(part2).group.key, links.describe(part2.replace("/releases/", "/archives/")).group.key);
  assert.equal(articleFileUrl("https://example.test/file.7z.002"), "https://example.test/file.7z.002");
  assert.deepEqual(links.headers(new Headers({ "content-type": "application/zip; charset=utf-8", "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT" })),
    { size: null, date: Date.UTC(2015, 9, 21, 7, 28), mime: "application/zip" });
});

test("queue preserves only valid source links and emits a completion notification once across worker restarts", async () => {
  const notifications = [];
  const { q, items, restart } = fixture((job) => notifications.push(job));
  const source = "https://soft98.ir/software/example.html";
  const invalid = `${PREFIX}external.zip`;
  await add(q, ["notify.zip", "external.zip"], { sources: { [`${PREFIX}notify.zip`]: source, [invalid]: "javascript:alert(1)" } });
  const { jobs } = await eventually(q, (files) => files.every((file) => file.status === "downloading"));
  assert.equal(jobs[0].source, source);
  assert.equal(jobs[1].source, undefined);
  Object.assign(items.get(jobs[0].browserId), { state: "complete", absolute: true });
  await q.request({ action: "list" }, jobs[0].browserId);
  await listing(restart());
  assert.deepEqual(notifications.map(({ id, status }) => [id, status]), [[jobs[0].id, "complete"]]);
  const muted = restart();
  await configure(muted, { notifications: false });
  Object.assign(items.get(jobs[1].browserId), { state: "complete" });
  await muted.request({ action: "list" }, jobs[1].browserId);
  await configure(restart(), { notifications: true });
  assert.equal(notifications.length, 1);
});

test("download cues are opt-in, independent of notifications, and only report real queue changes", async () => {
  const sounds = [];
  const notifications = [];
  const { q, items, restart } = fixture((job) => notifications.push(job), (event) => sounds.push(event));
  assert.deepEqual((await listing(q)).sounds, { enabled: false, volume: 40 });
  await add(q, ["silent.zip"], { defer: true });
  assert.deepEqual(sounds, []);
  await configure(q, { notifications: false, soundEnabled: true, soundVolume: 45, held: true });
  await assert.rejects(configure(q, { soundVolume: 101 }), { queueCode: "not-allowed" });
  const { jobs } = await add(q, ["cue.zip", "completed.zip", "blocked.zip"]);
  await add(q, ["cue.zip"]);
  await action(q, "pause", jobs[1]);
  await action(q, "resume", jobs[1]);
  await action(q, "cancel", jobs[1]);
  await configure(q, { held: false });
  const active = (await eventually(q, (files) => files.filter((job) => job.status === "downloading").length === 2)).jobs;
  Object.assign(items.get(active[2].browserId), { state: "complete" });
  await listing(q);
  Object.assign(items.get(active[3].browserId), { state: "interrupted", error: "NETWORK_FAILED" });
  await listing(q);
  let restored = restart();
  assert.deepEqual((await listing(restored)).sounds, { enabled: true, volume: 45 });
  assert.deepEqual(sounds.filter(({ cue }) => cue === "started"), [{ cue: "started", volume: 45 }, { cue: "started", volume: 45 }]);
  assert.deepEqual(sounds.filter(({ cue }) => cue !== "started"), ["queued", "paused", "resumed", "canceled", "complete", "attention"]
    .map(cue => ({ cue, volume: 45 })));
  assert.deepEqual(notifications, []);
  assert.deepEqual((await configure(restored, { soundVolume: 0 })).sounds, { enabled: true, volume: 0 });
  await add(restored, ["other.zip"], { defer: true });
  assert.deepEqual(sounds.at(-1), { mute: true });
  assert.equal(sounds.length, 9);
});

test("the seven packaged sounds are short, distinct, unclipped PCM cues with silence at both edges", () => {
  const generated = downloadSounds();
  assert.deepEqual(generated.map(([file]) => file), audio.cues.map((cue) => cue + ".wav"));
  assert.equal(new Set(generated.map(([, buffer]) => buffer.toString("base64"))).size, generated.length);
  for (const [file, buffer] of generated) {
    assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
    assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
    assert.equal(buffer.readUInt16LE(22), 1);
    const rate = buffer.readUInt32LE(24);
    const length = buffer.readUInt32LE(40) / 2;
    assert.ok(length / rate > 0.12 && length / rate < 0.5);
    const samples = Array.from({ length }, (_, i) => buffer.readInt16LE(44 + i * 2));
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 0);
    const peak = Math.max(...samples.map(Math.abs));
    assert.ok(peak > 5000 && peak < 21000, file);
    for (const browser of ["chromium", "firefox"])
      assert.deepEqual(fs.readFileSync(path.join(DIST, browser, "assets", "download-sounds", file)), buffer);
  }
});

test("the audio player prioritizes outcomes, never overlaps cues, and mutes pending playback", async () => {
  const playback = [];
  let player;
  class MockAudio {
    paused = true;
    ended = false;
    listeners = {};
    constructor() { player = this; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    pause() { this.paused = true; }
    async play() {
      assert.equal(this.paused, true);
      this.paused = false;
      this.ended = false;
      playback.push([this.src.split("/").at(-1), this.volume]);
    }
    finish() { this.ended = true; this.listeners.ended(); }
  }
  const originalAudio = global.Audio;
  global.Audio = MockAudio;
  try {
    const dispatch = audio.createPlayer((path) => path);
    for (const cue of ["queued", "started", "complete", "complete", "started"]) dispatch({ cue, volume: 40 });
    await sleep(170);
    assert.deepEqual(playback, [["complete.wav", 0.4]]);
    dispatch({ cue: "complete", volume: 40 });
    dispatch({ cue: "attention", volume: 40 });
    assert.equal(playback.length, 1);
    player.finish();
    await sleep(170);
    assert.deepEqual(playback[1], ["attention.wav", 0.4]);
    dispatch({ cue: "started", volume: 20 });
    dispatch({ mute: true });
    assert.equal(player.paused, true);
    assert.equal(await dispatch({ cue: "paused", volume: 25, preview: true }), true);
    player.finish();
    await sleep(170);
    assert.deepEqual(playback, [["complete.wav", 0.4], ["attention.wav", 0.4], ["paused.wav", 0.25]]);
  } finally { global.Audio = originalAudio; }
});

test("only accepts the extension's own top-level non-private manager page", () => {
  const url = "moz-extension://test/downloads.html";
  const sender = { id: EXTENSION_ID, url, frameId: 0 };
  assert.equal(trustedSender(sender, EXTENSION_ID, url), true);
  for (const fragment of ["#queue", "#settings", "#guide", "#import", "#job=105a3131-7143-4f92-8f36-a9b5103d4254"]) {
    assert.equal(trustedSender({ ...sender, url: url + fragment }, EXTENSION_ID, url), true);
  }
  for (const change of [{ id: "other" }, { url: "https://soft98.ir/#settings" }, { url: url + "?url=external#settings" },
    { url: url + "#unexpected" }, { frameId: 1 }, { tab: { incognito: true } }]) {
    assert.equal(trustedSender({ ...sender, ...change }, EXTENSION_ID, url), false);
  }
});

test("only the embedded extension queue on a Soft98 tab can read the read-only summary", () => {
  const url = "moz-extension://test/header-queue.html";
  const sender = { id: EXTENSION_ID, url, frameId: 3, tab: { id: 1, url: "https://soft98.ir/tools/story.html" } };
  assert.equal(trustedHeaderSender(sender, EXTENSION_ID, url), true);
  for (const changes of [{ id: "other" }, { frameId: 0 }, { url: "https://soft98.ir" }, { url: url + "#settings" },
    { incognito: true }, { tab: { ...sender.tab, incognito: true } }, { tab: { ...sender.tab, url: "https://soft98.ir.example.net/" } },
    { tab: { ...sender.tab, url: "https://example.net/" } }, { tab: { ...sender.tab, url: "file:///tmp/soft98.ir" } }]) {
    assert.equal(trustedHeaderSender({ ...sender, ...changes }, EXTENSION_ID, url), false);
  }
  const snapshot = headerSnapshot({ held: true, jobs: [
    { id: "complete", url: PREFIX + "past.pdf", status: "complete", total: 5, bytes: 5 },
    { id: "waiting", url: PREFIX + "example.rar", filename: "PrivateFolder/مرحله.rar", status: "paused", manualStart: true, metadata: { size: 120 } },
    { id: "running", url: PREFIX + "current.zip?private=token", status: "downloading", total: -1, bytes: 15, browserId: 80, source: "https://soft98.ir/private.html" },
  ] });
  assert.deepEqual(snapshot.counts, { active: 1, waiting: 1, finished: 1 });
  assert.equal(snapshot.held, true);
  assert.deepEqual(snapshot.items.map(({ id, name, status, bytes, total }) => [id, name, status, bytes, total]), [
    ["running", "current.zip", "downloading", 15, null], ["waiting", "مرحله.rar", "manual", null, 120], ["complete", "past.pdf", "complete", 5, 5],
  ]);
  assert.doesNotMatch(JSON.stringify(snapshot), /PrivateFolder|example\.test|private\.html|browserId|private=token/);
});

test("the page snapshot returns article-scoped transfer details and only aggregate data elsewhere", () => {
  const page = "https://soft98.ir/tools/story.html";
  const url = PREFIX + "article.zip?sig=example";
  const other = PREFIX + "other.zip";
  const foreign = PREFIX + "unrelated.zip";
  const snapshot = pageSnapshot({ held: true, jobs: [
    { url, status: "downloading", source: page.replace(".html", "-a.html?x=1"), bytes: 42, total: 100,
      estimatedEndAt: 6000, browserId: 123, filename: "PrivateFolder/article.zip" },
    { url: other, status: "downloading", source: page.replace("story", "other-page"), bytes: 8, total: null },
    { url: foreign, status: "review" },
  ] }, page, 1000);
  assert.deepEqual(snapshot, {
    counts: { active: 2, waiting: 0, finished: 1, attention: 1 }, transfer: { bytes: 50, total: null }, held: true,
    files: [{ url, status: "downloading", bytes: 42, total: 100, eta: 5 }],
  });
  assert.ok(!JSON.stringify(snapshot).includes("PrivateFolder"));
  assert.equal(pageSnapshot({ held: true, jobs: [{ url, status: "paused", manualStart: true }] }, page).held, false);
  assert.equal(pageSnapshot({ held: true, jobs: [{ url, status: "queued" }] }, page).held, true);
});

test("limits transfers, frees a slot on pause, and resumes in the next available slot", async () => {
  const { q, starts, items } = fixture();
  await configure(q, { limit: 2 });
  const { added, duplicates } = await add(q, ["a.zip", "b.zip", "c.zip", "b.zip"]);
  assert.deepEqual({ added, duplicates }, { added: 3, duplicates: 1 });
  let { jobs } = await eventually(q, (all) => all.filter((job) => job.status === "downloading").length === 2);
  assert.deepEqual(jobs.map((job) => job.status), ["downloading", "downloading", "queued"]);
  assert.equal(starts.length, 2);
  await action(q, "pause", jobs[0]);
  ({ jobs } = await eventually(q, (all) => all[2].status === "downloading"));
  assert.equal(jobs[0].status, "paused");
  ({ jobs } = await action(q, "resume", jobs[0]));
  assert.equal(jobs[0].status, "resume-queued");
  Object.assign(items.get(jobs[1].browserId), { state: "complete", totalBytes: 95, bytesReceived: 95 });
  await q.request({ action: "list" }, jobs[1].browserId);
  ({ jobs } = await eventually(q, (all) => all[0].status === "downloading"));
  assert.equal(jobs[1].bytes, 95);
  assert.equal(starts.length, 3);
});

test("the queue and its limit survive background reload; unrelated native items are ignored", async () => {
  const { q, restart, starts, items, native } = fixture();
  await configure(q, { limit: 1, held: true });
  await add(q, ["first.zip", "second.zip"]);
  const restored = restart();
  assert.deepEqual((await listing(restored)).jobs.map((job) => job.status), ["queued", "queued"]);
  assert.equal((await listing(restored)).held, true);
  const unrelated = native({ url: PREFIX + "other.zip" });
  assert.equal(await restored.request({ action: "list" }, unrelated), undefined);
  await configure(restored, { held: false });
  const { jobs, limit } = await eventually(restored, (all) => all[0].status === "downloading");
  assert.equal(limit, 1);
  const again = restart();
  assert.equal((await listing(again)).jobs[0].browserId, jobs[0].browserId);
  Object.assign(items.get(jobs[0].browserId), { state: "complete" });
  await again.request({ action: "list" }, jobs[0].browserId);
  await eventually(again, (all) => all[1].status === "downloading");
  assert.equal(starts.length, 2);
});

test("article downloads can wait for an explicit start without losing their place or duplicating a job", async () => {
  const { q, restart, starts } = fixture();
  const [parked] = (await add(q, ["article.zip?token=A%2Fb"], { defer: true })).jobs;
  assert.equal(parked.status, "paused");
  assert.equal(parked.manualStart, true);
  assert.equal(starts.length, 0);
  const restored = restart();
  await configure(restored, { held: true });
  assert.equal((await listing(restored)).jobs[0].manualStart, true);
  const scheduled = await add(restored, ["article.zip?token=A%2Fb"], { startExisting: true });
  assert.equal(scheduled.scheduled, 1);
  assert.equal(scheduled.jobs[0].id, parked.id);
  assert.equal(scheduled.jobs[0].status, "queued");
  assert.equal(scheduled.jobs[0].manualStart, undefined);
  assert.equal(starts.length, 0);
  await configure(restored, { held: false });
  await eventually(restored, ([job]) => job.status === "downloading");
  assert.deepEqual(starts.map(({ url }) => url), [parked.url]);
  assert.equal((await add(restored, ["article.zip?token=A%2Fb"], { startExisting: true })).duplicates, 1);
  const parkedOther = (await add(restored, ["second.zip"], { defer: true })).jobs[1];
  const startedFromManager = await action(restored, "resume", parkedOther);
  assert.equal(startedFromManager.jobs[1].manualStart, undefined);
  await eventually(restored, (jobs) => jobs[1].status === "downloading");
});

test("save prompts reserve a slot without blocking other actions or rewriting native request options", async () => {
  const { q, starts, waits } = fixture();
  await configure(q, { limit: 2 });
  await add(q, ["save.zip?token=123"], { filename: "Tools/file.zip", saveAs: true });
  await add(q, ["another.zip"]);
  let { jobs } = await eventually(q, (all) => all[1].status === "downloading");
  assert.equal(jobs[0].status, "starting");
  assert.deepEqual(starts[0], { url: PREFIX + "save.zip?token=123", conflictAction: "uniquify", filename: "Tools/file.zip", saveAs: true });
  assert.deepEqual(starts[1], { url: PREFIX + "another.zip", conflictAction: "uniquify" });
  waits.get(starts[0].url)();
  ({ jobs } = await eventually(q, (all) => all[0].status === "downloading"));
  assert.equal(jobs[0].name, "file.zip");
});

test("interrupted downloads use native resume; HTML responses are flagged without retrying", async () => {
  const { q, starts, items } = fixture();
  await add(q, ["a.zip", "challenge.zip"]);
  let { jobs } = await eventually(q, (all) => all.every((job) => job.status === "downloading"));
  Object.assign(items.get(jobs[0].browserId), { state: "interrupted", canResume: true, error: "NETWORK_FAILED" });
  Object.assign(items.get(jobs[1].browserId), { state: "complete", mime: "text/html; charset=UTF-8" });
  ({ jobs } = await listing(q));
  assert.equal(jobs[0].status, "interrupted");
  assert.equal(jobs[1].error, "html-response");
  await assert.rejects(action(q, "retry", jobs[1]), { queueCode: "not-allowed" });
  await action(q, "resume", jobs[0]);
  ({ jobs } = await eventually(q, (all) => all[0].status === "downloading"));
  assert.equal(jobs[0].status, "downloading");
  assert.equal(starts.length, 2);
  ({ jobs } = await action(q, "cancel", jobs[0]));
  assert.equal(jobs[0].status, "canceled");
  assert.equal((await q.request({ action: "clear" })).jobs.length, 0);
});

test("uncertain starts are never automatically duplicated after restart", async () => {
  const { q, restart, starts, waits } = fixture();
  await add(q, ["unconfirmed.zip"], { saveAs: true });
  const { jobs } = await listing(restart());
  assert.equal(jobs[0].status, "review");
  assert.equal(jobs[0].error, "unknown-start");
  assert.equal(starts.length, 1);
  waits.get(starts[0].url)();
});

test("validation is atomic; never launches a job whose intent could not be persisted", async () => {
  const { q, starts, blockWrites } = fixture();
  await assert.rejects(q.request({ action: "add", urls: [PREFIX + "a.zip", "file:///unsafe"] }), { queueCode: "invalid-url" });
  await assert.rejects(add(q, ["a.zip", "b.zip"], { filename: "Tools/test.zip" }), { queueCode: "invalid-path" });
  assert.equal((await listing(q)).jobs.length, 0);
  blockWrites(true);
  await assert.rejects(add(q, ["a.zip"]), /Storage unavailable/);
  assert.equal(starts.length, 0);
  blockWrites(false);
  assert.equal((await listing(q)).jobs.length, 0);
});

async function startChromeDriver() {
  const child = spawn(process.env.SOFT98_QUEUE_CHROMEDRIVER, ["--port=0"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(child, "close").catch(() => {});
  const stop = async () => { child.kill(); await exited; };
  try {
    const driver = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("ChromeDriver did not start: " + output)), 10000);
      function append(chunk) {
        output = (output + chunk).slice(-4096);
        const port = /started successfully on port (\d+)\./i.exec(output)?.[1];
        if (!port) return;
        clearTimeout(timer);
        resolve(new URL(`http://127.0.0.1:${port}/`));
      }
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => { clearTimeout(timer); reject(new Error(`ChromeDriver exited (${code}): ${output}`)); });
    });
    return { driver, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

for (const browser of ["Firefox", "Chromium"]) {
  const chromium = browser === "Chromium";
  const enabled = chromium ? process.env.SOFT98_QUEUE_CHROMEDRIVER : process.env.SOFT98_QUEUE_WEBDRIVER;
  test(`packaged ${browser} queue uses native parallel downloads, pause, resume, and relative paths`,
    { skip: !enabled, timeout: 120000 }, () => verifyNativeQueue(browser, chromium));
}

async function verifyNativeQueue(browser, chromium) {
  const http = require("node:http");
  const os = require("node:os");
  const fs = require("node:fs/promises");
  const temp = await fs.realpath(os.tmpdir());
  const dir = await fs.mkdtemp(path.join(temp, "soft98-queue-test-"));
  const uuid = "af9b3c6c-35c1-47d1-977d-f4d6d78dea93";
  const requests = [];
  const bytes = Buffer.alloc(1 * 1024 * 1024, 0x47);
  let peekLimit = 128 * 1024;
  const server = http.createServer((req, res) => {
    if (req.url === "/header-fixture") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end('<!doctype html><html lang="en"><meta charset="utf-8">' +
        '<header><nav><ul><li><button type="button" data-toggle="search">Search</button></li></ul></nav></header><main><h1>Header queue fixture</h1></main></html>');
      return;
    }
    if (req.url === "/confirm.html") {
      res.writeHead(200, { "Content-Type": "text/html", "Content-Disposition": 'attachment; filename="confirmation.html"' });
      res.end("<!doctype html><title>Verification required</title>");
      return;
    }
    const match = /^\/(one|two|three|peek)\.bin$/.exec(req.url);
    if (!match) { res.writeHead(404).end(); return; }
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": bytes.length }).end();
      return;
    }
    const offset = Number(/^bytes=(\d+)-$/.exec(req.headers.range || "")?.[1] || 0);
    requests.push({ name: match[1], offset });
    res.writeHead(offset ? 206 : 200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${match[1]}.bin"`,
      "Content-Length": bytes.length - offset,
      "Accept-Ranges": "bytes",
      ETag: '"fixture-v1"',
      ...(offset ? { "Content-Range": `bytes ${offset}-${bytes.length - 1}/${bytes.length}` } : {}),
    });
    res.flushHeaders();
    let index = offset;
    const timer = setInterval(() => {
      if (match[1] === "peek" && index >= peekLimit) return;
      res.write(bytes.subarray(index, index + 16384));
      index += 16384;
      if (index >= bytes.length) res.end();
    }, 75);
    res.on("close", () => clearInterval(timer));
  });
  let driver, stopDriver;
  async function webdriver(method, endpoint, payload) {
    const response = await fetch(new URL(endpoint, driver), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), redirect: "error",
      signal: AbortSignal.timeout(endpoint === "/session" ? 35000 : 15000) });
    const { value } = await response.json();
    assert.equal(response.ok, true, `${endpoint}: ${value?.message}`);
    return value;
  }
  let session;
  try {
    if (chromium) ({ driver, stop: stopDriver } = await startChromeDriver());
    else driver = new URL(process.env.SOFT98_QUEUE_WEBDRIVER);
    assert.equal(driver.protocol, "http:");
    assert.equal(driver.hostname, "127.0.0.1");
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const alwaysMatch = chromium ? {
      browserName: "chrome",
      "goog:chromeOptions": {
        binary: process.env.SOFT98_QUEUE_CHROME || process.env.CHROME_PATH,
        args: ["--headless", "--no-sandbox", "--no-proxy-server", "--window-size=1100,800",
          "--host-resolver-rules=MAP queue.soft98.ir 127.0.0.1",
          `--load-extension=${path.join(DIST, "chromium")}`],
        prefs: { "download.default_directory": dir, "download.prompt_for_download": false, "extensions.ui.developer_mode": true },
        enableExtensionTargets: true,
      },
    } : {
      browserName: "firefox",
      "moz:firefoxOptions": { args: ["-headless"], prefs: {
        "network.proxy.type": 0,
        "network.dns.localDomains": "queue.soft98.ir",
        "network.stricttransportsecurity.preloadlist": false,
        "browser.download.folderList": 2,
        "browser.download.dir": dir,
        "browser.download.useDownloadDir": true,
        "extensions.webextensions.uuids": JSON.stringify({ "soft98-pro@drsdavidsoft.github.io": uuid }),
      } },
    };
    const { sessionId, capabilities } = await webdriver("POST", "/session", { capabilities: { alwaysMatch } });
    session = `/session/${sessionId}`;
    const post = (route, body) => webdriver("POST", session + route, body);
    const evaluate = (script, ...args) => post("/execute/sync", { script, args });
    const inspect = () => evaluate(`return [...document.querySelectorAll('.job')].map(row => ({ status: row.dataset.state, bytes: row.querySelector('progress').value, name: row.querySelector('strong').textContent }));`);
    async function until(condition, label) {
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        if (await condition()) return;
        await sleep(200);
      }
      assert.fail(`${label}: ${JSON.stringify(await inspect())}`);
    }
    let managerOrigin;
    if (chromium) {
      await until(async () => {
        const { targetInfos } = await post("/goog/cdp/execute", { cmd: "Target.getTargets", params: {} });
        managerOrigin = targetInfos.map(({ url }) => /^chrome-extension:\/\/[a-p]{32}(?=\/assets\/background\.js$)/.exec(url)?.[0]).find(Boolean);
        return managerOrigin;
      }, "unpacked Chromium extension registered");
      await post("/url", { url: managerOrigin + "/downloads.html#settings" });
    } else {
      await post("/moz/addon/install", { path: path.join(DIST, "packages", `soft98-pro-firefox-${require("../package.json").version}.zip`), temporary: true });
      managerOrigin = `moz-extension://${uuid}`;
      const browserUrl = managerOrigin + "/downloads.html#settings";
      await post("/moz/context", { context: "chrome" });
      await evaluate("gBrowser.loadURI(Services.io.newURI(arguments[0]), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });", browserUrl);
      await post("/moz/context", { context: "content" });
    }
    await until(() => evaluate("return document.getElementById('limit')?.disabled === false"), "manager ready");
    assert.equal(await evaluate("return document.getElementById('download-sounds').checked"), false);
    assert.equal(await evaluate("return document.getElementById('sound-cue').options.length"), audio.cues.length);
    await evaluate(`document.getElementById("preview-sound").click()`);
    await until(() => evaluate(`return ["Preview played", "صدای نمونه پخش شد."].includes(document.getElementById("feedback").value)`), "packaged sound preview plays through the background");
    await evaluate(`const volume = document.getElementById("sound-volume"); volume.value = "25";
      volume.dispatchEvent(new Event("input")); volume.dispatchEvent(new Event("change"));`);
    await until(() => evaluate(`return (typeof browser !== "undefined" ? browser : chrome).storage.local.get("soft98DownloadQueue")
      .then(({ soft98DownloadQueue }) => soft98DownloadQueue?.soundVolume === 25)`), "preview volume persists");
    await evaluate(`document.getElementById("download-sounds").click()`);
    await until(() => evaluate(`return (typeof browser !== "undefined" ? browser : chrome).storage.local.get("soft98DownloadQueue")
      .then(({ soft98DownloadQueue }) => soft98DownloadQueue?.soundEnabled === true)`), "automatic sounds enabled");
    await evaluate("const limit = document.getElementById('limit'); limit.value = '2'; limit.dispatchEvent(new Event('change')); ");
    await until(() => evaluate(`return (typeof browser !== "undefined" ? browser : chrome).storage.local.get("soft98DownloadQueue")
      .then(({ soft98DownloadQueue }) => soft98DownloadQueue?.limit === 2)`), "configure works on the settings route");
    await evaluate(`document.getElementById("native-notifications").click()`);
    const automaticAlertsOff = () => evaluate(`return (typeof browser !== "undefined" ? browser : chrome).storage.local.get("soft98DownloadQueue")
      .then(({ soft98DownloadQueue }) => soft98DownloadQueue?.notifications === false)`);
    await until(automaticAlertsOff, "automatic alerts disabled");
    await evaluate(`document.getElementById("test-notification").click()`);
    await until(() => evaluate(`return (typeof browser !== "undefined" ? browser : chrome).notifications.getAll()
      .then(active => Object.hasOwn(active, "soft98-download-test"))`), "native test notification registered while automatic alerts are off");
    assert.equal(await automaticAlertsOff(), true);
    assert.equal((await inspect()).length, 0, "test alerts must not create a download job");
    await evaluate(`return (typeof browser !== "undefined" ? browser : chrome).notifications.clear("soft98-download-test")`);
    await evaluate(`document.getElementById("native-notifications").click()`);
    await until(async () => !await automaticAlertsOff(), "automatic alerts re-enabled");
    await evaluate(`document.getElementById("queue-tab").click()`);
    const submit = (urls, filename = "") => evaluate(`
      if (!document.getElementById("import").open) document.getElementById("open-import").click();
      for (const url of arguments[0].split("\\n")) {
        document.getElementById("import-url").value = url;
        document.getElementById("add-url").click();
      }
      document.getElementById("filename").value = arguments[1];
      document.getElementById("composer").requestSubmit();
    `, urls, filename);
    await submit(`${base}/one.bin`, "Tools/one.bin");
    await until(async () => (await inspect())[0]?.status === "downloading", "first download started");
    await submit(`${base}/two.bin\n${base}/three.bin`);
    await until(async () => (await inspect()).map((item) => item.status).join() === "downloading,downloading,queued", "two active transfers and one queued");
    await until(async () => (await inspect())[0]?.bytes > 0, "byte progress");
    assert.equal(requests.some(({ name }) => name === "three"), false);
    await evaluate("document.querySelector('.job [data-action=pause]').click()");
    await until(async () => (await inspect()).map((item) => item.status).join() === "paused,downloading,downloading", "pause opens a slot for the third download");
    await post("/refresh", {});
    await until(async () => (await inspect())[0]?.status === "paused", "paused queue survives reload");
    await evaluate("document.querySelector('.job [data-action=resume]').click()");
    await until(async () => (await inspect()).length === 3 && (await inspect()).every((item) => item.status === "complete"), "resume finishes every file");
    const first = requests.filter(({ name }) => name === "one");
    assert.equal(first.filter(({ offset }) => offset === 0).length, 1, "resume must not restart the file");
    assert.ok(chromium || first.some(({ offset }) => offset > 0), "Firefox must resume with a Range request");
    assert.deepEqual(await fs.readFile(path.join(dir, "Tools", "one.bin")), bytes);
    assert.deepEqual(await fs.readFile(path.join(dir, "two.bin")), bytes);
    assert.deepEqual(await fs.readFile(path.join(dir, "three.bin")), bytes);
    await submit(`${base}/confirm.html`);
    await until(async () => (await inspect()).at(-1)?.status === "review", "HTML verification is not retried");
    assert.equal(await evaluate("return document.querySelector('.job:last-child [data-action=retry]').hidden"), true);
    await post("/window/rect", { width: 490, height: 700 });
    assert.equal(await evaluate("return innerWidth <= 600 && document.documentElement.scrollWidth <= innerWidth"), true);
    await post("/url", { url: managerOrigin + "/popup.html" });
    await until(async () => (await inspect()).filter(item => item.status === "complete").length === 3, "the popup reads the same native queue");
    assert.equal(await evaluate(`return document.documentElement.hasAttribute("data-compact-popup") &&
      document.querySelector("#expand-manager").getClientRects().length === 1 &&
      document.querySelector(".masthead button#open-guide").getClientRects().length === 1 &&
      document.documentElement.scrollWidth <= innerWidth`), true);
    assert.equal(await evaluate(`
      const height = document.body.clientHeight;
      document.getElementById("settings-tab").click();
      document.getElementById("limit-trigger").click();
      return document.body.clientHeight === height && document.getElementById("limit").hidden &&
        document.getElementById("download-sounds").checked && document.getElementById("sound-volume").value === "25" &&
        document.getElementById("limit-choices").matches(":popover-open")
    `), true);
    await evaluate(`document.querySelector("#limit-choices [role=option]").click()`);
    await until(() => evaluate(`return (typeof browser !== "undefined" ? browser : chrome).storage.local.get("soft98DownloadQueue")
      .then(({ soft98DownloadQueue }) => soft98DownloadQueue?.limit === 1)`), "custom popup selection persists");
    await evaluate(`return (typeof browser !== "undefined" ? browser : chrome).runtime.sendMessage({
      type: "soft98:downloads", action: "add", urls: [arguments[0]] })`, base + "/peek.bin");
    await post("/url", { url: base.replace("127.0.0.1", "queue.soft98.ir") + "/header-fixture" });
    const launcher = 'document.querySelector(\'[data-soft98-pro-download-manager="header"]\')';
    const panel = 'document.getElementById("soft98-pro-header-queue")';
    const handles = () => webdriver("GET", session + "/window/handles");
    const originalHandle = await webdriver("GET", session + "/window");
    const originalTabs = await handles();
    await until(() => evaluate(`return !!${launcher}`), "packaged extension adds the sticky header control");
    await evaluate(`${launcher}.click()`);
    assert.equal(await evaluate(`return ${launcher}.getAttribute("aria-expanded")`), "true");
    assert.deepEqual(await handles(), originalTabs, "ordinary click stays on the current page");
    const frame = await evaluate(`return ${panel}.querySelector("iframe")`);
    const bounds = await evaluate(`const r = ${panel}.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;`);
    assert.equal(bounds, true);
    assert.equal(await evaluate(`return ${panel}.querySelector("iframe").contentDocument === null`), true, "page scripts cannot read private queue data");
    await post("/frame", { id: frame });
    await until(() => evaluate('return document.querySelector("#items li:first-child .row-name")?.textContent === "peek.bin"'), "dropdown shows the in-flight job from the full manager");
    const percent = () => evaluate('return document.querySelector("#items li:first-child progress").value');
    await until(async () => await percent() > 0 && await percent() < 1, "in-flight progress in the dropdown");
    const initial = await percent();
    peekLimit = 512 * 1024;
    await until(async () => await percent() > initial && await percent() < 1, "progress refreshes in the same dropdown without a page reload");
    assert.equal(await evaluate('return document.querySelector("#items li").dataset.state'), "downloading");
    assert.match(await evaluate('return document.querySelector("#items li .row").href'), /downloads\.html#job=[a-f0-9-]{36}$/);
    peekLimit = bytes.length;
    await until(() => evaluate('return [...document.querySelectorAll("#items li")].some(row => row.dataset.state === "complete" && row.querySelector(".row-name").textContent === "peek.bin")'), "completion is reflected in the dropdown");
    const matchJob = '#items li:first-child .row';
    const jobUrl = await evaluate('return document.querySelector(arguments[0]).href', matchJob);
    const jobLink = await evaluate('return document.querySelector(arguments[0])', matchJob);
    await post(`/element/${jobLink["element-6066-11e4-a52e-4f735466cecf"]}/click`, {});
    let jobTab;
    await until(async () => (jobTab = (await handles()).find(handle => !originalTabs.includes(handle))), "a dropdown row opens its manager item");
    await post("/window", { handle: jobTab });
    await until(() => evaluate('return location.href === arguments[0]', jobUrl), "item deep link uses the existing manager job route");
    await webdriver("DELETE", session + "/window");
    await post("/window", { handle: originalHandle });
    await post("/frame", { id: await evaluate(`return ${panel}.querySelector("iframe")`) });
    await evaluate('document.getElementById("close-queue").click()');
    await post("/frame/parent", {});
    await until(() => evaluate(`return ${panel}.hidden && !${panel}.querySelector("iframe") && document.activeElement === ${launcher}`), "closing the frame restores focus and stops its polling");
    await evaluate(`${launcher}.click(); document.querySelector("main").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));`);
    assert.equal(await evaluate(`return ${panel}.hidden`), true, "clicking outside dismisses the dropdown");
    await evaluate(`${launcher}.click()`);
    await post("/actions", { actions: [{ type: "key", id: "keyboard", actions: [
      { type: "keyDown", value: "\uE00C" }, { type: "keyUp", value: "\uE00C" },
    ] }] });
    await until(() => evaluate(`return ${panel}.hidden && document.activeElement === ${launcher}`), "Escape dismisses the dropdown");

    for (const button of [0, 1]) {
      const origin = await evaluate(`return ${launcher}`);
      const actions = [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [
        { type: "pointerMove", duration: 0, origin, x: 0, y: 0 }, { type: "pointerDown", button }, { type: "pointerUp", button }, { type: "pause", duration: 0 },
      ] }];
      if (button === 0) actions.push({ type: "key", id: "keyboard", actions: [
        { type: "keyDown", value: "\uE009" }, { type: "pause", duration: 0 }, { type: "pause", duration: 0 }, { type: "keyUp", value: "\uE009" },
      ] });
      await post("/actions", { actions });
      let opened;
      await until(async () => (opened = (await handles()).find(handle => !originalTabs.includes(handle))),
        button === 0 ? "Ctrl-click opens the full manager" : "middle click opens the full manager");
      await post("/window", { handle: opened });
      await until(() => evaluate(`return location.href === arguments[0]`, managerOrigin + "/downloads.html"), "shortcut opens the manager route");
      await webdriver("DELETE", session + "/window");
      await post("/window", { handle: originalHandle });
      assert.equal(await evaluate(`return ${panel}.hidden`), true);
    }
    console.log(`${browser} ${capabilities.browserVersion}: native queue, narrow layout, private header dropdown, progress, and both click shortcuts verified`);
  } finally {
    if (session) await webdriver("DELETE", session).catch(() => {});
    await stopDriver?.();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(temp));
    await fs.rm(dir, { recursive: true, force: true });
  }
}
