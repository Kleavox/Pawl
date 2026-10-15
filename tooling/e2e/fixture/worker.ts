interface Env {
  APP_KEY: string;
  PUBLIC_ORIGIN: string;
  PROVIDER: string;
  CLIENT_ID: string;
  CLIENT_SECRET?: string;
}

function redirectUri(url: URL): string {
  return new URL("/callback", url.origin).toString();
}

function payload(token: string): Record<string, unknown> {
  return JSON.parse(
    atob(token.split(".")[1]!.replaceAll("-", "+").replaceAll("_", "/")),
  ) as Record<string, unknown>;
}

const purged = new Set<string>();

function bytes(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function decoded(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes(part))) as Record<
    string,
    unknown
  >;
}

async function cardClaims(
  request: Request,
  env: Env,
): Promise<Record<string, unknown> | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /u, "");
  const [head, body, signature] = (token ?? "").split(".");
  if (!head || !body || !signature) return null;
  const { kid } = decoded(head);
  const { keys } = (await (
    await fetch(new URL("/oauth/jwks.json", env.PROVIDER))
  ).json()) as { keys: (JsonWebKey & { kid?: string })[] };
  const jwk = keys.find((candidate) => candidate.kid === kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    bytes(signature),
    new TextEncoder().encode(`${head}.${body}`),
  );
  if (!verified) return null;
  const claims = decoded(body);
  return claims.token_use === "pawl-card" &&
    claims.aud === env.APP_KEY &&
    claims.iss === env.PROVIDER &&
    Number(claims.exp) * 1000 > Date.now()
    ? claims
    : null;
}

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
      if (!request.headers.get("x-pawl-user"))
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
    if (url.pathname === "/.well-known/pawl/card") {
      const claims = await cardClaims(request, env);
      if (!claims) return new Response(null, { status: 401 });
      return Response.json(
        {
          title: "Monitor card",
          message: `Hello ${String(claims.email)}`,
          fields: [{ label: "Subject", value: String(claims.sub), copy: true }],
          action: { label: "Detail", href: `${env.PUBLIC_ORIGIN}/` },
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
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
      const prompt = url.searchParams.get("prompt");
      const target = new URL("/oauth/authorize", env.PROVIDER);
      for (const [name, value] of Object.entries({
        client_id: env.CLIENT_ID,
        redirect_uri: redirectUri(url),
        response_type: "code",
        scope: "openid email profile",
        state,
        nonce: state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...(prompt ? { prompt } : {}),
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
      const refused = url.searchParams.get("error");
      if (refused)
        return new Response(`<h1>guest</h1><p data-error>${refused}</p>`, {
          headers: { "content-type": "text/html" },
        });
      const [state, verifier] = (
        request.headers.get("cookie")?.match(/rp=([^;]+)/u)?.[1] ?? "."
      ).split(".");
      if (url.searchParams.get("state") !== state)
        return new Response("state mismatch", { status: 400 });
      const token = await fetch(new URL("/oauth/token", env.PROVIDER), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          ...(env.CLIENT_SECRET
            ? {
                authorization: `Basic ${btoa(`${env.CLIENT_ID}:${env.CLIENT_SECRET}`)}`,
              }
            : {}),
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: url.searchParams.get("code") ?? "",
          redirect_uri: redirectUri(url),
          code_verifier: verifier ?? "",
          ...(env.CLIENT_SECRET ? {} : { client_id: env.CLIENT_ID }),
        }),
      });
      if (!token.ok)
        return new Response(`token ${token.status}`, { status: 502 });
      const { id_token, access_token } = (await token.json()) as {
        id_token: string;
        access_token: string;
      };
      const claims = payload(id_token);
      const access = payload(access_token);
      return new Response(
        `<h1>signed in as ${String(claims.preferred_username)}</h1><p data-sub>${String(claims.sub)}</p><p data-aud>${String(claims.aud)}</p><p data-role>${String(access.role)}</p><p data-email>${String(claims.email)}</p>`,
        { headers: { "content-type": "text/html" } },
      );
    }
    if (url.pathname === "/signout")
      return new Response(
        `<form method="post" action="${new URL("/oauth/logout", env.PROVIDER)}"><input type="hidden" name="client_id" value="${env.CLIENT_ID}"><input type="hidden" name="post_logout_redirect_uri" value="${url.origin}/"><button>sign out</button></form>`,
        { headers: { "content-type": "text/html" } },
      );
    return new Response(`<h1>${env.APP_KEY}</h1>`, {
      headers: { "content-type": "text/html" },
    });
  },
};
