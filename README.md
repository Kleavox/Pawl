# Pawl

Pawl is an identity provider and the front door for a set of apps on one
domain. It deploys as one Cloudflare Worker, `pawl`, with one D1 database and
one KV namespace, both also named `pawl`. This repository holds that Worker,
its two browser applications, the shared TypeScript packages, the Rust
modules, and the `pawl` operator binary that renders, provisions and deploys
it.

The apps it fronts live in their own repositories and are registered through a
manifest; see [Registering apps](#registering-apps).

## Layout

| Path                                               | Contents                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `worker`                                           | The Worker: `src/pass` (the identity provider), `src/gateway` (the front door), `src/dispatch.ts` (which half answers), D1 migrations |
| `apps/web`                                         | React + Vite + Tailwind cabinet and receipts, prerendered and hydrated                                                                |
| `apps/pass`                                        | React sign-in and account application on `paw.`, its shell prerendered                                                                |
| `packages/protocol`                                | Runtime-validated messages shared across application seams                                                                            |
| `packages/topology`                                | Canonical hosts, origins, and local ports                                                                                             |
| `packages/auth`, `config`, `core`, `testing`, `ui` | Shared TypeScript capabilities                                                                                                        |
| `packages/crypto`, `crates/crypto`                 | Rust/WASM password derivation and streaming encryption                                                                                |
| `packages/oidc`, `crates/oidc`                     | Rust/WASM ES256 signing and verification, PKCE, pairwise subjects                                                                     |
| `packages/registry`, `crates/registry`             | Rust/WASM manifest validation and routing                                                                                             |
| `crates/cli`                                       | The `pawl` operator binary: assets, local configs, deploy, clients, admins                                                            |
| `tooling`                                          | E2E, the local provider port, health-check, lint, TypeScript, and Vite tooling                                                        |

`worker/src/pass/account/lifecycle.ts` owns credential rotation, session
invalidation, and cross-service account deletion.

```text
Browser ── pawl Worker ─┬─ paw.<root> ─────── provider half ── D1 pawl + KV pawl
                        └─ everything else ── gateway half ─── APP_<KEY> bindings
```

| Half     | Answers                              | Responsibility                                                                                  |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Gateway  | the root, `www.`, `gateway.internal` | Public entry point, routing by the manifest, the static cabinet, `/api/estate`                  |
| Provider | `paw.<root>`, `pass.internal`        | Accounts, verifier-only authentication, sessions, the OpenID Connect provider, account deletion |

The halves call each other in-process on their `.internal` names, which no
request from the internet can carry, so the provider's `/internal/*` routes stay
private. Every other request has its `x-pawl-*` headers removed before either
half sees it. The Worker has one asset directory, `worker/assets`, assembled by
`pawl assets` at build: the cabinet at its root, the account app under `/pass/`.
The provider half serves `/pass/<path>` on its own host, the gateway half
refuses `/pass/*`, and each host gets exactly one Content-Security-Policy.

Pawl names no app of its own. Every app it fronts arrives through a manifest:
the gateway binds each one as `APP_<KEY>`, reaches it on `<key>.internal`, and
the cabinet, the header and the footer are built from the same list. A service
binding resolves by Worker name, so an app can live in any repository.

- TypeScript 7 native compiler, React, Vite, Tailwind CSS v4, Hono, and
  Cloudflare Workers
- D1 for relational state and KV for sessions
- Rust compiled to WebAssembly for cryptography
- pnpm workspaces and Turborepo for orchestration

## Develop

### Requirements

- Node.js 22.13 or newer
- pnpm 11.17
- Rust stable with the `wasm32-unknown-unknown` target
- `wasm-pack` 0.15
- Chromium installed through Playwright for E2E tests

### Setup

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

### Running the Worker

```bash
pnpm build
pnpm dev
```

`pnpm dev` starts the Worker on 8786 and, on 8787, a forwarder from
`tooling/dev` that hands every request, URL untouched, to the Worker. Locally
the halves are told apart by port: 8787 is the provider, 8786 the cabinet,
under either loopback name, so the two stay same-site as `paw.<root>` and
`<root>` are. `pnpm lint:ports` fails the build if a port drifts from
`packages/topology`.

Restart `wrangler dev` after any build: it serves stale assets otherwise.

### With apps

Render a local config from your manifest, then start the Worker with it:

```bash
pnpm pawl render --local --manifest estate.json
pnpm exec wrangler dev --config .wrangler/local/pawl.json --port 8786 --persist-to worker/.wrangler/state
pnpm --dir tooling/dev exec wrangler dev
```

The rendered config carries a throwaway signing key made for that run. Start
each app's own Worker on the `local.port` its manifest entry names.

## Check

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
| `pnpm e2e`                                                          | Reset local Wrangler state and test the Worker and the fixture apps          |
| `pnpm health:check`                                                 | Verify deployed public service health endpoints                              |
| `pnpm pawl deploy`                                                  | Provision, migrate and deploy the Worker (what the deploy job runs)          |
| `pnpm pawl manifest check estate.json`                              | Validate a manifest and print where each app sits in the cabinet             |
| `pnpm pawl manifest pin estate.json`                                | Write the current bay placement into the manifest so it never moves          |
| `pnpm admin:client -- --id <id> --name <name> --redirect-uri <uri>` | Register an OpenID Connect client; a confidential one prints its secret once |
| `pnpm admin:promote -- --email <email>`                             | Promote an existing verified account to admin                                |

`pnpm e2e` registers two fixture apps from `tooling/e2e/fixture/estate.json`
and boots them as fixture Workers, plus a third relying party on 8792 that
signs in with a client secret, as an app behind Cloudflare Access does. Each Worker has a health check, so the run stops
before any test when one of them is down rather than passing by not testing.

Authentication protocol changes must pass both verification gates:

```bash
pnpm check
pnpm e2e
```

## Production

A push to `main` runs the `Validate` workflow; when it passes, its `deploy` job
ships the Worker. **Run workflow** on `Validate` deploys by hand. The job runs
`pnpm pawl deploy`, which:

1. finds the D1 database `pawl` and the KV namespace `pawl`, creating them when
   missing, so no id is stored anywhere but Cloudflare. D1 is created in
   `apac`: its location is fixed at creation, and without a hint it follows
   the runner to the US;
2. renders the Worker's config from `ROOT_DOMAIN` and `ESTATE_MANIFEST`;
3. applies D1 migrations;
4. makes, once, each secret the Worker does not already hold:
   `OIDC_SIGNING_KEY`, `OIDC_SUB_SECRET`, `IP_HASH_SECRET`, and the cabinet's
   `OIDC_CLIENT_SECRET`, registering the cabinet as the client `gateway` with
   its hash. They go straight into the Worker's secrets, are never printed, and
   a later deploy keeps them;
5. deploys with the domains `<root>`, `www.<root>` and `paw.<root>` attached;
6. promotes the account in `ADMIN_EMAIL` to admin once it exists and its
   address is verified: sign up with that address after the first deploy,
   verify it, then deploy again. An unverified account is never promoted.

Then the job checks the public health endpoints.

Settings live in GitHub (Settings → Secrets and variables → Actions); nothing
of a deployment lives in this repository:

| Kind     | Name                                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variable | `ROOT_DOMAIN`, the bare domain (`example.com`); optional `ESTATE_MANIFEST`                                                                                                                                                         |
| Secret   | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET`, `ADMIN_EMAIL` |

Mail is sent as `Pawl <no-reply@ROOT_DOMAIN>`. The API token needs Workers
Scripts Edit, Workers KV Storage Edit, D1 Edit and Account Settings Read, and on
the domain's zone Zone Read, Workers Routes Edit and DNS Edit. A domain still attached to
another Worker fails the deploy at the route step; detach it in the dashboard
first.

Deleting the `pawl` Worker deletes its secrets. The next deploy makes new ones,
and with a new `OIDC_SUB_SECRET` every third-party app sees every person as
someone new.

The privacy policy and the terms name `privacy@ROOT_DOMAIN` as the contact
address, derived at build so the repository holds no address of the operator's.
Route it to a mailbox you read (Cloudflare Email Routing) before publishing.

No production credential is required to build or test this repository.

## The machine

Every page Pawl serves is one steel-and-cobalt vending machine, drawn by the
`Machine` React component in `@pawl/ui` and styled with Tailwind classes over
`@pawl/ui/theme.css`, the only stylesheet; the Worker's own pages (404, 500,
consent) are the same components rendered to static markup with the compiled
CSS inlined. There is no page header and no page footer anywhere, and there is
no pass card.

| Part               | What it carries                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marquee (crown)    | The site's wordmark, a dot-matrix ticker (what needs a look, a welcome, or `SIGNED OUT`), and the pass chip (`GUEST MODE`, `VISITOR MODE`, `OWNER MODE`)                                                                                                                                                                                                                                                                                                |
| Display            | A digital screen in a screwed bezel showing one screen at a time: the nine bays as tiles (bay code, cartridge art, name and a badge: the estate count, `--` when it could not be read and never `0`, `SIGN IN` or `OWNER` when the pass does not open it, `OPEN ↗` for a link-only app), working, and the account. Each screen has a top bar (`SIGN IN ▸`, which dollies into `paw.`, or `ACCOUNT ▸`) and a hint foot; screens change under a scan line |
| Speaker and sensor | A perforated grille and a proximity lens                                                                                                                                                                                                                                                                                                                                                                                                                |
| Status LCD         | Two lines that say what the machine is doing; it is the page's live status region                                                                                                                                                                                                                                                                                                                                                                       |
| Placard            | A printed sticker: 1 pick a bay, 2 sign in, 3 take it                                                                                                                                                                                                                                                                                                                                                                                                   |
| Keypad             | On the cabinet it picks bays; on `paw.` it chooses a way to sign in, types the six-digit email code and opens the account's sections. `GO` continues, `CLR` goes back one step. Two lamps say SELECT or CODE; every digit carries its braille cell. A key is lit only when it does something                                                                                                                                                            |
| Lenses             | READY, BUSY, DENIED                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Printer            | Prints every receipt: a taken delivery, `/privacy.html` and `/terms.html` feed out of its slot, tear off on their own and are read in the hand in front of the whole machine; Crumple (or Esc) throws the paper into the delivery bay as a ball                                                                                                                                                                                                         |
| Delivery bay       | A released cartridge drops behind the flap; taking it prints its receipt                                                                                                                                                                                                                                                                                                                                                                                |
| Serial plate       | `PAWL-GW-01`, Privacy, Terms, ©, and the keypad sound switch (off until switched on)                                                                                                                                                                                                                                                                                                                                                                    |

The machine is sized in one unit, `--u`, taken from the viewport, so it fits a
laptop or a phone without scrolling and scales as one object; what the screen
says never resizes it. A guest who presses a locked tile sees it refused, then
the camera dollies into `paw.`'s sign-in, and that bay is released once they
are back.

Pages differ only in the camera's framing: `<root>` frames the whole machine,
a receipt frames the printer, and `paw.<root>`, the OpenID Connect consent
screen and the 404 and 500 pages frame the screen and the control strip.
Moving between them moves only the camera: the leaving page frames the next
page's framing, then goes, and the next page starts there (`#cam=screen` or
`#cam=printer` carries it, read by a one-line inline script that runs before
the camera is parsed and marks the page, so the first frame is already the
hinted one). Every animation runs on the compositor: the camera glides on `transform`, and every keyframe moves only `transform` and `opacity` (a control's hover feedback still repaints, briefly and in place). A receipt
prints from the printer's slot, tears off with an uneven serrated edge at both
ends, and is held up in front of the whole machine while the camera steps
back; it scrolls freely and nothing hangs. A delivery's receipt says the bay,
the item, where it goes or comes from, the pass, the holder and when it was
printed: an app that links away opens ten seconds after the paper is in hand
(Open now goes at once, Stay here stops the count), and an app with a card
prints the card's own words. Done, the paper is crumpled into a ball and
thrown into the delivery bay.
Every key on the keypad presses, and one with nothing to do changes
nothing. `paw.` carries sign-in (a code by email, a password, Google or
GitHub; registering in two steps) and the account (1 Profile, 2 Devices, 3
Apps, 4 Security) inside the display, one short step at a time and lists three
to a page, so nothing scrolls on a laptop or a phone; on consent the keypad's
`CLR` and `GO` deny and allow.

The design tokens are the `--pw-*` custom properties in
`packages/ui/src/theme.css`, offered to Tailwind as `pw-*` colours, fonts and
radii, with `--spacing` set to the machine unit and one breakpoint, `desk`
(900px): one accent (cobalt, for action and selection only) and four status
colours. `pnpm lint:palette` rejects any other colour and `pnpm lint:type` any
text below 0.68rem, reading Tailwind sizes and machine units at the smallest
scale. There is one motion path: nothing reads `prefers-reduced-motion`, so every
viewer gets the same motion and there is one thing to keep under the frame
budget.

## The OpenID Connect provider

Pass is an OpenID Connect provider on `paw.<root>`: Authorization Code with
PKCE (`S256` only), ES256-signed tokens, admin-registered clients with exact
redirect URIs, and no dynamic registration.

| Endpoint                                | Purpose                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `GET /.well-known/openid-configuration` | Discovery                                                                |
| `GET /oauth/authorize`                  | Sign-in, then consent for third-party clients; `prompt=none` never asks  |
| `POST /oauth/consent`                   | The consent form's answer                                                |
| `POST /oauth/token`                     | Code for tokens; refresh for third-party clients                         |
| `GET /oauth/userinfo`                   | Claims for the access token's scopes                                     |
| `GET /oauth/jwks.json`                  | The current and previous public signing keys                             |
| `POST /oauth/revoke`                    | Revoke an access or refresh token, and with it the grant                 |
| `POST /oauth/logout`                    | End this browser's Pawl session (`end_session_endpoint`)                 |
| `GET`/`POST /oauth/connect`             | Consent to an outside app from the cabinet, before its card can be asked |
| `POST /oauth/subjects`                  | Which of a client's subjects still exist (`pawl_subjects_endpoint`)      |

`/oauth/logout` is a form POST, so a cross-site page cannot sign anyone out: the
`SameSite=Lax` session cookie never rides a cross-site POST. It returns to
`post_logout_redirect_uri` only when that URI's origin is the origin of one of
the client's registered redirect URIs, and to Pawl's own page otherwise.

A first-party access token also names the Pawl session it was made in (`sid`).
The gateway renews its own expired token in-process
(`POST pass.internal/internal/renew`) for as long as that session lives, so the
cabinet never redirects to stay signed in, and signing out of Pawl, revoking
the device or changing the password ends the cabinet's session at its next
renewal.

A client registered `--first-party` skips consent, receives the account id as
`sub`, gets no refresh token, and finds the person in its access token: `role`,
`preferred_username` with the `profile` scope, and `email` with
`email_verified` under the `email` scope when the address is verified. A
third-party client's access token carries its pairwise `sub` and `scope` only.
Every client must check that `aud` contains its own client id.

The cabinet's origin may call `/api/auth/otp/start` and `/api/auth/otp/verify`
with credentials, so codes typed on the machine reach Pass directly. No other
route and no other origin is opened.

### Apps as clients

The gateway and every first-party app sign people in through the provider and
keep their own session; nothing is shared across subdomains.

- `GET /auth/signin?returnTo=/path[&prompt=none]` starts Authorization Code with
  PKCE, keeping state, nonce and verifier in a ten-minute `__Host-signin`
  cookie. `returnTo` is a path on the app's own origin and never carries a URL
  fragment.
- `GET /auth/callback` exchanges the code over the `PASS` binding, checks the ID
  token's nonce, verifies the access token (`iss`, `aud` containing the app's
  own client id, `exp`) and keeps it in `__Host-session` on the app's origin.
