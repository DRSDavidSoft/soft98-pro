"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Script } = require("node:vm");
const security = require("../tools/tooling-security.js");

const ROOT = path.resolve(__dirname, "..");
const PAGE = "https://soft98.ir/article.html";
const PORT = 49231;
const CDP = `ws://127.0.0.1:${PORT}/devtools/page/ABC123-def_456`;

test("DevTools accepts only a canonical page endpoint on the allocated loopback port", () => {
  assert.equal(security.devToolsPageUrl(CDP, PORT), CDP);
  for (const port of [1, 80, 65535]) {
    const endpoint = `ws://127.0.0.1:${port}/devtools/page/page-id`;
    assert.equal(security.devToolsPageUrl(endpoint, port), endpoint);
  }
  for (const port of [undefined, null, String(PORT), 0, -1, 65536, 1.5, NaN, Infinity]) {
    assert.throws(() => security.devToolsPageUrl(CDP, port));
  }
});

test("DevTools rejects remote hosts, aliases, credentials, wrong ports and non-page paths", () => {
  const invalid = [
    CDP.replace("ws:", "wss:"), CDP.replace("ws:", "http:"),
    CDP.replace("127.0.0.1", "localhost"), CDP.replace("127.0.0.1", "[::1]"),
    CDP.replace("127.0.0.1", "127.1"), CDP.replace("127.0.0.1", "2130706433"),
    CDP.replace("127.0.0.1", "0x7f000001"), CDP.replace("127.0.0.1", "127.0.0.2"),
    CDP.replace("127.0.0.1", "127.0.0.1.example.test"),
    CDP.replace("127.0.0.1", "example.test"), CDP.replace("127.0.0.1", "user@127.0.0.1"),
    CDP.replace("127.0.0.1", "user:secret@127.0.0.1"), CDP.replace("127.0.0.1", "@127.0.0.1"),
    CDP.replace(String(PORT), String(PORT + 1)), CDP.replace(`:${PORT}`, ""),
    CDP.replace("/page/", "/browser/"), CDP.replace("/page/", "/page/../page/"),
    CDP.replace("ABC123-def_456", ""), CDP + "/other", CDP + "/", CDP + "?token=x", CDP + "#x",
    CDP + "?", CDP + "#", CDP.replace("ABC123", "%41BC123"),
    CDP.replace("/devtools/", "/%64evtools/"), CDP.replace("/devtools/", "\\devtools/"),
    " " + CDP, CDP + "\n", "//127.0.0.1/devtools/page/id", "not a URL", null,
  ];
  for (const value of invalid) assert.throws(() => security.devToolsPageUrl(value, PORT), String(value));
});

const UNSAFE_TARGETS = [
  "http://soft98.ir/", "ftp://soft98.ir/", "file:///etc/passwd", "data:text/plain,hello",
  "https://127.0.0.1/", "https://[::1]/", "https://169.254.169.254/latest/meta-data/",
  "https://soft98.ir.example.test/", "https://example.test/soft98.ir", "https://evilsoft98.ir/",
  "https://unapproved.soft98.ir/", "https://soft98.ir:8443/", "https://user@soft98.ir/",
  "https://user:secret@img.soft98.ir/", "https://soft98.ir@127.0.0.1/", "//soft98.ir/", "not a URL", "",
];

test("Soft98 destinations use an exact HTTPS origin allowlist and canonical URLs", () => {
  for (const host of ["soft98.ir", "www.soft98.ir", "img.soft98.ir"]) {
    assert.equal(security.soft98Url(`https://${host}/asset.css?v=1#fragment`), `https://${host}/asset.css?v=1`);
  }
  assert.equal(security.soft98Url("https://SOFT98.IR:443/article.html"), PAGE);
  for (const value of [...UNSAFE_TARGETS, null, {}]) assert.throws(() => security.soft98Url(value), String(value));
});

test("unsafe initial destinations are rejected before fetching", async () => {
  let requests = 0;
  for (const value of UNSAFE_TARGETS) {
    await assert.rejects(security.fetchSoft98(value, async () => { requests++; }));
  }
  assert.equal(requests, 0);
});

