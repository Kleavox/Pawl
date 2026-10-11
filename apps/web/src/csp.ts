const LOOPBACK = ["127.0.0.1", "localhost"];

function spellings(origin: string): string[] {
  const url = new URL(origin);
  if (!LOOPBACK.includes(url.hostname)) return [url.origin];
  return LOOPBACK.map((hostname) => {
    const alias = new URL(url.origin);
    alias.hostname = hostname;
    return alias.origin;
  });
}

export function headersFile(passOrigin: string): string {
  const pass = spellings(passOrigin).join(" ");
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    `connect-src 'self' ${pass}`,
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${pass}`,
    "frame-ancestors 'none'",
  ].join("; ");
  return `/*\n  Content-Security-Policy: ${policy}\n`;
}
