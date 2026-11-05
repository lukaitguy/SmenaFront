/**
 * Pravi PNG ikonice aplikacije iz SVG-ova u public/icons (icon.svg i badge.svg).
 * Pokreće se retko, samo kad se menja logo; PNG-ovi se commituju.
 *
 *   npm i --no-save playwright-core
 *   CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node scripts/generate-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const icon = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const badge = readFileSync(new URL('../public/icons/badge.svg', import.meta.url), 'utf8');

const targets = [
  { svg: icon, size: 192, file: 'icon-192.png', transparent: false },
  { svg: icon, size: 512, file: 'icon-512.png', transparent: false },
  { svg: icon, size: 180, file: 'apple-touch-icon.png', transparent: false },
  { svg: badge, size: 72, file: 'badge-72.png', transparent: true },
];

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
for (const { svg, size, file, transparent } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  const png = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(new URL(`../public/icons/${file}`, import.meta.url), png);
  console.log(`${file} ${size}x${size}`);
}
await browser.close();