for (const status of [301, 302, 303, 307, 308]) {
  test(`Soft98 follows validated ${status} redirects manually and reports the final URL`, async () => {
    const requests = [];
    const result = await security.fetchSoft98(PAGE, async (url, options) => {
      requests.push(url);
      assert.equal(options.redirect, "manual");
      assert.equal(options.headers["user-agent"], "Mozilla/5.0 Soft98AdBlockerProof");
      assert.ok(options.signal instanceof AbortSignal);
      if (requests.length === 1) return new Response(null, { status, headers: { location: "/next" } });
      if (requests.length === 2) return new Response(null, { status, headers: { location: "https://img.soft98.ir/final.css" } });
      return new Response("body");
    });
    assert.deepEqual(requests, [PAGE, "https://soft98.ir/next", "https://img.soft98.ir/final.css"]);
    assert.equal(result.url, requests[2]);
    assert.equal(await result.response.text(), "body");
  });
}

test("unsafe redirect destinations are rejected before the next fetch and release the response", async () => {
  for (const location of UNSAFE_TARGETS.filter(value => value && !["//soft98.ir/", "not a URL"].includes(value))) {
    let requests = 0;
    let cancelled = false;
    await assert.rejects(security.fetchSoft98(PAGE, async () => {
      requests++;
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
        status: 302, headers: { location },
      });
    }), location);
    assert.equal(requests, 1, location);
    assert.equal(cancelled, true, location);
  }
});

test("Soft98 rejects missing redirect locations and bounds redirect loops", async () => {
  for (const headers of [{}, { location: "" }]) {
    await assert.rejects(security.fetchSoft98(PAGE, async () => new Response(null, { status: 302, headers })), /redirect chain/);
  }
  let requests = 0;
  let cancelled = 0;
  await assert.rejects(security.fetchSoft98(PAGE, async () => {
    requests++;
    return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 302, headers: { location: PAGE } });
  }), /redirect chain/);
  assert.equal(requests, 5);
  assert.equal(cancelled, requests);
});

test("script JSON cannot terminate a script or introduce HTML and retains the original value", () => {
  const value = '</script><script>globalThis.injected=true</script><!-- & > " \' \\ \r\n\u2028\u2029 $& $` $\'';
  const encoded = security.jsonForScript(value);
  assert.doesNotMatch(encoded, /[<>&\u2028\u2029]/);
  assert.equal(new Script(`(${encoded})`).runInNewContext(), value);
  assert.deepEqual(JSON.parse(security.jsonForScript({ value, enabled: true })), { value, enabled: true });
  assert.equal(security.escapeHtmlAttribute('&<>"\''), "&amp;&lt;&gt;&quot;&#39;");
});

function harness(fetchImpl) {
  let handler;
  const file = path.join(ROOT, "test", "serve-harness.js");
  new Script(fs.readFileSync(file, "utf8"), { filename: file }).runInNewContext({
    __dirname: path.dirname(file), URL, Buffer, setTimeout,
    process: { env: {} }, console: { log() {} },
    require(name) {
      if (name === "http") return { createServer(callback) {
        handler = callback;
        return { listen(_port, host, ready) { assert.equal(host, "127.0.0.1"); ready(); } };
      } };
      if (name === "../tools/tooling-security.js") return {
        ...security, fetchSoft98: value => security.fetchSoft98(value, fetchImpl),
      };
      return require(name);
    },
  });
  return async requestUrl => {
    const response = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
      end(body) { this.body = body; return this; },
    };
    await handler({ url: requestUrl, method: "GET", headers: {} }, response);
    return response;
  };
}

test("both harness routes reject unsafe URLs and redirects without contacting their targets", async () => {
  for (const route of ["/proxy", "/live"]) {
    let requests = 0;
    const handle = harness(async () => { requests++; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }); });
    for (const target of UNSAFE_TARGETS.filter(Boolean)) {
      const response = await handle(`${route}?url=${encodeURIComponent(target)}`);
      assert.equal(response.status, 400, `${route}: ${target}`);
      assert.match(response.headers["content-type"], /^text\/plain/);
    }
    assert.equal(requests, 0);
    assert.equal((await handle(`${route}?url=${encodeURIComponent(PAGE)}`)).status, 400);
    assert.equal(requests, 1);
  }
});