- Every request reads `__Host-session` against the provider's keys, cached for
  an hour by `kid`; an unknown `kid` is looked up once a minute at most, and
  unreachable keys answer `503 IDENTITY_UNAVAILABLE`, never a guest.
- A browser that arrives at `/` with no session is sent through
  `/auth/signin?prompt=none` once per browser session (`__Host-silent`), so a
  person signed in at Pawl arrives signed in. An ended session asks again; an
  API call made with one answers `401 SESSION_EXPIRED`, and the page renews
  silently.
- `POST /auth/signout` clears the app's session and answers the form the page
  posts to `POST /oauth/logout`, which ends the Pawl session too.

The cabinet sends e-mailed codes to Pawl itself, so the Pawl session lands on
`paw.`, and then makes the silent round trip. The deploy registers the cabinet
as the client `gateway`. Any other app is registered once by hand:

```bash
pnpm admin:client -- --id <id> --name <name> --redirect-uri https://<app>/auth/callback [--first-party]
```

and its printed secret goes where that app reads it. `pawl` finds the D1
database `pawl` by name, so it needs only `wrangler login`.

### Outside apps

An app that runs somewhere else, behind its own address, is registered from
`paw.` instead: an admin opens **Account → Registered apps → New app** and gives
its title, its address (an origin), a label, who may take its bay, its return
address and whether it **shows a card on the cabinet**. Pawl makes a
third-party confidential client whose id is the app's key, shows its secret
once, and puts the app in a bay that links to its address. Registering and
removing need a sign-in within the last 15 minutes; both are audited.
**Remove** deletes the client, and with it every grant.

