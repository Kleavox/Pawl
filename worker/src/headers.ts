import type { Context, Env, MiddlewareHandler } from "hono";

const HSTS = "max-age=31536000";
const PERMISSIONS = "camera=(), microphone=(), geolocation=()";

function freshNonce(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
  );
}

function withNonce(policy: string, nonce: string): string {
  const directives = policy
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const at = (name: string): number =>
    directives.findIndex((part) => part.split(/\s+/u)[0] === name);
  const script = at("script-src");
  if (script === -1) directives.push(`script-src 'self' 'nonce-${nonce}'`);
  else directives[script] = `${directives[script]} 'nonce-${nonce}'`;
  const fallback = at("default-src");
  const reaches = fallback !== -1 && directives[fallback]!.includes("'self'");
  if (at("connect-src") === -1 && !reaches)
    directives.push("connect-src 'self'");
  return directives.join("; ");
}

export function ownHeaders<E extends Env = Env>(options: {
  referrerPolicy: string;
  skip?: (context: Context<E>) => boolean;
}): MiddlewareHandler<E> {
  return async (context, next) => {
    await next();
    if (options.skip?.(context)) return;
    context.header("Strict-Transport-Security", HSTS);
    context.header("Referrer-Policy", options.referrerPolicy);
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    context.header("Permissions-Policy", PERMISSIONS);
    const headers = context.res.headers;
    const policy = headers.get("content-security-policy");
    if (!(headers.get("content-type") ?? "").includes("text/html")) return;
    if (policy === null) return;
    context.header("Content-Security-Policy", withNonce(policy, freshNonce()));
  };
}
