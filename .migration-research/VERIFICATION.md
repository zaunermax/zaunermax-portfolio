# Migration verification — 2026-10-29

Completed locally on branch `spike/tanstack-cloudflare`, using Node 24.22.2 and pnpm 12.15.0.
No deployment, authentication, secret upload, resource provisioning or DNS change was performed.
No paid OpenAI request was made. Sanity published-content reads were used for the page checks.

## Result by area

- TanStack Start routes and server functions replace the Next app. Quest is `/`, maxOS is `/os`;
  the two old lab page URLs redirect with 307. The root document preserves noindex and uses
  Fontsource assets. The Quest arrival shell streams, with the canvas behind lazy/ClientOnly.
- Retained source was moved with `git mv`. Legacy site, Studio, sitemap/robots and webhook code
  were removed. Existing GLB URLs stay under `/lab/quest`. Legacy CMS/page links point to the
  apex while Quest's known wiki filenames still open in-app.
- Raw handlers preserve NDJSON world events, AI SDK UI chat streams and plain-text completions.
  OpenAI/Sanity clients are created inside request paths. Sanity uses its API CDN; no KV exists.
  Suggestions use the Workers Cache API with 300-second per-mode entries and refresh replacement.
- QuestForge owns a per-instance job/listener registry and SQLite world/history/state storage.
  Atomic publication checks lease ownership and expiry before writing. A 150-second overall
  deadline fits inside the three-minute lease; DO waitUntil preserves disconnected runs.
  ReplySprout is seeded on first use with an empty forge state. QuestLimits persists fixed-window
  chat/contact counters. The public proxy overwrites the trusted client-key header.
- Resend remains available. Unconfigured development logs email; production keeps the 503 direct
  email response. Beta's email is unconfigured. There is no filesystem world adapter or outbox.
- Domain and API tests were retained, including single-flight, follow, cancellation and cooldown.
  Added regression tests cover expired/stale completion fencing, overall deadline, actual SQLite
  adapter transactions, atomic rate limits and suggestion-cache refresh. Browser tests now cover
  Quest and maxOS, with every inference/suggestion endpoint intercepted.

## Commands and results

```text
pnpm lint
# exit 0
pnpm typecheck
# wrangler 4.156.0 regenerated worker-configuration.d.ts; tsc exited 0
pnpm test
# Test Files 15 passed (15)
# Tests 165 passed (165)
pnpm build
# client and ssr builds passed
pnpm peers check
# No peer dependency issues found
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
# 2 passed (18.5s), development workerd server
pnpm preview --host 127.0.0.1 --port 3100
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_TEST_PRODUCTION=1 pnpm test:e2e
# 2 passed (23.4s), built production Worker
pnpm exec wrangler deploy --dry-run
# Configuration being used: dist/server/wrangler.json
# Total Upload: 4387.42 KiB / gzip: 937.41 KiB
# QUEST_FORGE (QuestForge) and QUEST_LIMITS (QuestLimits) bindings present
# --dry-run: exiting now.
git diff --check
# exit 0
```

The browser tests confirm the WebGL canvas is visible, the loading veil becomes ready,
all three GLBs return successful responses, the maxOS desktop hydrates, and a mocked
plain-text completion appears. Both pages produce no browser page errors. The build emits
its expected large-chunk warning for Three/React assets; it does not fail the build.

## Curl evidence

Started the local workerd server with:

```sh
pnpm dev --host 127.0.0.1 --port 3000
```

With `QUEST_FAKE_GENERATOR=1` in ignored `.dev.vars`, verified a GET first returned
`X-Quest-Generator: fake` before allowing any POST. The flag is guarded by Vite DEV and its
module/header are absent from production JS. The initial world check was:

```sh
curl --max-time 30 -sS -D /tmp/quest-world.headers http://127.0.0.1:3000/api/lab/quest/world -o /tmp/quest-world.json
```

```text
HTTP/1.1 200 OK
cache-control: no-store
content-type: application/json
{"id":"mvu19rof-1be5a1c4","company":"ReplySprout","nextGenerationAt":null,"generating":false}
```

JSON in this document is projected from the complete response, whose public world brief is
several kilobytes. The full responses were saved under the listed `/tmp` paths.

```sh
curl --max-time 40 -sS -D /tmp/quest-home.headers http://127.0.0.1:3000/ -o /tmp/quest-home.html
curl --max-time 40 -sS -D /tmp/quest-os.headers http://127.0.0.1:3000/os -o /tmp/quest-os.html
curl --max-time 30 -sS -A 'Mozilla/5.0' -D /tmp/quest-shell.headers http://127.0.0.1:3000/ -o /tmp/quest-shell.html
```

