import {
  LOCAL_VITE_PORTS,
  LOCAL_WORKER_PORTS,
  applicationForSubdomain,
  localViteOrigin,
  localWorkerOrigin,
  type PublicApplication,
  type WorkerApplication,
} from "@pawl/topology";

export {
  INTERNAL_HOSTS,
  INTERNAL_URLS,
  PUBLIC_SUBDOMAINS,
  publicHost,
} from "@pawl/topology";

export const SESSION_COOKIE = "__Secure-pawl_session";
export const VERIFICATION_COOKIE = "__Secure-pawl_verified";

const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/u;

function isLoopbackHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "[::1]" || hostname === "::1") return true;
  return LOOPBACK_IPV4.test(hostname);
}

function hasWorker(
  application: PublicApplication,
): application is WorkerApplication {
  return application in LOCAL_WORKER_PORTS;
}

function localOrigin(
  url: URL,
  application: PublicApplication,
): string | undefined {
  if (url.port === String(LOCAL_WORKER_PORTS.gateway)) {
    return hasWorker(application)
      ? localWorkerOrigin(application, url.hostname)
      : localViteOrigin(application, url.hostname);
  }
  if (url.port === String(LOCAL_VITE_PORTS.gateway)) {
    return localViteOrigin(application, url.hostname);
  }
  return undefined;
}

export function getPublicOrigin(
  rootOrigin: string,
  subdomain?: string,
): string {
  const url = new URL(rootOrigin);
  if (!subdomain) return url.origin;

  if (isLoopbackHost(url.hostname)) {
    const application = applicationForSubdomain(subdomain);
    if (application === undefined) return url.origin;
    const local = localOrigin(url, application);
    if (local !== undefined) return local;
    console.warn(
      `getPublicOrigin: ${rootOrigin} is on no known local port family, so "${subdomain}" resolves to the root origin and its link will point at the wrong app`,
    );
    return url.origin;
  }

  return `https://${subdomain}.${url.host}`;
}