The registry checks the stored apps together with the manifest, so an outside
app can never take a key, label or address the manifest already uses. When Pawl
cannot list them, the cabinet shows the manifest alone.

`POST /oauth/subjects` takes `{ "subjects": [...] }` (at most 1000) with the
client's Basic credentials and answers `{ "live": [...] }`: the subjects of
that client whose account still exists and still has a grant. An app that asks
now and then can end what it gave a person who deleted their account or
disconnected it.

### Signing in to an app behind Cloudflare Access

An app that Cloudflare Access guards can use Pawl as its login: Access's
generic OpenID Connect login accepts ES256 tokens, `client_secret_basic` and
PKCE, which is what Pawl serves.

1. Register Access as a client, with your Zero Trust team name:

   ```bash
   pnpm admin:client -- --id <app>-access --name "<App>" --redirect-uri https://<team>.cloudflareaccess.com/cdn-cgi/access/callback
   ```

2. In Zero Trust → Settings → Authentication → Login methods, add
   **OpenID Connect** with the printed client id and secret, and from
   `https://paw.<root>/.well-known/openid-configuration` the auth URL
   (`authorization_endpoint`), token URL (`token_endpoint`) and certificate URL
   (`jwks_uri`). Turn **PKCE** on: Pawl refuses a sign-in without it. Scopes
   `openid email profile`; the email claim is `email`.
