"use strict";

// Diagram pairs retain the visual vocabulary of the original protection and layout previews.
const colors = { surface: "#203142", border: "#4e697e", ink: "#a9bdd0", mint: "#75e4b4", red: "#ff9eac", gold: "#f4c978", sky: "#9acaff" };
const box = (x, y, w, h, fill = colors.surface, stroke = "none") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}"/>`;
const line = (d, stroke = colors.ink, width = 4) =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const check = (x, y) => line(`M${x} ${y}l6 6 12-14`, colors.mint, 4);
const cross = (x, y) => line(`M${x} ${y}l14 14m0-14-14 14`, colors.red, 3);
const dots = [32, 43, 54].map((x) => `<circle cx="${x}" cy="29" r="2.5" fill="${colors.ink}"/>`).join("");
const article = (x, y, width, height = 63) => box(x, y, width, height) +
  line(`M${x + 12} ${y + 15}h${width - 24}m-${width - 24} 14h${width - 37}m-${width - 37} 14h${width - 46}`);
const download = (on, y = 76) => box(44, y, 168, 31, on ? "#235a51" : colors.surface) +
  line(`M62 ${y + 7}v13m-5-5 5 5 5-5M56 ${y + 25}h12`, on ? colors.mint : colors.ink, 2.5) +
  line(`M81 ${y + 16}h75`, on ? colors.mint : colors.ink, 3);

const scenes = {
  blockAds: (on) => on ? article(39, 52, 178, 70) : box(39, 49, 178, 32, "#613541") + cross(121, 58) + box(39, 89, 178, 32) + line("M50 101h128m-128 10h88"),
  patchScripts: (on) => download(on) + (on ? check(177, 91) : cross(177, 84)) + line("M48 58h103", colors.sky, 3),
  pro: (on) => article(36, 53, on ? 133 : 184) + (on ? box(179, 53, 41, 63, "#235a51") + check(190, 80) + line("M186 101h27", colors.mint, 3) : ""),
  compactLayout: (on) => on ? article(36, 50, 112, 70) + box(156, 50, 64, 31) + box(156, 89, 64, 31) :
    box(36, 50, 129, 23) + box(73, 79, 147, 22) + box(36, 108, 103, 15),
  expandMain: (on) => article(36, 51, on ? 184 : 112, 71) +
    (on ? line("M169 111h36m-8-7 8 7-8 7", colors.mint, 2.5) : box(156, 51, 64, 71, "none", colors.border)),
  quickNavigation: (on) => on ? article(38, 54, 180, 65) + box(77, 70, 102, 34, "#163d47") +
    line("M87 97l19-17 14 13 13-10 18 14h18", colors.mint, 3) :
    box(38, 54, 180, 65, "#1b2733") + line("M115 91a14 14 0 1 1 11 10m-10-12-2 4-4-3", colors.sky, 3),
  utilityInHeader: (on) => article(35, 54, 130) + (on ? box(194, 21, 27, 16, "#235a51") + box(171, 44, 57, 62, "#244c50", colors.mint) :
    box(173, 54, 48, 63)) + line(on ? "M181 60h32m-32 13h25m-25 13h27" : "M182 69h27m-27 14h23m-23 14h27", on ? colors.mint : colors.ink, 3),
  hideAnnoyances: (on) => download(true, 51) + (on ? line("M52 101h149", colors.border, 2) :
    box(44, 92, 168, 26, "#543d2c") + line("M58 99v6m0 5h.1M70 105h115", colors.gold, 3)),
  linkBadges: (on) => download(on) + (on ? check(177, 91) : "") + line("M48 60h102", colors.sky, 3),
  taunt: (on) => article(37, 52, 132, 66) + (on ? box(135, 92, 86, 29, "#235a51", colors.mint) + check(146, 106) +
    line("M173 107h34", colors.mint, 3) : ""),
  diagnostics: (on) => box(37, 52, 182, 68, "#0c1722", colors.border) +
    (on ? line("M50 65l5 5-5 5m14 0h109m-109 12h80m-80 12h113", colors.mint, 3) : line("M50 66l5 5-5 5m12 0h9", colors.ink, 3)),
  soundFeedback: (on) => box(61, 62, 133, 47, on ? "#235a51" : colors.surface) +
    line("M95 82h7l12-10v27l-12-10h-7z", on ? colors.mint : colors.ink, 3) +
    (on ? line("M128 79c5 4 5 9 0 13m10-18c9 7 9 17 0 24m10-29c13 10 13 24 0 34", colors.mint, 3) : cross(130, 79)),
  recommendExtension: (on) => article(37, 51, 136, 70) + (on ?
    box(148, 69, 75, 42, "#244c50", colors.mint) + line("M167 94h6v-5h5v5h7v-9h-4v-5h-8v5h-6zM195 85h16m-16 10h12", colors.mint, 2.5) : ""),
};

function illustration(key, on) {
  if (!Object.hasOwn(scenes, key)) throw new Error(`Missing preview illustration: ${key}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 144">${box(0, 0, 256, 144, "#151f2b")}${box(20, 18, 216, 112, "#101b27", colors.border)}${dots}${line("M20 40h216", colors.border, 1)}${scenes[key](on)}</svg>\n`;
}

module.exports = { illustration };