test("the CSS proxy resolves assets relative to the final validated redirect destination", async () => {
  let requests = 0;
  const handle = harness(async () => ++requests === 1
    ? new Response(null, { status: 302, headers: { location: "https://img.soft98.ir/templates/v2/style.css" } })
    : new Response('body{background:url(../img/banner.png)}', { headers: { "content-type": "text/css" } }));
  const response = await handle(`/proxy?url=${encodeURIComponent("https://soft98.ir/style.css")}`);
  assert.equal(response.status, 200);
  assert.match(response.body, new RegExp(encodeURIComponent("https://img.soft98.ir/templates/img/banner.png")));
});

test("live proof safely embeds hostile view values, base attributes and page links", async () => {
  const view = '</script><script>globalThis.injected=true</script><!--\u2028\u2029 $& $` $\'';
  const target = "https://www.soft98.ir/final?x=&quot;&marker=$&";
  let requests = 0;
  const handle = harness(async () => ++requests === 1
    ? new Response(null, { status: 302, headers: { location: target } })
    : new Response("<!doctype html><head></head><body><p>Fixture</p></body>"));
  const response = await handle(`/live?url=${encodeURIComponent(PAGE)}&view=${encodeURIComponent(view)}`);
  assert.equal(response.status, 200);
  assert.ok(response.body.includes(`<base href="${security.escapeHtmlAttribute(target)}">`));
  const scripts = [...response.body.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  const script = scripts[0][1];
  assert.equal(JSON.parse(script.match(/var proofView = (.*);/)[1]), view);
  let overlay;
  const hostileLink = 'https://soft98.ir/\"><img src=x onerror="globalThis.injected=true">';
  const context = {
    window: {}, setTimeout(callback) { callback(); },
    document: {
      body: { appendChild(node) { overlay = node; } },
      querySelector() { return null; },
      querySelectorAll(selector) {
        return selector.startsWith("a[href], button") ? [{ textContent: "Download", href: hostileLink, getAttribute() { return hostileLink; } }] : [];
      },
      createElement(tag) {
        return { tag, style: {}, children: [], appendChild(node) { this.children.push(node); },
          set innerHTML(_value) { assert.fail("Proof overlay must not parse page links as HTML"); } };
      },
    },
  };
  new Script(script).runInNewContext(context);
  assert.equal(context.injected, undefined);
  assert.equal(overlay.children[0].tag, "strong");
  assert.equal(overlay.children[4].textContent, "first href: " + hostileLink);
});

test("live proof also escapes script data when the upstream body has no closing tag", async () => {
  const handle = harness(async () => new Response("<!doctype html><head></head><body>Fixture"));
  const response = await handle("/live?view=" + encodeURIComponent("</script><img src=x onerror=alert(1)>"));
  assert.equal(response.status, 200);
  assert.equal([...response.body.matchAll(/<\/script>/gi)].length, 2);
  assert.doesNotMatch(response.body, /<img src=x/);
});

test("Firefox errors are one structured JSON record even with forged log lines and control characters", async () => {
  const file = path.join(ROOT, "tools", "firefox-live-smoke.js");
  const message = "Remote error\r\nForged log entry\n\t\x1b[31m %s";
  const records = [];
  const processStub = { env: {}, exitCode: 0 };
  await new Script(fs.readFileSync(file, "utf8"), { filename: file }).runInNewContext({
    __dirname: path.dirname(file), URL, process: processStub,
    console: { error(...args) { records.push(args); } },
    require(name) {
      if (name === "node:fs/promises") return { async mkdtemp() { throw new Error(message); } };
      if (name === "pngjs") return { PNG: {} };
      return require(name);
    },
  });
  assert.equal(processStub.exitCode, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].length, 1);
  assert.doesNotMatch(records[0][0], /[\r\n\t\x1b]/);
  assert.deepEqual(JSON.parse(records[0][0]), { error: message });
});