```text
/    200, text/html; charset=utf-8, Cache-Control: no-store
/os  200, text/html; charset=utf-8
Browser-UA / contains pending Suspense (<!--$?-->) and "Clocking in at ...the office" shell,
then the resolved world. Default curl's bot UA waits for the full render.
```

```sh
curl --max-time 30 -sS -I http://127.0.0.1:3000/lab/1-quest
curl --max-time 30 -sS -I http://127.0.0.1:3000/lab/2-os
curl --max-time 30 -sS -I http://127.0.0.1:3000/lab/quest/office-kit.glb
```

```text
/lab/1-quest: 307 Temporary Redirect, location: /
/lab/2-os:    307 Temporary Redirect, location: /os
/lab/quest/office-kit.glb: 200 OK, Content-Type: model/gltf-binary, Content-Length: 1972752
```

The following curl processes were run concurrently via Python subprocesses; the follower
started after reading the starter's first brief, while generation was still running:

```sh
curl --max-time 30 -sS -N -D /tmp/quest-post.headers -X POST -H 'CF-Connecting-IP: 192.0.2.10' http://127.0.0.1:3000/api/lab/quest/world
curl --max-time 30 -sS -N -D /tmp/quest-follow.headers -H 'CF-Connecting-IP: 192.0.2.11' 'http://127.0.0.1:3000/api/lab/quest/world?follow=1'
curl --max-time 30 -sS -w '\n%{http_code}\n' -X POST http://127.0.0.1:3000/api/lab/quest/world
```

```text
Starter: 200 OK
Follower: 200 OK
Both: Content-Type: application/x-ndjson; charset=utf-8
Both: Cache-Control: no-store, no-transform
Both: X-Accel-Buffering: no
Both: X-Quest-Generator: fake
Starter events:  [start, brief, brief, brief, done]
Follower events: [start, brief, brief, brief, done]
Same start event and final world for both clients.
Concurrent POST: 409
{"message":"Another visitor is redeploying the office right now. Watch it come together!"}
Final world: {"id":"mvu2pv4j-446b0172","company":"Local Forge Labs","model":"local-fake"}
```

Full streams were saved as `/tmp/quest-post.ndjson` and `/tmp/quest-follow.ndjson`.
After terminating the dev Vite process with SIGTERM, starting it again with the same
`pnpm dev --host 127.0.0.1 --port 3000` command, and running:

```sh
curl --max-time 30 -sS -D /tmp/quest-restart.headers http://127.0.0.1:3000/api/lab/quest/world -o /tmp/quest-restart.json
```

```text
200 OK, no-store, application/json
{"id":"mvu2pv4j-446b0172","company":"Local Forge Labs","model":"local-fake","generating":false}
```

A separate disconnect smoke run used curl with a 0.4-second deadline and no follower:

```sh
curl --max-time 0.4 -sS -N -D /tmp/quest-disconnect.headers -X POST http://127.0.0.1:3000/api/lab/quest/world
```

```text
curl exit 28: Operation timed out after 401 milliseconds with 98 bytes received
{"type":"start","id":"mvu2uets-61a1d729","createdAt":"2026-10-29T21:50:25.936Z","seed":842431522}
```

A later GET (saved in `/tmp/quest-disconnect-after.json`) confirmed the fake generation
completed without any connected clients:

```text
{"id":"mvu2uets-61a1d729","company":"Local Forge Labs","model":"local-fake","generating":false}
```

Built-preview GET on port 3100 returned the same persisted world, with no fake-generator header.
No production-preview generation was attempted.

## Runtime/reference and secret checks

```sh
rg -n "(from|import).*['\"](next/|next-sanity|server-only)|NEXT_PUBLIC_|\.data/quest" src --glob '!*.test.ts'
```

No matches. A literal unanchored `next/` substring also matches the two required
`@fontsource-variable/atkinson-hyperlegible-next/...` CSS imports; those are Fontsource,
not Next package imports. All actual Next runtime imports, old env names, markers and
filesystem paths are absent.

The built client JS/CSS/HTML was also checked for private prompts, server factories,
OPENAI_API_KEY, SANITY_PROJECT_ID and QUEST_FAKE_GENERATOR: no matches. Both client and
server JS were checked against local API-key values without printing them: no matches.
Ignored `.dev.vars` and `dist/server/.dev.vars` remain local and are never staged.

