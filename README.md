# DIM: fullstack web-app showcase

Galería de webs de aplicaciones fullstack. Cada tarjeta muestra una captura de la home; al pasar el ratón la captura se desplaza y al hacer clic la web se abre en una pestaña nueva.

**Web:** https://aparrauio.github.io/showcasedim/

## Cómo añadir una web

1. Edita [`src/data/sites.json`](src/data/sites.json):
   ```json
   { "url": "https://ejemplo.com", "title": "Ejemplo", "category": "Dev tools", "tags": ["api"] }
   ```
2. Haz commit y push a `main`.

El workflow **Update screenshots** captura las webs nuevas y hace commit de las imágenes. Después **Deploy to GitHub Pages** vuelve a publicar el sitio. Las capturas también se renuevan cada lunes.

Para volver a capturar todas las webs: *Actions → Update screenshots → Run workflow → force*.

## Desarrollo local

```bash
npm install
npx playwright install chromium   # solo la primera vez
npm run shots                     # capturas nuevas o con más de 7 días
npm run dev                       # http://localhost:4321/showcasedim/
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Genera el sitio estático en `dist/` |
| `npm run preview` | Sirve `dist/` en local |
| `npm run shots` | Captura las webs pendientes |
| `npm run shots:force` | Vuelve a capturar todas |

## Estructura

```
src/data/sites.json      lista de webs (lo único que se edita a mano)
src/data/shots.json      índice de capturas (generado)
public/shots/*.webp      capturas (generadas)
scripts/screenshots.mjs  script de captura con Playwright + sharp
src/pages/index.astro    mosaico, filtros y buscador
.github/workflows/       capturas automáticas y despliegue a Pages
```

## Capturas que fallan

Algunas webs bloquean los navegadores automatizados (Cloudflare y similares) o muestran banners que tapan el contenido. Si una captura falla, la tarjeta muestra un marcador con el dominio. Para esos casos puedes dejar una captura manual en `public/shots/<slug>.webp` y marcarla como válida en `src/data/shots.json`.
