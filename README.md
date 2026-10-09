# Pawl

Pawl is an identity provider and the front door for a set of apps on one
domain. This repository holds both Cloudflare Workers, their browser applications, the shared
TypeScript packages, the Rust/WASM cryptography module, and their build and
deployment tooling.

Short links and Drops live in the sibling repository `desmyx`; monitoring lives in `krynodes`. The Portfolio is
maintained in a separate repository and is only reached by Gateway through a
Cloudflare service binding.

## Runtime architecture

```text
Browser
  |
Gateway Worker ----- PORTFOLIO binding ---- external Portfolio Worker
  | PASS binding
  | LINK binding --------------------------- Link Worker, deployed from desmyx
  |
  +-- Pass Worker ---- D1 + session KV
```

| Runtime | Responsibility                                                                      |
| ------- | ----------------------------------------------------------------------------------- |
| Gateway | Public entry point, canonical routing, static Web app, and explicit service proxies |
| Pass    | Accounts, verifier-only authentication, sessions, OAuth, and account lifecycle      |

A service binding resolves by Worker name, not by source tree, so the `LINK`
binding reaches the Worker desmyx deploys from its own repository.

Gateway routing is explicit. Adding a public API prefix requires registering its
owner deliberately; there is no catch-all proxy to another Worker.

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
- `desmyx` checked out beside this repository, for E2E tests only

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

| Command                                 | Purpose                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm build`                            | Build all TypeScript applications, Workers, and packages                |
| `pnpm test`                             | Run workspace unit tests                                                |
| `pnpm typecheck`                        | Type-check runtime and tooling interfaces with TypeScript 7             |
| `pnpm lint`                             | Verify formatting, unused files and exports, and async error handling   |
| `pnpm lint:async`                       | Reject async event handlers that discard their failure                  |
| `pnpm lint:ports`                       | Reject a Worker dev port that drifts from `packages/topology`           |
| `pnpm format:check`                     | Verify repository formatting                                            |
| `pnpm native:check`                     | Validate Rust formatting and tests                                      |
| `pnpm check`                            | Run the complete static, unit, native, and build verification gate      |
| `pnpm e2e`                              | Reset local Wrangler state and test Gateway, Pass, and Link in Chromium |
| `pnpm health:check`                     | Verify deployed public service health endpoints                         |
| `pnpm admin:promote -- --email <email>` | Promote an existing verified account to admin                           |

`pnpm e2e` boots the Link Worker from `../desmyx`. It refuses to start when that
folder is missing rather than passing by not testing.

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
