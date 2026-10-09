# Pawl

Pawl is an identity provider and the front door for a set of apps on one
domain. This repository holds both Cloudflare Workers, their browser applications, the shared
TypeScript packages, the Rust/WASM cryptography module, and their build and
deployment tooling.

The apps it fronts live in their own repositories and are registered through a
manifest; see [Registering apps](#registering-apps).

## Runtime architecture

```text
Browser
  |
Gateway Worker ----- APP_<KEY> bindings ---- every app in the manifest
  | PASS binding
  |
  +-- Pass Worker ---- D1 + session KV
```

| Runtime | Responsibility                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------- |
| Gateway | Public entry point, routing by the manifest, the static cabinet, `/api/estate`                  |
| Pass    | Accounts, verifier-only authentication, sessions, the OpenID Connect provider, account deletion |

Pawl names no app of its own. Every app it fronts arrives through a manifest:
the gateway binds each one as `APP_<KEY>`, reaches it on `<key>.internal`, and
the cabinet, the header and the footer are built from the same list. A service
binding resolves by Worker name, so an app can live in any repository.

## Registering apps

The manifest is one JSON document:

```json
{
  "site": { "name": "Example", "reservedSlugs": ["blog"] },
  "apps": [
    {
      "key": "notes",
      "label": "notes",
      "title": "Notes",
      "subdomain": "notes",
      "service": "notes",
      "proxy": ["/api/notes/"],
      "apex": { "resolve": "/internal/resolve/", "fileSlugPrefix": "n_" },
      "estate": true,
      "purge": true,
      "header": { "noun": "notes" },
      "access": "visitor",
      "local": { "port": 8790 }
    },
    {
      "key": "docs",
      "label": "docs",
      "title": "Docs",
      "subdomain": "docs",
      "service": "docs",
      "local": { "port": 8791 }
    }
  ]
}
```

| Field                | Rule                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site.name`          | 1–32 printable characters; the cabinet's wordmark, the header brand and the legal pages' operator name                                                                                       |
| `site.reservedSlugs` | optional, each `[a-z0-9-]{1,32}`; added to the apex slug reservation                                                                                                                         |
| `key`                | `^[a-z][a-z0-9]{1,15}$`, unique, not `gateway`, `pass`, `pawl`. Binding `APP_<KEY>`, internal host `<key>.internal`                                                                          |
| `label`              | `^[a-z0-9-]{1,12}$`; printed on the cartridge in capitals. Four characters or fewer makes a tall cartridge, more makes a wide one                                                            |
| `title`              | 1–32 printable characters                                                                                                                                                                    |
| `subdomain`          | optional, `^[a-z][a-z0-9-]{0,30}$`, unique, not `paw`, `pass`, `www`. An app with a subdomain takes a bay; at most nine                                                                      |
| `service`            | Worker name suffix (`<WORKER_PREFIX>-<service>`); required when `subdomain`, `proxy`, `apex`, `estate` or `purge` is set                                                                     |
| `proxy`              | prefixes starting and ending with `/`, unique and non-overlapping, never under `/api/estate`, `/api/session`, `/api/logout`, `/api/auth/`, `/oauth/`, `/.well-known/`, `/health`, `/assets/` |
| `apex`               | at most one app; `resolve` starts and ends with `/`; `fileSlugPrefix` optional, like `n_`                                                                                                    |
| `estate`, `purge`    | the app implements the contract below                                                                                                                                                        |
| `header`             | optional `{ noun }`, requires `estate`; the app appears in the shared header with its count                                                                                                  |
| `access`             | optional `public` (default), `visitor` or `owner`: who may take the app's bay                                                                                                                |
| `bay`                | optional pin `"1"`–`"9"`. Bays are placed automatically from the key; `pawl manifest pin` writes the current placement so a later app never moves an earlier one                             |
| `local`              | optional `{ port }` or `{ vitePort }`, unique, not 8786, 8787, 3000, 3001                                                                                                                    |

Unknown fields are refused, so a typo is an error rather than a missing app.

Where the manifest lives:

- **Locally:** `estate.json` at the repository root. It is gitignored; never
  commit a deployment's manifest.
- **In CI:** `tooling/e2e/fixture/estate.json`, which registers two invented
  apps that the end-to-end suite boots as a fixture Worker.
- **In deploy:** the GitHub Actions variable `ESTATE_MANIFEST` (Settings →
  Secrets and variables → Actions → Variables), holding the whole JSON
  document. `deploy-config render` refuses to run without it.

## The app contract

Every call goes through the app's service binding to `<key>.internal`, carrying
the viewer's `cookie` and `x-pawl-public-host` headers.

**Estate**, `GET /.well-known/pawl/estate`:

```json
{
  "count": 12,
  "severity": "warn",
  "attention": [
    {
      "kind": "item-expiring",
      "severity": "warn",
      "title": "/abc",
      "detail": "report.pdf, 4 downloads",
      "since": "2026-10-09T10:00:00.000Z",
      "age": "remaining",
      "href": "https://notes.example.test/"
    }
  ]
}
```

- `count` is a non-negative integer; `severity` is `warn`, `danger` or `null`.
- `401` or `403` means the viewer may not see the app: its indicator is locked.
- Any other status, a network failure or a wrong-shaped body means unknown,
  never zero.
- An attention item whose `href` is not on the app's own public origin is
  dropped. Build it on the host `x-pawl-public-host` names.

**Purge**, `POST /.well-known/pawl/purge-user?id=<account id>`: answer `2xx`
once the app holds nothing more for that account. Pass deletes an account only
after every `purge: true` app has answered `2xx`. Answer it only on
`<key>.internal`.

**Apex short links:** for the one `apex` app, the gateway forwards an unreserved
apex path segment to `http://<key>.internal<resolve><slug>` with
`x-pawl-public-host` and `x-pawl-trace-id`. A `404` falls through to the
static site; a slug starting with `fileSlugPrefix` that resolves to `404` is
then fetched from the app as a page.

**Proxies and subdomains:** a request on `<subdomain>.<root>` is handed to the
app unchanged; a request under a `proxy` prefix on the root host is handed to
it with its host rewritten to `<key>.internal`.

An app that serves static assets first must let `/.well-known/*` reach its
Worker (Wrangler's `assets.run_worker_first`).

## Local development with apps

Render local Worker configs from your manifest, then start the Workers with
them:

```bash
pnpm --filter @pawl/deploy exec deploy-config render-local --manifest estate.json --out .wrangler/local
pnpm exec wrangler dev --config .wrangler/local/pass.json --port 8787 --persist-to workers/pass/.wrangler/state
pnpm exec wrangler dev --config .wrangler/local/gateway.json --port 8786
```

The rendered pass config carries a throwaway signing key made for that run.
Start each app's own Worker on the `local.port` its manifest entry names.

## Repository layout

| Path                                                         | Contents                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `apps/web`                                                   | Static Vite + TypeScript vending-machine home                     |
| `apps/pass`                                                  | React account and authentication application                      |
| `workers/gateway`                                            | Root-domain router and application gateway                        |
| `workers/pass`                                               | Identity API backed by D1 and KV                                  |
| `packages/pawl-protocol`                                     | Runtime-validated messages shared across application seams        |
| `packages/topology`                                          | Canonical Worker names, hosts, origins, and local ports           |
| `packages/auth`, `config`, `core`, `testing`, `ui`, `worker` | Shared TypeScript capabilities                                    |
| `packages/crypto`, `crates/crypto`                           | Rust/WASM password derivation and streaming encryption            |
| `tooling`                                                    | Deployment, E2E, health-check, lint, TypeScript, and Vite tooling |

`workers/pass/src/account/lifecycle.ts` owns credential rotation, session
invalidation, and cross-service account deletion.

## Technology

- TypeScript 7 native compiler, React, Vite, Hono, and Cloudflare Workers
- D1 for relational state and KV for sessions
- Rust compiled to WebAssembly for cryptography
- pnpm workspaces and Turborepo for orchestration

## Requirements

- Node.js 22.13 or newer
- pnpm 11.17
- Rust stable with the `wasm32-unknown-unknown` target
- `wasm-pack` 0.15
- Chromium installed through Playwright for E2E tests

## Setup

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked --version 0.15.0
pnpm install
pnpm --filter @pawl/e2e e2e:install
```

Source-controlled Wrangler configurations use local placeholder resources.
Local development does not require production credentials. Put browser
overrides in `.env.local` and Worker secrets in `.dev.vars`; both are ignored by
Git. Each app's `.env.example` already carries the local origins from
`packages/topology`, so `cp .env.example .env.local` in `apps/*` is enough.

Those origins are baked in at build time and each Worker serves its app from
`dist/`, so an app built without them points at the production hostnames and
signs nobody in locally. `tooling/e2e/prepare.mjs` builds with the right values;
so does a plain `pnpm build` once `.env.local` exists.

## Development

Run all workspace development tasks:

```bash
pnpm dev
```

Build an application and run its Worker individually when working on one
service:

```bash
pnpm --filter @pawl/pass-app build
pnpm --dir workers/pass exec wrangler dev --port 8787
```

Wrangler's local service registry connects Workers started in separate
terminals. The canonical local ports and service names are maintained in
`packages/topology`, and each Worker's `wrangler.jsonc` pins its own `dev.port`
to match. Without that pin every Worker takes Wrangler's default 8787, all of
them bind the same socket, and only one of them answers, so `pnpm lint:ports`
fails the build if the two ever disagree.

Restart `wrangler dev` after any build: it serves stale assets from `dist`
otherwise.

## Commands

| Command                                                             | Purpose                                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm build`                                                        | Build all TypeScript applications, Workers, and packages                     |
| `pnpm test`                                                         | Run workspace unit tests                                                     |
| `pnpm typecheck`                                                    | Type-check runtime and tooling interfaces with TypeScript 7                  |
| `pnpm lint`                                                         | Verify formatting, unused files and exports, and async error handling        |
| `pnpm lint:async`                                                   | Reject async event handlers that discard their failure                       |
| `pnpm lint:ports`                                                   | Reject a Worker dev port that drifts from `packages/topology`                |
| `pnpm format:check`                                                 | Verify repository formatting                                                 |
| `pnpm native:check`                                                 | Validate Rust formatting and tests                                           |
| `pnpm check`                                                        | Run the complete static, unit, native, and build verification gate           |
| `pnpm e2e`                                                          | Reset local Wrangler state and test Gateway, Pass and the fixture apps       |
| `pnpm health:check`                                                 | Verify deployed public service health endpoints                              |
| `pnpm pawl keygen`                                                  | Make the provider signing key and pairwise subject secret, printed once      |
| `pnpm pawl manifest check estate.json`                              | Validate a manifest and print where each app sits in the cabinet             |
| `pnpm pawl manifest pin estate.json`                                | Write the current bay placement into the manifest so it never moves          |
| `pnpm admin:client -- --id <id> --name <name> --redirect-uri <uri>` | Register an OpenID Connect client; a confidential one prints its secret once |
| `pnpm admin:promote -- --email <email>`                             | Promote an existing verified account to admin                                |

`pnpm e2e` registers two fixture apps from `tooling/e2e/fixture/estate.json` and
boots them as a fixture Worker. Each Worker has a health check, so the run stops
before any test when one of them is down rather than passing by not testing.

Authentication protocol changes must pass both verification gates:

```bash
pnpm check
pnpm e2e
```

## Security invariants

- Passwords and Master Keys never cross the browser-to-Worker boundary.
- Account private keys are persisted only in wrapped form.
- Password reset rotates the account key pair, so Drops encrypted to the old
  public key become unreadable by design.
- Drop encryption is end-to-end: the key lives only in the URL fragment. Pawl
  adds no credential path and carries no key material.
- No admin account-deletion or role-promotion endpoint exists.

## CI and deployment

Pull requests run the `Validate` workflow, including unit, native, build, and
E2E checks selected by changed paths.

Production deployment is manual through `.github/workflows/deploy.yml` and the
protected GitHub `production` environment. Run it first with `domains=none`,
verify migrations and Workers, then run it with `domains=canonical` to attach
public domains. The workflow is the source of truth for required variables,
secrets, deployment order, migrations, and health checks.

No production credential is required to build or test this repository.

## TypeScript configuration

Runtime-specific compiler presets live in `tooling/typescript` and are consumed
through `@pawl/typescript`. Browser, Worker, Node, and emitted library
projects do not share ambient types accidentally. TypeScript 7 runs one checker
per workspace process while Turborepo controls parallelism across workspaces.

Libraries built by `tsc` are checked during their build. Separate `typecheck`
tasks are reserved for Vite applications, Wrangler Workers, tests, and tooling
whose normal build step does not perform full type analysis.

### Why there is no ESLint

`typescript-eslint` refuses to load against TypeScript 7 and throws rather than
warning, so no rule that needs a TypeScript parser can run here, including ones
that need no type information at all. Support is tracked in
[typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940).

The rules this repository actually wanted were `no-floating-promises`,
`no-misused-promises`, and `react-hooks/exhaustive-deps`. In August 2026 the
first two would have caught fourteen event handlers that awaited an API call and
dropped the rejection, leaving the control looking broken and the operator with
no message. `tooling/lint/unhandled-async.mjs` stands in for them until the
parser lands: it is narrower than the real rules and only guards that one class.
Replace it with ESLint when TypeScript 7 is supported, not before.
