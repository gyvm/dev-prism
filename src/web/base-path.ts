// BASE_URL mirrors the configured base and is NOT guaranteed to end in "/"
// (e.g. "/dev-prism" with no trailing slash under web:build/preview). Every
// URL built under the site root goes through here: without the trailing slash
// a child path degenerates to "<base>data" / "<base>explore" and 404s.
export function siteBase(): string {
  const raw = import.meta.env.BASE_URL;
  return raw.endsWith("/") ? raw : `${raw}/`;
}
