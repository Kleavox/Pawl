interface Env {
  APP_KEY: string;
  PUBLIC_ORIGIN: string;
  PROVIDER: string;
  CLIENT_ID: string;
  REDIRECT_URI: string;
}

const purged = new Set<string>();

function internal(request: Request, env: Env): boolean {
  return new URL(request.url).hostname === `${env.APP_KEY}.internal`;
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encode = (value: Uint8Array) =>
    btoa(String.fromCharCode(...value))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");
  const verifier = encode(bytes);
  const challenge = encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  return { verifier, challenge };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health")
      return Response.json({ service: env.APP_KEY, status: "ok" });
    if (url.pathname === "/.well-known/pawl/estate") {
      if (!internal(request, env)) return new Response(null, { status: 404 });
      if (
        !(request.headers.get("cookie") ?? "").includes(
          "__Secure-pawl_session=",
        )
      )
        return new Response(null, { status: 401 });
      const origin = new URL(env.PUBLIC_ORIGIN);
      origin.hostname =
        request.headers.get("x-pawl-public-host") ?? origin.hostname;
      return Response.json({
        count: 7,
        severity: "warn",
        attention: [
          {
            kind: "fixture",
            severity: "warn",
            title: "fixture item",
            detail: "from the fixture",
            since: new Date().toISOString(),
            age: "elapsed",
            href: `${origin.origin}/`,
          },
        ],
      });
    }
    if (url.pathname === "/.well-known/pawl/purge-user") {
      if (!internal(request, env) || request.method !== "POST")
        return new Response(null, { status: 404 });
      purged.add(url.searchParams.get("id") ?? "");
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/fixture/purged") return Response.json([...purged]);
    if (url.pathname.startsWith("/internal/resolve/")) {
      const slug = url.pathname.slice("/internal/resolve/".length);
      return slug === "fixture-slug"
        ? new Response(null, {
            status: 302,
            headers: {
              location: `${env.PUBLIC_ORIGIN}/landed?via=${request.headers.get("x-pawl-public-host")}`,
            },
          })
        : new Response(null, { status: 404 });
    }
    if (url.pathname.startsWith("/n_"))
      return new Response(`file page ${url.pathname.slice(1)}`, {
        headers: { "content-type": "text/html" },
      });
    if (url.pathname.startsWith("/api/notes/"))
      return Response.json({
        app: env.APP_KEY,
        host: url.hostname,
        path: url.pathname,
      });
    if (url.pathname === "/login") {
      const { verifier, challenge } = await pkce();
      const state = crypto.randomUUID();
      const target = new URL("/oauth/authorize", env.PROVIDER);
      for (const [name, value] of Object.entries({
        client_id: env.CLIENT_ID,
        redirect_uri: env.REDIRECT_URI,
        response_type: "code",
        scope: "openid email profile",
        state,
        nonce: state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      })) {
        target.searchParams.set(name, value);
      }
      return new Response(null, {
        status: 302,
        headers: {
          location: target.toString(),
          "set-cookie": `rp=${state}.${verifier}; Path=/; HttpOnly; SameSite=Lax`,
        },
      });
    }
    if (url.pathname === "/callback") {
      const [state, verifier] = (
        request.headers.get("cookie")?.match(/rp=([^;]+)/u)?.[1] ?? "."
      ).split(".");
      if (url.searchParams.get("state") !== state)
        return new Response("state mismatch", { status: 400 });
      const token = await fetch(new URL("/oauth/token", env.PROVIDER), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: url.searchParams.get("code") ?? "",
          redirect_uri: env.REDIRECT_URI,
          code_verifier: verifier ?? "",
          client_id: env.CLIENT_ID,
        }),
      });
      if (!token.ok)
        return new Response(`token ${token.status}`, { status: 502 });
      const { id_token } = (await token.json()) as { id_token: string };
      const claims = JSON.parse(
        atob(id_token.split(".")[1]!.replaceAll("-", "+").replaceAll("_", "/")),
      ) as Record<string, unknown>;
      return new Response(
        `<h1>signed in as ${String(claims.preferred_username)}</h1><p data-sub>${String(claims.sub)}</p><p data-aud>${String(claims.aud)}</p>`,
        { headers: { "content-type": "text/html" } },
      );
    }
    return new Response(`<h1>${env.APP_KEY}</h1>`, {
      headers: { "content-type": "text/html" },
    });
  },
};
