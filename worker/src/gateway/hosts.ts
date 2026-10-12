export function hostRedirect(url: URL, publicOrigin: string): URL | null {
  const canonical = new URL(publicOrigin);
  if (url.hostname !== `www.${canonical.hostname}`) return null;

  canonical.pathname = url.pathname;
  canonical.search = url.search;
  canonical.hash = url.hash;
  return canonical;
}