## Dependency changes

Versions were rechecked against the npm registry before installation. Every direct
version is exact. Added packages:

| Package | Final version |
| --- | --- |
| `@babel/core` | `7.29.7` |
| `@cloudflare/vite-plugin` | `1.66.0` |
| `@eslint/js` | `9.39.5` |
| `@fontsource-variable/atkinson-hyperlegible-next` | `5.3.0` |
| `@fontsource-variable/schibsted-grotesk` | `5.3.0` |
| `@fontsource/ibm-plex-mono` | `5.3.0` |
| `@fontsource/jersey-15` | `5.3.0` |
| `@rolldown/plugin-babel` | `0.2.4` |
| `@tailwindcss/vite` | `4.3.3` |
| `@tanstack/react-router` | `1.170.46` |
| `@tanstack/react-start` | `1.169.4` |
| `@vitejs/plugin-react` | `6.1.2` |
| `eslint-plugin-jsx-a11y` | `6.10.2` |
| `eslint-plugin-react-hooks` | `7.1.1` |
| `globals` | `17.13.0` |
| `typescript-eslint` | `8.72.1` |
| `vite` | `8.3.5` |
| `wrangler` | `4.156.0` |

Removed direct packages: `@hookform/resolvers`, `@radix-ui/react-avatar`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-slot`, `@sanity/vision`, `@tailwindcss/postcss`, `@vercel/speed-insights`, `class-variance-authority`, `clsx`, `date-fns`, `eslint-config-next`, `lucide-react`, `next`, `next-sanity`, `next-themes`, `postcss`, `react-hook-form`, `react-type-animation`, `rimraf`, `sanity`, `server-only`, `styled-components`, `tailwind-merge`.

`sharp@0.35.5` moved to devDependencies for offline voxel scripts. `@types/node` and
`@types/three` are now exactly pinned at 24.19.2 and 0.186.0. React/React DOM 19.3.1,
Three 0.186.1, Fiber 9.8.2, Drei 10.7.9, AI SDK 7.0.154, provider 4.0.103, React AI SDK
4.0.158, OpenAI 7.45.0, Sanity client 8.11.0, Zod 4.6.7, TypeScript 6.0.3 and Vitest
5.0.5 remain unchanged. Babel adapter 0.2.4 stays inside plugin-react 6.1.2's peer range;
ESLint JS 9.39.5 matches the retained ESLint 9.39.5. Obsolete Sanity/Vercel build approvals
and overrides were removed; esbuild, Sharp and workerd build approvals remain.

## Plan adjustments and open risks

- Added `src/start-server.ts` as the explicit Start entry, keeping `src/server.ts` as the
  three-argument Worker adapter that exports the DOs and supplies typed request context.
  This avoids overloading the same file with the two distinct fetch signatures.
- Extended the WorldStore contract with atomic `commitWorld`: state-only update plus an
  awaited save cannot fence and publish world/history/cooldown atomically. This is the
  required fencing fix, exercised against memory and actual SQLite.
- Local Vite configuration removes required-secret filtering only for `serve`, so all
  optional `.dev.vars` keys (including the fake flag and optional Resend secret) work.
  The production config retains `secrets.required: ["OPENAI_API_KEY"]`.
- No product-scope or architecture deviation: no KV, alarms, queues or extra resources;
  `/os`, CDN Sanity, existing API URLs and the noindex policy follow PLAN.md.
- Paid provider roundtrips and real email delivery were intentionally skipped. Chat's UI
  message stream, completion text stream and suggestions are covered with mocks. The
  short fake run confirms local streaming/disconnect behavior; the documented DO keepalive
  budget and production CPU/latency still need validation at an authorized deployment.
- Running streams/replay live in DO memory. HMR/crashes/redeploys lose the in-flight job;
  the persisted lock expires and the previous complete office remains. No paid retry occurs.
- Cache API entries are per data center and refresh only that location. The singleton forge
  adds a geographic hop. These are the accepted initial design tradeoffs in PLAN.md.
- Large Three/client chunks remain. Production preview passes; this migration does not
  perform a separate bundle-performance redesign.

Local startup is documented in README.md. The ignored `.dev.vars` used for verification has
`QUEST_FAKE_GENERATOR=1`, and the final local world is Local Forge Labs. Remove that flag
and restart only when intending to use paid world generation. Browser page loads may still
request suggestions; the fake flag does not change those endpoints.