3. Choose that login method in the app's Access application.

A person consents once, on Pawl, the first time. Pawl sends `email` only when
the address is verified, so an unverified account cannot pass a policy that
names an address. To list the app in the cabinet, give it a manifest entry with
a `subdomain` and nothing else (see below).

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

| Field                | Rule                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site.name`          | 1–32 printable characters; the cabinet's wordmark, the header brand and the legal pages' operator name                                                                                                                     |
| `site.reservedSlugs` | optional, each `[a-z0-9-]{1,32}`; added to the apex slug reservation                                                                                                                                                       |
| `key`                | `^[a-z][a-z0-9]{1,15}$`, unique, not `gateway`, `pass`, `pawl`. Binding `APP_<KEY>`, internal host `<key>.internal`                                                                                                        |
| `label`              | `^[a-z0-9-]{1,12}$`; printed on the cartridge in capitals. Four characters or fewer makes a tall cartridge, more makes a wide one                                                                                          |
| `title`              | 1–32 printable characters                                                                                                                                                                                                  |
| `subdomain`          | optional, `^[a-z][a-z0-9-]{0,30}$`, unique, not `paw`, `pass`, `www`. An app with a subdomain takes a bay; at most nine. With no `service` the app is only a link, listed at `https://<subdomain>.<root>` and never routed |
| `service`            | the app's Worker name, bound as written (locally `local-<service>`); required when `proxy`, `apex`, `estate` or `purge` is set                                                                                             |
| `href`               | optional origin, `https://` (or `http://` on loopback), unique; an app that lives elsewhere. It takes a bay that links there and is never routed, so it has no `subdomain` and no `service`                                |
| `card`               | optional `true`: the cabinet asks the app for a card (below) when its bay is taken; needs `subdomain` or `href`                                                                                                            |
| `proxy`              | prefixes starting and ending with `/`, unique and non-overlapping, never under `/api/estate`, `/api/session`, `/api/logout`, `/api/auth/`, `/api/catalog`, `/api/apps/`, `/oauth/`, `/.well-known/`, `/health`, `/assets/` |
| `apex`               | at most one app; `resolve` starts and ends with `/`; `fileSlugPrefix` optional, like `n_`                                                                                                                                  |
| `estate`, `purge`    | the app implements the contract below                                                                                                                                                                                      |
| `header`             | optional `{ noun }`, requires `estate`; the app appears in the shared header with its count                                                                                                                                |
| `access`             | optional `public` (default), `visitor` or `owner`: who may take the app's bay                                                                                                                                              |
| `bay`                | optional pin `"1"`–`"9"`. Bays are placed automatically from the key; `pawl manifest pin` writes the current placement so a later app never moves an earlier one                                                           |
| `local`              | optional `{ port }` or `{ vitePort }`, unique, not 8786, 8787, 3000, 3001                                                                                                                                                  |

