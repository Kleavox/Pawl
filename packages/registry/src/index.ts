import init, { initSync, WasmRegistry } from "../pkg/registry.js";
import type {
  ApexTarget,
  Binding,
  OutsideEntry,
  PublicView,
  Route,
  Target,
} from "./types.js";

export type * from "./types.js";

export const EMPTY_MANIFEST = JSON.stringify({
  site: { name: "Pawl" },
  apps: [],
});

export function withOutsideApps(
  manifestJson: string,
  apps: readonly OutsideEntry[],
): string {
  if (apps.length === 0) return manifestJson;
  const manifest = JSON.parse(manifestJson) as { apps?: unknown[] };
  return JSON.stringify({
    ...manifest,
    apps: [
      ...(manifest.apps ?? []),
      ...apps.map((app) => ({
        key: app.key,
        label: app.label,
        title: app.title,
        href: app.origin,
        access: app.access,
        card: app.card,
      })),
    ],
  });
}

export class Registry {
  readonly #inner: WasmRegistry;

  constructor(json: string) {
    this.#inner = new WasmRegistry(json);
  }

  route(host: string, rootHost: string, path: string): Route {
    return JSON.parse(this.#inner.route(host, rootHost, path)) as Route;
  }

  apex(): ApexTarget | null {
    return JSON.parse(this.#inner.apex()) as ApexTarget | null;
  }

  estateTargets(): Target[] {
    return JSON.parse(this.#inner.estateTargets()) as Target[];
  }

  purgeTargets(): Target[] {
    return JSON.parse(this.#inner.purgeTargets()) as Target[];
  }

  bindings(): Binding[] {
    return JSON.parse(this.#inner.bindings()) as Binding[];
  }

  isReserved(slug: string): boolean {
    return this.#inner.isReserved(slug);
  }

  reservedSlugs(): string[] {
    return JSON.parse(this.#inner.reservedSlugs()) as string[];
  }

  publicView(rootOrigin: string, passOrigin: string): PublicView {
    return JSON.parse(
      this.#inner.publicView(rootOrigin, passOrigin),
    ) as PublicView;
  }

  normalized(): string {
    return this.#inner.normalized();
  }

  siteName(): string {
    return this.#inner.siteName();
  }
}

let cached: { json: string; registry: Registry } | undefined;

export function registryFor(json: string): Registry {
  if (cached?.json === json) return cached.registry;
  const registry = new Registry(json);
  cached = { json, registry };
  return registry;
}

export async function initRegistry(
  wasm: WebAssembly.Module | BufferSource,
): Promise<void> {
  await init({ module_or_path: wasm });
}

export function initRegistrySync(
  wasm: WebAssembly.Module | BufferSource,
): void {
  initSync({ module: wasm });
}

export function withInitRegistry<F extends (...args: never[]) => unknown>(
  wasm: WebAssembly.Module | BufferSource,
  app: { fetch: F },
): F {
  let ready: Promise<void> | undefined;
  const handler = async (...args: Parameters<F>) => {
    ready ??= initRegistry(wasm);
    await ready;
    return app.fetch(...args);
  };
  return handler as unknown as F;
}
