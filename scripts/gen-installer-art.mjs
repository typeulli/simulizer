// Generates the NSIS/MUI2 branding bitmaps for the Windows installer, using the
// ACTUAL app icon (client/res/simulizer.ico) composited onto each background so
// the colours always match the brand icon.
//
//   client/res/installer-welcome.bmp  — Welcome/Finish left sidebar
//   client/res/installer-header.bmp   — inner-page header (top-right)
//
// Notes:
//  * Light/white backgrounds, because the .nsi uses MUI_..._STRETCH=AspectFitHeight
//    (preserves aspect → no horizontal stretching) and the default MUI_BGCOLOR is
//    white, so any aspect-fit gap blends invisibly.
//  * Authored at 3x the nominal control size so NSIS DOWN-scales (crisp) on
//    high-DPI displays instead of up-scaling.
//  * NSIS needs uncompressed BMP (sharp can't write it), so we encode a 24-bit
//    BMP by hand from raw RGB. PNG previews are written alongside.
//
//   run from frontend/:  node scripts/gen-installer-art.mjs

import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RES = resolve(__dirname, "..", "..", "client", "res");

// 24-bit BMP from top-down RGB (BMP stores BGR, bottom-up, rows padded to 4).
function bmp24(rgb, width, height) {
    const rowSize = Math.ceil((width * 3) / 4) * 4;
    const imgSize = rowSize * height;
    const buf = Buffer.alloc(54 + imgSize);
    buf.write("BM", 0, "ascii");
    buf.writeUInt32LE(54 + imgSize, 2);
    buf.writeUInt32LE(54, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(height, 22);
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(24, 28);
    buf.writeUInt32LE(0, 30);
    buf.writeUInt32LE(imgSize, 34);
    buf.writeInt32LE(2835, 38);
    buf.writeInt32LE(2835, 42);
    for (let y = 0; y < height; y++) {
        const srcY = height - 1 - y;
        let dst = 54 + y * rowSize;
        for (let x = 0; x < width; x++) {
            const s = (srcY * width + x) * 3;
            buf[dst++] = rgb[s + 2];
            buf[dst++] = rgb[s + 1];
            buf[dst++] = rgb[s];
        }
    }
    return buf;
}

// Largest PNG image out of an .ico (the backend-api icon stores PNG entries).
function icoLargestPng(buf) {
    const count = buf.readUInt16LE(4);
    let best = null;
    for (let i = 0; i < count; i++) {
        const o = 6 + i * 16;
        const w = buf[o] || 256;
        const size = buf.readUInt32LE(o + 8);
        const off = buf.readUInt32LE(o + 12);
        if (!best || w > best.w) best = { w, data: buf.subarray(off, off + size) };
    }
    return best.data;
}

const hex = (r, g, b) => "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");

const FONT = "Segoe UI, Arial, Helvetica, sans-serif";
const NAVY = "#141d2b";   // matches the icon's dark outlined blocks
const GRAY = "#5b6b7f";
const SUBTLE = "#9aa7b5";

const iconPng = icoLargestPng(readFileSync(resolve(RES, "simulizer.ico")));

// Sample the icon's main blue (top-left filled block centre) for the accent.
const { data: ipx, info: iinfo } = await sharp(iconPng).resize(256, 256).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const si = (Math.round(0.29 * iinfo.height) * iinfo.width + Math.round(0.29 * iinfo.width)) * 4;
const ACCENT = hex(ipx[si], ipx[si + 1], ipx[si + 2]);

// Render an SVG background, composite the icon, flatten to white, encode BMP.
async function emit(name, W, H, bgSvg, icon) {
    const bg = await sharp(Buffer.from(bgSvg)).png().toBuffer();
    const ic = await sharp(iconPng).resize(icon.size, icon.size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    const { data, info } = await sharp(bg)
        .composite([{ input: ic, left: icon.left, top: icon.top }])
        .flatten({ background: "#ffffff" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    writeFileSync(resolve(RES, `${name}.bmp`), bmp24(data, info.width, info.height));
    await sharp(bg).composite([{ input: ic, left: icon.left, top: icon.top }]).flatten({ background: "#ffffff" }).png().toFile(resolve(RES, `${name}.png`));
    console.log(`${name}: ${info.width}x${info.height}`);
}

// ── Welcome / Finish sidebar (nominal 164x314, authored 3x = 492x942) ─────────
const W = 492, H = 942;
const welcomeBg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="glow" cx="0.5" cy="0.33" r="0.5">
    <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.12"/>
    <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
  </radialGradient></defs>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <text x="${W / 2}" y="540" text-anchor="middle" font-family="${FONT}" font-size="42" font-weight="700" letter-spacing="5" fill="${NAVY}">SIMULIZER</text>
  <rect x="${W / 2 - 42}" y="560" width="84" height="4" rx="2" fill="${ACCENT}"/>
  <text x="${W / 2}" y="598" text-anchor="middle" font-family="${FONT}" font-size="18" fill="${GRAY}">Blocks &amp; C++ to WebAssembly</text>
  <text x="${W / 2}" y="905" text-anchor="middle" font-family="${FONT}" font-size="15" letter-spacing="1" fill="${SUBTLE}">v0.1.0</text>
</svg>`;
await emit("installer-welcome", W, H, welcomeBg, { size: 220, left: Math.round(W / 2 - 110), top: 188 });

// ── Header (nominal 150x57, authored 3x = 450x171), content right of centre ───
const HW = 450, HH = 171;
const headerBg = `<svg width="${HW}" height="${HH}" viewBox="0 0 ${HW} ${HH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${HW}" height="${HH}" fill="#ffffff"/>
  <text x="212" y="108" font-family="${FONT}" font-size="50" font-weight="700" fill="${NAVY}">Simulizer</text>
</svg>`;
await emit("installer-header", HW, HH, headerBg, { size: 96, left: 98, top: 38 });

console.log("accent sampled from icon:", ACCENT, "→ wrote bitmaps to", RES);
