import { describe, expect, it } from "vitest";

import {
  INTERNAL_HOSTS,
  INTERNAL_URLS,
  LOCAL_VITE_PORTS,
  LOCAL_WORKER_PORTS,
  PUBLIC_SUBDOMAINS,
  applicationForSubdomain,
  localWorkerOrigin,
  publicHost,
  workerName,
} from "./index";

describe("Pawl topology", () => {
  it("knows only Pawl's own two applications", () => {
    expect(Object.keys(PUBLIC_SUBDOMAINS)).toEqual(["gateway", "pass"]);
    expect(Object.keys(LOCAL_WORKER_PORTS)).toEqual(["gateway", "pass"]);
    expect(Object.keys(LOCAL_VITE_PORTS)).toEqual(["gateway", "pass"]);
    expect(Object.keys(INTERNAL_HOSTS)).toEqual(["PASS", "GATEWAY"]);
    expect(INTERNAL_URLS).not.toHaveProperty("LINK_PURGE");
  });

  it("assigns every local process a unique port", () => {
    const ports = [
      ...Object.values(LOCAL_WORKER_PORTS),
      ...Object.values(LOCAL_VITE_PORTS),
    ];
    expect(new Set(ports).size).toBe(ports.length);
  });

  it("derives public and local locations", () => {
    expect(publicHost("example.test", "gateway")).toBe("example.test");
    expect(publicHost("example.test", "pass")).toBe("paw.example.test");
    expect(applicationForSubdomain("paw")).toBe("pass");
    expect(localWorkerOrigin("pass")).toBe("http://127.0.0.1:8787");
    expect(applicationForSubdomain("port")).toBeUndefined();
    expect(workerName("pawl", "pass")).toBe("pawl-pass");
  });

  it("keeps internal URLs attached to their declared host", () => {
    expect(new URL(INTERNAL_URLS.SESSION_VERIFY).host).toBe(
      INTERNAL_HOSTS.PASS,
    );
  });

  it("names no application that left the platform", () => {
    expect(PUBLIC_SUBDOMAINS).not.toHaveProperty("pulse");
    expect(LOCAL_WORKER_PORTS).not.toHaveProperty("pulse");
    expect(LOCAL_VITE_PORTS).not.toHaveProperty("pulse");
    expect(INTERNAL_HOSTS).not.toHaveProperty("PULSE");
    expect(INTERNAL_URLS).not.toHaveProperty("PULSE_REPORT_NOTIFY");
  });
});
