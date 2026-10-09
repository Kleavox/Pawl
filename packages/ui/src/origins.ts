import { publicOrigin } from "@pawl/topology";

const EXAMPLE_DOMAIN = "example.com";

export const ROOT_ORIGIN =
  import.meta.env.VITE_ROOT_ORIGIN ?? publicOrigin(EXAMPLE_DOMAIN, "gateway");
export const LINK_ORIGIN =
  import.meta.env.VITE_LINK_ORIGIN ?? publicOrigin(EXAMPLE_DOMAIN, "link");
export const PASS_ORIGIN =
  import.meta.env.VITE_PASS_ORIGIN ?? publicOrigin(EXAMPLE_DOMAIN, "pass");
export const ROOT_HOST = new URL(ROOT_ORIGIN).host;

export function signInUrl(returnTo = window.location.href): string {
  const url = new URL(PASS_ORIGIN);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function challengeUrl(
  scope: "basic" | "fresh",
  returnTo = window.location.href,
): string {
  const url = new URL("/challenge", PASS_ORIGIN);
  url.searchParams.set("scope", scope);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}
