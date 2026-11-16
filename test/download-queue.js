"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");
const { once } = require("node:events");
const { setTimeout: sleep } = require("node:timers/promises");
const { test } = require("node:test");
const { create, directUrl, articleFileUrl, relativeFilename, trustedSender, pageSnapshot } = require("../src/download-queue");
const links = require("../src/download-links");
const probe = require("../src/download-probe");

const EXTENSION_ID = "soft98-test";
const PREFIX = "https://example.test/";
const DIST = path.resolve(__dirname, "../dist");

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

test("article download fallback accepts explicit row mappings and ordered numbered records only", () => {
  const direct = { proto: "https", pathname: "/file.zip", domain: "files.example.test" };
  const wrapped = { host: "href.li", a: "/", b: "https://example.test/linux?edition=desktop", c: "https" };
  const records = { link1: direct, link9: wrapped };
  const parse = (value, keys = ["rotating-id-a", "rotating-id-b"]) => links.declaredArticleLinks(JSON.stringify(value), keys);
  assert.deepEqual(parse(records), ["https://files.example.test/file.zip", "https://href.li/?https://example.test/linux?edition=desktop"]);
  assert.deepEqual(parse(records, ["link9", "link1"]), ["https://href.li/?https://example.test/linux?edition=desktop", "https://files.example.test/file.zip"]);
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
    for (const file of ["downloads.js", "download-links.js", "download-import.js", "download-view.js"]) new Script(read(file), { filename: file });
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

function fixture(notify) {
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
  const restart = () => create({ storage, downloads, notify, extensionId: EXTENSION_ID, now: () => ++tick, makeId: () => `job-${++next}` });
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
    { skip: !enabled, timeout: 100000 }, () => verifyNativeQueue(browser, chromium));
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
  const server = http.createServer((req, res) => {
    if (req.url === "/confirm.html") {
      res.writeHead(200, { "Content-Type": "text/html", "Content-Disposition": 'attachment; filename="confirmation.html"' });
      res.end("<!doctype html><title>Verification required</title>");
      return;
    }
    const match = /^\/(one|two|three)\.bin$/.exec(req.url);
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
      res.write(bytes.subarray(index, index + 16384));
      index += 16384;
      if (index >= bytes.length) res.end();
    }, 75);
    res.on("close", () => clearInterval(timer));
  });
  let driver, stopDriver;
  async function webdriver(method, endpoint, payload) {
    const response = await fetch(new URL(endpoint, driver), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), redirect: "error", signal: AbortSignal.timeout(15000) });
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
          `--load-extension=${path.join(DIST, "chromium")}`],
        prefs: { "download.default_directory": dir, "download.prompt_for_download": false, "extensions.ui.developer_mode": true },
        enableExtensionTargets: true,
      },
    } : {
      browserName: "firefox",
      "moz:firefoxOptions": { args: ["-headless"], prefs: {
        "network.proxy.type": 0,
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
    await evaluate("const limit = document.getElementById('limit'); limit.value = '2'; limit.dispatchEvent(new Event('change')); ");
    await until(() => evaluate(`return (typeof browser !== "undefined" ? browser : chrome).storage.local.get("soft98DownloadQueue")
      .then(({ soft98DownloadQueue }) => soft98DownloadQueue?.limit === 2)`), "configure works on the settings route");
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
    console.log(`${browser} ${capabilities.browserVersion}: native queue, file bytes, HTML handling, and narrow layout verified`);
  } finally {
    if (session) await webdriver("DELETE", session).catch(() => {});
    await stopDriver?.();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(temp));
    await fs.rm(dir, { recursive: true, force: true });
  }
}
