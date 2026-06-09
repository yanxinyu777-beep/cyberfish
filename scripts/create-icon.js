const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const assetsDir = path.join(root, "assets");

function color(hex, alpha = 255) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
    a: alpha
  };
}

function blend(data, width, x, y, c) {
  if (x < 0 || y < 0 || x >= width || y >= width) return;
  const i = (y * width + x) * 4;
  const sa = c.a / 255;
  const da = data[i + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  data[i] = Math.round((c.r * sa + data[i] * da * (1 - sa)) / outA);
  data[i + 1] = Math.round((c.g * sa + data[i + 1] * da * (1 - sa)) / outA);
  data[i + 2] = Math.round((c.b * sa + data[i + 2] * da * (1 - sa)) / outA);
  data[i + 3] = Math.round(outA * 255);
}

function fillRoundedRect(data, size, x, y, w, h, r, top, bottom) {
  for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
    const t = Math.max(0, Math.min(1, (py - y) / h));
    const c = {
      r: Math.round(top.r * (1 - t) + bottom.r * t),
      g: Math.round(top.g * (1 - t) + bottom.g * t),
      b: Math.round(top.b * (1 - t) + bottom.b * t),
      a: 255
    };
    for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) {
      const dx = px < x + r ? x + r - px : px > x + w - r ? px - (x + w - r) : 0;
      const dy = py < y + r ? y + r - py : py > y + h - r ? py - (y + h - r) : 0;
      if (dx * dx + dy * dy <= r * r) blend(data, size, px, py, c);
    }
  }
}

function fillRotatedEllipse(data, size, cx, cy, rx, ry, angle, c) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const pad = Math.max(rx, ry) + 2;
  for (let y = Math.floor(cy - pad); y <= Math.ceil(cy + pad); y += 1) {
    for (let x = Math.floor(cx - pad); x <= Math.ceil(cx + pad); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * ca + dy * sa;
      const ly = -dx * sa + dy * ca;
      const d = (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry);
      if (d <= 1) {
        const edge = Math.min(1, (1 - d) * 5);
        blend(data, size, x, y, { ...c, a: Math.round(c.a * edge) });
      }
    }
  }
}

function fillPolygon(data, size, points, c) {
  const ys = points.map((p) => p[1]);
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  for (let y = minY; y <= maxY; y += 1) {
    const hits = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        hits.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i < hits.length; i += 2) {
      for (let x = Math.floor(hits[i]); x <= Math.ceil(hits[i + 1]); x += 1) {
        blend(data, size, x, y, c);
      }
    }
  }
}

function drawLine(data, size, x1, y1, x2, y2, width, c) {
  const minX = Math.floor(Math.min(x1, x2) - width);
  const maxX = Math.ceil(Math.max(x1, x2) + width);
  const minY = Math.floor(Math.min(y1, y2) - width);
  const maxY = Math.ceil(Math.max(y1, y2) + width);
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / len2));
      const px = x1 + vx * t;
      const py = y1 + vy * t;
      const d = Math.hypot(x - px, y - py);
      if (d <= width / 2) blend(data, size, x, y, { ...c, a: Math.round(c.a * Math.min(1, width / 2 - d + 0.6)) });
    }
  }
}

