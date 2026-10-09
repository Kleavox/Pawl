export const COMPATIBILITY_DATE = "2026-06-05";

export const PUBLIC_SUBDOMAINS = {
  gateway: "",
  pass: "paw",
  link: "link",
  portfolio: "port",
} as const;

export type PublicApplication = keyof typeof PUBLIC_SUBDOMAINS;

export const LOCAL_WORKER_PORTS = {
  gateway: 8786,
  pass: 8787,
  link: 8788,
} as const;

export type WorkerApplication = keyof typeof LOCAL_WORKER_PORTS;

export const LOCAL_VITE_PORTS = {
  gateway: 3000,
  pass: 3001,
  link: 3002,
  portfolio: 3004,
} as const;

export const INTERNAL_HOSTS = {
  PASS: "pass.internal",
  LINK: "link.internal",
  GATEWAY: "gateway.internal",
} as const;

export const INTERNAL_URLS = {
  SESSION_VERIFY: `http://${INTERNAL_HOSTS.PASS}/internal/session`,
  SESSION_LOGOUT: `http://${INTERNAL_HOSTS.PASS}/internal/logout`,
  VERIFICATION_CHECK: `http://${INTERNAL_HOSTS.PASS}/internal/challenge`,
  IDENTITY_LOOKUP: `http://${INTERNAL_HOSTS.PASS}/internal/identity`,
  ADMINS_LOOKUP: `http://${INTERNAL_HOSTS.PASS}/internal/admins`,
  LINK_PURGE: `http://${INTERNAL_HOSTS.LINK}/internal/purge-user`,
} as const;

export function publicHost(
  rootDomain: string,
  application: PublicApplication,
): string {
  const subdomain = PUBLIC_SUBDOMAINS[application];
  return subdomain ? `${subdomain}.${rootDomain}` : rootDomain;
}

export function publicOrigin(
  rootDomain: string,
  application: PublicApplication,
): string {
  return `https://${publicHost(rootDomain, application)}`;
}

export function localWorkerOrigin(
  application: WorkerApplication,
  hostname = "127.0.0.1",
): string {
  return `http://${hostname}:${LOCAL_WORKER_PORTS[application]}`;
}

export function localViteOrigin(
  application: PublicApplication,
  hostname = "localhost",
): string {
  return `http://${hostname}:${LOCAL_VITE_PORTS[application]}`;
}

export function workerName(
  prefix: string,
  application: PublicApplication,
): string {
  return `${prefix}-${application}`;
}

export function applicationForSubdomain(
  subdomain: string,
): PublicApplication | undefined {
  return (Object.entries(PUBLIC_SUBDOMAINS).find(
    ([, value]) => value === subdomain,
  )?.[0] ?? undefined) as PublicApplication | undefined;
}
