import type { Context, Env, MiddlewareHandler } from "hono";

const HSTS = "max-age=31536000";
const PERMISSIONS = "camera=(), microphone=(), geolocation=()";

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
  };
}
