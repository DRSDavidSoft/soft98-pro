#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

const root = path.join(__dirname, "..");
const assets = path.join(root, "src", "assets");
const read = file => PNG.sync.read(fs.readFileSync(file));
const write = (name, image) => fs.writeFileSync(path.join(assets, name), PNG.sync.write(image));
const clamp = value => Math.max(0, Math.min(1, value));
const luma = ([r, g, b]) => (54 * r + 183 * g + 19 * b) / 256;

function trim(image, noiseFloor = 0) {
  let left = image.width, right = 0, top = image.height, bottom = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = 4 * (y * image.width + x);
      if (image.data[offset + 3] <= noiseFloor) {
        image.data.fill(0, offset, offset + 4);
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (left > right || top > bottom) throw new Error("The artwork is fully transparent");
  const width = right - left + 1, height = bottom - top + 1;
  const output = new PNG({ width: width + 4, height: height + 4 });
  PNG.bitblt(image, output, left, top, width, height, 2, 2);
  return output;
}

function stockVariant(sprite, ink, { matte, floor, solid, flag }) {
  const { width, height } = sprite;
  const frame = new PNG({ width, height: height / 2 });
  // The lower frame has light lettering on a dark matte. Recover its edges
  // from luminance and keep the flag's color rather than recoloring it.
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < width; x++) {
      const source = 4 * ((y + frame.height) * width + x);
      const rgb = sprite.data.subarray(source, source + 3);
      const [r, g, b] = rgb;
      const inFlag = x >= flag.left && x <= flag.right && y <= flag.bottom;
      const value = (luma(rgb) - floor) / (solid - floor);
      const pigment = (Math.max(r, g) - b - 14) / 78;
      const alpha = clamp(inFlag ? Math.max(value, pigment) : value);
      if (alpha < .065) continue;
      const offset = 4 * (y * width + x);
      const color = inFlag ? Array.from(rgb, (part, index) =>
        Math.round(255 * clamp((part - matte[index] * (1 - alpha)) / (255 * alpha)))) : ink;
      frame.data.set([...color, Math.round(255 * alpha)], offset);
    }
  }
  return trim(frame);
}

const [headerPath, compactPath] = process.argv.slice(2);
if (!headerPath || !compactPath) {
  throw new Error("Usage: node tools/prepare-brand-assets.js <decoded header sprite.png> <navbar sprite.png>");
}

const header = read(headerPath);
const compact = read(compactPath);
if (header.width !== 225 || header.height !== 168 || compact.width !== 94 || compact.height !== 48) {
  throw new Error("Unexpected source sprite dimensions; verify the frame and matte before regenerating");
}
const mainMask = { matte: [32, 51, 61], floor: 63, solid: 193, flag: { left: 165, right: 206, bottom: 24 } };
const compactMask = { matte: [49, 49, 49], floor: 49, solid: 189, flag: { left: 69, right: 86, bottom: 9 } };
for (const [theme, ink] of [["light", [30, 42, 34]], ["dark", [239, 245, 242]]]) {
  write(`soft98-stock-logo-${theme}.png`, stockVariant(header, ink, mainMask));
  write(`soft98-stock-navbar-${theme}.png`, stockVariant(compact, ink, compactMask));
}
for (const file of [
  "src/assets/soft98-pro-logo-pirate-dark.png", "src/assets/soft98-pro-logo-light.png",
  "docs/assets/soft98-pro-logo-dark.png", "docs/assets/soft98-pro-logo-light.png",
]) {
  const target = path.join(root, file);
  fs.writeFileSync(target, PNG.sync.write(trim(read(target), 18)));
}
