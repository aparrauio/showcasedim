// Identificador estable para cada URL; se usa como nombre de archivo de la captura.
export function slugFromUrl(url) {
  const { hostname, pathname } = new URL(url);
  return `${hostname.replace(/^www\./, '')}${pathname}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function domainFromUrl(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}