Unknown fields are refused, so a typo is an error rather than a missing app.

Where the manifest lives:

- **Locally:** `estate.json` at the repository root. It is gitignored; never
  commit a deployment's manifest.
- **In CI:** `tooling/e2e/fixture/estate.json`, which registers two invented
  apps that the end-to-end suite boots as fixture Workers.
- **In deploy:** the GitHub Actions variable `ESTATE_MANIFEST` (Settings →
  Secrets and variables → Actions → Variables), holding the whole JSON
  document. Without it Pawl deploys alone.

## The app contract

Every call goes through the app's service binding to `<key>.internal`. The
gateway states who is asking in `x-pawl-user` (the account id) and
`x-pawl-role`, and names the viewer's host in `x-pawl-public-host`. No cookie
travels: each app keeps its own session on its own origin, and a browser can
never state an identity, because the gateway removes every `x-pawl-*` header a
client sent. Believe `x-pawl-user` only on `<key>.internal` and only on the
contract paths.

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
- No `x-pawl-user` means nobody is signed in: answer `401`.
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

**Card**, `GET <app origin>/.well-known/pawl/card`, for an app with `card`.
A delivered cartridge asks the gateway (`GET /api/apps/<key>/card`), which asks
Pawl for a token and the app for its card; taking it prints the card on the
receipt. Before a person has connected the app
once, the cabinet offers **Connect**, which consents on `paw.` and comes back.
The request carries `Authorization: Bearer <token>`: an ES256 token from Pawl's
keys, `iss` Pawl, `aud` the app's client id, `sub` the person's subject for
that app, `token_use: "pawl-card"`, and `email` / `preferred_username` for the
scopes granted; it lasts one minute. Check all of it. Answer `200` with:

