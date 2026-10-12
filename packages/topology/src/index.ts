export const PUBLIC_SUBDOMAINS = {
  gateway: "",
  pass: "paw",
} as const;

export type PublicApplication = keyof typeof PUBLIC_SUBDOMAINS;

export const LOCAL_WORKER_PORTS = {
  gateway: 8786,
  pass: 8787,
} as const;

export type WorkerApplication = keyof typeof LOCAL_WORKER_PORTS;

export const LOCAL_VITE_PORTS = {
  gateway: 3000,
  pass: 3001,
} as const;

export const INTERNAL_HOSTS = {
  PASS: "pass.internal",
  GATEWAY: "gateway.internal",
} as const;

export const INTERNAL_URLS = {
  VERIFICATION_CHECK: `http://${INTERNAL_HOSTS.PASS}/internal/challenge`,
  IDENTITY_LOOKUP: `http://${INTERNAL_HOSTS.PASS}/internal/identity`,
  ADMINS_LOOKUP: `http://${INTERNAL_HOSTS.PASS}/internal/admins`,
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

export function applicationForSubdomain(
  subdomain: string,
): PublicApplication | undefined {
  return (Object.entries(PUBLIC_SUBDOMAINS).find(
    ([, value]) => value === subdomain,
  )?.[0] ?? undefined) as PublicApplication | undefined;
}
