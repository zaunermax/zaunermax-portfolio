# Quest / maxOS migration: stack and source inventory

Research date: 2026-10-29. Repository:
`/home/max/.t3/worktrees/zaunermax-portfolio/t3-70f2a7f3`. Research only; no application
source, configuration, or lockfile changed. Package versions below are the repository
pins, verified against the npm registry on this date. Compatibility means documented
support or an explicitly marked inference from package exports/peers and the actual code
path; a migrated production build has not been tested.

## 1. Scope and important findings

Port Quest to `/`, retain maxOS on a secondary route (keeping `/lab/2-os` minimizes
changes), and retain **five** API endpoints: completion, suggestions, quest world, quest
chat, quest contact. The import closure contains **86 files**, including CSS and one
portrait JPG, before tests and public assets. The exact grouped inventory and the
complete, line-cited import adjacency list are below. Type-only imports are included in
the closure and marked in the adjacency list.

No code from `src/app/(site)/**`, `src/app/(studio)/**`, sitemap/robots, or
`/api/revalidate` is imported by this closure. However, **legacy navigation must be
adjusted**, rather than simply deleting the destinations:

| Location                                          | Current destination            | Minimal port action                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(lab)/lab/1-quest/ui/windows.tsx:561`    | `/talks/${talk.slug}`          | Link to the old apex origin, e.g. `https://zaunermax.at/talks/...`; the talk UI here lists links, not the slide documents.                                            |
| `src/app/(lab)/lab/2-os/talks-app.tsx:52`         | `/talks/${talk.slug}`          | Same apex link.                                                                                                                                                       |
| `src/app/(lab)/lab/2-os/wiki-app.tsx:125`         | `/wiki/${page.filename}`       | Same apex link for the “open” action; inline wiki rendering already receives CMS content.                                                                             |
| `src/app/(lab)/lab/2-os/wiki-app.tsx:24`          | Arbitrary Portable Text `href` | Normalize legacy relative wiki/talk/query links supplied by CMS, or handle wiki links inside the app.                                                                 |
| `src/app/(lab)/lab/2-os/terminal-app.tsx:64`      | `/wiki/DISCLAIMER.md`          | Point disclaimer at apex.                                                                                                                                             |
| `src/app/(lab)/lab/2-os/menu-bar.tsx:157`         | `/query`                       | Point terminal-site menu action at apex, or make it open the existing maxOS terminal app.                                                                             |
| `src/app/(lab)/lab/1-quest/ui/windows.tsx:403`    | Portable Text `/wiki/...`      | Known filenames already open inside Quest via `onFile`; preserve this. Other relative CMS links fall through to an anchor at line 416 and need normalization.         |
| `src/app/(lab)/lab/_shared/spikes.ts:2`           | `/lab/1-quest`                 | Change Quest entry to `/`; keep/relabel maxOS entry.                                                                                                                  |
| `src/app/(lab)/lab/_shared/spike-switcher.tsx:10` | Prefix match of current route  | A `/` entry matches every pathname: use exact root matching, then secondary-route matching. Remove/rework `/lab` “All spikes” at line 24 if the lab index is dropped. |

These are outbound page dependencies, not reasons to migrate the terminal application. The
assumed apex example above should be confirmed against the intended public origin during
implementation; no environment values/secrets were read for this research.

The significant runtime adaptations are:

1. `world/store.ts` persists current world, history, cooldown, and lock under
   `.data/quest`, using process-local serialization (`:82`, `:99`, `:110`, `:124`,
   `:153`). Keep its `WorldStore` interface (`:30`) and domain logic; replace the file
   adapter with durable shared storage that implements **atomic** `updateState`. A KV-only
   read/modify/write cannot preserve that contract. See Cloudflare delegate for the chosen
   binding/coordination design.
2. `world/forge.ts:40` keeps the live job registry in `globalThis`, with process-local
   listeners (`:28`, `:49`, `:145`, `:170`). Merely swapping persistence leaves
   `?follow=1` unable to follow a generation handled by a different isolate. Keep
   protocol/domain behavior, replace the registry/fan-out mechanism if cross-instance
   following is required.
3. `server/rate-limit.ts:7` uses an in-memory `Map`, so “global” caps are currently per
   process. For Workers production, use a shared limiter/coordination adapter. `clientKey`
   at line 26 trusts `x-forwarded-for` then `x-real-ip`; prefer Cloudflare's
   platform-provided client IP for the port.
4. World generation is request-triggered, with a 60-minute default cooldown
   (`world/store.ts:47`, `world/forge.ts:145`, world API `:88`). There is **no
   cron/scheduler** in the traced code. Marketing wording “every hour” is not evidence of
   a scheduled job; do not add one accidentally.