```json
{
  "title": "Your DNS address",
  "message": "Use it as the DNS-over-HTTPS address on your devices.",
  "fields": [{ "label": "Client ID", "value": "3f9c…", "copy": true }],
  "action": { "label": "Detail", "href": "https://enroll.example.test/" }
}
```

- `title` 1–40 characters; `message` at most 90; at most two `fields`, each
  `label` at most 20 and `value` at most 70; `action` optional, `label` at most
  16, `href` on the app's own origin. No control characters.
- The body is at most 16 KB and answers within 5 seconds; redirects are not
  followed. Anything else, a single field over its limit included, shows the
  app as not answering, with `--`, never as empty.
- Pawl writes none of it: the receipt prints the app's own words, apart from
  the facts Pawl prints above them.

## Security invariants

- Passwords and Master Keys never cross the browser-to-Worker boundary.
- Account private keys are persisted only in wrapped form.
- Password reset rotates the account key pair, so Drops encrypted to the old
  public key become unreadable by design.
- Drop encryption is end-to-end: the key lives only in the URL fragment. Pawl
  adds no credential path and carries no key material.
- No admin account-deletion or role-promotion endpoint exists.
- The provider's keys and the cabinet's client secret are made by the deploy,
  stored only as the Worker's secrets, and never printed.
- Signing in is counted at the edge (`SIGNIN_RATE_LIMIT`, per route per IP and
  per address), never in KV or D1, so a flood of attempts cannot spend the
  quota real sign-ins need. A browser that signed an account in before
  (`__Host-pawl_device`) is never held for that account. An unknown browser
  whose TLS fingerprint tries too often (`SIGNIN_TRY_LIMIT`) or fails too often
  (`SIGNIN_FAILURE_LIMIT`, then held for 15 minutes) must pass the human check
  first; until it does it gets `challenge_required` before any database read
  or email. paw. runs the check and retries by itself.

## Why there is no ESLint

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

Runtime-specific compiler presets live in `tooling/typescript` and are consumed
through `@pawl/typescript`. Browser, Worker, Node, and emitted library
projects do not share ambient types accidentally. TypeScript 7 runs one checker
per workspace process while Turborepo controls parallelism across workspaces.

Libraries built by `tsc` are checked during their build. Separate `typecheck`
tasks are reserved for Vite applications, Wrangler Workers, tests, and tooling
whose normal build step does not perform full type analysis.
