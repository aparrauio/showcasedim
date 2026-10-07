// Genera una captura de la home de cada URL de src/data/sites.json.
//
//   npm run shots          -> solo URLs nuevas o con captura de más de MAX_AGE_DAYS
//   npm run shots:force    -> vuelve a capturar todas
//
// Salida: public/shots/<slug>.webp y el índice src/data/shots.json.

import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { slugFromUrl } from '../src/lib/slug.mjs';

const ROOT = new URL('../', import.meta.url);
const SITES_FILE = new URL('src/data/sites.json', ROOT);
const MANIFEST_FILE = new URL('src/data/shots.json', ROOT);
const SHOTS_DIR = new URL('public/shots/', ROOT);

const VIEWPORT = { width: 1440, height: 900 };
const MAX_CAPTURE_HEIGHT = 3600; // px a 1440 de ancho
const OUTPUT_WIDTH = 720;
const MAX_AGE_DAYS = 7;
const CONCURRENCY = 3;
const NAV_TIMEOUT = 45_000;

const FORCE = process.argv.includes('--force');

// Oculta los banners de cookies y chats más comunes para que no tapen la captura.
const HIDE_OVERLAYS_CSS = `
  #onetrust-consent-sdk, #onetrust-banner-sdk, #CybotCookiebotDialog, #usercentrics-root,
  #truste-consent-track, .truste_box_overlay, #didomi-host, .qc-cmp2-container,
  .cc-window, .cc-banner, .cookie-banner, .cookie-consent, .cookies-banner,
  [id*="cookie-banner" i], [class*="cookie-banner" i], [id*="cookieconsent" i],
  [class*="CookieBanner"], [aria-label*="cookie" i][role="dialog"],
  #intercom-container, .intercom-lightweight-app, #hubspot-messages-iframe-container,
  .drift-frame-controller, #crisp-chatbox { display: none !important; }
  html, body { overflow: visible !important; }
`;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function isFresh(entry) {
  if (!entry?.ok || !entry.capturedAt) return false;
  const ageDays = (Date.now() - new Date(entry.capturedAt).getTime()) / 86_400_000;
  return ageDays < MAX_AGE_DAYS;
}

// Desplaza la página hasta abajo para disparar la carga diferida de imágenes y animaciones.
async function autoScroll(page) {
  await page.evaluate(async (maxHeight) => {
    const step = 600;
    for (let y = 0; y < Math.min(document.body.scrollHeight, maxHeight); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  }, MAX_CAPTURE_HEIGHT);
}

// Intento normal: página larga con scroll previo.
async function captureFull(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.addStyleTag({ content: HIDE_OVERLAYS_CSS }).catch(() => {});
  await autoScroll(page);
  await page.waitForTimeout(1500);

  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const height = Math.min(Math.max(pageHeight, VIEWPORT.height), MAX_CAPTURE_HEIGHT);
  return page.screenshot({
    clip: { x: 0, y: 0, width: VIEWPORT.width, height },
    fullPage: true,
    animations: 'disabled',
  });
}

// Segundo intento para webs pesadas (WebGL, animaciones infinitas): solo la primera pantalla.
async function captureViewport(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
  await page.addStyleTag({ content: HIDE_OVERLAYS_CSS }).catch(() => {});
  await page.waitForTimeout(4000);
  return page.screenshot({ timeout: 60_000 });
}

async function capture(context, site) {
  const slug = slugFromUrl(site.url);
  const page = await context.newPage();
  try {
    let png;
    try {
      png = await captureFull(page, site.url);
    } catch (err) {
      console.warn(`  … ${site.url}: reintentando solo la primera pantalla (${err.message.split('\n')[0]})`);
      png = await captureViewport(page, site.url);
    }

    const { data, info } = await sharp(png)
      .resize({ width: OUTPUT_WIDTH })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });
    await writeFile(new URL(`${slug}.webp`, SHOTS_DIR), data);

    console.log(`  ✓ ${site.url} (${info.width}×${info.height}, ${Math.round(data.length / 1024)} KB)`);
    return { ok: true, file: `shots/${slug}.webp`, width: info.width, height: info.height, capturedAt: new Date().toISOString() };
  } catch (err) {
    console.warn(`  ✗ ${site.url}: ${err.message.split('\n')[0]}`);
    return { ok: false, error: err.message.split('\n')[0], capturedAt: new Date().toISOString() };
  } finally {
    await page.close();
  }
}

async function main() {
  const sites = await readJson(SITES_FILE, []);
  const manifest = await readJson(MANIFEST_FILE, {});
  await mkdir(SHOTS_DIR, { recursive: true });

  const slugs = new Set(sites.map((s) => slugFromUrl(s.url)));

  // Elimina capturas de URLs que ya no están en la lista.
  for (const slug of Object.keys(manifest)) {
    if (slugs.has(slug)) continue;
    await rm(new URL(`${slug}.webp`, SHOTS_DIR), { force: true });
    delete manifest[slug];
    console.log(`  – eliminada: ${slug}`);
  }

  const pending = sites.filter((s) => {
    const slug = slugFromUrl(s.url);
    const fileExists = existsSync(new URL(`${slug}.webp`, SHOTS_DIR));
    return FORCE || !fileExists || !isFresh(manifest[slug]);
  });

  console.log(`${sites.length} sitios, ${pending.length} por capturar${FORCE ? ' (--force)' : ''}`);

  if (pending.length) {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'es-ES',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });

    const queue = [...pending];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const site = queue.shift();
        const slug = slugFromUrl(site.url);
        const result = await capture(context, site);
        // Si falla pero ya había una captura válida, se conserva la anterior.
        manifest[slug] = result.ok || !manifest[slug]?.ok ? result : { ...manifest[slug], lastError: result.error };
      }
    });
    await Promise.all(workers);
    await browser.close();
  }

  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST_FILE, JSON.stringify(sorted, null, 2) + '\n');

  const failed = Object.values(sorted).filter((e) => !e.ok).length;
  console.log(`Listo. ${Object.keys(sorted).length - failed} capturas válidas, ${failed} fallidas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