function drawIcon(size) {
  const data = new Uint8ClampedArray(size * size * 4);
  const s = size / 256;

  fillRoundedRect(data, size, 10 * s, 10 * s, 236 * s, 236 * s, 42 * s, color("#071018"), color("#153b43"));
  fillRoundedRect(data, size, 18 * s, 18 * s, 220 * s, 220 * s, 34 * s, color("#102934", 72), color("#0c1b24", 20));

  for (let i = 0; i < 6; i += 1) {
    const x = (46 + i * 32) * s;
    drawLine(data, size, x, 35 * s, x, 218 * s, 1.1 * s, color("#29f4ff", 34));
    const y = (48 + i * 27) * s;
    drawLine(data, size, 34 * s, y, 222 * s, y, 1.1 * s, color("#29f4ff", 24));
  }

  fillRotatedEllipse(data, size, 132 * s, 132 * s, 72 * s, 31 * s, -0.08, color("#22f0ff", 38));
  fillPolygon(data, size, [[90 * s, 130 * s], [42 * s, 86 * s], [52 * s, 133 * s], [42 * s, 178 * s]], color("#ff4fd8", 215));
  fillPolygon(data, size, [[88 * s, 130 * s], [54 * s, 101 * s], [62 * s, 132 * s], [54 * s, 160 * s]], color("#33f7ff", 182));

  fillRotatedEllipse(data, size, 135 * s, 130 * s, 73 * s, 34 * s, -0.05, color("#1ee9ff", 238));
  fillRotatedEllipse(data, size, 155 * s, 126 * s, 42 * s, 15 * s, -0.08, color("#d4fbff", 105));
  fillRotatedEllipse(data, size, 134 * s, 151 * s, 34 * s, 13 * s, 0.18, color("#1678ff", 124));

  drawLine(data, size, 78 * s, 122 * s, 185 * s, 136 * s, 6 * s, color("#ff48d4", 225));
  drawLine(data, size, 92 * s, 139 * s, 176 * s, 148 * s, 3 * s, color("#043f5d", 142));
  drawLine(data, size, 104 * s, 111 * s, 132 * s, 116 * s, 2.2 * s, color("#fbff78", 205));
  drawLine(data, size, 147 * s, 119 * s, 176 * s, 124 * s, 2.2 * s, color("#fbff78", 205));

  fillRotatedEllipse(data, size, 201 * s, 124 * s, 15 * s, 16 * s, 0, color("#f6ffff", 245));
  fillRotatedEllipse(data, size, 205 * s, 124 * s, 5 * s, 5 * s, 0, color("#06131a", 250));
  fillRotatedEllipse(data, size, 207 * s, 122 * s, 2 * s, 2 * s, 0, color("#ffffff", 245));

  fillPolygon(data, size, [[118 * s, 95 * s], [150 * s, 76 * s], [145 * s, 111 * s]], color("#70fff3", 124));
  fillPolygon(data, size, [[123 * s, 162 * s], [154 * s, 187 * s], [148 * s, 150 * s]], color("#70fff3", 118));

  for (const [x, y, r, c] of [
    [58, 55, 5, "#29f4ff"],
    [215, 63, 3, "#fbff78"],
    [207, 190, 4, "#ff4fd8"],
    [72, 202, 3, "#29f4ff"]
  ]) {
    fillRotatedEllipse(data, size, x * s, y * s, r * s, r * s, 0, color(c, 180));
  }

  return data;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuf.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 8 + data.length);
  return out;
}

function writePng(file, size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const src = (y * size + x) * 4;
      const dst = row + 1 + x * 4;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      raw[dst + 3] = rgba[src + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      pngChunk("IEND", Buffer.alloc(0))
    ])
  );
}

function icoImage(size, rgba) {
  const maskStride = Math.ceil(size / 32) * 4;
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const src = ((size - 1 - y) * size + x) * 4;
      const dst = (y * size + x) * 4;
      xor[dst] = rgba[src + 2];
      xor[dst + 1] = rgba[src + 1];
      xor[dst + 2] = rgba[src];
      xor[dst + 3] = rgba[src + 3];
    }
  }

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(xor.length, 20);

  return Buffer.concat([header, xor, Buffer.alloc(maskStride * size)]);
}

function writeIco(file, sizes) {
  const images = sizes.map((size) => ({ size, data: icoImage(size, drawIcon(size)) }));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = image.size === 256 ? 0 : image.size;
    header[entry + 1] = image.size === 256 ? 0 : image.size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  fs.writeFileSync(file, Buffer.concat([header, ...images.map((image) => image.data)]));
}

fs.mkdirSync(assetsDir, { recursive: true });
writePng(path.join(assetsDir, "cyberfish-icon.png"), 512, drawIcon(512));
writeIco(path.join(assetsDir, "cyberfish.ico"), [256, 128, 64, 48, 32, 16]);
console.log("created assets/cyberfish-icon.png and assets/cyberfish.ico");
