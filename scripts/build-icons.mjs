// Draws the Crisp logo — a squared "C" made of three filling bars (pink, cyan, yellow) —
// and renders the PWA icons from it. Run: node scripts/build-icons.mjs (needs Playwright's Chromium).
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const PINK = '#FF2D95', CYAN = '#00E5FF', YELLOW = '#FFD60A'
// Geometry on a 512 canvas (also used by the splash animation: src/components/Logo.tsx)
const T = 66, GAP = 16, R = 20, X0 = 106, W = 300
const bars = [
  { c: PINK, x: X0, y: X0, w: W, h: T, fill: 1, from: 'right' },
  { c: CYAN, x: X0, y: X0 + T + GAP, w: T, h: W - 2 * T - 2 * GAP, fill: 1, from: 'top' },
  { c: YELLOW, x: X0, y: X0 + W - T, w: W, h: T, fill: 0.74, from: 'left' },
]

export function logoSvg({ bg = '#000', scale = 1 } = {}) {
  const parts = bars.map((b, i) => {
    const fw = b.from === 'top' ? b.w : Math.round(b.w * b.fill)
    const fh = b.from === 'top' ? Math.round(b.h * b.fill) : b.h
    const fx = b.from === 'right' ? b.x + b.w - fw : b.x
    return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${R}" fill="${b.c}" fill-opacity="0.18"/>
<rect x="${fx}" y="${b.y}" width="${fw}" height="${fh}" rx="${R}" fill="${b.c}" filter="url(#glow${i})"/>`
  })
  const filters = bars.map((b, i) => `<filter id="glow${i}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/><feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`).join('')
  const t = scale === 1 ? '' : ` transform="translate(${256 * (1 - scale)} ${256 * (1 - scale)}) scale(${scale})"`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${filters}</defs>${bg ? `<rect width="512" height="512" fill="${bg}"/>` : ''}<g${t}>${parts.join('\n')}</g></svg>`
}

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
writeFileSync('public/icons/icon.svg', logoSvg())
const browser = await chromium.launch()
const page = await browser.newPage()
const shots = [
  ['icon-512.png', 512, logoSvg()],
  ['icon-192.png', 192, logoSvg()],
  ['apple-touch-icon.png', 180, logoSvg()],
  ['icon-maskable-512.png', 512, logoSvg({ scale: 0.8 })],
]
for (const [name, size, svg] of shots) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:#000">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: `public/icons/${name}`, clip: { x: 0, y: 0, width: size, height: size } })
}
await browser.close()
console.log('icons written')
