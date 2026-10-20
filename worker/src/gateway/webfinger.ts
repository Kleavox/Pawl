import type { Access } from "@pawl/registry";

export const ISSUER_REL = "http://openid.net/specs/connect/1.0/issuer";

const CODES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const HEADERS = {
  "content-type": "application/jrd+json",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};

function answer(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: HEADERS,
  });
}

function hostOf(resource: string): { user: string; host: string } | null {
  if (/^acct:/iu.test(resource)) {
    const at = resource.lastIndexOf("@");
    if (at <= "acct:".length || at === resource.length - 1) return null;
    try {
      const host = new URL(`https://${resource.slice(at + 1)}`).hostname;
      return { user: resource.slice("acct:".length, at), host };
    } catch {
      return null;
    }
  }
  if (!/^[a-z][a-z0-9+.-]*:/iu.test(resource)) return null;
  if (!/^https:/iu.test(resource)) return { user: "", host: "" };
  try {
    return { user: "", host: new URL(resource).hostname };
  } catch {
    return null;
  }
}

export async function webfinger(input: {
  url: URL;
  hosts: readonly string[];
  root: string;
  issuer: string;
  bays: () => Promise<readonly { code: string; access: Access }[]>;
}): Promise<Response> {
  const asked = input.url.searchParams.getAll("resource");
  if (asked.length !== 1 || asked[0] === "") return answer(400);
  const resource = asked[0]!;
  const found = hostOf(resource);
  if (found === null) return answer(400);
  const ours = input.hosts.map((host) => host.toLowerCase());
  if (!ours.includes(found.host.toLowerCase())) return answer(404);
  const links = [{ rel: ISSUER_REL, href: input.issuer }];
  if (found.user.toLowerCase() !== "coke") {
    return answer(200, { subject: resource, links });
  }
  const bays = await input.bays();
  const properties = Object.fromEntries(
    CODES.map((code) => {
      const bay = bays.find((entry) => entry.code === code);
      const state =
        bay === undefined
          ? "EMPTY"
          : bay.access === "public"
            ? "READY"
            : "LOCKED";
      return [`${input.root}/#bay-${code}`, state];
    }),
  );
  return answer(200, { subject: resource, properties, links });
}
