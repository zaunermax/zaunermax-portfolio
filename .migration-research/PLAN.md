# Migration plan: Next.js → TanStack Start on Cloudflare Workers

Owner decisions (2026-10-29): port only Quest (served at `/`) and maxOS (served at `/os`) plus the APIs they
call. Drop the legacy terminal site, `/query`, `/wiki`, `/talks`, the embedded Sanity Studio, sitemap/robots and
`/api/revalidate`. The old Next app keeps serving the apex `zaunermax.at` on Vercel; never touch the apex DNS.
Deploy to `beta.zaunermax.at` as a Worker custom domain on account `6894de59445d940fd8982eb1159d2836`.
Local development must keep working with the same code path as production.

Background research (read the relevant sections before working):
- `.migration-research/tanstack-start.md`: framework patterns, versions, snippets
- `.migration-research/cloudflare.md`: Workers/DO/config/deploy
- `.migration-research/stack-and-inventory.md`: exact import closure, Next/Node API uses, env, tests, deps

## Target stack (pin exact versions; re-verify on npm when installing)

- `@tanstack/react-start` 1.169.4, `@tanstack/react-router` 1.170.46 (Start's exact dep), Vite 8.3.x
- `@vitejs/plugin-react` 6.1.x with `@rolldown/plugin-babel` **0.2.4** + `@babel/core` + existing
  `babel-plugin-react-compiler` 1.0.0, using `reactCompilerPreset`
- `@cloudflare/vite-plugin` 1.66.x (stable, NOT the 2.0 beta), `wrangler` 4.156.x. Deploy with Wrangler.
  Do not run `cf deploy/dev/build/init` on this project. `cf` is fine for read-only account/DNS lookups.
- `@tailwindcss/vite` 4.3.3 replacing `@tailwindcss/postcss` (drop `postcss.config.mjs`)
- Fontsource packages for Jersey 15, Atkinson Hyperlegible Next (variable + italic), Schibsted Grotesk
  (variable), IBM Plex Mono 400/600. Keep the CSS variable names `--q-pixel`, `--q-read`,
  `--os-font-ui`, `--os-font-mono`.
- Keep React 19.3.1, three/fiber/drei, AI SDK 7, `openai`, `@sanity/client`, zod, TypeScript 6.0.3, Vitest.
- Remove: `next`, `next-sanity`, `sanity`, `@sanity/vision`, `styled-components`, `@vercel/speed-insights`,
  `next-themes`, `eslint-config-next`, `server-only`, `@tailwindcss/postcss`, `postcss`, plus any other
  dependency that is no longer imported after the legacy code is deleted. Move `sharp` to devDependencies
  (offline voxel tooling uses it). Clean up obsolete `pnpm-workspace.yaml` allowBuilds/overrides only when
  they reference removed packages.

## Layout

```
src/
  server.ts                 # Worker entry (wrangler main): legacy redirects, passes {env, ctx} into Start
                            # request context, re-exports Durable Object classes
  router.tsx                # getRouter()
  routeTree.gen.ts          # generated, committed, excluded from lint/format
  routes/
    __root.tsx              # document, head (charset, viewport, robots noindex, icons), global CSS, switcher
    index.tsx               # Quest
    os.tsx                  # maxOS
    lab/1-quest.tsx, lab/2-os.tsx   # redirect to / and /os (old links)
    api/completion.ts, api/suggestions.ts, api/lab/quest/{chat,contact,world}.ts  # thin adapters
  quest/   (was src/app/(lab)/lab/1-quest/**: chat, scene, server, ui, world)
  maxos/   (was src/app/(lab)/lab/2-os/**)
  lab-shared/ (was src/app/(lab)/lab/_shared/**; split public `business` + types from the Sanity fetch)
  server/  (*.server.ts: sanity, openai clients, lab content, llm context, suggestions, handlers, DOs)
  lib/, components/  (only what the retained closure imports)
  styles/globals.css, styles/fonts.css
```

Use `git mv` so history follows. Never run `prettier --write` over moved quest files (they are not
prettier-formatted; it would create huge diff noise). Format only new files.

## Framework port rules

- Page data via `createServerFn` called from route loaders. Quest keeps its arrival shell: loader returns
  `{ quest: loadQuest() }` (unawaited) and the component renders `<Suspense fallback={<Arriving/>}><Await>`.
  Quest data is live: `Cache-Control: no-store`, `staleTime: 0`, no preload.
- Raw API endpoints: `createFileRoute(path)({ server: { handlers: { GET, POST } } })` calling exported
  handler functions in `*.server.ts` that take `(request, deps)` and return a `Response`. Keep every URL,
  status code, header, error body and stream protocol (NDJSON for world, AI SDK UI message stream for chat,
  plain text stream for completion) byte-compatible with today.
- `next/dynamic({ssr:false})` → `React.lazy` + `<ClientOnly>` + `<Suspense>`. `next/image` → `<img>` with
  explicit size. `next/link`/`usePathname` → Router `Link`/`useLocation`. `server-only` →
  `.server.ts` naming and/or `import '@tanstack/react-start/server-only'`. Metadata → `head()`.
  `process.env.NODE_ENV` in browser code → `import.meta.env.DEV`. Remove `maxDuration`, `connection()`,
  `after()`, `'use cache'`/`cacheLife`/`cacheTag`.
- Spike switcher: entries Quest `/` (exact match) and maxOS `/os`; drop the `/lab` index link.
- Links into dropped legacy pages (`/talks/<slug>`, `/wiki/<file>`, `/wiki/DISCLAIMER.md`, `/query`, relative
  Portable Text links) become absolute `https://zaunermax.at/...` links. Quest's in-app wiki file opening
  keeps working.
- Static assets stay at their URLs (`/lab/quest/*.glb`, `kit-manifest.json`). Copy favicon/apple icon into
  `public/`.
- Env: keep reading server config via `process.env` (Workers populates it from vars/secrets with this
  compat date; Node tests keep stubbing it), but construct OpenAI/Sanity clients lazily inside request
  paths, never at module scope. Rename `NEXT_PUBLIC_SANITY_*` → `SANITY_PROJECT_ID`, `SANITY_DATASET`,
  `SANITY_API_VERSION`. Bindings (DO namespaces) via `import { env } from 'cloudflare:workers'` or the
  request context, only in `.server.ts` modules.

## Cloudflare design

- `wrangler.jsonc`: name `zaunermax-beta`, `main: src/server.ts`, `compatibility_date: 2026-10-29`
  (must be >= 2026-10-01 for DO waitUntil keepalive), `nodejs_compat`, `observability.enabled`,
  `upload_source_maps`, assets with `not_found_handling: none` and `run_worker_first: ["/api/*"]`,
  DO bindings + `new_sqlite_classes` migration, non-secret `vars`, `secrets.required: ["OPENAI_API_KEY"]`.
  Custom domain route `{ pattern: "beta.zaunermax.at", custom_domain: true }`. `workers_dev: true` for the
  first smoke deployment is OK; no wildcard routes.
- **QuestForge Durable Object** (SQLite-backed, single instance `getByName('global')`). The world route
  forwards GET/POST (incl. `?follow=1`) to it via `stub.fetch()`, setting a trusted client-key header
  from `CF-Connecting-IP` (overwrite any incoming one). Inside the DO the existing `forge.ts`/`store.ts`
  logic runs nearly unchanged: since every request hits the same instance, the in-memory job registry and
  listener fan-out keep working across Worker isolates. Replace only:
  - the file adapter with a DO-storage `WorldStore` adapter (current world, forge state, history), with
    `updateState` atomic (no awaits between read and write inside the DO; or `transactionSync`);
  - `after(job.done)` with `this.ctx.waitUntil(job.done)` (keeps the DO alive up to 15 min after the
    starter disconnects);
  - fix fencing: `completeGeneration` must check the lock is still owned *before* saving the world.
  - Give the whole run (moderation + generation + persist) an overall deadline shorter than the 3-minute
    lock TTL, so an evicted/crashed run simply expires its persisted lock (no alarm needed).
  - The world route's per-visitor attempt limit lives in the DO (memory is fine; cooldown is persisted).
- **Rate limits for chat/contact**: a small `QuestLimits` DO (single instance) with a SQLite fixed-window
  counter table and an async `take([{key,limit,windowMs}])` RPC. `rateLimit()` becomes async; keep the
  same windows/limits/messages and `Retry-After`. `clientKey()` uses `CF-Connecting-IP` (fallback
  `x-forwarded-for`, then `'local'`).
- **Sanity**: `@sanity/client` directly, published perspective, pinned API version, `useCdn: true` (Sanity's
  API CDN invalidates on publish; replaces Next's cache and the dropped webhook). No KV.
- **Suggestions** (LLM-generated, expensive): cache per mode for 300 s in the Workers Cache API
  (`caches.default`, synthetic internal URL key); POST refresh bypasses the read and writes the result.
- **Email**: keep Resend REST. Without `RESEND_API_KEY`/`CONTACT_FROM_EMAIL`: in dev
  (`import.meta.env.DEV`) log the email to the console and return ok; in production keep today's 503 with
  "email Max directly". No filesystem outbox.
- Local dev: `pnpm dev` = `vite dev` (workerd + local DO state in `.wrangler/state`, gitignored). Secrets in
  `.dev.vars` (gitignored; document in `.dev.vars.example`). `server.allowedHosts` for `*.preview.oekoho.me`.
- Scripts: `dev`, `build` (`vite build`), `preview`, `deploy` (`pnpm build && wrangler deploy`),
  `cf-typegen` (`wrangler types`), `typecheck` (`wrangler types && tsc --noEmit`), `lint`, `test`.

## Tests

- Keep all domain tests (world/*, prompt). Update paths; drop `server-only`/Next mocks.
- API tests call the extracted handlers directly with injected deps (store/limits/waitUntil). Store tests
  run the shared store logic against an in-memory `WorldStore` adapter (and the DO adapter's logic if it
  can be exercised without workerd). Keep single-flight/cooldown/follow/fencing coverage; add a test for
  the fencing fix.
- Replace the legacy Playwright spec with a smoke spec for `/` and `/os` (mock APIs as before), pointed at
  `vite dev` on port 3100.
- Update `tools/quest-voxel/review/*` imports (`layout.ts`) and `shoot.mjs` URL (`/lab/1-quest` → `/`).

## Acceptance (before any deploy)

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass; `pnpm dev` serves `/` (SSR shell, canvas
hydrates, GLBs load), `/os`, chat/completion/suggestions stream, world GET JSON, world POST NDJSON and a
second client's `?follow=1` replay both work locally against workerd; `grep` finds no `next/`, `next-sanity`,
`server-only`, `NEXT_PUBLIC_`, `.data/quest` in the runtime code.

## Deploy (only after the owner confirms)

1. Wrangler auth for the zaunermax account; `CLOUDFLARE_ACCOUNT_ID=6894de59445d940fd8982eb1159d2836`.
2. Snapshot zaunermax.at DNS. 3. Upload secrets (`wrangler secret put` / `--secrets-file`).
4. `pnpm deploy`; smoke-test the workers.dev URL; attach `beta.zaunermax.at`; verify TLS, SSR, APIs,
   assets, a real generation, logs; diff DNS (only `beta` added).

## Further owner decisions (2026-10-29)

- Contact email stays unconfigured on beta (production path returns the existing 503 "email Max directly"
  message). Keep the Resend code path so it works once `RESEND_API_KEY`/`CONTACT_FROM_EMAIL` are set.
- Seed the first office: copy `.data/quest/current.json` (world `mvu19rof-1be5a1c4`, "ReplySprout") to a
  committed server-only `src/quest/world/seed-world.json`. When the QuestForge DO has no current world, it
  initializes from it (validated through `parseWorld`, falling back to `defaultWorld()`), with an empty forge
  state (no cooldown). Local dev therefore starts with the same office.
- Keep `robots: noindex` on beta.