5. Next `after(started.job.done)` (world API `:121`) preserves generation after
   disconnect. A straight `ctx.waitUntil` replacement is insufficient for the existing
   90-second model timeout (`world/generate.ts:36`): HTTP Workers only get 30 seconds
   after response/disconnect. Preserve the user-visible disconnect/persistence behavior
   using an appropriate durable/background execution design.
   [Cloudflare execution context](https://developers.cloudflare.com/workers/runtime-apis/context/)
6. `chat/mailer.ts:59` writes a development outbox; production already uses Resend HTTP
   (`:85`) and refuses missing configuration (`:74`). Keep HTTP mail delivery. Isolate a
   Node-only dev outbox or replace it with local binding storage/logging; never use
   temporary Workers files as a persistent outbox.

## 2. Data entry points and HTTP contracts

| Caller                                                     | Endpoint / method                                 | Server import closure and behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quest initial page `src/app/(lab)/lab/1-quest/page.tsx:47` | Initial server load, no client HTTP               | Parallel `getLabContent()` + `getWorldState()`, then serializable props to `QuestApp`. Port to a Start server function used by a route loader.                                                                                                                                                                                                                                                                                                                                                       |
| maxOS initial page `src/app/(lab)/lab/2-os/page.tsx:22`    | Initial server load                               | `getLabContent()` then props to `MaxOS`; same server-function boundary.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/app/(lab)/lab/_shared/use-ask.ts:31`                  | **Implicit** `/api/completion`, POST              | `useCompletion({ streamProtocol: 'text' })` uses SDK default endpoint. Only maxOS calls `useAsk` (`src/app/(lab)/lab/2-os/maxos.tsx:12`, `:133`); terminal-app only imports its type (`:4`). The installed SDK default is explicit at `node_modules/@ai-sdk/react/src/use-completion.ts:66`. API validates question, moderates via native OpenAI SDK, reads Sanity LLM context, emits plain text using `ai` (`src/app/api/completion/route.ts:18`, `:29`, `:37`, `:52`). Preserve the text protocol. |
| `src/lib/get-suggestions.ts:10`                            | `/api/suggestions?mode=short` (GET, refresh POST) | Both Quest chat (`chat/use-max-chat.ts:6`) and maxOS `useAsk` request it. Route supports `short`/`long`, defaulting invalid mode to short (`src/app/api/suggestions/route.ts:13`); cached generation reads CMS LLM context and uses `ai` + Zod (`src/lib/server-only/generate-suggestions.ts:15`, `:22`).                                                                                                                                                                                            |
| `src/app/(lab)/lab/1-quest/chat/use-max-chat.ts:36`        | `CHAT_API = /api/lab/quest/chat`, POST            | `DefaultChatTransport` + `Chat`/`useChat`; contract constant at `chat/contract.ts:9`. Server uses chat history/prompt/tools/sanitizer, shared rate limiter, business copy, Sanity LLM context, native OpenAI moderation and `@ai-sdk/openai` model; emits AI SDK **UI message stream**, including bounded contact-draft tool output (`src/app/api/lab/quest/chat/route.ts:56`, `:105`, `:122`, `:137`).                                                                                              |
| `src/app/(lab)/lab/1-quest/chat/use-max-chat.ts:162`       | `CONTACT_API = /api/lab/quest/contact`, POST JSON | Constant `chat/contract.ts:10`; schema/honeypot/timing validation, rate limits, moderation, then Resend delivery (`src/app/api/lab/quest/contact/route.ts:57`, `:73`, `:82`, `:101`, `:116`).                                                                                                                                                                                                                                                                                                        |
| `src/app/(lab)/lab/1-quest/world/use-world.ts:310`         | `WORLD_API = /api/lab/quest/world`, POST          | Constant `world/contract.ts:26`. Generation NDJSON events; 409 busy, 429 cooldown/rate-limit; server **never reads visitor body** (world API `:15`, `:82`). Uses rate limiter → forge → generate/store.                                                                                                                                                                                                                                                                                              |
| `src/app/(lab)/lab/1-quest/world/use-world.ts:346`         | Same endpoint `?follow=1`, GET                    | NDJSON replay/live follow if this instance has a job; JSON state otherwise (world API `:80`). Plain GET also returns JSON world state. Preserve JSON-vs-NDJSON detection and abort behavior.                                                                                                                                                                                                                                                                                                         |
| `src/app/(lab)/lab/1-quest/scene/kit.tsx:319`              | `/lab/quest/kit-manifest.json`                    | Static public asset, not an API. Manifest hash versions three GLB requests at `:353`, `:358`, `:363`. Keep `/lab/quest/` asset base when Quest page moves to `/`.                                                                                                                                                                                                                                                                                                                                    |

Sanity page content is a single GROQ query for `general`, `wiki-page`, public `talk`, and
`event` at `_shared/content.ts:43`, `:51`; LLM context queries **`llm-content`** at
`src/lib/server-only/llm-context-utils.ts:4`. No helpers under `src/lib/sanity/` are
needed for these queries, and no Studio schemas execute at runtime. CMS `events[].url` and
Portable Text links may point elsewhere; their contents cannot be enumerated statically.

Start loaders are isomorphic. Do not call a raw Sanity/server module directly from a
loader that later runs in the browser; use `createServerFn().handler(...)`. Existing
client imports from `_shared/content.ts` are **type-only**, and business/content are
passed as props today. Splitting business/types from fetching is useful, but not an
existing runtime client leak.
[Start execution boundaries](https://tanstack.com/start/latest/docs/framework/react/guide/code-execution-patterns)

## 3. Every Next-specific surface in the retained set

Paths beginning `Q/` below mean `src/app/(lab)/lab/1-quest/`; `OS/` means
`src/app/(lab)/lab/2-os/`.

| API / convention                            | Exact uses                                                                                                                                          | Minimal replacement                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `next/font/google`                          | `Q/page.tsx:1`, font setup `:13`, `:20`; `OS/page.tsx:1`, setup `:5`, `:11`                                                                         | Keep Jersey 15, Atkinson Hyperlegible Next, Schibsted Grotesk, IBM Plex Mono; self-host WOFF2 via `@font-face` (or equivalent font packages) and preserve `--q-pixel`, `--q-read`, `--os-font-ui`, `--os-font-mono`, font-variable wrapper classes, weights, subsets, italic and `display: swap`. Next generated font assets/classes are not portable.                                                                   |
| `next/image`                                | `Q/ui/hud.tsx:4`, rendering `:73`; `Q/ui/windows.tsx:5`, `:25`; `OS/small-apps.tsx:3`, `:144`                                                       | Standard `<img>` with dimensions, alt text and CSS. Vite static JPG import is a **URL string**, not Next `StaticImageData`; keep portrait asset. HUD `priority` becomes eager/high-priority loading as appropriate; `sizes` alone needs real responsive sources to optimize. No remote images are involved here.                                                                                                         |
| `next/link`                                 | `_shared/spike-switcher.tsx:4`, render `:24`, `:32`; `OS/menu-bar.tsx:5`, render `:157`                                                             | TanStack Router `Link` with `to` for the two local routes; ordinary absolute anchor for the legacy apex `/query`. Adapt Base UI `render` composition.                                                                                                                                                                                                                                                                    |
| `next/navigation.usePathname`               | `_shared/spike-switcher.tsx:5`, `:10`                                                                                                               | Router location selector (`useLocation`/`useRouterState`) and corrected root matching. No other retained `next/navigation` hooks.                                                                                                                                                                                                                                                                                        |
| `next/dynamic`                              | `Q/ui/quest-app.tsx:3`, `:49`                                                                                                                       | Lazy import of `../scene/world-canvas` behind TanStack `ClientOnly`, with Suspense and a stable fallback. `React.lazy` **alone** can SSR the component; preserve actual no-SSR rendering. [ClientOnly](https://tanstack.com/router/latest/docs/framework/react/api/router/clientOnlyComponent)                                                                                                                           |
| `next/server.connection`                    | `Q/world/store.ts:5`, awaited `:232`                                                                                                                | Remove Next dynamic-render opt-in; obtain state on each server request/server function. Do not prerender a frozen world into the root.                                                                                                                                                                                                                                                                                   |
| `next/server.after`                         | `src/app/api/lab/quest/world/route.ts:1`, `:121`                                                                                                    | Platform lifecycle/background execution integration; see section 1's 30-second disconnect constraint.                                                                                                                                                                                                                                                                                                                    |
| `next/server.NextResponse`                  | `src/app/api/suggestions/route.ts:1`, `:21`                                                                                                         | Native `Response.json` (same status/header semantics). Other retained endpoints already accept `Request` and return standard `Response`/Web Streams.                                                                                                                                                                                                                                                                     |
| `next/cache`                                | `src/lib/sanity-client.ts:3`, `:25`–`:27`; `src/lib/server-only/generate-suggestions.ts:3`, `:16`–`:18`                                             | Remove `'use cache'`, `cacheLife`, `cacheTag`; choose explicit server-side TTL caching or accept uncached reads as a deliberate behavior/cost change. Sanity `minutes` profile is Next-owned; suggestions explicitly use stale/revalidate 300s and expire 3600s. Refresh POST bypasses suggestion cache (`generate-suggestions.ts:51`). Router client cache is not a replacement for a cross-visitor model-result cache. |
| `next-sanity`                               | `src/lib/sanity-client.ts:2`                                                                                                                        | Import `createClient` and `QueryParams` directly from already-installed `@sanity/client`; the retained code uses no Next-Sanity live/preview/Studio/webhook features. Keep published perspective and pinned API date.                                                                                                                                                                                                    |
| `'server-only'` poison-pill package         | Listed individually immediately below                                                                                                               | Replace with Start server-only module protection/imports and server functions, not a global empty alias. Current `server-only` resolves a throwing default outside the React server condition. Start supports `@tanstack/react-start/server-only` and protected server modules. [Import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection)                                      |
| Metadata / viewport exports                 | `Q/page.tsx:32`; `OS/page.tsx:18`; `src/app/(lab)/layout.tsx:5`, `:10`                                                                              | Route `head()` metadata plus root document/viewport. Existing lab layout includes `robots: { index: false }`; intentionally decide whether the new root keeps this, independent of dropping generated robots.txt.                                                                                                                                                                                                        |
| Root layout / async server page conventions | `src/app/(lab)/layout.tsx:13`; `Q/page.tsx:38`, `:47`; `OS/page.tsx:22`                                                                             | Start root route document + route components/loaders/server functions. Keep the loading veil/Suspense shell, CSS and props. Next route groups are not routing conventions in Start.                                                                                                                                                                                                                                      |
| Route `maxDuration` exports                 | `src/app/api/completion/route.ts:6` (60); `src/app/api/suggestions/route.ts:5` (60); quest chat `route.ts:23` (60); quest world `route.ts:25` (180) | Remove inert Next/Vercel duration configuration; set applicable Workers limits separately. These exports do not impose a JS timeout.                                                                                                                                                                                                                                                                                     |
| `'use client'`                              | Client hooks/UI/scene files; exact occurrences in Appendix D                                                                                        | Standard Start/Vite components use normal React rendering; the directive does not make a module client-only. Keep SSR-safe hooks and an explicit canvas client boundary.                                                                                                                                                                                                                                                 |
| `process.env`                               | Exhaustive environment table in section 5                                                                                                           | Server bindings or supported Workers `process.env`; client dev condition to `import.meta.env.DEV`. Do not bulk replace server secrets with `VITE_*`.                                                                                                                                                                                                                                                                     |

Every retained `import 'server-only'` is at line 1 in these 14 files:

```text
src/app/(lab)/lab/_shared/content.ts
src/app/(lab)/lab/1-quest/chat/history.ts
src/app/(lab)/lab/1-quest/chat/mailer.ts
src/app/(lab)/lab/1-quest/chat/prompt.ts
src/app/(lab)/lab/1-quest/chat/sanitize.ts
src/app/(lab)/lab/1-quest/chat/tools.ts
src/app/(lab)/lab/1-quest/server/rate-limit.ts
src/app/(lab)/lab/1-quest/world/forge.ts
src/app/(lab)/lab/1-quest/world/generate.ts
src/app/(lab)/lab/1-quest/world/store.ts
src/lib/sanity-client.ts
src/lib/server-only/generate-suggestions.ts
src/lib/server-only/llm-context-utils.ts
src/lib/server-only/openai-client.ts
```

## 4. Node APIs used by retained runtime code

| File and line                                                               | API                                                | Workers disposition                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Q/world/store.ts:2`, `:101`, `:279`                                        | `node:crypto.randomBytes(4).toString('hex')`       | Supported Node crypto path under compatibility; alternatively Web Crypto random bytes/UUID. Buffer is used **implicitly as the returned randomBytes value**, not a direct application `Buffer` global reference. Preserve world-ID validation (`store.ts:62`). |
| `Q/world/store.ts:3`, `:85`, `:100`, `:102`, `:103`, `:133`, `:137`, `:143` | `node:fs/promises` readFile/mkdir/writeFile/rename | Replace persistent filesystem implementation. Imports may work with modern compatibility, but repository `.data` storage and durable atomic state are not provided.                                                                                            |
| `Q/world/store.ts:4`, `:100`, `:125`, `:126`, `:133`, `:156`                | `node:path`, dirname/join                          | Compatible utility; becomes unnecessary in the Workers persistence adapter.                                                                                                                                                                                    |
| `Q/world/store.ts:101`                                                      | `process.pid` for temp-file uniqueness             | Remove with file adapter; process identity is not a shared lock or durable identity.                                                                                                                                                                           |
| `Q/world/store.ts:156`                                                      | `process.cwd()`                                    | Remove filesystem root assumption.                                                                                                                                                                                                                             |
| `Q/world/store.ts:87`                                                       | `NodeJS.ErrnoException`                            | **Type-only**, not runtime; only file adapter's ENOENT handling.                                                                                                                                                                                               |
| `Q/world/generate.ts:2`, `:193`                                             | `node:crypto.randomInt(1, 2 ** 31 - 1)`            | Can keep with compatibility. A Web Crypto replacement must retain exclusive upper bound and unbiased integer sampling if changing it.                                                                                                                          |
| `Q/chat/mailer.ts:2`, `:63`                                                 | `node:crypto.randomUUID()`                         | Keep with compatibility, or `crypto.randomUUID()`. Only used to name dev outbox files.                                                                                                                                                                         |
| `Q/chat/mailer.ts:3`, `:61`, `:64`                                          | `node:fs/promises` mkdir/writeFile                 | Isolate/replace development outbox. Production Resend path does not need files.                                                                                                                                                                                |
| `Q/chat/mailer.ts:4`, `:60`, `:63`                                          | `node:path.join`                                   | Remove if outbox adapter is removed.                                                                                                                                                                                                                           |
| `Q/chat/mailer.ts:60`                                                       | `process.cwd()`                                    | Same outbox constraint.                                                                                                                                                                                                                                        |
| All server `process.env` reads                                              | Exact lines in section 5                           | Supported with current compatibility config, or use explicit `env` bindings; module-scope clients must initialize only where bindings are available.                                                                                                           |

`Q/` has the same expansion as section 3. There are no other direct Node module imports,
direct `Buffer` references, `require`, child processes, TCP servers or filesystem access
in the runtime closure. Web `Request`, `Response`, `ReadableStream`, `TransformStream`,
`TextEncoder`/`TextDecoder`, AbortController/AbortSignal and timers are not Node-only
APIs. `THREE.BufferGeometry` and `THREE.BufferAttribute` are graphics classes, not Node
Buffer.

Cloudflare's modern `node:fs` implementation has read-only `/bundle` and writable
**per-request, nonpersistent** `/tmp`; “filesystem writes don't work” is too broad, but
**persistent `.data/quest` writes do not work as required**.
[Workers fs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/)

`nodejs_compat` does not turn Workers into a full Node process; unsupported methods may be
stubs. Crypto/path/Buffer are compatibility-supported; do not use a successful import as
proof of durable filesystem semantics.
[Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)

## 5. Exhaustive environment inventory

| Variable                         | Reads in retained runtime                       | Use / migration                                                                                                                          |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SANITY_PROJECT_ID`  | `src/lib/sanity-client.ts:6`                    | Sanity project identifier. Currently only read in server module, despite public prefix. Can retain binding name or rename intentionally. |
| `NEXT_PUBLIC_SANITY_DATASET`     | `src/lib/sanity-client.ts:7`                    | Dataset; same.                                                                                                                           |
| `NEXT_PUBLIC_SANITY_API_VERSION` | `src/lib/sanity-client.ts:9`                    | Default `2023-07-28`; retain pinned GROQ API semantics.                                                                                  |
| `OPENAI_API_KEY`                 | `src/lib/server-only/openai-client.ts:5`, `:6`  | Secret for native SDK moderation and AI SDK provider. Never expose via Vite public env.                                                  |
| `OPENAI_MODEL`                   | `src/lib/server-only/openai-client.ts:9`        | Required by `getLanguageModel()` (`:10`); completion, suggestions, default quest chat.                                                   |
| `QUEST_WORLD_MODEL`              | `Q/world/generate.ts:42`                        | Optional override, default `gpt-6-luna` at `:39`.                                                                                        |
| `QUEST_CHAT_MODEL`               | `src/app/api/lab/quest/chat/route.ts:35`        | Optional override; otherwise `OPENAI_MODEL`.                                                                                             |
| `QUEST_WORLD_COOLDOWN_MINUTES`   | `Q/world/store.ts:50`, `:52`                    | Default 60; 0 allowed; clamped to 24 hours.                                                                                              |
| `CONTACT_TO_EMAIL`               | `Q/chat/mailer.ts:24`                           | Optional private recipient, default public business email.                                                                               |
| `CONTACT_FROM_EMAIL`             | `Q/chat/mailer.ts:51`                           | Required for configured Resend delivery.                                                                                                 |
| `RESEND_API_KEY`                 | `Q/chat/mailer.ts:74`                           | Secret; production contact refuses unconfigured delivery.                                                                                |
| `NODE_ENV`                       | `Q/chat/mailer.ts:76`; `Q/ui/quest-app.tsx:152` | Development outbox and browser debug bus. Browser condition can become `import.meta.env.DEV`.                                            |

Workers can populate `process.env` from vars/secrets with
`nodejs_compat_populate_process_env`, on by default for compatibility dates >= 2025-04-01.
Use explicit bindings where convenient; no forced package-wide env rewrite is needed
solely because the code says `process.env`. Do not inject an entire process environment
into Vite `define`.
[Workers process](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/)

**Not needed:** `SANITY_REVALIDATE_SECRET` (only excluded webhook); `BASE_DOMAIN`,
`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`, `HTTP_PROTOCOL`, `SITE_URL` (only excluded
`src/lib/server-only/server-url.ts:4`–`:10`). Tool/test-only env:
`PLAYWRIGHT_TEST_PRODUCTION`, `CI` (`playwright.config.ts:10`, `:15`), `SEEDS`, `OUT`
(`tools/quest-voxel/review/layout.report.ts:5`, `review/layout.ts:179`). Other
Python/render tool env is offline-only, not application config.

## 6. Tests to keep or adapt

Keep **13 existing test files**: 8 world tests, 1 chat prompt test, 4 API tests. Their
complete import/mocking inventory is generated in Appendix B. No tests were run or
modified for this research.

| Tests                                                                                                                    | Adaptation                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Q/world/appearance.test.ts`, `character-parts.test.ts`, `compile.test.ts`, `offline-briefs.test.ts`, `sanitize.test.ts` | Domain tests remain Node Vitest. Update moved import paths/aliases only. Character mirror test reads `public/lab/quest/character-parts.json` at `character-parts.test.ts:19`; preserve that fixture or change its path.                                                                                                                       |
| `Q/world/use-world.test.ts`                                                                                              | Imports protocol and pure helpers from React hook module; tests NDJSON/follow/polling behavior. Keep endpoint/protocol tests; update path only if endpoint changes. No Next mocks.                                                                                                                                                            |
| `Q/world/generate.test.ts`                                                                                               | Mocks `server-only`, OpenAI clients and `ai`, stubs `QUEST_WORLD_MODEL`; retain structured stream/moderation/error/abort checks. Replace poison-pill mock with the new module boundary as needed.                                                                                                                                             |
| `Q/world/store.test.ts`                                                                                                  | Uses real Node temp files and `createFileWorldStore`; mocks Next `connection`. Keep if retaining a Node dev adapter; separately exercise the replacement Workers store's atomicity/cooldown contract. Remove Next mock. Tests of the old file adapter alone cannot validate the durable adapter.                                              |
| `Q/chat/prompt.test.ts`                                                                                                  | Mocks `server-only` and Sanity client; imports prompt. After splitting business copy out of CMS module, Sanity mock may become unnecessary.                                                                                                                                                                                                   |
| `src/app/api/completion/route.test.ts`                                                                                   | Native `Request`/`Response`; mocks model/context/`ai`. Keep service validation, streaming failure and moderation tests; import core handler or registered Start handler appropriately.                                                                                                                                                        |
| `src/app/api/lab/quest/chat/route.test.ts`                                                                               | Mocks OpenAI/context/Sanity/rate limiter and `ai`; imports chat contract/prompt + POST. Preserve UI stream, tool sanitization, rate limiting, history and injection regression tests.                                                                                                                                                         |
| `src/app/api/lab/quest/contact/route.test.ts`                                                                            | Mocks OpenAI/Sanity/rate limiter and `process.cwd`; uses Node temp outbox. Keep delivery/validation/moderation checks; adapt outbox-specific test at `:222` to dev adapter/binding.                                                                                                                                                           |
| `src/app/api/lab/quest/world/route.test.ts`                                                                              | Mocks `next/server.after`/`connection`, generator, OpenAI; imports file store and forge. Preserve global cooldown, single flight, follow/replay, disconnect persistence, rate limiting and cross-site rejection checks. Replace lifecycle mocks with chosen background mechanism; use actual durable-adapter tests for cross-instance claims. |

Drop `src/app/api/revalidate/route.test.ts` with the excluded webhook; imports
`NextRequest` (`:2`), mocks `next/cache` (`:10`), imports `POST` (`:14`). There is no
`src/app/api/suggestions/route.test.ts` in this repository.

`tests/e2e/portfolio.spec.ts` imports only `@playwright/test` at `:1` and visits
**legacy** `/query`, `/wiki`, `/talks`, including theme/geometry cases (`:26`, `:55`,
`:67`, `:78`, `:141`, `:166`). It is not coverage for either spike. Do not port its old
page assertions blindly. Its API route mocks/stream interception are useful patterns for
new root/maxOS smoke tests. `playwright.config.ts:10`–`:15` assumes Next `dev/start -p/-H`
and `/query` readiness; point at Vite/Workers local preview and `/` instead.
`vitest.config.mts:5`–`:6` uses `@` alias and Node environment; retain the alias with
moved files and keep offline tests out of Workers runtime.

`tools/quest-voxel/review/vitest.layout.mts:5`–`:6` runs `layout.report.ts` in Node; that
imports `writeReport` (`layout.report.ts:2`). `review/layout.ts:12`–`:17` imports **six
app modules**: world compile, offline-briefs, validate, furnish, floorplan, and types.
Update those aliases if the world directory moves. It writes offline SVG/JSON reports
using Node fs (`:10`, `:179`), not a deployed runtime endpoint.

## 7. Voxel tooling and shipped assets

Everything under `tools/quest-voxel/` is an **offline authoring, optimization,
verification, or review pipeline**, not a runtime server dependency. App runtime imports
no tool module. Blender/Python asset build writes `public/lab/quest`
(`tools/quest-voxel/build.py:59`); optimizer uses glTF Transform + MeshoptEncoder
(`optimize-glb.mjs:3`–`:6`). Review rendering invokes Blender (`review/run.sh:7`). The
reverse source dependency is the layout review imports described above.
`tools/quest-voxel/review/shoot.mjs:37` also navigates to `/lab/1-quest?...`; update its
browser URL to `/?...` when moving Quest to root, preserving seed/view/build/debug query
parameters.

Keep these static assets at their existing URLs:

```text
public/lab/quest/kit-manifest.json
public/lab/quest/office-kit.glb
public/lab/quest/characters.glb
public/lab/quest/character-parts.glb
```

Also retain `public/lab/quest/character-parts.json` with authoring/tests: it is the
catalog mirrored in `world/character-parts.ts:1`, verified by
`world/character-parts.test.ts:19`, but **not fetched by the browser**. Keep
`src/components/ui/own-avatar/assets/pp.jpg` (three direct image imports in retained UI);
its enclosing React component is not needed. `public/pp.jpg`, `public/next.svg`, and
`public/vercel.svg` are not referenced by the retained graph. Branding/favicon can be
copied intentionally; it is not an import-closure requirement.

**Sharp correction:** not just Next image processing. Three offline scripts import it
directly: `tools/quest-voxel/contact-sheet.mjs:1`, `label-character-sheet.mjs:1`,
`render-optimization.mjs:7`. Drop it from deployed runtime; **move/keep as devDependency**
if preserving that pipeline. glTF Transform, meshoptimizer, Blender and Python also stay
outside the Worker bundle.

## 8. Dependency compatibility: interpretation

The complete per-package table appears in Appendix C and covers **all 34 production + 21
development dependencies** from `package.json`, not only packages retained by imports.
Each row links the exact verified npm version. Use these meanings:

- **SSR yes**: normal Vite SSR import/render path is compatible (where React UI is
  concerned, interactive DOM work remains browser-side). This does not claim every feature
  of a package runs in workerd.
- **Browser only**: keep in the browser bundle and behind the canvas boundary; the Worker
  does not render WebGL or need native graphics support.
- **Build/test only**: executes on local/CI Node, not in the deployed Worker. Asking
  whether the compiler/test runner runs inside Workers is not necessary for application
  compatibility.
- **Inferred**: no explicit package-specific Workers guarantee was found; conclusion
  follows from platform-neutral JS/React code and package metadata. Require a build/local
  workerd smoke check during the actual migration.
- **Drop**: unused by this exact port, even when the library itself is perfectly
  compatible. These are changes forced by narrowing scope, not requests to replace working
  libraries.

### CMS, AI, graphics and UI specifics

**Sanity:** `@sanity/client@8.11.0` has explicit `worker` and `workerd` conditional
exports to `dist/index.js`, separate from `node`'s `dist/index.node.js`. This is stronger
evidence than generic “edge-compatible” marketing. Keep direct client and query semantics;
ensure Vite/Cloudflare resolves workerd/worker conditions rather than manually forcing the
node build. Ordinary published queries need no Studio. Existing `useCdn: false` +
`cache:'no-store'` are at `src/lib/sanity-client.ts:11`, `:28`: removing Next cache
without replacement increases live CMS calls; optionally change CDN policy as a deliberate
choice. [Exact npm exports](https://registry.npmjs.org/@sanity%2Fclient/8.11.0),
[Sanity CDN configuration](https://www.sanity.io/docs/help/js-client-cdn-configuration)

**Studio:** `sanity`, `@sanity/vision`, `styled-components`, `next-sanity` are unnecessary
in the deployed port. No direct styled-components app import was found; it satisfies
Studio/next-sanity peers (`package.json:30`, `:38`, `:45`, `:48`). If separated later,
Studio is a browser SPA and can be deployed from its own project with
`sanity deploy`/`npx sanity@latest deploy` to a `*.sanity.studio` hostname. The existing
Vercel Studio can also simply remain.
[Sanity Studio hosting](https://www.sanity.io/docs/studio/deployment)

**AI:** keep both `openai@7.45.0` and AI SDK 7/provider 4/react 4. They serve different
live paths: native OpenAI SDK moderation, AI SDK response/structured generation, React
completion/chat. Exact npm manifests accept Zod 4 and React 19.3; native SDK's optional
peers (ws/undici/cloud auth) are not required by current HTTP moderation calls. Official
OpenAI docs show the SDK's server JavaScript usage; Cloudflare documents native SDK
streaming, and its current AI SDK integration explicitly targets `ai@^7`/provider v4. Do
not add Workers AI bindings or change provider/model merely to run on Workers; existing
OpenAI HTTPS calls can stay.
[OpenAI SDK docs](https://developers.openai.com/api/docs/libraries),
[Cloudflare OpenAI streaming](https://developers.cloudflare.com/workers/examples/openai-sdk-streaming/),
[Cloudflare AI SDK 7 integration](https://developers.cloudflare.com/agents/models/ai-sdk/),
[AI SDK framework-neutral UI/Core](https://ai-sdk.dev/docs/introduction)

**Three:** retain `three@0.186.1`, Fiber 9.8.2, Drei 10.7.9 and matching types. Fiber docs
pair v9 with React 19 and describe Vite support. Exact Fiber npm peer range is
**`>=19 <19.4`**; Drei accepts React 19/Fiber 9/Three >=0.159. Repo React 19.3.1 fits, so
do not unpromptedly upgrade React or Fiber major. Retain client-only canvas; rendering
calls `document.createElement('canvas')` in `scene/materials.ts:96`,
`scene/textures.ts:132`, `:214`. Core Three math/types may load server-side, but
canvas/WebGL/postprocessing do not belong in the Worker render path.
[Fiber installation](https://r3f.docs.pmnd.rs/getting-started/installation),
[Fiber exact peers](https://registry.npmjs.org/@react-three%2Ffiber/9.8.2),
[Drei exact peers](https://registry.npmjs.org/@react-three%2Fdrei/10.7.9)

**Portable Text and Base UI:** keep. Both spikes use Portable Text renderers, and Base UI
supplies dialog/menu/menubar/tabs/tooltip primitives. Framework-neutral React packages
with compatible peers; SSR imports/rendering are expected to work, browser effects/portals
need hydration. Package-specific Workers certification was not found; this is an
inference, not a tested runtime guarantee. Do not substitute Radix for Base UI. Radix
itself supports SSR, but all four direct Radix packages are only reached by excluded UI
components here. [Base UI](https://base-ui.com/react/overview/quick-start),
[Radix SSR](https://www.radix-ui.com/primitives/docs/guides/server-side-rendering)

**Unused compatible packages:** react-hook-form, resolvers, date-fns, next-themes,
lucide-react, react-type-animation, CVA, clsx, tailwind-merge, and direct Radix packages
are all outside the retained graph. Drop direct dependencies for this scoped app, not
because of Workers incompatibility. In particular, **next-themes is framework-neutral
despite its name**; the lab root intentionally skips the old theme provider
(`src/app/(lab)/layout.tsx:12`). Base UI's date-fns peer is optional; no retained date
picker/adapter requires it. If pnpm later resolves it transitively, that is separate from
retaining the direct dependency.

**Speed Insights:** imported only by excluded site layout (`src/app/(site)/layout.tsx:8`);
drop. Generic React integration exists, but Vercel's hosted collection endpoint/deployment
setup is not supplied by moving a site to Cloudflare. Do not assume the `/next`
integration remains usable.
[Vercel quickstart](https://vercel.com/docs/speed-insights/quickstart)

**Sharp:** native Node image pipeline is not a Workers runtime package. Even its
documented Wasm alternative requires multithreaded Wasm and excludes
single-threaded/browser environments; do not assume `nodejs_compat` makes this dependency
portable. Ordinary Vite SSR on a Node host can use it, but the target workerd SSR must not
import it. Preserve only offline scripts as described above.
[Sharp installation](https://sharp.pixelplumbing.com/install/)

### Build tooling, compiler, TypeScript and lint

Keep Tailwind 4 and `tw-animate-css` (`src/app/globals.css:1`, `:2`); Vite supports CSS
Modules directly, so all three lab CSS modules port. Existing `@tailwindcss/postcss` +
PostCSS **can stay**; Vite applies PostCSS config. Switching to `@tailwindcss/vite@4.3.3`
is supported and convenient, but optional under the “change only what Next forces” rule.
If switching, remove duplicate PostCSS Tailwind processing and drop direct PostCSS only if
no other use remains. Tailwind and plugins run at build time.
[Vite CSS/PostCSS](https://vite.dev/guide/features),
[Tailwind PostCSS](https://tailwindcss.com/docs/installation/using-postcss),
[Tailwind Vite](https://tailwindcss.com/docs/installation/using-vite)

Keep `babel-plugin-react-compiler@1.0.0` if preserving the currently enabled compiler
(`next.config.ts:4`). Current `@vitejs/plugin-react@6.1.2` **removed inline `babel`
config**: React's current setup uses `reactCompilerPreset` + `@rolldown/plugin-babel`. Old
blog snippets showing `react({ babel: { plugins: [...] } })` apply to older plugin-react
versions. Match the chosen Vite/plugin version; this migration does not require dropping
the compiler.
[React Compiler Vite installation](https://react.dev/learn/react-compiler/installation),
[plugin-react peers](https://registry.npmjs.org/@vitejs%2Fplugin-react/6.1.2)

Retain TypeScript **6.0.3** initially. npm metadata checked today:

| Proposed toolchain reference, not an installed change                                 | Version  | Relevant engines / peers                                                                                               |
| ------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| [TanStack React Start](https://registry.npmjs.org/@tanstack%2Freact-start/1.169.4)    | 1.169.4  | Node >=22.12; Vite >=8; React/ReactDOM >=18 or >=19.                                                                   |
| [TanStack React Router](https://registry.npmjs.org/@tanstack%2Freact-router/1.170.46) | 1.170.46 | Node >=20.19; React/ReactDOM >=18 or >=19. Use Start-compatible Router resolution, not arbitrary mismatched internals. |
| [Vite](https://registry.npmjs.org/vite/8.3.5)                                         | 8.3.5    | Node ^20.19 or >=22.12. Vite transpiles TS; `tsc --noEmit` remains separate.                                           |
| [Cloudflare Vite plugin](https://registry.npmjs.org/@cloudflare%2Fvite-plugin/1.66.0) | 1.66.0   | Vite ^6.1 / ^7 / ^8; Wrangler ^4.154.0.                                                                                |
| [Wrangler](https://registry.npmjs.org/wrangler/4.156.0)                               | 4.156.0  | Node >=22; build/dev only.                                                                                             |
| [typescript-eslint](https://registry.npmjs.org/typescript-eslint/8.72.1)              | 8.72.1   | TypeScript >=4.8.4 **<6.1.0**; ESLint ^8.57 / ^9 / ^10.                                                                |

There is no published TS-6 upper-bound blocker in those checked manifests; current
typescript-eslint explicitly covers 6.0.3. This is **not proof every Start generic and
generated declaration typechecks in this repo**: run the actual migrated typecheck/build.
Keep Node >=22.12.0, already required by `package.json:78`.

Remove `eslint-config-next`; replace Next presets in `eslint.config.mjs:2`–`:3` with
framework-neutral ESLint/TypeScript/React Hooks configuration. Existing ESLint 9.39.5 can
remain. ESLint 10 and a newer TypeScript can be considered separately after Next is gone,
but **TS >=6.1 is outside today's checked typescript-eslint support range**, so do not
upgrade blindly. Current TS config needs to drop Next plugin and `.next` include paths
(`tsconfig.json:18`, `:30`), add Vite/Worker typings and route-generated types as
appropriate; remove `next-env.d.ts`/Next typegen script.
[typescript-eslint support policy](https://typescript-eslint.io/users/dependency-versions/)

TanStack's official Cloudflare recipe uses Start + Vite + Cloudflare plugin with SSR in
workerd. This report does not supersede the other delegates' detailed
entrypoint/plugin-order/config research.
[Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting),
[Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)

## 9. pnpm 12 build approvals and overrides

Keep pnpm 12.15.0 (`package.json` packageManager) and `minimumReleaseAge: 0` if preserving
repo policy (`pnpm-workspace.yaml:7`). `allowBuilds` is current pnpm configuration, not
obsolete syntax. Recalculate entries against the final dependency graph, not only the old
Next graph. [pnpm build approvals](https://pnpm.io/settings/build#allowbuilds),
[override selector semantics](https://pnpm.io/settings/dependency-resolution)

| Existing entry                                                                | Disposition                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allowBuilds['@vercel/speed-insights']` (`pnpm-workspace.yaml:2`)             | Obsolete once package removed.                                                                                                                                                                                                                                                                                                                             |
| `allowBuilds.esbuild` (`:3`)                                                  | **Retain**: Wrangler 4.156.0 depends on esbuild 0.28.2 even if Vite 8 uses Rolldown. [Wrangler dependencies](https://registry.npmjs.org/wrangler/4.156.0)                                                                                                                                                                                                  |
| `allowBuilds.sharp` (`:4`)                                                    | Retain if keeping offline voxel scripts and their dev dependency; otherwise obsolete. Check transitive glTF image tooling before deleting the approval.                                                                                                                                                                                                    |
| `allowBuilds['unrs-resolver']` (`:5`)                                         | Likely obsolete after Next ESLint/import resolver goes, but verify the new ESLint config/dependency tree. Do not conclude solely from removing `next` runtime.                                                                                                                                                                                             |
| `use-sync-external-store: 1.7.0` (`:10`)                                      | Sanity-specific old-pin rationale disappears, so likely remove the override. **Package itself remains** through Fiber/Drei, each declares ^1.4.0; use a compatible fresh resolution and check React peers. [Fiber manifest](https://registry.npmjs.org/@react-three%2Ffiber/9.8.2), [Drei manifest](https://registry.npmjs.org/@react-three%2Fdrei/10.7.9) |
| `@vercel/frameworks>js-yaml` (`:12`) / `@vercel/frameworks>smol-toml` (`:13`) | Sanity CLI toolchain overrides become obsolete in the runtime app when Studio/CLI/Next-Sanity leave. Keep in a separately retained Studio workspace if still needed. Verify final lockfile has no remaining selector parent.                                                                                                                               |
| `typeid-js>uuid` (`:14`)                                                      | Same: associated with excluded Sanity tooling; remove if parent disappears, retain where Studio tooling remains.                                                                                                                                                                                                                                           |
| `undici@>=7.0.0 <7.30.1` (`:15`)                                              | **Do not blanket-delete.** New Wrangler/Miniflare and optional SDK peers may still resolve undici; re-evaluate on regenerated lockfile and keep the patch override if affected versions remain. OpenAI itself has no required dependencies and its undici peer is optional. [OpenAI manifest](https://registry.npmjs.org/openai/7.45.0)                    |

New native build/install packages from Wrangler/workerd or Tailwind may require explicit
allow entries depending on pnpm's final install report. Inspect that report and approve
only required packages; no install/approval change was made during this research.

## 10. Remaining uncertainty / implementation verification

- No migrated build, SSR render, browser smoke run, deployment, SDK network call, or CMS
  content query was performed. Published pins/peers/exports and static app behavior were
  inspected; live credentials and content were not.
- Exact caching/persistence/background choices belong to the Start/Cloudflare design; the
  constraints above are required to preserve current behavior. Especially test disconnect
  with >30 seconds of generation remaining and followers routed to another instance.
- `@base-ui/react`, Portable Text and general React utility Workers compatibility is an
  inference from compatible exports/runtime shape, rather than a vendor guarantee for
  every component.
- Existing legal/wiki/talk links in CMS data need a runtime fixture/content audit because
  only their rendering code is statically available.
- Fonts are not present as portable WOFF2 files in the traced tree. Acquire the same
  families/assets during implementation; do not copy opaque `.next` generated class names
  as a replacement.
- `sharp`/offline pipeline and root noindex are deliberate scope/behavior decisions, not
  automatic deletions.

## Appendix A. Exact grouped runtime/source inventory

Generated from TypeScript import declarations, re-exports, dynamic imports, import types,
and CSS imports, starting at the requested entries plus the five discovered API handlers.
Each file in this list is part of the retained closure, except that the old page/layout
wrappers are rewritten into Start routes. No import in the closure points into the
excluded site or Studio areas.

### Quest chat

```text
src/app/(lab)/lab/1-quest/chat/contract.ts
src/app/(lab)/lab/1-quest/chat/history.ts
src/app/(lab)/lab/1-quest/chat/mailer.ts
src/app/(lab)/lab/1-quest/chat/prompt.ts
src/app/(lab)/lab/1-quest/chat/sanitize.ts
src/app/(lab)/lab/1-quest/chat/tools.ts
src/app/(lab)/lab/1-quest/chat/use-max-chat.ts
```

### Quest .

```text
src/app/(lab)/lab/1-quest/page.tsx
```

### Quest scene

```text
src/app/(lab)/lab/1-quest/scene/actors.tsx
src/app/(lab)/lab/1-quest/scene/bus.ts
src/app/(lab)/lab/1-quest/scene/characters.ts
src/app/(lab)/lab/1-quest/scene/controller.tsx
src/app/(lab)/lab/1-quest/scene/furniture.tsx
src/app/(lab)/lab/1-quest/scene/grounds.tsx
src/app/(lab)/lab/1-quest/scene/kit.tsx
src/app/(lab)/lab/1-quest/scene/life.tsx
src/app/(lab)/lab/1-quest/scene/materials.ts
src/app/(lab)/lab/1-quest/scene/night.tsx
src/app/(lab)/lab/1-quest/scene/office.tsx
src/app/(lab)/lab/1-quest/scene/palette.ts
src/app/(lab)/lab/1-quest/scene/shading.tsx
src/app/(lab)/lab/1-quest/scene/spawn.ts
src/app/(lab)/lab/1-quest/scene/textures.ts
src/app/(lab)/lab/1-quest/scene/weather.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx
```

### Quest server

```text
src/app/(lab)/lab/1-quest/server/rate-limit.ts
```

### Quest ui

```text
src/app/(lab)/lab/1-quest/ui/chat-log.tsx
src/app/(lab)/lab/1-quest/ui/hooks.ts
src/app/(lab)/lab/1-quest/ui/hud.module.css
src/app/(lab)/lab/1-quest/ui/hud.tsx
src/app/(lab)/lab/1-quest/ui/icons.tsx
src/app/(lab)/lab/1-quest/ui/labels.module.css
src/app/(lab)/lab/1-quest/ui/labels.tsx
src/app/(lab)/lab/1-quest/ui/quest-app.tsx
src/app/(lab)/lab/1-quest/ui/window.tsx
src/app/(lab)/lab/1-quest/ui/windows.tsx
```

### Quest world

```text
src/app/(lab)/lab/1-quest/world/appearance.ts
src/app/(lab)/lab/1-quest/world/catalog.ts
src/app/(lab)/lab/1-quest/world/character-parts.ts
src/app/(lab)/lab/1-quest/world/compile.ts
src/app/(lab)/lab/1-quest/world/contract.ts
src/app/(lab)/lab/1-quest/world/default-world.ts
src/app/(lab)/lab/1-quest/world/floorplan.ts
src/app/(lab)/lab/1-quest/world/forge.ts
src/app/(lab)/lab/1-quest/world/furnish.ts
src/app/(lab)/lab/1-quest/world/generate.ts
src/app/(lab)/lab/1-quest/world/offline-briefs.ts
src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/world/replay.ts
src/app/(lab)/lab/1-quest/world/sanitize.ts
src/app/(lab)/lab/1-quest/world/schema.ts
src/app/(lab)/lab/1-quest/world/store.ts
src/app/(lab)/lab/1-quest/world/types.ts
src/app/(lab)/lab/1-quest/world/use-world.ts
src/app/(lab)/lab/1-quest/world/validate.ts
```

### maxOS

```text
src/app/(lab)/lab/2-os/hooks.ts
src/app/(lab)/lab/2-os/icons.tsx
src/app/(lab)/lab/2-os/maxos.tsx
src/app/(lab)/lab/2-os/menu-bar.tsx
src/app/(lab)/lab/2-os/os.module.css
src/app/(lab)/lab/2-os/page.tsx
src/app/(lab)/lab/2-os/small-apps.tsx
src/app/(lab)/lab/2-os/talks-app.tsx
src/app/(lab)/lab/2-os/terminal-app.tsx
src/app/(lab)/lab/2-os/wiki-app.tsx
src/app/(lab)/lab/2-os/window-frame.tsx
src/app/(lab)/lab/2-os/window-layout.ts
```

### Shared lab

```text
src/app/(lab)/lab/_shared/content.ts
src/app/(lab)/lab/_shared/spike-switcher.tsx
src/app/(lab)/lab/_shared/spikes.ts
src/app/(lab)/lab/_shared/use-ask.ts
```

### Root shell and global styles

```text
src/app/(lab)/layout.tsx
src/app/globals.css
```

### HTTP handlers

```text
src/app/api/completion/route.ts
src/app/api/lab/quest/chat/route.ts
src/app/api/lab/quest/contact/route.ts
src/app/api/lab/quest/world/route.ts
src/app/api/suggestions/route.ts
```

### Portrait asset only

```text
src/components/ui/own-avatar/assets/pp.jpg
```

### Shared server and client libraries

```text
src/lib/get-suggestions.ts
src/lib/question-schema.ts
src/lib/sanity-client.ts
src/lib/server-only/generate-suggestions.ts
src/lib/server-only/llm-context-utils.ts
src/lib/server-only/openai-client.ts
```

### Shared types

```text
src/types/suggestion-mode.ts
```

### Excluded source files (exact current complement)

These are not in the retained runtime graph. Relevant tests are listed separately in
Appendix B. This is a port inventory, not an instruction to delete the files from the
still-live legacy app. The `/lab` index can be retained optionally, but no retained module
imports it.

```text
src/app/(lab)/lab/page.tsx
src/app/(site)/components/footer.tsx
src/app/(site)/components/question-form-link.tsx
src/app/(site)/components/question-link.tsx
src/app/(site)/components/second-line.tsx
src/app/(site)/components/suggestions.tsx
src/app/(site)/components/theme-provider.tsx
src/app/(site)/layout.tsx
src/app/(site)/page.tsx
src/app/(site)/providers.tsx
src/app/(site)/query/components/answer-history.tsx
src/app/(site)/query/components/answers-section.tsx
src/app/(site)/query/components/help-section.tsx
src/app/(site)/query/components/question-command-section.tsx
src/app/(site)/query/components/question-section.tsx
src/app/(site)/query/hooks/index.ts
src/app/(site)/query/hooks/use-focusable-input-ref.ts
src/app/(site)/query/hooks/use-query-question.ts
src/app/(site)/query/page.tsx
src/app/(site)/query/types/answer.type.ts
src/app/(site)/talks/[slug]/page.tsx
src/app/(site)/talks/page.tsx
src/app/(site)/util/get-sentences.ts
src/app/(site)/wiki/[slug]/layout.tsx
src/app/(site)/wiki/[slug]/page.tsx
src/app/(site)/wiki/page.tsx
src/app/(studio)/layout.tsx
src/app/(studio)/studio/[[...index]]/Studio.tsx
src/app/(studio)/studio/[[...index]]/page.tsx
src/app/api/revalidate/route.test.ts
src/app/api/revalidate/route.ts
src/app/apple-icon.png
src/app/favicon.ico
src/app/robots.ts
src/app/sitemap.ts
src/components/app-layout/app-layout.tsx
src/components/app-layout/assets/pp.jpg
src/components/app-layout/index.ts
src/components/custom-portable-text/custom-portable-text.tsx
src/components/custom-portable-text/index.ts
src/components/custom-portable-text/portable-text-components.tsx
src/components/dark-mode-switch/dark-mode-switch.tsx
src/components/dark-mode-switch/index.ts
src/components/file-display/assets/not-the-files-you-re-looking-for.jpg
src/components/file-display/file-content.tsx
src/components/file-display/file-list.tsx
src/components/file-display/file-row.tsx
src/components/file-display/index.ts
src/components/file-display/not-the-files-you-re-looking-for.tsx
src/components/main-nav/components/index.ts
src/components/main-nav/components/nav-link.tsx
src/components/main-nav/index.ts
src/components/main-nav/main-nav.tsx
src/components/multiply-children/index.ts
src/components/multiply-children/multiply-children.tsx
src/components/text-components/h1.tsx
src/components/text-components/h2.tsx
src/components/text-components/h3.tsx
src/components/text-components/index.ts
src/components/text-components/link.tsx
src/components/text-components/ol.tsx
src/components/text-components/paragraph.tsx
src/components/text-components/ul.tsx
src/components/time-ago/time-ago.tsx
src/components/ui/avatar.tsx
src/components/ui/badge.tsx
src/components/ui/button.tsx
src/components/ui/dropdown-menu.tsx
src/components/ui/form.tsx
src/components/ui/input.tsx
src/components/ui/label.tsx
src/components/ui/own-avatar/index.ts
src/components/ui/own-avatar/own-avatar.tsx
src/components/ui/skeleton.tsx
src/components/visual-terminal/blank-terminal-line.tsx
src/components/visual-terminal/index.ts
src/components/visual-terminal/loading-animation.tsx
src/components/visual-terminal/terminal-output.tsx
src/components/visual-terminal/visual-terminal.tsx
src/lib/prepare-type-animation-array.ts
src/lib/sanity/get-events.ts
src/lib/sanity/get-general-info.ts
src/lib/sanity/get-intro-sentences-v2.ts
src/lib/sanity/get-public-talks.ts
src/lib/sanity/get-talk-data.ts
src/lib/sanity/get-talks-section-content.ts
src/lib/sanity/get-wiki-content.ts
src/lib/server-only/server-url.ts
src/lib/utils.ts
src/sanity/desk-structure.ts
src/sanity/index.ts
src/sanity/sanity.config.ts
src/sanity/schemas/event.ts
src/sanity/schemas/general.ts
src/sanity/schemas/index.ts
src/sanity/schemas/llm-content.ts
src/sanity/schemas/talk-file.ts
src/sanity/schemas/talk.ts
src/sanity/schemas/wiki-page.ts
```

## Appendix B. Exact retained test imports and mocks

Import lines below refer to the beginning of the declaration (multiline imports name their
final module on a later line). All file paths are relative to this repository.

### `src/app/(lab)/lab/1-quest/chat/prompt.test.ts`

```text
line 1: vitest
line 6: ./prompt
3: vi.mock('server-only', () => ({}));
4: vi.mock('@/lib/sanity-client', () => ({ sanityFetch: vi.fn() }));
```

### `src/app/(lab)/lab/1-quest/world/appearance.test.ts`

```text
line 1: vitest
line 11: ./appearance
line 12: ./schema
line 13: ./character-parts
line 14: ./compile
line 15: ./default-world
```

### `src/app/(lab)/lab/1-quest/world/character-parts.test.ts`

```text
line 1: node:fs
line 2: node:path
line 3: vitest
line 14: ./character-parts
line 15: ./schema
```

### `src/app/(lab)/lab/1-quest/world/compile.test.ts`

```text
line 1: vitest
line 2: ./character-parts
line 3: ./compile
line 4: ./default-world
line 5: ./floorplan
line 6: ./furnish
line 7: ./catalog
line 8: ./random
line 9: ./replay
line 10: ./sanitize
line 22: ./schema
line 23: ./types
line 24: ./validate
```

### `src/app/(lab)/lab/1-quest/world/generate.test.ts`

```text
line 1: vitest
line 14: ai
line 18: ./default-world
line 19: ./floorplan
line 28: ./generate
line 29: ./schema
8: vi.mock('server-only', () => ({}));
9: vi.mock('@/lib/server-only/openai-client', () => ({
13: vi.mock('ai', async (original) => ({
```

### `src/app/(lab)/lab/1-quest/world/offline-briefs.test.ts`

```text
line 1: vitest
line 2: ./compile
line 3: ./default-world
line 4: ./offline-briefs
line 5: ./sanitize
line 6: ./schema
line 7: ./validate
```

### `src/app/(lab)/lab/1-quest/world/sanitize.test.ts`

```text
line 1: vitest
line 2: ./appearance
line 3: ./default-world
line 4: ./sanitize
line 5: ./schema
```

### `src/app/(lab)/lab/1-quest/world/store.test.ts`

```text
line 1: node:fs/promises
line 2: node:os
line 3: node:path
line 4: vitest
line 9: ./contract
line 10: ./default-world
line 11: ./schema
line 25: ./store
6: vi.mock('server-only', () => ({}));
7: vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }));
```

### `src/app/(lab)/lab/1-quest/world/use-world.test.ts`

```text
line 1: vitest
line 2: ./contract
line 3: ./default-world
line 4: ./sanitize
line 5: ./schema
line 13: ./use-world
```

### `src/app/api/completion/route.test.ts`

```text
line 1: vitest
line 15: ai
line 18: ./route
9: vi.mock('@/lib/server-only/openai-client', () => ({
13: vi.mock('@/lib/server-only/llm-context-utils', () => ({ getLlmContext: mocks.context }));
14: vi.mock('ai', async (original) => ({
```

### `src/app/api/lab/quest/chat/route.test.ts`

```text
line 1: vitest
line 11: @/app/(lab)/lab/1-quest/server/rate-limit
line 23: @/app/(lab)/lab/1-quest/server/rate-limit
line 28: ai
line 32: @/app/(lab)/lab/1-quest/chat/contract
line 33: @/app/(lab)/lab/1-quest/chat/prompt
line 34: ./route
13: vi.mock('server-only', () => ({}));
14: vi.mock('@/lib/server-only/openai-client', () => ({
19: vi.mock('@/lib/server-only/llm-context-utils', () => ({ getLlmContext: mocks.context }));
20: vi.mock('@/lib/sanity-client', () => ({ sanityFetch: vi.fn() }));
21: vi.mock('@/app/(lab)/lab/1-quest/server/rate-limit', async (original) => {
27: vi.mock('ai', async (original) => ({
```

### `src/app/api/lab/quest/contact/route.test.ts`

```text
line 1: node:fs/promises
line 2: node:os
line 3: node:path
line 4: vitest
line 10: @/app/(lab)/lab/1-quest/server/rate-limit
line 19: @/app/(lab)/lab/1-quest/server/rate-limit
line 24: ./route
12: vi.mock('server-only', () => ({}));
13: vi.mock('@/lib/server-only/openai-client', () => ({
16: vi.mock('@/lib/sanity-client', () => ({ sanityFetch: vi.fn() }));
17: vi.mock('@/app/(lab)/lab/1-quest/server/rate-limit', async (original) => {
75: vi.spyOn(process, 'cwd').mockReturnValue(outboxRoot);
```

### `src/app/api/lab/quest/world/route.test.ts`

```text
line 1: node:fs/promises
line 2: node:os
line 3: node:path
line 4: vitest
line 14: @/app/(lab)/lab/1-quest/world/generate
line 21: @/app/(lab)/lab/1-quest/world/contract
line 22: @/app/(lab)/lab/1-quest/world/generate
line 23: @/app/(lab)/lab/1-quest/world/default-world
line 24: @/app/(lab)/lab/1-quest/world/sanitize
line 25: @/app/(lab)/lab/1-quest/world/store
line 26: @/app/(lab)/lab/1-quest/world/forge
line 27: ./route
10: vi.mock('server-only', () => ({}));
11: vi.mock('@/lib/server-only/openai-client', () => ({ aiOpenAI: {}, openai: {} }));
12: vi.mock('next/server', () => ({ after: mocks.after, connection: vi.fn(async () => {}) }));
13: vi.mock('@/app/(lab)/lab/1-quest/world/generate', async (original) => ({
```

## Appendix C. Every package: keep / replace / drop and runtime compatibility

Every version link below is an exact npm manifest fetched during this research. For
entries with `^` in package.json, the lower-bound version was checked; no install or
lockfile resolution was changed. “Yes (inferred)” is a static compatibility assessment;
“build only” means no deployed import is needed. Code import evidence for retained
packages is in Appendix D.

### Production dependencies

| Package / verified version                                                                                | Decision                        | Vite SSR                                             | Workers with nodejs_compat                                     | Reason                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [@ai-sdk/openai 4.0.103](https://registry.npmjs.org/%40ai-sdk%2Fopenai/4.0.103)                           | Keep as-is                      | Yes (server)                                         | Yes for current HTTP/Web Streams paths                         | OpenAI Responses provider used by server generation/chat. Zod 4 peer fits.                                                                  |
| [@ai-sdk/react 4.0.158](https://registry.npmjs.org/%40ai-sdk%2Freact/4.0.158)                             | Keep as-is                      | Yes (React/JS; inferred)                             | Yes for SSR/browser split (inferred)                           | Completion + chat browser hooks, SSR component import expected; hooks issue HTTP after interaction/effect. React peer fits.                 |
| [@base-ui/react 1.9.0](https://registry.npmjs.org/%40base-ui%2Freact/1.9.0)                               | Keep as-is                      | Yes (React/JS; inferred)                             | Yes for SSR/browser split (inferred)                           | Used menu, menubar, dialog, tabs, tooltip. React 19 peer fits; hydrate DOM/portals. Optional date-fns peer need not be a direct dependency. |
| [@hookform/resolvers 6.0.0](https://registry.npmjs.org/%40hookform%2Fresolvers/6.0.0)                     | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded site question form (`src/app/(site)/components/question-form-link.tsx:7`). React Hook Form/Zod compatibility is fine.         |
| [@portabletext/react 8.0.1](https://registry.npmjs.org/%40portabletext%2Freact/8.0.1)                     | Keep as-is                      | Yes (React/JS; inferred)                             | Yes for SSR/browser split (inferred)                           | Both wiki renderers; React 19 peer fits. Pure rendering path.                                                                               |
| [@radix-ui/react-avatar 1.3.1](https://registry.npmjs.org/%40radix-ui%2Freact-avatar/1.3.1)               | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded `src/components/ui/avatar.tsx:4`; SSR supported by Radix.                                                                     |
| [@radix-ui/react-dropdown-menu 2.2.1](https://registry.npmjs.org/%40radix-ui%2Freact-dropdown-menu/2.2.1) | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded `src/components/ui/dropdown-menu.tsx:4`; SSR supported by Radix.                                                              |
| [@radix-ui/react-label 2.1.17](https://registry.npmjs.org/%40radix-ui%2Freact-label/2.1.17)               | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded label/form wrappers (`src/components/ui/label.tsx:4`, `form.tsx:4`).                                                          |
| [@radix-ui/react-slot 1.5.0](https://registry.npmjs.org/%40radix-ui%2Freact-slot/1.5.0)                   | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded button/form wrappers (`src/components/ui/button.tsx:2`, `form.tsx:5`).                                                        |
| [@react-three/drei 10.7.9](https://registry.npmjs.org/%40react-three%2Fdrei/10.7.9)                       | Keep as-is                      | Import/core only; canvas client-only                 | Browser rendering only; no WebGL on Worker                     | PerformanceMonitor/useGLTF; keep canvas client-only; peer Fiber 9/React 19.                                                                 |
| [@react-three/fiber 9.8.2](https://registry.npmjs.org/%40react-three%2Ffiber/9.8.2)                       | Keep as-is                      | Import/core only; canvas client-only                 | Browser rendering only; no WebGL on Worker                     | Fiber 9.8.2 accepts >=19 <19.4; keep WebGL/client side.                                                                                     |
| [@sanity/client 8.11.0](https://registry.npmjs.org/%40sanity%2Fclient/8.11.0)                             | Keep as-is                      | Yes (server)                                         | Yes for current HTTP/Web Streams paths                         | Replace next-sanity import with this existing direct dependency; explicit worker/workerd exports.                                           |
| [@sanity/vision 6.20.0](https://registry.npmjs.org/%40sanity%2Fvision/6.20.0)                             | Drop                            | Studio browser plugin                                | Not a runtime server dependency                                | Only Studio config; no retained imports.                                                                                                    |
| [@vercel/speed-insights 2.0.0](https://registry.npmjs.org/%40vercel%2Fspeed-insights/2.0.0)               | Drop                            | Generic React yes; /next no                          | Browser collector possible; no Vercel hosting integration here | Only excluded site layout; Vercel platform collection needs separate setup.                                                                 |
| [ai 7.0.154](https://registry.npmjs.org/ai/7.0.154)                                                       | Keep as-is                      | Yes (server)                                         | Yes for current HTTP/Web Streams paths                         | Shared client transport + server Web Streams, tool/structured output; preserve two distinct stream protocols.                               |
| [class-variance-authority 0.7.1](https://registry.npmjs.org/class-variance-authority/0.7.1)               | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded old UI variants (`src/components/ui/button.tsx:3`, `badge.tsx:2`).                                                            |
| [clsx 2.1.1](https://registry.npmjs.org/clsx/2.1.1)                                                       | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded `src/lib/utils.ts:1`.                                                                                                         |
| [date-fns 4.4.0](https://registry.npmjs.org/date-fns/4.4.0)                                               | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded `src/components/time-ago/time-ago.tsx:4`; not needed by lab date formatting.                                                  |
| [lucide-react 1.61.0](https://registry.npmjs.org/lucide-react/1.61.0)                                     | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Excluded old UI/site icons; lab has local icons. E.g. `src/components/file-display/file-list.tsx:3`.                                        |
| [next 16.4.3](https://registry.npmjs.org/next/16.4.3)                                                     | Replace                         | No, Next routes require Next runtime                 | No in this architecture                                        | Replace App Router/build/cache/font/image helpers with Start/Router/Vite/platform equivalents.                                              |
| [next-sanity 13.4.0](https://registry.npmjs.org/next-sanity/13.4.0)                                       | Replace with @sanity/client     | Next integration is framework-bound                  | No retained Next integration                                   | Direct createClient/QueryParams are the only retained uses; do not carry Studio/Next peers.                                                 |
| [next-themes 0.4.6](https://registry.npmjs.org/next-themes/0.4.6)                                         | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Works beyond Next; only excluded old theme provider / dark mode switch.                                                                     |
| [openai 7.45.0](https://registry.npmjs.org/openai/7.45.0)                                                 | Keep as-is                      | Yes (server)                                         | Yes for current HTTP/Web Streams paths                         | Native SDK moderation calls; standard HTTPS; no required npm dependencies. Optional undici/ws peers not needed here.                        |
| [react 19.3.1](https://registry.npmjs.org/react/19.3.1)                                                   | Keep as-is                      | Yes (React/JS; inferred)                             | Yes for SSR/browser split (inferred)                           | Keep 19.3.1; matches Fiber, AI React, Base UI and Portable Text peers.                                                                      |
| [react-dom 19.3.1](https://registry.npmjs.org/react-dom/19.3.1)                                           | Keep as-is                      | Yes (React/JS; inferred)                             | Yes for SSR/browser split (inferred)                           | Keep paired 19.3.1 and server/browser entries; no Node-only server entry for workerd.                                                       |
| [react-hook-form 7.91.0](https://registry.npmjs.org/react-hook-form/7.91.0)                               | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded old question form and form wrappers; lab forms use React state directly.                                                      |
| [react-type-animation 3.2.0](https://registry.npmjs.org/react-type-animation/3.2.0)                       | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded `src/app/(site)/components/second-line.tsx:3`; browser animation would need hydration if retained.                            |
| [sanity 6.20.0](https://registry.npmjs.org/sanity/6.20.0)                                                 | Drop (separate Studio optional) | Browser SPA; SSR Studio not needed                   | Do not deploy Studio CLI/server code                           | No retained runtime imports; independent sanity deploy if desired.                                                                          |
| [server-only 0.0.1](https://registry.npmjs.org/server-only/0.0.1)                                         | Replace                         | Default import throws outside React server condition | Replace boundary, not shim globally                            | Use Start server-only import protection; remove old poison-pill dependency.                                                                 |
| [sharp 0.35.5](https://registry.npmjs.org/sharp/0.35.5)                                                   | Move to dev if tools kept       | Yes on Node SSR; not workerd                         | No native runtime; offline only                                | Required by three offline voxel scripts, not only Next image. No Worker image optimizer needed.                                             |
| [styled-components 6.6.0](https://registry.npmjs.org/styled-components/6.6.0)                             | Drop                            | Yes with SSR style collection                        | Yes (inferred React/CSS path)                                  | No retained usage; only Studio/next-sanity peer requirement. No need to recreate SSR style registry.                                        |
| [tailwind-merge 3.7.0](https://registry.npmjs.org/tailwind-merge/3.7.0)                                   | Drop (unused)                   | Yes (inferred; DOM effects client-side)              | SSR/JS path expected; no current need                          | Only excluded `src/lib/utils.ts:2`.                                                                                                         |
| [three 0.186.1](https://registry.npmjs.org/three/0.186.1)                                                 | Keep as-is                      | Import/core only; canvas client-only                 | Browser rendering only; no WebGL on Worker                     | Keep math, geometries, GLTF and postprocessing; actual GPU/DOM rendering stays in browser.                                                  |
| [zod 4.6.7](https://registry.npmjs.org/zod/4.6.7)                                                         | Keep as-is                      | Yes (React/JS; inferred)                             | Yes for SSR/browser split (inferred)                           | Keep schema v4; model/provider/resolver peer ranges accept it.                                                                              |

### Development dependencies

| Package / verified version                                                                          | Decision                                      | Vite SSR/build host           | Workers deployment runtime                             | Reason                                                                                               |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [@gltf-transform/core 4.5.1](https://registry.npmjs.org/%40gltf-transform%2Fcore/4.5.1)             | Keep dev if asset pipeline kept               | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Node/offline asset I/O; NodeIO not Worker code.                                                      |
| [@gltf-transform/extensions 4.5.1](https://registry.npmjs.org/%40gltf-transform%2Fextensions/4.5.1) | Keep dev if asset pipeline kept               | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Offline glTF extension/compression registration.                                                     |
| [@gltf-transform/functions 4.5.1](https://registry.npmjs.org/%40gltf-transform%2Ffunctions/4.5.1)   | Keep dev if asset pipeline kept               | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Offline optimizer; may use Node image tooling transitively.                                          |
| [@playwright/test 1.64.1](https://registry.npmjs.org/%40playwright%2Ftest/1.64.1)                   | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Existing E2E targets need replacement; also used by tools/quest-voxel/review/shoot.mjs:12.           |
| [@tailwindcss/postcss 4.3.3](https://registry.npmjs.org/%40tailwindcss%2Fpostcss/4.3.3)             | Keep; optional replace with @tailwindcss/vite | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Existing PostCSS integration works with Vite; avoid running both Tailwind integrations.              |
| [@types/node ^24.19.2](https://registry.npmjs.org/%40types%2Fnode/24.19.2)                          | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Tool/config/tests and server compatibility types; not proof all Node APIs exist in Workers.          |
| [@types/react 19.3.0](https://registry.npmjs.org/%40types%2Freact/19.3.0)                           | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | React 19 types; paired with runtime.                                                                 |
| [@types/react-dom 19.3.0](https://registry.npmjs.org/%40types%2Freact-dom/19.3.0)                   | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Paired ReactDOM types.                                                                               |
| [@types/three ^0.186.0](https://registry.npmjs.org/%40types%2Fthree/0.186.0)                        | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Matching Three minor; canvas and geometry TS support.                                                |
| [babel-plugin-react-compiler 1.0.0](https://registry.npmjs.org/babel-plugin-react-compiler/1.0.0)   | Keep dev with Vite wiring                     | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Current app enables compiler; plugin-react >=6 uses reactCompilerPreset + @rolldown/plugin-babel.    |
| [eslint 9.39.5](https://registry.npmjs.org/eslint/9.39.5)                                           | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Keep 9.39.5 initially; newer major optional after replacing presets.                                 |
| [eslint-config-next 16.4.3](https://registry.npmjs.org/eslint-config-next/16.4.3)                   | Replace                                       | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Framework-neutral ESLint/TypeScript/React Hooks presets; no Next rules.                              |
| [meshoptimizer 1.3.0](https://registry.npmjs.org/meshoptimizer/1.3.0)                               | Keep dev if asset pipeline kept               | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Encoder imported by optimize-glb.mjs:6; browser GLB decoding is through Drei/Three dependencies.     |
| [postcss 8.5.32](https://registry.npmjs.org/postcss/8.5.32)                                         | Keep dev with existing pipeline               | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Optional drop direct dependency if moving entirely to @tailwindcss/vite and no other PostCSS config. |
| [prettier 3.9.10](https://registry.npmjs.org/prettier/3.9.10)                                       | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Formatting independent of framework.                                                                 |
| [prettier-plugin-tailwindcss 0.8.1](https://registry.npmjs.org/prettier-plugin-tailwindcss/0.8.1)   | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Works on source/CSS; update stylesheet/config paths only if moved.                                   |
| [rimraf 6.1.3](https://registry.npmjs.org/rimraf/6.1.3)                                             | Drop unless repurposed                        | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Only package.json:10 clear-cache script targets .next; Vite cache cleanup is optional.               |
| [tailwindcss 4.3.3](https://registry.npmjs.org/tailwindcss/4.3.3)                                   | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | CSS compile-time dependency; emitted CSS runs everywhere.                                            |
| [tw-animate-css 1.4.0](https://registry.npmjs.org/tw-animate-css/1.4.0)                             | Keep as-is                                    | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Imported in global CSS; CSS emission only, no Node runtime.                                          |
| [typescript 6.0.3](https://registry.npmjs.org/typescript/6.0.3)                                     | Keep 6.0.3                                    | Node build/test or types only | Not bundled/executed; CSS output only where applicable | Separate typecheck; no verified reason to change version; remove Next plugin/typegen paths.          |
| [vitest 5.0.5](https://registry.npmjs.org/vitest/5.0.5)                                             | Keep dev                                      | Node build/test or types only | Not bundled/executed; CSS output only where applicable | 5.0.5 peers accept Vite 8 and Node >=22.12 / supported newer LTS. Existing domain tests remain Node. |

## Appendix D. Complete retained import graph (395 declarations/edges)

Every importing `file:line` is followed by its specifier and resolved repository target,
or `package` for external modules. `type-only` does not create a runtime dependency;
`dynamic` marks the client canvas split. CSS imports are included. Static image files have
no imports. This is a source graph, not an expanded node_modules transitive graph.

### `src/app/(lab)/lab/1-quest/chat/contract.ts`

```text
src/app/(lab)/lab/1-quest/chat/contract.ts:1 -> zod -> package
```

### `src/app/(lab)/lab/1-quest/chat/history.ts`

```text
src/app/(lab)/lab/1-quest/chat/history.ts:1 -> server-only -> package
src/app/(lab)/lab/1-quest/chat/history.ts:2 -> ai -> package [type-only]
src/app/(lab)/lab/1-quest/chat/history.ts:3 -> zod -> package
src/app/(lab)/lab/1-quest/chat/history.ts:4 -> ./contract -> src/app/(lab)/lab/1-quest/chat/contract.ts
src/app/(lab)/lab/1-quest/chat/history.ts:5 -> ./prompt -> src/app/(lab)/lab/1-quest/chat/prompt.ts
src/app/(lab)/lab/1-quest/chat/history.ts:6 -> ./sanitize -> src/app/(lab)/lab/1-quest/chat/sanitize.ts
```

### `src/app/(lab)/lab/1-quest/chat/mailer.ts`

```text
src/app/(lab)/lab/1-quest/chat/mailer.ts:1 -> server-only -> package
src/app/(lab)/lab/1-quest/chat/mailer.ts:2 -> node:crypto -> package
src/app/(lab)/lab/1-quest/chat/mailer.ts:3 -> node:fs/promises -> package
src/app/(lab)/lab/1-quest/chat/mailer.ts:4 -> node:path -> package
src/app/(lab)/lab/1-quest/chat/mailer.ts:5 -> ../../_shared/content -> src/app/(lab)/lab/_shared/content.ts
src/app/(lab)/lab/1-quest/chat/mailer.ts:6 -> ./contract -> src/app/(lab)/lab/1-quest/chat/contract.ts [type-only]
src/app/(lab)/lab/1-quest/chat/mailer.ts:7 -> ./sanitize -> src/app/(lab)/lab/1-quest/chat/sanitize.ts
```

### `src/app/(lab)/lab/1-quest/chat/prompt.ts`

```text
src/app/(lab)/lab/1-quest/chat/prompt.ts:1 -> server-only -> package
src/app/(lab)/lab/1-quest/chat/prompt.ts:2 -> ../../_shared/content -> src/app/(lab)/lab/_shared/content.ts
```

### `src/app/(lab)/lab/1-quest/chat/sanitize.ts`

```text
src/app/(lab)/lab/1-quest/chat/sanitize.ts:1 -> server-only -> package
src/app/(lab)/lab/1-quest/chat/sanitize.ts:2 -> ./contract -> src/app/(lab)/lab/1-quest/chat/contract.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/chat/tools.ts`

```text
src/app/(lab)/lab/1-quest/chat/tools.ts:1 -> server-only -> package
src/app/(lab)/lab/1-quest/chat/tools.ts:2 -> ai -> package
src/app/(lab)/lab/1-quest/chat/tools.ts:3 -> ./contract -> src/app/(lab)/lab/1-quest/chat/contract.ts
src/app/(lab)/lab/1-quest/chat/tools.ts:4 -> ./prompt -> src/app/(lab)/lab/1-quest/chat/prompt.ts
src/app/(lab)/lab/1-quest/chat/tools.ts:5 -> ./sanitize -> src/app/(lab)/lab/1-quest/chat/sanitize.ts
```

### `src/app/(lab)/lab/1-quest/chat/use-max-chat.ts`

```text
src/app/(lab)/lab/1-quest/chat/use-max-chat.ts:3 -> @ai-sdk/react -> package
src/app/(lab)/lab/1-quest/chat/use-max-chat.ts:4 -> ai -> package
src/app/(lab)/lab/1-quest/chat/use-max-chat.ts:5 -> react -> package
src/app/(lab)/lab/1-quest/chat/use-max-chat.ts:6 -> @/lib/get-suggestions -> src/lib/get-suggestions.ts
src/app/(lab)/lab/1-quest/chat/use-max-chat.ts:7 -> ./contract -> src/app/(lab)/lab/1-quest/chat/contract.ts
```

### `src/app/(lab)/lab/1-quest/page.tsx`

```text
src/app/(lab)/lab/1-quest/page.tsx:1 -> next/font/google -> package
src/app/(lab)/lab/1-quest/page.tsx:2 -> react -> package
src/app/(lab)/lab/1-quest/page.tsx:3 -> ../_shared/content -> src/app/(lab)/lab/_shared/content.ts
src/app/(lab)/lab/1-quest/page.tsx:4 -> ./ui/hud -> src/app/(lab)/lab/1-quest/ui/hud.tsx
src/app/(lab)/lab/1-quest/page.tsx:5 -> ./ui/hud.module.css -> src/app/(lab)/lab/1-quest/ui/hud.module.css
src/app/(lab)/lab/1-quest/page.tsx:6 -> ./ui/quest-app -> src/app/(lab)/lab/1-quest/ui/quest-app.tsx
src/app/(lab)/lab/1-quest/page.tsx:7 -> ./world/store -> src/app/(lab)/lab/1-quest/world/store.ts
```

### `src/app/(lab)/lab/1-quest/scene/actors.tsx`

```text
src/app/(lab)/lab/1-quest/scene/actors.tsx:3 -> @react-three/fiber -> package
src/app/(lab)/lab/1-quest/scene/actors.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/scene/actors.tsx:5 -> three -> package
src/app/(lab)/lab/1-quest/scene/actors.tsx:6 -> ../world/catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts
src/app/(lab)/lab/1-quest/scene/actors.tsx:7 -> ../world/compile -> src/app/(lab)/lab/1-quest/world/compile.ts
src/app/(lab)/lab/1-quest/scene/actors.tsx:8 -> ../world/random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/scene/actors.tsx:9 -> ../world/appearance -> src/app/(lab)/lab/1-quest/world/appearance.ts [type-only]
src/app/(lab)/lab/1-quest/scene/actors.tsx:10 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts [type-only]
src/app/(lab)/lab/1-quest/scene/actors.tsx:11 -> ./bus -> src/app/(lab)/lab/1-quest/scene/bus.ts [type-only]
src/app/(lab)/lab/1-quest/scene/actors.tsx:12 -> ./furniture -> src/app/(lab)/lab/1-quest/scene/furniture.tsx
src/app/(lab)/lab/1-quest/scene/actors.tsx:13 -> ./characters -> src/app/(lab)/lab/1-quest/scene/characters.ts
src/app/(lab)/lab/1-quest/scene/actors.tsx:14 -> ./kit -> src/app/(lab)/lab/1-quest/scene/kit.tsx
src/app/(lab)/lab/1-quest/scene/actors.tsx:15 -> ./materials -> src/app/(lab)/lab/1-quest/scene/materials.ts
src/app/(lab)/lab/1-quest/scene/actors.tsx:16 -> ./spawn -> src/app/(lab)/lab/1-quest/scene/spawn.ts
```

### `src/app/(lab)/lab/1-quest/scene/bus.ts`

```text
src/app/(lab)/lab/1-quest/scene/bus.ts:1 -> ../world/schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
src/app/(lab)/lab/1-quest/scene/bus.ts:2 -> ../world/catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/scene/characters.ts`

```text
src/app/(lab)/lab/1-quest/scene/characters.ts:1 -> three -> package
src/app/(lab)/lab/1-quest/scene/characters.ts:2 -> three/examples/jsm/utils/BufferGeometryUtils.js -> package
src/app/(lab)/lab/1-quest/scene/characters.ts:3 -> ../world/appearance -> src/app/(lab)/lab/1-quest/world/appearance.ts
src/app/(lab)/lab/1-quest/scene/characters.ts:4 -> ../world/catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts [type-only]
src/app/(lab)/lab/1-quest/scene/characters.ts:5 -> ../world/character-parts -> src/app/(lab)/lab/1-quest/world/character-parts.ts
src/app/(lab)/lab/1-quest/scene/characters.ts:6 -> ./kit -> src/app/(lab)/lab/1-quest/scene/kit.tsx
src/app/(lab)/lab/1-quest/scene/characters.ts:16 -> ./palette -> src/app/(lab)/lab/1-quest/scene/palette.ts
```

### `src/app/(lab)/lab/1-quest/scene/controller.tsx`

```text
src/app/(lab)/lab/1-quest/scene/controller.tsx:3 -> @react-three/fiber -> package
src/app/(lab)/lab/1-quest/scene/controller.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/scene/controller.tsx:5 -> three -> package
src/app/(lab)/lab/1-quest/scene/controller.tsx:6 -> ../world/compile -> src/app/(lab)/lab/1-quest/world/compile.ts
src/app/(lab)/lab/1-quest/scene/controller.tsx:14 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts
src/app/(lab)/lab/1-quest/scene/controller.tsx:15 -> ../ui/hooks -> src/app/(lab)/lab/1-quest/ui/hooks.ts
src/app/(lab)/lab/1-quest/scene/controller.tsx:16 -> ./actors -> src/app/(lab)/lab/1-quest/scene/actors.tsx
src/app/(lab)/lab/1-quest/scene/controller.tsx:17 -> ./bus -> src/app/(lab)/lab/1-quest/scene/bus.ts [type-only]
src/app/(lab)/lab/1-quest/scene/controller.tsx:18 -> ./materials -> src/app/(lab)/lab/1-quest/scene/materials.ts
```

### `src/app/(lab)/lab/1-quest/scene/furniture.tsx`

```text
src/app/(lab)/lab/1-quest/scene/furniture.tsx:3 -> @react-three/fiber -> package
src/app/(lab)/lab/1-quest/scene/furniture.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/scene/furniture.tsx:5 -> three -> package
src/app/(lab)/lab/1-quest/scene/furniture.tsx:6 -> ../world/catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts
src/app/(lab)/lab/1-quest/scene/furniture.tsx:7 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts [type-only]
src/app/(lab)/lab/1-quest/scene/furniture.tsx:8 -> ./kit -> src/app/(lab)/lab/1-quest/scene/kit.tsx
src/app/(lab)/lab/1-quest/scene/furniture.tsx:9 -> ./materials -> src/app/(lab)/lab/1-quest/scene/materials.ts
src/app/(lab)/lab/1-quest/scene/furniture.tsx:10 -> ./office -> src/app/(lab)/lab/1-quest/scene/office.tsx [type-only]
src/app/(lab)/lab/1-quest/scene/furniture.tsx:11 -> ./spawn -> src/app/(lab)/lab/1-quest/scene/spawn.ts
```

### `src/app/(lab)/lab/1-quest/scene/grounds.tsx`

```text
src/app/(lab)/lab/1-quest/scene/grounds.tsx:3 -> react -> package
src/app/(lab)/lab/1-quest/scene/grounds.tsx:4 -> three -> package
src/app/(lab)/lab/1-quest/scene/grounds.tsx:5 -> ../world/random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/scene/grounds.tsx:6 -> ../world/schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
src/app/(lab)/lab/1-quest/scene/grounds.tsx:7 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts [type-only]
src/app/(lab)/lab/1-quest/scene/grounds.tsx:8 -> ./materials -> src/app/(lab)/lab/1-quest/scene/materials.ts
src/app/(lab)/lab/1-quest/scene/grounds.tsx:9 -> ./palette -> src/app/(lab)/lab/1-quest/scene/palette.ts [type-only]
src/app/(lab)/lab/1-quest/scene/grounds.tsx:10 -> ./textures -> src/app/(lab)/lab/1-quest/scene/textures.ts
```

### `src/app/(lab)/lab/1-quest/scene/kit.tsx`

```text
src/app/(lab)/lab/1-quest/scene/kit.tsx:3 -> @react-three/drei -> package
src/app/(lab)/lab/1-quest/scene/kit.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/scene/kit.tsx:14 -> three -> package
src/app/(lab)/lab/1-quest/scene/kit.tsx:15 -> ../world/catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts
src/app/(lab)/lab/1-quest/scene/kit.tsx:16 -> ../world/random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/scene/kit.tsx:17 -> ./palette -> src/app/(lab)/lab/1-quest/scene/palette.ts
```

### `src/app/(lab)/lab/1-quest/scene/life.tsx`

```text
src/app/(lab)/lab/1-quest/scene/life.tsx:3 -> @react-three/fiber -> package
src/app/(lab)/lab/1-quest/scene/life.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/scene/life.tsx:5 -> three -> package
src/app/(lab)/lab/1-quest/scene/life.tsx:6 -> ../world/random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/scene/life.tsx:7 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts [type-only]
src/app/(lab)/lab/1-quest/scene/life.tsx:8 -> ./bus -> src/app/(lab)/lab/1-quest/scene/bus.ts [type-only]
src/app/(lab)/lab/1-quest/scene/life.tsx:9 -> ./materials -> src/app/(lab)/lab/1-quest/scene/materials.ts
src/app/(lab)/lab/1-quest/scene/life.tsx:10 -> ./spawn -> src/app/(lab)/lab/1-quest/scene/spawn.ts
src/app/(lab)/lab/1-quest/scene/life.tsx:11 -> ./textures -> src/app/(lab)/lab/1-quest/scene/textures.ts
```

### `src/app/(lab)/lab/1-quest/scene/materials.ts`

```text
src/app/(lab)/lab/1-quest/scene/materials.ts:1 -> three -> package
```

### `src/app/(lab)/lab/1-quest/scene/night.tsx`

```text
src/app/(lab)/lab/1-quest/scene/night.tsx:3 -> @react-three/fiber -> package
src/app/(lab)/lab/1-quest/scene/night.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/scene/night.tsx:5 -> three -> package
src/app/(lab)/lab/1-quest/scene/night.tsx:6 -> ../world/catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts
src/app/(lab)/lab/1-quest/scene/night.tsx:7 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts [type-only]
src/app/(lab)/lab/1-quest/scene/night.tsx:8 -> ./materials -> src/app/(lab)/lab/1-quest/scene/materials.ts
src/app/(lab)/lab/1-quest/scene/night.tsx:9 -> ./office -> src/app/(lab)/lab/1-quest/scene/office.tsx
src/app/(lab)/lab/1-quest/scene/night.tsx:10 -> ./palette -> src/app/(lab)/lab/1-quest/scene/palette.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/scene/office.tsx`

```text
src/app/(lab)/lab/1-quest/scene/office.tsx:3 -> @react-three/fiber -> package
src/app/(lab)/lab/1-quest/scene/office.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/scene/office.tsx:5 -> three -> package
src/app/(lab)/lab/1-quest/scene/office.tsx:6 -> ../world/furnish -> src/app/(lab)/lab/1-quest/world/furnish.ts
src/app/(lab)/lab/1-quest/scene/office.tsx:7 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts
src/app/(lab)/lab/1-quest/scene/office.tsx:8 -> ./bus -> src/app/(lab)/lab/1-quest/scene/bus.ts [type-only]
src/app/(lab)/lab/1-quest/scene/office.tsx:9 -> ./materials -> src/app/(lab)/lab/1-quest/scene/materials.ts
src/app/(lab)/lab/1-quest/scene/office.tsx:10 -> ./palette -> src/app/(lab)/lab/1-quest/scene/palette.ts
src/app/(lab)/lab/1-quest/scene/office.tsx:11 -> ./spawn -> src/app/(lab)/lab/1-quest/scene/spawn.ts
src/app/(lab)/lab/1-quest/scene/office.tsx:12 -> ./textures -> src/app/(lab)/lab/1-quest/scene/textures.ts
```

### `src/app/(lab)/lab/1-quest/scene/palette.ts`

```text
src/app/(lab)/lab/1-quest/scene/palette.ts:1 -> ../world/catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts [type-only]
src/app/(lab)/lab/1-quest/scene/palette.ts:2 -> ../world/random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/scene/palette.ts:3 -> ../world/schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
src/app/(lab)/lab/1-quest/scene/palette.ts:4 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/scene/shading.tsx`

```text
src/app/(lab)/lab/1-quest/scene/shading.tsx:3 -> @react-three/fiber -> package
src/app/(lab)/lab/1-quest/scene/shading.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/scene/shading.tsx:5 -> three -> package
src/app/(lab)/lab/1-quest/scene/shading.tsx:6 -> three/examples/jsm/postprocessing/EffectComposer.js -> package
src/app/(lab)/lab/1-quest/scene/shading.tsx:7 -> three/examples/jsm/postprocessing/GTAOPass.js -> package
src/app/(lab)/lab/1-quest/scene/shading.tsx:8 -> three/examples/jsm/postprocessing/OutputPass.js -> package
src/app/(lab)/lab/1-quest/scene/shading.tsx:9 -> three/examples/jsm/postprocessing/RenderPass.js -> package
src/app/(lab)/lab/1-quest/scene/shading.tsx:10 -> ../world/catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts
src/app/(lab)/lab/1-quest/scene/shading.tsx:11 -> ../world/furnish -> src/app/(lab)/lab/1-quest/world/furnish.ts
src/app/(lab)/lab/1-quest/scene/shading.tsx:12 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts
src/app/(lab)/lab/1-quest/scene/shading.tsx:13 -> ./office -> src/app/(lab)/lab/1-quest/scene/office.tsx
```

### `src/app/(lab)/lab/1-quest/scene/spawn.ts`

```text
src/app/(lab)/lab/1-quest/scene/spawn.ts:1 -> ../world/random -> src/app/(lab)/lab/1-quest/world/random.ts
```

### `src/app/(lab)/lab/1-quest/scene/textures.ts`

```text
src/app/(lab)/lab/1-quest/scene/textures.ts:1 -> three -> package
src/app/(lab)/lab/1-quest/scene/textures.ts:2 -> ../world/random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/scene/textures.ts:3 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts [type-only]
src/app/(lab)/lab/1-quest/scene/textures.ts:4 -> ./palette -> src/app/(lab)/lab/1-quest/scene/palette.ts
```

### `src/app/(lab)/lab/1-quest/scene/weather.tsx`

```text
src/app/(lab)/lab/1-quest/scene/weather.tsx:3 -> @react-three/fiber -> package
src/app/(lab)/lab/1-quest/scene/weather.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/scene/weather.tsx:5 -> three -> package
src/app/(lab)/lab/1-quest/scene/weather.tsx:6 -> ../world/random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/scene/weather.tsx:7 -> ../world/schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
src/app/(lab)/lab/1-quest/scene/weather.tsx:8 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts [type-only]
src/app/(lab)/lab/1-quest/scene/weather.tsx:9 -> ./palette -> src/app/(lab)/lab/1-quest/scene/palette.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/scene/world-canvas.tsx`

```text
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:3 -> @react-three/drei -> package
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:4 -> @react-three/fiber -> package
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:5 -> react -> package
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:6 -> three -> package
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:7 -> ../world/compile -> src/app/(lab)/lab/1-quest/world/compile.ts [type-only]
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:8 -> ./actors -> src/app/(lab)/lab/1-quest/scene/actors.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:9 -> ./bus -> src/app/(lab)/lab/1-quest/scene/bus.ts
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:10 -> ./controller -> src/app/(lab)/lab/1-quest/scene/controller.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:11 -> ./furniture -> src/app/(lab)/lab/1-quest/scene/furniture.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:12 -> ./kit -> src/app/(lab)/lab/1-quest/scene/kit.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:13 -> ./life -> src/app/(lab)/lab/1-quest/scene/life.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:14 -> ./materials -> src/app/(lab)/lab/1-quest/scene/materials.ts
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:15 -> ./night -> src/app/(lab)/lab/1-quest/scene/night.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:16 -> ./grounds -> src/app/(lab)/lab/1-quest/scene/grounds.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:17 -> ./office -> src/app/(lab)/lab/1-quest/scene/office.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:18 -> ./palette -> src/app/(lab)/lab/1-quest/scene/palette.ts
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:19 -> ./shading -> src/app/(lab)/lab/1-quest/scene/shading.tsx
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:20 -> ./spawn -> src/app/(lab)/lab/1-quest/scene/spawn.ts
src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:21 -> ./weather -> src/app/(lab)/lab/1-quest/scene/weather.tsx
```

### `src/app/(lab)/lab/1-quest/server/rate-limit.ts`

```text
src/app/(lab)/lab/1-quest/server/rate-limit.ts:1 -> server-only -> package
```

### `src/app/(lab)/lab/1-quest/ui/chat-log.tsx`

```text
src/app/(lab)/lab/1-quest/ui/chat-log.tsx:3 -> react -> package
src/app/(lab)/lab/1-quest/ui/chat-log.tsx:4 -> ./hud.module.css -> src/app/(lab)/lab/1-quest/ui/hud.module.css
```

### `src/app/(lab)/lab/1-quest/ui/hooks.ts`

```text
src/app/(lab)/lab/1-quest/ui/hooks.ts:3 -> react -> package
```

### `src/app/(lab)/lab/1-quest/ui/hud.module.css`

No imports.

### `src/app/(lab)/lab/1-quest/ui/hud.tsx`

```text
src/app/(lab)/lab/1-quest/ui/hud.tsx:3 -> @base-ui/react/tooltip -> package
src/app/(lab)/lab/1-quest/ui/hud.tsx:4 -> next/image -> package
src/app/(lab)/lab/1-quest/ui/hud.tsx:5 -> react -> package
src/app/(lab)/lab/1-quest/ui/hud.tsx:6 -> @/components/ui/own-avatar/assets/pp.jpg -> src/components/ui/own-avatar/assets/pp.jpg
src/app/(lab)/lab/1-quest/ui/hud.tsx:7 -> ../world/schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
src/app/(lab)/lab/1-quest/ui/hud.tsx:8 -> ../world/compile -> src/app/(lab)/lab/1-quest/world/compile.ts
src/app/(lab)/lab/1-quest/ui/hud.tsx:9 -> ../world/schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
src/app/(lab)/lab/1-quest/ui/hud.tsx:10 -> ../world/types -> src/app/(lab)/lab/1-quest/world/types.ts
src/app/(lab)/lab/1-quest/ui/hud.tsx:11 -> ../scene/bus -> src/app/(lab)/lab/1-quest/scene/bus.ts [type-only]
src/app/(lab)/lab/1-quest/ui/hud.tsx:12 -> ../scene/palette -> src/app/(lab)/lab/1-quest/scene/palette.ts
src/app/(lab)/lab/1-quest/ui/hud.tsx:13 -> ./hud.module.css -> src/app/(lab)/lab/1-quest/ui/hud.module.css
src/app/(lab)/lab/1-quest/ui/hud.tsx:14 -> ./icons -> src/app/(lab)/lab/1-quest/ui/icons.tsx
src/app/(lab)/lab/1-quest/ui/hud.tsx:15 -> ./window -> src/app/(lab)/lab/1-quest/ui/window.tsx
```

### `src/app/(lab)/lab/1-quest/ui/icons.tsx`

No imports.

### `src/app/(lab)/lab/1-quest/ui/labels.module.css`

No imports.

### `src/app/(lab)/lab/1-quest/ui/labels.tsx`

```text
src/app/(lab)/lab/1-quest/ui/labels.tsx:3 -> react -> package
src/app/(lab)/lab/1-quest/ui/labels.tsx:4 -> ../world/compile -> src/app/(lab)/lab/1-quest/world/compile.ts [type-only]
src/app/(lab)/lab/1-quest/ui/labels.tsx:5 -> ../scene/bus -> src/app/(lab)/lab/1-quest/scene/bus.ts
src/app/(lab)/lab/1-quest/ui/labels.tsx:6 -> ./labels.module.css -> src/app/(lab)/lab/1-quest/ui/labels.module.css
```

### `src/app/(lab)/lab/1-quest/ui/quest-app.tsx`

```text
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:3 -> next/dynamic -> package
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:11 -> ../../_shared/content -> src/app/(lab)/lab/_shared/content.ts [type-only]
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:12 -> ../chat/use-max-chat -> src/app/(lab)/lab/1-quest/chat/use-max-chat.ts
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:13 -> ../scene/bus -> src/app/(lab)/lab/1-quest/scene/bus.ts
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:14 -> ../world/compile -> src/app/(lab)/lab/1-quest/world/compile.ts
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:15 -> ../world/default-world -> src/app/(lab)/lab/1-quest/world/default-world.ts
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:16 -> ../world/offline-briefs -> src/app/(lab)/lab/1-quest/world/offline-briefs.ts
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:17 -> ../world/contract -> src/app/(lab)/lab/1-quest/world/contract.ts [type-only]
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:18 -> ../world/replay -> src/app/(lab)/lab/1-quest/world/replay.ts
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:19 -> ../world/schema -> src/app/(lab)/lab/1-quest/world/schema.ts
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:20 -> ../world/use-world -> src/app/(lab)/lab/1-quest/world/use-world.ts
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:21 -> ./chat-log -> src/app/(lab)/lab/1-quest/ui/chat-log.tsx
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:22 -> ./labels -> src/app/(lab)/lab/1-quest/ui/labels.tsx
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:23 -> ./hud.module.css -> src/app/(lab)/lab/1-quest/ui/hud.module.css
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:24 -> ./hud -> src/app/(lab)/lab/1-quest/ui/hud.tsx
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:25 -> ./hooks -> src/app/(lab)/lab/1-quest/ui/hooks.ts
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:36 -> ./window -> src/app/(lab)/lab/1-quest/ui/window.tsx
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:37 -> ./windows -> src/app/(lab)/lab/1-quest/ui/windows.tsx
src/app/(lab)/lab/1-quest/ui/quest-app.tsx:49 -> ../scene/world-canvas -> src/app/(lab)/lab/1-quest/scene/world-canvas.tsx [dynamic]
```

### `src/app/(lab)/lab/1-quest/ui/window.tsx`

```text
src/app/(lab)/lab/1-quest/ui/window.tsx:3 -> @base-ui/react/dialog -> package
src/app/(lab)/lab/1-quest/ui/window.tsx:4 -> react -> package
src/app/(lab)/lab/1-quest/ui/window.tsx:13 -> ./hud.module.css -> src/app/(lab)/lab/1-quest/ui/hud.module.css
src/app/(lab)/lab/1-quest/ui/window.tsx:14 -> ./icons -> src/app/(lab)/lab/1-quest/ui/icons.tsx
```

### `src/app/(lab)/lab/1-quest/ui/windows.tsx`

```text
src/app/(lab)/lab/1-quest/ui/windows.tsx:3 -> @base-ui/react/tabs -> package
src/app/(lab)/lab/1-quest/ui/windows.tsx:4 -> @portabletext/react -> package
src/app/(lab)/lab/1-quest/ui/windows.tsx:5 -> next/image -> package
src/app/(lab)/lab/1-quest/ui/windows.tsx:6 -> react -> package
src/app/(lab)/lab/1-quest/ui/windows.tsx:7 -> @/components/ui/own-avatar/assets/pp.jpg -> src/components/ui/own-avatar/assets/pp.jpg
src/app/(lab)/lab/1-quest/ui/windows.tsx:8 -> ../../_shared/content -> src/app/(lab)/lab/_shared/content.ts [type-only]
src/app/(lab)/lab/1-quest/ui/windows.tsx:9 -> ../chat/contract -> src/app/(lab)/lab/1-quest/chat/contract.ts
src/app/(lab)/lab/1-quest/ui/windows.tsx:15 -> ../chat/use-max-chat -> src/app/(lab)/lab/1-quest/chat/use-max-chat.ts
src/app/(lab)/lab/1-quest/ui/windows.tsx:16 -> ./hud.module.css -> src/app/(lab)/lab/1-quest/ui/hud.module.css
src/app/(lab)/lab/1-quest/ui/windows.tsx:17 -> ./icons -> src/app/(lab)/lab/1-quest/ui/icons.tsx
src/app/(lab)/lab/1-quest/ui/windows.tsx:18 -> ./window -> src/app/(lab)/lab/1-quest/ui/window.tsx
```

### `src/app/(lab)/lab/1-quest/world/appearance.ts`

```text
src/app/(lab)/lab/1-quest/world/appearance.ts:1 -> ./catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts [type-only]
src/app/(lab)/lab/1-quest/world/appearance.ts:2 -> ./character-parts -> src/app/(lab)/lab/1-quest/world/character-parts.ts
src/app/(lab)/lab/1-quest/world/appearance.ts:17 -> ./random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/world/appearance.ts:18 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/world/catalog.ts`

No imports.

### `src/app/(lab)/lab/1-quest/world/character-parts.ts`

No imports.

### `src/app/(lab)/lab/1-quest/world/compile.ts`

```text
src/app/(lab)/lab/1-quest/world/compile.ts:1 -> ./appearance -> src/app/(lab)/lab/1-quest/world/appearance.ts
src/app/(lab)/lab/1-quest/world/compile.ts:2 -> ./character-parts -> src/app/(lab)/lab/1-quest/world/character-parts.ts [type-only]
src/app/(lab)/lab/1-quest/world/compile.ts:3 -> ./catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts
src/app/(lab)/lab/1-quest/world/compile.ts:4 -> ./floorplan -> src/app/(lab)/lab/1-quest/world/floorplan.ts
src/app/(lab)/lab/1-quest/world/compile.ts:13 -> ./furnish -> src/app/(lab)/lab/1-quest/world/furnish.ts
src/app/(lab)/lab/1-quest/world/compile.ts:33 -> ./random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/world/compile.ts:34 -> ./sanitize -> src/app/(lab)/lab/1-quest/world/sanitize.ts
src/app/(lab)/lab/1-quest/world/compile.ts:35 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts
src/app/(lab)/lab/1-quest/world/compile.ts:44 -> ./types -> src/app/(lab)/lab/1-quest/world/types.ts
src/app/(lab)/lab/1-quest/world/compile.ts:73 -> ./types -> src/app/(lab)/lab/1-quest/world/types.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/world/contract.ts`

```text
src/app/(lab)/lab/1-quest/world/contract.ts:1 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/world/default-world.ts`

```text
src/app/(lab)/lab/1-quest/world/default-world.ts:1 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/world/floorplan.ts`

```text
src/app/(lab)/lab/1-quest/world/floorplan.ts:1 -> ./random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/world/floorplan.ts:2 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts
```

### `src/app/(lab)/lab/1-quest/world/forge.ts`

```text
src/app/(lab)/lab/1-quest/world/forge.ts:1 -> server-only -> package
src/app/(lab)/lab/1-quest/world/forge.ts:2 -> ./contract -> src/app/(lab)/lab/1-quest/world/contract.ts [type-only]
src/app/(lab)/lab/1-quest/world/forge.ts:3 -> ./generate -> src/app/(lab)/lab/1-quest/world/generate.ts
src/app/(lab)/lab/1-quest/world/forge.ts:9 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts
src/app/(lab)/lab/1-quest/world/forge.ts:10 -> ./store -> src/app/(lab)/lab/1-quest/world/store.ts
```

### `src/app/(lab)/lab/1-quest/world/furnish.ts`

```text
src/app/(lab)/lab/1-quest/world/furnish.ts:1 -> ./catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts
src/app/(lab)/lab/1-quest/world/furnish.ts:13 -> ./random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/world/furnish.ts:14 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
src/app/(lab)/lab/1-quest/world/furnish.ts:15 -> ./types -> src/app/(lab)/lab/1-quest/world/types.ts
src/app/(lab)/lab/1-quest/world/furnish.ts:25 -> ./floorplan -> src/app/(lab)/lab/1-quest/world/floorplan.ts
```

### `src/app/(lab)/lab/1-quest/world/generate.ts`

```text
src/app/(lab)/lab/1-quest/world/generate.ts:1 -> server-only -> package
src/app/(lab)/lab/1-quest/world/generate.ts:2 -> node:crypto -> package
src/app/(lab)/lab/1-quest/world/generate.ts:3 -> ai -> package
src/app/(lab)/lab/1-quest/world/generate.ts:4 -> @/lib/server-only/openai-client -> src/lib/server-only/openai-client.ts
src/app/(lab)/lab/1-quest/world/generate.ts:5 -> ./compile -> src/app/(lab)/lab/1-quest/world/compile.ts
src/app/(lab)/lab/1-quest/world/generate.ts:6 -> ./floorplan -> src/app/(lab)/lab/1-quest/world/floorplan.ts
src/app/(lab)/lab/1-quest/world/generate.ts:7 -> ./random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/world/generate.ts:8 -> ./sanitize -> src/app/(lab)/lab/1-quest/world/sanitize.ts
src/app/(lab)/lab/1-quest/world/generate.ts:9 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts
src/app/(lab)/lab/1-quest/world/generate.ts:25 -> ./validate -> src/app/(lab)/lab/1-quest/world/validate.ts
```

### `src/app/(lab)/lab/1-quest/world/offline-briefs.ts`

```text
src/app/(lab)/lab/1-quest/world/offline-briefs.ts:1 -> ./default-world -> src/app/(lab)/lab/1-quest/world/default-world.ts
src/app/(lab)/lab/1-quest/world/offline-briefs.ts:2 -> ./random -> src/app/(lab)/lab/1-quest/world/random.ts
src/app/(lab)/lab/1-quest/world/offline-briefs.ts:3 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/world/random.ts`

No imports.

### `src/app/(lab)/lab/1-quest/world/replay.ts`

```text
src/app/(lab)/lab/1-quest/world/replay.ts:1 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/world/sanitize.ts`

```text
src/app/(lab)/lab/1-quest/world/sanitize.ts:1 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts
src/app/(lab)/lab/1-quest/world/sanitize.ts:17 -> ./appearance -> src/app/(lab)/lab/1-quest/world/appearance.ts
```

### `src/app/(lab)/lab/1-quest/world/schema.ts`

```text
src/app/(lab)/lab/1-quest/world/schema.ts:1 -> zod -> package
src/app/(lab)/lab/1-quest/world/schema.ts:2 -> ./character-parts -> src/app/(lab)/lab/1-quest/world/character-parts.ts
```

### `src/app/(lab)/lab/1-quest/world/store.ts`

```text
src/app/(lab)/lab/1-quest/world/store.ts:1 -> server-only -> package
src/app/(lab)/lab/1-quest/world/store.ts:2 -> node:crypto -> package
src/app/(lab)/lab/1-quest/world/store.ts:3 -> node:fs/promises -> package
src/app/(lab)/lab/1-quest/world/store.ts:4 -> node:path -> package
src/app/(lab)/lab/1-quest/world/store.ts:5 -> next/server -> package
src/app/(lab)/lab/1-quest/world/store.ts:6 -> ./contract -> src/app/(lab)/lab/1-quest/world/contract.ts [type-only]
src/app/(lab)/lab/1-quest/world/store.ts:7 -> ./default-world -> src/app/(lab)/lab/1-quest/world/default-world.ts
src/app/(lab)/lab/1-quest/world/store.ts:8 -> ./sanitize -> src/app/(lab)/lab/1-quest/world/sanitize.ts
src/app/(lab)/lab/1-quest/world/store.ts:9 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts
```

### `src/app/(lab)/lab/1-quest/world/types.ts`

```text
src/app/(lab)/lab/1-quest/world/types.ts:1 -> ./appearance -> src/app/(lab)/lab/1-quest/world/appearance.ts [type-only]
src/app/(lab)/lab/1-quest/world/types.ts:2 -> ./catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts [type-only]
src/app/(lab)/lab/1-quest/world/types.ts:3 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/world/use-world.ts`

```text
src/app/(lab)/lab/1-quest/world/use-world.ts:3 -> react -> package
src/app/(lab)/lab/1-quest/world/use-world.ts:4 -> ./contract -> src/app/(lab)/lab/1-quest/world/contract.ts
src/app/(lab)/lab/1-quest/world/use-world.ts:10 -> ./sanitize -> src/app/(lab)/lab/1-quest/world/sanitize.ts
src/app/(lab)/lab/1-quest/world/use-world.ts:11 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts [type-only]
```

### `src/app/(lab)/lab/1-quest/world/validate.ts`

```text
src/app/(lab)/lab/1-quest/world/validate.ts:1 -> ./catalog -> src/app/(lab)/lab/1-quest/world/catalog.ts
src/app/(lab)/lab/1-quest/world/validate.ts:2 -> ./furnish -> src/app/(lab)/lab/1-quest/world/furnish.ts
src/app/(lab)/lab/1-quest/world/validate.ts:3 -> ./compile -> src/app/(lab)/lab/1-quest/world/compile.ts
src/app/(lab)/lab/1-quest/world/validate.ts:4 -> ./schema -> src/app/(lab)/lab/1-quest/world/schema.ts
src/app/(lab)/lab/1-quest/world/validate.ts:5 -> ./types -> src/app/(lab)/lab/1-quest/world/types.ts
```

### `src/app/(lab)/lab/2-os/hooks.ts`

```text
src/app/(lab)/lab/2-os/hooks.ts:3 -> react -> package
```

### `src/app/(lab)/lab/2-os/icons.tsx`

```text
src/app/(lab)/lab/2-os/icons.tsx:1 -> react -> package [type-only]
```

### `src/app/(lab)/lab/2-os/maxos.tsx`

```text
src/app/(lab)/lab/2-os/maxos.tsx:3 -> @base-ui/react/dialog -> package
src/app/(lab)/lab/2-os/maxos.tsx:4 -> react -> package
src/app/(lab)/lab/2-os/maxos.tsx:11 -> ../_shared/content -> src/app/(lab)/lab/_shared/content.ts [type-only]
src/app/(lab)/lab/2-os/maxos.tsx:12 -> ../_shared/use-ask -> src/app/(lab)/lab/_shared/use-ask.ts
src/app/(lab)/lab/2-os/maxos.tsx:13 -> ./hooks -> src/app/(lab)/lab/2-os/hooks.ts
src/app/(lab)/lab/2-os/maxos.tsx:14 -> ./icons -> src/app/(lab)/lab/2-os/icons.tsx
src/app/(lab)/lab/2-os/maxos.tsx:23 -> ./window-layout -> src/app/(lab)/lab/2-os/window-layout.ts
src/app/(lab)/lab/2-os/maxos.tsx:33 -> ./menu-bar -> src/app/(lab)/lab/2-os/menu-bar.tsx
src/app/(lab)/lab/2-os/maxos.tsx:34 -> ./os.module.css -> src/app/(lab)/lab/2-os/os.module.css
src/app/(lab)/lab/2-os/maxos.tsx:35 -> ./small-apps -> src/app/(lab)/lab/2-os/small-apps.tsx
src/app/(lab)/lab/2-os/maxos.tsx:36 -> ./talks-app -> src/app/(lab)/lab/2-os/talks-app.tsx
src/app/(lab)/lab/2-os/maxos.tsx:37 -> ./terminal-app -> src/app/(lab)/lab/2-os/terminal-app.tsx
src/app/(lab)/lab/2-os/maxos.tsx:38 -> ./wiki-app -> src/app/(lab)/lab/2-os/wiki-app.tsx
src/app/(lab)/lab/2-os/maxos.tsx:39 -> ./window-frame -> src/app/(lab)/lab/2-os/window-frame.tsx
```

### `src/app/(lab)/lab/2-os/menu-bar.tsx`

```text
src/app/(lab)/lab/2-os/menu-bar.tsx:3 -> @base-ui/react/menu -> package
src/app/(lab)/lab/2-os/menu-bar.tsx:4 -> @base-ui/react/menubar -> package
src/app/(lab)/lab/2-os/menu-bar.tsx:5 -> next/link -> package
src/app/(lab)/lab/2-os/menu-bar.tsx:6 -> react -> package
src/app/(lab)/lab/2-os/menu-bar.tsx:7 -> ../_shared/content -> src/app/(lab)/lab/_shared/content.ts [type-only]
src/app/(lab)/lab/2-os/menu-bar.tsx:8 -> ./hooks -> src/app/(lab)/lab/2-os/hooks.ts
src/app/(lab)/lab/2-os/menu-bar.tsx:9 -> ./icons -> src/app/(lab)/lab/2-os/icons.tsx
src/app/(lab)/lab/2-os/menu-bar.tsx:10 -> ./window-layout -> src/app/(lab)/lab/2-os/window-layout.ts [type-only]
src/app/(lab)/lab/2-os/menu-bar.tsx:11 -> ./os.module.css -> src/app/(lab)/lab/2-os/os.module.css
src/app/(lab)/lab/2-os/menu-bar.tsx:12 -> ./small-apps -> src/app/(lab)/lab/2-os/small-apps.tsx [type-only]
```

### `src/app/(lab)/lab/2-os/os.module.css`

No imports.

### `src/app/(lab)/lab/2-os/page.tsx`

```text
src/app/(lab)/lab/2-os/page.tsx:1 -> next/font/google -> package
src/app/(lab)/lab/2-os/page.tsx:2 -> ../_shared/content -> src/app/(lab)/lab/_shared/content.ts
src/app/(lab)/lab/2-os/page.tsx:3 -> ./maxos -> src/app/(lab)/lab/2-os/maxos.tsx
```

### `src/app/(lab)/lab/2-os/small-apps.tsx`

```text
src/app/(lab)/lab/2-os/small-apps.tsx:3 -> next/image -> package
src/app/(lab)/lab/2-os/small-apps.tsx:4 -> react -> package
src/app/(lab)/lab/2-os/small-apps.tsx:5 -> @/components/ui/own-avatar/assets/pp.jpg -> src/components/ui/own-avatar/assets/pp.jpg
src/app/(lab)/lab/2-os/small-apps.tsx:6 -> ../_shared/content -> src/app/(lab)/lab/_shared/content.ts [type-only]
src/app/(lab)/lab/2-os/small-apps.tsx:7 -> ./hooks -> src/app/(lab)/lab/2-os/hooks.ts
src/app/(lab)/lab/2-os/small-apps.tsx:8 -> ./os.module.css -> src/app/(lab)/lab/2-os/os.module.css
```

### `src/app/(lab)/lab/2-os/talks-app.tsx`

```text
src/app/(lab)/lab/2-os/talks-app.tsx:3 -> ../_shared/content -> src/app/(lab)/lab/_shared/content.ts [type-only]
src/app/(lab)/lab/2-os/talks-app.tsx:4 -> ./os.module.css -> src/app/(lab)/lab/2-os/os.module.css
```

### `src/app/(lab)/lab/2-os/terminal-app.tsx`

```text
src/app/(lab)/lab/2-os/terminal-app.tsx:3 -> react -> package
src/app/(lab)/lab/2-os/terminal-app.tsx:4 -> ../_shared/use-ask -> src/app/(lab)/lab/_shared/use-ask.ts [type-only]
src/app/(lab)/lab/2-os/terminal-app.tsx:5 -> ./os.module.css -> src/app/(lab)/lab/2-os/os.module.css
```

### `src/app/(lab)/lab/2-os/wiki-app.tsx`

```text
src/app/(lab)/lab/2-os/wiki-app.tsx:3 -> @portabletext/react -> package
src/app/(lab)/lab/2-os/wiki-app.tsx:4 -> react -> package
src/app/(lab)/lab/2-os/wiki-app.tsx:5 -> ../_shared/content -> src/app/(lab)/lab/_shared/content.ts [type-only]
src/app/(lab)/lab/2-os/wiki-app.tsx:6 -> ./os.module.css -> src/app/(lab)/lab/2-os/os.module.css
```

### `src/app/(lab)/lab/2-os/window-frame.tsx`

```text
src/app/(lab)/lab/2-os/window-frame.tsx:3 -> react -> package
src/app/(lab)/lab/2-os/window-frame.tsx:4 -> ./os.module.css -> src/app/(lab)/lab/2-os/os.module.css
src/app/(lab)/lab/2-os/window-frame.tsx:5 -> ./window-layout -> src/app/(lab)/lab/2-os/window-layout.ts
```

### `src/app/(lab)/lab/2-os/window-layout.ts`

No imports.

### `src/app/(lab)/lab/_shared/content.ts`

```text
src/app/(lab)/lab/_shared/content.ts:1 -> server-only -> package
src/app/(lab)/lab/_shared/content.ts:2 -> @portabletext/react -> package [type-only]
src/app/(lab)/lab/_shared/content.ts:3 -> @/lib/sanity-client -> src/lib/sanity-client.ts
```

### `src/app/(lab)/lab/_shared/spike-switcher.tsx`

```text
src/app/(lab)/lab/_shared/spike-switcher.tsx:3 -> @base-ui/react/menu -> package
src/app/(lab)/lab/_shared/spike-switcher.tsx:4 -> next/link -> package
src/app/(lab)/lab/_shared/spike-switcher.tsx:5 -> next/navigation -> package
src/app/(lab)/lab/_shared/spike-switcher.tsx:6 -> ./spikes -> src/app/(lab)/lab/_shared/spikes.ts
```

### `src/app/(lab)/lab/_shared/spikes.ts`

No imports.

### `src/app/(lab)/lab/_shared/use-ask.ts`

```text
src/app/(lab)/lab/_shared/use-ask.ts:3 -> @ai-sdk/react -> package
src/app/(lab)/lab/_shared/use-ask.ts:4 -> react -> package
src/app/(lab)/lab/_shared/use-ask.ts:5 -> @/lib/question-schema -> src/lib/question-schema.ts
src/app/(lab)/lab/_shared/use-ask.ts:6 -> @/lib/get-suggestions -> src/lib/get-suggestions.ts
```

### `src/app/(lab)/layout.tsx`

```text
src/app/(lab)/layout.tsx:1 -> ../globals.css -> src/app/globals.css
src/app/(lab)/layout.tsx:2 -> react -> package
src/app/(lab)/layout.tsx:3 -> ./lab/_shared/spike-switcher -> src/app/(lab)/lab/_shared/spike-switcher.tsx
```

### `src/app/api/completion/route.ts`

```text
src/app/api/completion/route.ts:1 -> @/lib/server-only/llm-context-utils -> src/lib/server-only/llm-context-utils.ts
src/app/api/completion/route.ts:2 -> ai -> package
src/app/api/completion/route.ts:3 -> @/lib/server-only/openai-client -> src/lib/server-only/openai-client.ts
src/app/api/completion/route.ts:4 -> @/lib/question-schema -> src/lib/question-schema.ts
```

### `src/app/api/lab/quest/chat/route.ts`

```text
src/app/api/lab/quest/chat/route.ts:1 -> ai -> package
src/app/api/lab/quest/chat/route.ts:9 -> @/app/(lab)/lab/_shared/content -> src/app/(lab)/lab/_shared/content.ts
src/app/api/lab/quest/chat/route.ts:10 -> @/app/(lab)/lab/1-quest/chat/contract -> src/app/(lab)/lab/1-quest/chat/contract.ts
src/app/api/lab/quest/chat/route.ts:11 -> @/app/(lab)/lab/1-quest/chat/history -> src/app/(lab)/lab/1-quest/chat/history.ts
src/app/api/lab/quest/chat/route.ts:17 -> @/app/(lab)/lab/1-quest/chat/prompt -> src/app/(lab)/lab/1-quest/chat/prompt.ts
src/app/api/lab/quest/chat/route.ts:18 -> @/app/(lab)/lab/1-quest/chat/tools -> src/app/(lab)/lab/1-quest/chat/tools.ts
src/app/api/lab/quest/chat/route.ts:19 -> @/app/(lab)/lab/1-quest/server/rate-limit -> src/app/(lab)/lab/1-quest/server/rate-limit.ts
src/app/api/lab/quest/chat/route.ts:20 -> @/lib/server-only/llm-context-utils -> src/lib/server-only/llm-context-utils.ts
src/app/api/lab/quest/chat/route.ts:21 -> @/lib/server-only/openai-client -> src/lib/server-only/openai-client.ts
```

### `src/app/api/lab/quest/contact/route.ts`

```text
src/app/api/lab/quest/contact/route.ts:1 -> zod -> package [type-only]
src/app/api/lab/quest/contact/route.ts:2 -> @/app/(lab)/lab/_shared/content -> src/app/(lab)/lab/_shared/content.ts
src/app/api/lab/quest/contact/route.ts:3 -> @/app/(lab)/lab/1-quest/chat/contract -> src/app/(lab)/lab/1-quest/chat/contract.ts
src/app/api/lab/quest/contact/route.ts:8 -> @/app/(lab)/lab/1-quest/chat/mailer -> src/app/(lab)/lab/1-quest/chat/mailer.ts
src/app/api/lab/quest/contact/route.ts:9 -> @/app/(lab)/lab/1-quest/server/rate-limit -> src/app/(lab)/lab/1-quest/server/rate-limit.ts
src/app/api/lab/quest/contact/route.ts:10 -> @/lib/server-only/openai-client -> src/lib/server-only/openai-client.ts
```

### `src/app/api/lab/quest/world/route.ts`

```text
src/app/api/lab/quest/world/route.ts:1 -> next/server -> package
src/app/api/lab/quest/world/route.ts:2 -> @/app/(lab)/lab/1-quest/server/rate-limit -> src/app/(lab)/lab/1-quest/server/rate-limit.ts
src/app/api/lab/quest/world/route.ts:3 -> @/app/(lab)/lab/1-quest/world/forge -> src/app/(lab)/lab/1-quest/world/forge.ts
src/app/api/lab/quest/world/route.ts:9 -> @/app/(lab)/lab/1-quest/world/store -> src/app/(lab)/lab/1-quest/world/store.ts
```

### `src/app/api/suggestions/route.ts`

```text
src/app/api/suggestions/route.ts:1 -> next/server -> package
src/app/api/suggestions/route.ts:2 -> @/types/suggestion-mode -> src/types/suggestion-mode.ts
src/app/api/suggestions/route.ts:3 -> @/lib/server-only/generate-suggestions -> src/lib/server-only/generate-suggestions.ts
```

### `src/app/globals.css`

```text
src/app/globals.css:1 -> tailwindcss -> package
src/app/globals.css:2 -> tw-animate-css -> package
src/app/globals.css:1 -> tailwindcss -> package
src/app/globals.css:2 -> tw-animate-css -> package
```

### `src/components/ui/own-avatar/assets/pp.jpg`

No imports.

### `src/lib/get-suggestions.ts`

```text
src/lib/get-suggestions.ts:1 -> @/types/suggestion-mode -> src/types/suggestion-mode.ts [type-only]
```

### `src/lib/question-schema.ts`

```text
src/lib/question-schema.ts:1 -> zod -> package
```

### `src/lib/sanity-client.ts`

```text
src/lib/sanity-client.ts:1 -> server-only -> package
src/lib/sanity-client.ts:2 -> next-sanity -> package
src/lib/sanity-client.ts:3 -> next/cache -> package
```

### `src/lib/server-only/generate-suggestions.ts`

```text
src/lib/server-only/generate-suggestions.ts:1 -> server-only -> package
src/lib/server-only/generate-suggestions.ts:2 -> ai -> package
src/lib/server-only/generate-suggestions.ts:3 -> next/cache -> package
src/lib/server-only/generate-suggestions.ts:4 -> zod -> package
src/lib/server-only/generate-suggestions.ts:5 -> ./llm-context-utils -> src/lib/server-only/llm-context-utils.ts
src/lib/server-only/generate-suggestions.ts:6 -> ./openai-client -> src/lib/server-only/openai-client.ts
src/lib/server-only/generate-suggestions.ts:7 -> @/types/suggestion-mode -> src/types/suggestion-mode.ts [type-only]
```

### `src/lib/server-only/llm-context-utils.ts`

```text
src/lib/server-only/llm-context-utils.ts:1 -> server-only -> package
src/lib/server-only/llm-context-utils.ts:2 -> ../sanity-client -> src/lib/sanity-client.ts
```

### `src/lib/server-only/openai-client.ts`

```text
src/lib/server-only/openai-client.ts:1 -> server-only -> package
src/lib/server-only/openai-client.ts:2 -> openai -> package
src/lib/server-only/openai-client.ts:3 -> @ai-sdk/openai -> package
```

### `src/types/suggestion-mode.ts`

No imports.

## Appendix E. Exact directives, exports and env reads

This mechanically scanned list supplements the adaptation tables; comment lines may
describe an API rather than execute it. `viewport` in Three.js is not the Next viewport
export.

```text

src/app/(lab)/lab/1-quest/chat/history.ts:1: import 'server-only';

src/app/(lab)/lab/1-quest/chat/mailer.ts:1: import 'server-only';

src/app/(lab)/lab/1-quest/chat/mailer.ts:24: return process.env.CONTACT_TO_EMAIL?.trim() || business.email;

src/app/(lab)/lab/1-quest/chat/mailer.ts:51: from: process.env.CONTACT_FROM_EMAIL?.trim() ?? '',

src/app/(lab)/lab/1-quest/chat/mailer.ts:60: const dir = path.join(process.cwd(), '.data', 'quest', 'outbox');

src/app/(lab)/lab/1-quest/chat/mailer.ts:74: const apiKey = process.env.RESEND_API_KEY?.trim();

src/app/(lab)/lab/1-quest/chat/mailer.ts:76: if (process.env.NODE_ENV === 'development') {

src/app/(lab)/lab/1-quest/chat/prompt.ts:1: import 'server-only';

src/app/(lab)/lab/1-quest/chat/sanitize.ts:1: import 'server-only';

src/app/(lab)/lab/1-quest/chat/tools.ts:1: import 'server-only';

src/app/(lab)/lab/1-quest/chat/use-max-chat.ts:1: 'use client';

src/app/(lab)/lab/1-quest/page.tsx:1: import { Atkinson_Hyperlegible_Next, Jersey_15 } from 'next/font/google';

src/app/(lab)/lab/1-quest/page.tsx:26: // next/font has no metrics for the "Next" cut yet; skip the generated fallback instead of warning.

src/app/(lab)/lab/1-quest/page.tsx:32: export const metadata = {

src/app/(lab)/lab/1-quest/scene/actors.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/controller.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/furniture.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/grounds.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/kit.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/life.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/night.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/office.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/shading.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/weather.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/scene/world-canvas.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/server/rate-limit.ts:1: import 'server-only';

src/app/(lab)/lab/1-quest/ui/chat-log.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/ui/hooks.ts:1: 'use client';

src/app/(lab)/lab/1-quest/ui/hud.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/ui/hud.tsx:4: import Image from 'next/image';

src/app/(lab)/lab/1-quest/ui/labels.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/ui/quest-app.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/ui/quest-app.tsx:3: import dynamic from 'next/dynamic';

src/app/(lab)/lab/1-quest/ui/quest-app.tsx:152: if (process.env.NODE_ENV !== 'production') Object.assign(window, { __questBus: bus });

src/app/(lab)/lab/1-quest/ui/window.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/ui/windows.tsx:1: 'use client';

src/app/(lab)/lab/1-quest/ui/windows.tsx:5: import Image from 'next/image';

src/app/(lab)/lab/1-quest/world/forge.ts:1: import 'server-only';

src/app/(lab)/lab/1-quest/world/generate.ts:1: import 'server-only';

src/app/(lab)/lab/1-quest/world/generate.ts:42: return process.env.QUEST_WORLD_MODEL?.trim() || DEFAULT_WORLD_MODEL;

src/app/(lab)/lab/1-quest/world/store.ts:1: import 'server-only';

src/app/(lab)/lab/1-quest/world/store.ts:5: import { connection } from 'next/server';

src/app/(lab)/lab/1-quest/world/store.ts:50: const minutes = Number(process.env.QUEST_WORLD_COOLDOWN_MINUTES);

src/app/(lab)/lab/1-quest/world/store.ts:52: process.env.QUEST_WORLD_COOLDOWN_MINUTES?.trim() &&

src/app/(lab)/lab/1-quest/world/store.ts:101: const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;

src/app/(lab)/lab/1-quest/world/store.ts:156: (fileStore ??= createFileWorldStore(path.join(process.cwd(), '.data', 'quest')))

src/app/(lab)/lab/1-quest/world/use-world.ts:1: 'use client';

src/app/(lab)/lab/2-os/hooks.ts:1: 'use client';

src/app/(lab)/lab/2-os/maxos.tsx:1: 'use client';

src/app/(lab)/lab/2-os/menu-bar.tsx:1: 'use client';

src/app/(lab)/lab/2-os/menu-bar.tsx:5: import Link from 'next/link';

src/app/(lab)/lab/2-os/page.tsx:1: import { IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google';

src/app/(lab)/lab/2-os/page.tsx:18: export const metadata = {

src/app/(lab)/lab/2-os/small-apps.tsx:1: 'use client';

src/app/(lab)/lab/2-os/small-apps.tsx:3: import Image from 'next/image';

src/app/(lab)/lab/2-os/talks-app.tsx:1: 'use client';

src/app/(lab)/lab/2-os/terminal-app.tsx:1: 'use client';

src/app/(lab)/lab/2-os/wiki-app.tsx:1: 'use client';

src/app/(lab)/lab/2-os/window-frame.tsx:1: 'use client';

src/app/(lab)/lab/_shared/content.ts:1: import 'server-only';

src/app/(lab)/lab/_shared/spike-switcher.tsx:1: 'use client';

src/app/(lab)/lab/_shared/spike-switcher.tsx:4: import Link from 'next/link';

src/app/(lab)/lab/_shared/spike-switcher.tsx:5: import { usePathname } from 'next/navigation';

src/app/(lab)/lab/_shared/use-ask.ts:1: 'use client';

src/app/(lab)/layout.tsx:5: export const metadata = {

src/app/(lab)/layout.tsx:10: export const viewport = { width: 'device-width', initialScale: 1 };

src/app/api/completion/route.ts:6: export const maxDuration = 60;

src/app/api/lab/quest/chat/route.ts:23: export const maxDuration = 60;

src/app/api/lab/quest/chat/route.ts:35: const model = process.env.QUEST_CHAT_MODEL?.trim();

src/app/api/lab/quest/world/route.ts:1: import { after } from 'next/server';

src/app/api/lab/quest/world/route.ts:25: export const maxDuration = 180;

src/app/api/suggestions/route.ts:1: import { NextResponse } from 'next/server';

src/app/api/suggestions/route.ts:5: export const maxDuration = 60;

src/lib/sanity-client.ts:1: import 'server-only';

src/lib/sanity-client.ts:2: import { createClient, type QueryParams } from 'next-sanity';

src/lib/sanity-client.ts:3: import { cacheLife, cacheTag } from 'next/cache';

src/lib/sanity-client.ts:6: projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,

src/lib/sanity-client.ts:7: dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,

src/lib/sanity-client.ts:9: apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2023-07-28',

src/lib/sanity-client.ts:25: 'use cache';

src/lib/sanity-client.ts:26: cacheLife('minutes');

src/lib/sanity-client.ts:27: if (tags.length) cacheTag(...tags);

src/lib/server-only/generate-suggestions.ts:1: import 'server-only';

src/lib/server-only/generate-suggestions.ts:3: import { cacheLife, cacheTag } from 'next/cache';

src/lib/server-only/generate-suggestions.ts:16: 'use cache';

src/lib/server-only/generate-suggestions.ts:17: cacheLife({ stale: 300, revalidate: 300, expire: 3600 });

src/lib/server-only/generate-suggestions.ts:18: cacheTag('llm-content');

src/lib/server-only/llm-context-utils.ts:1: import 'server-only';

src/lib/server-only/openai-client.ts:1: import 'server-only';

src/lib/server-only/openai-client.ts:5: export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

src/lib/server-only/openai-client.ts:6: export const aiOpenAI = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

src/lib/server-only/openai-client.ts:9: const model = process.env.OPENAI_MODEL;

```

Checked repository scripts/engine: `package.json:6`–`:15`, `:76`–`:78`; compiler/cache
configuration: `next.config.ts:4`–`:6`; original PostCSS adapter: `postcss.config.mjs:1`;
root lab CSS import: `src/app/(lab)/layout.tsx:1`.
