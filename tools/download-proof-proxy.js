"use strict";

// Test-only CONNECT relay. It never decrypts traffic or changes the downloaded file.
const http = require("node:http");
const net = require("node:net");
const { Transform } = require("node:stream");

const proxy = http.createServer((_request, response) => response.writeHead(405).end());
proxy.on("connect", (request, client, head) => {
  const match = /^([a-z0-9.-]+):443$/i.exec(request.url);
  if (!match || !/(?:^|\.)(?:soft98\.ir|cdn\.ir)$/i.test(match[1])) {
    client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  const host = match[1];
  const upstream = net.connect(443, host, () => {
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) upstream.write(head);
    client.pipe(upstream);
    if (/(?:^|\.)82\.ir\.cdn\.ir$/i.test(host)) {
      const throttle = new Transform({
        transform(chunk, _encoding, callback) {
          setTimeout(callback, Math.ceil(chunk.length / 1000), null, chunk);
        },
      });
      upstream.pipe(throttle).pipe(client);
    } else upstream.pipe(client);
  });
  client.on("error", () => upstream.destroy());
  upstream.on("error", () => client.destroy());
  client.on("close", () => upstream.destroy());
  upstream.on("close", () => client.end());
});
proxy.listen(Number(process.env.SOFT98_DOWNLOAD_PROXY_PORT || 44986), "127.0.0.1", () => {
  console.log("Soft98 download proof proxy is listening");
});
