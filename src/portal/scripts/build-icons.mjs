// Draws the app icon (an eye: "netra") and writes the PNG sizes the PWA manifest needs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const NAVY = [27, 58, 107]
const WHITE = [255, 255, 255]

// Coordinates are in a unit square centred on (0, 0), from -0.5 to 0.5.
function colourAt(x, y) {
  const r = 0.46 // two circles of this radius, offset vertically, intersect into an almond
  const inLid = Math.hypot(x, y - 0.27) < r && Math.hypot(x, y + 0.27) < r
  if (!inLid) return NAVY
  const d = Math.hypot(x, y)
  if (d < 0.055) return WHITE
  if (d < 0.15) return NAVY
  return WHITE
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}

function png(size) {
  const SS = 4
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let py = 0; py < size; py++) {
    const row = py * (size * 3 + 1)
    raw[row] = 0
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colourAt((px + (sx + 0.5) / SS) / size - 0.5, (py + (sy + 0.5) / SS) / size - 0.5)
          acc[0] += c[0]
          acc[1] += c[1]
          acc[2] += c[2]
        }
      }
      for (let k = 0; k < 3; k++) raw[row + 1 + px * 3 + k] = Math.round(acc[k] / (SS * SS))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../public')
mkdirSync(dir, { recursive: true })
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(resolve(dir, name), png(size))
}
writeFileSync(
  resolve(dir, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1B3A6B"/><path d="M8 32c6.5-10 14.500-15 24-15s17.500 5 24 15c-6.500 10-14.500 15-24 15S14.500 42 8 32z" fill="#fff"/><circle cx="32" cy="32" r="9.500" fill="#1B3A6B"/><circle cx="32" cy="32" r="3.500" fill="#fff"/></svg>\n`,
)
console.log('Icons written to', dir)
